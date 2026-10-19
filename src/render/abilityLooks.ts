/**
 * How the abilities are seen (1.26): the one place that knows each one's look. A cast says who cast it,
 * what it was and what it touched, in a shape of its own, so that two abilities of one colour (a Missile
 * Barrage and an Ember Lance, both ember) are not one thing; and what an ability leaves on a ship is
 * drawn on it for exactly as long as it lasts, as a Gravity Snare's ring always was. Purely visual:
 * nothing here is read by the simulation, and its randomness is Math.random's.
 *
 * - A cast (`castLook`): a ring closes on the ship that cast it, as on a world kindled, and its outline
 *   lights in the ability's colour; its reach runs out two pixels wide and ticks each ship it touches as
 *   it comes to it; what it says rises over it in its house's colour ("SNARED 6"); then its own shape.
 * - Marks on ships (`drawMarksUnder`, `drawMarksOver`): set by a cast, and by a ship going over.
 * - Lasting marks (`LASTING`, `drawLasting`): what an ability leaves, for as long as it is there.
 * - The Barrage's missiles (`drawMissile`): a fan out of the ship, and trails that cool.
 */
import { ABILITY_BY_ID, WAGER_TIME } from '../game/data/abilities';
import type { Fx, Projectile, Unit } from '../game/types';
import type { Effects, Mark } from './Effects';
import { light, PAL, shade } from './palette';
import { ring, type Ctx } from './pixel';
import { shipSprite, silhouette } from './sprites';

type Cast = Extract<Fx, { k: 'ability' }>;
type Convert = Extract<Fx, { k: 'convert' }>;

/** Seconds an ability's reach takes to run out to its edge. */
export const REACH_TIME = 0.9;

