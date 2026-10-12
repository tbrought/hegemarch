/**
 * Bitmap fonts: "main" (variable width, 7px caps with descenders) and "tiny" (3x5 caps).
 * Glyphs are baked into an atlas once and tinted per color on demand.
 */
import { ctx2d, makeCanvas, type Ctx } from './pixel';

export type FontId = 'main' | 'tiny';

/** Inline icon characters (drawn by the icon set registered from sprites.ts). */
export const IC = {
  ember: '\u0001',
  lore: '\u0002',
  hangar: '\u0003',
  clock: '\u0004',
  sword: '\u0005',
  shield: '\u0006',
  star: '\u0007',
  skull: '\u000e',
  boon: '\u000f',
  /** A fleet badge as it looks on the map (in the player's color). */
  fleet: '\u0010',
  /** The Scout as it looks on the map (in the player's color). */
  scout: '\u0011',
} as const;

const MAIN: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '..../..../.##./...#/.###/#..#/.###',
  b: '#.../#.../###./#..#/#..#/#..#/###.',
  c: '..../..../.###/#.../#.../#.../.###',
  d: '...#/...#/.###/#..#/#..#/#..#/.###',
  e: '..../..../.##./#..#/####/#.../.###',
  f: '.##/#../###/#../#../#../#..',
  g: '..../..../.###/#..#/#..#/#..#/.###/...#/.##.',
  h: '#.../#.../###./#..#/#..#/#..#/#..#',
  i: '#/./#/#/#/#/#',
  j: '.#/../.#/.#/.#/.#/.#/.#/#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '..../..../###./#..#/#..#/#..#/#..#',
  o: '..../..../.##./#..#/#..#/#..#/.##.',
  p: '..../..../###./#..#/#..#/#..#/###./#.../#...',
  q: '..../..../.###/#..#/#..#/#..#/.###/...#/...#',
  r: '.../.../#.#/##./#../#../#..',
  s: '..../..../.###/#.../.##./...#/###.',
  t: '.#./.#./###/.#./.#./.#./..#',
  u: '..../..../#..#/#..#/#..#/#..#/.###',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '..../..../#..#/#..#/#..#/#..#/.###/...#/.##.',
  z: '..../..../####/...#/.##./#.../####',
  '0': '.##./#..#/#..#/#..#/#..#/#..#/.##.',
  '1': '.#./##./.#./.#./.#./.#./###',
  '2': '.##./#..#/...#/..#./.#../#.../####',
  '3': '###./...#/...#/.##./...#/...#/###.',
  '4': '#..#/#..#/#..#/####/...#/...#/...#',
  '5': '####/#.../#.../###./...#/...#/###.',
  '6': '.##./#.../#.../###./#..#/#..#/.##.',
  '7': '####/...#/...#/..#./.#../.#../.#..',
  '8': '.##./#..#/#..#/.##./#..#/#..#/.##.',
  '9': '.##./#..#/#..#/.###/...#/...#/.##.',
  '.': './././././././#',
  ',': '../../../../../.#/.#/#.',
  ':': './././#/././#',
  ';': '../../../.#/../../.#/#.',
  '!': '#/#/#/#/#/./#',
  '?': '.##./#..#/...#/..#./.#../..../.#..',
  '-': '.../.../.../###/.../.../...',
  '+': '.../.../.#./###/.#./.../...',
  '=': '.../.../###/.../###/.../...',
  '/': '..#/..#/.#./.#./.#./#../#..',
  '\\': '#../#../.#./.#./.#./..#/..#',
  '(': '.#/#./#./#./#./#./.#',
  ')': '#./.#/.#/.#/.#/.#/#.',
  '[': '##/#./#./#./#./#./##',
  ']': '##/.#/.#/.#/.#/.#/##',
  "'": '#/#/./././././',
  '’': '#/#/./././././',
  '‘': '#/#/./././././',
  '"': '#.#/#.#/.../.../.../.../...',
  '“': '#.#/#.#/.../.../.../.../...',
  '”': '#.#/#.#/.../.../.../.../...',
  '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##',
  '×': '.../.../#.#/.#./#.#/.../...',
  '→': '...../..#../...#./#####/...#./..#../.....',
  '·': './././#/./././',
  '…': '...../...../...../...../...../...../#.#.#',
  '—': '...../...../...../#####/...../...../.....',
  '–': '..../..../..../####/..../..../....',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  '#': '.#.#./#####/.#.#./.#.#./.#.#./#####/.#.#.',
  '<': '..#/.#./#../.#./..#/.../...',
  '>': '#../.#./..#/.#./#../.../...',
  '_': '..../..../..../..../..../..../####',
  '*': '.../#.#/.#./#.#/.../.../...',
  '^': '.#./#.#/.../.../.../.../...',
  '~': '..../..../.#.#/#.#./..../..../....',
  '|': '#/#/#/#/#/#/#',
  '½': '#..../#..../#..#./..#../.#.##/#...#/...##',
  '¤': '.....//.###./.#.#./.###./...../.....',
};

