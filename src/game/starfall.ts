/**
 * The Starfall: a device a house builds at its Hearth and arms at a star. Two minutes later the star
 * erupts, unless the device is destroyed first. This file says what is so (what is armed, what burns,
 * what one costs); what an eruption does is in `systems/starfall.ts`, and the orders to build and arm
 * one are with the other commands.
 */

import { UNITS } from './data/units';
import type { Faction, GNode, Unit } from './types';
import type { Game } from './Game';

/** Seconds from arming to the eruption. A fleet at a rival's Hearth is home in about 70 (medium sector). */
export const STARFALL_FUSE = 120;
/** Seconds the star burns afterwards. */
export const STARFALL_BURN = 180;
/** What a ship in the burning star takes each second: a capital ship crosses, a Striker does not. */
export const STARFALL_FIRE = 120;
/** Each Starfall a house builds costs this much more than its last. */
export const STARFALL_STEP = 1000;
/** How much further a way through a burning star counts: it is taken only where there is no other. */
const FIRE_COST = 1e7;

/** Does this star burn from a Starfall? (A solar flare is over in seconds: ships fly on.) */
export function burning(n: GNode): boolean {
  return !!n.hazard && n.hazard.by !== undefined && n.hazard.warn <= 0;
}

/** The burning stars, as they stand (`Game.fireCache`: asked on every way that is planned). */
export function fires(g: Game): number[] {
  if (!g.fireCache) {
    g.fireCache = [];
    for (const n of g.nodes) if (burning(n)) g.fireCache.push(n.id);
  }
  return g.fireCache;
}

/** What a way through this place costs on top of its length (see `pathAvoiding`). */
export function fireCost(g: Game, nodeId: number): number {
  return fires(g).includes(nodeId) ? FIRE_COST : 0;
}

/** Does the way from `a` to `b` lead into a burning star (even where it goes round every one it can)? */
export function fireOnWay(g: Game, a: number, b: number): GNode | null {
  const f = fires(g);
  if (!f.length || a < 0 || b < 0 || a === b) return null;
  for (const id of g.pathTo(a, b)) if (f.includes(id)) return g.nodes[id];
  return null;
}

/** The star of a place's system. */
export function starOf(g: Game, n: GNode): GNode | null {
  if (n.kind === 'star') return n;
  return g.nodes.find((x) => x.kind === 'star' && x.system === n.system) ?? null;
}

/** Every armed Starfall, the one nearest its end first. */
export function armed(g: Game): Unit[] {
  const out: Unit[] = [];
  for (const u of g.unitList) if (u.type === 'starfall' && !u.dead && u.fuse !== undefined) out.push(u);
  return out.sort((a, b) => a.fuse! - b.fuse! || a.id - b.id);
}

/** The armed Starfall at a star (the one nearest its end), if there is one. */
export function armedAt(g: Game, n: GNode): Unit | null {
  let best: Unit | null = null;
  for (const u of g.buckets[n.id]) if (u.type === 'starfall' && !u.dead && u.fuse !== undefined && (!best || u.fuse < best.fuse!)) best = u;
  return best;
}

/** A house's Starfall, built and not yet gone (it has one at a time). */
export function starfallOf(g: Game, fid: number): Unit | null {
  for (const u of g.unitList) if (u.type === 'starfall' && !u.dead && u.owner === fid) return u;
  return null;
}

/** What the house's next Starfall costs: each one more than the last. */
export function starfallCost(g: Game, f: Faction): number {
  return g.shipCost(f, 'starfall') + STARFALL_STEP * (f.starfalls ?? 0);
}

/** Seconds a Starfall takes to build, for the words of a button. */
export const STARFALL_BUILD = UNITS.starfall.buildTime;
