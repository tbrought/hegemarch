/**
 * The game's own icons and ships as pictures for the menus: drawn once by the game's renderer, then
 * shown as images at three times their size, like everything else.
 */
import type { UnitType } from '../game/types';
import { iconCanvas, shipSprite } from '../render/sprites';

const urls = new Map<string, string>();

function img(key: string, c: HTMLCanvasElement, cls: string): string {
  let u = urls.get(key);
  if (!u) urls.set(key, (u = c.toDataURL()));
  return `<img class="${cls}" src="${u}" width="${c.width * 3}" height="${c.height * 3}" alt="">`;
}

/** One of the game's icons (render/sprites.ts: ICONS); `tint` colors the icons that take a color. */
export function iconPic(name: string, cls = 'pic', tint?: string): string {
  return img(`i|${name}|${tint ?? ''}`, iconCanvas(name, tint), cls);
}

/** A ship, in a house's color, flying to the right. */
export function shipPic(type: UnitType, color: string, cls = 'pic'): string {
  return img(`s|${type}|${color}`, shipSprite(type, color, 0), cls);
}
