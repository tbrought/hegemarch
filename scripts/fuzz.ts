/**
 * Fuzzing the simulation: random players send random commands (valid and nonsense alike) across
 * many seeds, sizes, houses and difficulties, while invariants are checked as the game runs and
 * save/load is checked to change nothing.
 *   npx tsx scripts/fuzz.ts [seeds=12] [minutes=45] [--seed=N] [--ai] [--ages] [-v]
 */
import { Game } from '../src/game/Game';
import { ascend } from '../src/game/ages';
import { CARDS } from '../src/game/data/cards';
import { EVENT_BY_ID } from '../src/game/data/events';
import { HEIRS } from '../src/game/data/heirs';
import { UNITS } from '../src/game/data/units';
import { RNG } from '../src/game/rng';
import { STARFALL_BURN, STARFALL_FUSE } from '../src/game/starfall';
import { randomCommand } from './lib/commands';
import type { Difficulty, MapSize } from '../src/game/types';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const SEEDS = Number(args[0] ?? 12);
const MINUTES = Number(args[1] ?? 45);
const only = process.argv.find((a) => a.startsWith('--seed='));
const verbose = process.argv.includes('-v');
/** --ai: the AI plays every house (to reach late wars and victories); random commands are sprinkled in. */
const aiMode = process.argv.includes('--ai');
/** --ages: Ages runs. They start on the cradle; when the player's Ark leaves, the fuzzing goes on among the stars. */
const agesMode = process.argv.includes('--ages');
const TPS = 20;

const SIZES: MapSize[] = ['small', 'medium', 'large'];

let failures = 0;
const fail = (seed: number, tick: number, what: string) => {
  failures++;
  console.log(`  FAIL seed ${seed} @${(tick / TPS / 60).toFixed(1)}m: ${what}`);
};

/** Invariants that must hold at any moment of any game. */
function check(g: Game): string[] {
  const e: string[] = [];
  const fin = (v: number, what: string) => {
    if (!Number.isFinite(v)) e.push(`${what} is ${v}`);
  };
  for (const f of g.factions) {
    fin(f.embers, `${f.name} embers`);
    fin(f.lore, `${f.name} lore`);
    fin(f.income, `${f.name} income`);
    if (f.embers < -0.01) e.push(`${f.name} embers negative (${f.embers})`);
    if (f.lore < -0.01) e.push(`${f.name} lore negative (${f.lore})`);
    if (f.pendingDrafts < 0) e.push(`${f.name} pendingDrafts ${f.pendingDrafts}`);
    if (f.rerolls < 0) e.push(`${f.name} rerolls ${f.rerolls}`);
    if (f.kind === 'empire' && f.alive) {
      if (f.capital < 0 || g.nodes[f.capital]?.owner !== f.id) e.push(`${f.name} is alive without its Hearth (capital ${f.capital})`);
    }
    for (const id of f.cards) if (!CARDS.some((c) => c.id === id)) e.push(`${f.name} holds unknown card ${id}`);
  }
  for (const n of g.nodes) {
    fin(n.hp, `${n.name} hp`);
    fin(n.maxHp, `${n.name} maxHp`);
    fin(n.sh, `${n.name} sh`);
    if (n.hp < -0.01) e.push(`${n.name} hp negative`);
    if (n.hp > n.maxHp * 1.001 + 1) e.push(`${n.name} hp ${n.hp} > max ${n.maxHp}`);
    if (n.sh > n.maxSh * 1.001 + 1) e.push(`${n.name} shields ${n.sh} > max ${n.maxSh}`);
    if (n.owner < -1 || n.owner >= g.factions.length) e.push(`${n.name} has owner ${n.owner}`);
    if (n.kind === 'planet' && (n.level < 1 || n.level > 3)) e.push(`${n.name} level ${n.level}`);
    if (n.glow < -0.001 || n.glow > 1.001) e.push(`${n.name} glow ${n.glow}`);
    if (n.capitalOf >= 0 && n.owner !== n.capitalOf && g.factions[n.capitalOf]?.alive) e.push(`${n.name} is a Hearth of a living house it does not belong to`);
    if (n.rally >= g.nodes.length) e.push(`${n.name} rally ${n.rally}`);
  }
  const alive = new Set<number>();
  for (const u of g.unitList) {
    if (u.dead) continue;
    alive.add(u.id);
    const tag = `${UNITS[u.type]?.name ?? u.type}#${u.id}`;
    fin(u.x, `${tag} x`);
    fin(u.y, `${tag} y`);
    fin(u.hp, `${tag} hp`);
    fin(u.ax, `${tag} anchor x`);
    fin(u.ay, `${tag} anchor y`);
    if (u.hp > u.maxHp * 1.001 + 1) e.push(`${tag} hp ${u.hp} > max ${u.maxHp}`);
    if (u.owner < 0 || u.owner >= g.factions.length) e.push(`${tag} owner ${u.owner}`);
    if (u.node >= g.nodes.length) e.push(`${tag} at node ${u.node}`);
    if (u.node >= 0 && !g.buckets[u.node].includes(u)) e.push(`${tag} missing from its world's list`);
    if (u.node < 0 && !u.lane) e.push(`${tag} is nowhere (no world, no lane)`);
    if (u.node >= 0) {
      const n = g.nodes[u.node];
      const d = Math.hypot(u.x - n.x, u.y - n.y);
      if (d > Math.max(4000, n.r * 30)) e.push(`${tag} drifted ${Math.round(d)} away from ${n.name}`);
    }
    // An armed Starfall is at a star, stays there, and its fuse is within what it was set to.
    if (u.fuse !== undefined) {
      if (u.type !== 'starfall') e.push(`${tag} has a fuse`);
      if (u.lane || u.node < 0 || g.nodes[u.node].kind !== 'star') e.push(`${tag} is armed and not at a star`);
      if (u.path.length) e.push(`${tag} is armed and on its way somewhere`);
      if (!(u.fuse >= 0 && u.fuse <= STARFALL_FUSE)) e.push(`${tag} fuse ${u.fuse}`);
    }
  }
  // A star that burns is a star, burns no longer than it may, and nothing is armed in its fire. A house has one Starfall.
  for (const n of g.nodes) {
    if (n.hazard?.by === undefined) continue;
    if (n.kind !== 'star') e.push(`${n.name} burns and is no star`);
    if (!(n.hazard.t > 0 && n.hazard.t <= STARFALL_BURN)) e.push(`${n.name} burns for ${n.hazard.t}`);
  }
  for (const f of g.factions) {
    const mine = g.unitList.filter((u) => !u.dead && u.owner === f.id && u.type === 'starfall').length;
    if (mine > 1) e.push(`${f.name} has ${mine} Starfalls`);
  }
  // (World lists are rebuilt at the start of every tick, so a unit that left or died during the
  // last tick may still be listed until the next one; only missing units are an error.)
  for (const p of g.prompts) if (p.node >= g.nodes.length || !EVENT_BY_ID[p.event]) e.push(`bad prompt ${JSON.stringify(p)}`);
  return e;
}

