/**
 * The title screen: the run in progress or the First Night, the ways to play side by side, and the
 * rest in a row at the foot.
 */

import { HEIR_BY_ID } from '../../game/data/heirs';
import { hasRun, saveProfile, todayKey } from '../../meta/profile';
import { fmtTime } from '../../render/Renderer';
import { esc } from '../../ui/format';
import type { App } from '../App';
import { GAME_VERSION, NO_MOUSE } from '../env';
import { continueRun, describeSavedRun, firstNightConfig, savedRunInfo, startRun } from '../run';
import { hallOffers, showHall } from './hall';
import { showSetup } from './setup';
import { howtoHtml } from '../howto';
import { showSettings } from './settings';
import type { ScreenActions } from './index';

/**
 * The title screen. What the player most likely wants is the largest thing on it: the run in progress,
 * or, for a new player, the guided First Night. Under it the ways to play stand side by side, each
 * with a living picture of what it is (app/modeArt.ts); everything else is a quiet row at the foot.
 */
export function showMenu(app: App) {
  app.screen = 'menu';
  if (app.sfx.ctx && app.music.playing !== 'title') app.music.play('title');
  const p = app.profile;
  const saved = hasRun();
  const run = saved ? savedRunInfo() : null;
  const first = !saved && !p.tutorialDone && p.runs === 0;
  const dailyDone = p.lastDaily === todayKey();
  app.menuDay = todayKey();
  queueMicrotask(() => (app.menuNotice = ''));
  const banner = (heir: string) => `<canvas class="heir-art chosen" data-heir="${heir}" height="24" aria-hidden="true"></canvas>`;
  const hero = saved
    ? `<button class="hero" data-sa="continue" style="--hc:${run?.color ?? 'var(--gold)'}">
          ${run && run.era >= 0 ? `<canvas class="mode-art" data-art="ages" data-era="${run.era}" data-color="${run.color}" aria-hidden="true"></canvas>` : banner(run?.heir ?? 'concord')}
          <span class="hero-text"><span class="hero-kicker">${esc((run?.kind ?? 'Run').toUpperCase())} IN PROGRESS</span>
            <span class="hero-title">${esc((run?.name ?? 'Your saved run').toUpperCase())}</span>
            <span class="hero-line">${esc(run?.line ?? 'Pick it up where you left it.')}</span></span>
          <span class="hero-go">CONTINUE</span>
        </button>`
    : first
      ? `<button class="hero" data-sa="first-night" style="--hc:${HEIR_BY_ID.concord.color}">
          ${banner('concord')}
          <span class="hero-text"><span class="hero-kicker">YOUR FIRST RUN</span>
            <span class="hero-title">THE FIRST NIGHT</span>
            <span class="hero-line">A guided run in a small, quiet sector. The game shows you the first few moves, one at a time.</span></span>
          <span class="hero-go">BEGIN</span>
        </button>`
      : '';
  const offers = hallOffers(app);
  app.ui.innerHTML = `<div class="screen menu${app.crt()}">
      <div class="logo">HEGEMARCH</div>
      <div class="tagline">The last Hegemarch fell, and the sector went dark. <em>Light it again</em>, world by world, and <b>take the crown</b>.</div>
      ${NO_MOUSE ? '<div class="px-box notice">Hegemarch is played with a mouse and keyboard. On a phone or tablet you can look, but not play it well: open it on a computer.</div>' : ''}
      ${app.menuNotice ? `<div class="px-box notice">${esc(app.menuNotice)}</div>` : ''}
      <div class="home${hero ? '' : ' solo'}">
        ${hero}
        <div class="home-label"><span>${saved ? 'OR START A NEW RUN' : first ? 'OR CHOOSE YOUR OWN RUN' : 'CHOOSE YOUR RUN'}</span></div>
        <div class="modes">
          <button class="mode sector" data-sa="setup" data-tip="Choose a house, a sector and a difficulty. 3 to 6 houses, 25 to 70 minutes. The sector, your rivals, your Destinies and your Boons are new every run.">
            <canvas class="mode-art" data-art="sector" aria-hidden="true"></canvas>
            <span class="mode-name">CLASSIC RUN</span>
            <span class="mode-pitch">A dark sector, rival houses and one crown.</span>
            <span class="mode-meta">25 TO 70 MIN</span>
          </button>
          <button class="mode ages" data-sa="ages" data-tip="A longer game. Every house starts in the Stone Age on one world, and climbs age by age to the stars.">
            ${p.agesSeen ? '' : '<span class="mode-flag">NEW</span>'}
            <canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
            <span class="mode-name">AGES RUN</span>
            <span class="mode-pitch">The long game. From the Stone Age to the stars.</span>
            <span class="mode-meta">50 TO 110 MIN</span>
          </button>
          <button class="mode daily" data-sa="daily" data-tip="The same sector for every player today, by the same rules: medium, Normal, with [Legacy ×1.25]. The fastest crowns go on today's board. The picture is the chart of today's sector.">
            <canvas class="mode-art" data-art="daily" aria-hidden="true"></canvas>
            <span class="mode-name">DAILY RUN${dailyDone ? ' ✓' : ''}</span>
            <span class="mode-pitch">Today's sector, the same for every player. Legacy ×1.25.</span>
            <span class="mode-meta" data-daily>${dailyLine(app)}</span>
          </button>
        </div>
        <div class="home-links">
          <button class="small hall-link" data-sa="hall" data-tip="Spend Legacy, earned by every run, on new houses, perks and unlocks.${offers ? ` [You can afford ${offers} of them now.]` : ''}">HALL OF HEIRS<span class="purse${offers ? ' lit' : ''}">◆${p.legacy}</span></button>
          <button class="small" data-sa="howto">HOW TO PLAY</button>
          <button class="small" data-sa="settings">SETTINGS</button>
        </div>
      </div>
      <div class="menu-foot">Runs <b>${p.runs}</b> · Crowned <b>${p.wins}</b>${p.bestTime !== null ? ` · Fastest crown <b>${fmtTime(p.bestTime)}</b>` : ''}<br>
      Real-time strategy · a new sector, new rivals and new Boons every run · v${GAME_VERSION}</div>
    </div>`;
}

