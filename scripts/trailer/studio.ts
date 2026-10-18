/**
 * The trailer studio (make.mjs drives it, in studio.html on the dev server): the game's own sectors,
 * played by its own houses and drawn by its own renderer, frame by frame at 30 a second, with words over
 * them in the game's own type; and their sound, made offline to the frame: the game's own music and the
 * sounds of the fighting on screen.
 *
 * Everything is drawn at the game's own size (480x270, as on a 1080p screen) and made four times larger,
 * pixel for pixel, when the video is made: the words are pixels of the same size as the worlds'. Upright,
 * for a Short (studio.html?portrait), the same pixels stand the other way: 270x480, made 1080x1920.
 */
import { playBattleSounds } from '../../src/audio/battleSounds';
import { Music, TRACKS } from '../../src/audio/Music';
import { Sfx, type SoundId } from '../../src/audio/Sfx';
import { TICK } from '../../src/game/constants';
import { PAL } from '../../src/game/data/heirs';
import { Game } from '../../src/game/Game';
import type { Difficulty, MapSize } from '../../src/game/types';
import { isHearth } from '../../src/game/worldStats';
import { defaultSettings } from '../../src/meta/profile';
import { emptyView, Renderer } from '../../src/render/Renderer';
import { Screen } from '../../src/render/Screen';
import flameSvg from '../../site/favicon.svg?raw';
import { drawHouseBanners } from '../../src/app/houseArt';
import { drawModeArt } from '../../src/app/modeArt';
import { HEIR_BY_ID } from '../../src/game/data/heirs';
import { VICTORIES } from '../../src/game/data/victories';
import { iconCanvas, shipSprite } from '../../src/render/sprites';
import { SPACE } from '../../src/game/data/eras';
import { starWindow } from '../../src/ui/subjects';

export const FPS = 30;
/** Upright, for a Short (9:16): the page is opened as studio.html?portrait. */
export const PORTRAIT = new URLSearchParams(location.search).has('portrait');
export const W = PORTRAIT ? 270 : 480;
export const H = PORTRAIT ? 480 : 270;

export interface SectorSpec {
  seed: number;
  size: MapSize;
  heir: string;
  difficulty: Difficulty;
  /** An Ages run, on its cradle world. */
  ages?: boolean;
}

function makeGame(s: SectorSpec): Game {
  return Game.create({
    seed: s.seed, size: s.size, difficulty: s.difficulty, heir: s.heir, perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true,
    ...(s.ages ? { mode: 'ages' as const, stage: 'cradle' as const } : {}),
  });
}

// ---------------------------------------------------------------------------------------------------
// Finding the moments of a sector worth a shot
// ---------------------------------------------------------------------------------------------------

export interface Moment {
  kind: 'kindle' | 'conquest' | 'hearth' | 'nova' | 'battle' | 'fall' | 'era' | 'launch';
  tick: number;
  node: number;
  score: number;
  who: number;
  /** A battle's: the houses with ships there (ids), and -1 if the Hollow or raiders are there too. */
  sides?: number[];
}

