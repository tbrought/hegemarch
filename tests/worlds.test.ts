/** Worlds: kindling them, their roles and levels, what they yield, and what the map says of a place. */
import { describe, expect, it } from 'vitest';
import { ECON } from '../src/game/data/worlds';
import { darkWorld, mk, run } from './helpers';

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
    // The first role given to a newly kindled world costs no time...
    expect(w.fresh).toBe(true);
    expect(g.cmdSetRole(p.id, w.id, 'forge')).toBe(true);
    expect(w.retool).toBe(0);
    expect(w.fresh).toBeFalsy();
    // ...and every change after that does: the world works at neither role meanwhile.
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
    // (Not its first role: that one would cost no time.)
    w.fresh = undefined;
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

describe('the map says what is left', () => {
  it('a place with nothing left in it is known as spent: an opened anomaly, an empty vault, a dead Corsair base, a purged Maw', () => {
    const g = mk({ size: 'medium', forcedVictories: ['conquest', 'crisis', 'relics'] });
    const anomaly = g.nodes.find((n) => n.kind === 'anomaly' && n.anomaly)!;
    const vault = g.nodes.find((n) => n.kind === 'relic' && n.relic)!;
    const base = g.nodes.find((n) => n.kind === 'pirate')!;
    const maw = g.nodes.find((n) => n.kind === 'rift')!;
    for (const n of [anomaly, vault, base, maw]) expect(g.siteSpent(n)).toBe(false);
    anomaly.anomaly = null;
    vault.relic = null;
    g.pirates.alive = false;
    g.crisis!.dead = true;
    for (const n of [anomaly, vault, base, maw]) expect(g.siteSpent(n)).toBe(true);
    // A world or a star is never "spent".
    expect(g.siteSpent(g.nodes[g.player.capital])).toBe(false);
    expect(g.siteSpent(g.nodes.find((n) => n.kind === 'star')!)).toBe(false);
  });
});

describe('a Forge that suits its world builds cheaper (the third playtest)', () => {
  it('its ships cost 15% less there, and it builds no faster than another Forge', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const fit = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.affinityOf(n) === 'forge')!;
    const plain = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && n.size === fit.size && g.affinityOf(n) !== 'forge')!;
    for (const n of [fit, plain]) {
      g.kindleWorld(n, p.id);
      n.role = 'forge';
      n.retool = 0;
      n.level = 1;
    }
    g.flushDeferred();
    const base = g.shipCost(p, 'breaker');
    expect(g.shipCost(p, 'breaker', fit)).toBe(Math.round(base * (1 - ECON.forgeFitDiscount)));
    expect(g.shipCost(p, 'breaker', plain)).toBe(base);
    expect(g.shipCost(p, 'breaker', g.nodes[p.capital])).toBe(base);
    expect(g.forgeMul(fit)).toBe(g.forgeMul(plain));
    // What the queue takes is what the button says.
    p.embers = 5000;
    p.hangarCap = 99;
    g.cmdQueueShip(p.id, fit.id, 'breaker');
    expect(5000 - p.embers).toBe(g.shipCost(p, 'breaker', fit));
  });
});
