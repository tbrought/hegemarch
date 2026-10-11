/**
 * Pixel primitives for a 1:1 low-resolution canvas. Everything snaps to whole pixels and uses only
 * flat palette colors; "transparency" is done with ordered (Bayer) dithering.
 */

export type Ctx = CanvasRenderingContext2D;

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return g;
}

export function rect(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(g: Ctx, x: number, y: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function frame(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  g.fillStyle = c;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
}

/** A box with notched (cut) corners. */
export function box(g: Ctx, x: number, y: number, w: number, h: number, fill: string | null, border: string) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  if (fill) {
    g.fillStyle = fill;
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  g.fillStyle = border;
  g.fillRect(x + 1, y, w - 2, 1);
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
}

/** A raised UI panel: notched outer border, a lighter top-left inner edge. */
export function panel(g: Ctx, x: number, y: number, w: number, h: number, fill: string, border: string, hi?: string) {
  box(g, x, y, w, h, fill, border);
  if (hi) {
    g.fillStyle = hi;
    g.fillRect(Math.round(x) + 2, Math.round(y) + 1, Math.round(w) - 4, 1);
  }
}

/** Bresenham line. `step` > 1 draws a dotted line; `phase` scrolls the dots. */
export function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, c: string, step = 1, phase = 0) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let i = 0;
  g.fillStyle = c;
  for (let guard = 0; guard < 8000; guard++) {
    if (step <= 1 || ((((i + phase) % step) + step) % step) === 0) g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    i++;
  }
}

/** Clip a segment to a rectangle (Liang-Barsky). Returns null when fully outside. */
export function clipSeg(x0: number, y0: number, x1: number, y1: number, minX: number, minY: number, maxX: number, maxY: number): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/** Midpoint circle outline. `step` > 1 makes it dotted. */
export function ring(g: Ctx, cx: number, cy: number, r: number, c: string, step = 1) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  if (r < 1) {
    px(g, cx, cy, c);
    return;
  }
  g.fillStyle = c;
  let x = r;
  let y = 0;
  let err = 1 - r;
  let i = 0;
  while (x >= y) {
    if (step <= 1 || i % step === 0) {
      g.fillRect(cx + x, cy + y, 1, 1);
      g.fillRect(cx + y, cy + x, 1, 1);
      g.fillRect(cx - y, cy + x, 1, 1);
      g.fillRect(cx - x, cy + y, 1, 1);
      g.fillRect(cx - x, cy - y, 1, 1);
      g.fillRect(cx - y, cy - x, 1, 1);
      g.fillRect(cx + y, cy - x, 1, 1);
      g.fillRect(cx + x, cy - y, 1, 1);
    }
    y++;
    i++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

/** Filled disc. */
export function disc(g: Ctx, cx: number, cy: number, r: number, c: string) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.max(0, Math.round(r));
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r + r - y * y));
    g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Ordered dithering
// ---------------------------------------------------------------------------

const ditherCache = new Map<string, CanvasPattern>();
let ditherHost: Ctx | null = null;

/** A repeating 4x4 pattern of `c` where Bayer < level (0..16). Anchored to the canvas origin. */
export function ditherPattern(g: Ctx, c: string, level: number): CanvasPattern {
  const lv = Math.max(0, Math.min(16, Math.round(level)));
  const key = c + '|' + lv;
  let p = ditherCache.get(key);
  if (p) return p;
  const t = makeCanvas(4, 4);
  const tg = ctx2d(t);
  tg.fillStyle = c;
  for (let i = 0; i < 16; i++) if (BAYER4[i] < lv) tg.fillRect(i % 4, (i / 4) | 0, 1, 1);
  if (!ditherHost) ditherHost = g;
  p = ditherHost.createPattern(t, 'repeat')!;
  ditherCache.set(key, p);
  return p;
}

/** Cover a rectangle with a dithered tint: level 8 = every other pixel. */
export function dither(g: Ctx, x: number, y: number, w: number, h: number, c: string, level = 8) {
  if (level <= 0) return;
  if (level >= 16) return rect(g, x, y, w, h, c);
  g.fillStyle = ditherPattern(g, c, level);
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Horizontal fill bar: background, fill fraction, optional border. */
/**
 * `min`: the least the filled part is drawn while there is anything at all. One pixel by default, so
 * that "nearly gone" never reads as "gone"; 0 for a bar that should look empty when it nearly is (a
 * shield that is shot down recharges a trickle at once, and must not seem to hold).
 */
export function bar(g: Ctx, x: number, y: number, w: number, h: number, frac: number, fill: string, back: string, border?: string, min = 1) {
  x = Math.round(x);
  y = Math.round(y);
  rect(g, x, y, w, h, back);
  const f = Math.max(0, Math.min(1, frac));
  const fw = Math.max(f > 0 ? min : 0, Math.round(w * f));
  if (fw > 0) rect(g, x, y, fw, h, fill);
  if (border) frame(g, x - 1, y - 1, w + 2, h + 2, border);
}
