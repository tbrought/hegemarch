/**
 * What a ship can do, with everything its house has learned: its hull and shields, speed, range, rate of
 * fire and damage, how long its drive takes to charge, and what it is worth in a fight (the strength
 * the rival houses count and the results draw).
 */

import { HOLD_FIELD, JUMP_CHARGE, LEVEL_STEP, PHASE_SPEED, POWER_BOON, POWER_WRECK } from './constants';
import { ERAS } from './data/eras';
import { UNITS } from './data/units';
import { mul } from './mods';
import type { DmgType, Unit, UnitMod, WeaponDef } from './types';
import { clamp } from './util';
import type { Game } from './Game';

const EMPTY_UM: UnitMod = {};

export function umod(g: Game, u: Unit): UnitMod {
  return g.factions[u.owner].mods.unit[u.type] ?? EMPTY_UM;
}

export function levelMul(u: Unit): number {
  return 1 + LEVEL_STEP * (u.level - 1);
}

export function refreshUnitStats(g: Game, u: Unit, fresh = false, hpFrac = 1) {
  const def = UNITS[u.type];
  const m = g.factions[u.owner].mods;
  const um = m.unit[u.type] ?? EMPTY_UM;
  const age = ERAS[u.era].power;
  const maxHp = def.hull * mul(m.hull + (um.hull ?? 0), 0.2) * g.levelMul(u) * age;
  const maxSh = def.shield * mul(m.shield, 0) * age;
  if (fresh) {
    u.hp = maxHp * hpFrac;
    u.sh = maxSh;
  } else {
    if (maxHp !== u.maxHp) {
      const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
      u.hp = frac * maxHp;
    }
    u.sh = Math.min(u.sh, maxSh);
  }
  u.maxHp = maxHp;
  u.maxSh = maxSh;
}

export function armorOf(g: Game, u: Unit): number {
  return clamp(UNITS[u.type].armor + g.factions[u.owner].mods.armor, 0, 0.75);
}

export function hasBuff(u: Unit, id: string): boolean {
  for (const b of u.buffs) if (b.id === id) return true;
  return false;
}

/** True when an enemy house's Gravity Anchors hold this world. */
function anchoredAt(g: Game, u: Unit): boolean {
  if (u.node < 0) return false;
  const n = g.nodes[u.node];
  return n.owner >= 0 && g.hostile(n.owner, u.owner) && (g.factions[n.owner].mods.flags.anchors ?? 0) > 0;
}

/**
 * How many seconds longer a ship takes to jump away from where it is, because the house that holds
 * the world keeps it there: an anti-warp field (`fieldAt`), and the Gravity Anchors Boon at any of
 * that house's worlds.
 */
export function holdAt(g: Game, u: Unit): number {
  if (u.node < 0) return 0;
  const n = g.nodes[u.node];
  const held = g.fieldsOver(n).some((h) => g.hostile(h, u.owner));
  return (held ? HOLD_FIELD : 0) + (anchoredAt(g, u) ? 4 : 0);
}

export function speedOf(g: Game, u: Unit): number {
  const def = UNITS[u.type];
  const m = g.factions[u.owner].mods;
  let s = def.speed * mul(m.speed + (g.umod(u).speed ?? 0), 0.3);
  if (u.snare > 0) s *= 0.6;
  if (anchoredAt(g, u)) s *= 0.7;
  return s;
}

export function jumpChargeOf(g: Game, u: Unit): number {
  const m = g.factions[u.owner].mods;
  return JUMP_CHARGE * mul(m.jumpCharge, 0.2) + g.holdAt(u);
}

export function laneSpeedOf(g: Game, u: Unit): number {
  return PHASE_SPEED * mul(g.factions[u.owner].mods.laneSpeed, 0.3) * ERAS[u.era].laneSpeed;
}

export function rangeOf(g: Game, u: Unit, w: WeaponDef): number {
  const m = g.factions[u.owner].mods;
  return w.range * mul(m.range + (g.umod(u).range ?? 0), 0.3);
}

export function maxRangeOf(g: Game, u: Unit): number {
  let r = 0;
  for (const w of UNITS[u.type].weapons) r = Math.max(r, g.rangeOf(u, w));
  return r;
}

export function rofOf(g: Game, u: Unit): number {
  let r = mul(g.factions[u.owner].mods.rof, 0.3);
  if (g.hasBuff(u, 'overdrive')) r *= 1.7;
  return r;
}

export function dmgMulOf(g: Game, u: Unit, type: DmgType): number {
  const f = g.factions[u.owner];
  const m = f.mods;
  let bonus = m.dmg + m.dmgT[type] + (g.umod(u).dmg ?? 0);
  if (g.hasBuff(u, 'rally')) bonus += 0.25;
  const zeal = m.flags.zeal ?? 0;
  if (zeal > 0) for (const b of u.buffs) if (b.id === 'zeal') bonus += zeal * b.v;
  const ps = m.flags.phaseStrike ?? 0;
  if (ps > 0 && g.time - u.arrivedAt < 12) bonus += ps;
  const hm = m.flags.hivemind ?? 0;
  if (hm > 0 && u.node >= 0) {
    let allies = 0;
    for (const o of g.buckets[u.node]) if (o.owner === u.owner && o !== u && UNITS[o.type].role !== 'fighter') allies++;
    bonus += Math.min(0.4, allies * hm);
  }
  let k = mul(bonus, 0.1) * g.levelMul(u) * ERAS[u.era].power;
  if (g.hasBuff(u, 'feeble')) k *= 0.25;
  return k;
}

export function unitPower(g: Game, u: Unit): number {
  const def = UNITS[u.type];
  const frac = (u.hp + u.sh) / Math.max(1, u.maxHp + u.maxSh);
  const m = g.factions[u.owner].mods;
  return def.power * (POWER_WRECK + (1 - POWER_WRECK) * frac) * (1 + (m.dmg + m.hull) * POWER_BOON) * g.levelMul(u) * ERAS[u.era].power;
}

/** Combat power of a faction's units at a node. */
export function powerAt(g: Game, nodeId: number, fid: number): number {
  let p = 0;
  for (const u of g.buckets[nodeId]) if (u.owner === fid) p += g.unitPower(u);
  return p;
}

export function hostilePowerAt(g: Game, nodeId: number, fid: number): number {
  let p = 0;
  for (const u of g.buckets[nodeId]) if (g.hostile(u.owner, fid)) p += g.unitPower(u);
  const n = g.nodes[nodeId];
  if (n.owner >= 0 && g.hostile(n.owner, fid)) {
    const gun = g.worldGun(n);
    if (gun) p += gun.dmg / 6;
  }
  return p;
}

/**
 * AI houses do not bombard a rival's worlds before their own first attack, so they never start a war by
 * accident, unless that rival attacked them first. This is AI behaviour only: players can strike any time.
 */
export function holdsFire(g: Game, attacker: number, worldOwner: number): boolean {
  const a = g.factions[attacker];
  if (!a || !a.ai || worldOwner < 0 || g.factions[worldOwner].kind !== 'empire') return false;
  if (a.ai.grudge === worldOwner) return false;
  return g.time < a.ai.firstAttackAt;
}

export function hasHostiles(g: Game, nodeId: number, fid: number): boolean {
  for (const u of g.buckets[nodeId]) if (g.hostile(u.owner, fid) && UNITS[u.type].role !== 'fighter') return true;
  return false;
}
