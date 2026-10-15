/**
 * The story of a decision, coming in: rich text (gains, losses, keywords) laid out as `drawRich` lays
 * it out, and a phrase picked out in gold riding a slow ripple all the while. A scan line in ember sweeps
 * down it, a line every `LINE_GAP`, and each line it passes catches: ember, then gold, then its own
 * colours. Quick, as the game is: a story of two lines is all there in under a quarter of a second.
 */
import { lineHeight, text, textWidth, type FontId } from '../../render/font';
import { PAL } from '../../render/palette';
import { rect, type Ctx } from '../../render/pixel';
import { RICH_DEFAULT, wrapRich, type RichColors } from '../../render/rich';

/** Seconds the scan line takes over a line. */
export const LINE_GAP = 0.09;
/** Seconds a line glows once the scan line has passed it: ember for half, gold for half. */
export const LINE_GLOW = 0.2;

/** How many lines a rich text takes (laid out at a width). */
export function lineCount(s: string, maxW: number, font: FontId = 'main'): number {
  return wrapRich(s, maxW, font).length;
}

/** The moment a text of so many lines that began to come in at `from` is all there. */
export function storyEnd(lines: number, from: number): number {
  return from + Math.max(0, lines) * LINE_GAP;
}

/** The colour of a line `age` seconds after the scan line passed it: ember, then gold, then its own. */
export function lineGlow(age: number, own: string): string {
  return age < LINE_GLOW / 2 ? PAL.ember : age < LINE_GLOW ? PAL.gold : own;
}

/**
 * Draw a story as it stands `t` seconds after it began to come in (`Infinity`: all of it); `clock`
 * runs the ripple. Returns the y below the last line, and how many words are showing.
 */
export function drawStory(g: Ctx, s: string, x: number, y: number, maxW: number, t: number, clock: number, colors: Partial<RichColors> = {}, font: FontId = 'main'): { y: number; shown: number } {
  const c = { ...RICH_DEFAULT, ...colors };
  const lh = lineHeight(font);
  const space = textWidth(' ', font) + 1;
  const top = y;
  let row = 0;
  let shown = 0;
  for (const line of wrapRich(s, maxW, font)) {
    // (A line is there once the scan line has passed it, and glows a moment.)
    const age = t - (row + 1) * LINE_GAP;
    let cx = x;
    if (age >= 0) {
      const hot = age < LINE_GLOW;
      line.forEach((word, k) => {
        if (k) cx += space;
        const wx = cx;
        cx += textWidth(word.map((q) => q.text).join(''), font) + 1;
        shown++;
        const ripple = word[0].style === 'kw' && !hot;
        let px = wx;
        for (const q of word) {
          const col = hot ? lineGlow(age, c[q.style]) : c[q.style];
          if (!ripple) {
            px = text(g, q.text, px, y, col, font);
            continue;
          }
          // A slow ripple a pixel high running along the phrase: each letter rises and settles in its turn.
          let n = 0;
          for (const ch of q.text) px = text(g, ch, px, y - Math.round((Math.sin(clock * 3 - (wx + n++ * 5) * 0.11) * 0.5 + 0.5)), col, font);
        }
      });
    }
    y += lh;
    row++;
  }
  // The scan line, in ember, sweeping down over the lines still to come.
  if (t >= 0 && t < row * LINE_GAP) {
    const sy = top + Math.floor((t / LINE_GAP) * lh);
    rect(g, x - 2, sy, maxW + 4, 1, PAL.ember);
    rect(g, x - 2, sy - 1, maxW + 4, 1, PAL.wine);
  }
  return { y, shown };
}
