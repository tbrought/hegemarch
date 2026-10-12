/** The glossary: every game word that a text uses can be explained beside it. */
import { describe, expect, it } from 'vitest';
import { GLOSS_BY_ID, termsIn } from '../src/ui/glossary';

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
