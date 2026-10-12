/**
 * The fleet: the three core ships and what each one beats, shown as a triangle that takes turns
 * firing, with a line about each ship beside it, and the four ships that Blueprint Boons add.
 */
import { CORE_SHIPS, UNITS } from '../game/data/units';
import type { UnitType } from '../game/types';
import { textCenter, textWidth } from '../render/font';
import { PAL, shade } from '../render/palette';
import { line, rect, type Ctx } from '../render/pixel';
import { dirIndex, shipSprite, silhouette } from '../render/sprites';
import { drawSubjects, starWindow, subjectsSize, type Look } from '../ui/subjects';
import { esc, house, stage } from './stage';

/** Around the triangle, each ship beats the next: Strikers beat Breakers beat Guardians beat Strikers. */
const RING: UnitType[] = ['striker', 'breaker', 'guardian'];
const BLUEPRINTS: UnitType[] = ['lancer', 'carrier', 'dreadnought', 'starbase'];
/** Seconds each ship gets to show what it beats. */
const TURN = 2.8;
/** The triangle is drawn in half-size pixels, so its ships are drawn this many times larger to match the rows beside it. */
const SHIP = 3;

export function startFleet(root: HTMLElement) {
  const tri = root.querySelector<HTMLCanvasElement>('.triangle');
  if (tri) stage(tri, 2, triangle);
  for (const [sel, types] of [['.ship-list', CORE_SHIPS], ['.blueprint-list', BLUEPRINTS]] as const) {
    const list = root.querySelector<HTMLElement>(sel);
    if (!list) continue;
    list.innerHTML = types.map((t) => `<li><canvas class="ship-art" data-ship="${t}" aria-hidden="true"></canvas><div><b>${esc(UNITS[t].name)}` +
        `</b><span>${esc(UNITS[t].short)}</span></div></li>`).join('');
    pictures(list);
  }
}

/** A turning ship in each row (it spins faster under the pointer). */
function pictures(list: HTMLElement) {
  for (const el of list.querySelectorAll<HTMLCanvasElement>('.ship-art')) {
    const id = el.dataset.ship!;
    stage(
      el,
      3,
      (g, w, h, t, lively) => {
        let look: Look = { color: house.color, scale: 2, t, lively, turn: true };
        if (subjectsSize([id], look).w > w || subjectsSize([id], look).h > h) look = { ...look, scale: 1 };
        drawSubjects(g, [id], w / 2, 0, h, look, 'center');
      },
      el.closest('li') ?? el,
    );
  }
}

function triangle(g: Ctx, w: number, h: number, t: number, lively: boolean) {
  starWindow(g, 0, 0, w, h, 77, t, lively);
  const BAR = 17;
  const cx = w / 2;
  const top = 34;
  const bottom = h - BAR - 34;
  const half = Math.min(w / 2 - 44, (bottom - top) * 0.95);
  const at = [
    { x: Math.round(cx), y: top },
    { x: Math.round(cx + half), y: bottom },
    { x: Math.round(cx - half), y: bottom },
  ];
  const turn = Math.floor(t / TURN) % 3;
  const k = (t % TURN) / TURN;
  const GAP = 26;
  // The lanes of the triangle: the one in use is lit in the house color and its dots march at the prey.
  RING.forEach((_, i) => {
    const a = at[i];
    const b = at[(i + 1) % 3];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    const live = i === turn;
    const col = live ? house.color : PAL.slate;
    line(g, a.x + ux * GAP, a.y + uy * GAP, b.x - ux * (GAP + 4), b.y - uy * (GAP + 4), live ? house.color : PAL.indigo, 4, live ? -Math.floor(t * 16) : 0);
    // An arrowhead at the prey's end.
    const hx = b.x - ux * GAP;
    const hy = b.y - uy * GAP;
    for (let n = 0; n < 6; n++) {
      rect(g, Math.round(hx - ux * n - uy * n * 0.7), Math.round(hy - uy * n + ux * n * 0.7), 1, 1, col);
      rect(g, Math.round(hx - ux * n + uy * n * 0.7), Math.round(hy - uy * n - ux * n * 0.7), 1, 1, col);
    }
    if (!live) return;
    // Three shots cross the lane during the first half of the turn.
    for (let s = 0; s < 3; s++) {
      const p = (k - s * 0.13) / 0.32;
      if (p <= 0 || p >= 1) continue;
      const px = a.x + ux * (GAP + (d - GAP * 2) * p);
      const py = a.y + uy * (GAP + (d - GAP * 2) * p);
      rect(g, Math.round(px) - 1, Math.round(py) - 1, 3, 3, PAL.bone);
      rect(g, Math.round(px - ux * 4) - 1, Math.round(py - uy * 4) - 1, 2, 2, house.color);
    }
  });
  RING.forEach((type, i) => {
    const prey = at[(i + 1) % 3];
    const dir = dirIndex(Math.atan2(prey.y - at[i].y, prey.x - at[i].x));
    const bob = Math.round(Math.sin(t * 1.4 + i * 2.1) * 1.5);
    // The ship being shot at flashes as each shot lands, and is knocked about a little.
    const hunted = i === (turn + 1) % 3;
    const hit = hunted && [0.32, 0.45, 0.58].some((m) => k >= m && k < m + 0.05);
    const spr = hit ? silhouette(type, PAL.bone, dir) : shipSprite(type, house.color, dir, Math.floor(t * 9 + i) % 2 === 0);
    const jolt = hunted && k > 0.32 && k < 0.66 ? Math.round(Math.sin(t * 40) * 1.5) : 0;
    const sw = spr.width * SHIP;
    const sh = spr.height * SHIP;
    g.drawImage(spr, Math.round(at[i].x - sw / 2) + jolt, Math.round(at[i].y - sh / 2) + bob, sw, sh);
    const name = UNITS[type].name.toUpperCase();
    const ly = i === 0 ? at[i].y - 30 : at[i].y + 22;
    const lx = Math.max(textWidth(name) / 2 + 3, Math.min(w - textWidth(name) / 2 - 3, at[i].x));
    textCenter(g, name, lx, ly, i === turn ? PAL.bone : PAL.dusk);
  });
  // What this turn shows, in words.
  const words = `${UNITS[RING[turn]].name.toUpperCase()}S BEAT ${UNITS[RING[(turn + 1) % 3]].name.toUpperCase()}S`;
  rect(g, 0, h - BAR, w, BAR, PAL.void);
  rect(g, 0, h - BAR - 1, w, 1, shade(house.color));
  textCenter(g, words, cx, h - BAR + 5, house.color);
}
