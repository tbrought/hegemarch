/** Debug helper: trace one AI-vs-AI game minute by minute.  npx tsx scripts/trace.ts [seed] [size] [difficulty] [minutes] */
import { Game } from '../src/game/Game';
import { isWarship } from '../src/game/data/units';
import type { Difficulty, MapSize } from '../src/game/types';

const seed = Number(process.argv[2] ?? 1007);
const size = (process.argv[3] ?? 'medium') as MapSize;
const difficulty = Number(process.argv[4] ?? 1) as Difficulty;
const minutes = Number(process.argv[5] ?? 30);
const g = Game.create({ seed, size, difficulty, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
g.fxEnabled = false;
let lastOwner = g.nodes.map((n) => n.owner);
const hitLog = new Set<string>();
for (let i = 0; i < minutes * 1200 && !g.outcome; i++) {
  g.step();
  g.fx.length = 0;
  if (g.tick % 20 === 0) {
    for (const n of g.nodes) {
      if (n.owner >= 0 && n.lastHit < 1 && n.lastHitBy >= 0 && g.factions[n.lastHitBy].kind === 'empire' && g.factions[n.owner].kind === 'empire') {
        const key = `${n.id}-${n.lastHitBy}`;
        if (!hitLog.has(key)) {
          hitLog.add(key);
          const att = g.factions[n.lastHitBy];
          const tn = att.ai && att.ai.target >= 0 ? g.nodes[att.ai.target] : null;
          const shooters = g.buckets[n.id].filter((u) => u.owner === att.id).map((u) => `${u.type}:${u.order}:${u.path.length}:${u.dest}`).slice(0, 6).join(" ");
          console.log(`${(g.time / 60).toFixed(1)}m ${att.name} (mode ${att.ai?.mode}, target ${tn ? tn.name + "/" + tn.kind + "/owner" + tn.owner : "-"}) [${shooters}] hits ${n.name} of ${g.factions[n.owner].name}${n.capitalOf >= 0 ? ' [HEARTH]' : ''}`);
        }
      }
      if (n.owner !== lastOwner[n.id]) {
        console.log(`${(g.time / 60).toFixed(1)}m ${n.name}: ${lastOwner[n.id] >= 0 ? g.factions[lastOwner[n.id]].name : 'dark'} -> ${n.owner >= 0 ? g.factions[n.owner].name : 'dark'}`);
      }
    }
    lastOwner = g.nodes.map((n) => n.owner);
  }
  if (g.tick % 1200 === 0) {
    for (const f of g.empires()) {
      const army = g.unitsOf(f.id).filter((u) => isWarship(u.type));
      const comp: Record<string, number> = {};
      for (const u of army) comp[u.type] = (comp[u.type] ?? 0) + 1;
      console.log(`   ${(g.time / 60).toFixed(0)}m ${f.name.padEnd(18)} w=${g.worldsOf(f.id).length} hang=${f.hangarUsed}/${f.hangarCap} e=${Math.round(f.embers)} inc=${f.income.toFixed(1)} boons=${f.boons} mode=${f.ai?.mode} ${JSON.stringify(comp)}`);
    }
  }
}
console.log(g.outcome);
