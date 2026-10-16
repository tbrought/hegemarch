/** Boons: the pool and the offer, stacking, the Blueprint that is owed, and what a Boon pays. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { BLUEPRINT_BY, BLUEPRINT_BY_RIVAL, BLUEPRINT_IDS, CARD_BY_ID, CARDS, LEGENDARY_BY } from '../src/game/data/cards';
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

  it('guarantees a Blueprint after three drafts without one', () => {
    expect(BLUEPRINT_BY).toBe(3);
    const g = mk({ seed: 31 });
    const p = g.player;
    for (let i = 0; i < 30; i++) {
      p.bpPity = BLUEPRINT_BY;
      const o = g.generateOffer(p);
      expect(o.some((id) => BLUEPRINT_IDS.includes(id))).toBe(true);
      expect(p.bpPity).toBe(0);
    }
    // One short of that, nothing is owed: most offers hold none.
    let without = 0;
    for (let i = 0; i < 30; i++) {
      p.bpPity = BLUEPRINT_BY - 1;
      if (!g.generateOffer(p).some((id) => BLUEPRINT_IDS.includes(id))) without++;
    }
    expect(without).toBeGreaterThan(10);
  });

  it('that is a promise to the player: a rival house is owed one after four, any of them, as before', () => {
    const g = mk({ seed: 31 });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    let without = 0;
    for (let i = 0; i < 30; i++) {
      rival.bpPity = BLUEPRINT_BY;
      if (!g.generateOffer(rival).some((id) => BLUEPRINT_IDS.includes(id))) without++;
    }
    expect(without).toBeGreaterThan(10);
    for (let i = 0; i < 30; i++) {
      rival.bpPity = BLUEPRINT_BY_RIVAL;
      expect(g.generateOffer(rival).some((id) => BLUEPRINT_IDS.includes(id))).toBe(true);
    }
    // (What it has been shown is not kept: nothing is owed to it by that.)
    expect(rival.bpSeen).toBeUndefined();
    expect(g.offerOdds(rival).blueprintIn).toBe(BLUEPRINT_BY_RIVAL);
  });

  it('the Blueprint that is owed is one the run has not shown yet, while there is one (a playtest of 1.17)', () => {
    let starfall = 0;
    let other = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = mk({ seed: 300 + seed });
      const p = g.player;
      // The run has shown every Blueprint but the Starfall's, and one is owed.
      p.bpSeen = BLUEPRINT_IDS.filter((id) => id !== 'bpStarfall');
      p.bpPity = BLUEPRINT_BY;
      const o = g.generateOffer(p);
      const bps = o.filter((id) => BLUEPRINT_IDS.includes(id));
      expect(bps.length).toBeGreaterThan(0);
      // (The one that is owed takes the last place, in an offer that drew none by itself.)
      if (bps.length === 1 && o[o.length - 1] === bps[0]) bps[0] === 'bpStarfall' ? starfall++ : other++;
      // What an offer showed is remembered, and a save keeps it.
      for (const id of bps) expect(p.bpSeen).toContain(id);
      if (seed <= 3) expect(Game.load(JSON.parse(JSON.stringify(g.serialize()))).player.bpSeen).toEqual(p.bpSeen);
    }
    // (Any of the five, as until 1.18, and it would be the Starfall's one time in five. The few others drew theirs by chance.)
    expect(starfall).toBeGreaterThan(35);
    expect(other).toBeLessThan(8);
    // A house that has been offered none remembers none: the field is not there until it is needed.
    expect(mk({ seed: 301 }).player.bpSeen).toBeUndefined();
    // Shown them all, the one that is owed is any of those it does not hold.
    const g = mk({ seed: 77 });
    const p = g.player;
    p.bpSeen = [...BLUEPRINT_IDS];
    g.addCard(p, 'bpCarrier');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      p.bpPity = BLUEPRINT_BY;
      for (const id of g.generateOffer(p)) if (BLUEPRINT_IDS.includes(id)) seen.add(id);
    }
    expect(seen.has('bpCarrier')).toBe(false);
    expect(seen.size).toBe(BLUEPRINT_IDS.length - 1);
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

describe('the odds of the next Boon choice (a playtest of 1.17)', () => {
  it('are worked out without rolling the run\'s dice or changing anything of the run', () => {
    const g = mk({ seed: 55, perks: { luck: 3 } });
    const p = g.player;
    const before = JSON.stringify(g.serialize());
    const a = g.offerOdds(p);
    expect(JSON.stringify(g.serialize())).toBe(before);
    // Asked again, the same figures: they do not waver while nothing has changed.
    expect(g.offerOdds(p)).toEqual(a);
    expect(a.choices).toBe(g.draftSize(p));
    for (const x of [a.blueprint, a.epic, a.legendary]) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('are the odds the offers are dealt by', () => {
    const g = mk({ seed: 56, perks: { luck: 2 } });
    const p = g.player;
    g.ui.legendarySeen = 1; // (the promise set aside: the odds alone)
    const o = g.offerOdds(p);
    let bp = 0;
    let epic = 0;
    let leg = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      p.bpPity = 0;
      const offer = g.generateOffer(p);
      if (offer.some((id) => CARD_BY_ID[id].cat === 'blueprint')) bp++;
      if (offer.some((id) => CARD_BY_ID[id].rarity === 'epic')) epic++;
      if (offer.some((id) => CARD_BY_ID[id].rarity === 'legendary')) leg++;
    }
    expect(Math.abs(bp / N - o.blueprint)).toBeLessThan(0.04);
    expect(Math.abs(epic / N - o.epic)).toBeLessThan(0.04);
    expect(Math.abs(leg / N - o.legendary)).toBeLessThan(0.03);
  });

  it('say so when a Blueprint is owed, when a Legendary is promised, and when neither can be had', () => {
    const g = mk({ seed: 57 });
    const p = g.player;
    expect(g.offerOdds(p).blueprintIn).toBe(BLUEPRINT_BY);
    expect(g.offerOdds(p).legendaryIn).toBe(LEGENDARY_BY - 1);
    p.bpPity = BLUEPRINT_BY;
    expect(g.offerOdds(p)).toMatchObject({ blueprint: 1, blueprintIn: 0 });
    g.ui.offersDealt = LEGENDARY_BY - 1;
    // (All but certain: an offer of nothing but Blueprints has no place for it, and it is kept by the one after.)
    expect(g.offerOdds(p).legendaryIn).toBe(0);
    expect(g.offerOdds(p).legendary).toBeGreaterThan(0.99);
    g.ui.legendarySeen = 1;
    expect(g.offerOdds(p).legendaryIn).toBeNull();
    expect(g.offerOdds(p).legendary).toBeLessThan(0.2);
    for (const id of BLUEPRINT_IDS) if (!p.cards.includes(id)) p.cards.push(id);
    expect(g.offerOdds(p)).toMatchObject({ blueprint: 0, blueprintIn: null });
    // Without Legendary Lineage one may be offered at its odds, and none is promised.
    const plain = mk({ seed: 57, unlockLegendary: false });
    expect(plain.offerOdds(plain.player).legendaryIn).toBeNull();
    expect(plain.offerOdds(plain.player).legendary).toBeGreaterThan(0);
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

describe('Star Charts (a playtest of 1.23)', () => {
  it('is not offered once the whole sector is charted: it would be 60 Lore and nothing', () => {
    const g = mk();
    const p = g.player;
    expect(g.cardPool(p).some((c) => c.id === 'starCharts')).toBe(true);
    g.exploreAll(p);
    expect(g.cardPool(p).some((c) => c.id === 'starCharts')).toBe(false);
    expect(g.grantRandomCard(p, ['rare'], (c) => c.id === 'starCharts')).toBeNull();
  });
});
