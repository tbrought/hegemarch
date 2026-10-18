/**
 * The throne (1.25.3): the arcade's moment, after a crowned Daily's ending and before its results. The day's
 * board as it stands, with this run's row already in the place its time would take, its letters blinking,
 * waiting to be typed (three to five, A to Z, as an arcade's high-score table takes initials). The headline
 * says what is at stake: the throne itself (the front page of hegemarch.com), the podium, or a place.
 * Posting sends the run (the results go on following it); NOT TODAY goes to the results, where it can be
 * posted still. Only a crowned Daily the board takes comes here; any other run goes straight to its results.
 */
import { HEIR_BY_ID } from '../../game/data/heirs';
import { fetchBoard, nameProblem, ordinal, type Board } from '../../meta/board';
import { fmtTime } from '../../render/Renderer';
import { esc } from '../../ui/format';
import type { App } from '../App';
import type { ScreenActions } from './index';
import { CROWN_SVG, sendToBoard, showResults } from './results';

/** The letters a name takes: at least `LEAST`. */
const SLOTS = 5;
const LEAST = 3;
const A = 'A'.charCodeAt(0);
/** The arrows over and under a letter, in pixels. */
const UP = '<svg viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM0 3h7v1H0z"/></svg>';
const DOWN = '<svg viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z"/></svg>';

interface Throne {
  letters: string[];
  /** The slot the cursor is on. */
  at: number;
  /** The day's board, once asked; `down`: it could not be reached. */
  board: Board | null;
  down: boolean;
  said: string;
  warn: boolean;
  /** Posted: the letters are stamped, and the results come. */
  posted: boolean;
}
let th: Throne | null = null;

/** Does this run come to the throne? A crowned Daily the board takes, not sent yet, not shown it yet. */
export function wantsThrone(app: App): boolean {
  const b = app.results?.board;
  return !!b && !b.why && !b.status && !!b.orders && !app.results!.throneSeen;
}

export function showThrone(app: App) {
  const r = app.results;
  const b = r?.board;
  if (!r || !b) return showResults(app);
  r.throneSeen = true;
  app.input?.destroy();
  app.input = null;
  app.hud = null;
  app.music.play('title', Math.max(0, app.fanfareEnds - (app.sfx.ctx?.currentTime ?? 0)));
  const letters = [...(app.profile.boardName ?? '')].slice(0, SLOTS);
  th = { letters, at: Math.min(letters.length, SLOTS - 1), board: null, down: false, said: '', warn: false, posted: false };
  draw(app);
  fetchBoard(b.day)
    .then((board) => {
      if (!th) return;
      th.board = board;
      draw(app);
    })
    .catch(() => {
      if (!th) return;
      th.down = true;
      draw(app);
    });
}

/** Where this run's time puts it on the day's board (1: the throne), and of how many. */
function place(app: App): { rank: number; of: number } | null {
  const b = app.results!.board!;
  if (!th?.board) return null;
  // (A time equal to one on the board comes after it: the earlier run took it first.)
  const rank = th.board.runs.filter((x) => x.time <= b.time).length + 1;
  return { rank, of: th.board.count + 1 };
}

function headline(app: App): string {
  const b = app.results!.board!;
  const p = place(app);
  if (!p) return `YOUR TIME: ${fmtTime(b.time)}`;
  if (p.rank === 1) return 'YOU WOULD TAKE THE THRONE';
  if (p.rank <= 3) return "A PLACE ON TODAY'S PODIUM";
  return `${ordinal(p.rank).toUpperCase()} OF ${p.of} TODAY`;
}