/** A cast: who, what, on whom; then its own shape. */
export function castLook(fx: Effects, f: Cast) {
  // Who: a ring closes on the ship that cast it, as on a world kindled, and its outline lights up.
  fx.rings.push({ x: f.x, y: f.y, r0: f.size * 3 + 14, r1: f.size + 2, t: 0, dur: 0.3, c: f.color, world: true, dotted: false });
  fx.mark(f.by, { kind: 'lit', t: 0, dur: 0.4, c: f.color });
  fx.burst(f.x, f.y, 10, 90, 0.5, [f.color, light(f.color)]);
  // On whom: the reach runs out, two pixels wide (the Hollow's pulse three), ticking each ship it comes to.
  // (A Strike Wing touches nothing: no reach, and no ring at all round the ship but the one that lights it,
  // so that it is never taken for a Gravity Snare's, the ring of a ship that is held. A House Power that
  // reaches places, not ships in reach, has its own shape for them below.)
  const reach = f.id !== 'strikewing' && (!ABILITY_BY_ID[f.id]?.power || f.id === 'conversion' || f.id === 'wager');
  if (reach) {
    fx.rings.push({ x: f.x, y: f.y, r0: f.size, r1: f.r, t: 0, dur: REACH_TIME, c: f.color, world: true, dotted: false, w: f.id === 'voidpulse' ? 3 : 2 });
    for (const id of f.on) {
      const p = id === f.by ? null : fx.unitPos(id);
      if (!p) continue;
      const delay = Math.min(1, Math.hypot(p.x - f.x, p.y - f.y) / Math.max(1, f.r)) * REACH_TIME;
      fx.mark(id, { kind: 'tick', t: -delay, dur: 0.2, c: f.color });
    }
  }
  // What: its words over it, in its house's colour.
  if (f.says) fx.say(f.x, f.y, f.says, f.house, { lift: 12 + Math.round(f.size * 0.3), dur: 1.5, label: true });
  // Its own shape.
  switch (f.id) {
    case 'nanite':
      // Motes pour out to every ship it mends, and stay on them as long as the mending lasts (LASTING.heal).
      for (const id of f.on) {
        if (id === f.by) continue;
        for (let i = 0; i < 3; i++) fx.motes.push({ x: f.x, y: f.y, to: id, t: -i * 0.09, dur: 0.55 + Math.random() * 0.2, c: f.color, bend: (Math.random() - 0.5) * 0.7 });
      }
      break;
    case 'strikewing':
      // The six go out in a fan: a spray of violet and its shade streaking out of the ship along the way each
      // Fighter is launched, and each on its trail.
      for (const id of f.on) {
        const p = fx.unitPos(id);
        fx.mark(id, { kind: 'trail', t: 0, dur: 2.2, c: f.color });
        if (!p) continue;
        for (let i = 0; i < 4; i++) {
          const v = 160 + i * 45;
          const l = 0.3 + i * 0.05;
          const c = i % 2 ? shade(f.color) : f.color;
          fx.sparks.push({ x: f.x, y: f.y, vx: Math.cos(p.a) * v, vy: Math.sin(p.a) * v, life: l, max: l, c, c2: shade(f.color), big: false });
        }
      }
      break;
    case 'emp':
      // The ships it drains crackle as the burst comes to them.
      for (const id of f.on) {
        const p = fx.unitPos(id);
        if (!p) continue;
        const delay = Math.min(1, Math.hypot(p.x - f.x, p.y - f.y) / Math.max(1, f.r)) * REACH_TIME;
        fx.mark(id, { kind: 'crackle', t: -delay, dur: 1.1, c: f.color });
      }
      break;
    case 'phaselance':
      // A beam held from the ship to its mark, the mark scorched in ember, and what it took over it.
      if (f.to) {
        fx.lances.push({ x1: f.x, y1: f.y, x2: f.to.x, y2: f.to.y, t: 0, dur: 0.42 });
        fx.mark(f.to.id, { kind: 'scorch', t: 0, dur: 0.35, c: PAL.ember });
        fx.burst(f.to.x, f.to.y, 14, 140, 0.5, [PAL.bone, PAL.gold, PAL.ember, PAL.wine]);
        fx.say(f.to.x, f.to.y, `-${Math.round(f.to.dmg)}`, PAL.ember, { lift: 14, dur: 1.3, num: true, label: true });
      }
      break;
    case 'barrage':
      // (The volley is in the missiles themselves: drawMissile.)
      fx.burst(f.x, f.y, 8, 120, 0.4, [PAL.bone, PAL.gold, PAL.ember]);
      break;
    // The House Powers (1.27).
    case 'dawn':
      // Its light runs out from the Ark's world along the starlanes to each world it kindles (each world's own
      // kindling is its 'capture').
      for (const id of f.at ?? []) between(fx, f.node, id, { t: 0, dur: 0.6, hold: 0.9, c: f.color, wide: true });
      break;
    case 'callarms':
      // From every Forge that answers, a line runs to the Ark's world, and the Forge rings as its ships set out.
      for (const id of f.at ?? []) {
        const n = fx.nodePos(id);
        if (!n) continue;
        if (id !== f.node) between(fx, id, f.node, { t: 0, dur: 0.7, hold: 0.7, c: f.color });
        fx.rings.push({ x: n.x, y: n.y, r0: n.r, r1: n.r * 2.2, t: 0, dur: 0.6, c: f.color, world: true, dotted: false, w: 2 });
      }
      break;
    case 'wayfinder':
      // The new starlane drawn out, slowly, from the Ark's world to the far one, which rings as it is reached.
      for (const id of f.at ?? []) {
        const n = fx.nodePos(id);
        if (!n) continue;
        between(fx, f.node, id, { t: 0, dur: 1.1, hold: 1.2, c: f.color, wide: true });
        fx.rings.push({ x: n.x, y: n.y, r0: n.r * 2.4, r1: n.r, t: -1.0, dur: 0.5, c: f.color, world: true, dotted: false, w: 2 });
      }
      break;
    case 'mindtheft':
      // A thread from the Ark to the Ark it reads, and what it read rising off it.
      for (const id of f.on) {
        fx.threads.push({ by: f.by, x: f.x, y: f.y, to: id, t: 0, dur: 1.2, c: f.color });
        fx.mark(id, { kind: 'notes', t: -0.3, dur: 1.0, c: f.color });
      }
      break;
    case 'wager':
      // The coin, thrown up over the world and turning until it lands: its face is how it lands.
      fx.coins.push({ x: f.x, y: f.y, t: 0, dur: WAGER_TIME, heads: !!f.heads, c: f.color });
      break;
  }
}

