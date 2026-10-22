/**
 * The top bar: Embers and what they earn, Lore and the Boon it is filling, the hangar, the Forges with
 * nothing to build, the clock and the speeds. Under it, the one line that says what to do next; and at
 * the foot of the screen, that the game is paused.
 */

import { SPEEDS, type Session } from '../../app/Session';
import { UNITS } from '../../game/data/units';
import { ECON } from '../../game/data/worlds';
import { capHeight, IC, tabularWidth, text, textCenter, textOutline, textTabular, textWidth, underlineMatches, wrap } from '../../render/font';
import { PAL } from '../../render/palette';
import { bar, box, rect } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { drawRich, hasMarkup, richLines, richWidth } from '../../render/rich';
import { icon, setInlineBadgeLabel } from '../../render/sprites';
import { fmt, fmtRate } from '../format';
import { termsIn } from '../glossary';
import { MARK, marksOf } from '../Ui';
import { drawAge } from './destinies';
import { rollEmbers } from './emberCount';
import { fleetLabel } from './overlays';
import type { Hud } from '../Hud';
import { boonReady, watchBoons } from './touches';
import { aimLine } from './power';
import { netBanner } from './together';
import { NET_SPEEDS } from '../../net/protocol';

/** The widest of the ten digits (the game's font is not monospaced: a 1 is narrower than an 8). */
export let widest = '';

/**
 * The room a number takes in the top bar: as wide as it would be with its widest digits, and never
 * narrower than `least`. What stands after it then keeps its place while the number counts.
 */
export function numberRoom(s: string, least: string): number {
  if (!widest) widest = [...'0123456789'].reduce((a, d) => (textWidth(d) > textWidth(a) ? d : a));
  const room = (t: string) => textWidth(t.replace(/\d/g, widest));
  return Math.max(room(s), room(least));
}

/** Seconds the idle-Forge button flashes when one more Forge has run out of work. */
export const IDLE_FLASH = 3;

export function drawPaused(hud: Hud) {
  const g = hud.s.screen.g;
  const t = 'PAUSED · SPACE TO RESUME';
  const w = textWidth(t, 'tiny') + 10;
  let x = Math.round(hud.W / 2 - w / 2);
  if (hud.cardRect.w > 0 && x < hud.cardRect.x + hud.cardRect.w + 4) x = hud.cardRect.x + hud.cardRect.w + 6;
  // Step aside for the comms log too.
  if (hud.logRight > 0 && hud.logBottom >= hud.H - 14 && x < hud.logRight + 4) x = hud.logRight + 6;
  const right = hud.minimapRect.w > 0 ? hud.minimapRect.x - 4 : hud.W - 3;
  if (x + w > right) x = Math.max(3, right - w);
  const y = hud.H - 13;
  box(g, x, y, w, 9, PAL.night, PAL.gold);
  text(g, t, x + 5, y + 2, PAL.gold, 'tiny');
}

export function drawTopBar(hud: Hud, R: ReturnType<Session['reveal']>) {
  const g = hud.s.screen.g;
  const W = hud.W;
  hud.barTips = [];
  rect(g, 0, 0, W, 13, PAL.night);
  rect(g, 0, 13, W, 1, PAL.indigo);
  hud.ui.add({ id: 'topbar', x: 0, y: 0, w: W, h: 14, block: true });
  let x = barEmbers(hud);
  x = barLore(hud, R, x);
  x = barHangar(hud, R, x);
  barIdleForges(hud, R, x);
  barControls(hud);
}

