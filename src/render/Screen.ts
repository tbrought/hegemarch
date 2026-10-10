/**
 * The low-resolution game canvas. Its internal size is the window size divided by a whole-number
 * scale, so every game pixel is a crisp square of device pixels.
 */
import { ctx2d, type Ctx } from './pixel';

export type PixelSize = 'small' | 'auto' | 'large';

const BASE: Record<PixelSize, [number, number]> = {
  small: [640, 360],
  auto: [480, 270],
  large: [400, 225],
};

export class Screen {
  readonly canvas: HTMLCanvasElement;
  g: Ctx;
  W = 480;
  H = 270;
  scale = 1;
  dpr = 1;
  pixelSize: PixelSize = 'auto';
  private listeners: (() => void)[] = [];

  /** `host`: an element the canvas fills (the website's opening picture); without one it fills the window. */
  constructor(canvas: HTMLCanvasElement, private host: HTMLElement | null = null) {
    this.canvas = canvas;
    this.g = ctx2d(canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (host && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(host);
  }

  onResize(fn: () => void) {
    this.listeners.push(fn);
  }

  setPixelSize(p: PixelSize) {
    this.pixelSize = p;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.max(1, Math.floor((this.host ? this.host.clientWidth : window.innerWidth) * dpr));
    const devH = Math.max(1, Math.floor((this.host ? this.host.clientHeight : window.innerHeight) * dpr));
    const [bw, bh] = BASE[this.pixelSize];
    let scale = Math.max(1, Math.floor(Math.min(devW / bw, devH / bh)));
    // Inside a host, a game pixel is never smaller than two CSS pixels (on a phone's narrow screen
    // the picture would otherwise shrink to specks).
    if (this.host) scale = Math.max(scale, Math.round(2 * dpr));
    const W = Math.ceil(devW / scale);
    const H = Math.ceil(devH / scale);
    if (W !== this.canvas.width || H !== this.canvas.height) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.canvas.style.width = `${(W * scale) / dpr}px`;
    this.canvas.style.height = `${(H * scale) / dpr}px`;
    this.g = ctx2d(this.canvas);
    this.W = W;
    this.H = H;
    this.scale = scale;
    this.dpr = dpr;
    for (const fn of this.listeners) fn();
  }

  /** Convert a pointer position (CSS pixels) to game pixels. */
  toInternal(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / Math.max(1, r.width)) * this.W;
    const y = ((clientY - r.top) / Math.max(1, r.height)) * this.H;
    return [x, y];
  }
}
