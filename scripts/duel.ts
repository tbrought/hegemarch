/** Debug helper: equal-budget fleet duels.  npx tsx scripts/duel.ts */
import { Game } from '../src/game/Game';
import type { UnitType } from '../src/game/types';

function duel(a: [UnitType, number], b: [UnitType, number], seed = 7) {
  const g = Game.create({ seed, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
  g.fxEnabled = false;
  g.factions[1].ai = null; // a fair fight: nobody gives orders
  const at = g.nodes.find((n) => n.kind === 'star' && !g.systems[n.system].home && g.buckets[n.id].length === 0)!.id;
  const A = Array.from({ length: a[1] }, () => g.spawnUnit(a[0], 0, at));
  const B = Array.from({ length: b[1] }, () => g.spawnUnit(b[0], 1, at));
  for (const u of [...A, ...B]) u.snare = 9999;
  let t = 0;
  for (; t < 20 * 400 && A.some((u) => !u.dead) && B.some((u) => !u.dead); t++) g.step();
  const hp = (L: typeof A) => Math.round((100 * L.filter((u) => !u.dead).reduce((s, u) => s + u.hp + u.sh, 0)) / L.reduce((s, u) => s + u.maxHp + u.maxSh, 0));
  console.log(`${a[1]} ${a[0]} vs ${b[1]} ${b[0]}: ${A.filter((u) => !u.dead).length} vs ${B.filter((u) => !u.dead).length} left after ${(t / 20).toFixed(0)}s (hp ${hp(A)}% vs ${hp(B)}%)`);
}
duel(['striker', 9], ['breaker', 4]);
duel(['breaker', 4], ['guardian', 5]);
duel(['guardian', 5], ['striker', 9]);
duel(['guardian', 6], ['guardian', 6]);
duel(['striker', 10], ['striker', 10]);
duel(['breaker', 5], ['breaker', 5]);
duel(['lancer', 4], ['breaker', 4]);
duel(['carrier', 2], ['guardian', 5]);
duel(['dreadnought', 1], ['guardian', 7]);
duel(['carrier', 2], ['striker', 9]);
duel(['carrier', 2], ['breaker', 4]);
duel(['striker', 6], ['guardian', 1], 9);
