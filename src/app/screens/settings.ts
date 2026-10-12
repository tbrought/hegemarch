/**
 * Settings: sound and the track that is playing, the size of the pixels, fullscreen, the tick boxes,
 * the First Night again, and starting over.
 */

import { TRACKS, type Mood } from '../../audio/Music';
import { esc } from '../../ui/format';
import type { App } from '../App';
import { clearRun, defaultProfile, saveProfile } from '../../meta/profile';
import { pickTrack, setMuted } from '../sound';
import type { ScreenActions } from './index';
import { applySettings, fullscreen, toggleFullscreen } from '../display';

/** The moods of the music, as the list of tracks under Settings names them. */
export const MOODS: [Mood, string][] = [['title', 'Title screen'], ['night', 'Quiet night'], ['war', 'Battle'], ['cradle', 'Ages cradle'], ['crown', 'A crowning']];

export const PIXEL_TIPS = {
  small: 'Small pixels: see more of the sector at once (640×360 game pixels).',
  auto: 'Fit the window: at least 480×270 game pixels, scaled up in whole steps.',
  large: 'Large pixels: bigger text and ships (400×225 game pixels).',
} as const;

export function showSettings(app: App) {
  const s = app.profile.settings;
  const full = fullscreen();
  const tog = (k: string, label: string, on: boolean) => `<div class="check ${on ? 'on' : ''}" data-sa="toggle:${k}" role="checkbox" aria-checked="${on}" tabindex="0"><span class="box"></span>${label}</div>`;
  app.put('settings', `<div class="screen${app.crt()}"><div class="page px-box" style="max-width:620px">
      <h1>SETTINGS</h1>
      <div class="kv">
        <b>Sound</b><div class="row"><button class="small ${s.muted ? '' : 'active'}" data-sa="sound:on">ON</button><button class="small ${s.muted ? 'active' : ''}" data-sa="sound:off">OFF</button></div>
        <b>Volume</b><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-setting="master">
        <b>Effects</b><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-setting="sfx">
        <b>Music</b><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-setting="music">
        <b>Track</b><div class="row"><select data-track aria-label="The track that is playing" data-tip="${TRACKS.length} tracks. A run plays the ones that fit the moment, a new one each time; here you can hear any of them.">${MOODS.map(([m, label]) => `<optgroup label="${label}">${TRACKS.filter((t) => t.mood === m).map((t) => `<option value="${esc(t.name)}"${app.music.title === t.name ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select><button class="small" data-sa="track-next" data-tip="Play the next track in the list.">NEXT</button></div>
        ${full === null ? '' : `<b>Fullscreen</b><div class="row"><button class="small ${full ? 'active' : ''}" data-sa="fullscreen" aria-pressed="${full}">${full ? 'ON' : 'OFF'}</button></div>`}
        <b>Pixel size</b><div class="row">${(['small', 'auto', 'large'] as const).map((k) => `<button class="small ${s.pixelSize === k ? 'active' : ''}" data-sa="pixels:${k}" data-tip="${PIXEL_TIPS[k]}">${k.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div style="display:grid;gap:12px;margin-top:20px">
        ${tog('autoPause', 'Pause automatically when a decision is needed', s.autoPause)}
        ${tog('tips', 'Show a tip the first time something new happens', s.tips)}
        ${tog('explainTerms', 'Explain game terms (Kindle, Hangar…) beside tooltips', s.explainTerms)}
        ${tog('crt', 'Scanline (CRT) filter', s.crt)}
        ${tog('edgePan', 'Scroll the map at the screen edge', s.edgePan)}
      </div>
      <h2>PROGRESS</h2>
      <div class="row"><button class="small" data-sa="replay-tutorial" data-tip="Your next new run starts with the guided First Night again, and the first-time tips come back.">REPLAY THE FIRST NIGHT</button>
        <button class="small danger" data-sa="reset">${app.confirmReset ? 'CLICK AGAIN TO ERASE EVERYTHING' : 'RESET ALL PROGRESS'}</button></div>
      <div class="foot-actions"><button data-sa="menu">BACK</button></div>
    </div></div>`);
}

/** What the buttons of Settings do. */
export const settingsActions: ScreenActions = {
  fullscreen: () => {
    toggleFullscreen();
  },
  toggle: (app, arg) => {
    const k = arg as 'edgePan' | 'tips' | 'autoPause' | 'crt' | 'explainTerms';
    app.profile.settings[k] = !app.profile.settings[k];
    saveProfile(app.profile);
    applySettings(app);
    showSettings(app);
  },
  sound: (app, arg) => {
    setMuted(app, arg === 'off');
    showSettings(app);
  },
  'track-next': (app) => {
    const i = TRACKS.findIndex((t) => t.name === app.music.title);
    pickTrack(app, TRACKS[(i + 1) % TRACKS.length].name);
  },
  pixels: (app, arg) => {
    app.profile.settings.pixelSize = arg as 'small' | 'auto' | 'large';
    saveProfile(app.profile);
    applySettings(app);
    showSettings(app);
  },
  'replay-tutorial': (app) => {
    app.profile.tutorialDone = false;
    app.profile.seenTips = [];
    saveProfile(app.profile);
    app.setup.guided = true;
    showSettings(app);
  },
  reset: (app) => {
    if (!app.confirmReset) {
      app.confirmReset = true;
    } else {
      app.profile = defaultProfile();
      saveProfile(app.profile);
      clearRun();
      app.confirmReset = false;
      app.setup.guided = true;
    }
    showSettings(app);
  },
};
