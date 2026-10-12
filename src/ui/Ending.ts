import type { Session } from '../app/Session';
import { BUILD_ORDER, isWarship } from '../game/data/units';
import { VICTORIES } from '../game/data/victories';
import type { GNode, UnitType } from '../game/types';
import { bigText, fit, text, textCenter, textRight, textWidth, wrap } from '../render/font';
import { PAL, shade } from '../render/palette';
import { box, rect, ring, type Ctx } from '../render/pixel';
import { fmtTime } from '../render/Renderer';
import { iconCanvas, shipSprite } from '../render/sprites';
import { fmt } from './format';
import type { Ui } from './Ui';

/** A figure of the run as the ending tells it: counted up, and measured against the player's record. */
export interface TallyLine {
  label: string;
  value: number;
  kind: 'time' | 'count' | 'legacy';
  /** The run beat the record there was. */
  record: boolean;
  /** The record before this run, if there was one. */
  was?: number;
}

/** Seconds: when each beat of a crowning begins... */
const SPREAD = 2.2;
const CROWN = 6.2;
const TALLY = 10.2;
/** ...and of a fall. */
const FALL_WORDS = 2.6;
const FALL_TALLY = 5.2;
/** Seconds between two lines of the tally, and how long one counts up. */
const LINE_EVERY = 0.85;
const COUNT = 0.6;
/** The black bars above and below, as a film has them. */
const BARS = 14;
/** A press this soon after the end is the last order of the run, not a wish to skip it. */
const GUARD = 0.6;

/** Notes the worlds ring as they light, one after another: up the fanfare's own scale. */
const CHIME = [60, 64, 67, 72, 76, 79, 84, 88];

/**
 * The end of a run, on the map itself.
 *
 * A crowning, in four beats: the moment (the camera goes to where the run was decided, and a wave of
 * light rolls out from it), the light spreading (the view pulls back to the whole sector, the dark
 * lifts, and the house's worlds flare one after another outward from its Hearth), the crowning (the
 * house's banners fall, a crown comes down over VICTORY, its fleet flies past) and the tally (the run's
 * figures count up one by one, a record stamped where one fell). A fall is told shorter and quieter.
 * A click or a key goes straight to the tally, and from the tally to the results.
 *
 * (It was two seconds: the screen dimmed, a word rose, a click. The player who had won a forty-minute
 * run got less ceremony than a Boon.)
 */
export class Ending {
  /** Seconds into the ending (-1: it has not begun). */
  private t = -1;
  private place: GNode | null = null;
  /** The house's worlds in the order they light, with the second each one does. */
  private flares: { n: GNode; at: number; rung: boolean }[] = [];
  private spread = false;
  private crowned = false;
  /** Lines of the tally that have made their sound. */
  private told = 0;
  private stamped = 0;

  constructor(
    private s: Session,
    private ui: Ui,
  ) {}

  private get won(): boolean {
    return !!this.s.game.outcome?.playerWon;
  }

  private get tallyAt(): number {
    return this.won ? TALLY : FALL_TALLY;
  }

  /** The second at which the whole tally stands. */
  private get doneAt(): number {
    return this.tallyAt + Math.max(0, this.s.endTally.length - 1) * LINE_EVERY + COUNT;
  }

  /** Is the tally told, with nothing left but to go on? */
  get done(): boolean {
    return this.t >= this.doneAt;
  }

  /** A click or a key: straight to the tally, all of it; and from the tally to the results. */
  advance() {
    if (this.t < GUARD) return;
    if (this.done) {
      this.s.hooks.showResults?.();
      return;
    }
    this.t = this.doneAt;
    this.told = this.s.endTally.length;
    this.stamped = this.s.endTally.length;
    for (const f of this.flares) f.rung = true;
  }

