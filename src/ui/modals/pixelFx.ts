/**
 * Pixel effects of the dialogs: a dashed frame for an empty place, a sparkle and sparkles round a
 * card, motes of light rising, and the running lights of a pad something is beamed in on. (The Boon
 * deal's first, in modals/draft.ts; a ship's level-up uses them too.)
 */
import { PAL } from '../../render/palette';
import { rect, type Ctx } from '../../render/pixel';

/**
 * No flashing for a player whose computer asks for less motion: a card's face, a window, a button that
 * flashes white stays as it is (the motes, the lines, the sparkles and the words still come).
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