/** The rows of the table: the board's best, this run's row where it falls (and the rows round it, if it falls low). */
function rows(app: App): string {
  const b = app.results!.board!;
  const p = place(app);
  if (!th?.board || !p) return '';
  const runs = th.board.runs;
  const you = { you: true as const };
  const merged: ({ you: true } | (typeof runs)[number])[] = [...runs.slice(0, p.rank - 1), you, ...runs.slice(p.rank - 1)];
  const show = p.rank <= 5 ? merged.slice(0, 5).map((x, i) => [i, x] as const) :
    [...merged.slice(0, 3).map((x, i) => [i, x] as const), [-1, null] as const, ...merged.slice(p.rank - 2, p.rank + 1).map((x, i) => [p.rank - 2 + i, x] as const)];
  const heir = HEIR_BY_ID[b.heir];
  return show
    .map(([i, x]) => {
      if (!x) return '<tr class="gap"><td colspan="4">⋯</td></tr>';
      if ('you' in x) {
        const name = Array.from({ length: SLOTS }, (_, k) => th!.letters[k] ?? '').join('').padEnd(LEAST, '·');
        return `<tr class="you"><td>${ordinal(i + 1)}</td><td class="who">${esc(name)}</td><td style="--hc:${heir?.color ?? 'var(--bone)'}">${esc(heir?.name ?? '')}</td>` +
          `<td class="time">${fmtTime(b.time)}<span class="you-tag">YOU</span></td></tr>`;
      }
      const h = HEIR_BY_ID[x.heir];
      return `<tr><td>${ordinal(i + 1)}</td><td class="who">${esc(x.name)}</td><td style="--hc:${h?.color ?? 'var(--mist)'}">${esc(h?.name ?? x.heir)}</td><td class="time">${fmtTime(x.time)}</td></tr>`;
    })
    .join('');
}

function draw(app: App) {
  if (!th) return;
  const b = app.results!.board!;
  const p = place(app);
  const name = th.letters.join('');
  const short = name.length < LEAST;
  const slots = Array.from({ length: SLOTS }, (_, k) => {
    const ch = th!.letters[k];
    const cls = `slot${k === th!.at && !th!.posted ? ' at' : ''}${ch ? '' : ' blank'}${k >= LEAST ? ' extra' : ''}${th!.posted && ch ? ' stamped' : ''}`;
    return `<div class="slot-col"><button class="roll" data-sa="throne-up:${k}" aria-label="Next letter" tabindex="-1"${th!.posted ? ' disabled' : ''}>${UP}</button>` +
      `<button class="${cls}" data-sa="throne-at:${k}" style="--k:${k}" aria-label="Letter ${k + 1}"${th!.posted ? ' disabled' : ''}>${ch ?? '·'}</button>` +
      `<button class="roll" data-sa="throne-down:${k}" aria-label="Letter before" tabindex="-1"${th!.posted ? ' disabled' : ''}>${DOWN}</button></div>`;
  }).join('');
  const table = th.board
    ? `<table class="throne-table">${rows(app)}</table><p class="throne-of">${th.board.count ? `of ${th.board.count + 1} crowns today, yours with them` : 'the first crown of the day'}</p>`
    : th.down
      ? '<p class="throne-note">The board cannot be reached just now. Your letters are kept: you can post from your results.</p>'
      : '<p class="throne-note">Asking the board…</p>';
  const post = p?.rank === 1 || (th.board && !th.board.count) ? 'TAKE THE THRONE' : 'POST MY TIME';
  const why = short ? `${LEAST} to ${SLOTS} letters, A to Z.` : '';
  app.put('throne', `<div class="screen throne${app.crt()}"><div class="page">
      <div class="throne-crown">${CROWN_SVG}</div>
      <h1 class="throne-title">TODAY'S THRONE</h1>
      <p class="throne-head${p?.rank === 1 ? ' gold' : ''}">${esc(headline(app))}</p>
      <p class="throne-time">Crowned in <b>${fmtTime(b.time)}</b> · the Daily Run of ${esc(b.day)}</p>
      ${table}
      <div class="throne-entry" aria-label="Your letters">${slots}</div>
      <p class="throne-hint">Type ${LEAST} to ${SLOTS} letters, or roll each with the arrows. Enter posts.</p>
      <p class="throne-state${th.warn ? ' warn' : ''}" aria-live="polite">${esc(th.said)}</p>
      <div class="throne-actions">
        ${th.posted ? '<button class="primary" data-sa="throne-next">SEE YOUR RESULTS</button>' :
          `<button class="primary${short ? ' disabled' : ''}" data-sa="throne-post" data-tip="${esc(why || 'Sends this run to the board: it is played again to check it, and goes up in a minute or two.')}">${post}</button>` +
          '<button data-sa="throne-skip" data-tip="To your results without posting: you can still post from there.">NOT TODAY</button>'}
      </div>
      <p class="dim throne-privacy">The board keeps your letters, your house, your time and the orders you gave (it plays the run again to check it), and nothing else. The fastest crown of the day is shown on the front page of hegemarch.com.</p>
    </div></div>`);
}

