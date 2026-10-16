/**
 * A tiny immediate-mode UI for the pixel canvas. Each frame the HUD draws widgets and registers their
 * rectangles; input is hit-tested against the rectangles from the previous frame.
 */
import { capHeight, fit, lineHeight, text, textCenter, textWidth, underlineMatches, wrap, type FontId } from '../render/font';
import { PAL, UI } from '../render/palette';
import { box, rect, type Ctx } from '../render/pixel';
import { drawRich, hasMarkup, richLines, richWidth } from '../render/rich';
import { icon } from '../render/sprites';
import { autoTerms, type GlossEntry } from './glossary';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a tooltip shows: text (effect markup is drawn in color), a colored title, glossary boxes. */
export interface TipOpts {
  tip?: string | (() => string);
  /** A colored first line for the tooltip (Boon and relic names). */
  tipTitle?: string;
  tipColor?: string;
  /** Glossary entries explained in boxes beside the tooltip. */
  terms?: GlossEntry[];
  /** Visible text the area covers: game terms in it are explained too. */
  scan?: string;
  /** Put the glossary boxes to the side of the area (it has lines above and below that must stay readable). */
  beside?: boolean;
}

/** A tip-only area: it shows a tooltip but never takes clicks from what lies beneath it. */
interface Hint extends TipOpts, Rect {
  key: string;
  /** Regions registered before it in its frame (it sits on top of those). */
  order: number;
}

/** Seconds the pointer must rest before a tooltip shows. */
const TIP_DELAY = 0.35;

export interface Region {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onClick?: () => void;
  onRight?: () => void;
  /** Tooltip text (or a function producing it). Effect markup is drawn in color. */
  tip?: string | (() => string);
  /** A colored first line for the tooltip (Boon and relic names). */
  tipTitle?: string;
  tipColor?: string;
  /** Glossary entries explained in boxes beside the tooltip. */
  terms?: GlossEntry[];
  /** Visible text the region covers: game terms in it are explained too. */
  scan?: string;
  /** Put the glossary boxes beside the region (cards) instead of under the pointer. */
  termsBeside?: boolean;
  disabled?: boolean;
  /** Swallows clicks without doing anything (panels). */
  block?: boolean;
  cursor?: string;
}

export interface ButtonOpts {
  tip?: string | (() => string);
  tipTitle?: string;
  tipColor?: string;
  terms?: GlossEntry[];
  scan?: string;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
  danger?: boolean;
  icon?: string;
  iconTint?: string;
  font?: FontId;
  /** Text color override. */
  color?: string;
  /** Extra right-aligned text (costs). */
  right?: string;
  rightColor?: string;
  onRight?: () => void;
  /** Draw a pulsing highlight (attention). */
  pulse?: boolean;
  align?: 'left' | 'center';
  /** Its frame (and its pulse) in this colour, not a primary button's gold: a house's countdown in that house's colour. */
  border?: string;
  /** Draws its words itself, in place of plain text: a house it names in that house's colour (ui/news.ts). */
  drawLabel?: (g: Ctx, s: string, x: number, y: number, color: string, font: FontId) => void;
}

export class Ui {
  regions: Region[] = [];
  private last: Region[] = [];
  mx = -1;
  my = -1;
  down = false;
  /** Region id under the pointer (from the last frame). */
  hot: string | null = null;
  /** Region id pressed with the left button. */
  active: string | null = null;
  time = 0;
  private hoverSince = 0;
  private hoverKey: string | null = null;
  private hints: Hint[] = [];
  private lastHints: Hint[] = [];
  /** The hint under the pointer (from the last frame), if it is on top. */
  private hintNow: Hint | null = null;
  /** Glossary ids shown last frame (for tests). */
  shownTerms: string[] = [];
  /** Explain game terms beside tooltips (a setting). */
  explainTerms = true;
  /** Called when a button is clicked (for the click sound). */
  onClickSound: ((disabled: boolean) => void) | null = null;

  /** Seconds since the last frame. */
  dt = 0;
  /** Regions from this one on, of the frame being drawn, are shown and take no click (`holdClicks`). */
  private holdFrom = Infinity;
  /** The same for the last completed frame, which is the one clicks are tested against. */
  private lastHoldFrom = Infinity;

