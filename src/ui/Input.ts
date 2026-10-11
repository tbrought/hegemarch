import type { Session } from '../app/Session';
import { SPEEDS } from '../app/Session';
import { UNITS } from '../game/data/units';
import { PAL } from '../render/palette';
import type { Hud } from './Hud';
import { BUILD_KEYS } from './keys';

const DRAG_PX = 4;

/** Mouse and keyboard. UI regions get first pick; everything else goes to the map. */
export class Input {
  private keys = new Set<string>();
  private drag: { button: number; x: number; y: number; moved: boolean; box: boolean } | null = null;
  private cleanup: (() => void)[] = [];
  private pointer = { x: -1, y: -1, inside: false };

  constructor(private s: Session, private hud: Hud, private canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(window, 'pointermove', (e: PointerEvent) => this.move(e));
    on(window, 'pointerup', (e: PointerEvent) => this.up(e));
    on(canvas, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(canvas, 'pointerleave', () => (this.pointer.inside = false));
    on(canvas, 'pointerenter', () => (this.pointer.inside = true));
    on(window, 'keydown', (e: KeyboardEvent) => this.keydown(e));
    on(window, 'keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.s.shiftHeld = e.shiftKey;
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.s.shiftHeld = false;
    });
  }

  destroy() {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }

  private get g() {
    return this.s.game;
  }

  private pos(e: PointerEvent | WheelEvent): [number, number] {
    return this.s.screen.toInternal(e.clientX, e.clientY);
  }

  // ---------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------

