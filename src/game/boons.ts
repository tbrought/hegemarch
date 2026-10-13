/**
 * Boons: which a house may be offered, how an offer is dealt (rarity, luck, the Blueprint that is owed
 * after a while), and what choosing, rerolling or passing does.
 */

import { BLUEPRINT_IDS, CARD_BY_ID, CARDS, LEGENDARY_BY, RARITY_LUCK, RARITY_WEIGHT, type CardDef } from './data/cards';
import type { Faction, Rarity } from './types';
import { clamp } from './util';
import type { Game } from './Game';

/** The Boons the First Night offers first (as many as the house may choose from), see `generateOffer`. */
const FIRST_OFFER = ['emberTithe', 'strikerWings', 'kindlingRites', 'hardHulls', 'stargazers'];

/** The most choices a Boon draft can offer. */
export const MAX_DRAFT = 5;

export function cardCount(f: Faction, id: string): number {
  let c = 0;
  for (const x of f.cards) if (x === id) c++;
  return c;
}

export function addCard(g: Game, f: Faction, id: string) {
  const def = CARD_BY_ID[id];
  if (!def) return;
  f.cards.push(id);
  def.onPick?.(g, f);
  g.recomputeMods(f);
  if (def.cat === 'blueprint' && f.isPlayer) {
    const what = id === 'bpStarbase' ? 'Any of your worlds can now build a Starbase.' : id === 'bpStarfall' ? 'Your Hearth can now build one.' : 'Your Forges can now build it.';
    g.notify(f.id, `${def.name} learned. ${what}`, 'good');
  }
}

export function cardPool(g: Game, f: Faction, rarities?: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef[] {
  const isHumanPlayer = f.id === g.playerId && !g.config.autoplay;
  const legendaryOk = isHumanPlayer ? g.config.unlockLegendary : g.config.difficulty >= 2;
  const pactsOk = isHumanPlayer ? g.config.unlockPacts : true;
  return CARDS.filter(
    (c) =>
      !c.hidden &&
      (!c.when || c.when(g, f)) &&
      // (On the cradle a house is offered the Boons of its own age, and no others.)
      !!c.cradle === g.cradle &&
      (!g.cradle || c.age === f.era) &&
      g.cardCount(f, c.id) < c.max &&
      (!c.requires || f.cards.includes(c.requires)) &&
      // An extra choice is worthless once the draft is already as big as it gets.
      (c.id !== 'quantum' || 3 + f.mods.draft < MAX_DRAFT) &&
      (c.rarity !== 'legendary' || legendaryOk || (rarities && rarities.includes('legendary'))) &&
      (!c.pact || allowPacts || c.basePact || pactsOk) &&
      (!rarities || rarities.includes(c.rarity)) &&
      (!filter || filter(c)),
  );
}

export function grantRandomCard(g: Game, f: Faction, rarities: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef | null {
  const pool = g.cardPool(f, rarities, filter, allowPacts);
  if (pool.length === 0) return null;
  const c = g.rng.pick(pool);
  g.addCard(f, c.id);
  if (f.isPlayer) g.notify(f.id, `Gained a Boon: ${c.name}.`, 'good');
  return c;
}

/** Choices per Boon draft: 3, plus bonuses, at most 5 (all must fit on the smallest screen). */
export function draftSize(f: Faction): number {
  return clamp(3 + f.mods.draft, 2, MAX_DRAFT);
}

export function generateOffer(g: Game, f: Faction): string[] {
  const pool = g.cardPool(f);
  const n = g.draftSize(f);
  // The First Night deals its first Boons by hand: plain ones, about things the player has just done
  // (earned Embers, built a Striker, kindled a world). Dealt at random, a first offer could be three
  // Boons about things a new player has not met yet. A reroll, and every later offer, is random.
  if (g.config.tutorial && f.isPlayer && !g.ui.tutBoon && f.cards.length === 0) {
    g.ui.tutBoon = 1;
    const first = FIRST_OFFER.filter((id) => pool.some((c) => c.id === id)).slice(0, n);
    if (first.length >= Math.min(3, n)) return first;
  }
  const luck = f.mods.luck;
  const out: string[] = [];
  let pactTaken = false;
  const avail = [...pool];
  while (out.length < n && avail.length) {
    const c = g.rng.weighted(avail, (cd) => {
      if (cd.pact && pactTaken) return 0;
      const w = RARITY_WEIGHT[cd.rarity] + RARITY_LUCK[cd.rarity] * luck;
      return Math.max(0.2, w) * (cd.pact ? 0.55 : 1) * (cd.cat === 'blueprint' ? 1.6 : 1);
    });
    if (!c) break;
    out.push(c.id);
    if (c.pact) pactTaken = true;
    avail.splice(avail.indexOf(c), 1);
  }
  // Blueprint pity: after four drafts without one, the next draft always shows a Blueprint.
  const hasBp = out.some((id) => CARD_BY_ID[id].cat === 'blueprint');
  if (!hasBp && f.bpPity >= 4) {
    const bps = BLUEPRINT_IDS.filter((id) => !f.cards.includes(id) && pool.some((c) => c.id === id));
    if (bps.length && out.length) {
      out[out.length - 1] = g.rng.pick(bps);
      f.bpPity = 0;
    }
  } else if (hasBp) f.bpPity = 0;
  else f.bpPity++;
  // Legendary Lineage: a run shows at least one Legendary (see `LEGENDARY_BY`). It takes the place of
  // a Common Boon if there is one, and never of a Blueprint.
  if (f.isPlayer && g.config.unlockLegendary && !g.cradle && out.length) {
    g.ui.offersDealt = (g.ui.offersDealt ?? 0) + 1;
    if (out.some((id) => CARD_BY_ID[id].rarity === 'legendary')) g.ui.legendarySeen = 1;
    else if (!g.ui.legendarySeen && g.ui.offersDealt >= LEGENDARY_BY) {
      const legends = pool.filter((c) => c.rarity === 'legendary');
      const spare = (id: string) => CARD_BY_ID[id].cat !== 'blueprint';
      let at = out.findIndex((id) => spare(id) && CARD_BY_ID[id].rarity === 'common');
      if (at < 0) at = out.findIndex(spare);
      if (legends.length && at >= 0) {
        out[at] = g.rng.pick(legends).id;
        g.ui.legendarySeen = 1;
      }
    }
  }
  return out;
}

export function ensureOffer(g: Game, f: Faction): string[] | null {
  if (f.pendingDrafts <= 0) return null;
  if (!f.draftOffer || f.draftOffer.length === 0) f.draftOffer = g.generateOffer(f);
  return f.draftOffer;
}

export function cmdChooseCard(g: Game, fid: number, cardId: string): boolean {
  const f = g.factions[fid];
  const offer = g.ensureOffer(f);
  if (!offer || !offer.includes(cardId)) return false;
  f.pendingDrafts--;
  f.draftOffer = null;
  g.addCard(f, cardId);
  return true;
}

export function cmdReroll(g: Game, fid: number): boolean {
  const f = g.factions[fid];
  if (f.pendingDrafts <= 0 || f.rerolls <= 0) return false;
  f.rerolls--;
  f.draftOffer = g.generateOffer(f);
  return true;
}

/** Embers paid for skipping a Boon. */
export function skipValue(f: Faction): number {
  return 60 + 15 * f.boons;
}

export function cmdSkipDraft(g: Game, fid: number): boolean {
  const f = g.factions[fid];
  if (f.pendingDrafts <= 0) return false;
  f.pendingDrafts--;
  f.draftOffer = null;
  g.addEmbers(f, g.skipValue(f));
  return true;
}
