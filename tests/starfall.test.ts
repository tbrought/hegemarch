/** The Starfall: building and arming one, what an eruption does to a system, the fire it leaves, and how rival houses use and answer it. */
import { describe, expect, it } from 'vitest';
import { starfallStar } from '../src/game/ai/ai';
import { Game } from '../src/game/Game';
import { UNITS } from '../src/game/data/units';
import { ECON } from '../src/game/data/worlds';
import { burning, STARFALL_BURN, STARFALL_FUSE, STARFALL_STEP } from '../src/game/starfall';
import { convertible } from '../src/game/systems/abilities';
import { recomputeHangar } from '../src/game/worldStats';
import type { GNode, Unit } from '../src/game/types';
import { arena, mk, run, snapshot } from './helpers';

/** A game in which nobody gives orders but the test. */
function quiet(opts: Parameters<typeof mk>[0] = {}): Game {
  const g = mk(opts);
  for (const f of g.factions) f.ai = null;
  return g;
}

/** A Starfall of a house, at a place, as if just built. */
function device(g: Game, fid: number, at: number): Unit {
  return g.spawnUnit('starfall', fid, at);
}

const homeStar = (g: Game, fid: number): GNode => g.starOf(g.nodes[g.factions[fid].capital])!;
const rivalOf = (g: Game) => g.empires().find((f) => f.id !== g.playerId)!;

describe('a Starfall is built at the Hearth', () => {
  it('with its Blueprint, one at a time, and each dearer than the last', () => {
    const g = quiet();
    const p = g.player;
    p.embers = 99999;
    expect(g.checkStarfall(p.id)).toBe('Needs its Blueprint Boon');
    g.addCard(p, 'bpStarfall');
    expect(g.checkStarfall(p.id)).toBeNull();
    const first = g.starfallCost(p);
    expect(first).toBe(UNITS.starfall.cost);
    expect(g.cmdQueueStarfall(p.id)).toBe(true);
    expect(p.embers).toBe(99999 - first);
    expect(g.checkStarfall(p.id)).toBe('Already being built');
    // It takes no hangar room, in the queue or out of it.
    const used = p.hangarUsed;
    run(g, UNITS.starfall.buildTime * 2);
    const d = g.starfallOf(p.id)!;
    expect(d).toBeTruthy();
    expect(d.node).toBe(p.capital);
    expect(p.hangarUsed).toBe(used);
    expect(g.checkStarfall(p.id)).toBe('One Starfall at a time');
    // The next one costs more, once this one is gone.
    g.killUnit(d, -1);
    expect(g.checkStarfall(p.id)).toBeNull();
    expect(g.starfallCost(p)).toBe(first + STARFALL_STEP);
  });

  it('a Starfall that is cancelled in the queue is paid back, and the next costs no more for it', () => {
    const g = quiet();
    const p = g.player;
    g.addCard(p, 'bpStarfall');
    p.embers = 5000;
    const cost = g.starfallCost(p);
    g.cmdQueueStarfall(p.id);
    const i = g.nodes[p.capital].shipQ.findIndex((q) => q.id === 'starfall');
    expect(g.cmdCancel(p.id, p.capital, 'ship', i)).toBe(true);
    expect(p.embers).toBe(5000);
    expect(g.starfallCost(p)).toBe(cost);
  });

  it('the First Night never offers its Blueprint, and the cradle of an Ages run builds none', () => {
    const t = mk({ tutorial: true });
    expect(t.cardPool(t.player).some((c) => c.id === 'bpStarfall')).toBe(false);
    expect(mk().cardPool(mk().player).some((c) => c.id === 'bpStarfall')).toBe(true);
    const a = mk({ mode: 'ages', stage: 'cradle' });
    a.player.cards.push('bpStarfall');
    expect(a.checkStarfall(a.player.id)).toBe('The Starfall belongs to the Space Age');
  });
});

