/** A new game, the same game from the same seed, and a saved game that goes on as the one that was saved. */
import { describe, expect, it } from 'vitest';
import { HEIRS } from '../src/game/data/heirs';
import { ECON } from '../src/game/data/worlds';
import { Game } from '../src/game/Game';
import { mk, run, snapshot } from './helpers';
import { difficultySummary, difficultyText } from '../src/ui/difficulty';

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

describe('saving changes nothing', () => {
  it('a Hearth comes back from a save with the walls it had, also between two seconds', () => {
    const g = mk();
    run(g, 100.45);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    for (const f of g.empires()) {
      const a = g.nodes[f.capital];
      const b = again.nodes[f.capital];
      expect(b.maxHp).toBe(a.maxHp);
      expect(b.maxSh).toBe(a.maxSh);
      expect(again.wallsOf(b)).toBe(g.wallsOf(a));
    }
    // And they go on growing in step.
    run(g, 5.2);
    run(again, 5.2);
    for (const f of g.empires()) expect(again.nodes[f.capital].maxHp).toBe(g.nodes[f.capital].maxHp);
    expect(g.wallsOf(g.nodes[g.player.capital])).toBeGreaterThan(0.45);
  });
});

describe('the difficulties, said plainly (a playtest of 1.23: "Brutal cheats")', () => {
  it('a rival house on Brutal starts with 200 Embers and a Guardian more, and 10% more hull, than on Normal', () => {
    const normal = mk({ difficulty: 1 });
    const brutal = mk({ difficulty: 3 });
    const rival = (g: Game) => g.factions.find((f) => f.kind === 'empire' && !f.isPlayer && f.heir === normal.factions[1].heir) ?? g.factions[1];
    const a = rival(normal);
    const b = rival(brutal);
    expect(b.embers - a.embers).toBe(200);
    const guardians = (g: Game, fid: number) => g.unitList.filter((u) => u.owner === fid && u.type === 'guardian').length;
    expect(guardians(brutal, b.id) - guardians(normal, a.id)).toBe(1);
    expect(b.mods.hull - a.mods.hull).toBeCloseTo(0.1, 9);
  });

  it('what each says is what it does', () => {
    expect(difficultyText(1)).toBe('A fair fight: the rival houses get no bonus.');
    expect(difficultySummary(1)).toBe('A fair fight: rivals have no bonus.');
    const brutal = difficultyText(3);
    for (const said of ['earn 40% more Embers', 'start with 200 Embers and a Guardian more', 'have 10% more hull on every ship', 'from 9:00', 'Corsair raids are 50% bigger', '×1.8 Legacy']) expect(brutal).toContain(said);
    expect(difficultySummary(0)).toContain('earn 25% less');
    expect(difficultySummary(3)).toBe('Rivals earn 40% more, start richer, have 10% more hull and attack sooner. Legacy ×1.8.');
  });
});
