/**
 * The story of a decision, coming in word by word: rich text (gains, losses, keywords) laid out as
 * `drawRich` lays it out, each word fading up out of the dark and settling a pixel, the words after
 * one another, and a phrase picked out in gold riding a slow ripple all the while.
 */
import { lineHeight, text, textWidth, type FontId } from '../../render/font';
import { RICH_DEFAULT, wrapRich, type RichColors } from '../../render/rich';
import type { Ctx } from '../../render/pixel';

/** Words a second. */
export const WORDS_PER_SECOND = 9;
/** Seconds a word takes to come up out of the dark. */
export const WORD_FADE = 0.35;

/** How many words a rich text has (laid out at a width). */
export function wordCount(s: string, maxW: number, font: FontId = 'main'): number {
  let n = 0;
  for (const line of wrapRich(s, maxW, font)) n += line.length;
  return n;
}

/** The moment a text that began to come in at `from` is all there. */
export function storyEnd(words: number, from: number): number {
  return words ? from + (words - 1) / WORDS_PER_SECOND + WORD_FADE : from;
}

/** How a word comes in, `age` seconds after its turn: how far out of the dark (0 to 1), and the pixel it has yet to settle. */
export function wordIn(age: number): { alpha: number; dy: number } {
  if (age < 0) return { alpha: 0, dy: 1 };
  const a = Math.min(1, age / WORD_FADE);
  return { alpha: 1 - (1 - a) * (1 - a), dy: age < WORD_FADE / 2 ? 1 : 0 };
}

/**
 * Draw a story as it stands `t` seconds after it began to come in (`Infinity`: all of it); `clock`
 * runs the ripple. Returns the y below the last line, and how many words are showing.
 */
export function drawStory(g: Ctx, s: string, x: number, y: number, maxW: number, t: number, clock: number, colors: Partial<RichColors> = {}, font: FontId = 'main'): { y: number; shown: number } {
  const c = { ...RICH_DEFAULT, ...colors };
  const lh = lineHeight(font);
  const space = textWidth(' ', font) + 1;
  const a0 = g.globalAlpha;
  let i = 0;
  let shown = 0;
  for (const line of wrapRich(s, maxW, font)) {
    let cx = x;
    line.forEach((word, k) => {
      if (k) cx += space;
      const whole = word.map((p) => p.text).join('');
      const wx = cx;
      cx += textWidth(whole, font) + 1;
      const { alpha, dy } = wordIn(t - i / WORDS_PER_SECOND);
      i++;
      if (alpha <= 0) return;
      shown++;
      g.globalAlpha = a0 * alpha;
      const ripple = word[0].style === 'kw';
      let px = wx;
      for (const p of word) {
        if (!ripple) {
          px = text(g, p.text, px, y + dy, c[p.style], font);
          continue;
        }
        // A slow ripple a pixel high running along the phrase: each letter rises and settles in its turn.
        let n = 0;
        for (const ch of p.text) px = text(g, ch, px, y + dy - Math.round((Math.sin(clock * 3 - (wx + n++ * 5) * 0.11) * 0.5 + 0.5)), c[p.style], font);
      }
    });
    y += lh;
  }
  g.globalAlpha = a0;
  return { y, shown };
}
