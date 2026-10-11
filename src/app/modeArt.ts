/**
 * The living pictures of the title screen, one for each way to play. Like the house banners, they are
 * drawn with the game's own sprites on small canvases shown at three times their size.
 *
 * - `sector`: a tiny sector plays itself. A house lights the dark worlds one by one, meets a rival,
 *   takes its Hearth and is crowned; then a new sector is dealt to other houses, as in a run.
 * - `ages`: the climb. The swift line of each age marches on a path toward an Ark that lifts into the
 *   stars. With `data-era` (a saved run), the picture shows how far that run has climbed, in the
 *   color of its house (`data-color`).
 * - `daily`: the chart of today's sector. It is the real one: the map every player is dealt today.
 *
 * And three for How to Play (app/howto.ts), each one move of the game in a few seconds:
 * - `kindle`: a seed ship lights a dark world, and the world starts to earn.
 * - `fleet`: the three ships of the line; each in turn fires on the one it beats.
 * - `boons`: Lore fills, three Boons are dealt, one is taken.
 *
 * A picture runs faster under the pointer.
 */
import { Game } from '../game/Game';
import { RARITY_COLOR } from '../game/data/cards';
import { LAST_CRADLE_ERA, SPACE } from '../game/data/eras';
import { HEIRS } from '../game/data/heirs';
import { dailySeed } from '../game/rng';
import { PAL, SHADE } from '../render/palette';
import { bar, box, ctx2d, line, px, rect, type Ctx } from '../render/pixel';
import { iconCanvas, ICONS, pixelCanvas, shipSprite, silhouette } from '../render/sprites';

const SCALE = 3;
const HOW_SCALE = 4;
/** The player asked for less motion: the pictures stand still. */
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Each picture keeps its own time, so that a change of speed never makes it jump. */
const clocks = new WeakMap<HTMLCanvasElement, { c: number; last: number }>();

/** Draw every such picture on the page (call once a frame while a menu shows). */
export function drawModeArt(root: HTMLElement, t: number) {
  root.querySelectorAll<HTMLCanvasElement>('canvas.mode-art').forEach((el) => {
    // (The pictures of How to Play are of single ships and worlds: they are shown larger.)
    const scale = el.classList.contains('how-art') ? HOW_SCALE : SCALE;
    const w = Math.max(48, Math.round(el.clientWidth / scale));
    const h = Math.max(12, Math.round(el.clientHeight / scale));
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    let k = clocks.get(el);
    if (!k) clocks.set(el, (k = { c: 0, last: t }));
    const lively = !!el.closest('button, .ages-head')?.matches(':hover');
    k.c += Math.min(0.1, Math.max(0, t - k.last)) * (lively ? 2 : 1);
    k.last = t;
    const g = ctx2d(el);
    g.clearRect(0, 0, w, h);
    const art = el.dataset.art;
    if (art === 'sector') sector(g, w, h, calm ? STILL : k.c);
    else if (art === 'daily') daily(g, w, h, calm ? -1 : k.c);
    else if (art === 'kindle') kindle(g, w, h, calm ? -1 : k.c);
    else if (art === 'fleet') fleet(g, w, h, calm ? -1 : k.c);
    else if (art === 'boons') boons(g, w, h, calm ? -1 : k.c);
    else ages(g, w, h, calm ? 0 : k.c, el.dataset.era ? parseInt(el.dataset.era, 10) : -1, el.dataset.color ?? PAL.gold);
  });
}

function hash(i: number): number {
  let h = Math.imul(i + 11, 374761393) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A few stars, each to its own beat. */
function sky(g: Ctx, w: number, h: number, seed: number, c: number, n: number, where: (u: number) => number = (u) => u) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(w * where(hash(seed + i * 3)));
    const y = Math.floor(hash(seed + i * 3 + 1) * h);
    const beat = Math.sin(c * (1 + hash(seed + i * 3 + 2) * 2) + i);
    if (beat < -0.3) continue;
    px(g, x, y, beat > 0.7 ? PAL.bone : i % 3 === 0 ? PAL.mist : PAL.dusk);
  }
}

// ---------------------------------------------------------------------------
// The climb of an Ages run
// ---------------------------------------------------------------------------

