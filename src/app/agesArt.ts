/**
 * The picture of an Ages run: the climb, as a row of figures on a path. A Hunter, a Chariot, a
 * Horseman, a Dragoon and an Armored Car march on the spot, each in the color of a house, and at the
 * end of the path an Ark lifts into the stars. It stands on the AGES RUN button of the title screen
 * and over the setup of an Ages run, where the six ages are named beneath it.
 *
 * Like the house banners, it is drawn with the game's own sprites on a small canvas shown at three
 * times its size.
 */
import { LAST_CRADLE_ERA, SPACE } from '../game/data/eras';
import { HEIRS } from '../game/data/heirs';
import { PAL } from '../render/palette';
import { ctx2d } from '../render/pixel';
import { shipSprite } from '../render/sprites';

const SCALE = 3;

/** Draw every such picture on the page (call once a frame while a menu shows). */
export function drawAgesArt(root: HTMLElement, t: number) {
  root.querySelectorAll<HTMLCanvasElement>('canvas.ages-art').forEach((el) => {
    const w = Math.max(60, Math.round(el.clientWidth / SCALE));
    const h = Math.max(12, Math.round(el.clientHeight / SCALE));
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    draw(ctx2d(el), w, h, t, !!el.closest('button, .ages-head')?.matches(':hover'));
  });
}

function hash(i: number): number {
  let h = Math.imul(i + 11, 374761393) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, lively: boolean) {
  g.clearRect(0, 0, w, h);
  const ground = h - 2;
  // Six places, evenly spaced (the names of the ages line up under them): five on the path, the last in the sky.
  const at = (i: number) => Math.round((w * (i + 0.5)) / 6);
  // The path, as far as the foot of the Ark.
  g.fillStyle = PAL.slate;
  for (let x = 2; x < at(LAST_CRADLE_ERA) + 8; x += 3) g.fillRect(x, ground, 1, 1);
  // The stars the Ark is bound for: more of them toward the right.
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(w * (0.72 + hash(i * 3) * 0.28));
    const y = Math.floor(hash(i * 3 + 1) * (h - 4));
    const beat = Math.sin(t * (1 + hash(i * 3 + 2) * 2) + i);
    if (beat < -0.3) continue;
    g.fillStyle = beat > 0.7 ? PAL.bone : i % 3 === 0 ? PAL.mist : PAL.dusk;
    g.fillRect(x, y, 1, 1);
  }
  // The swift line of each age, marching on the spot (faster under the pointer).
  const pace = lively ? 10 : 5;
  for (let era = 0; era <= LAST_CRADLE_ERA; era++) {
    const step = Math.floor(t * pace + era * 0.6) % 2 === 0;
    const spr = shipSprite('striker', HEIRS[era % HEIRS.length].color, 0, step, era);
    g.drawImage(spr, at(era) - (spr.width >> 1), ground - spr.height);
  }
  // The Ark, nose up, riding its own fire.
  const color = HEIRS[SPACE % HEIRS.length].color;
  const ark = shipSprite('ark', color, 12, Math.floor(t * 9) % 2 === 0, SPACE);
  const lift = Math.round(Math.sin(t * (lively ? 3 : 1.4)) * 1.2);
  const ax = at(SPACE) - (ark.width >> 1);
  const ay = Math.max(0, Math.round((h - ark.height) / 2) - 1 + lift);
  g.drawImage(ark, ax, ay);
  g.fillStyle = Math.floor(t * 12) % 2 === 0 ? PAL.gold : PAL.ember;
  g.fillRect(at(SPACE), ay + ark.height, 1, 1 + (Math.floor(t * 7) % 2));
}
