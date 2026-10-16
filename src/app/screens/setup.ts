/**
 * The setup of a run: the house, the size of the sector, the difficulty, the seed; a challenge taken up
 * from a link; and the question before a new run replaces a saved one.
 */

import { DIFFICULTY_NAMES } from '../../game/constants';
import { ERAS } from '../../game/data/eras';
import { HEIR_BY_ID, HEIRS } from '../../game/data/heirs';
import { VICTORIES } from '../../game/data/victories';
import { dailySeed, randomSeed } from '../../game/rng';
import type { Difficulty, MapSize } from '../../game/types';
import { hasRun, saveProfile, todayKey } from '../../meta/profile';
import { fmtTime } from '../../render/Renderer';
import { esc } from '../../ui/format';
import { difficultySummary, difficultyText } from '../../ui/difficulty';
import { glossHtml } from '../../ui/glossary';
import { startingFleet } from '../houseArt';
import type { App } from '../App';
import { buildConfig, endedSavedRun, startRun } from '../run';
import type { ScreenActions } from './index';

export function rememberSetup(app: App) {
  const st = app.setup;
  app.profile.lastSetup = { heir: st.heir, size: st.size, difficulty: st.difficulty };
  saveProfile(app.profile);
}

export function showSetup(app: App) {
  const st = app.setup;
  const p = app.profile;
  const saved = hasRun();
  if (!saved) st.confirm = '';
  // A run is already in progress: ask in a pop-up over the page when a new run is launched (never as a
  // line below the fold, and not as a notice over the setup either: the pop-up says it when it matters).
  // The question has two answers, and the marked one is what the player just asked for. (Continuing the
  // saved run is not one of them: the title screen has offered that already, and here it only undid a
  // launch by a stray click.) The saved run ends as an abandoned one, Legacy paid.
  const dialog = st.confirm
    ? `<div class="dialog-back"><div class="px-box dialog" role="dialog" aria-modal="true">
          <h2>START A NEW RUN?</h2>
          <p>Your saved run ends here${app.savedRun ? `:<br><b>${esc(app.savedRun)}</b>` : '.'}</p>
          ${app.savedLegacy !== null ? `<p>It keeps the Legacy it has earned: <span class="gold">◆${app.savedLegacy}</span>.</p>` : ''}
          <div class="dialog-actions">
            <button class="primary" data-sa="confirm-new">START NEW RUN</button>
            <button data-sa="confirm-cancel">GO BACK</button>
          </div>
        </div></div>`
    : '';
  const heirs = HEIRS.map((h) => {
    const owned = p.heirs.includes(h.id);
    return `<div class="heir px-box ${st.heir === h.id ? 'sel' : ''} ${owned ? '' : 'locked'}" style="--hc:${h.color}" data-sa="heir:${h.id}" role="button" aria-pressed="${st.heir === h.id}" aria-label="${esc(h.name)}${owned ? '' : ', locked'}" tabindex="0">
        <canvas class="heir-art" data-heir="${h.id}" height="24" data-tip="${esc(`${h.name} starts with ${startingFleet(h)}${h.start.epicCard ? ', and a random Epic Boon' : ''}.`)}"></canvas>
        <div class="hn${h.name.length > 20 ? ' long' : ''}">${esc(h.name.toUpperCase())}</div>
        <div class="ht">${esc(h.title)}${owned ? '' : ` · locked: ◆${h.cost} in the Hall of Heirs`}${p.winsByHeir[h.id] ? ` · <span class="gold">${p.winsByHeir[h.id]} win${p.winsByHeir[h.id] > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="hd">${glossHtml(h.desc)}</div>
        <ul>${h.bonuses.map((b) => `<li>${glossHtml(b)}</li>`).join('')}</ul>
      </div>`;
  }).join('');
  const ages = st.ages;
  const sizes: [MapSize, string, string][] = ages
    ? [
        ['small', 'SMALL', '3 houses on the cradle · about 50 to 70 minutes in all'],
        ['medium', 'MEDIUM', '4 houses on the cradle · about 60 to 85 minutes in all'],
        ['large', 'LARGE', '6 houses on the cradle · about 75 to 110 minutes in all'],
      ]
    : [
        ['small', 'SMALL', '3 houses · about 25 worlds · 25 to 40 minutes'],
        ['medium', 'MEDIUM', '4 houses · about 40 worlds · 35 to 50 minutes'],
        ['large', 'LARGE', '6 houses · about 60 worlds · 45 to 70 minutes'],
      ];
  // (What each one gives the rivals, from the numbers the game plays by: a line under the buttons, all of it on a button. Until 1.23.6 Brutal said "Merciless." and nothing more.)
  const diffHelp = DIFFICULTY_NAMES.map((_, i) => difficultySummary(i));
  const diffTip = DIFFICULTY_NAMES.map((_, i) => difficultyText(i));
  const daily = st.daily;
  // A challenge taken up from a link: its sector is fixed (that is the challenge); the house is the player's to choose.
  const ch = app.challenge;
  const vn = (v: string) => VICTORIES[v as keyof typeof VICTORIES]?.name ?? '';
  const challenge = ch
    ? `<div class="px-box challenge">
          <h3>A CHALLENGE</h3>
          <p><b>${esc(HEIR_BY_ID[ch.heir]?.name ?? 'Another house')}</b> played this sector and ${ch.won ? `was crowned${vn(ch.victory) ? ` by ${esc(vn(ch.victory))}` : ''} in <b class="gold">${fmtTime(ch.time)}</b>` : `fell after <b class="gold">${fmtTime(ch.time)}</b>`}.
            ${ch.won ? 'Take the crown faster.' : 'Last longer, or take the crown.'}</p>
          <p class="dim">${ch.ages ? 'An Ages run · ' : ''}${ch.size[0].toUpperCase() + ch.size.slice(1)} sector · ${DIFFICULTY_NAMES[ch.difficulty]} · seed ${ch.seed}. The sector is the challenge: choose your house and launch.</p>
          <button class="small" data-sa="drop-challenge" data-tip="Forget the challenge and set up a run of your own.">PLAY SOMETHING ELSE</button>
        </div>`
    : '';
  // The ways to play, as tabs: a change of mind costs one click here, not a trip back to the title screen.
  const tab = (sa: string, name: string, on: boolean) => `<button class="small${on ? ' active' : ''}" data-sa="${sa}" role="tab" aria-selected="` +
      `${on}">${name}</button>`;
  app.put('setup', `<div class="screen${app.crt()}"><div class="page">
      <h1>NEW RUN</h1>
      ${challenge}
      ${ch ? '' : `<div class="mode-tabs" role="tablist">${tab('setup', 'CLASSIC RUN', !daily && !ages)}${tab('ages', 'AGES RUN', ages)}${tab('daily', `DAILY RUN${p.lastDaily === todayKey() ? ' ✓' : ''}`, daily)}</div>`}
      <div class="lead"${ch ? ' hidden' : ''}>${daily ? `Today's sector is the same for everyone: medium, Normal, seed ${dailySeed()}. Legacy ×1.25.` : ages ? 'A longer game. Every house begins as a tribe in the Stone Age, all on one cradle world. Climb through the ages, build your Ark, and carry what you have won to the stars, where the crown is decided.' : 'Choose a house to bid for the crown of Hegemarch. The sector, your rivals, your Destinies and your Boons are new every run.'}</div>
      ${ages ? `<div class="px-box ages-head"><canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
        <div class="ages-names">${ERAS.map((e) => `<span>${e.short}</span>`).join('')}</div></div>` : ''}
      ${ages && !p.tutorialDone ? '<div class="px-box notice wide"><span>New to Hegemarch? An Ages run is the long game. The guided First Night (a Classic run with GUIDE ticked) teaches the basics in a few minutes.</span></div>' : ''}
      <div class="heirs">${heirs}</div>
      ${daily || ch ? '' : `<div class="opts">
        <div class="opt px-box"><h4>${ages ? 'SIZE' : 'SECTOR'}</h4><div class="row">${sizes.map(([k, n, d]) => `<button class="small ${st.size === k ? 'active' : ''}" data-sa="size:${k}" data-tip="${esc(d)}">${n}</button>`).join('')}</div>
          <div class="help">${sizes.find((x) => x[0] === st.size)![2]}</div></div>
        <div class="opt px-box"><h4>DIFFICULTY</h4><div class="row">${DIFFICULTY_NAMES.map((n, i) => `<button class="small ${st.difficulty === i ? 'active' : ''} ${i > p.maxDifficulty ? 'disabled' : ''}" data-sa="diff:${i}" data-tip="${esc(i > p.maxDifficulty ? `Locked: win a run on ${DIFFICULTY_NAMES[i - 1]} to unlock it. ${diffTip[i]}` : diffTip[i])}">${n.toUpperCase()}${i > p.maxDifficulty ? ' ×' : ''}</button>`).join('')}</div>
          <div class="help">${diffHelp[st.difficulty]}${p.maxDifficulty < 3 ? ' Win to unlock the next one.' : ''}</div></div>
        <div class="opt px-box"><h4>SEED</h4><div class="row"><input type="text" id="seed-input" placeholder="random" value="${esc(st.seed)}"><button class="small" data-sa="reseed" data-tip="Pick a random seed. The same seed always builds the same sector.">ROLL</button></div>
          <div class="help">Share a seed to replay the same sector.</div></div>
        ${ages ? '' : `<div class="opt px-box"><h4>GUIDE</h4><div class="check ${st.guided ? 'on' : ''}" data-sa="guided" role="checkbox" aria-checked="${st.guided}" tabindex="0"><span class="box"></span>Guided First Night</div>
          <div class="help">Shows the first few moves step by step and reveals the screen as you go.</div></div>`}
      </div>`}
      <div class="foot-actions"><button data-sa="menu">BACK</button>
        <button class="primary" data-sa="launch" style="font-size:14px;padding:14px 22px">LAUNCH</button></div>
    </div></div>${dialog}`);
}

/** What the buttons of the setup do. */
export const setupActions: ScreenActions = {
  'confirm-new': (app) => {
    const which = app.setup.confirm;
    app.setup.confirm = '';
    if (which) void startRun(app, buildConfig(app));
  },
  'confirm-cancel': (app) => {
    app.setup.confirm = '';
    showSetup(app);
  },
  heir: (app, arg) => {
    if (app.profile.heirs.includes(arg)) app.setup.heir = arg;
    rememberSetup(app);
    showSetup(app);
  },
  size: (app, arg) => {
    app.setup.size = arg as MapSize;
    rememberSetup(app);
    showSetup(app);
  },
  diff: (app, arg) => {
    app.setup.difficulty = parseInt(arg, 10) as Difficulty;
    rememberSetup(app);
    showSetup(app);
  },
  guided: (app) => {
    app.setup.guided = !app.setup.guided;
    showSetup(app);
  },
  reseed: (app) => {
    app.setup.seed = String(randomSeed());
    showSetup(app);
  },
  launch: (app) => {
    if (hasRun()) {
      app.savedLegacy = endedSavedRun()?.legacy ?? null;
      app.setup.confirm = 'launch';
      showSetup(app);
      return;
    }
    void startRun(app, buildConfig(app));
  },
  'drop-challenge': (app) => {
    app.challenge = null;
    showSetup(app);
  },
};
