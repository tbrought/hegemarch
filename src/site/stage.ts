/**
 * The website's small pixel pictures. Each is a canvas drawn in game pixels and shown several times
 * larger (like the game itself), sized to the box the page gives it, and drawn only while on screen.
 */
import { HEIR_BY_ID } from '../game/data/heirs';
import { ctx2d, type Ctx } from '../render/pixel';

/** The visitor asked for less motion: pictures stand still and nothing starts by itself. */
export const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Draws one picture: its size in game pixels, the time in seconds, and whether the pointer is on it. */
export type Draw = (g: Ctx, w: number, h: number, t: number, lively: boolean) => void;

interface Stage {
  el: HTMLCanvasElement;
  scale: number;
  draw: Draw;
  /** The element whose hover makes the picture lively. */
  hover: Element;
  seen: boolean;
  /** Not drawn yet: it gets one drawing even off screen, so it is never met blank. */
  fresh: boolean;
}

const stages: Stage[] = [];
const byEl = new Map<Element, { seen: boolean }>();
const watcher =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const s = byEl.get(e.target);
            if (s) s.seen = e.isIntersecting;
          }
        },
        { rootMargin: '80px' },
      )
    : null;

/** Tell `flag.seen` whether an element is on screen (always true where that cannot be known). */
export function watch(el: Element): { seen: boolean } {
  const flag = { seen: !watcher };
  byEl.set(el, flag);
  watcher?.observe(el);
  return flag;
}

/** Make a canvas a picture: `scale` screen pixels per game pixel. */
export function stage(el: HTMLCanvasElement, scale: number, draw: Draw, hover: Element = el) {
  const s: Stage = { el, scale, draw, hover, seen: !watcher, fresh: true };
  stages.push(s);
  byEl.set(el, s);
  watcher?.observe(el);
}

/** Draw every picture that is on screen. */
export function drawStages(t: number) {
  for (const s of stages) {
    if ((!s.seen && !s.fresh) || !s.el.isConnected || !s.el.clientWidth) continue;
    s.fresh = false;
    const w = Math.max(8, Math.round(s.el.clientWidth / s.scale));
    const h = Math.max(8, Math.round(s.el.clientHeight / s.scale));
    if (s.el.width !== w || s.el.height !== h) {
      s.el.width = w;
      s.el.height = h;
    }
    const g = ctx2d(s.el);
    g.clearRect(0, 0, w, h);
    s.draw(g, w, h, calm ? 0 : t, !calm && s.hover.matches(':hover'));
  }
  // Pictures whose canvas has left the page are done.
  for (let i = stages.length - 1; i >= 0; i--) {
    if (!stages[i].el.isConnected) {
      watcher?.unobserve(stages[i].el);
      byEl.delete(stages[i].el);
      stages.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// The visitor's house: its color runs through the page.
// ---------------------------------------------------------------------------

export const house = { id: 'concord', color: HEIR_BY_ID.concord.color };
const listeners: (() => void)[] = [];

export function chooseHouse(id: string) {
  const h = HEIR_BY_ID[id];
  if (!h || h.id === house.id) return;
  house.id = h.id;
  house.color = h.color;
  document.documentElement.style.setProperty('--house', h.color);
  for (const fn of listeners) fn();
}

export function onHouse(fn: () => void) {
  listeners.push(fn);
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
