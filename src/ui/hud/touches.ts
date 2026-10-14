/**
 * A Boon becoming ready, marked on its button in the top bar: a flash of white over it, fading, a frame
 * that runs out from it, and sparkles at its corners. Each time one more Boon waits than at the last
 * frame (so a run continued with a Boon waiting shows it too); a Boon the player has chosen sets off
 * nothing.
 */
import { PAL } from '../../render/palette';
import { rect, type Ctx } from '../../render/pixel';
import { sparkles } from '../modals/pixelFx';
import type { Hud } from '../Hud';

/** Seconds the mark lasts: the flash, the frame running out, the sparkles. */
export const BOON_FLASH = { WHITE: 0.3, FRAME: 0.4, ALL: 0.8 };

/** A frame one pixel wide round a place. */
export function outline(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  rect(g, x, y, w, 1, c);
  rect(g, x, y + h - 1, w, 1, c);
  rect(g, x, y, 1, h, c);
  rect(g, x + w - 1, y, 1, h, c);
}

/** Notice one more Boon waiting than at the last frame (every frame, whether or not the button is shown). */
export function watchBoons(hud: Hud) {
  const n = hud.g.player.pendingDrafts;
  if (n > hud.lastPending) hud.boonReadyAt = hud.clock;
  hud.lastPending = n;
}

/** The BOON button of the top bar (at x, y, w, h) in the moments after a Boon has become ready. */
export function boonReady(hud: Hud, x: number, y: number, w: number, h: number) {
  const t = hud.clock - hud.boonReadyAt;
  if (hud.boonReadyAt < 0 || t > BOON_FLASH.ALL) return;
  const g = hud.s.screen.g;
  if (t < BOON_FLASH.WHITE) {
    const a0 = g.globalAlpha;
    g.globalAlpha = a0 * (1 - t / BOON_FLASH.WHITE);
    rect(g, x, y, w, h, PAL.bone);
    g.globalAlpha = a0;
  }
  if (t < BOON_FLASH.FRAME) {
    const k = 1 + Math.floor((t / BOON_FLASH.FRAME) * 4);
    outline(g, x - k, y - k, w + 2 * k, h + 2 * k, k < 3 ? PAL.bone : PAL.violet);
  }
  sparkles(g, x, y, w, h, t - 0.08, 2, PAL.violet);
}
