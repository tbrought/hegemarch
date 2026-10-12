import type { Game } from '../game/Game';
import { UNITS } from '../game/data/units';
import type { GNode, Unit } from '../game/types';
import { Camera } from './Camera';
import { Effects } from './Effects';
import { fit, text, textCenter, textOutline, textWidth } from './font';
import { buildGround, drawHolding, drawSettlement, type Ground } from './ground';
import { PAL, light, shade } from './palette';
import { clipSeg, dither, frame, line, rect, ring, type Ctx } from './pixel';
import type { Screen } from './Screen';
import { drawShip, facing, icon, isTroopArt, shipSprite, silhouette, spriteSize } from './sprites';
import { ANOMALY_RAMP, DARK_RAMP, drawWorldBlend, forgetWorlds, MAW_DORMANT_RAMP, MAW_RAMP, quantRadius, starSprite, swirlSprite, worldColor, worldSprite } from './worlds';

export interface ViewState {
  selected: Set<number>;
  selectedNode: number;
  hoverUnit: number;
  hoverNode: number;
  /** Drag-select rectangle in game pixels. */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Click markers in world coordinates. */
  markers: { x: number; y: number; t: number; color: string }[];
  /** Show the whole map (attract mode, debugging). */
  reveal: boolean;
  /** Ships are selected and the next click on a world gives them an order. */
  orderMode: boolean;
  /** A world to point out (tutorial). */
  highlightNode: number;
  /** Seconds the way of the last order is still drawn bright (Actions.ROUTE_FLASH). */
  route: number;
  /** Leave out names and labels (the ending of a run, once its words are on the screen). */
  plain?: boolean;
  /**
   * A world the player is thinking of making a Bastion (the pointer is on that role's button): the map
   * shows where its field would reach before it is done. -1 or absent for none.
   */
  fieldPreview?: number;
}

export function emptyView(reveal = false): ViewState {
  return { selected: new Set(), selectedNode: -1, hoverUnit: 0, hoverNode: -1, box: null, markers: [], reveal, orderMode: false, highlightNode: -1, route: 0 };
}

interface BgStar {
  x: number;
  y: number;
  b: number;
  p: number;
  sp: number;
  layer: number;
}

/** Below this zoom ships are drawn as single pixels (fleet badges carry the detail). */
export const SPRITE_ZOOM = 0.075;
/** Below this zoom the map switches to its strategic look. */
export const STRATEGIC_ZOOM = 0.03;

export class Renderer {
  cam = new Camera();
  fx = new Effects();
  ready = true;
  private stars: BgStar[] = [];
  private lit = new Map<number, number>();
  private time = 0;
  private game: Game | null = null;
  /** The land and sea of the cradle world (Ages runs); null among the stars. */
  private ground: Ground | null = null;
  /** Offsets for the current frame (screen shake). */
  private ox = 0;
  private oy = 0;

  constructor(public screen: Screen) {
    this.makeStars();
    this.cam.resize(screen.W, screen.H);
    screen.onResize(() => {
      this.cam.resize(screen.W, screen.H);
      this.makeStars();
    });
  }

  private makeStars() {
    const W = Math.max(this.screen.W, 480) * 2;
    const H = Math.max(this.screen.H, 270) * 2;
    let s = 1234567;
    const r = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    this.stars = [];
    const n = Math.round((W * H) / 900);
    for (let i = 0; i < n; i++) {
      const layer = r() < 0.6 ? 0 : r() < 0.75 ? 1 : 2;
      this.stars.push({ x: r() * W, y: r() * H, b: r() < 0.06 ? 2 : r() < 0.3 ? 1 : 0, p: r() * 6.28, sp: 0.4 + r() * 2, layer });
    }
  }

  /** Attach a game: camera bounds, kindle states. */
  prepare(g: Game) {
    this.game = g;
    this.cam.setBounds(g.bounds.minX, g.bounds.minY, g.bounds.maxX, g.bounds.maxY);
    this.cam.resize(this.screen.W, this.screen.H);
    this.lit.clear();
    this.fx.clear();
    forgetWorlds();
    this.ground = g.cradle ? buildGround(g) : null;
    this.fx.nodePos = (id) => {
      const n = this.game?.nodes[id];
      return n ? { x: n.x, y: n.y, r: n.r } : null;
    };
  }

  // ---------------------------------------------------------------------
  // Coordinates
  // ---------------------------------------------------------------------

  sx(wx: number): number {
    return Math.round((wx - this.cam.x) * this.cam.zoom + this.cam.w / 2 + this.ox);
  }

  sy(wy: number): number {
    return Math.round((wy - this.cam.y) * this.cam.zoom + this.cam.h / 2 + this.oy);
  }

  /** Pixel radius of a world on screen. */
  nodeR(n: GNode): number {
    return Math.max(n.kind === 'star' ? 3 : 2, Math.round(n.r * this.cam.zoom));
  }

  // ---------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------