describe('a Starfall is armed at a star', () => {
  it('and nowhere else; armed, it stays where it is and cannot be called off', () => {
    const g = quiet();
    const p = g.player;
    const d = device(g, p.id, p.capital);
    expect(g.checkArm(p.id, d.id)).toBe('Only at a star');
    expect(g.cmdArm(p.id, d.id)).toBe(false);
    const star = homeStar(g, p.id);
    g.cmdMove(p.id, [d.id], star.id);
    run(g, 90);
    expect(d.node).toBe(star.id);
    expect(g.checkArm(rivalOf(g).id, d.id)).toBe('Not a Starfall of yours');
    expect(g.cmdArm(p.id, d.id)).toBe(true);
    expect(d.fuse).toBe(STARFALL_FUSE);
    expect(g.armedAt(star)).toBe(d);
    expect(g.checkArm(p.id, d.id)).toBe('Already armed');
    g.cmdMove(p.id, [d.id], p.capital);
    g.cmdRetreat(p.id, [d.id]);
    run(g, 20);
    expect(d.node).toBe(star.id);
    expect(d.lane).toBeNull();
    expect(d.fuse!).toBeCloseTo(STARFALL_FUSE - 20, 1);
  });

  it('every other house holds it against the one that armed it', () => {
    const g = mk();
    const p = g.player;
    const d = device(g, p.id, homeStar(g, p.id).id);
    const rivals = g.empires().filter((f) => f.id !== p.id);
    expect(rivals.every((f) => f.ai!.grudge !== p.id)).toBe(true);
    g.cmdArm(p.id, d.id);
    expect(rivals.every((f) => f.ai!.grudge === p.id && f.ai!.grudgeAt === g.time)).toBe(true);
  });

  it('the Choir of the First Flame cannot talk one round', () => {
    const g = quiet();
    expect(convertible(g, device(g, g.player.id, g.player.capital))).toBe(false);
    expect(convertible(g, g.spawnUnit('striker', g.player.id, g.player.capital))).toBe(true);
  });
});

