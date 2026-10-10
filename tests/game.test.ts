import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { TICK } from '../src/game/constants';
import { BLUEPRINT_IDS, CARDS, CARD_BY_ID } from '../src/game/data/cards';
import { EVENTS } from '../src/game/data/events';
import { HEIRS } from '../src/game/data/heirs';
import { RELICS } from '../src/game/data/relics';
import { TRAITS } from '../src/game/data/traits';
import { UNITS } from '../src/game/data/units';
import { ASCENSION_BOONS, DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget } from '../src/game/data/victories';
import { ECON } from '../src/game/data/worlds';
import type { GameConfig, GNode, UnitType } from '../src/game/types';

function mk(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, ...opts });
}

function run(g: Game, seconds: number) {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
  }
}

function snapshot(g: Game): string {
  return JSON.stringify({
    t: g.time.toFixed(3),
    f: g.factions.map((f) => [f.embers, f.lore, f.boons, f.cards.join(',')]),
    units: g.unitList.filter((u) => !u.dead).map((u) => [u.id, u.type, u.owner, u.x, u.y, u.hp]),
    worlds: g.nodes.map((n) => [n.owner, n.level, n.role, n.glow]),
  });
}

/** The nearest unguarded dark world in the player's home system. */
function darkWorld(g: Game): GNode {
  const p = g.player;
  const n = g.nodes
    .filter((x) => x.kind === 'planet' && x.owner === -1 && x.system === g.nodes[p.capital].system && !g.hasHostiles(x.id, p.id) && !x.tag.startsWith('militia'))
    .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id))[0];
  expect(n).toBeDefined();
  return n;
}

/** A quiet star far from everyone, for staged fights. */
function arena(g: Game): number {
  return g.nodes.find((n) => n.kind === 'star' && !g.systems[n.system].home && g.buckets[n.id].length === 0)!.id;
}

function duel(a: [UnitType, number], b: [UnitType, number], seed = 7): { aLeft: number; bLeft: number } {
  const g = mk({ seed });
  g.factions[1].ai = null; // a fair fight: nobody gives orders
  const at = arena(g);
  const A = Array.from({ length: a[1] }, () => g.spawnUnit(a[0], 0, at));
  const B = Array.from({ length: b[1] }, () => g.spawnUnit(b[0], 1, at));
  for (const u of [...A, ...B]) u.snare = 9999; // nobody leaves
  for (let i = 0; i < 20 * 240 && A.some((u) => !u.dead) && B.some((u) => !u.dead); i++) {
    g.step();
    g.fx.length = 0;
  }
  return { aLeft: A.filter((u) => !u.dead).length, bLeft: B.filter((u) => !u.dead).length };
}

describe('game creation', () => {
  for (const h of HEIRS) {
    it(`starts correctly as ${h.name}`, () => {
      const g = mk({ heir: h.id });
      const p = g.player;
      expect(p.heir).toBe(h.id);
      const hearth = g.nodes[p.capital];
      expect(hearth.owner).toBe(p.id);
      expect(hearth.capitalOf).toBe(p.id);
      expect(hearth.level).toBe(2);
      expect(g.units.get(p.ark)?.type).toBe('ark');
      expect(p.embers).toBe(ECON.startEmbers);
      expect(g.victories).toContain('conquest');
      expect(new Set(g.victories).size).toBe(3);
      expect(p.pendingDrafts).toBe(1);
      expect(g.ensureOffer(p)!.length).toBeGreaterThanOrEqual(3);
      expect(p.hangarCap).toBeGreaterThanOrEqual(ECON.hangarBase);
      expect(p.hangarUsed).toBeLessThanOrEqual(p.hangarCap);
    });
  }
  for (const size of ['small', 'medium', 'large'] as const) {
    it(`creates a ${size} sector`, () => {
      const g = mk({ size });
      expect(g.empires().length).toBe(size === 'small' ? 3 : size === 'medium' ? 4 : 6);
      expect(g.pirates.alive).toBe(true);
      for (const n of g.nodes) if (n.kind === 'planet') expect(['S', 'M', 'L']).toContain(n.size);
    });
  }
});