  /** `backdrop`: the map is only scenery behind the menus, so it draws no names or labels. */
  render(g: Game, alpha: number, dt: number, view: ViewState, backdrop = false) {
    const ctx = this.screen.g;
    this.time += dt;
    this.cam.update(dt);
    // (The shake wears off in real time: worn off with the game's time, it went on for as long as a pause
    // that came in the middle of it lasted.)
    this.fx.shake = Math.max(0, this.fx.shake - dt * 8);
    const sh = this.fx.shake;
    this.ox = sh > 0.2 ? Math.round((Math.random() - 0.5) * sh * 2) : 0;
    this.oy = sh > 0.2 ? Math.round((Math.random() - 0.5) * sh * 2) : 0;
    const W = this.screen.W;
    const H = this.screen.H;
    const p = g.player;
    const vis = (i: number) => view.reveal || p.visible[i] === 1;
    const explored = (i: number) => view.reveal || p.explored[i] === 1;
    const ownerShown = (n: GNode) => (vis(n.id) ? n.owner : p.seenOwner[n.id]);

    rect(ctx, 0, 0, W, H, PAL.void);
    if (this.ground) this.drawGround(ctx, this.ground);
    else {
      this.drawStars(ctx);
      this.drawSystemHalos(ctx, g, explored);
    }
    this.drawLanes(ctx, g, explored, vis, view);
    if (!backdrop) this.drawFieldReaches(ctx, g, explored, vis, view);
    if (!backdrop) this.drawRoutes(ctx, g, view, dt);
    for (const n of g.nodes) {
      if (!explored(n.id)) continue;
      this.drawNode(ctx, g, n, vis(n.id), ownerShown(n), view, dt);
    }
    this.drawUnits(ctx, g, alpha, view, vis);
    this.drawProjectiles(ctx, g, alpha, vis);
    this.fx.draw(ctx, this.cam, this.ox, this.oy);
    // The drag-select box: its dotted fill goes under the world names so they stay readable.
    const b = view.box;
    const box = b && { x: Math.round(Math.min(b.x0, b.x1)), y: Math.round(Math.min(b.y0, b.y1)), w: Math.round(Math.abs(b.x1 - b.x0)), h: Math.round(Math.abs(b.y1 - b.y0)) };
    if (box) dither(ctx, box.x, box.y, box.w, box.h, PAL.gold, 2);
    if (!backdrop && !view.plain) this.drawLabels(ctx, g, explored, vis, ownerShown, view);
    this.drawMarkers(ctx, view, dt);
    if (box) frame(ctx, box.x, box.y, box.w + 1, box.h + 1, PAL.gold);
  }

  /** The cradle's land and sea: the part of its picture that the camera sees, scaled to the screen. */
  private drawGround(ctx: Ctx, G: Ground) {
    const v = this.cam.view();
    const kx = G.canvas.width / G.w;
    const ky = G.canvas.height / G.h;
    ctx.drawImage(G.canvas, (v.x0 - G.x0) * kx, (v.y0 - G.y0) * ky, (v.x1 - v.x0) * kx, (v.y1 - v.y0) * ky, this.ox, this.oy, this.cam.w, this.cam.h);
  }

  private drawStars(ctx: Ctx) {
    const W = this.screen.W;
    const H = this.screen.H;
    const bw = Math.max(W, 480) * 2;
    const bh = Math.max(H, 270) * 2;
    const t = this.time;
    for (const s of this.stars) {
      const par = s.layer === 0 ? 0.02 : s.layer === 1 ? 0.05 : 0.1;
      let x = (s.x - this.cam.x * this.cam.zoom * par * 4) % bw;
      let y = (s.y - this.cam.y * this.cam.zoom * par * 4) % bh;
      if (x < 0) x += bw;
      if (y < 0) y += bh;
      if (x >= W || y >= H) continue;
      const tw = Math.sin(t * s.sp + s.p) > 0.6;
      const c = s.b === 2 ? (tw ? PAL.bone : PAL.mist) : s.b === 1 ? (tw ? PAL.mist : PAL.dusk) : tw ? PAL.slate : PAL.indigo;
      ctx.fillStyle = c;
      ctx.fillRect(x | 0, y | 0, 1, 1);
      if (s.b === 2 && tw) {
        ctx.fillStyle = PAL.dusk;
        ctx.fillRect((x | 0) - 1, y | 0, 1, 1);
        ctx.fillRect((x | 0) + 1, y | 0, 1, 1);
        ctx.fillRect(x | 0, (y | 0) - 1, 1, 1);
        ctx.fillRect(x | 0, (y | 0) + 1, 1, 1);
      }
    }
  }

  /** A faint dithered glow around each charted system, so the sector reads as clusters. */
  private drawSystemHalos(ctx: Ctx, g: Game, explored: (i: number) => boolean) {
    const z = this.cam.zoom;
    if (z > 0.05) return;
    for (const s of g.systems) {
      if (!explored(s.star)) continue;
      const R = s.radius * 0.95 * z;
      const x = this.sx(s.x);
      const y = this.sy(s.y);
      if (x + R < 0 || y + R < 0 || x - R > this.cam.w || y - R > this.cam.h) continue;
      if (R < 6) continue;
      ctx.fillStyle = this.halo(z);
      const r = Math.round(R);
      for (let yy = -r; yy <= r; yy++) {
        const w = Math.floor(Math.sqrt(r * r - yy * yy));
        ctx.fillRect(x - w, y + yy, w * 2 + 1, 1);
      }
    }
  }

