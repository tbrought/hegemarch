import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ascend, describePassage } from '../src/game/ages';
import { TICK } from '../src/game/constants';
import { CARDS, CARD_BY_ID } from '../src/game/data/cards';
import { ERAS, LAST_CRADLE_ERA, SPACE, UPGRADE_MAX, UPGRADE_SPREAD } from '../src/game/data/eras';
import { computePaths, generateCradle } from '../src/game/mapgen';
import type { GameConfig, UnitType } from '../src/game/types';
import { art, isTroopArt } from '../src/render/sprites';
import { cradleVocabulary, unitCount, unitName } from '../src/ui/vocab';
import { TIPS } from '../src/ui/Tips';

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
    const hull = old.maxHp;
    const dmg = g.dmgMulOf(old, 'flak');
    advance(g);
    expect(p.era).toBe(1);
    expect(hearth.maxHp).toBeGreaterThan(walls);
    const fresh = g.spawnUnit('guardian', p.id, p.capital);
    expect(fresh.era).toBe(1);
    expect(fresh.maxHp).toBeGreaterThan(hull);
    expect(g.unitPower(fresh)).toBeGreaterThan(power);
    expect(g.dmgMulOf(fresh, 'flak') / dmg).toBeCloseTo(ERAS[1].power / ERAS[0].power, 5);
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

  it('a new age upgrades every unit the house has, wherever it stands, the nearest to the Hearth first', () => {
    const g = cradle();
    const p = g.player;
    const cap = g.nodes[p.capital];
    const far = (n: { x: number; y: number }) => Math.hypot(n.x - cap.x, n.y - cap.y);
    const home = g.unitsOf(p.id).find((u) => u.type === 'guardian')!;
    // A unit far from home, in a land that is not the house's (a quiet one: no beasts to kill it).
    const quiet = g.nodes.filter((n) => n.kind === 'planet' && n.owner === -1 && !n.tag.startsWith('militia')).sort((a, b) => far(b) - far(a))[0];
    const away = g.spawnUnit('striker', p.id, quiet.id);
    // Give the step, and stop at the tick the age begins.
    p.lore = ERAS[0].lore;
    p.embers = Math.max(p.embers, ERAS[0].cost);
    expect(g.cmdAdvance(p.id)).toBe(true);
    for (let i = 0; i < 4000 && p.era === 0; i++) g.step();
    expect(p.era).toBe(1);
    // The change spreads from the Hearth: each unit has a moment of its own, never long.
    expect(away.era).toBe(0);
    expect(away.rearm!).toBeGreaterThan(home.rearm ?? 0);
    expect(away.rearm!).toBeLessThanOrEqual(UPGRADE_MAX);
    expect(away.rearm!).toBeCloseTo(Math.min(UPGRADE_MAX, far(away) / UPGRADE_SPREAD), 1);
    const hull = away.maxHp;
    away.hp = hull / 2;
    // The unit at home changes first...
    for (let i = 0; i < 200 && home.era === 0; i++) g.step();
    expect(home.era).toBe(1);
    expect(away.era).toBe(0);
    // A few seconds later every unit of the house is of the new age, the one abroad too...
    run(g, UPGRADE_MAX + 0.5);
    expect(away.dead).toBeFalsy();
    expect(away.era).toBe(1);
    // ...as much stronger as the age is, and keeping the share of its health it had.
    expect(away.maxHp).toBeCloseTo((hull * ERAS[1].power) / ERAS[0].power, 3);
    expect(away.hp / away.maxHp).toBeCloseTo(0.5, 1);
    expect(g.unitsOf(p.id).every((u) => u.era === 1)).toBe(true);
    // What is built from now on is of the new age from the start.
    expect(g.spawnUnit('guardian', p.id, p.capital).era).toBe(1);
    // The rivals, still in the Stone Age, are untouched.
    const rival = g.empires().find((f) => f.id !== p.id && f.era === 0);
    if (rival) expect(g.unitsOf(rival.id).every((u) => u.era === 0)).toBe(true);
  });

  it('an older unit with no moment set (a run saved by an earlier build) is upgraded at once', () => {
    const g = cradle();
    const p = g.player;
    advance(g);
    run(g, UPGRADE_MAX + 0.5);
    const u = g.unitsOf(p.id)[0];
    u.era = 0;
    u.rearm = undefined;
    g.refreshUnitStats(u);
    g.step();
    expect(u.era).toBe(1);
    // (A count left by the old rule, up to its twenty seconds of rest, never makes a unit wait longer than the spread.)
    u.era = 0;
    u.rearm = 19;
    run(g, UPGRADE_MAX + 0.2);
    expect(u.era).toBe(1);
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
    // (How many lands were still free to kindle depends on how the rivals played.)
    const held = c.worldsOf(old.id).length;
    expect(held).toBeGreaterThanOrEqual(3);
    expect(pass.lands).toBe(held);
    expect(pass.ships).toBe(Math.min(4, Math.floor((held - 1) / 2)));
    expect(pass.ships).toBeGreaterThan(0);
    expect(pass.boons).toBe(old.cards.length);
    const plain = Game.create({ ...c.config, stage: 'stars', houses: 4, seed: 1 });
    const s = ascend(c)!;
    const me = s.player;
    for (const id of old.cards) expect(me.cards).toContain(id);
    expect(me.embers).toBeGreaterThan(plain.player.embers + 500);
    expect(s.unitsOf(me.id).length).toBe(plain.unitsOf(plain.player.id).length + pass.ships);
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
    // The Corsairs keep their distance from the player's arrival, as from the start of a classic run.
    expect(s.pirates.nextRaid).toBeGreaterThan(arrival + 500);
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

describe('the cradle on screen', () => {
  const LINES: UnitType[] = ['scout', 'seed', 'striker', 'guardian', 'breaker', 'militia'];

  it('every age has a picture and a name for every unit line', () => {
    for (let era = 0; era <= LAST_CRADLE_ERA; era++) {
      for (const t of LINES) {
        expect(isTroopArt(t, era), `${ERAS[era].name}: ${t}`).toBe(true);
        const rows = art(t, era);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        for (const r of rows) expect(r.length, `${ERAS[era].name} ${t}: every row as wide as the first`).toBe(rows[0].length);
        expect(rows.join('')).toMatch(/[xd]/);
        expect(ERAS[era].units[t]?.name, `${ERAS[era].name}: a name for ${t}`).toBeTruthy();
      }
      for (const t of ERAS[era].roster) expect(LINES).toContain(t);
    }
    // Among the stars a Striker is the ship it always was.
    expect(isTroopArt('striker', SPACE)).toBe(false);
    expect(unitName('striker', SPACE)).toBe('Striker');
    expect(unitName('striker', 0)).toBe('Hunter');
    expect(unitCount(3, 'guardian', 1)).toBe('3 Spearmen');
    expect(unitCount(1, 'breaker', 3)).toBe('1 Cannon');
    expect(unitCount(2, 'striker', SPACE)).toBe('2 Strikers');
  });

  it('the cradle has its own words, in the way the text was written', () => {
    const stone = cradleVocabulary(0);
    expect(stone('Your Scout waits for orders. Click its fleet badge.')).toBe('Your Runner waits for orders. Click its army badge.');
    expect(stone('Strikers beat Breakers, Breakers beat Guardians and worlds.')).toBe('Hunters beat Hurlers, Hurlers beat Warriors and lands.');
    expect(stone('HANGAR FULL: HOLD MORE WORLDS OR RAISE THEIR LEVEL')).toBe('SUPPLY FULL: HOLD MORE LANDS OR RAISE THEIR LEVEL');
    expect(stone('A seed ship is on its way')).toBe('A firebearer is on its way');
    expect(stone('M WORLD · MINE')).toBe('BROAD LAND · MINE');
    expect(stone('Ride starlanes 30% faster. Ships cost 10% less.')).toBe('Ride paths 30% faster. Units cost 10% less.');
    expect(cradleVocabulary(2)('3 Strikers and a Scout')).toBe('3 Horsemen and a Rider');
    expect(cradleVocabulary(4)('Guardians')).toBe('Tanks');
    // Words inside other words are left alone.
    expect(stone('Worldforge, flagship, friendship')).toBe('Worldforge, flagship, friendship');
  });

  it('saying a text twice changes nothing more, in any age', () => {
    const texts = [...Object.values(TIPS), ...CARDS.filter((c) => c.cradle).map((c) => c.desc), 'Hangar: room for your ships. Every world you hold adds room.', 'Seed Ship · Striker ×3 · the whole sector'];
    for (let era = 0; era <= SPACE; era++) {
      const say = cradleVocabulary(era);
      for (const t of texts) expect(say(say(t)), `${ERAS[era].name}: ${t.slice(0, 40)}`).toBe(say(t));
    }
  });

  it('every age has seven Boons of its own, written in the words of the stars', () => {
    for (let era = 0; era <= LAST_CRADLE_ERA; era++) {
      const own = CARDS.filter((c) => c.cradle && c.age === era);
      expect(own.length, `${ERAS[era].name}: seven Boons`).toBe(7);
      expect(own.filter((c) => c.rarity === 'epic').length, `${ERAS[era].name}: one Epic Boon`).toBe(1);
      for (const c of own) {
        expect(c.icons?.length, `${c.name} says what it affects`).toBeGreaterThan(0);
        // Written like every other Boon ("ships", "worlds"): the cradle's vocabulary does the rest.
        expect(c.desc, `${c.name} is written in the words of the stars`).not.toMatch(/(units?|lands?|paths?|supply|health)/i);
      }
    }
    expect(CARDS.filter((c) => c.cradle).every((c) => c.age !== undefined && c.age >= 0 && c.age <= LAST_CRADLE_ERA)).toBe(true);
  });

  it('on the cradle a Boon is shown in the words of the age, with nothing of the stars left in it', () => {
    for (let era = 0; era <= LAST_CRADLE_ERA; era++) {
      const say = cradleVocabulary(era);
      // A house keeps its Boons: in a later age the earlier ones are read in the later age's words.
      for (const c of CARDS.filter((x) => x.cradle && x.age! <= era)) {
        const shown = say(c.desc);
        expect(shown, `${c.name} in the ${ERAS[era].name}: ${shown}`).not.toMatch(/(ships?|worlds?|starlanes?|hangar|hulls?|Strikers?|Guardians?|Breakers?)/);
        expect(shown, `${c.name}: no word doubled up`).not.toMatch(/(\w+) and /i);
      }
    }
    expect(cradleVocabulary(0)(CARD_BY_ID.hideShields.desc)).toBe('Warriors gain [20% health].');
    expect(cradleVocabulary(0)(CARD_BY_ID.huntingBands.desc)).toBe('Hunters deal [20% more damage].');
    expect(cradleVocabulary(1)(CARD_BY_ID.siegecraft.desc)).toBe('Rams deal [25% more damage].');
    expect(cradleVocabulary(1)(CARD_BY_ID.cityWalls.desc)).toBe('Your lands are [25% tougher].');
    expect(cradleVocabulary(1)(CARD_BY_ID.granaries.desc)).toBe('[+4 supply].');
    expect(cradleVocabulary(3)(CARD_BY_ID.grandBattery.desc)).toBe('Cannons deal [30% more damage] and reach [20% further].');
    expect(cradleVocabulary(4)(CARD_BY_ID.railways.desc)).toBe('Ride paths [35% faster].');
    // The stat lines of a card, and a house's own bonuses.
    expect(cradleVocabulary(2)('Ship hull')).toBe('Unit health');
    expect(cradleVocabulary(2)('World hull')).toBe('Land walls');
    expect(cradleVocabulary(2)('Hearth hull')).toBe('Hearth walls');
    expect(cradleVocabulary(2)('+15% world hull and shields')).toBe('+15% land walls');
    expect(cradleVocabulary(2)('+10% ship shields')).toBe('+10% unit shields');
  });

  it('a house is offered the Boons of its own age, and only those', () => {
    const g = cradle();
    const p = g.player;
    for (let era = 0; era <= LAST_CRADLE_ERA; era++) {
      p.era = era;
      for (let k = 0; k < 12; k++) {
        const offer = g.generateOffer(p);
        expect(offer.length).toBe(3);
        for (const id of offer) expect(CARD_BY_ID[id].age, `${ERAS[era].name}: ${id}`).toBe(era);
      }
    }
    // The house of the old light starts with the Stone Age's Epic Boon, and still has a full choice.
    const ashen = cradle({ heir: 'ashen' });
    expect(ashen.player.cards).toEqual(['oldLight']);
    expect(ashen.generateOffer(ashen.player).length).toBe(4);
  });

  it('a run saved with a Boon that no longer exists still loads', () => {
    const g = cradle();
    const data = JSON.parse(JSON.stringify(g.serialize()));
    data.factions[0].cards = ['masterSmiths', 'firekeepers', 'noSuchBoon'];
    const back = Game.load(data);
    expect(back.player.cards).toEqual(['firekeepers']);
  });
});

describe('the cradle has its own words for what a playtest added', () => {
  it('a fortified land keeps its attackers: no warp, no jump', () => {
    const say = cradleVocabulary(1);
    for (const t of ['ANTI-WARP FIELD: ENEMIES JUMP AWAY 6S SLOWER', 'ANTI-WARP FIELD: YOUR SHIPS JUMP AWAY 6S SLOWER', 'Fortifies the world: [orbital guns], and an [anti-warp field]: enemy ships take 6s longer to jump away.']) {
      const said = say(t);
      expect(said).not.toMatch(/warp|jump|ship|world/i);
      expect(said).toMatch(/ring of walls/i);
      expect(said).toMatch(/march away/i);
    }
  });
});
