import type { Fx } from '../game/types';
import type { Camera } from '../render/Camera';
import type { Sfx, SoundId } from './Sfx';

/**
 * Play the sounds of this frame's battle effects: quieter the farther they are from the middle of
 * the view and the farther the camera is zoomed out, and panned left or right.
 */
export function playBattleSounds(fx: Fx[], nodes: { x: number; y: number }[], cam: Camera, sfx: Sfx, visible: (node: number) => boolean) {
  if (!sfx.ctx) return;
  const R = Math.max(cam.w, cam.h) / 2 / cam.zoom;
  const zoomGain = Math.max(0.15, Math.min(1, cam.zoom * 5));
  for (const f of fx) {
    if ('node' in f && f.node >= 0 && !visible(f.node)) continue;
    let id: SoundId | null = null;
    let base = 0.3;
    let x = 0;
    let y = 0;
    switch (f.k) {
      case 'beam':
        id = 'laser';
        base = 0.2;
        x = f.x1;
        y = f.y1;
        break;
      case 'shot':
        id = f.kind === 'lance' ? 'lance' : f.kind === 'shell' ? 'shell' : 'bolt';
        base = f.kind === 'shell' ? 0.45 : 0.22;
        x = f.x;
        y = f.y;
        break;
      case 'boom':
        id = f.size >= 20 ? 'bigboom' : 'boom';
        base = f.size >= 20 ? 0.9 : 0.45;
        x = f.x;
        y = f.y;
        break;
      case 'jumpOut':
        id = 'jump';
        base = 0.2;
        x = f.x;
        y = f.y;
        break;
      case 'capture':
        id = 'capture';
        base = 0.6;
        x = nodes[f.node].x;
        y = nodes[f.node].y;
        break;
      case 'ability':
        id = 'ability';
        base = 0.5;
        x = f.x;
        y = f.y;
        break;
      default:
        break;
    }
    if (!id) continue;
    const d = Math.hypot(x - cam.x, y - cam.y);
    const att = Math.max(0, Math.min(1, 1.25 - d / R));
    const vol = base * att * (id === 'capture' ? 1 : zoomGain);
    if (vol > 0.02) sfx.play(id, vol, Math.max(-1, Math.min(1, ((x - cam.x) / R) * 0.6)));
  }
}
