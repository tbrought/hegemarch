/**
 * Commands: the choices a house is asked to make. A goal's reward is claimed, a ship that has risen a
 * level learns an ability, a decision (an anomaly, a visitor) is answered.
 */

import { ABILITY_BY_ID } from '../data/abilities';
import { EVENT_BY_ID } from '../data/events';
import { GOAL_BY_ID, GOAL_REWARD } from '../data/goals';
import type { Game } from '../Game';

/**
 * A first goal reached (data/goals.ts): its small reward is paid, once a run. Which goals a player
 * still has is the client's to know (they are reached once, ever); the game only checks that this
 * one is truly reached here. Not in a Daily: every player of the day plays by the same rules, and
 * what a player has reached before is their own (the board, 1.25).
 */
export function cmdGoal(g: Game, fid: number, id: string): boolean {
  const goal = GOAL_BY_ID[id];
  const f = g.factions[fid];
  if (g.config.daily || !goal || !f || fid !== g.playerId || g.ui['goal:' + id] || !goal.done(g, f)) return false;
  g.ui['goal:' + id] = 1;
  g.addEmbers(f, GOAL_REWARD);
  g.notify(fid, `Goal reached: ${goal.label}. +${GOAL_REWARD} Embers.`, 'good');
  return true;
}

export function cmdChooseAbility(g: Game, fid: number, unitId: number, abilityId: string): boolean {
  const u = g.units.get(unitId);
  if (!u || u.owner !== fid || !u.pendingAbil.length) return false;
  const choices = u.pendingAbil[0];
  if (!choices.includes(abilityId) || !ABILITY_BY_ID[abilityId]) return false;
  u.pendingAbil.shift();
  u.abil.push({ id: abilityId, cd: 2 });
  if (u.type === 'ark') g.factions[fid].arkAbil = u.abil.map((a) => a.id);
  return true;
}

export function cmdResolvePrompt(g: Game, promptId: number, choice: number): string | null {
  const p = g.prompts.find((x) => x.id === promptId);
  if (!p || p.result !== undefined) return null;
  const ev = EVENT_BY_ID[p.event];
  const f = g.player;
  const c = ev?.choices[choice];
  if (!ev || !c) return null;
  const ctx = { node: p.node, unit: p.unit };
  if (c.cond && !c.cond(g, f, ctx)) return null;
  p.result = c.run(g, f, ctx);
  f.stats.eventsResolved++;
  // (What was chosen, and what came of it, stays in the log: the dialog is gone at a click.)
  g.notify(f.id, `${ev.title}: ${c.label}. ${p.result}`, 'event', p.node >= 0 ? p.node : undefined);
  return p.result;
}

export function dismissPrompt(g: Game, promptId: number) {
  g.prompts = g.prompts.filter((p) => p.id !== promptId);
}
