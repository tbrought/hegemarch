/**
 * A Daily run played again from its orders (the board, 1.25): the same run to the tick, wherever and
 * however it was played (effects shown or not, saved and loaded halfway), and nothing taken from a list
 * of orders a player could not have given.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { badOrders, checkDaily, dailyConfig, replay } from '../src/game/replay';
import { RNG } from '../src/game/rng';
import { randomCommand } from '../scripts/lib/commands';
import { snapshot } from './helpers';

/** A Daily played by a player who gives orders every few ticks (the fuzzer's), saved and loaded halfway. */
function played(day: string, heir: string, minutes: number, seed: number): Game {
  let g = Game.create(dailyConfig(day, heir));
  g.fxEnabled = true;
  const r = new RNG(seed);
  const log: string[] = [];
  const ticks = minutes * 60 * 20;
  for (let t = 1; t <= ticks && !g.outcome; t++) {
    if (t % 6 === 0) randomCommand(g, r, log, true);
    g.step();
    g.fx.length = 0;
    if (t === Math.floor(ticks / 2)) {
      g = Game.load(JSON.parse(JSON.stringify(g.serialize())));
      g.fxEnabled = true;
    }
  }
  return g;
}

describe('a Daily run is the same run again from its orders', () => {
  it('to the tick: the houses, their ships, the worlds (effects shown in the run, not in the replay; saved and loaded halfway)', () => {
    for (const [day, heir, seed] of [['2026-10-17', 'concord', 7], ['2026-11-3', 'vael', 11]] as const) {
      const g = played(day, heir, 9, seed);
      expect(g.orders!.length, `${day}: the player gave orders`).toBeGreaterThan(100);
      expect(badOrders(g.orders)).toBeNull();
      const again = replay(dailyConfig(day, heir), JSON.parse(JSON.stringify(g.orders)), g.tick);
      expect(again.error).toBeNull();
      expect(again.ticks).toBe(g.tick);
      expect(snapshot(again.game), `${day} ${heir}`).toBe(snapshot(g));
      expect(again.game.rng.state()).toEqual(g.rng.state());
    }
  });

  it('keeps only the player\'s orders, given between ticks, each once', () => {
    const g = Game.create(dailyConfig('2026-10-17', 'concord'));
    for (let i = 0; i < 20 * 120; i++) g.step();
    // (Two minutes of the rival houses' own orders: none kept.)
    expect(g.orders).toEqual([]);
    const ship = g.unitList.find((u) => u.owner === g.playerId && u.type === 'striker')!;
    g.cmdMove(g.playerId, [ship.id], g.nodes[g.player.capital].lanes[0]);
    expect(g.orders!.length).toBe(1);
    expect(g.orders![0].slice(0, 2)).toEqual([g.tick, 'cmdMove']);
    expect(g.orders![0][2].slice(0, 3)).toEqual([g.playerId, [ship.id], g.nodes[g.player.capital].lanes[0]]);
    // An offer is kept once, when it is dealt, however often it is asked for.
    g.player.pendingDrafts = 1;
    g.ensureOffer(g.player);
    g.ensureOffer(g.player);
    expect(g.orders!.filter((o) => o[1] === 'ensureOffer')).toEqual([[g.tick, 'ensureOffer', [g.playerId]]]);
    // A run that is not a Daily keeps nothing.
    expect(Game.create({ ...dailyConfig('2026-10-17', 'concord'), daily: false }).orders).toBeUndefined();
  });
});

describe('a list of orders is taken only as a player could have given it', () => {
  it('turns down what no player could give', () => {
    expect(badOrders('x')).toBe('not a list of orders');
    expect(badOrders([[0, 'declareWinner', [0, 'conquest']]])).toBe('an order that is not one');
    expect(badOrders([[5, 'cmdStop', [0, [1]]], [4, 'cmdStop', [0, [1]]]])).toBe('an order is out of time');
    expect(badOrders([[0, 'cmdStop', [0, { evil: 1 }]]])).toBe('an order with odd arguments');
    expect(badOrders([[0, 'cmdStop', [0, [1.5]]]])).toBe('an order with odd arguments');
    expect(badOrders([[0, 'cmdStop', [0, [1, 2]]]])).toBeNull();
  });

  it('and a run of orders for another house, or not won, or of no such house, does not stand', () => {
    const rival = checkDaily('2026-10-17', 'concord', [[10, 'cmdStop', [1, [1]]]]);
    expect(rival.ok).toBe(false);
    expect(rival.reason).toMatch(/for another house/);
    expect(checkDaily('2026-10-17', 'nobody', []).reason).toBe('no such house');
    expect(checkDaily('tomorrow', 'concord', []).reason).toBe('no such day');
  });
});