/** A power's light from one place to another, from the edge of the one to the edge of the other, as a starlane is drawn. */
function between(fx: Effects, a: number, b: number, o: { t: number; dur: number; hold: number; c: string; wide?: boolean }) {
  const A = fx.nodePos(a);
  const B = fx.nodePos(b);
  if (!A || !B) return;
  const d = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / d;
  const uy = (B.y - A.y) / d;
  fx.streaks.push({ x1: A.x + ux * A.r, y1: A.y + uy * A.r, x2: B.x - ux * B.r, y2: B.y - uy * B.r, ...o });
}

/**
 * A ship goes over (Conversion): a thread runs to it from the ship that called it; as it arrives, the
 * ship's colour is wiped from its old house's to its new one's, top to bottom under a scan line; then a
 * ring closes on it and notes rise off it.
 */
export function convertLook(fx: Effects, f: Convert) {
  const caller = f.by >= 0 ? fx.unitPos(f.by) : null;
  if (caller) fx.threads.push({ by: f.by, x: caller.x, y: caller.y, to: f.id, t: 0, dur: 0.75, c: f.to });
  const wait = caller ? 0.3 : 0;
  fx.mark(f.id, { kind: 'wipe', t: -wait, dur: 0.55, c: f.to, from: f.from });
  fx.mark(f.id, { kind: 'notes', t: -wait - 0.45, dur: 0.9, c: f.to });
  fx.rings.push({ x: f.x, y: f.y, r0: (f.r + 8) * 1.6, r1: (f.r + 8) * 0.4, t: -wait - 0.4, dur: 0.45, c: f.to, world: true, dotted: false });
}

/** A ship's sprite and where it stands: what a mark is drawn round. */
export interface Drawn {
  u: Unit;
  x: number;
  y: number;
  /** Its facing (sprites.ts), its era, its colour now, its sprite's size. */
  dir: number;
  era: number;
  color: string;
  w: number;
  h: number;
  /** Seconds, for what pulses and turns; and a frame that flickers. */
  time: number;
  flick: boolean;
}

/** The outline of a sprite, a pixel round it, in a colour. */
function outline(ctx: Ctx, d: Drawn, c: string) {
  const s = silhouette(d.u.type, c, d.dir, d.era);
  const sx = d.x - (s.width >> 1);
  const sy = d.y - (s.height >> 1);
  ctx.drawImage(s, sx - 1, sy);
  ctx.drawImage(s, sx + 1, sy);
  ctx.drawImage(s, sx, sy - 1);
  ctx.drawImage(s, sx, sy + 1);
}

/** Marks drawn under the ship: its outline lit by its own cast, or ticked by one that touched it. */
export function drawMarksUnder(ctx: Ctx, d: Drawn, marks: Mark[]) {
  for (const m of marks) {
    if (m.t < 0) continue;
    if (m.kind === 'lit') outline(ctx, d, m.c);
    else if (m.kind === 'tick') outline(ctx, d, m.c);
  }
}

