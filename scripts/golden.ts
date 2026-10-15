/**
 * Golden traces: the proof that a change to the code changed nothing in the game.
 *
 * A fixed set of runs is played (rival houses alone, random commands, both together, Ages runs from
 * the cradle to the stars, a run loaded from its own save half way), and every 30 seconds of game time
 * the whole saved state is fingerprinted, together with the effects the game asked to be drawn.
 * `record` writes the fingerprints down; `check` plays the same runs again and compares. A refactoring
 * is done when `check` passes: same random numbers drawn in the same order, same state, to the byte.
 *
 *   npx tsx scripts/golden.ts record            before the change
 *   npx tsx scripts/golden.ts check             after it
 *   npx tsx scripts/golden.ts check --only=ai-medium     one run
 *   npx tsx scripts/golden.ts dump --only=ai-medium --at=12   the state at the 12th fingerprint, as JSON
 *
 * The fingerprints live in .golden/ (not in git): they are true of one version of the rules, and any
 * change that is meant to be felt in play makes new ones.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Game } from '../src/game/Game';
import { ascend } from '../src/game/ages';
import { HEIRS } from '../src/game/data/heirs';
import { RNG } from '../src/game/rng';
import type { Difficulty, GameConfig, MapSize } from '../src/game/types';
import { randomCommand } from './lib/commands';

const TPS = 20;
/** Game seconds between two fingerprints. */
const EVERY = 30;
const mode = process.argv[2];
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const FILE = arg('file') ?? '.golden/trace.json';
const only = arg('only');

interface Run {
  name: string;
  config: GameConfig;
  minutes: number;
  /** Ticks between two random commands (0: none). */
  commands: number;
  /** Minute at which the run goes on from its own save (0: never). */
  reload: number;
  fx: boolean;
}

const base = { perks: {}, unlockLegendary: true, unlockPacts: true };
const SIZES: MapSize[] = ['small', 'medium', 'large'];
const runs: Run[] = [];
// Rival houses alone, as the balance simulations play them.
const ai = (name: string, seed: number, size: MapSize, difficulty: Difficulty, minutes: number, reload = 0) =>
  runs.push({ name, config: { ...base, seed, size, difficulty, heir: 'concord', autoplay: true }, minutes, commands: 0, reload, fx: false });
ai('ai-small', 1007, 'small', 1, 30);
ai('ai-medium', 1014, 'medium', 1, 30, 14);
ai('ai-large', 1021, 'large', 1, 25);
ai('ai-small-easy', 1028, 'small', 0, 30);
ai('ai-medium-brutal', 1035, 'medium', 3, 25, 11);
// Runs that are decided: a conquest, a treasury, an ascension, a domination (houses fall, a winner is declared).
ai('ai-conquest', 1021, 'small', 1, 45);
ai('ai-treasury', 1049, 'small', 1, 45, 20);
ai('ai-ascension', 1063, 'small', 1, 50);
ai('ai-domination', 1203, 'small', 1, 30);
// A player who sends random commands, sensible and not, as the fuzzer does.
for (let i = 0; i < 6; i++) {
  const seed = 5000 + i * 13;
  runs.push({
    name: `fuzz-${seed}`,
    config: {
      ...base, seed, size: SIZES[seed % 3], difficulty: (seed % 4) as Difficulty, heir: HEIRS[seed % HEIRS.length].id, daily: seed % 5 === 0,
      perks: { oldCoin: seed % 2, escort: 1, archivist: 1, luck: seed % 3, bastion: 1, secondBreath: seed % 2 },
    },
    minutes: 20, commands: 8, reload: i % 2 ? 9 : 0, fx: i % 2 === 0,
  });
}
// The rival houses play every house and random commands are thrown in: late wars, every Destiny.
for (let i = 0; i < 3; i++) {
  const seed = 6100 + i * 17;
  runs.push({ name: `late-${seed}`, config: { ...base, seed, size: SIZES[i], difficulty: ((i + 1) % 4) as Difficulty, heir: HEIRS[(i * 2) % HEIRS.length].id, autoplay: true }, minutes: 40, commands: 60, reload: i === 1 ? 22 : 0, fx: i === 2 });
}
// Ages runs: the cradle, the crossing, and on among the stars.
for (let i = 0; i < 3; i++) {
  const seed = 7200 + i * 19;
  runs.push({ name: `ages-fuzz-${seed}`, config: { ...base, seed, size: SIZES[seed % 3], difficulty: (seed % 4) as Difficulty, heir: HEIRS[seed % HEIRS.length].id, mode: 'ages', stage: 'cradle' }, minutes: 25, commands: 8, reload: i === 1 ? 12 : 0, fx: i === 0 });
}
for (let i = 0; i < 2; i++) {
  const seed = 7700 + i * 23;
  runs.push({ name: `ages-ai-${seed}`, config: { ...base, seed, size: SIZES[i + 1], difficulty: 1, heir: 'concord', mode: 'ages', stage: 'cradle', autoplay: true }, minutes: 75, commands: 0, reload: i === 0 ? 30 : 0, fx: false });
}
// The First Night.
runs.push({ name: 'first-night', config: { ...base, seed: 4242, size: 'small', difficulty: 0, heir: 'concord', tutorial: true }, minutes: 12, commands: 8, reload: 0, fx: true });
// A new player, who discovers Boons as they meet what they are for (data/boonKeys.ts): their First Night, and a run of their own.
runs.push({ name: 'first-night-new', config: { ...base, seed: 4243, size: 'small', difficulty: 0, heir: 'concord', tutorial: true, boonKeys: [] }, minutes: 12, commands: 8, reload: 6, fx: true });
runs.push({ name: 'discover-5091', config: { ...base, seed: 5091, size: 'medium', difficulty: 1, heir: 'concord', boonKeys: [] }, minutes: 20, commands: 8, reload: 9, fx: false });