const TINY: Record<string, string> = {
  A: '###/#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '###/#../#../#../###', D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###', F: '###/#../##./#../#..', G: '###/#../#.#/#.#/###', H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/###', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '###/#.#/#.#/#.#/###', P: '###/#.#/###/#../#..',
  Q: '###/#.#/#.#/###/..#', R: '##./#.#/##./#.#/#.#', S: '###/#../###/..#/###', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/#.#/.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/###/.#./.#.', Z: '###/..#/.#./#../###',
  '0': '###/#.#/#.#/#.#/###', '1': '.#./##./.#./.#./###', '2': '###/..#/###/#../###', '3': '###/..#/.##/..#/###',
  '4': '#.#/#.#/###/..#/..#', '5': '###/#../##./..#/##.', '6': '###/#../###/#.#/###', '7': '###/..#/..#/.#./.#.',
  '8': '###/#.#/###/#.#/###', '9': '###/#.#/###/..#/###',
  '.': '././././#', ',': '../../../.#/#.', ':': './#/./#/.', '!': '#/#/#/./#', '?': '###/..#/.##/.../.#.',
  '-': '.../.../###/.../...', '+': '.../.#./###/.#./...', '/': '..#/..#/.#./#../#..', '(': '.#/#./#./#./.#',
  ')': '#./.#/.#/.#/#.', "'": '#/#/././.', '’': '#/#/././.', '>': '#../.#./..#/.#./#..', '<': '..#/.#./#../.#./..#',
  '=': '.../###/.../###/...', '%': '#.#/..#/.#./#../#.#', '·': './././#/.', '×': '.../#.#/.#./#.#/...', '→': '..../..#./####/..#./....', '"': '#.#/#.#/.../.../...',
  '&': '.#./#.#/.#./#.#/.##', '#': '#.#/###/#.#/###/#.#', '[': '##/#./#./#./##', ']': '##/.#/.#/.#/##', '_': '.../.../.../.../###',
  '…': '...../...../...../...../#.#.#', '—': '...../...../#####/...../.....', '–': '.../.../###/.../...',
  '~': '..../.#.#/#.#./..../....', '½': '#.../#.../..#./.#.#/..##', '*': '.../#.#/.#./#.#/...', '|': '#/#/#/#/#', '^': '.#./#.#/.../.../...',
};

interface Glyph {
  sx: number;
  w: number;
  rows: number;
}

interface FontData {
  id: FontId;
  cell: number;
  lineH: number;
  space: number;
  glyphs: Map<string, Glyph>;
  atlas: HTMLCanvasElement;
  tinted: Map<string, HTMLCanvasElement>;
  upper: boolean;
}

function build(id: FontId, table: Record<string, string>, cell: number, lineH: number, space: number, upper: boolean): FontData {
  const entries = Object.entries(table).map(([ch, src]) => [ch, src.split('/')] as const);
  let total = 0;
  for (const [, rows] of entries) total += Math.max(...rows.map((r) => r.length)) + 1;
  const atlas = makeCanvas(total, cell);
  const g = ctx2d(atlas);
  g.fillStyle = '#fff';
  const glyphs = new Map<string, Glyph>();
  let x = 0;
  for (const [ch, rows] of entries) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, ry) => {
      for (let cx = 0; cx < row.length; cx++) if (row[cx] === '#') g.fillRect(x + cx, ry, 1, 1);
    });
    glyphs.set(ch, { sx: x, w, rows: rows.length });
    x += w + 1;
  }
  return { id, cell, lineH, space, glyphs, atlas, tinted: new Map(), upper };
}

