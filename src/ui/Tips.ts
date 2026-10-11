/**
 * "Firsts": a short card the first time something new happens (once per profile). Every tip can be
 * read again in How to Play (H).
 */
import { ERAS, LAST_CRADLE_ERA, SPACE } from '../game/data/eras';
import type { Note } from '../game/types';
import { IC, text, textWidth, underlineMatches, wrap } from '../render/font';
import { PAL } from '../render/palette';
import type { Ctx } from '../render/pixel';
import { icon } from '../render/sprites';
import type { Hud } from './Hud';
import { MARK, marksOf } from './Ui';

export const TIPS: Record<string, string> = {
  role: 'Every world has a role. MINE: more Embers. FORGE: builds ships. OBSERVATORY: Lore. BASTION: guns and repairs. Click a world to change it.',
  raid: 'Corsairs raid worlds to steal Embers. Meet them with your fleet, or make the world a Bastion.',
  anomaly: 'Your ship found an anomaly. These strange finds can bring Embers, Lore, ships or trouble. You choose.',
  anomalySeen: 'There is an anomaly on your map (a violet swirl). Send any ship there to look inside, then choose what to do. Ships only passing through fly on, and so do Scouts out exploring.',
  blueprint: 'A Blueprint adds a new ship to your Forges for the rest of the run.',
  crisis: 'The Hollow are coming out of the Maw. They devour any world in their path, yours and your rivals’.',
  arkLevel: 'Your Ark gained a level and can learn an ability. Abilities fire by themselves in battle.',
  hangar: 'Your hangar is nearly full. Hold more worlds, or raise them to higher levels, to make room for ships.',
  boonReady: 'Your Lore is full: press B, or the BOON button at the top, to choose a Boon.',
  fleet: `Ships gather in fleets. The badge beside a world (like ${IC.fleet}) counts your ships there: click it to select them, then click a world to send them.`,
  lostWorld: 'You lost a world. Take it back with Breakers, or protect your others with Bastions and a Starbase.',
  // Ages runs, on the cradle.
  ageReady: 'The Lore of your age is gathered. Press the button at the top (or A) to begin the next age. It takes Embers too, and a little time at your Hearth.',
  ageNew: 'A new age! Every unit you have is upgraded to it: watch the change spread out from your Hearth. Your Forges build the new units from now on.',
  ageSiege: 'Bronze brings the Ram, the first siege unit. Until now no wall could be broken; now lands can be taken, and yours too. A Bastion guards a land.',
  ageArk: 'One step is left: your Ark. When it is done, your house leaves for the stars with its Boons, and the run goes on there.',
  ageRival: 'A rival is building its Ark. When it is done, that house is gone to the stars with a head start on you. An attack on its Hearth stops the work.',
  ageGone: 'An Ark has left. That house is ahead of you among the stars now. The lands it held here lie dark: kindle them, and climb faster.',
};

/** Seconds a tip stays up (counted only while it can be read). */
const TIP_TIME = 22;
/** How long the "missed tip" button flashes, and how long it waits to be clicked (real seconds). */
const MISSED_FLASH = 8;
const MISSED_KEEP = 180;

export class Tips {
  private queue: string[] = [];
  private current: { id: string; t: number } | null = null;
  /** Tips that ran out unread or were put off with LATER, newest last: the ★ TIP button brings them back. */
  private missed: string[] = [];
  private missedAt = -999;

  constructor(private hud: Hud) {}

  private get s() {
    return this.hud.s;
  }

  show(id: string) {
    const prof = this.s.profile;
    if (!prof.settings.tips || prof.seenTips.includes(id) || this.queue.includes(id) || this.current?.id === id) return;
    this.queue.push(id);
  }

  /** Show this one next, even with tips turned off. */
  showFirst(id: string) {
    if (this.current?.id === id || this.queue.includes(id)) return;
    this.queue.unshift(id);
  }

  onNote(n: Note) {
    const t = n.text;
    if (/Corsair raid/.test(t)) this.show('raid');
    else if (/^Anomaly found/.test(t)) this.show('anomaly');
    else if (/Maw stirs|THE MAW HAS OPENED/.test(t)) this.show('crisis');
    else if (/reached level/.test(t)) this.show('arkLevel');
    else if (/is kindled/.test(t)) this.show('role');
    else if (/Lore is full/.test(t)) this.show('boonReady');
    else if (/has fallen to|devoured by the Hollow/.test(t)) this.show('lostWorld');
    else if (/^The .* Age begins!/.test(t)) {
      const era = this.s.game.player.era;
      this.show(era === 1 ? 'ageSiege' : era >= LAST_CRADLE_ERA ? 'ageArk' : 'ageNew');
      if (era === 1) this.show('ageNew');
    } else if (/has begun building its Ark/.test(t)) this.show('ageRival');
    else if (/has left for the stars/.test(t)) this.show('ageGone');
  }

  onBoon(blueprint: boolean) {
    if (blueprint) this.show('blueprint');
  }