/** Play a sector through (its houses all the game's AI) and note what happened where: the shots there are. */
export function scan(s: SectorSpec, minutes: number) {
  const g = makeGame(s);
  g.fxEnabled = true;
  const owner = g.nodes.map((n) => n.owner);
  const hearth = g.nodes.map((n) => isHearth(n));
  const alive = g.factions.map((f) => f.alive);
  const heat = new Map<string, number>();
  const sides = new Map<string, Set<number>>();
  const moments: Moment[] = [];
  const start = new Map(g.factions.map((f) => [f.id, f.capital]));
  const era = g.factions.map((f) => f.era);
  const launched = g.factions.map((f) => f.launchedAt >= 0);
  const t0 = performance.now();
  for (let i = 0; i < minutes * 60 * 20 && !g.outcome; i++) {
    g.step();
    for (const f of g.fx) {
      if (f.k === 'nova') moments.push({ kind: 'nova', tick: g.tick, node: f.node, score: 10, who: -1 });
      else if ((f.k === 'shot' || f.k === 'beam' || f.k === 'boom') && f.node >= 0) {
        const key = `${f.node}:${Math.floor(g.tick / 100)}`;
        heat.set(key, (heat.get(key) ?? 0) + (f.k === 'boom' ? (f.size >= 20 ? 12 : 3) : 1));
        if (!sides.has(key)) sides.set(key, new Set());
      }
    }
    g.fx.length = 0;
    // (Who is fighting: every second, the houses with ships at each world being fought over.)
    if (g.tick % 20 === 0) {
      const now = Math.floor(g.tick / 100);
      for (const u of g.unitList) {
        if (u.dead || u.lane) continue;
        sides.get(`${u.node}:${now}`)?.add(g.factions[u.owner]?.kind === 'empire' ? u.owner : -1);
      }
    }
    for (const n of g.nodes) {
      const was = owner[n.id];
      if (n.owner === was) continue;
      if (n.kind === 'planet' && n.owner >= 0) {
        if (was < 0) moments.push({ kind: 'kindle', tick: g.tick, node: n.id, score: 1, who: n.owner });
        else moments.push({ kind: hearth[n.id] ? 'hearth' : 'conquest', tick: g.tick, node: n.id, score: hearth[n.id] ? 8 : 3, who: n.owner });
      }
      owner[n.id] = n.owner;
      hearth[n.id] = isHearth(n);
    }
    g.factions.forEach((f, i) => {
      if (!launched[i] && f.launchedAt >= 0) moments.push({ kind: 'launch', tick: g.tick, node: start.get(i) ?? -1, score: 9, who: i });
      else if (alive[i] && !f.alive) moments.push({ kind: 'fall', tick: g.tick, node: -1, score: 9, who: i });
      if (f.era > era[i] && f.launchedAt < 0) moments.push({ kind: 'era', tick: g.tick, node: f.capital, score: f.era, who: i });
      alive[i] = f.alive;
      era[i] = f.era;
      launched[i] = f.launchedAt >= 0;
    });
  }
  for (const [key, v] of heat) {
    const [node, w] = key.split(':').map(Number);
    if (v >= 40) moments.push({ kind: 'battle', tick: w * 100, node, score: v, who: -1, sides: [...(sides.get(key) ?? [])].sort() });
  }
  return {
    moments,
    ms: Math.round(performance.now() - t0),
    end: g.outcome ? { tick: g.tick, winner: g.outcome.winner, victory: g.outcome.victory } : null,
    houses: g.factions.filter((f) => f.kind === 'empire').map((f) => ({ id: f.id, name: f.name, color: f.color, hearth: start.get(f.id) ?? -1 })),
    nodes: g.nodes.map((n) => ({ x: n.x, y: n.y, kind: n.kind, name: n.name })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------------------------------

/** Where the camera is at a moment of a shot (0..1 through it): over a world, a place, or the whole sector. */
export interface CamKey {
  t: number;
  node?: number;
  x?: number;
  y?: number;
  /** A zoom, or 'fit' (the whole sector), `fit` times nearer. */
  zoom: number | 'fit';
  fit?: number;
  /** Off the place, in screen pixels at the game's size (to leave room for words). */
  dx?: number;
  dy?: number;
  /** With the biggest fleet on the move when the shot begins, wherever it goes (its middle). */
  follow?: boolean;
}

/** Words over a shot. */
export interface TextCue {
  /** Seconds into the shot it comes in, and goes. */
  at: number;
  until: number;
  lines: string[];
  /** title: the name, large; big: a word or two; lore: a line of the story; caption: a line of what this is. */
  style: 'title' | 'big' | 'lore' | 'caption' | 'logo';
  /** Where its middle is, top to bottom (0..1); default by its style. And left to right (default: the middle). */
  y?: number;
  x?: number;
  /**
   * How it comes in. By default as the game's decisions tell their stories (lore, captions, big words): a
   * scan line sweeps down it a line at a time, each line catching ember, then gold, then its own colours.
   * `type: true`: letter by letter. `type: false`: all at once (pixel by pixel). `held`: there already (the
   * same words going on over a cut).
   */
  type?: boolean;
  held?: boolean;
  /** Letters a second, when it comes in letter by letter. */
  cps?: number;
  color?: string;
  /** Lines longer than this many letters are broken at a space. */
  wrap?: number;
}

/** A picture over a shot, drawn by the game's own code. */
export interface Panel {
  at: number;
  until: number;
  /** art: a picture of the title screen or How to Play (app/modeArt.ts); banners: the houses' (app/houseArt.ts); icons: the Destinies'. */
  kind: 'art' | 'banners' | 'icons';
  art?: 'sector' | 'ages' | 'daily' | 'kindle' | 'fleet' | 'boons';
  heirs?: string[];
  icons?: string[];
  /** Its box at the game's size, and how many of the game's pixels one of the picture's is. */
  x: number;
  y: number;
  w: number;
  h: number;
  scale?: number;
  /** Columns of banners or icons. */
  cols?: number;
  /** Names under banners and icons (the default), and their icons' color. */
  names?: boolean;
  color?: string;
  /** A picture with no box round it (full size, on the night). */
  bare?: boolean;
  /** Banners and icons come one after another, this many seconds apart. */
  stagger?: number;
}

export interface Shot {
  sector?: SectorSpec;
  /** The tick of its sector the shot begins at (none: where the last shot of the same sector left off). */
  from?: number;
  /** Seconds. */
  dur: number;
  /** Game seconds a second: one number, or from the first to the second through the shot. */
  speed?: number | [number, number];
  cam?: CamKey[];
  /** World names and labels, as in the game (the default is the scenery alone). */
  labels?: boolean;
  /** Seconds the shot takes to come in over the last (pixel by pixel); 0 is a cut. */
  dither?: number;
  text?: TextCue[];
  /** The fighting is heard (the default when the game runs at less than three times its speed), this much louder. */
  sounds?: boolean;
  loud?: number;
  /** The music steps back under the shot to this (1: not at all), so that the fighting is heard. */
  duck?: number;
  /** Black bars, in pixels at the game's size. */
  bars?: number;
  /** Seconds of black at the end (pixel by pixel). */
  out?: number;
  /** No sector: the night alone (a title card), with its stars (`stars`). */
  blank?: boolean;
  stars?: boolean;
  /** The world behind is darkened this much (0..1), for what is over it to read. */
  dim?: number;
  panels?: Panel[];
  /** A vignette, this strong (0..1): the corners darken toward night, smoothly. */
  vignette?: number;
  /**
   * Seconds the shot takes to come in from night, and to go to it at its end: smooth fades (a dip through
   * black between two shots), where `dither` is a dissolve pixel by pixel over the shot before.
   */
  fadeIn?: number;
  fadeOut?: number;
  /**
   * An Ark, drawn over the world (the game shows none: a house's Ark leaving is its lands going dark): built
   * row by row at a world from the shot's start to `lift`, its engine lit, then rising away on a trail of fire.
   */
  ark?: { node: number; color: string; lift: number };
}

const stage = document.getElementById('stage')!;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
const screen = new Screen(worldCanvas, stage);
screen.setPixelSize('auto');
// (Upright, the game is drawn at 270x480, four of the screen's pixels to one of its: its Screen is told so,
// whatever its own sizes would make of the page.)
if (PORTRAIT) {
  stage.style.width = `${W * 4}px`;
  stage.style.height = `${H * 4}px`;
  const fixed = screen as unknown as { W: number; H: number; scale: number; g: CanvasRenderingContext2D; listeners: (() => void)[]; resize: () => void };
  fixed.resize = () => {
    worldCanvas.width = W;
    worldCanvas.height = H;
    fixed.W = W;
    fixed.H = H;
    fixed.scale = 4;
    fixed.g = worldCanvas.getContext('2d')!;
    fixed.g.imageSmoothingEnabled = false;
    for (const fn of fixed.listeners) fn();
  };
  fixed.resize();
}
const renderer = new Renderer(screen);
const out = document.createElement('canvas');
out.width = W;
out.height = H;
const frameCtx = out.getContext('2d', { willReadFrequently: true })!;
frameCtx.imageSmoothingEnabled = false;
/** Where words and pictures are drawn: the frame, or a layer of its own (`laid`). */
let ctx = frameCtx;
let prev: ImageData | null = null;
const layer = document.createElement('canvas');
layer.width = W;
layer.height = H;
const layerCtx = layer.getContext('2d', { willReadFrequently: true })!;
layerCtx.imageSmoothingEnabled = false;
/** The game's pictures are drawn by its own code into canvases on the page (out of sight). */
const props = document.createElement('div');
props.style.cssText = 'position:absolute;left:-20000px;top:0';
document.body.appendChild(props);

let game: Game | null = null;
let gameSpec = '';
let acc = 0;

/** A sector at a tick: the one on screen, if it is that sector and not past it; else played to it anew. */
function gameAt(s: SectorSpec, from: number | undefined): Game {
  const key = JSON.stringify(s);
  if (from === undefined && game && key === gameSpec) return game;
  const tick = from ?? 0;
  if (!game || key !== gameSpec || game.tick > tick) {
    game = makeGame(s);
    gameSpec = key;
    renderer.prepare(game);
  }
  game.fxEnabled = false;
  while (game.tick < tick && !game.outcome) game.step();
  game.fx.length = 0;
  game.fxEnabled = true;
  acc = 0;
  return game;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const smooth = (k: number) => k * k * (3 - 2 * k);
/** Seconds words and pictures take to come and go, pixel by pixel. */
const FADE = 0.5;
const fadeOf = (t: number, at: number, until: number, comeIn = true) =>
  Math.max(0, Math.min(comeIn ? (t - at) / FADE : 1, (until - t) / FADE, 1));

/** How far each pixel is from the middle of the picture (1 at the corners of the ellipse that holds it). */
const FAR = new Float32Array(W * H).map((_, i) => {
  const x = (i % W) / W - 0.5;
  const y = Math.floor(i / W) / H - 0.5;
  return Math.sqrt(x * x * 2 + y * y * 2);
});
/**
 * The vignette (`v`), and the band of night under words at the foot of a shot: from nothing at 0.6 of the
 * way down to nearly all night by 0.7, where the words are, so that no ship is ever over them; `band`
 * (0..1) is how far it has come in, with the words. Both darken smoothly, every pixel a little (night in
 * dither, over a bright land, reads as black specks eating into it).
 */
function dusk(v: number, band: number, top = 0) {
  if (!v && !band && !top) return;
  const img = frameCtx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const by = Math.max(band ? Math.max(0, Math.min(1, (y / H - 0.6) / 0.1)) * 0.94 * band : 0,
      top ? Math.max(0, Math.min(1, (0.4 - y / H) / 0.1)) * 0.9 * top : 0);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const vv = v ? Math.max(0, Math.min(1, (FAR[i] - 0.62) / 0.5)) * v : 0;
      const level = Math.max(vv, by);
      if (level > 0) {
        const keep = 1 - level;
        d[i * 4] = 11 + (d[i * 4] - 11) * keep;
        d[i * 4 + 1] = 10 + (d[i * 4 + 1] - 10) * keep;
        d[i * 4 + 2] = 26 + (d[i * 4 + 2] - 26) * keep;
      }
    }
  }
  frameCtx.putImageData(img, 0, 0);
}

/** Draw into a layer of its own and lay it over the frame, `level` of it (0..1) there, pixel by pixel. */
function laid(level: number, draw: () => void) {
  if (level <= 0) return;
  layerCtx.clearRect(0, 0, W, H);
  ctx = layerCtx;
  try {
    draw();
  } finally {
    ctx = frameCtx;
  }
  if (level < 1) {
    const img = layerCtx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((bayer(x, y) + 0.5) / 16 > level) d[(y * W + x) * 4 + 3] = 0;
    layerCtx.putImageData(img, 0, 0);
  }
  frameCtx.drawImage(layer, 0, 0);
}

/** The fleet a shot rides with: its ships, and where its middle was last seen (smoothed: a ship leaping does not jolt it). */
let fleet: { ids: number[]; x: number; y: number } | null = null;
function pickFleet(g: Game) {
  const groups = new Map<string, number[]>();
  for (const u of g.unitList) {
    if (u.dead || !u.lane || u.type === 'seed') continue;
    const k = `${u.owner}:${u.dest}`;
    groups.set(k, [...(groups.get(k) ?? []), u.id]);
  }
  const ids = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  fleet = { ids, x: NaN, y: NaN };
  followFleet(g, 1);
}
function followFleet(g: Game, ease = 0.12) {
  if (!fleet) return;
  const us = fleet.ids.map((id) => g.units.get(id)).filter((u) => u && !u.dead);
  if (!us.length) return;
  const x = us.reduce((s, u) => s + u!.x, 0) / us.length;
  const y = us.reduce((s, u) => s + u!.y, 0) / us.length;
  fleet.x = Number.isNaN(fleet.x) ? x : fleet.x + (x - fleet.x) * ease;
  fleet.y = Number.isNaN(fleet.y) ? y : fleet.y + (y - fleet.y) * ease;
}

/** The Ark's trail: sparks that cool from bone to gold to ember to wine as they fall behind it. */
let sparks: { x: number; y: number; vx: number; vy: number; age: number }[] = [];
const SPARK_LIFE = 0.8;
/** The ark of a shot, at `t` seconds into it (see Shot.ark): its pixels, three of the game's to one of its. */
function drawArk(a: NonNullable<Shot['ark']>, t: number, g: Game) {
  const n = g.nodes[a.node];
  const [sx, sy] = renderer.cam.worldToScreen(n.x, n.y);
  // (Pointing up: the sprites point right, turned a quarter.)
  const spr = shipSprite('ark', a.color, 12, Math.floor(t * 12) % 2 === 0, SPACE);
  const S = 3;
  const k = Math.max(0, t - a.lift);
  // Rising: slowly, then faster and faster, smaller as it goes; gone into the night within two seconds.
  const scale = Math.max(0, 1 - k * 0.42);
  const w = Math.max(1, Math.round(spr.width * S * scale));
  const h = Math.max(1, Math.round(spr.height * S * scale));
  const cx = Math.round(sx + k * k * 10);
  const cy = Math.round(sy - 32 - (k * 18 + k * k * 46));
  // Built row by row, from the keel up, a line of gold where it is being built.
  const built = Math.min(1, t / (a.lift * 0.7));
  if (scale > 0) {
    const rows = Math.ceil(spr.height * built);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, 0, spr.height - rows, spr.width, rows, cx - w / 2, cy + h / 2 - rows * S * scale, w, rows * S * scale);
    if (built < 1) {
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(Math.round(cx - w / 2) - 2, Math.round(cy + h / 2 - rows * S * scale), w + 4, 1);
    }
  }
  // The engine: lit once it is built; sparks under it, a trail behind it once it rises.
  const lit = t > a.lift * 0.75 && scale > 0.05;
  if (lit) {
    const many = k > 0 ? 5 : 1;
    for (let i = 0; i < many; i++) {
      sparks.push({ x: cx + (Math.random() - 0.5) * w * 0.5, y: cy + h / 2, vx: (Math.random() - 0.5) * 14, vy: 10 + Math.random() * 30, age: 0 });
    }
  }
  // (A ring runs out from the world as it lifts, as one does from a world kindled.)
  if (k > 0 && k < 0.6) {
    const r = 6 + k * 70;
    ctx.fillStyle = k < 0.2 ? PAL.bone : k < 0.4 ? PAL.gold : PAL.ember;
    for (let d = 0; d < 360; d += 4) {
      if (k > 0.4 && Math.floor(d / 8) % 2) continue;
      ctx.fillRect(Math.round(sx + Math.cos((d * Math.PI) / 180) * r), Math.round(sy + Math.sin((d * Math.PI) / 180) * r * 0.8), 1, 1);
    }
  }
  sparks = sparks.filter((p) => (p.age += 1 / FPS) < SPARK_LIFE);
  for (const p of sparks) {
    p.x += p.vx / FPS;
    p.y += p.vy / FPS;
    const q = p.age / SPARK_LIFE;
    ctx.fillStyle = q < 0.2 ? PAL.bone : q < 0.45 ? PAL.gold : q < 0.75 ? PAL.ember : PAL.wine;
    const size = q < 0.45 ? 2 : 1;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
  }
}

function camAt(g: Game, keys: CamKey[], k: number): { x: number; y: number; zoom: number } {
  const cam = renderer.cam;
  const at = (key: CamKey) => {
    const fit = key.zoom === 'fit';
    const zoom = fit ? cam.minZoom * (key.fit ?? 1) : (key.zoom as number);
    const n = key.node !== undefined ? g.nodes[key.node] : null;
    if (key.follow && fleet && !Number.isNaN(fleet.x)) return { x: fleet.x - (key.dx ?? 0) / zoom, y: fleet.y - (key.dy ?? 0) / zoom, zoom };
    const x = fit && key.x === undefined && !n ? (g.bounds.minX + g.bounds.maxX) / 2 : (n?.x ?? key.x ?? 0);
    const y = fit && key.y === undefined && !n ? (g.bounds.minY + g.bounds.maxY) / 2 : (n?.y ?? key.y ?? 0);
    return { x: x - (key.dx ?? 0) / zoom, y: y - (key.dy ?? 0) / zoom, zoom };
  };
  if (keys.length === 1 || k <= keys[0].t) return at(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (k > keys[i].t) continue;
    const a = at(keys[i - 1]);
    const b = at(keys[i]);
    const u = smooth((k - keys[i - 1].t) / Math.max(1e-6, keys[i].t - keys[i - 1].t));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * u) };
  }
  return at(keys[keys.length - 1]);
}

