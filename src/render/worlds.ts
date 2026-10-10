/**
 * Procedural pixel worlds: dithered spheres lit from the upper left. A dark (unclaimed) world uses the
 * four coldest colors; kindling floods it with its terrain colors.
 */
import type { GNode, PlanetType } from '../game/types';
import { Noise3 } from './noise';
import { PAL, rgb, shade } from './palette';
import { BAYER4, ctx2d, makeCanvas } from './pixel';

interface Terrain {
  ramps: string[][];
  bands?: boolean;
  belt?: boolean;
  freq: number;
}

const TERRAIN: Record<PlanetType, Terrain> = {
  terran: { ramps: [[PAL.night, PAL.sea, PAL.teal, PAL.gold, PAL.bone], [PAL.night, PAL.indigo, PAL.sea, PAL.teal, PAL.bone]], freq: 2.2 },
  ocean: { ramps: [[PAL.night, PAL.indigo, PAL.sky, PAL.mist, PAL.bone]], freq: 2.6 },
  desert: { ramps: [[PAL.wine, PAL.ember, PAL.gold, PAL.bone], [PAL.night, PAL.wine, PAL.ember, PAL.gold]], freq: 2.0 },
  ice: { ramps: [[PAL.indigo, PAL.slate, PAL.dusk, PAL.mist, PAL.bone]], freq: 2.4 },
  volcanic: { ramps: [[PAL.void, PAL.wine, PAL.red, PAL.ember], [PAL.void, PAL.night, PAL.wine, PAL.red, PAL.ember]], freq: 3.0 },
  gas: {
    ramps: [[PAL.indigo, PAL.violet, PAL.pink, PAL.bone], [PAL.wine, PAL.ember, PAL.gold, PAL.bone], [PAL.night, PAL.sea, PAL.teal, PAL.mist], [PAL.indigo, PAL.slate, PAL.sky, PAL.mist]],
    bands: true,
    freq: 1.6,
  },
  barren: { ramps: [[PAL.night, PAL.indigo, PAL.slate, PAL.dusk], [PAL.night, PAL.wine, PAL.dusk, PAL.mist]], freq: 3.2 },
  asteroid: { ramps: [[PAL.night, PAL.slate, PAL.dusk, PAL.mist]], belt: true, freq: 3 },
};

export const DARK_RAMP = [PAL.night, PAL.indigo, PAL.slate, PAL.dusk];

const TEX_W = 96;
const TEX_H = 48;
const texCache = new Map<number, Float32Array>();

/** A seamless lat/long texture for one world (values 0..1). */
function texture(n: GNode): Float32Array {
  let t = texCache.get(n.id);
  if (t) return t;
  const T = TERRAIN[n.ptype ?? 'barren'];
  const noise = new Noise3(n.seed);
  t = new Float32Array(TEX_W * TEX_H);
  for (let y = 0; y < TEX_H; y++) {
    const lat = ((y + 0.5) / TEX_H - 0.5) * Math.PI;
    for (let x = 0; x < TEX_W; x++) {
      const lon = ((x + 0.5) / TEX_W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon);
      const py = Math.sin(lat);
      const pz = Math.cos(lat) * Math.sin(lon);
      let v: number;
      if (T.bands) {
        const warp = noise.fbm(px * 1.5 + 7, py * 1.5, pz * 1.5, 3);
        v = 0.5 + 0.5 * Math.sin((py * 5.5 + warp * 2.4) * Math.PI);
      } else {
        v = noise.fbm(px * T.freq + 11, py * T.freq + 3, pz * T.freq, 4);
        v = Math.min(1, Math.max(0, (v - 0.5) * 1.8 + 0.5));
      }
      t[y * TEX_W + x] = v;
    }
  }
  texCache.set(n.id, t);
  return t;
}

function rampFor(n: GNode): string[] {
  const T = TERRAIN[n.ptype ?? 'barren'];
  return T.ramps[n.seed % T.ramps.length];
}

