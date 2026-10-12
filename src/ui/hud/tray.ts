/**
 * The Boon tray down the left edge: one tile for each Boon and relic the house holds, and a chosen Boon
 * flying from the draft to its tile.
 */

import { CARD_BY_ID } from '../../game/data/cards';
import { RELIC_BY_ID } from '../../game/data/relics';
import { textCenter } from '../../render/font';
import { PAL, shade } from '../../render/palette';
import { box } from '../../render/pixel';
import { boonColor, boonTile, groupBoons, relicTile, TILE } from '../boons';
import { gloss, termsIn } from '../glossary';
import type { Hud } from '../Hud';

/** Start a chosen Boon's flight from the draft (screen point) to its tray slot. */
export function flyBoon(hud: Hud, id: string, x: number, y: number) {
  hud.flyers.push({ id, x, y, t: 0 });
}

export function drawTray(hud: Hud) {
  const g = hud.s.screen.g;
  const p = hud.g.player;
  hud.trayPos.clear();
  const groups = groupBoons(p.cards);
  if (!groups.length && !p.relics.length) return;
  const step = TILE + 1;
  // Fixed column height (room for the context card and log below), so the tray never reflows.
  const perCol = Math.max(4, Math.floor((hud.H - 17 - 152) / step));
  let i = 0;
  const slot = () => {
    const pos = { x: 3 + Math.floor(i / perCol) * step, y: 17 + (i % perCol) * step };
    i++;
    return pos;
  };
  const open = () => hud.modals.open({ kind: 'status', tab: 'boons' });
  // At most two columns, so the tray never covers much of the map: the newest Boons and every
  // relic are shown, and a "+N" tile stands for the rest.
  const relics = p.relics.filter((rid) => RELIC_BY_ID[rid]);
  const room = perCol * 2;
  const hidden = groups.length + relics.length > room ? groups.length - Math.max(0, room - 1 - relics.length) : 0;
  const shown = groups.slice(hidden);
  const moreAt = hidden ? { x: 0, y: 0 } : null;
  for (const gr of groups.slice(0, hidden)) hud.trayPos.set(gr.id, moreAt!);
  for (const gr of shown) {
    const c = CARD_BY_ID[gr.id];
    const pos = slot();
    hud.trayPos.set(gr.id, pos);
    const count = gr.count - hud.flyers.filter((f) => f.id === gr.id).length;
    if (count <= 0) continue;
    const id = 'tray-' + gr.id;
    const since = hud.ui.time - (hud.landed.get(gr.id) ?? -9);
    const flash = since < 0.4 ? 1 - since / 0.4 : 0;
    boonTile(g, pos.x, pos.y, c, count, { hot: hud.ui.isHot(id), flash });
    if (flash > 0) {
      const d = Math.round(3 + since * 22);
      const cx = pos.x + 5;
      const cy = pos.y + 5;
      g.fillStyle = boonColor(c);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(cx + dx * d, cy + dy * d, 1, 1);
    }
    hud.ui.add({
      id, x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tip: c.desc, tipTitle: count > 1 ? `${c.name} ×${count}` : c.name, tipColor: boonColor(c),
      terms: termsIn(`${c.name}. ${c.desc}${c.pact ? ' Pact' : ''}`, { max: 2 }),
    });
  }
  relics.forEach((rid, k) => {
    const r = RELIC_BY_ID[rid];
    const pos = slot();
    const id = 'trayr-' + k;
    relicTile(g, pos.x, pos.y, { hot: hud.ui.isHot(id) });
    hud.ui.add({ id, x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tip: r.desc, tipTitle: r.name, tipColor: PAL.sky, terms: [...gloss('relic'), ...termsIn(r.desc, { max: 1 })] });
  });
  if (moreAt) {
    const pos = slot();
    Object.assign(moreAt, pos);
    const hot = hud.ui.isHot('tray-more');
    box(g, pos.x, pos.y, TILE, TILE, hot ? PAL.indigo : PAL.night, hot ? PAL.bone : PAL.slate);
    textCenter(g, hidden < 10 ? `+${hidden}` : String(Math.min(99, hidden)), pos.x + TILE / 2 + 1, pos.y + 3, PAL.mist, 'tiny');
    const count = groups.slice(0, hidden).reduce((a, gr) => a + gr.count, 0);
    hud.ui.add({ id: 'tray-more', x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tipTitle: `${count} more Boons`, tip: 'Your older Boons. Click (or press B) to see every Boon you hold.' });
  }
}

export function drawFlyers(hud: Hud, dt: number) {
  if (!hud.flyers.length) return;
  const g = hud.s.screen.g;
  for (const f of hud.flyers) f.t += dt / 0.7;
  for (const f of hud.flyers) {
    if (f.t < 1) continue;
    hud.landed.set(f.id, hud.ui.time);
    hud.s.sfx.play('select', 0.45);
  }
  hud.flyers = hud.flyers.filter((f) => f.t < 1);
  const at = (f: { x: number; y: number }, to: { x: number; y: number }, t: number) => {
    const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const x0 = f.x - TILE / 2;
    return { x: x0 + (to.x - x0) * k, y: f.y + (to.y - f.y) * k - Math.sin(Math.PI * k) * 26 };
  };
  for (const f of hud.flyers) {
    const c = CARD_BY_ID[f.id];
    if (!c) continue;
    const to = hud.trayPos.get(f.id) ?? { x: 3, y: 17 };
    const col = boonColor(c);
    for (let j = 4; j >= 1; j--) {
      const q = at(f, to, Math.max(0, f.t - j * 0.045));
      g.fillStyle = j > 2 ? shade(col) : col;
      g.fillRect(Math.round(q.x + 4), Math.round(q.y + 4), 3, 3);
    }
    const q = at(f, to, f.t);
    boonTile(g, Math.round(q.x), Math.round(q.y), c, 1);
  }
}
