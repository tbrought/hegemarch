/**
 * The rows a card is made of: a title with a picture, a line of small text, a paragraph, a gap. Each row
 * knows its height and draws itself; the cards (`worldCard.ts`, `fleetCard.ts`) are lists of them.
 */
import type { GNode } from '../../game/types';

import { fit, text, textWidth, wrap } from '../../render/font';

import { drawSettlement } from '../../render/ground';

import { PAL } from '../../render/palette';

import { drawRich, hasMarkup, richLines } from '../../render/rich';

import { worldSprite } from '../../render/worlds';

import type { TipOpts } from '../Ui';



import type { Hud } from '../Hud';
import { isHearth } from '../../game/worldStats';

export interface CardRow {
  h: number;
  draw: (x: number, y: number, w: number) => void;
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
          drawSettlement(g, n, x + 5, y + 6, 5, { era: f ? f.era : -1, color: f ? f.color : PAL.slate, level: 1, hearth: isHearth(n), lit: lit ? 1 : 0, t: hud.ui.time });
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