// ---------------------------------------------------------------------------------------------------
// Words, in the game's own type
// ---------------------------------------------------------------------------------------------------

const FONT = '"Press Start 2P", monospace';
const flame = [...flameSvg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)].map((m) => ({
  x: +m[1], y: +m[2], w: +m[3], h: +m[4], c: m[5],
}));

/** A line, outlined in the night so that it reads over anything. */
function line(text: string, x: number, y: number, size: number, color: string, shadow = false) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  const w = Math.round(ctx.measureText(text).width);
  const left = Math.round(x - w / 2);
  const o = Math.max(1, Math.round(size / 8));
  ctx.fillStyle = PAL.void;
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) ctx.fillText(text, left + dx, y + dy);
  if (shadow) {
    ctx.fillStyle = PAL.wine;
    ctx.fillText(text, left + o * 2, y + o * 2);
    ctx.fillStyle = PAL.ember;
    ctx.fillText(text, left + o, y + o);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, left, y);
}

function drawFlame(x: number, y: number, scale: number) {
  for (const r of flame) {
    ctx.fillStyle = r.c;
    ctx.fillRect(x + r.x * scale, y + r.y * scale, r.w * scale, r.h * scale);
  }
}

/** Lines broken at a space so that none is longer than `n` letters. */
function wrapped(lines: string[], n?: number): string[] {
  if (!n) return lines;
  return lines.flatMap((l) => {
    const out: string[] = [];
    let cur = '';
    for (const word of l.split(' ')) {
      if (cur && (cur + ' ' + word).length > n) {
        out.push(cur);
        cur = word;
      } else cur = cur ? cur + ' ' + word : word;
    }
    return [...out, cur];
  });
}

