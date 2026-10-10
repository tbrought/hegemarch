/**
 * Balance probe: a scripted player goes all-in on an early rush at the nearest rival Hearth.
 * Reports whether the rush lands, and how the run goes afterwards (the rusher then plays a simple macro game).
 *   npx tsx scripts/rush.ts [seeds=6] [size=small] [difficulty=1] [launchMinute=4.5]
 */
import { Game } from '../src/game/Game';
import { makeAIState } from '../src/game/ai/ai';
import { CARD_BY_ID } from '../src/game/data/cards';
import { isWarship } from '../src/game/data/units';
import type { Difficulty, MapSize, UnitType } from '../src/game/types';

const args = process.argv.slice(2);
const nSeeds = Number(args[0] ?? 6);
const size = (args[1] ?? 'small') as MapSize;
const difficulty = Number(args[2] ?? 1) as Difficulty;
const launch = Number(args[3] ?? 4.5) * 60;
const verbose = process.argv.includes('-v');
const only = process.argv.find((a) => a.startsWith('--seed='));

const rows: string[] = [];
let landed = 0;
for (let s = 1; s <= nSeeds; s++) {
  const seed = 3000 + s * 11;
  if (only && Number(only.slice(7)) !== seed) continue;
  const g = Game.create({ seed, size, difficulty, heir: 'vael', perks: {}, unlockLegendary: false, unlockPacts: false });
  g.fxEnabled = false;
  const p = g.player;
  const rivals = g.empires().filter((f) => f.id !== p.id);
  const target = rivals.sort((a, b) => g.pathLen(p.capital, a.capital) - g.pathLen(p.capital, b.capital))[0];
  const targetNode = target.capital;
  const pattern: UnitType[] = ['breaker', 'breaker', 'striker', 'guardian'];
  let qi = 0;
  let phase: 'build' | 'rush' | 'macro' = 'build';
  let result = '';
  let rushShips = new Set<number>();
  for (let t = 0; t < 35 * 60 * 20 && !g.outcome; t++) {
    g.step();
    g.fx.length = 0;
    if (t % 20 !== 0) continue;
    while (p.pendingDrafts > 0) {
      const offer = g.ensureOffer(p)!;
      g.cmdChooseCard(p.id, offer.find((id) => CARD_BY_ID[id].cat === 'war') ?? offer[0]);
    }
    for (const pr of g.prompts) if (pr.result === undefined) g.cmdResolvePrompt(pr.id, 0);
    g.prompts.length = 0;
    const hearth = g.nodes[p.capital];
    if (phase !== 'macro') {
      while (hearth.shipQ.length < 3 && g.cmdQueueShip(p.id, p.capital, pattern[qi % pattern.length])) qi++;
      if (phase === 'build' && g.time >= launch) {
        phase = 'rush';
        const army = g.unitsOf(p.id).filter((u) => isWarship(u.type));
        rushShips = new Set(army.map((u) => u.id));
        g.cmdMove(p.id, army.map((u) => u.id), targetNode);
        hearth.rally = targetNode;
      }
      if (phase === 'rush') {
        for (const u of g.unitsOf(p.id)) if (isWarship(u.type) && !rushShips.has(u.id) && u.node === p.capital) {
          rushShips.add(u.id);
          g.cmdMove(p.id, [u.id], targetNode);
        }
        const alive = [...rushShips].filter((id) => g.units.get(id) && !g.units.get(id)!.dead);
        if (verbose && t % 600 === 0) {
          const where = new Map<string, number>();
          for (const id of alive) {
            const u = g.units.get(id)!;
            const k = u.node >= 0 ? g.nodes[u.node].name : 'lane';
            where.set(k, (where.get(k) ?? 0) + 1);
          }
          const n = g.nodes[targetNode];
          const def = g.unitsOf(target.id).filter((u) => isWarship(u.type)).length;
          console.log(`    ${(g.time / 60).toFixed(1)}m rush ${alive.length} ships ${JSON.stringify(Object.fromEntries(where))} | target Hearth ${Math.round((100 * n.hp) / n.maxHp)}% sh ${Math.round(n.sh)} | defenders ${def} at home ${g.buckets[targetNode].filter((u) => u.owner === target.id).length} | embers ${Math.round(p.embers)}`);
        }
        if (!target.alive) {
          result = `LANDED at ${(g.time / 60).toFixed(1)}m`;
          landed++;
          phase = 'macro';
          hearth.rally = -1;
        } else if (alive.length === 0 || g.time > launch + 420) {
          const n = g.nodes[targetNode];
          result = `FAILED at ${(g.time / 60).toFixed(1)}m (Hearth left at ${Math.round((100 * n.hp) / n.maxHp)}%)`;
          phase = 'macro';
          hearth.rally = -1;
          g.cmdRetreat(p.id, alive);
        }
      }
    } else if (!p.ai) {
      // After the rush, the regular AI plays the rest of this house's game.
      p.ai = makeAIState(g, p, ['opportunist']);
      p.ai.firstAttackAt = 0;
    }
  }
  const o = g.outcome;
  const end = o ? (o.playerWon ? `won (${o.victory}) at ${(o.time / 60).toFixed(1)}m` : `${o.victory === 'defeat' ? 'lost' : 'lost to ' + o.victory} at ${(o.time / 60).toFixed(1)}m`) : `alive at 35m with ${g.worldsOf(p.id).length} worlds`;
  rows.push(`seed ${seed}: rush ${result || 'never resolved'} -> ${end}`);
}
console.log(`Rush at ${(launch / 60).toFixed(1)}m, ${size}, difficulty ${difficulty}: ${landed}/${nSeeds} landed`);
for (const r of rows) console.log('  ' + r);
