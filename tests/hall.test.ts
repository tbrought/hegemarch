/** The Hall of Heirs: what Legacy buys for every run, and getting it back. */
import { describe, expect, it } from 'vitest';
import { CARD_BY_ID, LEGENDARY_BY } from '../src/game/data/cards';
import { Game } from '../src/game/Game';
import { EPIC_ODDS, LEGENDARY_ODDS, perkOdds, PERKS, perksSpent, UNLOCKS } from '../src/meta/legacy';
import { PERK_EMBERS, PERK_HEARTH, PERK_HULL, PERK_LORE, PERK_WALLS } from '../src/meta/perks';
import { mk } from './helpers';

describe('what the Hall of Heirs sells for rarer Boons can be felt', () => {
  /** A run's first Boon offers for a player who takes the first card of each. */
  function offers(g: Game, n: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < n; i++) {
      g.player.pendingDrafts = 1;
      const offer = g.ensureOffer(g.player)!;
      out.push(offer);
      g.cmdChooseCard(g.playerId, offer[offer.length - 1]);
    }
    return out;
  }
  const has = (offer: string[], rarity: string) => offer.some((id) => CARD_BY_ID[id].rarity === rarity);

  it('Fortunate Stars: an Epic Boon is in as many offers as the Hall says, at every rank', () => {
    const max = PERKS.find((p) => p.id === 'luck')!.costs.length;
    expect(EPIC_ODDS.length).toBe(max + 1);
    const seen: number[] = [];
    for (let rank = 0; rank <= max; rank++) {
      let all = 0;
      let epic = 0;
      for (let seed = 1; seed <= 90; seed++) {
        for (const offer of offers(mk({ seed: 700 + seed * 13, perks: { luck: rank }, unlockLegendary: seed % 2 === 0, unlockPacts: seed % 3 === 0 }), 9)) {
          all++;
          if (has(offer, 'epic')) epic++;
        }
      }
      seen.push((100 * epic) / all);
      expect(Math.abs(seen[rank] - EPIC_ODDS[rank])).toBeLessThan(4);
    }
    // Each rank can be felt: several more offers in a hundred, and twice as many at the last rank as with none.
    for (let rank = 1; rank <= max; rank++) expect(seen[rank] - seen[rank - 1]).toBeGreaterThan(3);
    expect(seen[max]).toBeGreaterThan(seen[0] * 1.8);
  });

  it('Fortunate Stars: a Legendary Boon is in as many offers as the Hall says too, beyond the one that is promised', () => {
    const max = PERKS.find((p) => p.id === 'luck')!.costs.length;
    expect(LEGENDARY_ODDS.length).toBe(max + 1);
    const seen: number[] = [];
    for (let rank = 0; rank <= max; rank += rank === 0 ? max - 1 : 1) {
      let all = 0;
      let legendary = 0;
      for (let seed = 1; seed <= 160; seed++) {
        const g = mk({ seed: 700 + seed * 13, perks: { luck: rank }, unlockPacts: seed % 3 === 0 });
        g.ui.legendarySeen = 1; // (the promise set aside: what is left to the odds)
        for (const offer of offers(g, 9)) {
          all++;
          if (has(offer, 'legendary')) legendary++;
        }
      }
      seen[rank] = (100 * legendary) / all;
      expect(Math.abs(seen[rank] - LEGENDARY_ODDS[rank])).toBeLessThan(2.5);
    }
    // The ranks can be felt here as well: until 1.18 all five took it from 2 offers in a hundred to 6.
    expect(seen[max]).toBeGreaterThan(seen[0] * 4);
    for (let rank = 1; rank <= max; rank++) expect(LEGENDARY_ODDS[rank]).toBeGreaterThan(LEGENDARY_ODDS[rank - 1]);
  });

  it('the Hall says the odds in a table at every rank, and the text says what the perk does in a line, as every other card does', () => {
    const pk = PERKS.find((p) => p.id === 'luck')!;
    const max = pk.costs.length;
    const rows = perkOdds(pk);
    expect(rows.map((r) => r.id)).toEqual(['epic', 'legendary']);
    expect(rows[0].odds).toBe(EPIC_ODDS);
    expect(rows[1].odds).toBe(LEGENDARY_ODDS);
    for (const r of rows) expect(r.odds.length).toBe(max + 1);
    // (In 1.18.0 the figures were sentences in the text: "24% and 2% now; 32% and 5% at rank 1, 55% and 13% at rank 5".)
    expect(pk.desc).not.toMatch(/\d%/);
    for (const other of PERKS) if (other.id !== 'luck') expect(perkOdds(other)).toEqual([]);
    const lineage = UNLOCKS.find((u) => u.id === 'legendary')!;
    expect(lineage.desc).toMatch(/^Guarantees a \[Legendary Boon\] in every run/);
    expect(lineage.desc).not.toMatch(/\d%/);
  });

  it('Legendary Lineage: every run shows a Legendary Boon by the fifth offer, in place of a Common one', () => {
    let forced = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = mk({ seed: 900 + seed * 7 });
      const dealt = offers(g, LEGENDARY_BY);
      expect(dealt.some((o) => has(o, 'legendary'))).toBe(true);
      if (!dealt.slice(0, LEGENDARY_BY - 1).some((o) => has(o, 'legendary'))) {
        forced++;
        // The fifth offer is as big as any other: the Legendary took a card's place, it did not add one.
        expect(dealt[LEGENDARY_BY - 1].length).toBeGreaterThanOrEqual(3);
        expect(dealt[LEGENDARY_BY - 1].length).toBeLessThanOrEqual(5);
        expect(new Set(dealt[LEGENDARY_BY - 1]).size).toBe(dealt[LEGENDARY_BY - 1].length);
      }
      // Once is the promise: after it the odds are the odds again.
      expect(g.ui.legendarySeen).toBe(1);
    }
    // (Left to chance, most runs would have shown none in five offers.)
    expect(forced).toBeGreaterThan(20);
  });

  it('without it a Legendary is dealt at its odds, as to anyone, and none is promised; a rival house is promised nothing', () => {
    // (Until 1.18.3 none was dealt without it: the ranks of Fortunate Stars did nothing for Legendaries until it was bought.)
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = mk({ seed: 900 + seed * 7, perks: { luck: 5 }, unlockLegendary: false });
      if (offers(g, 8).some((o) => has(o, 'legendary'))) seen++;
      expect(g.ui.offersDealt).toBeUndefined();
    }
    expect(seen).toBeGreaterThan(10);
    expect(seen).toBeLessThan(40);
    // The First Night keeps to plain Boons.
    const night = mk({ seed: 901, tutorial: true, perks: { luck: 5 } });
    expect(night.cardPool(night.player).some((c) => c.rarity === 'legendary')).toBe(false);
    const g = mk();
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    for (let i = 0; i < 8; i++) g.generateOffer(rival);
    expect(g.ui.offersDealt).toBeUndefined();
  });

  it('the promise is kept across a save: the count of offers is part of the run', () => {
    const g = mk({ seed: 907 });
    const first = offers(g, 3);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.ui.offersDealt).toBe(g.ui.offersDealt);
    const rest = offers(again, LEGENDARY_BY - 3);
    expect([...first, ...rest].some((o) => has(o, 'legendary'))).toBe(true);
    expect(offers(g, LEGENDARY_BY - 3)).toEqual(rest);
  });
});

