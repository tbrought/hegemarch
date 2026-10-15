/**
 * Boons a player discovers (lock and key). A new player is not dealt every Boon from the first choice:
 * a Boon that answers a problem joins their deck the first time they meet that problem, in any run, and
 * stays for good. Until then their deck is the Boons whose purpose is plain from the first minute
 * (Embers, kindling, building, Lore, plain firepower and hull): every Boon that is in no key below.
 *
 * Why: a playtester (Cody, Oct 2026) was offered "a wide variety of Boons early on before I've
 * encountered the problems that the Boons are intended to solve". Measured over 40 houses, the choices
 * come at about minutes 0, 1.8, 3.8, 6.2 and 8.9, while a house first loses a ship's worth of hull to
 * an enemy at about 1, first destroys an enemy ship at 4.7, fills its hangar at 10, and first has a
 * world attacked at 15.5: Bulwark and Militia were dealt three to five choices before their question.
 *
 * What the player has found is kept with the player (`Profile.boonKeys`, passed to a run as
 * `GameConfig.boonKeys`); a key that turns in a run is kept in the run (`systems/discovery.ts`). Rival
 * houses, and a run with no `boonKeys`, have every Boon.
 */
import type { Game } from '../Game';
import type { Faction } from '../types';

export interface BoonKey {
  id: string;
  /** What its Boons are for, as the herald says it: "For when your worlds are attacked". */
  forWhat: string;
  /** The moment that finds them, as the Boons screen says it: "found when one of your worlds is attacked". */
  when: string;
  /** The Boons it opens. */
  cards: string[];
  /** Has the moment come for this house? (Asked once a second, of the player only.) */
  met: (g: Game, f: Faction) => boolean;
}

/** Is one of the house's worlds being attacked, or looted by Corsairs, right now? */
function worldAttacked(g: Game, f: Faction): boolean {
  for (const n of g.nodes) if (n.owner === f.id && n.lastHit < 1.5 && n.lastHitBy >= 0 && n.lastHitBy !== f.id) return true;
  return g.pirates?.raids.some((r) => r.victim === f.id && r.phase === 'loot') ?? false;
}

/** Has the house seen a Corsair ship, their haven, or a raid of theirs on its worlds? */
function corsairsMet(g: Game, f: Faction): boolean {
  if (g.pirates?.raids.some((r) => r.victim === f.id)) return true;
  for (const u of g.unitList) if (!u.dead && u.node >= 0 && f.visible[u.node] && g.factions[u.owner]?.kind === 'pirate') return true;
  return false;
}

const has = (g: Game, f: Faction, type: string) => g.unitList.some((u) => !u.dead && u.owner === f.id && u.type === type);

export const BOON_KEYS: BoonKey[] = [
  {
    id: 'battle', forWhat: 'For your battles', when: 'your ships fight their first battle',
    cards: ['deflectors', 'longSights', 'ablative', 'fieldRepair', 'nanites', 'reflect', 'siphon', 'hivemind', 'laneStrike', 'echo', 'martyr', 'eternal',
      'singularity', 'stormcaller', 'bloodPact', 'glassCannon', 'bpCarrier', 'fighterBays', 'bpLancer', 'lanceCaps', 'bpStarfall'],
    met: (_g, f) => f.stats.damageDealt > 0 || f.stats.shipsLost > 0,
  },
  {
    id: 'kill', forWhat: 'For the enemy ships you destroy', when: 'you destroy your first enemy ship',
    cards: ['salvage', 'warEconomy', 'reverse', 'veterans'],
    met: (_g, f) => f.stats.kills > 0,
  },
  {
    id: 'ark', forWhat: 'For your Ark and your capital ships', when: 'your Ark rises a level',
    cards: ['arkAscendant', 'bpDread', 'dreadDoctrine'],
    met: (_g, f) => f.arkLevel >= 2,
  },
  {
    id: 'hangar', forWhat: 'For a hangar that runs out of room', when: 'your hangar is nearly full',
    cards: ['wideHangars', 'gildedCage'],
    met: (_g, f) => f.hangarCap > 0 && f.hangarUsed >= Math.ceil(f.hangarCap * 0.8),
  },
  {
    id: 'attacked', forWhat: 'For when your worlds are attacked', when: 'one of your worlds is attacked',
    cards: ['bulwark', 'batteries', 'militia', 'fortressHearth', 'anchors', 'bpStarbase', 'scorchedEarth'],
    met: worldAttacked,
  },
  { id: 'guardian', forWhat: 'For your Guardians', when: 'you have your first Guardian', cards: ['guardianDoctrine'], met: (g, f) => has(g, f, 'guardian') },
  { id: 'breaker', forWhat: 'For your Breakers', when: 'you have your first Breaker', cards: ['heavyPayloads'], met: (g, f) => has(g, f, 'breaker') },
  {
    id: 'observatory', forWhat: 'For your Observatories', when: 'you give a world the Observatory role', cards: ['greatLenses'],
    met: (g, f) => g.nodes.some((n) => n.owner === f.id && n.role === 'observatory'),
  },
  { id: 'corsairs', forWhat: 'Now that you know the Corsairs', when: 'you meet the Corsairs', cards: ['voidWhispers'], met: corsairsMet },
];

export const KEY_IDS = BOON_KEYS.map((k) => k.id);
export const KEY_BY_ID = Object.fromEntries(BOON_KEYS.map((k) => [k.id, k])) as Record<string, BoonKey>;
/** The key that opens a Boon (none: it is in every deck from the start). */
export const KEY_OF: Record<string, string> = Object.fromEntries(BOON_KEYS.flatMap((k) => k.cards.map((c) => [c, k.id])));

/**
 * The keys the player has for this run: those found before it (`GameConfig.boonKeys`) and those turned
 * in it. Null: every Boon (a rival house, or a run that passes no `boonKeys`).
 */
export function foundKeys(g: Game, f: Faction): Set<string> | null {
  const before = g.config.boonKeys;
  if (!before || f.id !== g.playerId || g.config.autoplay) return null;
  const out = new Set(before);
  for (const k of KEY_IDS) if (g.ui['key:' + k]) out.add(k);
  return out;
}

/** Was this key turned in this run (and not found before it)? */
export function keyTurnedThisRun(g: Game, key: string): boolean {
  return !!g.ui['key:' + key] && !(g.config.boonKeys ?? []).includes(key);
}
