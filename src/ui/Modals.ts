/**
 * The dialogs of a run, drawn on the game's canvas over the HUD. One is open at a time (`Session.modal`).
 *
 * This class opens and closes them, routes their keys, draws the frame they share, and holds a dialog
 * back for a moment when it opened by itself (`guarded`). What each dialog shows is a function in modals/:
 *
 *   modals/draft.ts    the Boon draft
 *   modals/event.ts    an event's choices and its outcome; the ability a ship learns
 *   modals/status.ts   Status: Destinies, Boons, rivals, the run (or the climb of the ages)
 *   modals/book.ts     the run's menu, settings, How to Play, the comms log, "are you sure?"
 *   modals/cards.ts    the cards a run shows once (omens, the Destinies, the end of the First Night, the cradle, the Ark's leaving)
 */
import type { Modal } from '../app/Session';
import type { OfferOdds } from '../game/boons';
import { textCenter } from '../render/font';
import { PAL } from '../render/palette';
import { rect, type Ctx } from '../render/pixel';
import type { Hud } from './Hud';
import { choose, draft, skipDeal } from './modals/draft';
import type { Deal } from './modals/reveal';
import { ability, event, resolve, skipEvent } from './modals/event';
import { status } from './modals/status';
import { confirm, help, logView, menu, settings } from './modals/book';
import { ascendCard, cradleCard, destinies, nightDone, omens } from './modals/cards';

export type StatusTab = 'destinies' | 'boons' | 'rivals' | 'run';
export type HelpTab = 'basics' | 'controls' | 'tips';

/**
 * Seconds a dialog that opened by itself takes no click and no key. A random event comes up in the
 * middle of play, on top of whatever the player was about to click: twice in one evening a playtester's
 * click, already on its way to the map, chose an option of an event he had not seen yet. A second is
 * longer than a click takes to land and shorter than the dialog takes to read; the game stands still
 * behind it, so it costs nothing.
 */
export const DIALOG_GUARD = 1;
/**
 * And after a choice, seconds before what the same dialog shows next (an event's outcome, the next
 * ability, the next Boon) takes one: a double click chooses once.
 */
export const CHOICE_GUARD = 0.5;

export class Modals {
  /** The dialog on the screen, and from when until when it takes no input. */
  private shown: Modal | null = null;
  private guardFrom = 0;
  private guardUntil = 0;
  /** Where the dialog's frame is this frame (the guard draws its bar there). */
  private box: { x: number; y: number; w: number; color: string } | null = null;
  result: { promptId: number; text: string } | null = null;
  /** The decision (or its outcome) coming in: which, since when, how many of its words the last frame showed, whether all of it is there (modals/event.ts). */
  evKey = '';
  evAt = 0;
  evPrev = -1;
  evDone = true;
  statusTab: StatusTab = 'destinies';
  helpTab: HelpTab = 'basics';
  /** Scroll offset of the Boons list (pixels). */
  boonScroll = 0;
  boonScrollMax = 0;
  /** The odds of the next Boon choice, as last worked out (modals/status.ts): they are worked out again when the run has moved on. */
  oddsMemo: { key: string; odds: OfferOdds } | null = null;
  /** The offer being shown and when it was dealt: its places appear, then its cards are beamed in one by one (modals/reveal.ts). */
  dealt: string[] | null = null;
  dealtAt = 0;
  /** The deal of that offer, the tiers of its cards, how far into it the last frame was, and whether all are shown. */
  dealPlan: Deal | null = null;
  dealTiers: number[] = [];
  dealPrev = -1;
  dealDone = true;
  /** The card under the pointer (its id and place) and since when: it grows in steps. */
  hoverCard = '';
  hoverAt = 0;
  helpScroll = 0;
  helpScrollMax = 0;
  logScroll = 0;
  logScrollMax = 0;

  constructor(public hud: Hud) {}

  get s() {
    return this.hud.s;
  }

  get g() {
    return this.hud.s.game;
  }

