/**
 * Pixel effects of the dialogs: a dashed frame for an empty place, a sparkle and sparkles round a
 * card, motes of light rising, and the running lights of a pad something is beamed in on (the Boon
 * deal's first, in modals/draft.ts; a ship's level-up uses them too). And the kindling ring: a ring of
 * light filling round a thing, as round a world a seed ship kindles, and the sparks it throws off as it
 * closes (a rarer Boon, a level-up, the Ambition, a Boon ready). Nothing here flashes.
 */
import { light, PAL } from '../../render/palette';
import { rect, type Ctx } from '../../render/pixel';

/**
 * Less motion for a player whose computer asks for it: no kindling ring and no sparks flying off round a
 * card, a window, a star or a button (the motes, the lines, the sparkles and the words still come).
 */
export const CALM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A frame whose two colours alternate round it, four pixels at a time: a card's empty place. */
export function dashed(g: Ctx, x: number, y: number, w: number, h: number, a: string, b: string) {
  const per = 2 * (w + h) - 4;
  for (let d = 0; d < per; d++) {
    let px: number;
    let py: number;
    if (d < w) {
      px = x + d;
      py = y;
    } else if (d < w + h - 1) {
      px = x + w - 1;
      py = y + d - w + 1;
    } else if (d < 2 * w + h - 2) {
      px = x + w - 2 - (d - w - h + 1);
      py = y + h - 1;
    } else {
      px = x;
      py = y + h - 2 - (d - 2 * w - h + 2);
    }
    // (The corners stay open, as every frame of the game's.)
    if ((px === x || px === x + w - 1) && (py === y || py === y + h - 1)) continue;
    g.fillStyle = (d >> 2) % 2 ? a : b;
    g.fillRect(px, py, 1, 1);
  }
}

/** A sparkle: a white point with four arms that grow and shrink, the tips in a colour. */
export function sparkle(g: Ctx, x: number, y: number, arm: number, tip: string) {
  x = Math.round(x);
  y = Math.round(y);
  for (let k = 1; k <= arm; k++) {
    const c = k === arm ? tip : PAL.bone;
    rect(g, x + k, y, 1, 1, c);
    rect(g, x - k, y, 1, 1, c);
    rect(g, x, y + k, 1, 1, c);
    rect(g, x, y - k, 1, 1, c);
  }
  rect(g, x, y, 1, 1, PAL.bone);
}

/** Sparkles round a card, one after another from the moment it is all there: the corners, then (a Legendary) the sides and the top. */
export function sparkles(g: Ctx, x: number, y: number, w: number, h: number, since: number, tier: number, col: string) {
  const spots: [number, number][] = [[x - 3, y - 3], [x + w + 2, y + h + 2], [x + w + 2, y - 3], [x - 3, y + h + 2],
    [x + w / 2, y - 5], [x - 5, y + h / 2], [x + w + 4, y + h / 2], [x + w / 2, y + h + 4], [x + w * 0.25, y - 4], [x + w * 0.75, y - 4]];
  const count = tier >= 3 ? spots.length : 4;
  const rounds = tier >= 3 ? 2 : 1;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < count; i++) {
      const t = since - (r * count + i) * 0.045;
      if (t < 0 || t >= 0.25) continue;
      const arm = [1, 2, 3, 2, 1][Math.floor((t / 0.25) * 5)];
      sparkle(g, spots[(i * 3 + r) % count][0], spots[(i * 3 + r) % count][1], arm, col);
    }
  }
}

/** A number in [0, 1) from a number: for things that should look scattered and be the same every frame. */
export const scatter = (a: number) => {
  const s = Math.sin(a * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Motes of light rising through a place and twinkling, white and a card's colour. */
export function motes(g: Ctx, x: number, y: number, w: number, h: number, t: number, n: number, col: string, seed: number) {
  if (h < 4) return;
  for (let j = 0; j < n; j++) {
    const px = x + 3 + Math.floor(scatter(seed * 31 + j) * (w - 6));
    const life = 0.45 + scatter(seed * 17 + j * 5) * 0.4;
    const ph = ((t + scatter(j * 11 + seed) * life) % life) / life;
    const py = y + h - 3 - Math.floor(ph * (h - 6));
    if ((Math.floor(t * 20) + j) % 4 === 0) sparkle(g, px, py, 1, col);
    else rect(g, px, py, 1, 1, j % 2 ? col : PAL.bone);
  }
}

/** The lights of the pad a card is beamed in on: down both its sides, running. */
export function padLines(g: Ctx, x: number, y: number, w: number, h: number, col: string, t: number) {
  const off = Math.floor(t * 40) % 4;
  for (let yy = off; yy < h; yy += 4) {
    rect(g, x + 1, y + yy, 1, 2, col);
    rect(g, x + w - 2, y + yy, 1, 2, col);
  }
}

/** The point `d` pixels round a place's frame, clockwise from the middle of its top edge. */
function roundFrame(x: number, y: number, w: number, h: number, d: number): [number, number] {
  const per = 2 * (w + h);
  d = (((d + w / 2) % per) + per) % per;
  if (d < w) return [x + d, y];
  if ((d -= w) < h) return [x + w - 1, y + d];
  if ((d -= h) < w) return [x + w - 1 - d, y + h - 1];
  return [x, y + h - 1 - (d - w)];
}

/** The kindling ring round a place's frame, `k` of the way round (0 to 1, from the middle of its top, clockwise), its head bright while it fills. */
export function arcFrame(g: Ctx, x: number, y: number, w: number, h: number, k: number, col: string) {
  if (k <= 0) return;
  const len = Math.floor(Math.min(1, k) * 2 * (w + h));
  for (let d = 0; d < len; d++) {
    const [px, py] = roundFrame(x, y, w, h, d);
    rect(g, px, py, 1, 1, len - d <= 3 && k < 1 ? light(col) : col);
  }
}

/** The kindling ring round a point, `k` of the way round, from its top. */
export function arcRound(g: Ctx, x: number, y: number, r: number, k: number, col: string) {
  if (k <= 0) return;
  const n = Math.max(12, Math.round(r * 6.3));
  const m = Math.floor(Math.min(1, k) * n);
  for (let j = 0; j < m; j++) {
    const a = -Math.PI / 2 + (j / n) * Math.PI * 2;
    rect(g, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1, m - j <= 2 && k < 1 ? light(col) : col);
  }
}

/** Sparks flying out off a place's frame as its kindling ring closes, `since` seconds after it did; gone in under two thirds of a second. */
export function sparkOut(g: Ctx, x: number, y: number, w: number, h: number, since: number, n: number, col: string, seed: number) {
  const per = 2 * (w + h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let j = 0; j < n; j++) {
    const life = 0.4 + 0.25 * scatter(seed * 3 + j);
    if (since < 0 || since > life) continue;
    // (Blinking out at the end.)
    if (since > life - 0.12 && Math.floor(since * 20) % 2) continue;
    const [px, py] = roundFrame(x, y, w, h, (j / n) * per + scatter(seed + j) * 6);
    const dx = px - cx;
    const dy = py - cy;
    const m = Math.hypot(dx, dy) || 1;
    const v = 30 + 30 * scatter(seed * 7 + j);
    rect(g, Math.round(px + (dx / m) * v * since), Math.round(py + (dy / m) * v * since), 1, 1, j % 3 === 0 ? PAL.bone : j % 2 ? col : light(col));
  }
}
