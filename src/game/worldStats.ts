/**
 * What a world is worth and can do: its role and how well it suits it, the Embers and Lore it makes,
 * its hull and guns, a Hearth's walls, and what kindling or raising a world costs.
 */

import { TICK } from './constants';
import { ERAS } from './data/eras';
import { ECON, PLANETS } from './data/worlds';
import { mul } from './mods';
import { recomputeHangar } from './systems/economy';
import type { Faction, GNode, WorldRole } from './types';
import { clamp } from './util';
import type { Game } from './Game';

/** Is this world a Hearth (of a house that stands, or one that has fallen)? */
export function isHearth(n: GNode): boolean {
  return n.capitalOf >= 0;
}

export function affinityOf(n: GNode): WorldRole | null {
  return n.ptype ? PLANETS[n.ptype].affinity : null;
}

/** Whether a world currently benefits from a role. The Hearth has every role. */
export function hasRole(n: GNode, role: WorldRole): boolean {
  if (n.kind !== 'planet' || n.owner < 0) return false;
  if (isHearth(n)) return true;
  return n.role === role && n.retool <= 0;
}

/**
 * Bonus multiplier for a role's main effect at this world (affinity + boons). A Forge's natural fit is
 * not here: it makes its ships cheaper instead (`forgeFit`).
 */
export function roleBonus(g: Game, n: GNode, role: WorldRole): number {
  const m = n.owner >= 0 ? g.factions[n.owner].mods : null;
  return 1 + (role !== 'forge' && g.affinityOf(n) === role && !isHearth(n) ? ECON.affinity : 0) + (m ? m.role[role] : 0);
}

/** A Forge on a world that suits it (never the Hearth): its ships cost `ECON.forgeFitDiscount` less. */
export function forgeFit(g: Game, n: GNode): boolean {
  return !isHearth(n) && n.role === 'forge' && g.affinityOf(n) === 'forge';
}

export function levelMulOf(n: GNode): number {
  return ECON.levelMul[clamp(n.level, 1, 3)];
}

export function worldEmbers(g: Game, n: GNode): number {
  if (n.kind !== 'planet' || n.owner < 0) return 0;
  const f = g.factions[n.owner];
  if (f.kind !== 'empire') return 0;
  let e: number;
  if (isHearth(n)) e = (ECON.hearthEmbers * g.levelMulOf(n)) / ECON.levelMul[2];
  else {
    e = ECON.embers[n.size] * g.levelMulOf(n);
    if (g.hasRole(n, 'mine')) e *= 1 + ECON.mineBonus * g.roleBonus(n, 'mine');
  }
  if (n.lastHit < 5) e *= 0.5;
  return e * n.glow;
}

export function worldLore(g: Game, n: GNode): number {
  if (n.kind !== 'planet' || n.owner < 0) return 0;
  const f = g.factions[n.owner];
  if (f.kind !== 'empire') return 0;
  let l = ECON.worldLore;
  if (isHearth(n)) l += (ECON.hearthLore * g.levelMulOf(n)) / ECON.levelMul[2];
  else if (g.hasRole(n, 'observatory')) l += ECON.observatoryLore * g.levelMulOf(n) * g.roleBonus(n, 'observatory');
  return l * n.glow;
}

/** Ship build speed multiplier of a Forge (or the Hearth). 0 if it cannot build. */
export function forgeMul(g: Game, n: GNode): number {
  if (!g.hasRole(n, 'forge')) return 0;
  return (1 + ECON.forgeBuildPerLevel * (n.level - 1)) * (isHearth(n) ? 1 : g.roleBonus(n, 'forge'));
}

export function isForge(n: GNode): boolean {
  return n.kind === 'planet' && n.owner >= 0 && (isHearth(n) || n.role === 'forge');
}

