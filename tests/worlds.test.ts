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

describe('two houses want one dark world (a playtest of 1.17)', () => {
  /** A dark world, the player's seed ship kindling it, and a rival house that gives no orders of its own. */
  function contested() {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    rival.ai = null;
    const world = darkWorld(g);
    const mine = g.spawnUnit('seed', p.id, world.id);
    expect(g.cmdSendSeed(p.id, mine.id, world.id)).toBe(true);
    return { g, p, rival, world, mine };
  }

  it('their seed ships both kindle it, and the first to finish has it: neither waits for the other', () => {
    const { g, p, rival, world, mine } = contested();
    run(g, 6);
    const head = mine.kindle;
    expect(head).toBeGreaterThan(4);
    // The rival's seed ship arrives six seconds behind.
    const theirs = g.spawnUnit('seed', rival.id, world.id);
    expect(g.cmdSendSeed(rival.id, theirs.id, world.id)).toBe(true);
    run(g, 6);
    // (Until 1.18 each took the other for a defender: both stood at -1 for good, and the player's six seconds were lost.)
    expect(mine.kindle).toBeGreaterThan(head + 4);
    expect(theirs.kindle).toBeGreaterThan(3);
    run(g, ECON.kindleTime);
    expect(world.owner).toBe(p.id);
    expect(mine.dead).toBe(true);
    // The one that lost is called off where it stands. It is not used up.
    expect(theirs.dead).toBe(false);
    expect(theirs.order).toBe('idle');
    expect(g.idleSeed(rival.id)).toBe(theirs);
  });

  it('the player who loses the race is told who won, and the seed ship does the next kindling for free', () => {
    const { g, p, rival, world, mine } = contested();
    const theirs = g.spawnUnit('seed', rival.id, world.id);
    g.cmdSendSeed(rival.id, theirs.id, world.id);
    // The rival's is well ahead.
    theirs.kindle = ECON.kindleTime - 3;
    run(g, 6);
    expect(world.owner).toBe(rival.id);
    expect(mine.dead).toBe(false);
    expect(g.idleSeed(p.id)).toBe(mine);
    expect(g.notes.some((n) => n.text.includes(`${rival.name} kindled ${world.name} first`) && /next KINDLE is free/.test(n.text))).toBe(true);
    const other = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1 && n.id !== world.id)!;
    p.explored[other.id] = 1;
    p.embers = 0;
    expect(g.checkKindle(p.id, other.id)).toBeNull();
    expect(g.cmdKindle(p.id, other.id)).toBe(true);
    expect(g.seedFor(p.id, other.id)).toBe(mine);
  });

  it('only what fights stops a kindling: a Scout or a Starfall of another house does not, a warship does', () => {
    const { g, p, rival, world, mine } = contested();
    g.spawnUnit('scout', rival.id, world.id);
    g.spawnUnit('starfall', rival.id, world.id);
    mine.hp = mine.maxHp = 1e9; // (the Scout has a gun: it is no reason to stop, but it would wear the seed ship down)
    expect(g.kindleBarred(world.id, p.id)).toBe(false);
    expect(g.hasHostiles(world.id, p.id)).toBe(true);
    run(g, 8);
    expect(mine.kindle).toBeGreaterThan(6);
    const warship = g.spawnUnit('guardian', rival.id, world.id);
    expect(g.kindleBarred(world.id, p.id)).toBe(true);
    run(g, 8);
    expect(world.owner).toBe(-1);
    expect(mine.kindle).toBe(-1);
    expect(g.notes.some((n) => n.text.includes(`the warships of ${rival.name} there must be driven off first`))).toBe(true);
    g.killUnit(warship, p.id);
    run(g, ECON.kindleTime + 2);
    expect(world.owner).toBe(p.id);
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

describe('a world of the player\'s falling is told (a playtest of 1.23)', () => {
  const falling = (g: ReturnType<typeof mk>) => g.notes.filter((n) => / is falling: \d+% hull left/.test(n.text));
  it('once a siege, below 30% of its hull, with where it is and who is taking it; never the Hearth', () => {
    const g = mk();
    for (const f of g.factions) f.ai = null;
    const p = g.player;
    const r = g.factions[1];
    const n = darkWorld(g);
    n.owner = p.id;
    g.refreshWorld(n);
    n.sh = 0;
    n.hp = n.maxHp;
    // (A share of its hull: siege weapons hit worlds twice as hard, DMG_TABLE.)
    const hit = (share: number) => g.damagePlanet(n, (n.maxHp * share) / 2, 'siege', r.id);
    hit(0.5);
    expect(falling(g).length).toBe(0);
    hit(0.25);
    expect(n.owner).toBe(p.id);
    expect(falling(g).length).toBe(1);
    expect(falling(g)[0].text).toMatch(new RegExp(`^${n.name} is falling: \\d+% hull left, against ${r.name}!$`));
    expect(falling(g)[0].node).toBe(n.id);
    // (Once a siege: more hits say nothing more.)
    hit(0.05);
    expect(falling(g).length).toBe(1);
    // A new siege, after a lull, may tell it again.
    n.lastHit = 30;
    g.damagePlanet(n, 1, 'siege', r.id);
    expect(falling(g).length).toBe(2);
    // The Hearth has its Last Stand instead.
    const home = g.nodes[p.capital];
    home.sh = 0;
    g.damagePlanet(home, (home.hp * 0.8) / 2, 'siege', r.id);
    expect(home.hp).toBeLessThan(home.maxHp * 0.3);
    expect(falling(g).some((x) => x.node === home.id)).toBe(false);
  });

  it('only the player is told, and a game the AI plays alone keeps no mark of it', () => {
    const g = mk({ autoplay: true });
    const r = g.factions[1];
    const n = darkWorld(g);
    n.owner = g.player.id;
    g.refreshWorld(n);
    n.sh = 0;
    g.damagePlanet(n, (n.maxHp * 0.8) / 2, 'siege', r.id);
    expect(n.hp).toBeLessThan(n.maxHp * 0.3);
    expect(n.falling).toBeUndefined();
  });
});
