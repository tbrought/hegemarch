/**
 * The banner on each house card of the run setup: the house's Hearth, and the fleet it starts with
 * (its Ark and escorts, in its color) flying out over drifting stars. It is drawn with the game's own
 * sprites on a small canvas shown at three times its size, like everything else in the game.
 *
 * Under the pointer the fleet picks up speed; the chosen house surges ahead for a moment, flies on
 * fast, and its Ark sends out a ring now and then.
 */
import { HEIR_BY_ID, type HeirDef } from '../game/data/heirs';
import type { GNode, PlanetType, UnitType } from '../game/types';
import { ctx2d, ring } from '../render/pixel';
import { shipSprite } from '../render/sprites';
import { worldSprite } from '../render/worlds';
import { starWindow } from '../ui/subjects';

/** Screen pixels per banner pixel, and the banner's height in its own pixels. */
const SCALE = 3;
const H = 24;

/** The kind of world each house calls home (for the banner only; in a run the map decides). */
const HEARTH: Record<string, PlanetType> = { concord: 'terran', vael: 'volcanic', wayfarer: 'ocean', lyceum: 'ice', choir: 'gas', ashen: 'desert' };

/** Where escorts fly, relative to the Ark (the first of each kind takes the first place). */
const PLACES: Record<string, [number, number][]> = {
  guardian: [[-14, -7], [-14, 7], [-27, 0]],
  striker: [[11, -8], [11, 8], [19, 0], [24, -9]],
  breaker: [[-26, 8], [-26, -8]],
  scout: [[27, 6], [31, -5]],
};

interface State {
  /** How far the stars have slid past (so a change of speed never makes them jump). */
  travel: number;
  last: number;
  selected: boolean;
  /** 1 right after the house is chosen, fading to 0: the fleet surges ahead. */
  surge: number;
}
const states = new Map<string, State>();

/** "the Ark Sovereign, 2 Guardians, 1 Striker and 1 Scout" */
export function startingFleet(h: HeirDef): string {
  const part = (n: number, one: string) => (n > 0 ? `${n} ${one}${n > 1 ? 's' : ''}` : '');
  const parts = [`the Ark ${h.arkName}`, part(h.start.guardians, 'Guardian'), part(h.start.strikers, 'Striker'), part(h.start.breakers, 'Breaker'), part(h.start.scouts, 'Scout')].filter(Boolean);
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/** Draw every house banner on the page (call once a frame while the setup screen shows). */
export function drawHouseBanners(root: HTMLElement, t: number) {
  root.querySelectorAll<HTMLCanvasElement>('canvas.heir-art').forEach((el, index) => {
    const h = HEIR_BY_ID[el.dataset.heir ?? ''];
    if (!h) return;
    const w = Math.max(48, Math.round(el.clientWidth / SCALE));
    if (el.width !== w || el.height !== H) {
      el.width = w;
      el.height = H;
    }
    const card = el.closest('.heir');
    // (A banner outside a house card, like the First Night's, is marked as the chosen one.)
    const selected = card ? card.classList.contains('sel') : el.classList.contains('chosen');
    const lively = selected || !!card?.matches(':hover');
    let s = states.get(h.id);
    if (!s) states.set(h.id, (s = { travel: index * 37, last: t, selected, surge: 0 }));
    const dt = Math.min(0.1, Math.max(0, t - s.last));
    s.last = t;
    if (selected && !s.selected) s.surge = 1;
    s.selected = selected;
    s.surge = Math.max(0, s.surge - dt / 0.9);
    s.travel += dt * ((lively ? 9 : 2.2) + s.surge * 40);
    draw(ctx2d(el), w, h, index, t, s, selected);
  });
}

function draw(g: CanvasRenderingContext2D, w: number, h: HeirDef, index: number, t: number, s: State, selected: boolean) {
  starWindow(g, 0, 0, w, H, 90 + index * 13, t, false, s.travel);
  // The Hearth, rising at the left edge, ringed in the house's color.
  const home = { id: -100 - index, ptype: HEARTH[h.id] ?? 'terran', seed: 11 + index * 7 } as unknown as GNode;
  const r = 15;
  const hx = -3;
  const hy = 16;
  const world = worldSprite(home, r, true);
  g.drawImage(world, hx - (world.width >> 1), hy - (world.height >> 1));
  ring(g, hx, hy, r + 2, h.color);

  // The fleet: the Ark in the middle, its escorts in their places, each bobbing to its own beat.
  const surge = Math.round(s.surge * s.surge * 7);
  const ax = Math.round(w * 0.56) + surge;
  const ay = H >> 1;
  const ships: [UnitType, number, number][] = [];
  const place = (type: UnitType, n: number) => {
    for (let i = 0; i < n && i < PLACES[type].length; i++) ships.push([type, ax + PLACES[type][i][0], ay + PLACES[type][i][1]]);
  };
  place('guardian', h.start.guardians);
  place('breaker', h.start.breakers);
  place('striker', h.start.strikers);
  place('scout', h.start.scouts);
  if (selected) {
    // The chosen Ark shows its strength: a ring spreads from it every few seconds.
    const k = ((t + index) % 3.4) / 0.9;
    if (k < 1) ring(g, ax, ay, 3 + k * 15, h.color, k > 0.6 ? 3 : k > 0.3 ? 2 : 1);
  }
  ships.forEach(([type, x, y], i) => ship(g, type, h.color, x, y, t, i + 1 + index * 3));
  ship(g, 'ark', h.color, ax, ay, t, index * 3);
}

function ship(g: CanvasRenderingContext2D, type: UnitType, color: string, x: number, y: number, t: number, i: number) {
  const spr = shipSprite(type, color, 0, Math.floor(t * 9 + i * 0.37) % 2 === 0);
  const bob = Math.round(Math.sin(t * 1.5 + i * 1.9));
  const sway = Math.round(Math.sin(t * 0.6 + i * 1.3));
  g.drawImage(spr, x - (spr.width >> 1) + sway, y - (spr.height >> 1) + bob);
}
