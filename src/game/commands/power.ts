/**
 * The House Powers (1.27): each house's own move (`HeirDef.power`, data/abilities.ts), cast by its Ark when
 * the house orders it, and by nothing else. One order for all of them, `cmdPower(fid, target)`: the player
 * gives it from the power's button or with D (ui/Actions.ts), the rival houses from ai.ts, and a Daily
 * keeps it with its other orders. What each power does is here; how it is seen, render/abilityLooks.ts.
 *
 * - Dawn (Solar Concord): every dark world one starlane from the Ark is kindled at once, and the guards there
 *   burn; only a world that another house's warships (or the Corsairs, or the Hollow) hold is passed over.
 * - Call to Arms (Vael Imperium): the Forges nearest the Ark each send it three warships, for a while.
 * - Wayfinder (Wayfarer Clans): a new starlane from the Ark's world to a world within reach, for good.
 * - Mind Theft (Lyceum Collective): the Ark learns a Boon of a rival Ark at its world.
 * - Conversion (Choir of the First Flame): the weakest enemy ships in reach go over to the Choir.
 * - Fate's Wager (Ashen Remnant): a coin, thrown over the Ark's world; heads burns every enemy warship
 *   there, tails the Ark. It lands `WAGER_TIME` later (`powersTick`).
 */

import { ABILITY_BY_ID, LEVY_SHIPS, LEVY_TIME, LEVY_WORLDS, WAGER_TIME, WAYFINDER_REACH, castWords, type AbilityDef } from '../data/abilities';
import { CARD_BY_ID } from '../data/cards';
import { HEIR_BY_ID } from '../data/heirs';
import { fights, UNITS } from '../data/units';
import type { Game } from '../Game';
import { conversionTargets } from '../systems/abilities';
import type { Faction, GNode, QueueCheck, Rarity, Unit } from '../types';
import { dist, possessive, segDist } from '../util';
import { isForge } from '../worldStats';

/** The reasons the UI tells apart: a power that waits for its world to be chosen (Wayfinder) is aimed, not refused. */
export const POWER_WHY = {
  aim: 'Choose a world for the starlane',
} as const;

/** A house's power, or null (the Corsairs, the guardians and the Hollow have none). */
export function powerOf(f: Faction): AbilityDef | null {
  if (f.kind !== 'empire') return null;
  const id = HEIR_BY_ID[f.heir]?.power;
  return (id && ABILITY_BY_ID[id]) || null;
}

