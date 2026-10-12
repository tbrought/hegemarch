/** What a run leaves behind: its details for a machine to read, and how the houses stood, minute by minute. */
import { describe, expect, it } from 'vitest';
import { chartsHtml, runCharts, scale, strengthParts } from '../src/app/charts';
import { readRunData, runData } from '../src/app/rundata';
import { Game, HISTORY_EVERY } from '../src/game/Game';
import { mk, run } from './helpers';

describe("the run's details for a machine (the third playtest)", () => {
  it('the last line of COPY RUN DETAILS is the run as JSON, and reads back', () => {
    const g = mk();
    g.player.cards.push('salvage');
    g.planetDefeated(g.nodes[g.player.capital], 1);
    g.flushDeferred();
    const text = runData(g, '9.9.9');
    expect(text).toMatch(/^[A-Za-z0-9+/=]+$/);
    const back = readRunData(text);
    expect(back.v).toBe('9.9.9');
    expect(back.seed).toBe(4242);
    expect(back.outcome.won).toBe(false);
    expect(back.outcome.victory).toBe('defeat');
    expect(back.boons).toContain('salvage');
    expect(back.houses.length).toBe(g.empires().length);
    expect(back.houses.filter((h: { player: boolean }) => h.player).length).toBe(1);
  });
});

describe("the run, minute by minute (the third playtest's graphs)", () => {
  it('every house is sampled at the start, every half minute and at the end', () => {
    const g = mk();
    run(g, 95);
    expect(g.history.map((s) => s.t)).toEqual([0, 30, 60, 90]);
    for (const s of g.history) expect(s.h.map((x) => x.f)).toEqual(g.empires().map((f) => f.id));
    const first = g.history[0].h.find((x) => x.f === g.playerId)!;
    expect(first.e).toBeGreaterThan(0);
    expect(first.w).toBe(1);
    expect(first.s).toBeGreaterThan(0);
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
    expect(g.history[g.history.length - 1].t).toBe(95);
    expect(HISTORY_EVERY).toBe(30);
  });

  it('a house that is put out has one last sample with nothing in it, and its line ends there', () => {
    const g = mk();
    run(g, 31);
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    g.planetDefeated(g.nodes[rival.capital], g.playerId);
    g.flushDeferred();
    run(g, 60);
    const of = (i: number) => g.history[i].h.find((x) => x.f === rival.id);
    expect(of(1)!.w).toBeGreaterThan(0);
    expect(of(2)).toMatchObject({ w: 0, s: 0, e: 0 });
    expect(of(3)).toBeUndefined();
  });

  it('the charts count in round numbers, and in whole ones what is counted', () => {
    expect(scale(27)).toEqual({ max: 30, step: 10 });
    expect(scale(11.4)).toEqual({ max: 15, step: 5 });
    expect(scale(1, true)).toEqual({ max: 1, step: 1 });
    expect(scale(4, true)).toEqual({ max: 4, step: 2 });
    expect(scale(7, true)).toEqual({ max: 10, step: 5 });
    expect(scale(0)).toEqual({ max: 1, step: 1 });
    for (let v = 1; v < 400; v += 7) {
      const s = scale(v, true);
      expect(Number.isInteger(s.step)).toBe(true);
      expect(s.max).toBeGreaterThanOrEqual(v);
      expect(s.max / s.step).toBeLessThanOrEqual(4);
    }
  });

  it('the page says how fleet strength is counted, in the numbers the game counts it with', () => {
    const parts = strengthParts();
    expect(parts.ships.map((x) => x.type)).toEqual(['striker', 'guardian', 'breaker', 'lancer', 'carrier', 'dreadnought', 'ark']);
    const g = mk();
    const p = g.player;
    const bonus = 1 + (p.mods.dmg + p.mods.hull) * parts.boon;
    for (const x of parts.ships) {
      const u = x.type === 'ark' ? g.units.get(p.ark)! : g.spawnUnit(x.type, p.id, p.capital);
      // At full hull and shields: its power (and what the house's Boons add).
      u.hp = u.maxHp;
      u.sh = u.maxSh;
      expect(g.unitPower(u)).toBeCloseTo(x.power * bonus, 5);
      // With nothing left: the share the page says.
      u.hp = 0;
      u.sh = 0;
      expect(g.unitPower(u)).toBeCloseTo(x.power * bonus * parts.wreck, 5);
      // A level more: what the page says a level adds.
      u.hp = u.maxHp;
      u.sh = u.maxSh;
      u.level += 1;
      expect(g.unitPower(u)).toBeCloseTo(x.power * bonus * (1 + parts.level), 5);
      u.level -= 1;
    }
    // +10% damage from a Boon: half of that on every ship.
    const striker = g.spawnUnit('striker', p.id, p.capital);
    const before = g.unitPower(striker);
    p.mods.dmg += 0.1;
    expect(g.unitPower(striker) / before).toBeCloseTo((bonus + 0.1 * parts.boon) / bonus, 5);
    // And the page has it: every ship with its number, and the three rules.
    run(g, 65);
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
    const html = chartsHtml(runCharts(g)!);
    expect(html).toContain('HOW FLEET STRENGTH IS COUNTED');
    for (const x of parts.ships) expect(html).toContain(`<span>${x.name}</span><b>${x.power}</b>`);
    expect(html).toContain('counts 35%');
    expect(html).toContain('adds 5%');
    expect(html).toContain('adds 8%');
  });

  it('a saved run keeps its history', () => {
    const g = mk();
    run(g, 65);
    const back = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(back.history).toEqual(g.history);
    run(g, 30);
    run(back, 30);
    expect(back.history).toEqual(g.history);
  });
});
