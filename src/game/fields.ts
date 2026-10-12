/**
 * Anti-warp fields. A Bastion, a Hearth and a world with a Starbase keep one up: enemy ships there take
 * longer to jump away. A Bastion's field also reaches every place one jump from it, and the Bastion
 * protects the worlds of its house among them, which take less damage while it stands.
 */

import { FIELD_GUARD } from './constants';
import type { GNode } from './types';
import { clamp } from './util';
import type { Game } from './Game';

/** A Bastion's field reaching a place next to it: `from` is the Bastion, `to` the place one jump away. */
export interface FieldReach {
  owner: number;
  from: number;
  to: number;
}

export interface FieldState {
  tick: number;
  sig: number;
  nodes: GNode[];
  reaches: FieldReach[];
  /** For each place a field holds: the houses that hold it. */
  over: Map<number, number[]>;
  /** For each place a Bastion's field reaches from next door: those Bastions. */
  from: Map<number, number[]>;
  /** For each world that is protected: the Bastions that protect it. */
  guards: Map<number, number[]>;
}

const NO_FIELDS: number[] = [];

/**
 * Does this world keep an anti-warp field up? A Bastion does, a Hearth does (it does every role), and
 * so does any world with a Starbase. It is how a house makes raiders stand and fight: without one,
 * any fleet can jump away from any fight in a few seconds, and wars turn into chases.
 */
export function fieldAt(g: Game, n: GNode): boolean {
  if (n.kind !== 'planet' || n.owner < 0 || g.factions[n.owner].kind !== 'empire') return false;
  if (g.hasRole(n, 'bastion')) return true;
  for (const u of g.buckets[n.id]) if (u.type === 'starbase' && u.owner === n.owner && !u.dead) return true;
  return false;
}

/**
 * Does this world's field reach beyond it? A Bastion's does: it holds every place one jump away as
 * well as its own, and protects the worlds of its house among them. A Hearth's field and a Starbase's
 * hold their own world only, and so does a Bastion in the cradle.
 */
export function isBastion(g: Game, n: GNode): boolean {
  return !g.cradle && n.capitalOf < 0 && n.owner >= 0 && g.hasRole(n, 'bastion') && g.factions[n.owner].kind === 'empire';
}

/**
 * Where the Bastions' fields reach: one entry for every place one jump from a Bastion. The rule is
 * the one a player reads off the map: a Bastion covers its own world and its neighbours, at every
 * level, with nothing else needed. (1.11 gave one Bastion its system's star at level II and the
 * whole system at level III: one world did it all, and no second Bastion was ever worth its role.
 * 1.13 had fields link between two strongholds within two or three jumps: a Bastion alone did
 * nothing past its own world, and the player who made one looked at the map and asked whether it
 * was broken.)
 */
export function fieldReaches(g: Game): FieldReach[] {
  return fields(g).reaches;
}

/** The Bastions whose field reaches a place from next door. */
export function fieldsFrom(g: Game, n: GNode): number[] {
  return fields(g).from.get(n.id) ?? NO_FIELDS;
}

/**
 * The Bastions that protect a world: those of its house one jump from it. While one of them stands
 * the world takes less damage (`guardOf`, `damagePlanet`). A Bastion protects its neighbours, not
 * itself: next to a Hearth it is the way in, and two Bastions next to each other protect each other.
 */
export function guardsOf(g: Game, n: GNode): number[] {
  return fields(g).guards.get(n.id) ?? NO_FIELDS;
}

/** How much less damage a world takes for the Bastions that protect it (`FIELD_GUARD`): the strongest counts. */
export function guardOf(g: Game, n: GNode): number {
  let best = 0;
  for (const id of g.guardsOf(n)) best = Math.max(best, FIELD_GUARD[clamp(g.nodes[id].level, 1, 3)]);
  return best;
}

/** The worlds a Bastion protects (the other way round). */
export function guardedBy(g: Game, n: GNode): number[] {
  const out: number[] = [];
  for (const [id, list] of fields(g).guards) if (list.includes(n.id)) out.push(id);
  return out;
}

/** The houses whose anti-warp fields hold a place: its own world's field, and a Bastion's from next door. */
export function fieldsOver(g: Game, n: GNode): number[] {
  return fields(g).over.get(n.id) ?? NO_FIELDS;
}

/**
 * Fields as they stand. Worked out again whenever what they come from has changed (`fieldSig`: a
 * world's house, role or level, a Starbase built or lost), so the map shows a field the moment a
 * paused player makes a Bastion; and forgotten at the end of every tick, so a game that was saved and
 * one that went on always work them out from the same state.
 */
function fields(g: Game): FieldState {
  const sig = fieldSig(g);
  const c = g.fieldCache;
  if (c && c.tick === g.tick && c.sig === sig && c.nodes === g.nodes) return c;
  const reaches: FieldReach[] = [];
  const over = new Map<number, number[]>();
  const from = new Map<number, number[]>();
  const guards = new Map<number, number[]>();
  const add = (m: Map<number, number[]>, id: number, v: number) => {
    const l = m.get(id);
    if (!l) m.set(id, [v]);
    else if (!l.includes(v)) l.push(v);
  };
  for (const n of g.nodes) {
    if (!g.fieldAt(n)) continue;
    add(over, n.id, n.owner);
    if (!g.isBastion(n)) continue;
    for (const id of g.neighbours(n.id)) {
      const o = g.nodes[id];
      reaches.push({ owner: n.owner, from: n.id, to: id });
      add(over, id, n.owner);
      add(from, id, n.id);
      if (o.kind === 'planet' && o.owner === n.owner) add(guards, id, n.id);
    }
  }
  g.fieldCache = { tick: g.tick, sig, nodes: g.nodes, reaches, over, from, guards };
  return g.fieldCache;
}

/** A number that changes when anything a field depends on does. */
function fieldSig(g: Game): number {
  let h = g.fieldEpoch;
  for (const n of g.nodes) {
    if (n.kind !== 'planet' || n.owner < 0) continue;
    h = (Math.imul(h, 31) + n.id * 97 + n.owner * 13 + n.level * 5 + (n.role === 'bastion' ? 3 : 0) + (n.retool > 0 ? 1 : 0)) | 0;
  }
  return h;
}
