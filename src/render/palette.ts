import { PAL } from '../game/data/heirs';

export { PAL };
export type PalName = keyof typeof PAL;

/** Every color the game draws with (the Ember-16 palette). */
export const PALETTE: string[] = Object.values(PAL);

/** A darker companion for each bright color, for shading sprites and borders. */
export const SHADE: Record<string, string> = {
  [PAL.gold]: PAL.ember,
  [PAL.ember]: PAL.wine,
  [PAL.red]: PAL.wine,
  [PAL.teal]: PAL.sea,
  [PAL.sea]: PAL.indigo,
  [PAL.sky]: PAL.slate,
  [PAL.violet]: PAL.indigo,
  [PAL.pink]: PAL.wine,
  [PAL.mist]: PAL.dusk,
  [PAL.bone]: PAL.mist,
  [PAL.dusk]: PAL.slate,
  [PAL.slate]: PAL.indigo,
  [PAL.indigo]: PAL.night,
  [PAL.night]: PAL.void,
  [PAL.wine]: PAL.night,
  [PAL.void]: PAL.void,
};

/** A lighter companion for highlights. */
export const LIGHT: Record<string, string> = {
  [PAL.gold]: PAL.bone,
  [PAL.ember]: PAL.gold,
  [PAL.red]: PAL.ember,
  [PAL.teal]: PAL.bone,
  [PAL.sea]: PAL.teal,
  [PAL.sky]: PAL.mist,
  [PAL.violet]: PAL.pink,
  [PAL.pink]: PAL.bone,
  [PAL.mist]: PAL.bone,
  [PAL.bone]: PAL.bone,
  [PAL.dusk]: PAL.mist,
  [PAL.slate]: PAL.dusk,
  [PAL.indigo]: PAL.slate,
  [PAL.night]: PAL.indigo,
  [PAL.wine]: PAL.red,
  [PAL.void]: PAL.night,
};

export const shade = (c: string) => SHADE[c] ?? PAL.indigo;
export const light = (c: string) => LIGHT[c] ?? PAL.bone;

/** UI roles. */
export const UI = {
  bg: PAL.void,
  panel: PAL.night,
  panel2: PAL.indigo,
  border: PAL.slate,
  borderHi: PAL.dusk,
  text: PAL.bone,
  dim: PAL.dusk,
  faint: PAL.slate,
  accent: PAL.gold,
  good: PAL.teal,
  bad: PAL.red,
  warn: PAL.ember,
  ember: PAL.gold,
  lore: PAL.violet,
} as const;

export function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
