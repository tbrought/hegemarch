/**
 * A run's life in the app: set up and started, or taken up again from its save; carried across to the
 * stars (an Ages run); saved as it goes; and at its end counted, entered in the profile and its records,
 * and told to the results page.
 */

import { ascend } from '../game/ages';
import { DIFFICULTY_NAMES } from '../game/constants';
import { CARD_BY_ID } from '../game/data/cards';
import { ERAS, LAST_CRADLE_ERA } from '../game/data/eras';
import { HEIR_BY_ID } from '../game/data/heirs';
import { TRAIT_BY_ID } from '../game/data/traits';
import { VICTORIES } from '../game/data/victories';
import { Game } from '../game/Game';
import { dailySeed, hashString, randomSeed } from '../game/rng';
import type { GameConfig } from '../game/types';
import { applyRunToProfile, computeLegacy, runFigures, runTime } from '../meta/legacy';
import { clearRun, hasRun, loadRun, saveProfile, saveRun, todayKey } from '../meta/profile';
import { applyRecords, bracketOf, recordsOf, type RecordKey } from '../meta/records';
import { fmtTime } from '../render/Renderer';
import { groupBoons } from '../ui/boons';
import type { TallyLine } from '../ui/Ending';
import { fmt } from '../ui/format';
import { Hud } from '../ui/Hud';
import { Input } from '../ui/Input';
import { cradleVocabulary } from '../ui/vocab';
import type { App } from './App';
import { GAME_VERSION } from './env';
import { runCharts } from './charts';
import { runData } from './rundata';
import { FANFARE } from './sound';
import type { ResultsData } from './screens/results';
import { applySettings, fullscreen, toggleFullscreen } from './display';
import { Session } from './Session';
import { challengeLink, shareLine, shareText, versus, type Challenge } from './share';
import type { Outcome } from '../game/types';

export function buildConfig(app: App): GameConfig {
  const st = app.setup;
  // A challenge is the sector it names, as it was played: its seed, its size, its difficulty.
  const c = app.challenge;
  if (c) {
    app.challenge = null;
    return {
      seed: c.seed, size: c.size, difficulty: c.difficulty, heir: st.heir,
      perks: { ...app.profile.perks }, unlockLegendary: app.profile.unlockLegendary, unlockPacts: app.profile.unlockPacts,
      ...(c.ages ? { mode: 'ages' as const, stage: 'cradle' as const } : {}),
      challenge: { heir: c.heir, won: c.won, time: c.time, victory: c.victory },
    };
  }
  let seed: number;
  if (st.daily) seed = dailySeed();
  else if (st.seed.trim()) seed = /^\d+$/.test(st.seed.trim()) ? parseInt(st.seed.trim(), 10) >>> 0 : hashString(st.seed.trim());
  else seed = randomSeed();
  return {
    seed,
    size: st.daily ? 'medium' : st.size,
    difficulty: st.daily ? 1 : st.difficulty,
    heir: st.heir,
    perks: { ...app.profile.perks },
    unlockLegendary: app.profile.unlockLegendary,
    unlockPacts: app.profile.unlockPacts,
    daily: st.daily,
    tutorial: st.guided && !st.daily && !st.ages,
    // An Ages run begins on the cradle world.
    ...(st.ages ? { mode: 'ages' as const, stage: 'cradle' as const } : {}),
  };
}

/** The simple first run: a small, easy sector with the First Night guide. */
export function firstNightConfig(app: App): GameConfig {
  return {
    seed: randomSeed(),
    size: 'small',
    difficulty: 0,
    heir: 'concord',
    perks: { ...app.profile.perks },
    unlockLegendary: app.profile.unlockLegendary,
    unlockPacts: app.profile.unlockPacts,
    tutorial: true,
    // The three Destinies that need the least explaining (and no Maw in a first game).
    forcedVictories: ['conquest', 'domination', 'ascension'],
  };
}

