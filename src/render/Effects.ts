/**
 * Pixel effects: sparks, debris, expanding rings, beam flashes and floating text. Purely visual: all
 * randomness here uses Math.random, never the simulation RNG.
 */
import type { Fx } from '../game/types';
import type { Camera } from './Camera';
import { textCenter } from './font';
import { PAL, light, shade } from './palette';
import { line, ring, type Ctx } from './pixel';

interface Spark {
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
}

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
  t: number;
  dur: number;
  text: string;
  c: string;
}

interface Flash {
  x: number;
  y: number;
  t: number;
  dur: number;
  r: number;
  c: string;
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
  /** Screen shake amount in pixels. It wears off in real time, in `Renderer.render`, not with the game. */
  shake = 0;

  clear() {
    this.sparks.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this.floaters.length = 0;
    this.flashes.length = 0;
    this.waves.length = 0;
    this.shake = 0;
  }

  private burst(x: number, y: number, n: number, speed: number, life: number, cols: string[], big = false) {
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
      if ('node' in f && f.node >= 0 && !visible(f.node)) continue;
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
          if (f.shield) {
            if (Math.random() < 0.35) {
              const ox = Math.cos(f.ang) * f.r;
              const oy = Math.sin(f.ang) * f.r;
              this.rings.push({ x: f.x + ox * 0.3, y: f.y + oy * 0.3, r0: 1, r1: 3, t: 0, dur: 0.18, c: PAL.sky, world: false, dotted: true });
            }
          } else {
            this.burst(f.x + Math.cos(f.ang) * f.r * 0.6, f.y + Math.sin(f.ang) * f.r * 0.6, 2, 80, 0.3, [PAL.gold, PAL.ember]);
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
          this.floaters.push({ x: f.x, y: f.y, t: 0, dur: 1.6, text: f.text, c: f.color });
          break;
        case 'ability':
          if (!near(f.x, f.y, f.r)) break;
          this.rings.push({ x: f.x, y: f.y, r0: 10, r1: f.r, t: 0, dur: 0.6, c: f.color, world: true, dotted: true });
          this.burst(f.x, f.y, 10, 90, 0.5, [f.color, light(f.color)]);
          break;
      }
    }
  }

  /** Kindle / capture bursts need the node position: the renderer registers it. */
  nodePos: (node: number) => { x: number; y: number; r: number } | null = () => null;

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
  }

  draw(g: Ctx, cam: Camera, ox: number, oy: number) {
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
      g.fillRect(sx(f.x) - r, sy(f.y) - r, r * 2 + 1, r * 2 + 1);
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.dur;
      const rad = (r.r0 + (r.r1 - r.r0) * k) * (r.world ? z : 1);
      if (rad > 600) continue;
      ring(g, sx(r.x), sy(r.y), Math.max(1, rad), k < 0.25 ? PAL.bone : r.c, r.dotted || k > 0.7 ? 2 : 1);
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
      const k = f.t / f.dur;
      textCenter(g, f.text, sx(f.x), sy(f.y) - Math.round(k * 10), k < 0.7 ? f.c : PAL.dusk, 'tiny');
    }
  }
}
