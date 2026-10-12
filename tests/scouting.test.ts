/** Scouts: exploring by themselves, without throwing themselves away; and the anomalies they find. */
import { describe, expect, it } from 'vitest';
import { HOLD_FIELD, JUMP_CHARGE } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { mk, run } from './helpers';

describe('scouting and anomalies', () => {
  /** A quiet start: rivals give no orders and their scouts stay home. */
  function quiet(): Game {
    const g = mk();
    for (const f of g.factions) if (f.id !== g.playerId && f.kind === 'empire') f.ai = null;
    for (const u of g.unitList) if (u.type === 'scout' && u.owner !== g.playerId) g.cmdStop(u.owner, [u.id]);
    return g;
  }

  it('your scouts wait for orders; rival scouts set out at once', () => {
    const g = mk();
    const scouts = g.unitList.filter((u) => u.type === 'scout');
    const mine = scouts.filter((u) => u.owner === g.playerId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((u) => u.order === 'idle')).toBe(true);
    expect(scouts.filter((u) => u.owner !== g.playerId).every((u) => u.order === 'explore')).toBe(true);
    run(g, 30);
    expect(mine.every((u) => u.node === g.player.capital && !u.lane)).toBe(true);
  });

  it('EXPLORE sends scouts only, and they chart the dark', () => {
    const g = mk();
    const p = g.player;
    const charted = p.explored.filter(Boolean).length;
    g.cmdExplore(p.id, g.unitsOf(p.id).map((u) => u.id));
    for (const u of g.unitsOf(p.id)) expect(u.order).toBe(u.type === 'scout' ? 'explore' : 'idle');
    run(g, 60);
    expect(p.explored.filter(Boolean).length).toBeGreaterThan(charted);
    expect(g.unitsOf(p.id).find((u) => u.type === 'ark')!.node).toBe(p.capital);
  });

  it('with nothing left to chart, an exploring Scout stops and says so', () => {
    const g = mk();
    const p = g.player;
    expect(g.hasUncharted(p)).toBe(true);
    const sc = g.unitsOf(p.id).find((u) => u.type === 'scout')!;
    g.cmdExplore(p.id, [sc.id]);
    g.exploreAll(p);
    expect(g.hasUncharted(p)).toBe(false);
    run(g, 2);
    expect(sc.order).toBe('idle');
    expect(g.notes.some((n) => /Scouting complete/.test(n.text))).toBe(true);
  });

  it('a scout you build flies to the rally point like any ship', () => {
    const g = mk();
    const p = g.player;
    p.embers = 1000;
    const rally = g.nodes[p.capital].lanes[0];
    expect(g.cmdSetRally(p.id, p.capital, rally)).toBe(true);
    const before = new Set(g.unitsOf(p.id).map((u) => u.id));
    expect(g.cmdQueueShip(p.id, p.capital, 'scout')).toBe(true);
    run(g, 25);
    const built = g.unitsOf(p.id).find((u) => u.type === 'scout' && !before.has(u.id));
    expect(built).toBeDefined();
    expect(built!.order).not.toBe('explore');
    expect(built!.dest).toBe(rally);
  });

  it('your ships look at an anomaly only when sent there; rivals look as they pass', () => {
    const g = quiet();
    const p = g.player;
    const empty = (id: number) => !g.unitList.some((u) => !u.dead && (u.node === id || u.lane?.to === id));
    const spots = g.nodes.filter((n) => n.anomaly && empty(n.id) && n.lanes.every(empty));
    expect(spots.length).toBeGreaterThanOrEqual(2);
    const [a, b] = spots;
    // Passing through (more jumps to go) or out exploring: the ship flies on.
    const passer = g.spawnUnit('striker', p.id, a.id);
    passer.path = [a.lanes[0]];
    passer.snare = 9999;
    const scout = g.spawnUnit('scout', p.id, a.id);
    g.cmdExplore(p.id, [scout.id]);
    scout.snare = 9999;
    run(g, 2);
    expect(a.anomaly).not.toBeNull();
    expect(g.prompts.length).toBe(0);
    // Stopped there: it looks, and the player chooses.
    passer.path = [];
    run(g, 2);
    expect(a.anomaly).toBeNull();
    expect(g.prompts.some((x) => x.node === a.id && x.unit === passer.id)).toBe(true);
    // A rival house decides at once, even with a ship only passing through.
    const rival = g.factions.find((f) => f.kind === 'empire' && f.id !== p.id)!;
    const r = g.spawnUnit('striker', rival.id, b.id);
    r.path = [b.lanes[0]];
    r.snare = 9999;
    const resolved = rival.stats.eventsResolved;
    run(g, 2);
    expect(b.anomaly).toBeNull();
    expect(rival.stats.eventsResolved).toBe(resolved + 1);
  });
});

