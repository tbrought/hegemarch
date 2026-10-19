/**
 * Pixel effects: sparks, debris, expanding rings, beam flashes and floating text. Purely visual: all
 * randomness here uses Math.random, never the simulation RNG.
 */
import type { Fx } from '../game/types';
import { castLook, convertLook } from './abilityLooks';
import type { Camera } from './Camera';
import { textCenter, textOutline, textWidth } from './font';
import { PAL, light, shade } from './palette';
import { line, ring, type Ctx } from './pixel';

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  c2: string;
  big: boolean;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  dur: number;
  c: string;
  /** Radius in world units (true) or screen pixels (false). */
  world: boolean;
  dotted: boolean;
  /** Pixels wide (1): an ability's reach runs out two wide. */
  w?: number;
}

/**
 * A mark on one ship, drawn with it (render/abilityLooks.ts, 1.26): lit by the ability it casts, ticked by one
 * that touches it, its colour wiped over to the house that turned it, crackling, trailing, scorched. Below
 * zero `t` it has not begun (a tick waits for the reach to come to it).
 */
export interface Mark {
  kind: 'lit' | 'tick' | 'wipe' | 'notes' | 'crackle' | 'trail' | 'scorch';
  t: number;
  dur: number;
  c: string;
  /** A wipe's old colour. */
  from?: string;
}

/** A mote of a Nanite Cloud, on its way from the ship that cast it to a ship it mends. */
export interface Mote {
  x: number;
  y: number;
  to: number;
  t: number;
  dur: number;
  c: string;
  /** How far it bows off the straight way, and to which side. */
  bend: number;
}

/** A thread of a Conversion, from the ship that calls to the ship that goes over. */
export interface Thread {
  by: number;
  x: number;
  y: number;
  to: number;
  t: number;
  dur: number;
  c: string;
}

/** An Ember Lance: a beam held from the ship to its mark, cooling. */
export interface Lance {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  dur: number;
}

/**
 * A House Power's light (1.27): a line drawn out from one place to another over `dur` seconds (its head
 * bright), held for `hold` more, cooling to its shade: Dawn's light out to its worlds, a Call to Arms from the
 * Forges to the Ark, a Wayfinder's starlane being cut.
 */
export interface Streak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  dur: number;
  hold: number;
  c: string;
  /** Two pixels wide. */
  wide?: boolean;
}

/** Fate's Wager's coin: thrown up over the Ark's world, turning, until it lands (`dur`) and shows its face. */
export interface Coin {
  x: number;
  y: number;
  t: number;
  dur: number;
  heads: boolean;
  c: string;
}

/** Seconds a landed coin shows its face. */
const COIN_SHOW = 1.4;

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  dur: number;
  c: string;
  w: number;
}

interface Floater {
  x: number;
  y: number;
  /** (Below zero: it has not appeared yet.) */
  t: number;
  dur: number;
  text: string;
  c: string;
  /** In the large font with an outline, and it stays where it is: what a Starfall took, over its star. */
  big?: boolean;
  /** Screen pixels over its place it begins at. */
  lift?: number;
  /** What a ship's ability says over it: words, so left out of a picture without words (`plain`). */
  label?: boolean;
  /** A number in the large font, outlined, rising a little: the damage of an Ember Lance. */
  num?: boolean;
}

interface Flash {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
  c: string;
  /** Drawn as a disc (a star's eruption); a ship's small flash is a square. */
  round?: boolean;
}

/** A ring that sweeps the map (the change of a new age, spreading from a Hearth), in world units. */
interface Wave {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  c: string;
}

const MAX_SPARKS = 2400;

export class Effects {
  sparks: Spark[] = [];
  rings: Ring[] = [];
  beams: Beam[] = [];
  floaters: Floater[] = [];
  flashes: Flash[] = [];
  waves: Wave[] = [];
  /** Marks on ships, by the ship's id (render/abilityLooks.ts). */
  marks = new Map<number, Mark[]>();
  motes: Mote[] = [];
  threads: Thread[] = [];
  lances: Lance[] = [];
  streaks: Streak[] = [];
  coins: Coin[] = [];
  /** Screen shake amount in pixels. It wears off in real time, in `Renderer.render`, not with the game. */
  shake = 0;

