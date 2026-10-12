/** Boons: the pool and the offer, stacking, the Blueprint that is owed, and what a Boon pays. */
import { describe, expect, it } from 'vitest';
import { BLUEPRINT_IDS, CARD_BY_ID, CARDS } from '../src/game/data/cards';
import { modDelta, modLines } from '../src/game/modstats';
import { mk, run } from './helpers';

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

describe('Embers from kills (the third playtest)', () => {
  it('Salvage Crews and War Economy are one figure, and each card shows the other in it', () => {
    const g = mk();
    const p = g.player;
    p.cards.push('warEconomy');
    g.recomputeMods(p);
    const line = modLines(g.computeMods(p)).find((l) => l.key === 'killEmbers')!;
    expect(line.label).toBe('Embers from kills');
    // Salvage Crews, offered to a house that has War Economy: from 40% to 65%.
    const d = modDelta(g.computeMods(p), g.computeMods(p, ['salvage'])).find((x) => x.key === 'killEmbers')!;
    expect([d.from, d.to, d.novel]).toEqual(['+40%', '+65%', false]);
    // (With neither, the card's own words say it: no line that only repeats them.)
    const plain = mk();
    expect(modDelta(plain.computeMods(plain.player), plain.computeMods(plain.player, ['salvage'])).find((x) => x.key === 'killEmbers')?.novel).toBe(true);
  });
});
