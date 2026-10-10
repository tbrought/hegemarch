/**
 * Rich text for effect descriptions.
 *   [text]   a gain (drawn in the "good" color)
 *   [!text]  a drawback (drawn in the "bad" color)
 *   {text}   a keyword, forced
 * Game terms (ship types, roles, Embers, Hearth…) are recognised automatically and drawn as keywords.
 */
import { lineHeight, text, textWidth, type FontId, say } from './font';
import { PAL } from './palette';
import type { Ctx } from './pixel';

export type RichStyle = 'body' | 'gain' | 'loss' | 'kw';

export interface Run {
  text: string;
  style: RichStyle;
}

export interface RichColors {
  body: string;
  gain: string;
  loss: string;
  kw: string;
}

export const RICH_DEFAULT: RichColors = { body: PAL.mist, gain: PAL.teal, loss: PAL.red, kw: PAL.gold };

/** Capitalised game terms that are styled as keywords wherever effect text mentions them. */
const KEYWORDS = new RegExp(
  '\\b(' +
    [
      'Strikers?', 'Guardians?', 'Breakers?', 'Lancers?', 'Carriers?', 'Dreadnoughts?', 'Starbases?', 'Scouts?',
      'Seed Ships?', 'Fighters?', 'Ark', 'Mines?', 'Forges?', 'Observator(?:y|ies)', 'Bastions?', 'Hearths?', 'Embers',
      'Lore', 'Boons?', 'Blueprints?', 'Pacts?', 'Relics?', 'Corsairs', 'Hollow', 'Rift Heart', 'Maw', 'Starfire Gate',
      'Hangar Bays?', 'Destin(?:y|ies)', 'Hegemarch',
    ].join('|') +
    ')\\b',
  'g',
);

/** True when a string carries effect markup (plain UI text is drawn plain, without keyword colors). */
export const hasMarkup = (s: string): boolean => /[[{]/.test(s);

/** Split marked-up text into styled runs. */
export function parseRich(s: string): Run[] {
  s = say(s);
  const out: Run[] = [];
  const pushBody = (t: string) => {
    if (!t) return;
    let last = 0;
    KEYWORDS.lastIndex = 0;
    for (let m = KEYWORDS.exec(t); m; m = KEYWORDS.exec(t)) {
      if (m.index > last) out.push({ text: t.slice(last, m.index), style: 'body' });
      out.push({ text: m[0], style: 'kw' });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ text: t.slice(last), style: 'body' });
  };
  let i = 0;
  let buf = '';
  while (i < s.length) {
    const ch = s[i];
    if (ch === '[' || ch === '{') {
      const close = s.indexOf(ch === '[' ? ']' : '}', i + 1);
      if (close > i) {
        pushBody(buf);
        buf = '';
        let inner = s.slice(i + 1, close);
        let style: RichStyle = ch === '{' ? 'kw' : 'gain';
        if (ch === '[' && inner.startsWith('!')) {
          style = 'loss';
          inner = inner.slice(1);
        }
        if (inner) out.push({ text: inner, style });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  pushBody(buf);
  return out;
}

/** The text with all markup removed. */
export function plainText(s: string): string {
  return parseRich(s)
    .map((r) => r.text)
    .join('');
}

interface Piece {
  text: string;
  style: RichStyle;
}

/** A word: pieces drawn back to back (a word may change style mid-way, e.g. a keyword followed by a period). */
type Word = Piece[];

function words(runs: Run[]): (Word | '\n')[] {
  const out: (Word | '\n')[] = [];
  let cur: Word = [];
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
  };
  for (const r of runs) {
    let chunk = '';
    for (const ch of r.text) {
      if (ch === ' ' || ch === '\n') {
        if (chunk) cur.push({ text: chunk, style: r.style });
        chunk = '';
        flush();
        if (ch === '\n') out.push('\n');
      } else chunk += ch;
    }
    if (chunk) cur.push({ text: chunk, style: r.style });
  }
  flush();
  return out;
}

const wordWidth = (w: Word, font: FontId) => textWidth(w.map((p) => p.text).join(''), font);

/** Pixels from the end of one word to the start of the next (the same as in plain text). */
const gapWidth = (font: FontId) => textWidth(' ', font) + 2;

/** Wrap rich text into lines (each line a list of words). */
export function wrapRich(s: string, maxW: number, font: FontId = 'main'): Word[][] {
  const lines: Word[][] = [];
  const space = gapWidth(font);
  let line: Word[] = [];
  let w = 0;
  for (const wd of words(parseRich(s))) {
    if (wd === '\n') {
      lines.push(line);
      line = [];
      w = 0;
      continue;
    }
    const ww = wordWidth(wd, font);
    if (line.length && w + space + ww > maxW) {
      lines.push(line);
      line = [];
      w = 0;
    }
    w += (line.length ? space : 0) + ww;
    line.push(wd);
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Number of lines rich text takes at a width. */
export function richLines(s: string, maxW: number, font: FontId = 'main'): number {
  return wrapRich(s, maxW, font).length;
}

/** Draw one wrapped line of words. */
function drawLine(g: Ctx, line: Word[], x: number, y: number, colors: RichColors, font: FontId) {
  const space = textWidth(' ', font) + 1;
  let cx = x;
  for (let i = 0; i < line.length; i++) {
    if (i) cx += space;
    for (const p of line[i]) cx = text(g, p.text, cx, y, colors[p.style], font);
  }
}

/** Draw wrapped rich text; returns the y below the last line. */
export function drawRich(g: Ctx, s: string, x: number, y: number, maxW: number, colors: Partial<RichColors> = {}, font: FontId = 'main', maxLines = 99): number {
  const c = { ...RICH_DEFAULT, ...colors };
  const lh = lineHeight(font);
  const lines = wrapRich(s, maxW, font).slice(0, maxLines);
  for (const l of lines) {
    drawLine(g, l, x, y, c, font);
    y += lh;
  }
  return y;
}

/** Width of the widest line (for sizing tooltips). */
export function richWidth(s: string, maxW: number, font: FontId = 'main'): number {
  const space = gapWidth(font);
  let best = 0;
  for (const l of wrapRich(s, maxW, font)) {
    let w = 0;
    l.forEach((wd, i) => (w += (i ? space : 0) + wordWidth(wd, font)));
    best = Math.max(best, w);
  }
  return best;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Rich text as HTML for the DOM menus (classes rt-gain, rt-loss, rt-kw). */
export function richHtml(s: string): string {
  return parseRich(s)
    .map((r) => (r.style === 'body' ? esc(r.text) : `<span class="rt-${r.style}">${esc(r.text)}</span>`))
    .join('');
}