/** `era` 0 and up: a saved run that has climbed that far, of the house whose color is `color`. */
function ages(g: Ctx, w: number, h: number, c: number, era: number, color: string) {
  const saved = era >= 0;
  const ground = h - 2;
  // Six places, evenly spaced (the names of the ages line up under them): five on the path, the last in the sky.
  const at = (i: number) => Math.round((w * (i + 0.5)) / 6);
  // The stars the Ark is bound for: more of them toward the right, and none where the figures stand.
  sky(g, w, Math.max(4, h - 12), 5, c, 22, Math.sqrt);
  sky(g, w, h - 3, 90, c, 8, (u) => 0.86 + u * 0.14);
  // The path, as far as the foot of the Ark (the part a saved run has walked is lit).
  for (let x = 2; x < at(LAST_CRADLE_ERA) + 8; x += 3) px(g, x, ground, saved && x <= at(era) + 4 ? PAL.gold : PAL.slate);
  // The swift line of each age, marching on the spot.
  for (let i = 0; i <= LAST_CRADLE_ERA; i++) {
    let spr: HTMLCanvasElement;
    if (!saved) spr = shipSprite('striker', HEIRS[i % HEIRS.length].color, 0, Math.floor(c * 5 + i * 0.6) % 2 === 0, i);
    else if (i > era) spr = silhouette('striker', PAL.indigo, 0, i);
    else spr = shipSprite('striker', color, 0, i === era && Math.floor(c * 5) % 2 === 0, i);
    g.drawImage(spr, at(i) - (spr.width >> 1), ground - spr.height);
  }
  // The Ark, nose up, riding its own fire (or still waiting, for a saved run that has not built it).
  const lift = saved ? 0 : Math.round(Math.sin(c * 1.4) * 1.2);
  const ark = saved ? silhouette('ark', PAL.indigo, 12, SPACE) : shipSprite('ark', HEIRS[SPACE % HEIRS.length].color, 12, Math.floor(c * 9) % 2 === 0, SPACE);
  const ay = Math.max(0, Math.round((h - ark.height) / 2) - 1 + lift);
  g.drawImage(ark, at(SPACE) - (ark.width >> 1), ay);
  if (!saved) {
    g.fillStyle = Math.floor(c * 12) % 2 === 0 ? PAL.gold : PAL.ember;
    g.fillRect(at(SPACE), ay + ark.height, 1, 1 + (Math.floor(c * 7) % 2));
  }
}

// ---------------------------------------------------------------------------
// A sector that plays itself
// ---------------------------------------------------------------------------

/** Seconds one little run lasts, and the moment of it shown when the picture stands still. */
const RUN = 12;
const STILL = 6.2;
/** Flights along the starlanes: from world, to world, leaving at, arriving at, and whether it is the player's. */
const FLIGHTS: [number, number, number, number, boolean][] = [
  [0, 1, 1.0, 2.2, true],
  [4, 3, 1.8, 3.0, false],
  [1, 2, 3.4, 4.6, true],
  [2, 3, 5.4, 6.6, true],
  [3, 4, 7.6, 8.8, true],
];
/** Fights over a rival's world: which world, from when, until when (the world changes hands at the end). */
const FIGHTS: [number, number, number][] = [
  [3, 6.6, 7.0],
  [4, 8.8, 9.4],
];

/** A small round body: `r` 2 is a disc five pixels across, 3 one of seven. */
function blob(g: Ctx, x: number, y: number, r: number, c: string) {
  g.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt((r + 0.3) * (r + 0.3) - dy * dy));
    g.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}

/** A world: dark, or lit in the color of the house that holds it. */
function orb(g: Ctx, x: number, y: number, r: number, color: string | null, bright: boolean) {
  if (!color) {
    blob(g, x, y, r, PAL.slate);
    g.fillStyle = PAL.indigo;
    g.fillRect(x - 1, y + r, 3, 1);
    px(g, x + r, y + 1, PAL.indigo);
    return;
  }
  const a = g.globalAlpha;
  g.globalAlpha = a * (bright ? 0.5 : 0.3);
  blob(g, x, y, r + 1, color);
  g.globalAlpha = a;
  blob(g, x, y, r, color);
  g.fillStyle = SHADE[color] ?? PAL.indigo;
  g.fillRect(x - 1, y + r, 3, 1);
  px(g, x + r, y + 1, SHADE[color] ?? PAL.indigo);
  px(g, x - 1, y - r + 1, PAL.bone);
}

