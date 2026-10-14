/**
 * The Ember count of the top bar: how the figure shown rolls toward the real one, and when it is white.
 */

/** The least that counts as a lump of Embers (gained or spent): it also sets off the "+250" under the count. */
export const LUMP = 25;
/** Seconds the count is white after a lump has come in. */
export const LUMP_FLASH = 0.5;

/** What the top bar remembers of the count from frame to frame (the Hud holds it). */
export interface EmberCount {
  /** The figure as drawn (below zero: nothing has been drawn yet). */
  embersShown: number;
  /** The real figure at the last frame. */
  lastEmbers: number;
  /** Seconds the count is still white. */
  emberFlash: number;
}

/**
 * One frame on. The figure shown closes nine tenths of its distance to the real one every quarter of a
 * second; a lump that came in since the last frame turns the count white for `LUMP_FLASH` seconds.
 * Returns the lump (0 when there was none).
 *
 * The count used to be white whenever the figure shown was 5 or more behind the real one. That was
 * meant for a lump, but a steady income keeps the figure behind by a ninth of what a second brings: at
 * 45 Embers a second the distance is 5, the game adds its income twenty times a second and the screen
 * draws sixty, so the distance crossed 5 with every step and the count changed colour on two frames in
 * three. Between 39 and 53 Embers a second (21 to 25 at double speed) it flickered; above that it was
 * simply white for good. A playtester of 1.17 found it unpleasant, with reason. The white now answers
 * the lump itself and lasts a fixed time, so an income cannot set it off and nothing can make it flicker.
 */
export function rollEmbers(st: EmberCount, embers: number, dt: number): number {
  if (st.embersShown < 0 || st.lastEmbers < 0) st.embersShown = st.lastEmbers = embers;
  const delta = embers - st.lastEmbers;
  st.lastEmbers = embers;
  const gap = embers - st.embersShown;
  st.embersShown = Math.abs(gap) < 1 ? embers : st.embersShown + gap * Math.min(1, dt * 9);
  st.emberFlash = delta >= LUMP ? LUMP_FLASH : Math.max(0, st.emberFlash - dt);
  return Math.abs(delta) >= LUMP ? delta : 0;
}
