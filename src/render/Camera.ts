import { clamp } from '../game/util';

export class Camera {
  x = 0;
  y = 0;
  zoom = 0.1;
  tx = 0;
  ty = 0;
  tzoom = 0.1;
  /** Viewport size in game pixels. */
  w = 1;
  h = 1;
  minZoom = 0.01;
  maxZoom = 0.6;
  /** How quickly the view reaches where it is headed (higher is snappier). */
  ease = 12;
  bounds = { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 };
  private anchor: { sx: number; sy: number; wx: number; wy: number } | null = null;

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.fitLimits();
    this.tzoom = clamp(this.tzoom, this.minZoom, this.maxZoom);
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
  }

  setBounds(minX: number, minY: number, maxX: number, maxY: number) {
    this.bounds = { minX, minY, maxX, maxY };
    this.fitLimits();
  }

  private fitLimits() {
    const bw = this.bounds.maxX - this.bounds.minX;
    const bh = this.bounds.maxY - this.bounds.minY;
    this.minZoom = Math.min(this.w / (bw * 1.08), this.h / (bh * 1.08));
  }

  fitAll() {
    this.tzoom = this.zoom = this.minZoom;
    this.tx = this.x = (this.bounds.minX + this.bounds.maxX) / 2;
    this.ty = this.y = (this.bounds.minY + this.bounds.maxY) / 2;
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.w / 2, (wy - this.y) * this.zoom + this.h / 2];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.zoom + this.x, (sy - this.h / 2) / this.zoom + this.y];
  }

  /** Zoom toward a screen point, keeping the world point under the cursor fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.tzoom = clamp(this.tzoom * factor, this.minZoom, this.maxZoom);
    this.anchor = { sx, sy, wx, wy };
  }

  pan(dxScreen: number, dyScreen: number) {
    this.tx -= dxScreen / this.zoom;
    this.ty -= dyScreen / this.zoom;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.anchor = null;
    this.clampPos();
  }

  /** Is a world point (with a margin in world units) inside the view? */
  sees(wx: number, wy: number, margin: number): boolean {
    const hw = this.w / 2 / this.zoom + margin;
    const hh = this.h / 2 / this.zoom + margin;
    return Math.abs(wx - this.x) <= hw && Math.abs(wy - this.y) <= hh;
  }

  focus(wx: number, wy: number, zoom?: number) {
    this.tx = wx;
    this.ty = wy;
    if (zoom !== undefined) this.tzoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.anchor = null;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * this.ease);
    this.zoom += (this.tzoom - this.zoom) * k;
    if (this.anchor) {
      // keep anchored world point under the cursor while zooming
      this.x = this.anchor.wx - (this.anchor.sx - this.w / 2) / this.zoom;
      this.y = this.anchor.wy - (this.anchor.sy - this.h / 2) / this.zoom;
      this.tx = this.x;
      this.ty = this.y;
      if (Math.abs(this.tzoom - this.zoom) < this.zoom * 0.002) this.anchor = null;
    } else {
      this.x += (this.tx - this.x) * k;
      this.y += (this.ty - this.y) * k;
    }
    this.clampPos();
  }

  private clampPos() {
    const m = 1500;
    this.x = clamp(this.x, this.bounds.minX - m, this.bounds.maxX + m);
    this.y = clamp(this.y, this.bounds.minY - m, this.bounds.maxY + m);
    this.tx = clamp(this.tx, this.bounds.minX - m, this.bounds.maxX + m);
    this.ty = clamp(this.ty, this.bounds.minY - m, this.bounds.maxY + m);
  }

  /** World-space view rectangle. */
  view(): { x0: number; y0: number; x1: number; y1: number } {
    const [x0, y0] = this.screenToWorld(0, 0);
    const [x1, y1] = this.screenToWorld(this.w, this.h);
    return { x0, y0, x1, y1 };
  }
}
