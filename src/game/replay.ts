/**
 * A Daily run, played again from its orders (the board, 1.25): the game is the same wherever it runs
 * (a seeded simulation, `dmath.ts`), so the sector of the day and the orders its player gave make the
 * same run again, to the tick. A run on the board is not taken on its player's word: a checker plays its
 * orders again and reads the result for itself (scripts/verify-daily.ts). The orders come from outside,
 * so they are taken as they are only when they are orders a player could give; anything else fails.
 *
 * The checker plays a run in the version it was played in, and calls that version's `checkDaily` (and
 * reads its `TICK`): their names and arguments stay as they are from one version to the next.
 */
import { hashString } from './rng';
import { Game, ORDER_NAMES, type Order } from './Game';
import { HEIR_BY_ID } from './data/heirs';
import type { GameConfig, Outcome } from './types';
import { TICK } from './constants';

/**
 * The run of a Daily: the day's sector (medium, Normal), the same rules for every player (no perks from
 * the Hall of Heirs, every Boon, Legendaries and Pacts), only the house the player's own. Until 1.25 a
 * Daily took each player's perks and unlocks, and the same sector was not the same run for two players.
 */
export function dailyConfig(day: string, heir: string): GameConfig {
  return {
    seed: hashString('hegemarch-daily-' + day),
    size: 'medium',
    difficulty: 1,
    heir,
    perks: {},
    unlockLegendary: true,
    unlockPacts: true,
    daily: true,
    day,
  };
}

/** The longest a run may be played again: three hours of game time (the board's longest crown, meta/board.ts). */
export const REPLAY_TICKS = Math.round((3 * 60 * 60) / TICK);
/** The most orders a run may hold. */
export const MAX_ORDERS = 30000;

/** Orders whose first argument is the house giving them: it must be the player's. */
const BY_HOUSE = new Set<string>(ORDER_NAMES.filter((n) => n.startsWith('cmd') && n !== 'cmdResolvePrompt'));

/** An argument an order may have: a number, a string, a yes or no, nothing, or a list of numbers. */
function plainArg(a: unknown): boolean {
  if (a === null || typeof a === 'boolean' || typeof a === 'string') return typeof a !== 'string' || a.length <= 40;
  if (typeof a === 'number') return Number.isFinite(a);
  return Array.isArray(a) && a.length <= 2000 && a.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** Why a list of orders is not one a player could have given, or null when it is. */
export function badOrders(orders: unknown): string | null {
  if (!Array.isArray(orders)) return 'not a list of orders';
  if (orders.length > MAX_ORDERS) return 'too many orders';
  let last = 0;
  for (const o of orders) {
    if (!Array.isArray(o) || o.length !== 3) return 'an order is not [tick, name, arguments]';
    const [t, name, args] = o as unknown[];
    if (typeof t !== 'number' || !Number.isInteger(t) || t < last || t > REPLAY_TICKS) return 'an order is out of time';
    last = t;
    if (typeof name !== 'string' || !(ORDER_NAMES as readonly string[]).includes(name)) return 'an order that is not one';
    if (!Array.isArray(args) || args.length > 9 || !args.every(plainArg)) return 'an order with odd arguments';
  }
  return null;
}

/** How a run played again ended: its outcome (null if none by the limit), when, and whether an order could not be given. */
export interface Replayed {
  outcome: Outcome | null;
  ticks: number;
  error: string | null;
  game: Game;
}

/**
 * Play a run again: the game from its config, each order given after the tick it was given after, until
 * the run is decided or `limit` ticks have passed. Effects are off: they are drawn, never played.
 */
export function replay(config: GameConfig, orders: Order[], limit = REPLAY_TICKS): Replayed {
  const g = Game.create(config);
  g.fxEnabled = false;
  g.orders = undefined;
  const pid = g.playerId;
  let i = 0;
  let error: string | null = null;
  const give = (o: Order) => {
    const [, name, raw] = o;
    // (A saved order kept nothing as null: given again, it is nothing.)
    const args = raw.map((a) => (a === null ? undefined : a));
    if (BY_HOUSE.has(name) && args[0] !== pid) throw new Error(`${name} for another house`);
    if (name === 'ensureOffer') {
      if (args[0] !== pid) throw new Error('an offer for another house');
      g.ensureOffer(g.player);
      return;
    }
    (g as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
  };
  while (!g.outcome && g.tick < limit) {
    while (i < orders.length && orders[i][0] <= g.tick) {
      try {
        give(orders[i]);
      } catch (e) {
        error = `order ${i} (${orders[i][1]}): ${(e as Error).message}`;
        return { outcome: null, ticks: g.tick, error, game: g };
      }
      i++;
    }
    g.step();
    g.fx.length = 0;
  }
  return { outcome: g.outcome, ticks: g.tick, error, game: g };
}

/**
 * A run for the board, checked: whether it stands (a crown of the player's own, its house a real one), and
 * its time. `limit`: the most ticks to play it for (a run said to be won in ten minutes is not played for
 * two hours to find that it was not).
 */
export function checkDaily(day: string, heir: string, orders: unknown, limit = REPLAY_TICKS): { ok: boolean; time: number; victory: string; reason: string } {
  if (!HEIR_BY_ID[heir]) return { ok: false, time: 0, victory: '', reason: 'no such house' };
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(day)) return { ok: false, time: 0, victory: '', reason: 'no such day' };
  const bad = badOrders(orders);
  if (bad) return { ok: false, time: 0, victory: '', reason: bad };
  const r = replay(dailyConfig(day, heir), orders as Order[], Math.min(REPLAY_TICKS, limit));
  if (r.error) return { ok: false, time: 0, victory: '', reason: r.error };
  if (!r.outcome) return { ok: false, time: 0, victory: '', reason: 'played again, the run had not ended by its time' };
  if (!r.outcome.playerWon) return { ok: false, time: r.outcome.time, victory: r.outcome.victory, reason: 'played again, the run did not end in your crown' };
  return { ok: true, time: r.outcome.time, victory: r.outcome.victory, reason: '' };
}
