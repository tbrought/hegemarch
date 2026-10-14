/**
 * First goals (game/data/goals.ts) on screen: one small box in the right-hand column that names the
 * next goal a new player has not reached yet. Pointing at it says how and why. Reaching a goal for
 * the first time ever pays its small reward, and the box marks it: it holds the goal a moment longer,
 * struck through, with a tick where its reward was, while the reward's Embers fly to the count in the
 * top bar (which takes them in as the last one lands); then the next goal fades up. When all are
 * reached it is gone for good.
 */
import { GOAL_REWARD, GOALS, type GoalDef } from '../game/data/goals';
import { text, textWidth, wrap } from '../render/font';
import { PAL } from '../render/palette';
import { box, rect, type Ctx } from '../render/pixel';
import { icon } from '../render/sprites';
import type { Hud } from './Hud';

/** A goal reached, being marked. */
interface Cheer {
  goal: GoalDef;
  /** HUD clock when it began to show (-1: not yet, a dialog is open). */
  at: number;
  /** Sparks landed at the count so far; whether the count has taken in its reward. */
  landed: number;
  paid: boolean;
}

/**
 * A goal reached, in seconds: it stays STAY; it is struck through over STRIKE; its Embers set off at FLY,
 * SPARKS of them APART from one another, each taking FLIGHT to reach the count.
 */
export const CHEER = { STAY: 2, STRIKE: 0.3, FLY: 0.5, SPARKS: 5, APART: 0.07, FLIGHT: 0.6 };

/** Where a spark is, `s` (0 to 1) of its way from the goal to the count: eased in and out, in a dip under the top bar. */
export function sparkAt(from: { x: number; y: number }, to: { x: number; y: number }, s: number): { x: number; y: number } {
  const mid = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + 46 };
  const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
  const u = 1 - e;
  return { x: u * u * from.x + 2 * u * e * mid.x + e * e * to.x, y: u * u * from.y + 2 * u * e * mid.y + e * e * to.y };
}

export class Goals {
  private t = 0;
  /** Goals reached and being marked, one after another. */
  private cheers: Cheer[] = [];
  /** HUD clock when the last mark ended (the next goal fades up). */
  private nextAt = -9;

  constructor(private hud: Hud) {}

  /** The goals this player has not reached yet, in order. */
  left(): GoalDef[] {
    const done = this.hud.s.profile.goalsDone ?? [];
    return GOALS.filter((x) => !done.includes(x.id));
  }

  /**
   * Is the goal box on offer right now? Not during the guided steps (one thing at a time), not on the
   * cradle of an Ages run (its words are others), and not with tips turned off.
   */
  private offered(): boolean {
    const s = this.hud.s;
    const g = s.game;
    return s.profile.settings.tips && !g.cradle && !g.outcome && !this.hud.tutorial.busy() && g.player.capital >= 0;
  }

  /** Are the goals on offer right now, with one still to reach? */
  shown(): boolean {
    return this.offered() && this.left().length > 0;
  }

  /** Is a goal just reached being marked (or waiting behind a dialog to be)? */
  marking(): boolean {
    return this.cheers.length > 0;
  }