describe('the Hall of Heirs: perks for the whole run, and a refund (the third playtest)', () => {
  it('each perk is felt all run long, as its words say', () => {
    const plain = mk().player.mods;
    const g = mk({ perks: { oldCoin: 3, loreSeed: 2, escort: 2, bastion: 2 } });
    const m = g.player.mods;
    expect(m.embers - plain.embers).toBeCloseTo(3 * PERK_EMBERS);
    expect(m.lore - plain.lore).toBeCloseTo(2 * PERK_LORE);
    expect(m.hull - plain.hull).toBeCloseTo(2 * PERK_HULL);
    expect(m.worldHp - plain.worldHp).toBeCloseTo(2 * PERK_WALLS);
    expect(m.worldHp + m.hearthHp - plain.worldHp - plain.hearthHp).toBeCloseTo(2 * PERK_HEARTH);
    // (Nothing at the start any more: Old Coin and Lorekeepers were spent in the first minute.)
    expect(g.player.embers).toBe(mk().player.embers);
    const words = (id: string) => PERKS.find((p) => p.id === id)!.desc;
    expect(words('oldCoin')).toContain(`+${Math.round(PERK_EMBERS * 100)}% Embers`);
    expect(words('loreSeed')).toContain(`+${Math.round(PERK_LORE * 100)}% Lore`);
    expect(words('escort')).toContain(`+${Math.round(PERK_HULL * 100)}% hull`);
    expect(words('bastion')).toContain(`+${Math.round(PERK_WALLS * 100)}% hull`);
  });

  it('REFUND ALL gives back what every rank cost', () => {
    expect(perksSpent({})).toBe(0);
    expect(perksSpent({ oldCoin: 2, luck: 1 })).toBe(40 + 80 + 60);
    const all: Record<string, number> = {};
    for (const pk of PERKS) all[pk.id] = pk.costs.length;
    expect(perksSpent(all)).toBe(PERKS.reduce((s, pk) => s + pk.costs.reduce((a, c) => a + c, 0), 0));
  });
});
