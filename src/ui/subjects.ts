/**
 * What a choice affects, as small moving pictures: the ship type, the resource or the part of the
 * realm a Boon, an event choice or an ability touches. Boons are read from the modifiers they really
 * change (plus their text, for one-off effects); everything else is read from its text.
 *
 * The pictures are alive: ships turn through their headings with their engines flickering, flames
 * flicker, the little world rotates, arrows march, and a glint runs over the rest now and then.
 */
import type { Game } from '../game/Game';
import type { CardDef } from '../game/data/cards';
import { modDelta } from '../game/modstats';
import type { Faction, UnitType } from '../game/types';
import { PAL } from '../render/palette';
import type { Ctx } from '../render/pixel';
import { plainText } from '../render/rich';
import { ICONS, isStructureArt, isTroopArt, pixelCanvas, shipSprite, spriteSize } from '../render/sprites';

interface SubjectDef {
  /** What the tooltip calls it. */
  name: string;
  /** A ship drawn as on the map (in the house color), or an icon. */
  ship?: UnitType;
  icon?: string;
  /** Words in a description that mean this subject. */
  words?: RegExp;
  /** How the icon moves: named frames, or a transformation of its pixels. */
  frames?: string[];
  move?: 'march' | 'spin';
  /** Frames per second. */
  fps?: number;
}

/** In matching order: longer and more specific phrases first ("enemy ships" before "ships"). */
const SUBJECTS: Record<string, SubjectDef> = {
  seed: { name: 'Seed ships', ship: 'seed', words: /seed ships?/i },
  target: { name: 'Enemies', icon: 'target', words: /enem(?:y|ies)(?: ships?)?|hostile(?: \w+)?|sentinels?/i, frames: ['target', 'target', 'target2'], fps: 3 },
  corsairs: { name: 'The Corsairs', icon: 'pirate', words: /corsairs?|ambush/i, frames: ['pirate', 'pirate', 'pirate2'], fps: 2 },
  striker: { name: 'Strikers', ship: 'striker', words: /strikers?/i },
  guardian: { name: 'Guardians', ship: 'guardian', words: /guardians?/i },
  breaker: { name: 'Breakers', ship: 'breaker', words: /breakers?/i },
  lancer: { name: 'Lancers', ship: 'lancer', words: /lancers?/i },
  carrier: { name: 'Carriers', ship: 'carrier', words: /carriers?/i },
  dreadnought: { name: 'Dreadnoughts', ship: 'dreadnought', words: /dreadnoughts?/i },
  starbase: { name: 'Starbases', ship: 'starbase', words: /starbases?/i },
  scout: { name: 'Scouts', ship: 'scout', words: /scouts?/i },
  ark: { name: 'Your Ark', ship: 'ark', words: /\bark\b/i },
  fighters: { name: 'Fighters', icon: 'fighters', words: /fighters?/i, move: 'march', fps: 10 },
  hearth: { name: 'Your Hearth', icon: 'hearth', words: /\bhearth\b/i, frames: ['hearth', 'hearth2', 'hearth3'], fps: 6 },
  mine: { name: 'Mines', icon: 'mine', words: /\bmines?\b/i },
  forge: { name: 'Forges', icon: 'forge', words: /\bforges?\b/i, frames: ['forge', 'forge2'], fps: 3 },
  observatory: { name: 'Observatories', icon: 'observatory', words: /observator(?:y|ies)/i, frames: ['observatory', 'observatory', 'observatory2'], fps: 2 },
  bastion: { name: 'Bastions', icon: 'bastion', words: /bastions?/i },
  kindle: { name: 'Kindling', icon: 'kindle', words: /kindl\w*/i, frames: ['kindle2', 'kindle', 'kindle3'], fps: 4 },
  world: { name: 'Your worlds', icon: 'world', words: /worlds?/i, move: 'spin', fps: 3 },
  embers: { name: 'Embers', icon: 'ember', words: /embers?/i, frames: ['ember', 'ember2', 'ember3'], fps: 6 },
  lore: { name: 'Lore', icon: 'lore', words: /\blore\b/i, frames: ['lore', 'lore2', 'lore', 'lore3'], fps: 3 },
  hangar: { name: 'Hangar space', icon: 'hangar', words: /hangars?/i },
  boon: { name: 'Boons', icon: 'boon', words: /boons?|rerolls?|pacts?/i },
  speed: { name: 'Starlane travel', icon: 'speed', words: /starlanes?|\bdrives\b|\bjump\w*|spool/i, move: 'march', fps: 8 },
  chart: { name: 'The map', icon: 'chart', words: /\bchart\w*|\bsector\b|star maps?/i, frames: ['chart', 'chart2', 'chart', 'chart3'], fps: 2 },
  shield: { name: 'Shields', icon: 'shield', words: /shields?/i },
  fleet: { name: 'All your ships', icon: 'fleet', words: /\b(?:war)?ships?\b|\ballies\b|\bfleets?\b/i, frames: ['fleet', 'fleet2'], fps: 8 },
};

