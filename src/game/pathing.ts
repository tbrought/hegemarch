/**
 * Ways through the sector: the way a fleet takes from one place to another, the way round a place that
 * is known to be dangerous, and what a house knows of the dangers on it.
 */

import type { Faction } from './types';
import type { Game } from './Game';

/** Has this house seen that place to be guarded (by anything that would fire on its ships)? */
export function seenGuarded(g: Game, f: Faction, nodeId: number): boolean {
  return !!f.explored[nodeId] && g.hostilePowerAt(nodeId, f.id) > 1;
}

/**
 * A way from `from` to `to` on which nothing is guarded as far as the house has seen (the last
 * stop itself may be anything: it is the place to find out about). Empty if there is none.
 */
export function safeWay(g: Game, f: Faction, from: number, to: number): number[] {
  const way = g.pathAvoiding(from, to, (id) => (g.seenGuarded(f, id) ? 1e7 : 0));
  return way.length && !way.slice(0, -1).some((id) => g.seenGuarded(f, id)) ? way : [];
}

/** How many places the house has not charted and a Scout could reach safely from its Hearth. */
export function chartable(g: Game, fid: number): number {
  const f = g.factions[fid];
  if (!f || f.capital < 0) return 0;
  let n = 0;
  for (const node of g.nodes) if (!f.explored[node.id] && g.safeWay(f, f.capital, node.id).length) n++;
  return n;
}

/** How long a way is: the jumps from `from` through `way`, each with its spool (as `pathLen` counts them). */
export function wayLen(g: Game, from: number, way: number[]): number {
  let d = 0;
  let at = from;
  for (const to of way) {
    d += g.pathLen(at, to);
    at = to;
  }
  return d;
}

/**
 * The way from `a` to `b` (the places to jump to, in order) that keeps clear of trouble: every place
 * on the way counts as `extra(place)` further than it is, so the way goes round a place with a high
 * cost when there is another way, and through it when there is none. The ends themselves are free.
 */
export function pathAvoiding(g: Game, a: number, b: number, extra: (nodeId: number) => number): number[] {
  const N = g.nodes.length;
  if (a === b || a < 0 || b < 0) return [];
  const pen = new Float64Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    if (i === a || i === b) continue;
    pen[i] = Math.max(0, extra(i));
    if (pen[i] > 0) any = true;
  }
  if (!any) return g.pathTo(a, b);
  const far = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  far[a] = 0;
  for (let it = 0; it < N; it++) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      if (!done[i] && far[i] < best) {
        best = far[i];
        cur = i;
      }
    }
    if (cur < 0 || cur === b) break;
    done[cur] = 1;
    for (const l of g.lanes) {
      const o = l.a === cur ? l.b : l.b === cur ? l.a : -1;
      if (o < 0 || done[o]) continue;
      // (A jump costs its length and its spool, as in the sector's own table of ways.)
      const d = best + l.len + 900 + pen[o];
      if (d < far[o]) {
        far[o] = d;
        prev[o] = cur;
      }
    }
  }
  if (!isFinite(far[b])) return [];
  const out: number[] = [];
  for (let cur = b; cur !== a && cur >= 0; cur = prev[cur]) out.push(cur);
  return out.reverse();
}

export function pathTo(g: Game, a: number, b: number): number[] {
  const out: number[] = [];
  const N = g.nodes.length;
  let cur = a;
  let guard = 0;
  while (cur !== b && guard++ < N + 2) {
    const nx = g.pathNext[cur * N + b];
    if (nx < 0) return [];
    out.push(nx);
    cur = nx;
  }
  return out;
}

/**
 * Is a place dangerous to pass through, as far as the house knows? Enemy ships or guns it sees there
 * now; a world it last saw held by a house it is at war with (guns, maybe an anti-warp field); or,
 * charted and out of sight, a place guarded by monsters or Corsairs, who stay where they are. (Rival
 * fleets out of sight are not known: they may have gone, or come.)
 */
export function dangerKnown(g: Game, fid: number, id: number): boolean {
  const f = g.factions[fid];
  if (f.visible[id]) return g.hostilePowerAt(id, fid) > 0.5;
  if (!f.explored[id]) return false;
  const owner = f.seenOwner[id];
  if (owner >= 0 && owner !== fid && g.hostile(fid, owner)) return true;
  return g.buckets[id].some((u) => !u.dead && g.factions[u.owner].kind !== 'empire' && g.hostile(fid, u.owner));
}
