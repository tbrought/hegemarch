/**
 * A Boon becoming ready, marked on its button in the top bar: a ring of violet light fills round it, as
 * round a world a seed ship kindles, dims and goes, and sparkles come at its corners; never a flash.
 * Each time one more Boon waits than at the last frame (so a run continued with a Boon waiting shows
 * it too); a Boon the player has chosen sets off nothing. Not while a dialog is open: it would be over
 * before the dialog is (a run opens with a Boon waiting, under its omens). It comes when the dialog
 * closes, if a Boon still waits.
 */
import { PAL, shade } from '../../render/palette';
import { arcFrame, CALM, sparkles } from '../modals/pixelFx';
import type { Hud } from '../Hud';

/** Seconds the mark takes: the ring filling round the button, then going out (dimmed for its last DIM), and all of it. */
export const BOON_FLASH = { RING: 0.4, DIM: 0.2, ALL: 0.8 };

/** Notice one more Boon waiting than at the last frame (every frame, whether or not the button is shown). */
export function watchBoons(hud: Hud) {
  const n = hud.g.player.pendingDrafts;
  if (n > hud.lastPending) hud.boonFlashDue = true;
  hud.lastPending = n;
  if (hud.boonFlashDue && !hud.s.modal) {
    hud.boonFlashDue = false;
    if (n > 0) hud.boonReadyAt = hud.clock;
  }
}

/** The BOON button of the top bar (at x, y, w, h) in the moments after a Boon has become ready. */
export function boonReady(hud: Hud, x: number, y: number, w: number, h: number) {
  const t = hud.clock - hud.boonReadyAt;
  if (hud.boonReadyAt < 0 || t > BOON_FLASH.ALL) return;
  const g = hud.s.screen.g;
  if (!CALM) arcFrame(g, x - 1, y - 1, w + 2, h + 2, t / BOON_FLASH.RING, t > BOON_FLASH.ALL - BOON_FLASH.DIM ? shade(PAL.violet) : PAL.violet);
  sparkles(g, x, y, w, h, t - 0.08, 2, PAL.violet);
}
