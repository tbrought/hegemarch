import type { Game } from '../game/Game';
import { LEGACY_MUL } from '../game/constants';
import { AMBITION_BY_ID } from '../game/data/ambitions';
import { PERK_EMBERS, PERK_HEARTH, PERK_HULL, PERK_LORE, PERK_WALLS } from './perks';
import type { Profile } from './profile';
import type { RunFigures } from './records';

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  costs: number[];
}

/**
 * How many Boon offers in a hundred hold an Epic Boon, by rank of Fortunate Stars: what the Hall of
 * Heirs tells the player the perk does, in a table under it (app/screens/hall.ts). Measured over 600
 * runs, and kept true by a test (tests/hall.test.ts).
 */
export const EPIC_ODDS = [24, 32, 38, 44, 49, 55];
/**
 * And how many hold a Legendary Boon, for a player who owns Legendary Lineage: what is left to the odds,
 * beyond the one that is promised. Measured and kept true the same way (5,400 offers a rank). Until 1.18
 * a rank added a third of this to a Legendary's weight: 2% with no rank and 6% with all five, so that
 * 770 Legacy of ranks brought a run 1.6 Legendary Boons where it had 1.2, and the Hall said nothing of
 * it. A playtester who had bought them all found the return hard to see, and it was.
 */
export const LEGENDARY_ODDS = [2, 5, 7, 9, 11, 13];

const pc = (x: number) => `${Math.round(x * 100)}%`;

export const PERKS: PerkDef[] = [
  { id: 'oldCoin', name: 'Old Coin', desc: `[+${pc(PERK_EMBERS)} Embers] from every world, all run long, per rank.`, costs: [40, 80, 120] },
  { id: 'loreSeed', name: 'Lorekeepers', desc: `[+${pc(PERK_LORE)} Lore] all run long per rank, so every Boon comes sooner.`, costs: [50, 100] },
  { id: 'escort', name: 'Veteran Escort', desc: `Begin each run with [+1 Guardian], and every ship of yours has [+${pc(PERK_HULL)} hull], per rank.`, costs: [60, 120] },
  { id: 'archivist', name: 'Archivist', desc: '[+1 Boon reroll] per rank.', costs: [50, 100] },
  { id: 'luck', name: 'Fortunate Stars', desc: 'Rarer Boons [appear more often] with each rank. The chance that a Boon choice offers one:', costs: [60, 100, 150, 200, 260] },
  { id: 'bastion', name: 'Ancestral Walls', desc: `Every world of yours gains [+${pc(PERK_WALLS)} hull] and your Hearth [+${pc(PERK_HEARTH)}] in ` +
      `all, per rank.`, costs: [40, 80] },
  { id: 'secondBreath', name: 'Second Breath', desc: 'Your Hearth’s Last Stand calls [twice the defenders].', costs: [70] },
];

export const UNLOCKS = [
  { id: 'pacts', name: 'Forbidden Archives', desc: '[Every double-edged Pact] can appear among your Boons.', cost: 80 },
  { id: 'legendary', name: 'Legendary Lineage', desc: '[Legendary Boons] appear among your choices: [at least one in every run], by your fifth ' +
      'choice.', cost: 120 },
] as const;

/**
 * The odds a perk whose effect is a chance shows under its text in the Hall of Heirs: one row for each
 * thing it makes likelier, a figure for every rank. "More often" alone cannot be checked by playing, and
 * a player who has paid for it should not have to wonder whether it did anything. (In 1.18.0 these were
 * sentences, "an Epic is in 24% of your Boon choices and a Legendary in 2% now; 32% and 5% at rank 1,
 * 55% and 13% at rank 5": true, and a paragraph of figures beside cards that say what they do in a line.
 * A table at every rank says it at a glance, and what each rank buys.)
 */
export function perkOdds(pk: PerkDef): { id: 'epic' | 'legendary'; label: string; odds: number[] }[] {
  if (pk.id !== 'luck') return [];
  return [
    { id: 'epic', label: 'Epic', odds: EPIC_ODDS },
    { id: 'legendary', label: 'Legendary', odds: LEGENDARY_ODDS },
  ];
}