const ORDER = Object.keys(SUBJECTS);

/** The subjects a text mentions, in the order they appear. */
export function subjectsIn(text: string, max = 3): string[] {
  let rest = plainText(text);
  const hits: { id: string; at: number }[] = [];
  for (const id of ORDER) {
    const re = SUBJECTS[id].words;
    if (!re) continue;
    const all = new RegExp(re.source, 'gi');
    let first = -1;
    // Blank out what matched, so "enemy ships" is not read again as "ships".
    rest = rest.replace(all, (m, ...args) => {
      const at = args[args.length - 2] as number;
      if (first < 0) first = at;
      return ' '.repeat(m.length);
    });
    if (first >= 0) hits.push({ id, at: first });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id).slice(0, max);
}

/** The subject behind one modifier (keys as in modstats). */
function subjectOfStat(key: string): string | null {
  const [group, name] = key.split('.');
  if (group === 'unit') return name === 'fighter' ? 'fighters' : SUBJECTS[name] ? name : 'fleet';
  if (group === 'role') return name;
  if (group === 'dmgT') return name === 'fighter' ? 'fighters' : 'fleet';
  switch (key) {
    case 'embers': case 'salvage': case 'bounty': case 'interest':
      return 'embers';
    case 'lore': case 'reverse':
      return 'lore';
    case 'hangar': case 'hangarMul':
      return 'hangar';
    case 'draft':
      return 'boon';
    case 'kindleCost': case 'kindleSpeed':
      return 'kindle';
    case 'glowRate': case 'upgradeCost': case 'upgradeSpeed': case 'worldHp': case 'worldGun': case 'allGuns': case 'militia': case 'anchors': case 'scorched':
      return 'world';
    case 'hearthHp': case 'hearthGun': case 'echo':
      return 'hearth';
    case 'laneSpeed': case 'jumpCharge':
      return 'speed';
    case 'fighters':
      return 'fighters';
    case 'storm':
      return 'target';
    case 'bounty3':
      return 'corsairs';
    case 'xp':
      return null;
    default:
      return 'fleet';
  }
}

const BLUEPRINT_SHIP: Record<string, string> = { bpCarrier: 'carrier', bpLancer: 'lancer', bpDread: 'dreadnought', bpStarbase: 'starbase' };

/**
 * What a Boon affects: its own list if it has one; else the modifiers it changes for this house, then
 * whatever else its text names. A subject the modifiers show but the text does not ("+15% shields"
 * never says "ships") comes first.
 */
export function boonSubjects(g: Game, f: Faction, c: CardDef, max = 3): string[] {
  if (c.icons) return c.icons.slice(0, max);
  if (BLUEPRINT_SHIP[c.id]) return [BLUEPRINT_SHIP[c.id]];
  const fromText = subjectsIn(c.desc, 6);
  const fromMods: string[] = [];
  if (c.mods) {
    for (const d of modDelta(g.computeMods(f), g.computeMods(f, [c.id]))) {
      const s = subjectOfStat(d.key);
      if (s && !fromMods.includes(s)) fromMods.push(s);
    }
  }
  const out = fromMods.filter((s) => !fromText.includes(s));
  for (const s of fromText) if (!out.includes(s)) out.push(s);
  return out.slice(0, max);
}

