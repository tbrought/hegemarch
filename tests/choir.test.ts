/**
 * The houses that changed in October 2026: the Nyx Collective became the Lyceum Collective, and the
 * Choir of the First Flame took the place of the Ironclad Dominion. The Choir's rules: its Ark turns
 * ships (Conversion), a world it takes is not sacked, a ship it loses is a martyr to the rest (Zeal),
 * and it does not run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/Game';
import { TICK } from '../src/game/constants';
import { ABILITY_BY_ID, CONVERT_HULL, CONVERT_HULL_PER_LEVEL, CONVERT_MEND, LEARNABLE_ABILITIES } from '../src/game/data/abilities';
import { heirIdNow, HEIR_BY_ID, HEIRS, houseShort, ZEAL_MAX, ZEAL_STEP, ZEAL_TIME } from '../src/game/data/heirs';
import { UNITS } from '../src/game/data/units';
import { convertible } from '../src/game/systems/abilities';
import { recomputeHangar } from '../src/game/systems/economy';
import type { GameConfig, Unit, UnitType } from '../src/game/types';
import { loadProfile } from '../src/meta/profile';
import { GLOSS_BY_ID } from '../src/ui/glossary';

function mk(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'medium', difficulty: 1, heir: 'choir', perks: {}, unlockLegendary: true, unlockPacts: true, ...opts });
}

function run(g: Game, seconds: number) {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
  }
}

const rivalOf = (g: Game) => g.empires().find((f) => f.id !== g.playerId)!;
const arkOf = (g: Game, fid: number) => g.unitList.find((u) => u.owner === fid && u.type === 'ark' && !u.dead)!;
/** Ships of a house beside a ship (in range of anything it does). */
function beside(g: Game, at: Unit, owner: number, types: UnitType[]): Unit[] {
  return types.map((t, i) => g.spawnUnit(t, owner, at.node, { x: at.x + 60 + i * 12, y: at.y + 40 }));
}
/** The Ark's Conversion, now: one tick of the game with the ability ready. */
function cast(g: Game, ark: Unit) {
  ark.abil.find((a) => a.id === 'conversion')!.cd = 0;
  g.step();
}

describe('the houses', () => {
  it('are six, each with an Ark ability that exists; two of them have new names', () => {
    expect(HEIRS.length).toBe(6);
    expect(new Set(HEIRS.map((h) => h.id)).size).toBe(6);
    for (const h of HEIRS) expect(ABILITY_BY_ID[h.signature], h.name).toBeTruthy();
    expect(HEIRS.map((h) => h.name)).toEqual(['Solar Concord', 'Vael Imperium', 'Wayfarer Clans', 'Lyceum Collective', 'Choir of the First Flame', 'Ashen Remnant']);
    expect(HEIRS.some((h) => /Nyx|Ironclad/.test(`${h.name} ${h.hearth} ${h.desc}`))).toBe(false);
    // (A sector is dealt the houses in the order they stand in, so a seed deals what it always dealt.)
    expect(HEIRS.map((h) => h.color)).toEqual(['#ffd23f', '#e0402f', '#2fd5a6', '#b05cff', '#3fa7ff', '#ff8a1f']);
  });

  it('the Choir of the First Flame has a short name for where there is no room; the others are short enough', () => {
    expect(houseShort('choir', HEIR_BY_ID.choir.name)).toBe('The Choir');
    for (const h of HEIRS) {
      if (h.id !== 'choir') expect(houseShort(h.id, h.name)).toBe(h.name);
      expect(houseShort(h.id, h.name).length).toBeLessThanOrEqual(17);
    }
    const g = mk();
    expect(g.shortName(g.player)).toBe('The Choir');
    expect(g.shortName(rivalOf(g))).toBe(rivalOf(g).name);
  });

  it('a profile and a run saved before the change name the houses as they were, and load as they are', () => {
    expect([heirIdNow('nyx'), heirIdNow('ironclad'), heirIdNow('concord')]).toEqual(['lyceum', 'choir', 'concord']);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({
          heirs: ['concord', 'nyx', 'ironclad'], winsByHeir: { ironclad: 2, nyx: 1, concord: 4 },
          history: [{ date: '2026-10-01', heir: 'ironclad', size: 'small', difficulty: 1, won: true, victory: 'conquest', time: 900, legacy: 80, seed: 1, daily: false }],
        }),
      },
    });
    const p = loadProfile();
    expect(p.heirs).toEqual(['concord', 'lyceum', 'choir']);
    expect(p.winsByHeir).toEqual({ choir: 2, lyceum: 1, concord: 4 });
    expect(p.history[0].heir).toBe('choir');
    // A run in which the player was the Ironclad Dominion, and a rival the Nyx Collective.
    const g = mk({ heir: 'choir', aiHeirs: ['lyceum', 'vael', 'concord', 'wayfarer', 'ashen'] });
    const data = JSON.parse(JSON.stringify(g.serialize()));
    data.config.heir = 'ironclad';
    data.config.aiHeirs[0] = 'nyx';
    for (const f of data.factions) {
      if (f.heir === 'choir') Object.assign(f, { heir: 'ironclad', name: 'Ironclad Dominion' });
      if (f.heir === 'lyceum') Object.assign(f, { heir: 'nyx', name: 'Nyx Collective' });
    }
    const again = Game.load(data);
    expect(again.config.heir).toBe('choir');
    expect(again.config.aiHeirs![0]).toBe('lyceum');
    expect(again.player.name).toBe('Choir of the First Flame');
    expect(again.empires().map((f) => f.name)).toContain('Lyceum Collective');
    expect(again.empires().some((f) => /Nyx|Ironclad/.test(f.name))).toBe(false);
    // It plays on as the house it is now.
    run(again, 5);
    expect(again.player.mods.flags.zeal).toBe(ZEAL_STEP);
  });

  afterEach(() => void vi.unstubAllGlobals());
});

