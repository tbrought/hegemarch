import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ascend, describePassage } from '../src/game/ages';
import { TICK } from '../src/game/constants';
import { CARDS, CARD_BY_ID } from '../src/game/data/cards';
import { ERAS, LAST_CRADLE_ERA, SPACE } from '../src/game/data/eras';
import { computePaths, generateCradle } from '../src/game/mapgen';
import { REARM_TIME } from '../src/game/systems/production';
import type { GameConfig } from '../src/game/types';

/** An Ages run on its cradle world, with a human player unless `autoplay`. */
function cradle(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, mode: 'ages', stage: 'cradle', ...opts });
}

function classic(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, ...opts });
}

function run(g: Game, seconds: number) {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n && !g.outcome && !g.ascended; i++) {
    g.step();
    g.fx.length = 0;
  }
}

/** Give the player what the next step needs, and take it. */
function advance(g: Game) {
  const p = g.player;
  p.lore = ERAS[p.era].lore;
  p.embers = Math.max(p.embers, ERAS[p.era].cost);
  expect(g.cmdAdvance(p.id)).toBe(true);
  run(g, ERAS[p.era].time + 1);
}

describe('the ages leave a classic run alone', () => {
  it('every house and every unit of a classic run is in the Space Age, at full strength', () => {
    const g = classic();
    expect(g.cradle).toBe(false);
    expect(ERAS[SPACE].power).toBe(1);
    expect(ERAS[SPACE].laneSpeed).toBe(1);
    for (const f of g.factions) expect(f.era).toBe(SPACE);
    for (const u of g.unitList) expect(u.era).toBe(SPACE);
    expect(g.checkAdvance(g.player.id)).not.toBeNull();
  });

  it('never offers a Boon of the cradle, and the cradle never offers any other', () => {
    const ids = new Set(CARDS.map((c) => c.id));
    expect(ids.size, 'every Boon has its own id').toBe(CARDS.length);
    const g = classic();
    for (let i = 0; i < 40; i++) for (const id of g.generateOffer(g.player)) expect(CARD_BY_ID[id].cradle, id).toBeFalsy();
    const c = cradle();
    for (let i = 0; i < 40; i++) for (const id of c.generateOffer(c.player)) expect(CARD_BY_ID[id].cradle, id).toBe(true);
  });
});

describe('the cradle world', () => {
  it('is one connected map of lands, with every Hearth apart from the others', () => {
    for (const houses of [3, 4, 6]) {
      for (let seed = 1; seed <= 25; seed++) {
        const m = generateCradle(seed * 131, { houses });
        expect(m.homes.length).toBe(houses);
        expect(m.nodes.length).toBeGreaterThanOrEqual(houses * 5);
        expect(m.nodes.every((n) => n.kind === 'planet' && n.name.length > 0)).toBe(true);
        const paths = computePaths(m.nodes, m.lanes);
        expect([...paths.dist].every((d) => Number.isFinite(d)), `seed ${seed}: every land reaches every other`).toBe(true);
        for (const a of m.homes) {
          expect(m.nodes[a].lanes.length, 'no Hearth is a dead end').toBeGreaterThanOrEqual(2);
          for (const b of m.homes) if (a !== b) expect(paths.hops[a * m.nodes.length + b], 'a land lies between any two Hearths').toBeGreaterThanOrEqual(2);
        }
        for (const p of m.nodes) for (const q of m.nodes) if (p.id < q.id) expect(Math.hypot(p.x - q.x, p.y - q.y), 'lands do not overlap').toBeGreaterThan(p.well + q.well);
      }
    }
  });

  it('starts every house in the Stone Age: no Ark, no siege units, one Boon to choose', () => {
    for (const heir of ['concord', 'vael', 'wayfarer', 'nyx', 'ironclad', 'ashen']) {
      const g = cradle({ heir });
      expect(g.cradle).toBe(true);
      expect(g.victories).toEqual(['conquest']);
      expect(g.pirates.alive).toBe(false);
      for (const f of g.empires()) {
        expect(f.era).toBe(0);
        expect(f.ark).toBe(-1);
        expect(f.capital).toBeGreaterThanOrEqual(0);
        expect(f.pendingDrafts).toBe(1);
      }
      const mine = g.unitsOf(g.player.id);
      expect(mine.length).toBeGreaterThan(2);
      for (const u of mine) {
        expect(u.era).toBe(0);
        expect(['striker', 'guardian', 'scout']).toContain(u.type);
      }
      expect(g.shipTypesFor(g.player)).toEqual(['striker', 'guardian', 'scout']);
      expect(g.checkShip(g.player.id, g.player.capital, 'breaker')).toBe('Not in this age');
      expect(g.checkArk(g.player.id)).not.toBeNull();
    }
  });

  it('a unit of an early age is weaker than the same unit of a later one, and walls follow the age', () => {
    const g = cradle();
    const p = g.player;
    const old = g.unitsOf(p.id).find((u) => u.type === 'guardian')!;
    const hearth = g.nodes[p.capital];
    const walls = hearth.maxHp;
    const power = g.unitPower(old);
    advance(g);
    expect(p.era).toBe(1);
    expect(hearth.maxHp).toBeGreaterThan(walls);
    const fresh = g.spawnUnit('guardian', p.id, p.capital);
    expect(fresh.era).toBe(1);
    expect(fresh.maxHp).toBeGreaterThan(old.maxHp);
    expect(g.unitPower(fresh)).toBeGreaterThan(power);
    expect(g.dmgMulOf(fresh, 'flak') / g.dmgMulOf(old, 'flak')).toBeCloseTo(ERAS[1].power / ERAS[0].power, 5);
  });
});

