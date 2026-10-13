/**
 * Pixel-art sprites. Ships point right and are rotated into 16 directions (supersampled nearest
 * neighbour, so small hulls stay crisp). Structures are drawn upright. Icons are multi-colored.
 */
import { SPACE } from '../game/data/eras';
import type { UnitType } from '../game/types';
import { capHeight, IC, registerIcons, text, textWidth, type FontId } from './font';
import { PAL, shade } from './palette';
import { box, ctx2d, makeCanvas, type Ctx } from './pixel';

// Legend: x = house color, d = house shade, w = bone, e = engine glow, k = void.
const SHIPS: Partial<Record<UnitType, string[]>> = {
  scout: ['x...', 'exxw', 'x...'],
  seed: ['.w.', 'wxw', '.w.'],
  striker: ['xx....', '.xxx..', '.exxxw', '.xxx..', 'xx....'],
  guardian: ['.xxxx..', 'xxxxxx.', 'exxxxxw', 'xxxxxx.', '.xxxx..'],
  breaker: ['xxx.....', 'xxxx....', 'exxxwwww', 'xxxx....', 'xxx.....'],
  carrier: ['xxxxxxx..', 'x.x.x.xx.', 'exxxxxxxw', 'x.x.x.xx.', 'xxxxxxx..'],
  lancer: ['xx.......', '.xxx.....', 'exxxxwwww', '.xxx.....', 'xx.......'],
  dreadnought: ['.xxx.........', 'xxxxxxx......', 'xxdxxxxxxxx..', 'exxwxxxwxxxxw', 'xxdxxxxxxxx..', 'xxxxxxx......', '.xxx.........'],
  ark: ['..xx.......', '.xxxxx.....', 'xxxxxxxxx..', 'exxxwxxxxxw', 'xxxxxxxxx..', '.xxxxx.....', '..xx.......'],
  fighter: ['xw'],
  starfall: ['...xxxxx...', '.xxdxxxdxx.', 'xxdeeeeedxx', 'exeewwweexw', 'xxdeeeeedxx', '.xxdxxxdxx.', '...xxxxx...'],
  raider: ['x.x...', '.xxx..', 'exxxxw', '.xxx..', 'x.x...'],
  marauder: ['xx.x....', 'xxxxx...', 'exxxxxxw', 'xxxxx...', 'xx.x....'],
  drone: ['.x.x.', 'xxxxx', '.xwx.', 'xxxxx', '.x.x.'],
  reaper: ['..x.x...', '.xxxxx..', 'xxdxxxx.', 'exxxwxxx', 'xxdxxxx.', '.xxxxx..', '..x.x...'],
  leviathan: [
    '....xx........', '..xxxxxx......', '.xxdxxxxxx....', 'xxxxxxxxxxxx..', 'exxxwxxxwxxxxw',
    'xxxxxxxxxxxx..', '.xxdxxxxxx....', '..xxxxxx......', '....xx........',
  ],
};