  private haloPattern: CanvasPattern | null = null;
  private halo(_z: number): CanvasPattern | string {
    if (!this.haloPattern) {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const g = c.getContext('2d')!;
      g.fillStyle = PAL.night;
      g.fillRect(0, 0, 1, 1);
      g.fillRect(2, 2, 1, 1);
      this.haloPattern = this.screen.g.createPattern(c, 'repeat');
    }
    return this.haloPattern ?? PAL.night;
  }

  private drawLanes(ctx: Ctx, g: Game, explored: (i: number) => boolean, vis: (i: number) => boolean, view: ViewState) {
    const z = this.cam.zoom;
    const W = this.cam.w;
    const H = this.cam.h;
    const phase = Math.floor(this.time * 6);
    // Lanes our own ships are using right now get marching dots.
    const busy = new Set<string>();
    for (const u of g.unitList) {
      if (u.dead || !u.lane || u.owner !== g.playerId) continue;
      const a = Math.min(u.lane.from, u.lane.to);
      const b = Math.max(u.lane.from, u.lane.to);
      busy.add(a + '-' + b);
    }
    for (const l of g.lanes) {
      if (!explored(l.a) || !explored(l.b)) continue;
      const A = g.nodes[l.a];
      const B = g.nodes[l.b];
      const interstellar = A.kind === 'star' && B.kind === 'star' && A.system !== B.system;
      const ax = this.sx(A.x);
      const ay = this.sy(A.y);
      const bx = this.sx(B.x);
      const by = this.sy(B.y);
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.hypot(dx, dy) || 1;
      const ra = this.nodeR(A) + 3;
      const rb = this.nodeR(B) + 3;
      if (d < ra + rb + 2) continue;
      const ux = dx / d;
      const uy = dy / d;
      const seg = clipSeg(ax + ux * ra, ay + uy * ra, bx - ux * rb, by - uy * rb, -2, -2, W + 2, H + 2);
      if (!seg) continue;
      const key = Math.min(l.a, l.b) + '-' + Math.max(l.a, l.b);
      const seen = vis(l.a) || vis(l.b);
      let c: string = seen ? (interstellar ? PAL.slate : PAL.indigo) : PAL.night;
      // (On the cradle's dark ground a path has to be brighter than a starlane on the void.)
      if (this.ground) c = seen ? PAL.dusk : PAL.slate;
      if (z < STRATEGIC_ZOOM && interstellar) c = seen ? PAL.dusk : PAL.slate;
      if (busy.has(key)) {
        line(ctx, seg[0], seg[1], seg[2], seg[3], PAL.indigo, 1);
        line(ctx, seg[0], seg[1], seg[2], seg[3], shade(g.player.color), 4, -phase);
      } else {
        line(ctx, seg[0], seg[1], seg[2], seg[3], c, interstellar ? 2 : 3);
      }
    }
    void view;
  }

  /**
   * Where the Bastions' fields reach (`Game.fieldReaches`): a violet line along each starlane out of a
   * Bastion, to the places one jump away (which wear the field's ring, like the Bastion). The player's
   * own are always drawn; another house's where the player sees one end of the stretch. A world the
   * player is thinking of making a Bastion (`view.fieldPreview`) shows its starlanes the same way, in
   * dots that run outward.
   */
  private drawFieldReaches(ctx: Ctx, g: Game, explored: (i: number) => boolean, vis: (i: number) => boolean, view: ViewState) {
    if (this.cam.zoom < 0.03) return;
    const seen = new Set<string>();
    for (const r of g.fieldReaches()) {
      const a = r.from;
      const b = r.to;
      if (!explored(a) || !explored(b) || !(r.owner === g.playerId || vis(a) || vis(b))) continue;
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      const seg = this.laneSeg(g.nodes[a], g.nodes[b]);
      if (seg) line(ctx, seg[0], seg[1], seg[2], seg[3], PAL.violet, 2);
    }
    const pv = view.fieldPreview ?? -1;
    if (pv < 0 || !g.nodes[pv]) return;
    const phase = Math.floor(this.time * 8);
    for (const b of g.neighbours(pv)) {
      if (!explored(b) || seen.has(Math.min(pv, b) + '-' + Math.max(pv, b))) continue;
      const seg = this.laneSeg(g.nodes[pv], g.nodes[b]);
      if (seg) line(ctx, seg[0], seg[1], seg[2], seg[3], PAL.violet, 3, -phase);
    }
  }