/** Marks drawn over the ship: going over to another house, crackling, scorched, trailing. */
export function drawMarksOver(ctx: Ctx, d: Drawn, marks: Mark[]) {
  for (const m of marks) {
    const k = m.t / m.dur;
    switch (m.kind) {
      case 'wipe': {
        // Its old colour, all of it until the thread comes; then wiped away from the top, a scan line in bone.
        const s = shipSprite(d.u.type, m.from ?? d.color, d.dir, d.flick, d.era);
        const left = Math.round(d.x - s.width / 2);
        const top = Math.round(d.y - s.height / 2);
        const cut = m.t < 0 ? 0 : Math.round(s.height * k);
        if (cut < s.height) ctx.drawImage(s, 0, cut, s.width, s.height - cut, left, top + cut, s.width, s.height - cut);
        if (m.t >= 0) {
          ctx.fillStyle = PAL.bone;
          ctx.fillRect(left - 1, top + cut, s.width + 2, 1);
        }
        break;
      }
      case 'notes': {
        // Two notes rise off it, the house's colour and its light, and are gone.
        if (m.t < 0) break;
        for (let i = 0; i < 2; i++) {
          const nx = Math.round(d.x + (i ? 3 : -4) + Math.sin(m.t * 6 + i * 2) * 1.5);
          const ny = Math.round(d.y - d.h / 2 - 3 - k * 12 - i * 3);
          if (k > 0.75 && d.flick) continue;
          ctx.fillStyle = i ? light(m.c) : m.c;
          ctx.fillRect(nx, ny, 1, 3);
          ctx.fillRect(nx - 1, ny + 2, 1, 1);
          ctx.fillRect(nx + 1, ny, 1, 1);
        }
        break;
      }
      case 'crackle': {
        // Its shields drained: short zigzags across it, never twice alike.
        if (m.t < 0 || d.flick) break;
        const n = 3;
        for (let i = 0; i < n; i++) {
          let x = Math.round(d.x - d.w / 2 + Math.random() * d.w);
          let y = Math.round(d.y - d.h / 2 + Math.random() * d.h);
          ctx.fillStyle = i === 0 ? PAL.bone : m.c;
          for (let j = 0; j < 3; j++) {
            ctx.fillRect(x, y, 1, 1);
            x += Math.random() < 0.5 ? -1 : 1;
            y += 1;
          }
        }
        break;
      }
      case 'scorch':
        // Struck by the lance: its whole shape in ember, every other frame (never white).
        if (d.flick) ctx.drawImage(silhouette(d.u.type, m.c, d.dir, d.era), d.x - Math.ceil(d.w / 2), d.y - Math.ceil(d.h / 2));
        break;
      case 'trail':
        drawTrail(ctx, d.x, d.y, d.u.a, m.c, k);
        break;
    }
  }
}

/** A short trail behind a ship on its way: its colour, then its shade; shorter as it ends. */
export function drawTrail(ctx: Ctx, x: number, y: number, a: number, c: string, k: number) {
  const cols = [c, c, shade(c), shade(c)];
  const n = k < 0.6 ? 4 : k < 0.8 ? 3 : k < 0.9 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cols[i];
    ctx.fillRect(Math.round(x - Math.cos(a) * 2 * (i + 1)), Math.round(y - Math.sin(a) * 2 * (i + 1)), 1, 1);
  }
}

/**
 * What an ability leaves on a ship, drawn on it for exactly as long as it is there (data/abilities.ts
 * `leaves`). A test holds every `leaves` to a mark here.
 */
