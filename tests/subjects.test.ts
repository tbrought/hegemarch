import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { ABILITIES } from '../src/game/data/abilities';
import { CARD_BY_ID, CARDS } from '../src/game/data/cards';
import { EVENTS } from '../src/game/data/events';
import { boonSubjects, subjectNames, subjectsIn } from '../src/ui/subjects';

const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true });
const of = (id: string) => boonSubjects(g, g.player, CARD_BY_ID[id]);

describe('what a choice affects (the pictures on Boons, events and abilities)', () => {
  it('reads a ship type, a resource or the whole fleet from what a Boon really changes', () => {
    expect(of('strikerWings')).toEqual(['striker']);
    expect(of('emberTithe')).toEqual(['embers']);
    expect(of('goldenAge')).toEqual(['embers', 'lore']);
    expect(of('wideHangars')).toEqual(['hangar']);
    expect(of('hotBarrels')).toEqual(['fleet']);
    expect(of('dreadDoctrine')).toEqual(['ark', 'dreadnought']);
  });

  it('shows the fleet for a Boon whose text never says "ships"', () => {
    // "+15% shields, and shields recharge 30% faster": the modifiers say it is every ship.
    expect(of('deflectors')).toEqual(['fleet', 'shield']);
  });

  it('a Blueprint shows the ship it unlocks', () => {
    expect(of('bpCarrier')).toEqual(['carrier']);
    expect(of('bpStarbase')).toEqual(['starbase']);
  });

  it('does not read "enemy ships" as your own fleet', () => {
    expect(subjectsIn('Gain Embers worth [25%] of every enemy ship you destroy.')).toEqual(['embers', 'target']);
    expect(subjectsIn('[!Costs 150 Embers]. 65%: [a damaged Dreadnought joins you].')).toEqual(['embers', 'dreadnought']);
    expect(subjectsIn('Gain [a free Seed Ship] here.')).toEqual(['seed']);
    expect(subjectsIn('Nothing happens.')).toEqual([]);
  });

  it('every Boon shows at least one picture, and never more than three', () => {
    for (const c of CARDS) {
      const s = boonSubjects(g, g.player, c);
      expect(s.length, c.name).toBeGreaterThan(0);
      expect(s.length, c.name).toBeLessThanOrEqual(3);
      expect(subjectNames(s), c.name).not.toBe('');
    }
  });

  it('every event choice that does something shows a picture; "nothing happens" shows none', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        const s = c.icons ?? subjectsIn(c.hint);
        if (/nothing happens/i.test(c.hint)) expect(s, `${e.title}: ${c.label}`).toEqual([]);
        else expect(s.length, `${e.title}: ${c.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('abilities name allies, enemies, or nobody (then the ship itself is shown)', () => {
    const subs = Object.fromEntries(ABILITIES.map((a) => [a.id, subjectsIn(a.desc).filter((k) => k !== 'world')]));
    expect(subs.nanite).toEqual(['fleet']);
    expect(subs.voidpulse).toEqual(['target']);
    expect(subs.overdrive).toEqual([]);
  });
});