/** Embers and what they earn a second. Returns where the next thing in the bar begins. */
function barEmbers(hud: Hud): number {
  const g = hud.s.screen.g;
  const p = hud.g.player;
  // Embers: the count rolls toward the real value, and lump gains or spends pop below it. A lump that
  // comes in also turns the count white for a moment (`rollEmbers`: never an income, which made it flicker).
  // (Embers still flying to the count, a goal's reward, are taken in when they land: hud.embersAway.)
  const delta = rollEmbers(hud, Math.max(0, p.embers - hud.embersAway), hud.ui.dt);
  if (delta) hud.emberPops.push({ text: (delta > 0 ? '+' : '-') + fmt(Math.abs(delta)), color: delta > 0 ? PAL.gold : PAL.ember, t: 0 });
  if (hud.emberPops.length > 4) hud.emberPops.shift();
  icon(g, 'ember', 3, 3);
  // The count and its rate in tabular figures (every digit as wide as the widest): while the count has
  // as many digits, neither it nor the rate after it moves as it rolls. What stands after them has a
  // place of its own, as far on as their widest figures could reach, and keeps it. (In the font's own
  // figures a 1 is narrower than an 8: the rate, the Lore bar and the buttons beside it shifted a
  // pixel or two and back every few seconds.)
  const count = fmt(hud.embersShown);
  const rate = fmtRate(p.income);
  textTabular(g, rate, textTabular(g, count, 10, 3, hud.emberFlash > 0 ? PAL.bone : PAL.gold) + 3, 3, PAL.ember);
  let x = 10 + numberRoom(count, '8,888') + 3 + numberRoom(rate, '+88.8');
  let py = 15;
  for (const pop of hud.emberPops) {
    pop.t += hud.ui.dt;
    if (pop.t > 1.4) continue;
    const yy = Math.round(py + pop.t * 6);
    if (pop.t < 1.1 || Math.floor(pop.t * 12) % 2 === 0) textOutline(g, pop.text, 10, yy, pop.color, PAL.void, 'tiny');
    py += 7;
  }
  hud.emberPops = hud.emberPops.filter((pop) => pop.t <= 1.4);
  barTip(hud, 'embers', 1, 0, x + 1, 13, () => `Embers: your only currency. You earn ${fmtRate(p.income)} every second from your worlds. Spend ` +
      `them on ships, kindling and world upgrades.`);
  x += 8;
  return x;
}

/**
 * Lore: the bar that fills toward the next Boon, or the button of a Boon that waits (on the cradle, the
 * age). Returns where the next thing begins.
 */
function barLore(hud: Hud, R: ReturnType<Session['reveal']>, x: number): number {
  const g = hud.s.screen.g;
  const p = hud.g.player;
  watchBoons(hud);
  // Lore
  if (R.lore && hud.g.cradle) x = drawAge(hud, x);
  else if (R.lore) {
    icon(g, 'lore', x, 3);
    x += 7;
    const cost = hud.g.boonCostOf(p);
    if (p.pendingDrafts > 0) {
      const label = p.pendingDrafts > 1 ? `BOON ×${p.pendingDrafts}` : 'BOON';
      hud.ui.button(g, 'boon', x, 1, textWidth(label, 'tiny') + 12, 11, label, () => hud.modals.open({ kind: 'draft' }), {
        primary: true, pulse: true, font: 'tiny', tip: () => `A Boon is ready. Choose one of a few upgrades for your house. (B)\n${nextBoonText(hud)}`,
      });
      hud.barTips.push({ id: 'boon', x, y: 1, w: textWidth(label, 'tiny') + 12, h: 11, tip: () => `${p.pendingDrafts > 1 ? `${p.pendingDrafts} Boons are` : 'A Boon is'}` +
          ` waiting. ${nextBoonText(hud)}` });
      boonReady(hud, x, 1, textWidth(label, 'tiny') + 12, 11);
      x += textWidth(label, 'tiny') + 15;
    } else {
      bar(g, x + 1, 5, 36, 3, p.lore / cost, PAL.violet, PAL.indigo, PAL.indigo);
      barTip(hud, 'lore', x - 8, 0, 48, 13, () => `Lore: ${Math.floor(p.lore)} / ${cost}. Every time it fills you choose a Boon. Observatories ` +
          `make Lore faster. (+${p.loreRate.toFixed(2)}/s)\n${nextBoonText(hud)}`);
      x += 42;
    }
  }
  return x;
}

