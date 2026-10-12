/** Orders to fleets: the way a fleet takes, the way round a known danger, and stops on the way. */
import { describe, expect, it } from 'vitest';
import { TICK } from '../src/game/constants';
import { mk, run } from './helpers';

describe("a fleet's way (the third playtest)", () => {
  /** The player's warships at the Hearth, and two places: one next door, and one beyond it. */
  function setup() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const ships = [0, 1, 2].map(() => g.spawnUnit('striker', p.id, p.capital));
    const next = g.nodes.find((n) => g.hops(n.id, p.capital) === 1 && n.kind === 'star')!;
    const beyond = g.nodes.find((n) => g.hops(n.id, next.id) === 2 && g.hops(n.id, p.capital) === 3)!;
    return { g, p, ships, next, beyond };
  }

  it('Shift adds a stop: the way there comes after the way the ships have, and their drives go on charging', () => {
    const { g, p, ships, next, beyond } = setup();
    const ids = ships.map((u) => u.id);
    g.cmdMove(p.id, ids, next.id);
    run(g, 1);
    const charge = ships[0].charge;
    expect(charge).toBeGreaterThan(0);
    g.cmdMove(p.id, ids, beyond.id, undefined, undefined, undefined, true);
    for (const u of ships) {
      expect(u.dest).toBe(beyond.id);
      expect(u.path).toEqual([...g.pathTo(p.capital, next.id), ...g.pathTo(next.id, beyond.id)]);
    }
    expect(ships[0].charge).toBe(charge);
    // They go by way of the stop, and on to the end.
    let passed = false;
    for (let t = 0; t < 240 / TICK && ships[0].node !== beyond.id; t++) {
      g.step();
      g.fx.length = 0;
      if (ships[0].node === next.id) passed = true;
    }
    expect(passed).toBe(true);
    expect(ships[0].node).toBe(beyond.id);
  });

  it('a ship that is not on its way anywhere simply goes', () => {
    const { g, p, ships, beyond } = setup();
    g.cmdMove(p.id, [ships[0].id], beyond.id, undefined, undefined, undefined, true);
    expect(ships[0].path).toEqual(g.pathTo(p.capital, beyond.id));
  });

  it('danger on the way is what the house knows: seen enemies and rival worlds, not fleets out of sight', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const seen = g.nodes.find((n) => p.visible[n.id] && n.id !== p.capital && g.hostilePowerAt(n.id, p.id) === 0)!;
    expect(g.dangerKnown(p.id, seen.id)).toBe(false);
    g.spawnUnit('breaker', rival.id, seen.id);
    expect(g.dangerKnown(p.id, seen.id)).toBe(true);
    // Charted but out of sight: a rival fleet there is not known...
    const away = g.nodes.find((n) => !p.visible[n.id] && n.kind === 'star' && g.buckets[n.id].length === 0)!;
    p.explored[away.id] = 1;
    g.spawnUnit('breaker', rival.id, away.id);
    expect(g.dangerKnown(p.id, away.id)).toBe(false);
    // ...a rival's world the house has seen is.
    const hearth = g.nodes[rival.capital];
    p.explored[hearth.id] = 1;
    p.seenOwner[hearth.id] = rival.id;
    if (!p.visible[hearth.id]) expect(g.dangerKnown(p.id, hearth.id)).toBe(true);
    // And a place never charted is not known at all.
    const dark = g.nodes.find((n) => !p.explored[n.id] && !p.visible[n.id])!;
    expect(g.dangerKnown(p.id, dark.id)).toBe(false);
  });
});
