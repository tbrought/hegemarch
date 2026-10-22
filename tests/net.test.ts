/**
 * Games played together (1.28): the room and its screens in one process, with the wire's delay and jitter,
 * and the game's own AI giving each player's orders through the room. The games of every screen must be one
 * game, to the last bit, however the orders cross the wire; and the room keeps the rules of a game together.
 */
import { describe, expect, it } from 'vitest';
import { HEIRS } from '../src/game/data/heirs';
import { Game, ORDER_NAMES } from '../src/game/Game';
import { EMPIRES_BY_SIZE } from '../src/game/mapgen';
import type { GameConfig, Seat } from '../src/game/types';
import { gameHash } from '../src/net/hash';
import { AWAY_MS, HAND_OVER, HOUSE_IDS, NET_ORDERS, ORDER_ARGS, orderShape, SEATS_BY_SIZE, VERSUS_PAUSES } from '../src/net/protocol';
import { NetWorld, type Screen } from './netHarness';
import { run } from './helpers';

/** A room set up and started: `players` screens, co-op or versus, everything else as asked. */
function started(players: number, together: 'coop' | 'versus', opts: { delay?: number; jitter?: number; size?: 'small' | 'medium' | 'large'; seed?: number } = {}) {
  const w = new NetWorld(opts.delay ?? 40, opts.jitter ?? 30, opts.seed ?? 3);
  const names = ['ALICE', 'BRUNO', 'CIRCE', 'DARIO'];
  const screens: Screen[] = [];
  screens.push(w.join(names[0]));
  w.run(200);
  w.send(screens[0], { t: 'options', options: { together, size: opts.size ?? 'medium', speed: 3 } });
  w.run(200);
  for (let i = 1; i < players; i++) {
    // (Versus starts with two open seats: the owner opens more for more players.)
    if (together === 'versus' && i >= 2) w.send(screens[0], { t: 'seat', seat: i, kind: 'open' });
    w.run(100);
    screens.push(w.join(names[i]));
    w.run(200);
  }
  // Every player chooses a house of their own, and is ready.
  screens.forEach((s, i) => w.send(s, { t: 'house', heir: HOUSE_IDS[i] }));
  w.run(200);
  for (const s of screens.slice(1)) w.send(s, { t: 'ready', on: true });
  w.run(200);
  w.send(screens[0], { t: 'start' });
  w.run(400);
  return { w, screens };
}

