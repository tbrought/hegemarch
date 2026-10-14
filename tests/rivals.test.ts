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

  it('too few to win, they gather a jump or two short of the Hearth while its shields hold, instead of flying in one by one', () => {
    const { g, rival, fleet, hearth } = siege();
    for (let t = 0; t < 20 / TICK; t++) {
      hearth.hp = hearth.maxHp;
      hearth.sh = hearth.maxSh;
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

describe('the last stand: a house does not watch its Hearth fall (a playtest of Ages)', () => {
  /** A rival whose eight Guardians stand one jump from its Hearth when thirty ships come for it (the Hearth is made to hold). */
  function watched(opts: Parameters<typeof mk>[0] = {}) {
    const g = mk({ size: 'medium', ...opts });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    rival.ai!.firstAttackAt = 1e9;
    const hearth = g.nodes[rival.capital];
    const next = g.nodes.filter((n) => g.hops(n.id, hearth.id) === 1 && g.hostilePowerAt(n.id, rival.id) === 0)[0];
    for (const u of g.unitsOf(rival.id)) if (u.type !== 'ark' && u.type !== 'scout') g.killUnit(u, -1);
    const fleet = [0, 1, 2, 3, 4, 5, 6, 7].map(() => g.spawnUnit('guardian', rival.id, next.id));
    for (let i = 0; i < 30; i++) g.spawnUnit(i % 2 ? 'breaker' : 'striker', p.id, hearth.id);
    /** Let time pass with the Hearth's hull held, and its shields held at a share of what they can be. */
    const pass = (seconds: number, shields: number) => {
      for (let t = 0; t < seconds / TICK; t++) {
        hearth.hp = hearth.maxHp;
        hearth.sh = hearth.maxSh * shields;
        g.step();
        g.fx.length = 0;
      }
    };
    const coming = () => fleet.filter((u) => !u.dead && (u.node === hearth.id || u.dest === hearth.id || u.lane?.to === hearth.id)).length;
    return { g, rival, fleet, hearth, next, pass, coming };
  }

  it('outnumbered, its ships wait next door while the shields hold; once they are gone, every ship comes', () => {
    const { fleet, hearth, pass, coming, rival } = watched();
    pass(20, 1);
    expect(fleet.filter((u) => !u.dead).length).toBe(8);
    expect(coming()).toBe(0);
    expect(rival.ai!.breach).toBeUndefined();
    // The shields go: within a few seconds all of them are on their way, eight against thirty.
    pass(6, 0);
    expect(coming()).toBe(8);
    pass(40, 0);
    expect(fleet.some((u) => u.node === hearth.id || u.dead)).toBe(true);
  });

  it('they do not turn back when the shields flicker', () => {
    const { fleet, pass, coming, rival } = watched();
    pass(10, 1);
    pass(5, 0);
    expect(coming()).toBe(8);
    const dests = fleet.map((u) => u.dest);
    // A third of the shields back for ten seconds: the house stands by what it began.
    pass(10, 0.35);
    expect(fleet.filter((u) => !u.dead).map((u) => u.dest)).toEqual(dests.filter((_, i) => !fleet[i].dead));
    expect(coming()).toBe(fleet.filter((u) => !u.dead).length);
    expect(rival.ai!.breach).toBeDefined();
  });

  it('a threat that does not crack the Hearth does not call them in', () => {
    const { pass, coming } = watched();
    // Half the shields gone is not a breach.
    pass(30, 0.5);
    expect(coming()).toBe(0);
  });

  it('the same on the cradle of an Ages run: the army in the next land comes when the Hearth is breached', () => {
    const { fleet, pass, coming } = watched({ mode: 'ages', stage: 'cradle' });
    pass(15, 1);
    expect(coming()).toBe(0);
    pass(6, 0);
    expect(coming()).toBe(fleet.filter((u) => !u.dead).length);
    expect(coming()).toBeGreaterThan(0);
  });
});
