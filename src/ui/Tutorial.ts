/**
 * The First Night: a guided first run in nine steps. The state lives in game.ui so it survives saving.
 *   1 kindle a dark world · 2 build a Striker · 3 choose a Boon · 4 repel a (harmless) raider
 *   5 send the Scout exploring · 6 set a rally point, and clear it · 7 build a Breaker and take a
 *   guarded world · 8 bring the fleet home to the Hearth, raided · 9 meet the Destinies
 * (Steps 6 to 8 came in 1.27.1: a player lost a run to a rally point they never knew they had set, did not
 * know the ring of ships, and had not been told that the run ends when the Hearth falls.)
 */
import { UNITS } from '../game/data/units';
import type { Unit } from '../game/types';
import { IC } from '../render/font';
import { PAL } from '../render/palette';
import { box, ring, type Ctx } from '../render/pixel';
import { icon } from '../render/sprites';
import type { Hud } from './Hud';
import { fleetLabel } from './hud/overlays';
import { isHearth } from '../game/worldStats';

/** How many guided steps there are; game.ui.tut is one more than this once the First Night is over. */
export const TUTORIAL_STEPS = 9;
/**
 * The step numbering in game.ui.tutV: 2 with the Scout step, 3 with the rally, Breaker and Hearth steps
 * (runs saved before the Scout step have none).
 */
const TUT_VERSION = 3;

const stepOf = (n: number) => `STEP ${n} OF ${TUTORIAL_STEPS}`;
/**
 * The least zoom at which steps 6 and 7 show two worlds together (the Hearth and its rally point; a fleet and
 * the guarded world): both must be on the screen to be clicked, and at the window's least game pixels
 * (480×270) two worlds rarely fit at more.
 */
const PAIR_ZOOM = 0.05;

export class Tutorial {
  private t = 0;
  private stepSince = 0;
  private openedDestinies = false;

  constructor(private hud: Hud) {
    // A run saved by an older guide: the steps added since come before its Destinies step, which moves up
    // (and so does its end). Before the Scout step, by one; before the rally, Breaker and Hearth steps, by three.
    const ui = this.g.ui;
    if (ui.tut && ui.tutV !== TUT_VERSION) {
      if (!ui.tutV && ui.tut >= 5) ui.tut++;
      if ((ui.tutV ?? 1) < 3 && ui.tut >= 6) ui.tut += 3;
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
    const w = g.worldsOf(g.playerId).find((n) => !isHearth(n));
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
  private lookedAtGuarded = false;
  /** What step 6 has brought on screen: the world for the rally point, its flag, the Hearth again. */
  private looked: '' | 'rally' | 'flag' | 'home' = '';
  private lookedAt = 0;
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
      this.hud.modals.open({ kind: 'nightDone', unbidden: true });
    }
    const view = this.s.view;
    view.highlightNode = -1;
    if (this.framedStep !== this.step) {
      this.framedStep = this.step;
      if (this.step === 1) this.frameOr([p.capital, g.ui.tutWorld ?? -1], 0.08);
      else if (this.step === 2 || this.step === 7) this.frame([p.capital], 0.18);
      else if (this.step === 6) {
        // (Ships still picked would take the right-click as an order to fly: the step starts with none.)
        this.s.clearSelection();
        // (Both if they fit; if not, the Hearth to click first, and the other world once it is picked.)
        this.frameOr([this.rallyTarget(), p.capital], PAIR_ZOOM);
      }
    }
    switch (this.step) {
      case 1: {
        this.stepKindle();
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
        this.stepRaid();
        break;
      }
      case 5: {
        this.stepScout();
        break;
      }
      case 6:
        this.stepRally();
        break;
      case 7:
        this.stepBreaker();
        break;
      case 8:
        this.stepRaid();
        break;
      case 9:
        if (!this.openedDestinies) {
          // A moment to watch the Scout set out, then the Destinies.
          if (!this.s.modal && this.t - this.stepSince > 2) {
            this.openedDestinies = true;
            this.hud.modals.open({ kind: 'destinies', unbidden: true });
          }
        } else if (this.s.modal?.kind !== 'destinies') {
          // However the card went away, the First Night is over.
          this.onDestiniesClosed();
        }
        break;
    }
  }

  /** Step 1: kindle the world the guide points at. Done once a seed ship is on its way. */
  private stepKindle() {
    const g = this.g;
    const p = g.player;
    const view = this.s.view;
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
  }