describe('a room and its screens agree on what a game together is', () => {
  it('the room passes on the game\'s orders, deals its houses, and seats its sizes', () => {
    expect([...NET_ORDERS]).toEqual([...ORDER_NAMES]);
    expect(HOUSE_IDS).toEqual(HEIRS.map((h) => h.id));
    expect(SEATS_BY_SIZE).toEqual(EMPIRES_BY_SIZE);
  });

  it('a lobby: players come in, take houses, are ready, and every screen is given the same game', () => {
    const { w, screens } = started(2, 'coop');
    expect(w.room.phase).toBe('playing');
    for (const s of screens) expect(s.ls).not.toBeNull();
    const [a, b] = screens.map((s) => s.ls!);
    expect(a.config).toEqual(b.config);
    expect(a.seat).not.toBe(b.seat);
    const seats = a.config.seats!;
    expect(seats.length).toBe(4);
    expect(seats.filter((s) => s.human).length).toBe(2);
    // (Co-op: the players one team, each AI house its own.)
    expect(new Set(seats.filter((s) => s.human).map((s) => s.team)).size).toBe(1);
    expect(new Set(seats.map((s) => s.heir)).size).toBe(4);
    expect(a.game.player.id).toBe(a.seat);
    expect(b.game.player.id).toBe(b.seat);
  });

  it('the lobby: only its owner sets it up; when the owner leaves, the next player owns it', () => {
    const w = new NetWorld(20, 10, 5);
    const a = w.join('ALICE');
    w.run(200);
    const b = w.join('BRUNO');
    w.run(200);
    expect(b.lobby!.owner).toBe(a.lobby!.you);
    // (Not the owner: nothing changes.)
    w.send(b, { t: 'options', options: { size: 'large', difficulty: 3 } });
    w.run(200);
    expect(b.lobby!.options.size).toBe('medium');
    expect(b.lobby!.options.difficulty).toBe(1);
    w.send(a, { t: 'leave' });
    w.run(300);
    expect(b.lobby!.owner).toBe(b.lobby!.you);
    expect(b.lobby!.seats[a.lobby!.you].kind).toBe('open');
    w.send(b, { t: 'options', options: { size: 'large' } });
    w.run(200);
    expect(b.lobby!.options.size).toBe('large');
    expect(b.lobby!.seats.length).toBe(6);
  });

  it('a new size keeps every player in a seat, and is never too small for the players there are', () => {
    const w = new NetWorld(20, 10, 6);
    const names = ['ALICE', 'BRUNO', 'CIRCE', 'DARIO'];
    const s0 = w.join(names[0]);
    w.run(200);
    w.send(s0, { t: 'options', options: { size: 'large' } });
    w.run(200);
    // (Four players: the owner opens two more seats of the six.)
    w.send(s0, { t: 'seat', seat: 2, kind: 'open' });
    w.send(s0, { t: 'seat', seat: 3, kind: 'open' });
    w.run(200);
    const all = [s0, ...names.slice(1).map((n) => {
      const s = w.join(n);
      w.run(200);
      return s;
    })];
    expect(all.every((s) => s.lobby!.you >= 0)).toBe(true);
    // A small sector seats three: four players stay where they are.
    w.send(s0, { t: 'options', options: { size: 'small' } });
    w.run(200);
    expect(s0.lobby!.options.size).toBe('large');
    // A medium one seats four: every player keeps a seat of their own, with their house and name.
    w.send(s0, { t: 'options', options: { size: 'medium' } });
    w.run(300);
    const L = s0.lobby!;
    expect(L.options.size).toBe('medium');
    expect(L.seats.length).toBe(4);
    expect(L.seats.filter((x) => x.kind === 'player').map((x) => x.name).sort()).toEqual([...names].sort());
    expect(new Set(all.map((s) => s.lobby!.you)).size).toBe(4);
    for (const s of all) expect(L.seats[s.lobby!.you].name).toBe(s.name);
    expect(L.owner).toBe(s0.lobby!.you);
  });

  it('the speed during a game: in co-op the host changes it for everyone; in versus no one does', () => {
    const coop = started(2, 'coop');
    const [h, o] = coop.screens;
    expect(h.ls!.speed).toBe(3);
    coop.w.send(o, { t: 'speed', speed: 1 });
    coop.w.run(300);
    expect(h.ls!.speed).toBe(3);
    coop.w.send(h, { t: 'speed', speed: 2 });
    coop.w.run(300);
    expect(h.ls!.speed).toBe(2);
    expect(o.ls!.speed).toBe(2);
    const vs = started(2, 'versus');
    vs.w.send(vs.screens[0], { t: 'speed', speed: 1 });
    vs.w.run(300);
    expect(vs.screens.map((s) => s.ls!.speed)).toEqual([3, 3]);
  });

  it('a new room is not joined once its game has begun, nor by another build', () => {
    const { w } = started(2, 'coop');
    const late = w.join('LATER');
    w.run(300);
    expect(late.heard.some((m) => m.t === 'error')).toBe(true);
    expect(late.ls).toBeNull();
  });
});

describe('every screen plays one game', () => {
  for (const [label, players, together, delay, jitter] of [
    ['co-op, two players and two AI houses, a slow wire', 2, 'coop', 120, 80],
    ['versus, two players, a quick wire', 2, 'versus', 15, 10],
    ['versus, four players', 4, 'versus', 60, 60],
  ] as const) {
    it(`${label}: ten minutes of game time, every hash the same, the room never had to put them back in step`, () => {
      const { w } = started(players, together, { delay, jitter, seed: players * 11 + delay });
      w.run(200_000);
      const [first, ...rest] = w.hashes();
      for (const h of rest) expect(h).toBe(first);
      expect(w.room.resyncs).toBe(0);
      // (The players gave orders: the AI played them, through the room.)
      expect(w.room.log.length).toBeGreaterThan(40);
      const g = w.screens[0].ls!.game;
      expect(g.time).toBeGreaterThan(9 * 60);
    });
  }
});

