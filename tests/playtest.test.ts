/**
 * Rules and messages that came out of player feedback (the first public playtest, October 2026):
 * what a player sees must be what happened.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { JUMP_CHARGE, SCOUT_CHARGE, SCOUT_SLIP, TICK } from '../src/game/constants';
import type { GameConfig } from '../src/game/types';
import { GLOSS_BY_ID, termsIn } from '../src/ui/glossary';

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

describe('Scouts are built to look and leave', () => {
  it('a Scout\'s drive spools in less than half the time of any other ship\'s', () => {
    const g = mk();
    const p = g.player;
    const scout = g.spawnUnit('scout', p.id, p.capital);
    const striker = g.spawnUnit('striker', p.id, p.capital);
    expect(g.jumpChargeOf(striker)).toBeCloseTo(JUMP_CHARGE, 5);
    expect(g.jumpChargeOf(scout)).toBeCloseTo(JUMP_CHARGE * SCOUT_CHARGE, 5);
    expect(SCOUT_CHARGE).toBeLessThan(0.5);
  });

  it('nothing can fire on a Scout in its first seconds at a place; one that stays is a target', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    const striker = g.spawnUnit('striker', p.id, rival.capital);
    scout.arrivedAt = g.time;
    striker.arrivedAt = g.time;
    expect(g.slips(scout)).toBe(true);
    expect(g.slips(striker)).toBe(false);
    // Under a rival Hearth's guns and fleet, the Scout is untouched while it slips...
    const hp = scout.hp + scout.sh;
    run(g, SCOUT_SLIP - 0.5);
    expect(scout.dead).toBe(false);
    expect(scout.hp + scout.sh).toBeGreaterThanOrEqual(hp);
    // ...and fired on once that is over.
    scout.path = [];
    run(g, 25);
    expect(g.slips(scout)).toBe(false);
    expect(scout.dead || scout.hp + scout.sh < hp).toBe(true);
  });

  it('a Scout with nothing left to chart goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    p.explored.fill(1);
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    scout.arrivedAt = g.time;
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

describe('the glossary', () => {
  it('knows what a house is, as an everyday word: explained only when nothing rarer is mentioned', () => {
    expect(GLOSS_BY_ID.house).toBeTruthy();
    expect(GLOSS_BY_ID.house.basic).toBe(true);
    expect(termsIn('Every house has its own Ark.').map((t) => t.id)).toEqual(['ark']);
    expect(termsIn('A rival house.').map((t) => t.id)).toEqual(['house']);
    // The tooltip of the first playtest: omens and relics are the rare words in it.
    expect(termsIn('Your total bonus now, counting your house, the omens, your Boons and your relics.').map((t) => t.id)).toEqual(['omen', 'relic']);
  });
});