  private begin() {
    const s = this.s;
    const g = s.game;
    const o = g.outcome!;
    const p = g.player;
    this.t = 0;
    s.clearSelection();
    s.view.orderMode = false;
    // Where the run was decided: the last rival Hearth to fall, the Maw, or the player's own Hearth
    // (where it stood, if it is the player's house that fell).
    const hearth = p.capital >= 0 ? p.capital : (p.lostHearth ?? -1);
    let place = hearth >= 0 ? g.nodes[hearth] : null;
    if (o.playerWon && o.victory === 'conquest') {
      const last = g.empires().filter((f) => f.id !== p.id && !f.alive && (f.lostHearth ?? -1) >= 0).sort((a, b) => b.eliminatedAt - a.eliminatedAt)[0];
      if (last) place = g.nodes[last.lostHearth!];
    } else if (o.playerWon && o.victory === 'crisis') {
      place = g.nodes.find((n) => n.kind === 'rift') ?? place;
    }
    this.place = place ?? g.nodes[0];
    const cam = s.renderer.cam;
    cam.ease = 2.4;
    cam.focus(this.place.x, this.place.y, Math.min(cam.maxZoom, Math.max(cam.minZoom * 2.4, 0.16)));
    s.renderer.fx.shake = o.playerWon ? 8 : 5;
    // The worlds light outward from the Hearth: nearest first.
    const home = p.capital >= 0 ? p.capital : this.place.id;
    const worlds = g.worldsOf(p.id).sort((a, b) => g.hops(a.id, home) - g.hops(b.id, home) || a.id - b.id);
    const every = Math.min(0.28, (CROWN - SPREAD - 0.9) / Math.max(1, worlds.length));
    this.flares = worlds.map((n, i) => ({ n, at: SPREAD + 0.35 + i * every, rung: false }));
  }

  draw(g: Ctx, W: number, H: number) {
    if (this.t < 0) this.begin();
    else this.t += this.ui.dt;
    const t = this.t;
    this.cues();
    if (this.won) this.crowning(g, W, H, t);
    else this.fall(g, W, H, t);
    // The bars slide in, and stay.
    const bars = Math.round(BARS * Math.min(1, t / 0.4));
    rect(g, 0, 0, W, bars, PAL.void);
    rect(g, 0, H - bars, W, bars, PAL.void);
    if (this.done) {
      if (Math.floor(t * 2) % 2 === 0) textCenter(g, 'CLICK TO CONTINUE', W / 2, H - BARS + 4, PAL.bone, 'tiny');
    } else if (t > 1.2) textRight(g, 'CLICK TO SKIP', W - 6, H - BARS + 4, PAL.slate, 'tiny');
    this.ui.add({ id: 'ending', x: 0, y: 0, w: W, h: H, onClick: () => this.advance() });
  }