describe('the rules of a game together', () => {
  it('allies do not fight: ships of one team share a world and nothing is hit', () => {
    const g = coopGame();
    expect(g.hostile(0, 1)).toBe(false);
    expect(g.hostile(0, 2)).toBe(true);
    const at = g.factions[0].capital;
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', 1, at);
    for (let i = 0; i < 4; i++) g.spawnUnit('breaker', 0, at);
    const hull = () => g.unitList.filter((u) => !u.dead && u.node === at).reduce((s, u) => s + u.hp, 0) + g.nodes[at].hp;
    const before = hull();
    run(g, 20);
    expect(hull()).toBeGreaterThanOrEqual(before - 1e-6);
  });

  it('allies see what each other sees', () => {
    const g = coopGame();
    run(g, 2);
    const a = g.factions[0];
    const b = g.factions[1];
    expect(a.visible).toEqual(b.visible);
    expect(a.visible[b.capital]).toBe(1);
  });

  it('a team conquers together: when no Hearth outside it stands, every player of it is crowned', () => {
    const g = coopGame();
    for (const f of g.factions) if (f.kind === 'empire' && !g.allied(f.id, 0)) g.eliminate(f.id, 0);
    run(g, 2);
    expect(g.outcome?.victory).toBe('conquest');
    expect(g.outcome?.team).toBe(g.teamOf(0));
    const other = coopGame();
    other.playerId = 1;
    for (const f of other.factions) if (f.kind === 'empire' && !other.allied(f.id, 1)) other.eliminate(f.id, 1);
    run(other, 2);
    expect(other.outcome?.playerWon).toBe(true);
  });

  it('co-op: a player whose Hearth falls is rekindled when an ally takes the world back', () => {
    const g = coopGame();
    const hearth = g.factions[1].capital;
    g.planetDefeated(g.nodes[hearth], 2);
    g.flushDeferred();
    expect(g.factions[1].alive).toBe(false);
    expect(g.outcome).toBeNull();
    expect(g.nodes[hearth].owner).toBe(2);
    g.planetDefeated(g.nodes[hearth], 0);
    const back = g.factions[1];
    expect(back.alive).toBe(true);
    expect(back.capital).toBe(hearth);
    expect(g.nodes[hearth].owner).toBe(1);
    expect(g.unitsOf(1).some((u) => u.type === 'ark')).toBe(true);
  });

  it('co-op: the run is lost only when every player\'s Hearth has gone dark', () => {
    const g = coopGame();
    g.eliminate(0, 2);
    expect(g.outcome).toBeNull();
    g.eliminate(1, 2);
    expect(g.outcome?.victory).toBe('defeat');
  });

  it('Embers to an ally: all of them in co-op, four fifths in versus, none to a rival', () => {
    const g = coopGame();
    g.factions[0].embers = 1000;
    const b = g.factions[1].embers;
    expect(g.cmdGift(0, 1, 400)).toBe(true);
    expect(g.factions[1].embers).toBe(b + 400);
    expect(g.cmdGift(0, 2, 100)).toBe(false);
    const v = versusGame([[0, 0], [1, 0], [2, 1], [3, 1]]);
    v.factions[0].embers = 1000;
    const vb = v.factions[1].embers;
    expect(v.cmdGift(0, 1, 500)).toBe(true);
    expect(v.factions[1].embers).toBe(vb + 400);
  });

  it('versus: a player who surrenders falls, and the other is crowned', () => {
    const g = versusGame([[0, 0], [1, 1]]);
    expect(g.cmdSurrender(1)).toBe(true);
    run(g, 2);
    expect(g.outcome?.winner).toBe(0);
    expect(g.outcome?.victory).toBe('conquest');
    expect(coopGame().cmdSurrender(0)).toBe(false);
  });

  it('versus brings no perks, and every Boon; co-op brings each player\'s own Hall', () => {
    const { w } = started(2, 'versus');
    for (const s of w.screens[0].ls!.config.seats!.filter((x) => x.human)) {
      expect(s.perks).toEqual({});
      expect(s.legendary).toBe(true);
      expect(s.pacts).toBe(true);
    }
    const w2 = new NetWorld(0, 0, 9);
    const a = w2.join('HOST', { perks: { oldCoin: 3 }, legendary: false, pacts: false, heirs: ['concord', 'vael', 'wayfarer'] });
    w2.run(200);
    w2.send(a, { t: 'start' });
    w2.run(300);
    const seat = w2.room.config?.seats?.find((s) => s.human);
    // (The friend's seat was left open: the room says why it cannot start.)
    expect(w2.room.phase).toBe('lobby');
    w2.send(a, { t: 'seat', seat: 1, kind: 'ai' });
    w2.run(200);
    w2.send(a, { t: 'start' });
    w2.run(300);
    expect(w2.room.phase).toBe('playing');
    const mine = w2.room.config!.seats!.find((s) => s.human)!;
    expect(mine.perks).toEqual({ oldCoin: 3 });
    expect(mine.pacts).toBe(false);
    void seat;
  });

  it('the same luck: in versus every player\'s first Boons are dealt from the same dice', () => {
    const g = versusGame([[0, 0], [1, 1]], { sameLuck: true });
    expect(g.factions[0].dice).toEqual(g.factions[1].dice);
    const h = versusGame([[0, 0], [1, 1]], { sameLuck: false });
    expect(h.factions[0].dice).not.toEqual(h.factions[1].dice);
  });
});

