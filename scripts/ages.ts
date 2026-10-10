/**
 * Headless harness for the cradle stage of Ages runs: every house is played by the AI, and the script
 * prints when each one reached each age, when its Ark left, and how the wars went.
 *   npm run simulate:ages -- [seeds=5] [size=medium] [difficulty=1] [minutes=60] [-v]
 */
import { Game } from '../src/game/Game';
import { ERAS, SPACE } from '../src/game/data/eras';
import { isWarship } from '../src/game/data/units';
import type { Difficulty, MapSize } from '../src/game/types';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const nSeeds = Number(args[0] ?? 5);
const size = (args[1] ?? 'medium') as MapSize;
const difficulty = Number(args[2] ?? 1) as Difficulty;
const minutes = Number(args[3] ?? 60);
const verbose = process.argv.includes('-v');
const min = (s: number) => (s / 60).toFixed(1);

const launches: number[] = [];
for (let s = 1; s <= nSeeds; s++) {
  const seed = 1000 + s * 7;
  const g = Game.create({ seed, size, difficulty, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true, mode: 'ages', stage: 'cradle' });
  g.fxEnabled = false;
  const t0 = performance.now();
  const houses = g.empires();
  const reached: number[][] = houses.map(() => [0]);
  let firstWar = -1;
  let firstFall = -1;
  for (let i = 0; i < minutes * 60 * 20 && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
    if (g.tick % 20 !== 0) continue;
    houses.forEach((f, k) => {
      const era = f.launchedAt >= 0 ? SPACE : f.era;
      while (reached[k].length <= era) reached[k].push(g.time);
    });
    if (firstWar < 0) {
      for (const n of g.nodes) {
        if (n.owner >= 0 && n.lastHit < 1 && n.lastHitBy >= 0 && g.factions[n.lastHitBy].kind === 'empire' && g.factions[n.owner].kind === 'empire') firstWar = g.time;
      }
    }
    if (firstFall < 0 && houses.some((f) => f.eliminatedAt >= 0)) firstFall = g.time;
    if (verbose && g.tick % (20 * 60 * 5) === 0) {
      console.log(`  [seed ${seed}] t=${min(g.time)}m units=${g.unitList.length}`);
      for (const f of houses) {
        const army = g.unitsOf(f.id).filter((u) => isWarship(u.type));
        console.log(
          `    ${f.name.padEnd(18)} ${f.alive ? ERAS[f.era].short.padEnd(7) : f.launchedAt >= 0 ? 'GONE   ' : 'DEAD   '} lands=${g.worldsOf(f.id).length} army=${army.length} ` +
            `hangar=${f.hangarUsed}/${f.hangarCap} embers=${Math.round(f.embers)} inc=${f.income.toFixed(1)} lore=${Math.round(f.lore)}/${ERAS[f.era].lore} (+${f.loreRate.toFixed(2)}) mode=${f.ai?.mode}`,
        );
      }
    }
  }
  const ms = performance.now() - t0;
  const o = g.outcome;
  console.log(
    `seed ${seed}: ${o ? `${o.victory}${o.winner >= 0 ? ` by ${g.factions[o.winner].name}` : ''} at ${min(o.time)}m (${o.reason})` : `still going after ${minutes}m`} ` +
      `| first war ${firstWar < 0 ? 'never' : min(firstWar) + 'm'} | first Hearth lost ${firstFall < 0 ? 'never' : min(firstFall) + 'm'} | ${g.nodes.length} lands | sim ${(ms / 1000).toFixed(1)}s`,
  );
  houses.forEach((f, k) => {
    const ages = reached[k].slice(1).map((t, i) => `${ERAS[i + 1].short.toLowerCase()} ${min(t)}`).join('  ');
    const fate = f.launchedAt >= 0 ? `Ark left ${min(f.launchedAt)}m` : f.eliminatedAt >= 0 ? `fell ${min(f.eliminatedAt)}m` : `in the ${ERAS[f.era].name}`;
    if (f.launchedAt >= 0) launches.push(f.launchedAt);
    console.log(`    ${f.name.padEnd(18)} ${fate.padEnd(18)} max lands=${f.stats.maxWorlds} kills=${f.stats.kills} built=${f.stats.shipsBuilt} cards=${f.cards.length} pers=${f.ai?.personality} | ${ages}`);
  });
}
if (launches.length) {
  launches.sort((a, b) => a - b);
  console.log(`\n${launches.length} Arks left: first ${min(launches[0])}m, median ${min(launches[launches.length >> 1])}m, last ${min(launches[launches.length - 1])}m`);
} else console.log('\nNo Ark left the cradle.');