/** The color that best represents a world (for minimaps and tiny sizes). */
export function worldColor(n: GNode, lit: boolean): string {
  if (!lit) return PAL.slate;
  const r = rampFor(n);
  return r[Math.min(r.length - 1, 2)];
}

// ---------------------------------------------------------------------------
// Sprite cache (bounded)
// ---------------------------------------------------------------------------

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Forget every world drawn so far. Worlds are remembered by their number, and each new sector numbers
 * its worlds from zero again, so a new sector must not find the last one's pictures.
 */
export function forgetWorlds() {
  cache.clear();
  texCache.clear();
}

const MAX_CACHE = 600;

function remember(key: string, c: HTMLCanvasElement) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, c);
}

/** Quantize a pixel radius so smooth zooming does not regenerate a sprite every frame. */
export function quantRadius(r: number): number {
  if (r <= 24) return Math.max(1, Math.round(r));
  if (r <= 48) return Math.round(r / 2) * 2;
  return Math.round(r / 4) * 4;
}

/** A world sprite of pixel radius r (canvas size 2r+1). */
export function worldSprite(n: GNode, r: number, lit: boolean): HTMLCanvasElement {
  r = quantRadius(r);
  const key = n.id + '|' + r + '|' + (lit ? 1 : 0);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const T = TERRAIN[n.ptype ?? 'barren'];
  const c = T.belt ? beltSprite(n, r, lit) : sphereSprite(n, r, lit);
  remember(key, c);
  return c;
}

