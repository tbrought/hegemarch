/**
 * A player who is not one: the game's own AI, thinking for the player between ticks, and giving its
 * orders as a player gives them (kept in `Game.orders` in a Daily). It thinks with chance of its own, so
 * that the game's own chance is drawn only by what the game does, as when the run is played again from
 * its orders (game/replay.ts); and the house is the player's while an order is carried out (no AI's ways).
 * For the board's tests (scripts/board-e2e.ts), and the trailer's footage of the game (scripts/trailer/).
 */
import { aiTick, makeAIState } from '../../src/game/ai/ai';
import { TICK } from '../../src/game/constants';
import { HEIR_BY_ID } from '../../src/game/data/heirs';
import { Game, ORDER_NAMES } from '../../src/game/Game';
import { dailyConfig } from '../../src/game/replay';
import { hashString, RNG } from '../../src/game/rng';
import type { GameConfig } from '../../src/game/types';

/** How often the bot thinks, in ticks. */
const EVERY = 10;

export interface Bot {
  /** Think, if it is time to (before a tick). */
  think(): void;
  /** Leave the game to itself. */
  detach(): void;
  /** Leave the player's Boons to the player (true), or choose them (false). */
  leaveBoons: boolean;
}

/** Put the bot in the player's seat of a game. */
export function attachBot(g: Game): Bot {
  const gameRng = g.rng;
  const botRng = new RNG(hashString(`bot ${g.config.seed} ${g.config.day ?? ''} ${g.player.heir}`));
  const p = g.player;
  g.rng = botRng;
  const mind = makeAIState(g, p, HEIR_BY_ID[p.heir].personalities);
  g.rng = gameRng;
  // An order is the game's to carry out: with its own chance, and the house the player's.
  const proto = Game.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const given = new Map<string, (...a: unknown[]) => unknown>();
  for (const name of ORDER_NAMES) {
    const order = proto[name];
    given.set(name, order);
    proto[name] = function (this: Game, ...args: unknown[]) {
      if (this !== g) return order.apply(this, args);
      const [rng, ai] = [this.rng, p.ai];
      this.rng = gameRng;
      p.ai = null;
      try {
        return order.apply(this, args);
      } finally {
        this.rng = rng;
        p.ai = ai;
      }
    };
  }
  const bot: Bot = {
    leaveBoons: false,
    think() {
      if (g.tick % EVERY !== 0 || !p.alive || g.outcome) return;
      const drafts = p.pendingDrafts;
      if (bot.leaveBoons) p.pendingDrafts = 0;
      g.rng = botRng;
      p.ai = mind;
      try {
        aiTick(g, p, EVERY * TICK);
      } finally {
        g.rng = gameRng;
        p.ai = null;
        if (bot.leaveBoons) p.pendingDrafts = drafts;
      }
    },
    detach() {
      for (const [name, order] of given) proto[name] = order;
    },
  };
  return bot;
}

/** Play a game as the bot, for at most `minutes` of game time: the game, won or not. (`each`: after every tick.) */
export function botGame(config: GameConfig, minutes: number, each?: (g: Game) => void): Game {
  const g = Game.create(config);
  g.fxEnabled = false;
  const bot = attachBot(g);
  try {
    const ticks = Math.round((minutes * 60) / TICK);
    for (let t = 0; t < ticks && !g.outcome; t++) {
      bot.think();
      g.step();
      g.fx.length = 0;
      each?.(g);
    }
  } finally {
    bot.detach();
  }
  return g;
}

/** Play a Daily as the bot. */
export function botDaily(day: string, heir: string, minutes: number, each?: (g: Game) => void): Game {
  return botGame(dailyConfig(day, heir), minutes, each);
}