/** The words of a cue at `t` seconds into its shot: as a story (or letter by letter, or pixel by pixel), and gone pixel by pixel. */
function words(cue: TextCue, t: number, clock: number) {
  if (t < cue.at || t >= cue.until) return;
  const how = cue.held ? 'now' : cue.type === true ? 'type' : cue.type === false || cue.style === 'title' || cue.style === 'logo' ? 'now' : 'story';
  laid(fadeOf(t, cue.at, cue.until, how === 'now' && !cue.held), () => wordsNow({ ...cue, lines: wrapped(cue.lines, cue.wrap) }, t, how, clock));
}

// The words of the story, as the game's decisions tell theirs (ui/modals/storyText.ts), at the size of a
// trailer: marked as the game marks its own, {a phrase} in gold on a slow ripple, [a gain] in teal, [!a
// loss] in red; a scan line in ember sweeps down a line at a time, and each line it passes catches, ember
// then gold, then its own colours.
/** Seconds the scan line takes over a line, and seconds a line glows once it has passed. */
const STORY_GAP = 0.22;
const STORY_GLOW = 0.5;
type RunStyle = 'body' | 'kw' | 'gain' | 'loss';
/** A line as runs of its styles. */
function runsOf(l: string): { text: string; style: RunStyle }[] {
  const out: { text: string; style: RunStyle }[] = [];
  const re = /\{([^}]*)\}|\[!([^\]]*)\]|\[([^\]]*)\]/g;
  let last = 0;
  for (let m = re.exec(l); m; m = re.exec(l)) {
    if (m.index > last) out.push({ text: l.slice(last, m.index), style: 'body' });
    out.push(m[1] !== undefined ? { text: m[1], style: 'kw' } : m[2] !== undefined ? { text: m[2], style: 'loss' } : { text: m[3], style: 'gain' });
    last = re.lastIndex;
  }
  if (last < l.length) out.push({ text: l.slice(last), style: 'body' });
  return out;
}
/** A line without its marks: what is drawn, and what is measured. */
const plainOf = (l: string) => runsOf(l).map((r) => r.text).join('');

/**
 * A line of runs, outlined in the night, its middle at `cx`: `glow` (ember, gold) over all of it while it
 * catches; a phrase in gold riding its ripple once it has; no more than `shown` letters.
 */
function richLine(l: string, cx: number, y: number, size: number, body: string, glow: string | null, clock: number, shown = Infinity) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  const colors: Record<RunStyle, string> = { body, kw: PAL.gold, gain: PAL.teal, loss: PAL.red };
  let x = Math.round(cx - ctx.measureText(plainOf(l)).width / 2);
  const o = Math.max(1, Math.round(size / 8));
  const lift = Math.max(1, Math.round(size / 16));
  let n = 0;
  for (const r of runsOf(l)) {
    for (const ch of r.text) {
      if (n++ >= shown) return;
      // (Each letter of a phrase in gold rises and settles in its turn, a wave running along it.)
      const bob = r.style === 'kw' && !glow ? Math.round((Math.sin(clock * 3 - (x / size) * 0.55) * 0.5 + 0.5) * lift) : 0;
      ctx.fillStyle = PAL.void;
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) ctx.fillText(ch, x + dx, y - bob + dy);
      ctx.fillStyle = glow ?? colors[r.style];
      ctx.fillText(ch, x, y - bob);
      x += ctx.measureText(ch).width;
    }
  }
}

