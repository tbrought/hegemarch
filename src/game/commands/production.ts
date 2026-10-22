/**
 * Commands: what a house builds. Ships at a Forge, a world's level and role, a Starbase, the Starfire
 * Gate, a Starfall, a Hangar Bay, the Ark again. Each has a `check` that says why it cannot be done (or null), which
 * the UI shows on its button, and a `cmd` that does it.
 */

import { QUEUE_MAX } from '../constants';
import { ERAS } from '../data/eras';
import { DREADNOUGHT_CAP, UNITS } from '../data/units';
import { ASCENSION_BOONS } from '../data/victories';
import { ECON, ROLE_ORDER } from '../data/worlds';
import { mul } from '../mods';
import type { Faction, GNode, QueueCheck, UnitType, WorldRole } from '../types';
import type { Game } from '../Game';
import { cannotPay, WHY } from './checks';
import { isHearth, recomputeHangar } from '../worldStats';

/** What a ship costs the house; at a Forge that fits its world (`at`), less (`forgeFit`). */
export function shipCost(g: Game, f: Faction, type: UnitType, at?: GNode): number {
  const m = f.mods;
  const um = m.unit[type]?.cost ?? 0;
  const k = type === 'gate' || type === 'ark' ? mul(um, 0.2) : mul(m.shipCost + um, 0.2);
  const fit = at && UNITS[type].buildable && g.forgeFit(at) ? 1 - ECON.forgeFitDiscount : 1;
  return Math.round(UNITS[type].cost * k * fit);
}

export function dreadnoughtCount(g: Game, fid: number): number {
  let c = 0;
  for (const u of g.unitList) if (!u.dead && u.owner === fid && u.type === 'dreadnought') c++;
  for (const n of g.nodes) for (const q of n.shipQ) if (n.owner === fid && q.id === 'dreadnought') c++;
  return c;
}

/** Ships this house can build at a Forge right now (core ships plus drafted blueprints). */
export function shipTypesFor(g: Game, f: Faction): UnitType[] {
  if (g.cradle) return [...ERAS[f.era].roster];
  const out: UnitType[] = ['striker', 'guardian', 'breaker'];
  if (g.hasCard(f, 'bpLancer')) out.push('lancer');
  if (g.hasCard(f, 'bpCarrier')) out.push('carrier');
  if (g.hasCard(f, 'bpDread')) out.push('dreadnought');
  out.push('scout');
  return out;
}

export function checkShip(g: Game, fid: number, nodeId: number, type: UnitType): QueueCheck {
  const f = g.factions[fid];
  const n = g.nodeAt(nodeId);
  const def = UNITS[type];
  if (!def || !def.buildable) return 'Cannot be built';
  if (!f || !n || n.owner !== fid) return 'Not your world';
  if (!g.isForge(n)) return g.cradle ? 'Only Forges build units' : 'Only Forges build ships';
  if (g.cradle && !ERAS[f.era].roster.includes(type)) return 'Not in this age';
  if (n.retool > 0) return 'Retooling';
  if (def.blueprint && !g.hasCard(f, def.blueprint)) return 'Needs its Blueprint Boon';
  if (type === 'dreadnought' && g.dreadnoughtCount(fid) >= DREADNOUGHT_CAP) return `Limit ${DREADNOUGHT_CAP} Dreadnoughts`;
  if (n.shipQ.length >= QUEUE_MAX) return WHY.queue;
  if (f.hangarUsed + def.hangar > f.hangarCap) return WHY.hangar;
  if (cannotPay(f, g.shipCost(f, type, n))) return WHY.embers;
  return null;
}

export function cmdQueueShip(g: Game, fid: number, nodeId: number, type: UnitType): boolean {
  if (g.checkShip(fid, nodeId, type)) return false;
  const f = g.factions[fid];
  const cost = g.shipCost(f, type, g.nodes[nodeId]);
  f.embers -= cost;
  g.nodes[nodeId].shipQ.push({ kind: 'ship', id: type, t: 0, total: UNITS[type].buildTime, cost });
  f.hangarUsed += UNITS[type].hangar;
  return true;
}

export function checkUpgrade(g: Game, fid: number, nodeId: number): QueueCheck {
  const f = g.factions[fid];
  const n = g.nodeAt(nodeId);
  if (!f || !n || n.owner !== fid) return 'Not your world';
  if (n.level >= 3) return 'Already level III';
  if (n.level >= ERAS[f.era].maxLevel) return 'Needs a later age';
  if (n.buildQ.some((q) => q.kind === 'upgrade')) return 'Already rising';
  if (n.buildQ.length >= QUEUE_MAX) return WHY.queue;
  if (cannotPay(f, (g.upgradeCost(f, n) ?? Infinity))) return WHY.embers;
  return null;
}