/** Letters, as an arcade takes them: typed, rolled, moved over. */
function type(app: App, ch: string) {
  if (!th || th.posted) return;
  th.letters[th.at] = ch;
  th.letters = th.letters.slice(0, SLOTS).map((x) => x ?? 'A');
  th.at = Math.min(th.at + 1, SLOTS - 1);
  th.said = '';
  app.sfx.play('tick', 0.35);
  draw(app);
}
function erase(app: App) {
  if (!th || th.posted) return;
  // (On a letter: it goes. On an empty slot: the letter before it goes, and the cursor with it.)
  if (th.letters[th.at] === undefined && th.at > 0) th.at--;
  th.letters.splice(th.at, 1);
  app.sfx.play('tick', 0.25);
  draw(app);
}
function roll(app: App, k: number, by: number) {
  if (!th || th.posted) return;
  // (A slot past the last letter is the next one: the letters have no gaps.)
  const at = Math.min(k, th.letters.length);
  const now = th.letters[at];
  th.letters[at] = String.fromCharCode(A + (((now ? now.charCodeAt(0) - A + by : by > 0 ? 0 : 25) % 26) + 26) % 26);
  th.at = at;
  th.said = '';
  app.sfx.play('tick', 0.35);
  draw(app);
}
function move(app: App, by: number) {
  if (!th || th.posted) return;
  th.at = Math.max(0, Math.min(th.at + by, Math.min(th.letters.length, SLOTS - 1)));
  draw(app);
}

/** Post: the letters are stamped (a ring for each, ember to gold), the run is sent, and the results follow. */
function post(app: App) {
  if (!th || th.posted) return;
  const name = th.letters.join('');
  const bad = nameProblem(name);
  if (bad) {
    th.said = bad;
    th.warn = true;
    app.sfx.play('error', 0.4);
    draw(app);
    return;
  }
  th.posted = true;
  th.warn = false;
  th.said = 'Sent. The board is playing your run again to check it: a minute or two.';
  app.sfx.play('kindle', 0.6);
  draw(app);
  void sendToBoard(app, name);
  const was = th;
  window.setTimeout(() => {
    if (th === was && app.screen === 'throne') leave(app);
  }, 2600);
}

function leave(app: App) {
  th = null;
  showResults(app);
}

/** The keyboard on the throne: letters, Backspace, the arrows, Enter, Escape. Returns true when it took the key. */
export function throneKey(app: App, e: KeyboardEvent): boolean {
  if (app.screen !== 'throne' || !th) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (/^Key[A-Z]$/.test(e.code)) type(app, e.code.slice(3));
  else if (e.code === 'Backspace' || e.code === 'Delete') erase(app);
  else if (e.code === 'ArrowLeft') move(app, -1);
  else if (e.code === 'ArrowRight') move(app, 1);
  else if (e.code === 'ArrowUp') roll(app, th.at, 1);
  else if (e.code === 'ArrowDown') roll(app, th.at, -1);
  else if (e.code === 'Enter' || e.code === 'NumpadEnter') (th.posted ? leave(app) : post(app));
  else if (e.code === 'Escape') leave(app);
  else return false;
  e.preventDefault();
  return true;
}

export const throneActions: ScreenActions = {
  'throne-up': (app, arg) => roll(app, Number(arg), 1),
  'throne-down': (app, arg) => roll(app, Number(arg), -1),
  'throne-at': (app, arg) => {
    if (!th || th.posted) return;
    th.at = Math.min(Number(arg), th.letters.length, SLOTS - 1);
    draw(app);
  },
  'throne-post': (app) => post(app),
  'throne-skip': (app) => leave(app),
  'throne-next': (app) => leave(app),
};