function wordsNow(cue: TextCue, t: number, how: 'story' | 'type' | 'now', clock: number) {
  const style = cue.style;
  const size = style === 'title' ? 32 : style === 'big' ? 24 : style === 'lore' ? 16 : 8;
  const gap = style === 'caption' ? 6 : style === 'lore' ? 10 : 12;
  const color = cue.color ?? (style === 'title' ? PAL.gold : style === 'big' ? PAL.bone : style === 'lore' ? PAL.bone : PAL.mist);
  if (style === 'logo') {
    // The flame kindles, as a world does: a ring runs out from it, bone, gold, ember; then the name comes,
    // catching ember and gold as a line of a story does; then the lines under it, one after the other.
    const since = t - cue.at;
    const cy = Math.round(H * (cue.y ?? 0.46));
    const big = W < 400 ? 24 : 32;
    drawFlame(W / 2 - 32, cy - 72, 4);
    if (since < 0.7) {
      const k = since / 0.7;
      const r = 20 + k * 70;
      ctx.fillStyle = k < 0.3 ? PAL.bone : k < 0.6 ? PAL.gold : PAL.ember;
      for (let a = 0; a < 360; a += 2) {
        if (k > 0.6 && Math.floor(a / 6) % 2) continue;
        ctx.fillRect(Math.round(W / 2 + Math.cos((a * Math.PI) / 180) * r), Math.round(cy - 40 + Math.sin((a * Math.PI) / 180) * r * 0.9), 2, 2);
      }
    }
    if (since >= 0.35) {
      const age = since - 0.35;
      if (age < STORY_GLOW) richLine('HEGEMARCH', W / 2, cy + 6, big, PAL.gold, age < STORY_GLOW / 2 ? PAL.ember : PAL.gold, clock);
      else line('HEGEMARCH', W / 2, cy + 6, big, PAL.gold, true);
    }
    cue.lines.forEach((l, i) => {
      const age = since - 0.9 - i * 0.3;
      if (age >= 0) richLine(l, W / 2, cy + big + 20 + i * 14, 8, i === 0 ? PAL.bone : PAL.mist, age < STORY_GLOW / 2 ? PAL.ember : age < STORY_GLOW ? PAL.gold : null, clock);
    });
    return;
  }
  const cx = Math.round(W * (cue.x ?? 0.5));
  const total = cue.lines.length * size + (cue.lines.length - 1) * gap;
  const top = Math.round(H * (cue.y ?? (style === 'caption' ? 0.86 : 0.5)) - total / 2);
  if (style === 'title') {
    // (The name: letter by letter or all at once, with the shadows of the logo.)
    const shown = how === 'type' ? Math.floor((t - cue.at) * (cue.cps ?? 20)) : Infinity;
    cue.lines.forEach((l, i) => line(plainOf(l).slice(0, shown), cx, top + i * (size + gap), size, color, true));
    return;
  }
  const since = t - cue.at;
  let left = how === 'type' ? Math.floor(since * (cue.cps ?? 20)) : Infinity;
  let y = top;
  cue.lines.forEach((l, i) => {
    if (how === 'story') {
      const age = since - (i + 1) * STORY_GAP;
      if (age >= 0) richLine(l, cx, y, size, color, age < STORY_GLOW / 2 ? PAL.ember : age < STORY_GLOW ? PAL.gold : null, clock);
    } else {
      richLine(l, cx, y, size, color, null, clock, left);
      left -= plainOf(l).length;
    }
    y += size + gap;
  });
  // The scan line, in ember over wine, sweeping down over the lines still to come.
  if (how === 'story' && since < cue.lines.length * STORY_GAP) {
    ctx.font = `${size}px ${FONT}`;
    const wide = Math.max(...cue.lines.map((l) => ctx.measureText(plainOf(l)).width)) + size;
    const sy = top + Math.floor((since / STORY_GAP) * (size + gap));
    const x0 = Math.round(cx - wide / 2);
    ctx.fillStyle = PAL.wine;
    ctx.fillRect(x0, sy - 1, Math.round(wide), 1);
    ctx.fillStyle = PAL.ember;
    ctx.fillRect(x0, sy, Math.round(wide), 1);
  }
}

// ---------------------------------------------------------------------------------------------------
// The game's own pictures
// ---------------------------------------------------------------------------------------------------

/** The canvas a picture is drawn into by the game's code, made once (its size: the picture's, in its pixels, times three). */
const propCanvases = new Map<string, HTMLCanvasElement>();
function prop(key: string, make: () => HTMLCanvasElement, cssW: number, cssH: number): HTMLCanvasElement {
  let c = propCanvases.get(key);
  if (!c) {
    c = make();
    propCanvases.set(key, c);
  }
  if (!c.isConnected) props.appendChild(c);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  return c;
}

/** A box of the game's own, round a picture. */
function boxed(x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PAL.indigo;
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = PAL.void;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
}

function panel(p: Panel, t: number, clock: number) {
  if (t < p.at || t >= p.until) return;
  // (Banners or icons that come one after another: each a panel of its own, laid in its turn.)
  if (p.stagger && p.kind !== 'art') {
    const ids = p.kind === 'banners' ? (p.heirs ?? []) : (p.icons ?? []);
    const cols = Math.min(ids.length, p.cols ?? ids.length);
    const rows = Math.ceil(ids.length / cols);
    const cw = Math.floor((p.w - 8 * (cols - 1)) / cols);
    const ch = Math.floor((p.h - 8 * (rows - 1)) / rows);
    ids.forEach((id, i) => {
      const one: Panel = {
        ...p, stagger: undefined, cols: 1, at: p.at + i * p.stagger!,
        x: p.x + (i % cols) * (cw + 8), y: p.y + Math.floor(i / cols) * (ch + 8), w: cw, h: ch,
        ...(p.kind === 'banners' ? { heirs: [id] } : { icons: [id] }),
      };
      panel(one, t, clock);
    });
    return;
  }
  const scale = p.scale ?? 2;
  laid(fadeOf(t, p.at, p.until), () => {
    // (The game's pictures are drawn into canvases on the page, then taken off them; nothing else is there meanwhile.)
    props.replaceChildren();
    if (p.kind === 'art') {
      const c = prop(`art:${p.art}:${p.w}x${p.h}:${scale}`, () => {
        const el = document.createElement('canvas');
        el.className = 'mode-art';
        el.dataset.art = p.art;
        return el;
      }, (p.w / scale) * 3, (p.h / scale) * 3);
      drawModeArt(props, clock);
      if (!p.bare) boxed(p.x, p.y, p.w, p.h);
      ctx.drawImage(c, p.x, p.y, c.width * scale, c.height * scale);
      return;
    }
    const ids = p.kind === 'banners' ? (p.heirs ?? []) : (p.icons ?? []);
    const cols = Math.min(ids.length, p.cols ?? ids.length);
    const rows = Math.ceil(ids.length / cols);
    const gap = 8;
    const names = p.names ?? true;
    const cw = Math.floor((p.w - gap * (cols - 1)) / cols);
    const ch = Math.floor((p.h - gap * (rows - 1)) / rows);
    const pich = ch - (names ? 12 : 0);
    ids.forEach((id, i) => {
      const x = p.x + (i % cols) * (cw + gap);
      const y = p.y + Math.floor(i / cols) * (ch + gap);
      if (p.kind === 'banners') {
        const c = prop(`banner:${id}:${cw}:${scale}`, () => {
          const el = document.createElement('canvas');
          el.className = 'heir-art chosen';
          el.dataset.heir = id;
          return el;
        }, Math.floor(cw / scale) * 3, 24 * 3);
        drawHouseBanners(props, clock);
        const bh = c.height * scale;
        boxed(x, y, c.width * scale, bh);
        ctx.drawImage(c, x, y, c.width * scale, bh);
        const h = HEIR_BY_ID[id];
        if (names && h) line(h.name.toUpperCase(), x + cw / 2, y + bh + 5, 8, h.color);
      } else {
        boxed(x, y, cw, pich);
        starWindow(ctx, x, y, cw, pich, 40 + i * 17, clock, false);
        const pic = iconCanvas(id, p.color ?? PAL.gold);
        const k = Math.max(1, Math.min(scale, Math.floor((pich - 4) / pic.height)));
        ctx.drawImage(pic, Math.round(x + (cw - pic.width * k) / 2), Math.round(y + (pich - pic.height * k) / 2 + Math.sin(clock * 1.6 + i)), pic.width * k, pic.height * k);
        const v = VICTORIES[id as keyof typeof VICTORIES];
        if (names && v) line(v.name.toUpperCase(), x + cw / 2, y + pich + 5, 8, PAL.bone);
      }
    });
  });
}

