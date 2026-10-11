import type { Game } from '../game/Game';

/**
 * A finished run for a machine to read, the last line of COPY RUN DETAILS: JSON in base64 (so that no
 * chat or mail mangles it), with what a bug report needs: the build, the setup, the seed, how it ended,
 * the player's Boons, relics and figures, and where every house stood.
 */
export function runData(g: Game, version: string): string {
  const p = g.player;
  const o = g.outcome!;
  const data = {
    v: version,
    mode: g.config.mode ?? 'classic', stage: g.config.stage ?? null, daily: !!g.config.daily, tutorial: !!g.config.tutorial,
    seed: g.config.seed, size: g.config.size, difficulty: g.config.difficulty, heir: g.config.heir,
    perks: g.config.perks, unlockLegendary: g.config.unlockLegendary, unlockPacts: g.config.unlockPacts,
    outcome: { won: o.playerWon, victory: o.victory, time: Math.round(o.time), reason: o.reason, winner: o.winner >= 0 ? g.factions[o.winner].heir : null },
    destinies: g.victories, omens: g.traits, ambition: g.ambition,
    boons: p.cards, relics: p.relics, stats: p.stats,
    houses: g.empires().map((f) => ({
      heir: f.heir, player: f.isPlayer, alive: f.alive, worlds: g.worldsOf(f.id).length, era: f.era,
      eliminatedAt: f.eliminatedAt >= 0 ? Math.round(f.eliminatedAt) : null, boons: f.cards.length, kills: f.stats.kills, lost: f.stats.shipsLost,
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The other way: what `runData` wrote. */
export function readRunData(text: string): ReturnType<typeof JSON.parse> {
  const bin = atob(text.trim());
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
