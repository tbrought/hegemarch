/**
 * The passage of an Ages run from its cradle world to the stars.
 *
 * When the player's Ark leaves the cradle, the run goes on as a game among the stars (the classic
 * game), built from how the cradle went:
 *  - the houses are the player's and every rival that left the cradle alive or is still climbing
 *    there (a house whose Hearth was put out on the cradle is gone for good);
 *  - a rival whose Ark left earlier has been out there for that long already: the sector is played
 *    forward without the player until the player arrives. A rival that had not left yet arrives later.
 *    Until a house arrives it holds its Hearth and nothing more, and nothing can touch it;
 *  - every house keeps the Boons of its ages, and brings Embers with it; the player's lands on the
 *    cradle pay in Embers and a few more ships at the start.
 */
import { Game } from './Game';
import { ERAS, LAST_CRADLE_ERA } from './data/eras';
import { hashString } from './rng';
import type { Faction, GameConfig, UnitType } from './types';

/** The longest head start (seconds) a rival that left earlier can have, per difficulty. */
const LEAD_CAP = [300, 420, 540, 660];
/** The longest a house still on the cradle takes to follow (seconds). */
const FOLLOW_CAP = 720;
/** Seconds after a house arrives during which rival houses leave it alone unless it strikes first, per difficulty. */
const GRACE = [600, 480, 360, 240];

export interface PassageRival {
  name: string;
  color: string;
  /** 'ahead': its Ark left before the player's. 'behind': it is still climbing. 'fallen': its Hearth was put out on the cradle. */
  fate: 'ahead' | 'behind' | 'fallen';
  /** Ahead: seconds since its Ark left. Behind: seconds until it follows (an estimate). */
  seconds: number;
  /** Behind: the age it has reached. */
  era: number;
}

/** What the cradle leaves the player with, and where every rival stands: for the card shown as the Ark leaves. */
export interface Passage {
  cradleTime: number;
  lands: number;
  boons: number;
  /** Embers and extra ships the player starts with among the stars. */
  embers: number;
  ships: number;
  rivals: PassageRival[];
}

/** Seconds until a house still on the cradle would see its own Ark leave, at the pace it is going. */
function etaToArk(f: Faction): number {
  const rate = Math.max(0.8, f.loreRate);
  let lore = f.lore;
  let t = 0;
  for (let e = f.era; e <= LAST_CRADLE_ERA; e++) {
    if (e === f.era && f.advance) {
      t += f.advance.total - f.advance.t;
      continue;
    }
    t += Math.max(0, ERAS[e].lore - lore) / rate + ERAS[e].time;
    lore = Math.max(0, lore - ERAS[e].lore);
  }
  return t;
}

function landsOf(g: Game, f: Faction): number {
  return g.worldsOf(f.id).length;
}

function carriedEmbers(g: Game, f: Faction): number {
  return Math.min(2000, Math.floor(f.embers * 0.5)) + landsOf(g, f) * 50;
}

/** Extra ships for the lands the player held: one for every two beyond the Hearth, up to four. */
function carriedShips(g: Game, f: Faction): number {
  return Math.max(0, Math.min(4, Math.floor((landsOf(g, f) - 1) / 2)));
}

export function describePassage(cradle: Game): Passage {
  const p = cradle.player;
  const rivals: PassageRival[] = cradle
    .empires()
    .filter((f) => f.id !== p.id)
    .map((f) => {
      if (f.launchedAt >= 0) return { name: f.name, color: f.color, fate: 'ahead' as const, seconds: cradle.time - f.launchedAt, era: f.era };
      if (!f.alive) return { name: f.name, color: f.color, fate: 'fallen' as const, seconds: 0, era: f.era };
      return { name: f.name, color: f.color, fate: 'behind' as const, seconds: Math.min(FOLLOW_CAP, etaToArk(f)), era: f.era };
    });
  return { cradleTime: cradle.time, lands: landsOf(cradle, p), boons: p.cards.length, embers: carriedEmbers(cradle, p), ships: carriedShips(cradle, p), rivals };
}

/**
 * The game among the stars that follows this cradle (whose player's Ark has left), with every house
 * asleep until its own arrival. The caller plays it forward to `config.ages.arrival`, the moment the
 * player arrives, before showing it. Returns null if no rival is left to meet out there.
 */
export function ascend(cradle: Game): Game | null {
  const d = cradle.config.difficulty;
  const p = cradle.player;
  const rivals = cradle.empires().filter((f) => f.id !== p.id && (f.alive || f.launchedAt >= 0));
  if (rivals.length === 0) return null;
  // Head starts (positive) and delays (negative) of the rivals, next to the player's own leaving.
  const lead = rivals.map((f) => (f.launchedAt >= 0 ? Math.min(LEAD_CAP[d], cradle.time - f.launchedAt) : -Math.min(FOLLOW_CAP, etaToArk(f))));
  const arrival = Math.max(0, ...lead);
  const config: GameConfig = {
    ...cradle.config,
    stage: 'stars',
    seed: hashString(`hegemarch-stars-${cradle.config.seed}`),
    houses: rivals.length + 1,
    aiHeirs: rivals.map((f) => f.heir),
    tutorial: false,
    ages: { cradleTime: cradle.time, lands: landsOf(cradle, p), arrival },
  };
  const g = Game.create(config);
  [p, ...rivals].forEach((old, i) => {
    const f = g.factions[i];
    // The Boons of its ages (their effects go on; nothing is "picked" again).
    f.cards.push(...old.cards);
    f.rerolls = Math.max(f.rerolls, old.rerolls);
    f.stats = { ...old.stats };
    f.embers += carriedEmbers(cradle, old);
    g.recomputeMods(f);
    // Asleep until it arrives; and for a while after that its rivals leave it alone.
    f.asleepUntil = i === 0 ? arrival : Math.max(0, arrival - lead[i - 1]);
    f.graceUntil = f.asleepUntil + GRACE[d];
    if (f.ai) f.ai.firstAttackAt += f.asleepUntil;
    if (f.asleepUntil > 0) for (const u of g.unitsOf(f.id)) if (u.order === 'explore') u.order = 'idle';
  });
  // The player's cradle: a Hearth as high as it stood there, a little Lore, and ships for the lands held.
  const me = g.factions[0];
  const oldHearth = p.capital >= 0 ? cradle.nodes[p.capital] : null;
  if (oldHearth && me.capital >= 0) g.setLevel(g.nodes[me.capital], Math.max(2, oldHearth.level));
  me.lore += Math.min(120, p.lore);
  const extra: UnitType[] = ['guardian', 'striker', 'guardian', 'striker'];
  for (let k = 0; k < carriedShips(cradle, p); k++) g.spawnUnit(extra[k], me.id, me.capital);
  g.countSleepers();
  return g;
}
