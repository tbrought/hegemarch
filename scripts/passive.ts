/**
 * How long does a completely passive player survive? (Balance probe: the AI must not be able to
 * steamroll a player in the opening.)  npm run balance:passive -- [size=medium]
 */
import { Game } from '../src/game/Game';
import type { Difficulty, MapSize } from '../src/game/types';

const size = (process.argv[2] ?? 'medium') as MapSize;
for (const difficulty of [0, 1, 2, 3] as Difficulty[]) {
  const rows: string[] = [];
  for (let s = 1; s <= 4; s++) {
    const g = Game.create({ seed: 500 + s * 13, size, difficulty, heir: 'concord', perks: {}, unlockLegendary: false, unlockPacts: false });
    g.fxEnabled = false;
    // The passive player just takes the first Boon offered.
    let firstHit = -1;
    let firstRaid = -1;
    while (!g.outcome && g.time < 60 * 60) {
      g.step();
      g.fx.length = 0;
      const p = g.player;
      while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)![0]);
      g.prompts.length = 0;
      if (firstRaid < 0 && g.pirates.raids.some((r) => r.victim === p.id)) firstRaid = g.time;
      if (firstHit < 0 && p.capital >= 0) {
        const cap = g.nodes[p.capital];
        if (cap.lastHit < 0.1 && cap.lastHitBy >= 0 && g.factions[cap.lastHitBy].kind === 'empire') firstHit = g.time;
      }
    }
    const o = g.outcome;
    rows.push(
      `${o ? `${o.victory === 'defeat' ? 'killed' : 'AI ' + o.victory} @ ${(o.time / 60).toFixed(1)}m` : 'alive @60m'} ` +
        `(first raid ${firstRaid < 0 ? 'never' : (firstRaid / 60).toFixed(1) + 'm'}, Hearth first hit by a rival ${firstHit < 0 ? 'never' : (firstHit / 60).toFixed(1) + 'm'})`,
    );
  }
  console.log(`difficulty ${difficulty}:\n  ${rows.join('\n  ')}`);
}