  /**
   * Steps 4 and 8: a raider comes for the new world (or, if there is none, the Hearth), and then for the
   * Hearth itself; the lesson is to send the fleet. Each ends when the raider is gone, one way or another.
   */
  private stepRaid() {
    const g = this.g;
    const p = g.player;
    const view = this.s.view;
    const home = this.step === 8;
    const raiderId = g.ui.tutRaider ?? 0;
    if (!raiderId) {
      // Raid the new world; if the seed ship never made it, raid the Hearth instead.
      const seeding = g.unitList.some((u) => !u.dead && u.owner === p.id && u.type === 'seed' && u.order === 'kindle');
      let w = this.raidTarget();
      if (w < 0 && !seeding && this.t - this.stepSince > 6) w = p.capital;
      if (w >= 0 && this.t - this.stepSince > 2) {
        const r = g.spawnTutorialRaider(w);
        g.ui.tutRaider = r ? r.id : -1;
        g.ui.tutRaidAt = g.time;
        if (r) {
          this.s.sfx.play('alert', 0.5);
          this.frameOr([w, home ? this.awayFleet() : this.biggestFleet()], home ? PAIR_ZOOM : 0.08);
          this.lookedAtRaid = false;
        }
      }
      return;
    }
    const r = raiderId > 0 ? g.units.get(raiderId) : undefined;
    const w = this.raidTarget();
    if (!r || r.dead) {
      this.step = home ? 9 : 5;
      this.s.showToast(g.ui.tutRaidFled ? 'The raider slipped away. Next time, send your fleet.' : 'The raider is gone. Well flown!', PAL.teal, 4);
      return;
    }
    if (g.time - (g.ui.tutRaidAt ?? g.time) > 180) {
      // The player never engaged; let the lesson go.
      g.ui.tutRaidFled = 1;
      g.killUnit(r, -1);
      return;
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
  }

  /** Where the guide's raider is bound: the new world (step 4) or the Hearth (step 8). */
  private raidTarget(): number {
    return this.step === 8 ? this.g.player.capital : this.newWorld();
  }

  /**
   * Step 5: send the Scout exploring. (Nothing to teach once one explores, with no Scout left, or with
   * nothing left to chart.)
   */
  private stepScout() {
    const g = this.g;
    const p = g.player;
    // Send the Scout out. Nothing to teach once one explores, with no Scout left, or with nothing left to chart.
    const scouts = this.scouts();
    // (`ui.scouted`: the order was given. A Scout with no safe way on is home again within a tick.)
    if (scouts.some((u) => u.order === 'explore') || g.ui.scouted || !scouts.length || !g.hasUncharted(p)) {
      this.step = 6;
      return;
    }
    const at = scouts[0].lane ? scouts[0].lane.to : scouts[0].node;
    if (!this.lookedAtScout && at >= 0) {
      // Make sure the Scout's fleet badge is on screen to click.
      this.lookedAtScout = true;
      const sc = this.hud.nodeScreen(at);
      if (sc.x < 10 || sc.y < 46 || sc.x > this.hud.W - 10 || sc.y > this.hud.H - 110) this.frame([at], Math.max(0.1, this.s.renderer.cam.tzoom));
    }
  }

  /**
   * Where the guide asks for a rally point (chosen once, as step 6 begins): a world of the player's that
   * fits on the screen with the Hearth, the nearest first; or else the nearest charted dark world, unguarded,
   * that does (the lesson's rally point is cleared at once); or else the nearest world of the player's.
   */
  private rallyTarget(): number {
    const g = this.g;
    const p = g.player;
    const was = g.ui.tutRallyTo ?? 0;
    if (was) return was - 1;
    const near = g.nodes
      .filter((n) => n.id !== p.capital && p.explored[n.id] && n.kind === 'planet' && (n.owner === p.id || (n.owner < 0 && !g.dangerKnown(p.id, n.id))))
      .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id) || a.id - b.id);
    const fits = (n: { id: number }) => this.fitZoom([p.capital, n.id]) >= PAIR_ZOOM;
    const t = near.find((n) => n.owner === p.id && fits(n)) ?? near.find(fits) ?? near.find((n) => n.owner === p.id) ?? near[0];
    g.ui.tutRallyTo = t ? t.id + 1 : 0;
    return t ? t.id : -1;
  }

  /**
   * Step 6: a rally point. Set one from the Hearth to the new world, see its line and flag on the map, and
   * clear it again: a rally point stays until it is cleared, and every new ship flies off to it alone.
   */
  private stepRally() {
    const g = this.g;
    const p = g.player;
    const view = this.s.view;
    const home = g.nodes[p.capital];
    if (home.rally >= 0) g.ui.tutRallied = 1;
    if (g.ui.tutRallied && home.rally < 0) {
      // (Its tip has been taught: it does not come up the first time the player sets one of their own.)
      const prof = this.s.profile;
      if (!prof.seenTips.includes('rally')) prof.seenTips.push('rally');
      this.s.hooks.saveProfile();
      g.ui.tutBreakers = this.breakers().length;
      this.step = 7;
      return;
    }
    if (view.selectedNode !== p.capital) view.highlightNode = p.capital;
    else if (!g.ui.tutRallied) view.highlightNode = this.rallyTarget();
    if (!g.ui.tutRallied) {
      // The Hearth picked: the world to right-click on screen.
      if (view.selectedNode === p.capital && this.looked !== 'rally') {
        this.looked = 'rally';
        this.seeWorld(this.rallyTarget());
      }
    } else if (this.looked !== 'home') {
      // Set: a moment to see the flag, then back to the Hearth to clear it.
      if (this.looked !== 'flag') {
        this.looked = 'flag';
        this.lookedAt = this.t;
      } else if (this.t - this.lookedAt > 1.5) {
        this.looked = 'home';
        this.seeWorld(p.capital);
      }
    }
  }

  /** Bring a world on screen, at the zoom of the moment or closer, if it is off it or under the HUD. */
  private seeWorld(id: number) {
    if (id < 0) return;
    const sc = this.hud.nodeScreen(id);
    if (sc.x < 10 || sc.y < 46 || sc.x > this.hud.W - 10 || sc.y > this.hud.H - 110) this.frame([id], Math.max(0.1, this.s.renderer.cam.tzoom));
  }

  /** The player's Breakers, the newest first. */
  private breakers(): Unit[] {
    const g = this.g;
    return g.unitList.filter((u) => !u.dead && u.owner === g.playerId && u.type === 'breaker').sort((a, b) => b.id - a.id);
  }

  /** The old guards of a dark world. */
  private guards(id: number): Unit[] {
    const g = this.g;
    return g.buckets[id].filter((u) => !u.dead && u.owner === g.guardianId);
  }

  /**
   * The guarded world for step 7: a dark world near home that only its militia or sentinels hold (no vault,
   * no Corsairs, no rival), the fewest guards and the nearest first, one already charted before one that is
   * not. -1: none within four jumps. (Most First Night sectors have none in the home system: the nearest is
   * three jumps away, in the next system, and the way there is charted for the lesson if need be.)
   */
  private pickGuarded(): number {
    const g = this.g;
    const p = g.player;
    let best = -1;
    let bd = Infinity;
    for (const n of g.nodes) {
      if (n.kind !== 'planet' || n.owner !== -1) continue;
      const guards = this.guards(n.id);
      if (!guards.length || guards.some((u) => u.type !== 'militia' && u.type !== 'sentinel')) continue;
      if (g.buckets[n.id].some((u) => !u.dead && u.owner !== g.guardianId && u.owner !== p.id && g.hostile(p.id, u.owner))) continue;
      if (g.pathTo(p.capital, n.id).length > 4) continue;
      const d = g.pathLen(p.capital, n.id) + guards.reduce((a, u) => a + (u.type === 'sentinel' ? 6000 : 3000), 0) + (p.explored[n.id] ? 0 : 4000);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    if (best >= 0) for (const id of g.pathTo(p.capital, best)) p.explored[id] = 1;
    return best;
  }

  /** Where the fleet to send against the guards is: the newest Breaker's, or else the biggest. */
  private strikeFleet(): number {
    const b = this.breakers().find((u) => !u.lane && u.node >= 0);
    return b ? b.node : this.biggestFleet();
  }

  /** Are ships of the player's on their way to this world, or there already? */
  private bound(id: number): boolean {
    const g = this.g;
    return g.unitList.some((u) => !u.dead && u.owner === g.playerId && UNITS[u.type].role !== 'scout' && u.type !== 'seed' && (u.dest === id || (u.node === id && !u.lane)));
  }

  /**
   * Step 7: the ring of ships. Build a Breaker (the banner says what beats what while it is built), then take
   * a guarded world with it: done once its guards are gone (or after four minutes, or with none near).
   */
  private stepBreaker() {
    const g = this.g;
    const p = g.player;
    const view = this.s.view;
    if (!g.ui.tutBuilt) {
      const queued = g.nodes.some((n) => n.owner === p.id && n.shipQ.some((q) => q.id === 'breaker'));
      if (queued || this.breakers().length > (g.ui.tutBreakers ?? 0)) g.ui.tutBuilt = 1;
      else if (view.selectedNode !== p.capital) view.highlightNode = p.capital;
      return;
    }
    // (Its Breaker being built: the ring to read in the meantime.)
    const building = this.breakers().length <= (g.ui.tutBreakers ?? 0) && g.nodes.some((n) => n.owner === p.id && n.shipQ.some((q) => q.id === 'breaker'));
    if (building) return;
    let gw = g.ui.tutGuarded ?? 0;
    if (!gw) {
      // (Stored one up: 0 is "not picked yet", and a world can be number 0.)
      gw = this.pickGuarded() + 1;
      g.ui.tutGuarded = gw || -1;
      g.ui.tutGuardAt = g.time;
      // (Both if they fit; if not, the fleet whose badge is to be clicked, and the world once ships are picked.)
      if (gw > 0) this.frameOr([gw - 1, this.strikeFleet()], PAIR_ZOOM);
      this.lookedAtGuarded = false;
    }
    const w = gw - 1;
    // (Ships in flight count: they are at no world until they land.)
    const fleet = g.unitList.some((u) => !u.dead && u.owner === p.id && UNITS[u.type].role !== 'scout' && u.type !== 'seed' && !UNITS[u.type].isStatic);
    if (w < 0 || !this.guards(w).length || g.time - (g.ui.tutGuardAt ?? g.time) > 240 || !fleet) {
      g.ui.tutRaider = 0;
      g.ui.tutRaidFled = 0;
      this.step = 8;
      return;
    }
    if (this.s.ownSelected().length || this.bound(w)) {
      view.highlightNode = w;
      if (!this.lookedAtGuarded && this.s.ownSelected().length) {
        this.lookedAtGuarded = true;
        this.seeWorld(w);
      }
    }
  }

  /** The guarded world of step 7, or -1. */
  private guardedWorld(): number {
    return (this.g.ui.tutGuarded ?? 0) - 1;
  }

  /** The world away from the Hearth where most of the player's ships are (-1: all are home). */
  private awayFleet(): number {
    let best = -1;
    let bc = 0;
    for (const n of this.g.nodes) {
      if (n.id === this.g.player.capital) continue;
      const c = this.s.fleetAt(n.id).filter((u) => UNITS[u.type].role !== 'scout').length;
      if (c > bc) {
        bc = c;
        best = n.id;
      }
    }
    return best;
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
        return { text: `${stepOf(3)} · Choose your first Boon: press the BOON button at the top.`, color: PAL.gold, sub: 'Lore, the violet bar, fills by itself. ' +
            'Each time it is full you choose a Boon: an upgrade for the whole run.' };
      case 4: {
        const r = (g.ui.tutRaider ?? 0) > 0 ? g.units.get(g.ui.tutRaider!) : undefined;
        if (!r) {
          const seeding = g.unitList.some((u) => !u.dead && u.owner === g.playerId && u.type === 'seed' && u.order === 'kindle');
          return { text: seeding ? `${stepOf(4)} · Your seed ship is on its way. Wait for the new world to light up…` : `${stepOf(4)} · Get ready: a raider is coming.`, color: PAL.gold };
        }
        return { text: `${stepOf(4)} · A pirate raids your new world! Click your fleet's badge ${IC.fleet}, then the world.`, color: PAL.ember, badge: fleetLabel(this.hud, this.biggestFleet()), sub: 'Ships fight by themselves once they are where the enemy is.' };
      }
      case 8: {
        const r = (g.ui.tutRaider ?? 0) > 0 ? g.units.get(g.ui.tutRaider!) : undefined;
        const why = 'Your Hearth is your house. If it falls, the run is over: keep a fleet near it.';
        if (!r) return { text: `${stepOf(8)} · Get ready: a raider is coming for your Hearth.`, color: PAL.gold, sub: why };
        const away = this.awayFleet();
        if (away < 0) return { text: `${stepOf(8)} · A raider comes for your Hearth! Your fleet is home: it fights by itself.`, color: PAL.ember, sub: why };
        if (this.s.ownSelected().length) return { text: `${stepOf(8)} · A raider comes for your Hearth! Now click your Hearth: your ships fly home.`, color: PAL.ember, sub: why };
        return { text: `${stepOf(8)} · A raider comes for your Hearth! Bring your fleet home: click its badge ${IC.fleet}, then the Hearth.`, color: PAL.ember, badge: fleetLabel(this.hud, away), sub: why };
      }
      case 5: {
        const why = 'A Scout charts the dark, world after world. It keeps out of places it can see are guarded.';
        if (this.scoutPicked()) return { text: `${stepOf(5)} · Press EXPLORE (or E): your Scout ${IC.scout} will chart the dark by itself.`, color: PAL.gold, sub: why };
        const sc = this.scouts()[0];
        return {
          text: `${stepOf(5)} · Send your Scout ${IC.scout} to explore: click its fleet badge ${IC.fleet}, then EXPLORE.`,
          color: PAL.gold,
          badge: fleetLabel(this.hud, sc && !sc.lane ? sc.node : -1),
          sub: why,
        };
      }
      case 6: {
        const home = g.nodes[g.player.capital];
        const picked = this.s.view.selectedNode === home.id;
        if (!g.ui.tutRallied) {
          const t = this.rallyTarget();
          const name = t >= 0 ? g.nodes[t].name : 'another world';
          const sub = 'New ships built at your Hearth will fly there by themselves, one by one.';
          if (picked) return { text: `${stepOf(6)} · Now right-click ${name}: it becomes your Hearth's rally point.`, color: PAL.gold, sub };
          return { text: `${stepOf(6)} · Set a rally point: click your Hearth, then right-click ${name}.`, color: PAL.gold, sub };
        }
        const at = home.rally >= 0 ? g.nodes[home.rally].name : 'it';
        const sub = 'A rally point stays until you clear it, and new ships fly to it alone: one set at the enemy loses them one by one.';
        if (picked) return { text: `${stepOf(6)} · See the flag at ${at}? Now clear it: right-click your Hearth itself.`, color: PAL.gold, sub };
        return { text: `${stepOf(6)} · See the flag at ${at}? Now clear it: click your Hearth, then right-click it.`, color: PAL.gold, sub };
      }
      case 7: {
        const ring = 'Ships beat one another in a ring: Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers.';
        if (!g.ui.tutBuilt) return { text: `${stepOf(7)} · Build a Breaker: click your Hearth, then the Breaker button.`, color: PAL.gold, sub: ring };
        const w = this.guardedWorld();
        if (w < 0) return { text: `${stepOf(7)} · Your Breaker is being built…`, color: PAL.gold, sub: ring };
        const name = g.nodes[w].name;
        const sub = 'Old guards hold some dark worlds, and nothing can be kindled there while they stand. Breakers bring them down.';
        if (this.bound(w)) return { text: `${stepOf(7)} · Your fleet is taking ${name}. Its guards fight back…`, color: PAL.gold, sub };
        if (this.s.ownSelected().length) return { text: `${stepOf(7)} · Now click ${name}: your ships fly there and fight its guards.`, color: PAL.gold, sub };
        return { text: `${stepOf(7)} · Take a guarded world: click your Breaker's fleet badge ${IC.fleet}, then ${name}.`, color: PAL.gold, badge: fleetLabel(this.hud, this.strikeFleet()), sub };
      }
      case 9:
        return { text: `${stepOf(9)} · Meet your three Destinies: the ways this run can be won.`, color: PAL.gold, sub: 'You do not choose one. Reach any one of them and the run is won.' };
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
      case 4:
      case 8: {
        const r = (game.ui.tutRaider ?? 0) > 0 ? game.units.get(game.ui.tutRaider!) : undefined;
        if (!r) return;
        const w = this.raidTarget();
        if (this.s.ownSelected().length) {
          atWorld(w);
          return;
        }
        // Point at the biggest fleet badge (the Hearth's raid: the biggest away from it; none if all are home).
        const best = this.step === 8 ? this.awayFleet() : this.biggestFleet();
        if (best >= 0 && atRect('fleet-' + best)) return;
        if (best >= 0) atWorld(best);
        break;
      }
      case 6: {
        // The Hearth to click; once it is picked, the world to right-click (or, the rally set, the Hearth again).
        if (view.selectedNode === p.capital && !game.ui.tutRallied) atWorld(this.rallyTarget());
        else atWorld(p.capital);
        break;
      }
      case 7: {
        if (!game.ui.tutBuilt) {
          if (view.selectedNode === p.capital && atRect('build-breaker')) return;
          atWorld(p.capital);
          return;
        }
        const w = this.guardedWorld();
        if (w < 0) return;
        if (this.s.ownSelected().length || this.bound(w)) {
          atWorld(w);
          return;
        }
        const at = this.strikeFleet();
        if (at >= 0 && atRect('fleet-' + at)) return;
        if (at >= 0) atWorld(at);
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