describe('climbing the ages', () => {
  it('a step needs the Lore of the age and its Embers, takes time, and can be called off', () => {
    const g = cradle();
    const p = g.player;
    p.embers = 5000;
    p.lore = 0;
    expect(g.checkAdvance(p.id)).toBe('Not enough Lore');
    p.lore = ERAS[0].lore + 30;
    p.embers = 10;
    expect(g.checkAdvance(p.id)).toBe('Not enough Embers');
    p.embers = ERAS[0].cost + 5;
    expect(g.cmdAdvance(p.id)).toBe(true);
    expect(p.lore).toBeCloseTo(30, 5);
    expect(p.embers).toBeCloseTo(5, 5);
    expect(g.checkAdvance(p.id)).toBe('Already under way');
    run(g, 5);
    expect(p.era).toBe(0);
    expect(p.advance!.t).toBeGreaterThan(4);
    expect(g.cmdCancelAdvance(p.id)).toBe(true);
    expect(p.advance).toBeNull();
    expect(p.lore).toBeGreaterThanOrEqual(ERAS[0].lore + 30);
    expect(p.embers).toBeGreaterThanOrEqual(ERAS[0].cost);
  });

  it('Lore is saved for the next age on the cradle, not turned into Boons', () => {
    const g = cradle();
    const p = g.player;
    p.lore = 5000;
    run(g, 3);
    expect(p.boons).toBe(0);
    expect(p.pendingDrafts).toBe(1);
    expect(p.lore).toBeGreaterThan(5000);
  });

  it('a new age brings a Boon, siege units, bastions and higher levels', () => {
    const g = cradle();
    const p = g.player;
    const land = g.nodes.find((n) => n.owner === -1 && !n.tag.startsWith('militia'))!;
    g.kindleWorld(land, p.id);
    p.embers = 9000;
    expect(g.checkUpgrade(p.id, land.id)).toBe('Needs a later age');
    expect(g.checkRole(p.id, land.id, 'bastion')).toBe('Needs a later age');
    expect(g.checkRole(p.id, land.id, 'observatory')).toBeNull();
    g.cmdChooseCard(p.id, g.ensureOffer(p)![0]);
    expect(p.pendingDrafts).toBe(0);
    advance(g);
    expect(p.era).toBe(1);
    expect(p.pendingDrafts).toBe(1);
    expect(CARD_BY_ID[g.ensureOffer(p)![0]].cradle).toBe(true);
    p.embers = 9000;
    expect(g.shipTypesFor(p)).toContain('breaker');
    expect(g.checkShip(p.id, p.capital, 'breaker')).toBeNull();
    expect(g.checkUpgrade(p.id, land.id)).toBeNull();
    expect(g.checkRole(p.id, land.id, 'bastion')).toBeNull();
    g.setLevel(land, 2);
    expect(g.checkUpgrade(p.id, land.id)).toBe('Needs a later age');
    advance(g);
    p.embers = 9000;
    expect(g.checkUpgrade(p.id, land.id)).toBeNull();
  });

  it('the work stands still while the Hearth is under attack', () => {
    const g = cradle();
    const p = g.player;
    p.lore = ERAS[0].lore;
    g.cmdAdvance(p.id);
    run(g, 6);
    const before = p.advance!.t;
    for (let i = 0; i < 100; i++) {
      g.nodes[p.capital].lastHit = 0;
      g.step();
    }
    expect(p.advance!.t).toBeCloseTo(before, 5);
  });

  it('older units are re-armed for the new age after a rest at home, and not while away', () => {
    const g = cradle();
    const p = g.player;
    const home = g.unitsOf(p.id).find((u) => u.type === 'guardian')!;
    const away = g.spawnUnit('striker', p.id, g.nodes.find((n) => n.owner === -1 && !n.tag.startsWith('militia'))!.id);
    // (Rival Runners wander by and take pot shots; a unit that is being shot at is not resting.)
    for (const u of g.unitList) if (u.owner !== p.id && u.type === 'scout') g.killUnit(u, -1);
    advance(g);
    expect(home.era).toBe(0);
    run(g, REARM_TIME + 3);
    expect(home.era).toBe(1);
    expect(home.maxHp).toBeGreaterThan(0);
    expect(away.era).toBe(0);
  });

  it('from the last age the step is the Ark: the player\'s leaves and the game stands still', () => {
    const g = cradle();
    const p = g.player;
    while (p.era < LAST_CRADLE_ERA) {
      advance(g);
      while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)![0]);
    }
    expect(p.era).toBe(LAST_CRADLE_ERA);
    expect(g.ascended).toBe(false);
    advance(g);
    expect(g.ascended).toBe(true);
    expect(p.launchedAt).toBeGreaterThan(0);
    expect(g.outcome).toBeNull();
    const t = g.time;
    g.step();
    expect(g.time).toBe(t);
    expect(p.cards.length).toBe(LAST_CRADLE_ERA + 1);
  });

  it('a rival whose Ark leaves is gone ahead, not beaten: its lands fall dark and the cradle is not won', () => {
    const g = cradle();
    const rivals = g.empires().filter((f) => !f.isPlayer);
    const r = rivals[0];
    const lands = g.nodes.filter((n) => n.owner === -1 && !n.tag.startsWith('militia')).slice(0, 2);
    for (const n of lands) g.kindleWorld(n, r.id);
    r.era = LAST_CRADLE_ERA;
    r.advance = { t: ERAS[LAST_CRADLE_ERA].time - 0.01, total: ERAS[LAST_CRADLE_ERA].time, lore: 0, cost: 0 };
    run(g, 1.5);
    expect(r.launchedAt).toBeGreaterThan(0);
    expect(r.alive).toBe(false);
    expect(g.worldsOf(r.id).length).toBe(0);
    expect(g.unitsOf(r.id).length).toBe(0);
    for (const n of lands) expect(n.owner).toBe(-1);
    // Put out the others: with one Ark already gone, the cradle is still not won.
    for (const o of rivals.slice(1)) g.eliminate(o.id, g.player.id);
    run(g, 3);
    expect(g.outcome).toBeNull();
  });

  it('putting out every rival Hearth before any Ark rises wins the cradle outright', () => {
    const g = cradle();
    for (const o of g.empires().filter((f) => !f.isPlayer)) g.eliminate(o.id, g.player.id);
    run(g, 3);
    expect(g.outcome?.victory).toBe('conquest');
    expect(g.outcome?.playerWon).toBe(true);
  });
});

