import type { Session } from '../app/Session';
import { SPEEDS } from '../app/Session';
import { ABILITY_BY_ID } from '../game/data/abilities';
import { CARD_BY_ID } from '../game/data/cards';
import { ERAS, LAST_CRADLE_ERA, LINE_SHORT, SPACE } from '../game/data/eras';
import { RELIC_BY_ID } from '../game/data/relics';
import { isWarship, UNITS } from '../game/data/units';
import { ASCENSION_BOONS, DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget, VICTORIES } from '../game/data/victories';
import { HOLD_FIELD } from '../game/constants';
import { ECON, PLANETS, ROLES, ROLE_ORDER } from '../game/data/worlds';
import type { Faction, GNode, Note, Unit, UnitType, VictoryId } from '../game/types';
import { roman } from '../game/util';
import { bigText, fit, IC, paragraph, setVocabulary, text, textCenter, textOutline, textRight, textWidth, underlineMatches, wrap } from '../render/font';
import { PAL, shade, UI } from '../render/palette';
import { bar, box, frame, rect, ring, type Ctx } from '../render/pixel';
import { drawSettlement } from '../render/ground';
import { drawRich, hasMarkup, richLines, richWidth } from '../render/rich';
import { fmtTime, SPRITE_ZOOM } from '../render/Renderer';
import { fleetBadge, icon, setArtEra, setInlineBadgeColor, setInlineBadgeLabel, shipSprite } from '../render/sprites';
import { worldColor, worldSprite } from '../render/worlds';
import { Actions } from './Actions';
import { boonColor, boonTile, groupBoons, relicTile, TILE } from './boons';
import { fmt, fmtRate, pct } from './format';
import { Modals } from './Modals';
import { Tips } from './Tips';
import { Tutorial } from './Tutorial';
import { gloss, GLOSS_BY_ID, termsIn } from './glossary';
import { Goals } from './Goals';
import { dimScreen, MARK, marksOf, Ui, type TipOpts } from './Ui';
import { cradleVocabulary, unitCount, unitDesc, unitName } from './vocab';

interface LogLine {
  id: number;
  text: string;
  kind: Note['kind'];
  node?: number;
  /** Game time it happened. */
  t: number;
  /** Real time when it arrived (for fading). */
  at: number;
}

export interface CardRow {
  h: number;
  draw: (x: number, y: number, w: number) => void;
}

const KIND_COLOR: Record<Note['kind'], string> = { info: PAL.mist, good: PAL.teal, bad: PAL.red, alert: PAL.ember, event: PAL.violet };

export class Hud {
  ui = new Ui();
  actions: Actions;
  modals: Modals;
  tutorial: Tutorial;
  tips: Tips;
  goals: Goals;
  log: LogLine[] = [];
  /** Decisions the player closed without choosing: they wait behind the ! button. */
  snoozed = new Set<number>();
  private lastNote: number;
  private clock = 0;
  /** Card rectangle from the last frame (input uses it to keep clicks off the map). */
  cardRect = { x: 0, y: 0, w: 0, h: 0 };
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Right edge and bottom of the comms log lines drawn this frame (0 when none). */
  private logRight = 0;
  private logBottom = 0;
  /** Boons in flight from the draft to their slot in the tray. */
  private flyers: { id: string; x: number; y: number; t: number }[] = [];
  /** UI time when a Boon landed in the tray (for the flash). */
  private landed = new Map<string, number>();
  private trayPos = new Map<string, { x: number; y: number }>();
  /** The Ember count as drawn: it rolls toward the real value. */
  private embersShown = -1;
  private lastEmbers = -1;
  /** "+250" / "-120" popups under the Ember counter. */
  private emberPops: { text: string; color: string; t: number }[] = [];
  /** When the run ended (UI time), for the ending moment. */
  private endedAt = -1;
  /** Game time of the last "Embers are piling up" nudge. */
  private lastNudge = -999;

  constructor(public s: Session) {
    this.actions = new Actions(s);
    this.modals = new Modals(this);
    this.tutorial = new Tutorial(this);
    this.tips = new Tips(this);
    this.goals = new Goals(this);
    this.lastNote = s.game.noteId - 1;
    this.ui.onClickSound = (disabled) => s.sfx.play(disabled ? 'error' : 'ui', disabled ? 0.4 : 0.5);
  }

  get g() {
    return this.s.game;
  }

  get W() {
    return this.s.screen.W;
  }

  get H() {
    return this.s.screen.H;
  }

  // =====================================================================
  // Per-frame logic
  // =====================================================================

  update(dt: number) {
    this.clock += dt;
    const s = this.s;
    const g = this.g;
    s.pruneSelection();
    if (s.toast) {
      s.toast.t -= dt;
      if (s.toast.t <= 0) s.toast = null;
    }
    // Notes: sounds, the log, toasts and auto-pause.
    for (const n of g.notes) {
      if (n.id <= this.lastNote) {
        // A line that tallies ships lost grows while more are lost there: keep the log's copy in step.
        if (n.loss) {
          const l = this.log.find((x) => x.id === n.id);
          if (l && l.text !== n.text) {
            l.text = n.text;
            l.at = this.clock;
          }
        }
        continue;
      }
      this.lastNote = n.id;
      this.log.push({ id: n.id, text: n.text, kind: n.kind, node: n.node, t: n.t, at: this.clock });
      if (this.log.length > 40) this.log.shift();
      // Ships lost in a fight the player is watching go in the log without an alarm: it is on screen.
      if (n.loss && this.watching(n.loss.node)) continue;
      if (n.kind === 'alert') s.sfx.play('alert', 0.55);
      else if (n.kind === 'bad') s.sfx.play('alert', 0.35);
      else if (n.kind === 'good' && /Boon/.test(n.text)) s.sfx.play('boon', 0.5);
      else if (n.kind === 'good' && /kindled/.test(n.text)) s.sfx.play('kindle', 0.7);
      else if (n.kind === 'good') s.sfx.play('good', 0.3);
      const revealedLog = s.reveal().map;
      const hearthFell = /^The Hearth of .* has gone dark/.test(n.text);
      if (hearthFell) {
        // A house falls: a banner everyone sees, a rumble, and a fanfare when it was our doing.
        const ours = n.kind === 'good';
        s.showToast(n.text, ours ? PAL.gold : PAL.violet, 6);
        s.sfx.play('capture', ours ? 0.85 : 0.55);
        if (ours) s.sfx.play('boon', 0.5);
        s.renderer.fx.shake = Math.max(s.renderer.fx.shake, ours ? 3 : 2);
      } else if (!revealedLog || n.kind === 'alert' || n.kind === 'bad') s.showToast(n.text, KIND_COLOR[n.kind], n.kind === 'alert' ? 5 : 4);
      if (n.pause && s.profile.settings.autoPause && !s.paused && !g.outcome && !this.tutorial.busy()) {
        s.paused = true;
        s.showToast('PAUSED · ' + n.text, PAL.ember, 6);
        if (n.node !== undefined && n.node >= 0) s.focusNode(n.node);
      }
      this.tips.onNote(n);
    }
    // First enemy sighted: reveals the minimap and the comms log on a guided run.
    if (!g.ui.sighted && g.tick % 10 === 0) {
      const p = g.player;
      for (let i = 0; i < g.nodes.length && !g.ui.sighted; i++) {
        if (!p.visible[i]) continue;
        const n = g.nodes[i];
        if (n.owner >= 0 && n.owner !== p.id && g.factions[n.owner].kind === 'empire') g.ui.sighted = g.time;
        for (const u of g.buckets[i]) {
          const k = g.factions[u.owner].kind;
          if (u.owner !== p.id && (k === 'empire' || k === 'pirate') && isWarship(u.type)) {
            g.ui.sighted = g.time;
            break;
          }
        }
      }
    }
    // The first Scout sent exploring (the early hint stops then).
    if (!g.ui.scouted && g.tick % 10 === 0 && g.unitList.some((u) => !u.dead && u.owner === g.playerId && u.order === 'explore')) g.ui.scouted = 1;
    // Pending decisions open themselves when auto-pause is on (but not mid-tutorial).
    if (!s.modal && !g.outcome && s.profile.settings.autoPause && !this.tutorial.busy()) {
      const pr = g.prompts.find((x) => x.result === undefined && !this.snoozed.has(x.id));
      if (pr) this.modals.open({ kind: 'event', promptId: pr.id });
      else if (!s.view.box) {
        // An Ark or a Dreadnought that may learn an ability is a decision too: its choice opens by itself,
        // once. (It waited behind a small button at the edge of the screen, easy to miss, above all right
        // after the Boon that gave the levels.) Closed without a choice, it waits behind that button.
        const key = (x: Unit) => `${x.id}:${x.level}:${x.pendingAbil.length}`;
        const u = g.unitList.find((x) => !x.dead && x.owner === g.playerId && x.pendingAbil.length > 0 && !this.abilityShown.has(key(x)));
        if (u) {
          this.abilityShown.add(key(u));
          this.modals.open({ kind: 'ability', unitId: u.id });
        }
      }
    }
    this.tutorial.update(dt);
    this.tips.update(dt);
    this.goals.update(dt);
    // While the game stands still nothing is about to be sent anywhere: clicks pick things to look at.
    // When it goes on, ships that are still selected are ready for their order again.
    const look = s.mode !== 'play';
    if (look) s.view.orderMode = false;
    else if (this.wasLook && !s.modal && s.ownSelected().some((u) => !UNITS[u.type].isStatic)) s.view.orderMode = true;
    this.wasLook = look;
    this.nudge();
  }