  /**
   * The way the selected ships of ours will take, from where they are to where they are bound, stop by
   * stop: bright for a moment after an order, then dim while they stay selected. A leg into a place the
   * house knows to be dangerous (`Game.dangerKnown`) is red: a playtester sent fleets through an enemy
   * fleet he could have seen, because nothing showed him the way they would go.
   */
  private drawRoutes(ctx: Ctx, g: Game, view: ViewState, dt: number) {
    view.route = Math.max(0, view.route - dt);
    if (!view.selected.size) return;
    const legs = new Map<string, [number, number]>();
    const ends = new Set<number>();
    for (const id of view.selected) {
      const u = g.units.get(id);
      if (!u || u.dead || u.owner !== g.playerId || (!u.lane && !u.path.length)) continue;
      let at = u.node;
      if (u.lane) {
        legs.set(u.lane.from + '>' + u.lane.to, [u.lane.from, u.lane.to]);
        at = u.lane.to;
      }
      for (const nx of u.path) {
        legs.set(at + '>' + nx, [at, nx]);
        at = nx;
      }
      if (u.dest >= 0) ends.add(u.dest);
    }
    if (!legs.size) return;
    const bright = view.route > 0;
    // (Fading out over the last half second of the flash: every other dot first.)
    const step = bright ? (view.route > 0.5 ? 1 : 2) : 3;
    const phase = Math.floor(this.time * 8);
    for (const [a, b] of legs.values()) {
      const seg = this.laneSeg(g.nodes[a], g.nodes[b]);
      if (!seg) continue;
      const danger = g.dangerKnown(g.playerId, b);
      const c = danger ? (bright ? PAL.red : PAL.wine) : bright ? PAL.teal : PAL.sea;
      line(ctx, seg[0], seg[1], seg[2], seg[3], c, step, -phase);
    }
    for (const id of ends) {
      const n = g.nodes[id];
      const r = this.nodeR(n) + 5;
      ring(ctx, this.sx(n.x), this.sy(n.y), r, bright ? PAL.teal : PAL.sea, bright ? 1 : 3);
    }
  }

