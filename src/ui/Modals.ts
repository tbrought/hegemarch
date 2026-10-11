import type { Modal } from '../app/Session';
import { ABILITY_BY_ID } from '../game/data/abilities';
import { AMBITION_BY_ID } from '../game/data/ambitions';
import { describePassage } from '../game/ages';
import { ERAS, LAST_CRADLE_ERA } from '../game/data/eras';
import { CARD_BY_ID, CAT_LABEL, type CardCat } from '../game/data/cards';
import { EVENT_BY_ID } from '../game/data/events';
import { HEIR_BY_ID } from '../game/data/heirs';
import { RELIC_BY_ID } from '../game/data/relics';
import { TRAIT_BY_ID } from '../game/data/traits';
import { UNITS } from '../game/data/units';
import { VICTORIES } from '../game/data/victories';
import type { UnitType } from '../game/types';
import { DIFFICULTY_NAMES } from '../game/constants';
import { modDelta, modLines, statSources, type StatDelta } from '../game/modstats';
import { fit, IC, lineHeight, setVocabulary, text, textCenter, textWidth, wrap } from '../render/font';
import { PAL, shade } from '../render/palette';
import { bar, box, rect, type Ctx } from '../render/pixel';
import { drawRich, richLines } from '../render/rich';
import { fmtTime } from '../render/Renderer';
import { icon, shipSprite } from '../render/sprites';
import { boonColor, CAT_ORDER, catIcon, groupBoons } from './boons';
import { boonSubjects, drawSubjects, starWindow, subjectNames, subjectsIn, subjectsSize, type Look } from './subjects';
import { fmt } from './format';
import { gloss, termsIn } from './glossary';
import { MARK, marksOf } from './Ui';
import type { Hud } from './Hud';
import { TIPS } from './Tips';

const BLUEPRINT_SHIP: Record<string, UnitType> = { bpCarrier: 'carrier', bpLancer: 'lancer', bpDread: 'dreadnought', bpStarbase: 'starbase' };

export type StatusTab = 'destinies' | 'boons' | 'rivals' | 'run';
type HelpTab = 'basics' | 'controls' | 'tips';

/** Tips in the order a run usually meets them. */
const TIP_ORDER = ['role', 'fleet', 'boonReady', 'raid', 'anomalySeen', 'anomaly', 'blueprint', 'hangar', 'arkLevel', 'lostWorld', 'crisis'];
/** Tips of the cradle of an Ages run (listed first there, last elsewhere). */
const AGES_TIPS = ['ageReady', 'ageNew', 'ageSiege', 'ageRival', 'ageGone', 'ageArk'];

export class Modals {
  private result: { promptId: number; text: string } | null = null;
  private statusTab: StatusTab = 'destinies';
  private helpTab: HelpTab = 'basics';
  /** Scroll offset of the Boons list (pixels). */
  private boonScroll = 0;
  private boonScrollMax = 0;
  /** The offer being shown and when it was dealt (cards slide in when a new offer appears). */
  private dealt: string[] | null = null;
  private dealtAt = 0;
  private helpScroll = 0;
  private helpScrollMax = 0;
  private logScroll = 0;
  private logScrollMax = 0;

  constructor(private hud: Hud) {}

  private get s() {
    return this.hud.s;
  }

  private get g() {
    return this.hud.s.game;
  }

  private get ui() {
    return this.hud.ui;
  }

  open(m: Modal) {
    if (m.kind === 'draft' && this.g.player.pendingDrafts <= 0) return;
    if (m.kind === 'event') {
      const p = this.g.prompts.find((x) => x.id === m.promptId);
      if (!p) return;
      if (p.node >= 0) this.s.focusNode(p.node);
    }
    if (m.kind === 'log') this.logScroll = 0;
    if (m.kind === 'help' && m.tab) {
      this.helpTab = m.tab;
      this.helpScroll = 0;
    }
    if (m.kind === 'status') {
      if (m.tab !== 'boons' && !this.s.reveal().destinies && this.s.guided) return;
      if (m.tab) this.statusTab = m.tab;
      if (m.tab === 'boons') this.boonScroll = 0;
    }
    this.s.modal = m;
    this.s.sfx.play(m.kind === 'draft' ? 'boon' : 'ui', 0.5);
  }

  close() {
    const m = this.s.modal;
    if (!m) return;
    if (m.kind === 'event') {
      if (this.result && this.result.promptId === m.promptId) {
        this.g.dismissPrompt(m.promptId);
        this.result = null;
      } else this.hud.snoozed.add(m.promptId);
    }
    this.s.modal = null;
    if (m.kind === 'destinies') this.hud.tutorial.onDestiniesClosed();
  }

  /** Clicking the dimmed area outside closes informational modals. */
  closable(): boolean {
    const k = this.s.modal?.kind;
    return k === 'status' || k === 'help' || k === 'log' || k === 'settings' || k === 'menu' || k === 'omens' || k === 'cradle';
  }

  /** Keyboard shortcuts inside modals. Returns true when handled. */
  key(code: string): boolean {
    const m = this.s.modal;
    if (!m) return false;
    if (m.kind === 'draft') {
      const n = parseInt(code.replace('Digit', ''), 10);
      const offer = this.g.ensureOffer(this.g.player);
      if (offer && n >= 1 && n <= offer.length) {
        this.choose(offer[n - 1], n - 1);
        return true;
      }
    }
    if (m.kind === 'event' && !this.result) {
      const n = parseInt(code.replace('Digit', ''), 10);
      if (n >= 1) {
        this.resolve(m.promptId, n - 1);
        return true;
      }
    }
    return false;
  }

  draw(g: Ctx) {
    const m = this.s.modal!;
    switch (m.kind) {
      case 'draft':
        return this.draft(g);
      case 'event':
        return this.event(g, m.promptId);
      case 'ability':
        return this.ability(g, m.unitId);
      case 'status':
        return this.status(g);
      case 'menu':
        return this.menu(g);
      case 'settings':
        return this.settings(g);
      case 'help':
        return this.help(g);
      case 'destinies':
        return this.destinies(g);
      case 'nightDone':
        return this.nightDone(g);
      case 'omens':
        return this.omens(g);
      case 'cradle':
        return this.cradleCard(g);
      case 'ascend':
        return this.ascendCard(g);
      case 'log':
        return this.logView(g);
      case 'confirm':
        return this.confirm(g, m.text, m.yes, m.onYes);
    }
  }

  private frame(g: Ctx, w: number, h: number, title: string, color: string = PAL.gold): { x: number; y: number } {
    const W = this.hud.W;
    const H = this.hud.H;
    w = Math.min(w, W - 8);
    h = Math.min(h, H - 8);
    const x = Math.round(W / 2 - w / 2);
    const y = Math.round(H / 2 - h / 2);
    this.ui.add({ id: 'modal-back', x: 0, y: 0, w: W, h: H, onClick: () => this.closable() && this.close() });
    this.ui.panel(g, 'modal', x, y, w, h, { border: color === PAL.gold ? PAL.ember : PAL.slate });
    rect(g, x + 2, y + 2, w - 4, 11, PAL.indigo);
    textCenter(g, title, x + w / 2, y + 4, color);
    return { x, y };
  }

  private closeButton(g: Ctx, x: number, y: number, w: number) {
    this.ui.button(g, 'modal-close', x + w - 13, y + 2, 11, 11, '×', () => this.close(), { tip: 'Close (Esc)' });
  }

  // ---------------------------------------------------------------------
  // Boon draft
  // ---------------------------------------------------------------------

  private choose(id: string, slot: number) {
    const p = this.g.player;
    const card = CARD_BY_ID[id];
    const r = this.ui.rectOf('card-' + slot);
    if (this.g.cmdChooseCard(p.id, id)) {
      this.s.sfx.play(card.cat === 'blueprint' ? 'capture' : 'good', 0.6);
      this.s.showToast(`${card.name}: ${card.desc}`, boonColor(card), 5);
      this.hud.flyBoon(id, r ? r.x + r.w / 2 : this.hud.W / 2, r ? r.y + 18 : this.hud.H / 2);
      this.hud.tips.onBoon(card.cat === 'blueprint');
      if (p.pendingDrafts <= 0) this.s.modal = null;
    }
  }

