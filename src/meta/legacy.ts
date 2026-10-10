import type { Game } from '../game/Game';
import { LEGACY_MUL } from '../game/constants';
import { AMBITION_BY_ID } from '../game/data/ambitions';
import type { Profile } from './profile';

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  costs: number[];
}

export const PERKS: PerkDef[] = [
  { id: 'oldCoin', name: 'Old Coin', desc: '[+100 starting Embers] per rank.', costs: [40, 80, 120] },
  { id: 'loreSeed', name: 'Lorekeepers', desc: 'Start each run with [40 Lore] per rank, so your first Boon comes sooner.', costs: [50, 100] },
  { id: 'escort', name: 'Veteran Escort', desc: 'Begin each run with [+1 Guardian] per rank.', costs: [60, 120] },
  { id: 'archivist', name: 'Archivist', desc: '[+1 Boon reroll] per rank.', costs: [50, 100] },
  { id: 'luck', name: 'Fortunate Stars', desc: 'Rare, Epic and Legendary Boons [appear more often] (per rank).', costs: [60, 100, 150] },
  { id: 'bastion', name: 'Ancestral Walls', desc: 'Your Hearth gains [+25% hull] per rank.', costs: [40, 80] },
  { id: 'secondBreath', name: 'Second Breath', desc: 'Your Hearth’s Last Stand calls [twice the defenders].', costs: [70] },
];

export const UNLOCKS = [
  { id: 'pacts', name: 'Forbidden Archives', desc: '[Every double-edged Pact] can appear among your Boons.', cost: 80 },
  { id: 'legendary', name: 'Legendary Lineage', desc: '[Legendary Boons] can appear among your choices.', cost: 120 },
] as const;

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
  if (won) lines.push(['VICTORY', 60]);
  const amb = AMBITION_BY_ID[g.ambition];
  const ambitionDone = !!amb && amb.check(g, p, won);
  const mult = LEGACY_MUL[g.config.difficulty] * (g.config.daily ? 1.25 : 1);
  let sum = lines.reduce((a, [, v]) => a + v, 0) * mult;
  if (ambitionDone && amb) {
    lines.push([`Ambition: ${amb.name}`, amb.reward]);
    sum += amb.reward;
  }
  return { lines, multiplier: mult, total: Math.round(sum), ambitionDone };
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
    if (prof.bestTime === null || o.time < prof.bestTime) prof.bestTime = o.time;
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
