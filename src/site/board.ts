/**
 * The Daily board on the website (1.25): the day's fastest crowns, from the board's server (meta/board.ts),
 * today's as it fills and yesterday's as it closed; the fastest crowns of all time, each player's best (1.28);
 * and the visitor's own best times, from the game's profile in this browser (the website and the game at /play/
 * are one site, and share it). Nothing about the visitor leaves the browser.
 */
import { DIFFICULTY_NAMES } from '../game/constants';
import { HEIR_BY_ID } from '../game/data/heirs';
import { VICTORIES } from '../game/data/victories';
import { ALLTIME_SHOWN, dayOf, fetchAllTime, fetchBoard, ordinal, type AllTime, type Board } from '../meta/board';
import { loadProfile } from '../meta/profile';
import { fmtTime } from '../render/Renderer';
import { esc } from './stage';

const DAY = 24 * 60 * 60 * 1000;
const SIZES = ['small', 'medium', 'large'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
const by = (victory: string) => VICTORIES[victory as keyof typeof VICTORIES]?.name ?? '';
/** "17 Oct 2026": a Daily's day, whole (the all-time board's crowns are of any year). */
const longDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};
/** A crown on a board: its place, its letters, its house in its colour and its Destiny, (on the all-time board) its day, its time. */
const row = (place: number, r: { name: string; heir: string; time: number; victory: string }, day?: string) => {
  const h = HEIR_BY_ID[r.heir];
  const how = by(r.victory);
  return `<li><span class="place">${ordinal(place)}</span><b class="who">${esc(r.name)}</b><span class="house" style="--hc:${h?.color ?? 'var(--mist)'}">` +
    `${esc(h?.name ?? r.heir)}${how ? ` <small>by ${esc(how)}</small>` : ''}</span>${day ? `<span class="date">${esc(longDate(day))}</span>` : ''}` +
    `<span class="time">${fmtTime(r.time)}</span></li>`;
};

export function startBoard(root: HTMLElement) {
  // (The day's own list: the all-time board's has the same look, and comes first on the page.)
  const list = root.querySelector<HTMLElement>('.board-day .board-list')!;
  const state = root.querySelector<HTMLElement>('.board-day .board-state')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-day]')];
  let which: 'today' | 'yesterday' = 'today';
  let asked = 0;

  const show = (b: Board) => {
    list.innerHTML = b.runs.map((r, i) => row(i + 1, r)).join('');
    state.textContent = b.runs.length
      ? b.count > b.runs.length ? `The fastest ${b.runs.length} of ${b.count} crowns.` : ''
      : which === 'today' ? 'No crown on today\'s board yet. The first could be yours.' : 'No crowns were posted for yesterday.';
  };

  const load = async () => {
    const day = dayOf(Date.now() - (which === 'yesterday' ? DAY : 0));
    const mine = ++asked;
    if (!list.children.length) state.textContent = 'Asking the board…';
    try {
      const b = await fetchBoard(day);
      if (mine === asked) show(b);
    } catch {
      if (mine !== asked) return;
      list.innerHTML = '';
      state.textContent = 'The board could not be reached just now.';
    }
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      which = tab.dataset.day === 'yesterday' ? 'yesterday' : 'today';
      for (const t of tabs) t.setAttribute('aria-pressed', String(t === tab));
      list.innerHTML = '';
      void load();
    });
  }
  void load();
  // Today's board fills as the day goes on: it is asked again every minute while the page is open.
  window.setInterval(() => {
    if (which === 'today' && document.visibilityState === 'visible') void load();
  }, 60_000);
  showBest(root.querySelector<HTMLElement>('.your-best')!);
  const all = root.querySelector<HTMLElement>('.all-time');
  if (all) startAllTime(all);
}

/**
 * The all-time board: the fastest crowns ever, each player's best, with the day each was won. It changes only when a
 * crown comes to stand: asked for once, and again every five minutes while the page is seen.
 */
function startAllTime(box: HTMLElement) {
  const list = box.querySelector<HTMLElement>('.all-time-list')!;
  const state = box.querySelector<HTMLElement>('.all-time-state')!;
  const show = (a: AllTime) => {
    list.innerHTML = a.runs.map((r, i) => row(i + 1, r, r.day)).join('');
    state.textContent = !a.runs.length
      ? 'No crown has stood yet. The first could be yours.'
      : a.players > a.runs.length ? `The fastest ${ALLTIME_SHOWN} of ${a.players} players.` : '';
  };
  const load = async () => {
    if (!list.children.length) state.textContent = 'Asking the board…';
    try {
      show(await fetchAllTime());
    } catch {
      if (!list.children.length) state.textContent = 'The board could not be reached just now.';
    }
  };
  void load();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void load();
  }, 5 * 60_000);
}

/** The visitor's fastest crowns, by kind of run, as the game in this browser keeps them. */
function showBest(box: HTMLElement) {
  const list = box.querySelector<HTMLElement>('.best-list')!;
  const state = box.querySelector<HTMLElement>('.best-state')!;
  const p = loadProfile();
  const rows = Object.entries(p.records)
    .filter(([, r]) => r.crown !== undefined)
    .map(([key, r]) => {
      const [mode, size, diff] = key.split(':');
      return { mode, size, diff: Number(diff), crown: r.crown! };
    })
    .sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'classic' ? -1 : 1) || SIZES.indexOf(a.size) - SIZES.indexOf(b.size) || a.diff - b.diff);
  list.innerHTML = rows
    .map((r) => `<li><span>${r.mode === 'ages' ? 'Ages' : 'Classic'} · ${title(r.size)} · ${DIFFICULTY_NAMES[r.diff] ?? ''}</span><b>${fmtTime(r.crown)}</b></li>`)
    .join('');
  state.textContent = rows.length
    ? `${p.wins} crown${p.wins === 1 ? '' : 's'} in ${p.runs} run${p.runs === 1 ? '' : 's'}.`
    : 'Take a crown and your fastest times show here.';
}