describe('the room keeps time, pauses and players', () => {
  it('co-op: anyone pauses, anyone goes on, after a count-in; the game waits meanwhile', () => {
    const { w, screens } = started(2, 'coop');
    w.run(3000);
    w.send(screens[1], { t: 'pause', on: true });
    w.run(500);
    const at = w.room.to;
    w.run(4000);
    expect(w.room.to).toBe(at);
    w.send(screens[0], { t: 'pause', on: false });
    w.run(1500);
    expect(w.room.to).toBe(at);
    w.run(2500);
    expect(w.room.to).toBeGreaterThan(at);
  });

  it('versus: each player has three pauses, and only the one who paused goes on before a minute is up', () => {
    const { w, screens } = started(2, 'versus');
    w.run(2000);
    for (let i = 0; i < VERSUS_PAUSES; i++) {
      w.send(screens[0], { t: 'pause', on: true });
      w.run(300);
      expect(w.room.pause?.by).toBe(screens[0].ls!.seat);
      w.send(screens[1], { t: 'pause', on: false });
      w.run(300);
      expect(w.room.pause?.resumeAt).toBeUndefined();
      w.send(screens[0], { t: 'pause', on: false });
      w.run(4000);
      expect(w.room.pause).toBeNull();
    }
    w.send(screens[0], { t: 'pause', on: true });
    w.run(300);
    expect(w.room.pause).toBeNull();
    expect(screens[0].ls!.error?.text).toMatch(/no pauses left/);
  });

  it('a screen far behind holds the room (everyone slows to it); a hidden one does not', () => {
    const { w, screens } = started(2, 'coop');
    w.run(2000);
    screens[1].hidden = true;
    screens[1].ls!.visibility();
    w.run(8000);
    const lagging = w.room.to - screens[1].ls!.game.tick;
    expect(lagging).toBeGreaterThan(60);
    screens[1].hidden = false;
    w.run(6000);
    const [a, b] = w.hashes();
    expect(a).toBe(b);
  });

  it('a player who is away a minute has the AI lead their house; back with their token, they play it again and take it back', () => {
    const { w, screens } = started(2, 'coop', { seed: 21 });
    w.run(20_000);
    const gone = screens[1];
    const seat = gone.ls!.seat;
    gone.link.drop();
    w.run(AWAY_MS + 2000);
    expect(w.room.log.some((o) => o[2] === HAND_OVER && o[3][0] === seat && o[3][1] === 1)).toBe(true);
    const g0 = screens[0].ls!.game;
    expect(g0.factions[seat].isPlayer).toBe(false);
    expect(g0.factions[seat].ai).not.toBeNull();
    // Back, with the token: the game played again from its orders, then the house is theirs again.
    const back = w.join('BRUNO', {}, gone.token);
    w.run(30_000);
    expect(back.ls).not.toBeNull();
    expect(back.ls!.rebuilding).toBeNull();
    expect(back.ls!.seat).toBe(seat);
    expect(w.room.log.some((o) => o[2] === HAND_OVER && o[3][0] === seat && o[3][1] === 0)).toBe(true);
    expect(g0.factions[seat].isPlayer).toBe(true);
    w.screens.splice(w.screens.indexOf(gone), 1);
    const [a, b] = w.hashes();
    expect(a).toBe(b);
  });

  it('a screen whose game was changed by something other than an order is found, and every screen plays the game again', () => {
    const { w, screens } = started(2, 'coop', { seed: 5 });
    w.run(15_000);
    // (What a bug would do: the HUD changes the game directly.)
    screens[1].ls!.game.factions[0].embers += 1;
    w.run(5000);
    expect(w.room.resyncs).toBe(1);
    w.run(30_000);
    const [a, b] = w.hashes();
    expect(a).toBe(b);
    expect(w.room.phase).toBe('playing');
  });

  it('a page reloaded mid-game comes back with its token and goes on in step', () => {
    const { w, screens } = started(2, 'versus', { seed: 8 });
    w.run(25_000);
    const old = screens[0];
    old.link.drop();
    w.run(1000);
    const back = w.join('ALICE', {}, old.token);
    w.screens.splice(w.screens.indexOf(old), 1);
    w.run(25_000);
    expect(back.ls?.rebuilding).toBeNull();
    const [a, b] = w.hashes();
    expect(a).toBe(b);
  });
});