  /** The part of the line between two places that lies outside both of them, on the screen (null: none). */
  private laneSeg(A: GNode, B: GNode): number[] | null {
    const ax = this.sx(A.x);
    const ay = this.sy(A.y);
    const bx = this.sx(B.x);
    const by = this.sy(B.y);
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy) || 1;
    const ra = this.nodeR(A) + 3;
    const rb = this.nodeR(B) + 3;
    if (d < ra + rb + 2) return null;
    const ux = dx / d;
    const uy = dy / d;
    return clipSeg(ax + ux * ra, ay + uy * ra, bx - ux * rb, by - uy * rb, -2, -2, this.cam.w + 2, this.cam.h + 2);
  }

  private drawNode(ctx: Ctx, g: Game, n: GNode, visible: boolean, owner: number, view: ViewState, dt: number) {
    const z = this.cam.zoom;
    const x = this.sx(n.x);
    const y = this.sy(n.y);
    const wellR = n.well * z;
    if (x + wellR < -20 || y + wellR < -20 || x - wellR > this.cam.w + 20 || y - wellR > this.cam.h + 20) return;
    const r = this.nodeR(n);
    const t = this.time;

    // Gravity well edge (where ships gather) for visible worlds at closer zoom.
    if (visible && z >= 0.05 && n.kind !== 'star') ring(ctx, x, y, wellR, this.ground ? PAL.indigo : PAL.night, 4);
    // An anti-warp field (a Bastion, a Hearth, a Starbase): a second, violet ring just inside the edge. A
    // place one jump from a Bastion, which its field reaches, has the same ring: a violet ring is a
    // field, wherever it comes from. (Clear of the place itself: a star's well is small.) A world the
    // player is thinking of making a Bastion shows the rings it would bring, blinking.
    const pv = view.fieldPreview ?? -1;
    const previewed = pv >= 0 && (pv === n.id || g.neighbours(pv).includes(n.id));
    const blink = Math.floor(t * 4) % 2 === 0;
    if (z >= 0.08 && ((visible && g.fieldsOver(n).length) || (previewed && blink))) ring(ctx, x, y, Math.max(wellR - 3, this.nodeR(n) * 2 + 6), PAL.violet, 8);

    if (n.kind === 'star') {
      const s = starSprite(r, n.starColor);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
      if (n.hazard && n.hazard.warn > 0 && Math.floor(t * 4) % 2 === 0) ring(ctx, x, y, r * 2 + 3, PAL.red, 2);
      if (n.hazard && n.hazard.warn <= 0) ring(ctx, x, y, r * 2.2 + 2 + (Math.floor(t * 10) % 3), PAL.ember, 1);
    } else if (n.kind === 'planet') {
      // Kindle dissolve: track a visual "lit" amount per world.
      const target = owner >= 0 ? 1 : 0;
      let l = this.lit.get(n.id);
      if (l === undefined) l = target;
      if (l !== target) l = target > l ? Math.min(1, l + dt / 1.3) : Math.max(0, l - dt / 1.0);
      this.lit.set(n.id, l);
      if (r <= 2) {
        ctx.fillStyle = l > 0.5 ? (this.ground && owner >= 0 ? g.factions[owner].color : worldColor(n, true)) : PAL.slate;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        if (r === 2) {
          ctx.fillRect(x - 2, y, 1, 1);
          ctx.fillRect(x + 2, y, 1, 1);
          ctx.fillRect(x, y - 2, 1, 1);
          ctx.fillRect(x, y + 2, 1, 1);
        }
      } else if (this.ground) {
        // A land of the cradle: its settlement, on ground lit in its house's color.
        const f = owner >= 0 ? g.factions[owner] : null;
        if (f && visible) drawHolding(ctx, x, y, Math.round(r * 2.4 + 5), f.color);
        drawSettlement(ctx, n, x, y, r, { era: f ? f.era : -1, color: f ? f.color : PAL.slate, level: n.level, hearth: n.capitalOf >= 0, lit: l, t });
      } else {
        const qr = quantRadius(r);
        drawWorldBlend(ctx, n, r, x - qr, y - qr, l);
      }
      if (!visible) dither(ctx, x - r - 1, y - r - 1, r * 2 + 3, r * 2 + 3, PAL.void, 5);
      // House ring (arc = glow).
      if (owner >= 0) {
        const f = g.factions[owner];
        const rr = r + (r > 6 ? 3 : 2);
        if (visible && n.glow < 1 && n.owner === owner) this.arcRing(ctx, x, y, rr, n.glow, f.color, shade(f.color));
        else ring(ctx, x, y, rr, visible ? f.color : shade(f.color));
        if (n.capitalOf >= 0 && r >= 3) icon(ctx, 'conquest', x - 2, y - r - (r > 6 ? 12 : 9), f.color, true);
        if (visible && n.lastHit < 1.5 && Math.floor(t * 6) % 2 === 0) ring(ctx, x, y, rr + 2, PAL.red, 1);
        // Protected by a Bastion next door: a ring of the field's violet close about it, which flares
        // white for a moment when it takes a hit for the world. (Blinking, for a world that would be.)
        if (visible && r >= 3 && g.guardsOf(n).length) ring(ctx, x, y, rr + 4, n.lastHit < 0.25 ? PAL.bone : PAL.violet, 1);
        else if (previewed && blink && r >= 3 && pv !== n.id && n.owner === g.nodes[pv].owner) ring(ctx, x, y, rr + 4, PAL.violet, 1);
      }
      // A seed ship at work: progress ring.
      if (visible && owner < 0) {
        for (const u of g.buckets[n.id]) {
          if (u.type !== 'seed' || u.order !== 'kindle' || u.orderTarget !== n.id || u.kindle <= 0) continue;
          const c = g.factions[u.owner].color;
          this.arcRing(ctx, x, y, r + 3, u.kindle / 20, c, PAL.night);
          break;
        }
      }
    } else if (n.kind === 'anomaly') {
      const frameN = Math.floor(t * 3) % 8;
      const s = n.anomaly ? swirlSprite(Math.max(3, r), ANOMALY_RAMP, n.seed, frameN) : swirlSprite(Math.max(3, r), DARK_RAMP, n.seed, 0);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
      if (n.anomaly && visible && Math.floor(t * 2) % 2 === 0) icon(ctx, 'anomaly', x - 2, y - r - 9);
    } else if (n.kind === 'relic') {
      const rr = Math.max(3, r);
      ring(ctx, x, y, rr, n.relic ? PAL.sky : PAL.slate, 2);
      ring(ctx, x, y, Math.max(2, rr - 3), n.relic ? PAL.slate : PAL.indigo, 1);
      if (n.relic) icon(ctx, 'relic', x - 2, y - 3);
    } else if (n.kind === 'pirate') {
      const s = worldSprite({ ...n, ptype: 'barren', id: -1000 - n.id } as GNode, Math.max(3, r), false);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
      if (g.pirates.alive && Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = PAL.red;
        ctx.fillRect(x - Math.round(r * 0.4), y, 1, 1);
        ctx.fillRect(x + Math.round(r * 0.3), y - Math.round(r * 0.3), 1, 1);
      }
    } else if (n.kind === 'rift') {
      const awake = !!g.crisis?.awake && !g.crisis.dead;
      const frameN = awake ? Math.floor(t * 4) % 8 : Math.floor(t) % 8;
      const s = swirlSprite(Math.max(4, r), awake ? MAW_RAMP : MAW_DORMANT_RAMP, n.seed, frameN);
      ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
    }

    // Claims (relic digs, derelicts): a progress ring.
    if (visible && n.claim && n.claim.f >= 0 && n.claim.t > 0) {
      const need = n.claim.what === 'relic' ? 45 : 15;
      this.arcRing(ctx, x, y, r + 6, n.claim.t / need, g.factions[n.claim.f].color, PAL.night);
    }
    if (visible && n.claim?.what === 'derelict' && z > 0.02) icon(ctx, 'skull', x + r + 3, y - r - 3);

    // Selection, hover, tutorial highlight.
    if (view.selectedNode === n.id) {
      const rr = r + 6;
      this.brackets(ctx, x - rr, y - rr, rr * 2, rr * 2, PAL.bone);
    } else if (view.hoverNode === n.id) {
      const rr = r + 5;
      this.brackets(ctx, x - rr, y - rr, rr * 2, rr * 2, view.orderMode ? PAL.gold : PAL.dusk);
    }
    if (view.highlightNode === n.id) {
      const k = (t * 1.5) % 1;
      ring(ctx, x, y, r + 6 + Math.round(k * 10), k < 0.5 ? PAL.gold : PAL.ember, 2);
    }
  }

  /** A ring drawn solid for the first `frac` of a turn (clockwise from the top), dotted after. */
  private arcRing(ctx: Ctx, cx: number, cy: number, r: number, frac: number, c1: string, c2: string) {
    const steps = Math.max(16, Math.round(r * 6.3));
    const lim = Math.max(0, Math.min(1, frac)) * steps;
    let lx = -9999;
    let ly = -9999;
    for (let i = 0; i < steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * r);
      const py = Math.round(cy + Math.sin(a) * r);
      if (px === lx && py === ly) continue;
      lx = px;
      ly = py;
      if (i < lim) {
        ctx.fillStyle = c1;
        ctx.fillRect(px, py, 1, 1);
      } else if (i % 3 === 0) {
        ctx.fillStyle = c2;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  /** Corner brackets around a rectangle. */
  brackets(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    const k = Math.max(2, Math.min(5, Math.round(Math.min(w, h) / 4)));
    ctx.fillStyle = c;
    ctx.fillRect(x, y, k, 1);
    ctx.fillRect(x, y, 1, k);
    ctx.fillRect(x + w - k + 1, y, k, 1);
    ctx.fillRect(x + w, y, 1, k);
    ctx.fillRect(x, y + h, k, 1);
    ctx.fillRect(x, y + h - k + 1, 1, k);
    ctx.fillRect(x + w - k + 1, y + h, k, 1);
    ctx.fillRect(x + w, y + h - k + 1, 1, k);
  }

  private drawUnits(ctx: Ctx, g: Game, alpha: number, view: ViewState, vis: (i: number) => boolean) {
    const z = this.cam.zoom;
    const sprites = z >= SPRITE_ZOOM;
    const flick = Math.floor(this.time * 8) % 2 === 0;
    const W = this.cam.w;
    const H = this.cam.h;
    // Statics first so ships draw on top of stations.
    for (let pass = 0; pass < 2; pass++) {
      for (const u of g.unitList) {
        if (u.dead) continue;
        const def = UNITS[u.type];
        const isStatic = !!def.isStatic;
        if ((pass === 0) !== isStatic) continue;
        if (u.node >= 0 ? !vis(u.node) : !(u.lane && (vis(u.lane.from) || vis(u.lane.to)) && (u.owner === g.playerId || view.reveal || vis(u.lane.to)))) continue;
        const wx = u.px + (u.x - u.px) * alpha;
        const wy = u.py + (u.y - u.py) * alpha;
        const x = this.sx(wx);
        const y = this.sy(wy);
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
        const color = g.factions[u.owner].color;
        if (u.type === 'heart') {
          this.drawHeart(ctx, x, y, u);
          continue;
        }
        if (u.type === 'fighter') {
          if (!sprites) continue;
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = light(color);
          ctx.fillRect(x + Math.round(Math.cos(u.a)), y + Math.round(Math.sin(u.a)), 1, 1);
          continue;
        }
        if (!sprites) {
          ctx.fillStyle = color;
          const big = def.radius >= 20 || isStatic;
          ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
          if (view.selected.has(u.id)) {
            ctx.fillStyle = PAL.bone;
            ctx.fillRect(x, y - 2, 1, 1);
          }
          continue;
        }
        const a = u.pa + angleLerp(u.pa, u.a) * alpha;
        const dir = facing(u.type, u.era, a);
        // (A troop's legs move only while it does.)
        const step = isTroopArt(u.type, u.era) ? (Math.abs(u.x - u.px) + Math.abs(u.y - u.py) > 0.02 ? Math.floor(this.time * 7 + u.id * 0.37) % 2 === 0 : true) : flick;
        const sel = view.selected.has(u.id);
        const hov = view.hoverUnit === u.id;
        if (sel || hov) {
          const s = silhouette(u.type, sel ? PAL.bone : PAL.dusk, dir, u.era);
          const sx = x - (s.width >> 1);
          const sy = y - (s.height >> 1);
          ctx.drawImage(s, sx - 1, sy);
          ctx.drawImage(s, sx + 1, sy);
          ctx.drawImage(s, sx, sy - 1);
          ctx.drawImage(s, sx, sy + 1);
        }
        {
          const sh = silhouette(u.type, PAL.void, dir, u.era);
          ctx.drawImage(sh, x - (sh.width >> 1) + 1, y - (sh.height >> 1) + 1);
        }
        const hurt = u.lastHit < 0.08;
        if (hurt && u.sh <= 0) {
          const s = silhouette(u.type, PAL.bone, dir, u.era);
          ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
        } else drawShip(ctx, u.type, color, x, y, a, step, u.era);
        if (u.stun > 0 && flick) {
          ctx.fillStyle = PAL.sky;
          ctx.fillRect(x, y - 4, 1, 1);
        }
        // Held by a Gravity Snare (it cannot jump): ringed in violet, so the hold can be seen.
        if (u.snare > 0) {
          const { w, h } = spriteSize(u.type, u.era);
          ring(ctx, x, y, Math.ceil(Math.max(w, h) / 2) + 2, flick ? PAL.violet : PAL.pink, 2);
        }
        // Health bars for damaged or selected ships.
        const hpf = u.hp / Math.max(1, u.maxHp);
        const shf = u.maxSh > 0 ? u.sh / u.maxSh : 0;
        if ((sel || hov || hpf < 0.999 || (u.maxSh > 0 && shf < 0.999)) && z >= 0.12 && !u.lane) {
          const { w, h } = spriteSize(u.type, u.era);
          const bw = Math.max(5, Math.min(18, w + 1));
          const bx = x - (bw >> 1);
          const by = y - Math.ceil(Math.max(w, h) / 2) - 3;
          rect(ctx, bx, by, bw, 1, PAL.night);
          rect(ctx, bx, by, Math.max(1, Math.round(bw * hpf)), 1, hpf > 0.5 ? PAL.teal : hpf > 0.25 ? PAL.gold : PAL.red);
          // (No sliver for a shield that is as good as gone: it recharges a trickle even under fire.)
          if (u.maxSh > 0 && Math.round(bw * shf) > 0) rect(ctx, bx, by - 1, Math.round(bw * shf), 1, PAL.sky);
        }
        if (u.level > 1 && z >= 0.15 && (u.type === 'ark' || u.type === 'dreadnought')) {
          text(ctx, String(u.level), x + 6, y + 3, PAL.gold, 'tiny');
        }
      }
    }
  }

  private drawHeart(ctx: Ctx, x: number, y: number, u: Unit) {
    const z = this.cam.zoom;
    const r = Math.max(4, Math.round(70 * z));
    const pulse = Math.sin(this.time * 3) > 0;
    const s = swirlSprite(r, MAW_RAMP, 99, Math.floor(this.time * 5) % 8);
    ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
    const core = Math.max(2, Math.round(r * 0.35));
    ctx.fillStyle = pulse ? PAL.bone : PAL.pink;
    ctx.fillRect(x - core, y - 1, core * 2 + 1, 3);
    ctx.fillStyle = PAL.wine;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    const barrier = u.buffs.find((b) => b.id === 'barrier');
    if (this.game && barrier) {
      ring(ctx, x, y, r + 3, Math.floor(this.time * 6) % 2 ? PAL.violet : PAL.pink, 2);
      // How long the barrier holds, over the Heart: until then it shrugs off nine tenths of every hit.
      if (z >= 0.06) textCenter(ctx, `BARRIER ${fmtTime(Math.ceil(barrier.t))}`, x, y - r - 12, PAL.pink, 'tiny');
    }
  }

  private drawProjectiles(ctx: Ctx, g: Game, alpha: number, vis: (i: number) => boolean) {
    const z = this.cam.zoom;
    if (z < SPRITE_ZOOM * 0.7) return;
    for (const p of g.projectiles) {
      if (!vis(p.node)) continue;
      const x = this.sx(p.px + (p.x - p.px) * alpha);
      const y = this.sy(p.py + (p.y - p.py) * alpha);
      if (x < -4 || y < -4 || x > this.cam.w + 4 || y > this.cam.h + 4) continue;
      const c = g.factions[p.owner]?.color ?? PAL.bone;
      switch (p.kind) {
        case 'shell':
          ctx.fillStyle = PAL.ember;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.fillStyle = PAL.gold;
          ctx.fillRect(x - 1, y - 1, 1, 1);
          break;
        case 'lance': {
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const d = Math.hypot(dx, dy) || 1;
          line(ctx, x, y, x - Math.round((dx / d) * 6), y - Math.round((dy / d) * 6), light(c));
          break;
        }
        case 'missile':
          ctx.fillStyle = PAL.bone;
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = PAL.ember;
          ctx.fillRect(x - Math.sign(p.x - p.px), y - Math.sign(p.y - p.py), 1, 1);
          break;
        default:
          ctx.fillStyle = light(c);
          ctx.fillRect(x, y, 1, 1);
          if (z > 0.25) {
            ctx.fillStyle = c;
            ctx.fillRect(x - Math.sign(p.x - p.px), y - Math.sign(p.y - p.py), 1, 1);
          }
      }
    }
  }

  /** A world's level as three pips in a triangle: lit up to the level; the next one blinks while it is being raised. */
  private levelPips(ctx: Ctx, x: number, y: number, n: GNode, color: string, mine: boolean) {
    rect(ctx, x - 1, y - 1, 8, 7, PAL.void);
    const rising = mine && n.buildQ.some((q) => q.kind === 'upgrade') && Math.floor(this.time * 3) % 2 === 0;
    const at = [[0, 3], [4, 3], [2, 0]];
    at.forEach(([px, py], i) => rect(ctx, x + px, y + py, 2, 2, i < n.level ? color : i === n.level && rising ? PAL.bone : PAL.slate));
  }

  private drawLabels(ctx: Ctx, g: Game, explored: (i: number) => boolean, vis: (i: number) => boolean, ownerShown: (n: GNode) => number, view: ViewState) {
    const z = this.cam.zoom;
    if (z < STRATEGIC_ZOOM) {
      for (const s of g.systems) {
        if (!explored(s.star)) continue;
        const x = this.sx(s.x);
        const y = this.sy(s.y) + Math.round(s.radius * z) + 2;
        if (x < -40 || x > this.cam.w + 40 || y < -10 || y > this.cam.h + 10) continue;
        textCenter(ctx, s.name.toUpperCase(), x, y, PAL.dusk, 'tiny');
      }
      return;
    }
    for (const n of g.nodes) {
      if (!explored(n.id) || n.kind === 'star') continue;
      const x = this.sx(n.x);
      const r = this.nodeR(n);
      const y = this.sy(n.y) + r + (r > 6 ? 5 : 3);
      if (x < -60 || x > this.cam.w + 60 || y < -10 || y > this.cam.h + 10) continue;
      const owner = ownerShown(n);
      const near = z >= 0.11;
      const focus = view.selectedNode === n.id || view.hoverNode === n.id;
      if (!near && !focus && n.kind === 'planet' && owner < 0 && z < 0.05) continue;
      // (A place with nothing left in it has its name in grey: no need to fly there again.)
      const c = owner >= 0 ? g.factions[owner].color : g.siteSpent(n) ? PAL.slate : n.kind === 'planet' ? PAL.dusk : n.kind === 'anomaly' ? PAL.violet : n.kind === 'relic' ? PAL.sky : n.kind === 'pirate' ? PAL.mist : PAL.pink;
      let label = n.name.toUpperCase();
      if (!near) label = fit(label, 60, 'tiny');
      const lx = x - Math.round(textWidth(label, 'tiny') / 2);
      textOutline(ctx, label, lx, y, c, PAL.void, 'tiny');
      // How far a world has been raised: three pips beside its name, lit up to its level, at any zoom
      // that shows the name (so the worlds still to raise can be found without clicking through them).
      if (n.kind === 'planet' && owner >= 0 && (owner === g.playerId || vis(n.id))) this.levelPips(ctx, lx - 9, y - 1, n, c, owner === g.playerId);
      if (near && n.kind === 'planet' && vis(n.id)) {
        const sub = owner >= 0 ? `${'I'.repeat(n.level)}${n.capitalOf >= 0 ? ' HEARTH' : n.role ? ' ' + n.role.toUpperCase() : ''}` : this.ground ? 'WILD LAND' : `${n.size} WORLD`;
        textOutline(ctx, sub, x - Math.round(textWidth(sub, 'tiny') / 2), y + 6, owner >= 0 ? shade(c) === PAL.indigo ? PAL.dusk : light(shade(c)) : PAL.slate, PAL.void, 'tiny');
      }
    }
  }

  private drawMarkers(ctx: Ctx, view: ViewState, dt: number) {
    for (const m of view.markers) m.t -= dt;
    view.markers = view.markers.filter((m) => m.t > 0);
    for (const m of view.markers) {
      const x = this.sx(m.x);
      const y = this.sy(m.y);
      const r = Math.round(2 + (0.7 - m.t) * 14);
      ring(ctx, x, y, r, m.color, 2);
      ctx.fillStyle = m.color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // ---------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------

  pickUnit(g: Game, sx: number, sy: number, vis: (n: number) => boolean): Unit | null {
    const z = this.cam.zoom;
    if (z < SPRITE_ZOOM) return null;
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of g.unitList) {
      if (u.dead || u.type === 'fighter') continue;
      if (u.node >= 0 ? !vis(u.node) : u.owner !== g.playerId) continue;
      const x = this.sx(u.x);
      const y = this.sy(u.y);
      const { w, h } = spriteSize(u.type, u.era);
      const r = Math.max(4, Math.max(w, h) / 2 + 1);
      const d = Math.hypot(x - sx, y - sy);
      if (d <= r && d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  pickNode(g: Game, sx: number, sy: number, explored: (n: number) => boolean, wellToo: boolean): GNode | null {
    let best: GNode | null = null;
    let bd = Infinity;
    const z = this.cam.zoom;
    for (const n of g.nodes) {
      if (!explored(n.id)) continue;
      const x = this.sx(n.x);
      const y = this.sy(n.y);
      const d = Math.hypot(x - sx, y - sy);
      const r = Math.max(6, this.nodeR(n) + 4);
      const lim = wellToo ? Math.max(r, n.well * z) : r;
      if (d <= lim && d - r < bd) {
        bd = d - r;
        best = n;
      }
    }
    return best;
  }

  /** Units of the player inside a screen rectangle. */
  unitsInBox(g: Game, x0: number, y0: number, x1: number, y1: number): number[] {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const out: number[] = [];
    for (const u of g.unitList) {
      if (u.dead || u.owner !== g.playerId || UNITS[u.type].isStatic || u.type === 'fighter') continue;
      const x = this.sx(u.x);
      const y = this.sy(u.y);
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) out.push(u.id);
    }
    return out;
  }

  /** Sprite helper for UI thumbnails. */
  shipThumb(type: Unit['type'], color: string, era?: number): HTMLCanvasElement {
    return shipSprite(type, color, 0, false, era);
  }
}

function angleLerp(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