/** How far a Hearth's walls have risen (0.45 at the start, 1 after 12 minutes). Other worlds: 1. */
export function wallsOf(g: Game, n: GNode): number {
  if (!isHearth(n)) return 1;
  // By the whole second: a Hearth's walls are rebuilt once a second (economyTick), and a game saved
  // between two seconds must come back with the walls it had. (Loading rebuilds every world, so with
  // the time to the tick a loaded Hearth stood a hair taller than the one that was saved.)
  const seconds = Math.floor(g.tick * TICK + 1e-6);
  return Math.min(1, ECON.wallsStart + (1 - ECON.wallsStart) * (seconds / ECON.wallsTime));
}

export function worldGun(g: Game, n: GNode): { dmg: number; cd: number; range: number } | null {
  if (n.kind !== 'planet' || n.owner < 0) return null;
  const f = g.factions[n.owner];
  if (f.kind !== 'empire') return null;
  const m = f.mods;
  const cap = isHearth(n);
  let dmg = 0;
  if (cap) dmg = (100 + 20 * (n.level - 2)) * g.wallsOf(n);
  else if (g.hasRole(n, 'bastion')) dmg = (30 + 14 * (n.level - 1)) * g.roleBonus(n, 'bastion');
  else if ((m.flags.allGuns ?? 0) > 0) dmg = 12 + 6 * (n.level - 1);
  if (dmg <= 0) return null;
  dmg *= mul(m.worldGun + (cap ? m.hearthGun : 0)) * ERAS[f.era].power;
  return { dmg, cd: 1.0, range: n.well * 0.95 };
}

export function refreshWorld(g: Game, n: GNode) {
  if (n.kind !== 'planet' || !n.ptype) return;
  const m = n.owner >= 0 && g.factions[n.owner].kind === 'empire' ? g.factions[n.owner].mods : null;
  const cap = isHearth(n);
  let base = cap ? ECON.hearthHp * (1 + ECON.hpPerLevel * (n.level - 2)) * g.wallsOf(n) : ECON.hp[n.size] * (1 + ECON.hpPerLevel * (n.level - 1));
  if (!cap && n.owner >= 0 && n.role === 'bastion') base *= 1 + ECON.bastionHp * g.roleBonus(n, 'bastion');
  // (Walls are as strong as the age of the house that holds them.)
  if (m) base *= mul(m.worldHp + (cap ? m.hearthHp : 0), 0.3) * ERAS[g.factions[n.owner].era].power;
  const newMax = Math.round(base);
  if (newMax !== n.maxHp) {
    const frac = n.maxHp > 0 ? n.hp / n.maxHp : 1;
    n.maxHp = newMax;
    n.hp = clamp(frac * newMax, 0, newMax);
  }
  n.maxSh = Math.round(newMax * (cap ? 0.35 : ECON.shieldFrac));
  n.sh = Math.min(n.sh, n.maxSh);
}

export function setLevel(g: Game, n: GNode, level: number) {
  n.level = clamp(level, 1, 3);
  g.refreshWorld(n);
  if (n.owner >= 0) recomputeHangar(g, g.factions[n.owner]);
}

/** Hangar space: a base, plus some for every world (more for higher levels). */
export function hangarCapOf(g: Game, f: Faction): number {
  let space = ECON.hangarBase + f.mods.hangar + ECON.bayHangar * (f.bays ?? 0);
  for (const n of g.nodes) if (n.owner === f.id && n.kind === 'planet') space += ECON.hangarPerWorld + (n.level - 1);
  return Math.floor(space * mul(f.mods.hangarMul, 0.3));
}

/** Embers to kindle the next dark world. */
export function kindleCost(g: Game, f: Faction): number {
  let owned = 0;
  for (const n of g.nodes) if (n.owner === f.id && n.kind === 'planet') owned++;
  for (const u of g.unitList) if (!u.dead && u.owner === f.id && u.type === 'seed' && u.order === 'kindle') owned++;
  return Math.round((ECON.kindleBase + ECON.kindleStep * owned) * mul(f.mods.kindleCost, 0.2));
}

export function upgradeCost(f: Faction, n: GNode): number | null {
  if (n.level >= 3) return null;
  return Math.round(ECON.upgradeCost[n.level + 1] * ECON.sizeCost[n.size] * mul(f.mods.upgradeCost, 0.2));
}