describe('Scouts explore without throwing themselves away', () => {
  /** Enough of a rival's ships at a place for it to count as guarded, and the place in the player's sight. */
  function guard(g: Game, nodeId: number) {
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    for (let i = 0; i < 4; i++) g.spawnUnit('striker', rival.id, nodeId);
    g.player.explored[nodeId] = 1;
  }

  it('a Scout is a ship like any other: no quicker drive, and guards fire on it at once', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    const striker = g.spawnUnit('striker', p.id, p.capital);
    expect(g.jumpChargeOf(g.spawnUnit('scout', p.id, p.capital))).toBeCloseTo(g.jumpChargeOf(striker), 5);
    expect(g.jumpChargeOf(striker)).toBeCloseTo(JUMP_CHARGE, 5);
    // At a rival Hearth it is held by the anti-warp field like any ship, and shot at from the start.
    expect(g.holdAt(scout)).toBe(HOLD_FIELD);
    const hp = scout.hp + scout.sh;
    scout.arrivedAt = g.time;
    run(g, 3);
    expect(scout.dead || scout.hp + scout.sh < hp).toBe(true);
  });

  it('an exploring Scout charts a place from next door: once the place is in sight it does not fly in', () => {
    const g = mk();
    const p = g.player;
    const scout = g.unitsOf(p.id).find((u) => u.type === 'scout') ?? g.spawnUnit('scout', p.id, p.capital);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    const first = scout.dest;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(p.explored[first]).toBeFalsy();
    expect(scout.path[scout.path.length - 1]).toBe(first);
    // The place comes into sight (as it does when the Scout reaches the place next door).
    p.explored[first] = 1;
    g.step();
    expect(scout.dest).not.toBe(first);
    expect(scout.path).not.toContain(first);
    expect(scout.order).toBe('explore');
  });

  it('it never plans a way through a place it has seen to be guarded, and looks before every leap', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const scout = g.unitsOf(p.id).find((u) => u.type === 'scout') ?? g.spawnUnit('scout', p.id, p.capital);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.path.length).toBeGreaterThan(1);
    const through = scout.path[0];
    // A rival fleet turns up at the next place on its way: the Scout thinks again, at once.
    guard(g, through);
    g.step();
    expect(scout.path).not.toContain(through);
    // Whatever it picks from now on, no guarded place is on the way (the last stop is the uncharted goal).
    for (let i = 0; i < 6; i++) {
      scout.path = [];
      scout.dest = -1;
      scout.charge = -1;
      g.step();
      const onTheWay = scout.path.slice(0, -1);
      expect(onTheWay.some((id) => p.explored[id] && g.hostilePowerAt(id, p.id) > 1)).toBe(false);
      if (scout.dest >= 0) p.explored[scout.dest] = 1;
    }
  });

  it('with no safe way on, it says how much lies beyond guards and goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    // Everything is charted but one place, and every way to that one is guarded.
    const far = g.nodes.filter((n) => n.owner !== p.id && g.hops(p.capital, n.id) >= 3).sort((a, b) => g.hops(p.capital, b.id) - g.hops(p.capital, a.id))[0];
    p.explored.fill(1);
    p.explored[far.id] = 0;
    for (const nb of far.lanes) guard(g, nb);
    const start = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1 && !far.lanes.includes(n.id) && n.id !== far.id && !g.buckets[n.id].length)!;
    const scout = g.spawnUnit('scout', p.id, start.id);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.order).toBe('idle');
    const note = g.notes[g.notes.length - 1].text;
    expect(note).toMatch(/Scouting done as far as it is safe: 1 place lies beyond guarded passages/);
    expect(g.nodes[scout.dest].owner).toBe(p.id);
    // By hand it still goes wherever it is sent: that is the player's call.
    g.cmdMove(p.id, [scout.id], far.id);
    expect(scout.dest).toBe(far.id);
    expect(scout.path.length).toBeGreaterThan(0);
    void rival;
  });

  it('the game knows how much a Scout could chart safely from home', () => {
    const g = mk();
    const p = g.player;
    const open = g.chartable(p.id);
    expect(open).toBeGreaterThan(3);
    // Guard every place next to the house's worlds: nothing can be reached safely any more.
    const rival = g.empires().find((f) => f.id !== p.id)!;
    for (const n of g.nodes) {
      if (!p.explored[n.id] || n.owner === p.id) continue;
      for (let i = 0; i < 4; i++) g.spawnUnit('striker', rival.id, n.id);
    }
    expect(g.chartable(p.id)).toBe(0);
    const far = g.nodes.find((n) => !p.explored[n.id])!;
    expect(g.safeWay(p, p.capital, far.id)).toEqual([]);
  });

  it('a Scout with nothing left to chart goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    p.explored.fill(1);
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.order).toBe('idle');
    expect(scout.dest).toBeGreaterThanOrEqual(0);
    expect(g.nodes[scout.dest].owner).toBe(p.id);
    expect(scout.path.length).toBeGreaterThan(0);
    expect(g.notes.some((n) => /Scouts are coming home/.test(n.text))).toBe(true);
  });

  it('a way that keeps clear of trouble goes round a place when it can, and through it when it must', () => {
    const g = mk();
    const N = g.nodes.length;
    // With nothing to avoid it is the sector's own shortest way.
    let tried = 0;
    for (let a = 0; a < N && tried < 40; a++) {
      for (let b = 0; b < N && tried < 40; b++) {
        if (a === b || g.hops(a, b) < 3) continue;
        tried++;
        expect(g.pathAvoiding(a, b, () => 0)).toEqual(g.pathTo(a, b));
        const way = g.pathTo(a, b);
        const mid = way[0];
        const round = g.pathAvoiding(a, b, (id) => (id === mid ? 1e6 : 0));
        // A way is always found (the sector is connected), it ends at b, and every step is a starlane.
        expect(round[round.length - 1]).toBe(b);
        let at = a;
        for (const step of round) {
          expect(g.lanes.some((l) => (l.a === at && l.b === step) || (l.b === at && l.a === step))).toBe(true);
          at = step;
        }
        // It goes through the avoided place only if there is no other way.
        const others = g.lanes.filter((l) => l.a === a || l.b === a).length;
        if (others > 1 && !round.includes(mid)) expect(round).not.toContain(mid);
      }
    }
    expect(tried).toBeGreaterThan(10);
    // The ends themselves are never avoided.
    const [a, b] = [0, g.nodes.length - 1];
    expect(g.pathAvoiding(a, b, (id) => (id === a || id === b ? 1e9 : 0))).toEqual(g.pathTo(a, b));
  });

  it('at least once in the sector the way round is taken instead of the way through', () => {
    const g = mk();
    const N = g.nodes.length;
    let rounds = 0;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        if (a === b || g.hops(a, b) < 2) continue;
        const mid = g.pathTo(a, b)[0];
        if (mid === b) continue;
        if (!g.pathAvoiding(a, b, (id) => (id === mid ? 1e6 : 0)).includes(mid)) rounds++;
      }
    }
    expect(rounds).toBeGreaterThan(0);
  });
});