/**
 * The saved run, ended as an abandoned one: the game, and the Legacy it earns. Nothing is stored.
 * Null if there is no saved run, or it cannot be read.
 */
export function endedSavedRun(): { game: Game; legacy: number } | null {
  const data = loadRun();
  if (!data) return null;
  try {
    const g = Game.load(data);
    g.ascended = false;
    g.declareWinner(-1, 'defeat', 'You left this run for a new one.');
    return { game: g, legacy: computeLegacy(g).total };
  } catch {
    return null;
  }
}

/**
 * A new run takes the place of the saved one. The saved run ends as an abandoned run would: it is
 * paid its Legacy and entered in the Chronicle, so that nothing but the run itself is lost. Returns
 * the Legacy paid (null if there was no saved run, or it could not be read).
 */
function retireSavedRun(app: App): number | null {
  const ended = endedSavedRun();
  clearRun();
  if (!ended) return null;
  const c = ended.game.config;
  applyRunToProfile(app.profile, ended.game, ended.legacy);
  if (c.daily && c.seed === dailySeed()) app.profile.lastDaily = todayKey();
  saveProfile(app.profile);
  return ended.legacy;
}

export async function startRun(app: App, config: GameConfig) {
  teardownSession(app);
  app.attract.stop();
  const token = ++app.prepToken;
  app.screen = 'loading';
  renderLoading(app, 0.2);
  await new Promise((r) => setTimeout(r, 40));
  let g: Game;
  try {
    g = Game.create(config);
    // The First Night leaves little to chance: now and then (one sector in a hundred) every way out of
    // the home system is guarded, and a Scout sent exploring would have nowhere safe to go. Deal again.
    for (let i = 0; i < 8 && config.tutorial && !config.daily && g.chartable(g.playerId) < 6; i++) {
      config = { ...config, seed: randomSeed() };
      g = Game.create(config);
    }
  } catch (e) {
    console.error(e);
    app.showMenu();
    return;
  }
  // (Only now that the new run exists does the saved one end.)
  const paid = retireSavedRun(app);
  renderLoading(app, 0.8);
  await new Promise((r) => setTimeout(r, 30));
  if (token !== app.prepToken) return;
  beginSession(app, g);
  if (paid !== null) app.session?.showToast(`Your last run ended: +${paid} Legacy.`, '#ffd23f', 9);
}

export async function continueRun(app: App) {
  const data = loadRun();
  if (!data) {
    app.showMenu();
    return;
  }
  let g: Game;
  try {
    g = Game.load(data);
  } catch (e) {
    console.error(e);
    clearRun();
    app.menuNotice = 'Your saved run was made by an older version of Hegemarch and could not be continued, so it was cleared. Your Legacy and ' +
        'unlocks are safe.';
    app.showMenu();
    return;
  }
  teardownSession(app);
  app.attract.stop();
  ++app.prepToken;
  beginSession(app, g);
  const s = app.session!;
  s.paused = true;
  s.showToast('Run restored. Paused: press Space to go on.', '#c8cbe6', 6);
}