export function cmdUpgrade(g: Game, fid: number, nodeId: number): boolean {
  if (g.checkUpgrade(fid, nodeId)) return false;
  const f = g.factions[fid];
  const n = g.nodes[nodeId];
  const cost = g.upgradeCost(f, n)!;
  f.embers -= cost;
  n.buildQ.push({ kind: 'upgrade', id: 'level', t: 0, total: ECON.upgradeTime[n.level + 1], cost });
  if (fid === g.playerId) g.ui.raised = 1;
  return true;
}

export function checkRole(g: Game, fid: number, nodeId: number, role: WorldRole): QueueCheck {
  const n = g.nodeAt(nodeId);
  if (!n || n.owner !== fid) return 'Not your world';
  if (!ROLE_ORDER.includes(role)) return 'Not a role';
  if (isHearth(n)) return 'Your Hearth already does everything';
  if (!ERAS[g.factions[fid].era].roles.includes(role)) return 'Needs a later age';
  if (n.role === role) return WHY.sameRole;
  return null;
}

/** Give a world a new role. Switching takes a short retool during which the role does nothing. */
export function cmdSetRole(g: Game, fid: number, nodeId: number, role: WorldRole): boolean {
  if (g.checkRole(fid, nodeId, role)) return false;
  const n = g.nodes[nodeId];
  const f = g.factions[fid];
  if (n.role === 'forge' && n.shipQ.length) {
    for (const q of n.shipQ) {
      f.embers += q.cost;
      if (q.kind === 'ship') f.hangarUsed -= UNITS[q.id as UnitType].hangar;
    }
    n.shipQ = [];
  }
  // (A newly kindled world starts as a Mine. The first role its house gives it costs no time: putting a
  // world to the role it is good at should not be a twenty-second penalty.)
  n.retool = n.role && !n.fresh ? ECON.retoolTime : 0;
  n.fresh = undefined;
  n.role = role;
  g.refreshWorld(n);
  if (fid === g.playerId) g.ui.roleSet = 1;
  return true;
}

export function starbaseAt(g: Game, n: GNode): number {
  let c = 0;
  for (const u of g.buckets[n.id]) if (u.type === 'starbase' && u.owner === n.owner && !u.dead) c++;
  for (const q of n.buildQ) if (q.kind === 'starbase') c++;
  return c;
}

export function checkStarbase(g: Game, fid: number, nodeId: number): QueueCheck {
  const f = g.factions[fid];
  const n = g.nodeAt(nodeId);
  if (!f || !n || n.owner !== fid) return 'Not your world';
  if (!g.hasCard(f, 'bpStarbase')) return 'Needs its Blueprint Boon';
  if (g.starbaseAt(n) >= 1) return 'One Starbase per world';
  if (n.buildQ.length >= QUEUE_MAX) return WHY.queue;
  if (cannotPay(f, g.shipCost(f, 'starbase'))) return WHY.embers;
  return null;
}

export function cmdQueueStarbase(g: Game, fid: number, nodeId: number): boolean {
  if (g.checkStarbase(fid, nodeId)) return false;
  const f = g.factions[fid];
  const cost = g.shipCost(f, 'starbase');
  f.embers -= cost;
  g.nodes[nodeId].buildQ.push({ kind: 'starbase', id: 'starbase', t: 0, total: UNITS.starbase.buildTime, cost });
  return true;
}

export function checkGate(g: Game, fid: number, nodeId: number): QueueCheck {
  const f = g.factions[fid];
  const n = g.nodeAt(nodeId);
  if (!g.victories.includes('ascension')) return 'Ascension is not a Destiny this run';
  if (!f || !n || n.owner !== fid || n.capitalOf !== fid) return 'Raise it at your Hearth';
  if (f.boons < ASCENSION_BOONS) return `Needs ${ASCENSION_BOONS} Boons from Lore`;
  if (f.gate) return 'Gate already raised';
  if (g.nodes.some((x) => x.owner === fid && x.buildQ.some((q) => q.kind === 'gate'))) return 'Gate already rising';
  if (cannotPay(f, g.shipCost(f, 'gate'))) return WHY.embers;
  return null;
}

