/**
 * Headless balance harness: runs full AI-vs-AI games and prints how they unfold.
 *   npm run simulate -- [seeds=5] [size=medium] [difficulty=1] [minutes=60] [-v]
 */
import { Game } from '../src/game/Game';
import { isWarship } from '../src/game/data/units';
import type { Difficulty, MapSize } from '../src/game/types';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const nSeeds = Number(args[0] ?? 5);
const size = (args[1] ?? 'medium') as MapSize;
const difficulty = Number(args[2] ?? 1) as Difficulty;
const minutes = Number(args[3] ?? 60);
const verbose = process.argv.includes('-v');

const results: string[] = [];
for (let s = 1; s <= nSeeds; s++) {
  const seed = 1000 + s * 7;
  const g = Game.create({ seed, size, difficulty, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
  g.fxEnabled = false;
  const t0 = performance.now();
  const maxTicks = minutes * 60 * 20;
  let maxStep = 0;
  let firstWar = -1;
  for (let i = 0; i < maxTicks && !g.outcome; i++) {
    const a = performance.now();
    g.step();
    const d = performance.now() - a;
    if (d > maxStep) maxStep = d;
    g.fx.length = 0;
    if (firstWar < 0 && g.tick % 20 === 0) {
      // First time an empire's world is hit by another empire.
      for (const n of g.nodes) {
        if (n.owner >= 0 && n.lastHit < 1 && n.lastHitBy >= 0 && g.factions[n.lastHitBy].kind === 'empire' && g.factions[n.owner].kind === 'empire') {
          firstWar = g.time;
          break;
        }
      }
    }
    if (verbose && g.tick % (20 * 60 * 5) === 0) {
      console.log(`  [seed ${seed}] t=${(g.time / 60).toFixed(0)}m units=${g.unitList.length} proj=${g.projectiles.length} raids=${g.pirates.raidCount}`);
      for (const f of g.empires()) {
        const army = g.unitsOf(f.id).filter((u) => isWarship(u.type));
        console.log(
          `    ${f.name.padEnd(18)} ${f.alive ? 'alive' : 'DEAD '} worlds=${g.worldsOf(f.id).length} army=${army.length} hangar=${f.hangarUsed}/${f.hangarCap} ` +
            `boons=${f.boons} embers=${Math.round(f.embers)} inc=${f.income.toFixed(1)} lore=${f.loreRate.toFixed(2)} ` +
            `kills=${f.stats.kills} lost=${f.stats.shipsLost} mode=${f.ai?.mode}`,
        );
      }
    }
  }
  const ms = performance.now() - t0;
  const o = g.outcome;
  const winner = o && o.winner >= 0 ? g.factions[o.winner].name : 'none';
  const line =
    `seed ${seed}: ${o ? `${o.victory} by ${winner} at ${(o.time / 60).toFixed(1)}m` : `no result after ${minutes}m`} ` +
    `| first war ${firstWar < 0 ? 'never' : (firstWar / 60).toFixed(1) + 'm'} | victories=${g.victories.join(',')} ` +
    `| sim ${(ms / 1000).toFixed(1)}s, avg ${(ms / g.tick).toFixed(2)}ms/tick, max ${maxStep.toFixed(1)}ms`;
  console.log(line);
  for (const f of g.empires()) {
    console.log(
      `    ${f.name.padEnd(18)} ${f.alive ? 'alive' : `died@${(f.eliminatedAt / 60).toFixed(1)}m`} worlds=${g.worldsOf(f.id).length} max=${f.stats.maxWorlds} ` +
        `boons=${f.boons} cards=${f.cards.length} relics=${f.relics.length} kills=${f.stats.kills} built=${f.stats.shipsBuilt} pers=${f.ai?.personality}`,
    );
  }
  results.push(line);
}
console.log('\n' + results.join('\n'));