/** A stand-in for Math.random (which only what is drawn may use), so that the effects are the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const state = (g: Game) => JSON.stringify(g.serialize());
const print = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** Play one run; `at(i, g)` is called at every fingerprint. Returns the fingerprints. */
function play(run: Run, at?: (i: number, g: Game) => void): string[] {
  const realRandom = Math.random;
  Math.random = seeded(run.config.seed);
  try {
    const r = new RNG(run.config.seed * 7919 + 1);
    let g = Game.create(run.config);
    g.fxEnabled = run.fx;
    const out: string[] = [];
    const log: string[] = [];
    const fx = createHash('sha1');
    let fxCount = 0;
    const mark = () => {
      at?.(out.length, g);
      out.push(`${print(state(g))}:${fxCount}`);
    };
    const drain = () => {
      if (!g.fx.length) return;
      fxCount += g.fx.length;
      fx.update(JSON.stringify(g.fx));
      g.fx.length = 0;
    };
    mark();
    const ticks = run.minutes * 60 * TPS;
    for (let tick = 1; tick <= ticks; tick++) {
      if (run.commands && tick % run.commands === 0) randomCommand(g, r, log);
      g.step();
      drain();
      // Ages: the player's Ark has left the cradle. Go on among the stars, to the player's arrival.
      if (g.ascended) {
        const stars = ascend(g);
        if (!stars) break;
        stars.fxEnabled = run.fx;
        g = stars;
        while (g.time < (g.config.ages?.arrival ?? 0) && !g.outcome) {
          g.step();
          drain();
        }
        mark();
      }
      if (run.reload && tick === run.reload * 60 * TPS) {
        const fxOn = g.fxEnabled;
        g = Game.load(JSON.parse(state(g)));
        g.fxEnabled = fxOn;
      }
      if (tick % (EVERY * TPS) === 0) mark();
      if (g.outcome && g.time > g.outcome.time + 60) break;
    }
    mark();
    out.push(`fx:${fx.digest('hex').slice(0, 16)}`, `end:${g.outcome ? `${g.outcome.victory}@${g.outcome.time.toFixed(2)}` : `none@${g.time.toFixed(2)}`}`);
    return out;
  } finally {
    Math.random = realRandom;
  }
}

if (mode !== 'record' && mode !== 'check' && mode !== 'dump') {
  console.log('usage: npx tsx scripts/golden.ts record|check|dump [--only=name] [--at=index] [--file=path]');
  process.exit(2);
}
const chosen = runs.filter((x) => !only || x.name === only || x.name.startsWith(only));
if (!chosen.length) {
  console.log(`no run named ${only}; there are: ${runs.map((x) => x.name).join(', ')}`);
  process.exit(2);
}
fs.mkdirSync('.golden', { recursive: true });
const t0 = Date.now();

if (mode === 'dump') {
  const index = Number(arg('at') ?? 0);
  for (const run of chosen) {
    play(run, (i, g) => {
      if (i !== index) return;
      const path = `.golden/${run.name}@${index}.json`;
      fs.writeFileSync(path, JSON.stringify(g.serialize(), null, 1));
      console.log(`wrote ${path} (game time ${(g.time / 60).toFixed(1)}m)`);
    });
  }
  process.exit(0);
}

const recorded: Record<string, string[]> = mode === 'check' || only ? (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}) : {};
if (mode === 'check' && !Object.keys(recorded).length) {
  console.log(`nothing recorded in ${FILE}: run "npx tsx scripts/golden.ts record" on the code before the change`);
  process.exit(2);
}
let differ = 0;
let points = 0;
for (const run of chosen) {
  const t = Date.now();
  const got = play(run);
  points += got.length;
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (mode === 'record') {
    recorded[run.name] = got;
    console.log(`recorded ${run.name.padEnd(18)} ${String(got.length).padStart(4)} fingerprints, ${got[got.length - 1]}  (${secs}s)`);
    continue;
  }
  const want = recorded[run.name];
  if (!want) {
    console.log(`?    ${run.name}: not recorded`);
    differ++;
    continue;
  }
  let i = 0;
  while (i < want.length && i < got.length && want[i] === got[i]) i++;
  if (i === want.length && i === got.length) {
    console.log(`same ${run.name.padEnd(18)} ${String(got.length).padStart(4)} fingerprints  (${secs}s)`);
  } else {
    differ++;
    const what = (want[i] ?? got[i] ?? '').startsWith('fx:') ? 'the effects asked for differ (the states are the same)' : (want[i] ?? got[i] ?? '').startsWith('end:') ? `the end differs: ${want[i]} then, ${got[i]} now` : `the state differs from fingerprint ${i} on (about minute ${((i * EVERY) / 60).toFixed(1)}): --only=${run.name} --at=${i} dumps it`;
    console.log(`DIFF ${run.name}: ${what}`);
  }
}
if (mode === 'record') {
  fs.writeFileSync(FILE, JSON.stringify(recorded, null, 1));
  console.log(`\n${chosen.length} runs, ${points} fingerprints recorded in ${FILE} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(0);
}
console.log(`\n${chosen.length} runs, ${points} fingerprints in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${differ ? `${differ} DIFFER` : 'all the same'}`);
process.exit(differ ? 1 : 0);
