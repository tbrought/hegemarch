// How often each herald comes in real games (rival houses playing, the player passive, the Hearth
// holding): per game, per kind, and the most in any one minute. (Measured for 1.22.1: 0 to 3 a game,
// never two in a minute, over 8 medium games of 45 minutes.)
//   npx tsx scripts/herald-count.ts [seeds] [size] [minutes]
import { Game } from '../src/game/Game';
import { TICK } from '../src/game/constants';
import type { GameConfig } from '../src/game/types';

const seeds = Number(process.argv[2] ?? 8);
const size = (process.argv[3] ?? 'medium') as GameConfig['size'];
const minutes = Number(process.argv[4] ?? 45);
const total: Record<string, number> = {};
let worst = { n: 0, what: '' };
for (let s = 1; s <= seeds; s++) {
  const g = Game.create({ seed: 7000 + s, size, difficulty: 2, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, forcedVictories: ['conquest', 'domination', 'treasury'] });
  g.fxEnabled = false;
  const seen: { t: number; title: string }[] = [];
  const notify = g.notify.bind(g);
  g.notify = (fid, text, kind, node, pause = false, herald) => {
    if (herald && (fid === -1 || fid === g.playerId)) seen.push({ t: g.time, title: herald.title });
    return notify(fid, text, kind, node, pause, herald);
  };
  // (The player's Hearth holds: a passive player is not the point.)
  for (let i = 0; i < (minutes * 60) / TICK && !g.outcome; i++) {
    g.step();
    const home = g.nodes[g.player.capital];
    if (home) home.hp = Math.max(home.hp, home.maxHp * 0.5);
  }
  const by: Record<string, number> = {};
  for (const h of seen) by[h.title] = (by[h.title] ?? 0) + 1;
  for (const [k, v] of Object.entries(by)) {
    total[k] = (total[k] ?? 0) + v;
    if (v > worst.n) worst = { n: v, what: `seed ${7000 + s}: ${k} ×${v}` };
  }
  // The most heralds in any minute.
  const perMin: Record<number, number> = {};
  for (const h of seen) perMin[Math.floor(h.t / 60)] = (perMin[Math.floor(h.t / 60)] ?? 0) + 1;
  const busiest = Math.max(0, ...Object.values(perMin));
  console.log(`seed ${7000 + s}: ${seen.length} heralds in ${(g.time / 60).toFixed(0)} min, at most ${busiest} in a minute; ${JSON.stringify(by)}${g.outcome ? ` (${g.outcome.victory})` : ''}`);
}
console.log('all seeds:', JSON.stringify(total));
console.log('most of one kind in one game:', worst.what);