describe('at the end of its fuse the star erupts', () => {
  it('every ship in the system is destroyed, the armer\'s too, with Starbases and a Gate; ships on a starlane fly on', () => {
    const g = quiet();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    const hearth = g.nodes[r.capital];
    const d = device(g, p.id, star.id);
    const escort = g.spawnUnit('guardian', p.id, star.id);
    const home = g.spawnUnit('breaker', r.id, hearth.id);
    const base = g.spawnUnit('starbase', r.id, hearth.id);
    const gate = g.spawnUnit('gate', r.id, hearth.id);
    r.gate = { node: hearth.id, charge: 0, unit: gate.id };
    const ark = g.units.get(r.ark)!;
    expect(ark.node >= 0 && g.nodes[ark.node].system).toBe(star.system);
    // Out of the system: untouched.
    const away = g.spawnUnit('striker', r.id, arena(g));
    const runner = g.spawnUnit('striker', p.id, star.id);
    const out = star.lanes.find((id) => g.nodes[id].system !== star.system)!;
    expect(out).toBeDefined();
    g.cmdArm(p.id, d.id);
    run(g, STARFALL_FUSE - 4);
    expect(burning(star)).toBe(false);
    expect([escort, home, base, gate, runner].every((u) => !u.dead)).toBe(true);
    // One ship leaves at the last moment: at zero it is on the starlane, at no place.
    g.cmdMove(p.id, [runner.id], out);
    run(g, 4.1);
    expect(runner.lane).not.toBeNull();
    expect(burning(star)).toBe(true);
    expect(star.hazard).toEqual({ warn: 0, t: expect.any(Number), dps: expect.any(Number), by: p.id });
    expect([d, escort, home, base, gate, ark].every((u) => u.dead)).toBe(true);
    expect(r.gate).toBeNull();
    expect(runner.dead).toBe(false);
    expect(away.dead).toBe(false);
    // (The Ark can be built again, as after any loss.)
    expect(g.checkArk(r.id)).not.toBe('Your Ark still flies');
  });

  it('worlds are scorched, not taken: no shields, a level lost, the Glow of a new world; the hull and the owner as they were', () => {
    const g = quiet();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    const hearth = g.nodes[r.capital];
    const world = g.nodes.find((n) => n.kind === 'planet' && n.system === star.system && n.owner === -1)!;
    g.kindleWorld(world, r.id);
    g.setLevel(world, 3);
    world.glow = 1;
    world.hp = world.maxHp;
    world.sh = world.maxSh;
    const dark = g.nodes.find((n) => n.kind === 'planet' && n.system === star.system && n.owner === -1)!;
    const elsewhere = g.nodes[p.capital];
    const before = { hearthLevel: hearth.level, hearthHp: hearth.hp / hearth.maxHp, cap: r.hangarCap, elseSh: elsewhere.sh, elseGlow: elsewhere.glow };
    recomputeHangar(g, r);
    const cap = r.hangarCap;
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    expect(burning(star)).toBe(true);
    expect(world.owner).toBe(r.id);
    expect(world.level).toBe(2);
    expect(world.glow).toBeCloseTo(ECON.glowStart, 1);
    expect(world.sh).toBeLessThan(world.maxSh * 0.05);
    expect(world.hp / world.maxHp).toBeCloseTo(1, 2);
    // (A level is a place in the hangar: the world's, and the Hearth's if it had one to lose.)
    expect(r.hangarCap).toBe(cap - 1 - (before.hearthLevel > 1 ? 1 : 0));
    // The Hearth stands: it is its house's Hearth still, with the hull it had, and the house is in the game.
    expect(hearth.owner).toBe(r.id);
    expect(hearth.capitalOf).toBe(r.id);
    expect(hearth.level).toBe(Math.max(1, before.hearthLevel - 1));
    expect(hearth.hp / hearth.maxHp).toBeCloseTo(before.hearthHp, 2);
    expect(hearth.sh).toBeLessThan(hearth.maxSh * 0.05);
    expect(r.alive).toBe(true);
    expect(g.outcome).toBeFalsy();
    // A dark world stays dark, and a world of another system is not touched.
    expect(dark.owner).toBe(-1);
    expect(elsewhere.glow).toBe(before.elseGlow);
    expect(elsewhere.level).toBe(g.nodes[p.capital].level);
  });

  it('the Rift Heart is not harmed: a Starfall wins no Destiny by itself', () => {
    const g = quiet();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    // (At a quiet place of the system, not at the star: the Heart would make short work of the Starfall.)
    const lair = g.nodes.find((n) => n.system === star.system && n.id !== star.id && g.buckets[n.id].length === 0)!;
    const heart = g.spawnUnit('heart', g.crisisId, lair.id);
    const drone = g.spawnUnit('drone', g.crisisId, lair.id);
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    expect(burning(star)).toBe(true);
    expect(drone.dead).toBe(true);
    expect(heart.dead).toBe(false);
    expect(g.outcome).toBeFalsy();
  });

  it('destroying the Starfall stops it, and so does the fall of its house', () => {
    const g = quiet();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, p.id);
    const d = device(g, r.id, star.id);
    g.cmdArm(r.id, d.id);
    run(g, 30);
    g.killUnit(d, p.id);
    run(g, STARFALL_FUSE);
    expect(star.hazard).toBeNull();
    expect(g.armedStarfalls()).toEqual([]);
    // A fallen house's ships are destroyed, its Starfall with them.
    const d2 = device(g, r.id, star.id);
    g.cmdArm(r.id, d2.id);
    g.eliminate(r.id, p.id);
    run(g, STARFALL_FUSE + 1);
    expect(d2.dead).toBe(true);
    expect(star.hazard).toBeNull();
  });

  it('a house may burn its own home star: its own worlds and ships fare like anyone\'s', () => {
    const g = quiet();
    const p = g.player;
    const star = homeStar(g, p.id);
    const besieger = g.spawnUnit('breaker', rivalOf(g).id, p.capital);
    const mine = g.spawnUnit('striker', p.id, p.capital);
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    expect(besieger.dead).toBe(true);
    expect(mine.dead).toBe(true);
    expect(g.nodes[p.capital].owner).toBe(p.id);
    expect(g.nodes[p.capital].glow).toBeCloseTo(ECON.glowStart, 1);
    expect(p.alive).toBe(true);
  });

  it('a game saved while a fuse runs goes on as the one that was saved', () => {
    const g = mk();
    const p = g.player;
    const star = homeStar(g, rivalOf(g).id);
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, 40);
    const h = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(h.armedStarfalls().length).toBe(g.armedStarfalls().length);
    run(g, STARFALL_FUSE);
    run(h, STARFALL_FUSE);
    expect(snapshot(h)).toBe(snapshot(g));
    expect(burning(h.nodes[star.id])).toBe(burning(g.nodes[star.id]));
  });
});