/** While the title screen shows: the daily run counts down to the next one, and turns over with the day. */
export function tickMenu(app: App) {
  if (todayKey() !== app.menuDay) {
    showMenu(app);
    return;
  }
  const el = app.ui.querySelector('[data-daily]');
  const line = dailyLine(app);
  if (el && el.textContent !== line) el.textContent = line;
}

/** "ENDS IN 5H 12M": how long today's daily sector lasts (the day turns at midnight, UTC). */
function dailyLine(app: App): string {
  const now = new Date();
  const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  const m = Math.max(1, Math.ceil(left / 60000));
  const span = m >= 60 ? `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M` : `${m}M`;
  return app.profile.lastDaily === todayKey() ? `PLAYED · NEXT IN ${span}` : `ENDS IN ${span}`;
}

/** How to Play: the game in five moves, each a picture and a sentence (app/howto.ts). */
export function showHowto(app: App) {
  app.screen = 'howto';
  app.ui.innerHTML = [
    `<div class="screen${app.crt()}"><div class="page px-box howto" style="max-width:820px"><h1>HOW TO PLAY</h1>`,
    howtoHtml(),
    `<div class="foot-actions"><button data-sa="menu">BACK</button><button class="primary" data-sa="setup">NEW RUN</button></div></div></div>`,
  ].join('');
}

/** What the buttons of the title screen do, and BACK and the like on every page: where they lead. */
export const menuActions: ScreenActions = {
  menu: (app) => {
    showMenu(app);
  },
  continue: (app) => {
    void continueRun(app);
  },
  setup: (app) => {
    app.setup.daily = false;
    app.setup.ages = false;
    app.setup.confirm = '';
    app.savedRun = describeSavedRun();
    showSetup(app);
  },
  ages: (app) => {
    app.setup.daily = false;
    app.setup.ages = true;
    app.setup.confirm = '';
    if (!app.profile.agesSeen) {
      app.profile.agesSeen = true;
      saveProfile(app.profile);
    }
    app.savedRun = describeSavedRun();
    showSetup(app);
  },
  daily: (app) => {
    app.setup.daily = true;
    app.setup.ages = false;
    app.setup.confirm = '';
    app.savedRun = describeSavedRun();
    showSetup(app);
  },
  'first-night': (app) => {
    // (The title screen offers the First Night only when no run is saved; a saved one is never replaced unasked.)
    if (hasRun()) showMenu(app);
    else void startRun(app, firstNightConfig(app));
  },
  hall: (app) => {
    showHall(app);
  },
  howto: (app) => {
    showHowto(app);
  },
  settings: (app) => {
    app.confirmReset = false;
    showSettings(app);
  },
};
