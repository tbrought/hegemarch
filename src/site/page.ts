/**
 * The page around the pictures. Each section of the website is a dark world on a starlane that runs
 * down the page: as the visitor scrolls to a section, its world is kindled and the section floods
 * with color, the way worlds do in the game.
 *
 * Also here: the small pictures the page's own text asks for, and the clock of the Daily Run.
 */
import { OPTIONAL_VICTORIES, VICTORIES } from '../game/data/victories';
import type { GNode, PlanetType } from '../game/types';
import { PAL } from '../render/palette';
import { ring } from '../render/pixel';
import { iconCanvas } from '../render/sprites';
import { worldSprite } from '../render/worlds';
import { drawSubjects, starWindow, subjectsSize, type Look } from '../ui/subjects';
import { calm, esc, house, stage } from './stage';

const WORLDS: PlanetType[] = ['terran', 'volcanic', 'ocean', 'gas', 'ice', 'desert', 'barren'];

/** Light each section as it is scrolled to, and draw the world at its head. */
export function startLane() {
  const bands = [...document.querySelectorAll<HTMLElement>('.band')];
  /** When each section was kindled (page seconds), for the ring that spreads from its world. */
  const litAt = new Map<HTMLElement, number>();
  let now = 0;
  const kindle = (band: HTMLElement) => {
    if (litAt.has(band)) return;
    litAt.set(band, now);
    band.classList.add('lit');
  };
  if (calm || typeof IntersectionObserver !== 'function') bands.forEach(kindle);
  else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          kindle(e.target.closest<HTMLElement>('.band')!);
          io.unobserve(e.target);
        }
      },
      // A section lights when its heading has come a fifth of the way up the window.
      { rootMargin: '0px 0px -20% 0px' },
    );
    for (const band of bands) io.observe(band.querySelector('.band-head') ?? band);
  }
  bands.forEach((band, i) => {
    const el = band.querySelector<HTMLCanvasElement>('canvas.node');
    if (!el) return;
    // (Numbers below zero: these worlds belong to no sector.)
    const world = { id: -200 - i, ptype: WORLDS[i % WORLDS.length], seed: 23 + i * 17 } as unknown as GNode;
    stage(el, 3, (g, w, h, t) => {
      now = t;
      const cx = w >> 1;
      const cy = h >> 1;
      const r = Math.min(cx, cy) - 4;
      const at = litAt.get(band);
      const spr = worldSprite(world, r, at !== undefined);
      g.drawImage(spr, cx - (spr.width >> 1), cy - (spr.height >> 1));
      if (at === undefined) return;
      ring(g, cx, cy, r + 2, house.color);
      const k = (t - at) / 0.8;
      if (k >= 0 && k < 1) ring(g, cx, cy, r + 2 + k * 4, k > 0.5 ? PAL.gold : PAL.bone, k > 0.6 ? 2 : 1);
    });
  });
}

/** The Destinies, from the game's own list (call before startPictures: each has a picture). */
export function startDestinies(list: HTMLElement) {
  list.innerHTML = (['conquest', ...OPTIONAL_VICTORIES] as const)
    .map((id) => {
      const v = VICTORIES[id];
      return `<li class="tile"><canvas class="pic" data-icon="${id}" aria-hidden="true"></canvas><h3>${esc(v.name.toUpperCase())}</h3><p>` +
          `${esc(v.short)}</p></li>`;
    })
    .join('');
}

/**
 * Pictures the page asks for in its own markup:
 *   <canvas class="pic" data-subjects="seed,kindle">  what a Boon card would show for those subjects
 *   <canvas class="pic" data-icon="conquest">         one of the game's icons
 */
export function startPictures() {
  for (const el of document.querySelectorAll<HTMLCanvasElement>('canvas.pic')) {
    const hover = el.closest('li, .tile') ?? el;
    const icon = el.dataset.icon;
    const subs = (el.dataset.subjects ?? '').split(',').filter(Boolean);
    const seed = [...(icon ?? subs.join())].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    stage(
      el,
      3,
      (g, w, h, t, lively) => {
        starWindow(g, 0, 0, w, h, seed, t, lively);
        if (icon) {
          const pic = iconCanvas(icon, house.color);
          const k = Math.max(1, Math.min(3, Math.floor((h - 4) / pic.height)));
          // It rides a slow swell (quicker under the pointer).
          const bob = Math.round(Math.sin(t * (lively ? 5 : 1.6) + seed));
          g.drawImage(pic, Math.round((w - pic.width * k) / 2), Math.round((h - pic.height * k) / 2) + bob, pic.width * k, pic.height * k);
          return;
        }
        let look: Look = { color: house.color, scale: 2, iconScale: 3, t, lively, turn: true };
        if (subjectsSize(subs, look).w > w - 4) look = { ...look, iconScale: 2 };
        if (subjectsSize(subs, look).w > w - 4) look = { ...look, scale: 1 };
        drawSubjects(g, subs, w / 2, 0, h, look, 'center');
      },
      hover,
    );
  }
}

/** "07:12:33" until the next Daily Run (a new sector for everyone at midnight UTC). */
export function startDailyClock() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-daily-clock]')];
  if (!els.length) return;
  const two = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const s = Math.max(0, Math.floor((next - d.getTime()) / 1000));
    const text = `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
    for (const el of els) el.textContent = text;
  };
  tick();
  window.setInterval(tick, 1000);
}