/** "1:05": how long until a power is back, as its button says it. */
export function powerClock(s: number): string {
  // (A hair under the second is that second: 59.000001 seconds left is "0:59".)
  const t = Math.max(1, Math.ceil(s - 1e-6));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** The house's Ark, if it is there to cast (built, and not destroyed). */
function arkOf(g: Game, f: Faction): Unit | null {
  const u = f.ark >= 0 ? g.units.get(f.ark) : undefined;
  return u && !u.dead ? u : null;
}

/**
 * Why the house cannot cast its power now, whatever it would be cast at: the Ark and the time. Null when it
 * can (what it would find to do is `checkPower`'s).
 */
export function powerReady(g: Game, fid: number): QueueCheck {
  const f = g.factions[fid];
  if (!f || !powerOf(f)) return 'This house has no power';
  if (g.cradle) return 'Cast by the Ark, which is raised in the Space Age';
  if (g.outcome) return 'The run is over';
  if (g.asleep(fid)) return 'Your house has not arrived yet';
  const ark = arkOf(g, f);
  if (!ark) return 'Your Ark is lost: rebuild it at your Hearth';
  if (f.wager) return 'The coin is in the air';
  if (f.powerCd > 0) return `Ready in ${powerClock(f.powerCd)}`;
  if (ark.lane || ark.node < 0) return 'Your Ark is between worlds';
  if (ark.stun > 0) return 'Your Ark is stunned';
  return null;
}

/** Why the house cannot cast its power now (at `target`, a world, for Wayfinder), or null when it can. */
export function checkPower(g: Game, fid: number, target = -1): QueueCheck {
  const why = powerReady(g, fid);
  if (why) return why;
  const f = g.factions[fid];
  const ark = arkOf(g, f)!;
  switch (powerOf(f)!.id) {
    case 'dawn':
      if (dawnWorlds(g, f, ark).length) return null;
      return darkBeside(g, ark).length ? 'Enemy warships hold every dark world one starlane from your Ark' : 'No dark world one starlane from your Ark';
    case 'callarms':
      return levyWorlds(g, f, ark).length ? null : 'No Forge to send ships';
    case 'wayfinder':
      if (target < 0) return wayTargets(g, f, ark).length ? POWER_WHY.aim : 'No world within reach for a new starlane';
      return wayWhy(g, f, ark, target);
    case 'mindtheft': {
      const rival = rivalArk(g, f, ark);
      if (!rival) return 'No rival Ark at your Ark\'s world';
      return stealable(g, f, g.factions[rival.owner]).length ? null : 'It knows no Boon your house could learn';
    }
    case 'conversion':
      return conversionTargets(g, ark).length ? null : 'No enemy ship in reach that would turn';
    case 'wager':
      return burnable(g, f, ark.node).length ? null : 'No enemy warship at your Ark\'s world';
  }
  return 'This house has no power';
}

/**
 * Cast the house's power (at `target`, a world, for Wayfinder). False if it cannot (`checkPower`). It comes
 * back after its time, for the house: an Ark rebuilt does not bring it back sooner.
 */
export function cmdPower(g: Game, fid: number, target = -1): boolean {
  if (checkPower(g, fid, target)) return false;
  const f = g.factions[fid];
  const def = powerOf(f)!;
  const ark = arkOf(g, f)!;
  const cast = castPower(g, f, def, ark, target);
  f.powerCd = def.cd;
  // (Seen and heard as every cast is: who, what, on whom; and, for a power, the places it reached.)
  if (g.fxEnabled) {
    g.fx.push({
      k: 'ability', x: ark.x, y: ark.y, r: Math.min(def.range, 700), color: def.color, node: ark.node, id: def.id,
      by: ark.id, size: UNITS[ark.type].radius, house: f.color, on: cast.on, says: cast.says ?? castWords(def, cast.n ?? cast.on.length),
      at: cast.at, heads: cast.heads,
    });
  }
  return true;
}

interface Cast {
  /** The ships it touched. */
  on: number[];
  /** The places it reached: Dawn's worlds, the Forges of a Call to Arms, the far end of a Wayfinder's starlane. */
  at?: number[];
  /** How many it did, if not as many as it touched ("DAWN · 3 KINDLED"). */
  n?: number;
  /** What it says over the Ark, if not its own words (a Mind Theft says what it learned). */
  says?: string;
  /** A Fate's Wager: how the coin will land. */
  heads?: boolean;
}

function castPower(g: Game, f: Faction, def: AbilityDef, ark: Unit, target: number): Cast {
  switch (def.id) {
    case 'dawn': {
      const worlds = dawnWorlds(g, f, ark);
      let burned = 0;
      for (const n of worlds) {
        // (Its guards first: the world is the house's when the light reaches it, and nothing stands in it.)
        for (const u of dawnGuards(g, n)) {
          g.killUnit(u, f.id);
          burned++;
        }
        g.kindleWorld(n, f.id, true);
      }
      const guards = burned ? `, and ${burned} ${burned === 1 ? 'guard burns' : 'guards burn'}` : '';
      g.notify(f.id, `Dawn: ${names(worlds)} ${worlds.length > 1 ? 'are' : 'is'} kindled at once${guards}.`, 'good', ark.node);
      return { on: [], at: worlds.map((n) => n.id), n: worlds.length };
    }
    case 'callarms': {
      const on: number[] = [];
      const from = levyWorlds(g, f, ark);
      for (const n of from) {
        const ids: number[] = [];
        for (const t of LEVY_SHIPS) ids.push(g.spawnUnit(t, f.id, n.id, { temp: LEVY_TIME }).id);
        // (Those raised where the Ark is stay with it; the others make for it at once.)
        if (n.id !== ark.node) g.cmdMove(f.id, ids, ark.node);
        on.push(...ids);
      }
      g.notify(f.id, `Call to Arms: ${on.length} warships make for your Ark at ${g.nodes[ark.node].name}. They serve for ${LEVY_TIME / 60} minutes.`, 'good', ark.node);
      return { on, at: from.map((n) => n.id) };
    }
    case 'wayfinder': {
      const to = g.nodes[target];
      g.addLane(ark.node, target, f.id);
      g.notify(f.id, `Wayfinder: a new starlane joins ${g.nodes[ark.node].name} to ${to.name}. Any house can use it.`, 'good', ark.node);
      // (A starlane cut to a world of another house's is a door into it: that house is told where.)
      for (const id of [ark.node, target]) {
        const o = g.nodes[id].owner;
        if (o >= 0 && o !== f.id && g.factions[o].kind === 'empire') {
          g.notify(o, `${f.name} cut a new starlane to ${g.nodes[id].name}!`, 'alert', id);
        }
      }
      return { on: [], at: [target] };
    }
    case 'mindtheft': {
      const rival = rivalArk(g, f, ark)!;
      const owner = g.factions[rival.owner];
      const id = pickStolen(g, stealable(g, f, owner));
      const name = CARD_BY_ID[id].name;
      g.addCard(f, id);
      g.notify(f.id, `Mind Theft: your Ark read ${possessive(owner.name)} Ark and learned ${name}.`, 'good', ark.node);
      g.notify(owner.id, `${f.name} read your Ark and learned ${name}.`, 'bad', ark.node);
      return { on: [rival.id], says: `LEARNED ${name.toUpperCase()}` };
    }
    case 'conversion': {
      const turned = conversionTargets(g, ark);
      g.convertUnits(turned, f.id, ark);
      return { on: turned.map((u) => u.id) };
    }
    case 'wager': {
      // (How it lands is drawn now, as it is thrown: the order of the game's draws is the order it was cast in.)
      const heads = g.rng.chance(0.5);
      f.wager = { node: ark.node, at: g.time + WAGER_TIME, heads };
      return { on: burnable(g, f, ark.node).map((u) => u.id), heads };
    }
  }
  return { on: [] };
}

/** Every tick: the houses' powers come back, and a coin in the air lands. */
export function powersTick(g: Game, dt: number) {
  for (const f of g.factions) {
    if (f.powerCd > 0) f.powerCd = Math.max(0, f.powerCd - dt);
    if (f.wager && g.time >= f.wager.at) land(g, f);
  }
}

/** A Fate's Wager lands: heads, every enemy warship at its world burns; tails, the Ark does. */
function land(g: Game, f: Faction) {
  const w = f.wager!;
  delete f.wager;
  const n = g.nodes[w.node];
  if (w.heads) {
    const burned = burnable(g, f, w.node);
    for (const u of burned) g.killUnit(u, f.id);
    g.notify(f.id, `Fate's Wager: heads. ${burned.length} enemy ${burned.length === 1 ? 'warship' : 'warships'} turned to ash at ${n.name}.`, 'good', w.node);
  } else {
    const ark = arkOf(g, f);
    if (ark) g.killUnit(ark, -1);
    g.notify(f.id, `Fate's Wager: tails. Your Ark burns at ${n.name}.`, 'bad', w.node);
  }
  if (g.fxEnabled) g.fx.push({ k: 'text', x: n.x, y: n.y - n.r - 30, text: w.heads ? 'HEADS' : 'TAILS', color: w.heads ? f.color : '#e0402f', node: w.node });
}

// ---- What each power finds to do ----

/** The dark worlds one starlane from the Ark. */
function darkBeside(g: Game, ark: Unit): GNode[] {
  return g.neighbours(ark.node)
    .map((id) => g.nodes[id])
    .filter((n) => n.kind === 'planet' && n.owner < 0);
}

/**
 * Dawn: the dark worlds one starlane from the Ark, but one that another house's warships (or the Corsairs, or
 * the Hollow) hold. Guards do not hold a world against it: they burn (1.27; until then a guarded world was passed
 * over too, and by the fourth minute of a game every dark world left had a guard, so a Dawn lit two at most).
 */
export function dawnWorlds(g: Game, f: Faction, ark: Unit): GNode[] {
  return darkBeside(g, ark).filter((n) => !g.buckets[n.id].some((u) => !u.dead && u.owner !== g.guardianId && g.hostile(u.owner, f.id) && fights(u.type)));
}

/** The guards at a dark world, which a Dawn that lights it burns. */
export function dawnGuards(g: Game, n: GNode): Unit[] {
  return g.buckets[n.id].filter((u) => !u.dead && u.owner === g.guardianId);
}

/** Call to Arms: the worlds of the house that build ships (its Hearth and Forges), the nearest to the Ark first. */
export function levyWorlds(g: Game, f: Faction, ark: Unit): GNode[] {
  return g.nodes
    .filter((n) => n.owner === f.id && isForge(n))
    .sort((a, b) => g.pathLen(a.id, ark.node) - g.pathLen(b.id, ark.node) || a.id - b.id)
    .slice(0, LEVY_WORLDS);
}

/** Wayfinder: why a new starlane cannot be cut from the Ark's world to `target`, or null when it can. */
export function wayWhy(g: Game, f: Faction, ark: Unit, target: number): QueueCheck {
  const to = g.nodeAt(target);
  const from = g.nodes[ark.node];
  if (!to || to.id === from.id) return 'Choose another world';
  if (!f.explored[to.id]) return 'Not yet charted';
  if (to.kind === 'rift') return 'The Rift lets no starlane in';
  if (g.neighbours(from.id).includes(to.id)) return 'A starlane joins them already';
  const d = dist(from.x, from.y, to.x, to.y);
  if (d > WAYFINDER_REACH) return 'Too far for a starlane';
  // (A starlane does not pass through a place on its way: it would seem to stop there.)
  for (const o of g.nodes) {
    if (o.id === from.id || o.id === to.id) continue;
    if (segDist(o.x, o.y, from.x, from.y, to.x, to.y) < o.well * 0.6) return `${o.name} is in the way`;
  }
  return null;
}

/** Wayfinder: every world a new starlane could be cut to now. */
export function wayTargets(g: Game, f: Faction, ark: Unit): number[] {
  const out: number[] = [];
  for (const n of g.nodes) if (!wayWhy(g, f, ark, n.id)) out.push(n.id);
  return out;
}

/** Mind Theft: the Ark of a rival house at the Ark's world, the one with the most to learn from first. */
export function rivalArk(g: Game, f: Faction, ark: Unit): Unit | null {
  let best: Unit | null = null;
  let most = -1;
  for (const u of g.buckets[ark.node]) {
    if (u.dead || u.type !== 'ark' || u.owner === f.id || u.lane) continue;
    const o = g.factions[u.owner];
    if (o.kind !== 'empire') continue;
    const n = stealable(g, f, o).length;
    if (n > most || (n === most && best && u.id < best.id)) {
      best = u;
      most = n;
    }
  }
  return best;
}

/** The Boons of `from` that `f` could learn: not one it holds as often as it can, no Pact, none of the cradle. */
export function stealable(g: Game, f: Faction, from: Faction): string[] {
  const out: string[] = [];
  for (const id of new Set(from.cards)) {
    const c = CARD_BY_ID[id];
    if (!c || c.pact || c.cradle || g.cardCount(f, id) >= c.max) continue;
    if (c.requires && !g.cardCount(f, c.requires)) continue;
    out.push(id);
  }
  return out.sort();
}

const RARITY: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** The rarest of them, one drawn among the rarest if there are several. */
function pickStolen(g: Game, ids: string[]): string {
  const top = Math.max(...ids.map((id) => RARITY[CARD_BY_ID[id].rarity]));
  return g.rng.pick(ids.filter((id) => RARITY[CARD_BY_ID[id].rarity] === top));
}

/** Fate's Wager: the enemy warships at a world it would burn (never an Ark, a Dreadnought or the Hollow; nothing that stands still). */
export function burnable(g: Game, f: Faction, node: number): Unit[] {
  return g.buckets[node].filter((u) => {
    if (u.dead || u.lane || !g.hostile(f.id, u.owner)) return false;
    const d = UNITS[u.type];
    return !d.isStatic && d.role !== 'capital' && d.role !== 'fighter' && g.factions[u.owner].kind !== 'crisis';
  });
}

/** "Aurelia II, Aurelia III and Mira IV". */
function names(ns: GNode[]): string {
  const l = ns.map((n) => n.name);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : (l[0] ?? '');
}
