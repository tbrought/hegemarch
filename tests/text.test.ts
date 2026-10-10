import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ABILITIES } from '../src/game/data/abilities';
import { CARDS, CARD_BY_ID } from '../src/game/data/cards';
import { EVENTS } from '../src/game/data/events';
import { HEIRS } from '../src/game/data/heirs';
import { RELICS } from '../src/game/data/relics';
import { TRAITS } from '../src/game/data/traits';
import { ROLES } from '../src/game/data/worlds';
import { baseMods } from '../src/game/mods';
import { modDelta, modLines, statSources } from '../src/game/modstats';
import { PERKS, UNLOCKS } from '../src/meta/legacy';
import { hasMarkup, parseRich, plainText, richHtml } from '../src/render/rich';
import { autoTerms, GLOSSARY, glossHtml, termsIn } from '../src/ui/glossary';

describe('effect text', () => {
  it('splits gains, drawbacks and keywords', () => {
    expect(parseRich('Strikers deal [20% more damage]. Ships [!lose 15% hull].')).toEqual([
      { text: 'Strikers', style: 'kw' },
      { text: ' deal ', style: 'body' },
      { text: '20% more damage', style: 'gain' },
      { text: '. Ships ', style: 'body' },
      { text: 'lose 15% hull', style: 'loss' },
      { text: '.', style: 'body' },
    ]);
    expect(parseRich('Ark: {Aegis Field}')).toEqual([
      { text: 'Ark', style: 'kw' },
      { text: ': ', style: 'body' },
      { text: 'Aegis Field', style: 'kw' },
    ]);
  });

  it('only marks whole words as keywords', () => {
    expect(parseRich('Lorekeepers and Embersmiths').map((r) => r.style)).toEqual(['body']);
    expect(parseRich('two Guardians').map((r) => r.style)).toEqual(['body', 'kw']);
  });

  it('strips markup for plain text and escapes HTML', () => {
    expect(plainText('[+10% Embers] and [!less <Lore>]')).toBe('+10% Embers and less <Lore>');
    expect(richHtml('[+10%] <b>')).toBe('<span class="rt-gain">+10%</span> &lt;b&gt;');
    expect(hasMarkup('Close (Esc)')).toBe(false);
    expect(hasMarkup('[+5 hangar space]')).toBe(true);
  });

  it('every effect text in the game has balanced markup', () => {
    const texts: string[] = [
      ...CARDS.map((c) => c.desc),
      ...RELICS.map((r) => r.desc),
      ...TRAITS.map((t) => t.desc),
      ...ABILITIES.map((a) => a.desc),
      ...Object.values(ROLES).flatMap((r) => [r.desc, r.short]),
      ...HEIRS.flatMap((h) => h.bonuses),
      ...EVENTS.flatMap((e) => e.choices.map((c) => c.hint)),
      ...PERKS.map((p) => p.desc),
      ...UNLOCKS.map((u) => u.desc),
    ];
    for (const t of texts) expect(plainText(t), t).not.toMatch(/[[\]{}]/);
  });

  it('every Boon shows its gain in color, and every Pact its price', () => {
    for (const c of CARDS) expect(parseRich(c.desc).some((r) => r.style === 'gain'), c.id).toBe(true);
    for (const c of CARDS.filter((x) => x.pact)) expect(parseRich(c.desc).some((r) => r.style === 'loss'), c.id).toBe(true);
  });
});

describe('bonus summaries', () => {
  it('lists only what a house actually has', () => {
    expect(modLines(baseMods())).toEqual([]);
    const m = baseMods();
    CARD_BY_ID.bloodPact.mods!(m);
    const lines = modLines(m);
    expect(lines.find((l) => l.key === 'dmg')).toMatchObject({ label: 'Damage', text: '+35%', good: true });
    expect(lines.find((l) => l.key === 'hull')).toMatchObject({ label: 'Ship hull', text: '-15%', good: false });
  });

  it('counts lower costs as gains', () => {
    const m = baseMods();
    CARD_BY_ID.thriftyYards.mods!(m);
    expect(modLines(m)).toEqual([expect.objectContaining({ key: 'shipCost', text: '-10%', good: true })]);
  });

  it('previews a Boon against what the house already has, without changing anything', () => {
    const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
    const p = g.player;
    g.addCard(p, 'strikerWings');
    const before = JSON.stringify(p.mods);
    const d = modDelta(g.computeMods(p), g.computeMods(p, ['strikerWings']));
    expect(d.map((x) => [x.label, x.from, x.to, x.good])).toEqual([
      ['Striker damage', '+20%', '+40%', true],
      ['Striker cost', '-15%', '-30%', true],
    ]);
    expect(JSON.stringify(p.mods)).toBe(before);
    // House bonuses show up in the totals too (the Solar Concord earns 10% more Embers).
    expect(modLines(p.mods).find((l) => l.key === 'embers')?.text).toBe('+10%');
  });
});