/** "Strikers", "Embers and Lore", "Your Ark, Dreadnoughts and all your ships". */
export function subjectNames(ids: string[]): string {
  const names = ids.map((id) => SUBJECTS[id]?.name ?? id);
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// ---------------------------------------------------------------------------
// Drawing, with motion
// ---------------------------------------------------------------------------

/** How the pictures are drawn: their sizes, and the clock that moves them. */
export interface Look {
  /** The house color (ships and "your" icons take it). */
  color: string;
  /** Pixel scale for ships, and for icons (default: the same). */
  scale: number;
  iconScale?: number;
  /** UI time in seconds; without it the pictures stand still. */
  t?: number;
  /** Under the pointer: everything moves faster. */
  lively?: boolean;
  /** Ships turn through their headings (they need a square cell for that); else they face right. */
  turn?: boolean;
}

/** A lighter letter for each icon color: the glint. */
const LIGHTER: Record<string, string> = { e: 'g', g: 'w', r: 'e', x: 'r', v: 'p', p: 'w', k: 'm', m: 'w', d: 'm', s: 'd', t: 'w', a: 't', c: 'w', i: 's', n: 'i' };

/**
 * A ship's heading (0..15) at time t: it holds on each quarter turn (the four clean, unrotated
 * views of the sprite) and swings smoothly to the next. Under the pointer it spins without pause.
 */
function heading(t: number, lively: boolean): number {
  if (lively) return Math.floor((t / 1.5) * 16) % 16;
  const HOLD = 1.3;
  const TURN = 0.7;
  const q = Math.floor(t / (HOLD + TURN));
  const u = t - q * (HOLD + TURN);
  const k = u < HOLD ? 0 : (u - HOLD) / TURN;
  const eased = k * k * (3 - 2 * k);
  return (q * 4 + Math.round(eased * 4)) % 16;
}

/** The icon's rows at time t (its frame, marched or spun), and a name for the cache. */
function iconFrame(s: SubjectDef, t: number, lively: boolean): { key: string; rows: string[] } {
  const base = s.icon!;
  const n = Math.floor(t * (s.fps ?? 0) * (lively ? 2 : 1));
  if (s.frames) {
    const name = s.frames[n % s.frames.length];
    return { key: name, rows: ICONS[name] ?? ICONS[base] };
  }
  const rows = ICONS[base] ?? ICONS.star;
  if (s.move === 'march') {
    const w = rows[0].length;
    const k = n % w;
    return { key: `${base}~m${k}`, rows: k ? rows.map((r) => r.slice(w - k) + r.slice(0, w - k)) : rows };
  }
  if (s.move === 'spin') {
    // The surface slides along each row inside the disc: the little world turns.
    const k = n % 15;
    return {
      key: `${base}~s${k}`,
      rows: rows.map((r) => {
        const at = [...r].map((ch, i) => (ch === '.' ? -1 : i)).filter((i) => i >= 0);
        const out = [...r];
        at.forEach((pos, j) => (out[pos] = r[at[(j - (k % at.length) + at.length) % at.length]]));
        return out.join('');
      }),
    };
  }
  return { key: base, rows };
}

/** The picture of a subject at this moment (i staggers neighbours so they do not move in step). */
function picture(id: string, look: Look, i: number): HTMLCanvasElement | null {
  const s = SUBJECTS[id];
  if (!s) return null;
  const moving = look.t !== undefined;
  const t = (look.t ?? 0) + i * 0.83;
  const lively = !!look.lively;
  if (s.ship) {
    const dir = moving && look.turn && !isStructureArt(s.ship) ? heading(t, lively) : 0;
    const flick = moving && Math.floor(t * (lively ? 14 : 8)) % 2 === 0;
    return shipSprite(s.ship, look.color, dir, flick);
  }
  if (!s.icon) return null;
  if (!moving) return pixelCanvas(s.icon, ICONS[s.icon] ?? ICONS.star, look.color);
  let { key, rows } = iconFrame(s, t, lively);
  // Now and then a glint runs across the icon from its top-left corner.
  const period = lively ? 1.5 : 3.6;
  const sweep = 0.45;
  const local = (t + i * 0.9) % period;
  if (local < sweep) {
    const d = Math.floor((local / sweep) * (rows[0].length + rows.length));
    key += '~g' + d;
    rows = rows.map((r, y) => [...r].map((ch, x) => (x + y === d && ch !== '.' ? (LIGHTER[ch] ?? ch) : ch)).join(''));
  }
  return pixelCanvas(key, rows, look.color);
}

/** The space one picture takes (at scale 1) and the scale it is drawn at. */
function cell(id: string, look: Look): { w: number; h: number; k: number } | null {
  const s = SUBJECTS[id];
  if (!s) return null;
  if (s.ship) {
    const { w, h } = spriteSize(s.ship);
    // A turning ship needs room for its widest view (at 45 degrees).
    const side = look.turn && !isStructureArt(s.ship) && !isTroopArt(s.ship) ? Math.ceil((w + h) / Math.SQRT2) : 0;
    return { w: side || w, h: side || h, k: look.scale };
  }
  if (!s.icon) return null;
  const rows = ICONS[s.icon] ?? ICONS.star;
  return { w: rows[0].length, h: rows.length, k: look.iconScale ?? look.scale };
}

/** The size of a row of subject pictures. */
export function subjectsSize(ids: string[], look: Look): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const id of ids) {
    const c = cell(id, look);
    if (!c) continue;
    w += c.w * c.k + 2 * look.scale;
    h = Math.max(h, c.h * c.k);
  }
  return { w: Math.max(0, w - 2 * look.scale), h };
}

