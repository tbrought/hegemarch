import type { Game } from '../game/Game';
import { isWarship, UNITS } from '../game/data/units';
import type { Unit } from '../game/types';
import { emptyView, type Renderer, type ViewState } from '../render/Renderer';
import type { Screen } from '../render/Screen';
import type { Sfx } from '../audio/Sfx';
import type { Music } from '../audio/Music';
import type { Profile } from '../meta/profile';
import { TUTORIAL_STEPS } from '../ui/Tutorial';

export type Modal =
  | { kind: 'draft' }
  | { kind: 'event'; promptId: number }
  | { kind: 'ability'; unitId: number }
  | { kind: 'status'; tab?: 'destinies' | 'boons' | 'rivals' | 'run' }
  | { kind: 'menu' }
  | { kind: 'settings' }
  | { kind: 'help'; tab?: 'basics' | 'controls' | 'tips' }
  | { kind: 'destinies' }
  | { kind: 'nightDone' }
  | { kind: 'omens' }
  | { kind: 'cradle' }
  | { kind: 'ascend' }
  | { kind: 'log' }
  | { kind: 'confirm'; text: string; yes: string; onYes: () => void };

export interface SessionHooks {
  /** Skip the ending moment and show the results now. */
  showResults?(): void;
  quit(save: boolean): void;
  abandon(): void;
  /** Ages: the player's Ark has left the cradle; take the run on to the stars. */
  ascend?(): void;
  saveProfile(): void;
  applySettings(): void;
  /** Is the game filling the screen? Null where the browser does not offer it. */
  fullscreen(): boolean | null;
  toggleFullscreen(): void;
}

export const SPEEDS = [0.5, 1, 2, 3];

/** Which parts of the HUD are showing (a guided first run reveals them gradually). */
export interface Reveal {
  lore: boolean;
  fleet: boolean;
  destinies: boolean;
  map: boolean;
}

/** Everything about one in-progress run that the HUD, input and tutorial share. */
export class Session {
  view: ViewState = emptyView();
  paused = false;
  /** A tip card is up and holds the game while it is read (see Tips). */
  tipHold = false;
  speed = 1;
  modal: Modal | null = null;
  groups = new Map<number, number[]>();
  lastGroupKey = { key: -1, t: 0 };
  lastClick = { id: 0, t: 0 };
  /** Short messages shown in the banner slot (when the log is not revealed, or for alerts). */
  toast: { text: string; color: string; t: number } | null = null;
  /** The game-clock time when the player last interacted (for idle hints). */
  idleSince = 0;
  /** Shift is held (Shift-click queues five ships). */
  shiftHeld = false;

  constructor(
    public game: Game,
    public renderer: Renderer,
    public screen: Screen,
    public sfx: Sfx,
    public music: Music,
    public profile: Profile,
    public hooks: SessionHooks,
  ) {}

  get player() {
    return this.game.player;
  }

  get guided(): boolean {
    return !!this.game.config.tutorial;
  }

  /** Tutorial step (0 = none / finished). */
  get tutStep(): number {
    return this.game.ui.tut ?? 0;
  }

  get halted(): boolean {
    if (this.game.outcome) return true;
    if (this.paused || this.tipHold) return true;
    return !!this.modal && this.modal.kind !== 'log';
  }

  /**
   * What the player may do right now. Everything that takes input asks this one question, so that a
   * new way of stopping the game cannot forget to stop the orders too.
   *  - 'play': everything.
   *  - 'look': the game stands still (paused by the player, paused by an alarm, or held by a tip
   *    card). The player may look around, pick things to read their cards, and open and answer
   *    dialogs. No orders: a stopped game is not a place to queue up moves (the pause of an RTS, not
   *    of a tactics game).
   *  - 'none': the run is over.
   */
  get mode(): 'play' | 'look' | 'none' {
    if (this.game.outcome) return 'none';
    return this.paused || this.tipHold ? 'look' : 'play';
  }

  /** When an order was last refused because the game stands still (real seconds): what stops it flashes then. */
  refusedAt = -99;

  reveal(): Reveal {
    const g = this.game;
    const p = g.player;
    if (!this.guided || (g.ui.tut ?? 0) > TUTORIAL_STEPS) return { lore: true, fleet: true, destinies: true, map: true };
    const step = g.ui.tut ?? 1;
    return {
      lore: step >= 3 || p.stats.worldsKindled > 0,
      fleet: step >= 4 || p.stats.shipsBuilt > 0,
      destinies: p.cards.length > 0,
      map: (g.ui.sighted ?? 0) > 0,
    };
  }