function sector(g: Ctx, w: number, h: number, c: number) {
  const k = Math.floor(c / RUN);
  const u = c - k * RUN;
  const N = 5;
  // A new sector every run: other houses, other worlds.
  const me = HEIRS[k % HEIRS.length].color;
  const foe = HEIRS[(k + 2 + Math.floor(hash(k * 7 + 1) * 3)) % HEIRS.length].color;
  const X = (i: number) => Math.round((w * (i + 0.5)) / N + (hash(k * 31 + i) - 0.5) * 6);
  // (The first and the last world are the Hearths of the two houses, and larger. The rival's sits low,
  // under the crown it will yield.)
  const Y = (i: number) => (i === N - 1 ? h - 7 : Math.round(6 + hash(k * 17 + i * 5 + 3) * (h - 13)));
  const R = (i: number) => (i === 0 || i === N - 1 ? 3 : 2);
  sky(g, w, h, 60 + (k % 50) * 100, c, Math.round((w * h) / 80));
  g.globalAlpha = Math.max(0, Math.min(1, u / 0.5, (RUN - u) / 0.7));
  const owner = [me, u >= 2.2 ? me : null, u >= 4.6 ? me : null, u >= 7 ? me : u >= 3 ? foe : null, u >= 9.4 ? me : foe];
  const crowned = u >= 9.6;
  for (let i = 0; i < N - 1; i++) line(g, X(i), Y(i), X(i + 1), Y(i + 1), owner[i] && owner[i] === owner[i + 1] ? PAL.slate : PAL.indigo, 2);
  for (let i = 0; i < N; i++) orb(g, X(i), Y(i), R(i), owner[i], crowned && Math.floor(c * 4 + i) % 2 === 0);
  for (const [from, to, t0, t1, mine] of FLIGHTS) {
    if (u < t0 || u > t1) continue;
    const p = (u - t0) / (t1 - t0);
    const e = p * p * (3 - 2 * p);
    const dx = X(to) - X(from);
    const dy = Y(to) - Y(from);
    const dir = (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 16) + 16) % 16;
    const spr = shipSprite('scout', mine ? me : foe, dir, Math.floor(c * 10) % 2 === 0, SPACE);
    g.drawImage(spr, Math.round(X(from) + dx * e) - (spr.width >> 1), Math.round(Y(from) + dy * e) - (spr.height >> 1));
  }
  for (const [at, t0, t1] of FIGHTS) {
    if (u < t0 || u > t1) continue;
    const beat = Math.floor(c * 14);
    for (let j = 0; j < 4; j++) {
      const a = hash(beat * 7 + j) * Math.PI * 2;
      const d = R(at) + 1 + hash(beat * 3 + j + 40) * 2;
      px(g, Math.round(X(at) + Math.cos(a) * d), Math.round(Y(at) + Math.sin(a) * d), j % 2 === 0 ? PAL.bone : beat % 2 === 0 ? PAL.gold : PAL.ember);
    }
  }
  // The crown, over the Hearth that was the rival's.
  if (crowned && (u >= 10 || Math.floor(c * 8) % 2 === 0)) {
    const crown = pixelCanvas('conquest', ICONS.conquest);
    g.drawImage(crown, X(N - 1) - 2, Y(N - 1) - R(N - 1) - 8);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The chart of today's sector
// ---------------------------------------------------------------------------

/** Positions are fractions of the sector's width and height. A dot: x, y, color, and whether it is a star or a Hearth. */
interface Chart {
  seed: number;
  lanes: [number, number, number, number][];
  dots: [number, number, string, 'world' | 'star' | 'hearth'][];
}
let chart: Chart | null = null;

function todaysChart(): Chart {
  const seed = dailySeed();
  if (chart && chart.seed === seed) return chart;
  chart = { seed, lanes: [], dots: [] };
  try {
    // (The map of a run depends on its seed alone, not on the house that plays it.)
    const game = Game.create({ seed, size: 'medium', difficulty: 1, heir: HEIRS[0].id, perks: {}, unlockLegendary: false, unlockPacts: false, daily: true });
    const b = game.bounds;
    const fx = (x: number) => (x - b.minX) / Math.max(1, b.maxX - b.minX);
    const fy = (y: number) => (y - b.minY) / Math.max(1, b.maxY - b.minY);
    for (const l of game.lanes) {
      const from = game.nodes[l.a];
      const to = game.nodes[l.b];
      // Only the starlanes between systems: those inside one are too small to tell apart here.
      if (from.system !== to.system || from.system < 0) chart.lanes.push([fx(from.x), fy(from.y), fx(to.x), fy(to.y)]);
    }
    for (const n of game.nodes) {
      if (n.kind === 'star') continue;
      chart.dots.push([fx(n.x), fy(n.y), n.kind === 'planet' ? PAL.slate : PAL.violet, n.capitalOf >= 0 ? 'hearth' : 'world']);
    }
    for (const s of game.systems) chart.dots.push([fx(s.x), fy(s.y), s.color, 'star']);
  } catch {
    // The chart stays empty; the card still says what the daily run is.
  }
  return chart;
}

/** `c` below zero: the picture stands still. */
function daily(g: Ctx, w: number, h: number, c: number) {
  const ch = todaysChart();
  const X = (f: number) => Math.round(4 + f * (w - 9));
  const Y = (f: number) => Math.round(3 + f * (h - 7));
  sky(g, w, h, 300, Math.max(0, c), Math.round((w * h) / 160));
  for (const [x0, y0, x1, y1] of ch.lanes) line(g, X(x0), Y(y0), X(x1), Y(y1), PAL.indigo, 2);
  // A sweep crosses the chart, and what it has just passed shines for a moment.
  const sweep = c < 0 ? -99 : ((c / 5) % 1.2) * w;
  ch.dots.forEach(([fx, fy, color, kind], i) => {
    const x = X(fx);
    const y = Y(fy);
    const lit = x <= sweep && x > sweep - 9;
    if (kind === 'star') {
      px(g, x, y, lit ? PAL.bone : color);
      const arm = lit ? color : (SHADE[color] ?? PAL.indigo);
      px(g, x - 1, y, arm);
      px(g, x + 1, y, arm);
      px(g, x, y - 1, arm);
      px(g, x, y + 1, arm);
    } else if (kind === 'hearth') px(g, x, y, lit || Math.floor(Math.max(0, c) * 2 + i) % 2 === 0 ? PAL.gold : PAL.ember);
    else px(g, x, y, lit ? PAL.mist : color);
  });
  if (sweep >= 0 && sweep < w) {
    g.globalAlpha = 0.4;
    g.fillStyle = PAL.teal;
    g.fillRect(Math.floor(sweep), 0, 1, h);
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// How to Play: one move of the game each (`c` below zero: the picture stands still)
// ---------------------------------------------------------------------------

/** A few sparks round a point, new ones every beat. */
function sparks(g: Ctx, x: number, y: number, r: number, beat: number, n: number) {
  for (let j = 0; j < n; j++) {
    const a = hash(beat * 7 + j) * Math.PI * 2;
    const d = r + 1 + hash(beat * 3 + j + 40) * 2;
    px(g, Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), j % 2 === 0 ? PAL.bone : beat % 2 === 0 ? PAL.gold : PAL.ember);
  }
}

/** Kindling: a seed ship leaves a lit world for a dark one and lights it, and the new world starts to earn. */
function kindle(g: Ctx, w: number, h: number, c: number) {
  const T = 5.4;
  const u = c < 0 ? 3.6 : c % T;
  const me = HEIRS[0].color;
  const y = Math.round(h / 2) + 2;
  const x0 = Math.round(w * 0.16);
  const x1 = Math.round(w * 0.8);
  sky(g, w, h, 410, Math.max(0, c), Math.round((w * h) / 90));
  g.globalAlpha = c < 0 ? 1 : Math.max(0, Math.min(1, u / 0.4, (T - u) / 0.5));
  const lit = u >= 2.6;
  line(g, x0, y, x1, y, lit ? PAL.slate : PAL.indigo, 2);
  orb(g, x0, y, 3, me, false);
  orb(g, x1, y, 3, lit ? me : null, lit && u < 3.3 && Math.floor(u * 10) % 2 === 0);
  if (u >= 0.7 && u < 2.6) {
    const p = (u - 0.7) / 1.9;
    const e = p * p * (3 - 2 * p);
    const spr = shipSprite('seed', me, 0, Math.floor(u * 10) % 2 === 0, SPACE);
    g.drawImage(spr, Math.round(x0 + 6 + (x1 - x0 - 12) * e) - (spr.width >> 1), y - (spr.height >> 1));
  }
  if (lit && u < 3.1) sparks(g, x1, y, 3, Math.floor(u * 14), 5);
  // What a lit world is for: Embers.
  if (u >= 3.2) {
    const em = pixelCanvas('ember', ICONS.ember);
    g.drawImage(em, x1 - (em.width >> 1), y - 5 - em.height - Math.min(2, Math.floor((u - 3.2) * 4)));
  }
  g.globalAlpha = 1;
}

const LINE = ['striker', 'breaker', 'guardian'] as const;

/** The triangle: each ship of the line in turn (the names stand under them) fires on the one it beats. */
function fleet(g: Ctx, w: number, h: number, c: number) {
  const BEAT = 1.8;
  const k = c < 0 ? 0 : Math.floor(c / BEAT) % 3;
  const u = c < 0 ? 0.5 : (c % BEAT) / BEAT;
  const prey = (k + 1) % 3;
  const X = (i: number) => Math.round((w * (i + 0.5)) / 3);
  const y = Math.round(h / 2) + 1;
  const right = prey > k;
  sky(g, w, h, 520, Math.max(0, c), Math.round((w * h) / 110));
  const struck = u > 0.5;
  for (let i = 0; i < 3; i++) {
    const dir = i === k ? (right ? 0 : 8) : i === prey ? (right ? 8 : 0) : 0;
    let spr: HTMLCanvasElement;
    if (i === k) spr = shipSprite(LINE[i], HEIRS[0].color, dir, Math.floor(u * 16) % 2 === 0, SPACE);
    else if (i !== prey) spr = silhouette(LINE[i], PAL.slate, dir, SPACE);
    else if (struck && Math.floor(u * 20) % 2 === 0) spr = silhouette(LINE[i], PAL.bone, dir, SPACE);
    else spr = shipSprite(LINE[i], HEIRS[2].color, dir, false, SPACE);
    g.drawImage(spr, X(i) - (spr.width >> 1), y - (spr.height >> 1));
  }
  // Its shots cross to the ship it beats (the Guardian's go over the Breaker between them, back to the Striker).
  const from = X(k) + (right ? 7 : -7);
  const to = X(prey) + (right ? -6 : 6);
  if (u > 0.08 && u < 0.92) {
    for (let j = 0; j < 3; j++) {
      const p = (u * 2.4 + j / 3) % 1;
      const over = right ? 0 : Math.round(Math.sin(p * Math.PI) * Math.min(8, y - 2));
      px(g, Math.round(from + (to - from) * p), y - over + (right ? j - 1 : 0), j === 1 ? PAL.bone : PAL.gold);
    }
  }
  if (struck) sparks(g, X(prey), y, 3, Math.floor(u * 22), 4);
}

/** Boons: Lore fills, three Boons are dealt, the pointer goes over them and one is taken. */
function boons(g: Ctx, w: number, h: number, c: number) {
  const T = 6.2;
  const u = c < 0 ? 3.5 : c % T;
  const taken = u >= 4.3;
  // Lore, along the top: it fills, and is spent on the choice.
  const lore = iconCanvas('lore');
  const bw = Math.min(w - 16, 48);
  const bx = (w - bw - lore.width - 2) >> 1;
  g.drawImage(lore, bx, 0);
  bar(g, bx + lore.width + 2, 3, bw, 2, taken ? 0 : u / 1.4, PAL.violet, PAL.night, PAL.indigo);
  if (u < 1.4) return;
  const cw = 15;
  const gap = 4;
  const top = 9;
  const ch = Math.max(10, h - top - 1);
  const x0 = (w - cw * 3 - gap * 2) >> 1;
  const rarity = ['common', 'rare', 'epic'] as const;
  const cats = ['catWealth', 'catWar', 'catLore'];
  const picked = 2;
  const over = u < 2.5 ? 0 : u < 3.3 ? 1 : picked;
  for (let i = 0; i < 3; i++) {
    const rise = Math.max(0, Math.min(1, (u - 1.4 - i * 0.12) / 0.25));
    if (rise <= 0) continue;
    const col = RARITY_COLOR[rarity[i]];
    const x = x0 + i * (cw + gap);
    const y = top + Math.round((1 - rise) * ch) - (i === over && !taken ? 1 : 0);
    g.globalAlpha = taken && i !== picked ? Math.max(0.15, 1 - (u - 4.3) * 2.5) : 1;
    const flash = taken && i === picked && u < 5.1 && Math.floor(u * 10) % 2 === 0;
    box(g, x, y, cw, ch, PAL.night, flash ? PAL.bone : i === over ? PAL.gold : col);
    g.drawImage(iconCanvas(cats[i], col), x + ((cw - 5) >> 1), y + 2);
    for (let l = 0; l < 3 && y + 9 + l * 2 < top + ch - 2; l++) rect(g, x + 2, y + 9 + l * 2, cw - 4 - (l === 2 ? 4 : l), 1, PAL.slate);
  }
  g.globalAlpha = 1;
  if (taken && u < 4.9) sparks(g, x0 + picked * (cw + gap) + (cw >> 1), top + (ch >> 1), 8, Math.floor(u * 14), 5);
}