describe('Conversion', () => {
  it('is the Choir\'s alone: its Ark has it from the start, and no other ship ever learns it', () => {
    const g = mk();
    expect(arkOf(g, g.playerId).abil.map((a) => a.id)).toEqual(['conversion']);
    expect(LEARNABLE_ABILITIES.some((a) => a.id === 'conversion')).toBe(false);
    expect(LEARNABLE_ABILITIES.some((a) => a.id === 'emp')).toBe(true);
    expect(GLOSS_BY_ID['ab-conversion']).toBeTruthy();
    expect(GLOSS_BY_ID.zeal.text).toMatch(/5% more damage/);
  });

  it('the weakest enemy ships in range change sides, as much hull as the Ark can turn, and say so', () => {
    const g = mk();
    const p = g.player;
    const rival = rivalOf(g);
    const ark = arkOf(g, p.id);
    const [a, b, c] = beside(g, ark, rival.id, ['striker', 'striker', 'striker']);
    a.hp = 300;
    b.hp = 40;
    c.hp = 200;
    b.order = 'attack';
    b.target = ark.id;
    const lostBefore = rival.stats.shipsLost;
    recomputeHangar(g, p);
    recomputeHangar(g, rival);
    const hangar = [p.hangarUsed, rival.hangarUsed];
    cast(g, ark);
    // 1000 hull at level 1: two Strikers of 380, the two nearest to breaking.
    expect(CONVERT_HULL).toBe(1000);
    expect([a.owner, b.owner, c.owner]).toEqual([rival.id, p.id, p.id]);
    expect([b.order, b.target, b.dest]).toEqual(['idle', 0, -1]);
    expect(b.stun).toBeGreaterThan(1);
    expect(b.dead).toBe(false);
    // They are the Choir's ships now, and the other house's loss. They were never built here: they
    // take no room in the Choir's hangar (and leave room in the one they left).
    expect(rival.stats.shipsLost).toBe(lostBefore + 2);
    expect([p.hangarUsed, rival.hangarUsed]).toEqual([hangar[0], hangar[1] - 2 * UNITS.striker.hangar]);
    expect([b.guest, c.guest, a.guest]).toEqual([true, true, undefined]);
    // The weakest go over first, and a wreck is no gain: they are patched up to half their hull.
    expect(CONVERT_MEND).toBe(0.5);
    // (The one that had 40 hull left has half; the one that had more than half keeps what it had.)
    expect(b.hp).toBeGreaterThanOrEqual(b.maxHp * CONVERT_MEND);
    expect(b.hp).toBeLessThan(b.maxHp * (CONVERT_MEND + 0.02));
    expect(c.hp).toBeGreaterThanOrEqual(200);
    expect(c.hp).toBeLessThan(205);
    expect(b.sh).toBe(b.maxSh);
    expect(g.notes[g.notes.length - 1].text).toMatch(/^Converted at .+: 2 Strikers\. They are yours now\.$/);
    expect(g.fx.some((f) => f.k === 'text' && f.text === 'CONVERTED 2')).toBe(true);
    // The ability has been used: it is not ready again at once.
    expect(ark.abil[0].cd).toBeGreaterThan(30);
    // And they fight for their new house: the ship left behind is their enemy.
    run(g, 6);
    expect(a.dead || a.hp < 300).toBe(true);
  });

  it('an Ark that has risen turns more: a Breaker from level 2', () => {
    const g = mk();
    const ark = arkOf(g, g.playerId);
    const [breaker] = beside(g, ark, rivalOf(g).id, ['breaker']);
    cast(g, ark);
    expect(breaker.owner).toBe(rivalOf(g).id);
    // (Nothing to turn: the ability waits, it is not spent.)
    expect(ark.abil[0].cd).toBeLessThan(1);
    ark.level = 2;
    expect(CONVERT_HULL + CONVERT_HULL_PER_LEVEL).toBeGreaterThanOrEqual(UNITS.breaker.hull);
    cast(g, ark);
    expect(breaker.owner).toBe(g.playerId);
  });

  it('never an Ark, a Dreadnought, a Carrier, a seed ship or a Starbase; the Hollow hear no one; a Corsair can be talked round', () => {
    const g = mk();
    const p = g.player;
    const rival = rivalOf(g);
    const ark = arkOf(g, p.id);
    ark.level = 8;
    const big = beside(g, ark, rival.id, ['dreadnought', 'carrier', 'seed', 'starbase', 'ark']);
    const hollow = beside(g, ark, g.crisisId, ['drone', 'drone']);
    const [raider] = beside(g, ark, g.pirateId, ['raider']);
    g.pirates.raids.push({ id: 99, target: ark.node, victim: p.id, units: [raider.id], phase: 'travel', lootT: 0, since: g.time });
    for (const u of [...big, ...hollow]) expect(convertible(g, u), u.type).toBe(false);
    expect(convertible(g, raider)).toBe(true);
    cast(g, ark);
    for (const u of [...big, ...hollow]) expect(u.owner, u.type).not.toBe(p.id);
    expect(raider.owner).toBe(p.id);
    expect(g.pirates.raids.find((r) => r.id === 99)!.units).toEqual([]);
  });

  it('shots in flight between a ship and its new friends are lost', () => {
    const g = mk();
    const p = g.player;
    const ark = arkOf(g, p.id);
    const [striker] = beside(g, ark, rivalOf(g).id, ['striker']);
    g.projectiles.push({ id: g.nextId++, owner: p.id, src: ark.id, x: ark.x, y: ark.y, px: ark.x, py: ark.y, tgt: striker.id, tx: striker.x, ty: striker.y, speed: 100, dmg: 5000, type: 'rapid', kind: 'bolt', node: ark.node, life: 3, wob: 0 } as never);
    g.projectiles.push({ id: g.nextId++, owner: striker.owner, src: striker.id, x: striker.x, y: striker.y, px: striker.x, py: striker.y, tgt: ark.id, tx: ark.x, ty: ark.y, speed: 100, dmg: 5000, type: 'rapid', kind: 'bolt', node: ark.node, life: 3, wob: 0 } as never);
    g.convertUnits([striker], p.id, ark);
    expect(g.projectiles.length).toBe(0);
    expect(striker.owner).toBe(p.id);
  });

  it('a rival Choir turns the player\'s ships, and the log says which: no ship is lost silently', () => {
    const g = mk({ heir: 'concord', aiHeirs: ['choir', 'vael', 'wayfarer', 'lyceum', 'ashen'] });
    const p = g.player;
    const choir = g.empires().find((f) => f.heir === 'choir')!;
    const ark = arkOf(g, choir.id);
    const mine = beside(g, ark, p.id, ['striker', 'guardian']);
    mine[0].hp = 50;
    const lost = p.stats.shipsLost;
    cast(g, ark);
    expect(mine[0].owner).toBe(choir.id);
    expect(mine[1].owner).toBe(p.id);
    const note = g.notes.find((n) => /^Gone over to Choir of the First Flame at /.test(n.text))!;
    expect(note.text).toMatch(/: 1 Striker\.$/);
    expect(note.kind).toBe('bad');
    expect(p.stats.shipsLost).toBe(lost + 1);
  });

  it('a ship that has gone over is the same ship after a save', () => {
    const g = mk();
    const ark = arkOf(g, g.playerId);
    const [s] = beside(g, ark, rivalOf(g).id, ['striker']);
    cast(g, ark);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.units.get(s.id)!.owner).toBe(g.playerId);
    expect(again.units.get(s.id)!.guest).toBe(true);
    for (let i = 0; i < 200; i++) {
      g.step();
      again.step();
    }
    g.fx.length = 0;
    again.fx.length = 0;
    expect(JSON.stringify(again.serialize())).toBe(JSON.stringify(g.serialize()));
  });
});

