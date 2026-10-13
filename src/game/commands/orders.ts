/**
 * Commands: orders to ships. Move (by the way the house knows to be safe, or straight), attack, stop,
 * retreat, explore, kindle a dark world, and where a Forge sends what it builds. The player's UI and
 * the rival houses give the same orders through these.
 */

import { fixed, UNITS } from '../data/units';
import { burning, STARFALL_FUSE } from '../starfall';
import type { Faction, QueueCheck, Unit } from '../types';
import { dist, TAU } from '../util';
import type { Game } from '../Game';
import { cannotPay, WHY } from './checks';

function orderPath(g: Game, u: Unit, dest: number, avoid?: (nodeId: number) => number) {
  const start = u.lane ? u.lane.to : u.node;
  if (start < 0) return;
  u.dest = dest;
  if (u.fire) delete u.fire;
  if (start === dest) {
    u.path = [];
    if (!u.lane) u.charge = -1;
  } else {
    const round = avoid ? g.pathAvoiding(start, dest, avoid) : [];
    u.path = round.length ? round : g.pathTo(start, dest);
    if (!u.lane) u.charge = -1;
  }
}

/** One more stop: the way from where the ship is bound to `dest`, after the way it has. */
function queuePath(g: Game, u: Unit, dest: number) {
  const leg = g.pathTo(u.dest, dest);
  if (!leg.length) return;
  u.path.push(...leg);
  u.dest = dest;
}

/**
 * `avoid`: places the ships would rather not pass through, each counted as that much further (see
 * `pathAvoiding`). `queue`: the place is one more stop after the one a moving ship is bound for (Shift
 * with the order): its way there is added to the way it has, and a drive that is charging goes on
 * charging. A ship that is not on its way somewhere simply goes. `through`: the ships fly through a
 * burning star on their way, where they would otherwise wait for the fire to burn out.
 */
export function cmdMove(g: Game, fid: number, ids: number[], dest: number, x?: number, y?: number, avoid?: (nodeId: number) => number, queue = false, through = false) {
  const n = g.nodeAt(dest);
  if (!n) return;
  const units = ids.map((id) => g.units.get(id)).filter((u): u is Unit => !!u && !u.dead && u.owner === fid && !fixed(u));
  if (units.length === 0) return;
  const offs = formation(units.length, 34);
  // Bigger ships in the middle of the formation.
  units.sort((a, b) => UNITS[b.type].radius - UNITS[a.type].radius);
  units.forEach((u, i) => {
    if (u.type === 'fighter') return;
    const onward = queue && u.order === 'move' && u.dest >= 0 && u.dest !== dest && (!!u.lane || u.path.length > 0);
    u.order = 'move';
    u.orderTarget = -1;
    u.target = 0;
    u.kindle = 0;
    if (x !== undefined && y !== undefined) {
      let px = x + offs[i][0];
      let py = y + offs[i][1];
      const d = dist(px, py, n.x, n.y);
      const minR = n.r + 40;
      if (d < minR) {
        const a = Math.atan2(py - n.y, px - n.x);
        px = n.x + Math.cos(a) * minR;
        py = n.y + Math.sin(a) * minR;
      }
      u.ox = px;
      u.oy = py;
    } else {
      u.ox = NaN;
      u.oy = NaN;
    }
    if (onward) queuePath(g, u, dest);
    else orderPath(g, u, dest, avoid);
    if (through) u.fire = true;
    if (u.node === dest && !u.lane) {
      u.order = 'idle';
      if (!isNaN(u.ox)) {
        u.ax = u.ox;
        u.ay = u.oy;
      }
    }
  });
}

export function cmdAttack(g: Game, fid: number, ids: number[], targetId: number) {
  const t = g.units.get(targetId);
  if (!t || t.dead || !g.hostile(fid, t.owner)) return;
  const dest = t.node >= 0 ? t.node : t.lane ? t.lane.to : -1;
  if (dest < 0) return;
  for (const id of ids) {
    const u = g.units.get(id);
    if (!u || u.dead || u.owner !== fid || UNITS[u.type].isStatic || u.type === 'fighter') continue;
    if (!UNITS[u.type].weapons.length && !UNITS[u.type].fighters) continue;
    u.order = 'attack';
    u.orderTarget = targetId;
    u.target = targetId;
    u.retarget = 3;
    u.ox = NaN;
    u.oy = NaN;
    orderPath(g, u, dest);
  }
}