function beginSession(app: App, g: Game) {
  app.ui.innerHTML = '';
  app.renderer.prepare(g);
  const s = new Session(g, app.renderer, app.screenObj, app.sfx, app.music, app.profile, {
    quit: (save) => {
      if (save) autosave(app);
      teardownSession(app);
      app.showMenu();
      void app.attract.start();
    },
    abandon: () => {
      g.ascended = false;
      g.declareWinner(-1, 'defeat', 'You abandoned the run.');
      // (A run that was walked away from is not told as a fall, and sets no records: straight to its results.)
      endRun(app, true);
      app.showResults();
    },
    ascend: () => void toStars(app, g),
    saveProfile: () => saveProfile(app.profile),
    applySettings: () => applySettings(app),
    fullscreen: () => fullscreen(),
    toggleFullscreen: () => toggleFullscreen(),
    showResults: () => {
      if (app.screen === 'game' && app.results) app.showResults();
    },
  });
  app.session = s;
  app.hud = new Hud(s);
  app.input = new Input(s, app.hud, app.canvas);
  app.screen = 'game';
  app.acc = 0;
  app.autosaveT = 0;
  app.warHeat = 0;
  const cap = g.player.capital;
  if (cap >= 0) {
    const n = g.nodes[cap];
    app.renderer.cam.focus(n.x, n.y + 90, 0.2);
    app.renderer.cam.x = n.x;
    app.renderer.cam.y = n.y;
    app.renderer.cam.zoom = 0.07;
  }
  if (g.config.tutorial && !g.ui.tut) app.hud.tutorial.start();
  else if (g.cradle && g.time < 1) s.modal = { kind: 'cradle', unbidden: true };
  else if (!g.cradle && !g.config.tutorial && (g.time < 1 || (g.config.ages && !g.ui.arrived))) {
    // (An Ages run arrives among the stars some minutes into that game: its omens are shown then.)
    s.modal = { kind: 'omens', unbidden: true };
    g.ui.arrived = 1;
  }
  app.music.play(g.cradle ? 'cradle' : 'night');
  app.canvas.focus();
}

/**
 * Ages: the player's Ark has left the cradle. Build the game among the stars from it, play that game
 * forward to the moment the player arrives (rivals whose Arks left earlier have had that long), and go on.
 */
async function toStars(app: App, cradle: Game) {
  teardownSession(app);
  const token = ++app.prepToken;
  app.screen = 'loading';
  renderLoading(app, 0.05, 'Your Ark crosses the dark…');
  await new Promise((r) => setTimeout(r, 60));
  let g: Game | null;
  try {
    g = ascend(cradle);
  } catch (e) {
    console.error(e);
    g = null;
  }
  if (token !== app.prepToken) return;
  if (!g) {
    // No rival is left to meet out there: the crown is already won.
    cradle.ascended = false;
    cradle.declareWinner(cradle.playerId, 'conquest', 'No rival house was left to follow you to the stars.');
    beginSession(app, cradle);
    return;
  }
  const arrival = g.config.ages?.arrival ?? 0;
  g.fxEnabled = false;
  while (g.time < arrival && !g.outcome) {
    for (let i = 0; i < 400 && g.time < arrival && !g.outcome; i++) g.step();
    renderLoading(app, 0.05 + 0.9 * Math.min(1, g.time / Math.max(1, arrival)));
    await new Promise((r) => setTimeout(r, 0));
    if (token !== app.prepToken) return;
  }
  g.fx.length = 0;
  g.fxEnabled = true;
  beginSession(app, g);
  saveRun(g.serialize());
}

export function teardownSession(app: App) {
  app.input?.destroy();
  app.input = null;
  app.hud = null;
  app.session = null;
}

export function autosave(app: App) {
  const s = app.session;
  if (!s || app.screen !== 'game' || s.game.outcome) return;
  saveRun(s.game.serialize());
}