// ---------------------------------------------------------------------------------------------------
// Making the frames
// ---------------------------------------------------------------------------------------------------

/** A sound of the trailer: when, which, how loud, where. */
export type SoundCue = [t: number, id: SoundId, vol: number, pan: number];

declare global {
  interface Window {
    sendFrame(png: string): Promise<void>;
  }
}

/**
 * Make the frames of a trailer, shot by shot, and send each as it is made (window.sendFrame). Returns
 * the sounds of the fighting on screen, each at its moment.
 */
export async function shoot(shots: Shot[], everyNth = 1, pick?: number[]): Promise<SoundCue[]> {
  const sounds: SoundCue[] = [];
  prev = null;
  let clock = 0;
  let frameNo = 0;
  const view = emptyView(true);
  for (const shot of shots) {
    const frames = Math.round(shot.dur * FPS);
    const g = shot.blank || !shot.sector ? null : gameAt(shot.sector, shot.from);
    fleet = null;
    sparks = [];
    if (g && shot.cam?.some((c) => c.follow)) pickFleet(g);
    const heard = {
      ctx: {},
      play: (id: SoundId, vol = 0.5, pan = 0) => sounds.push([clock, id, Math.min(1, vol * (shot.loud ?? 1)), pan]),
    } as unknown as Sfx;
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      const k = frames > 1 ? f / (frames - 1) : 0;
      ctx.fillStyle = PAL.void;
      ctx.fillRect(0, 0, W, H);
      if (!g && shot.stars) starWindow(ctx, 0, 0, W, H, 7, clock, false, clock * 3);
      if (g) {
        const sp = Array.isArray(shot.speed) ? shot.speed[0] * Math.pow(shot.speed[1] / shot.speed[0], k) : (shot.speed ?? 1);
        acc += sp / FPS;
        while (acc >= TICK && !g.outcome) {
          g.step();
          acc -= TICK;
        }
        followFleet(g);
        const c = camAt(g, shot.cam ?? [{ t: 0, zoom: 'fit' }], k);
        const cam = renderer.cam;
        cam.x = cam.tx = c.x;
        cam.y = cam.ty = c.y;
        cam.zoom = cam.tzoom = c.zoom;
        const fx = sp > 3 ? g.fx.filter((x) => x.k === 'capture') : g.fx;
        if (shot.sounds ?? sp < 3) playBattleSounds(fx, g.nodes, cam, heard, () => true);
        // (Without its labels, the picture alone: no words float up over it, a star's toll or a world scorched.)
        const shown = shot.labels ? fx : fx.filter((x) => x.k !== 'text').map((x) => (x.k === 'nova' ? { ...x, toll: undefined } : x));
        renderer.fx.ingest(shown, () => true, (x, y, pad) => cam.sees(x, y, pad), cam.zoom);
        g.fx.length = 0;
        renderer.fx.update(1 / FPS);
        renderer.render(g, Math.min(1, acc / TICK), 1 / FPS, { ...view, plain: !shot.labels } as typeof view, !shot.labels);
        ctx.drawImage(worldCanvas, 0, 0, W, H, 0, 0, W, H);
        if (shot.dim) {
          ctx.fillStyle = `rgba(11, 10, 26, ${shot.dim})`;
          ctx.fillRect(0, 0, W, H);
        }
        if (shot.ark) drawArk(shot.ark, t, g);
      }
      // Coming in over the last shot, pixel by pixel; going to black at the end.
      const din = shot.dither ? Math.min(1, t / shot.dither) : 1;
      const dout = shot.out ? Math.max(0, Math.min(1, (shot.dur - t) / shot.out)) : 1;
      // (The first shot comes in from black.)
      if (din < 1 || dout < 1) {
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        const p = prev?.data;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const b = (bayer(x, y) + 0.5) / 16;
            const i = (y * W + x) * 4;
            if (b > din) {
              d[i] = p ? p[i] : 11;
              d[i + 1] = p ? p[i + 1] : 10;
              d[i + 2] = p ? p[i + 2] : 26;
            } else if (b > dout) {
              d[i] = 11;
              d[i + 1] = 10;
              d[i + 2] = 26;
            }
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      // (The vignette, and the band under words at the foot of the picture.)
      // (The band comes in with the words over it, and goes with them.)
      const shown = (c: TextCue) => (t >= c.at && t < c.until ? fadeOf(t, c.at, c.until, !c.held) : 0);
      const low = Math.max(0, ...(shot.text ?? []).filter((c) => (c.y ?? 0.5) >= 0.68 && c.style !== 'logo').map(shown));
      const high = Math.max(0, ...(shot.text ?? []).filter((c) => (c.y ?? 0.5) <= 0.32 && c.style !== 'logo').map(shown));
      dusk(shot.vignette ?? 0, g ? low : 0, g ? high : 0);
      if (shot.bars) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, shot.bars);
        ctx.fillRect(0, H - shot.bars, W, shot.bars);
      }
      for (const p of shot.panels ?? []) panel(p, t, clock);
      for (const cue of shot.text ?? []) words(cue, t, clock);
      const fin = shot.fadeIn ? Math.min(1, t / shot.fadeIn) : 1;
      const fout = shot.fadeOut ? Math.max(0, Math.min(1, (shot.dur - 1 / FPS - t) / shot.fadeOut)) : 1;
      if (fin * fout < 1) {
        const k = fin * fout;
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 11 + (d[i] - 11) * k;
          d[i + 1] = 10 + (d[i + 1] - 10) * k;
          d[i + 2] = 26 + (d[i + 2] - 26) * k;
        }
        ctx.putImageData(img, 0, 0);
      }
      // (The last frame, words and all, is what the next shot comes in over: what stays to the cut dissolves.)
      if (f === frames - 1) prev = ctx.getImageData(0, 0, W, H);
      // (`pick`: only these frames are sent, for a look at the trailer without the whole of it.)
      if (pick ? pick.includes(frameNo) : frameNo % everyNth === 0) await window.sendFrame(out.toDataURL('image/png'));
      frameNo++;
      clock += 1 / FPS;
    }
  }
  return sounds;
}

// ---------------------------------------------------------------------------------------------------
// The sound
// ---------------------------------------------------------------------------------------------------