let FONTS: Record<FontId, FontData> | null = null;

function fonts(): Record<FontId, FontData> {
  if (!FONTS) {
    FONTS = {
      main: build('main', MAIN, 9, 10, 3, false),
      tiny: build('tiny', TINY, 5, 6, 3, true),
    };
  }
  return FONTS;
}

function tinted(f: FontData, color: string): HTMLCanvasElement {
  let c = f.tinted.get(color);
  if (c) return c;
  c = makeCanvas(f.atlas.width, f.atlas.height);
  const g = ctx2d(c);
  g.drawImage(f.atlas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  f.tinted.set(color, c);
  return c;
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

type IconDraw = (g: Ctx, ch: string, x: number, y: number, font: FontId) => void;
let iconDraw: IconDraw | null = null;
let iconWidth: (ch: string, font: FontId) => number = () => 0;

export function registerIcons(draw: IconDraw, width: (ch: string, font: FontId) => number) {
  iconDraw = draw;
  iconWidth = width;
}

const isIcon = (ch: string) => ch.charCodeAt(0) < 32 && ch !== '\n';

function glyphFor(f: FontData, ch: string): Glyph | undefined {
  if (f.upper) ch = ch.toUpperCase();
  return f.glyphs.get(ch) ?? f.glyphs.get('?');
}

export function charWidth(ch: string, font: FontId = 'main'): number {
  const f = fonts()[font];
  if (ch === ' ') return f.space + 1;
  if (isIcon(ch)) return iconWidth(ch, font) + 1;
  const gl = glyphFor(f, ch);
  return gl ? gl.w + 1 : f.space + 1;
}

/**
 * A vocabulary: in some places the same things go by other names (the cradle world of an Ages run calls
 * worlds "lands"). While one is set, every text that is measured, wrapped or drawn passes through it first.
 */
let vocabulary: ((s: string) => string) | null = null;

export function setVocabulary(f: ((s: string) => string) | null) {
  vocabulary = f;
}

/** A text in the words of the current vocabulary. */
export function say(s: string): string {
  return vocabulary ? vocabulary(s) : s;
}

/** Width in pixels of a single line of text (no trailing gap). */
export function textWidth(s: string, font: FontId = 'main'): number {
  let w = 0;
  for (const ch of say(s)) w += charWidth(ch, font);
  return Math.max(0, w - 1);
}

/**
 * Mark the words of a drawn line that match any of `marks` (whole-word patterns) with a dotted
 * underline, as the menus mark the words they explain. `line` is the line as it was drawn at (x, y).
 */
export function underlineMatches(g: Ctx, line: string, x: number, y: number, marks: RegExp[], color: string, font: FontId = 'main') {
  if (!marks.length) return;
  const s = say(line);
  const at = (i: number) => {
    let w = 0;
    let k = 0;
    for (const ch of s) {
      if (k >= i) break;
      w += charWidth(ch, font);
      k += ch.length;
    }
    return w;
  };
  const uy = Math.round(y) + capHeight(font) + 1;
  g.fillStyle = color;
  for (const re of marks) {
    for (const m of s.matchAll(re)) {
      const x0 = Math.round(x) + at(m.index);
      const x1 = Math.round(x) + at(m.index + m[0].length) - 1;
      for (let px = x0; px < x1; px += 2) g.fillRect(px, uy, 1, 1);
    }
  }
}

export function lineHeight(font: FontId = 'main'): number {
  return fonts()[font].lineH;
}

export function capHeight(font: FontId = 'main'): number {
  return font === 'main' ? 7 : 5;
}

/** Draw one line of text with its top-left at (x, y). Returns the x after the last glyph. */
export function text(g: Ctx, s: string, x: number, y: number, color: string, font: FontId = 'main'): number {
  s = say(s);
  const f = fonts()[font];
  const atlas = tinted(f, color);
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    if (ch === ' ') {
      cx += f.space + 1;
      continue;
    }
    if (isIcon(ch)) {
      iconDraw?.(g, ch, cx, cy, font);
      cx += iconWidth(ch, font) + 1;
      continue;
    }
    const gl = glyphFor(f, ch);
    if (!gl) {
      cx += f.space + 1;
      continue;
    }
    g.drawImage(atlas, gl.sx, 0, gl.w, f.cell, cx, cy, gl.w, f.cell);
    cx += gl.w + 1;
  }
  return cx;
}

/** The width of a digit's cell in tabular figures: the widest of the ten (the font is not monospaced). */
function digitCell(font: FontId): number {
  let w = 0;
  for (const d of '0123456789') w = Math.max(w, charWidth(d, font));
  return w;
}

/**
 * A number in tabular figures: every digit in a cell as wide as the widest, centered in it, as the
 * figures of a counter are. While it has as many digits a changing count keeps its width, and so it
 * neither jitters itself nor moves what stands beside it. Returns the x after it, as `text` does.
 */
export function textTabular(g: Ctx, s: string, x: number, y: number, color: string, font: FontId = 'main'): number {
  const cell = digitCell(font);
  let cx = Math.round(x);
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      text(g, ch, cx + Math.floor((cell - charWidth(ch, font)) / 2), y, color, font);
      cx += cell;
    } else {
      text(g, ch, cx, y, color, font);
      cx += charWidth(ch, font);
    }
  }
  return cx;
}