const STRUCTURES: Partial<Record<UnitType, string[]>> = {
  starbase: ['...xxxxx...', '..x.....x..', '.x.xxxxx.x.', 'x.x.....x.x', 'x.x.www.x.x', 'x.x.wdw.x.x', 'x.x.www.x.x', 'x.x.....x.x', '.x.xxxxx.x.', '..x.....x..', '...xxxxx...'],
  militia: ['..x.x..', '.xxxxx.', 'xxdwdxx', '.xwxwx.', 'xxdwdxx', '.xxxxx.', '..x.x..'],
  sentinel: ['....x....', '...xxx...', '..xxdxx..', '.xxdwdxx.', 'xxdwwwdxx', '.xxdwdxx.', '..xxdxx..', '...xxx...', '....x....'],
  monolith: ['...xxx...', '..xxdxx..', '..xdwdx..', '..xxdxx..', '..xxxxx..', '.xxdxdxx.', '.xxxwxxx.', '.xxdxdxx.', '.xxxxxxx.', 'xxxdxdxxx', 'xxxxwxxxx', 'xxxdxdxxx', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..'],
  stronghold: [
    '.....xxxxxxx.....', '...xxdxxxxxdxx...', '..xxdddxxxdddxx..', '.xxxxxwwwwwxxxxx.', 'xxdxxw.....wxxdxx', 'xxxxw..xxx..wxxxx', 'xxxxw.xxexx.wxxxx',
    'xxxxw..xxx..wxxxx', 'xxdxxw.....wxxdxx', '.xxxxxwwwwwxxxxx.', '..xxdddxxxdddxx..', '...xxdxxxxxdxx...', '.....xxxxxxx.....',
  ],
  gate: [
    '.....xxxxx.....', '...xx.....xx...', '..x..eeeee..x..', '.x..e.....e..x.', '.x.e.......e.x.', 'x..e.......e..x', 'x.e.........e.x', 'x.e....w....e.x',
    'x.e.........e.x', 'x..e.......e..x', '.x.e.......e.x.', '.x..e.....e..x.', '..x..eeeee..x..', '...xx.....xx...', '.....xxxxx.....',
  ],
};

export const isStructureArt = (t: UnitType) => t in STRUCTURES;

/**
 * Units of the cradle's ages (Ages runs), one table per age from the Stone Age on. They are drawn from
 * the side, facing right, and are mirrored to face left: never turned. Extra letters: l and r are the
 * two legs (or wheels, or tracks) of a walk, shown in turn; m is steel grey, o is dark wood.
 */
const FIREBEARERS = ['..e..', '.we..', 'xxm..', '.x...', 'ldr..'];
const BEAST = ['.....xx', 'xxxxxxw', 'xxxxxx.', 'ld..dr.'];
const TROOPS: Partial<Record<UnitType, string[]>>[] = [
  {
    // Stone Age
    scout: ['.w.', 'xx.', '.x.', 'ldr'],
    seed: FIREBEARERS,
    striker: ['.w....', 'xxmmmw', '.x....', '.x....', 'ldr...'],
    guardian: ['.w..o.', 'xxx.o.', 'xxxdo.', 'xxxd..', '.xx...', 'ldr...'],
    breaker: ['.w.m.', 'xx.m.', '.xx..', '.x...', 'ldr..'],
    militia: BEAST,
  },
  {
    // Bronze Age
    scout: ['.w.', 'xx.', '.x.', 'ldr'],
    seed: FIREBEARERS,
    striker: ['.w...xx.', 'xx..xxx.', 'xxddxxx.', 'm.m.ldr.'],
    guardian: ['.w..m.', 'xxd.m.', 'xxd.m.', 'xxd.m.', '.x..m.', 'ldr.m.'],
    breaker: ['.xxxxxx..', 'xxxxxxx..', 'oooooooww', 'xxxxxxx..', '.m...m...'],
    militia: BEAST,
  },
  {
    // Iron Age
    scout: ['..w...', '..x.xx', 'xxxxx.', 'ld.dr.'],
    seed: FIREBEARERS,
    striker: ['..w....', '..x.mmw', '.xxxxxx', 'xxxxxx.', 'ld..dr.'],
    guardian: ['.m....', 'xdd.m.', 'xdw.m.', 'xdd.m.', '.x....', 'ldr...'],
    breaker: ['......m.', '.....m..', '....m...', 'xxxmxxx.', 'xxxxxxx.', 'm.....m.'],
    militia: BEAST,
  },
  {
    // Powder Age
    scout: ['..w...', '..x.xx', 'xxxxx.', 'ld.dr.'],
    seed: FIREBEARERS,
    striker: ['..d....', '..xmmm.', '.xxxxxx', 'xxxxxx.', 'ld..dr.'],
    guardian: ['.d....', '.w..m.', 'xxxm..', 'xxm...', '.x....', 'ldr...'],
    breaker: ['..mmmmmw', '.xxmxx..', 'xxmdmx..', '..mmm...'],
    militia: BEAST,
  },
  {
    // Machine Age
    scout: ['mmmmm.', '.x.x..', 'xxxxxe', '.x....'],
    seed: FIREBEARERS,
    striker: ['..xxx...', '.xxxxmmw', 'xxxxxxx.', 'xdxxxdx.', '.m...m..'],
    guardian: ['..xxxx...', '..xdxmmmw', 'xxxxxxxx.', 'xxxxxxxxx', 'lrlrlrlr.'],
    breaker: ['......mw.', '.....mm..', 'xxxxmm...', 'xxxxxx...', 'm...m....'],
    militia: BEAST,
  },
];

/**
 * The age units are drawn in when a caller names none. The HUD of an Ages run sets it to the player's age
 * while it draws (build buttons, Boon cards, lists), so that its pictures are of that age; everywhere else
 * it is the Space Age.
 */
let artEra = SPACE;

export function setArtEra(era: number) {
  artEra = era;
}

/** The age pictures are being drawn in right now (see `setArtEra`). */
export const artAge = (): number => artEra;

/** Is this unit, of this age, drawn as a troop of the cradle (from the side, mirrored) and not as a ship? */
export const isTroopArt = (t: UnitType, era = artEra) => !!TROOPS[era]?.[t];

/** The rows of a unit's picture (exported for the tests, which check that every picture is a clean rectangle). */
export function art(t: UnitType, era = artEra): string[] {
  return TROOPS[era]?.[t] ?? SHIPS[t] ?? STRUCTURES[t] ?? ['x'];
}

export function spriteSize(t: UnitType, era = artEra): { w: number; h: number } {
  const a = art(t, era);
  return { w: a[0].length, h: a.length };
}

/** The view of a unit heading at angle `a`: ships turn through 16 headings, troops face left or right, structures stand. */
export function facing(t: UnitType, era: number, a: number): number {
  if (isTroopArt(t, era)) return Math.cos(a) < 0 ? 8 : 0;
  return STRUCTURES[t] ? 0 : dirIndex(a);
}

function paint(ch: string, color: string, flick: boolean): string | null {
  switch (ch) {
    case 'x':
      return color;
    case 'd':
      return shade(color);
    case 'w':
      return PAL.bone;
    case 'e':
      return flick ? PAL.gold : PAL.ember;
    case 'k':
      return PAL.void;
    case 'l':
      return flick ? shade(color) : null;
    case 'r':
      return flick ? null : shade(color);
    case 'm':
      return PAL.mist;
    case 'o':
      return PAL.wine;
    default:
      return null;
  }
}

/** Rotate character art by an angle with 4x4 supersampling and a majority vote per pixel. */
function rotateArt(rows: string[], angle: number): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const R = Math.ceil(Math.hypot(w, h) / 2) + 1;
  const size = R * 2 + 1;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const out: string[] = [];
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  const grid: string[][] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const counts = new Map<string, number>();
      let filled = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const dx = x - R + (sx + 0.5) / 4 - 0.5;
          const dy = y - R + (sy + 0.5) / 4 - 0.5;
          const ox = Math.round(dx * cos - dy * sin + cx);
          const oy = Math.round(dx * sin + dy * cos + cy);
          if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
          const ch = rows[oy][ox];
          if (ch === '.') continue;
          filled++;
          counts.set(ch, (counts.get(ch) ?? 0) + 1);
        }
      }
      let best = '.';
      if (filled >= 7) {
        let bc = 0;
        for (const [ch, c] of counts) {
          // Bright details (windows, engines) win ties so they never vanish.
          const k = c + (ch === 'w' || ch === 'e' ? 2.5 : 0);
          if (k > bc) {
            bc = k;
            best = ch;
          }
        }
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      row.push(best);
    }
    grid.push(row);
  }
  if (maxX < 0) return rows;
  // Keep the sprite centered on the same pixel as the original.
  for (let y = 0; y < size; y++) out.push(grid[y].join(''));
  return out;
}

