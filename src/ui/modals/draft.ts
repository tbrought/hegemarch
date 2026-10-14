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
import type { CardDef } from '../../game/data/cards';
import type { SoundId } from '../../audio/Sfx';
import { FLASH, MOTES, planDeal, SPARKLE, tierOf, type Deal } from './reveal';

export const BLUEPRINT_SHIP: Record<string, UnitType> = { bpCarrier: 'carrier', bpLancer: 'lancer', bpDread: 'dreadnought', bpStarbase: 'starbase', bpStarfall: 'starfall' };

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

/** The window a Boon card shows what it affects in: its height, and the room it takes with the line under it. */
const WIN = 28;
const ART = WIN + 1;

/**
 * A Boon on offer, with what the draft has worked out about it: what it would change, its name in
 * lines, the height its card needs, what it affects.
 */
interface DraftCard {
  id: string;
  c: CardDef;
  deltas: StatDelta[];
  names: string[];
  hgt: number;
  subs: ReturnType<typeof boonSubjects>;
}

/**
 * Where the cards of a draft stand: the width and height of one, the first one's corner, the room for
 * text, and whether each has a window for its pictures.
 */
interface DraftLayout {
  cw: number;
  ch: number;
  cx0: number;
  cy: number;
  inner: number;
  strip: boolean;
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
  // A new offer is dealt: its places appear, and its cards are beamed in one by one (reveal.ts).
  const tiers = cards.map((k) => tierOf(k.c));
  if (modals.dealt !== offer) {
    modals.dealt = offer;
    modals.dealtAt = modals.ui.time;
    modals.dealPrev = -1;
    modals.dealPlan = planDeal(tiers);
    modals.dealTiers = tiers;
  }
  const plan = modals.dealPlan ?? planDeal(tiers);
  const e = modals.ui.time - modals.dealtAt;
  modals.dealDone = e >= plan.doneAt;
  dealSounds(modals, plan, tiers, e);
  // Under the pointer, once all are there, a card rises and grows (drawn last, over its neighbours).
  const hotI = modals.dealDone ? cards.findIndex((_, i) => modals.ui.isHot('card-' + i)) : -1;
  if (hotI >= 0 && modals.hoverCard !== offer[hotI] + hotI) {
    modals.hoverCard = offer[hotI] + hotI;
    modals.hoverAt = modals.ui.time;
    modals.s.sfx.play('tick', 0.3);
  } else if (hotI < 0) modals.hoverCard = '';
  const lay = { cw, ch, cx0, cy, inner, strip };
  cards.forEach((card, i) => i !== hotI && draftCard(modals, g, card, i, lay, e, plan, 0));
  if (hotI >= 0) draftCard(modals, g, cards[hotI], hotI, lay, e, plan, Math.min(3, 1 + Math.floor((modals.ui.time - modals.hoverAt) / 0.035)));
  // A Legendary that has just come sets the dialog's frame flashing in gold for a moment.
  for (let i = 0; i < n; i++) {
    const since = e - plan.cards[i].shownAt;
    if (!CALM && tiers[i] === 3 && since >= 0 && since < 1) box(g, x, y, w, h, null, [PAL.gold, PAL.bone, PAL.ember][Math.floor(since * 15) % 3]);
  }
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

/** No flashing for a player whose computer asks for less motion (the motes and the lines still come). */
const CALM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The sound of the deal: a place appearing, a card starting to come, and each card once it is all there (by its rarity). */
const STING: SoundId[] = ['tick', 'rare', 'epic', 'legendary'];
function dealSounds(modals: Modals, plan: Deal, tiers: number[], e: number) {
  const prev = modals.dealPrev;
  modals.dealPrev = e;
  if (prev >= plan.doneAt) return;
  const crossed = (t: number) => prev < t && e >= t;
  plan.cards.forEach((c, i) => {
    if (crossed(c.landAt)) modals.s.sfx.play('deal', 0.45);
    if (crossed(c.beamAt)) modals.s.sfx.play('kindle', 0.4);
    if (crossed(c.shownAt)) modals.s.sfx.play(CARD_BY_ID[modals.dealt![i]]?.pact ? 'pact' : STING[tiers[i]], tiers[i] ? 0.6 : 0.35);
  });
}

/** A click or a key while the cards are coming: all are there at once (and the rarest is heard). */
export function skipDeal(modals: Modals) {
  const plan = modals.dealPlan;
  if (!plan || modals.dealDone) return;
  modals.dealtAt = modals.ui.time - plan.doneAt;
  modals.dealPrev = plan.doneAt;
  modals.dealDone = true;
  const best = Math.max(...modals.dealTiers);
  if (best > 0) modals.s.sfx.play(STING[best], 0.6);
}

/** A frame whose two colours alternate round it, four pixels at a time: a card's empty place. */
function dashed(g: Ctx, x: number, y: number, w: number, h: number, a: string, b: string) {
  const per = 2 * (w + h) - 4;
  for (let d = 0; d < per; d++) {
    let px: number;
    let py: number;
    if (d < w) {
      px = x + d;
      py = y;
    } else if (d < w + h - 1) {
      px = x + w - 1;
      py = y + d - w + 1;
    } else if (d < 2 * w + h - 2) {
      px = x + w - 2 - (d - w - h + 1);
      py = y + h - 1;
    } else {
      px = x;
      py = y + h - 2 - (d - 2 * w - h + 2);
    }
    // (The corners stay open, as every frame of the game's.)
    if ((px === x || px === x + w - 1) && (py === y || py === y + h - 1)) continue;
    g.fillStyle = (d >> 2) % 2 ? a : b;
    g.fillRect(px, py, 1, 1);
  }
}

/** A sparkle: a white point with four arms that grow and shrink, the tips in a colour. */
function sparkle(g: Ctx, x: number, y: number, arm: number, tip: string) {
  x = Math.round(x);
  y = Math.round(y);
  for (let k = 1; k <= arm; k++) {
    const c = k === arm ? tip : PAL.bone;
    rect(g, x + k, y, 1, 1, c);
    rect(g, x - k, y, 1, 1, c);
    rect(g, x, y + k, 1, 1, c);
    rect(g, x, y - k, 1, 1, c);
  }
  rect(g, x, y, 1, 1, PAL.bone);
}

/** Sparkles round a card, one after another from the moment it is all there: the corners, then (a Legendary) the sides and the top. */
function sparkles(g: Ctx, x: number, y: number, w: number, h: number, since: number, tier: number, col: string) {
  const spots: [number, number][] = [[x - 3, y - 3], [x + w + 2, y + h + 2], [x + w + 2, y - 3], [x - 3, y + h + 2],
    [x + w / 2, y - 5], [x - 5, y + h / 2], [x + w + 4, y + h / 2], [x + w / 2, y + h + 4], [x + w * 0.25, y - 4], [x + w * 0.75, y - 4]];
  const count = tier >= 3 ? spots.length : 4;
  const rounds = tier >= 3 ? 2 : 1;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < count; i++) {
      const t = since - (r * count + i) * 0.045;
      if (t < 0 || t >= 0.25) continue;
      const arm = [1, 2, 3, 2, 1][Math.floor((t / 0.25) * 5)];
      sparkle(g, spots[(i * 3 + r) % count][0], spots[(i * 3 + r) % count][1], arm, col);
    }
  }
}

