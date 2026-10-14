/**
 * Heralds: the big moments of a run announced across the upper part of the screen for a few seconds
 * (a house falls, your Last Stand, a rival begins or nears a Destiny, a rival's Starfall armed, the Maw
 * opens, a new age, a rival's Ark). The game says which moments are heralded (`Note.herald`).
 *
 * A band in the moment's colour drifts in from the left as it fades up, holds, and drifts on to the
 * right as it fades away. It is never in the way:
 *  - The game does not stop for it and it takes no click: orders, selection and the map under it work
 *    as ever, and under the pointer it turns see-through.
 *  - It waits while a dialog is open (the game is stopped then too) and plays when the dialog closes.
 *    It plays while the game is paused: a pause for the same news is the time to read it.
 *  - Several come one after another, each shorter while another waits. No more than three wait, the
 *    same one never twice, and one that waited more than `STALE` seconds of game time is left to the log.
 *  - It makes no sound of its own when it shows at once (the news has sounded already); one that had to
 *    wait comes with a soft whoosh.
 *  - Never over the end of the run (the HUD draws only the ending then).
 */
import type { Herald } from '../../game/types';
import { bigText, fit, text, textWidth } from '../../render/font';
import { PAL } from '../../render/palette';
import { rect } from '../../render/pixel';
import type { Hud } from '../Hud';

/**
 * Seconds to drift in and out (IN, OUT) and to hold, alone or with another waiting (HOLD, HOLD_QUEUED);
 * how far it drifts (DRIFT, pixels); how old news may be and still show (STALE, game seconds); how many
 * wait at most (MAX); how solid it is under the pointer (SEE_THROUGH).
 */
export const HERALD = { IN: 0.4, OUT: 0.4, HOLD: 2.4, HOLD_QUEUED: 1.4, DRIFT: 40, STALE: 10, MAX: 3, SEE_THROUGH: 0.25 };

/** A herald waiting or showing. */
export interface HeraldShown {
  h: Herald;
  /** Game time of the news. */
  t: number;
  /** HUD clock when it was queued, and when it began to show (-1: not yet). */
  queued: number;
  at: number;
  /** Seconds after `at` it is gone: shorter once another waits behind it. */
  end: number;
  /** How solid it is (1, or less under the pointer), and the HUD clock it was last drawn at. */
  veil: number;
  drawn: number;
}

/** Seconds a herald is on the screen: shorter when another is waiting. */
export function heraldTime(waiting: boolean): number {
  return HERALD.IN + (waiting ? HERALD.HOLD_QUEUED : HERALD.HOLD) + HERALD.OUT;
}

/** Where the band is, `t` seconds into a herald that is gone at `end`: its drift in pixels and how solid it is. */
export function heraldPose(t: number, end: number): { dx: number; alpha: number } {
  // (Eased in and out, gently: never more than a few pixels a frame.)
  if (t < HERALD.IN) {
    const k = 1 - (1 - Math.max(0, t) / HERALD.IN) ** 2;
    return { dx: -Math.round((1 - k) * HERALD.DRIFT), alpha: k };
  }
  const out = t - (end - HERALD.OUT);
  if (out > 0) {
    const k = Math.min(1, out / HERALD.OUT);
    return { dx: Math.round(k * k * HERALD.DRIFT), alpha: 1 - k };
  }
  return { dx: 0, alpha: 1 };
}

/**
 * Queue a herald for news of game time `t`, the HUD clock being `now`. The same one is never queued
 * twice and at most `MAX` wait; the one showing is hurried along. Returns whether it was queued.
 */
export function queueHerald(list: HeraldShown[], h: Herald, t: number, now: number): boolean {
  if (list.length >= HERALD.MAX || list.some((x) => x.h.title === h.title && x.h.sub === h.sub)) return false;
  list.push({ h, t, queued: now, at: -1, end: heraldTime(false), veil: 1, drawn: now });
  const cur = list[0];
  if (list.length > 1 && cur.at >= 0) cur.end = Math.min(cur.end, Math.max(heraldTime(true), now - cur.at + HERALD.OUT));
  return true;
}

