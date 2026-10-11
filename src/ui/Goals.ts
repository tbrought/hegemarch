/**
 * First goals (game/data/goals.ts) on screen: one small box in the right-hand column that names the
 * next goal a new player has not reached yet. Pointing at it says how and why. Reaching a goal for
 * the first time ever pays its small reward and moves the box on; when all are reached it is gone
 * for good.
 */
import { GOAL_REWARD, GOALS, type GoalDef } from '../game/data/goals';
import { fit, text, textWidth } from '../render/font';
import { PAL } from '../render/palette';
import { box, type Ctx } from '../render/pixel';
import { icon } from '../render/sprites';
import type { Hud } from './Hud';

export class Goals {
  private t = 0;

  constructor(private hud: Hud) {}

  /** The goals this player has not reached yet, in order. */
  left(): GoalDef[] {
    const done = this.hud.s.profile.goalsDone ?? [];
    return GOALS.filter((x) => !done.includes(x.id));
  }

  /**
   * Are the goals on offer right now? Not during the guided steps (one thing at a time), not on the
   * cradle of an Ages run (its words are others), and not with tips turned off.
   */
  shown(): boolean {
    const s = this.hud.s;
    const g = s.game;
    return s.profile.settings.tips && !g.cradle && !g.outcome && !this.hud.tutorial.busy() && g.player.capital >= 0 && this.left().length > 0;
  }

  update(dt: number) {
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    if (!this.shown()) return;
    const s = this.hud.s;
    const g = s.game;
    const p = g.player;
    let reached = false;
    for (const goal of this.left()) {
      if (!goal.done(g, p)) continue;
      // (The game pays, once a run; the player's profile remembers, for good.)
      g.cmdGoal(p.id, goal.id);
      s.profile.goalsDone = [...(s.profile.goalsDone ?? []), goal.id];
      reached = true;
    }
    if (!reached) return;
    s.hooks.saveProfile();
    if (!this.left().length) s.showToast('Every first goal is reached. The sector is yours to take.', PAL.gold, 6);
  }

  /** The box, with its right edge at `right`, below `clear` if it would lie on it; returns the y below it. */
  draw(g: Ctx, right: number, y: number, clear: { x: number; y: number; w: number; h: number }): number {
    if (!this.shown()) return y;
    const left = this.left();
    const goal = left[0];
    const head = `GOAL ${GOALS.length - left.length + 1} OF ${GOALS.length}`;
    const reward = `+${GOAL_REWARD}`;
    const rw = textWidth(reward) + 9;
    const maxW = Math.max(96, Math.min(160, Math.floor(this.hud.W / 3)));
    const label = fit(goal.label, maxW - rw - 12);
    const w = Math.max(textWidth(head, 'tiny') + 8, textWidth(label) + rw + 12);
    const h = 21;
    const x = right - w;
    if (clear.w > 0 && x < clear.x + clear.w + 2 && y < clear.y + clear.h + 2) y = clear.y + clear.h + 2;
    const hot = this.hud.ui.isHinted('goal');
    box(g, x, y, w, h, PAL.night, hot ? PAL.teal : PAL.sea);
    text(g, head, x + 4, y + 3, PAL.teal, 'tiny');
    text(g, label, x + 4, y + 10, PAL.mist);
    icon(g, 'ember', x + w - rw - 2, y + 10);
    text(g, reward, x + w - rw + 5, y + 10, PAL.gold);
    const next = left.slice(1).map((x) => x.label);
    this.hud.ui.hint('goal', x, y, w, h, {
      tipTitle: goal.label,
      tipColor: PAL.teal,
      tip: `${goal.why} [+${GOAL_REWARD} Embers] the first time you do it.${next.length ? `\nAfter this: ${next.join(' · ')}.` : ''}`,
    });
    return y + h + 2;
  }
}