/** The Legacy spent on perks, all of which the Hall can give back (and then the perks are gone). */
export function perksSpent(perks: Record<string, number>): number {
  let sum = 0;
  for (const pk of PERKS) {
    const rank = Math.min(perks[pk.id] ?? 0, pk.costs.length);
    for (let i = 0; i < rank; i++) sum += pk.costs[i];
  }
  return sum;
}

export interface LegacyReport {
  lines: [string, number][];
  multiplier: number;
  total: number;
  ambitionDone: boolean;
}

export function computeLegacy(g: Game): LegacyReport {
  const p = g.player;
  const o = g.outcome;
  const won = !!o?.playerWon;
  const lines: [string, number][] = [];
  lines.push(['The house endures', 10]);
  lines.push([`Most worlds held (${p.stats.maxWorlds})`, p.stats.maxWorlds * 3]);
  lines.push([`Boons earned (${p.boons})`, p.boons * 4]);
  lines.push([`Enemy ships destroyed (${p.stats.kills})`, Math.floor(p.stats.kills / 5)]);
  if (p.stats.rivalsEliminated) lines.push([`Rival Hearths put out (${p.stats.rivalsEliminated})`, p.stats.rivalsEliminated * 15]);
  if (p.stats.strongholdDestroyed) lines.push(['Corsair Stronghold destroyed', 25]);
  if (p.stats.maxRelics) lines.push([`Relics held (${p.stats.maxRelics})`, p.stats.maxRelics * 10]);
  if (g.config.ages) lines.push(['The Ark reached the stars', 20]);
  if (won) lines.push(['VICTORY', 60]);
  const amb = AMBITION_BY_ID[g.ambition];
  const ambitionDone = !!amb && amb.check(g, p, won);
  // (An Ages run that reached the stars is two games long.)
  const mult = LEGACY_MUL[g.config.difficulty] * (g.config.daily ? 1.25 : 1) * (g.config.ages ? 1.3 : 1);
  let sum = lines.reduce((a, [, v]) => a + v, 0) * mult;
  if (ambitionDone && amb) {
    lines.push([`Ambition: ${amb.name}`, amb.reward]);
    sum += amb.reward;
  }
  return { lines, multiplier: mult, total: Math.round(sum), ambitionDone };
}

/** How long a run that has ended took: an Ages run, its time on the cradle and its time among the stars together. */
export function runTime(g: Game): number {
  const t = g.outcome?.time ?? g.time;
  return g.config.ages ? g.config.ages.cradleTime + Math.max(0, t - g.config.ages.arrival) : t;
}

/** What a run that has ended is measured by against the player's records (meta/records.ts). */
export function runFigures(g: Game, legacy: number): RunFigures {
  const p = g.player;
  return { won: !!g.outcome?.playerWon, time: runTime(g), worlds: p.stats.maxWorlds, kills: p.stats.kills, boons: p.boons, legacy };
}

/** Apply a finished run to the profile. Returns a newly unlocked difficulty name, if any. */
export function applyRunToProfile(prof: Profile, g: Game, legacy: number): string | null {
  const o = g.outcome!;
  prof.legacy += legacy;
  prof.totalLegacy += legacy;
  prof.runs++;
  let unlocked: string | null = null;
  if (o.playerWon) {
    prof.wins++;
    prof.winsByHeir[g.config.heir] = (prof.winsByHeir[g.config.heir] ?? 0) + 1;
    if (g.config.mode !== 'ages' && (prof.bestTime === null || o.time < prof.bestTime)) prof.bestTime = o.time;
    const next = Math.min(3, g.config.difficulty + 1);
    if (g.config.difficulty >= 1 && next > prof.maxDifficulty) {
      prof.maxDifficulty = next;
      unlocked = ['Easy', 'Normal', 'Hard', 'Brutal'][next];
    }
  }
  prof.history.unshift({
    date: new Date().toISOString(),
    heir: g.config.heir,
    size: g.config.size,
    difficulty: g.config.difficulty,
    won: o.playerWon,
    victory: o.victory,
    time: o.time,
    legacy,
    seed: g.config.seed,
    daily: !!g.config.daily,
  });
  prof.history = prof.history.slice(0, 25);
  return unlocked;
}