  visible = (node: number) => this.view.reveal || this.game.player.visible[node] === 1;
  explored = (node: number) => this.view.reveal || this.game.player.explored[node] === 1;

  selectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.view.selected) {
      const u = this.game.units.get(id);
      if (u && !u.dead) out.push(u);
    }
    return out;
  }

  ownSelected(): Unit[] {
    return this.selectedUnits().filter((u) => u.owner === this.game.playerId);
  }

  /** A seed ship on its way to kindle a world. Until that is done (or called off) it belongs to no fleet. */
  onMission(u: Unit): boolean {
    return u.type === 'seed' && u.order === 'kindle';
  }

  /**
   * The selected ships an order goes to. A seed ship on a kindling mission keeps flying when it is
   * selected along with other ships; only an order given to seed ships alone redirects it.
   */
  commandable(): Unit[] {
    const own = this.ownSelected();
    const free = own.filter((u) => !this.onMission(u));
    return free.length ? free : own;
  }

  selectUnits(ids: number[], add = false, order = true) {
    if (!add) this.view.selected.clear();
    for (const id of ids) this.view.selected.add(id);
    // A fleet badge, a box or a group never sweeps up a seed ship on a mission: it is only selected
    // by itself (a click on it, or a box around seed ships alone).
    const picked = this.ownSelected();
    if (picked.some((u) => !this.onMission(u))) for (const u of picked) if (this.onMission(u)) this.view.selected.delete(u.id);
    if (ids.length) this.view.selectedNode = -1;
    const own = this.ownSelected();
    // (Picked while the game stands still, ships are looked at, not about to be sent.)
    this.view.orderMode = order && this.mode === 'play' && own.some((u) => !UNITS[u.type].isStatic);
  }

  toggleUnit(id: number) {
    if (this.view.selected.has(id)) this.view.selected.delete(id);
    else this.view.selected.add(id);
    this.view.selectedNode = -1;
    this.view.orderMode = this.mode === 'play' && this.ownSelected().length > 0;
  }

  selectNode(id: number) {
    this.view.selected.clear();
    this.view.orderMode = false;
    this.view.selectedNode = id;
  }

  clearSelection() {
    this.view.selected.clear();
    this.view.selectedNode = -1;
    this.view.orderMode = false;
  }

  /** Remove dead or out-of-sight foreign units from the selection. */
  pruneSelection() {
    for (const id of [...this.view.selected]) {
      const u = this.game.units.get(id);
      if (!u || u.dead) this.view.selected.delete(id);
      else if (u.owner !== this.game.playerId && (u.node < 0 || !this.visible(u.node))) this.view.selected.delete(id);
    }
    if (this.view.orderMode && this.ownSelected().length === 0) this.view.orderMode = false;
  }

  /** All of the player's ships at a world (the "fleet" behind a badge). */
  fleetAt(node: number): Unit[] {
    return this.game.buckets[node].filter((u) => !u.dead && u.owner === this.game.playerId && !UNITS[u.type].isStatic && u.type !== 'fighter' && !this.onMission(u));
  }

  focusNode(id: number, zoom?: number) {
    const n = this.game.nodes[id];
    this.renderer.cam.focus(n.x, n.y, zoom ?? Math.max(this.renderer.cam.tzoom, 0.16));
  }

  focusUnit(u: Unit) {
    this.renderer.cam.focus(u.x, u.y, Math.max(this.renderer.cam.tzoom, 0.2));
  }

  marker(x: number, y: number, color: string) {
    this.view.markers.push({ x, y, t: 0.7, color });
  }

  selectWarships(): number {
    const ids = this.game.unitList.filter((u) => !u.dead && u.owner === this.game.playerId && isWarship(u.type)).map((u) => u.id);
    this.selectUnits(ids);
    return ids.length;
  }

  selectType(type: string) {
    const ids = this.ownSelected()
      .filter((u) => u.type === type)
      .map((u) => u.id);
    this.selectUnits(ids);
  }

  setGroup(k: number) {
    const ids = this.ownSelected().map((u) => u.id);
    if (ids.length) this.groups.set(k, ids);
  }

  recallGroup(k: number, now: number) {
    const ids = (this.groups.get(k) ?? []).filter((id) => {
      const u = this.game.units.get(id);
      return !!u && !u.dead;
    });
    if (!ids.length) return;
    this.groups.set(k, ids);
    this.selectUnits(ids);
    if (this.lastGroupKey.key === k && now - this.lastGroupKey.t < 0.4) {
      const u = this.game.units.get(ids[0])!;
      this.focusUnit(u);
    }
    this.lastGroupKey = { key: k, t: now };
  }

  showToast(text: string, color: string, t = 4) {
    this.toast = { text, color, t };
  }
}