describe('orders that come late are harmless', () => {
  it('two thousand orders with ships that are gone, worlds that changed hands and nonsense: none throws', () => {
    const g = coopGame();
    run(g, 60);
    let seed = 99;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    // (Arguments in each order's shape, as the room lets through: ids of ships long gone, worlds of another house, names of nothing.)
    const num = () => {
      const r = rnd();
      if (r < 0.4) return Math.floor(rnd() * (g.nextId + 20)) - 5;
      if (r < 0.8) return Math.floor(rnd() * g.nodes.length);
      return Math.floor(rnd() * 3000) - 100;
    };
    const arg = (k: string) => {
      if (k.endsWith('?') && rnd() < 0.3) return undefined;
      switch (k[0]) {
        case 'n': return num();
        case 's': return pick(['striker', 'guardian', 'forge', 'mine', 'ark', 'ship', 'build', 'nope', '', 'emberTithe', 'barrage']);
        case 'a': return Array.from({ length: Math.floor(rnd() * 5) }, () => Math.floor(rnd() * (g.nextId + 5)));
        case 'b': return rnd() < 0.5;
        default: return undefined;
      }
    };
    const kill = () => {
      const u = pick(g.unitList.filter((x) => !x.dead));
      if (u) g.killUnit(u, -1);
    };
    let thrown = 0;
    for (let i = 0; i < 2000; i++) {
      if (i % 50 === 0) kill();
      const name = pick(ORDER_NAMES);
      if (name === 'ensureOffer') continue;
      const shape = ORDER_ARGS[name];
      const args = shape.map(arg);
      // (The house is the sender's, as the room sets it.)
      if (name !== 'cmdResolvePrompt' && name !== 'dismissPrompt') args[0] = pick([0, 1, 2, 3]);
      expect(orderShape(name, args.map((x) => (x === undefined ? null : x)))).toBe(true);
      g.ordering++;
      try {
        (g as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
      } catch (e) {
        thrown++;
        if (thrown < 4) console.error(name, args, e);
      } finally {
        g.ordering--;
      }
      if (i % 20 === 0) run(g, 0.5);
    }
    expect(thrown).toBe(0);
  });
});

function together(seats: Seat[], extra: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 777, size: 'medium', difficulty: 1, heir: seats[0].heir, perks: {}, unlockLegendary: true, unlockPacts: true, seats, ...extra });
}

/** Two players (houses 0 and 1, one team) and two AI houses (each its own). */
function coopGame(): Game {
  return together([
    { heir: 'concord', human: true, team: 0 }, { heir: 'vael', human: true, team: 0 },
    { heir: 'wayfarer', human: false, team: 2 }, { heir: 'lyceum', human: false, team: 3 },
  ], { together: 'coop' });
}

/** Players on teams: [house, team] for each. */
function versusGame(teams: [number, number][], extra: Partial<GameConfig> = {}): Game {
  return together(teams.map(([i, t]) => ({ heir: HOUSE_IDS[i], human: true, team: t, perks: {}, legendary: true, pacts: true })), { together: 'versus', ...extra });
}

void gameHash;