describe('a Starfall is seen by the house that armed it (a playtest of 1.17)', () => {
  it('it sees the whole system from the moment it is armed until the fire is out; no one else sees more for it', () => {
    const g = quiet();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    const places = g.nodes.filter((n) => n.system === star.system);
    const third = g.empires().find((f) => f.id !== p.id && f.id !== r.id)!;
    const d = device(g, p.id, star.id);
    const sees = (fid: number) => places.filter((n) => g.factions[fid].visible[n.id]).length;
    run(g, 1);
    // Waiting at the star, it sees the star and no more.
    expect(sees(p.id)).toBe(1);
    const before = sees(third.id);
    g.cmdArm(p.id, d.id);
    run(g, 1);
    expect(sees(p.id)).toBe(places.length);
    expect(p.visible[r.capital]).toBe(1);
    expect(sees(third.id)).toBe(before);
    // The eruption takes the device, and its house goes on seeing: every ship that went up, every world scorched.
    d.fuse = 0.5;
    run(g, 2);
    expect(d.dead).toBe(true);
    expect(burning(star)).toBe(true);
    expect(sees(p.id)).toBe(places.length);
    run(g, STARFALL_BURN / 2);
    expect(sees(p.id)).toBe(places.length);
    // The fire is out: what it sees is what its ships and worlds see again.
    run(g, STARFALL_BURN / 2 + 2);
    expect(burning(star)).toBe(false);
    expect(sees(p.id)).toBe(0);
  });

  it('a Starfall that is destroyed in time shows its house nothing more', () => {
    const g = quiet();
    const p = g.player;
    const star = homeStar(g, rivalOf(g).id);
    const places = g.nodes.filter((n) => n.system === star.system);
    const d = device(g, p.id, star.id);
    g.cmdArm(p.id, d.id);
    run(g, 1);
    expect(places.every((n) => p.visible[n.id])).toBe(true);
    g.killUnit(d, rivalOf(g).id);
    run(g, 1);
    expect(places.some((n) => p.visible[n.id])).toBe(false);
  });

  it('what it took is said by house, and stands over the star for every house to read', () => {
    const g = quiet();
    g.fxEnabled = true;
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    const d = device(g, p.id, star.id);
    for (const u of [...g.unitList]) if (!u.dead && u.node >= 0 && g.nodes[u.node].system === star.system && u !== d) g.removeUnit(u);
    g.spawnUnit('guardian', p.id, star.id);
    for (let i = 0; i < 3; i++) g.spawnUnit('striker', r.id, r.capital);
    g.cmdArm(p.id, d.id);
    d.fuse = 0.2;
    const fx: Game['fx'] = [];
    for (let i = 0; i < 20; i++) {
      g.step();
      fx.push(...g.fx);
      g.fx.length = 0;
    }
    const worlds = g.nodes.filter((n) => n.system === star.system && n.kind === 'planet' && n.owner >= 0).length;
    const note = g.notes.find((n) => n.text.includes('erupts!'))!;
    expect(note.text).toContain(`took 4 ships (${g.shortName(r)} 3, yours 1) and scorched ${worlds} world`);
    const nova = fx.find((f) => f.k === 'nova');
    expect(nova && nova.k === 'nova' && nova.toll).toBe(`4 SHIPS · ${worlds} WORLD${worlds === 1 ? '' : 'S'}`);
    expect(fx.filter((f) => f.k === 'text' && f.text === 'SCORCHED').length).toBe(worlds);
  });
});

