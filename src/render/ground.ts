/**
 * The cradle world of an Ages run, seen from above: one dark continent in a dark sea (the lands and
 * the paths between them are always on dry ground), and the settlements on it. Like the worlds of the
 * sector, a land is grey until a house holds it; then its settlement stands in the house's color, and
 * its buildings are those of the house's age.
 */
import type { Game } from '../game/Game';
import type { GNode } from '../game/types';
import { Noise3 } from './noise';
import { PAL, shade } from './palette';
import { ctx2d, ditherPattern, makeCanvas, type Ctx } from './pixel';

export interface Ground {
  canvas: HTMLCanvasElement;
  /** The part of the world the picture covers. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Paint the cradle's land and sea once (it never changes during a run). */
export function buildGround(g: Game): Ground {
  const pad = 900;
  const x0 = g.bounds.minX - pad;
  const y0 = g.bounds.minY - pad;
  const w = g.bounds.maxX - g.bounds.minX + pad * 2;
  const h = g.bounds.maxY - g.bounds.minY + pad * 2;
  const TW = 960;
  const TH = Math.max(64, Math.round((TW * h) / w));
  // How much "land" there is at each point of a coarse grid: high near lands and along paths.
  const CW = 160;
  const CH = Math.max(16, Math.round((CW * h) / w));
  const coarse = new Float32Array(CW * CH);
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const wx = x0 + ((cx + 0.5) / CW) * w;
      const wy = y0 + ((cy + 0.5) / CH) * h;
      let v = 0;
      for (const n of g.nodes) {
        const d = Math.hypot(wx - n.x, wy - n.y);
        v = Math.max(v, 1 - d / (n.well * 1.9));
      }
      for (const l of g.lanes) {
        const a = g.nodes[l.a];
        const b = g.nodes[l.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const k = Math.max(0, Math.min(1, ((wx - a.x) * dx + (wy - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(wx - (a.x + dx * k), wy - (a.y + dy * k));
        v = Math.max(v, 0.62 - d / 900);
      }
      coarse[cy * CW + cx] = v;
    }
  }
  const noise = new Noise3((g.config.seed ^ 0x9e3779b9) >>> 0);
  const canvas = makeCanvas(TW, TH);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(TW, TH);
  const sea = hex(PAL.void);
  const wave = hex(PAL.night);
  const shore = hex(PAL.slate);
  const land = hex(PAL.night);
  const speck = hex(PAL.indigo);
  const field = (tx: number, ty: number): number => {
    // Bilinear sample of the coarse grid, roughened by noise so the coast wanders.
    const fx = Math.max(0, Math.min(CW - 1.001, ((tx + 0.5) / TW) * CW - 0.5));
    const fy = Math.max(0, Math.min(CH - 1.001, ((ty + 0.5) / TH) * CH - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const v =
      coarse[iy * CW + ix] * (1 - ax) * (1 - ay) + coarse[iy * CW + ix + 1] * ax * (1 - ay) + coarse[(iy + 1) * CW + ix] * (1 - ax) * ay + coarse[(iy + 1) * CW + ix + 1] * ax * ay;
    return v + (noise.fbm(tx / 46, ty / 46, 1.7, 4) - 0.5) * 0.34;
  };
  const LAND = 0.2;
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const v = field(tx, ty);
      const r = hash(tx, ty);
      let c = sea;
      if (v >= LAND) {
        // The coast is a thin bright line; inland the ground is dark, flecked with scrub.
        c = v < LAND + 0.022 ? shore : r < 0.07 + (noise.fbm(tx / 18, ty / 18, 9.1, 2) > 0.56 ? 0.16 : 0) ? speck : land;
      } else if (r < 0.012 || (v > LAND - 0.05 && (tx + ty * 2) % 7 === 0 && r < 0.5)) c = wave;
      const i = (ty * TW + tx) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, x0, y0, w, h };
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

// Legend: x = house color (roofs), d = its shade (walls), w = bone (lit windows), e = fire, k = dark (doors),
// m = steel grey (stone), o = dark wood.
/** A dwelling of each age, and the great building at the heart of a Hearth. */
const HOUSES: string[][] = [
  ['.xxx.', 'xxxxx', 'ddkdd'],
  ['xxxxx', 'dddwd', 'dkddd'],
  ['..x..', '.xxx.', 'xxxxx', 'mwmmm', 'mmkmm'],
  ['...m.', '..xm.', '.xxx.', 'xxxxx', 'dwdwd', 'ddkdd'],
  ['.m.....', '.m.xxxx', 'xxxxxxx', 'dwdwdwd', 'ddddddd', 'dkddwdd'],
];
const HEARTHS: string[][] = [
  ['...e...', '..eee..', '.eeeee.', 'mdmdmdm'],
  ['...xxx...', '..xxxxx..', '..ddwdd..', '.xxxxxxx.', '.ddkdddd.', 'xxxxxxxxx'],
  ['m.m.m.m', 'mmmmmmm', 'mxxxxxm', 'mmwmwmm', 'mmmmmmm', 'mmmkmmm', 'mmmkmmm'],
  ['..x.....x..', '.xxx.x.xxx.', 'xxxxxxxxxxx', 'dwdwdwdwdwd', 'dddwdkdwddd', 'ddddkkkdddd'],
  ['...w...', '...m...', '..xxx..', '..dwd..', '..dwd..', '.xxxxx.', '.dwdwd.', '.dwdwd.', 'dddkddd'],
];
/** What stands on a land that no house holds: scrub and standing stones. */
const WILD: string[][] = [
  ['.s.', 'sss', '.i.'],
  ['s', 's', 'i'],
  ['.ss', 'sss', '.i.'],
];

/** A dwelling of an age as an icon (in the letters of `ICONS` in sprites.ts: c is the caller's color). */
export function dwellingIcon(era: number): string[] {
  const to: Record<string, string> = { x: 'c', d: 's', w: 'w', e: 'e', k: 'o', m: 'm', o: 'x' };
  return HOUSES[Math.max(0, Math.min(HOUSES.length - 1, era))].map((row) => [...row].map((ch) => to[ch] ?? '.').join(''));
}

const glyphs = new Map<string, HTMLCanvasElement>();

function glyph(key: string, rows: string[], color: string, flick: boolean): HTMLCanvasElement {
  const k = key + '|' + color + '|' + (flick ? 1 : 0);
  let c = glyphs.get(k);
  if (c) return c;
  c = makeCanvas(rows[0].length, rows.length);
  const g = ctx2d(c);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      let col: string | null = null;
      switch (rows[y][x]) {
        case 'x': col = color; break;
        case 'd': col = shade(color); break;
        case 'w': col = PAL.bone; break;
        case 'e': col = flick ? PAL.gold : PAL.ember; break;
        case 'k': col = PAL.void; break;
        case 'm': col = PAL.mist; break;
        case 'o': col = PAL.wine; break;
        case 's': col = PAL.slate; break;
        case 'i': col = PAL.indigo; break;
      }
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  glyphs.set(k, c);
  return c;
}

/** A dithered disc of light under a held land: the house's ground. */
export function drawHolding(ctx: Ctx, x: number, y: number, r: number, color: string) {
  if (r < 4) return;
  ctx.fillStyle = ditherPattern(ctx, shade(color), 1);
  const rr = Math.round(r);
  for (let yy = -rr; yy <= rr; yy++) {
    const half = Math.floor(Math.sqrt(rr * rr - yy * yy));
    ctx.fillRect(x - half, y + yy, half * 2 + 1, 1);
  }
}

/**
 * The settlement of a land, about `r` pixels across. `era` is the age of the house that holds it (-1: no
 * one does, and only scrub grows here); `lit` (0..1) fades it in as the land is kindled.
 */
export function drawSettlement(ctx: Ctx, n: GNode, x: number, y: number, r: number, o: { era: number; color: string; level: number; hearth: boolean; lit: number; t: number }) {
  const spread = Math.max(3, r * 0.75);
  const at = (i: number, k: number): [number, number] => {
    // Each land keeps its own arrangement.
    const a = hash(n.seed & 0xffff, i * 2) * Math.PI * 2;
    const d = (0.35 + 0.65 * hash(n.seed & 0xffff, i * 2 + 1)) * spread * k;
    return [Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.7)];
  };
  if (o.era < 0 || o.lit < 0.5) {
    const count = r >= 9 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const pic = glyph('wild' + (i % WILD.length), WILD[i % WILD.length], PAL.slate, false);
      const [px, py] = at(i, 1);
      ctx.drawImage(pic, px - (pic.width >> 1), py - (pic.height >> 1));
    }
    return;
  }
  const era = Math.min(o.era, HOUSES.length - 1);
  const flick = Math.floor(o.t * 6) % 2 === 0;
  const house = glyph('house' + era, HOUSES[era], o.color, flick);
  // Up close the buildings are drawn double size.
  const k = r >= 11 ? 2 : 1;
  // Dwellings around the middle: more of them as the land rises in level. They are drawn back to front.
  const count = (o.hearth ? 2 : 1) + o.level + (r >= 12 ? 1 : 0);
  const spots: [number, number][] = [];
  for (let i = 0; i < count; i++) spots.push(at(i + 3, o.hearth ? 1.25 : 1));
  spots.sort((p, q) => p[1] - q[1]);
  const big = o.hearth ? glyph('hearth' + era, HEARTHS[era], o.color, flick) : null;
  let drawnBig = false;
  for (const [px, py] of spots) {
    if (big && !drawnBig && py > y) {
      ctx.drawImage(big, x - ((big.width * k) >> 1), y - ((big.height * k) >> 1) - 1, big.width * k, big.height * k);
      drawnBig = true;
    }
    ctx.drawImage(house, px - ((house.width * k) >> 1), py - ((house.height * k) >> 1), house.width * k, house.height * k);
  }
  if (big && !drawnBig) ctx.drawImage(big, x - ((big.width * k) >> 1), y - ((big.height * k) >> 1) - 1, big.width * k, big.height * k);
}
