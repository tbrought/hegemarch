/**
 * The throne (1.25.2): the fastest crown of the day makes its player that day's Hegemarch, and the page
 * says so where it is seen first, under the name of the game: who holds today's throne (or that it is
 * empty, and who held yesterday's). Down the page, on the board, the day's three fastest stand on a podium,
 * and the Hegemarchs of the days before stand in a line, each with its reign ("ABC II": letters crowned a
 * second time). From the board's server (worker/: /throne), asked again every minute while the page is seen.
 */
import { HEIR_BY_ID } from '../game/data/heirs';
import { dayOf, fetchThrone, regnal, type Throne } from '../meta/board';
import { fmtTime } from '../render/Renderer';
import { esc } from './stage';

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "16 OCT": a day of the board, as the line of Hegemarchs gives it. */
const dateOf = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''}`;
};
/** A house's name, in its color. */
const house = (heir: string) => {
  const h = HEIR_BY_ID[heir];
  return `<span class="house" style="--hc:${h?.color ?? 'var(--mist)'}">${esc(h?.name ?? heir)}</span>`;
};
/** The crown, in pixels: as the game draws one. */
export const CROWN_SVG =
  '<svg class="crown-mark" viewBox="0 0 11 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v7H0zM5 0h1v7H5zM10 0h1v7h-1zM1 2h1v5H1zM4 2h3v5H4zM9 2h1v5H9zM2 3h2v4H2zM7 3h2v4H7z"/></svg>';

export function startThrone(plaque: HTMLElement | null, board: HTMLElement | null) {
  const podium = board?.querySelector<HTMLElement>('.podium') ?? null;
  const line = board?.querySelector<HTMLElement>('.line-list') ?? null;
  const lineState = board?.querySelector<HTMLElement>('.line-state') ?? null;

  const show = (t: Throne) => {
    const yesterday = t.past.find((c) => c.day === dayOf(Date.now() - DAY));
    if (plaque) {
      const first = t.today[0];
      plaque.classList.toggle('empty', !first);
      plaque.querySelector('.throne-head')!.textContent = first ? 'TODAY\'S HEGEMARCH' : 'THE THRONE IS EMPTY';
      plaque.querySelector('.throne-name')!.textContent = first ? regnal(first.name, first.reign) : '';
      plaque.querySelector('.throne-what')!.innerHTML = first
        ? `${house(first.heir)} · ${fmtTime(first.time)}`
        : yesterday
          ? `No one has taken today's crown. Yesterday's: <b>${esc(regnal(yesterday.name, yesterday.reign))}</b>, ${house(yesterday.heir)}, ${fmtTime(yesterday.time)}`
          : 'No one has taken today\'s crown. It could be yours.';
      plaque.hidden = false;
    }
    if (podium) {
      // (Second, first, third, left to right: the first in the middle, highest.)
      podium.innerHTML = [1, 0, 2]
        .map((i) => {
          const r = t.today[i];
          const place = i === 0 ? `${CROWN_SVG}<span class="place">TODAY'S HEGEMARCH</span>` : `<span class="place">${i === 1 ? '2ND' : '3RD'}</span>`;
          return r
            ? `<div class="step${i === 0 ? ' first' : ''}">${place}<b class="who">${esc(regnal(r.name, r.reign))}</b>${house(r.heir)}<span class="time">${fmtTime(r.time)}</span></div>`
            : `<div class="step open${i === 0 ? ' first' : ''}">${place}<b class="who">${i === 0 ? 'EMPTY' : 'OPEN'}</b><span class="house">${i === 0 ? 'No crown yet today' : 'Yours to take'}</span><span class="time">--:--</span></div>`;
        })
        .join('');
    }
    if (line && lineState) {
      line.innerHTML = t.past
        .map((c) => `<li style="--hc:${HEIR_BY_ID[c.heir]?.color ?? 'var(--mist)'}"><span class="date">${dateOf(c.day)}</span><b class="who">${esc(regnal(c.name, c.reign))}</b>${house(c.heir)}<span class="time">${fmtTime(c.time)}</span></li>`)
        .join('');
      lineState.textContent = t.past.length ? '' : 'The first Hegemarch of the board is crowned when its first day is over.';
    }
  };

  const load = async () => {
    try {
      show(await fetchThrone());
    } catch {
      // (The board cannot be reached: the name under the game's says nothing rather than something wrong.)
      if (plaque) plaque.hidden = true;
      if (lineState && line && !line.children.length) lineState.textContent = 'The board could not be reached just now.';
    }
  };
  void load();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void load();
  }, 60_000);
}