const state = (g: Game) => JSON.stringify(g.serialize());

const t0 = Date.now();
const seeds = only ? [Number(only.split('=')[1])] : Array.from({ length: SEEDS }, (_, i) => 5000 + i * 13);
for (const seed of seeds) {
  const r = new RNG(seed * 7919 + 1);
  const size = SIZES[seed % 3];
  const difficulty = (seed % 4) as Difficulty;
  const heir = HEIRS[seed % HEIRS.length].id;
  let g = Game.create({
    seed, size, difficulty, heir, daily: seed % 5 === 0 && !agesMode, ...(agesMode ? { mode: 'ages' as const, stage: 'cradle' as const } : {}),
    perks: { oldCoin: seed % 2, escort: 1, archivist: 1, luck: seed % 3, bastion: 1, secondBreath: seed % 2 },
    unlockLegendary: true, unlockPacts: true, autoplay: aiMode,
  });
  g.fxEnabled = seed % 2 === 0;
  const log: string[] = [];
  const ticks = MINUTES * 60 * TPS;
  let before = failures;
  let tick = 0;
  /** Ages: when the player's Ark left the cradle (-1: it has not). */
  let crossed = -1;
  try {
    for (; tick < ticks; tick++) {
      if (tick % (aiMode ? 60 : 8) === 0) randomCommand(g, r, log);
      g.step();
      // Ages: the player's Ark has left the cradle. Go on among the stars (played forward to the player's arrival).
      if (g.ascended) {
        const fx = g.fxEnabled;
        const stars = ascend(g);
        if (!stars) break;
        crossed = g.time;
        g = stars;
        g.fxEnabled = fx;
        while (g.time < (g.config.ages?.arrival ?? 0) && !g.outcome) {
          g.step();
          if (g.fxEnabled) g.fx.length = 0;
        }
        const errs = check(g);
        if (errs.length) {
          fail(seed, tick, 'on arrival among the stars: ' + errs.slice(0, 4).join(' | '));
          break;
        }
      }
      if (g.fxEnabled) g.fx.length = 0;
      if (tick % 100 === 0) {
        const errs = check(g);
        if (errs.length) {
          fail(seed, tick, errs.slice(0, 4).join(' | ') + (errs.length > 4 ? ` (+${errs.length - 4} more)` : ''));
          if (verbose) console.log('    last commands:', log.join('; '));
          break;
        }
      }
      // Save, load, and run both copies on: they must stay identical.
      if (tick % (8 * 60 * TPS) === 4 * 60 * TPS) {
        const copy = Game.load(JSON.parse(state(g)));
        copy.fxEnabled = g.fxEnabled;
        for (let i = 0; i < 40 * TPS; i++) {
          g.step();
          copy.step();
          tick++;
          if (g.fxEnabled) {
            g.fx.length = 0;
            copy.fx.length = 0;
          }
        }
        const a = state(g);
        const b = state(copy);
        if (a !== b) {
          let i = 0;
          while (i < a.length && a[i] === b[i]) i++;
          fail(seed, tick, `save/load changes the game; first difference: …${a.slice(Math.max(0, i - 80), i + 60)}…  vs  …${b.slice(Math.max(0, i - 80), i + 60)}…`);
          break;
        }
      }
      if (g.outcome && tick % 20 === 0 && g.time > g.outcome.time + 60) break;
    }
  } catch (err) {
    fail(seed, tick, `exception: ${(err as Error).stack?.split('\n').slice(0, 5).join(' / ')}`);
    console.log('    last commands:', log.join('; '));
  }
  const o = g.outcome;
  console.log(
    `seed ${seed} ${size} d${difficulty} ${heir}: ${failures === before ? 'ok' : 'FAILED'} · ${agesMode ? (crossed >= 0 ? `cradle ${(crossed / 60).toFixed(1)}m, then stars ` : `cradle, age ${g.player.era} `) : ''}${(g.time / 60).toFixed(1)}m · ${o ? `${o.victory} by ${o.winner >= 0 ? g.factions[o.winner].name : '—'}` : 'no result'} · units ${g.unitList.filter((u) => !u.dead).length}`,
  );
  before = failures;
}
console.log(`\n${seeds.length} games in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${failures ? failures + ' FAILURES' : 'all clean'}`);
process.exit(failures ? 1 : 0);
