import type { Game } from '../Game';
import { PIRATE_MUL } from '../constants';
import { UNITS } from '../data/units';
import type { UnitType } from '../types';

export function crisisTick(g: Game, dt: number) {
  const C = g.crisis;
  if (!C || C.dead) return;
  if (!C.awake) {
    if (!C.warned && g.time >= C.awakenAt - 60) {
      C.warned = true;
      g.notify(-1, 'The Maw stirs… the Hollow will break through in 60 seconds!', 'alert', C.node, true);
    }
    if (g.time >= C.awakenAt) awaken(g);
    return;
  }
  const heart = g.units.get(C.heart);
  if (!heart || heart.dead) return;
  if (heart.lastHit > 10) heart.hp = Math.min(heart.maxHp, heart.hp + 100 * dt);
  // The Heart spawns defenders while it is under attack.
  if (heart.lastHit < 3 && g.tick % 500 === 0) {
    for (let i = 0; i < 4; i++) g.spawnUnit('drone', g.crisisId, C.node).parent = -1;
    g.spawnUnit('reaper', g.crisisId, C.node).parent = -1;
  }
  if (g.time >= C.nextWave) spawnWave(g);
  if (g.tick % 20 === 7) driveCrisis(g);
}

function awaken(g: Game) {
  const C = g.crisis!;
  C.awake = true;
  const n = g.nodes[C.node];
  const heart = g.spawnUnit('heart', g.crisisId, n.id, { x: n.x, y: n.y });
  C.heart = heart.id;
  heart.abil = [{ id: 'voidpulse', cd: 6 }];
  heart.buffs.push({ id: 'barrier', t: 240, v: 0 });
  for (let i = 0; i < 6; i++) g.spawnUnit('drone', g.crisisId, n.id).parent = -1;
  for (let i = 0; i < 2; i++) g.spawnUnit('reaper', g.crisisId, n.id).parent = -1;
  C.nextWave = g.time + 30;
  g.notify(-1, 'THE MAW HAS OPENED! The Hollow pour into the sector. A void barrier shields the Rift Heart for 4 minutes.', 'alert', n.id);
}

function spawnWave(g: Game) {
  const C = g.crisis!;
  C.waves++;
  const minutes = g.time / 60;
  let budget = (10 + C.waves * 4 + minutes * 0.5) * PIRATE_MUL[g.config.difficulty];
  const n = g.nodes[C.node];
  if (C.waves % 3 === 0) {
    g.spawnUnit('leviathan', g.crisisId, n.id);
    budget -= UNITS.leviathan.power;
  }
  let count = 0;
  while (budget > 0 && count < 40) {
    const type: UnitType = budget > 5 && g.rng.chance(0.35) ? 'reaper' : 'drone';
    budget -= UNITS[type].power;
    g.spawnUnit(type, g.crisisId, n.id);
    count++;
  }
  C.nextWave = g.time + Math.max(75, 125 - C.waves * 4);
  if (C.waves === 1 || C.waves % 3 === 0) g.notify(-1, `A Hollow swarm emerges from The Maw (wave ${C.waves}).`, 'alert', n.id);
}

/** Send idle Hollow units at the nearest empire world. */
function driveCrisis(g: Game) {
  const C = g.crisis!;
  const groups = new Map<number, number[]>();
  for (const u of g.unitList) {
    if (u.dead || u.owner !== g.crisisId || UNITS[u.type].isStatic || u.parent === -1) continue;
    if (u.lane || u.path.length > 0) continue;
    const here = g.nodes[u.node];
    const busy = g.hasHostiles(u.node, g.crisisId) || (here.kind === 'planet' && here.owner >= 0);
    if (busy) continue;
    const list = groups.get(u.node) ?? [];
    list.push(u.id);
    groups.set(u.node, list);
  }
  for (const [nodeId, ids] of groups) {
    let best = -1;
    let bd = Infinity;
    for (const n of g.nodes) {
      if (n.kind !== 'planet' || n.owner < 0 || g.factions[n.owner].kind !== 'empire') continue;
      const d = g.pathLen(nodeId, n.id) + (n.capitalOf >= 0 ? 3000 : 0);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    if (best >= 0) g.cmdMove(g.crisisId, ids, best);
  }
  void C;
}
