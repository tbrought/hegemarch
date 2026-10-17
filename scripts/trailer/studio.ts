/**
 * The trailer studio (make.mjs drives it, in studio.html on the dev server): the game's own sectors,
 * played by its own houses and drawn by its own renderer, frame by frame at 30 a second, with words over
 * them in the game's own type; and their sound, made offline to the frame: the game's own music and the
 * sounds of the fighting on screen.
 *
 * Everything is drawn at the game's own size (480x270, as on a 1080p screen) and made four times larger,
 * pixel for pixel, when the video is made: the words are pixels of the same size as the worlds'.
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
import { iconCanvas } from '../../src/render/sprites';
import { starWindow } from '../../src/ui/subjects';

export const FPS = 30;
export const W = 480;
export const H = 270;

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
}

/** Play a sector through (its houses all the game's AI) and note what happened where: the shots there are. */
export function scan(s: SectorSpec, minutes: number) {
  const g = makeGame(s);
  g.fxEnabled = true;
  const owner = g.nodes.map((n) => n.owner);
  const hearth = g.nodes.map((n) => isHearth(n));
  const alive = g.factions.map((f) => f.alive);
  const heat = new Map<string, number>();
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
      }
    }
    g.fx.length = 0;
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
    if (v >= 40) moments.push({ kind: 'battle', tick: w * 100, node, score: v, who: -1 });
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
  /** Comes in letter by letter (the default for lore), or all at once. */
  type?: boolean;
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
}

const stage = document.getElementById('stage')!;
const worldCanvas = document.getElementById('world') as HTMLCanvasElement;
const screen = new Screen(worldCanvas, stage);
screen.setPixelSize('auto');
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

function camAt(g: Game, keys: CamKey[], k: number): { x: number; y: number; zoom: number } {
  const cam = renderer.cam;
  const at = (key: CamKey) => {
    const fit = key.zoom === 'fit';
    const zoom = fit ? cam.minZoom * (key.fit ?? 1) : (key.zoom as number);
    const n = key.node !== undefined ? g.nodes[key.node] : null;
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

/** The words of a cue at `t` seconds into its shot: letter by letter (or pixel by pixel), and gone pixel by pixel. */
function words(cue: TextCue, t: number) {
  if (t < cue.at || t >= cue.until) return;
  const typed = cue.type ?? cue.style === 'lore';
  laid(fadeOf(t, cue.at, cue.until, !typed), () => wordsNow({ ...cue, lines: wrapped(cue.lines, cue.wrap) }, t, typed));
}

function wordsNow(cue: TextCue, t: number, typed: boolean) {
  const style = cue.style;
  const size = style === 'title' ? 32 : style === 'big' ? 24 : style === 'lore' ? 16 : 8;
  const gap = style === 'caption' ? 6 : style === 'lore' ? 10 : 12;
  const shown = typed ? Math.floor((t - cue.at) * (cue.cps ?? 20)) : Infinity;
  const color = cue.color ?? (style === 'title' ? PAL.gold : style === 'big' ? PAL.bone : style === 'lore' ? PAL.bone : PAL.mist);
  if (style === 'logo') {
    const cy = Math.round(H * (cue.y ?? 0.46));
    drawFlame(W / 2 - 32, cy - 72, 4);
    line('HEGEMARCH', W / 2, cy + 6, 32, PAL.gold, true);
    cue.lines.forEach((l, i) => line(l, W / 2, cy + 52 + i * 14, 8, i === 0 ? PAL.bone : PAL.mist));
    return;
  }
  const total = cue.lines.length * size + (cue.lines.length - 1) * gap;
  let y = Math.round(H * (cue.y ?? (style === 'caption' ? 0.86 : 0.5)) - total / 2);
  let left = shown;
  for (const l of cue.lines) {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length;
    if (part) line(part, Math.round(W * (cue.x ?? 0.5)), y, size, color, style === 'title');
    y += size + gap;
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
      boxed(p.x, p.y, p.w, p.h);
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
        const c = camAt(g, shot.cam ?? [{ t: 0, zoom: 'fit' }], k);
        const cam = renderer.cam;
        cam.x = cam.tx = c.x;
        cam.y = cam.ty = c.y;
        cam.zoom = cam.tzoom = c.zoom;
        const fx = sp > 3 ? g.fx.filter((x) => x.k === 'capture') : g.fx;
        if (shot.sounds ?? sp < 3) playBattleSounds(fx, g.nodes, cam, heard, () => true);
        renderer.fx.ingest(fx, () => true, (x, y, pad) => cam.sees(x, y, pad), cam.zoom);
        g.fx.length = 0;
        renderer.fx.update(1 / FPS);
        renderer.render(g, Math.min(1, acc / TICK), 1 / FPS, { ...view, plain: !shot.labels } as typeof view, !shot.labels);
        ctx.drawImage(worldCanvas, 0, 0, W, H, 0, 0, W, H);
        if (shot.dim) {
          ctx.fillStyle = `rgba(11, 10, 26, ${shot.dim})`;
          ctx.fillRect(0, 0, W, H);
        }
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
      if (shot.bars) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, shot.bars);
        ctx.fillRect(0, H - shot.bars, W, shot.bars);
      }
      for (const p of shot.panels ?? []) panel(p, t, clock);
      if (f === frames - 1) prev = ctx.getImageData(0, 0, W, H);
      for (const cue of shot.text ?? []) words(cue, t);
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
  vol?: number;
  /** Seconds it takes to go at its end. */
  fade?: number;
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
  comp.threshold.value = -22;
  comp.knee.value = 8;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  sfx.master!.disconnect();
  sfx.master!.connect(comp);
  comp.connect(c.destination);
  // The music steps back under a shot of fighting, and forward again after it.
  const under = c.createGain();
  under.connect(comp);
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
    bus.gain.setValueAtTime(0, 0);
    bus.gain.setValueAtTime(0, m.at);
    bus.gain.linearRampToValueAtTime(vol, m.at + 0.03);
    bus.gain.setValueAtTime(vol, Math.max(m.at + 0.03, m.until - fade));
    bus.gain.linearRampToValueAtTime(0, m.until);
    const player = new Music(sfx) as unknown as { bus: GainNode; schedule: (...a: unknown[]) => void };
    player.bus = bus;
    let seg = m.part ?? Math.max(0, tr.form.findIndex(([, v]) => v.includes('l')));
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
  // Each sound at its moment: the render stops there, the sound is played, and it goes on.
  const at = new Map<number, SoundCue[]>();
  for (const s of sounds) {
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