const rotCache = new Map<string, string[]>();
const spriteCache = new Map<string, HTMLCanvasElement>();

/** 16 directions; index 0 points right, increasing clockwise (screen y grows down). */
export function dirIndex(a: number): number {
  const t = (a / (Math.PI * 2)) * 16;
  return ((Math.round(t) % 16) + 16) % 16;
}

function rotated(t: UnitType, dir: number, era = artEra): string[] {
  const key = t + '|' + dir + '|' + era;
  let r = rotCache.get(key);
  if (r) return r;
  const base = art(t, era);
  const troop = isTroopArt(t, era);
  if (troop) r = dir > 4 && dir < 12 ? base.map((row) => [...row].reverse().join('')) : base;
  else if (STRUCTURES[t] || dir === 0) r = base;
  else if (dir === 8) r = base.map((row) => [...row].reverse().join(''));
  else r = rotateArt(base, (dir / 16) * Math.PI * 2);
  rotCache.set(key, r);
  return r;
}

/** A tinted sprite canvas for a unit type, facing one of 16 directions. */
export function shipSprite(t: UnitType, color: string, dir: number, flick = false, era = artEra): HTMLCanvasElement {
  const key = t + '|' + color + '|' + dir + '|' + (flick ? 1 : 0) + '|' + era;
  let c = spriteCache.get(key);
  if (c) return c;
  const rows = rotated(t, dir, era);
  c = makeCanvas(rows[0].length, rows.length);
  const g = ctx2d(c);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const col = paint(rows[y][x], color, flick);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, c);
  return c;
}

