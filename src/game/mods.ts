import type { Mods, UnitMod, UnitType } from './types';

/**
 * All modifiers are additive bonuses around a neutral value of 0, consumed as
 * (1 + bonus). Stacking stays linear and pacts can contribute negatives.
 */
export function baseMods(): Mods {
  return {
    dmg: 0,
    dmgT: { rapid: 0, flak: 0, siege: 0, lance: 0, fighter: 0, energy: 0 },
    hull: 0,
    shield: 0,
    shieldRegen: 0,
    armor: 0,
    rof: 0,
    range: 0,
    speed: 0,
    laneSpeed: 0,
    jumpCharge: 0,
    build: 0,
    shipCost: 0,
    upgradeCost: 0,
    embers: 0,
    lore: 0,
    kindleCost: 0,
    kindleSpeed: 0,
    glowRate: 0,
    worldHp: 0,
    worldGun: 0,
    hearthHp: 0,
    hearthGun: 0,
    hangar: 0,
    hangarMul: 0,
    xp: 0,
    fighters: 0,
    draft: 0,
    luck: 0,
    role: { mine: 0, forge: 0, observatory: 0, bastion: 0 },
    unit: {},
    flags: {},
  };
}

export function um(m: Mods, t: UnitType): UnitMod {
  let u = m.unit[t];
  if (!u) {
    u = {};
    m.unit[t] = u;
  }
  return u;
}

export function addU(m: Mods, t: UnitType, key: keyof UnitMod, v: number) {
  const u = um(m, t);
  u[key] = (u[key] ?? 0) + v;
}

export function flag(m: Mods, name: string, v: number) {
  m.flags[name] = (m.flags[name] ?? 0) + v;
}

export const mul = (bonus: number, min = 0.1) => Math.max(min, 1 + bonus);