  clear() {
    this.sparks.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.floaters.length = 0;
    this.flashes.length = 0;
    this.waves.length = 0;
    this.marks.clear();
    this.motes.length = 0;
    this.threads.length = 0;
    this.lances.length = 0;
    this.streaks.length = 0;
    this.coins.length = 0;
    this.shake = 0;
  }

  /** Put a mark on a ship. */
  mark(id: number, m: Mark) {
    const l = this.marks.get(id);
    if (l) l.push(m);
    else this.marks.set(id, [m]);
  }

  /** Words that rise over a place: in the small font, or a number in the large (`num`). */
  say(x: number, y: number, text: string, c: string, o: { lift?: number; dur?: number; label?: boolean; num?: boolean } = {}) {
    // (Words a ship says while others it said are still up go over them, not on them: an Ark that casts
    // four abilities as it comes into a fight says the four, one over another.)
    const over = o.label && !o.num ? this.floaters.filter((f) => f.label && !f.num && f.t < 1.1 && Math.abs(f.x - x) < 60 && Math.abs(f.y - y) < 60).length : 0;
    this.floaters.push({ x, y, t: 0, dur: o.dur ?? 1.6, text, c, lift: (o.lift ?? 0) + over * 8, label: o.label, num: o.num });
  }

  burst(x: number, y: number, n: number, speed: number, life: number, cols: string[], big = false) {
    for (let i = 0; i < n && this.sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const l = life * (0.6 + Math.random() * 0.6);
      const c = cols[i % cols.length];
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c, c2: shade(c), big });
    }
  }

  /** Turn simulation effects into visuals. `visible` filters by node; `near` culls off-screen ones. */
  ingest(list: Fx[], visible: (node: number) => boolean, near: (x: number, y: number, pad: number) => boolean, zoom: number) {
    for (const f of list) {
      // (A Starfall armed, a star erupting: every house is told, so they are seen wherever they are.)
      if ('node' in f && f.node >= 0 && !visible(f.node) && f.k !== 'armed' && f.k !== 'nova') continue;
      switch (f.k) {
        case 'beam':
          if (!near(f.x1, f.y1, 800)) break;
          this.beams.push({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, t: 0, dur: 0.14, c: f.color, w: f.w });
          this.burst(f.x2, f.y2, 2, 60, 0.25, [light(f.color), f.color]);
          break;
        case 'shot':
          if (!near(f.x, f.y, 200)) break;
          this.burst(f.x, f.y, 1, 30, 0.15, [PAL.bone]);
          break;
        case 'hit':
          if (!near(f.x, f.y, 100)) break;
          // (A ship under an Aegis Field turns its hits aside in gold: its shell is seen as it is struck.)
          if (f.shield) {
            if (Math.random() < (f.aegis ? 0.6 : 0.35)) {
              const ox = Math.cos(f.ang) * f.r;
              const oy = Math.sin(f.ang) * f.r;
              this.rings.push({ x: f.x + ox * 0.3, y: f.y + oy * 0.3, r0: 1, r1: f.aegis ? 4 : 3, t: 0, dur: 0.18, c: f.aegis ? PAL.gold : PAL.sky, world: false, dotted: true });
            }
          } else {
            this.burst(f.x + Math.cos(f.ang) * f.r * 0.6, f.y + Math.sin(f.ang) * f.r * 0.6, 2, 80, 0.3, f.aegis ? [PAL.gold, PAL.bone] : [PAL.gold, PAL.ember]);
          }
          break;
        case 'boom': {
          if (!near(f.x, f.y, 300)) break;
          const s = f.size;
          const n = Math.min(60, Math.round(6 + s * 1.4));
          this.burst(f.x, f.y, n, 60 + s * 6, 0.5 + s * 0.02, [PAL.bone, PAL.gold, PAL.ember, PAL.red, f.color]);
          this.burst(f.x, f.y, Math.round(n / 3), 30 + s * 3, 1.0 + s * 0.02, [f.color, shade(f.color), PAL.slate], s > 14);
          this.flashes.push({ x: f.x, y: f.y, t: 0, dur: 0.12 + s * 0.004, r: Math.max(2, s * 0.35 * Math.max(1, zoom * 3)), c: PAL.bone });
          this.rings.push({ x: f.x, y: f.y, r0: s * 0.4, r1: s * 2.4, t: 0, dur: 0.45, c: s > 20 ? PAL.gold : PAL.ember, world: true, dotted: false });
          if (s >= 24) this.shake = Math.min(3, this.shake + s / 20);
          break;
        }
        case 'jumpOut':
          if (!near(f.x, f.y, 200)) break;
          this.beams.push({ x1: f.x, y1: f.y, x2: f.x + Math.cos(f.a) * 160, y2: f.y + Math.sin(f.a) * 160, t: 0, dur: 0.25, c: light(f.color), w: 1 });
          this.burst(f.x, f.y, 4, 40, 0.3, [light(f.color), f.color]);
          break;
        case 'jumpIn':
          if (!near(f.x, f.y, 200)) break;
          this.beams.push({ x1: f.x - Math.cos(f.a) * 160, y1: f.y - Math.sin(f.a) * 160, x2: f.x, y2: f.y, t: 0, dur: 0.22, c: light(f.color), w: 1 });
          this.rings.push({ x: f.x, y: f.y, r0: 1, r1: 5, t: 0, dur: 0.3, c: f.color, world: false, dotted: false });
          break;
        case 'capture':
          // Handled by the renderer (kindle dissolve) plus a burst here.
          this.kindleBurst(f.node, f.color);
          break;
        case 'ring':
          if (!near(f.x, f.y, f.r + 100)) break;
          this.rings.push({ x: f.x, y: f.y, r0: f.r * 0.3, r1: f.r, t: 0, dur: 0.5, c: f.color, world: true, dotted: true });
          break;
        case 'upgrade':
          // A unit takes on the look of the new age: a ring closes on it and it throws off a few sparks.
          if (!near(f.x, f.y, f.r + 100)) break;
          this.rings.push({ x: f.x, y: f.y, r0: f.r * 1.6, r1: f.r * 0.4, t: 0, dur: 0.45, c: f.color, world: true, dotted: false });
          this.burst(f.x, f.y, 6, 60, 0.5, [PAL.bone, f.color, light(f.color)]);
          break;
        case 'wave':
          this.waves.push({ x: f.x, y: f.y, r: f.r, t: 0, dur: Math.max(0.2, f.dur), c: f.color });
          break;
        case 'text':
          if (!near(f.x, f.y, 200)) break;
          // (The same words in the same colour just said close by are not said again: a swarm's blasts say
          // MARTYR once, and each side's, in its colour, once.)
          if (this.floaters.some((o) => o.text === f.text && o.c === f.color && o.t < 0.8 && Math.abs(o.x - f.x) < 160 && Math.abs(o.y - f.y) < 160)) break;
          this.floaters.push({ x: f.x, y: f.y, t: 0, dur: 1.6, text: f.text, c: f.color });
          break;
        case 'armed':
          this.rings.push({ x: f.x, y: f.y, r0: 420, r1: 30, t: 0, dur: 0.9, c: PAL.red, world: true, dotted: true });
          this.rings.push({ x: f.x, y: f.y, r0: 420, r1: 30, t: -0.3, dur: 0.9, c: PAL.ember, world: true, dotted: true });
          break;
        case 'nova': {
          // The star goes up: rings that run out over the whole system, a white flash, and the screen shakes.
          for (let i = 0; i < 4; i++) this.rings.push({ x: f.x, y: f.y, r0: 40, r1: 1400 + i * 900, t: -i * 0.2, dur: 1.5 + i * 0.4, c: i % 2 ? PAL.gold : PAL.bone, world: true, dotted: false });
          this.flashes.push({ x: f.x, y: f.y, t: 0, dur: 0.7, r: Math.max(10, 500 * zoom), c: PAL.bone, round: true });
          this.burst(f.x, f.y, 60, 700, 1.8, [PAL.bone, PAL.gold, PAL.ember, PAL.red], true);
          this.shake = 3;
          // What it took, once the flash has cleared: it stands over the star for seven seconds.
          if (f.toll) this.floaters.push({ x: f.x, y: f.y, t: -0.8, dur: 7, text: f.toll, c: PAL.bone, big: true });
          break;
        }
        case 'ability':
          if (!near(f.x, f.y, f.r)) break;
          castLook(this, f);
          break;
        case 'convert':
          if (!near(f.x, f.y, 300)) break;
          convertLook(this, f);
          break;
      }
    }
  }

  /** Kindle / capture bursts need the node position: the renderer registers it. */
  nodePos: (node: number) => { x: number; y: number; r: number } | null = () => null;
  /** Where a ship is now, its size and its heading (abilities' motes and threads follow it): the renderer registers it. */
  unitPos: (id: number) => { x: number; y: number; r: number; a: number } | null = () => null;

  private kindleBurst(node: number, color: string) {
    const p = this.nodePos(node);
    if (!p) return;
    this.rings.push({ x: p.x, y: p.y, r0: p.r, r1: p.r * 2.6, t: 0, dur: 0.9, c: color, world: true, dotted: false });
    this.rings.push({ x: p.x, y: p.y, r0: p.r, r1: p.r * 1.8, t: -0.15, dur: 0.8, c: PAL.bone, world: true, dotted: true });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const v = 90 + Math.random() * 120;
      const l = 0.7 + Math.random() * 0.6;
      const c = i % 3 === 0 ? PAL.bone : color;
      this.sparks.push({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c, c2: shade(c), big: false });
    }
  }

  update(dt: number) {
    if (dt <= 0) return;
    let w = 0;
    const damp = Math.pow(0.12, dt);
    for (const s of this.sparks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= damp;
      s.vy *= damp;
      this.sparks[w++] = s;
    }
    this.sparks.length = w;
    this.rings = this.rings.filter((r) => (r.t += dt) < r.dur);
    this.beams = this.beams.filter((b) => (b.t += dt) < b.dur);
    this.floaters = this.floaters.filter((f) => (f.t += dt) < f.dur);
    this.flashes = this.flashes.filter((f) => (f.t += dt) < f.dur);
    this.waves = this.waves.filter((v) => (v.t += dt) < v.dur);
    for (const [id, l] of this.marks) {
      const left = l.filter((m) => (m.t += dt) < m.dur);
      if (left.length) this.marks.set(id, left);
      else this.marks.delete(id);
    }
    this.motes = this.motes.filter((m) => (m.t += dt) < m.dur);
    this.threads = this.threads.filter((m) => (m.t += dt) < m.dur);
    this.lances = this.lances.filter((m) => (m.t += dt) < m.dur);
    this.streaks = this.streaks.filter((m) => (m.t += dt) < m.dur + m.hold);
    this.coins = this.coins.filter((m) => (m.t += dt) < m.dur + COIN_SHOW);
  }

  /** `plain`: a picture without words (the trailers'): what ships' abilities say is left out. */
  draw(g: Ctx, cam: Camera, ox: number, oy: number, plain = false) {
    const z = cam.zoom;
    const sx = (x: number) => Math.round((x - cam.x) * z + cam.w / 2 + ox);
    const sy = (y: number) => Math.round((y - cam.y) * z + cam.h / 2 + oy);
    for (const b of this.beams) {
      const k = b.t / b.dur;
      const c = k < 0.4 ? PAL.bone : b.c;
      const x1 = sx(b.x1);
      const y1 = sy(b.y1);
      const x2 = sx(b.x2);
      const y2 = sy(b.y2);
      if (Math.abs(x1 - x2) + Math.abs(y1 - y2) > 1400) continue;
      line(g, x1, y1, x2, y2, c, b.w >= 2 || k < 0.4 ? 1 : 2);
      if (b.w >= 3 && k < 0.5) line(g, x1 + 1, y1, x2 + 1, y2, b.c);
    }
    for (const f of this.flashes) {
      const r = Math.max(1, Math.round(f.r * (1 - f.t / f.dur)));
      g.fillStyle = f.c;
      if (f.round) {
        // (Row by row: a disc of whole pixels.)
        for (let dy = -r; dy <= r; dy++) {
          const w = Math.floor(Math.sqrt(r * r - dy * dy));
          g.fillRect(sx(f.x) - w, sy(f.y) + dy, w * 2 + 1, 1);
        }
      } else g.fillRect(sx(f.x) - r, sy(f.y) - r, r * 2 + 1, r * 2 + 1);
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.dur;
      const rad = (r.r0 + (r.r1 - r.r0) * k) * (r.world ? z : 1);
      if (rad > 600) continue;
      const c = k < 0.25 ? PAL.bone : r.c;
      ring(g, sx(r.x), sy(r.y), Math.max(1, rad), c, r.dotted || k > 0.7 ? 2 : 1);
      // (Wider: the rings inside it, its colour going to its shade toward the back.)
      for (let i = 1; i < (r.w ?? 1) && rad - i >= 1; i++) ring(g, sx(r.x), sy(r.y), rad - i, k < 0.25 ? r.c : shade(r.c), k > 0.7 ? 2 : 1);
    }
    // An Ember Lance: a core that cools from bone through gold to ember, its edges ember to wine.
    for (const l of this.lances) {
      const k = l.t / l.dur;
      const x1 = sx(l.x1);
      const y1 = sy(l.y1);
      const x2 = sx(l.x2);
      const y2 = sy(l.y2);
      const flat = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const [ex, ey] = flat ? [0, 1] : [1, 0];
      const edge = k < 0.5 ? PAL.ember : PAL.wine;
      line(g, x1 - ex, y1 - ey, x2 - ex, y2 - ey, edge);
      line(g, x1 + ex * 2, y1 + ey * 2, x2 + ex * 2, y2 + ey * 2, edge);
      const core = k < 0.3 ? PAL.bone : k < 0.6 ? PAL.gold : PAL.ember;
      line(g, x1, y1, x2, y2, core);
      line(g, x1 + ex, y1 + ey, x2 + ex, y2 + ey, core);
    }
    // A power's light: drawn out from one place to the other, its head bright, then held, cooling.
    for (const s of this.streaks) {
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.dur);
      const e = 1 - (1 - k) * (1 - k);
      const x1 = sx(s.x1);
      const y1 = sy(s.y1);
      const x2 = sx(s.x1 + (s.x2 - s.x1) * e);
      const y2 = sy(s.y1 + (s.y2 - s.y1) * e);
      if (Math.abs(x1 - x2) + Math.abs(y1 - y2) > 2400) continue;
      const cool = s.t > s.dur + s.hold * 0.5;
      const c = cool ? shade(s.c) : s.c;
      line(g, x1, y1, x2, y2, c, cool ? 2 : 1);
      if (s.wide) line(g, x1 + 1, y1, x2 + 1, y2, c, cool ? 2 : 1);
      if (k < 1) {
        g.fillStyle = light(s.c);
        g.fillRect(x2 - 1, y2 - 1, 3, 3);
      }
    }
    // Fate's Wager: the coin, turning as it goes up and comes down over the world; landed, its face.
    for (const c of this.coins) {
      const k = Math.min(1, c.t / c.dur);
      const r = 6;
      const cx = sx(c.x);
      const cy = sy(c.y) - 26 - Math.round(Math.sin(k * Math.PI) * 18);
      const landed = c.t >= c.dur;
      // (Turning: as wide as the coin is to the eye, on its edge a line.)
      const wide = landed ? r : Math.max(1, Math.round(Math.abs(Math.cos(c.t * 13)) * r));
      const face = landed ? (c.heads ? c.c : PAL.red) : Math.cos(c.t * 13) > 0 ? PAL.gold : PAL.ember;
      for (let dy = -r; dy <= r; dy++) {
        const w = Math.round(Math.sqrt(r * r - dy * dy) * (wide / r));
        g.fillStyle = Math.abs(dy) === r || w <= 1 ? shade(face) : face;
        g.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
      }
      if (landed) {
        // Heads: a sun at its heart; tails: a cross.
        g.fillStyle = PAL.void;
        if (c.heads) g.fillRect(cx - 1, cy - 1, 3, 3);
        else for (let i = -3; i <= 3; i++) {
          g.fillRect(cx + i, cy + i, 1, 1);
          g.fillRect(cx + i, cy - i, 1, 1);
        }
      }
    }
    // Conversion's threads: dashes running from the ship that calls to the ship it turns.
    for (const t of this.threads) {
      const from = this.unitPos(t.by) ?? t;
      const to = this.unitPos(t.to);
      if (!to) continue;
      const k = t.t / t.dur;
      line(g, sx(from.x), sy(from.y), sx(to.x), sy(to.y), k < 0.7 ? t.c : shade(t.c), 3, -Math.floor(t.t * 40));
    }
    // A Nanite Cloud's motes, bowing on their way from the ship that cast it to the ships it mends.
    for (const m of this.motes) {
      if (m.t < 0) continue;
      const to = this.unitPos(m.to);
      if (!to) continue;
      const k = m.t / m.dur;
      const e = k * k * (3 - 2 * k);
      const dx = to.x - m.x;
      const dy = to.y - m.y;
      const bow = Math.sin(e * Math.PI) * m.bend;
      const x = sx(m.x + dx * e - dy * bow);
      const y = sy(m.y + dy * e + dx * bow);
      // (Its colour and mist in turn: it shows on ships of its own colour, the Wayfarers' teal.)
      g.fillStyle = Math.floor(m.t * 20) % 2 ? PAL.mist : m.c;
      g.fillRect(x, y, z > 0.35 ? 2 : 1, z > 0.35 ? 2 : 1);
    }
    for (const v of this.waves) {
      // (Drawn only while it is small enough on screen to be worth its pixels; the units' own flashes carry on.)
      const rad = v.r * (v.t / v.dur) * z;
      if (rad > 1500) continue;
      ring(g, sx(v.x), sy(v.y), Math.max(1, rad), v.c, 3);
      if (rad > 4) ring(g, sx(v.x), sy(v.y), rad - 3, PAL.bone, 6);
    }
    for (const s of this.sparks) {
      const c = s.life > s.max * 0.45 ? s.c : s.c2;
      g.fillStyle = c;
      const x = sx(s.x);
      const y = sy(s.y);
      if (s.big || z > 0.35) g.fillRect(x, y, 2, 2);
      else g.fillRect(x, y, 1, 1);
    }
    for (const f of this.floaters) {
      if (f.t < 0 || (plain && f.label)) continue;
      const k = f.t / f.dur;
      if (f.num) {
        const x = sx(f.x) - Math.round(textWidth(f.text) / 2);
        const y = sy(f.y) - (f.lift ?? 0) - Math.round(Math.min(1, f.t * 2) * 8);
        if (k < 0.8 || Math.floor(f.t * 8) % 2 === 0) textOutline(g, f.text, x, y, f.t < 0.3 ? PAL.bone : f.c, PAL.void);
      } else if (f.big) {
        const x = sx(f.x) - Math.round(textWidth(f.text) / 2);
        const y = sy(f.y) - Math.max(16, Math.round(70 * z)) - Math.round(Math.min(1, f.t * 2) * 6);
        if (k < 0.85 || Math.floor(f.t * 8) % 2 === 0) textOutline(g, f.text, x, y, f.t < 0.5 ? PAL.gold : f.c, PAL.void);
      } else if (f.label) {
        // (Outlined, so that it reads over a battle; it rises a little and then holds.)
        const y = sy(f.y) - (f.lift ?? 0) - Math.round(Math.min(1, k * 3) * 6);
        textOutline(g, f.text, sx(f.x) - Math.round(textWidth(f.text, 'tiny') / 2), y, k < 0.75 ? f.c : shade(f.c), PAL.void, 'tiny');
      } else textCenter(g, f.text, sx(f.x), sy(f.y) - (f.lift ?? 0) - Math.round(k * 10), k < 0.7 ? f.c : PAL.dusk, 'tiny');
    }
  }
}
