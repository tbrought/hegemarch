// What the film recorders share: a run on a fixed sector, paused, to stage things in; and a recorder that
// films the game's canvas (scaled up without smoothing) and its sound into an MP4 in the page.
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './browser.mjs';

/**
 * A browser at 1280×720 with a run under way on a fixed sector, paused, auto-pause and tips off. `profile`:
 * what the player's profile has besides (a new player: `{ runs: 0, boonKeys: [] }`).
 */
export async function filmRun(seed = '20261013', profile = {}) {
  const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 }, launch: { args: ['--autoplay-policy=no-user-gesture-required'] } });
  await page.addInitScript((extra) => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
    tutorialDone: true, runs: 6, wins: 2, maxDifficulty: 2, unlockLegendary: true, unlockPacts: true, lastSetup: { heir: 'concord', size: 'small', difficulty: 1 },
    seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
    settings: { autoPause: false, tips: false, muted: false, master: 0.8, sfx: 0.8, music: 0.4 },
    ...extra,
  })), profile);
  await page.goto(DEV_URL);
  await page.waitForTimeout(1500);
  await page.click('[data-sa="setup"]');
  await page.evaluate((s) => (window.__app.setup.seed = s), seed);
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const a = window.__app;
    a.session.modal = null;
    a.session.paused = true;
  });
  await page.mouse.move(640, 700);
  return { browser, page, errors };
}

/**
 * Start filming the page's game canvas and sound. With `zoom`, only a part of the screen is filmed, that
 * much larger: a place to look at, in game pixels (`{ x, y }`, its top left corner). Move it with
 * `lookAt`; the view glides there.
 */
export async function startFilm(page, { zoom } = {}) {
  await page.evaluate(async (zoomBy) => {
    const game = document.getElementById('game');
    const k = Math.max(1, Math.round(1280 / game.width));
    const big = document.createElement('canvas');
    big.width = game.width * k;
    big.height = game.height * k;
    const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = false;
    const R = (window.__rec = { on: true, chunks: [] });
    const view = (window.__view = { x: 0, y: 0, tx: 0, ty: 0, zoom: zoomBy ?? 1 });
    const copy = () => {
      if (view.zoom > 1) {
        view.x += (view.tx - view.x) * 0.12;
        view.y += (view.ty - view.y) * 0.12;
        const w = game.width / view.zoom;
        const h = game.height / view.zoom;
        bg.drawImage(game, Math.round(Math.max(0, Math.min(game.width - w, view.x))), Math.round(Math.max(0, Math.min(game.height - h, view.y))), w, h, 0, 0, big.width, big.height);
      } else bg.drawImage(game, 0, 0, big.width, big.height);
      if (R.on) requestAnimationFrame(copy);
    };
    copy();
    const tracks = [...big.captureStream(30).getVideoTracks()];
    const sfx = window.__app.sfx;
    sfx.unlock?.();
    if (sfx.ctx && sfx.master) {
      await sfx.ctx.resume().catch(() => {});
      const dest = sfx.ctx.createMediaStreamDestination();
      sfx.master.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }
    R.type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    R.rec = new MediaRecorder(new MediaStream(tracks), { mimeType: R.type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    R.rec.ondataavailable = (e) => e.data.size && R.chunks.push(e.data);
    R.stopped = new Promise((r) => (R.rec.onstop = r));
    R.rec.start(250);
  }, zoom);
}

/** Where a zoomed film looks (its top left corner, in game pixels); `atOnce` jumps there, else it glides. */
export async function lookAt(page, x, y, atOnce = false) {
  await page.evaluate(([px, py, now]) => {
    const v = window.__view;
    v.tx = px;
    v.ty = py;
    if (now) {
      v.x = px;
      v.y = py;
    }
  }, [x, y, atOnce]);
}

/** Stop filming and write the film to `<out>.mp4` (or .webm). Returns its file name. */
export async function endFilm(page, out) {
  const film = await page.evaluate(async () => {
    const R = window.__rec;
    R.rec.stop();
    await R.stopped;
    R.on = false;
    const blob = new Blob(R.chunks, { type: R.type });
    const data = await new Promise((r) => {
      const fr = new FileReader();
      // (After "base64,": the kind of film has a comma of its own, between its two codecs.)
      fr.onload = () => r(String(fr.result).slice(String(fr.result).indexOf('base64,') + 7));
      fr.readAsDataURL(blob);
    });
    return { type: R.type, data };
  });
  const file = `${out}.${film.type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
  fs.writeFileSync(file, Buffer.from(film.data, 'base64'));
  console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  return file;
}