/** Music under a trailer: a track of the game's, from its `part`-th part, from `at` to `until` seconds. */
export interface MusicCue {
  track: string;
  at: number;
  until: number;
  /** The entry of the track's form to begin at (default: where its tune comes in). */
  part?: number;
  /** The bar of that part to begin at (0: its first): an intro that runs into the head of the next part. */
  fromBar?: number;
  vol?: number;
  /** Seconds it takes to go at its end. */
  fade?: number;
  /**
   * It ends as the game ends a track: home to its first chord, left to ring (`Music.close`), not faded.
   * `until` must then be the end of one of its parts.
   */
  close?: boolean;
  /** Seconds its last chord rings (default: the game's, six steps and at least 1.6 s): to the next tune, or to the end. */
  ring?: number;
  /**
   * The tune arranged bar by bar: so many bars with these of its voices (a arpeggio, b bass, l lead, e its
   * echo, d drums, h the light half of the drums; '' for a bar of silence). `until` is then where the bars
   * end. The tune's own parts and melody run on under it, bar after bar. `vol`: how loud those bars are
   * (of the tune's `vol`), for a build that swells as it fills.
   */
  arrangement?: { bars: number; voices: string; vol?: number }[];
}

/** The music under each shot: from, to, how far it steps back (Shot.duck). */
export function ducksOf(shots: Shot[]): [number, number, number][] {
  let t = 0;
  return shots.map((s) => {
    const d: [number, number, number] = [t, t + s.dur, s.duck ?? 1];
    t += s.dur;
    return d;
  });
}

/** The trailer's sound, made offline: the music and every sound at its moment. A WAV, in base64. */
export async function sound(dur: number, music: MusicCue[], sounds: SoundCue[], sfxVol = 0.55, ducks: [number, number, number][] = []): Promise<string> {
  const rate = 48000;
  const c = new OfflineAudioContext(2, Math.ceil(rate * dur), rate);
  // (The sound engine plays only into a running context: this one runs while it renders.)
  Object.defineProperty(c, 'state', { get: () => 'running' });
  const real = window.AudioContext;
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return c;
  };
  const sfx = new Sfx({ ...defaultSettings(), master: 1, music: 1, sfx: sfxVol });
  sfx.unlock();
  (window as unknown as { AudioContext: unknown }).AudioContext = real;
  // A compressor between the engine and the speakers, as on any trailer: the loud (a star erupting) is
  // held down, so that the rest may be as loud as it should.
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.35;
  // And after it a limiter: nothing past -6 dB of the loudest, however much fighting there is at once.
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  sfx.master!.disconnect();
  sfx.master!.connect(comp);
  comp.connect(limiter);
  limiter.connect(c.destination);
  // The music steps back under a shot of fighting, and forward again after it.
  const under = c.createGain();
  under.connect(comp);
  void limiter;
  under.gain.setValueAtTime(1, 0);
  for (const [from, , level] of ducks) under.gain.setTargetAtTime(level, from, 0.12);
  // (The engine's levels glide to where they are set: here they are there from the first sample.)
  for (const [node, v] of [[sfx.master!, 0.6], [sfx.sfxGain!, sfxVol], [sfx.musicGain!, 0.5]] as const) {
    node.gain.cancelScheduledValues(0);
    node.gain.setValueAtTime(v, 0);
  }
  // (The music's own level, then the stepping back, then the master.)
  const musicIn = c.createGain();
  musicIn.gain.value = 0.5 * 0.6;
  musicIn.connect(under);
  for (const m of music) {
    const tr = TRACKS.find((x) => x.name === m.track);
    if (!tr) throw new Error(`no track ${m.track}`);
    const bus = c.createGain();
    bus.connect(musicIn);
    const vol = m.vol ?? 1;
    const fade = m.fade ?? 1.5;
    const stepDur = 60 / tr.bpm / 2;
    // (Arranged, each run of bars at its own level, stepping to it on its first beat.)
    let level = vol * (m.arrangement?.[0]?.vol ?? 1);
    bus.gain.setValueAtTime(0, 0);
    bus.gain.setValueAtTime(0, m.at);
    bus.gain.linearRampToValueAtTime(level, m.at + 0.02);
    let from = m.at;
    for (const a of m.arrangement ?? []) {
      const next = vol * (a.vol ?? 1);
      if (from > m.at && next !== level) {
        bus.gain.setValueAtTime(level, from);
        bus.gain.linearRampToValueAtTime(next, from + 0.03);
      }
      level = next;
      from += a.bars * tr.steps * stepDur;
    }
    if (!m.close) {
      bus.gain.setValueAtTime(level, Math.max(m.at + 0.02, m.until - fade));
      bus.gain.linearRampToValueAtTime(0, m.until);
    }
    const player = new Music(sfx) as unknown as { bus: GainNode; schedule: (...a: unknown[]) => void; close: (...a: unknown[]) => number };
    player.bus = bus;
    let seg = m.part ?? Math.max(0, tr.form.findIndex(([, v]) => v.includes('l')));
    let step = (m.fromBar ?? 0) * tr.steps;
    // (Steps counted, not added up: a tune keeps its time to the sample over a minute.)
    const steps = Math.round((m.until - m.at) / stepDur);
    // The voices of each step: the arrangement's, bar by bar, or the tune's own.
    const voicesAt: (string | null)[] = [];
    for (const a of m.arrangement ?? []) for (let k = 0; k < a.bars * tr.steps; k++) voicesAt.push(a.voices);
    for (let k = 0; k < steps; k++) {
      const [id, voices] = tr.form[seg];
      const p = tr.parts[id];
      const v = m.arrangement ? (voicesAt[k] ?? '') : voices;
      if (v) player.schedule(tr, p, v, step, m.at + k * stepDur, stepDur);
      if (++step < p.chords.length * tr.steps) continue;
      step = 0;
      seg = (seg + 1) % tr.form.length;
    }
    if (m.close) {
      if (step !== 0 && !m.arrangement) throw new Error(`${m.track} is closed in the middle of a part (step ${step})`);
      // (A battle's tune does not ring home in the game, where the next one follows at once: here it does.)
      const home = m.at + steps * stepDur;
      player.close({ ...tr, mood: 'title' }, home, m.ring ? m.ring / 6 : stepDur);
      // (Its chord dies away as it rings, by thirty decibels, and to nothing at the end of it: it does not hold, then stop.)
      if (m.ring) {
        bus.gain.setValueAtTime(level, home);
        bus.gain.exponentialRampToValueAtTime(level * 0.03, home + m.ring);
        bus.gain.linearRampToValueAtTime(0, home + m.ring + 0.1);
      }
    }
  }
  // A riser before a drop, made with the game's own pulse: a sweep up, louder as it goes, cut at the drop.
  for (const [t0, id, vol, len] of sounds) {
    if ((id as string) !== 'riser') continue;
    for (const [mult, share] of [[1, 1], [0.5, 0.6]] as const) {
      const o = c.createOscillator();
      o.setPeriodicWave(sfx.wave('p12')!);
      o.frequency.setValueAtTime(110 * mult, t0);
      o.frequency.exponentialRampToValueAtTime(1760 * mult, t0 + len);
      const gn = c.createGain();
      gn.gain.value = 0;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol * share * 0.25, t0 + len * 0.95);
      gn.gain.linearRampToValueAtTime(0, t0 + len);
      o.connect(gn);
      gn.connect(sfx.sfxGain!);
      o.start(t0);
      o.stop(t0 + len + 0.01);
    }
  }
  // Each sound at its moment: the render stops there, the sound is played, and it goes on.
  const at = new Map<number, SoundCue[]>();
  for (const s of sounds) {
    if ((s[1] as string) === 'riser') continue;
    if (s[0] >= dur) continue;
    const q = Math.floor((s[0] * rate) / 128) * 128;
    if (q <= 0) continue;
    at.set(q, [...(at.get(q) ?? []), s]);
  }
  for (const [q, list] of at) {
    void c.suspend(q / rate).then(() => {
      // (The engine counts the sounds playing, to keep a battle from drowning everything, and frees one
      // when its sound ends: no sound ends while it is made offline, so it counts only what starts here.)
      (sfx as unknown as { voices: number }).voices = 0;
      for (const [, id, vol, pan] of list) sfx.play(id, vol, pan);
      void c.resume();
    });
  }
  const buf = await c.startRendering();
  // As loud as it may be without clipping.
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const n = buf.length;
  const wav = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  wav.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, 2, true);
  wav.setUint32(24, rate, true);
  wav.setUint32(28, rate * 4, true);
  wav.setUint16(32, 4, true);
  wav.setUint16(34, 16, true);
  str(36, 'data');
  wav.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true);
    wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true);
  }
  const bytes = new Uint8Array(wav.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------------------------------------------
// The game's own mix, measured
// ---------------------------------------------------------------------------------------------------

/**
 * Play these sounds as the game plays them (its levels: the default settings; its limit of voices; no
 * compressor) with its music under them, and measure what comes out: the loudest sample, how many go past
 * full scale (which a speaker cannot play: they are clipped, and crackle), and the biggest jump from one
 * sample to the next (a click). `fix`: the game's own output stage is used (`Sfx.unlock`), whatever it is.
 */
export async function audit(dur: number, sounds: SoundCue[], music: MusicCue[], raw = true) {
  const rate = 48000;
  const c = new OfflineAudioContext(2, Math.ceil(rate * dur), rate);
  Object.defineProperty(c, 'state', { get: () => 'running' });
  const real = window.AudioContext;
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return c;
  };
  const settings = defaultSettings();
  const sfx = new Sfx(settings);
  sfx.unlock();
  (window as unknown as { AudioContext: unknown }).AudioContext = real;
  // (The levels where the game's settings put them, from the first sample.)
  if (raw) {
    for (const [node, v] of [[sfx.master!, settings.master * 0.6], [sfx.sfxGain!, settings.sfx], [sfx.musicGain!, settings.music * 0.5]] as const) {
      node.gain.cancelScheduledValues(0);
      node.gain.setValueAtTime(v, 0);
    }
  }
  // The voices sounding at each moment, as the game counts them (one is freed when its sound ends).
  const ends: number[] = [];
  const voiced = sfx as unknown as { voices: number; tone: (...a: unknown[]) => void; noiseBurst: (...a: unknown[]) => void };
  const tone = voiced.tone.bind(sfx);
  const burst = voiced.noiseBurst.bind(sfx);
  voiced.tone = (...a: unknown[]) => {
    ends.push((a[4] as number) + (a[5] as number) + 0.02);
    tone(...a);
  };
  voiced.noiseBurst = (...a: unknown[]) => {
    ends.push((a[1] as number) + (a[2] as number) + 0.02);
    burst(...a);
  };
  for (const m of music) {
    const tr = TRACKS.find((x) => x.name === m.track)!;
    const bus = c.createGain();
    bus.connect(sfx.musicGain!);
    const player = new Music(sfx) as unknown as { bus: GainNode; schedule: (...a: unknown[]) => void };
    player.bus = bus;
    let seg = m.part ?? 0;
    let step = 0;
    const stepDur = 60 / tr.bpm / 2;
    for (let t = m.at; t < m.until; t += stepDur) {
      const [id, voices] = tr.form[seg];
      const p = tr.parts[id];
      player.schedule(tr, p, voices, step, t, stepDur);
      if (++step < p.chords.length * tr.steps) continue;
      step = 0;
      seg = (seg + 1) % tr.form.length;
    }
  }
  const at = new Map<number, SoundCue[]>();
  for (const s of sounds) {
    if (s[0] >= dur) continue;
    const q = Math.floor((s[0] * rate) / 128) * 128;
    if (q > 0) at.set(q, [...(at.get(q) ?? []), s]);
  }
  for (const [q, list] of at) {
    void c.suspend(q / rate).then(() => {
      const now = q / rate;
      voiced.voices = ends.filter((e) => e > now).length;
      for (const [, id, vol, pan] of list) sfx.play(id, vol, pan);
      void c.resume();
    });
  }
  const buf = await c.startRendering();
  let peak = 0;
  let over = 0;
  let jump = 0;
  const worst: [number, number][] = [];
  // A single sample that leaps away from both of its neighbours (a sample let through at full strength).
  let impulses = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let p = 0;
    for (const v of d) p = Math.max(p, Math.abs(v));
    for (let i = 1; i < d.length - 1; i++) {
      const j = Math.abs(d[i] - (d[i - 1] + d[i + 1]) / 2);
      if (j > p * 0.4 && Math.sign(d[i] - d[i - 1]) !== Math.sign(d[i + 1] - d[i])) impulses++;
    }
  }
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a > 1) over++;
      if (i > 0) {
        const j = Math.abs(d[i] - d[i - 1]);
        if (j > jump) jump = j;
        if (j > 0.35) worst.push([i / rate, j]);
      }
    }
  }
  return { peak, over, overPct: (100 * over) / (buf.length * 2), jump, clicks: worst.length, impulses, firstClicks: worst.slice(0, 8) };
}