/** A big moment to announce (from the news, `Note.herald`). */
export function herald(hud: Hud, h: Herald, t: number) {
  queueHerald(hud.heralds, h, t, hud.clock);
}

/** The colour of a herald: a house's own, gold for the player's triumphs, red for alarms, pink for the Hollow. */
function toneColor(hud: Hud, h: Herald): string {
  if (h.tone === 'house' && h.fid !== undefined) return hud.g.factions[h.fid]?.color ?? PAL.violet;
  return h.tone === 'gold' ? PAL.gold : h.tone === 'red' ? PAL.red : h.tone === 'pink' ? PAL.pink : PAL.violet;
}

/** Draw the herald that is showing, if any (none while a dialog is open: it waits). */
export function drawHerald(hud: Hud) {
  hud.heraldRect = { x: 0, y: 0, w: 0, h: 0 };
  let cur = hud.heralds[0];
  if (!cur || hud.s.modal) return;
  // (News that waited too long is only in the log by now.)
  while (cur && cur.at < 0 && hud.g.time - cur.t > HERALD.STALE) {
    hud.heralds.shift();
    cur = hud.heralds[0];
  }
  if (!cur) return;
  if (cur.at < 0) {
    cur.at = hud.clock;
    cur.drawn = hud.clock;
    if (hud.heralds.length > 1) cur.end = heraldTime(true);
    if (hud.clock - cur.queued > 0.5) hud.s.sfx.play('jump', 0.25);
  }
  const t = hud.clock - cur.at;
  if (t >= cur.end) {
    hud.heralds.shift();
    return;
  }
  const g = hud.s.screen.g;
  const W = hud.W;
  const col = toneColor(hud, cur.h);
  // The band: wide enough for its words, never wider than the screen; below the objective banner.
  const scale = (textWidth(cur.h.title) + 2) * 2 + 24 <= W - 8 ? 2 : 1;
  const tw = (textWidth(cur.h.title) + 2) * scale;
  const bw = Math.min(W - 8, Math.max(tw + 60, textWidth(cur.h.sub) + 24, 240));
  const sub = fit(cur.h.sub, bw - 12);
  const banner = hud.bannerRect.w > 0 ? hud.bannerRect.y + hud.bannerRect.h + 10 : 0;
  const y = Math.max(Math.round(hud.H * 0.24), banner);
  const bh = scale === 2 ? 34 : 26;
  const pose = heraldPose(t, cur.end);
  const x = Math.round(W / 2 - bw / 2) + pose.dx;
  // Under the pointer it turns see-through, smoothly, so whatever is under it can be seen and clicked.
  hud.heraldRect = { x, y, w: bw, h: bh };
  const over = hud.ui.mx >= x && hud.ui.mx < x + bw && hud.ui.my >= y && hud.ui.my < y + bh;
  const step = Math.min(1, (hud.clock - cur.drawn) / 0.15);
  cur.drawn = hud.clock;
  const target = over ? HERALD.SEE_THROUGH : 1;
  cur.veil += Math.max(-step, Math.min(step, target - cur.veil));
  const a0 = g.globalAlpha;
  g.globalAlpha = a0 * pose.alpha * cur.veil;
  rect(g, x, y, bw, bh, PAL.night);
  rect(g, x, y, bw, 2, col);
  rect(g, x, y + bh - 2, bw, 2, col);
  rect(g, x, y + 3, bw, 1, PAL.indigo);
  rect(g, x, y + bh - 4, bw, 1, PAL.indigo);
  bigText(g, cur.h.title, x + bw / 2, y + 4, col, PAL.void, scale);
  text(g, sub, Math.round(x + bw / 2 - textWidth(sub) / 2), y + bh - 11, PAL.mist);
  g.globalAlpha = a0;
}
