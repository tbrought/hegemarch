/** When the omens over the sector come in at the start of a run (modals/cards.ts): a module of its own, for the tests. */

/**
 * How the omens come in, in seconds: the first at FIRST, the next GAP after it, the Ambition AMBITION
 * after the last; each star lights over LIGHT, its line is drawn over LINE, its omen fades up over FADE;
 * once lit, the Ambition's star kindles: a ring of gold fills round it over KINDLE.
 */
export const OMENS = { FIRST: 0.25, GAP: 0.65, AMBITION: 0.75, LIGHT: 0.25, LINE: 0.3, FADE: 0.35, KINDLE: 0.45 };

/** When each of `n` omens comes in, then the Ambition (if there is one), and when all of it is there. */
export function omensPlan(n: number, ambition: boolean): { at: number[]; ambAt: number; end: number } {
  const at = Array.from({ length: n }, (_, i) => OMENS.FIRST + i * OMENS.GAP);
  const ambAt = n ? at[n - 1] + OMENS.AMBITION : OMENS.FIRST;
  const last = ambition ? ambAt : n ? at[n - 1] : -Infinity;
  return { at, ambAt, end: last === -Infinity ? 0 : last + Math.max(OMENS.LIGHT, OMENS.LINE, OMENS.FADE) + 0.25 };
}
