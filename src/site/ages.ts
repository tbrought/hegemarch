/**
 * The Ages run, on the website: the climb the game's own title screen shows for that mode (the swift
 * line of each age marching toward an Ark that lifts into the stars, app/modeArt.ts), with the names of
 * the ages under it. Like everything on the page, it is the game's picture and not a picture of it.
 */
import { drawModeArt } from '../app/modeArt';
import { ERAS } from '../game/data/eras';
import { esc } from './stage';

/** Fills `root`, and returns what draws it each frame (page seconds). */
export function startAges(root: HTMLElement): (t: number) => void {
  root.innerHTML = `<canvas class="mode-art" data-art="ages" aria-hidden="true"></canvas><ol class="ages-names">${ERAS.map((e) => `<li>${esc(e.short)}</li>`).join('')}</ol>`;
  return (t) => drawModeArt(root, t);
}