describe('Zeal', () => {
  /** Four of the house's Strikers at an empty world, and a rival to lose them to. */
  function fleet(g: Game, fid: number) {
    const n = g.nodes.find((x) => x.kind === 'star' && g.buckets[x.id].length === 0)!;
    return [0, 1, 2, 3, 4, 5, 6, 7].map(() => g.spawnUnit('striker', fid, n.id));
  }

  it('each ship the Choir loses makes the rest at that world deal 5% more damage, up to 25%', () => {
    const g = mk();
    const ships = fleet(g, g.playerId);
    const far = g.spawnUnit('striker', g.playerId, g.player.capital);
    const base = g.dmgMulOf(ships[7], 'rapid');
    for (let i = 0; i < 7; i++) {
      g.killUnit(ships[i], rivalOf(g).id);
      const stacks = Math.min(ZEAL_MAX, i + 1);
      expect(g.dmgMulOf(ships[7], 'rapid') / base).toBeCloseTo(1 + ZEAL_STEP * stacks, 6);
    }
    expect(ZEAL_STEP * ZEAL_MAX).toBeCloseTo(0.25, 9);
    // A ship somewhere else has lost no one.
    expect(far.buffs.some((b) => b.id === 'zeal')).toBe(false);
    // It is said where the ship died, each time the zeal rises, and not when it cannot rise further.
    const said = g.fx.filter((f) => f.k === 'text' && /^ZEAL/.test(f.text)).map((f) => (f.k === 'text' ? f.text : ''));
    expect(said).toEqual(['ZEAL +5%', 'ZEAL +10%', 'ZEAL +15%', 'ZEAL +20%', 'ZEAL +25%']);
  });

  it('it lasts until ten seconds after the last loss', () => {
    const g = mk();
    const ships = fleet(g, g.playerId);
    g.killUnit(ships[0], rivalOf(g).id);
    run(g, ZEAL_TIME - 2);
    expect(ships[7].buffs.some((b) => b.id === 'zeal')).toBe(true);
    g.killUnit(ships[1], rivalOf(g).id);
    run(g, ZEAL_TIME - 2);
    expect(ships[7].buffs.find((b) => b.id === 'zeal')!.v).toBe(2);
    run(g, 3);
    expect(ships[7].buffs.some((b) => b.id === 'zeal')).toBe(false);
  });

  it('is the Choir\'s alone', () => {
    const g = mk({ heir: 'concord' });
    const ships = fleet(g, g.playerId);
    const base = g.dmgMulOf(ships[7], 'rapid');
    g.killUnit(ships[0], rivalOf(g).id);
    expect(g.dmgMulOf(ships[7], 'rapid')).toBe(base);
    expect(ships[7].buffs.length).toBe(0);
  });
});