describe('determinism', () => {
  it('produces identical results for identical seeds (with or without effects)', () => {
    const a = mk({ autoplay: true });
    const b = mk({ autoplay: true });
    b.fxEnabled = false;
    run(a, 150);
    run(b, 150);
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it('survives a save/load round-trip without diverging', () => {
    const a = mk({ autoplay: true, seed: 99 });
    run(a, 120);
    a.ui.tut = 3;
    const save = JSON.parse(JSON.stringify(a.serialize()));
    const b = Game.load(save);
    expect(b.ui.tut).toBe(3);
    run(a, 90);
    run(b, 90);
    expect(snapshot(b)).toBe(snapshot(a));
  });
});

describe('kindling', () => {
  it('kindles a dark world with a seed ship', () => {
    const g = mk();
    const p = g.player;
    const target = darkWorld(g);
    const cost = g.kindleCost(p);
    expect(g.checkKindle(p.id, target.id)).toBeNull();
    expect(g.cmdKindle(p.id, target.id)).toBe(true);
    expect(p.embers).toBeCloseTo(ECON.startEmbers - cost, 5);
    expect(g.seedFor(p.id, target.id)).not.toBeNull();
    expect(g.checkKindle(p.id, target.id)).toMatch(/on its way/);
    run(g, 90);
    expect(target.owner).toBe(p.id);
    expect(target.level).toBe(1);
    expect(target.role).toBe('mine');
    expect(p.stats.worldsKindled).toBe(1);
    expect(target.glow).toBeGreaterThan(ECON.glowStart);
    expect(target.glow).toBeLessThan(1);
    run(g, ECON.glowTime + 5);
    expect(target.glow).toBe(1);
  });

  it('costs more with every world owned', () => {
    const g = mk();
    const p = g.player;
    const c0 = g.kindleCost(p);
    g.kindleWorld(darkWorld(g), p.id);
    expect(g.kindleCost(p)).toBe(c0 + ECON.kindleStep);
  });

  it('waits for guardians to be cleared', () => {
    const g = mk();
    const p = g.player;
    const target = darkWorld(g);
    const sentinel = g.spawnUnit('sentinel', g.guardianId, target.id);
    const seed = g.spawnUnit('seed', p.id, target.id);
    seed.hp = seed.maxHp = 1e9; // survive the sentinel for the test
    expect(g.cmdSendSeed(p.id, seed.id, target.id)).toBe(true);
    run(g, 40);
    expect(target.owner).toBe(-1);
    g.killUnit(sentinel, p.id);
    run(g, 40);
    expect(target.owner).toBe(p.id);
  });

  it('a seed ship whose mission is called off does the next kindling for free; a lost one is reported', () => {
    const g = mk();
    const p = g.player;
    const n = darkWorld(g);
    expect(g.cmdKindle(p.id, n.id)).toBe(true);
    const seed = g.seedFor(p.id, n.id)!;
    // Ordered away (only an order for the seed ship itself does this in the game).
    g.cmdMove(p.id, [seed.id], p.capital);
    expect(g.seedFor(p.id, n.id)).toBeNull();
    expect(g.idleSeed(p.id)).toBe(seed);
    const embers = p.embers;
    p.embers = 0;
    expect(g.checkKindle(p.id, n.id)).toBeNull();
    expect(g.cmdKindle(p.id, n.id)).toBe(true);
    expect(p.embers).toBe(0);
    expect(g.seedFor(p.id, n.id)).toBe(seed);
    p.embers = embers;
    g.killUnit(seed, -1);
    expect(g.notes.some((x) => x.text.includes('seed ship was destroyed on its way to ' + n.name))).toBe(true);
  });

  it('refuses worlds that are not dark', () => {
    const g = mk();
    expect(g.checkKindle(0, g.player.capital)).toMatch(/Already yours/);
    expect(g.checkKindle(0, g.factions[1].capital)).toMatch(/another house/);
  });
});

describe('worlds', () => {
  it('mines make more Embers, roles retool, the Hearth does everything', () => {
    const g = mk();
    const p = g.player;
    const w = darkWorld(g);
    g.kindleWorld(w, p.id);
    w.glow = 1;
    w.lastHit = 999;
    const mine = g.worldEmbers(w);
    expect(g.cmdSetRole(p.id, w.id, 'observatory')).toBe(true);
    expect(w.retool).toBeGreaterThan(0);
    expect(g.worldLore(w)).toBeCloseTo(ECON.worldLore, 5);
    run(g, ECON.retoolTime + 1);
    w.lastHit = 999;
    expect(g.worldEmbers(w)).toBeLessThan(mine);
    expect(g.worldLore(w)).toBeGreaterThan(ECON.worldLore);
    const hearth = g.nodes[p.capital];
    for (const r of ['mine', 'forge', 'observatory', 'bastion'] as const) expect(g.hasRole(hearth, r)).toBe(true);
    expect(g.checkRole(p.id, hearth.id, 'mine')).toMatch(/Hearth/);
    expect(g.worldGun(hearth)).not.toBeNull();
  });

  it('upgrades a world to a higher level', () => {
    const g = mk();
    const p = g.player;
    const w = darkWorld(g);
    g.kindleWorld(w, p.id);
    p.embers = 5000;
    const hp = w.maxHp;
    const cap = p.hangarCap;
    expect(g.cmdUpgrade(p.id, w.id)).toBe(true);
    expect(g.checkUpgrade(p.id, w.id)).toMatch(/rising/);
    run(g, ECON.upgradeTime[2] + 1);
    expect(w.level).toBe(2);
    expect(w.maxHp).toBeGreaterThan(hp);
    expect(p.hangarCap).toBe(cap + 1);
  });

  it('Hangar Bays add room at a rising price', () => {
    const g = mk();
    const p = g.player;
    p.embers = 5000;
    const cap = p.hangarCap;
    const c1 = g.bayCost(p);
    expect(g.cmdBuyBay(p.id)).toBe(true);
    expect(p.hangarCap).toBe(cap + ECON.bayHangar);
    expect(g.bayCost(p)).toBeGreaterThan(c1);
    expect(p.embers).toBe(5000 - c1);
    p.embers = 0;
    expect(g.checkBay(p.id)).toBe('Not enough Embers');
  });

  it('bastions get guns and forges build ships', () => {
    const g = mk();
    const p = g.player;
    const w = darkWorld(g);
    g.kindleWorld(w, p.id);
    p.embers = 5000;
    expect(g.worldGun(w)).toBeNull();
    expect(g.checkShip(p.id, w.id, 'striker')).toMatch(/Forges/);
    g.cmdSetRole(p.id, w.id, 'forge');
    expect(g.checkShip(p.id, w.id, 'striker')).toMatch(/Retooling/);
    run(g, ECON.retoolTime + 1);
    expect(g.cmdQueueShip(p.id, w.id, 'striker')).toBe(true);
    g.cmdSetRole(p.id, w.id, 'bastion');
    expect(w.shipQ.length).toBe(0); // refunded
    run(g, ECON.retoolTime + 1);
    expect(g.worldGun(w)).not.toBeNull();
  });
});

describe('ships and combat', () => {
  it('builds ships, deducts cost and refunds cancellations', () => {
    const g = mk();
    const p = g.player;
    const e0 = p.embers;
    const cost = g.shipCost(p, 'guardian');
    expect(g.cmdQueueShip(p.id, p.capital, 'guardian')).toBe(true);
    expect(p.embers).toBeCloseTo(e0 - cost, 5);
    const count = () => g.unitsOf(p.id).filter((u) => u.type === 'guardian').length;
    const n0 = count();
    run(g, UNITS.guardian.buildTime + 1);
    expect(count()).toBe(n0 + 1);
    const e1 = p.embers;
    expect(g.cmdQueueShip(p.id, p.capital, 'striker')).toBe(true);
    expect(g.cmdCancel(p.id, p.capital, 'ship', 0)).toBe(true);
    expect(p.embers).toBeCloseTo(e1, 5);
  });

  it('rejects invalid production', () => {
    const g = mk();
    const p = g.player;
    expect(g.checkShip(p.id, p.capital, 'lancer')).toMatch(/Blueprint/);
    expect(g.checkShip(p.id, g.factions[1].capital, 'striker')).toBe('Not your world');
    p.embers = 0;
    expect(g.checkShip(p.id, p.capital, 'striker')).toBe('Not enough Embers');
    p.embers = 1e6;
    p.hangarUsed = p.hangarCap;
    expect(g.checkShip(p.id, p.capital, 'striker')).toBe('Hangar full');
  });

  it('blueprints unlock new ships', () => {
    const g = mk();
    const p = g.player;
    p.embers = 5000;
    expect(g.shipTypesFor(p)).not.toContain('carrier');
    g.addCard(p, 'bpCarrier');
    expect(g.shipTypesFor(p)).toContain('carrier');
    expect(g.cmdQueueShip(p.id, p.capital, 'carrier')).toBe(true);
    g.addCard(p, 'bpStarbase');
    expect(g.cmdQueueStarbase(p.id, p.capital)).toBe(true);
    expect(g.checkStarbase(p.id, p.capital)).toMatch(/One Starbase/);
  });

  it('follows the triangle: Strikers beat Breakers, Breakers beat Guardians, Guardians beat Strikers', () => {
    // Equal Ember budgets.
    const sb = duel(['striker', 9], ['breaker', 4]);
    expect(sb.aLeft).toBeGreaterThan(0);
    expect(sb.bLeft).toBe(0);
    const bg = duel(['breaker', 4], ['guardian', 5]);
    expect(bg.aLeft).toBeGreaterThan(0);
    expect(bg.bLeft).toBe(0);
    const gs = duel(['guardian', 5], ['striker', 9]);
    expect(gs.aLeft).toBeGreaterThan(0);
    expect(gs.bLeft).toBe(0);
  });

  it('battles take a while to resolve', () => {
    const g = mk({ seed: 3 });
    const at = arena(g);
    const A = Array.from({ length: 6 }, () => g.spawnUnit('guardian', 0, at));
    const B = Array.from({ length: 6 }, () => g.spawnUnit('guardian', 1, at));
    for (const u of [...A, ...B]) u.snare = 9999;
    run(g, 20);
    expect(A.some((u) => !u.dead) && B.some((u) => !u.dead)).toBe(true);
  });

  it('levels up capital ships and offers abilities', () => {
    const g = mk();
    const ark = g.units.get(g.player.ark)!;
    g.grantLevels(ark, 2);
    expect(ark.level).toBe(3);
    expect(ark.pendingAbil.length).toBe(1);
    const pick = ark.pendingAbil[0][0];
    expect(g.cmdChooseAbility(g.player.id, ark.id, pick)).toBe(true);
    expect(ark.abil.map((a) => a.id)).toContain(pick);
  });

  it('lets anyone strike from the first minute; AI houses hold fire until provoked', () => {
    const g = mk();
    const rival = g.nodes[g.factions[1].capital];
    const hp = rival.hp + rival.sh;
    g.damagePlanet(rival, 5000, 'siege', 0);
    expect(rival.hp + rival.sh).toBeLessThan(hp);
    // An AI that has not started its attacks does not fire on rival worlds by accident...
    expect(g.holdsFire(1, 0)).toBe(true);
    expect(g.holdsFire(0, 1)).toBe(false);
    // ...until that rival hits it: then it answers.
    run(g, 3);
    expect(g.factions[1].ai!.grudge).toBe(0);
    expect(g.holdsFire(1, 0)).toBe(false);
  });

  it('taking a Hearth pays out a free Boon and half the hoard', () => {
    const g = mk();
    const p = g.player;
    g.cmdSkipDraft(p.id);
    const r = g.factions[1];
    r.embers = 4000;
    const e0 = p.embers;
    g.planetDefeated(g.nodes[r.capital], p.id);
    g.flushDeferred();
    expect(r.alive).toBe(false);
    expect(p.pendingDrafts).toBe(1);
    expect(p.embers - e0).toBe(2000);
  });
});

describe('boons', () => {
  it('drafts boons and applies their modifiers', () => {
    const g = mk();
    const p = g.player;
    const offer = g.ensureOffer(p)!;
    expect(new Set(offer).size).toBe(offer.length);
    expect(g.cmdChooseCard(p.id, offer[0])).toBe(true);
    expect(p.pendingDrafts).toBe(0);
    expect(p.cards).toContain(offer[0]);
    const ark = g.units.get(p.ark)!;
    const before = ark.maxHp;
    const k = 1 + p.mods.hull;
    g.addCard(p, 'hardHulls');
    expect(ark.maxHp).toBeCloseTo((before * (k + 0.12)) / k, 3);
  });

  it('turns full Lore into a Boon', () => {
    const g = mk();
    const p = g.player;
    g.cmdSkipDraft(p.id);
    p.lore = g.boonCostOf(p) - 0.01;
    run(g, 1);
    expect(p.boons).toBe(1);
    expect(p.pendingDrafts).toBe(1);
  });

  it('never offers boons beyond their stack limit, nor more than one pact', () => {
    const g = mk();
    const p = g.player;
    g.addCard(p, 'quantum');
    p.pendingDrafts = 1;
    for (let i = 0; i < 200; i++) {
      const o = g.generateOffer(p);
      expect(o).not.toContain('quantum');
      expect(o.filter((id) => CARD_BY_ID[id].pact).length).toBeLessThanOrEqual(1);
      for (const id of o) if (CARD_BY_ID[id].requires) expect(p.cards).toContain(CARD_BY_ID[id].requires);
    }
  });

  it('guarantees a Blueprint after four drafts without one', () => {
    const g = mk({ seed: 31 });
    const p = g.player;
    for (let i = 0; i < 30; i++) {
      p.bpPity = 4;
      const o = g.generateOffer(p);
      expect(o.some((id) => BLUEPRINT_IDS.includes(id))).toBe(true);
      expect(p.bpPity).toBe(0);
    }
  });

  it('applies every boon without errors', () => {
    for (const c of CARDS) {
      const g = mk();
      const p = g.player;
      if (c.requires) g.addCard(p, c.requires);
      expect(() => g.addCard(p, c.id)).not.toThrow();
      const m = p.mods;
      for (const v of [m.dmg, m.hull, m.shield, m.embers, m.lore, m.speed, m.hangar]) expect(Number.isFinite(v)).toBe(true);
      run(g, 2);
      expect(Number.isFinite(p.embers)).toBe(true);
    }
  });
});

describe('events and threats', () => {
  it('resolves every event choice without errors', () => {
    for (const ev of EVENTS) {
      ev.choices.forEach((choice, idx) => {
        const g = mk({ seed: 10 + idx });
        const p = g.player;
        p.embers = 5000;
        const ship = g.spawnUnit('guardian', p.id, p.capital);
        const ctx = { node: p.capital, unit: ship.id };
        if (choice.cond && !choice.cond(g, p, ctx)) return;
        const text = choice.run(g, p, ctx);
        expect(typeof text).toBe('string');
        run(g, 1);
      });
    }
  });

  it('rolls two omens and applies every omen cleanly', () => {
    const g = mk();
    expect(g.traits.length).toBe(2);
    expect(new Set(g.traits).size).toBe(2);
    for (const t of TRAITS) {
      const h = mk({ seed: 77 });
      const costBefore = h.boonCostOf(h.player);
      h.traits = [t.id];
      t.apply?.(h);
      for (const f of h.factions) h.recomputeMods(f);
      if (t.id === 'discovery') expect(h.boonCostOf(h.player)).toBeLessThan(costBefore);
      run(h, 3);
      expect(Number.isFinite(h.player.embers)).toBe(true);
    }
  });

  it('player prompts resolve through the command API', () => {
    const g = mk();
    g.prompts.push({ id: 999, event: 'comet', node: g.player.capital, unit: -1 });
    const e0 = g.player.embers;
    expect(g.cmdResolvePrompt(999, 0)).toBeTruthy();
    expect(g.player.embers).toBe(e0 + 250);
    expect(g.cmdResolvePrompt(999, 0)).toBeNull();
  });

  it('launches pirate raids at houses and asks to pause for the first one', () => {
    const g = mk();
    g.pirates.nextRaid = 1;
    run(g, 2);
    expect(g.pirates.raids.length).toBe(1);
    const raid = g.pirates.raids[0];
    expect(g.factions[raid.victim].kind).toBe('empire');
    expect(raid.units.length).toBeGreaterThan(0);
  });

  it('spawns a feeble tutorial raider', () => {
    const g = mk();
    const w = darkWorld(g);
    g.kindleWorld(w, 0);
    const r = g.spawnTutorialRaider(w.id)!;
    expect(r.owner).toBe(g.pirateId);
    expect(g.dmgMulOf(r, 'rapid')).toBeLessThan(0.5);
  });
});

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

describe('capture and victory', () => {
  it('taking a Hearth puts out its house; conquest ends the run', () => {
    const g = mk();
    const p = g.player;
    const r1 = g.factions[1];
    g.planetDefeated(g.nodes[r1.capital], p.id);
    g.flushDeferred();
    expect(r1.alive).toBe(false);
    expect(g.outcome).toBeNull();
    const r2 = g.factions[2];
    g.planetDefeated(g.nodes[r2.capital], p.id);
    g.flushDeferred();
    run(g, 2);
    expect(g.outcome?.victory).toBe('conquest');
    expect(g.outcome?.playerWon).toBe(true);
  });

  it('losing your Hearth is a defeat', () => {
    const g = mk();
    g.planetDefeated(g.nodes[g.player.capital], 1);
    g.flushDeferred();
    expect(g.outcome?.victory).toBe('defeat');
    expect(g.outcome?.playerWon).toBe(false);
  });

  it('dominion requires holding the share for the full duration', () => {
    const g = mk({ forcedVictories: ['conquest', 'domination', 'relics'], difficulty: 0 });
    const need = Math.ceil(g.worldCount * DOMINATION_SHARE);
    let owned = g.worldsOf(0).length;
    for (const n of g.nodes) {
      if (owned >= need) break;
      if (n.kind !== 'planet' || n.owner !== -1) continue;
      g.kindleWorld(n, 0);
      owned++;
    }
    run(g, DOMINATION_HOLD - 20);
    expect(g.outcome).toBeNull();
    run(g, 30);
    expect(g.outcome?.victory).toBe('domination');
  });

  it('Ember Hoard requires holding the hoard', () => {
    const g = mk({ forcedVictories: ['conquest', 'treasury', 'relics'], difficulty: 0 });
    g.player.embers = treasuryTarget('small') + 2000;
    run(g, TREASURY_HOLD - 10);
    expect(g.outcome).toBeNull();
    run(g, 15);
    expect(g.outcome?.victory).toBe('treasury');
  });

  it('relic victory requires holding enough relics', () => {
    const g = mk({ forcedVictories: ['conquest', 'relics', 'treasury'], difficulty: 0 });
    const need = relicsRequired(g.relicTotal);
    g.player.relics = RELICS.slice(0, need).map((r) => r.id);
    g.recomputeMods(g.player);
    run(g, RELIC_HOLD - 10);
    expect(g.outcome).toBeNull();
    run(g, 15);
    expect(g.outcome?.victory).toBe('relics');
  });

  it('the Starfire Gate charges to Ascension', () => {
    const g = mk({ forcedVictories: ['conquest', 'ascension', 'relics'], difficulty: 0 });
    const p = g.player;
    p.embers = 20000;
    expect(g.checkGate(p.id, p.capital)).toMatch(/Boons/);
    p.boons = ASCENSION_BOONS;
    expect(g.cmdQueueGate(p.id, p.capital)).toBe(true);
    run(g, UNITS.gate.buildTime + 2);
    expect(p.gate).not.toBeNull();
    run(g, GATE_CHARGE + 5);
    expect(g.outcome?.victory).toBe('ascension');
  });

  it('destroying the Rift Heart wins Purge the Void', () => {
    const g = mk({ forcedVictories: ['conquest', 'crisis', 'relics'] });
    expect(g.crisis).not.toBeNull();
    g.crisis!.awakenAt = 0.5;
    run(g, 1);
    const heart = g.units.get(g.crisis!.heart)!;
    expect(heart.type).toBe('heart');
    g.killUnit(heart, g.player.id);
    g.flushDeferred();
    expect(g.outcome?.victory).toBe('crisis');
  });
});
