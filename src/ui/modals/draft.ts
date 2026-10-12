/**
 * The Boon draft: the cards on offer, what each would change for this house (before and after, in
 * figures), the reroll and the pass, and the choice.
 */

import { CARD_BY_ID, CAT_LABEL } from '../../game/data/cards';
import { ERAS, LAST_CRADLE_ERA } from '../../game/data/eras';
import { UNITS } from '../../game/data/units';
import { modDelta, type StatDelta } from '../../game/modstats';
import type { UnitType } from '../../game/types';
import { fit, IC, text, textCenter, textWidth, wrap } from '../../render/font';
import { PAL, shade } from '../../render/palette';
import { box, rect, type Ctx } from '../../render/pixel';
import { drawRich, richLines } from '../../render/rich';
import { icon, shipSprite } from '../../render/sprites';
import { boonColor, catIcon } from '../boons';
import { termsIn } from '../glossary';
import { flyBoon } from '../hud/tray';
import { boonSubjects, drawSubjects, starWindow, subjectNames, subjectsSize, type Look } from '../subjects';
import { MARK, marksOf } from '../Ui';
import type { Modals } from '../Modals';

export const BLUEPRINT_SHIP: Record<string, UnitType> = { bpCarrier: 'carrier', bpLancer: 'lancer', bpDread: 'dreadnought', bpStarbase: 'starbase' };

export function choose(modals: Modals, id: string, slot: number) {
  const p = modals.g.player;
  const card = CARD_BY_ID[id];
  const r = modals.ui.rectOf('card-' + slot);
  if (modals.g.cmdChooseCard(p.id, id)) {
    modals.s.sfx.play(card.cat === 'blueprint' ? 'capture' : 'good', 0.6);
    modals.s.showToast(`${card.name}: ${card.desc}`, boonColor(card), 5);
    flyBoon(modals.hud, id, r ? r.x + r.w / 2 : modals.hud.W / 2, r ? r.y + 18 : modals.hud.H / 2);
    modals.hud.tips.onBoon(card.cat === 'blueprint');
    if (p.pendingDrafts <= 0) modals.s.modal = null;
    else modals.afterChoice();
  }
}

/**
 * A stat line's label. A line about one ship type shows that ship's picture in place of its name
 * ("[picture] DAMAGE"): shorter, and the eye finds the ship at once.
 */
function deltaLabel(modals: Modals, d: StatDelta): { ship: UnitType | null; label: string; w: number } {
  const [group, type] = d.key.split('.');
  const def = group === 'unit' ? UNITS[type as UnitType] : undefined;
  if (def && type !== 'fighter' && d.label.startsWith(def.name + ' ')) {
    const label = d.label.slice(def.name.length + 1).toUpperCase();
    return { ship: type as UnitType, label, w: shipSprite(type as UnitType, modals.g.player.color, 0).width + 3 + textWidth(label, 'tiny') };
  }
  const label = d.label.toUpperCase();
  return { ship: null, label, w: textWidth(label, 'tiny') };
}

/** Does a "before → after" line fit on one row of a Boon card? */
function deltaFits(modals: Modals, d: StatDelta, w: number): boolean {
  return deltaLabel(modals, d).w + 5 + textWidth(`${d.from}→${d.to}`, 'tiny') <= w;
}

/** Draw a "LABEL  +10%→+20%" line; returns its height. */
function drawDelta(modals: Modals, g: Ctx, d: StatDelta, x: number, y: number, w: number): number {
  const one = deltaFits(modals, d, w);
  const { ship, label } = deltaLabel(modals, d);
  let lx = x;
  if (ship) {
    const spr = shipSprite(ship, modals.g.player.color, 0);
    g.drawImage(spr, lx, y + ((5 - spr.height) >> 1));
    lx += spr.width + 3;
  }
  text(g, fit(label, w - (lx - x), 'tiny'), lx, y, PAL.dusk, 'tiny');
  const vy = one ? y : y + 7;
  let vx = x + w - textWidth(`${d.from}→${d.to}`, 'tiny');
  vx = text(g, d.from, vx, vy, PAL.slate, 'tiny');
  vx = text(g, '→', vx, vy, PAL.slate, 'tiny');
  text(g, d.to, vx, vy, d.good ? PAL.teal : PAL.red, 'tiny');
  return one ? 8 : 15;
}

/** A spark that runs around a legendary card's border. */
function glint(modals: Modals, g: Ctx, x: number, y: number, w: number, h: number) {
  let d = Math.floor(modals.ui.time * 70) % (2 * (w + h));
  let px = x;
  let py = y;
  if (d < w) px = x + d;
  else if ((d -= w) < h) {
    px = x + w - 1;
    py = y + d;
  } else if ((d -= h) < w) {
    px = x + w - 1 - d;
    py = y + h - 1;
  } else py = y + h - 1 - (d - w);
  rect(g, px, py, 1, 1, PAL.bone);
}