function sphereSprite(n: GNode, r: number, lit: boolean): HTMLCanvasElement {
  const ramp = (lit ? rampFor(n) : DARK_RAMP).map(rgb);
  const N = ramp.length;
  const size = r * 2 + 1;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  const tex = texture(n);
  const rot = ((n.seed % 1000) / 1000) * Math.PI * 2;
  const texK = lit ? 0.42 : 0.26;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - r) / (r + 0.5);
      const dy = (y - r) / (r + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const dz = Math.sqrt(1 - d2);
      const light = Math.max(0, dx * -0.55 + dy * -0.45 + dz * 0.7);
      const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
      const lon = Math.atan2(dx, dz) + rot;
      const u = ((((lon / (Math.PI * 2) + 0.5) % 1) + 1) % 1) * TEX_W;
      const v = (lat / Math.PI + 0.5) * TEX_H;
      const t = tex[Math.min(TEX_H - 1, Math.max(0, v | 0)) * TEX_W + (Math.min(TEX_W - 1, u | 0))];
      const val = Math.max(0, Math.min(0.999, light * 0.72 + t * texK - 0.12));
      const b = BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
      const idx = Math.max(0, Math.min(N - 1, Math.floor(val * N + b * 0.85)));
      const col = ramp[idx];
      const o = (y * size + x) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** An asteroid belt: a loose ring of small rocks. */
function beltSprite(n: GNode, r: number, lit: boolean): HTMLCanvasElement {
  const ramp = lit ? rampFor(n) : DARK_RAMP;
  const size = r * 2 + 1;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  let s = (n.seed >>> 0) || 1;
  const rand = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const count = Math.max(5, Math.round(r * 1.6));
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.25 + rand() * 0.7);
    const x = Math.round(r + Math.cos(a) * d);
    const y = Math.round(r + Math.sin(a) * d * 0.75);
    const big = rand() < 0.35 && r > 6 ? 2 : 1;
    const lightSide = Math.cos(a) < 0 || Math.sin(a) < 0;
    g.fillStyle = ramp[Math.min(ramp.length - 1, lightSide ? 2 : 1)];
    g.fillRect(x, y, big, big);
    if (big > 1) {
      g.fillStyle = ramp[Math.min(ramp.length - 1, 3)];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Kindle dissolve: masks that reveal pixels in Bayer order
// ---------------------------------------------------------------------------

const maskCache: HTMLCanvasElement[] = [];
function mask(level: number): HTMLCanvasElement {
  if (!maskCache.length) {
    for (let f = 0; f <= 16; f++) {
      const m = makeCanvas(4, 4);
      const mg = ctx2d(m);
      mg.fillStyle = '#fff';
      for (let i = 0; i < 16; i++) if (BAYER4[i] < f) mg.fillRect(i % 4, (i / 4) | 0, 1, 1);
      maskCache.push(m);
    }
  }
  return maskCache[Math.max(0, Math.min(16, level))];
}

const blend = makeCanvas(8, 8);
const blendG = ctx2d(blend);

/** Draw a world mid-kindle: p = 0 (dark) .. 1 (lit), dissolving in ordered-dither steps. */
export function drawWorldBlend(g: CanvasRenderingContext2D, n: GNode, r: number, x: number, y: number, p: number) {
  const dark = worldSprite(n, r, false);
  const lit = worldSprite(n, r, true);
  if (p <= 0) return g.drawImage(dark, x, y);
  if (p >= 1) return g.drawImage(lit, x, y);
  g.drawImage(dark, x, y);
  if (blend.width < lit.width || blend.height < lit.height) {
    blend.width = Math.max(blend.width, lit.width);
    blend.height = Math.max(blend.height, lit.height);
    blendG.imageSmoothingEnabled = false;
  }
  blendG.clearRect(0, 0, blend.width, blend.height);
  blendG.globalCompositeOperation = 'source-over';
  blendG.drawImage(lit, 0, 0);
  blendG.globalCompositeOperation = 'destination-in';
  blendG.fillStyle = blendG.createPattern(mask(Math.floor(p * 17)), 'repeat')!;
  blendG.fillRect(0, 0, lit.width, lit.height);
  blendG.globalCompositeOperation = 'source-over';
  g.drawImage(blend, 0, 0, lit.width, lit.height, x, y, lit.width, lit.height);
}

// ---------------------------------------------------------------------------
// Stars and special sites
// ---------------------------------------------------------------------------

/** A star with a dithered corona. Returns a canvas centered on the star. */
export function starSprite(r: number, color: string): HTMLCanvasElement {
  r = quantRadius(r);
  const key = 'star|' + r + '|' + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = Math.ceil(r * 1.9);
  const size = h * 2 + 1;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const mid = color;
  const edge = color === PAL.bone || color === PAL.mist ? PAL.gold : shade(color);
  const glow = color === PAL.sky || color === PAL.mist ? PAL.slate : PAL.wine;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - h, y - h) / Math.max(1, r);
      let col: string | null = null;
      if (d < 0.5) col = PAL.bone;
      else if (d < 0.8) col = mid;
      else if (d < 1) col = edge;
      else if (d < 1.9 && BAYER4[(y & 3) * 4 + (x & 3)] / 16 < ((1.9 - d) / 0.9) * 0.5) col = d < 1.3 ? edge : glow;
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  remember(key, c);
  return c;
}

/** Swirling nebula used for anomalies and the Maw. `frame` animates (0..7). */
export function swirlSprite(r: number, ramp: string[], seed: number, frame: number): HTMLCanvasElement {
  r = quantRadius(r);
  const key = 'swirl|' + r + '|' + ramp.join(',') + '|' + seed + '|' + frame;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = r * 2 + 1;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const noise = new Noise3(seed);
  const spin = (frame / 8) * Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - r) / (r + 0.5);
      const dy = (y - r) / (r + 0.5);
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const a = Math.atan2(dy, dx) + spin + d * 3;
      const v = noise.fbm(Math.cos(a) * d * 2 + 5, Math.sin(a) * d * 2, 1.3, 3) * (1 - d * 0.85) * 1.6;
      const b = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
      const idx = Math.floor(v * ramp.length + b - 0.5);
      if (idx < 0) continue;
      g.fillStyle = ramp[Math.min(ramp.length - 1, idx)];
      g.fillRect(x, y, 1, 1);
    }
  }
  remember(key, c);
  return c;
}

export const ANOMALY_RAMP = [PAL.indigo, PAL.violet, PAL.pink, PAL.bone];
export const MAW_RAMP = [PAL.wine, PAL.violet, PAL.pink, PAL.bone];
export const MAW_DORMANT_RAMP = [PAL.night, PAL.indigo, PAL.wine, PAL.violet];
