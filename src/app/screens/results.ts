/**
 * The results of a run: how it ended, its figures beside the player's records, the Legacy it earned,
 * the run to tell someone else, and the graphs of every house, minute by minute.
 */

import { AMBITION_BY_ID } from '../../game/data/ambitions';
import { CARD_BY_ID, PACT_COLOR, RARITY_COLOR } from '../../game/data/cards';
import { HEIR_BY_ID } from '../../game/data/heirs';
import { RELIC_BY_ID } from '../../game/data/relics';
import type { Order } from '../../game/Game';
import { BOARD_PAGE, nameProblem, ordinal, packOrders, postRun, runStatus, type BoardStatus } from '../../meta/board';
import type { LegacyReport } from '../../meta/legacy';
import { saveProfile } from '../../meta/profile';
import { fmtTime } from '../../render/Renderer';
import { groupBoons } from '../../ui/boons';
import { esc } from '../../ui/format';
import { chartsHtml, mountCharts, type RunCharts } from '../charts';
import { shipPic } from '../pics';
import { hallShop, showHall } from './hall';
import type { App } from '../App';
import { teardownSession } from '../run';
import { showSetup } from './setup';
import type { ScreenActions } from './index';

export interface ResultsData {
  report: LegacyReport;
  unlocked: string | null;
  won: boolean;
  title: string;
  reason: string;
  /** Each with what stands beside it, if anything: the record it beat, or the record that stands. */
  stats: [label: string, value: string, note?: { fresh: boolean; text: string }][];
  /** The run to tell someone else: a few lines, a link to the same sector, and how it went against a challenge. */
  share: { text: string; line: string; link: string; daily: boolean; versus: string | null };
  cards: string[];
  relics: string[];
  heir: string;
  ambition: string;
  /** The run in one paragraph, for a bug report: version, seed, setup, how it ended. */
  details: string;
  /** How every house stood, minute by minute, for the graphs (null: a run too short to draw). */
  charts: RunCharts | null;
  /**
   * A Daily, for its board (meta/board.ts): the crown to send, with its orders, or why it cannot go (`why`);
   * once sent, its id, where it stands, and the line that says so. Null: not a Daily.
   */
  board: {
    day: string;
    heir: string;
    version: string;
    time: number;
    victory: string;
    orders: Order[] | null;
    why: string | null;
    id?: string;
    status?: 'sending' | BoardStatus['status'];
    said?: string;
    warn?: boolean;
  } | null;
}

/**
 * Copy a text for the button that was clicked. (A copy has to start in the click itself; where the
 * clipboard is refused, the text is put in a box and selected, to be copied by hand.)
 */
export function copy(app: App, el: HTMLElement, text: string, boxSel: string) {
  const done = () => (el.textContent = 'COPIED');
  const show = () => {
    const box = app.ui.querySelector<HTMLTextAreaElement>(boxSel);
    if (!box) return;
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
  };
  try {
    navigator.clipboard.writeText(text).then(done, show);
  } catch {
    show();
  }
}