  update(dt: number) {
    // (Embers on their way are taken in whatever becomes of the box: the run ends, tips are turned off.)
    if (this.cheers.length && !this.offered()) {
      for (const c of this.cheers) this.pay(c);
      this.cheers = [];
    }
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
      // (The game pays, once a run; the player's profile remembers, for good. The count shows the Embers
      // when they land.)
      if (g.cmdGoal(p.id, goal.id)) {
        this.cheers.push({ goal, at: -1, landed: 0, paid: false });
        this.hud.embersAway += GOAL_REWARD;
      }
      s.profile.goalsDone = [...(s.profile.goalsDone ?? []), goal.id];
      reached = true;
    }
    if (!reached) return;
    s.hooks.saveProfile();
    if (!this.left().length) s.showToast('Every first goal is reached. The sector is yours to take.', PAL.gold, 6);
  }

  private pay(c: Cheer) {
    if (c.paid) return;
    c.paid = true;
    this.hud.embersAway = Math.max(0, this.hud.embersAway - GOAL_REWARD);
  }

  /** The box, with its right edge at `right`, below `clear` if it would lie on it; returns the y below it. */
  draw(g: Ctx, right: number, y: number, clear: { x: number; y: number; w: number; h: number }): number {
    const clock = this.hud.clock;
    let cheer: Cheer | undefined = this.cheers[0];
    if (cheer && cheer.at >= 0 && clock - cheer.at >= CHEER.STAY) {
      this.pay(cheer);
      this.cheers.shift();
      this.nextAt = clock;
      cheer = this.cheers[0];
    }
    // (A goal reached while a dialog is open is marked once it is closed.)
    if (cheer && cheer.at < 0 && !this.hud.s.modal) cheer.at = clock;
    if (!cheer && !this.shown()) return y;
    const left = this.left();
    const goal = cheer ? cheer.goal : left[0];
    const head = cheer ? 'GOAL REACHED' : `GOAL ${GOALS.length - left.length + 1} OF ${GOALS.length}`;
    const reward = `+${GOAL_REWARD}`;
    const rw = textWidth(reward) + 9;
    const maxW = Math.max(96, Math.min(160, Math.floor(this.hud.W / 3)));
    // (The goal in full, on a second line if it needs one: cut short, it named a thing to do and not what.)
    const lines = wrap(goal.label, maxW - rw - 12).slice(0, 2);
    const w = Math.max(textWidth(head, 'tiny') + 8, Math.max(...lines.map((l) => textWidth(l))) + rw + 12);
    const h = 11 + lines.length * 10;
    const x = right - w;
    if (clear.w > 0 && x < clear.x + clear.w + 2 && y < clear.y + clear.h + 2) y = clear.y + clear.h + 2;
    const hot = this.hud.ui.isHinted('goal');
    const ct = cheer && cheer.at >= 0 ? clock - cheer.at : 0;
    const a0 = g.globalAlpha;
    // (The next goal fades up after one is marked.)
    if (!cheer && clock - this.nextAt < 0.35) g.globalAlpha = a0 * ((clock - this.nextAt) / 0.35);
    box(g, x, y, w, h, PAL.night, hot ? PAL.teal : PAL.sea);
    text(g, head, x + 4, y + 3, PAL.teal, 'tiny');
    lines.forEach((l, i) => text(g, l, x + 4, y + 10 + i * 10, PAL.mist));
    // (Its reward leaves the box when it flies.)
    if (!cheer || ct < CHEER.FLY) {
      icon(g, 'ember', x + w - rw - 2, y + 10);
      text(g, reward, x + w - rw + 5, y + 10, PAL.gold);
    }
    g.globalAlpha = a0;
    if (cheer && cheer.at >= 0) this.mark(g, cheer, x, y, w, lines, rw, ct);
    const next = left.slice(cheer ? 0 : 1).map((x) => x.label);
    this.hud.ui.hint('goal', x, y, w, h, {
      tipTitle: goal.label,
      tipColor: PAL.teal,
      tip: `${goal.why} [+${GOAL_REWARD} Embers] the first time you do it.${next.length ? `\nAfter this: ${next.join(' · ')}.` : ''}`,
    });
    return y + h + 2;
  }

  /** A goal reached: struck through in teal, a tick where its reward was, and its Embers flying to the count. */
  private mark(g: Ctx, c: Cheer, x: number, y: number, w: number, lines: string[], rw: number, t: number) {
    const k = Math.min(1, t / CHEER.STRIKE);
    lines.forEach((l, i) => rect(g, x + 4, y + 14 + i * 10, Math.round((textWidth(l) + 1) * k), 1, PAL.teal));
    if (t > CHEER.FLY + 0.1) {
      const tx = x + w - rw + 1;
      const ty = y + 11;
      [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [7, 0]].forEach(([dx, dy]) => rect(g, tx + dx, ty + dy, 1, 2, PAL.teal));
    }
    // The Embers, one after another, from the reward to the count; the count takes them in as the last lands.
    const from = { x: x + w - rw, y: y + 13 };
    const to = { x: 5, y: 6 };
    let landed = 0;
    for (let n = 0; n < CHEER.SPARKS; n++) {
      const s = (t - CHEER.FLY - n * CHEER.APART) / CHEER.FLIGHT;
      if (s >= 1) landed++;
      if (s < 0 || s >= 1) continue;
      for (let j = 3; j >= 1; j--) {
        const q = sparkAt(from, to, Math.max(0, s - j * 0.05));
        rect(g, Math.round(q.x), Math.round(q.y), 2, 2, j > 1 ? PAL.ember : PAL.gold);
      }
      const p = sparkAt(from, to, s);
      icon(g, 'ember', Math.round(p.x) - 2, Math.round(p.y) - 3);
    }
    if (landed > c.landed) {
      c.landed = landed;
      this.hud.s.sfx.play('tick', 0.3);
      if (landed === CHEER.SPARKS) this.pay(c);
    }
  }
}