  /**
   * A stat line's label. A line about one ship type shows that ship's picture in place of its name
   * ("[picture] DAMAGE"): shorter, and the eye finds the ship at once.
   */
  private deltaLabel(d: StatDelta): { ship: UnitType | null; label: string; w: number } {
    const [group, type] = d.key.split('.');
    const def = group === 'unit' ? UNITS[type as UnitType] : undefined;
    if (def && type !== 'fighter' && d.label.startsWith(def.name + ' ')) {
      const label = d.label.slice(def.name.length + 1).toUpperCase();
      return { ship: type as UnitType, label, w: shipSprite(type as UnitType, this.g.player.color, 0).width + 3 + textWidth(label, 'tiny') };
    }
    const label = d.label.toUpperCase();
    return { ship: null, label, w: textWidth(label, 'tiny') };
  }

  /** Does a "before → after" line fit on one row of a Boon card? */
  private deltaFits(d: StatDelta, w: number): boolean {
    return this.deltaLabel(d).w + 5 + textWidth(`${d.from}→${d.to}`, 'tiny') <= w;
  }

  /** Draw a "LABEL  +10%→+20%" line; returns its height. */
  private drawDelta(g: Ctx, d: StatDelta, x: number, y: number, w: number): number {
    const one = this.deltaFits(d, w);
    const { ship, label } = this.deltaLabel(d);
    let lx = x;
    if (ship) {
      const spr = shipSprite(ship, this.g.player.color, 0);
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
  private glint(g: Ctx, x: number, y: number, w: number, h: number) {
    let d = Math.floor(this.ui.time * 70) % (2 * (w + h));
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

  private draft(g: Ctx) {
    const p = this.g.player;
    const offer = this.g.ensureOffer(p);
    if (!offer || !offer.length) {
      this.s.modal = null;
      return;
    }
    const W = this.hud.W;
    const n = offer.length;
    const cw = Math.max(72, Math.min(112, Math.floor((W - 24 - (n - 1) * 4) / n)));
    const inner = cw - 8;
    const before = this.g.computeMods(p);
    const cards = offer.map((id) => {
      const c = CARD_BY_ID[id];
      const deltas = BLUEPRINT_SHIP[id] ? [] : modDelta(before, this.g.computeMods(p, [id])).filter((d) => !d.novel).slice(0, 3);
      const names = wrap(c.name, inner, 'main').slice(0, 2);
      let hgt = 14 + names.length * 10 + 3 + Math.min(8, richLines(c.desc, inner)) * 10 + 13;
      if (deltas.length) hgt += 5 + deltas.reduce((a, d) => a + (this.deltaFits(d, inner) ? 8 : 15), 0);
      // What the Boon affects, as pictures: the ship type, the resource, the part of the realm.
      return { id, c, deltas, names, hgt, subs: boonSubjects(this.g, p, c) };
    });
    // The pictures get a window of their own under the header (deep space, with the ship turning in
    // it) when every card has the room; on a small screen with long texts they sit small in the
    // header instead (and a Blueprint keeps its big ship).
    const WIN = 28;
    const ART = WIN + 1;
    const maxH = this.hud.H - 70;
    const strip = Math.max(...cards.map((k) => k.hgt)) + ART <= maxH;
    for (const k of cards) k.hgt += strip ? ART : BLUEPRINT_SHIP[k.id] ? 30 : 0;
    const ch = Math.min(Math.max(60, ...cards.map((k) => k.hgt)), maxH);
    const w = n * cw + (n - 1) * 4 + 16;
    const h = ch + 52;
    const title = this.g.cradle && p.era <= LAST_CRADLE_ERA ? `A BOON OF THE ${ERAS[p.era].name.toUpperCase()}` : 'CHOOSE A BOON';
    const { x, y } = this.frame(g, w, h, p.pendingDrafts > 1 ? `${title} (${p.pendingDrafts} WAITING)` : title);
    textCenter(g, this.g.cradle ? 'Every age brings one of its own. Pick one: your house keeps it, here and among the stars.' : 'Your Lore has gathered. Pick one to keep for this run.', x + w / 2, y + 16, PAL.dusk, 'tiny');
    const cx0 = x + 8;
    const cy = y + 25;
    if (this.dealt !== offer) {
      this.dealt = offer;
      this.dealtAt = this.ui.time;
    }
    cards.forEach(({ id, c, deltas, names, subs }, i) => {
      const cx = cx0 + i * (cw + 4);
      const hid = 'card-' + i;
      const hot = this.ui.isHot(hid);
      const col = boonColor(c);
      // Dealt one after another: each card slides up into place.
      const k = Math.max(0, Math.min(1, (this.ui.time - this.dealtAt - i * 0.06) / 0.22));
      const slide = Math.round((1 - k) * (1 - k) * 40);
      const ty = cy - (hot ? 2 : 0) + slide;
      box(g, cx, ty, cw, ch, hot ? PAL.indigo : PAL.night, hot ? PAL.bone : col);
      if (c.rarity === 'epic' || c.rarity === 'legendary' || c.pact) box(g, cx + 1, ty + 1, cw - 2, ch - 2, null, shade(col));
      if (c.rarity === 'legendary') this.glint(g, cx, ty, cw, ch);
      rect(g, cx + 2, ty + 2, cw - 4, 9, c.cat === 'blueprint' ? PAL.wine : PAL.void);
      icon(g, catIcon(c.cat), cx + 4, ty + 4, col);
      const ship = BLUEPRINT_SHIP[id];
      // Small pictures at the right of the header when there is no window for them.
      const small = strip || ship ? [] : subs;
      const smallW = small.length ? drawSubjects(g, small, cx + cw - 4, ty + 2, 9, { color: p.color, scale: 1, t: this.ui.time, lively: hot }, 'right') : 0;
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
        starWindow(g, wx, wy, ww, WIN, [...id].reduce((a, ch) => a + ch.charCodeAt(0), i * 31), this.ui.time, hot);
        // Ships at twice their size and icons at three times; smaller when three of them crowd the window.
        let look: Look = { color: p.color, scale: 2, iconScale: 3, t: this.ui.time, lively: hot, turn: true };
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
        if (subs.length) this.ui.hint('card-sub-' + i, wx, wy, ww, WIN, { tip });
      } else if (smallW) this.ui.hint('card-sub-' + i, cx + cw - 5 - smallW, ty + 2, smallW + 2, 9, { tip });
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
      ly = drawRich(g, c.desc, cx + 4, ly, inner, {}, 'main', 8, marksOf(this.ui.termsFor({ terms: cardTerms })), MARK);
      const deltaTop = ly;
      if (deltas.length) {
        ly += 1;
        rect(g, cx + 4, ly, inner, 1, PAL.indigo);
        ly += 4;
        for (const d of deltas) ly += this.drawDelta(g, d, cx + 4, ly, inner);
      }
      const owned = this.g.cardCount(p, id);
      text(g, `[${i + 1}]`, cx + 4, ty + ch - 9, PAL.slate, 'tiny');
      const tag = owned ? `STACK ×${owned}→×${owned + 1}` : 'NEW';
      const tagW = textWidth(tag, 'tiny');
      text(g, tag, cx + cw - 4 - tagW, ty + ch - 9, owned ? PAL.gold : PAL.teal, 'tiny');
      this.ui.add({
        id: hid, x: cx, y: cy - 2 + slide, w: cw, h: ch + 2, onClick: () => this.choose(id, i),
        terms: cardTerms, termsBeside: true,
      });
      this.ui.hint('card-tag-' + i, cx + cw - 6 - tagW, ty + ch - 11, tagW + 4, 9, {
        tip: owned
          ? `You already have ${c.name} ×${owned}. Taking it again stacks its effect (up to ×${c.max}).`
          : `You don't have ${c.name} yet.${c.max > 1 ? ` It can stack up to ×${c.max}.` : ''}`,
      });
      if (deltas.length) {
        this.ui.hint('card-delta-' + i, cx + 2, deltaTop, cw - 4, ly - deltaTop, {
          tip: 'Your total bonus now → after taking this Boon, counting your house, the omens, your Boons and your relics.',
        });
      }
      this.ui.hint('card-key-' + i, cx + 2, ty + ch - 11, 14, 9, { tip: `Press ${i + 1} to take this Boon.` });
    });
    const by = y + h - 16;
    const rr = `REROLL (${p.rerolls})`;
    this.ui.button(g, 'reroll', x + 8, by, textWidth(rr, 'tiny') + 12, 12, rr, () => {
      if (this.g.cmdReroll(p.id)) this.s.sfx.play('boon', 0.4);
    }, { font: 'tiny', disabled: p.rerolls <= 0, tip: 'Swap these choices for a new set. Rerolls come from some Boons, events and the Hall of Heirs.' });
    const skip = `SKIP: ${IC.ember}${this.g.skipValue(p)}`;
    const sw = textWidth(skip, 'tiny') + 12;
    this.ui.button(g, 'skip', x + w - 8 - sw, by, sw, 12, skip, () => {
      this.g.cmdSkipDraft(p.id);
      this.s.sfx.play('ui', 0.5);
      if (p.pendingDrafts <= 0) this.s.modal = null;
    }, { font: 'tiny', tip: `Take ${this.g.skipValue(p)} Embers instead of a Boon. Your next Boon still costs the same Lore.` });
    const lw = 'LATER';
    this.ui.button(g, 'later', x + w / 2 - 20, by, 40, 12, lw, () => this.close(), { font: 'tiny', tip: 'Decide later. The Boon will wait. (Esc)' });
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  private resolve(promptId: number, choice: number) {
    const r = this.g.cmdResolvePrompt(promptId, choice);
    if (r === null) {
      this.s.sfx.play('error', 0.5);
      return;
    }
    this.result = { promptId, text: r };
    this.s.sfx.play('good', 0.5);
  }

  private event(g: Ctx, promptId: number) {
    const p = this.g.prompts.find((x) => x.id === promptId);
    const ev = p ? EVENT_BY_ID[p.event] : null;
    if (!p || !ev) {
      this.s.modal = null;
      return;
    }
    const w = Math.min(this.hud.W - 16, 300);
    const inner = w - 16;
    const f = this.g.player;
    const textLines = wrap(ev.text, inner, 'main');
    const ctx = { node: p.node, unit: p.unit };
    const done = this.result && this.result.promptId === promptId;
    const resultLines = done ? wrap(this.result!.text, inner, 'main') : [];
    // What each choice touches, as pictures at the right of its row.
    const subs = ev.choices.map((c) => c.icons ?? subjectsIn(c.hint));
    const look: Look = { color: f.color, scale: 2, turn: true };
    const subSize = subs.map((s) => subjectsSize(s, look));
    const subW = subSize.map((z) => (z.w ? z.w + 8 : 0));
    // A row is at least as tall as its pictures (a turning Dreadnought needs room).
    const choiceH = ev.choices.map((c, i) => Math.max(14 + richLines(c.hint, inner - 8 - subW[i]) * 10, subSize[i].h + 6));
    const h = 30 + textLines.length * 10 + 6 + (done ? resultLines.length * 10 + 26 : choiceH.reduce((a, b) => a + b + 3, 0)) + 4;
    const { x, y } = this.frame(g, w, h, ev.title.toUpperCase(), PAL.violet);
    const where = p.node >= 0 ? this.g.nodes[p.node].name.toUpperCase() : '';
    textCenter(g, ev.kind === 'anomaly' ? `ANOMALY AT ${where}` : 'A VISITOR AT YOUR HEARTH', x + w / 2, y + 16, PAL.dusk, 'tiny');
    let ly = y + 26;
    for (const l of textLines) {
      text(g, l, x + 8, ly, PAL.mist);
      ly += 10;
    }
    const storyTerms = termsIn(ev.text);
    if (storyTerms.length) this.ui.hint('ev-story', x + 8, y + 25, inner, ly - y - 25, { terms: storyTerms });
    ly += 6;
    if (done) {
      rect(g, x + 8, ly - 3, inner, 1, PAL.indigo);
      for (const l of resultLines) {
        text(g, l, x + 8, ly + 2, PAL.gold);
        ly += 10;
      }
      this.ui.button(g, 'ev-ok', x + w / 2 - 34, ly + 8, 68, 13, 'CONTINUE', () => this.close(), { primary: true });
      return;
    }
    ev.choices.forEach((c, i) => {
      const ok = !c.cond || c.cond(this.g, f, ctx);
      const hh = choiceH[i];
      const id = 'choice-' + i;
      const hot = this.ui.isHot(id) && ok;
      box(g, x + 8, ly, inner, hh, hot ? PAL.indigo : PAL.night, ok ? (hot ? PAL.bone : PAL.slate) : PAL.indigo);
      text(g, `${i + 1}. ${c.label}`, x + 12, ly + 3, ok ? PAL.bone : PAL.slate);
      const dim = PAL.indigo;
      drawRich(g, c.hint, x + 12, ly + 13, inner - 8 - subW[i], ok ? { body: PAL.dusk } : { body: dim, gain: dim, loss: dim, kw: dim });
      if (subs[i].length) {
        // Alive while it can be chosen (livelier under the pointer); dim and still when it cannot.
        g.globalAlpha = ok ? 1 : 0.3;
        drawSubjects(g, subs[i], x + 8 + inner - 6, ly + 3, hh - 6, ok ? { ...look, t: this.ui.time, lively: hot } : look, 'right');
        g.globalAlpha = 1;
      }
      this.ui.add({ id, x: x + 8, y: ly, w: inner, h: hh, onClick: () => this.resolve(promptId, i), disabled: !ok, tip: ok ? undefined : 'You cannot afford this right now.', terms: termsIn(c.hint) });
      ly += hh + 3;
    });
    this.closeButton(g, x, y, w);
  }

  // ---------------------------------------------------------------------
  // Abilities
  // ---------------------------------------------------------------------

  private ability(g: Ctx, unitId: number) {
    const u = this.g.units.get(unitId);
    if (!u || u.dead || !u.pendingAbil.length) {
      this.s.modal = null;
      return;
    }
    const choices = u.pendingAbil[0];
    const w = Math.min(this.hud.W - 16, 260);
    const inner = w - 16;
    const color = this.g.player.color;
    // Who each ability acts on: allies, enemies, or (when its text names nobody) the ship itself.
    const subs = choices.map((id) => {
      const s = subjectsIn(ABILITY_BY_ID[id].desc).filter((k) => k !== 'world');
      return s.length ? s : [u.type as string];
    });
    const look: Look = { color, scale: 2, turn: true };
    const subSize = subs.map((s) => subjectsSize(s, look));
    const subW = subSize.map((z) => z.w + 8);
    const hs = choices.map((id, i) => Math.max(14 + richLines(ABILITY_BY_ID[id].desc, inner - 8 - subW[i]) * 10, subSize[i].h + 6));
    const h = 30 + hs.reduce((a, b) => a + b + 3, 0) + 4;
    const { x, y } = this.frame(g, w, h, `${UNITS[u.type].name.toUpperCase()} · LEVEL ${u.level}`);
    textCenter(g, 'Choose a new ability. It triggers by itself in battle.', x + w / 2, y + 16, PAL.dusk, 'tiny');
    let ly = y + 26;
    choices.forEach((id, i) => {
      const a = ABILITY_BY_ID[id];
      const hid = 'ab-' + i;
      const hot = this.ui.isHot(hid);
      box(g, x + 8, ly, inner, hs[i], hot ? PAL.indigo : PAL.night, hot ? PAL.bone : PAL.slate);
      text(g, a.name, x + 12, ly + 3, a.color);
      drawRich(g, a.desc, x + 12, ly + 13, inner - 8 - subW[i]);
      drawSubjects(g, subs[i], x + 8 + inner - 6, ly + 3, hs[i] - 6, { ...look, t: this.ui.time, lively: hot }, 'right');
      this.ui.add({
        id: hid, x: x + 8, y: ly, w: inner, h: hs[i], terms: termsIn(a.desc, { exclude: a.name }),
        onClick: () => {
          if (this.g.cmdChooseAbility(this.g.playerId, u.id, id)) {
            this.s.sfx.play('ability', 0.6);
            if (!u.pendingAbil.length) this.s.modal = null;
          }
        },
      });
      ly += hs[i] + 3;
    });
  }

  // ---------------------------------------------------------------------
  // Status screen
  // ---------------------------------------------------------------------

  private status(g: Ctx) {
    const W = this.hud.W;
    const H = this.hud.H;
    const w = Math.min(W - 12, 420);
    const h = Math.min(H - 12, 250);
    const { x, y } = this.frame(g, w, h, this.statusTab === 'boons' ? 'YOUR BOONS' : 'STATUS');
    this.closeButton(g, x, y, w);
    const early = !this.s.reveal().destinies && this.s.guided;
    const tabs: [StatusTab, string][] = early ? [['boons', 'BOONS']] : [['destinies', this.g.cradle ? 'THE CLIMB' : 'DESTINIES'], ['boons', 'BOONS'], ['rivals', 'RIVALS'], ['run', 'THIS RUN']];
    if (early) this.statusTab = 'boons';
    let tx = x + 6;
    for (const [id, label] of tabs) {
      const tw = textWidth(label, 'tiny') + 10;
      this.ui.button(g, 'tab-' + id, tx, y + 15, tw, 11, label, () => (this.statusTab = id), { font: 'tiny', selected: this.statusTab === id });
      tx += tw + 2;
    }
    const cx = x + 8;
    const cy = y + 31;
    const cw = w - 16;
    const p = this.g.player;
    switch (this.statusTab) {
      case 'destinies': {
        if (this.g.cradle) {
          this.agesTab(g, cx, cy, cw, y + h - 5);
          break;
        }
        let ly = cy;
        for (const v of this.g.victories) {
          const d = VICTORIES[v];
          const pr = this.hud.destinyProgress(p, v);
          const top = ly;
          icon(g, v, cx, ly);
          text(g, d.name.toUpperCase(), cx + 9, ly, PAL.gold);
          text(g, pr.label, cx + cw - textWidth(pr.label, 'tiny'), ly + 1, PAL.mist, 'tiny');
          bar(g, cx + 9, ly + 9, cw - 9, 2, pr.frac, pr.frac >= 1 ? PAL.teal : PAL.gold, PAL.indigo);
          ly += 13;
          for (const l of wrap(d.desc, cw - 9, 'main').slice(0, 2)) {
            text(g, l, cx + 9, ly, PAL.dusk);
            ly += 10;
          }
          this.ui.hint('st-dest-' + v, cx, top, cw, ly - top, { tip: `${d.name}: ${d.desc}`, terms: termsIn(d.desc, { exclude: d.name }) });
          ly += 3;
        }
        rect(g, cx, ly, cw, 1, PAL.indigo);
        ly += 4;
        text(g, 'OMENS', cx, ly, PAL.violet, 'tiny');
        ly += 7;
        this.ui.hint('st-omens', cx, ly - 7, 30, 7, { terms: gloss('omen') });
        for (const t of this.g.traits) {
          const tr = TRAIT_BY_ID[t];
          if (!tr) continue;
          const top = ly;
          ly = drawRich(g, `${tr.name}: ${tr.desc}`, cx, ly, cw, {}, 'main', 2);
          this.ui.hint('st-omen-' + t, cx, top, cw, ly - top, { terms: termsIn(tr.desc), scan: tr.name });
        }
        const amb = AMBITION_BY_ID[this.g.ambition];
        if (amb && ly < y + h - 18) {
          ly += 2;
          const top = ly;
          text(g, 'AMBITION', cx, ly, PAL.gold, 'tiny');
          ly += 7;
          const done = amb.check(this.g, p, false);
          text(g, fit(`${amb.name}: ${amb.desc} (+${amb.reward} Legacy)`, cw, 'main'), cx, ly, done ? PAL.teal : PAL.mist);
          this.ui.hint('st-amb', cx, top, cw, ly + 9 - top, {
            tip: `${amb.name}: ${amb.desc} Complete it for [+${amb.reward} Legacy] at the end of the run.${done ? ' Done so far!' : ''}`,
            terms: [...termsIn(amb.desc, { max: 2 }), ...gloss('ambition', 'legacy')],
          });
        }
        break;
      }
      case 'boons':
        this.boonsTab(g, cx, cy, cw, y + h - cy - 5);
        break;
      case 'rivals': {
        let ly = cy;
        for (const f of this.g.empires()) {
          const heir = HEIR_BY_ID[f.heir];
          const worlds = this.g.worldsOf(f.id).length;
          rect(g, cx, ly + 1, 6, 6, f.color);
          text(g, `${f.name}${f.isPlayer ? ' (YOU)' : ''}`, cx + 10, ly, f.alive ? PAL.bone : PAL.slate);
          const status = !f.alive ? (f.launchedAt >= 0 && this.g.cradle ? `LEFT FOR THE STARS AT ${fmtTime(f.launchedAt)}` : `OUT AT ${fmtTime(f.eliminatedAt)}`) : this.g.asleep(f.id) ? `STILL ON ITS WAY · ARRIVES IN ${fmtTime(f.asleepUntil - this.g.time)}` : `${worlds} WORLDS · ${f.boons} BOONS`;
          text(g, status, cx + cw - textWidth(status, 'tiny'), ly + 1, f.alive ? PAL.mist : PAL.slate, 'tiny');
          ly += 10;
          const notes: string[] = [];
          if (heir) notes.push(heir.title);
          if (f.gate) notes.push('RAISING A STARFIRE GATE!');
          if (f.holdTimer > 0) notes.push('HOLDS DOMINION!');
          if (f.treasuryTimer > 0) notes.push('HOARDING EMBERS!');
          if (f.relicTimer > 0) notes.push('HOLDS THE RELICS!');
          text(g, fit(notes.join(' · '), cw - 10, 'tiny'), cx + 10, ly, notes.length > 1 ? PAL.red : PAL.dusk, 'tiny');
          const warn: string[] = [];
          if (f.gate) warn.push('[!Raising a Starfire Gate]: destroy it before it charges, or they win by Ascension.');
          if (f.holdTimer > 0) warn.push('[!Holds 60% of all worlds]: take worlds back before the hold completes, or they win by Dominion.');
          if (f.treasuryTimer > 0) warn.push('[!Hoarding Embers]: take their worlds to seize part of the hoard, or they win by Ember Hoard.');
          if (f.relicTimer > 0) warn.push('[!Holds most of the relics]: take their Hearth before time runs out, or they win by Relic Hunt.');
          if (heir) {
            this.ui.hint('st-rival-' + f.id, cx, ly - 10, cw, 19, {
              tipTitle: f.isPlayer ? `${f.name} (you)` : f.name,
              tipColor: f.color,
              tip: [`${heir.title}. ${heir.desc}`, heir.bonuses.join(' · '), ...warn].join('\n'),
            });
          }
          ly += 11;
        }
        ly += 4;
        const pir = this.g.pirates;
        text(g, pir.alive ? `CORSAIRS: ${pir.raidCount} RAIDS SO FAR · NEXT ~${fmtTime(Math.max(this.g.time, pir.nextRaid))}` : 'CORSAIRS: DESTROYED', cx, ly, PAL.mist, 'tiny');
        this.ui.hint('st-corsairs', cx, ly - 1, cw, 8, { terms: gloss('corsairs', 'stronghold') });
        ly += 9;
        const c = this.g.crisis;
        if (c) {
          text(g, c.dead ? 'THE HOLLOW: PURGED' : c.awake ? 'THE HOLLOW: LOOSE IN THE SECTOR' : `THE HOLLOW: THE MAW STIRS (~${fmtTime(c.awakenAt)})`, cx, ly, PAL.pink, 'tiny');
          this.ui.hint('st-hollow', cx, ly - 1, cw, 8, { terms: gloss('hollow', 'maw', 'riftHeart') });
        }
        break;
      }
      case 'run': {
        const st = p.stats;
        const rows: [string, string][] = [
          ['House', HEIR_BY_ID[p.heir]?.name ?? ''],
          ['Time', fmtTime(this.g.time)],
          ['Sector', `${this.g.config.size} · ${DIFFICULTY_NAMES[this.g.config.difficulty]}${this.g.config.daily ? ' · daily' : ''}`],
          ['Seed', String(this.g.config.seed)],
          ['Worlds held / most', `${this.g.worldsOf(p.id).length} / ${st.maxWorlds}`],
          ['Kindled / captured / lost', `${st.worldsKindled} / ${st.worldsCaptured} / ${st.worldsLost}`],
          ['Ships built / lost', `${st.shipsBuilt} / ${st.shipsLost}`],
          ['Enemy ships destroyed', String(st.kills)],
          ['Embers earned', fmt(st.embersEarned)],
          ['Boons from Lore', String(p.boons)],
          ['Anomalies resolved', String(st.eventsResolved)],
        ];
        let ly = cy;
        for (const [k, v] of rows) {
          text(g, k, cx, ly, PAL.dusk);
          text(g, v, cx + cw - textWidth(v), ly, PAL.bone);
          ly += 10;
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Boons screen: everything the house has, and what it all adds up to
  // ---------------------------------------------------------------------

  /** Mouse wheel inside a modal. Returns true when it was used. */
  wheel(dy: number): boolean {
    if (this.s.modal?.kind === 'status' && this.statusTab === 'boons') {
      this.boonScroll = Math.max(0, Math.min(this.boonScrollMax, this.boonScroll + Math.sign(dy) * 24));
      return true;
    }
    if (this.s.modal?.kind === 'help') {
      this.helpScroll = Math.max(0, Math.min(this.helpScrollMax, this.helpScroll + Math.sign(dy) * 24));
      return true;
    }
    if (this.s.modal?.kind === 'log') {
      this.logScroll = Math.max(0, Math.min(this.logScrollMax, this.logScroll + Math.sign(dy) * 24));
      return true;
    }
    return false;
  }

  private boonsTab(g: Ctx, x: number, y: number, w: number, h: number) {
    const p = this.g.player;
    const tw = Math.min(150, Math.max(112, Math.floor(w * 0.36)));
    const lw = w - tw - 9;
    const items: { h: number; draw: (ly: number) => void; terms?: ReturnType<typeof termsIn> }[] = [];
    const head = (label: string, iconName: string, color: string, right = '') =>
      items.push({
        h: 12,
        draw: (ly) => {
          icon(g, iconName, x, ly + 1, color);
          text(g, label, x + 8, ly + 1, color, 'tiny');
          if (right) text(g, right, x + lw - textWidth(right, 'tiny'), ly + 1, PAL.slate, 'tiny');
          rect(g, x, ly + 8, lw, 1, PAL.indigo);
        },
      });
    const entry = (name: string, color: string, count: number, desc: string) =>
      items.push({
        terms: termsIn(`${name}. ${desc}`),
        h: 10 + richLines(desc, lw - 6) * 10 + 3,
        draw: (ly) => {
          const ex = text(g, fit(name, lw - 20, 'main'), x + 2, ly, color);
          if (count > 1) text(g, `×${count}`, ex + 2, ly, PAL.gold);
          drawRich(g, desc, x + 6, ly + 10, lw - 6, { body: PAL.dusk });
        },
      });
    const bullet = (s: string) =>
      items.push({
        terms: termsIn(s),
        h: richLines(s, lw - 8) * 10,
        draw: (ly) => {
          rect(g, x + 3, ly + 3, 2, 2, PAL.slate);
          drawRich(g, s, x + 8, ly, lw - 8, { body: PAL.mist });
        },
      });
    const groups = groupBoons(p.cards);
    if (!groups.length) items.push({ h: 14, draw: (ly) => text(g, 'No Boons yet. They come as your Lore fills.', x, ly, PAL.dusk) });
    for (const cat of CAT_ORDER) {
      const list = groups.filter((gr) => CARD_BY_ID[gr.id].cat === cat);
      if (!list.length) continue;
      head(CAT_LABEL[cat].toUpperCase(), catIcon(cat as CardCat), cat === 'pact' ? PAL.red : PAL.mist, String(list.reduce((a, b) => a + b.count, 0)));
      for (const gr of list) {
        const c = CARD_BY_ID[gr.id];
        entry(c.name, boonColor(c), gr.count, c.desc);
      }
    }
    if (p.relics.length) {
      head('RELICS', 'relic', PAL.sky, String(p.relics.length));
      for (const id of p.relics) {
        const r = RELIC_BY_ID[id];
        if (r) entry(r.name, PAL.sky, 1, r.desc);
      }
    }
    const heir = HEIR_BY_ID[p.heir];
    if (heir) {
      head(heir.name.toUpperCase(), 'hearth', heir.color);
      for (const b of heir.bonuses) bullet(b);
      items.push({ h: 4, draw: () => {} });
    }
    const traits = this.g.traits.map((t) => TRAIT_BY_ID[t]).filter(Boolean);
    if (traits.length) {
      head('OMENS · EVERY HOUSE', 'star', PAL.violet);
      for (const t of traits) entry(t.name, PAL.violet, 1, t.desc);
    }
    // The list scrolls inside its column.
    const total = items.reduce((a, it) => a + it.h, 0);
    this.boonScrollMax = Math.max(0, total - h);
    this.boonScroll = Math.min(this.boonScroll, this.boonScrollMax);
    g.save();
    g.beginPath();
    g.rect(x, y, lw + 1, h);
    g.clip();
    let ly = y - this.boonScroll;
    items.forEach((it, i) => {
      if (ly + it.h > y && ly < y + h) {
        it.draw(ly);
        const top = Math.max(y, ly);
        if (it.terms?.length) this.ui.hint('bl-' + i, x, top, lw, Math.min(y + h, ly + it.h) - top, { terms: it.terms });
      }
      ly += it.h;
    });
    g.restore();
    if (this.boonScrollMax > 0) {
      const sx = x + lw + 3;
      rect(g, sx, y, 1, h, PAL.indigo);
      const th = Math.max(10, Math.round((h * h) / total));
      rect(g, sx, y + Math.round(((h - th) * this.boonScroll) / this.boonScrollMax), 1, th, PAL.dusk);
    }
    // Totals from every source.
    const rx = x + lw + 9;
    box(g, rx - 3, y - 1, tw + 3, h + 2, PAL.void, PAL.indigo);
    text(g, 'ALL BONUSES', rx, y + 2, PAL.gold, 'tiny');
    text(g, 'HOUSE, OMENS, BOONS, RELICS', rx, y + 9, PAL.slate, 'tiny');
    let ty = y + 19;
    const lines = modLines(p.mods);
    const rows = Math.max(1, Math.floor((h - 30) / 7));
    const shown = lines.length > rows ? lines.slice(0, rows - 1) : lines;
    const sources = this.g.modSources(p);
    this.ui.hint('bt-head', rx, y + 1, tw - 4, 15, { tip: 'Every bonus your house has right now, added up from all its sources. Point at a line to see where it comes from.' });
    for (const l of shown) {
      const vw = textWidth(l.text, 'tiny');
      text(g, fit(l.label.toUpperCase(), tw - vw - 10, 'tiny'), rx, ty, PAL.mist, 'tiny');
      text(g, l.text, rx + tw - 5 - vw, ty, l.good ? PAL.teal : PAL.red, 'tiny');
      const from = statSources(sources, l.key);
      this.ui.hint('bt-' + l.key, rx - 2, ty - 1, tw - 2, 7, {
        tipTitle: `${l.label} ${l.text}`,
        tipColor: l.good ? PAL.teal : PAL.red,
        tip: from.map((s) => `${s.label}: ${s.good ? '[' : '[!'}${s.text}]`).join('\n') || 'From your house.',
      });
      ty += 7;
    }
    if (lines.length > shown.length) text(g, `+${lines.length - shown.length} MORE`, rx, ty, PAL.slate, 'tiny');
    if (!lines.length) text(g, 'NONE YET', rx, ty, PAL.slate, 'tiny');
    const foot = `REROLLS ${p.rerolls} · BOONS ${p.cards.length}`;
    text(g, foot, rx, y + h - 6, PAL.dusk, 'tiny');
  }

  // ---------------------------------------------------------------------
  // Menu, settings, help
  // ---------------------------------------------------------------------

  private menu(g: Ctx) {
    const w = 150;
    const items: [string, () => void, boolean?][] = [
      ['RESUME', () => this.close()],
      ['SETTINGS', () => (this.s.modal = { kind: 'settings' })],
      ['HOW TO PLAY', () => (this.s.modal = { kind: 'help' })],
      ['STATUS', () => (this.s.modal = { kind: 'status' }), !this.s.reveal().destinies && this.s.guided],
      ['SAVE AND QUIT', () => this.s.hooks.quit(true)],
      [
        'ABANDON RUN',
        () => (this.s.modal = { kind: 'confirm', text: 'Abandon this run? It will count as a defeat.', yes: 'ABANDON', onYes: () => this.s.hooks.abandon() }),
      ],
    ];
    const h = 22 + items.length * 15 + 4;
    const { x, y } = this.frame(g, w, h, 'PAUSED');
    items.forEach(([label, act, dis], i) => {
      this.ui.button(g, 'm-' + i, x + 10, y + 20 + i * 15, w - 20, 13, label, act, { disabled: !!dis, danger: label === 'ABANDON RUN', primary: i === 0 });
    });
  }

  private settings(g: Ctx) {
    const st = this.s.profile.settings;
    const w = 220;
    const h = 150;
    const { x, y } = this.frame(g, w, h, 'SETTINGS');
    this.closeButton(g, x, y, w);
    const save = () => {
      this.s.hooks.saveProfile();
      this.s.hooks.applySettings();
    };
    let ly = y + 20;
    const vol = (label: string, key: 'master' | 'sfx' | 'music') => {
      text(g, label, x + 10, ly, PAL.mist);
      this.ui.slider(g, 'vol-' + key, x + 90, ly + 1, w - 104, st[key], (v) => {
        st[key] = Math.round(v * 20) / 20;
        save();
      });
      ly += 13;
    };
    vol('Volume', 'master');
    vol('Effects', 'sfx');
    vol('Music', 'music');
    ly += 2;
    const toggle = (label: string, key: 'autoPause' | 'crt' | 'edgePan' | 'tips' | 'explainTerms', tip: string) => {
      this.ui.button(g, 'tg-' + key, x + 10, ly, w - 20, 12, label, () => {
        st[key] = !st[key];
        save();
      }, { right: st[key] ? 'ON' : 'OFF', rightColor: st[key] ? PAL.teal : PAL.slate, align: 'left', tip });
      ly += 14;
    };
    toggle('Auto-pause for decisions', 'autoPause', 'Pause when your ship reaches an anomaly, when a visitor hails you, on the first raid, or when your Hearth is attacked.');
    toggle('First-time tips', 'tips', 'One-line cards that explain things the first time they happen.');
    toggle('Explain game terms', 'explainTerms', 'Boxes beside tooltips that explain game terms such as Kindle, Glow or Hangar.');
    toggle('Scanlines (CRT)', 'crt', 'An old-monitor scanline filter.');
    toggle('Edge scrolling', 'edgePan', 'Move the view when the pointer touches the edge of the screen.');
    ly += 2;
    text(g, 'Pixel size', x + 10, ly + 3, PAL.mist);
    const sizes: ['small' | 'auto' | 'large', string, string][] = [
      ['small', 'SMALL', 'Small pixels: see more of the sector at once (640×360 game pixels).'],
      ['auto', 'AUTO', 'Fit the window: at least 480×270 game pixels, scaled up in whole steps.'],
      ['large', 'LARGE', 'Large pixels: bigger text and ships (400×225 game pixels).'],
    ];
    let bx = x + 90;
    for (const [id, label, tip] of sizes) {
      this.ui.button(g, 'px-' + id, bx, ly, 38, 12, label, () => {
        st.pixelSize = id;
        save();
      }, { font: 'tiny', selected: st.pixelSize === id, tip });
      bx += 40;
    }
  }

  private help(g: Ctx) {
    const W = this.hud.W;
    const H = this.hud.H;
    const w = Math.min(W - 12, 400);
    const h = Math.min(H - 12, 240);
    const { x, y } = this.frame(g, w, h, 'HOW TO PLAY');
    this.closeButton(g, x, y, w);
    const tabs: [HelpTab, string][] = [['basics', 'THE BASICS'], ['controls', 'CONTROLS'], ['tips', 'TIPS']];
    let tx = x + 6;
    for (const [id, label] of tabs) {
      const tw = textWidth(label, 'tiny') + 10;
      this.ui.button(g, 'htab-' + id, tx, y + 15, tw, 11, label, () => {
        this.helpTab = id;
        this.helpScroll = 0;
      }, { font: 'tiny', selected: this.helpTab === id });
      tx += tw + 2;
    }
    const cx = x + 8;
    const top = y + 31;
    const cw = w - 16;
    const seen = this.s.profile.seenTips;
    const paras: { text: string; color: string; star?: boolean }[] =
      this.helpTab === 'basics' && this.g.cradle
        ? [
            'THE CRADLE: every house begins here in the Stone Age, all on one planet. Climb through the ages, build your Ark, and carry what you have won to the stars, where the crown is decided.',
            `AGES: your Lore is saved for the next age. When the bar at the top is full, press the button beside it (or A). The step costs Embers and takes time at your Hearth; an attack on the Hearth stops the work. There are five ages: ${ERAS.slice(0, LAST_CRADLE_ERA + 1).map((e) => e.name.replace(' Age', '')).join(', ')}.`,
            'A NEW AGE brings stronger units, more to build (siege units and Bastions with bronze, higher levels later), and one Boon. Every unit you already have is upgraded to it, wherever it stands.',
            'KINDLE: click a grey land and press KINDLE. A firebearer walks out and lights it. Each land costs a bit more. Beasts hold the richest lands: drive them off first.',
            'LANDS: each land earns Embers and has one role. MINE: more Embers. FORGE: builds units. OBSERVATORY: Lore, so a faster climb. BASTION: guns and repairs.',
            'UNITS: swift units beat siege units, siege units beat sturdy units and walls, sturdy units beat swift ones. Their names change with the ages; the triangle does not.',
            'THE ARK is the last step. When yours is done, your house leaves for the stars with its Boons and Embers. A rival whose Ark leaves first is ahead of you out there; a rival whose Hearth you put out here never follows.',
            'Lose your Hearth and your house goes dark. Put out every rival Hearth before any Ark rises, and the crown is yours at once.',
          ].map((t) => ({ text: t, color: PAL.mist }))
        : this.helpTab === 'basics'
        ? [
            'The last Hegemarch fell, and the sector went dark. Light it up, one world at a time, and follow one of your three Destinies to the crown.',
            'KINDLE: click a grey world and press KINDLE. A seed ship flies out and lights it. Each world costs a bit more.',
            'SCOUTS wait for your order: select one (click its fleet badge) and press EXPLORE, and it charts the dark by itself. To look inside an anomaly (a violet swirl), send any ship there.',
            'WORLDS: each world earns Embers and has one role. MINE: more Embers. FORGE: builds ships. OBSERVATORY: Lore. BASTION: guns and repairs. Raise worlds to level II and III.',
            'SHIPS: Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers. New ships come as Blueprint Boons.',
            'BOONS: when your Lore fills, choose a Boon. They shape every run differently. Your Boons line the left edge of the screen.',
            'Lose your Hearth and your house goes dark. Hearth walls start at half strength and are full at 12:00: a rush can win early, but if it fails your rivals will strike back.',
            'NOT SURE WHAT SOMETHING IS? Point at it. Tooltips, Boon cards, events and Destinies explain the game terms they use in boxes beside them (Settings can turn this off).',
          ].map((t) => ({ text: t, color: PAL.mist }))
        : this.helpTab === 'controls'
          ? [
              `Left-click: select a world, a ship or a fleet badge (${IC.fleet}, the number of ships beside a world). Drag: select ships.`,
              'With ships selected, click a world (or right-click) to send them. Right-click an enemy ship to attack it.',
              'Wheel: zoom. Right- or middle-drag, or the arrow keys: move the view. C: look at your Hearth.',
              'Space: pause. The ½ 1 2 3 buttons at the top right (or + and -): game speed.',
              'B: Boons. U: status. L: comms log. F: select all warships. K: kindle the selected world. S: stop. R: retreat.',
              'E: send the selected Scouts exploring. With no Scout selected, E picks your idle Scouts first: press it again to send them.',
              'Shift-click a ship button: queue five. Shift-click ships: add to the selection. Double-click a ship: select all of its kind nearby.',
              'Ctrl+1 to 9: save the selected ships as a group. 1 to 9: select that group again. Esc: cancel, or open the menu.',
            ].map((t) => ({ text: t, color: PAL.mist }))
          : [
              { text: 'Each of these pops up once, the first time it matters. They are all here to read again.', color: PAL.dusk },
              ...(this.g.cradle ? [...AGES_TIPS, ...TIP_ORDER.filter((id) => ['role', 'fleet', 'hangar', 'lostWorld'].includes(id))] : this.g.config.mode === 'ages' ? TIP_ORDER : [...TIP_ORDER, ...AGES_TIPS]).map((id) => ({
                text: TIPS[id], color: seen.includes(id) ? PAL.mist : PAL.dusk, star: true,
              })),
            ];
    // Lay out, then draw inside a clipped area that scrolls with the wheel.
    const lh = lineHeight('main');
    const blocks = paras.map((p) => ({ ...p, lines: wrap(p.text, cw - (p.star ? 9 : 0), 'main') }));
    const total = blocks.reduce((a, b) => a + b.lines.length * lh + 4, 0);
    const ah = y + h - 6 - top;
    this.helpScrollMax = Math.max(0, total - ah);
    this.helpScroll = Math.min(this.helpScroll, this.helpScrollMax);
    g.save();
    g.beginPath();
    g.rect(cx, top - 1, cw + 1, ah + 1);
    g.clip();
    let ly = top - this.helpScroll;
    for (const b of blocks) {
      if (b.star) icon(g, 'star', cx, ly, b.color === PAL.mist ? undefined : PAL.slate, b.color !== PAL.mist);
      for (const l of b.lines) {
        if (ly + lh > top && ly < top + ah) text(g, l, cx + (b.star ? 9 : 0), ly, b.color);
        ly += lh;
      }
      ly += 4;
    }
    g.restore();
    if (this.helpScrollMax > 0) {
      const sx = x + w - 5;
      rect(g, sx, top, 1, ah, PAL.indigo);
      const th = Math.max(10, Math.round((ah * ah) / total));
      rect(g, sx, top + Math.round(((ah - th) * this.helpScroll) / this.helpScrollMax), 1, th, PAL.dusk);
    }
  }

  // ---------------------------------------------------------------------
  // Destinies intro (end of the First Night tutorial)
  // ---------------------------------------------------------------------

  private destinies(g: Ctx) {
    const W = this.hud.W;
    const vs = this.g.victories;
    const cw = Math.max(90, Math.min(124, Math.floor((W - 24 - (vs.length - 1) * 4) / vs.length)));
    const ch = 40 + Math.max(...vs.map((v) => Math.min(8, wrap(VICTORIES[v].desc, cw - 8, 'main').length))) * 10;
    const w = vs.length * cw + (vs.length - 1) * 4 + 16;
    const h = ch + 50;
    const { x, y } = this.frame(g, w, h, 'YOUR DESTINIES');
    textCenter(g, 'Three roads to the crown of Hegemarch. Any one is enough.', x + w / 2, y + 16, PAL.dusk, 'tiny');
    vs.forEach((v, i) => {
      const d = VICTORIES[v];
      const cx = x + 8 + i * (cw + 4);
      const cy = y + 25;
      box(g, cx, cy, cw, ch, PAL.night, PAL.ember);
      // Big icon (2x)
      const tmp = document.createElement('canvas');
      tmp.width = 5;
      tmp.height = 7;
      const tg = tmp.getContext('2d')!;
      icon(tg, v, 0, 0);
      g.drawImage(tmp, Math.round(cx + cw / 2 - 5), cy + 5, 10, 14);
      textCenter(g, d.name.toUpperCase(), cx + cw / 2, cy + 23, PAL.gold);
      let ly = cy + 35;
      for (const l of wrap(d.desc, cw - 8, 'main').slice(0, 8)) {
        text(g, l, cx + 4, ly, PAL.mist);
        ly += 10;
      }
      this.ui.add({ id: 'dest-card-' + i, x: cx, y: cy, w: cw, h: ch, terms: termsIn(d.desc, { exclude: d.name, max: 4 }), termsBeside: true });
    });
    this.ui.button(g, 'dest-begin', x + w / 2 - 34, y + h - 17, 68, 13, 'BEGIN', () => this.close(), { primary: true, pulse: true });
  }

  // ---------------------------------------------------------------------
  // The end of the First Night
  // ---------------------------------------------------------------------

  private nightDone(g: Ctx) {
    const W = this.hud.W;
    const w = Math.min(W - 16, 290);
    const inner = w - 20;
    const paras: [string, string][] = [
      ['That was the whole guide. You can kindle worlds, build ships, choose Boons, fight off raiders and send out Scouts.', PAL.mist],
      ['Go back to the menu to start a run of your own, or keep playing this one. It is saved either way: CONTINUE on the menu picks it up.', PAL.mist],
      ['Tips still pop up the first time something new happens (Settings can turn them off).', PAL.dusk],
    ];
    const blocks = paras.map(([t, c]) => ({ lines: wrap(t, inner, 'main'), c }));
    const h = 22 + blocks.reduce((a, b) => a + b.lines.length * 10 + 5, 0) + 20;
    const { x, y } = this.frame(g, w, h, 'THE FIRST NIGHT IS COMPLETE');
    let ly = y + 18;
    for (const b of blocks) {
      for (const l of b.lines) {
        text(g, l, x + 10, ly, b.c);
        ly += 10;
      }
      ly += 5;
    }
    const bw = Math.min(90, (w - 30) / 2);
    this.ui.button(g, 'nd-menu', x + w / 2 - bw - 3, y + h - 17, bw, 13, 'MAIN MENU', () => this.s.hooks.quit(true), {
      primary: true, pulse: true, tip: 'Back to the title screen to start a new run. This one is saved: CONTINUE picks it up.',
    });
    this.ui.button(g, 'nd-keep', x + w / 2 + 3, y + h - 17, bw, 13, 'KEEP PLAYING', () => this.close(), {
      tip: 'Play this run on: it is a whole game, and every Destiny is still open.',
    });
  }

  // ---------------------------------------------------------------------
  // The card at the start of an Ages run
  // ---------------------------------------------------------------------

  private cradleCard(g: Ctx) {
    const W = this.hud.W;
    const w = Math.min(W - 8, 340);
    const inner = w - 30;
    const p = this.g.player;
    const points: [string, string, string][] = [
      ['lore', 'CLIMB', `Your Lore is saved for the next age. When the bar at the top is full, press ADVANCE (or A): the ${ERAS[1].name} begins.`],
      ['boon', 'EVERY AGE', 'A new age brings stronger units, new things to build, and one Boon to choose. You keep those Boons for the whole run.'],
      ['ascension', 'THE ARK', `After the ${ERAS[LAST_CRADLE_ERA].name} you build your Ark. It carries your house to the stars, and there the crown is decided.`],
      ['conquest', 'YOUR RIVALS', 'They climb too. An Ark that leaves before yours is ahead of you out there. A Hearth you put out here never troubles you again.'],
    ];
    const blocks = points.map(([, , t]) => wrap(t, inner, 'main'));
    // (On the smallest screens the opening line makes way for the four points.)
    const room = this.hud.H - 8;
    let lead = wrap(`Every house begins here, as a tribe of the Stone Age, all on one planet. You lead the ${p.name}.`, w - 20, 'main');
    const size = () => 20 + (lead.length ? lead.length * 10 + 6 : 0) + blocks.reduce((a, b) => a + 12 + b.length * 10 + 4, 0) + 20;
    if (size() > room) lead = [];
    const h = size();
    const { x, y } = this.frame(g, w, h, 'THE CRADLE', PAL.gold);
    let ly = y + 17;
    for (const l of lead) {
      text(g, l, x + 10, ly, PAL.bone);
      ly += 10;
    }
    if (lead.length) ly += 6;
    points.forEach(([ic, title], i) => {
      icon(g, ic, x + 10, ly + 1);
      text(g, title, x + 21, ly + 1, PAL.gold, 'tiny');
      ly += 10;
      for (const l of blocks[i]) {
        text(g, l, x + 21, ly, PAL.mist);
        ly += 10;
      }
      ly += 6;
    });
    this.ui.button(g, 'cradle-begin', x + w / 2 - 34, y + h - 17, 68, 13, 'BEGIN', () => this.close(), { primary: true });
  }

  // ---------------------------------------------------------------------
  // The card as the player's Ark leaves the cradle (Ages runs)
  // ---------------------------------------------------------------------

  private ascendCard(g: Ctx) {
    // (This card speaks of what lies ahead, in the words of the stars.)
    setVocabulary(null);
    const W = this.hud.W;
    const w = Math.min(W - 16, 330);
    const pass = describePassage(this.g);
    const lead = wrap(`After ${fmtTime(pass.cradleTime)} on the cradle, your Ark leaves for the stars. The crown of Hegemarch is decided out there.`, w - 20, 'main');
    const carry = wrap(
      `${pass.boons} ${pass.boons === 1 ? 'Boon' : 'Boons'} of your ages, ${fmt(pass.embers)} Embers${pass.ships ? `, and ${pass.ships} more ${pass.ships === 1 ? 'ship' : 'ships'} for the ${pass.lands} lands you held` : ''}. Your Lore makes Boons again.`,
      w - 31, 'main');
    const rows = pass.rivals.map((r) => ({
      r,
      line:
        r.fate === 'ahead' ? `left ${fmtTime(r.seconds)} before you: it is ahead` : r.fate === 'fallen' ? 'its Hearth is dark: it will not follow' : `still in the ${ERAS[Math.min(r.era, LAST_CRADLE_ERA)].name}: it follows in about ${Math.max(1, Math.round(r.seconds / 60))} min`,
    }));
    const h = 20 + lead.length * 10 + 8 + 10 + carry.length * 10 + 8 + 10 + rows.length * 11 + 24;
    const { x, y } = this.frame(g, w, h, 'YOUR ARK RISES', PAL.gold);
    let ly = y + 17;
    for (const l of lead) {
      text(g, l, x + 10, ly, PAL.bone);
      ly += 10;
    }
    ly += 8;
    icon(g, 'boon', x + 10, ly);
    text(g, 'YOU TAKE WITH YOU', x + 21, ly + 1, PAL.gold, 'tiny');
    ly += 10;
    for (const l of carry) {
      text(g, l, x + 21, ly, PAL.mist);
      ly += 10;
    }
    ly += 8;
    icon(g, 'conquest', x + 10, ly);
    text(g, 'YOUR RIVALS', x + 21, ly + 1, PAL.gold, 'tiny');
    ly += 10;
    for (const { r, line } of rows) {
      rect(g, x + 21, ly + 1, 5, 5, r.fate === 'fallen' ? PAL.slate : r.color);
      const ex = text(g, r.name, x + 30, ly, r.fate === 'fallen' ? PAL.slate : r.color);
      text(g, fit(line, x + w - 10 - ex - 6, 'tiny'), ex + 6, ly + 1, r.fate === 'ahead' ? PAL.ember : PAL.dusk, 'tiny');
      ly += 11;
    }
    this.ui.button(g, 'ascend-go', x + w / 2 - 46, y + h - 18, 92, 14, 'TO THE STARS', () => this.s.hooks.ascend?.(), { primary: true, pulse: true });
  }

  /** The status screen's first tab on the cradle: where every house stands on the climb. */
  private agesTab(g: Ctx, cx: number, cy: number, cw: number, bottom: number) {
    const game = this.g;
    let ly = cy;
    for (const f of game.empires()) {
      const gone = f.launchedAt >= 0;
      const dead = !f.alive && !gone;
      rect(g, cx, ly + 1, 5, 5, dead ? PAL.slate : f.color);
      text(g, (f.isPlayer ? `${f.name} (you)` : f.name).toUpperCase(), cx + 9, ly, dead ? PAL.slate : f.color);
      const fate = gone ? `LEFT FOR THE STARS AT ${fmtTime(f.launchedAt)}` : dead ? 'ITS HEARTH HAS GONE DARK' : ERAS[f.era].name.toUpperCase() + (f.advance && f.era >= LAST_CRADLE_ERA ? ' · BUILDING ITS ARK' : '');
      text(g, fate, cx + cw - textWidth(fate, 'tiny'), ly + 1, gone ? PAL.gold : dead ? PAL.slate : PAL.mist, 'tiny');
      for (let k = 0; k <= LAST_CRADLE_ERA; k++) rect(g, cx + 9 + k * 14, ly + 10, 12, 2, dead ? PAL.indigo : gone || f.era > k ? (gone ? PAL.gold : f.color) : PAL.indigo);
      ly += 17;
    }
    rect(g, cx, ly, cw, 1, PAL.indigo);
    ly += 5;
    const p = game.player;
    const era = ERAS[Math.min(p.era, LAST_CRADLE_ERA)];
    const lines = [
      p.era >= LAST_CRADLE_ERA
        ? `Your next step is the Ark: ${era.lore} Lore, ${era.cost} Embers and ${era.time} seconds at your Hearth. When it is done, your house leaves for the stars.`
        : `Your next age is the ${ERAS[p.era + 1].name}: ${era.lore} Lore, ${era.cost} Embers and ${era.time} seconds at your Hearth. ${ERAS[p.era + 1].brings}`,
      'Put out every rival Hearth before any Ark rises, and the crown is yours at once. Otherwise it is decided among the stars: a house whose Ark has left is gone ahead, not beaten.',
      'A new age upgrades every unit you have, wherever it stands, and brings a Boon of its own.',
    ];
    for (const t of lines) {
      for (const l of wrap(t, cw, 'main')) {
        if (ly > bottom - 10) return;
        text(g, l, cx, ly, PAL.dusk);
        ly += 10;
      }
      ly += 3;
    }
  }

  // ---------------------------------------------------------------------
  // The omen card at the start of a run
  // ---------------------------------------------------------------------

  private omens(g: Ctx) {
    const W = this.hud.W;
    const w = Math.min(W - 16, 300);
    const inner = w - 16;
    const traits = this.g.traits.map((t) => TRAIT_BY_ID[t]).filter(Boolean);
    const amb = AMBITION_BY_ID[this.g.ambition];
    const blocks = traits.map((t) => richLines(t.desc, inner - 8));
    const ambLines = amb ? wrap(`${amb.desc} (+${amb.reward} Legacy)`, inner - 8, 'main') : [];
    const h = 30 + blocks.reduce((a, b) => a + 16 + b * 10, 0) + (amb ? 22 + ambLines.length * 10 : 0) + 22;
    const { x, y } = this.frame(g, w, h, 'OMENS OVER THE SECTOR', PAL.violet);
    textCenter(g, 'Every run, the sector is a little different.', x + w / 2, y + 16, PAL.dusk, 'tiny');
    let ly = y + 26;
    traits.forEach((t) => {
      const top = ly;
      icon(g, 'star', x + 8, ly);
      text(g, t.name.toUpperCase(), x + 16, ly, PAL.violet);
      ly = drawRich(g, t.desc, x + 16, ly + 11, inner - 8) + 5;
      this.ui.hint('om-' + t.id, x + 8, top, inner, ly - top - 3, { terms: [...gloss('omen'), ...termsIn(t.desc, { max: 2 })] });
    });
    if (amb) {
      rect(g, x + 8, ly, inner, 1, PAL.indigo);
      ly += 5;
      text(g, `YOUR AMBITION: ${amb.name.toUpperCase()}`, x + 8, ly, PAL.gold);
      this.ui.hint('om-amb', x + 8, ly - 1, inner, 11 + ambLines.length * 10, { terms: [...termsIn(amb.desc, { max: 2 }), ...gloss('ambition', 'legacy')] });
      ly += 11;
      for (const l of ambLines) {
        text(g, l, x + 16, ly, PAL.mist);
        ly += 10;
      }
    }
    this.ui.button(g, 'omens-begin', x + w / 2 - 34, y + h - 17, 68, 13, 'BEGIN', () => this.close(), { primary: true });
  }

  // ---------------------------------------------------------------------
  // Log and confirm
  // ---------------------------------------------------------------------

  private logView(g: Ctx) {
    const W = this.hud.W;
    const H = this.hud.H;
    const w = Math.min(W - 12, 360);
    const h = Math.min(H - 12, 220);
    const { x, y } = this.frame(g, w, h, 'COMMS LOG');
    this.closeButton(g, x, y, w);
    // Every message in full, newest first, with the time it happened. The wheel scrolls.
    const top = y + 17;
    const ah = y + h - 6 - top;
    const tx = x + 34;
    const tw = w - 46;
    const blocks = [...this.hud.log].reverse().map((l) => ({ l, lines: wrap(l.text, tw, 'main') }));
    const total = blocks.reduce((a, b) => a + b.lines.length * 10 + 3, 0);
    this.logScrollMax = Math.max(0, total - ah);
    this.logScroll = Math.min(this.logScroll, this.logScrollMax);
    if (!blocks.length) text(g, 'Nothing has happened yet.', x + 8, top, PAL.dusk);
    g.save();
    g.beginPath();
    g.rect(x + 4, top - 1, w - 8, ah + 1);
    g.clip();
    let ly = top - this.logScroll;
    for (const { l, lines } of blocks) {
      const bh = lines.length * 10;
      if (ly + bh > top && ly < top + ah) {
        const col = { info: PAL.mist, good: PAL.teal, bad: PAL.red, alert: PAL.ember, event: PAL.violet }[l.kind];
        const jump = l.node !== undefined && l.node >= 0;
        const id = 'loglist-' + l.id;
        if (jump && this.ui.isHot(id)) rect(g, x + 6, ly - 1, w - 16, bh + 1, PAL.indigo);
        text(g, fmtTime(l.t), x + 8, ly + 1, PAL.slate, 'tiny');
        lines.forEach((t, k) => text(g, t, tx, ly + k * 10, col));
        if (jump) {
          const node = l.node!;
          const cy = Math.max(ly - 1, top);
          this.ui.hit(id, x + 6, cy, w - 16, Math.min(ly + bh, top + ah) - cy, () => {
            this.s.focusNode(node);
            this.close();
          }, `Click to look at ${this.g.nodes[node].name}.`);
        }
      }
      ly += bh + 3;
    }
    g.restore();
    if (this.logScrollMax > 0) {
      const sx = x + w - 5;
      const th = Math.max(8, Math.round((ah * ah) / total));
      rect(g, sx, top, 1, ah, PAL.indigo);
      rect(g, sx, top + Math.round(((ah - th) * this.logScroll) / this.logScrollMax), 1, th, PAL.dusk);
    }
  }

  private confirm(g: Ctx, msg: string, yes: string, onYes: () => void) {
    const w = 210;
    const lines = wrap(msg, w - 20, 'main');
    const h = 40 + lines.length * 10;
    const { x, y } = this.frame(g, w, h, 'ARE YOU SURE?', PAL.red);
    lines.forEach((l, i) => textCenter(g, l, x + w / 2, y + 18 + i * 10, PAL.mist));
    const by = y + h - 17;
    this.ui.button(g, 'cf-no', x + 10, by, 80, 13, 'CANCEL', () => this.close());
    this.ui.button(g, 'cf-yes', x + w - 90, by, 80, 13, yes, () => {
      this.s.modal = null;
      onYes();
    }, { danger: true });
  }
}
