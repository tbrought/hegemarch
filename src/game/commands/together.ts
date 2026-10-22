/**
 * Commands of a game played together (1.28, docs/MULTIPLAYER.md): Embers sent to an ally, a house given up,
 * and a house handed to the AI when its player leaves (and back when they return).
 */

import { makeAIState } from '../ai/ai';
import { HEIR_BY_ID } from '../data/heirs';
import type { Game } from '../Game';
import type { QueueCheck } from '../types';

/** The least that can be sent to an ally. */
export const GIFT_MIN = 50;
/** Versus: the share of a gift lost on the way (so that one player cannot simply bankroll the other). Co-op: none. */
export const GIFT_FEE = 0.2;

/** Why these Embers cannot go to that ally, or null. */
export function checkGift(g: Game, fid: number, to: number, amount: number): QueueCheck {
  if (!g.config.seats) return 'Only in a multiplayer game.';
  const f = g.factions[fid];
  const t = g.factions[to];
  if (!f || !t || to === fid || t.kind !== 'empire') return 'No such house.';
  if (!g.allied(fid, to)) return 'Embers go only to an ally.';
  if (!f.alive || !t.alive) return 'That house has fallen.';
  if (!Number.isFinite(amount) || amount < GIFT_MIN) return `At least ${GIFT_MIN} Embers.`;
  if (f.embers < amount) return 'Not enough Embers.';
  return null;
}

/** What an ally receives of a gift: all of it in co-op, four fifths in versus. */
export function giftReceived(g: Game, amount: number): number {
  return g.config.together === 'versus' ? amount - Math.floor(amount * GIFT_FEE) : amount;
}

export function cmdGift(g: Game, fid: number, to: number, amount: number): boolean {
  const sum = Math.floor(amount);
  if (checkGift(g, fid, to, sum)) return false;
  const f = g.factions[fid];
  const t = g.factions[to];
  const got = giftReceived(g, sum);
  f.embers -= sum;
  t.embers += got;
  g.notify(to, `${f.name} sent you ${got} Embers.`, 'good');
  g.notify(fid, `${got} Embers sent to ${t.name}${got < sum ? ` (${sum - got} lost on the way)` : ''}.`, 'good');
  return true;
}

/** Versus: a player gives up. Their house falls as if its Hearth had (its worlds go dark). */
export function cmdSurrender(g: Game, fid: number): boolean {
  const f = g.factions[fid];
  if (g.config.together !== 'versus' || !f || f.kind !== 'empire' || !f.alive || !g.seated(fid)) return false;
  f.surrendered = true;
  g.notify(-1, g.mine(fid) ? 'You surrendered.' : `${f.name} surrenders.`, g.ours(fid) ? 'bad' : 'good');
  g.eliminate(fid, -1);
  return true;
}

/**
 * The room's word, not an order of a house: a player has left (`toAi`: the game's AI gives their house's
 * orders from now), or come back. Every screen hands the house over at the same tick, so the AI's state is
 * made from the game's own dice there and is the same everywhere. The house keeps all it has, its perks
 * among them, and is not given the bonuses of a rival house.
 */
export function handOver(g: Game, fid: number, toAi: boolean) {
  const f = g.factions[fid];
  if (!f || f.kind !== 'empire' || !g.seated(fid)) return;
  if (toAi && f.isPlayer) {
    f.isPlayer = false;
    f.ai = makeAIState(g, f, HEIR_BY_ID[f.heir]?.personalities ?? []);
  } else if (!toAi && !f.isPlayer) {
    f.isPlayer = true;
    f.ai = null;
  }
}
