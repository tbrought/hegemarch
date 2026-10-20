/**
 * What is heard: which music a run plays (a quiet night, or battle), the sounds of what happens on the
 * screen, and the sound button of the menus, which says whether the browser has let the sound start.
 */

import { playBattleSounds } from '../audio/battleSounds';
import type { SongId } from '../audio/Music';
import { Game } from '../game/Game';
import { saveProfile } from '../meta/profile';
import type { App } from './App';

/** How long the fanfare of a run's end lasts, in seconds, with its last note left to ring (audio/Sfx.ts: 'victory', 'defeat'). */
export const FANFARE = 2.2;

/**
 * The music of a quiet night (on the cradle of an Ages run, the cradle's own); the music of battle
 * while the player's worlds or fleets are fighting. Each is a mood with several tracks (audio/Music.ts).
 * With the music set to play only in battle (Settings), a quiet night is quiet.
 */
export function pickMusic(app: App, g: Game, dt: number) {
  // The run is over: its music has stopped, for the fanfare of the crowning or of the fall, and it
  // stays stopped. (This looked for the music of the moment on every frame, found none playing, and
  // started it again: the fanfare played over a tune that was not meant to be there.)
  if (g.outcome) return;
  const p = g.player;
  let fighting = false;
  if (g.tick % 10 === 0) {
    for (const n of g.nodes) {
      if (n.owner === p.id && n.lastHit < 4) fighting = true;
    }
    if (!fighting) for (const u of g.unitList) if (!u.dead && u.owner === p.id && u.lastHit < 3 && u.type !== 'fighter') fighting = true;
    app.warHeat = fighting ? Math.min(30, app.warHeat + 3) : app.warHeat;
  }
  app.warHeat = Math.max(0, app.warHeat - dt * 0.6);
  const calm = app.profile.settings.musicPace === 'battles' ? null : g.cradle ? 'cradle' : 'night';
  const want: SongId | null = app.warHeat > 8 ? 'war' : calm;
  if (app.music.playing !== want && (want === 'war' || app.warHeat <= 0.5)) app.music.play(want);
}

export function processFx(app: App, g: Game, visible: (n: number) => boolean, sound: boolean) {
  const cam = app.renderer.cam;
  const near = (x: number, y: number, pad: number) => cam.sees(x, y, pad);
  app.renderer.fx.ingest(g.fx, visible, near, cam.zoom);
  if (sound) playBattleSounds(g.fx, g.nodes, cam, app.sfx, visible);
  g.fx.length = 0;
}

/**
 * The sound button: in the corner of every menu screen (in a run, sound is under Menu, Settings). It
 * says what is heard: on, off, or waiting for the browser, which plays nothing before the first
 * click on a page.
 *
 * It lives inside the screen that is showing, in the margin above its page, and is put back there
 * whenever the screen is drawn again. So it stands beside that screen's scrollbar, not on it, and
 * goes up with the top of a page that is scrolled instead of floating over what comes after. (Pinned
 * to the corner of the window, it did both.)
 */
export function syncSound(app: App) {
  const b = app.soundBtn;
  const scr = app.screen === 'game' || app.screen === 'loading' ? null : app.ui.querySelector('.screen');
  if (!scr) {
    app.soundState = '';
    b.hidden = true;
    return;
  }
  if (b.parentElement !== scr) scr.appendChild(b);
  const state = app.profile.settings.muted ? 'off' : app.sfx.live ? 'on' : 'asleep';
  if (state === app.soundState) return;
  app.soundState = state;
  b.hidden = false;
  const say = { on: 'SOUND ON', off: 'SOUND OFF', asleep: 'CLICK FOR SOUND' }[state];
  const tip = {
    on: 'Music and sound effects are on. Click to turn them off. (Volumes are under Settings.)',
    off: 'Music and sound effects are off. Click to turn them on.',
    asleep: 'A browser plays no sound before your first click on a page. Click anywhere and the music starts.',
  }[state];
  const marks = state === 'off' ? '<path d="M5 3h1v1H5zM7 3h1v1H7zM6 4h1v1H6zM5 5h1v1H5zM7 5h1v1H7z"/>' : '<path d="M5 3h1v3H5zM7 2h1v5H7z"/>';
  b.dataset.state = state;
  b.dataset.tip = tip;
  b.setAttribute('aria-label', `${say}. ${tip}`);
  b.setAttribute('aria-pressed', String(state !== 'off'));
  b.innerHTML = `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 3h2v3H0zM2 2h1v5H2zM3 1h1v7H3z"/>${marks}` +
      `</svg><span>${say}</span>`;
}

/** Settings has a selector of every track: it shows the one that is playing, also when the music moves on by itself. */
export function syncTracks(app: App) {
  const now = app.music.title;
  if (now === app.trackShown) return;
  app.trackShown = now;
  const sel = app.ui.querySelector<HTMLSelectElement>('select[data-track]');
  if (sel && now) sel.value = now;
}

/** Play a track picked under Settings. (Someone who picks a track wants to hear it: the sound comes on.) */
export function pickTrack(app: App, name: string) {
  const wasMuted = app.profile.settings.muted;
  if (wasMuted) setMuted(app, false);
  app.music.playTrack(name);
  app.trackShown = null;
  // (Drawn again only if the Sound switch has moved: the selector keeps the keyboard otherwise, and
  // the arrow keys go through the tracks one by one.)
  if (wasMuted && app.screen === 'settings') app.showSettings();
}

export function toggleSound(app: App) {
  const st = app.profile.settings;
  // (The click that woke the sound has turned it on: it is not also a click to turn it off.)
  if (app.gestureWoke && !st.muted) return;
  setMuted(app, !st.muted);
  // (Settings shows the same switch.)
  if (app.screen === 'settings') app.showSettings();
}

export function setMuted(app: App, muted: boolean) {
  app.profile.settings.muted = muted;
  saveProfile(app.profile);
  app.sfx.apply(app.profile.settings);
  if (!muted) app.sfx.play('ui', 0.5);
}