/** The hangar: how much of it is used. Returns where the next thing in the bar begins. */
function barHangar(hud: Hud, R: ReturnType<Session['reveal']>, x: number): number {
  const g = hud.s.screen.g;
  const p = hud.g.player;
  // Hangar: always there (it showed only near the limit, and until then a player had to guess at the
  // room that was left). Quiet while there is room, bright as it runs out, red when full; in figures of
  // one width, with room for as many digits as the limit has, so what follows keeps its place.
  if (R.fleet && p.hangarCap > 0) {
    x += 2;
    const full = p.hangarUsed >= p.hangarCap;
    const near = p.hangarUsed >= p.hangarCap - 3 || p.hangarUsed / p.hangarCap >= 0.8;
    const color = full ? PAL.red : near ? PAL.bone : PAL.dusk;
    icon(g, hud.g.cradle ? 'supply' : 'hangar', x, hud.g.cradle ? 4 : 3, near ? undefined : PAL.dusk, !near);
    const figures = `${p.hangarUsed}/${p.hangarCap}`;
    textTabular(g, figures, x + 7, 3, color);
    const ex = x + 7 + numberRoom(figures, `${p.hangarCap}/${p.hangarCap}`);
    barTip(hud, 'hangar', x - 1, 0, ex - x + 2, 13, () => `Hangar: ${p.hangarUsed} of ${p.hangarCap} used` +
        `${full ? ', and full: you cannot build' : `, room for ${p.hangarCap - p.hangarUsed} more`}. Every world you hold adds room, and ` +
        `higher-level worlds add more. Hangar Bays at your Hearth add more.`);
    x = ex + 6;
  }
  return x;
}

/** The Forges with nothing to build: a button that counts them and goes to the next. */
function barIdleForges(hud: Hud, R: ReturnType<Session['reveal']>, x: number) {
  const g = hud.s.screen.g;
  // Forges that build nothing: how many, and a click (or Tab) to go to the next of them. A button and
  // not a figure (as a bare number beside an anvil it read as one more rate, like the Embers'), and it
  // flashes for a few seconds whenever a Forge has just run out of work: something to see to.
  const idle = R.fleet && !hud.g.outcome ? hud.actions.forges().filter((n) => n.shipQ.length === 0).length : 0;
  if (idle > hud.idleShown) hud.idleFlashAt = hud.clock;
  hud.idleShown = idle;
  if (idle > 0) {
    const label = `${idle} IDLE`;
    const bw = textWidth(label, 'tiny') + 19;
    x += 2;
    hud.ui.button(g, 'idle-forges', x, 1, bw, 11, label, () => hud.actions.nextForge(1), {
      icon: 'forge', font: 'tiny', color: PAL.ember,
      tip: `${idle === 1 ? 'One of your Forges is' : `${idle} of your Forges are`} building nothing (your Hearth counts as one). Click, or press ` +
          `Tab, to go to the next: Q W E R T Y build there.`,
    });
    // (Flashing: the button turns to fire and back, a few times a second.)
    if (hud.clock - hud.idleFlashAt < IDLE_FLASH && Math.floor(hud.clock * 5) % 2 === 0) {
      box(g, x, 1, bw, 11, PAL.ember, PAL.gold);
      icon(g, 'forge', x + 4, 3, PAL.void, true);
      text(g, label, x + 12, 1 + Math.floor((11 - capHeight('tiny')) / 2), PAL.void, 'tiny');
    }
    x += bw + 4;
  }
}

