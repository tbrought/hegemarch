/**
 * The setup of a run: the house, the size of the sector, the difficulty, the seed; a challenge taken up
 * from a link; and the question before a new run replaces a saved one.
 */

import { DIFFICULTY_NAMES } from '../../game/constants';
import { ERAS } from '../../game/data/eras';
import { HEIR_BY_ID, HEIRS } from '../../game/data/heirs';
import { VICTORIES } from '../../game/data/victories';
import { dailyConfig } from '../../game/replay';
import { randomSeed } from '../../game/rng';
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

/** A run whose settings are set for the player (the Daily, a challenge): what they are, and why. */
interface Fixed {
  size: MapSize;
  difficulty: number;
  seed: number;
  ages: boolean;
  why: string;
  seedHelp: string;
  daily: boolean;
}

/** The sizes of a sector: its name, and what it holds (the setup of a run, and the multiplayer lobby). */
export const sizesOf = (ages: boolean): [MapSize, string, string][] => ages
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

/**
 * A difficulty in a line, under its buttons (the setup of a run, and the multiplayer lobby): what it gives the rivals, from the
 * numbers the game plays by (until 1.23.6 Brutal said "Merciless." and nothing more), and Legacy in its gold, as everywhere.
 */
export function difficultyHelp(d: number): string {
  return esc(difficultySummary(d)).replace(/Legacy ×\d+(\.\d+)?/, '<span class="gold">$&</span>');
}

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
  const sizes = sizesOf(ages);
  const diffHelp = DIFFICULTY_NAMES.map((_, i) => difficultyHelp(i));
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
          <p class="dim">${ch.ages ? 'An Ages run. ' : ''}The sector is the challenge, set below as it was played: choose your house and launch.</p>
          <button class="small" data-sa="drop-challenge" data-tip="Forget the challenge and set up a run of your own.">PLAY SOMETHING ELSE</button>
        </div>`
    : '';
  // What is set for the player: the Daily's settings are the day's (the board plays it again by them), and a
  // challenge's sector is the one it names. The same panel then, in the same place, with what is set lit and the
  // rest greyed, saying why (until 1.26.1 the Daily's were a list in its sentence, and the panel was not there).
  const dc = daily && !ch ? dailyConfig(todayKey(), st.heir) : null;
  const fixed: Fixed | null = dc
    ? { size: dc.size, difficulty: dc.difficulty, seed: dc.seed, ages: false, why: 'The same for every player today.', seedHelp: 'Today\'s seed: every player\'s sector. A new one at midnight, UTC.', daily: true }
    : ch
      ? { size: ch.size, difficulty: ch.difficulty, seed: ch.seed, ages: !!ch.ages, why: 'Set by the challenge.', seedHelp: 'The challenge\'s seed: the sector it was played in.', daily: false }
      : null;
  const fixedOpts = (f: Fixed) => {
    const fs = sizesOf(f.ages);
    const sizeOf = fs.find((x) => x[0] === f.size)!;
    return `<div class="opts">
        <div class="opt px-box"><h4>${f.ages ? 'SIZE' : 'SECTOR'}</h4><div class="row">${fs.map(([k, n, d]) => k === f.size
          ? `<button class="small active" data-tip="${esc(`${f.why} ${d}`)}">${n}</button>`
          : `<button class="small disabled" data-sa="fixed" data-tip="${esc(`${f.why} ${d}`)}">${n}</button>`).join('')}</div>
          <div class="help">${f.why} ${sizeOf[2]}</div></div>
        <div class="opt px-box"><h4>DIFFICULTY</h4><div class="row">${DIFFICULTY_NAMES.map((n, i) => i === f.difficulty
          ? `<button class="small active" data-tip="${esc(`${f.why} ${diffTip[i]}`)}">${n.toUpperCase()}</button>`
          : `<button class="small disabled" data-sa="fixed" data-tip="${esc(`${f.why} ${diffTip[i]}`)}">${n.toUpperCase()}</button>`).join('')}</div>
          <div class="help">${f.why} ${diffHelp[f.difficulty]}</div></div>
        <div class="opt px-box"><h4>SEED</h4><div class="row"><input type="text" class="fixed" value="${f.seed}" readonly aria-label="Seed"><button class="small disabled" data-sa="fixed" data-tip="${esc(f.why)}">ROLL</button></div>
          <div class="help">${f.seedHelp}</div></div>
        ${f.daily ? `<div class="opt px-box"><h4>RULES</h4><div class="row"><span class="rule">EVERY BOON</span><span class="rule">NO PERKS</span><span class="purse">LEGACY ×1.25</span></div>
          <div class="help">Legendary Boons and Pacts are in every deck, and no perks from the Hall of Heirs come with you. A Daily pays a quarter more Legacy, won or lost.</div></div>` : ''}
      </div>`;
  };
  // The ways to play, as tabs: a change of mind costs one click here, not a trip back to the title screen.
  const tab = (sa: string, name: string, on: boolean) => `<button class="small${on ? ' active' : ''}" data-sa="${sa}" role="tab" aria-selected="` +
      `${on}">${name}</button>`;
  app.put('setup', `<div class="screen${app.crt()}"><div class="page">
      <h1>NEW RUN</h1>
      ${challenge}
      ${ch ? '' : `<div class="mode-tabs" role="tablist">${tab('setup', 'CLASSIC RUN', !daily && !ages)}${tab('ages', 'AGES RUN', ages)}${tab('daily', `DAILY RUN${p.lastDaily === todayKey() ? ' ✓' : ''}`, daily)}</div>`}
      <div class="lead"${ch ? ' hidden' : ''}>${daily ? `Today's sector, <em>the same for everyone</em> and played by the same rules. Take the crown and your time can go on <b>today's board</b>.` : ages ? '<b>A longer game.</b> Every house begins as <em>a tribe in the Stone Age</em>, all on one cradle world. Climb through the ages, build your Ark, and carry what you have won to the stars, where the crown is decided.' : 'Choose a house to bid for <b>the crown of Hegemarch</b>. The sector, your rivals, your Destinies and your Boons are <em>new every run</em>.'}</div>
      ${ages ? `<div class="px-box ages-head"><canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas>
        <div class="ages-names">${ERAS.map((e) => `<span>${e.short}</span>`).join('')}</div></div>` : ''}
      ${ages && !p.tutorialDone ? '<div class="px-box notice wide"><span>New to Hegemarch? An Ages run is the long game. The guided First Night (a Classic run with GUIDE ticked) teaches the basics in a few minutes.</span></div>' : ''}
      <div class="heirs">${heirs}</div>
      ${fixed ? fixedOpts(fixed) : `<div class="opts">
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
