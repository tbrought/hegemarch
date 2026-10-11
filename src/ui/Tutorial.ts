/**
 * The First Night: a guided first run in six steps. The state lives in game.ui so it survives saving.
 *   1 kindle a dark world · 2 build a Striker · 3 choose a Boon · 4 repel a (harmless) raider
 *   5 send the Scout exploring · 6 meet the Destinies
 */
import { UNITS } from '../game/data/units';
import type { Unit } from '../game/types';
import { IC } from '../render/font';
import { PAL } from '../render/palette';
import { box, ring, type Ctx } from '../render/pixel';
import { icon } from '../render/sprites';
import type { Hud } from './Hud';

/** How many guided steps there are; game.ui.tut is one more than this once the First Night is over. */
export const TUTORIAL_STEPS = 6;
/** The step numbering in game.ui.tutV (runs saved before the Scout step was added have none). */
const TUT_VERSION = 2;

const stepOf = (n: number) => `STEP ${n} OF ${TUTORIAL_STEPS}`;

export class Tutorial {
  private t = 0;
  private stepSince = 0;
  private openedDestinies = false;

  constructor(private hud: Hud) {
    // A run saved before the Scout step: its Destinies step and its end each move up by one.
    const ui = this.g.ui;
    if (ui.tut && ui.tutV !== TUT_VERSION) {
      if (ui.tut >= 5) ui.tut++;
      ui.tutV = TUT_VERSION;
    }
  }

  private get s() {
    return this.hud.s;
  }

  private get g() {
    return this.hud.s.game;
  }

  get step(): number {
    return this.g.ui.tut ?? 0;
  }

  private set step(v: number) {
    this.g.ui.tut = v;
    this.stepSince = this.t;
    if (v > 1 && v <= TUTORIAL_STEPS + 1) this.s.sfx.play('good', 0.5);
  }

  /** True while the guided steps run (other popups wait). */
  busy(): boolean {
    return this.s.guided && this.step >= 1 && this.step <= TUTORIAL_STEPS;
  }

  /** Begin the First Night on a fresh guided run. */
  start() {
    const g = this.g;
    if (!this.s.guided || g.ui.tut) return;
    g.ui.tut = 1;
    g.ui.tutV = TUT_VERSION;
    g.ui.tutWorld = this.pickWorld();
  }

  /** Frame several worlds if that keeps a readable zoom; otherwise just look at the last one. */
  frameOr(ids: number[], minZoom: number) {
    if (this.fitZoom(ids) >= minZoom) this.frame(ids);
    else this.frame([ids[ids.length - 1]], 0.17);
  }

  /** The zoom that fits these worlds into the clear band of the screen. */
  private fitZoom(ids: number[]): number {
    const pts = ids.filter((i) => i >= 0).map((i) => this.g.nodes[i]);
    if (!pts.length) return 0.17;
    const cam = this.s.renderer.cam;
    const band = Math.max(60, cam.h - 166);
    const w = Math.max(...pts.map((n) => n.x)) - Math.min(...pts.map((n) => n.x));
    const h = Math.max(...pts.map((n) => n.y)) - Math.min(...pts.map((n) => n.y));
    return Math.min((cam.w * 0.6) / (w + 900), band / (h + 900));
  }

  /** Move the camera so these worlds sit in the open middle of the screen (clear of the banner, log and card). */
  frame(ids: number[], fixedZoom = 0) {
    const pts = ids.filter((i) => i >= 0).map((i) => this.g.nodes[i]);
    if (!pts.length) return;
    const minX = Math.min(...pts.map((n) => n.x));
    const maxX = Math.max(...pts.map((n) => n.x));
    const minY = Math.min(...pts.map((n) => n.y));
    const maxY = Math.max(...pts.map((n) => n.y));
    const cam = this.s.renderer.cam;
    const band = Math.max(60, cam.h - 166);
    const z = fixedZoom || Math.max(0.05, Math.min(0.22, this.fitZoom(ids)));
    const bandMid = 46 + band / 2;
    cam.focus((minX + maxX) / 2, (minY + maxY) / 2 - (bandMid - cam.h / 2) / z, z);
  }