describe('the cradle played by the AI', () => {
  it('houses climb the ages, fight, and send their Arks to the stars', () => {
    const g = cradle({ seed: 1014, size: 'medium', autoplay: true });
    g.fxEnabled = false;
    const eras = g.empires().map(() => 0);
    for (let i = 0; i < 60 * 60 * 20 && !g.outcome; i++) {
      g.step();
      g.fx.length = 0;
      if (i % 1200 !== 0) continue;
      g.empires().forEach((f, k) => {
        expect(f.era, 'a house never falls back an age').toBeGreaterThanOrEqual(eras[k]);
        eras[k] = f.era;
        expect(Number.isFinite(f.embers) && f.embers >= -1e-6 && Number.isFinite(f.lore) && f.lore >= -1e-6).toBe(true);
      });
      for (const u of g.unitList) {
        if (u.dead) continue;
        expect(Number.isFinite(u.x) && Number.isFinite(u.hp)).toBe(true);
        expect(u.type === 'breaker' ? u.era >= 1 : true, 'no siege unit of the Stone Age').toBe(true);
        expect(u.type).not.toBe('ark');
      }
    }
    const gone = g.empires().filter((f) => f.launchedAt >= 0);
    expect(gone.length, 'at least one Ark left within the hour').toBeGreaterThan(0);
    for (const f of gone) expect(f.launchedAt / 60).toBeGreaterThan(15);
    expect(g.outcome, 'the cradle empties in the end').not.toBeNull();
  });

  it('plays out the same way twice, and a saved cradle continues exactly', () => {
    const a = cradle({ seed: 77, autoplay: true });
    const b = cradle({ seed: 77, autoplay: true });
    a.fxEnabled = false;
    b.fxEnabled = false;
    for (let i = 0; i < 9 * 60 * 20; i++) {
      a.step();
      b.step();
    }
    const snap = (g: Game) => JSON.stringify(g.serialize());
    expect(snap(a)).toBe(snap(b));
    const c = Game.load(JSON.parse(snap(a)));
    c.fxEnabled = false;
    for (let i = 0; i < 6 * 60 * 20; i++) {
      a.step();
      c.step();
    }
    expect(snap(c)).toBe(snap(a));
    expect(a.empires().some((f) => f.era >= 1)).toBe(true);
  });
});