describe('the star burns', () => {
  /** A sector with a burning star that is not the only way between two places. */
  function withFire(): { g: Game; star: GNode; a: number; b: number } {
    for (let seed = 1; seed < 40; seed++) {
      const g = quiet({ seed: 500 + seed, size: 'large' });
      for (const star of g.nodes.filter((n) => n.kind === 'star')) {
        const outside = star.lanes.filter((id) => g.nodes[id].system !== star.system);
        for (const a of outside) {
          for (const b of outside) {
            if (a >= b || !g.pathTo(a, b).includes(star.id)) continue;
            const round = g.pathAvoiding(a, b, (id) => (id === star.id ? 1e9 : 0));
            if (round.length && !round.includes(star.id)) return { g, star, a, b };
          }
        }
      }
    }
    throw new Error('no sector with a star on a loop');
  }

  it('for three minutes, and everything there takes the fire', () => {
    const g = quiet();
    const p = g.player;
    const star = homeStar(g, rivalOf(g).id);
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    const striker = g.spawnUnit('striker', p.id, star.id);
    const dread = g.spawnUnit('dreadnought', p.id, star.id);
    run(g, 12);
    expect(striker.dead).toBe(true);
    expect(dread.dead).toBe(false);
    expect(dread.hp + dread.sh).toBeLessThan(dread.maxHp + dread.maxSh);
    run(g, STARFALL_BURN);
    expect(star.hazard).toBeNull();
    expect(g.fires()).toEqual([]);
    // Afterwards it is a star like any other: one can be armed there again.
    expect(g.checkArm(p.id, device(g, p.id, star.id).id)).toBeNull();
  });

  it('ways go round it where there is another way', () => {
    const { g, star, a, b } = withFire();
    const p = g.player;
    expect(g.pathTo(a, b)).toContain(star.id);
    expect(g.fireOnWay(a, b)).toBeNull();
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    expect(g.fires()).toEqual([star.id]);
    expect(g.pathTo(a, b)).not.toContain(star.id);
    expect(g.pathTo(a, b).length).toBeGreaterThan(0);
    expect(g.fireOnWay(a, b)).toBeNull();
    // Into the system itself there is no other way.
    const inside = star.lanes.find((id) => g.nodes[id].system === star.system)!;
    expect(g.pathTo(a, inside)).toContain(star.id);
    expect(g.fireOnWay(a, inside)).toBe(star);
    // No Starfall can be armed at a star that burns.
    const d2 = device(g, p.id, a);
    d2.node = star.id;
    expect(g.checkArm(p.id, d2.id)).toBe(`${star.name} burns already`);
  });

  it('a ship whose way leads through it waits where it is, and goes on when the fire is out', () => {
    const { g, star, a } = withFire();
    const p = g.player;
    const inside = star.lanes.find((id) => g.nodes[id].system === star.system)!;
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    const u = g.spawnUnit('guardian', p.id, a);
    g.cmdMove(p.id, [u.id], inside);
    run(g, 60);
    expect(u.node).toBe(a);
    expect(u.lane).toBeNull();
    expect(u.path.length).toBeGreaterThan(0);
    expect(u.hp).toBe(u.maxHp);
    run(g, STARFALL_BURN);
    expect(star.hazard).toBeNull();
    expect(u.node).toBe(inside);
    expect(u.hp).toBe(u.maxHp);
  });

  it('ordered through by its house, a ship flies into the fire: a capital ship comes out the other side', () => {
    const { g, star, a } = withFire();
    const p = g.player;
    const inside = star.lanes.find((id) => g.nodes[id].system === star.system)!;
    g.cmdArm(p.id, device(g, p.id, star.id).id);
    run(g, STARFALL_FUSE + 0.2);
    const small = g.spawnUnit('striker', p.id, a);
    const big = g.spawnUnit('dreadnought', p.id, a);
    g.cmdMove(p.id, [small.id, big.id], inside, undefined, undefined, undefined, false, true);
    expect(big.fire).toBe(true);
    let least = Infinity;
    for (let i = 0; i < 90; i++) {
      run(g, 1);
      least = Math.min(least, big.hp + big.sh);
    }
    expect(small.dead).toBe(true);
    expect(big.dead).toBe(false);
    expect(big.node).toBe(inside);
    expect(least).toBeLessThan((big.maxHp + big.maxSh) * 0.95);
    // (The order is done: the next one waits for the fire again.)
    expect(big.fire).toBeUndefined();
  });
});