/** A number in [0, 1) from a number: for things that should look scattered and be the same every frame. */
const scatter = (a: number) => {
  const s = Math.sin(a * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Motes of light rising through a place and twinkling, white and a card's colour. */
function motes(g: Ctx, x: number, y: number, w: number, h: number, t: number, n: number, col: string, seed: number) {
  if (h < 4) return;
  for (let j = 0; j < n; j++) {
    const px = x + 3 + Math.floor(scatter(seed * 31 + j) * (w - 6));
    const life = 0.45 + scatter(seed * 17 + j * 5) * 0.4;
    const ph = ((t + scatter(j * 11 + seed) * life) % life) / life;
    const py = y + h - 3 - Math.floor(ph * (h - 6));
    if ((Math.floor(t * 20) + j) % 4 === 0) sparkle(g, px, py, 1, col);
    else rect(g, px, py, 1, 1, j % 2 ? col : PAL.bone);
  }
}

/** The lights of the pad a card is beamed in on: down both its sides, running. */
function padLines(g: Ctx, x: number, y: number, w: number, h: number, col: string, t: number) {
  const off = Math.floor(t * 40) % 4;
  for (let yy = off; yy < h; yy += 4) {
    rect(g, x + 1, y + yy, 1, 2, col);
    rect(g, x + w - 2, y + yy, 1, 2, col);
  }
}

/**
 * One card of the draft, at the moment `e` of its deal: not there yet, an empty place (a rarer card's
 * with a few motes of its colour), its pad lit and motes rising, its face drawn in line by line, or
 * all there. All there: its rarity and kind, what it affects (in a window of its own, or small in the
 * header), its name and text, what it would change in figures, and whether the house has it already.
 * `grow`: under the pointer, the pixels it has grown by on each side.
 */
function draftCard(modals: Modals, g: Ctx, card: DraftCard, i: number, lay: DraftLayout, e: number, plan: Deal, grow: number) {
  const { id, c, deltas, names, subs } = card;
  const { cw: cw0, ch: ch0, cx0, cy, inner, strip } = lay;
  const p = modals.g.player;
  const t = modals.ui.time;
  const deal = plan.cards[i];
  const tier = tierOf(c);
  const hid = 'card-' + i;
  const col = boonColor(c);
  const baseX = cx0 + i * (cw0 + 4);
  // (Clicked while the cards are coming, a card brings them all; once all are there, it is taken.)
  modals.ui.add({
    id: hid, x: baseX, y: cy - 2, w: cw0, h: ch0 + 2, onClick: () => (modals.dealDone ? choose(modals, id, i) : skipDeal(modals)),
    terms: e >= deal.shownAt ? termsIn(`${c.name}. ${c.desc}${c.pact ? ' Pact' : ''}`, { max: 4 }) : undefined, termsBeside: true,
  });
  if (e < deal.landAt) return;
  const faceFrom = deal.beamAt + MOTES;
  if (e < faceFrom) {
    // Its empty place; a rarer card's shows a few motes of its colour while it waits. Then its pad lights and the motes rise.
    dashed(g, baseX, cy, cw0, ch0, PAL.indigo, PAL.night);
    if (tier > 0 && e >= plan.tellFrom && e < deal.beamAt) motes(g, baseX, cy, cw0, ch0, e, 2 + tier * 2, col, i);
    if (e >= deal.beamAt) {
      motes(g, baseX, cy, cw0, ch0, e, 8 + tier * 6, col, i);
      padLines(g, baseX, cy, cw0, ch0, col, t);
    }
    return;
  }
  const since = e - deal.shownAt;
  const cx = baseX - grow;
  const ty = cy - grow * 2;
  const cw = cw0 + grow * 2;
  const ch = ch0 + grow * 2;
  const hot = grow > 0;
  // Coming in: the face drawn line by line from the top, over its empty place.
  const coming = e < deal.shownAt;
  const scan = coming ? ty + Math.floor((Math.max(0, e - faceFrom) / (deal.shownAt - faceFrom)) * (ch / 3)) * 3 : ty + ch;
  if (coming) {
    dashed(g, cx, ty, cw, ch, PAL.indigo, PAL.night);
    g.save();
    g.beginPath();
    g.rect(cx, ty, cw, scan - ty);
    g.clip();
  }
  if (hot) {
    // A hard shadow, two pixels down and right: the card stands off the table.
    rect(g, cx + 2, ty + ch, cw, 2, PAL.void);
    rect(g, cx + cw, ty + 2, 2, ch, PAL.void);
  }
  box(g, cx, ty, cw, ch, hot ? PAL.indigo : PAL.night, hot ? PAL.bone : col);
  if (c.rarity === 'epic' || c.rarity === 'legendary' || c.pact) box(g, cx + 1, ty + 1, cw - 2, ch - 2, null, shade(col));
  if (c.rarity === 'legendary') glint(modals, g, cx, ty, cw, ch);
  // The header: an Epic's and a Legendary's are filled with their colour, a Blueprint's is wine.
  const banner = tier >= 2;
  rect(g, cx + 2, ty + 2, cw - 4, 9, banner ? col : c.cat === 'blueprint' ? PAL.wine : PAL.void);
  icon(g, catIcon(c.cat), cx + 4, ty + 4, banner ? PAL.void : col);
  const ship = BLUEPRINT_SHIP[id];
  // Small pictures at the right of the header when there is no window for them.
  const small = strip || ship ? [] : subs;
  const smallW = small.length ? drawSubjects(g, small, cx + cw - 4, ty + 2, 9, { color: p.color, scale: 1, t, lively: hot }, 'right') : 0;
  const headW = cw - 15 - (smallW ? smallW + 3 : 0);
  const head = `${c.rarity.toUpperCase()} · ${CAT_LABEL[c.cat].toUpperCase()}`;
  text(g, fit(textWidth(head, 'tiny') <= headW ? head : c.rarity.toUpperCase(), headW, 'tiny'), cx + 11, ty + 4, banner ? (tier === 3 ? PAL.void : PAL.bone) : col, 'tiny');
  let ly = ty + 14;
  const tip = `This Boon affects: ${subjectNames(subs)}.`;
  if (strip) {
    // The window: stars drifting by, and what the Boon affects, alive, in the middle of it.
    const wx = cx + 3;
    const wy = ty + 12;
    const ww = cw - 6;
    starWindow(g, wx, wy, ww, WIN, [...id].reduce((a, ch) => a + ch.charCodeAt(0), i * 31), t, hot);
    // Ships at twice their size and icons at three times; smaller when three of them crowd the window.
    let look: Look = { color: p.color, scale: 2, iconScale: 3, t, lively: hot, turn: true };
    if (subjectsSize(subs, look).w > ww - 4) look = { ...look, iconScale: 2 };
    // (And no taller than the window: a Starfall at twice its size is.)
    if (subjectsSize(subs, look).w > ww - 4 || subjectsSize(subs, look).h > WIN - 2) look = { ...look, scale: 1 };
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
    // (As big as fits: across the card, and in the 30 pixels the card keeps for its picture.)
    const sc = Math.max(1, Math.min(spr.width * 3 <= cw - 16 ? 3 : 2, Math.floor(24 / spr.height)));
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
  if (coming) {
    g.restore();
    // The line that draws it, white over its colour, and motes still rising in what is not drawn yet.
    rect(g, cx + 1, scan, cw - 2, 2, PAL.bone);
    rect(g, cx + 1, scan + 2, cw - 2, 1, col);
    motes(g, cx, scan + 3, cw, Math.max(0, ty + ch - scan - 3), e, 8 + tier * 6, col, i);
    padLines(g, cx, ty, cw, ch, col, t);
    return;
  }
  // All there: the face flashes (white, then its colour), and an Epic or a Legendary throws sparkles.
  if (!CALM && since < FLASH[tier]) rect(g, cx + 1, ty + 1, cw - 2, ch - 2, Math.floor(since / 0.05) % 2 ? col : PAL.bone);
  if (since < SPARKLE[tier]) sparkles(g, cx, ty, cw, ch, since, tier, col);
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
}
