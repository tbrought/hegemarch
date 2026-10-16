/**
 * The rival houses play in the fog of war, as the player does (1.24, a playtest of 1.23: "they know
 * things that they don't have any eyes on"): a fleet's orders are not to be seen, only the starlane it is
 * on; and what a house knows of a place is what it sees there, or what it last saw, trusted less with age.
 */
import { describe, expect, it } from 'vitest';
import { remember, seenIncoming, strengthAt } from '../src/game/ai/ai';
import type { Game } from '../src/game/Game';
import { mk } from './helpers';

/** A game in which nobody moves but the test. */
function quiet(seed = 4242): Game {
  const g = mk({ seed, size: 'medium' });
  for (const f of g.factions) if (f.kind === 'empire' && !f.isPlayer) f.ai!.nextThink = 1e9;
  return g;
}
const step = (g: Game, n = 1) => {
  for (let i = 0; i < n; i++) {
    g.step();
    g.fx.length = 0;
  }
};

describe('a fleet is seen coming by the starlane it is on, not by where it was sent', () => {
  it('ordered at a rival Hearth from three jumps off, in its sight: no warning until it is on the last lane in', () => {
    for (const seed of [4242, 77, 913]) {
      const g = quiet(seed);
      const r = g.factions.find((f) => f.kind === 'empire' && !f.isPlayer)!;
      const T = r.capital;
      // A place the rival can see (next to a world of its own) that is three jumps or more from its Hearth.
      const own = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, T) >= 4)!;
      own.owner = r.id;
      g.refreshWorld(own);
      const from = own.lanes.find((id) => g.hops(id, T) >= 3)!;
      expect(from, `seed ${seed}`).toBeDefined();
      const ship = g.spawnUnit('dreadnought', g.playerId, from);
      step(g, 25);
      expect(r.visible[from], `seed ${seed}: the rival sees the fleet`).toBe(1);
      g.cmdMove(g.playerId, [ship.id], T);
      // On its way, three jumps off and more: the order is not to be read.
      let warned = -1;
      let lastLane = -1;
      for (let i = 0; i < 20 * 240 && !ship.dead && ship.node !== T; i++) {
        step(g);
        const seen = seenIncoming(g, r).get(T) ?? 0;
        if (ship.lane?.to === T && lastLane < 0) lastLane = i;
        if (seen > 0 && warned < 0) warned = i;
      }
      expect(lastLane, `seed ${seed}: it reached the last lane`).toBeGreaterThan(0);
      // (Warned the moment it is on the lane into the Hearth, and not a moment before.)
      expect(warned, `seed ${seed}`).toBe(lastLane);
    }
  });
});

describe('what a house knows of a place: what it sees, or what it last saw, trusted less with age', () => {
  it('sees what is there; remembers it when it no longer sees it, at half after five minutes; knows nothing of a place it never saw', () => {
    const g = quiet();
    const r = g.factions.find((f) => f.kind === 'empire' && !f.isPlayer)!;
    // A place next to the rival's Hearth (in its sight), with ships of the player's at it.
    const at = g.nodes[r.capital].lanes[0];
    for (let i = 0; i < 4; i++) g.spawnUnit('striker', g.playerId, at);
    step(g);
    const there = g.hostilePowerAt(at, r.id);
    expect(there).toBeGreaterThan(0);
    expect(r.visible[at]).toBe(1);
    expect(strengthAt(g, r, at)).toBeCloseTo(there, 6);
    remember(g, r);
    // Out of its sight: what it saw, then less and less, never below half.
    r.visible[at] = 0;
    expect(strengthAt(g, r, at)).toBeCloseTo(there, 0);
    g.time += 300;
    expect(strengthAt(g, r, at)).toBeLessThan(there);
    g.time += 3000;
    expect(strengthAt(g, r, at)).toBeCloseTo(there * 0.5, 0);
    // A place it has never seen, with a fleet of the player's at it: nothing, as far as it knows.
    const far = g.nodes.find((n) => !r.explored[n.id] && n.kind === 'planet')!;
    for (let i = 0; i < 4; i++) g.spawnUnit('striker', g.playerId, far.id);
    expect(g.hostilePowerAt(far.id, r.id)).toBeGreaterThan(0);
    expect(strengthAt(g, r, far.id)).toBe(0);
  });

  it('what it remembers is kept in a save', () => {
    const g = quiet();
    const r = g.factions.find((f) => f.kind === 'empire' && !f.isPlayer)!;
    step(g, 40);
    remember(g, r);
    const back = (g.constructor as unknown as { load: (d: unknown) => Game }).load(JSON.parse(JSON.stringify(g.serialize())));
    expect(back.factions[r.id].ai!.memory).toEqual(r.ai!.memory);
  });
});