  /** A gentle hint when Embers have piled up and the player has not acted for a while. */
  private nudge() {
    const s = this.s;
    const g = this.g;
    const p = g.player;
    if (s.modal || s.paused || g.outcome || this.tutorial.busy() || !s.profile.settings.tips || p.capital < 0) return;
    if (g.time - s.idleSince < 40 || g.time - this.lastNudge < 180 || s.toast) return;
    const kindle = g.kindleCost(p);
    const dark = g.nodes.some((n) => n.kind === 'planet' && n.owner < 0 && p.explored[n.id] && !g.checkKindle(p.id, n.id));
    let hint = '';
    if (dark && p.embers >= kindle * 2) hint = `${fmt(p.embers)} Embers waiting: kindle a dark world (click a grey world, then KINDLE).`;
    else if (p.hangarUsed >= p.hangarCap && p.embers >= 600) hint = 'Your hangar is full: raise your worlds, hold more of them, or build a Hangar Bay at your Hearth.';
    else if (p.embers >= 900) hint = `${fmt(p.embers)} Embers waiting: build ships at a Forge, or raise a world to the next level.`;
    if (!hint) return;
    this.lastNudge = g.time;
    s.showToast(hint, PAL.gold, 7);
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  draw(dt: number) {
    // On the cradle of an Ages run everything is said in the cradle's words (ui/vocab.ts).
    setVocabulary(this.g.cradle ? cradleVocabulary(this.g.player.era) : null);
    setArtEra(this.g.cradle ? Math.min(this.g.player.era, LAST_CRADLE_ERA) : SPACE);
    try {
      this.drawAll(dt);
    } finally {
      setVocabulary(null);
      setArtEra(SPACE);
    }
  }

  /** A text as the HUD shows it right now: in the cradle's words while the run is on the cradle. */
  words(s: string): string {
    return this.g.cradle ? cradleVocabulary(this.g.player.era)(s) : s;
  }

  private drawAll(dt: number) {
    const g = this.s.screen.g;
    this.ui.begin(dt);
    this.ui.explainTerms = this.s.profile.settings.explainTerms !== false;
    setInlineBadgeColor(this.g.player.color);
    const R = this.s.reveal();
    if (R.fleet) this.drawBadges();
    if (R.map) this.drawLog();
    this.drawCard();
    if (R.map) this.drawMinimap();
    this.drawTopBar(R);
    this.drawBanner();
    if (R.destinies) this.g.cradle ? this.drawAges() : this.drawDestinies();
    if (R.lore) this.drawTray();
    if (R.map) this.drawAttackArrows();
    this.drawIndicators();
    this.tips.draw(g);
    this.tutorial.draw(g);
    if (this.s.modal) {
      dimScreen(g, this.W, this.H, 14, this.s.modal.kind === 'log' ? 0.55 : 0.7);
      this.modals.draw(g);
    } else if (this.s.paused && !this.g.outcome) {
      this.drawPaused();
    }
    this.drawFlyers(dt);
    if (this.g.outcome) this.drawEnding(g);
    if (this.s.profile.settings.crt) this.scanlines();
    this.ui.drawTooltip(g, this.W, this.H);
  }

  /** The end of a run: the screen dims, and VICTORY or DEFEAT rises with the reason. */
  private drawEnding(g: Ctx) {
    const o = this.g.outcome!;
    if (this.endedAt < 0) this.endedAt = this.ui.time;
    const t = this.ui.time - this.endedAt;
    const W = this.W;
    const H = this.H;
    g.fillStyle = `rgba(11, 10, 26, ${Math.min(0.78, t * 1.2)})`;
    g.fillRect(0, 0, W, H);
    const won = o.playerWon;
    const color = won ? PAL.gold : PAL.red;
    // Gold sparks rise on a win.
    if (won) {
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97 + 31) % W;
        const speed = 14 + ((i * 37) % 23);
        const sy = H - ((t * speed + (i * 53) % H) % (H + 20));
        g.fillStyle = i % 3 ? PAL.gold : PAL.bone;
        g.fillRect(sx, Math.round(sy), 1, 1);
      }
    }
    const k = Math.min(1, t / 0.5);
    const scale = Math.max(2, Math.min(4, Math.floor(W / 120)));
    const title = won ? 'VICTORY' : 'DEFEAT';
    const ty = Math.round(H / 2 - 30 - (1 - k) * 12);
    bigText(g, title, W / 2, ty, color, won ? PAL.wine : PAL.night, scale);
    if (t > 0.45) {
      const winner = o.winner >= 0 ? this.g.factions[o.winner] : null;
      const sub = won ? 'You are crowned Hegemarch.' : winner && o.victory !== 'defeat' ? `${winner.name} is crowned Hegemarch.` : 'Your Hearth has gone dark.';
      textCenter(g, sub, W / 2, ty + scale * 7 + 10, PAL.bone);
      const lines = wrap(o.reason, Math.min(W - 40, 300), 'main').slice(0, 2);
      lines.forEach((l, i) => textCenter(g, l, W / 2, ty + scale * 7 + 24 + i * 10, PAL.mist));
    }
    if (t > 1.2 && Math.floor(t * 2) % 2 === 0) textCenter(g, 'CLICK TO CONTINUE', W / 2, H - 22, PAL.dusk, 'tiny');
    this.ui.add({ id: 'ending', x: 0, y: 0, w: W, h: H, onClick: () => t > 0.8 && this.s.hooks.showResults?.() });
  }

  private scanlines() {
    const g = this.s.screen.g;
    g.fillStyle = 'rgba(11,10,26,0.22)';
    for (let y = 1; y < this.H; y += 2) g.fillRect(0, y, this.W, 1);
  }

  private drawPaused() {
    const g = this.s.screen.g;
    const t = 'PAUSED · SPACE TO RESUME';
    // (An order was just refused: this is why.)
    const flash = performance.now() / 1000 - this.s.refusedAt < 1.2 && Math.floor(performance.now() / 110) % 2 === 0;
    const w = textWidth(t, 'tiny') + 10;
    let x = Math.round(this.W / 2 - w / 2);
    if (this.cardRect.w > 0 && x < this.cardRect.x + this.cardRect.w + 4) x = this.cardRect.x + this.cardRect.w + 6;
    // Step aside for the comms log too.
    if (this.logRight > 0 && this.logBottom >= this.H - 14 && x < this.logRight + 4) x = this.logRight + 6;
    const right = this.minimapRect.w > 0 ? this.minimapRect.x - 4 : this.W - 3;
    if (x + w > right) x = Math.max(3, right - w);
    const y = this.H - 13;
    box(g, x, y, w, 9, flash ? PAL.wine : PAL.night, flash ? PAL.bone : PAL.gold);
    text(g, t, x + 5, y + 2, flash ? PAL.bone : PAL.gold, 'tiny');
  }

  // ---------------------------------------------------------------------
  // Top bar
  // ---------------------------------------------------------------------

  private drawTopBar(R: ReturnType<Session['reveal']>) {
    const g = this.s.screen.g;
    const p = this.g.player;
    const W = this.W;
    rect(g, 0, 0, W, 13, PAL.night);
    rect(g, 0, 13, W, 1, PAL.indigo);
    this.ui.add({ id: 'topbar', x: 0, y: 0, w: W, h: 14, block: true });
    // Embers: the count rolls toward the real value, and lump gains or spends pop below it.
    if (this.embersShown < 0 || this.lastEmbers < 0) this.embersShown = this.lastEmbers = p.embers;
    const delta = p.embers - this.lastEmbers;
    if (Math.abs(delta) >= 25) this.emberPops.push({ text: (delta > 0 ? '+' : '-') + fmt(Math.abs(delta)), color: delta > 0 ? PAL.gold : PAL.ember, t: 0 });
    if (this.emberPops.length > 4) this.emberPops.shift();
    this.lastEmbers = p.embers;
    const gap = p.embers - this.embersShown;
    this.embersShown = Math.abs(gap) < 1 ? p.embers : this.embersShown + gap * Math.min(1, this.ui.dt * 9);
    const rolling = Math.abs(gap) >= 5;
    icon(g, 'ember', 3, 3);
    let x = text(g, fmt(this.embersShown), 10, 3, rolling && gap > 0 ? PAL.bone : PAL.gold) + 3;
    x = text(g, fmtRate(p.income), x, 3, PAL.ember);
    let py = 15;
    for (const pop of this.emberPops) {
      pop.t += this.ui.dt;
      if (pop.t > 1.4) continue;
      const yy = Math.round(py + pop.t * 6);
      if (pop.t < 1.1 || Math.floor(pop.t * 12) % 2 === 0) textOutline(g, pop.text, 10, yy, pop.color, PAL.void, 'tiny');
      py += 7;
    }
    this.emberPops = this.emberPops.filter((pop) => pop.t <= 1.4);
    this.ui.hit('embers', 1, 0, x + 1, 13, undefined, () => `Embers: your only currency. You earn ${fmtRate(p.income)} every second from your worlds. Spend them on ships, kindling and world upgrades.`);
    x += 8;
    // Lore
    if (R.lore && this.g.cradle) x = this.drawAge(x);
    else if (R.lore) {
      icon(g, 'lore', x, 3);
      x += 7;
      const cost = this.g.boonCostOf(p);
      if (p.pendingDrafts > 0) {
        const label = p.pendingDrafts > 1 ? `BOON ×${p.pendingDrafts}` : 'BOON';
        this.ui.button(g, 'boon', x, 1, textWidth(label, 'tiny') + 12, 11, label, () => this.modals.open({ kind: 'draft' }), {
          primary: true, pulse: true, font: 'tiny', tip: 'A Boon is ready. Choose one of a few upgrades for your house. (B)',
        });
        x += textWidth(label, 'tiny') + 15;
      } else {
        bar(g, x + 1, 5, 36, 3, p.lore / cost, PAL.violet, PAL.indigo, PAL.indigo);
        this.ui.hit('lore', x - 8, 0, 48, 13, undefined, () => `Lore: ${Math.floor(p.lore)} / ${cost}. Every time it fills you choose a Boon. Observatories make Lore faster. (+${p.loreRate.toFixed(2)}/s)`);
        x += 42;
      }
    }
    // Hangar, only near the limit.
    if (R.fleet && p.hangarCap > 0 && (p.hangarUsed >= p.hangarCap - 3 || p.hangarUsed / p.hangarCap >= 0.8)) {
      x += 2;
      icon(g, this.g.cradle ? 'supply' : 'hangar', x, this.g.cradle ? 4 : 3);
      const full = p.hangarUsed >= p.hangarCap;
      const ex = text(g, `${p.hangarUsed}/${p.hangarCap}`, x + 7, 3, full ? PAL.red : PAL.mist);
      this.ui.hit('hangar', x - 1, 0, ex - x + 2, 13, undefined, 'Hangar: room for your ships. Every world you hold adds room, and higher-level worlds add more. When it is full you cannot build. Hangar Bays at your Hearth add more.');
      x = ex + 6;
    }
    // Right side: menu, speeds, pause, clock.
    let rx = W - 2;
    rx -= 11;
    this.ui.iconButton(g, 'menu', rx, 1, 11, 'menu', () => this.modals.open({ kind: 'menu' }), { tip: 'Menu (Esc)' });
    for (let i = SPEEDS.length - 1; i >= 0; i--) {
      const sp = SPEEDS[i];
      const label = sp === 0.5 ? '½' : String(sp);
      rx -= 10;
      const sel = this.s.speed === sp;
      this.ui.button(g, 'speed' + i, rx, 1, 10, 11, label, () => {
        this.s.speed = sp;
        this.s.paused = false;
      }, { selected: sel, font: 'main', tip: sp === 0.5 ? 'Slow speed (½×)' : `Speed ${sp}× (${['', 'normal', 'fast', 'fastest'][sp] ?? ''})`, color: sel ? PAL.gold : PAL.mist });
    }
    rx -= 12;
    this.ui.iconButton(g, 'pause', rx, 1, 11, this.s.paused ? 'play' : 'pause', () => {
      this.s.paused = !this.s.paused;
    }, { tip: this.s.paused ? 'Resume (Space)' : 'Pause (Space)', selected: this.s.paused, pulse: this.s.paused });
    const clock = fmtTime(this.g.time);
    rx -= textWidth(clock) + 5;
    text(g, clock, rx, 3, PAL.bone);
    this.ui.hit('clock', rx - 2, 0, textWidth(clock) + 4, 13, undefined, () =>
      this.g.time < ECON.wallsTime ? `Time in this run. Every Hearth's walls reach full strength at ${fmtTime(ECON.wallsTime)}.` : 'Time in this run.');
  }

  // ---------------------------------------------------------------------
  // Objective banner
  // ---------------------------------------------------------------------

  /** The banner line. `badge` is the number on a fleet badge in its text (the fleet it means). */
  private objective(): { text: string; color: string; badge?: string; sub?: string } | null {
    const s = this.s;
    const g = this.g;
    if (g.outcome) return null;
    const tut = this.tutorial.banner();
    if (tut) return tut;
    if (s.toast) return { text: s.toast.text, color: s.toast.color };
    const p = g.player;
    if (g.prompts.some((x) => x.result === undefined)) return { text: 'Something needs your decision. Click the ! on the right.', color: PAL.violet };
    if (p.pendingDrafts > 0) return { text: 'A Boon is ready: press B to choose it.', color: PAL.gold };
    const seed = this.seedHint();
    if (seed) return { text: seed, color: PAL.gold };
    const scout = this.scoutHint();
    if (scout) return { ...scout, color: PAL.sky };
    return null;
  }

  /** A seed ship with nothing to do (its kindling was called off, or its world was taken): what to do with it. */
  private seedHint(): string | null {
    const g = this.g;
    const seed = g.idleSeed(g.playerId);
    if (!seed || seed.lane || seed.path.length || seed.node < 0) return null;
    return `A seed ship waits at ${g.nodes[seed.node].name}. Click a grey world, then KINDLE: it is free.`;
  }

  /** Early in a run, until a Scout has been sent exploring: how to send one. */
  private scoutHint(): { text: string; badge: string } | null {
    const g = this.g;
    const p = g.player;
    if (g.ui.scouted || g.time > 300 || !this.s.reveal().fleet || !g.hasUncharted(p)) return null;
    const scouts = g.unitList.filter((u) => !u.dead && u.owner === p.id && UNITS[u.type].role === 'scout');
    // Nothing to say once a Scout is out exploring (or none is left).
    if (!scouts.length || scouts.some((u) => u.order === 'explore')) return null;
    const scout = scouts[0];
    if (this.s.ownSelected().some((u) => UNITS[u.type].role === 'scout')) return { text: `Press EXPLORE (or E): your Scout ${IC.scout} will chart the dark by itself.`, badge: '' };
    return { text: `Your Scout ${IC.scout} waits for orders. Click its fleet badge ${IC.fleet}, then EXPLORE.`, badge: this.fleetLabel(scout.lane ? -1 : scout.node) };
  }

  /** Is this place on screen, near enough for its ships to be seen? */
  private watching(node: number): boolean {
    if (node < 0) return false;
    const sc = this.nodeScreen(node);
    return this.s.renderer.cam.zoom >= 0.1 && sc.x > 0 && sc.x < this.W && sc.y > 16 && sc.y < this.H;
  }

  /** The number on the player's fleet badge at a world, as the map shows it ("" for none). */
  fleetLabel(node: number): string {
    const n = node >= 0 ? this.s.fleetAt(node).length : 0;
    return n > 0 ? String(n) : '';
  }

  /** Ability choices that have opened by themselves already (ship, level and choices waiting). */
  private abilityShown = new Set<string>();

  /** Did the game stand still at the last update (see `Session.mode`)? */
  private wasLook = false;

  /** Where the banner was drawn this frame (the right-hand column keeps clear of it). */
  private bannerRect = { x: 0, y: 0, w: 0, h: 0 };

  private drawBanner() {
    this.bannerRect = { x: 0, y: 0, w: 0, h: 0 };
    const o = this.objective();
    if (!o) return;
    const g = this.s.screen.g;
    // A badge in this text means one fleet: show its real count (the examples elsewhere say 3).
    setInlineBadgeLabel(o.badge ?? '3');
    const maxW = Math.min(this.W - 40, 330);
    const rich = hasMarkup(o.text);
    const lines = rich ? [] : wrap(o.text, maxW - 12, 'main').slice(0, 2);
    const n = rich ? Math.min(2, richLines(o.text, maxW - 12)) : lines.length;
    // (A smaller line under it, where the guide says what its words mean.)
    const subs = o.sub ? wrap(o.sub, maxW - 12, 'tiny').slice(0, 3) : [];
    const w = Math.max(rich ? richWidth(o.text, maxW - 12) : Math.max(...lines.map((l) => textWidth(l))), ...subs.map((l) => textWidth(l, 'tiny'))) + 14;
    const h = n * 10 + 5 + (subs.length ? subs.length * 7 + 2 : 0);
    const x = Math.round(this.W / 2 - w / 2);
    const y = 17;
    box(g, x, y, w, h, PAL.void, o.color === PAL.red || o.color === PAL.ember ? o.color : PAL.slate);
    // (The words the banner explains when pointed at are marked.)
    const terms = termsIn(o.text, { max: 2 });
    const marks = marksOf(this.ui.termsFor({ terms }));
    if (rich) drawRich(g, o.text, x + 7, y + 3, maxW - 12, { body: o.color }, 'main', 2, marks, MARK);
    else
      lines.forEach((l, i) => {
        textCenter(g, l, this.W / 2, y + 3 + i * 10, o.color);
        underlineMatches(g, l, Math.round(this.W / 2 - textWidth(l) / 2), y + 3 + i * 10, marks, MARK);
      });
    subs.forEach((l, i) => textCenter(g, l, this.W / 2, y + 4 + n * 10 + i * 7, PAL.dusk, 'tiny'));
    this.bannerRect = { x, y, w, h };
    this.ui.add({ id: 'banner', x, y, w, h, block: true, terms });
    setInlineBadgeLabel('3');
  }

  // ---------------------------------------------------------------------
  // Destinies widget
  // ---------------------------------------------------------------------

  destinyProgress(f: Faction, v: VictoryId): { frac: number; label: string } {
    const g = this.g;
    switch (v) {
      case 'conquest': {
        const rivals = g.empires().filter((e) => e.id !== f.id);
        const out = rivals.filter((e) => !e.alive).length;
        return { frac: out / Math.max(1, rivals.length), label: `${out}/${rivals.length} Hearths out` };
      }
      case 'domination': {
        const need = Math.ceil(g.worldCount * DOMINATION_SHARE);
        const have = g.worldsOf(f.id).length;
        return { frac: have / need, label: f.holdTimer > 0 ? `Holding ${Math.floor(f.holdTimer)}s` : `${have}/${need} worlds` };
      }
      case 'ascension':
        if (f.gate) return { frac: f.gate.charge / GATE_CHARGE, label: `Gate ${pct(f.gate.charge / GATE_CHARGE)}` };
        return { frac: f.boons / ASCENSION_BOONS, label: `${f.boons}/${ASCENSION_BOONS} Boons` };
      case 'relics': {
        const need = relicsRequired(g.relicTotal);
        return { frac: f.relics.length / need, label: f.relicTimer > 0 ? `Holding ${Math.floor(f.relicTimer)}s` : `${f.relics.length}/${need} relics` };
      }
      case 'treasury': {
        const need = treasuryTarget(g.config.size);
        return { frac: f.embers / need, label: f.treasuryTimer > 0 ? `Holding ${Math.floor(f.treasuryTimer)}s` : `${fmt(f.embers)}/${fmt(need)}` };
      }
      case 'crisis': {
        const c = g.crisis;
        if (!c) return { frac: 0, label: '—' };
        if (c.dead) return { frac: 1, label: 'Purged' };
        if (!c.awake) return { frac: 0, label: `Maw opens ~${fmtTime(Math.max(0, c.awakenAt))}` };
        const h = g.units.get(c.heart);
        // (While the void barrier holds, the Heart cannot really be hurt: say how long that is.)
        const barrier = h?.buffs.find((b) => b.id === 'barrier');
        if (h && barrier) return { frac: 1 - h.hp / h.maxHp, label: `Barrier ${fmtTime(Math.ceil(barrier.t))}` };
        return { frac: h ? 1 - h.hp / h.maxHp : 0, label: h ? `Heart ${pct(h.hp / h.maxHp)}` : '—' };
      }
    }
  }

  private drawDestinies() {
    const g = this.s.screen.g;
    const vs = this.g.victories;
    const cw = 22;
    let x = this.W - 3 - vs.length * (cw + 2);
    const y = 16;
    const p = this.g.player;
    for (const v of vs) {
      const pr = this.destinyProgress(p, v);
      const id = 'dest-' + v;
      const hot = this.ui.isHot(id);
      box(g, x, y, cw, 12, PAL.night, hot ? PAL.dusk : PAL.indigo);
      icon(g, v, x + 2, y + 2);
      const k = Math.max(0, Math.min(1, pr.frac));
      rect(g, x + 9, y + 8, 11, 2, PAL.indigo);
      if (k > 0) rect(g, x + 9, y + 8, Math.max(1, Math.round(11 * k)), 2, k >= 1 ? PAL.teal : PAL.gold);
      text(g, String(Math.min(99, Math.floor(k * 100))), x + 9, y + 2, PAL.mist, 'tiny');
      this.ui.hit(id, x, y, cw, 12, () => this.modals.open({ kind: 'status' }), () => `${VICTORIES[v].name}: ${VICTORIES[v].short} (${pr.label}). Click for details.`, undefined, {
        terms: termsIn(VICTORIES[v].desc, { exclude: VICTORIES[v].name, max: 2 }),
      });
      x += cw + 2;
    }
  }

  // ---------------------------------------------------------------------
  // Ages (the cradle of an Ages run)
  // ---------------------------------------------------------------------

  /** What the step to the next age takes and brings (for its buttons). */
  private advanceTip(): string {
    const p = this.g.player;
    const era = ERAS[p.era];
    const why = this.g.checkAdvance(p.id);
    const needs = `It takes [${era.lore} Lore] (you have ${Math.floor(p.lore)}), [${era.cost} Embers] and ${era.time} seconds at your Hearth. The work stops while the Hearth is under attack.`;
    const no = why ? ` [!${why}.]` : '';
    if (p.era >= LAST_CRADLE_ERA) return `Build your Ark. When it is done it leaves for the stars with your house, and the run goes on there. ${needs}${no} (A)`;
    return `Begin the ${ERAS[p.era + 1].name}. ${ERAS[p.era + 1].brings} ${needs}${no} (A)`;
  }

  /** The top bar on the cradle: the Lore of the age, and the step to the next one. Returns the x after it. */
  private drawAge(x: number): number {
    const g = this.s.screen.g;
    const game = this.g;
    const p = game.player;
    icon(g, 'lore', x, 3);
    x += 7;
    if (p.pendingDrafts > 0) {
      const label = p.pendingDrafts > 1 ? `BOON ×${p.pendingDrafts}` : 'BOON';
      this.ui.button(g, 'boon', x, 1, textWidth(label, 'tiny') + 12, 11, label, () => this.modals.open({ kind: 'draft' }), {
        primary: true, pulse: true, font: 'tiny', tip: 'A Boon is ready: every new age brings one. Choose one of a few upgrades for your house. (B)',
      });
      x += textWidth(label, 'tiny') + 15;
    }
    if (p.era >= SPACE) return x;
    const era = ERAS[p.era];
    const last = p.era >= LAST_CRADLE_ERA;
    if (p.advance) {
      // The step is under way.
      const k = p.advance.t / p.advance.total;
      const held = p.capital >= 0 && game.nodes[p.capital].lastHit < 5;
      const c = held ? PAL.red : PAL.teal;
      bar(g, x + 1, 5, 36, 3, k, c, PAL.indigo, PAL.indigo);
      const ex = text(g, `${last ? 'THE ARK' : ERAS[p.era + 1].short + ' AGE'} ${pct(k)}`, x + 41, 4, c, 'tiny');
      this.ui.hit('age', x - 8, 0, ex - x + 10, 13, undefined, () =>
        held
          ? 'The work stands still while your Hearth is under attack. Drive the attackers off.'
          : `${last ? 'Your Ark' : `The ${ERAS[p.era + 1].name}`}: ${Math.ceil(p.advance!.total - p.advance!.t)} seconds to go. An attack on your Hearth stops the work.`);
      return ex + 6;
    }
    if (p.lore < era.lore) {
      bar(g, x + 1, 5, 36, 3, p.lore / era.lore, PAL.violet, PAL.indigo, PAL.indigo);
      const ex = text(g, era.short + ' AGE', x + 41, 4, PAL.dusk, 'tiny');
      this.ui.hit('age', x - 8, 0, ex - x + 10, 13, undefined, () =>
        `${era.name}. Lore: ${Math.floor(p.lore)} / ${era.lore} (+${p.loreRate.toFixed(2)}/s). On the cradle your Lore is saved for the next age: when the bar is full, ${last ? 'you can build your Ark' : `you can begin the ${ERAS[p.era + 1].name}`}. Observatories make Lore faster.`);
      return ex + 6;
    }
    // The Lore of the age is gathered: the step is an order, never automatic.
    const why = game.checkAdvance(p.id);
    const label = last ? 'BUILD THE ARK' : `TO THE ${ERAS[p.era + 1].short} AGE`;
    const cost = `${IC.ember}${era.cost}`;
    const bw = textWidth(label, 'tiny') + textWidth(cost, 'tiny') + 16;
    this.ui.button(g, 'advance', x, 1, bw, 11, label, () => this.actions.advance(), {
      primary: !why, pulse: !why, disabled: !!why, right: cost, font: 'tiny', tip: this.advanceTip(),
    });
    return x + bw + 4;
  }

  /** The race up the ages: every house and the age it has reached, in the corner where the Destinies sit among the stars. */
  private drawAges() {
    const g = this.s.screen.g;
    const game = this.g;
    const houses = game.empires();
    const rowH = 8;
    const w = 34;
    const h = houses.length * rowH + 3;
    const x = this.W - 3 - w;
    const y = 16;
    const hot = this.ui.isHot('ages');
    box(g, x, y, w, h, PAL.night, hot ? PAL.dusk : PAL.indigo);
    const blink = Math.floor(this.ui.time * 3) % 2 === 0;
    houses.forEach((f, i) => {
      const ry = y + 2 + i * rowH;
      const gone = f.launchedAt >= 0;
      const dead = !f.alive && !gone;
      rect(g, x + 3, ry + 1, 5, 5, dead ? PAL.slate : f.color);
      if (f.isPlayer) frame(g, x + 2, ry, 7, 7, PAL.bone);
      for (let k = 0; k < LAST_CRADLE_ERA + 1; k++) {
        // One pip per age reached after the Stone Age, and the last for the Ark.
        const reached = gone || f.era > k;
        const rising = !gone && !dead && !!f.advance && f.era === k && (f.isPlayer || k === LAST_CRADLE_ERA);
        const c = dead ? PAL.indigo : reached ? (gone ? PAL.gold : f.color) : rising && blink ? shade(f.color) : PAL.indigo;
        rect(g, x + 11 + k * 4, ry + 1, 3, 5, c);
      }
      if (dead) rect(g, x + 2, ry + 3, w - 5, 1, PAL.slate);
    });
    this.ui.hit('ages', x, y, w, h, () => this.modals.open({ kind: 'status' }), () =>
      'The climb: ' +
      houses
        .map((f) => `${f.isPlayer ? 'you' : this.g.shortName(f)}: ${f.launchedAt >= 0 ? 'gone to the stars' : !f.alive ? 'Hearth dark' : ERAS[f.era].name + (f.advance && f.era >= LAST_CRADLE_ERA ? ', building its Ark' : '')}`)
        .join(' · ') +
      '. Click for details.');
  }

  // ---------------------------------------------------------------------
  // Boon tray: every Boon and relic the house holds, down the left edge
  // ---------------------------------------------------------------------

  /** Start a chosen Boon's flight from the draft (screen point) to its tray slot. */
  flyBoon(id: string, x: number, y: number) {
    this.flyers.push({ id, x, y, t: 0 });
  }

  private drawTray() {
    const g = this.s.screen.g;
    const p = this.g.player;
    this.trayPos.clear();
    const groups = groupBoons(p.cards);
    if (!groups.length && !p.relics.length) return;
    const step = TILE + 1;
    // Fixed column height (room for the context card and log below), so the tray never reflows.
    const perCol = Math.max(4, Math.floor((this.H - 17 - 152) / step));
    let i = 0;
    const slot = () => {
      const pos = { x: 3 + Math.floor(i / perCol) * step, y: 17 + (i % perCol) * step };
      i++;
      return pos;
    };
    const open = () => this.modals.open({ kind: 'status', tab: 'boons' });
    // At most two columns, so the tray never covers much of the map: the newest Boons and every
    // relic are shown, and a "+N" tile stands for the rest.
    const relics = p.relics.filter((rid) => RELIC_BY_ID[rid]);
    const room = perCol * 2;
    const hidden = groups.length + relics.length > room ? groups.length - Math.max(0, room - 1 - relics.length) : 0;
    const shown = groups.slice(hidden);
    const moreAt = hidden ? { x: 0, y: 0 } : null;
    for (const gr of groups.slice(0, hidden)) this.trayPos.set(gr.id, moreAt!);
    for (const gr of shown) {
      const c = CARD_BY_ID[gr.id];
      const pos = slot();
      this.trayPos.set(gr.id, pos);
      const count = gr.count - this.flyers.filter((f) => f.id === gr.id).length;
      if (count <= 0) continue;
      const id = 'tray-' + gr.id;
      const since = this.ui.time - (this.landed.get(gr.id) ?? -9);
      const flash = since < 0.4 ? 1 - since / 0.4 : 0;
      boonTile(g, pos.x, pos.y, c, count, { hot: this.ui.isHot(id), flash });
      if (flash > 0) {
        const d = Math.round(3 + since * 22);
        const cx = pos.x + 5;
        const cy = pos.y + 5;
        g.fillStyle = boonColor(c);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(cx + dx * d, cy + dy * d, 1, 1);
      }
      this.ui.add({
        id, x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tip: c.desc, tipTitle: count > 1 ? `${c.name} ×${count}` : c.name, tipColor: boonColor(c),
        terms: termsIn(`${c.name}. ${c.desc}${c.pact ? ' Pact' : ''}`, { max: 2 }),
      });
    }
    relics.forEach((rid, k) => {
      const r = RELIC_BY_ID[rid];
      const pos = slot();
      const id = 'trayr-' + k;
      relicTile(g, pos.x, pos.y, { hot: this.ui.isHot(id) });
      this.ui.add({ id, x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tip: r.desc, tipTitle: r.name, tipColor: PAL.sky, terms: [...gloss('relic'), ...termsIn(r.desc, { max: 1 })] });
    });
    if (moreAt) {
      const pos = slot();
      Object.assign(moreAt, pos);
      const hot = this.ui.isHot('tray-more');
      box(g, pos.x, pos.y, TILE, TILE, hot ? PAL.indigo : PAL.night, hot ? PAL.bone : PAL.slate);
      textCenter(g, hidden < 10 ? `+${hidden}` : String(Math.min(99, hidden)), pos.x + TILE / 2 + 1, pos.y + 3, PAL.mist, 'tiny');
      const count = groups.slice(0, hidden).reduce((a, gr) => a + gr.count, 0);
      this.ui.add({ id: 'tray-more', x: pos.x, y: pos.y, w: TILE, h: TILE, onClick: open, tipTitle: `${count} more Boons`, tip: 'Your older Boons. Click (or press B) to see every Boon you hold.' });
    }
  }

  private drawFlyers(dt: number) {
    if (!this.flyers.length) return;
    const g = this.s.screen.g;
    for (const f of this.flyers) f.t += dt / 0.7;
    for (const f of this.flyers) {
      if (f.t < 1) continue;
      this.landed.set(f.id, this.ui.time);
      this.s.sfx.play('select', 0.45);
    }
    this.flyers = this.flyers.filter((f) => f.t < 1);
    const at = (f: { x: number; y: number }, to: { x: number; y: number }, t: number) => {
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x0 = f.x - TILE / 2;
      return { x: x0 + (to.x - x0) * k, y: f.y + (to.y - f.y) * k - Math.sin(Math.PI * k) * 26 };
    };
    for (const f of this.flyers) {
      const c = CARD_BY_ID[f.id];
      if (!c) continue;
      const to = this.trayPos.get(f.id) ?? { x: 3, y: 17 };
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

  // ---------------------------------------------------------------------
  // Edge arrows: your worlds under attack somewhere off screen
  // ---------------------------------------------------------------------

  private drawAttackArrows() {
    const g = this.s.screen.g;
    const game = this.g;
    const r = this.s.renderer;
    const W = this.W;
    const H = this.H;
    const blink = Math.floor(this.ui.time * 4) % 2 === 0;
    let shown = 0;
    for (const n of game.worldsOf(game.playerId)) {
      if (n.lastHit > 3 || shown >= 3) continue;
      const sx = r.sx(n.x);
      const sy = r.sy(n.y);
      if (sx >= 4 && sy >= 18 && sx < W - 4 && sy < H - 4) continue;
      // Where the line from the screen's middle to the world leaves the screen, kept clear of the
      // top bar above and the pause label below.
      const top = 24;
      const bottom = H - 26;
      const cx = W / 2;
      const cy = (top + bottom) / 2;
      const dx = sx - cx;
      const dy = sy - cy;
      const k = Math.min((W / 2 - 12) / Math.max(1e-6, Math.abs(dx)), ((bottom - top) / 2) / Math.max(1e-6, Math.abs(dy)));
      const ax = Math.round(cx + dx * k);
      const ay = Math.round(cy + dy * k);
      const name = Math.abs(dx) * ((H - 16) / W) > Math.abs(dy) ? (dx > 0 ? 'arrowRight' : 'arrowLeft') : dy > 0 ? 'arrowDown' : 'arrowUp';
      const horizontal = name === 'arrowLeft' || name === 'arrowRight';
      const iw = horizontal ? 4 : 7;
      const ih = horizontal ? 7 : 4;
      const id = 'attack-' + n.id;
      const hot = this.ui.isHot(id);
      box(g, ax - 6, ay - 6, 13, 13, hot ? PAL.wine : PAL.void, blink || hot ? PAL.red : PAL.wine);
      icon(g, name, ax - (iw >> 1), ay - (ih >> 1), blink || hot ? PAL.red : PAL.wine, true);
      this.ui.hit(id, ax - 6, ay - 6, 13, 13, () => this.s.focusNode(n.id), `${n.name} is under attack! Click to look.`);
      shown++;
    }
  }

  // ---------------------------------------------------------------------
  // Right-side indicators: decisions waiting, Ark level-ups
  // ---------------------------------------------------------------------

  /**
   * The houses that are on the clock for a Destiny right now, soonest first: holding 60% of the worlds,
   * holding the relics, holding the hoard, charging the Gate. Each is a countdown on screen, the
   * player's own and, more to the point, a rival's that has to be broken in time.
   */
  destinyClocks(): { id: string; left: number; mine: boolean; text: string; tip: string; node: number }[] {
    const g = this.g;
    const out: { id: string; left: number; mine: boolean; text: string; tip: string; node: number }[] = [];
    const has = (v: VictoryId) => g.victories.includes(v);
    for (const f of g.aliveEmpires()) {
      const mine = f.id === g.playerId;
      const add = (v: VictoryId, left: number, own: string, rival: string, node: number) => {
        const name = VICTORIES[v].name.toUpperCase();
        out.push({
          id: `clock-${f.id}-${v}`, left: Math.max(0, left), mine, node,
          text: mine ? `${name} · YOURS IN ${fmtTime(Math.max(0, left))}` : `${g.shortName(f).toUpperCase()} · ${name} IN ${fmtTime(Math.max(0, left))}`,
          tip: mine ? own : `${f.name} win by ${VICTORIES[v].name} when this runs out. ${rival}`,
        });
      };
      if (has('domination') && f.holdTimer > 0) add('domination', DOMINATION_HOLD - f.holdTimer, `You hold ${Math.round(DOMINATION_SHARE * 100)}% of all worlds. Keep them until this runs out and the crown is yours.`, 'Take worlds from them, or kindle more of your own, to break their hold.', f.capital);
      if (has('relics') && f.relicTimer > 0) add('relics', RELIC_HOLD - f.relicTimer, 'You hold most of the relics. Keep your Hearth until this runs out and the crown is yours.', 'Take their Hearth: its relics go to whoever takes it.', f.capital);
      if (has('treasury') && f.treasuryTimer > 0) add('treasury', TREASURY_HOLD - f.treasuryTimer, 'Your hoard is full. Keep it until this runs out and the crown is yours.', 'Take their worlds: each one seizes part of their hoard.', f.capital);
      if (has('ascension') && f.gate) add('ascension', GATE_CHARGE - f.gate.charge, 'Your Starfire Gate is charging. Protect it until this runs out and the crown is yours.', 'Destroy their Starfire Gate before it is charged.', f.gate.node);
    }
    return out.sort((a, b) => a.left - b.left);
  }

  private drawIndicators() {
    const g = this.s.screen.g;
    let y = 31;
    for (const c of this.destinyClocks().slice(0, 3)) {
      const w = textWidth(c.text, 'tiny') + 10;
      const x = this.W - 3 - w;
      const b = this.bannerRect;
      if (b.w > 0 && x < b.x + b.w + 2 && y < b.y + b.h + 2) y = b.y + b.h + 2;
      const seen = c.node >= 0 && this.s.explored(c.node);
      this.ui.button(g, c.id, x, y, w, 11, c.text, () => seen && this.s.focusNode(c.node), {
        font: 'tiny', color: c.mine ? PAL.gold : PAL.red, primary: !c.mine, pulse: c.left < 30, tip: `${c.tip}${seen ? ' Click to look.' : ''}`,
      });
      y += 13;
    }
    y = this.goals.draw(g, this.W - 3, y, this.bannerRect);
    const pending = this.g.prompts.filter((x) => x.result === undefined);
    if (pending.length) {
      const label = pending.length > 1 ? `! ${pending.length} DECISIONS` : '! DECISION';
      const w = textWidth(label, 'tiny') + 10;
      this.ui.button(g, 'prompt', this.W - 3 - w, y, w, 11, label, () => this.modals.open({ kind: 'event', promptId: pending[0].id }), {
        primary: true, pulse: true, font: 'tiny', color: PAL.violet, tip: 'An anomaly or a visitor is waiting for your decision.',
      });
      y += 13;
    }
    y = this.tips.drawIndicator(g, this.W - 3, y);
    for (const u of this.g.unitList) {
      if (u.dead || u.owner !== this.g.playerId || !u.pendingAbil.length) continue;
      const label = `${u.type === 'ark' ? 'ARK' : 'DREAD'} LEVEL ${u.level}!`;
      const w = textWidth(label, 'tiny') + 10;
      this.ui.button(g, 'abil-' + u.id, this.W - 3 - w, y, w, 11, label, () => this.modals.open({ kind: 'ability', unitId: u.id }), {
        primary: true, pulse: true, font: 'tiny', tip: `Your ${u.type === 'ark' ? 'Ark' : 'Dreadnought'} reached level ${u.level} and can learn a new ability. Click to choose.`,
      });
      y += 13;
      if (y > 70) break;
    }
  }

  // ---------------------------------------------------------------------
  // Fleet badges on the map
  // ---------------------------------------------------------------------

  private drawBadges() {
    const g = this.s.screen.g;
    const game = this.g;
    const r = this.s.renderer;
    const z = r.cam.zoom;
    const pid = game.playerId;
    // Ships at worlds.
    for (const n of game.nodes) {
      if (!this.s.visible(n.id)) continue;
      const b = game.buckets[n.id];
      if (!b.length) continue;
      const counts = new Map<number, number>();
      for (const u of b) {
        if (u.dead || u.type === 'fighter' || UNITS[u.type].isStatic || this.s.onMission(u)) continue;
        counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
      }
      if (!counts.size) continue;
      const nx = r.sx(n.x);
      const ny = r.sy(n.y);
      const nr = r.nodeR(n);
      if (nx < -40 || ny < -40 || nx > this.W + 40 || ny > this.H + 40) continue;
      let by = ny - 4 - (counts.size > 1 ? 5 : 0);
      const owners = [...counts.keys()].sort((a, b2) => (a === pid ? -1 : b2 === pid ? 1 : a - b2));
      for (const o of owners) {
        const f = game.factions[o];
        const label = String(counts.get(o));
        const w = textWidth(label, 'tiny') + (o === pid ? 9 : 6);
        const bx = nx + nr + (nr > 6 ? 6 : 4);
        const id = o === pid ? 'fleet-' + n.id : 'efleet-' + n.id + '-' + o;
        const hot = this.ui.isHot(id);
        const sel = o === pid && this.fleetSelectedAt(n.id);
        fleetBadge(g, bx, by, label, f.color, { own: o === pid, fill: o === pid ? (sel ? PAL.indigo : PAL.night) : PAL.void, border: sel || hot ? PAL.bone : f.color });
        if (o === pid) {
          this.ui.hit(id, bx - 1, by - 1, w + 2, 11, () => this.selectFleet(n.id), `Your fleet at ${n.name}: ${this.fleetSummary(this.s.fleetAt(n.id))}. Click to select it, then click a world to send it.`);
        } else {
          const units = b.filter((u) => u.owner === o && !u.dead && u.type !== 'fighter' && !UNITS[u.type].isStatic);
          this.ui.hit(id, bx - 1, by - 1, w + 2, 11, () => {
            this.s.selectUnits(units.map((u) => u.id), false, false);
            this.s.sfx.play('select', 0.4);
          }, `${f.name}: ${this.fleetSummary(units)}`, () => {
            if (this.s.ownSelected().length && units[0]) this.actions.attack(units[0].id);
          });
        }
        by += 11;
      }
    }
    // Our fleets on starlanes: one badge per destination.
    if (z < SPRITE_ZOOM * 3) {
      const groups = new Map<number, Unit[]>();
      for (const u of game.unitList) {
        if (u.dead || u.owner !== pid || !u.lane || u.type === 'fighter' || this.s.onMission(u)) continue;
        const k = u.dest >= 0 ? u.dest : u.lane.to;
        const list = groups.get(k) ?? [];
        list.push(u);
        groups.set(k, list);
      }
      for (const [dest, list] of groups) {
        let mx = 0;
        let my = 0;
        for (const u of list) {
          mx += u.x;
          my += u.y;
        }
        const x = r.sx(mx / list.length);
        const y = r.sy(my / list.length);
        if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
        const label = String(list.length);
        const w = textWidth(label, 'tiny') + 6;
        const f = game.player;
        box(g, x - (w >> 1), y - 12, w, 9, PAL.night, f.color);
        text(g, label, x - (w >> 1) + 3, y - 10, f.color, 'tiny');
        this.ui.hit('lfleet-' + dest, x - (w >> 1) - 1, y - 13, w + 2, 11, () => {
          this.s.selectUnits(list.map((u) => u.id));
          this.s.sfx.play('select', 0.4);
        }, `${this.fleetSummary(list)} heading for ${game.nodes[dest].name}.`);
      }
    }
  }

  private fleetSelectedAt(node: number): boolean {
    const own = this.s.ownSelected();
    return own.length > 0 && own.every((u) => u.node === node);
  }

  selectFleet(node: number) {
    const ids = this.s.fleetAt(node).map((u) => u.id);
    if (!ids.length) return;
    this.s.selectUnits(ids);
    this.s.sfx.play('select', 0.5);
  }

  fleetSummary(units: Unit[]): string {
    // (By type and by age: on the cradle a Warrior and a Spearman are the same line, an age apart.)
    const counts = new Map<string, number>();
    for (const u of units) counts.set(`${u.type}|${u.era}`, (counts.get(`${u.type}|${u.era}`) ?? 0) + 1);
    return [...counts.entries()].map(([k, c]) => unitCount(c, k.split('|')[0] as UnitType, Number(k.split('|')[1]))).join(', ') || 'no ships';
  }

  // ---------------------------------------------------------------------
  // Comms log
  // ---------------------------------------------------------------------

  private drawLog() {
    const g = this.s.screen.g;
    this.logRight = 0;
    this.logBottom = 0;
    const recent = this.log.filter((l) => this.clock - l.at < 10).slice(-3);
    if (!recent.length) return;
    const maxW = Math.min(230, this.W - 150);
    let y = this.cardRect.h > 0 ? this.cardRect.y - 4 : this.H - 6;
    const newest = recent[recent.length - 1];
    for (let i = recent.length - 1; i >= 0; i--) {
      const l = recent[i];
      const key = 'log-' + l.id;
      const hot = this.ui.isHinted(key);
      // Pointing at a line holds it on screen.
      if (hot) l.at = Math.max(l.at, this.clock - 6);
      const age = this.clock - l.at;
      // The newest line, and the one under the pointer, are shown whole; the others fold to one line.
      const lines = l === newest || hot ? wrap(l.text, maxW, 'main').slice(0, 4) : [fit(l.text, maxW, 'main')];
      const h = lines.length * 10;
      y -= h;
      const w = Math.max(...lines.map((t) => textWidth(t))) + 6;
      // A flat shade, not a dither: world names on the map would show between the letters.
      // (And it stays as dark while the line ages: only the words fade. Thinned, it let the names through.)
      g.fillStyle = hot ? 'rgba(27, 24, 56, 0.96)' : 'rgba(11, 10, 26, 0.8)';
      g.fillRect(3, y - 1, w, h);
      this.logRight = Math.max(this.logRight, 3 + w);
      this.logBottom = Math.max(this.logBottom, y + h - 1);
      const color = age > 7 && !hot ? shade(KIND_COLOR[l.kind]) : KIND_COLOR[l.kind];
      lines.forEach((t, k) => text(g, t, 6, y + 1 + k * 10, color));
      // A hint, not a button: clicks and orders still reach the map under the log.
      this.ui.hint(key, 3, y - 1, Math.max(w, 40), h, { scan: l.text, beside: true });
    }
  }

  // ---------------------------------------------------------------------
  // Minimap
  // ---------------------------------------------------------------------

  private drawMinimap() {
    const g = this.s.screen.g;
    const game = this.g;
    const b = game.bounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const maxW = Math.min(120, Math.round(this.W * 0.24));
    const maxH = 70;
    const k = Math.min(maxW / bw, maxH / bh);
    const w = Math.round(bw * k) + 4;
    const h = Math.round(bh * k) + 4;
    const x0 = this.W - 3 - w;
    const y0 = this.H - 3 - h;
    this.minimapRect = { x: x0, y: y0, w, h };
    box(g, x0, y0, w, h, PAL.void, PAL.indigo);
    const mx = (wx: number) => Math.round(x0 + 2 + (wx - b.minX) * k);
    const my = (wy: number) => Math.round(y0 + 2 + (wy - b.minY) * k);
    const p = game.player;
    for (const n of game.nodes) {
      if (!this.s.explored(n.id)) continue;
      const owner = this.s.visible(n.id) ? n.owner : p.seenOwner[n.id];
      let c: string = PAL.slate;
      if (n.kind === 'star') c = PAL.indigo;
      if (owner >= 0) c = game.factions[owner].color;
      else if (n.kind === 'planet') c = PAL.slate;
      else if (n.kind === 'anomaly' && n.anomaly) c = PAL.violet;
      else if (n.kind === 'relic' && n.relic) c = PAL.sky;
      else if (n.kind === 'rift') c = PAL.pink;
      g.fillStyle = c;
      const size = n.capitalOf >= 0 ? 2 : 1;
      g.fillRect(mx(n.x), my(n.y), size, size);
      if (this.s.visible(n.id) && game.hasHostiles(n.id, p.id) && game.buckets[n.id].some((u) => u.owner === p.id) && Math.floor(this.clock * 3) % 2 === 0) {
        g.fillStyle = PAL.red;
        g.fillRect(mx(n.x) - 1, my(n.y) - 1, 3, 3);
      }
    }
    // Camera view.
    const cam = this.s.renderer.cam;
    const vw = (cam.w / cam.zoom) * k;
    const vh = (cam.h / cam.zoom) * k;
    const vx = mx(cam.x) - vw / 2;
    const vy = my(cam.y) - vh / 2;
    const fx = Math.max(x0 + 1, Math.round(vx));
    const fy = Math.max(y0 + 1, Math.round(vy));
    const fw = Math.min(x0 + w - 1, Math.round(vx + vw)) - fx;
    const fh = Math.min(y0 + h - 1, Math.round(vy + vh)) - fy;
    if (fw > 1 && fh > 1) frame(g, fx, fy, fw, fh, PAL.dusk);
    const move = () => {
      const wx = b.minX + (this.ui.mx - x0 - 2) / k;
      const wy = b.minY + (this.ui.my - y0 - 2) / k;
      cam.focus(wx, wy);
    };
    this.ui.add({ id: 'minimap', x: x0, y: y0, w, h, onClick: move, tip: 'The sector. Click to look there.' });
    if (this.ui.active === 'minimap' && this.ui.down) move();
  }

  // ---------------------------------------------------------------------
  // Context card
  // ---------------------------------------------------------------------

  private drawCard() {
    const rows = this.cardRows();
    if (!rows || !rows.length) {
      this.cardRect = { x: 0, y: 0, w: 0, h: 0 };
      return;
    }
    const g = this.s.screen.g;
    const w = Math.min(216, Math.max(176, this.W - 150));
    const h = rows.reduce((a, r) => a + r.h, 0) + 6;
    const x = 3;
    const y = this.H - 3 - h;
    this.cardRect = { x, y, w, h };
    this.ui.panel(g, 'card', x, y, w, h);
    let cy = y + 3;
    for (const r of rows) {
      r.draw(x + 4, cy, w - 8);
      cy += r.h;
    }
  }

  private cardRows(): CardRow[] | null {
    const s = this.s;
    const own = s.ownSelected();
    if (own.length) return this.fleetRows(own);
    const sel = s.selectedUnits();
    if (sel.length) return this.enemyRows(sel);
    if (s.view.selectedNode >= 0) return this.nodeRows(this.g.nodes[s.view.selectedNode]);
    return null;
  }

  private header(name: string, color: string, n: GNode | null, right?: string, rightColor?: string, rightTip?: TipOpts): CardRow {
    const g = this.s.screen.g;
    return {
      h: 13,
      draw: (x, y, w) => {
        let tx = x;
        if (n && n.kind === 'planet') {
          const lit = n.owner >= 0;
          if (this.g.cradle) {
            const f = lit ? this.g.factions[n.owner] : null;
            drawSettlement(g, n, x + 5, y + 6, 5, { era: f ? f.era : -1, color: f ? f.color : PAL.slate, level: 1, hearth: n.capitalOf >= 0, lit: lit ? 1 : 0, t: this.ui.time });
          } else g.drawImage(worldSprite(n, 5, lit), x, y);
          tx += 14;
        }
        const rw = right ? textWidth(right, 'tiny') + 4 : 0;
        text(g, fit(name, w - (tx - x) - rw, 'main'), tx, y + 2, color);
        if (right) text(g, right, x + w - rw + 4, y + 3, rightColor ?? PAL.dusk, 'tiny');
        if (right && rightTip) this.ui.hint('card-right', x + w - rw + 2, y + 1, rw, 9, rightTip);
      },
    };
  }

  private line(t: string, color: string = PAL.dusk, font: 'tiny' | 'main' = 'tiny', tip?: TipOpts): CardRow {
    const g = this.s.screen.g;
    const h = font === 'tiny' ? 7 : 10;
    return {
      h,
      draw: (x, y, w) => {
        const shown = fit(t, w, font);
        text(g, shown, x, y, color, font);
        if (tip) this.ui.hint('card-line:' + t, x - 1, y - 1, textWidth(shown, font) + 2, h, tip);
      },
    };
  }

  private para(t: string, color: string = PAL.mist, w = 200, tip?: TipOpts): CardRow {
    const g = this.s.screen.g;
    const rich = hasMarkup(t);
    const lines = rich ? [] : wrap(t, w, 'main');
    const h = (rich ? richLines(t, w) : lines.length) * 10;
    return {
      h,
      draw: (x, y) => {
        if (rich) drawRich(g, t, x, y, w, { body: color });
        else lines.forEach((l, i) => text(g, l, x, y + i * 10, color));
        if (tip) this.ui.hint('card-para:' + t, x - 1, y - 1, w + 2, h, tip);
      },
    };
  }

  /** What a world's size means, for tooltips. */
  private sizeTip(n: GNode): string {
    const name = { S: 'Small', M: 'Medium', L: 'Large' }[n.size] ?? n.size;
    return `${name} world: at level I it earns ${ECON.embers[n.size]} Embers a second (small 0.4, medium 0.6, large 0.8). Bigger worlds also have more hull.`;
  }

  /** Tooltip for a world's size and role line. */
  private roleTip(n: GNode): TipOpts {
    const aff = this.g.affinityOf(n);
    const T = PLANETS[n.ptype ?? 'barren'];
    const parts = [this.sizeTip(n)];
    if (aff) parts.push(`${T.name} worlds suit the ${ROLES[aff].name} role${n.role === aff ? ', and this one is doing it' : ''}: [+25%] at it.`);
    return { tip: parts.join(' '), terms: gloss(...(n.role ? [n.role] : []), 'natural') };
  }

  private gap(h = 3): CardRow {
    return { h, draw: () => {} };
  }

  private nodeRows(n: GNode): CardRow[] {
    const game = this.g;
    const p = game.player;
    const visible = this.s.visible(n.id);
    const owner = visible ? n.owner : p.seenOwner[n.id];
    const rows: CardRow[] = [];
    const innerW = Math.min(216, Math.max(176, this.W - 150)) - 8;
    if (n.kind !== 'planet') return this.siteRows(n, innerW);
    const T = PLANETS[n.ptype ?? 'barren'];
    const aff = game.affinityOf(n);
    if (owner === p.id) return this.ownWorldRows(n, innerW);
    if (owner >= 0) {
      const f = game.factions[owner];
      rows.push(this.header(n.name.toUpperCase(), f.color, n, n.capitalOf >= 0 ? 'HEARTH' : `LEVEL ${roman(n.level)}`, f.color,
        n.capitalOf >= 0 ? { terms: gloss('hearth', 'fealty') } : { tip: `Level ${roman(n.level)} of III.`, terms: gloss('level') }));
      rows.push(this.line(`${game.shortName(f).toUpperCase()} · ${n.size} WORLD${n.role ? ' · ' + n.role.toUpperCase() : ''}`, PAL.dusk, 'tiny', this.roleTip(n)));
      if (visible) rows.push(this.hpRow(n));
      const walls = n.capitalOf >= 0 && f.kind === 'empire' ? game.wallsOf(n) : 1;
      if (walls < 1) rows.push(this.line(`WALLS ${pct(walls)}: WEAKER NOW, FULL AT ${fmtTime(ECON.wallsTime)}`, PAL.ember, 'tiny', { terms: gloss('walls') }));
      if (visible && game.fieldAt(n)) rows.push(this.line(`ANTI-WARP FIELD: YOUR SHIPS JUMP AWAY ${HOLD_FIELD}S SLOWER`, PAL.violet, 'tiny', { terms: gloss('field') }));
      // (Ages: a house still on its way from the cradle holds its Hearth, and nothing can touch it until it arrives.)
      const away = game.asleep(f.id);
      if (away) rows.push(this.line(`ITS ARK HAS NOT ARRIVED: ${fmtTime(f.asleepUntil - game.time)} TO GO`, PAL.ember, 'tiny', { tip: `The ${f.name} are still on their way from the cradle. Until their Ark arrives nothing here can be hurt, and nothing here will fight.` }));
      const why = away
        ? 'Nothing can touch this Hearth until its house arrives.'
        : f.kind === 'empire'
          ? n.capitalOf >= 0
            ? 'Take this Hearth and the whole house falls: its worlds swear to you. Bring Breakers.'
            : 'Breakers take worlds fastest. Clear its defenders first.'
          : '';
      if (why) rows.push(this.para(why, PAL.mist, innerW, { terms: termsIn(why) }));
      return rows;
    }
    // A dark world.
    rows.push(this.header(n.name.toUpperCase(), PAL.mist, n, 'DARK', PAL.slate, { terms: gloss('dark', 'kindle') }));
    rows.push(this.line(`${n.size} ${T.name.toUpperCase()} WORLD · GOOD AS A ${(aff ?? 'mine').toUpperCase()}`, PAL.dusk, 'tiny', {
      tip: `${this.sizeTip(n)} ${T.name} worlds suit the ${ROLES[aff ?? 'mine'].name} role: [+25%] at it once it is yours.`,
      terms: gloss(aff ?? 'mine', 'natural'),
    }));
    const guards = visible ? game.buckets[n.id].filter((u) => !u.dead && u.owner !== p.id && game.factions[u.owner].kind !== 'empire' && u.type !== 'fighter') : [];
    const seed = game.seedFor(p.id, n.id);
    if (guards.length) {
      if (game.cradle) {
        rows.push(this.line(`HELD BY ${guards.length} ${guards.length === 1 ? 'BEAST' : 'BEASTS'}: DRIVE THEM OFF FIRST`, PAL.red, 'tiny', {
          tip: `Beasts hold ${n.name}. Send your units to kill them; you cannot kindle it while they are here.`,
        }));
      } else {
        rows.push(this.line(`GUARDED BY ${guards.length} ${guards.length === 1 ? 'SHIP' : 'SHIPS'}: CLEAR THEM FIRST`, PAL.red, 'tiny', {
          tip: `Old defenders guard ${n.name}. Send warships to destroy them; you cannot kindle it while they are here.`,
          terms: gloss('sentinel'),
        }));
      }
    }
    if (seed) rows.push(this.line(seed.node === n.id && seed.kindle > 0 ? `KINDLING… ${pct(seed.kindle / ECON.kindleTime)}` : 'A SEED SHIP IS ON ITS WAY', PAL.gold, 'tiny', { terms: gloss('seed', 'kindle', 'glow') }));
    if (!seed) {
      const why = game.checkKindle(p.id, n.id);
      const cost = game.kindleCost(p);
      // A seed ship whose mission was called off does the next kindling, at no cost.
      const waiting = game.idleSeed(p.id);
      rows.push(this.gap(2));
      rows.push({
        h: 15,
        draw: (x, y, w) => {
          this.ui.button(this.s.screen.g, 'kindle', x, y, Math.min(110, w), 13, 'KINDLE', () => this.actions.kindle(n.id), {
            primary: !why, disabled: !!why, icon: 'kindle', right: waiting ? 'FREE' : `${IC.ember}${cost}`,
            tip: why
              ? `Can't kindle: ${why}.`
              : waiting
                ? `Your waiting seed ship goes to ${n.name}, kindles it and is used up. It is already paid for, so this costs nothing. (K)`
                : `Pay ${cost} Embers for a seed ship: it goes to ${n.name}, kindles it and is used up. If it is destroyed on the way, the Embers are lost. (K)`,
          });
          if (why && why !== 'Not enough Embers') text(this.s.screen.g, fit(why.toUpperCase(), w - 116, 'tiny'), x + 116, y + 4, PAL.slate, 'tiny');
        },
      });
    }
    return rows;
  }

  private hpRow(n: GNode): CardRow {
    const g = this.s.screen.g;
    return {
      h: 8,
      draw: (x, y, w) => {
        // (On the cradle a land has walls, and the longer word needs more room before the bar.)
        const cradle = this.g.cradle;
        const label = cradle ? 'WALLS' : 'HULL';
        const off = cradle ? textWidth(label, 'tiny') + 4 : 18;
        text(g, label, x, y, PAL.dusk, 'tiny');
        const bw = Math.min(90, w - off - 2);
        bar(g, x + off, y + 1, bw, 2, n.hp / Math.max(1, n.maxHp), PAL.teal, PAL.indigo);
        if (n.maxSh > 0) bar(g, x + off, y + 4, bw, 1, n.sh / n.maxSh, PAL.sky, PAL.night, undefined, 0);
        this.ui.hint('card-hp', x - 1, y - 1, bw + off + 2, 8, {
          tip: cradle
            ? `Walls ${fmt(n.hp)} / ${fmt(n.maxHp)} (green)${n.maxSh > 0 ? ` · shields ${fmt(n.sh)} / ${fmt(n.maxSh)} (blue)` : ''}. Shields soak up damage first. When the walls are down the land falls to whoever is attacking it.`
            : `Hull ${fmt(n.hp)} / ${fmt(n.maxHp)} (green)${n.maxSh > 0 ? ` · shields ${fmt(n.sh)} / ${fmt(n.maxSh)} (blue)` : ''}. Shields soak up damage first. At zero hull the world falls to whoever is attacking it.`,
        });
      },
    };
  }

  private ownWorldRows(n: GNode, innerW: number): CardRow[] {
    const game = this.g;
    const p = game.player;
    const gx = this.s.screen.g;
    const rows: CardRow[] = [];
    const hearth = n.capitalOf === p.id;
    rows.push(this.header(n.name.toUpperCase(), p.color, n, hearth ? `HEARTH · ${roman(n.level)}` : `LEVEL ${roman(n.level)}`, PAL.gold,
      hearth ? { tip: `Your Hearth, level ${roman(n.level)}.`, terms: gloss('hearth', 'lastStand') } : { tip: `Level ${roman(n.level)} of III.`, terms: gloss('level') }));
    const aff = game.affinityOf(n);
    let info = hearth ? 'YOUR HEARTH: IT DOES EVERY ROLE' : `${n.size} WORLD · ${(n.role ?? 'mine').toUpperCase()}${aff && n.role === aff ? ' (A NATURAL FIT)' : aff ? ` · GOOD AS A ${aff.toUpperCase()}` : ''}`;
    if (n.retool > 0) info = `RETOOLING AS A ${(n.role ?? '').toUpperCase()}… ${Math.ceil(n.retool)}S`;
    rows.push(this.line(info, n.retool > 0 ? PAL.ember : PAL.dusk, 'tiny', n.retool > 0 ? { terms: gloss('retool') } : hearth ? { terms: gloss('hearth') } : this.roleTip(n)));
    const walls = hearth ? game.wallsOf(n) : 1;
    if (walls < 1) rows.push(this.line(`WALLS ${pct(walls)} · FULL STRENGTH AT ${fmtTime(ECON.wallsTime)}`, PAL.ember, 'tiny', { terms: gloss('walls') }));
    if (game.fieldAt(n)) rows.push(this.line(`ANTI-WARP FIELD: ENEMIES JUMP AWAY ${HOLD_FIELD}S SLOWER`, PAL.violet, 'tiny', { terms: gloss('field') }));
    rows.push({
      h: 10,
      draw: (x, y) => {
        const em = fmtRate(game.worldEmbers(n) * (1 + p.mods.embers) * p.incomeMul);
        const lo = fmtRate(game.worldLore(n) * (1 + p.mods.lore) * p.incomeMul);
        icon(gx, 'ember', x, y);
        let tx = text(gx, `${em}/s`, x + 7, y, PAL.gold) + 6;
        this.ui.hint('card-embers', x - 1, y - 1, tx - x - 4, 10, { tip: `${n.name} earns ${em} Embers a second, with all your bonuses. Size, level, role and glow set it.` });
        const lx = tx;
        icon(gx, 'lore', tx, y);
        tx = text(gx, `${lo}/s`, tx + 7, y, PAL.violet) + 6;
        this.ui.hint('card-lore', lx - 1, y - 1, tx - lx - 4, 10, { tip: `${n.name} makes ${lo} Lore a second. Observatories make the most.`, terms: gloss('lore') });
        if (n.glow < 1) {
          const ex = text(gx, `GLOW ${pct(n.glow)}`, tx, y + 1, PAL.ember, 'tiny');
          this.ui.hint('card-glow', tx - 1, y - 1, ex - tx + 2, 9, { terms: gloss('glow') });
        } else if (n.lastHit < 5) {
          const ex = text(gx, 'UNDER FIRE', tx, y + 1, PAL.red, 'tiny');
          this.ui.hint('card-fire', tx - 1, y - 1, ex - tx + 2, 9, { terms: gloss('underFire') });
        }
      },
    });
    rows.push(this.hpRow(n));
    rows.push(this.gap(2));
    // Roles + upgrade
    rows.push({
      h: 14,
      draw: (x, y, w) => {
        let bx = x;
        if (!hearth) {
          for (const r of ROLE_ORDER) {
            const isAff = aff === r;
            this.ui.iconButton(gx, 'role-' + r, bx, y, 12, r, () => this.actions.role(n.id, r), {
              selected: n.role === r,
              tipTitle: n.role === r ? `${ROLES[r].name} (current role)` : ROLES[r].name,
              tip: `${ROLES[r].desc}${isAff ? ' This world is a natural fit: [+25%].' : ''}${n.role === r ? '' : n.fresh ? ' The first role you give a new world costs no time.' : ` Switching takes ${ECON.retoolTime}s, and the world works at neither role meanwhile.`}`,
            });
            if (isAff) {
              gx.fillStyle = PAL.gold;
              gx.fillRect(bx + 10, y - 1, 2, 2);
            }
            bx += 14;
          }
          bx += 2;
        }
        const cost = game.upgradeCost(p, n);
        const rising = n.buildQ.some((q) => q.kind === 'upgrade');
        if (cost !== null && !rising) {
          const why = game.checkUpgrade(p.id, n.id);
          const label = `RAISE TO ${roman(n.level + 1)}`;
          this.ui.button(gx, 'upgrade', bx, y, Math.min(w - (bx - x), 104), 12, label, () => this.actions.upgrade(n.id), {
            disabled: !!why && why !== 'Not enough Embers' ? true : !!why, right: `${IC.ember}${cost}`, font: 'tiny',
            tip: `Raise ${n.name} to level ${roman(n.level + 1)}: +50% output, more hull and more hangar room.${why ? ` (${why})` : ''}`,
          });
        } else if (rising) {
          const q = n.buildQ.find((it) => it.kind === 'upgrade')!;
          text(gx, `RISING TO ${roman(n.level + 1)}`, bx, y + 3, PAL.teal, 'tiny');
          bar(gx, bx, y + 10, 60, 2, q.t / q.total, PAL.teal, PAL.indigo);
        } else text(gx, 'LEVEL III (MAX)', bx, y + 3, PAL.dusk, 'tiny');
      },
    });
    // Ships
    if (game.isForge(n)) {
      const types = game.shipTypesFor(p);
      rows.push(this.gap(2));
      rows.push({
        h: 15,
        draw: (x, y, w) => {
          const bw = Math.max(26, Math.min(34, Math.floor((w + 2) / types.length) - 2));
          let bx = x;
          for (const t of types) {
            const why = game.checkShip(p.id, n.id, t);
            const cost = game.shipCost(p, t);
            const id = 'build-' + t;
            const hot = this.ui.isHot(id);
            const blocked = !!why && why !== 'Not enough Embers' && why !== 'Hangar full' && why !== 'Queue full';
            box(gx, bx, y, bw, 14, hot && !blocked ? PAL.indigo : PAL.night, hot ? PAL.dusk : why ? PAL.indigo : PAL.slate);
            const spr = shipSprite(t, why ? PAL.slate : p.color, 0);
            gx.drawImage(spr, bx + 2 + Math.max(0, Math.floor((9 - spr.width) / 2)), y + 7 - (spr.height >> 1));
            text(gx, String(cost), bx + 12, y + 5, why === 'Not enough Embers' ? PAL.red : why ? PAL.slate : PAL.gold, 'tiny');
            const def = UNITS[t];
            this.ui.add({
              id, x: bx, y, w: bw, h: 14, onClick: () => this.actions.build(n.id, t), disabled: blocked,
              tipTitle: `${def.name} · ${cost} Embers · ${def.hangar} hangar`,
              tip: `${game.cradle ? `${unitDesc(t, p.era)} ${LINE_SHORT[t] ?? ''}` : (GLOSS_BY_ID[t]?.text ?? def.short)}${why ? ` [!${why}.]` : ' Shift-click: queue five.'}`,
            });
            bx += bw + 2;
          }
        },
      });
      if (p.hangarUsed >= p.hangarCap) rows.push(this.line('HANGAR FULL: HOLD MORE WORLDS OR RAISE THEIR LEVEL', PAL.red, 'tiny', { terms: gloss('hangar', 'bay', 'level') }));
    } else if (!hearth) {
      rows.push(this.line('ONLY FORGES BUILD SHIPS', PAL.slate, 'tiny', { tip: 'Make this world a Forge (the second role button) to build ships here. Your Hearth always can.', terms: gloss('forge') }));
    }
    // Queues
    const queue = [...n.shipQ.map((q, i) => ({ q, i, kind: 'ship' as const })), ...n.buildQ.map((q, i) => ({ q, i, kind: 'build' as const }))].filter((e) => e.q.kind !== 'upgrade');
    if (queue.length) {
      rows.push({
        h: 12,
        draw: (x, y) => {
          let bx = x;
          for (const e of queue) {
            const t = (e.q.kind === 'gate' ? 'gate' : e.q.kind === 'ark' ? 'ark' : e.q.id) as UnitType;
            const id = `q-${e.kind}-${e.i}`;
            box(gx, bx, y, 14, 11, this.ui.isHot(id) ? PAL.wine : PAL.night, PAL.indigo);
            const spr = shipSprite(t, p.color, 0);
            if (spr.width <= 12) gx.drawImage(spr, bx + 7 - (spr.width >> 1), y + 5 - (spr.height >> 1));
            else icon(gx, t === 'gate' ? 'ascension' : 'forge', bx + 4, y + 2);
            const first = (e.kind === 'ship' && e.i === 0) || (e.kind === 'build' && e.i === 0);
            if (first) rect(gx, bx + 1, y + 9, Math.max(1, Math.round(12 * (e.q.t / e.q.total))), 1, PAL.teal);
            this.ui.add({ id, x: bx, y, w: 14, h: 11, onClick: () => this.actions.cancel(n.id, e.kind, e.i), tip: `${UNITS[t]?.name ?? t}: click to cancel and get ${e.q.cost} Embers back.` });
            bx += 16;
          }
        },
      });
    }
    // Extras: Starbase, Ark, Gate, rally
    const extras: { id: string; label: string; act: () => void; tip: string; dis?: string | null }[] = [];
    if (game.hasCard(p, 'bpStarbase') && game.starbaseAt(n) === 0) {
      const why = game.checkStarbase(p.id, n.id);
      extras.push({ id: 'starbase', label: `STARBASE ${game.shipCost(p, 'starbase')}`, act: () => this.actions.starbase(n.id), tip: `Build a Starbase to guard ${n.name}. It also repairs your ships here.`, dis: why });
    }
    if (hearth && (p.hangarUsed >= p.hangarCap * 0.7 || (p.bays ?? 0) > 0) && game.checkBay(p.id) !== 'No room for more bays') {
      extras.push({ id: 'bay', label: `HANGAR BAY +5 ${game.bayCost(p)}`, act: () => this.actions.bay(), tip: `Build a Hangar Bay at your Hearth: room for 5 more hangar space. Each bay costs more than the last.`, dis: game.checkBay(p.id) });
    }
    if (hearth && game.cradle && p.era < SPACE && !p.advance) {
      const last = p.era >= LAST_CRADLE_ERA;
      extras.push({ id: 'advance-card', label: `${last ? 'BUILD THE ARK' : `TO THE ${ERAS[p.era + 1].short} AGE`} ${ERAS[p.era].cost}`, act: () => this.actions.advance(), tip: this.advanceTip(), dis: game.checkAdvance(p.id) });
    }
    if (hearth && !game.cradle && game.checkArk(p.id) !== 'Your Ark still flies') {
      extras.push({ id: 'ark', label: `REBUILD ARK ${game.shipCost(p, 'ark')}`, act: () => this.actions.ark(), tip: 'Rebuild your Ark. It keeps its levels and abilities.', dis: game.checkArk(p.id) });
    }
    if (hearth && game.victories.includes('ascension') && !p.gate) {
      const why = game.checkGate(p.id, n.id);
      extras.push({ id: 'gate', label: `STARFIRE GATE ${game.shipCost(p, 'gate')}`, act: () => this.actions.gate(n.id), tip: `Raise the Starfire Gate. Protect it for ${GATE_CHARGE / 60} minutes to win by Ascension.`, dis: why });
    }
    if (hearth && p.advance) {
      const adv = p.advance;
      const last = p.era >= LAST_CRADLE_ERA;
      rows.push(this.gap(2));
      rows.push({
        h: 12,
        draw: (x, y, w) => {
          const held = n.lastHit < 5;
          text(gx, held ? 'THE WORK STANDS STILL: UNDER ATTACK' : last ? 'YOUR ARK IS RISING' : `THE ${ERAS[p.era + 1].short} AGE IS COMING`, x, y, held ? PAL.red : PAL.teal, 'tiny');
          bar(gx, x, y + 8, Math.min(w, 120), 2, adv.t / adv.total, held ? PAL.red : PAL.teal, PAL.indigo);
        },
      });
    }
    if (extras.length) {
      rows.push(this.gap(2));
      rows.push({
        h: 13,
        draw: (x, y, w) => {
          let bx = x;
          for (const e of extras) {
            const bw = Math.min(w - (bx - x), textWidth(e.label, 'tiny') + 10);
            if (bw < 30) break;
            this.ui.button(gx, e.id, bx, y, bw, 12, e.label, e.act, { font: 'tiny', disabled: !!e.dis, tip: e.tip + (e.dis ? ` (${e.dis})` : '') });
            bx += bw + 2;
          }
        },
      });
    }
    if (n.rally >= 0) {
      rows.push({
        h: 9,
        draw: (x, y) => {
          const ex = text(gx, `RALLY → ${game.nodes[n.rally].name.toUpperCase()}`, x, y + 1, PAL.sky, 'tiny');
          this.ui.hint('card-rally', x - 1, y, ex - x + 2, 8, { tip: `Ships built here fly on to ${game.nodes[n.rally].name} by themselves.`, terms: gloss('rally') });
          this.ui.button(gx, 'rally-clear', ex + 4, y - 1, 9, 9, '×', () => this.actions.rally(n.id, n.id), { font: 'tiny', tip: 'Clear the rally point' });
        },
      });
    }
    void innerW;
    return rows;
  }

  private siteRows(n: GNode, innerW: number): CardRow[] {
    const game = this.g;
    const rows: CardRow[] = [];
    switch (n.kind) {
      case 'star':
        rows.push(this.header(n.name.toUpperCase(), PAL.gold, null, 'STAR', undefined, { terms: gloss('starlane') }));
        rows.push(this.para('A star where starlanes meet. Fleets pass through here on their way between worlds.', PAL.mist, innerW, { terms: gloss('starlane', 'spool') }));
        break;
      case 'anomaly':
        rows.push(this.header(n.name.toUpperCase(), PAL.violet, null, 'ANOMALY', undefined, { terms: gloss('anomaly') }));
        rows.push(this.para(n.anomaly ? 'Something strange drifts here. Send a ship here to look inside, then choose what to do. Passing ships fly on.' : 'Already explored. Nothing more to find.', PAL.mist, innerW));
        break;
      case 'relic': {
        rows.push(this.header(n.name.toUpperCase(), PAL.sky, null, 'RELIC VAULT', undefined, { terms: gloss('relic', 'relicHunt') }));
        if (n.relic) {
          const r = RELIC_BY_ID[n.relic];
          rows.push(this.line(r.name.toUpperCase(), PAL.sky));
          rows.push(this.para(`${r.desc} Defeat its guardians, then keep your ships here, alone, for 45 seconds to dig it out.`, PAL.mist, innerW, { terms: [...gloss('relic'), ...termsIn(r.desc, { max: 2 })] }));
        } else rows.push(this.para('The vault is empty: its relic has been taken.', PAL.dusk, innerW));
        break;
      }
      case 'pirate':
        rows.push(this.header(n.name.toUpperCase(), PAL.mist, null, 'CORSAIRS', undefined, { terms: gloss('corsairs', 'stronghold') }));
        rows.push(this.para(game.pirates.alive ? 'The Blackstar Corsairs’ den. Destroy the Stronghold to end their raids for good (and win a Boon).' : 'The Stronghold lies in ruins. The raids are over.', PAL.mist, innerW));
        break;
      case 'rift': {
        rows.push(this.header(n.name.toUpperCase(), PAL.pink, null, 'THE HOLLOW', undefined, { terms: gloss('hollow', 'maw', 'riftHeart') }));
        const c = game.crisis;
        const t = !c ? 'A scar in space.' : c.dead ? 'The Rift Heart is dead. The Maw is closing.' : c.awake ? 'The Hollow pour out of the Maw. Destroy the Rift Heart inside to purge them.' : `The Maw is quiet… for now. It will open around ${fmtTime(c.awakenAt)}.`;
        rows.push(this.para(t, PAL.mist, innerW));
        break;
      }
    }
    if (n.claim?.what === 'derelict') rows.push(this.para('A derelict Dreadnought drifts here. Hold this place alone for 15 seconds to claim it.', PAL.gold, innerW, { terms: gloss('dreadnought') }));
    return rows;
  }

  private fleetRows(units: Unit[]): CardRow[] {
    const game = this.g;
    const gx = this.s.screen.g;
    const p = game.player;
    const rows: CardRow[] = [];
    const n0 = units[0].node;
    const allHere = units.every((u) => u.node === n0 && n0 >= 0);
    const dest = units.find((u) => u.lane || u.path.length)?.dest ?? -1;
    const where = allHere ? `AT ${game.nodes[n0].name.toUpperCase()}` : dest >= 0 ? `TO ${game.nodes[dest].name.toUpperCase()}` : '';
    if (units.length === 1) {
      const u = units[0];
      const def = UNITS[u.type];
      const desc = unitDesc(u.type, u.era);
      rows.push(this.header(unitName(u.type, u.era).toUpperCase() + (u.level > 1 ? ` · LEVEL ${u.level}` : ''), p.color, null, where));
      rows.push(this.para(desc, PAL.mist, 200, { terms: termsIn(desc, { exclude: def.name }) }));
      if (u.abil.length) {
        rows.push(this.line('ABILITIES: ' + u.abil.map((a) => ABILITY_BY_ID[a.id]?.name ?? a.id).join(', ').toUpperCase(), PAL.violet, 'tiny', {
          tip: u.abil.map((a) => `{${ABILITY_BY_ID[a.id]?.name ?? a.id}}: ${ABILITY_BY_ID[a.id]?.desc ?? ''}`).join('\n'),
          terms: gloss('ability'),
        }));
      }
    } else {
      rows.push(this.header(`YOUR FLEET · ${units.length} SHIPS`, p.color, null, where));
    }
    // Composition: click a type to keep only those.
    const counts = new Map<UnitType, number>();
    for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    rows.push({
      h: 13,
      draw: (x, y, w) => {
        let bx = x;
        for (const [t, c] of counts) {
          const label = `×${c}`;
          // (The chip is as wide as its ship: a Dreadnought is wider than the rest, and used to get no picture at all.)
          const spr = shipSprite(t, p.color, 0);
          const iw = Math.max(12, spr.width + 2);
          const bw = iw + 1 + textWidth(label, 'tiny');
          if (bx + bw > x + w) break;
          const id = 'comp-' + t;
          box(gx, bx, y, bw, 12, this.ui.isHot(id) ? PAL.indigo : PAL.night, PAL.indigo);
          gx.drawImage(spr, bx + Math.round(iw / 2) - (spr.width >> 1), y + 6 - (spr.height >> 1));
          text(gx, label, bx + iw, y + 4, PAL.mist, 'tiny');
          this.ui.add({ id, x: bx, y, w: bw, h: 12, onClick: () => this.s.selectType(t), tipTitle: `${UNITS[t].name} ×${c}`, tip: `${GLOSS_BY_ID[t]?.text ?? UNITS[t].short} Click to select only these.` });
          bx += bw + 2;
        }
      },
    });
    let hp = 0;
    let max = 0;
    let sh = 0;
    let shMax = 0;
    for (const u of units) {
      hp += u.hp;
      max += u.maxHp;
      sh += u.sh;
      shMax += u.maxSh;
    }
    rows.push({
      h: 8,
      draw: (x, y, w) => {
        // ("HEALTH", as the cradle calls it, is a longer word than "HULL".)
        const off = game.cradle ? textWidth('HEALTH', 'tiny') + 4 : 18;
        text(gx, 'HULL', x, y, PAL.dusk, 'tiny');
        bar(gx, x + off, y + 1, Math.min(90, w - off - 2), 2, hp / Math.max(1, max), PAL.teal, PAL.indigo);
        if (shMax > 0) bar(gx, x + off, y + 4, Math.min(90, w - off - 2), 1, sh / shMax, PAL.sky, PAL.night, undefined, 0);
        this.ui.hint('fleet-hp', x - 1, y - 1, Math.min(90, w - off - 2) + off + 2, 8, {
          tip: `Hull ${fmt(hp)} / ${fmt(max)} (green)${shMax > 0 ? ` · shields ${fmt(sh)} / ${fmt(shMax)} (blue)` : ''}. Shields soak up damage first and recharge out of battle. Bastions and Starbases repair hulls.`,
        });
      },
    });
    rows.push(this.line(this.s.view.orderMode ? 'CLICK A WORLD TO SEND THEM · ESC TO CANCEL' : 'RIGHT-CLICK A WORLD TO SEND THEM', this.s.view.orderMode ? PAL.gold : PAL.dusk));
    rows.push(this.gap(1));
    rows.push({
      h: 13,
      draw: (x, y) => {
        let bx = x;
        const btn = (id: string, label: string, act: () => void, tip: string, o: { pulse?: boolean; selected?: boolean } = {}) => {
          const bw = textWidth(label, 'tiny') + 10;
          this.ui.button(gx, id, bx, y, bw, 12, label, act, { font: 'tiny', tip, ...o });
          bx += bw + 2;
        };
        btn('move', 'MOVE', () => (this.s.view.orderMode = !this.s.view.orderMode), 'Then click a world to send these ships there.', { selected: this.s.view.orderMode });
        btn('stop', 'STOP', () => this.actions.stop(), 'Stop where they are. (S)');
        btn('retreat', 'RETREAT', () => this.actions.retreat(), 'Fall back to the nearest world you hold. (R)');
        const scouts = units.filter((u) => UNITS[u.type].role === 'scout');
        // Only while something is left to chart: a charted sector has nowhere to send them.
        if (scouts.length && game.hasUncharted(p)) {
          const many = scouts.length > 1;
          const out = scouts.every((u) => u.order === 'explore');
          const rest = scouts.length < units.length ? ' The other ships stay.' : '';
          const tip = out
            ? `Already exploring: ${many ? 'they chart' : 'it charts'} the dark by ${many ? 'themselves' : 'itself'}. (E)`
            : `Send the Scout${many ? 's' : ''} to chart the dark, world after world, by ${many ? 'themselves' : 'itself'}.${rest} (E)`;
          btn('explore', 'EXPLORE', () => this.actions.explore(), tip, { pulse: !game.ui.scouted && !out, selected: out });
        }
        const lv = units.find((u) => u.pendingAbil.length);
        if (lv) btn('learn', 'LEARN!', () => this.modals.open({ kind: 'ability', unitId: lv.id }), 'Choose a new ability.', { pulse: true });
      },
    });
    return rows;
  }

  private enemyRows(units: Unit[]): CardRow[] {
    const game = this.g;
    const f = game.factions[units[0].owner];
    const rows: CardRow[] = [];
    rows.push(this.header(game.shortName(f).toUpperCase(), f.color, null, `${units.length} ${units.length === 1 ? 'SHIP' : 'SHIPS'}`));
    rows.push(this.para(this.fleetSummary(units) + '.', PAL.mist, 200));
    if (units.length === 1) rows.push(this.para(unitDesc(units[0].type, units[0].era), PAL.dusk, 200, { terms: termsIn(unitDesc(units[0].type, units[0].era), { exclude: UNITS[units[0].type].name }) }));
    rows.push(this.line('SELECT YOUR FLEET, THEN RIGHT-CLICK THEM TO ATTACK', PAL.dusk));
    return rows;
  }

  // =====================================================================
  // Helpers for others
  // =====================================================================

  /** Screen position of a world (for the tutorial arrow). */
  nodeScreen(id: number): { x: number; y: number; r: number } {
    const n = this.g.nodes[id];
    const r = this.s.renderer;
    return { x: r.sx(n.x), y: r.sy(n.y), r: r.nodeR(n) };
  }

  /** Paragraph helper for modals. */
  paragraph(t: string, x: number, y: number, w: number, color: string = PAL.mist): number {
    return paragraph(this.s.screen.g, t, x, y, w, color, 'main');
  }

  outlineText(t: string, x: number, y: number, color: string) {
    textOutline(this.s.screen.g, t, x, y, color, PAL.void, 'main');
  }

  rightText(t: string, x: number, y: number, color: string) {
    textRight(this.s.screen.g, t, x, y, color, 'main');
  }

  worldDot(n: GNode): string {
    return worldColor(n, n.owner >= 0);
  }

  ringAt(x: number, y: number, r: number, c: string) {
    ring(this.s.screen.g, x, y, r, c);
  }

  get uiColors() {
    return UI;
  }
}