/** The width of `textTabular`'s figures for this string. */
export function tabularWidth(s: string, font: FontId = 'main'): number {
  const cell = digitCell(font);
  let w = 0;
  for (const ch of s) w += ch >= '0' && ch <= '9' ? cell : charWidth(ch, font);
  return Math.max(0, w - 1);
}

const bigCache = new Map<string, HTMLCanvasElement>();

/** A title in the main font blown up by a whole number, with a drop shadow, centered on cx. */
export function bigText(g: Ctx, s: string, cx: number, y: number, color: string, shadow: string, scale: number) {
  const key = `${s}|${color}|${shadow}`;
  let c = bigCache.get(key);
  if (!c) {
    const w = textWidth(s, 'main') + 2;
    c = makeCanvas(w, 10);
    const cg = ctx2d(c);
    text(cg, s, 0, 1, shadow, 'main');
    text(cg, s, 0, 0, color, 'main');
    bigCache.set(key, c);
  }
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(c, Math.round(cx - (c.width * scale) / 2), Math.round(y), c.width * scale, c.height * scale);
  g.imageSmoothingEnabled = smooth;
}

/** Text with a full 1px outline. */
export function textOutline(g: Ctx, s: string, x: number, y: number, color: string, outline: string, font: FontId = 'main'): number {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(g, s, x + dx, y + dy, outline, font);
  return text(g, s, x, y, color, font);
}

export function textCenter(g: Ctx, s: string, cx: number, y: number, color: string, font: FontId = 'main'): number {
  const w = textWidth(s, font);
  return text(g, s, Math.round(cx - w / 2), y, color, font);
}

export function textRight(g: Ctx, s: string, rx: number, y: number, color: string, font: FontId = 'main'): number {
  const w = textWidth(s, font);
  return text(g, s, Math.round(rx - w), y, color, font);
}

/** Word-wrap text into lines no wider than maxW. Honors explicit newlines. */
export function wrap(s: string, maxW: number, font: FontId = 'main'): string[] {
  s = say(s);
  const out: string[] = [];
  for (const para of s.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (textWidth(cand, font) <= maxW || !line) {
        if (textWidth(cand, font) > maxW && !line) {
          // A single word wider than the line: hard-break it.
          let piece = '';
          for (const ch of w) {
            if (textWidth(piece + ch, font) > maxW && piece) {
              out.push(piece);
              piece = '';
            }
            piece += ch;
          }
          line = piece;
        } else line = cand;
      } else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** Draw wrapped text; returns the y below the last line. */
export function paragraph(g: Ctx, s: string, x: number, y: number, maxW: number, color: string, font: FontId = 'main', gap = 0): number {
  const lh = lineHeight(font) + gap;
  for (const l of wrap(s, maxW, font)) {
    text(g, l, x, y, color, font);
    y += lh;
  }
  return y;
}

/** Shorten text with an ellipsis so it fits. */
export function fit(s: string, maxW: number, font: FontId = 'main'): string {
  s = say(s);
  if (textWidth(s, font) <= maxW) return s;
  let t = s;
  while (t.length > 1 && textWidth(t + '…', font) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
