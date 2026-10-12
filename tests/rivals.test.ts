/** Rival houses: how they defend, what they go for, and that they play by the rules the player does. */
import { describe, expect, it } from 'vitest';
import { TICK } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { mk, run } from './helpers';

describe('rival fleets', () => {
  it('come home for their Hearth from any distance', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    // The rival's fleet is far from home (more than four jumps)...
    const farNode = g.nodes.filter((n) => n.kind === 'planet' && g.hops(n.id, rival.capital) > 4).sort((a, b) => g.hops(b.id, rival.capital) - g.hops(a.id, rival.capital))[0];
    expect(farNode).toBeTruthy();
    for (const u of g.unitsOf(rival.id)) if (u.type !== 'ark' && u.type !== 'scout') g.killUnit(u, -1);
    const fleet = [0, 1, 2, 3, 4, 5].map(() => g.spawnUnit('guardian', rival.id, farNode.id));
    // ...when a strong enemy arrives at its Hearth.
    for (let i = 0; i < 14; i++) g.spawnUnit('breaker', p.id, rival.capital);
    run(g, 6);
    // (Home: the Hearth, or a place a jump or two from it where they gather while they are too few to win.)
    const home = (id: number) => id >= 0 && g.hops(id, rival.capital) <= 2;
    const coming = fleet.filter((u) => !u.dead && (home(u.dest) || (u.dest < 0 && home(u.node))));
    expect(coming.length).toBeGreaterThanOrEqual(4);
  });
});

describe('a rival house wants a derelict too', () => {
  /** A derelict Dreadnought drifting at an empty place the house knows, as near its Hearth as there is one. */
  function derelictNear(g: Game, fid: number) {
    const f = g.factions[fid];
    const n = g.nodes
      .filter((x) => (x.kind === 'star' || (x.kind === 'planet' && x.owner < 0)) && !x.claim && !x.hazard && x.id !== f.capital && g.hostilePowerAt(x.id, fid) === 0 && g.buckets[x.id].length === 0)
      .sort((a, b) => g.hops(a.id, f.capital) - g.hops(b.id, f.capital))[0];
    n.claim = { what: 'derelict', f: -1, t: 0 };
    f.explored[n.id] = 1;
    return n;
  }

  it('two of its free ships go and hold one that drifts within reach, and the Dreadnought is theirs', () => {
    const g = mk({ size: 'medium' });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    const n = derelictNear(g, rival.id);
    expect(g.hops(n.id, rival.capital)).toBeLessThanOrEqual(3);
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', rival.id, rival.capital);
    run(g, 8);
    const sent = g.unitsOf(rival.id).filter((u) => u.dest === n.id || u.node === n.id);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    run(g, 90);
    expect(n.claim).toBeNull();
    expect(g.unitsOf(rival.id).some((u) => u.type === 'dreadnought')).toBe(true);
  });

  it('one that is held by someone else is not a detour: that is a fight, and the army decides it', () => {
    const g = mk({ size: 'medium' });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    const n = derelictNear(g, rival.id);
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', rival.id, rival.capital);
    for (let i = 0; i < 12; i++) g.spawnUnit('breaker', g.playerId, n.id);
    g.step();
    const before = g.unitsOf(rival.id).filter((u) => u.dest === n.id).length;
    run(g, 4);
    // (Whatever the army makes of it, it is not the two-ship errand: that never flies into guns.)
    const errand = g.unitsOf(rival.id).filter((u) => u.dest === n.id);
    expect(errand.length === 0 || errand.length > 2 || before > 0).toBe(true);
  });
});

describe('a rival house under siege at its Hearth (the third playtest)', () => {
  /** A rival whose eight Guardians are away from home when thirty ships come for its Hearth (which is made to hold). */
  function siege() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    rival.ai!.firstAttackAt = 0;
    const far = g.nodes.filter((n) => n.kind === 'planet' && g.hops(n.id, rival.capital) === 3 && g.hostilePowerAt(n.id, rival.id) === 0)[0];
    for (const u of g.unitsOf(rival.id)) if (u.type !== 'ark' && u.type !== 'scout') g.killUnit(u, -1);
    const fleet = [0, 1, 2, 3, 4, 5, 6, 7].map(() => g.spawnUnit('guardian', rival.id, far.id));
    for (let i = 0; i < 30; i++) g.spawnUnit(i % 2 ? 'breaker' : 'striker', p.id, rival.capital);
    return { g, rival, fleet, hearth: g.nodes[rival.capital] };
  }

  it('its ships keep the course they are given: no turning back and forth, never leaving', () => {
    const { g, fleet, hearth } = siege();
    const changes = new Map<number, number>();
    const last = new Map<number, number>();
    for (let t = 0; t < 60 / TICK; t++) {
      hearth.hp = hearth.maxHp;
      g.step();
      g.fx.length = 0;
      for (const u of fleet) {
        if (u.dead || last.get(u.id) === u.dest) continue;
        last.set(u.id, u.dest);
        changes.set(u.id, (changes.get(u.id) ?? 0) + 1);
      }
    }
    // (Before: up to sixty orders in two and a half minutes, each one starting the drive's charge again.)
    expect(Math.max(...fleet.map((u) => changes.get(u.id) ?? 0))).toBeLessThanOrEqual(4);
  });

  it('too few to win, they gather a jump or two short of the Hearth instead of flying in one by one', () => {
    const { g, rival, fleet, hearth } = siege();
    for (let t = 0; t < 20 / TICK; t++) {
      hearth.hp = hearth.maxHp;
      g.step();
      g.fx.length = 0;
    }
    const living = fleet.filter((u) => !u.dead);
    expect(living.length).toBe(8);
    for (const u of living) {
      expect(u.dest).not.toBe(rival.capital);
      const hops = g.hops(u.dest >= 0 ? u.dest : u.node, rival.capital);
      expect(hops).toBeGreaterThanOrEqual(1);
      expect(hops).toBeLessThanOrEqual(2);
    }
  });
});