  update(dt: number) {
    const g = this.s.game;
    const p = g.player;
    if (p.hangarCap > 0 && p.hangarUsed >= p.hangarCap - 2 && p.stats.shipsBuilt > 3) this.show('hangar');
    if (p.stats.shipsBuilt === 1 && !this.s.guided) this.show('fleet');
    if (g.cradle && g.tick % 20 === 0 && p.era < SPACE && !p.advance && p.lore >= ERAS[p.era].lore) this.show('ageReady');
    // Anomalies wait for a ship to be sent: say so once one is on the map (not in the first minute).
    if (g.time > 60 && g.tick % 20 === 0 && !this.s.profile.seenTips.includes('anomalySeen') && g.nodes.some((n) => n.anomaly && p.explored[n.id])) this.show('anomalySeen');
    // A tip card holds the game while it is up (with auto-pause on): nothing happens behind a card that
    // is being read. It waits for OK or LATER then, however long that takes.
    this.s.tipHold = !!this.current && !this.s.modal && this.s.profile.settings.autoPause && !g.outcome;
    if (this.current) {
      // Without the hold, the card's clock only runs while it can be read: not behind a dialog, not
      // while paused, not while the pointer rests on it.
      const reading = !!this.hud.ui.hot?.startsWith('tip');
      if (!this.s.modal && !this.s.paused && !reading && !this.s.tipHold) this.current.t -= dt;
      if (this.current.t <= 0) this.putOff();
    } else if (this.queue.length && !this.s.modal && !this.hud.tutorial.busy() && !this.hud.tutorial.quiet()) {
      const id = this.queue.shift()!;
      this.current = { id, t: TIP_TIME };
    }
    if (this.missed.length && this.hud.ui.time - this.missedAt > MISSED_KEEP) this.missed = [];
  }

  /** OK: read and done. */
  dismiss() {
    if (!this.current) return;
    const prof = this.s.profile;
    if (!prof.seenTips.includes(this.current.id)) prof.seenTips.push(this.current.id);
    this.s.hooks.saveProfile();
    this.missed = this.missed.filter((id) => id !== this.current!.id);
    this.current = null;
    this.s.tipHold = false;
  }

  /** LATER, or the card ran out: keep it behind the ★ TIP button. */
  private putOff() {
    if (!this.current) return;
    const id = this.current.id;
    this.dismiss();
    this.missed.push(id);
    this.missedAt = this.hud.ui.time;
  }

  /** Bring back the newest tip that was put off. */
  reopen() {
    const id = this.missed.pop();
    if (!id) return;
    if (this.current) this.queue.unshift(this.current.id);
    this.current = { id, t: TIP_TIME };
  }

  /** The ★ TIP button in the indicator column (right side); returns the y below it. */
  drawIndicator(g: Ctx, right: number, y: number): number {
    if (!this.missed.length) return y;
    const label = this.missed.length > 1 ? `${this.missed.length} TIPS` : 'TIP';
    const w = textWidth(label, 'tiny') + 20;
    const flashing = this.hud.ui.time - this.missedAt < MISSED_FLASH;
    this.hud.ui.button(g, 'tip-reopen', right - w, y, w, 11, label, () => this.reopen(), {
      icon: 'star', font: 'tiny', color: PAL.teal, pulse: flashing, primary: flashing,
      tip: this.missed.length > 1 ? 'Tips you have not read yet. Click to see them again.' : 'A tip you have not read yet. Click to see it again.',
    });
    return y + 13;
  }

  draw(g: Ctx) {
    if (!this.current || this.s.modal) return;
    const msg = TIPS[this.current.id];
    if (!msg) {
      this.current = null;
      return;
    }
    const W = this.hud.W;
    const w = Math.min(W - 120, 260);
    const lines = wrap(msg, w - 18, 'main').slice(0, 5);
    const h = 12 + lines.length * 10 + 14;
    const x = Math.round(W / 2 - w / 2);
    const y = 46;
    const color = PAL.teal;
    this.hud.ui.panel(g, 'tip', x, y, w, h, { border: color, fill: PAL.night });
    icon(g, 'star', x + 5, y + 3);
    text(g, 'TIP', x + 13, y + 4, color, 'tiny');
    // (The words the card explains when pointed at are marked.)
    const marks = marksOf(this.hud.ui.termsFor({ scan: msg }));
    lines.forEach((l, i) => {
      text(g, l, x + 6, y + 13 + i * 10, PAL.mist);
      underlineMatches(g, l, x + 6, y + 13 + i * 10, marks, MARK);
    });
    this.hud.ui.hint('tip-text', x + 4, y + 11, w - 8, lines.length * 10 + 2, { scan: msg });
    const fy = y + h - 12;
    const all = 'ALL TIPS (H)';
    this.hud.ui.button(g, 'tip-all', x + 4, fy, textWidth(all, 'tiny') + 10, 10, all, () => this.hud.modals.open({ kind: 'help', tab: 'tips' }), {
      font: 'tiny', tip: 'Read every tip again, any time: How to Play (H), then TIPS.',
    });
    const ok = 'OK';
    const okW = textWidth(ok, 'tiny') + 10;
    // (Say that the game waits, where there is room between the buttons.)
    if (this.s.tipHold) {
      const held = 'PAUSED · OK OR SPACE';
      const room = w - (textWidth(all, 'tiny') + 14) - (okW + textWidth('LATER', 'tiny') + 22);
      if (textWidth(held, 'tiny') <= room) text(g, held, x + textWidth(all, 'tiny') + 14 + Math.floor((room - textWidth(held, 'tiny')) / 2), fy + 3, PAL.dusk, 'tiny');
    }
    this.hud.ui.button(g, 'tip-ok', x + w - okW - 5, fy, okW, 10, ok, () => this.dismiss(), { font: 'tiny', tip: 'Got it.' });
    const later = 'LATER';
    const laterW = textWidth(later, 'tiny') + 10;
    this.hud.ui.button(g, 'tip-later', x + w - okW - laterW - 8, fy, laterW, 10, later, () => this.putOff(), {
      font: 'tiny', tip: 'Put this tip away for now. A flashing ★ TIP button on the right brings it back.',
    });
  }
}