  /**
   * A good first world: in sight (the Scout has not been sent out yet), unguarded, in the home
   * system, close, and not a tiny asteroid belt.
   */
  private pickWorld(): number {
    const g = this.g;
    const p = g.player;
    const home = g.nodes[p.capital];
    if (!home) return -1;
    const dark = (n: (typeof g.nodes)[number]) => n.kind === 'planet' && n.owner === -1 && !g.hasHostiles(n.id, p.id);
    let best = -1;
    let bd = Infinity;
    for (const n of g.nodes) {
      if (!dark(n) || !p.explored[n.id] || n.system !== home.system) continue;
      const d = g.pathLen(p.capital, n.id) + (n.ptype === 'asteroid' ? 6000 : 0) + (n.size === 'S' ? 1500 : 0);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    if (best < 0) {
      // Nothing in sight at home: the nearest dark world, charted for the lesson if need be.
      for (const n of g.nodes) {
        if (!dark(n)) continue;
        const d = g.pathLen(p.capital, n.id) + (p.explored[n.id] ? 0 : 20000);
        if (d < bd) {
          bd = d;
          best = n.id;
        }
      }
      if (best >= 0) p.explored[best] = 1;
    }
    return best;
  }

  /** The player's first kindled world (the raider's target). */
  private newWorld(): number {
    const g = this.g;
    const tw = g.ui.tutWorld ?? -1;
    if (tw >= 0 && g.nodes[tw].owner === g.playerId) return tw;
    const w = g.worldsOf(g.playerId).find((n) => n.capitalOf < 0);
    return w ? w.id : -1;
  }

  /** The player's Scouts. */
  private scouts(): Unit[] {
    const g = this.g;
    return g.unitList.filter((u) => !u.dead && u.owner === g.playerId && UNITS[u.type].role === 'scout');
  }

  /** Is a Scout among the selected ships? */
  private scoutPicked(): boolean {
    return this.s.ownSelected().some((u) => UNITS[u.type].role === 'scout');
  }

  private framedStep = 0;
  private lookedAtRaid = false;
  private lookedAtScout = false;
  /** The guide just ended: its closing card opens as soon as nothing else is on screen. */
  private closingCard = false;
  /** Game time the guide ended (tips keep quiet for a while after it). */
  private endedAt = -1;

  /** Tips wait a little after the First Night, so the next one is not taken for another step. */
  quiet(): boolean {
    return this.endedAt >= 0 && this.g.time - this.endedAt < 45;
  }

  update(dt: number) {
    this.t += dt;
    if (!this.s.guided) return;
    const g = this.g;
    const p = g.player;
    // The run is over, or the Hearth has fallen: nothing left to teach.
    if (g.outcome || p.capital < 0) return;
    if (this.closingCard && !this.s.modal) {
      this.closingCard = false;
      this.hud.modals.open({ kind: 'nightDone' });
    }
    const view = this.s.view;
    view.highlightNode = -1;
    if (this.framedStep !== this.step) {
      this.framedStep = this.step;
      if (this.step === 1) this.frameOr([p.capital, g.ui.tutWorld ?? -1], 0.08);
      else if (this.step === 2) this.frame([p.capital], 0.18);
    }
    switch (this.step) {
      case 1: {
        let tw = g.ui.tutWorld ?? -1;
        // Taken by someone else, or (in a run saved by an older version) out of sight: pick again.
        if (tw < 0 || (g.nodes[tw].owner >= 0 && g.nodes[tw].owner !== p.id) || (g.nodes[tw].owner < 0 && !p.explored[tw])) {
          tw = this.pickWorld();
          g.ui.tutWorld = tw;
        }
        const seeding = g.unitList.some((u) => !u.dead && u.owner === p.id && u.type === 'seed' && u.order === 'kindle');
        if (seeding || p.stats.worldsKindled > 0) {
          const s = g.unitList.find((u) => !u.dead && u.owner === p.id && u.type === 'seed' && u.order === 'kindle');
          if (s) g.ui.tutWorld = s.orderTarget;
          this.step = 2;
        } else if (tw >= 0) view.highlightNode = tw;
        break;
      }
      case 2: {
        const hearth = g.nodes[p.capital];
        const queued = hearth.shipQ.some((q) => q.id === 'striker') || g.nodes.some((n) => n.owner === p.id && n.shipQ.some((q) => q.id === 'striker'));
        if (queued || p.stats.shipsBuilt > 0) this.step = 3;
        else if (view.selectedNode !== p.capital) view.highlightNode = p.capital;
        break;
      }
      case 3:
        if (p.pendingDrafts <= 0 || p.cards.length > 0) this.step = 4;
        break;
      case 4: {
        const raiderId = g.ui.tutRaider ?? 0;
        if (!raiderId) {
          // Raid the new world; if the seed ship never made it, raid the Hearth instead.
          const seeding = g.unitList.some((u) => !u.dead && u.owner === p.id && u.type === 'seed' && u.order === 'kindle');
          let w = this.newWorld();
          if (w < 0 && !seeding && this.t - this.stepSince > 6) w = p.capital;
          if (w >= 0 && this.t - this.stepSince > 2) {
            const r = g.spawnTutorialRaider(w);
            g.ui.tutRaider = r ? r.id : -1;
            g.ui.tutRaidAt = g.time;
            if (r) {
              this.s.sfx.play('alert', 0.5);
              this.frameOr([w, this.biggestFleet()], 0.08);
              this.lookedAtRaid = false;
            }
          }
          break;
        }
        const r = raiderId > 0 ? g.units.get(raiderId) : undefined;
        const w = this.newWorld();
        if (!r || r.dead) {
          this.step = 5;
          this.s.showToast(g.ui.tutRaidFled ? 'The raider slipped away. Next time, send your fleet.' : 'The raider is gone. Well flown!', PAL.teal, 4);
          break;
        }
        if (g.time - (g.ui.tutRaidAt ?? g.time) > 180) {
          // The player never engaged; let the lesson go.
          g.ui.tutRaidFled = 1;
          g.killUnit(r, -1);
          break;
        }
        if (w >= 0 && (this.s.view.orderMode || this.s.ownSelected().length)) {
          view.highlightNode = w;
          // Fleet picked: make sure the raided world is on screen to click.
          if (!this.lookedAtRaid) {
            this.lookedAtRaid = true;
            const sc = this.hud.nodeScreen(w);
            if (sc.x < 10 || sc.y < 46 || sc.x > this.hud.W - 10 || sc.y > this.hud.H - 110) this.frame([w], Math.max(0.1, this.s.renderer.cam.tzoom));
          }
        }
        break;
      }
      case 5: {
        // Send the Scout out. Nothing to teach once one explores, with no Scout left, or with nothing left to chart.
        const scouts = this.scouts();
        if (scouts.some((u) => u.order === 'explore') || !scouts.length || !g.hasUncharted(p)) {
          this.step = 6;
          break;
        }
        const at = scouts[0].lane ? scouts[0].lane.to : scouts[0].node;
        if (!this.lookedAtScout && at >= 0) {
          // Make sure the Scout's fleet badge is on screen to click.
          this.lookedAtScout = true;
          const sc = this.hud.nodeScreen(at);
          if (sc.x < 10 || sc.y < 46 || sc.x > this.hud.W - 10 || sc.y > this.hud.H - 110) this.frame([at], Math.max(0.1, this.s.renderer.cam.tzoom));
        }
        break;
      }
      case 6:
        if (!this.openedDestinies) {
          // A moment to watch the Scout set out, then the Destinies.
          if (!this.s.modal && this.t - this.stepSince > 2) {
            this.openedDestinies = true;
            this.hud.modals.open({ kind: 'destinies' });
          }
        } else if (this.s.modal?.kind !== 'destinies') {
          // However the card went away, the First Night is over.
          this.onDestiniesClosed();
        }
        break;
    }
  }

  /** The world where most of the player's ships are. */
  biggestFleet(): number {
    let best = -1;
    let bc = 0;
    for (const n of this.g.nodes) {
      const c = this.s.fleetAt(n.id).length;
      if (c > bc) {
        bc = c;
        best = n.id;
      }
    }
    return best;
  }

  onDestiniesClosed() {
    if (this.step === TUTORIAL_STEPS) {
      this.step = TUTORIAL_STEPS + 1;
      this.s.profile.tutorialDone = true;
      this.s.hooks.saveProfile();
      // The guide is over: say so on a card of its own, with the way back to the menu.
      this.endedAt = this.g.time;
      this.closingCard = true;
      // Decisions that came up during the guide wait behind the ! button instead of popping up
      // the moment the card closes (new ones open as usual).
      for (const pr of this.g.prompts) if (pr.result === undefined) this.hud.snoozed.add(pr.id);
    }
  }

  /**
   * The objective line; `badge` is the number on the fleet badge in it (the one the arrow points at);
   * `sub` is a smaller line under it that says what the words mean and why the step matters.
   */
  banner(): { text: string; color: string; badge?: string; sub?: string } | null {
    if (!this.s.guided) return null;
    const g = this.g;
    switch (this.step) {
      case 1:
        return { text: `${stepOf(1)} · Kindle a dark world: click the grey world, then press KINDLE.`, color: PAL.gold, sub: 'Every world you hold earns Embers, your only currency.' };
      case 2:
        return { text: `${stepOf(2)} · Build a Striker: click your Hearth, then the Striker button.`, color: PAL.gold, sub: 'Your Hearth is your home world. A Striker is a fast, cheap gunship.' };
      case 3:
        return { text: `${stepOf(3)} · Choose your first Boon: press the BOON button at the top.`, color: PAL.gold, sub: 'Lore, the violet bar, fills by itself. Each time it is full you choose a Boon: an upgrade for the whole run.' };
      case 4: {
        const r = (g.ui.tutRaider ?? 0) > 0 ? g.units.get(g.ui.tutRaider!) : undefined;
        if (!r) {
          const seeding = g.unitList.some((u) => !u.dead && u.owner === g.playerId && u.type === 'seed' && u.order === 'kindle');
          return { text: seeding ? `${stepOf(4)} · Your seed ship is on its way. Wait for the new world to light up…` : `${stepOf(4)} · Get ready: a raider is coming.`, color: PAL.gold };
        }
        return { text: `${stepOf(4)} · A pirate raids your new world! Click your fleet's badge ${IC.fleet}, then the world.`, color: PAL.ember, badge: this.hud.fleetLabel(this.biggestFleet()), sub: 'Ships fight by themselves once they are where the enemy is.' };
      }
      case 5: {
        const why = 'A Scout charts the dark, world after world. Nothing can fire on it in its first seconds at a place.';
        if (this.scoutPicked()) return { text: `${stepOf(5)} · Press EXPLORE (or E): your Scout ${IC.scout} will chart the dark by itself.`, color: PAL.gold, sub: why };
        const sc = this.scouts()[0];
        return {
          text: `${stepOf(5)} · Send your Scout ${IC.scout} to explore: click its fleet badge ${IC.fleet}, then EXPLORE.`,
          color: PAL.gold,
          badge: this.hud.fleetLabel(sc && !sc.lane ? sc.node : -1),
          sub: why,
        };
      }
      case 6:
        return { text: `${stepOf(6)} · Meet your three Destinies: the ways this run can be won.`, color: PAL.gold, sub: 'You do not choose one. Reach any one of them and the run is won.' };
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // The gold arrow
  // ---------------------------------------------------------------------

  draw(g: Ctx) {
    if (!this.busy() || (this.s.modal && this.s.modal.kind !== 'draft')) return;
    const game = this.g;
    const p = game.player;
    const view = this.s.view;
    const bob = Math.round(Math.sin(this.t * 6) * 2);
    const ui = this.hud.ui;
    const atRect = (id: string) => {
      const r = ui.rectOf(id);
      if (!r) return false;
      const k = Math.floor(this.t * 4) % 2 === 0;
      box(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, null, k ? PAL.gold : PAL.ember);
      const W = this.hud.W;
      if (r.y < 40) icon(g, 'arrowUp', r.x + r.w / 2 - 3, r.y + r.h + 4 - bob);
      else if (r.y > this.hud.H / 2 && r.x + r.w + 14 < W) icon(g, 'arrowLeft', r.x + r.w + 5 - bob, r.y + r.h / 2 - 3);
      else icon(g, 'arrowDown', r.x + r.w / 2 - 3, r.y - 8 + bob);
      return true;
    };
    const atWorld = (id: number) => {
      if (id < 0) return;
      const s = this.hud.nodeScreen(id);
      const W = this.hud.W;
      const H = this.hud.H;
      if (s.x < 8 || s.y < 20 || s.x > W - 8 || s.y > H - 8) {
        // Off screen: point from the nearest edge.
        const cx = Math.max(10, Math.min(W - 16, s.x));
        const cy = Math.max(44, Math.min(H - 16, s.y));
        const name = s.x < 8 ? 'arrowLeft' : s.x > W - 8 ? 'arrowRight' : s.y < 20 ? 'arrowUp' : 'arrowDown';
        icon(g, name, cx - 3, cy - 3);
        return;
      }
      ring(g, s.x, s.y, s.r + 8 + (Math.floor(this.t * 4) % 2), PAL.gold, 2);
      icon(g, 'arrowDown', s.x - 3, s.y - s.r - 16 + bob);
    };
    switch (this.step) {
      case 1: {
        const tw = game.ui.tutWorld ?? -1;
        if (view.selectedNode === tw && atRect('kindle')) return;
        atWorld(tw);
        break;
      }
      case 2:
        if (view.selectedNode === p.capital && atRect('build-striker')) return;
        atWorld(p.capital);
        break;
      case 3:
        if (this.s.modal?.kind === 'draft') return;
        atRect('boon');
        break;
      case 4: {
        const r = (game.ui.tutRaider ?? 0) > 0 ? game.units.get(game.ui.tutRaider!) : undefined;
        if (!r) return;
        const w = this.newWorld();
        if (this.s.ownSelected().length) {
          atWorld(w);
          return;
        }
        // Point at the biggest fleet badge.
        const best = this.biggestFleet();
        if (best >= 0 && atRect('fleet-' + best)) return;
        if (best >= 0) atWorld(best);
        break;
      }
      case 5: {
        // The EXPLORE button once a Scout is picked; before that, the badge of the fleet it flies with.
        if (this.scoutPicked() && atRect('explore')) return;
        const sc = this.scouts()[0];
        if (!sc) return;
        if (!sc.lane) {
          // Ring the Scout itself too, so it can be picked out among the ships (and clicked);
          // not when it sits on its badge, which is already framed.
          const r = this.s.renderer;
          const x = r.sx(sc.x);
          const y = r.sy(sc.y);
          const b = ui.rectOf('fleet-' + sc.node);
          const clear = !b || x + 9 < b.x || x - 9 > b.x + b.w || y + 9 < b.y || y - 9 > b.y + b.h;
          if (clear) ring(g, x, y, 6, Math.floor(this.t * 4) % 2 === 0 ? PAL.gold : PAL.ember);
        }
        if (!sc.lane && sc.node >= 0 && atRect('fleet-' + sc.node)) return;
        atWorld(sc.lane ? sc.lane.to : sc.node);
        break;
      }
    }
  }
}
