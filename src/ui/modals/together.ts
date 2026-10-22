/**
 * Dialogs of a game played together (1.28): Embers sent to an ally.
 */

import { GIFT_FEE, giftReceived } from '../../game/commands/together';
import { fit, text } from '../../render/font';
import { PAL } from '../../render/palette';
import type { Ctx } from '../../render/pixel';
import type { Modals } from '../Modals';

const AMOUNTS = [100, 250, 500, 1000];

/** Send Embers to an ally: a few amounts, each greyed with the reason it cannot be sent. */
export function gift(modals: Modals, g: Ctx, to: number) {
  const G = modals.g;
  const net = modals.s.net;
  const f = G.factions[to];
  const me = G.player;
  if (!net || !f || !f.alive || !me.alive || G.outcome) {
    modals.s.modal = null;
    return;
  }
  const versus = G.config.together === 'versus';
  const w = 214;
  const h = versus ? 76 : 66;
  const name = net.nameOf(to);
  const { x, y } = modals.frame(g, w, h, `EMBERS FOR ${name}`);
  modals.closeButton(g, x, y, w);
  text(g, fit(`${f.name}, your ally. You have ${Math.floor(me.embers)}.`, w - 20), x + 10, y + 20, PAL.mist);
  const bw = Math.floor((w - 20 - (AMOUNTS.length - 1) * 4) / AMOUNTS.length);
  AMOUNTS.forEach((a, i) => {
    const why = G.checkGift(me.id, to, a);
    modals.ui.button(g, 'gift-' + a, x + 10 + i * (bw + 4), y + 34, bw, 13, String(a), () => {
      G.cmdGift(me.id, to, a);
      modals.s.sfx.play('good', 0.5);
      modals.s.showToast(`${giftReceived(G, a)} Embers on their way to ${name}.`, PAL.gold, 3);
      modals.close();
    }, { icon: 'ember', disabled: !!why, tip: why ?? `Send ${a} Embers: ${name} receives ${giftReceived(G, a)}.` });
  });
  if (versus) text(g, fit(`In versus a fifth (${Math.round(GIFT_FEE * 100)}%) is lost on the way.`, w - 20), x + 10, y + 54, PAL.dusk, 'tiny');
}