describe('what the Choir takes it converts, and it does not run', () => {
  it('a world it takes keeps its level and its Glow; taken by any other house, a world is sacked', () => {
    for (const heir of ['choir', 'concord']) {
      const g = mk({ heir });
      const rival = rivalOf(g);
      const world = g.nodes.find((n) => n.kind === 'planet' && n.owner === rival.id && n.capitalOf < 0) ?? g.nodes.find((n) => n.kind === 'planet' && n.owner < 0)!;
      if (world.owner !== rival.id) g.kindleWorld(world, rival.id);
      world.level = 3;
      world.glow = 1;
      g.planetDefeated(world, g.playerId);
      expect(world.owner).toBe(g.playerId);
      expect([world.level, world.glow], heir).toEqual(heir === 'choir' ? [3, 1] : [2, 0.25]);
    }
  });

  it('its drives take a quarter longer to charge than another house\'s', () => {
    const times = ['choir', 'concord'].map((heir) => {
      const g = mk({ heir });
      const n = g.nodes.find((x) => x.kind === 'star' && g.buckets[x.id].length === 0)!;
      return g.jumpChargeOf(g.spawnUnit('striker', g.playerId, n.id));
    });
    expect(times[0] / times[1]).toBeCloseTo(1.25, 6);
  });
});
