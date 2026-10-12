/** Ships and combat: who beats whom, what a hit does, what the hangar holds, and that no loss goes unsaid. */
import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/game/data/units';
import { Game } from '../src/game/Game';
import { arena, duel, mk, run } from './helpers';

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

describe('no ship is lost silently', () => {
  it('a ship of the player\'s that is destroyed is said in the log: where, what, and to whom', () => {
    const g = mk();
    const p = g.player;
    const home = g.nodes[p.capital];
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, home.id);
    const before = g.notes.length;
    g.killUnit(scout, rival.id);
    const note = g.notes[g.notes.length - 1];
    expect(g.notes.length).toBe(before + 1);
    expect(note.text).toBe(`Lost at ${home.name} to ${rival.name}: 1 Scout.`);
    expect(note.kind).toBe('bad');
    expect(note.node).toBe(home.id);
  });

  it('ships lost at the same place soon after are added to the same line', () => {
    const g = mk();
    const p = g.player;
    const home = g.nodes[p.capital];
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const ships = [g.spawnUnit('scout', p.id, home.id), g.spawnUnit('scout', p.id, home.id), g.spawnUnit('striker', p.id, home.id)];
    g.killUnit(ships[0], rival.id);
    const id = g.notes[g.notes.length - 1].id;
    run(g, 3);
    g.killUnit(ships[1], rival.id);
    g.killUnit(ships[2], rival.id);
    const note = g.notes.find((n) => n.id === id)!;
    expect(note.text).toBe(`Lost at ${home.name} to ${rival.name}: 2 Scouts, 1 Striker.`);
    expect(g.notes.filter((n) => n.loss).length).toBe(1);
    // Much later it is a new line.
    run(g, 25);
    g.killUnit(g.spawnUnit('guardian', p.id, home.id), rival.id);
    expect(g.notes.filter((n) => n.loss).length).toBe(2);
    expect(g.notes[g.notes.length - 1].text).toBe(`Lost at ${home.name} to ${rival.name}: 1 Guardian.`);
  });

  it('the seed ship and the Ark keep their own words, and a rival\'s losses are not the player\'s news', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    g.killUnit(g.spawnUnit('seed', p.id, p.capital), rival.id);
    g.killUnit(g.units.get(p.ark)!, rival.id);
    g.killUnit(g.spawnUnit('striker', rival.id, rival.capital), p.id);
    expect(g.notes.some((n) => n.loss)).toBe(false);
    expect(g.notes.some((n) => /seed ship was destroyed/.test(n.text))).toBe(true);
  });

  it('the tally survives saving and loading', () => {
    const g = mk();
    const p = g.player;
    g.killUnit(g.spawnUnit('scout', p.id, p.capital), g.empires().find((f) => f.id !== p.id)!.id);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.notes[again.notes.length - 1].loss).toEqual(g.notes[g.notes.length - 1].loss);
    again.killUnit(again.spawnUnit('scout', p.id, p.capital), -1);
    expect(again.notes[again.notes.length - 1].text).toMatch(/2 Scouts\.$/);
  });
});

describe('shields that are gone look gone', () => {
  it('the moment a world\'s shields give way is shown once, not at every hit after it', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const n = g.nodes[rival.capital];
    expect(n.maxSh).toBeGreaterThan(0);
    n.sh = n.maxSh;
    g.fx.length = 0;
    g.damagePlanet(n, n.maxSh * 0.5, 'energy', p.id);
    expect(g.fx.some((f) => f.k === 'text')).toBe(false);
    g.damagePlanet(n, n.maxSh * 5, 'energy', p.id);
    expect(g.fx.filter((f) => f.k === 'text' && f.text === 'SHIELDS DOWN').length).toBe(1);
    // Under fire the shields recharge only a trickle: the next hits say nothing more.
    for (let i = 0; i < 40; i++) {
      g.step();
      g.damagePlanet(n, 50, 'energy', p.id);
    }
    expect(g.fx.filter((f) => f.k === 'text' && f.text === 'SHIELDS DOWN').length).toBe(1);
  });
});

describe('Dreadnoughts take no hangar room (the third playtest)', () => {
  it('a house with two Dreadnoughts has the room it had without them', () => {
    const g = mk();
    const p = g.player;
    g.spawnUnit('striker', p.id, p.capital);
    g.recomputeMods(p);
    const before = p.hangarUsed;
    g.spawnUnit('dreadnought', p.id, p.capital);
    g.spawnUnit('dreadnought', p.id, p.capital);
    g.recomputeMods(p);
    expect(p.hangarUsed).toBe(before);
  });
});