export function draft(modals: Modals, g: Ctx) {
  const p = modals.g.player;
  const offer = modals.g.ensureOffer(p);
  if (!offer || !offer.length) {
    modals.s.modal = null;
    return;
  }
  const W = modals.hud.W;
  const n = offer.length;
  const cw = Math.max(72, Math.min(112, Math.floor((W - 24 - (n - 1) * 4) / n)));
  const inner = cw - 8;
  const before = modals.g.computeMods(p);
  const cards = offer.map((id) => {
    const c = CARD_BY_ID[id];
    const deltas = BLUEPRINT_SHIP[id] ? [] : modDelta(before, modals.g.computeMods(p, [id])).filter((d) => !d.novel).slice(0, 3);
    const names = wrap(c.name, inner, 'main').slice(0, 2);
    let hgt = 14 + names.length * 10 + 3 + Math.min(8, richLines(c.desc, inner)) * 10 + 13;
    if (deltas.length) hgt += 5 + deltas.reduce((a, d) => a + (deltaFits(modals, d, inner) ? 8 : 15), 0);
    // What the Boon affects, as pictures: the ship type, the resource, the part of the realm.
    return { id, c, deltas, names, hgt, subs: boonSubjects(modals.g, p, c) };
  });
  // The pictures get a window of their own under the header (deep space, with the ship turning in
  // it) when every card has the room; on a small screen with long texts they sit small in the
  // header instead (and a Blueprint keeps its big ship).
  const WIN = 28;
  const ART = WIN + 1;
  const maxH = modals.hud.H - 70;
  const strip = Math.max(...cards.map((k) => k.hgt)) + ART <= maxH;
  for (const k of cards) k.hgt += strip ? ART : BLUEPRINT_SHIP[k.id] ? 30 : 0;
  const ch = Math.min(Math.max(60, ...cards.map((k) => k.hgt)), maxH);
  const w = n * cw + (n - 1) * 4 + 16;
  const h = ch + 52;
  const title = modals.g.cradle && p.era <= LAST_CRADLE_ERA ? `A BOON OF THE ${ERAS[p.era].name.toUpperCase()}` : 'CHOOSE A BOON';
  const { x, y } = modals.frame(g, w, h, p.pendingDrafts > 1 ? `${title} (${p.pendingDrafts} WAITING)` : title);
  textCenter(g, modals.g.cradle ? 'Every age brings one of its own. Pick one: your house keeps it, here and among the stars.' : 'Your Lore has gathered. Pick one to keep for this run.', x + w / 2, y + 16, PAL.dusk, 'tiny');
  const cx0 = x + 8;
  const cy = y + 25;
  if (modals.dealt !== offer) {
    modals.dealt = offer;
    modals.dealtAt = modals.ui.time;
  }
  cards.forEach(({ id, c, deltas, names, subs }, i) => {
    const cx = cx0 + i * (cw + 4);
    const hid = 'card-' + i;
    const hot = modals.ui.isHot(hid);
    const col = boonColor(c);
    // Dealt one after another: each card slides up into place.
    const k = Math.max(0, Math.min(1, (modals.ui.time - modals.dealtAt - i * 0.06) / 0.22));
    const slide = Math.round((1 - k) * (1 - k) * 40);
    const ty = cy - (hot ? 2 : 0) + slide;
    box(g, cx, ty, cw, ch, hot ? PAL.indigo : PAL.night, hot ? PAL.bone : col);
    if (c.rarity === 'epic' || c.rarity === 'legendary' || c.pact) box(g, cx + 1, ty + 1, cw - 2, ch - 2, null, shade(col));
    if (c.rarity === 'legendary') glint(modals, g, cx, ty, cw, ch);
    rect(g, cx + 2, ty + 2, cw - 4, 9, c.cat === 'blueprint' ? PAL.wine : PAL.void);
    icon(g, catIcon(c.cat), cx + 4, ty + 4, col);
    const ship = BLUEPRINT_SHIP[id];
    // Small pictures at the right of the header when there is no window for them.
    const small = strip || ship ? [] : subs;
    const smallW = small.length ? drawSubjects(g, small, cx + cw - 4, ty + 2, 9, { color: p.color, scale: 1, t: modals.ui.time, lively: hot }, 'right') : 0;
    const headW = cw - 15 - (smallW ? smallW + 3 : 0);
    const head = `${c.rarity.toUpperCase()} · ${CAT_LABEL[c.cat].toUpperCase()}`;
    text(g, fit(textWidth(head, 'tiny') <= headW ? head : c.rarity.toUpperCase(), headW, 'tiny'), cx + 11, ty + 4, col, 'tiny');
    let ly = ty + 14;
    const tip = `This Boon affects: ${subjectNames(subs)}.`;
    if (strip) {
      // The window: stars drifting by, and what the Boon affects, alive, in the middle of it.
      const wx = cx + 3;
      const wy = ty + 12;
      const ww = cw - 6;
      starWindow(g, wx, wy, ww, WIN, [...id].reduce((a, ch) => a + ch.charCodeAt(0), i * 31), modals.ui.time, hot);
      // Ships at twice their size and icons at three times; smaller when three of them crowd the window.
      let look: Look = { color: p.color, scale: 2, iconScale: 3, t: modals.ui.time, lively: hot, turn: true };
      if (subjectsSize(subs, look).w > ww - 4) look = { ...look, iconScale: 2 };
      if (subjectsSize(subs, look).w > ww - 4) look = { ...look, scale: 1 };
      g.save();
      g.beginPath();
      g.rect(wx, wy, ww, WIN);
      g.clip();
      drawSubjects(g, subs, wx + ww / 2, wy, WIN, look, 'center');
      g.restore();
      // A thin frame: the rarity's color under the pointer.
      box(g, wx, wy, ww, WIN, null, hot ? col : PAL.indigo);
      ly += ART;
      if (subs.length) modals.ui.hint('card-sub-' + i, wx, wy, ww, WIN, { tip });
    } else if (smallW) modals.ui.hint('card-sub-' + i, cx + cw - 5 - smallW, ty + 2, smallW + 2, 9, { tip });
    for (const l of names) {
      text(g, l, cx + 4, ly, c.rarity === 'legendary' ? PAL.gold : c.pact ? PAL.red : PAL.bone);
      ly += 10;
    }
    ly += 3;
    if (ship && !strip) {
      const spr = shipSprite(ship, p.color, 0);
      const sc = spr.width * 3 <= cw - 16 ? 3 : 2;
      g.drawImage(spr, Math.round(cx + cw / 2 - (spr.width * sc) / 2), ly + 2, spr.width * sc, spr.height * sc);
      ly += spr.height * sc + 6;
    }
    // (The words of the card that the boxes beside it explain are marked.)
    const cardTerms = termsIn(`${c.name}. ${c.desc}${c.pact ? ' Pact' : ''}`, { max: 4 });
    ly = drawRich(g, c.desc, cx + 4, ly, inner, {}, 'main', 8, marksOf(modals.ui.termsFor({ terms: cardTerms })), MARK);
    const deltaTop = ly;
    if (deltas.length) {
      ly += 1;
      rect(g, cx + 4, ly, inner, 1, PAL.indigo);
      ly += 4;
      for (const d of deltas) ly += drawDelta(modals, g, d, cx + 4, ly, inner);
    }
    const owned = modals.g.cardCount(p, id);
    text(g, `[${i + 1}]`, cx + 4, ty + ch - 9, PAL.slate, 'tiny');
    const tag = owned ? `STACK ×${owned}→×${owned + 1}` : 'NEW';
    const tagW = textWidth(tag, 'tiny');
    text(g, tag, cx + cw - 4 - tagW, ty + ch - 9, owned ? PAL.gold : PAL.teal, 'tiny');
    modals.ui.add({
      id: hid, x: cx, y: cy - 2 + slide, w: cw, h: ch + 2, onClick: () => choose(modals, id, i),
      terms: cardTerms, termsBeside: true,
    });
    modals.ui.hint('card-tag-' + i, cx + cw - 6 - tagW, ty + ch - 11, tagW + 4, 9, {
      tip: owned
        ? `You already have ${c.name} ×${owned}. Taking it again stacks its effect (up to ×${c.max}).`
        : `You don't have ${c.name} yet.${c.max > 1 ? ` It can stack up to ×${c.max}.` : ''}`,
    });
    if (deltas.length) {
      modals.ui.hint('card-delta-' + i, cx + 2, deltaTop, cw - 4, ly - deltaTop, {
        tip: 'Your total bonus now → after taking this Boon, counting your house, the omens, your Boons and your relics.',
      });
    }
    modals.ui.hint('card-key-' + i, cx + 2, ty + ch - 11, 14, 9, { tip: `Press ${i + 1} to take this Boon.` });
  });
  const by = y + h - 16;
  const rr = `REROLL (${p.rerolls})`;
  modals.ui.button(g, 'reroll', x + 8, by, textWidth(rr, 'tiny') + 12, 12, rr, () => {
    if (modals.g.cmdReroll(p.id)) modals.s.sfx.play('boon', 0.4);
  }, { font: 'tiny', disabled: p.rerolls <= 0, tip: 'Swap these choices for a new set. Rerolls come from some Boons, events and the Hall of Heirs.' });
  const skip = `SKIP: ${IC.ember}${modals.g.skipValue(p)}`;
  const sw = textWidth(skip, 'tiny') + 12;
  modals.ui.button(g, 'skip', x + w - 8 - sw, by, sw, 12, skip, () => {
    modals.g.cmdSkipDraft(p.id);
    modals.s.sfx.play('ui', 0.5);
    if (p.pendingDrafts <= 0) modals.s.modal = null;
  }, { font: 'tiny', tip: `Take ${modals.g.skipValue(p)} Embers instead of a Boon. Your next Boon still costs the same Lore.` });
  const lw = 'LATER';
  modals.ui.button(g, 'later', x + w / 2 - 20, by, 40, 12, lw, () => modals.close(), { font: 'tiny', tip: 'Decide later. The Boon will wait. (Esc)' });
}
