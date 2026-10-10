import type { Game } from '../Game';
import { PIRATE_MUL } from '../constants';
import { UNITS } from '../data/units';
import type { Faction, GNode, UnitType } from '../types';

export function piratesTick(g: Game, _dt: number) {
  const P = g.pirates;
  if (!P.alive) {
    P.raids = [];
    return;
  }
  if (g.time >= P.nextRaid) launchRaid(g);
  if (g.tick % 10 !== 3) return;

  for (const r of P.raids) {
    r.units = r.units.filter((id) => {
      const u = g.units.get(id);
      return !!u && !u.dead;
    });
    if (r.units.length === 0) continue;
    const target = g.nodes[r.target];
    if (r.phase !== 'return' && target.owner !== r.victim) r.phase = 'return';
    if (r.phase === 'travel') {
      const arrived = r.units.filter((id) => g.units.get(id)!.node === r.target).length;
      if (arrived >= Math.ceil(r.units.length * 0.6)) {
        r.phase = 'loot';
        r.lootT = 0;
      } else if (g.time - r.since > 200) {
        r.phase = 'return';
      }
    } else if (r.phase === 'loot') {
      const defended = g.powerAt(r.target, r.victim) > 0.8;
      if (!defended) r.lootT += 0.5;
      if (r.lootT >= 30) plunder(g, target, r.victim);
      if (g.time - r.since > 300) r.phase = 'return';
    }
    if (r.phase === 'return') {
      const moving = r.units.filter((id) => {
        const u = g.units.get(id)!;
        return u.dest !== P.base || (u.node !== P.base && !u.lane && u.path.length === 0);
      });
      if (moving.length) g.cmdMove(g.pirateId, moving, P.base);
    }
  }
  P.raids = P.raids.filter((r) => r.units.length > 0 && !(r.phase === 'return' && r.units.every((id) => g.units.get(id)!.node === P.base)));

  // Slowly rebuild the garrison.
  if (g.tick % 2400 === 3) {
    const garrison = g.buckets[P.base].filter((u) => u.owner === g.pirateId && !u.dead).length;
    if (garrison < 6) g.spawnUnit(g.rng.chance(0.3) ? 'marauder' : 'raider', g.pirateId, P.base);
  }
}

export function plunder(g: Game, n: GNode, victim: number) {
  const f = g.factions[victim];
  const stolen = Math.min(500, Math.floor(f.embers * 0.15));
  f.embers -= stolen;
  n.glow = Math.max(0.25, n.glow * 0.5);
  g.notify(victim, `Corsairs plundered ${n.name}, stealing ${stolen} Embers!`, 'bad', n.id);
  for (const r of g.pirates.raids) if (r.target === n.id) r.phase = 'return';
}

function launchRaid(g: Game) {
  const P = g.pirates;
  P.nextRaid = g.time + Math.max(200, 330 - P.raidCount * 10) * g.rng.float(0.85, 1.15);
  const empires = g.aliveEmpires().filter((f) => !g.asleep(f.id));
  if (!empires.length) return;
  let victim: Faction | undefined;
  if (P.marked >= 0 && g.factions[P.marked]?.alive && !g.asleep(P.marked)) {
    victim = g.factions[P.marked];
    P.marked = -1;
  } else {
    victim = g.rng.weighted(empires, (f) => (g.score(f) + 25) * ((f.mods.flags.bounty3 ?? 0) > 0 ? 3 : 1));
  }
  if (!victim) return;
  const planets = g.worldsOf(victim.id).filter((p) => isFinite(g.pathLen(P.base, p.id)));
  if (!planets.length) return;
  planets.sort((a, b) => g.pathLen(P.base, a.id) + (a.capitalOf >= 0 ? 5000 : 0) - (g.pathLen(P.base, b.id) + (b.capitalOf >= 0 ? 5000 : 0)));
  const target = planets[0];
  const minutes = g.time / 60;
  let budget = (4 + minutes * 0.7) * PIRATE_MUL[g.config.difficulty] * (g.traits.includes('haven') ? 1.5 : 1);
  const ids: number[] = [];
  while (budget > 0 && ids.length < 30) {
    const type: UnitType = budget > 4 && g.rng.chance(0.4) ? 'marauder' : 'raider';
    budget -= UNITS[type].power;
    ids.push(g.spawnUnit(type, g.pirateId, P.base).id);
  }
  g.cmdMove(g.pirateId, ids, target.id);
  P.raids.push({ id: g.nextId++, target: target.id, victim: victim.id, units: ids, phase: 'travel', lootT: 0, since: g.time });
  P.raidCount++;
  const first = !victim.warned.raided;
  victim.warned.raided = g.time;
  g.notify(victim.id, `Corsair raid! ${ids.length} pirate ships are heading for ${target.name}.`, 'alert', target.id, first);
}
