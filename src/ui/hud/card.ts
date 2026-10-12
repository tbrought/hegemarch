/**
 * The card at the bottom left: what is selected (a world, a place, a fleet) in rows. This file has the
 * card itself and the rows every card is made of; `worldCard.ts` and `fleetCard.ts` say what goes on one.
 */

import type { GNode } from '../../game/types';
import { fit, text, textWidth, wrap } from '../../render/font';
import { drawSettlement } from '../../render/ground';
import { PAL } from '../../render/palette';
import { drawRich, hasMarkup, richLines } from '../../render/rich';
import { worldSprite } from '../../render/worlds';
import type { TipOpts } from '../Ui';
import { enemyRows, fleetRows } from './fleetCard';
import { nodeRows } from './worldCard';
import type { Hud } from '../Hud';

export interface CardRow {
  h: number;
  draw: (x: number, y: number, w: number) => void;
}

export function drawCard(hud: Hud) {
  const rows = cardRows(hud);
  if (!rows || !rows.length) {
    hud.cardRect = { x: 0, y: 0, w: 0, h: 0 };
    return;
  }
  const g = hud.s.screen.g;
  const w = Math.min(216, Math.max(176, hud.W - 150));
  const h = rows.reduce((a, r) => a + r.h, 0) + 6;
  const x = 3;
  const y = hud.H - 3 - h;
  hud.cardRect = { x, y, w, h };
  hud.ui.panel(g, 'card', x, y, w, h);
  let cy = y + 3;
  for (const r of rows) {
    r.draw(x + 4, cy, w - 8);
    cy += r.h;
  }
}

function cardRows(hud: Hud): CardRow[] | null {
  const s = hud.s;
  const own = s.ownSelected();
  if (own.length) return fleetRows(hud, own);
  const sel = s.selectedUnits();
  if (sel.length) return enemyRows(hud, sel);
  if (s.view.selectedNode >= 0) return nodeRows(hud, hud.g.nodes[s.view.selectedNode]);
  return null;
}

export function header(hud: Hud, name: string, color: string, n: GNode | null, right?: string, rightColor?: string, rightTip?: TipOpts): CardRow {
  const g = hud.s.screen.g;
  return {
    h: 13,
    draw: (x, y, w) => {
      let tx = x;
      if (n && n.kind === 'planet') {
        const lit = n.owner >= 0;
        if (hud.g.cradle) {
          const f = lit ? hud.g.factions[n.owner] : null;
          drawSettlement(g, n, x + 5, y + 6, 5, { era: f ? f.era : -1, color: f ? f.color : PAL.slate, level: 1, hearth: n.capitalOf >= 0, lit: lit ? 1 : 0, t: hud.ui.time });
        } else g.drawImage(worldSprite(n, 5, lit), x, y);
        tx += 14;
      }
      const rw = right ? textWidth(right, 'tiny') + 4 : 0;
      text(g, fit(name, w - (tx - x) - rw, 'main'), tx, y + 2, color);
      if (right) text(g, right, x + w - rw + 4, y + 3, rightColor ?? PAL.dusk, 'tiny');
      if (right && rightTip) hud.ui.hint('card-right', x + w - rw + 2, y + 1, rw, 9, rightTip);
    },
  };
}

export function line(hud: Hud, t: string, color: string = PAL.dusk, font: 'tiny' | 'main' = 'tiny', tip?: TipOpts): CardRow {
  const g = hud.s.screen.g;
  const h = font === 'tiny' ? 7 : 10;
  return {
    h,
    draw: (x, y, w) => {
      const shown = fit(t, w, font);
      text(g, shown, x, y, color, font);
      if (tip) hud.ui.hint('card-line:' + t, x - 1, y - 1, textWidth(shown, font) + 2, h, tip);
    },
  };
}

export function para(hud: Hud, t: string, color: string = PAL.mist, w = 200, tip?: TipOpts): CardRow {
  const g = hud.s.screen.g;
  const rich = hasMarkup(t);
  const lines = rich ? [] : wrap(t, w, 'main');
  const h = (rich ? richLines(t, w) : lines.length) * 10;
  return {
    h,
    draw: (x, y) => {
      if (rich) drawRich(g, t, x, y, w, { body: color });
      else lines.forEach((l, i) => text(g, l, x, y + i * 10, color));
      if (tip) hud.ui.hint('card-para:' + t, x - 1, y - 1, w + 2, h, tip);
    },
  };
}

export function gap(h = 3): CardRow {
  return { h, draw: () => {} };
}