export const LASTING: Record<'aegis' | 'heal' | 'overdrive' | 'rally' | 'snare', (ctx: Ctx, d: Drawn) => void> = {
  // Aegis Field: a gold bracket at each corner of the ship, its light coming round them in turn.
  aegis(ctx, d) {
    const hx = Math.ceil(d.w / 2) + 2;
    const hy = Math.ceil(d.h / 2) + 2;
    const lit = Math.floor(d.time * 4 + d.u.id) % 4;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
      ctx.fillStyle = i === lit ? light(PAL.gold) : PAL.gold;
      const cx = Math.round(d.x + sx * hx);
      const cy = Math.round(d.y + sy * hy);
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillRect(cx - sx, cy, 1, 1);
      ctx.fillRect(cx, cy - sy, 1, 1);
    });
  },
  // Mending (a Nanite Cloud, Repair Drones): three motes circle it, teal and mist (mist, so that they show on
  // the Wayfarers' own teal ships).
  heal(ctx, d) {
    const r = Math.max(d.w, d.h) / 2 + 3;
    const a = d.time * 2.6 + d.u.id;
    for (let i = 0; i < 3; i++) {
      const b = a + (i * Math.PI * 2) / 3;
      ctx.fillStyle = (Math.floor(d.time * 6) + i) % 2 ? PAL.mist : PAL.teal;
      ctx.fillRect(Math.round(d.x + Math.cos(b) * r), Math.round(d.y + Math.sin(b) * r * 0.6), 1, 1);
    }
  },
  // Overdrive: its guns spark pink at its nose.
  overdrive(ctx, d) {
    if (d.flick) return;
    const r = Math.max(d.w, d.h) / 2 + 1;
    const x = Math.round(d.x + Math.cos(d.u.a) * r);
    const y = Math.round(d.y + Math.sin(d.u.a) * r);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = light(PAL.pink);
    ctx.fillRect(x + Math.round(Math.cos(d.u.a)), y + Math.round(Math.sin(d.u.a)), 1, 1);
  },
  // Rally Cry: a gold chevron over it, over its bars.
  rally(ctx, d) {
    if (Math.floor(d.time * 2 + d.u.id * 0.3) % 4 === 3) return;
    const x = Math.round(d.x);
    const y = Math.round(d.y - Math.ceil(Math.max(d.w, d.h) / 2) - 8);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x - 1, y + 1, 1, 1);
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x - 2, y + 2, 1, 1);
    ctx.fillRect(x + 2, y + 2, 1, 1);
  },
  // Gravity Snare (it cannot jump): ringed in violet, so the hold can be seen.
  snare(ctx, d) {
    ring(ctx, d.x, d.y, Math.ceil(Math.max(d.w, d.h) / 2) + 2, d.flick ? PAL.violet : PAL.pink, 2);
  },
};

/** Everything an ability has left on a ship now. */
export function drawLasting(ctx: Ctx, d: Drawn) {
  if (d.u.snare > 0) LASTING.snare(ctx, d);
  for (const b of d.u.buffs) {
    const draw = (LASTING as Record<string, ((ctx: Ctx, d: Drawn) => void) | undefined>)[b.id];
    if (draw && b.t > 0) draw(ctx, d);
  }
}

/** How much of a ship's hull is still to be mended by what is mending it (for its bar). */
export function mendingLeft(u: Unit): number {
  let left = 0;
  for (const b of u.buffs) if (b.id === 'heal') left += b.v * Math.max(0, b.t);
  return left;
}

/**
 * A missile of a Barrage: out of the ship in a fan, each bowing to its own side before it turns on its
 * mark (so a volley reads as the twelve it is), a bone head and a trail that cools gold, ember, wine.
 * Only where it is drawn moves: the missile is where the game has it, the bow gone by its second half second.
 */
export function drawMissile(ctx: Ctx, p: Projectile, x: number, y: number, big: boolean) {
  const age = 5 - p.life;
  const dx = p.x - p.px;
  const dy = p.y - p.py;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const bow = Math.sin(Math.min(1, age / 0.6) * Math.PI) * p.wob * 7;
  const hx = Math.round(x - uy * bow);
  const hy = Math.round(y + ux * bow);
  const s = big ? 2 : 1;
  const cols = [PAL.gold, PAL.ember, PAL.wine];
  for (let i = cols.length; i >= 1; i--) {
    ctx.fillStyle = cols[i - 1];
    ctx.fillRect(Math.round(hx - ux * i * s * 1.5), Math.round(hy - uy * i * s * 1.5), 1, 1);
  }
  ctx.fillStyle = PAL.bone;
  ctx.fillRect(hx, hy, s, 1);
  ctx.fillRect(hx, hy, 1, s);
}
