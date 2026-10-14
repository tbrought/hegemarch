import type { Game } from '../Game';
import { ECON } from '../data/worlds';
import { STARFALL_BURN, STARFALL_FIRE } from '../starfall';
import type { GNode } from '../types';

/** The fuses of armed Starfalls run down; at the end of one, its star erupts. */
export function starfallTick(g: Game, dt: number) {
  for (const u of g.unitList) {
    if (u.type !== 'starfall' || u.dead || u.fuse === undefined) continue;
    u.fuse -= dt;
    if (u.fuse > 0) continue;
    // (Asked for after everything else this tick has been done: an eruption ends many things at once.)
    const star = g.nodes[u.node];
    const by = u.owner;
    g.deferred.push(() => erupt(g, star, by));
    u.fuse = 0;
  }
}

/**
 * A star erupts. Every ship at a place of its system is destroyed, whoever it belongs to (the house
 * that did it too), with the structures: Starbases, a Starfire Gate, the Corsairs' Stronghold. Ships on
 * a starlane are at no place, and fly on. Every world of a house there is scorched: its shields are
 * gone, it loses a level, and its Glow is back where a new world's is. Its hull is not touched, so no
 * world changes hands and no Hearth falls: a Starfall wins no Destiny by itself, which is also why the
 * Rift Heart is not harmed. Then the star burns.
 */
export function erupt(g: Game, star: GNode, by: number) {
  if (star.hazard?.by !== undefined) return; // (two Starfalls at one star: the first eruption took the second)
  const armer = g.factions[by];
  const places = g.nodes.filter((n) => n.system === star.system);
  let ships = 0;
  /** The ships it took, by the house they were of. */
  const taken = new Map<number, number>();
  for (const n of places) {
    for (const u of [...g.buckets[n.id]]) {
      if (u.dead || u.type === 'heart' || g.asleep(u.owner)) continue;
      if (u.type !== 'fighter' && u.type !== 'starfall' && !u.temp) {
        ships++;
        taken.set(u.owner, (taken.get(u.owner) ?? 0) + 1);
      }
      g.killUnit(u, by);
    }
  }
  let worlds = 0;
  let mine = 0;
  for (const n of places) {
    if (n.kind !== 'planet' || n.owner < 0 || g.asleep(n.owner)) continue;
    worlds++;
    if (n.owner === g.playerId) mine++;
    if (n.level > 1) g.setLevel(n, n.level - 1);
    n.glow = ECON.glowStart;
    n.sh = 0;
    n.lastHit = 0;
    n.lastHitBy = by;
    if (g.fxEnabled) {
      g.fx.push({ k: 'ring', x: n.x, y: n.y, r: n.r + 60, color: '#ff8a1f', node: n.id });
      g.fx.push({ k: 'text', x: n.x, y: n.y - n.r - 26, text: 'SCORCHED', color: '#ff8a1f', node: n.id });
    }
  }
  star.hazard = { warn: 0, t: STARFALL_BURN, dps: STARFALL_FIRE, by };
  g.fireCache = null;
  // What it took stands over the star for a few seconds, for every house to read (as the eruption is seen by all).
  const toll = `${ships} SHIP${ships === 1 ? '' : 'S'} · ${worlds} WORLD${worlds === 1 ? '' : 'S'}`;
  if (g.fxEnabled) g.fx.push({ k: 'nova', x: star.x, y: star.y, node: star.id, color: armer.color, toll });
  // (Whose they were: the most first; the player's own are "yours".)
  const whose = [...taken].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([fid, k]) => `${g.factions[fid].isPlayer ? 'yours' : g.shortName(g.factions[fid])} ${k}`);
  g.notify(-1, `${star.name} erupts! ${armer.isPlayer ? 'Your Starfall' : `The Starfall of ${g.shortName(armer)}`} took ${ships} ship${ships === 1 ? '' : 's'}` +
      `${whose.length ? ` (${whose.join(', ')})` : ''} and scorched ${worlds} world${worlds === 1 ? '' : 's'}. The star burns for ${STARFALL_BURN / 60} minutes.`,
      armer.isPlayer ? 'good' : 'alert', star.id);
  if (mine) g.notify(g.playerId, `${mine} of your worlds at ${star.name} ${mine === 1 ? 'is' : 'are'} scorched: no shields, a level lost, the Glow of a new world.`, 'bad', star.id);
}