/**
 * Every line of a trailer measured in its own type, before a frame is made: a line wider than the picture
 * (less a margin) is an error, and so is a line of one word under a longer one (a word left on its own).
 */
export function lint(shots: Shot[]): string[] {
  const problems: string[] = [];
  const m = document.createElement('canvas').getContext('2d')!;
  shots.forEach((shot, i) => {
    for (const cue of shot.text ?? []) {
      const size = cue.style === 'title' ? 32 : cue.style === 'big' ? 24 : cue.style === 'lore' ? 16 : 8;
      const lines = cue.style === 'logo' ? cue.lines : wrapped(cue.lines, cue.wrap);
      lines.map(plainOf).forEach((l, k, all) => {
        m.font = `${size}px ${FONT}`;
        const w = m.measureText(l).width;
        const room = cue.x !== undefined ? 2 * Math.min(cue.x, 1 - cue.x) * W - 8 : W - 24;
        if (w > room) problems.push(`shot ${i + 1}: "${l}" is ${Math.round(w)} px wide, with room for ${Math.round(room)}`);
        if (k > 0 && !l.includes(' ') && all[k - 1].length > l.length * 2) problems.push(`shot ${i + 1}: "${l}" is a word on its own under "${all[k - 1]}"`);
      });
    }
  });
  return problems;
}
