import type { Session } from '../app/Session';
import { LAST_CRADLE_ERA, SPACE } from '../game/data/eras';
import { isWarship } from '../game/data/units';
import type { Faction, Note, Unit, VictoryId } from '../game/types';
import { setVocabulary } from '../render/font';
import { PAL } from '../render/palette';
import { setArtEra, setInlineBadgeColor } from '../render/sprites';
import { Actions } from './Actions';
import { fmt } from './format';
import { Modals } from './Modals';
import { Tips } from './Tips';
import { Tutorial } from './Tutorial';
import { Goals } from './Goals';
import { Ending } from './Ending';
import { dimScreen, Ui } from './Ui';
import { cradleVocabulary } from './vocab';
import { drawBanner, drawPaused, drawTopBar, objective, watching } from './hud/topbar';
import { chipText, destinyClocks, drawAges, drawDestinies } from './hud/destinies';
import { jumpWait, jumpWaitText } from './hud/fleetCard';
import { drawFlyers, drawTray } from './hud/tray';
import { drawAttackArrows, drawBadges, drawIndicators, drawLog, drawMinimap, KIND_COLOR } from './hud/overlays';
import { drawCard } from './hud/card';

/**
 * The HUD: everything drawn over the map while a run is played, on the game's own canvas. It is drawn
 * again from nothing every frame (`draw`), and what can be clicked is whatever was drawn (ui/Ui.ts).
 *
 * This class holds the HUD's state and the order in which its parts are drawn; each part is a module
 * of functions in hud/ that take the HUD:
 *
 *   hud/topbar.ts      the top bar, the line under it that says what to do next, "paused"
 *   hud/destinies.ts   the Destiny chips (or the ages, on the cradle of an Ages run)
 *   hud/tray.ts        the Boon tray
 *   hud/overlays.ts    fleet badges, attack arrows, decisions waiting, the comms log, the minimap
 *   hud/card.ts        the card of what is selected; hud/worldCard.ts and hud/fleetCard.ts fill it
 *
 * Dialogs are ui/Modals.ts; what a click does goes through ui/Actions.ts to the game's commands.
 */
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
  clock = 0;
  /** Card rectangle from the last frame (input uses it to keep clicks off the map). */
  cardRect = { x: 0, y: 0, w: 0, h: 0 };
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Right edge and bottom of the comms log lines drawn this frame (0 when none). */
  logRight = 0;
  logBottom = 0;
  /** Boons in flight from the draft to their slot in the tray. */
  flyers: { id: string; x: number; y: number; t: number }[] = [];
  /** UI time when a Boon landed in the tray (for the flash). */
  landed = new Map<string, number>();
  trayPos = new Map<string, { x: number; y: number }>();
  /** The Ember count as drawn: it rolls toward the real value. */
  embersShown = -1;
  lastEmbers = -1;
  /** "+250" / "-120" popups under the Ember counter. */
  emberPops: { text: string; color: string; t: number }[] = [];
  /** The end of the run, when it comes (ui/Ending.ts). */
  ending: Ending;
  /** Game time of the last "Embers are piling up" nudge. */
  private lastNudge = -999;
  /** The top bar's tooltips (its figures), kept to be read again above an open dialog. */
  barTips: { id: string; x: number; y: number; w: number; h: number; tip: string | (() => string) }[] = [];

  /** How many Forges were idle at the last frame, and when one more went idle (the button flashes for `IDLE_FLASH` s). */
  idleShown = 0;
  idleFlashAt = -99;
  /** Ability choices that have opened by themselves already (ship, level and choices waiting). */
  private abilityShown = new Set<string>();

  /** Where the banner was drawn this frame (the right-hand column keeps clear of it). */
  bannerRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(public s: Session) {
    this.actions = new Actions(s);
    this.ending = new Ending(s, this.ui);
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
      if (n.loss && watching(this, n.loss.node)) continue;
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
      if (pr) this.modals.open({ kind: 'event', promptId: pr.id, unbidden: true });
      else if (!s.view.box) {
        // An Ark or a Dreadnought that may learn an ability is a decision too: its choice opens by itself,
        // once. (It waited behind a small button at the edge of the screen, easy to miss, above all right
        // after the Boon that gave the levels.) Closed without a choice, it waits behind that button.
        const key = (x: Unit) => `${x.id}:${x.level}:${x.pendingAbil.length}`;
        const u = g.unitList.find((x) => !x.dead && x.owner === g.playerId && x.pendingAbil.length > 0 && !this.abilityShown.has(key(x)));
        if (u) {
          this.abilityShown.add(key(u));
          this.modals.open({ kind: 'ability', unitId: u.id, unbidden: true });
        }
      }
    }
    this.tutorial.update(dt);
    this.tips.update(dt);
    this.goals.update(dt);
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
    else if (p.hangarUsed >= p.hangarCap && p.embers >= 600) hint = 'Your hangar is full: raise your worlds, hold more of them, or build a Hangar ' +
        'Bay at your Hearth.';
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
    this.s.view.fieldPreview = -1;
    // The run is over: the map and its ending have the screen to themselves.
    if (this.g.outcome) {
      this.ending.draw(g, this.W, this.H);
      if (this.s.profile.settings.crt) this.scanlines();
      return;
    }
    this.ui.explainTerms = this.s.profile.settings.explainTerms !== false;
    setInlineBadgeColor(this.g.player.color);
    const R = this.s.reveal();
    if (R.fleet) drawBadges(this);
    if (R.map) drawLog(this);
    drawCard(this);
    if (R.map) drawMinimap(this);
    drawTopBar(this, R);
    drawBanner(this);
    if (R.destinies) this.g.cradle ? drawAges(this) : drawDestinies(this);
    if (R.lore) drawTray(this);
    if (R.map) drawAttackArrows(this);
    drawIndicators(this);
    this.tips.draw(g);
    this.tutorial.draw(g);
    if (this.s.modal) {
      dimScreen(g, this.W, this.H, 14, this.s.modal.kind === 'log' ? 0.55 : 0.7);
      this.modals.draw(g);
      // The top bar is not dimmed, and its figures can still be read: a Boon to choose is a question of
      // Lore and Embers. (Under the dialog's backdrop its tooltips used to go dark.)
      for (const t of this.barTips) this.ui.hint(t.id + '-read', t.x, t.y, t.w, t.h, { tip: t.tip });
    } else if (this.s.paused && !this.g.outcome) {
      drawPaused(this);
    }
    drawFlyers(this, dt);
    if (this.s.profile.settings.crt) this.scanlines();
    this.ui.drawTooltip(g, this.W, this.H);
  }

  private scanlines() {
    const g = this.s.screen.g;
    g.fillStyle = 'rgba(11,10,26,0.22)';
    for (let y = 1; y < this.H; y += 2) g.fillRect(0, y, this.W, 1);
  }

  // ---- What the HUD says, in words: read by the browser tests (scripts/*.mjs), which cannot import a module ----
  objective() { return objective(this); }
  chipText(f: Faction, v: VictoryId) { return chipText(this, f, v); }
  destinyClocks() { return destinyClocks(this); }
  jumpWait(units: Unit[]) { return jumpWait(this, units); }
  jumpWaitText(w: { left: number; held: boolean; fire: boolean; snared: boolean }) { return jumpWaitText(w); }

  /** Screen position of a world (for the tutorial arrow). */
  nodeScreen(id: number): { x: number; y: number; r: number } {
    const n = this.g.nodes[id];
    const r = this.s.renderer;
    return { x: r.sx(n.x), y: r.sy(n.y), r: r.nodeR(n) };
  }
}
