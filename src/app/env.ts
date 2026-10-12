/** What the app knows of where it runs: its version, and whether there is a mouse. */

/** Shown on the title screen: package.json's version, put in by Vite (vite.config.ts). */
declare const __GAME_VERSION__: string;
export const GAME_VERSION = __GAME_VERSION__;

/**
 * A screen that is touched and has no pointer to hover with: a phone or a tablet. The game needs a
 * mouse (the wheel, the right button).
 */
export const NO_MOUSE = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
