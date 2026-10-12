/**
 * How the game is shown: fullscreen, and applying the player's settings (the size of the pixels, the
 * scanlines, the sound levels) to what is running.
 */
import type { App } from './App';

/** Is the game filling the screen? Null where the browser does not offer it (some frames, some phones). */
export function fullscreen(): boolean | null {
  return document.fullscreenEnabled ? !!document.fullscreenElement : null;
}

export function toggleFullscreen() {
  try {
    const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    // (A browser may say no; then nothing changes, and the switch goes on saying OFF.)
    void done.catch(() => {});
  } catch {
    /* not offered here */
  }
}

export function applySettings(app: App) {
  app.sfx.apply(app.profile.settings);
  app.screenObj.setPixelSize(app.profile.settings.pixelSize);
  for (const el of app.ui.querySelectorAll('.screen')) el.classList.toggle('crt', app.profile.settings.crt);
}