  private down(e: PointerEvent) {
    this.s.shiftHeld = e.shiftKey;
    const [x, y] = this.pos(e);
    this.pointer = { x, y, inside: true };
    this.s.idleSince = this.g.time;
    if (this.hud.ui.pointerDown(x, y, e.button)) {
      e.preventDefault();
      return;
    }
    if (this.s.modal) {
      if (this.hud.modals.closable()) this.hud.modals.close();
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.drag = { button: e.button, x, y, moved: false, box: false };
    e.preventDefault();
  }

  private move(e: PointerEvent) {
    const [x, y] = this.pos(e);
    const dx = x - this.pointer.x;
    const dy = y - this.pointer.y;
    this.pointer.x = x;
    this.pointer.y = y;
    this.hud.ui.pointerMove(x, y);
    const d = this.drag;
    if (d) {
      if (!d.moved && Math.hypot(x - d.x, y - d.y) > DRAG_PX) d.moved = true;
      if (d.moved) {
        if (d.button === 0 && !this.s.modal) {
          d.box = true;
          this.s.view.box = { x0: d.x, y0: d.y, x1: x, y1: y };
        } else if (d.button === 1 || d.button === 2) {
          this.s.renderer.cam.pan(dx, dy);
        }
      }
    }
    this.hover();
  }

  private hover() {
    const v = this.s.view;
    v.hoverUnit = 0;
    v.hoverNode = -1;
    if (this.s.modal || this.hud.ui.hot || !this.pointer.inside) {
      this.canvas.style.cursor = this.hud.ui.hot ? 'pointer' : 'default';
      return;
    }
    const r = this.s.renderer;
    const u = r.pickUnit(this.g, this.pointer.x, this.pointer.y, this.s.visible);
    if (u) v.hoverUnit = u.id;
    const n = r.pickNode(this.g, this.pointer.x, this.pointer.y, this.s.explored, v.orderMode);
    if (n && !u) v.hoverNode = n.id;
    // (One of our own ships is picked by a click, even while an order waits for its destination.)
    const own = !!u && u.owner === this.g.playerId;
    this.canvas.style.cursor = v.orderMode && (n || u) && !own ? 'crosshair' : u || n ? 'pointer' : 'default';
  }

  private up(e: PointerEvent) {
    const [x, y] = this.pos(e);
    const d = this.drag;
    this.drag = null;
    this.s.view.box = null;
    const uiTook = this.hud.ui.pointerUp(x, y, e.button);
    if (!d) return;
    if (uiTook && !d.moved) return;
    if (d.box && d.button === 0) {
      const ids = this.s.renderer.unitsInBox(this.g, d.x, d.y, x, y);
      if (ids.length) {
        this.s.selectUnits(ids, e.shiftKey);
        this.s.sfx.play('select', 0.5);
      }
      return;
    }
    if (d.moved) return;
    if (d.button === 0) this.leftClick(x, y, e.shiftKey);
    else if (d.button === 2) this.rightClick(x, y, e.shiftKey);
  }

  private leftClick(x: number, y: number, shift: boolean) {
    const s = this.s;
    const g = this.g;
    const r = s.renderer;
    const v = s.view;
    const u = r.pickUnit(g, x, y, s.visible);
    // Order mode: the click is a destination.
    if (v.orderMode && s.ownSelected().length) {
      if (u && g.hostile(g.playerId, u.owner)) {
        this.hud.actions.attack(u.id);
        v.orderMode = false;
        return;
      }
      // One of our own ships under the pointer: the click picks it (below), it is not an order. Without
      // this a second ship at the same world could never be clicked: the world all around it took the click.
      if (!(u && u.owner === g.playerId)) {
        const n = r.pickNode(g, x, y, s.explored, true);
        if (n) {
          const [wx, wy] = r.cam.screenToWorld(x, y);
          const inWell = Math.hypot(wx - n.x, wy - n.y) <= n.well;
          // (With Shift the order is a stop on the way, and the next click can add another.)
          if (this.hud.actions.orderAt(n.id, inWell ? wx : undefined, inWell ? wy : undefined, shift) && !shift) v.orderMode = false;
          return;
        }
        v.orderMode = false;
        return;
      }
    }
    if (u) {
      const now = performance.now() / 1000;
      if (u.owner === g.playerId) {
        if (shift) s.toggleUnit(u.id);
        else if (s.lastClick.id === u.id && now - s.lastClick.t < 0.35 && u.node >= 0) {
          // Double click: every ship of this type at this world.
          const ids = g.buckets[u.node].filter((o) => o.owner === g.playerId && o.type === u.type && !o.dead).map((o) => o.id);
          s.selectUnits(ids);
        } else s.selectUnits([u.id]);
        s.lastClick = { id: u.id, t: now };
      } else {
        s.selectUnits([u.id], false, false);
      }
      s.sfx.play('select', 0.4);
      return;
    }
    const n = r.pickNode(g, x, y, s.explored, false);
    if (n) {
      s.selectNode(n.id);
      s.sfx.play('select', 0.35);
      return;
    }
    s.clearSelection();
  }

  private rightClick(x: number, y: number, shift = false) {
    const s = this.s;
    const g = this.g;
    const r = s.renderer;
    const own = s.ownSelected();
    if (own.length) {
      const u = r.pickUnit(g, x, y, s.visible);
      if (u && g.hostile(g.playerId, u.owner)) {
        this.hud.actions.attack(u.id);
        s.view.orderMode = false;
        return;
      }
      const n = r.pickNode(g, x, y, s.explored, true);
      if (n) {
        const [wx, wy] = r.cam.screenToWorld(x, y);
        const inWell = Math.hypot(wx - n.x, wy - n.y) <= n.well;
        this.hud.actions.orderAt(n.id, inWell ? wx : undefined, inWell ? wy : undefined, shift);
        s.view.orderMode = false;
      }
      return;
    }
    // A Forge selected: right-click another world to set where new ships gather.
    const sel = s.view.selectedNode;
    if (sel >= 0 && g.nodes[sel].owner === g.playerId) {
      const n = r.pickNode(g, x, y, s.explored, true);
      if (n) this.hud.actions.rally(sel, n.id);
      return;
    }
    s.clearSelection();
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    if (this.s.modal) {
      this.hud.modals.wheel(e.deltaY);
      return;
    }
    const [x, y] = this.pos(e);
    const k = e.deltaY > 0 ? 1 / 1.22 : 1.22;
    this.s.renderer.cam.zoomAt(x, y, k);
  }

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  private keydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    this.keys.add(e.code);
    const s = this.s;
    const g = this.g;
    const code = e.code;
    s.idleSince = g.time;
    // The run is over: no key does anything but show its results.
    if (s.mode === 'none') {
      e.preventDefault();
      if (code === 'Enter' || code === 'Space' || code === 'Escape') s.hooks.showResults?.();
      return;
    }
    if (code === 'Escape') {
      e.preventDefault();
      if (s.modal) this.hud.modals.close();
      else if (s.view.orderMode) s.view.orderMode = false;
      else if (s.view.selected.size || s.view.selectedNode >= 0) s.clearSelection();
      else this.hud.modals.open({ kind: 'menu' });
      return;
    }
    if (s.modal) {
      if (this.hud.modals.key(code)) e.preventDefault();
      if (code === 'KeyB' && (s.modal.kind === 'draft' || s.modal.kind === 'status')) this.hud.modals.close();
      if (code === 'KeyU' && s.modal.kind === 'status') this.hud.modals.close();
      if ((code === 'KeyH' || code === 'F1') && s.modal.kind === 'help') this.hud.modals.close();
      if ((code === 'Space' || code === 'Enter') && (s.modal.kind === 'status' || s.modal.kind === 'help' || s.modal.kind === 'log' || s.modal.kind === 'omens')) {
        e.preventDefault();
        this.hud.modals.close();
      }
      return;
    }
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit) {
      const k = parseInt(digit[1], 10);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        s.setGroup(k);
        s.sfx.play('select', 0.4);
      } else s.recallGroup(k, performance.now() / 1000);
      return;
    }
    if (this.buildKey(code)) {
      e.preventDefault();
      return;
    }
    switch (code) {
      case 'Tab':
        e.preventDefault();
        this.hud.actions.nextForge(e.shiftKey ? -1 : 1);
        break;
      case 'Space':
        e.preventDefault();
        // A tip card holds the game: Space answers it (OK), as it would end a pause.
        if (s.tipHold) this.hud.tips.dismiss();
        else s.paused = !s.paused;
        break;
      case 'Equal':
      case 'NumpadAdd': {
        const i = SPEEDS.indexOf(s.speed);
        s.speed = SPEEDS[Math.min(SPEEDS.length - 1, i + 1)];
        break;
      }
      case 'Minus':
      case 'NumpadSubtract': {
        const i = SPEEDS.indexOf(s.speed);
        s.speed = SPEEDS[Math.max(0, i - 1)];
        break;
      }
      case 'KeyB':
        if (g.player.pendingDrafts > 0) this.hud.modals.open({ kind: 'draft' });
        else this.hud.modals.open({ kind: 'status', tab: 'boons' });
        break;
      case 'KeyU':
        this.hud.modals.open({ kind: 'status' });
        break;
      case 'KeyH':
      case 'F1':
        e.preventDefault();
        this.hud.modals.open({ kind: 'help' });
        break;
      case 'KeyL':
        this.hud.modals.open({ kind: 'log' });
        break;
      case 'KeyF':
        if (s.selectWarships()) s.sfx.play('select', 0.5);
        break;
      case 'KeyS':
        this.hud.actions.stop();
        break;
      case 'KeyR':
        this.hud.actions.retreat();
        break;
      case 'KeyA':
        if (this.s.game.cradle) this.hud.actions.advance();
        break;
      case 'KeyE':
        this.hud.actions.explore();
        break;
      case 'KeyK':
        if (s.view.selectedNode >= 0) this.hud.actions.kindle(s.view.selectedNode);
        break;
      case 'KeyC':
      case 'Home':
        if (g.player.capital >= 0) s.focusNode(g.player.capital);
        break;
      case 'KeyM':
        s.view.orderMode = s.mode === 'play' && s.ownSelected().length > 0 && !s.view.orderMode;
        break;
    }
  }

  /**
   * Q W E R T Y (ui/keys.ts): with one of the player's worlds that builds selected, and no ships, a key
   * is the ship button in that place of its panel. True if the key was taken for it; otherwise it keeps
   * its own meaning (E: explore, R: retreat).
   */
  private buildKey(code: string): boolean {
    const i = BUILD_KEYS.indexOf(code);
    if (i < 0) return false;
    const s = this.s;
    const g = this.g;
    const n = s.view.selectedNode >= 0 ? g.nodes[s.view.selectedNode] : null;
    if (!n || n.owner !== g.playerId || !g.isForge(n) || s.ownSelected().length) return false;
    const t = g.shipTypesFor(g.player)[i];
    // (Shift with the key queues five, as Shift with a click does.)
    s.shiftHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (t) this.hud.actions.build(n.id, t);
    return true;
  }

  /** Per-frame: keyboard and edge panning. */
  update(dt: number) {
    const cam = this.s.renderer.cam;
    const speed = 240 * dt;
    let dx = 0;
    let dy = 0;
    if (!this.s.modal) {
      if (this.keys.has('ArrowLeft')) dx -= speed;
      if (this.keys.has('ArrowRight')) dx += speed;
      if (this.keys.has('ArrowUp')) dy -= speed;
      if (this.keys.has('ArrowDown')) dy += speed;
      if (this.s.profile.settings.edgePan && this.pointer.inside && !this.drag) {
        const m = 3;
        if (this.pointer.x <= m) dx -= speed;
        if (this.pointer.x >= this.s.screen.W - m) dx += speed;
        if (this.pointer.y <= m) dy -= speed;
        if (this.pointer.y >= this.s.screen.H - m) dy += speed;
      }
    }
    if (dx || dy) cam.pan(-dx, -dy);
    this.hover();
    void UNITS;
    void PAL;
  }
}