  begin(dt: number) {
    this.dt = dt;
    this.time += dt;
    this.last = this.regions;
    this.regions = [];
    this.lastHoldFrom = this.holdFrom;
    this.holdFrom = Infinity;
    this.lastHints = this.hints;
    this.hints = [];
    const i = this.hitIndex(this.mx, this.my);
    // (A region that takes no click yet does not light up under the pointer either.)
    this.hot = i >= 0 && i < this.lastHoldFrom ? this.last[i].id : null;
    this.hintNow = this.hintAt(this.mx, this.my);
    const key = this.hintNow ? 'hint:' + this.hintNow.key : this.hot;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hoverSince = this.time;
    }
  }

  /** Is the pointer on this hint (and nothing drawn later covers it)? */
  isHinted(key: string): boolean {
    return this.hintNow?.key === key;
  }

  /** Seconds the pointer has rested on the current region or hint. */
  hoverAge(): number {
    return this.time - this.hoverSince;
  }

  /** A tip-only area on top of whatever was drawn before it: clicks pass through to that. */
  hint(key: string, x: number, y: number, w: number, h: number, o: TipOpts) {
    this.hints.push({ ...o, key, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), order: this.regions.length });
  }

  private hintAt(x: number, y: number): Hint | null {
    let top = -1;
    for (let i = this.last.length - 1; i >= 0; i--) {
      const r = this.last[i];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) {
        top = i;
        break;
      }
    }
    for (let i = this.lastHints.length - 1; i >= 0; i--) {
      const h = this.lastHints[i];
      if (h.order > top && x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) return h;
    }
    return null;
  }

  /** Top-most region under a point (from the last completed frame). */
  hitTest(x: number, y: number): Region | null {
    const i = this.hitIndex(x, y);
    return i >= 0 ? this.last[i] : null;
  }

  private hitIndex(x: number, y: number): number {
    for (let i = this.last.length - 1; i >= 0; i--) {
      const r = this.last[i];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return i;
    }
    return -1;
  }

  /**
   * Everything drawn from here to the end of this frame is shown and takes no click: a dialog that has
   * just opened by itself. A click on it goes nowhere (and not through to what lies under it).
   */
  holdClicks() {
    this.holdFrom = Math.min(this.holdFrom, this.regions.length);
  }

  /** Is a part of the screen taking no click right now? (For tests.) */
  holding(): boolean {
    return this.lastHoldFrom < this.last.length;
  }

  rectOf(id: string): Region | null {
    for (let i = this.last.length - 1; i >= 0; i--) if (this.last[i].id === id) return this.last[i];
    for (let i = this.regions.length - 1; i >= 0; i--) if (this.regions[i].id === id) return this.regions[i];
    return null;
  }

  add(r: Region): Region {
    this.regions.push(r);
    return r;
  }

  isHot(id: string): boolean {
    return this.hot === id;
  }

  isPressed(id: string): boolean {
    return this.active === id && this.hot === id && this.down;
  }

  /** Pointer pressed: returns true when the UI took it. */
  pointerDown(x: number, y: number, button: number): boolean {
    this.mx = x;
    this.my = y;
    const i = this.hitIndex(x, y);
    if (i < 0) return false;
    if (i >= this.lastHoldFrom) return true;
    const r = this.last[i];
    if (button === 0) {
      this.down = true;
      this.active = r.id;
    } else if (button === 2 && r.onRight && !r.disabled) {
      r.onRight();
    }
    return true;
  }

  /** Pointer released: fires the click when it ends on the pressed region. */
  pointerUp(x: number, y: number, button: number): boolean {
    this.mx = x;
    this.my = y;
    const wasActive = this.active;
    this.down = false;
    this.active = null;
    const i = this.hitIndex(x, y);
    // (Pressed before the dialog was there and let go on it: no click.)
    if (i >= this.lastHoldFrom) return true;
    if (button !== 0 || !wasActive) return i >= 0;
    const r = i >= 0 ? this.last[i] : null;
    if (r && r.id === wasActive) {
      if (r.onClick) {
        this.onClickSound?.(!!r.disabled);
        if (!r.disabled) r.onClick();
      }
      return true;
    }
    return !!r;
  }

  pointerMove(x: number, y: number) {
    this.mx = x;
    this.my = y;
  }

  // ---------------------------------------------------------------------
  // Widgets
  // ---------------------------------------------------------------------

  /** A notched panel that blocks clicks to the map underneath. */
  panel(g: Ctx, id: string, x: number, y: number, w: number, h: number, opts: { border?: string; fill?: string; title?: string; titleColor?: string } = {}) {
    x = Math.round(x);
    y = Math.round(y);
    box(g, x, y, w, h, opts.fill ?? UI.panel, opts.border ?? UI.border);
    rect(g, x + 2, y + 1, w - 4, 1, PAL.indigo);
    if (opts.title) {
      const tw = textWidth(opts.title, 'tiny');
      rect(g, x + 5, y - 3, tw + 6, 7, opts.fill ?? UI.panel);
      text(g, opts.title, x + 8, y - 2, opts.titleColor ?? UI.accent, 'tiny');
    }
    this.add({ id, x, y, w, h, block: true });
  }

  button(g: Ctx, id: string, x: number, y: number, w: number, h: number, label: string, onClick: () => void, o: ButtonOpts = {}) {
    x = Math.round(x);
    y = Math.round(y);
    const hot = this.isHot(id) && !o.disabled;
    const pressed = this.isPressed(id) && !o.disabled;
    const font = o.font ?? 'main';
    let fill: string = UI.panel;
    let border: string = UI.border;
    let fg: string = o.color ?? UI.text;
    if (o.primary) {
      fill = hot ? PAL.wine : PAL.night;
      border = PAL.gold;
      fg = o.color ?? PAL.gold;
    }
    if (o.danger) border = hot ? PAL.red : PAL.wine;
    if (o.selected) {
      fill = PAL.indigo;
      border = PAL.gold;
    }
    if (hot && !o.primary) {
      fill = PAL.indigo;
      border = o.danger ? PAL.red : PAL.dusk;
    }
    if (pressed) fill = PAL.void;
    if (o.border) border = o.border;
    if (o.disabled) {
      fill = PAL.night;
      border = PAL.indigo;
      fg = PAL.slate;
    }
    box(g, x, y, w, h, fill, border);
    if (o.pulse && !o.disabled && Math.floor(this.time * 3) % 2 === 0) box(g, x - 1, y - 1, w + 2, h + 2, null, o.border ?? PAL.gold);
    const off = pressed ? 1 : 0;
    const ch = capHeight(font);
    const ty = y + Math.floor((h - ch) / 2) + off;
    let tx = x + 4 + off;
    if (o.icon) {
      icon(g, o.icon, tx, y + Math.floor((h - 7) / 2) + off, o.iconTint, !!o.iconTint);
      tx += 8;
    }
    const rightW = o.right ? textWidth(o.right, font) + 4 : 0;
    const centered = (o.align ?? (o.icon ? 'left' : 'center')) === 'center' && !o.icon && !o.right;
    const avail = centered ? w - 4 : w - (tx - x) - 4 - rightW;
    const shown = fit(label, avail, font);
    if (o.drawLabel) o.drawLabel(g, shown, centered ? Math.round(x + w / 2 + off - textWidth(shown, font) / 2) : tx, ty, fg, font);
    else if (centered) textCenter(g, shown, x + w / 2 + off, ty, fg, font);
    else text(g, shown, tx, ty, fg, font);
    if (o.right) text(g, o.right, x + w - rightW + off, ty, o.disabled ? PAL.slate : (o.rightColor ?? UI.accent), font);
    this.add({ id, x, y, w, h, onClick, onRight: o.onRight, tip: o.tip, tipTitle: o.tipTitle, tipColor: o.tipColor, terms: o.terms, scan: o.scan, disabled: o.disabled });
  }

  /** A small square icon button. */
  iconButton(g: Ctx, id: string, x: number, y: number, size: number, iconName: string, onClick: () => void, o: ButtonOpts = {}) {
    x = Math.round(x);
    y = Math.round(y);
    const hot = this.isHot(id) && !o.disabled;
    const pressed = this.isPressed(id) && !o.disabled;
    box(g, x, y, size, size, pressed ? PAL.void : o.selected ? PAL.indigo : hot ? PAL.indigo : UI.panel, o.selected ? PAL.gold : hot ? PAL.dusk : o.disabled ? PAL.indigo : UI.border);
    if (o.pulse && Math.floor(this.time * 3) % 2 === 0) box(g, x - 1, y - 1, size + 2, size + 2, null, PAL.gold);
    const off = pressed ? 1 : 0;
    icon(g, iconName, x + Math.floor((size - 5) / 2) + off, y + Math.floor((size - 7) / 2) + off, o.disabled ? PAL.slate : o.iconTint, !!o.disabled || !!o.iconTint);
    this.add({ id, x, y, w: size, h: size, onClick, tip: o.tip, tipTitle: o.tipTitle, tipColor: o.tipColor, terms: o.terms, scan: o.scan, disabled: o.disabled });
  }

  /** A clickable area with no drawing of its own (map badges, cards). */
  hit(id: string, x: number, y: number, w: number, h: number, onClick?: () => void, tip?: string | (() => string), onRight?: () => void, o: TipOpts = {}) {
    this.add({ ...o, id, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), onClick, tip: tip ?? o.tip, onRight });
  }

  /** Horizontal slider 0..1. */
  slider(g: Ctx, id: string, x: number, y: number, w: number, value: number, onChange: (v: number) => void) {
    x = Math.round(x);
    y = Math.round(y);
    rect(g, x, y + 3, w, 1, PAL.slate);
    const k = Math.round(Math.max(0, Math.min(1, value)) * (w - 1));
    rect(g, x, y + 3, k, 1, PAL.gold);
    box(g, x + k - 2, y, 5, 7, this.isHot(id) ? PAL.gold : PAL.mist, PAL.bone);
    this.add({
      id, x: x - 3, y: y - 2, w: w + 6, h: 11,
      onClick: () => onChange(Math.max(0, Math.min(1, (this.mx - x) / (w - 1)))),
    });
    if (this.active === id && this.down) onChange(Math.max(0, Math.min(1, (this.mx - x) / (w - 1))));
  }

  /**
   * The glossary terms explained for an area: the hand-picked ones, then any others its tooltip or its
   * own text mention. Text on screen marks exactly these words (`marksOf`), so that every marked word
   * has its box and every box its mark.
   */
  termsFor(src: TipOpts): GlossEntry[] {
    if (!this.explainTerms) return [];
    const tip = typeof src.tip === 'function' ? src.tip() : src.tip;
    const given = src.terms ?? [];
    const words = [tip, src.scan].filter(Boolean).join(' ');
    const extra = words ? autoTerms(words, { title: src.tipTitle, skip: new Set(given.map((t) => t.id)), max: 2 }) : [];
    return [...given, ...extra].slice(0, Math.max(given.length, 3));
  }

  /** Tooltip (and glossary boxes) for the hint or region under the pointer, after a short delay. */
  drawTooltip(g: Ctx, W: number, H: number) {
    this.shownTerms = [];
    if (this.down || this.time - this.hoverSince < TIP_DELAY) return;
    const hint = this.hintNow;
    const region = hint ? null : this.hot ? this.hitTest(this.mx, this.my) : null;
    const src: TipOpts | null = hint ?? region;
    if (!src) return;
    const tip = typeof src.tip === 'function' ? src.tip() : src.tip;
    const terms = this.termsFor(src);
    if (!tip && !terms.length) return;
    // (The words of the tooltip that the boxes beside it explain are marked, as in the menus.)
    const at: Rect | null = tip ? tooltip(g, tip, this.mx, this.my, W, H, 170, src.tipTitle, src.tipColor, marksOf(terms)) : null;
    if (!terms.length) return;
    if (region?.termsBeside || (hint && src.beside)) glossaryBoxes(g, terms, hint ?? region!, W, H, ['right', 'left', 'below', 'above']);
    else if (at) glossaryBoxes(g, terms, at, W, H, ['below', 'right', 'left', 'above']);
    // No tooltip text: the area is text on screen, so explain beneath it and leave it readable.
    else glossaryBoxes(g, terms, hint ?? region!, W, H, ['below', 'above', 'right', 'left']);
    this.shownTerms = terms.map((t) => t.id);
  }
}

