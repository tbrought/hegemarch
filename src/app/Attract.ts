/**
 * A sector that plays itself: AI houses only, with the whole map shown. The game's menus use it as
 * their backdrop, and the website opens on it.
 *
 * Its first minutes are quiet (the houses have not met yet), so they are either skipped unseen (the
 * menus) or shown sped up, as the houses spread their colors over the dark (the website's "dawn").
 * After that it plays in real time while the camera moves from one busy place to the next.
 */
import { Game } from '../game/Game';
import { TICK } from '../game/constants';
import { HEIRS } from '../game/data/heirs';
import { randomSeed } from '../game/rng';
import type { Fx, GNode } from '../game/types';
import { emptyView, type Renderer } from '../render/Renderer';

export interface AttractOptions {
  /** Show the opening minutes sped up, instead of skipping them unseen. */
  dawn?: boolean;
  /** Every few shots, pull the camera back to show the whole sector. */
  wide?: boolean;
  /** Seconds a finished game stays on screen before the next begins. */
  encore?: number;
  /** How quickly the camera reaches a new place (the game's own camera uses 12; lower glides). */
  glide?: number;
  /** The range of zoom for a close shot. */
  close?: [number, number];
  /** Each frame's battle effects, before they are drawn (for sound). */
  onFx?: (g: Game, fx: Fx[]) => void;
}

/** Game seconds before the live picture: by then the houses have met. */
const OPENING = 14 * 60;
/** Real seconds the dawn takes (longer on a slow machine). */
const DAWN = 6;

export class Attract {
  game: Game | null = null;
  /** 'dawn': the opening minutes, sped up. 'live': real time. 'over': a house has been crowned. */
  phase: 'dawn' | 'live' | 'over' = 'live';
  private view = emptyView(true);
  private acc = 0;
  private token = 0;
  private starting = false;
  private dawnT = 0;
  private overT = 0;
  /** Seconds until the camera moves on, and how many shots it has taken. */
  private shotT = 0;
  private shots = 0;

  constructor(private renderer: Renderer, private opts: AttractOptions = {}) {}

  /** Begin a new sector (a sector already showing stays until the new one is ready). */
  async start() {
    const token = ++this.token;
    this.starting = true;
    const heir = HEIRS[Math.floor(Math.random() * HEIRS.length)].id;
    const g = Game.create({ seed: randomSeed(), size: 'small', difficulty: 2, heir, perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
    if (!this.opts.dawn) {
      g.fxEnabled = false;
      const chunks = Math.ceil(OPENING / TICK / 1200);
      for (let chunk = 0; chunk < chunks; chunk++) {
        for (let i = 0; i < 1200; i++) g.step();
        await new Promise((r) => setTimeout(r, 0));
        if (token !== this.token) return;
      }
      g.fx.length = 0;
      g.fxEnabled = true;
    }
    this.starting = false;
    this.game = g;
    this.phase = this.opts.dawn ? 'dawn' : 'live';
    this.acc = 0;
    this.dawnT = 0;
    this.shotT = 0;
    this.shots = 0;
    this.renderer.prepare(g);
    if (this.opts.glide) this.renderer.cam.ease = this.opts.glide;
    this.renderer.cam.fitAll();
  }

  /** Drop the sector (and one still being prepared). */
  stop() {
    ++this.token;
    this.starting = false;
    this.game = null;
  }

  /** Point the camera at a place and leave it there for `hold` seconds. */
  lookAt(x: number, y: number, zoom: number, hold: number) {
    this.renderer.cam.focus(x, y, zoom);
    this.shotT = hold;
  }

  /** Advance and draw one frame. False while there is no sector to draw yet. */
  frame(dt: number): boolean {
    const g = this.game;
    if (!g) return false;
    if (this.phase === 'dawn') this.frameDawn(g, dt);
    else if (this.phase === 'live') this.frameLive(g, dt);
    else {
      this.overT -= dt;
      if (this.overT <= 0 && !this.starting) void this.start();
    }
    if (this.game !== g) return this.game !== null;
    if (this.phase !== 'dawn') this.direct(g, dt);
    const fx = this.phase === 'dawn' ? g.fx.filter((f) => f.k === 'capture') : g.fx;
    if (this.phase === 'live') this.opts.onFx?.(g, fx);
    const cam = this.renderer.cam;
    this.renderer.fx.ingest(fx, () => true, (x, y, pad) => cam.sees(x, y, pad), cam.zoom);
    g.fx.length = 0;
    this.renderer.fx.update(dt);
    this.renderer.render(g, this.phase === 'live' ? Math.min(1, this.acc / TICK) : 1, dt, this.view, true);
    return true;
  }

  /** The opening minutes: fast at first, slowing into real time, for as many ticks as a frame can afford. */
  private frameDawn(g: Game, dt: number) {
    this.dawnT += dt;
    const k = Math.min(1, this.dawnT / DAWN);
    const want = OPENING * (1 - (1 - k) * (1 - k));
    const until = performance.now() + 9;
    let n = 0;
    while (g.time < want && !g.outcome && (n < 8 || performance.now() < until)) {
      g.step();
      n++;
    }
    // A machine too slow to keep up gets a shorter opening, not a longer wait.
    if (g.outcome) this.end();
    else if (g.time >= OPENING - TICK || this.dawnT > DAWN * 2) this.phase = 'live';
  }

  private frameLive(g: Game, dt: number) {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK && steps < 4) {
      g.step();
      this.acc -= TICK;
      steps++;
    }
    if (steps >= 4) this.acc = 0;
    if (g.outcome) this.end();
  }

  private end() {
    this.phase = 'over';
    this.overT = this.opts.encore ?? 0;
  }

  /** Move the camera on when its time at this place is up: to a fight if there is one. */
  private direct(g: Game, dt: number) {
    this.shotT -= dt;
    if (this.shotT > 0) return;
    const cam = this.renderer.cam;
    this.shots++;
    if (this.opts.wide && this.shots % 4 === 0) {
      cam.focus((g.bounds.minX + g.bounds.maxX) / 2, (g.bounds.minY + g.bounds.maxY) / 2, cam.minZoom);
      this.shotT = 7;
      return;
    }
    let best = g.nodes[Math.floor(Math.random() * g.nodes.length)];
    let bc = -1;
    for (const n of g.nodes) {
      const c = Math.min(20, g.buckets[n.id].length) + (n.kind === 'planet' && n.owner >= 0 ? 3 : 0) + (fought(g, n) ? 24 : 0) + Math.random() * 8;
      if (c > bc) {
        bc = c;
        best = n;
      }
    }
    const [near, far] = this.opts.close ?? [0.1, 0.22];
    cam.focus(best.x, best.y, near + Math.random() * (far - near));
    this.shotT = this.opts.wide ? 11 : 16;
  }
}

/** Is there fighting at this world: it was hit a moment ago, or ships of two sides are there? */
function fought(g: Game, n: GNode): boolean {
  if (n.lastHit < 3) return true;
  const here = g.buckets[n.id];
  for (let i = 1; i < here.length; i++) if (here[i].owner !== here[0].owner && g.hostile(here[i].owner, here[0].owner)) return true;
  return false;
}