/** Why the house cannot kindle this world right now (null = it can). */
export function checkKindle(g: Game, fid: number, nodeId: number): QueueCheck {
  const f = g.factions[fid];
  const n = g.nodes[nodeId];
  if (!n || n.kind !== 'planet') return 'Only worlds can be kindled';
  if (n.owner >= 0) return n.owner === fid ? 'Already yours' : 'Owned by another house';
  if (!f.explored[nodeId]) return 'Not yet charted';
  if (g.seedFor(fid, nodeId)) return 'A seed ship is on its way';
  if (g.kindleSource(fid, nodeId) < 0 && !g.idleSeed(fid)) return 'No world can reach it';
  if (!g.idleSeed(fid) && cannotPay(f, g.kindleCost(f))) return WHY.embers;
  return null;
}

/** The seed ship already heading for (or kindling) a world. */
export function seedFor(g: Game, fid: number, nodeId: number): Unit | null {
  for (const u of g.unitList) if (!u.dead && u.owner === fid && u.type === 'seed' && u.order === 'kindle' && u.orderTarget === nodeId) return u;
  return null;
}

/** A seed ship with no world to kindle (its mission was called off): the next KINDLE uses it, for free. */
export function idleSeed(g: Game, fid: number): Unit | null {
  for (const u of g.unitList) if (!u.dead && u.owner === fid && u.type === 'seed' && u.order !== 'kindle') return u;
  return null;
}

/** The owned world closest to a target, where a new seed ship would launch from. */
export function kindleSource(g: Game, fid: number, nodeId: number): number {
  let best = -1;
  let bd = Infinity;
  for (const p of g.nodes) {
    if (p.owner !== fid || p.kind !== 'planet') continue;
    const d = g.pathLen(p.id, nodeId);
    if (d < bd) {
      bd = d;
      best = p.id;
    }
  }
  return isFinite(bd) ? best : -1;
}

/** Kindle a dark world: an idle seed ship is sent, or a new one launches from the nearest world. */
export function cmdKindle(g: Game, fid: number, nodeId: number): boolean {
  if (g.checkKindle(fid, nodeId)) return false;
  const f = g.factions[fid];
  let seed = g.idleSeed(fid);
  if (!seed) {
    const src = g.kindleSource(fid, nodeId);
    if (src < 0) return false;
    const cost = g.kindleCost(f);
    f.embers -= cost;
    seed = g.spawnUnit('seed', fid, src);
    seed.temp = 0;
    if (g.fxEnabled) g.fx.push({ k: 'ring', x: seed.x, y: seed.y, r: 30, color: f.color, node: src });
  }
  return g.cmdSendSeed(fid, seed.id, nodeId);
}

/** Order a particular seed ship to kindle a world. */
export function cmdSendSeed(g: Game, fid: number, seedId: number, nodeId: number): boolean {
  const u = g.units.get(seedId);
  const n = g.nodeAt(nodeId);
  if (!u || u.dead || u.owner !== fid || u.type !== 'seed') return false;
  if (!n || n.kind !== 'planet' || n.owner >= 0) return false;
  u.order = 'kindle';
  u.orderTarget = nodeId;
  u.kindle = 0;
  u.ox = NaN;
  u.oy = NaN;
  orderPath(g, u, nodeId);
  return true;
}

export function cmdStop(g: Game, fid: number, ids: number[]) {
  for (const id of ids) {
    const u = g.units.get(id);
    if (!u || u.dead || u.owner !== fid) continue;
    if (u.fire) delete u.fire;
    if (u.lane) {
      u.path = [];
      u.dest = u.lane.to;
    } else {
      u.path = [];
      u.charge = -1;
      u.dest = u.node;
      u.ax = u.x;
      u.ay = u.y;
    }
    u.order = 'idle';
    u.orderTarget = -1;
    u.ox = NaN;
    u.oy = NaN;
  }
}

