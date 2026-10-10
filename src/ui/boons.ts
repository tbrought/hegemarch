import { CARD_BY_ID, PACT_COLOR, RARITY_COLOR, type CardCat, type CardDef } from '../game/data/cards';
import { textOutline } from '../render/font';
import { PAL, shade } from '../render/palette';
import { box, type Ctx } from '../render/pixel';
import { icon } from '../render/sprites';

/** Shared look for Boons: category icons, rarity colors and the small tiles used by the tray. */

export const CAT_ORDER: CardCat[] = ['war', 'wealth', 'growth', 'lore', 'ward', 'blueprint', 'pact'];

const CAT_ICON: Record<CardCat, string> = {
  war: 'catWar',
  wealth: 'catWealth',
  growth: 'catGrowth',
  lore: 'catLore',
  ward: 'catWard',
  blueprint: 'catBlueprint',
  pact: 'catPact',
};

export const catIcon = (cat: CardCat): string => CAT_ICON[cat];

export const boonColor = (c: CardDef): string => (c.pact ? PACT_COLOR : RARITY_COLOR[c.rarity]);

/** A house's Boons with stacks folded together, in the order they were first taken. */
export function groupBoons(cards: string[]): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  const at = new Map<string, number>();
  for (const id of cards) {
    if (!CARD_BY_ID[id]) continue;
    const i = at.get(id);
    if (i === undefined) {
      at.set(id, out.length);
      out.push({ id, count: 1 });
    } else out[i].count++;
  }
  return out;
}

export const TILE = 11;

/** An 11x11 tile: rarity border, category icon and a stack count on the corner. */
export function boonTile(g: Ctx, x: number, y: number, c: CardDef, count: number, o: { hot?: boolean; flash?: number } = {}) {
  const col = boonColor(c);
  const flash = o.flash ?? 0;
  box(g, x, y, TILE, TILE, o.hot ? PAL.indigo : PAL.night, flash > 0 ? PAL.bone : o.hot ? PAL.bone : col);
  if (c.rarity === 'epic' || c.rarity === 'legendary') box(g, x + 1, y + 1, TILE - 2, TILE - 2, null, shade(col));
  icon(g, catIcon(c.cat), x + 3, y + 3, flash > 0.5 ? PAL.bone : col);
  if (count > 1) textOutline(g, String(count), x + TILE - 3, y + TILE - 5, PAL.gold, PAL.void, 'tiny');
}

/** A relic tile in the same style. */
export function relicTile(g: Ctx, x: number, y: number, o: { hot?: boolean } = {}) {
  box(g, x, y, TILE, TILE, o.hot ? PAL.indigo : PAL.night, o.hot ? PAL.bone : PAL.sky);
  icon(g, 'relic', x + 3, y + 3);
}