/** A run that has ended, to tell someone else (app/share.ts). */
function shareOf(g: Game): ResultsData['share'] {
  const p = g.player;
  const o = g.outcome!;
  const vname = (v: string) => VICTORIES[v as keyof typeof VICTORIES]?.name ?? '';
  const time = runTime(g);
  const mine: Challenge = { seed: g.config.seed, size: g.config.size, difficulty: g.config.difficulty, ages: g.config.mode === 'ages', heir: p.heir, won: o.playerWon, time, victory: o.playerWon ? o.victory : '' };
  const link = challengeLink(mine);
  const run = {
    house: HEIR_BY_ID[p.heir]?.name ?? p.name, won: o.playerWon, by: o.playerWon ? vname(o.victory) : '', time: fmtTime(time),
    size: g.config.size, difficulty: DIFFICULTY_NAMES[g.config.difficulty], daily: g.config.daily ? todayKey() : null, ages: g.config.mode === 'ages',
    worlds: p.stats.maxWorlds, kills: p.stats.kills, lost: p.stats.shipsLost, boons: p.boons, link,
  };
  // Against the challenge it was, if it was one: the same sector, played by someone else.
  const c = g.config.challenge;
  let vs: string | null = null;
  if (c) {
    const them = `${HEIR_BY_ID[c.heir]?.name ?? 'The challenger'} ` +
        `${c.won ? `was crowned${vname(c.victory) ? ` by ${vname(c.victory)}` : ''} in ${fmtTime(c.time)}` : `fell after ${fmtTime(c.time)}`}`;
    const you = o.playerWon ? `You were crowned in ${fmtTime(time)}` : `You fell after ${fmtTime(time)}`;
    const verdict = o.playerWon && c.won ? `: ${versus(time, c.time, fmtTime)}.` : !o.playerWon && !c.won ? (`: you lasted ` +
        `${versus(time, c.time, fmtTime).replace('faster', 'less long').replace('slower', 'longer')}.`) : o.playerWon ? ', where they fell.' : ', where they were crowned.';
    vs = `The challenge: ${them}. ${you}${verdict}`;
  }
  return { text: shareText(run), line: shareLine(run), link, daily: !!g.config.daily, versus: vs };
}

/** A Destiny's name, as the results say it. */
const vname = (v: string) => VICTORIES[v as keyof typeof VICTORIES]?.name ?? v;

/** `abandoned`: the player gave the run up (no records are set by it: a run can be sat out). */
export function endRun(app: App, abandoned = false) {
  const s = app.session!;
  const g = s.game;
  g.outcomeHandled = true;
  const o = g.outcome!;
  const report = computeLegacy(g);
  // (A run that ended on the cradle is told in the cradle's words: lands, units.)
  if (g.cradle) for (const l of report.lines) l[0] = cradleVocabulary(LAST_CRADLE_ERA + 1)(l[0]);
  const unlocked = applyRunToProfile(app.profile, g, report.total);
  // The run against the player's records of its kind (the First Night sets none: it is a lesson).
  const figures = runFigures(g, report.total);
  const marks = g.config.tutorial || abandoned ? {} : applyRecords(app.profile.records, bracketOf(g.config), figures);
  if (g.config.daily) app.profile.lastDaily = todayKey();
  if (g.config.tutorial) app.profile.tutorialDone = true;
  saveProfile(app.profile);
  clearRun();
  const p = g.player;
  app.sfx.play(o.playerWon ? 'victory' : 'defeat', 0.9);
  // A crowning has its own music, which comes in when the fanfare is over; a fall is left in silence.
  app.music.play(null);
  if (o.playerWon) app.music.play('crown', FANFARE);
  app.fanfareEnds = (app.sfx.ctx?.currentTime ?? 0) + FANFARE;
  // What the ending counts up (ui/Ending.ts), in the cradle's words if the run ended there.
  const says = g.cradle ? cradleVocabulary(LAST_CRADLE_ERA + 1) : (x: string) => x;
  const line = (label: string, key: RecordKey, kind: TallyLine['kind']): TallyLine => ({ label: says(label).toUpperCase(), value: recordsOf(figures)[key] ?? 0, kind, record: !!marks[key]?.beaten, was: marks[key]?.was });
  s.endTally = o.playerWon
    ? [line('Time to the crown', 'crown', 'time'), line('Most worlds held', 'worlds', 'count'), line('Enemy ships destroyed', 'kills', 'count'), line('Boons', 'boons', 'count'), line('Legacy earned', 'legacy', 'legacy')]
    : [line('You lasted', 'stand', 'time'), line('Most worlds held', 'worlds', 'count'), line('Enemy ships destroyed', 'kills', 'count'), line('Legacy earned', 'legacy', 'legacy')];
  const winner = o.winner >= 0 ? g.factions[o.winner] : null;
  // What stands beside a figure of the results: the record it beat, or the record that still stands.
  const note = (key: RecordKey, show: (v: number) => string): { fresh: boolean; text: string } | undefined => {
    const m = marks[key];
    if (!m || m.was === undefined) return undefined;
    return m.beaten ? { fresh: true, text: `NEW RECORD · was ${show(m.was)}` } : { fresh: false, text: `best ${show(m.was)}` };
  };
  app.results = {
    report,
    unlocked,
    won: o.playerWon,
    title: o.playerWon ? 'VICTORY' : 'DEFEAT',
    reason: o.playerWon
      ? `You are crowned Hegemarch by ${vname(o.victory)}. ${o.reason}`
      : winner && o.victory !== 'defeat'
        ? `${winner.name} is crowned Hegemarch by ${vname(o.victory)}. ${o.reason}`
        : o.reason,
    stats: resultStats(g, o, note),
    share: shareOf(g),
    cards: [...p.cards],
    relics: [...p.relics],
    heir: p.heir,
    ambition: g.ambition,
    charts: runCharts(g),
    details: runDetails(g, o),
  };
  s.modal = null;
  s.paused = true;
  // (The results come when the player goes on from the ending's tally: it used to give way to them
  // by itself after four seconds, which is no time to be crowned in.)
}