  /** What happens once, when its second comes: the view moves, the dark lifts, the sounds are made. */
  private cues() {
    const s = this.s;
    const t = this.t;
    const cam = s.renderer.cam;
    if (this.won && !this.spread && t >= SPREAD) {
      this.spread = true;
      // The dark lifts from the whole sector, and the view pulls back to all of it.
      s.view.reveal = true;
      cam.ease = this.done ? 12 : 1.8;
      const b = cam.bounds;
      cam.focus((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, cam.minZoom);
    }
    for (let i = 0; i < this.flares.length; i++) {
      const f = this.flares[i];
      if (f.rung || t < f.at) continue;
      f.rung = true;
      if (this.won) s.sfx.note(CHIME[Math.min(CHIME.length - 1, Math.floor((i / Math.max(1, this.flares.length - 1)) * (CHIME.length - 1)))], 0.22, 0.16);
    }
    // Once the words come, the map's own names step aside for them.
    if (t >= (this.won ? CROWN : FALL_WORDS)) s.view.plain = true;
    if (this.won && !this.crowned && t >= CROWN + 0.9) {
      this.crowned = true;
      if (!this.done) s.sfx.play('kindle', 0.55);
    }
    // The tally: a tick as each line begins to count, a chime as a record is stamped.
    const lines = s.endTally;
    while (this.told < lines.length && t >= this.tallyAt + this.told * LINE_EVERY) {
      s.sfx.play('tick', 0.5);
      this.told++;
    }
    while (this.stamped < lines.length && t >= this.tallyAt + this.stamped * LINE_EVERY + COUNT) {
      if (lines[this.stamped].record) s.sfx.play('good', 0.55);
      this.stamped++;
    }
  }

  // ---------------------------------------------------------------------
  // A crowning
  // ---------------------------------------------------------------------

  private crowning(g: Ctx, W: number, H: number, t: number) {
    const s = this.s;
    const game = s.game;
    const o = game.outcome!;
    const p = game.player;
    const cam = s.renderer.cam;
    const at = (n: GNode): [number, number] => {
      const [x, y] = cam.worldToScreen(n.x, n.y);
      return [Math.round(x), Math.round(y)];
    };
    // 1. The moment: a flash, and rings of light rolling out from where it was decided.
    if (t < SPREAD + 1 && this.place) {
      const [px, py] = at(this.place);
      for (let k = 0; k < 4; k++) {
        const r = (t - k * 0.24) * 150;
        if (r > 2 && r < W) ring(g, px, py, r, k % 2 ? PAL.gold : PAL.bone, r > W * 0.5 ? 3 : r > W * 0.25 ? 2 : 1);
      }
      const flash = 0.75 - t * 2.6;
      if (flash > 0) {
        g.fillStyle = `rgba(255, 244, 224, ${flash})`;
        g.fillRect(0, 0, W, H);
      }
    }
    // 2. The light spreads: each world of the house flares in its turn, and keeps a ring of light.
    for (const f of this.flares) {
      const age = t - f.at;
      if (age < 0) continue;
      const [x, y] = at(f.n);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const r0 = s.renderer.nodeR(f.n);
      if (age < 0.9) {
        const r = r0 + 3 + age * 46;
        ring(g, x, y, r, age < 0.3 ? PAL.bone : p.color, age < 0.45 ? 1 : age < 0.7 ? 2 : 4);
        if (age < 0.25) ring(g, x, y, r0 + 2, PAL.bone, 1);
      }
      if (t < TALLY + 1) ring(g, x, y, r0 + 3 + (Math.floor(t * 3 + f.n.id) % 2), p.color, 2);
    }
    // Embers rise through all of it.
    if (t >= SPREAD) this.embers(g, W, H, t - SPREAD, true);
    if (t < CROWN) return;
    // 3. The crowning. The map steps back behind it.
    // (Further back still once the figures are read.)
    const k = Math.min(1, (t - CROWN) / 0.6);
    g.fillStyle = `rgba(11, 10, 26, ${0.5 * k + 0.22 * Math.min(1, Math.max(0, (t - TALLY + 0.4) / 0.6))})`;
    g.fillRect(0, 0, W, H);
    const scale = Math.max(2, Math.min(4, Math.floor(W / 130)));
    const crown = iconCanvas('conquest', PAL.gold, true);
    const cs = scale + 1;
    // (The crown, the word, two lines, the fleet and the tally, as one block in the middle of the screen.)
    const block = crown.height * cs + 4 + scale * 7 + 28 + 26 + s.endTally.length * 12;
    const top = Math.max(BARS + 4, Math.round((H - block) / 2));
    const ty = top + crown.height * cs + 4;
    const lines = ty + scale * 7 + 8;
    // Its fleet flies past, behind the banners: one of every kind of ship that saw the end.
    if (t > CROWN + 1) this.parade(g, W, lines + 26, t - CROWN - 1, p.color);
    this.banners(g, W, H, (t - CROWN) / 0.8, p.color);
    // The crown comes down and settles over the word.
    const drop = Math.min(1, (t - CROWN) / 0.9);
    const cy = Math.round(-crown.height * cs + (top + crown.height * cs) * (1 - (1 - drop) * (1 - drop)));
    g.drawImage(crown, Math.round(W / 2 - (crown.width * cs) / 2), cy, crown.width * cs, crown.height * cs);
    bigText(g, 'VICTORY', W / 2, Math.round(ty - (1 - k) * 10), PAL.gold, PAL.wine, scale);
    if (t > CROWN + 0.5) {
      textCenter(g, fit(`${p.name.toUpperCase()} IS CROWNED HEGEMARCH`, W - 70), W / 2, lines, PAL.bone);
      const by = VICTORIES[o.victory as keyof typeof VICTORIES]?.name;
      textCenter(g, fit(`${by ? `BY ${by.toUpperCase()} · ` : ''}${fmtTime(this.runTime())}`, W - 70, 'tiny'), W / 2, lines + 11, p.color, 'tiny');
    }
    if (t >= TALLY) this.tally(g, W, lines + 46, t - TALLY);
  }

  /** The player's ships that are left, one of each kind (the Ark first), flying across in a line. */
  private parade(g: Ctx, W: number, y: number, t: number, color: string) {
    const game = this.s.game;
    const have = new Set(game.unitsOf(game.playerId).map((u) => u.type));
    const types: UnitType[] = (['ark', ...BUILD_ORDER.filter(isWarship).reverse()] as UnitType[]).filter((x) => have.has(x));
    if (!types.length) return;
    const gap = 34;
    const span = W + types.length * gap + 40;
    types.forEach((type, i) => {
      const spr = shipSprite(type, color, 0);
      const x = Math.round(((t * 30 + (types.length - i) * gap) % span) - 40);
      const sy = y + Math.round(Math.sin(t * 2 + i) * 1.5) - spr.height;
      // (Its wake, then the ship at twice its size.)
      rect(g, x - 10, sy + spr.height, 8, 1, shade(color));
      rect(g, x - 16, sy + spr.height, 4, 1, PAL.indigo);
      g.drawImage(spr, x, sy, spr.width * 2, spr.height * 2);
    });
  }

  /** Two banners in the house's colour fall from the top bar, a crown on each. */
  private banners(g: Ctx, W: number, H: number, k: number, color: string) {
    const drop = Math.min(1, Math.max(0, k));
    const bw = Math.max(16, Math.round(W * 0.05));
    const bh = Math.round((H * 0.5) * (1 - (1 - drop) * (1 - drop)));
    if (bh < 6) return;
    const crown = iconCanvas('conquest', PAL.gold, true);
    for (const bx of [Math.round(W * 0.07), Math.round(W * 0.93) - bw]) {
      rect(g, bx, BARS, bw, bh, shade(color));
      rect(g, bx + 1, BARS, bw - 2, bh - 1, color);
      rect(g, bx + 3, BARS, 1, bh - 3, shade(color));
      rect(g, bx + bw - 4, BARS, 1, bh - 3, shade(color));
      // (A swallowtail: the foot of the banner is cut to two points.)
      const notch = Math.floor(bw / 2) - 1;
      for (let i = 0; i < notch; i++) rect(g, bx + bw / 2 - i - 1, BARS + bh - 1 - (notch - 1 - i), (i + 1) * 2, 1, PAL.void);
      if (bh > 30) g.drawImage(crown, Math.round(bx + bw / 2 - crown.width), BARS + 8, crown.width * 2, crown.height * 2);
    }
  }

  // ---------------------------------------------------------------------
  // A fall
  // ---------------------------------------------------------------------

  private fall(g: Ctx, W: number, H: number, t: number) {
    const s = this.s;
    const game = s.game;
    const o = game.outcome!;
    const cam = s.renderer.cam;
    // The light goes out of the place: a ring closes on it, and the dark comes in.
    g.fillStyle = `rgba(11, 10, 26, ${Math.min(0.66, t * 0.42)})`;
    g.fillRect(0, 0, W, H);
    if (this.place && t < FALL_WORDS + 0.6) {
      const [px, py] = cam.worldToScreen(this.place.x, this.place.y);
      for (let k = 0; k < 3; k++) {
        const r = 130 - (t + k * 0.3) * 62;
        if (r > 3) ring(g, Math.round(px), Math.round(py), r, k ? PAL.wine : PAL.red, r < 40 ? 1 : 2);
      }
    }
    this.embers(g, W, H, t, false);
    if (t < FALL_WORDS) return;
    const k = Math.min(1, (t - FALL_WORDS) / 0.6);
    const scale = Math.max(2, Math.min(4, Math.floor(W / 130)));
    const ty = Math.max(BARS + 6, Math.round((H - (scale * 7 + 43 + s.endTally.length * 12)) / 2));
    bigText(g, 'DEFEAT', W / 2, Math.round(ty - (1 - k) * 8), PAL.red, PAL.night, scale);
    let y = ty + scale * 7 + 9;
    if (t > FALL_WORDS + 0.5) {
      // A rival crowned: who, and by what. The player's own Hearth taken: the reason says it all.
      const winner = o.winner >= 0 ? game.factions[o.winner] : null;
      if (winner && o.victory !== 'defeat') {
        textCenter(g, fit(`${winner.name} is crowned Hegemarch.`.toUpperCase(), W - 40), W / 2, y, PAL.bone);
        y += 12;
      }
      for (const l of wrap(o.reason || 'Your Hearth has gone dark.', Math.min(W - 40, 300), 'main').slice(0, 2)) {
        textCenter(g, l, W / 2, y, winner && o.victory !== 'defeat' ? PAL.mist : PAL.bone);
        y += 10;
      }
    }
    if (t >= FALL_TALLY) this.tally(g, W, y + 12, t - FALL_TALLY);
  }

  // ---------------------------------------------------------------------
  // What both are told with
  // ---------------------------------------------------------------------

  /** The run's time as the results give it (an Ages run: the cradle and the stars together). */
  private runTime(): number {
    const line = this.s.endTally.find((l) => l.kind === 'time');
    return line ? line.value : (this.s.game.outcome?.time ?? 0);
  }

  /** Sparks: rising gold over a crowning, falling and going out over a fall. */
  private embers(g: Ctx, W: number, H: number, t: number, up: boolean) {
    const n = up ? 70 : 34;
    for (let i = 0; i < n; i++) {
      const sx = (i * 97 + 31 + Math.round(Math.sin(t * 0.8 + i) * 3)) % W;
      const speed = (up ? 16 : 9) + ((i * 37) % 23);
      const run = (t * speed + ((i * 53) % H)) % (H + 20);
      const sy = up ? H - run : run - 10;
      if (!up && (i * 13 + Math.floor(t * 4)) % 5 === 0) continue;
      g.fillStyle = up ? (i % 4 === 0 ? PAL.bone : i % 4 === 1 ? PAL.ember : PAL.gold) : i % 3 ? PAL.wine : PAL.red;
      g.fillRect(sx, Math.round(sy), 1, 1);
      if (up && i % 9 === 0) g.fillRect(sx, Math.round(sy) + 1, 1, 1);
    }
  }

  /** The figures of the run, one line after another, each counting up; a record is stamped beside it. */
  private tally(g: Ctx, W: number, y: number, t: number) {
    const lines = this.s.endTally;
    const mid = Math.round(W / 2);
    const show = (l: TallyLine, v: number) => (l.kind === 'time' ? fmtTime(v) : (l.kind === 'legacy' ? '+' : '') + fmt(Math.round(v)));
    lines.forEach((l, i) => {
      const age = t - i * LINE_EVERY;
      if (age < 0) return;
      const k = Math.min(1, age / COUNT);
      const ease = 1 - (1 - k) * (1 - k);
      const ly = y + i * 12;
      textRight(g, l.label, mid - 6, ly + 1, PAL.mist, 'tiny');
      const value = show(l, l.value * ease);
      const ex = text(g, value, mid + 6, ly, k < 1 ? PAL.bone : l.kind === 'legacy' ? PAL.gold : PAL.bone);
      if (k < 1) return;
      if (l.record) {
        // The stamp lands a little large and settles.
        const land = Math.min(1, (age - COUNT) / 0.18);
        const label = 'NEW RECORD';
        const w = textWidth(label, 'tiny') + 6;
        const bx = ex + 6 + Math.round((1 - land) * 3);
        box(g, bx, ly - 1, w, 9, land < 1 ? PAL.gold : PAL.wine, PAL.gold);
        text(g, label, bx + 3, ly + 1, land < 1 ? PAL.void : PAL.gold, 'tiny');
        if (l.was !== undefined) text(g, `WAS ${show({ ...l, kind: l.kind === 'legacy' ? 'count' : l.kind }, l.was)}`, bx + w + 5, ly + 1, PAL.dusk, 'tiny');
      } else if (l.was !== undefined) {
        text(g, `BEST ${show({ ...l, kind: l.kind === 'legacy' ? 'count' : l.kind }, l.was)}`, ex + 8, ly + 1, PAL.slate, 'tiny');
      }
    });
  }
}