export function showResults(app: App) {
  const r = app.results;
  if (!r) return;
  app.input?.destroy();
  app.input = null;
  app.hud = null;
  app.screen = 'results';
  // (A player who skips the ending is at the results before the fanfare is over: the music waits for it.)
  app.music.play('title', Math.max(0, app.fanfareEnds - (app.sfx.ctx?.currentTime ?? 0)));
  const heir = HEIR_BY_ID[r.heir];
  const ambLine = r.report.lines.find(([k]) => k.startsWith('Ambition'));
  const cards = groupBoons(r.cards)
    .map(({ id, count }) => {
      const c = CARD_BY_ID[id];
      return `<span class="chip" style="--rc:${c.pact ? PACT_COLOR : RARITY_COLOR[c.rarity]}" data-tip-title="${esc(c.name)}" data-tip="` +
          `${esc(c.desc)}">${esc(c.name)}${count > 1 ? ` <b>×${count}</b>` : ''}</span>`;
    })
    .join('');
  const relics = r.relics.map((id) => `<span class="chip" style="--rc:var(--sky)" data-tip-title="${esc(RELIC_BY_ID[id]?.name ?? id)}" data-tip="` +
      `${esc(RELIC_BY_ID[id]?.desc ?? '')}">♦ ${esc(RELIC_BY_ID[id]?.name ?? id)}</span>`).join('');
  const amb = AMBITION_BY_ID[r.ambition];
  const daily = app.session?.game.config.daily;
  // Legacy is what a run leaves behind, and the reason to play another: it is the headline here, with
  // what it buys right now, or how far the next thing is. (As one dim line under a table it was missed.)
  const have = app.profile.legacy;
  const shop = hallShop(app);
  const afford = shop.filter((x) => x.cost <= have);
  const next = shop.find((x) => x.cost > have);
  const buys = afford.length
    ? (`<div class="lh-buys"><span>Enough for:</span>` +
        `${afford.slice(0, 4).map((x) => `<span class="chip" style="--rc:var(--gold)">${esc(x.name)} ◆${x.cost}</span>`).join('')}` +
        `${afford.length > 4 ? `<span class="dim">and ${afford.length - 4} more</span>` : ''}</div>`)
    : next
      ? (`<div class="lh-buys"><span>Next: <b>${esc(next.name)}</b> ◆${next.cost}, <b>◆${next.cost - have}</b> to go</span><span class="lh-bar"><i ` +
          `style="width:${Math.round((100 * have) / next.cost)}%"></i></span></div>`)
      : '<div class="lh-buys"><span>Everything in the Hall of Heirs is yours.</span></div>';
  const legacyHero = `<div class="px-box legacy-hero">
        <div class="lh-earned"><span class="lh-num">◆<span id="legacy-total">0</span></span><span class="lh-label">LEGACY EARNED</span></div>
        <div class="lh-text"><p><b>Legacy is yours to keep.</b> Every run earns it, win or lose. Spend it in the <b>Hall of Heirs</b> on new houses to play, on perks that every future run starts with, and on rarer Boons. You have <b class="gold">◆${have}</b> to spend.</p>${buys}</div>
        <button class="${afford.length ? 'primary' : ''}" data-sa="results-hall">${afford.length ? 'SPEND IT' : 'SEE THE HALL'}</button>
      </div>`;
  // A Daily: its board, where a crown can be posted under three letters (and is played again before it goes up).
  const b = r.board;
  const busy = !!b && (b.status === 'sending' || b.status === 'pending' || b.status === 'verified' || b.status === 'rejected');
  const boardBox = b
    ? `<div class="px-box board-box">
        <h3>THE DAILY BOARD</h3>
        <p>${b.why ? esc(b.why) : `Crowned in <span class="gold">${fmtTime(b.time)}</span>. Post it on the board of ${esc(b.day)}: the day's fastest crowns, at hegemarch.com.`}</p>
        <div class="row">
          <label class="board-name">YOUR LETTERS <input id="board-name" type="text" maxlength="3" autocomplete="off" spellcheck="false" aria-label="Three letters" value="${esc(app.profile.boardName ?? '')}"${b.why || busy ? ' disabled' : ''}></label>
          <button class="small primary${b.why || busy ? ' disabled' : ''}" data-sa="board-post" data-tip="${esc(b.why ?? 'Sends this run to the board. The board plays it again to check it, and it goes up in a minute or two.')}">${boardButton(b)}</button>
          <a class="board-see" href="${BOARD_PAGE}" target="_blank" rel="noopener">SEE THE BOARD</a>
        </div>
        <p class="board-state${b.warn ? ' warn' : ''}" aria-live="polite">${esc(b.said ?? '')}</p>
        <p class="dim">The board keeps your three letters, your house, your time and the orders you gave (it plays the run again to check it), and nothing else: no account, no email address, no cookie.</p>
      </div>`
    : '';
  app.ui.innerHTML = `<div class="screen results${app.crt()}"><div class="page">
      <div class="logo" style="font-size:clamp(28px,6vw,56px);${r.won ? '' : 'color:var(--red);text-shadow:4px 4px 0 var(--wine),8px 8px 0 var(--night)'}">${r.title}</div>
      <div class="reason">${esc(r.reason)}</div>
      ${legacyHero}
      ${boardBox}
      <div class="cols">
        <div class="px-box"><h3>THE REIGN OF ${esc((heir ? (heir.short ?? `the ${heir.name}`) : 'your house').toUpperCase())}</h3><table class="stats">${r.stats.map(([k, v, n]) => `<tr><td>${k}</td><td>${esc(v)}${n ? ` <span class="rec${n.fresh ? ' fresh' : ''}">${esc(n.text)}</span>` : ''}</td></tr>`).join('')}</table></div>
        <div class="px-box"><h3>LEGACY EARNED</h3><table class="stats">
          ${r.report.lines.filter(([k]) => !k.startsWith('Ambition')).map(([k, v]) => `<tr><td>${esc(k)}</td><td>+${v}</td></tr>`).join('')}
          <tr><td>Difficulty${daily ? ' and daily' : ''} multiplier</td><td>×${r.report.multiplier.toFixed(2)}</td></tr>
          ${ambLine ? `<tr><td class="gold" data-tip="${esc(amb?.desc ?? '')}">${esc(ambLine[0])}</td><td>+${ambLine[1]}</td></tr>` : amb ? `<tr><td class="dim" data-tip="${esc(`${amb.desc} Missed this time.`)}">Ambition: ${esc(amb.name)} (missed)</td><td>—</td></tr>` : ''}
          <tr class="total"><td>TOTAL</td><td>◆${r.report.total}</td></tr></table>
          ${r.unlocked ? `<div class="good" style="margin-top:10px">New difficulty unlocked: <b>${r.unlocked}</b></div>` : ''}</div>
      </div>
      <div class="px-box" style="margin-top:16px"><h3>BOONS</h3><div class="chips">${cards || '<span class="dim">None</span>'}</div>
        ${relics ? `<h3 style="margin-top:12px">RELICS</h3><div class="chips">${relics}</div>` : ''}</div>
      <div class="px-box share">
        <h3>SHARE THIS RUN</h3>
        ${r.share.versus ? `<p class="share-vs">${esc(r.share.versus)}</p>` : ''}
        <pre class="share-text">${esc(r.share.text)}</pre>
        <div class="row">
          <button class="small primary" data-sa="copy-share" data-tip="Copies these lines, to paste where your friends are.">COPY RESULT</button>
          <button class="small" data-sa="copy-link" data-tip="Copies the link alone. Whoever opens it plays this same sector, with the same size and difficulty, and sees your result as the one to beat.">COPY CHALLENGE LINK</button>
          ${r.share.daily ? '<button class="small" data-sa="copy-line" data-tip="Copies today\'s result as one line: every player had the same sector today.">COPY DAILY LINE</button>' : ''}
        </div>
        <textarea id="share-box" readonly hidden rows="4"></textarea>
        <p class="dim">The link opens this same sector for whoever follows it: same seed, same size, same difficulty. Your result goes with it, as the one to beat.</p>
      </div>
      ${r.charts ? chartsHtml(r.charts, (type, color) => shipPic(type, color, 'rc-pic')) : ''}
      <div class="run-details">
        <button class="small" data-sa="copy-run" data-tip="Copies this run's version, seed, setup and outcome, to send with a bug report or to play the same sector again.">COPY RUN DETAILS</button>
        <textarea id="run-details" readonly hidden rows="6">${esc(r.details)}</textarea>
      </div>
      <div class="foot-actions"><button class="${afford.length ? 'primary' : ''}" data-sa="results-hall">${afford.length ? 'SPEND LEGACY IN THE HALL OF HEIRS' : 'HALL OF HEIRS'}</button><button class="${afford.length ? '' : 'primary'}" data-sa="results-again">NEW RUN</button></div>
    </div></div>`;
  if (r.charts) mountCharts(app.ui, r.charts);
  // The Legacy total counts up like a score.
  const el = app.ui.querySelector('#legacy-total');
  const total = r.report.total;
  const t0 = performance.now();
  const step = () => {
    if (!el?.isConnected) return;
    const k = Math.min(1, (performance.now() - t0 - 500) / 900);
    const v = Math.round(total * Math.max(0, k) * (2 - Math.max(0, k)));
    if (el.textContent !== String(v)) {
      el.textContent = String(v);
      if (v > 0) app.sfx.play('tick', 0.35);
    }
    if (k < 1) requestAnimationFrame(step);
    else if (total > 0) app.sfx.play('good', 0.5);
  };
  requestAnimationFrame(step);
}

/** The board's button, as the run stands with the board. */
function boardButton(b: NonNullable<ResultsData['board']>): string {
  return b.status === 'verified' ? 'ON THE BOARD' : b.status === 'pending' ? 'BEING CHECKED' : b.status === 'sending' ? 'SENDING…' : b.status === 'rejected' ? 'NOT TAKEN' : 'POST TO THE BOARD';
}

/** The board's line, and its button and letters as the run now stands. */
function boardSays(app: App, said: string, warn = false) {
  const b = app.results?.board;
  if (!b) return;
  b.said = said;
  b.warn = warn;
  if (app.screen !== 'results') return;
  const busy = b.status === 'sending' || b.status === 'pending' || b.status === 'verified' || b.status === 'rejected';
  const state = app.ui.querySelector<HTMLElement>('.board-state');
  if (state) {
    state.textContent = said;
    state.classList.toggle('warn', warn);
  }
  const btn = app.ui.querySelector<HTMLElement>('[data-sa="board-post"]');
  if (btn) {
    btn.textContent = boardButton(b);
    btn.classList.toggle('disabled', busy || !!b.why);
  }
  const input = app.ui.querySelector<HTMLInputElement>('#board-name');
  if (input) input.disabled = busy || !!b.why;
}

/** Send the crown to the board, and follow it until it is checked. */
async function postToBoard(app: App) {
  const b = app.results?.board;
  if (!b || b.why || !b.orders || b.status) return;
  const input = app.ui.querySelector<HTMLInputElement>('#board-name');
  const name = (input?.value ?? '').trim().toUpperCase();
  const bad = nameProblem(name);
  if (bad) {
    boardSays(app, bad, true);
    input?.focus();
    return;
  }
  app.profile.boardName = name;
  saveProfile(app.profile);
  b.status = 'sending';
  boardSays(app, 'Sending…');
  try {
    const packed = await packOrders(b.orders);
    const r = await postRun({ day: b.day, heir: b.heir, version: b.version, name, time: b.time, victory: b.victory, ...packed });
    b.id = r.id;
    follow(app, b, r);
  } catch (err) {
    b.status = undefined;
    boardSays(app, `The board could not be reached (${(err as Error).message}). Try again in a moment.`, true);
  }
}

/** What became of a run sent: said as it comes, and asked again every ten seconds while it is checked (for up to a quarter of an hour). */
function follow(app: App, b: NonNullable<ResultsData['board']>, s: BoardStatus) {
  b.status = s.status;
  if (s.status === 'verified') boardSays(app, `On the board: ${ordinal(s.rank ?? 1)} of ${s.of ?? 1} on ${b.day}.`);
  else if (s.status === 'rejected') boardSays(app, `The board did not take it: ${s.reason ?? 'it did not stand'}.`, true);
  else boardSays(app, 'Sent. The board is playing your run again to check it: a minute or two.');
  if (s.status !== 'pending') return;
  const started = Date.now();
  const ask = async () => {
    if (app.results?.board !== b || b.status !== 'pending' || !b.id) return;
    if (Date.now() - started > 15 * 60_000) {
      boardSays(app, 'Still being checked. See it on the board at hegemarch.com.');
      return;
    }
    try {
      const now = await runStatus(b.id);
      if (now.status !== 'pending') return follow(app, b, now);
    } catch {
      /* (Asked again in a moment.) */
    }
    window.setTimeout(() => void ask(), 10_000);
  };
  window.setTimeout(() => void ask(), 8_000);
}

/** What the buttons of the results do. */
export const resultsActions: ScreenActions = {
  'board-post': (app) => void postToBoard(app),
  'copy-run': (app, _arg, el) => {
    copy(app, el, app.results?.details ?? '', '#run-details');
  },
  'copy-share': (app, _arg, el) => {
    copy(app, el, app.results?.share.text ?? '', '#share-box');
  },
  'copy-link': (app, _arg, el) => {
    copy(app, el, app.results?.share.link ?? '', '#share-box');
  },
  'copy-line': (app, _arg, el) => {
    copy(app, el, app.results?.share.line ?? '', '#share-box');
  },
  'results-hall': (app) => {
    teardownSession(app);
    showHall(app);
    void app.attract.start();
    app.music.play('title');
  },
  'results-again': (app) => {
    teardownSession(app);
    app.setup.daily = false;
    app.setup.confirm = '';
    showSetup(app);
    void app.attract.start();
    app.music.play('title');
  },
};