/** The figures of a run as the results list them, each with the record it beat or the record that stands beside it. */
function resultStats(g: Game, o: Outcome, note: (key: RecordKey, show: (v: number) => string) => { fresh: boolean; text: string } | undefined): ResultsData['stats'] {
  const p = g.player;
  return (
    [
    // (An Ages run: the time on the cradle, plus the time among the stars since the player arrived there.)
    ['Run time', fmtTime(runTime(g)), note(o.playerWon ? 'crown' : 'stand', fmtTime)],
    ['Most worlds held', String(p.stats.maxWorlds), note('worlds', String)],
    ['Worlds kindled', String(p.stats.worldsKindled)],
    ['Worlds captured', String(p.stats.worldsCaptured)],
    ['Ships built', String(p.stats.shipsBuilt)],
    ['Enemy ships destroyed', String(p.stats.kills), note('kills', String)],
    ['Ships lost', String(p.stats.shipsLost)],
    ['Boons from Lore', String(p.boons), note('boons', String)],
    ['Anomalies resolved', String(p.stats.eventsResolved)],
    ['Embers earned', fmt(p.stats.embersEarned)],
    ['Omens', g.traits.map((t) => TRAIT_BY_ID[t]?.name ?? t).join(', ')],
    // (The seed rebuilds the same sector: with the setup beside it, a run can be played again.)
    ['Seed', `${g.config.seed} · ${g.config.size[0].toUpperCase() + g.config.size.slice(1)} · ${DIFFICULTY_NAMES[g.config.difficulty]}`],
    // An Ages run: how long the cradle took (or, if the run ended there, how far the climb came).
    ...(g.config.ages ? [['Time on the cradle', fmtTime(g.config.ages.cradleTime)], ['Lands held when the Ark left', String(g.config.ages.lands)]] : []),
    ...(g.cradle ? [['Age reached', ERAS[Math.min(p.era, LAST_CRADLE_ERA)].name]] : []),
    ] as ResultsData['stats']
  )
    .filter(([, v]) => v !== '')
    // (A run that ended on the cradle is told in the cradle's words: lands, units.)
    .map(([k, v, n]) => [g.cradle ? cradleVocabulary(LAST_CRADLE_ERA + 1)(k) : k, v, n] as ResultsData['stats'][number]);
}

/**
 * The run in one paragraph, for a bug report: the version, the seed and the setup, how it ended, its
 * Destinies, omens and Boons; and the same for a machine to read.
 */