describe('rival houses and the Starfall', () => {
  it('a Starfall armed at a rival\'s home star with no escort is destroyed in time', () => {
    const g = mk();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    for (let i = 0; i < 8; i++) g.spawnUnit('breaker', r.id, r.capital);
    const d = device(g, p.id, star.id);
    g.cmdArm(p.id, d.id);
    run(g, STARFALL_FUSE + 2);
    expect(d.dead).toBe(true);
    expect(star.hazard).toBeNull();
    expect(g.nodes[r.capital].glow).toBeGreaterThan(ECON.glowStart + 0.1);
  });

  it('against an escort it cannot beat, a rival house saves its ships: they are out of the system when the star erupts', () => {
    const g = mk();
    const p = g.player;
    const r = rivalOf(g);
    const star = homeStar(g, r.id);
    const d = device(g, p.id, star.id);
    for (let i = 0; i < 3; i++) g.spawnUnit('dreadnought', p.id, star.id);
    const fleet = [g.units.get(r.ark)!, ...Array.from({ length: 4 }, () => g.spawnUnit('guardian', r.id, r.capital))];
    g.cmdArm(p.id, d.id);
    run(g, STARFALL_FUSE - 70);
    // With more than a minute to go they are still at home.
    expect(fleet.filter((u) => !u.dead && u.node >= 0 && g.nodes[u.node].system === star.system).length).toBeGreaterThan(2);
    run(g, 70.2);
    expect(burning(star)).toBe(true);
    const saved = fleet.filter((u) => !u.dead);
    expect(saved.length).toBeGreaterThan(2);
    for (const u of saved) expect(g.nodes[u.node >= 0 ? u.node : u.lane!.to].system).not.toBe(star.system);
  });

  it('a rival chooses the star whose system is worth most to its enemies, never one where it holds a world, and on Easy never the player\'s home star', () => {
    const stage = (difficulty: 0 | 1) => {
      const g = quiet({ difficulty });
      const p = g.player;
      const r = rivalOf(g);
      r.ai = { ...mk().factions[r.id].ai! };
      for (let i = 0; i < g.nodes.length; i++) r.explored[i] = 1;
      // The player's home system, built up: worth a Starfall to anyone.
      for (const n of g.nodes) {
        if (n.kind !== 'planet' || n.system !== g.nodes[p.capital].system || n.owner !== -1) continue;
        g.kindleWorld(n, p.id);
        g.setLevel(n, 2);
      }
      r.ai.grudge = p.id;
      r.ai.grudgeAt = g.time;
      return { g, p, r };
    };
    const normal = stage(1);
    expect(starfallStar(normal.g, normal.r)).toBe(homeStar(normal.g, normal.p.id));
    const easy = stage(0);
    expect(starfallStar(easy.g, easy.r)).not.toBe(homeStar(easy.g, easy.p.id));
    // Not where it holds a world itself.
    const mine = normal.g.nodes.find((n) => n.kind === 'planet' && n.system === normal.g.nodes[normal.p.capital].system && n.owner === normal.p.id && n.capitalOf < 0)!;
    mine.owner = normal.r.id;
    expect(starfallStar(normal.g, normal.r)).not.toBe(homeStar(normal.g, normal.p.id));
  });

  it('a rival builds one when its own attacks have got nowhere, not while it is winning by ordinary means', () => {
    const stage = (stalled: boolean) => {
      const g = mk();
      const p = g.player;
      const r = rivalOf(g);
      for (const f of g.factions) if (f.id !== r.id) f.ai = null;
      for (let i = 0; i < g.nodes.length; i++) r.explored[i] = 1;
      for (const n of g.nodes) {
        if (n.kind !== 'planet' || n.system !== g.nodes[p.capital].system || n.owner !== -1) continue;
        g.kindleWorld(n, p.id);
        g.setLevel(n, 2);
      }
      // Minute 20, the Blueprint, the Embers, and a hangar that is full: everything but the reason.
      g.time = 20 * 60;
      g.addCard(r, 'bpStarfall');
      r.ai!.firstAttackAt = 0;
      while (r.hangarUsed < r.hangarCap - 1) {
        g.spawnUnit('striker', r.id, r.capital);
        recomputeHangar(g, r);
      }
      if (stalled) r.ai!.stalled = { n: 1, wall: p.capital };
      for (let i = 0; i < 6; i++) {
        r.embers = 6000;
        run(g, 2);
      }
      return g.nodes[r.capital].shipQ.some((q) => q.id === 'starfall') || !!g.starfallOf(r.id);
    };
    expect(stage(false)).toBe(false);
    expect(stage(true)).toBe(true);
  });

  it('left to themselves, rival houses build one, bring it to an enemy\'s star with their fleet and arm it there', () => {
    // (A sector where it comes to that: since 1.27, with the houses' powers, the one this used, 1015, builds its
    // Starfall at 27 minutes and has not armed it by 45; 1016, 1017 and 1019 arm theirs at 25 to 28.)
    const g = mk({ seed: 1016, size: 'medium', autoplay: true });
    for (const f of g.empires()) g.addCard(f, 'bpStarfall');
    let armedBy = -1;
    let at = -1;
    while (!g.outcome && g.time < 45 * 60 && armedBy < 0) {
      g.step();
      g.fx.length = 0;
      // (Looked for at every tick: what is asked of the moment it is armed, a grudge, can change a second later.)
      const d = g.armedStarfalls()[0];
      if (d) {
        armedBy = d.owner;
        at = d.node;
      }
    }
    expect(armedBy).toBeGreaterThanOrEqual(0);
    const star = g.nodes[at];
    expect(star.kind).toBe('star');
    expect(g.time / 60).toBeGreaterThan(16);
    // Its own worlds are not there, an enemy's are, and its fleet is with it.
    expect(g.nodes.some((n) => n.system === star.system && n.owner === armedBy)).toBe(false);
    expect(g.nodes.filter((n) => n.system === star.system && n.kind === 'planet' && n.owner >= 0).length).toBeGreaterThan(2);
    expect(g.powerAt(star.id, armedBy)).toBeGreaterThan(10);
    // Every other house now holds it against the one that armed it.
    for (const f of g.empires()) if (f.alive && f.id !== armedBy) expect(f.ai!.grudge).toBe(armedBy);
  });
});
