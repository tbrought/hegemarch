/**
 * The card at the bottom left: what is selected (a world, a place, a fleet), as a list of rows. Which rows
 * is said in `worldCard.ts` and `fleetCard.ts`; what a row is, in `rows.ts`.
 */

import { enemyRows, fleetRows } from './fleetCard';
import { nodeRows } from './worldCard';
import type { Hud } from '../Hud';
import type { CardRow } from './rows';

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

