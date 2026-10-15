/**
 * The deal of a Boon offer, teleported in: the places of the cards appear one after another, and
 * then each card is beamed in on its place, the commonest first and the rarest last, each after a
 * beat (longer for a rarer card), so that an Epic or a Legendary is seen coming. When each place
 * appears, when its card starts to come, and when its face is all there.
 */
import type { CardDef } from '../../game/data/cards';

/** How rare a card is, for its deal: 0 a Common, 1 a Rare or a Pact, 2 an Epic, 3 a Legendary. */
export function tierOf(c: Pick<CardDef, 'rarity' | 'pact'>): number {
  if (c.rarity === 'legendary') return 3;
  if (c.rarity === 'epic') return 2;
  return c.rarity === 'rare' || c.pact ? 1 : 0;
}

/** Seconds a place takes to appear, and between one place and the next. */
export const LAND = 0.12;
export const LAND_GAP = 0.08;
/** The beat before a card comes, by tier: a Legendary keeps the table waiting. */
export const BEAT = [0.05, 0.1, 0.28, 0.55];
/** Seconds a card takes from its first light to its whole face: the motes rise, then it is drawn in line by line. */
export const BEAM = 0.36;
/** Seconds of that before its face starts to be drawn (the motes alone). */
export const MOTES = 0.14;
/** Seconds the sparkles round a card last once it is all there, by tier. */
export const SPARKLE = [0, 0, 0.5, 0.9];

/** When one card's place appears, when the card starts to come, and when its face is all there (seconds from the deal). */
export interface CardDeal {
  landAt: number;
  beamAt: number;
  shownAt: number;
}

export interface Deal {
  cards: CardDeal[];
  /** From when the places of the rarer cards, still empty, show motes of their colour. */
  tellFrom: number;
  /** When the last card is all there: from then the cards can be taken. */
  doneAt: number;
}

/**
 * The deal of cards of these tiers: their places appear one after another; then the cards come one by
 * one, the commonest first and the rarest last, each after its beat.
 */
export function planDeal(tiers: number[]): Deal {
  const cards: CardDeal[] = tiers.map((_, i) => ({ landAt: i * LAND_GAP, beamAt: 0, shownAt: 0 }));
  const tellFrom = Math.max(0, tiers.length - 1) * LAND_GAP + LAND + 0.1;
  let t = tellFrom;
  const order = tiers.map((tier, i) => ({ tier, i })).sort((a, b) => a.tier - b.tier || a.i - b.i);
  for (const { tier, i } of order) {
    t += BEAT[tier];
    cards[i].beamAt = t;
    t += BEAM;
    cards[i].shownAt = t;
  }
  return { cards, tellFrom, doneAt: t };
}
