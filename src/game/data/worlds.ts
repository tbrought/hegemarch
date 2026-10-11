import type { PlanetType, WorldRole, WorldSize } from '../types';

export interface PlanetDef {
  name: string;
  radius: [number, number];
  /** The role this kind of world is naturally good at (+25% to that role). */
  affinity: WorldRole;
  desc: string;
}

export const PLANETS: Record<PlanetType, PlanetDef> = {
  terran: { name: 'Garden', radius: [68, 84], affinity: 'forge', desc: 'A temperate world of seas and forests.' },
  ocean: { name: 'Ocean', radius: [64, 80], affinity: 'observatory', desc: 'Endless seas under clear skies.' },
  desert: { name: 'Desert', radius: [56, 72], affinity: 'mine', desc: 'Dunes over rich, shallow ore.' },
  ice: { name: 'Ice', radius: [54, 70], affinity: 'observatory', desc: 'A frozen world with crystal-clear air.' },
  volcanic: { name: 'Volcanic', radius: [50, 66], affinity: 'forge', desc: 'Molten rivers that never cool.' },
  gas: { name: 'Gas Giant', radius: [100, 124], affinity: 'mine', desc: 'Cloud-skimmers gather fuel from its storms.' },
  barren: { name: 'Barren', radius: [40, 54], affinity: 'bastion', desc: 'An airless rock, easy to fortify.' },
  asteroid: { name: 'Asteroid Belt', radius: [30, 40], affinity: 'mine', desc: 'A field of tumbling, ore-rich rocks.' },
};

export function sizeForRadius(r: number): WorldSize {
  return r < 56 ? 'S' : r < 76 ? 'M' : 'L';
}

export interface RoleDef {
  id: WorldRole;
  name: string;
  desc: string;
  short: string;
}

export const ROLES: Record<WorldRole, RoleDef> = {
  mine: { id: 'mine', name: 'Mine', short: '[+75% Embers] here.', desc: 'Digs deep: this world makes [75% more Embers].' },
  forge: { id: 'forge', name: 'Forge', short: 'Builds ships.', desc: 'Builds ships. Higher levels build [faster].' },
  observatory: { id: 'observatory', name: 'Observatory', short: 'Makes [Lore] and sees further.', desc: 'Studies the dark: makes [Lore] and sees [one starlane further].' },
  bastion: { id: 'bastion', name: 'Bastion', short: '[Guns], [armor], [repairs], and enemies cannot run.', desc: 'Fortifies the world: [orbital guns], [+50% hull and shields], [repairs] for your ships here, and an [anti-warp field]: enemy ships take 6s longer to jump away. At level II the field reaches the system’s star as well, at level III every place in the system.' },
};

export const ROLE_ORDER: WorldRole[] = ['mine', 'forge', 'observatory', 'bastion'];

/** Economy and world constants. */
export const ECON = {
  /** Embers per second for a fully glowing level I world, by size. */
  embers: { S: 0.4, M: 0.6, L: 0.8 } as Record<WorldSize, number>,
  /** Output multiplier by level (index = level). */
  levelMul: [0, 1, 1.5, 2.0],
  hearthEmbers: 3.0,
  hearthLore: 1.0,
  worldLore: 0.05,
  observatoryLore: 0.45,
  mineBonus: 0.75,
  affinity: 0.25,
  /**
   * A Forge on a world that suits it builds its ships this much cheaper (in place of the +25% the other
   * roles get: a Forge that built faster was hardly felt, the third playtest found).
   */
  forgeFitDiscount: 0.15,
  forgeBuildPerLevel: 0.25,
  bastionHp: 0.5,
  bastionRepair: 0.01,
  hp: { S: 4500, M: 6000, L: 7500 } as Record<WorldSize, number>,
  hpPerLevel: 0.35,
  hearthHp: 36000,
  /** A Hearth's walls (hull, shields, guns) start low and rise to full over the opening: the rush window. */
  wallsStart: 0.45,
  wallsTime: 720,
  shieldFrac: 0.3,
  /** Seconds for a new world to go from 25% to full glow. */
  glowTime: 90,
  glowStart: 0.25,
  kindleBase: 120,
  kindleStep: 30,
  kindleTime: 20,
  upgradeCost: [0, 0, 160, 380],
  upgradeTime: [0, 0, 30, 45],
  sizeCost: { S: 0.8, M: 1, L: 1.2 } as Record<WorldSize, number>,
  retoolTime: 20,
  hangarBase: 16,
  hangarPerWorld: 3,
  /** Hangar Bays bought at the Hearth. */
  bayHangar: 5,
  bayCost: 250,
  bayCostStep: 150,
  bayMax: 10,
  startEmbers: 400,
};

/** Lore needed for boon number n (0-based, counting only boons earned from Lore). */
export function boonCost(n: number): number {
  return Math.round(150 + 80 * n + 3 * n * n);
}