export function cmdQueueGate(g: Game, fid: number, nodeId: number): boolean {
  if (g.checkGate(fid, nodeId)) return false;
  const f = g.factions[fid];
  const cost = g.shipCost(f, 'gate');
  f.embers -= cost;
  g.nodes[nodeId].buildQ.push({ kind: 'gate', id: 'gate', t: 0, total: UNITS.gate.buildTime, cost });
  g.notify(-1, `${f.name} has begun raising a Starfire Gate at ${g.nodes[nodeId].name}!`, g.ours(f.id) ? 'good' : 'alert', nodeId, false,
    g.ours(f.id) ? undefined : { title: 'A STARFIRE GATE RISES', sub: `${g.shortName(f)} is raising one at ${g.nodes[nodeId].name}.`, tone: 'house', fid: f.id });
  return true;
}

/** Why the house cannot build a Starfall right now (null = it can). It is built at the Hearth, one at a time. */
export function checkStarfall(g: Game, fid: number): QueueCheck {
  const f = g.factions[fid];
  if (g.cradle) return 'The Starfall belongs to the Space Age';
  if (!f || !g.hasCard(f, 'bpStarfall')) return 'Needs its Blueprint Boon';
  if (f.capital < 0) return 'No Hearth';
  const n = g.nodes[f.capital];
  if (n.shipQ.some((q) => q.id === 'starfall')) return 'Already being built';
  if (g.starfallOf(fid)) return 'One Starfall at a time';
  if (n.shipQ.length >= QUEUE_MAX) return WHY.queue;
  if (cannotPay(f, g.starfallCost(f))) return WHY.embers;
  return null;
}

export function cmdQueueStarfall(g: Game, fid: number): boolean {
  if (g.checkStarfall(fid)) return false;
  const f = g.factions[fid];
  const cost = g.starfallCost(f);
  f.embers -= cost;
  g.nodes[f.capital].shipQ.push({ kind: 'ship', id: 'starfall', t: 0, total: UNITS.starfall.buildTime, cost });
  return true;
}

export function bayCost(f: Faction): number {
  return ECON.bayCost + ECON.bayCostStep * (f.bays ?? 0);
}

export function checkBay(g: Game, fid: number): QueueCheck {
  const f = g.factions[fid];
  if (f.capital < 0) return 'No Hearth';
  if ((f.bays ?? 0) >= ECON.bayMax) return 'No room for more bays';
  if (cannotPay(f, g.bayCost(f))) return WHY.embers;
  return null;
}

/** Build a Hangar Bay at the Hearth: more room for ships, at a rising price. */
export function cmdBuyBay(g: Game, fid: number): boolean {
  if (g.checkBay(fid)) return false;
  const f = g.factions[fid];
  f.embers -= g.bayCost(f);
  f.bays = (f.bays ?? 0) + 1;
  recomputeHangar(g, f);
  return true;
}

export function checkArk(g: Game, fid: number): QueueCheck {
  const f = g.factions[fid];
  if (g.cradle) return 'The Ark belongs to the Space Age';
  if (f.ark >= 0 && g.units.has(f.ark)) return WHY.arkFlies;
  if (f.capital < 0) return 'No Hearth';
  const n = g.nodes[f.capital];
  if (n.shipQ.some((q) => q.kind === 'ark')) return 'Already rebuilding';
  if (n.shipQ.length >= QUEUE_MAX) return WHY.queue;
  if (cannotPay(f, g.shipCost(f, 'ark'))) return WHY.embers;
  return null;
}

export function cmdRebuildArk(g: Game, fid: number): boolean {
  if (g.checkArk(fid)) return false;
  const f = g.factions[fid];
  const cost = g.shipCost(f, 'ark');
  f.embers -= cost;
  g.nodes[f.capital].shipQ.push({ kind: 'ark', id: 'ark', t: 0, total: UNITS.ark.buildTime, cost });
  return true;
}

export function cmdCancel(g: Game, fid: number, nodeId: number, queue: 'ship' | 'build', index: number): boolean {
  const n = g.nodeAt(nodeId);
  if (!n || n.owner !== fid) return false;
  const q = queue === 'ship' ? n.shipQ : n.buildQ;
  const it = q[index];
  if (!it) return false;
  q.splice(index, 1);
  const f = g.factions[fid];
  g.addEmbers(f, it.cost);
  if (it.kind === 'ship') f.hangarUsed -= UNITS[it.id as UnitType].hangar;
  return true;
}