type Side = 'right' | 'left' | 'below' | 'above';

/** Boxes explaining glossary terms, stacked beside an anchor rectangle (the first side that fits). */
export function glossaryBoxes(g: Ctx, entries: GlossEntry[], a: Rect, W: number, H: number, sides: Side[]) {
  if (!entries.length) return;
  const bw = Math.min(150, Math.floor(W / 3));
  const inner = bw - 8;
  const hs = entries.map((e) => 15 + richLines(e.text, inner) * 10);
  const total = hs.reduce((s, h) => s + h, 0) + (entries.length - 1) * 2;
  const clampX = (x: number) => Math.max(2, Math.min(W - 2 - bw, x));
  const clampY = (y: number) => Math.max(2, Math.min(H - 2 - total, y));
  let pos: { x: number; y: number } | null = null;
  for (const side of sides) {
    if (side === 'right' && a.x + a.w + 2 + bw <= W - 2) pos = { x: a.x + a.w + 2, y: clampY(a.y) };
    else if (side === 'left' && a.x - 2 - bw >= 2) pos = { x: a.x - 2 - bw, y: clampY(a.y) };
    else if (side === 'below' && a.y + a.h + 2 + total <= H - 2) pos = { x: clampX(a.x), y: a.y + a.h + 2 };
    else if (side === 'above' && a.y - 2 - total >= 2) pos = { x: clampX(a.x), y: a.y - 2 - total };
    if (pos) break;
  }
  pos ??= { x: a.x + a.w + 2 + bw <= W - 2 ? a.x + a.w + 2 : clampX(a.x - 2 - bw), y: clampY(a.y) };
  let y = pos.y;
  entries.forEach((e, i) => {
    box(g, pos.x, y, bw, hs[i], PAL.night, PAL.slate);
    text(g, e.name, pos.x + 4, y + 3, PAL.gold);
    drawRich(g, e.text, pos.x + 4, y + 13, inner, { body: PAL.mist });
    y += hs[i] + 2;
  });
}