describe('from the cradle to the stars', () => {
  /** A cradle whose player has just seen the Ark leave; `prepare` sets the rivals up first. */
  function leave(prepare: (g: Game, rivals: ReturnType<Game['empires']>) => void, opts: Partial<GameConfig> = {}): Game {
    const g = cradle({ size: 'medium', ...opts });
    const rivals = g.empires().filter((f) => !f.isPlayer);
    // (Far enough in that an Ark can have left a few minutes ago.)
    run(g, 320);
    prepare(g, rivals);
    const p = g.player;
    p.era = LAST_CRADLE_ERA;
    p.advance = { t: ERAS[LAST_CRADLE_ERA].time - 0.01, total: ERAS[LAST_CRADLE_ERA].time, lore: 0, cost: 0 };
    run(g, 2);
    expect(g.ascended).toBe(true);
    return g;
  }

  it('the houses out there are the player and every rival that did not fall', () => {
    const c = leave((g, r) => {
      g.eliminate(r[0].id, r[1].id);
      r[1].launchedAt = g.time - 200;
      r[1].alive = false;
    });
    const rivals = c.empires().filter((f) => !f.isPlayer);
    const pass = describePassage(c);
    expect(pass.rivals.map((r) => r.fate)).toEqual(['fallen', 'ahead', 'behind']);
    const s = ascend(c)!;
    expect(s.cradle).toBe(false);
    expect(s.config.stage).toBe('stars');
    expect(s.empires().map((f) => f.heir)).toEqual([c.player.heir, rivals[1].heir, rivals[2].heir]);
    for (const f of s.empires()) {
      expect(f.era).toBe(SPACE);
      expect(f.capital).toBeGreaterThanOrEqual(0);
      expect(s.units.get(f.ark)?.type).toBe('ark');
    }
    for (const u of s.unitList) expect(u.era).toBe(SPACE);
    expect(s.pirates.alive).toBe(true);
    expect(s.victories.length).toBe(3);
  });

  it('a house keeps the Boons of its ages, and the player is paid for the lands held', () => {
    const c = leave((g) => {
      const p = g.player;
      g.cmdChooseCard(p.id, g.ensureOffer(p)![0]);
      for (const n of g.nodes.filter((x) => x.owner === -1 && !x.tag.startsWith('militia')).slice(0, 4)) g.kindleWorld(n, p.id);
      p.embers = 1000;
    });
    const old = c.player;
    const pass = describePassage(c);
    expect(pass.lands).toBe(5);
    expect(pass.ships).toBe(2);
    expect(pass.boons).toBe(old.cards.length);
    const plain = Game.create({ ...c.config, stage: 'stars', houses: 4, seed: 1 });
    const s = ascend(c)!;
    const me = s.player;
    for (const id of old.cards) expect(me.cards).toContain(id);
    expect(me.embers).toBeGreaterThan(plain.player.embers + 500);
    expect(s.unitsOf(me.id).length).toBe(plain.unitsOf(plain.player.id).length + 2);
    expect(s.computeMods(me)).toEqual(s.computeMods({ ...me, cards: [...old.cards] } as typeof me));
    // Lore makes Boons again out there, and the cradle's own Boons are never offered.
    for (const id of s.generateOffer(me)) expect(CARD_BY_ID[id].cradle).toBeFalsy();
  });

  it('a rival that left earlier has been playing for that long; one still climbing arrives later', () => {
    const c = leave((g, r) => {
      r[0].launchedAt = g.time - 200;
      r[0].alive = false;
      r[1].era = LAST_CRADLE_ERA;
      r[1].lore = ERAS[LAST_CRADLE_ERA].lore;
    });
    const s = ascend(c)!;
    const arrival = s.config.ages!.arrival;
    expect(arrival).toBeCloseTo(200, 0);
    const [me, ahead, behind] = s.empires();
    expect(ahead.asleepUntil).toBe(0);
    expect(me.asleepUntil).toBeCloseTo(arrival, 5);
    expect(behind.asleepUntil).toBeGreaterThan(arrival + 60);
    // Until it arrives a house earns nothing, does nothing, and cannot be hurt or fought.
    const hearth = s.nodes[behind.capital];
    const hp = hearth.hp;
    const embers = behind.embers;
    s.fxEnabled = false;
    while (s.time < arrival) s.step();
    expect(ahead.stats.shipsBuilt + ahead.stats.worldsKindled).toBeGreaterThan(0);
    expect(behind.embers).toBe(embers);
    expect(s.asleep(behind.id)).toBe(true);
    expect(s.hostile(ahead.id, behind.id)).toBe(false);
    // (Its walls rise with the clock like every Hearth's; a blow changes nothing.)
    expect(hearth.hp).toBeGreaterThanOrEqual(hp);
    const before = hearth.hp;
    s.damagePlanet(hearth, 99999, 'siege', ahead.id);
    expect(hearth.hp).toBe(before);
    for (const u of s.unitsOf(behind.id)) expect(u.order).toBe('idle');
    // The player arrives now, untouched, and the last house when its time comes.
    expect(s.nodes[me.capital].hp).toBe(s.nodes[me.capital].maxHp);
    while (s.time < arrival + 2) s.step();
    expect(s.asleep(me.id)).toBe(false);
    expect(me.embers).toBeGreaterThan(0);
    while (s.time < behind.asleepUntil + 2 && s.time < 3000) s.step();
    expect(s.asleep(behind.id)).toBe(false);
    expect(s.hostile(ahead.id, behind.id)).toBe(true);
    expect(behind.embers).toBeGreaterThan(embers);
  });

  it('a game among the stars saved mid-way continues exactly, sleepers and all', () => {
    const c = leave((g, r) => {
      r[0].launchedAt = g.time - 120;
      r[0].alive = false;
    }, { autoplay: false });
    const a = ascend(c)!;
    a.fxEnabled = false;
    for (let i = 0; i < 100 * 20; i++) a.step();
    const snap = (g: Game) => JSON.stringify(g.serialize());
    const b = Game.load(JSON.parse(snap(a)));
    b.fxEnabled = false;
    for (let i = 0; i < 400 * 20; i++) {
      a.step();
      b.step();
    }
    expect(snap(b)).toBe(snap(a));
  });

  it('with no rival left to follow, there is no game among the stars to play', () => {
    const c = leave((g, r) => {
      for (const f of r) g.eliminate(f.id, -1);
    });
    expect(ascend(c)).toBeNull();
  });
});