describe('glossary', () => {
  const ids = (text: string, o?: Parameters<typeof termsIn>[1]) => termsIn(text, o).map((e) => e.id);

  it('explains the terms a Boon mentions', () => {
    const c = CARD_BY_ID.kindlingRites;
    expect(ids(`${c.name}. ${c.desc}`)).toEqual(['kindle']);
    expect(ids(`${CARD_BY_ID.fighterBays.name}. ${CARD_BY_ID.fighterBays.desc}`)).toEqual(['fighter', 'carrier']);
    expect(ids(`${CARD_BY_ID.bpCarrier.name}. ${CARD_BY_ID.bpCarrier.desc}`, { max: 4 })).toEqual(['blueprint', 'carrier', 'forge', 'fighter']);
  });

  it('prefers the longer term and falls back to everyday words', () => {
    expect(ids('Hold most of the relics: a Relic Hunt.')).toEqual(['relic', 'relicHunt']);
    expect(ids('Win by Relic Hunt.')).toEqual(['relicHunt']);
    expect(ids('Ark: {Rally Cry}')).toEqual(['ark', 'ab-rally']);
    expect(ids(CARD_BY_ID.emberTithe.desc)).toEqual(['embers']);
    expect(ids('Your ships fire [10% faster].')).toEqual([]);
  });

  it('leaves out the term a tooltip is about', () => {
    expect(ids('Digs deep: this world makes [75% more Embers]. Mines are great.', { exclude: 'Mine' })).toEqual(['embers']);
  });

  it('finds every entry by its own name, once', () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    for (const e of GLOSSARY) expect(ids(e.name, { basic: true, max: 99 }), e.name).toContain(e.id);
  });

  it('marks terms up for the menus', () => {
    const html = glossHtml('Kindling costs [35% less]');
    expect(html).toContain('<span class="gl" data-gl="kindle">Kindling</span>');
    expect(html).toContain('<span class="rt-gain">35% less</span>');
    expect(glossHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('shows where each total comes from', () => {
    const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
    const p = g.player;
    g.addCard(p, 'emberTithe');
    g.addCard(p, 'emberTithe');
    const from = statSources(g.modSources(p), 'embers');
    expect(from).toEqual([
      { label: 'Solar Concord', text: '+10%', good: true },
      { label: 'Ember Tithe ×2', text: '+30%', good: true },
    ]);
    expect(modLines(p.mods).find((l) => l.key === 'embers')?.text).toBe('+40%');
  });
});

describe('tooltips explain their own words', () => {
  const ids = (text: string, o?: Parameters<typeof autoTerms>[1]) => autoTerms(text, o).map((e) => e.id);

  it('finds the terms in an ambition', () => {
    expect(ids('Win without your Ark ever being destroyed.')).toEqual(['ark']);
    expect(ids('Destroy the Corsair Stronghold.')).toEqual(['corsairs', 'stronghold']);
    expect(ids('Resolve 5 anomalies.')).toEqual(['anomaly']);
  });

  it('leaves out the subject and the title, and everyday words', () => {
    expect(ids('Hangar: room for your ships. Hangar Bays at your Hearth add more.')).toEqual(['bay', 'hearth']);
    expect(ids('A fast, cheap gunship. Beats Breakers; Guardians shred it.', { title: 'Striker · 60 Embers · 1 hangar' })).toEqual(['breaker', 'guardian']);
    expect(ids('Gain [+15% Embers] and [+20% Lore].')).toEqual([]);
  });
});