function runDetails(g: Game, o: Outcome): string {
  const p = g.player;
  return [
    `Hegemarch v${GAME_VERSION}`,
    `${g.config.mode === 'ages' ? 'Ages run' : g.config.daily ? 'Daily run' : g.config.tutorial ? 'First Night' : 'Classic run'}, seed ` +
        `${g.config.seed}, ${g.config.size}, ${DIFFICULTY_NAMES[g.config.difficulty]}, ${HEIR_BY_ID[p.heir]?.name ?? p.heir}`,
    `${o.playerWon ? 'Victory' : 'Defeat'} by ${vname(o.victory)} at ${fmtTime(o.time)}: ${o.reason}`,
    `Destinies: ${g.victories.map(vname).join(', ')}. Omens: ${g.traits.map((t) => TRAIT_BY_ID[t]?.name ?? t).join(', ') || 'none'}.`,
    `Boons: ${groupBoons(p.cards).map(({ id, count }) => (CARD_BY_ID[id]?.name ?? id) + (count > 1 ? ` x${count}` : '')).join(', ') || 'none'}.`,
    `Worlds ${p.stats.maxWorlds} at most, ships built ${p.stats.shipsBuilt}, lost ${p.stats.shipsLost}, destroyed ${p.stats.kills}.`,
    // The same and more, for a machine to read: JSON, in base64 so that no chat mangles it.
    `Data: ${runData(g, GAME_VERSION)}`,
  ].join('\n');
}

/**
 * The saved run, for the title screen and the setup: its house, the kind of run ("Classic run"), and a
 * line like "Medium · Normal · 7 worlds · 12:34 played". `era`: the age an Ages run has reached on its
 * cradle (-1 for any other run). Null if there is no saved run, or it cannot be read.
 */
export function savedRunInfo(): { heir: string; name: string; color: string; kind: string; line: string; era: number } | null {
  const d = loadRun();
  if (!d) return null;
  try {
    const c = d.config;
    const heir = HEIR_BY_ID[c.heir];
    const ages = c.mode === 'ages';
    const cradle = ages && c.stage !== 'stars';
    const era = cradle ? Math.max(0, Math.min(LAST_CRADLE_ERA, d.factions[d.playerId]?.era ?? 0)) : -1;
    const kind = ages ? 'Ages run' : c.daily ? 'Daily run' : c.tutorial ? 'First Night' : 'Classic run';
    const held = d.nodes.filter((n) => n.kind === 'planet' && n.owner === d.playerId).length;
    // (An Ages run: the time on the cradle, plus the time among the stars since the player arrived there.)
    const played = c.ages ? c.ages.cradleTime + Math.max(0, d.time - c.ages.arrival) : d.time;
    const where = cradle ? [ERAS[era].name] : ages ? ['Among the stars'] : [];
    const line = [...where, c.size[0].toUpperCase() + c.size.slice(1), DIFFICULTY_NAMES[c.difficulty], `${held} ${cradle ? 'land' : 'world'}${held === 1 ? '' : 's'}`, `${fmtTime(played)} played`].join(' · ');
    return { heir: c.heir, name: heir?.name ?? 'Your house', color: heir?.color ?? '#ffd23f', kind, line, era };
  } catch {
    return null;
  }
}

/** "Solar Concord · Classic run · Medium · Normal · 7 worlds · 12:34 played" for the saved run ('' if there is none). */
export function describeSavedRun(): string {
  if (!hasRun()) return '';
  const run = savedRunInfo();
  return run ? `${run.name} · ${run.kind} · ${run.line}` : 'a saved run';
}

function renderLoading(app: App, p: number, line?: string) {
  if (app.screen !== 'loading') return;
  const existing = app.ui.querySelector('#load-bar') as HTMLElement | null;
  if (existing) {
    existing.style.width = Math.round(p * 100) + '%';
    return;
  }
  const lines = ['Charting the starlanes…', 'Waking the old stars…', 'Counting the heirs who came before…', 'Listening for the Hollow…', 'Dusting off the Hegemarch’s empty throne…'];
  app.ui.innerHTML = `<div class="screen loading${app.crt()}"><div class="logo" style="font-size:28px">HEGEMARCH</div>
      <div class="tagline">${line ?? lines[Math.floor(Math.random() * lines.length)]}</div>
      <div class="bar"><i id="load-bar" style="width:${Math.round(p * 100)}%"></i></div></div>`;
}
