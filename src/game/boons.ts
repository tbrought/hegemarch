/**
 * Boons: which a house may be offered, how an offer is dealt (rarity, luck, the Blueprint that is owed
 * after a while), and what choosing, rerolling or passing does.
 */

import { BLUEPRINT_BY, BLUEPRINT_BY_RIVAL, BLUEPRINT_IDS, CARD_BY_ID, CARDS, LEGENDARY_BY, RARITY_LUCK, RARITY_WEIGHT, type CardDef } from './data/cards';
import { foundKeys, KEY_IDS, KEY_OF } from './data/boonKeys';
import { RNG } from './rng';
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
  // (A player's house by its seat: in a game together, every player's; its pool stays its own while the AI
  // stands in for a player who has left.)
  const isHumanPlayer = g.seated(f.id);
  // Legendary Boons can turn up for every player at their odds, which Fortunate Stars raises (not in the
  // First Night, which keeps to plain ones); Legendary Lineage guarantees one a run. Until 1.18.3 none
  // was offered without Lineage, so the ranks of Fortunate Stars did nothing for Legendaries until a
  // second thing was bought, and no way of saying so in the Hall read clearly. A rival house: from Hard.
  const legendaryOk = isHumanPlayer ? !g.config.tutorial : g.config.difficulty >= 2;
  const pactsOk = isHumanPlayer ? (g.seatOf(f.id)?.pacts ?? g.config.unlockPacts) : true;
  // A player who has not met what a Boon is for yet is not dealt it (data/boonKeys.ts).
  const keys = foundKeys(g, f);
  return CARDS.filter(
    (c) =>
      !c.hidden &&
      (!keys || !KEY_OF[c.id] || keys.has(KEY_OF[c.id])) &&
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

/** What dealing an offer knows of the house's run so far, and moves on. */
interface DealState {
  /** Offers since the last one that held a Blueprint. */
  bpPity: number;
  /** The Blueprints the run has offered the house so far. */
  bpSeen: string[];
  /** Legendary Lineage (the player's alone): offers dealt, and whether one has held a Legendary. Null: nothing is promised. */
  lineage: { dealt: number; seen: boolean } | null;
  /**
   * The Boons just discovered (the player's alone): the next offer holds one of them, and says so by
   * setting `freshServed`. Empty: none is owed.
   */
  fresh: string[];
  freshServed: boolean;
}

function dealState(g: Game, f: Faction): DealState {
  const seat = g.seatOf(f.id);
  const promised = (seat ? seat.human && !!seat.legendary : f.isPlayer && g.config.unlockLegendary) && !g.cradle;
  // (A game together keeps each house's count on the house; alone, it is where it always was.)
  const count = seat ? { dealt: f.lineage?.dealt ?? 0, seen: !!f.lineage?.seen } : { dealt: g.ui.offersDealt ?? 0, seen: !!g.ui.legendarySeen };
  return { bpPity: f.bpPity, bpSeen: [...(f.bpSeen ?? [])], lineage: promised ? count : null, fresh: freshOwed(g, f), freshServed: false };
}

/** The keys turned in this run whose Boon is still owed to the next offer (`fresh:` in `Game.ui`, set by systems/discovery.ts). */
function freshKeys(g: Game, f: Faction): string[] {
  return f.id === g.playerId ? KEY_IDS.filter((k) => g.ui['fresh:' + k]) : [];
}

/** The Boons the next offer owes the player: those of the keys just turned that can be dealt now. */
function freshOwed(g: Game, f: Faction): string[] {
  const keys = freshKeys(g, f);
  if (!keys.length) return [];
  return g.cardPool(f).filter((c) => keys.includes(KEY_OF[c.id])).map((c) => c.id);
}

const isBlueprint = (id: string) => CARD_BY_ID[id].cat === 'blueprint';
const isLegendary = (id: string) => CARD_BY_ID[id].rarity === 'legendary';

/**
 * Deal one offer from a pool: by weight, then the Blueprint that is owed, then the Legendary that is
 * promised. It rolls the dice it is given and moves the state it is given, and touches nothing else:
 * the run deals with its own dice and keeps the state (`generateOffer`), and the odds of the next offer
 * are found by dealing it many times with other dice (`offerOdds`).
 */
function deal(f: Faction, pool: CardDef[], n: number, rng: RNG, st: DealState): string[] {
  const luck = f.mods.luck;
  const out: string[] = [];
  let pactTaken = false;
  const avail = [...pool];
  while (out.length < n && avail.length) {
    const c = rng.weighted(avail, (cd) => {
      if (cd.pact && pactTaken) return 0;
      const w = RARITY_WEIGHT[cd.rarity] + RARITY_LUCK[cd.rarity] * luck;
      return Math.max(0.2, w) * (cd.pact ? 0.55 : 1) * (cd.cat === 'blueprint' ? 1.6 : 1);
    });
    if (!c) break;
    out.push(c.id);
    if (c.pact) pactTaken = true;
    avail.splice(avail.indexOf(c), 1);
  }
  // The Blueprint that is owed. The player: after `BLUEPRINT_BY` offers without one the next always
  // shows one, and one the run has not shown yet while there is one. A rival house: after
  // `BLUEPRINT_BY_RIVAL`, any of them, and what it has been shown is not kept.
  const hasBp = out.some(isBlueprint);
  if (!hasBp && st.bpPity >= (f.isPlayer ? BLUEPRINT_BY : BLUEPRINT_BY_RIVAL)) {
    const bps = BLUEPRINT_IDS.filter((id) => !f.cards.includes(id) && pool.some((c) => c.id === id));
    const fresh = bps.filter((id) => !st.bpSeen.includes(id));
    if (bps.length && out.length) {
      out[out.length - 1] = rng.pick(fresh.length ? fresh : bps);
      st.bpPity = 0;
    }
  } else if (hasBp) st.bpPity = 0;
  else st.bpPity++;
  if (f.isPlayer) for (const id of out) if (isBlueprint(id) && !st.bpSeen.includes(id)) st.bpSeen.push(id);
  // Legendary Lineage: a run shows at least one Legendary (see `LEGENDARY_BY`). It takes the place of
  // a Common Boon if there is one, and never of a Blueprint.
  if (st.lineage && out.length) {
    st.lineage.dealt++;
    if (out.some(isLegendary)) st.lineage.seen = true;
    else if (!st.lineage.seen && st.lineage.dealt >= LEGENDARY_BY) {
      const legends = pool.filter((c) => c.rarity === 'legendary');
      const spare = (id: string) => !isBlueprint(id);
      let at = out.findIndex((id) => spare(id) && CARD_BY_ID[id].rarity === 'common');
      if (at < 0) at = out.findIndex(spare);
      if (legends.length && at >= 0) {
        out[at] = rng.pick(legends).id;
        st.lineage.seen = true;
      }
    }
  }
  // A Boon just discovered: the offer after a key has turned holds one of its Boons, in the place of a
  // Boon that is neither the Blueprint owed nor the Legendary promised (a Common first).
  if (st.fresh.length && out.length) {
    if (out.some((id) => st.fresh.includes(id))) st.freshServed = true;
    else {
      const pact = out.some((id) => CARD_BY_ID[id].pact);
      const can = st.fresh.filter((id) => !out.includes(id) && !(pact && CARD_BY_ID[id].pact));
      const spare = (id: string) => !isBlueprint(id) && !isLegendary(id);
      let at = out.findIndex((id) => spare(id) && CARD_BY_ID[id].rarity === 'common');
      if (at < 0) at = out.findIndex(spare);
      if (can.length && at >= 0) {
        const id = rng.pick(can);
        out[at] = id;
        st.freshServed = true;
        // (Dealt so, it counts as any card dealt: a Blueprint shown, a Legendary seen. Until 1.23.3 the
        // Blueprint owed could come the next offer after one, and a Legendary was still promised.)
        if (isBlueprint(id)) {
          st.bpPity = 0;
          if (f.isPlayer && !st.bpSeen.includes(id)) st.bpSeen.push(id);
        }
        if (isLegendary(id) && st.lineage) st.lineage.seen = true;
      }
    }
  }
  return out;
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
  const st = dealState(g, f);
  // (A game together: each house's own dice, so one player's draft does not move another's luck.)
  const dice = f.dice ? new RNG(f.dice) : g.rng;
  const out = deal(f, pool, n, dice, st);
  if (f.dice) f.dice = dice.state();
  f.bpPity = st.bpPity;
  // (Written only once there is one to remember: see DESIGN.md on fields that are not always there.)
  if (st.bpSeen.length > (f.bpSeen?.length ?? 0)) f.bpSeen = st.bpSeen;
  if (st.lineage && g.config.seats) f.lineage = { dealt: st.lineage.dealt, seen: st.lineage.seen ? 1 : 0 };
  else if (st.lineage) {
    g.ui.offersDealt = st.lineage.dealt;
    if (st.lineage.seen) g.ui.legendarySeen = 1;
  }
  // (The Boon owed for a key just turned has been dealt: owed no longer. One that could find no place
  // stays owed to the next offer.)
  if (st.freshServed) for (const k of freshKeys(g, f)) delete g.ui['fresh:' + k];
  return out;
}

/** What the next offer is likely to hold, see `offerOdds`. */
export interface OfferOdds {
  /** The chance (0 to 1) that at least one of the choices is a Blueprint, an Epic Boon, a Legendary Boon. */
  blueprint: number;
  epic: number;
  legendary: number;
  /** Offers without a Blueprint that may still pass before one is owed (0: the next offer holds one). Null: there is none left to be had. */
  blueprintIn: number | null;
  /** Offers that may still pass before the Legendary that is promised (0: the next holds it). Null: none is promised, or it has been kept. */
  legendaryIn: number | null;
  /** How many choices the offer has. */
  choices: number;
}

/**
 * The odds of the house's next offer: it is dealt many times over as the run would deal it now, with
 * dice of its own (the run's are not rolled, and nothing of the run is changed). So the figures are true
 * of this house at this moment: the Boons it can still be offered, its rank of Fortunate Stars, the
 * number of its choices, the Blueprint it is owed and the Legendary it is promised. A playtester who
 * had bought every rank asked to be shown his chances; a figure that is measured once and written down
 * (as the Hall's are) cannot follow a run.
 */
export function offerOdds(g: Game, f: Faction, trials = 3000): OfferOdds {
  const pool = g.cardPool(f);
  const n = g.draftSize(f);
  const base = dealState(g, f);
  // (The same dice every time it is asked: the figures do not waver while nothing has changed.)
  const rng = new RNG(0x0dd5);
  let blueprint = 0;
  let epic = 0;
  let legendary = 0;
  for (let i = 0; i < trials; i++) {
    const out = deal(f, pool, n, rng, { bpPity: base.bpPity, bpSeen: [...base.bpSeen], lineage: base.lineage ? { ...base.lineage } : null, fresh: base.fresh, freshServed: false });
    if (out.some(isBlueprint)) blueprint++;
    if (out.some((id) => CARD_BY_ID[id].rarity === 'epic')) epic++;
    if (out.some(isLegendary)) legendary++;
  }
  const bpLeft = pool.some((c) => c.cat === 'blueprint');
  const legends = pool.some((c) => c.rarity === 'legendary');
  return {
    blueprint: blueprint / trials, epic: epic / trials, legendary: legendary / trials,
    blueprintIn: bpLeft ? Math.max(0, (f.isPlayer ? BLUEPRINT_BY : BLUEPRINT_BY_RIVAL) - base.bpPity) : null,
    legendaryIn: base.lineage && !base.lineage.seen && legends ? Math.max(0, LEGENDARY_BY - 1 - base.lineage.dealt) : null,
    choices: n,
  };
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