  get ui() {
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

  /**
   * Is the dialog taking no input yet? One that opened by itself, for its first moment (`DIALOG_GUARD`);
   * any dialog, for a moment after a choice was made in it (`CHOICE_GUARD`).
   */
  guarded(): boolean {
    const m = this.s.modal;
    if (!m) return false;
    // (Not drawn yet: a key can come before its first frame.)
    if (m !== this.shown) return !!m.unbidden;
    return this.ui.time < this.guardUntil;
  }

  /** Are the cards of a Boon draft, or a decision, still coming in? (Not drawn yet: they are about to.) */
  revealing(): boolean {
    const m = this.s.modal;
    if (m?.kind === 'event') return m !== this.shown || !this.evDone;
    return m?.kind === 'draft' && (m !== this.shown || !this.dealDone || this.dealt !== this.g.player.draftOffer);
  }

  /** A choice was made and the dialog stays: what it shows next waits a moment before it takes one. */
  afterChoice() {
    if (!this.s.modal) return;
    this.guardFrom = this.ui.time;
    this.guardUntil = this.ui.time + CHOICE_GUARD;
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
    if (this.guarded()) return true;
    if (m.kind === 'draft') {
      const n = parseInt(code.replace('Digit', ''), 10);
      const offer = this.g.ensureOffer(this.g.player);
      if (offer && n >= 1 && n <= offer.length) {
        // (While the cards are coming, a key brings them all; it takes none unseen.)
        if (this.revealing()) skipDeal(this);
        else choose(this, offer[n - 1], n - 1);
        return true;
      }
    }
    // (While a decision is coming in, a number, Space or Enter brings all of it; it answers nothing unseen.)
    if (m.kind === 'event' && this.revealing() && (/^Digit\d$/.test(code) || code === 'Space' || code === 'Enter')) {
      skipEvent(this);
      return true;
    }
    if (m.kind === 'event' && !this.result) {
      const n = parseInt(code.replace('Digit', ''), 10);
      if (n >= 1) {
        resolve(this, m.promptId, n - 1);
        return true;
      }
    }
    return false;
  }

  draw(g: Ctx) {
    const m = this.s.modal!;
    if (m !== this.shown) {
      this.shown = m;
      this.guardFrom = this.ui.time;
      this.guardUntil = m.unbidden ? this.ui.time + DIALOG_GUARD : 0;
    }
    const held = this.ui.time < this.guardUntil;
    if (held) this.ui.holdClicks();
    this.box = null;
    this.drawKind(g, m);
    // While it takes no input, a line runs out under its title: the dialog is there to be read, and
    // says for how long it will not be clicked.
    const b = this.box as { x: number; y: number; w: number; color: string } | null;
    if (held && b && this.s.modal === m) {
      const left = (this.guardUntil - this.ui.time) / Math.max(0.01, this.guardUntil - this.guardFrom);
      rect(g, b.x + 2, b.y + 13, Math.round((b.w - 4) * Math.max(0, Math.min(1, left))), 1, b.color);
    }
  }

  private drawKind(g: Ctx, m: Modal) {
    switch (m.kind) {
      case 'draft':
        return draft(this, g);
      case 'event':
        return event(this, g, m.promptId);
      case 'ability':
        return ability(this, g, m.unitId);
      case 'status':
        return status(this, g);
      case 'menu':
        return menu(this, g);
      case 'settings':
        return settings(this, g);
      case 'help':
        return help(this, g);
      case 'destinies':
        return destinies(this, g);
      case 'nightDone':
        return nightDone(this, g);
      case 'omens':
        return omens(this, g);
      case 'cradle':
        return cradleCard(this, g);
      case 'ascend':
        return ascendCard(this, g);
      case 'log':
        return logView(this, g);
      case 'confirm':
        return confirm(this, g, m.text, m.yes, m.onYes);
    }
  }

  frame(g: Ctx, w: number, h: number, title: string, color: string = PAL.gold): { x: number; y: number } {
    const W = this.hud.W;
    const H = this.hud.H;
    w = Math.min(w, W - 8);
    h = Math.min(h, H - 8);
    const x = Math.round(W / 2 - w / 2);
    const y = Math.round(H / 2 - h / 2);
    this.ui.add({ id: 'modal-back', x: 0, y: 0, w: W, h: H, onClick: () => this.closable() && this.close() });
    this.ui.panel(g, 'modal', x, y, w, h, { border: color === PAL.gold ? PAL.ember : PAL.slate });
    this.box = { x, y, w, color };
    rect(g, x + 2, y + 2, w - 4, 11, PAL.indigo);
    textCenter(g, title, x + w / 2, y + 4, color);
    return { x, y };
  }

  closeButton(g: Ctx, x: number, y: number, w: number) {
    this.ui.button(g, 'modal-close', x + w - 13, y + 2, 11, 11, '×', () => this.close(), { tip: 'Close (Esc)' });
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
}