/** Draw a tooltip box near a point, kept on screen; returns where it went. Effect markup is drawn in color. */
/** The patterns that find these terms in a text, for marking them where they are mentioned. */
export const marksOf = (terms: GlossEntry[]): RegExp[] => terms.map((t) => t.re);
/** The color of the dotted line under a word that has an explanation. */
export const MARK = PAL.dusk;

export function tooltip(g: Ctx, tip: string, mx: number, my: number, W: number, H: number, maxW = 170, title?: string, titleColor?: string, marks: RegExp[] = []): Rect {
  const lh = lineHeight('main');
  const rich = hasMarkup(tip);
  const lines = rich ? [] : wrap(tip, maxW, 'main');
  const n = rich ? richLines(tip, maxW) : lines.length;
  const bodyW = rich ? richWidth(tip, maxW) : Math.max(0, ...lines.map((l) => textWidth(l, 'main')));
  const shownTitle = title ? fit(title, maxW, 'main') : '';
  const w = Math.min(maxW, Math.max(bodyW, title ? textWidth(shownTitle, 'main') : 0)) + 8;
  const h = (n + (title ? 1 : 0)) * lh + 5 + (title ? 2 : 0);
  let x = Math.round(mx + 8);
  let y = Math.round(my + 10);
  if (x + w > W - 2) x = Math.round(mx - w - 4);
  if (y + h > H - 2) y = Math.round(my - h - 4);
  x = Math.max(2, x);
  y = Math.max(2, y);
  box(g, x, y, w, h, PAL.void, titleColor ?? PAL.dusk);
  let ty = y + 3;
  if (title) {
    text(g, shownTitle, x + 4, ty, titleColor ?? PAL.gold, 'main');
    ty += lh + 2;
  }
  if (rich) drawRich(g, tip, x + 4, ty, maxW, { body: PAL.bone }, 'main', 99, marks, MARK);
  else
    lines.forEach((l, i) => {
      text(g, l, x + 4, ty + i * lh, PAL.bone, 'main');
      underlineMatches(g, l, x + 4, ty + i * lh, marks, MARK);
    });
  return { x, y, w, h };
}

/**
 * Darken everything behind a modal, from `top` down (the top bar with Embers and Lore stays bright).
 * A flat shade rather than a dither: a dither knocks out every other pixel of the 1-pixel-wide font
 * and scrambles the text behind the dialog.
 */
export function dimScreen(g: Ctx, W: number, H: number, top = 0, alpha = 0.7) {
  g.fillStyle = `rgba(11, 10, 26, ${alpha})`;
  g.fillRect(0, top, W, H - top);
}
