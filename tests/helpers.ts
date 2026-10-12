/** What the tests share: a game to test on, time passing in it, and a few staged situations. */
import { expect } from 'vitest';
import { TICK } from '../src/game/constants';
import { Game } from '../src/game/Game';
import type { GameConfig, GNode, UnitType } from '../src/game/types';

/** A game to test on: a small sector on Normal, Solar Concord, everything unlocked (and whatever a test asks for instead). */
export function mk(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, ...opts });
}

/** Let time pass in a game: so many seconds of it, or until the run is decided. */
export function run(g: Game, seconds: number) {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
  }
}

/** What two games must share to be called the same game. */
export function snapshot(g: Game): string {
  return JSON.stringify({
    t: g.time.toFixed(3),
    f: g.factions.map((f) => [f.embers, f.lore, f.boons, f.cards.join(',')]),
    units: g.unitList.filter((u) => !u.dead).map((u) => [u.id, u.type, u.owner, u.x, u.y, u.hp]),
    worlds: g.nodes.map((n) => [n.owner, n.level, n.role, n.glow]),
  });
}

/** The nearest unguarded dark world in the player's home system. */
export function darkWorld(g: Game): GNode {
  const p = g.player;
  const n = g.nodes
    .filter((x) => x.kind === 'planet' && x.owner === -1 && x.system === g.nodes[p.capital].system && !g.hasHostiles(x.id, p.id) && !x.tag.startsWith('militia'))
    .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id))[0];
  expect(n).toBeDefined();
  return n;
}

/** A quiet star far from everyone, for staged fights. */
export function arena(g: Game): number {
  return g.nodes.find((n) => n.kind === 'star' && !g.systems[n.system].home && g.buckets[n.id].length === 0)!.id;
}

/** A staged fight between two kinds of ship, with nobody giving orders: how many of each are left. */
export function duel(a: [UnitType, number], b: [UnitType, number], seed = 7): { aLeft: number; bLeft: number } {
  const g = mk({ seed });
  g.factions[1].ai = null; // a fair fight: nobody gives orders
  const at = arena(g);
  const A = Array.from({ length: a[1] }, () => g.spawnUnit(a[0], 0, at));
  const B = Array.from({ length: b[1] }, () => g.spawnUnit(b[0], 1, at));
  for (const u of [...A, ...B]) u.snare = 9999; // nobody leaves
  for (let i = 0; i < 20 * 240 && A.some((u) => !u.dead) && B.some((u) => !u.dead); i++) {
    g.step();
    g.fx.length = 0;
  }
  return { aLeft: A.filter((u) => !u.dead).length, bLeft: B.filter((u) => !u.dead).length };
}