/** A solid silhouette (for selection outlines and hit flashes). */
export function silhouette(t: UnitType, color: string, dir: number, era = artEra): HTMLCanvasElement {
  const key = 'sil|' + t + '|' + color + '|' + dir + '|' + era;
  let c = spriteCache.get(key);
  if (c) return c;
  const rows = rotated(t, dir, era);
  c = makeCanvas(rows[0].length, rows.length);
  const g = ctx2d(c);
  g.fillStyle = color;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] !== '.') g.fillRect(x, y, 1, 1);
  spriteCache.set(key, c);
  return c;
}

export function drawShip(g: Ctx, t: UnitType, color: string, x: number, y: number, a: number, flick = false, era = artEra) {
  const s = shipSprite(t, color, facing(t, era, a), flick, era);
  g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

// Legend: g gold, e ember, r red, x wine, w bone, m mist, d dusk, s slate, i indigo, n night,
// t teal, a sea, k sky, v violet, p pink, o void, c = "current color" (tinted by the caller).
const ICON_COLORS: Record<string, string> = {
  g: PAL.gold, e: PAL.ember, r: PAL.red, x: PAL.wine, w: PAL.bone, m: PAL.mist, d: PAL.dusk, s: PAL.slate,
  i: PAL.indigo, n: PAL.night, t: PAL.teal, a: PAL.sea, k: PAL.sky, v: PAL.violet, p: PAL.pink, o: PAL.void,
};

export const ICONS: Record<string, string[]> = {
  ember: ['..e..', '..ee.', '.egge', 'egwge', 'egwge', '.egg.', '..e..'],
  lore: ['.....', 'vv.vv', 'vpvpv', 'vpvpv', 'vpvpv', 'vvvvv', '.....'],
  hangar: ['.....', '..m..', '.mmm.', 'mm.mm', 'm...m', 'mmmmm', '.....'],
  // (Supply: what the hangar is called on the cradle of an Ages run. A tent.)
  supply: ['...w...', '..mmm..', '.mmmmm.', 'mmmommm', 'mmmommm'],
  clock: ['.mmm.', 'm.w.m', 'm.w.m', 'm.wwm', 'm...m', '.mmm.', '.....'],
  sword: ['....w', '...w.', '..w..', 'mw...', '.m...', 'm.m..', '.....'],
  shield: ['kkkkk', 'kwkwk', 'kkwkk', 'kkkkk', '.kkk.', '..k..', '.....'],
  star: ['..g..', '..g..', 'ggggg', '.ggg.', '.g.g.', 'g...g', '.....'],
  skull: ['.mmm.', 'mmmmm', 'm.m.m', 'mmmmm', '.m.m.', '.....', '.....'],
  starfall: ['e.e.e', '.ege.', 'egwge', '.ege.', 'e.e.e', '.....', '.....'],
  boon: ['ggggg', 'gwwwg', 'gwgwg', 'gwwwg', 'gwgwg', 'gwwwg', 'ggggg'],
  // Boon categories, 5x5 ('c' takes the rarity color)
  catWar: ['....w', '...w.', 'c.w..', '.c...', 'c.c..'],
  catWealth: ['.ccc.', 'cwccc', 'cwccc', 'ccccc', '.ccc.'],
  catGrowth: ['..w..', '.ccc.', 'c.c.c', '..c..', '..c..'],
  catLore: ['cc.cc', 'cwcwc', 'cwcwc', 'cwcwc', 'ccccc'],
  catWard: ['ccccc', 'cwccc', 'cwccc', '.ccc.', '..c..'],
  catBlueprint: ['c.c.c', '.ccc.', 'cc.cc', '.ccc.', 'c.c.c'],
  catPact: ['.ccc.', 'ccccc', 'c.c.c', 'ccccc', '.c.c.'],
  // Roles
  mine: ['.....', 'mmmm.', '...mm', '..d.m', '.d...', 'd....', '.....'],
  forge: ['.....', 'eeeee', '.eee.', '..e..', '.eee.', 'eeeee', '.....'],
  observatory: ['.....', '.vvv.', 'v.w.v', 'vwwwv', 'v.w.v', '.vvv.', '.....'],
  bastion: ['k.k.k', 'kkkkk', '.kkk.', '.kwk.', '.kkk.', 'kkkkk', '.....'],
  hearth: ['..g..', '.geg.', 'gewe.', 'gewge', 'geege', '.ggg.', '.....'],
  // Destinies
  conquest: ['.....', 'g.g.g', 'ggggg', 'gwgwg', 'ggggg', '.....', '.....'],
  domination: ['g....', 'gtttt', 'gtttt', 'gttt.', 'g....', 'g....', 'g....'],
  ascension: ['.ppp.', 'p...p', 'p.w.p', 'p...p', 'p...p', 'p...p', '.....'],
  relics: ['..k..', '.kwk.', 'kwkkk', '.kkk.', '..k..', '.....', '.....'],
  treasury: ['.ggg.', 'gwggg', '.ggg.', '.ggg.', 'gwggg', '.ggg.', '.....'],
  crisis: ['.ppp.', 'p...p', 'p.r.p', 'p...p', '.ppp.', '.....', '.....'],
  // Extra frames for the pictures that move on Boon cards and choices (see ui/subjects.ts).
  ember2: ['.e...', '.ee..', '.egge', 'egwge', 'eggge', '.egg.', '..e..'],
  ember3: ['...e.', '..ee.', 'eggee', 'egwge', 'egwwe', '.egg.', '..e..'],
  hearth2: ['.g...', '.geg.', '.eweg', 'gewge', 'geege', '.ggg.', '.....'],
  hearth3: ['...g.', '.geg.', 'gewe.', 'geweg', 'geege', '.ggg.', '.....'],
  lore2: ['.....', 'vv.vv', 'vwvpv', 'vpvpv', 'vpvwv', 'vvvvv', '.....'],
  lore3: ['.....', 'vv.vv', 'vpvwv', 'vpvpv', 'vwvpv', 'vvvvv', '.....'],
  forge2: ['.....', 'eeeee', '.ege.', '..g..', '.ege.', 'eeeee', '.....'],
  observatory2: ['.....', '.vvv.', 'v...v', 'v.w.v', 'v...v', '.vvv.', '.....'],
  kindle2: ['.....', '..g..', '.gwg.', '..g..', '.....', '.....', '.....'],
  kindle3: ['..g..', '.g.g.', 'g.w.g', '.g.g.', '..g..', '.....', '.....'],
  pirate2: ['.mmm.', 'mmmmm', 'mrmrm', 'mmmmm', '.m.m.', '.....', '.....'],
  target2: ['.....', '..r..', '.rwr.', '..r..', '.....'],
  chart2: ['.....', '.kkk.', 'kw..k', '.kkk.', '.....'],
  chart3: ['.....', '.kkk.', 'k..wk', '.kkk.', '.....'],
  fleet2: ['ec......', '.ccw....', 'ec..ec..', '.....ccw', 'ec..ec..', '.ccw....', 'ec......'],
  // What a choice affects (see ui/subjects.ts). 'c' takes the house color.
  fleet: ['cc......', '.ccw....', 'cc..cc..', '.....ccw', 'cc..cc..', '.ccw....', 'cc......'],
  fighters: ['.cw...', '....cw', 'cw....', '...cw.', '.cw...'],
  world: ['.ktt.', 'kkttt', 'ktttk', 'tttkk', '.tkk.'],
  speed: ['k.k..', '.k.k.', '..k.k', '.k.k.', 'k.k..'],
  target: ['..r..', '.r.r.', 'r.w.r', '.r.r.', '..r..'],
  chart: ['.....', '.kkk.', 'k.w.k', '.kkk.', '.....'],
  // Misc
  pause: ['ww.ww', 'ww.ww', 'ww.ww', 'ww.ww', 'ww.ww', '.....', '.....'],
  play: ['w....', 'www..', 'wwww.', 'www..', 'w....', '.....', '.....'],
  menu: ['wwwww', '.....', 'wwwww', '.....', 'wwwww', '.....', '.....'],
  kindle: ['..g..', '.gwg.', 'gw.wg', '.gwg.', '..g..', '.....', '.....'],
  up: ['..t..', '.ttt.', 't.t.t', '..t..', '..t..', '.....', '.....'],
  anomaly: ['.v.v.', 'v.p.v', '.pwp.', 'v.p.v', '.v.v.', '.....', '.....'],
  relic: ['..k..', '.kwk.', 'kwkkk', '.kkk.', '..k..', '.....', '.....'],
  pirate: ['.mmm.', 'mmmmm', 'm.m.m', 'mmmmm', '.m.m.', '.....', '.....'],
  warn: ['..e..', '.eee.', '.ewe.', 'eewee', 'eeeee', '.....', '.....'],
  check: ['....t', '...t.', 't.t..', '.t...', '.....', '.....', '.....'],
  cross: ['r...r', '.r.r.', '..r..', '.r.r.', 'r...r', '.....', '.....'],
  lock: ['.mmm.', 'm...m', 'mmmmm', 'mmwmm', 'mmmmm', '.....', '.....'],
  arrowDown: ['ggggggg', '.ggggg.', '..ggg..', '...g...'],
  arrowUp: ['...g...', '..ggg..', '.ggggg.', 'ggggggg'],
  arrowLeft: ['...g', '..gg', '.ggg', 'gggg', '.ggg', '..gg', '...g'],
  arrowRight: ['g...', 'gg..', 'ggg.', 'gggg', 'ggg.', 'gg..', 'g...'],
};

const iconCache = new Map<string, HTMLCanvasElement>();

/** An icon's pixels as a small canvas (to draw it scaled up). `tint` recolors 'c' pixels (or all pixels when `solid`). */
export function iconCanvas(name: string, tint?: string, solid = false): HTMLCanvasElement {
  return pixelCanvas(name, ICONS[name] ?? ICONS.star, tint, solid);
}

/** Rows of icon letters as a canvas, cached under `name` (animated frames are made from an icon's rows). */
export function pixelCanvas(name: string, rows: string[], tint?: string, solid = false): HTMLCanvasElement {
  const key = name + '|' + (tint ?? '') + '|' + (solid ? 1 : 0);
  let c = iconCache.get(key);
  if (!c) {
    c = makeCanvas(rows[0].length, rows.length);
    const cg = ctx2d(c);
    for (let yy = 0; yy < rows.length; yy++) {
      for (let xx = 0; xx < rows[yy].length; xx++) {
        const ch = rows[yy][xx];
        if (ch === '.') continue;
        cg.fillStyle = solid && tint ? tint : ch === 'c' && tint ? tint : ICON_COLORS[ch] ?? tint ?? PAL.bone;
        cg.fillRect(xx, yy, 1, 1);
      }
    }
    iconCache.set(key, c);
  }
  return c;
}

/** Draw an icon by name with its top-left at (x, y). `tint` recolors 'c' pixels (or all pixels when `solid`). */
export function icon(g: Ctx, name: string, x: number, y: number, tint?: string, solid = false) {
  g.drawImage(iconCanvas(name, tint, solid), Math.round(x), Math.round(y));
}

export function iconSize(name: string): { w: number; h: number } {
  const rows = ICONS[name] ?? ICONS.star;
  return { w: rows[0].length, h: rows.length };
}

const INLINE: Record<string, string> = {
  [IC.ember]: 'ember',
  [IC.lore]: 'lore',
  [IC.hangar]: 'hangar',
  [IC.clock]: 'clock',
  [IC.sword]: 'sword',
  [IC.shield]: 'shield',
  [IC.star]: 'star',
  [IC.skull]: 'skull',
  [IC.boon]: 'boon',
};

/**
 * A fleet badge: the number of ships at a world, in a box beside it. The player's own badges carry
 * a small flag. Returns the badge's width.
 */
export function fleetBadge(g: Ctx, x: number, y: number, label: string, color: string, o: { own?: boolean; fill?: string; border?: string } = {}): number {
  const own = o.own ?? true;
  const w = fleetBadgeWidth(label, own);
  box(g, x, y, w, 9, o.fill ?? (own ? PAL.night : PAL.void), o.border ?? color);
  if (own) {
    g.fillStyle = color;
    g.fillRect(x + 2, y + 3, 1, 3);
    g.fillRect(x + 3, y + 4, 1, 1);
  }
  text(g, label, x + (own ? 6 : 3), y + 2, color, 'tiny');
  return w;
}

/** A fleet badge's width; with no number it is just the flag in a box. */
export function fleetBadgeWidth(label: string, own = true): number {
  return label ? textWidth(label, 'tiny') + (own ? 9 : 6) : 7;
}

/** The house color for fleet badges drawn inside text (the HUD sets it to the player's). */
let inlineBadgeColor: string = PAL.gold;
export function setInlineBadgeColor(c: string) {
  inlineBadgeColor = c;
}

/**
 * The number on a fleet badge drawn inside text: "3" in examples; the real count when the text means
 * one particular fleet (set around that text, so it matches the badge on the map); "" for none.
 */
let inlineBadgeLabel = '3';
export function setInlineBadgeLabel(label: string) {
  inlineBadgeLabel = label;
}

registerIcons(
  (g: Ctx, ch: string, x: number, y: number, font: FontId) => {
    if (ch === IC.fleet) {
      fleetBadge(g, x, y - 1, inlineBadgeLabel, inlineBadgeColor);
      return;
    }
    if (ch === IC.scout) {
      // The same 4x3 ship as on the map and in the fleet card, centred on the capitals.
      const s = shipSprite('scout', inlineBadgeColor, 0);
      g.drawImage(s, x, y + ((capHeight(font) - s.height) >> 1));
      return;
    }
    const name = INLINE[ch];
    if (!name) return;
    if (font === 'tiny') {
      // Tiny font: a 3x5 version is just the icon's center, clipped.
      const s = iconCache.get(name + '||0');
      icon(g, name, x - 1, y - 1);
      void s;
      return;
    }
    icon(g, name, x, y);
  },
  (ch: string, font: FontId) =>
    ch === IC.fleet ? fleetBadgeWidth(inlineBadgeLabel) : ch === IC.scout ? shipSprite('scout', inlineBadgeColor, 0).width : INLINE[ch] ? (font === 'tiny' ? 4 : iconSize(INLINE[ch]).w) : 0,
);