/**
 * Draw the pictures in a row `rowH` tall, each centred in its cell, starting at x (or ending there
 * with `right`, or centred on it with `center`). Returns the width drawn.
 */
export function drawSubjects(g: Ctx, ids: string[], x: number, y: number, rowH: number, look: Look, align: 'left' | 'right' | 'center' = 'left'): number {
  const { w } = subjectsSize(ids, look);
  let px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ids.forEach((id, i) => {
    const c = cell(id, look);
    const pic = c && picture(id, look, i);
    if (!c || !pic) return;
    const cw = c.w * c.k;
    g.drawImage(pic, Math.round(px + (cw - pic.width * c.k) / 2), Math.round(y + (rowH - pic.height * c.k) / 2), pic.width * c.k, pic.height * c.k);
    px += cw + 2 * look.scale;
  });
  return w;
}

/** Deterministic pseudo-random in [0,1) from two integers. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The little window a Boon card shows its subject in: deep space with a few stars that twinkle
 * (each to its own beat) and drift slowly past.
 */
export function starWindow(g: Ctx, x: number, y: number, w: number, h: number, seed: number, t: number, lively = false, travel?: number) {
  g.fillStyle = PAL.void;
  g.fillRect(x, y, w, h);
  const n = Math.max(5, Math.round((w * h) / 220));
  for (let i = 0; i < n; i++) {
    const depth = hash(seed, i * 3 + 2);
    // Far stars are dim and slow; near ones brighter and quicker.
    // With `travel` (a distance the caller keeps adding to) a change of speed never makes the stars jump.
    const slid = travel !== undefined ? travel * (0.4 + depth) : t * (lively ? 5 : 1.4) * (0.4 + depth);
    const sx = (((hash(seed, i * 3) * w - slid) % w) + w) % w;
    const sy = Math.floor(hash(seed, i * 3 + 1) * h);
    const beat = Math.sin(t * (1.2 + depth * 2.5) + i * 1.7);
    if (beat < -0.55) continue;
    g.fillStyle = depth > 0.66 ? (beat > 0.6 ? PAL.bone : PAL.mist) : depth > 0.33 ? PAL.dusk : PAL.slate;
    g.fillRect(x + Math.floor(sx), y + sy, 1, 1);
  }
}