/** At the right: the clock, pause, the speeds, the menu. */
function barControls(hud: Hud) {
  const g = hud.s.screen.g;
  const W = hud.W;
  const net = hud.s.net;
  // Right side: menu, speeds, pause, clock.
  let rx = W - 2;
  rx -= 11;
  hud.ui.iconButton(g, 'menu', rx, 1, 11, 'menu', () => hud.modals.open({ kind: 'menu' }), { tip: 'Menu (Esc)' });
  // (Together: the room's speeds; the host sets them in co-op, the lobby for the whole of a versus game.)
  const speeds = net ? NET_SPEEDS : SPEEDS;
  const why = !net ? null : hud.g.config.together === 'versus' ? 'The speed of a versus game is set in its lobby, for the whole game.' : net.host ? null : 'The room\'s host sets the speed.';
  for (let i = speeds.length - 1; i >= 0; i--) {
    const sp = speeds[i];
    const label = sp === 0.5 ? '½' : String(sp);
    rx -= 10;
    const sel = hud.s.speed === sp;
    hud.ui.button(g, 'speed' + i, rx, 1, 10, 11, label, () => {
      hud.s.speed = sp;
      if (!net) hud.s.paused = false;
    }, {
      selected: sel, font: 'main', disabled: !!why && !sel, color: sel ? PAL.gold : PAL.mist,
      tip: why ? `${why} Now ${hud.s.speed}×.` : sp === 0.5 ? 'Slow speed (½×)' : `Speed ${sp}× (${['', 'normal', 'fast', 'fastest'][sp] ?? ''})${net ? ' for everyone' : ''}`,
    });
  }
  rx -= 12;
  hud.ui.iconButton(g, 'pause', rx, 1, 11, hud.s.paused ? 'play' : 'pause', () => {
    hud.s.paused = !hud.s.paused;
  }, { tip: hud.s.paused ? (net ? 'Go on, for everyone (Space)' : 'Resume (Space)') : net ? 'Pause, for everyone (Space)' : 'Pause (Space)', selected: hud.s.paused, pulse: hud.s.paused });
  // (The clock in tabular figures too: right-aligned, it shook as each second changed its width.)
  const clock = fmtTime(hud.g.time);
  rx -= tabularWidth(clock) + 5;
  textTabular(g, clock, rx, 3, PAL.bone);
  hud.ui.hit('clock', rx - 2, 0, tabularWidth(clock) + 4, 13, undefined, () =>
    hud.g.time < ECON.wallsTime ? `Time in this run. Every Hearth's walls reach full strength at ${fmtTime(ECON.wallsTime)}.` : 'Time in this run.');
}

/** The banner line. `badge` is the number on a fleet badge in its text (the fleet it means). */
export function objective(hud: Hud): { text: string; color: string; badge?: string; sub?: string } | null {
  const s = hud.s;
  const g = hud.g;
  if (g.outcome) return null;
  const tut = hud.tutorial.banner();
  if (tut) return tut;
  // (A game together: what the room has to say comes first.)
  const net = netBanner(hud);
  if (net) return net;
  if (s.toast) return { text: s.toast.text, color: s.toast.color, sub: s.toast.sub };
  // (The House Power aimed: what it would do, and how to cast it or put it away.)
  const aim = aimLine(hud);
  if (aim) return aim;
  const p = g.player;
  if (g.promptsFor(g.playerId).some((x) => x.result === undefined)) return { text: 'Something needs your decision. Click the ! on the right.', color: PAL.violet };
  if (p.pendingDrafts > 0) return { text: 'A Boon is ready: press B to choose it.', color: PAL.gold };
  const seed = seedHint(hud);
  if (seed) return { text: seed, color: PAL.gold };
  const scout = scoutHint(hud);
  if (scout) return { ...scout, color: PAL.sky };
  return null;
}

/** A seed ship with nothing to do (its kindling was called off, or its world was taken): what to do with it. */
function seedHint(hud: Hud): string | null {
  const g = hud.g;
  const seed = g.idleSeed(g.playerId);
  if (!seed || seed.lane || seed.path.length || seed.node < 0) return null;
  return `A seed ship waits at ${g.nodes[seed.node].name}. Click a grey world, then KINDLE: it is free.`;
}

/** Early in a run, until a Scout has been sent exploring: how to send one. */
function scoutHint(hud: Hud): { text: string; badge: string } | null {
  const g = hud.g;
  const p = g.player;
  if (g.ui.scouted || g.time > 300 || !hud.s.reveal().fleet || !g.hasUncharted(p)) return null;
  const scouts = g.unitList.filter((u) => !u.dead && u.owner === p.id && UNITS[u.type].role === 'scout');
  // Nothing to say once a Scout is out exploring (or none is left).
  if (!scouts.length || scouts.some((u) => u.order === 'explore')) return null;
  const scout = scouts[0];
  if (hud.s.ownSelected().some((u) => UNITS[u.type].role === 'scout')) return { text: `Press EXPLORE (or E): your Scout ${IC.scout} will chart the dark by itself.`, badge: '' };
  return { text: `Your Scout ${IC.scout} waits for orders. Click its fleet badge ${IC.fleet}, then EXPLORE.`, badge: fleetLabel(hud, scout.lane ? -1 : scout.node) };
}