export function nearestOwnedWorld(g: Game, fid: number, from: number): number {
  let best = -1;
  let bd = Infinity;
  for (const n of g.nodes) {
    if (n.kind !== 'planet' || n.owner !== fid) continue;
    const d = g.pathLen(from, n.id);
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

export function cmdRetreat(g: Game, fid: number, ids: number[]) {
  for (const id of ids) {
    const u = g.units.get(id);
    if (!u || u.dead || u.owner !== fid || fixed(u)) continue;
    const from = u.lane ? u.lane.to : u.node;
    const dest = g.nearestOwnedWorld(fid, from);
    if (dest < 0) continue;
    u.order = 'retreat';
    u.target = 0;
    u.ox = NaN;
    u.oy = NaN;
    orderPath(g, u, dest);
  }
}

/** Whether any world is still uncharted for this house (so EXPLORE has somewhere to go). */
export function hasUncharted(f: Faction): boolean {
  return f.explored.some((e) => !e);
}

/** Scouts chart the dark by themselves, world after world (other ships ignore the order). */
export function cmdExplore(g: Game, fid: number, ids: number[]) {
  for (const id of ids) {
    const u = g.units.get(id);
    if (!u || u.dead || u.owner !== fid || UNITS[u.type].role !== 'scout') continue;
    u.order = 'explore';
    u.dest = -1;
    u.path = [];
    u.ox = NaN;
    u.oy = NaN;
  }
}

export function cmdSetRally(g: Game, fid: number, nodeId: number, target: number): boolean {
  const n = g.nodeAt(nodeId);
  if (!n || n.owner !== fid || !g.nodeAt(target)) return false;
  n.rally = target === nodeId ? -1 : target;
  return true;
}

/** Why this Starfall cannot be armed where it is (null = it can). */
export function checkArm(g: Game, fid: number, unitId: number): QueueCheck {
  const u = g.units.get(unitId);
  if (!u || u.dead || u.owner !== fid || u.type !== 'starfall') return 'Not a Starfall of yours';
  if (u.fuse !== undefined) return 'Already armed';
  const n = u.lane || u.node < 0 ? null : g.nodes[u.node];
  if (!n || n.kind !== 'star') return 'Only at a star';
  if (burning(n)) return `${n.name} burns already`;
  if (n.hazard) return `${n.name} is flaring`;
  return null;
}

/**
 * Arm a Starfall at the star it is at. From now on it does not move, every house knows, and every
 * other house holds it against the one that did it; in two minutes the star erupts
 * (`systems/starfall.ts`), unless the Starfall is destroyed first. It cannot be called off.
 */
export function cmdArm(g: Game, fid: number, unitId: number): boolean {
  if (g.checkArm(fid, unitId)) return false;
  const u = g.units.get(unitId)!;
  const f = g.factions[fid];
  const n = g.nodes[u.node];
  u.fuse = STARFALL_FUSE;
  u.path = [];
  u.charge = -1;
  u.dest = u.node;
  u.order = 'idle';
  u.orderTarget = -1;
  u.ax = u.x;
  u.ay = u.y;
  for (const r of g.factions) {
    if (r.id === fid || r.kind !== 'empire' || !r.alive || !r.ai) continue;
    r.ai.grudge = fid;
    r.ai.grudgeAt = g.time;
    r.ai.firstAttackAt = Math.min(r.ai.firstAttackAt, g.time + 20);
  }
  if (g.fxEnabled) g.fx.push({ k: 'armed', x: u.x, y: u.y, node: n.id, color: f.color });
  const mine = g.nodes.some((x) => x.system === n.system && x.owner === g.playerId) || g.unitList.some((x) => !x.dead && x.owner === g.playerId && x.node >= 0 && g.nodes[x.node].system === n.system);
  g.notify(-1, f.isPlayer
    ? `Your Starfall is armed at ${n.name}: the star erupts in ${STARFALL_FUSE / 60} minutes. Keep it alive, and have your ships out by then.`
    : `${g.shortName(f)} armed a Starfall at ${n.name}! The star erupts in ${STARFALL_FUSE / 60} minutes. Destroy the Starfall to stop it.`,
    f.isPlayer ? 'good' : 'alert', n.id, !f.isPlayer && mine);
  return true;
}

/** Ring formation offsets (first slot at the center). */
export function formation(n: number, spacing: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let ring = 1;
  while (out.length < n) {
    const count = ring * 6;
    for (let i = 0; i < count && out.length < n; i++) {
      const a = (i / count) * TAU + ring * 0.4;
      out.push([Math.cos(a) * spacing * ring, Math.sin(a) * spacing * ring]);
    }
    ring++;
  }
  return out;
}