/** Is this place on screen, near enough for its ships to be seen? */
export function watching(hud: Hud, node: number): boolean {
  if (node < 0) return false;
  const sc = hud.nodeScreen(node);
  return hud.s.renderer.cam.zoom >= 0.1 && sc.x > 0 && sc.x < hud.W && sc.y > 16 && sc.y < hud.H;
}

/** A tooltip of the top bar: one to point at now, and one to read again while a dialog is open. */
function barTip(hud: Hud, id: string, x: number, y: number, w: number, h: number, tip: string | (() => string)) {
  hud.ui.hit(id, x, y, w, h, undefined, tip);
  hud.barTips.push({ id, x, y, w, h, tip });
}

/** "The next Boon: 120 of 450 Lore, in about 2:40 at this rate." */
function nextBoonText(hud: Hud): string {
  const p = hud.g.player;
  const cost = hud.g.boonCostOf(p);
  const left = Math.max(0, cost - p.lore);
  const eta = p.loreRate > 0 ? ` in about ${fmtTime(left / p.loreRate)} at this rate` : '';
  return `The next Boon: ${Math.floor(Math.min(p.lore, cost))} of ${cost} Lore${eta}.`;
}

export function drawBanner(hud: Hud) {
  hud.bannerRect = { x: 0, y: 0, w: 0, h: 0 };
  const o = objective(hud);
  if (!o) return;
  const g = hud.s.screen.g;
  // A badge in this text means one fleet: show its real count (the examples elsewhere say 3).
  setInlineBadgeLabel(o.badge ?? '3');
  const maxW = Math.min(hud.W - 40, 330);
  const rich = hasMarkup(o.text);
  const lines = rich ? [] : wrap(o.text, maxW - 12, 'main').slice(0, 2);
  const n = rich ? Math.min(2, richLines(o.text, maxW - 12)) : lines.length;
  // (A smaller line under it, where the guide says what its words mean.)
  const subs = o.sub ? wrap(o.sub, maxW - 12, 'tiny').slice(0, 3) : [];
  const w = Math.max(rich ? richWidth(o.text, maxW - 12) : Math.max(...lines.map((l) => textWidth(l))), ...subs.map((l) => textWidth(l, 'tiny'))) + 14;
  const h = n * 10 + 5 + (subs.length ? subs.length * 7 + 2 : 0);
  const x = Math.round(hud.W / 2 - w / 2);
  const y = 17;
  // (A warning, in red or ember, is framed in its colour. So no banner is ever in a house's colour: Vael's is that
  // red, the Remnant's that ember. An aimed House Power's banner is gold, ui/hud/power.ts.)
  box(g, x, y, w, h, PAL.void, o.color === PAL.red || o.color === PAL.ember ? o.color : PAL.slate);
  // (The words the banner explains when pointed at are marked.)
  const terms = termsIn(o.text, { max: 2 });
  const marks = marksOf(hud.ui.termsFor({ terms }));
  if (rich) drawRich(g, o.text, x + 7, y + 3, maxW - 12, { body: o.color }, 'main', 2, marks, MARK);
  else
    lines.forEach((l, i) => {
      textCenter(g, l, hud.W / 2, y + 3 + i * 10, o.color);
      underlineMatches(g, l, Math.round(hud.W / 2 - textWidth(l) / 2), y + 3 + i * 10, marks, MARK);
    });
  subs.forEach((l, i) => textCenter(g, l, hud.W / 2, y + 4 + n * 10 + i * 7, PAL.dusk, 'tiny'));
  hud.bannerRect = { x, y, w, h };
  hud.ui.add({ id: 'banner', x, y, w, h, block: true, terms });
  setInlineBadgeLabel('3');
}
