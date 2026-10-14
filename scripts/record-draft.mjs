// A film and stills of the Boon draft being dealt (modals/reveal.ts): a hand with a Rare, one with an
// Epic, one with a Legendary and the pointer passing over its cards.
//   node scripts/record-draft.mjs     (npm run record:draft; needs a dev server: npx vite --port 5173 --strictPort)
// The film (.shots/draft.mp4) is recorded by the browser from the game's canvas and its sound. The
// stills (.shots/draft-*.png) are taken at chosen moments of the deal: the Legendary just before it
// is all there, the moment it is, a little after, at rest, and under the pointer.
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const out = '.shots/draft';
const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 }, launch: { args: ['--autoplay-policy=no-user-gesture-required'] } });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};

await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  tutorialDone: true, runs: 6, wins: 2, maxDifficulty: 2, unlockLegendary: true, unlockPacts: true, lastSetup: { heir: 'concord', size: 'small', difficulty: 1 },
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
  settings: { autoPause: false, tips: false, muted: false, master: 0.8, sfx: 0.8, music: 0.4 },
})));
await page.goto(DEV_URL);
await wait(1500);
await page.click('[data-sa="setup"]');
await ev(() => (window.__app.setup.seed = '20261013'));
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await wait(800);
await ev(() => {
  const s = window.__app.session;
  s.modal = null;
  s.paused = true;
});
await page.mouse.move(640, 700);

/** Deal a hand: these Boons, in a draft that opens now. */
const deal = (ids) =>
  ev((list) => {
    const a = window.__app;
    const p = a.session.game.player;
    a.session.modal = null;
    a.hud.modals.dealt = null;
    p.pendingDrafts = 1;
    p.draftOffer = list;
    a.hud.modals.open({ kind: 'draft' });
  }, ids);
/** Seconds into the deal now. */
const dealt = () => ev(() => window.__app.hud.modals.ui.time - window.__app.hud.modals.dealtAt);
const until = async (sec) => {
  for (let i = 0; i < 400 && (await dealt()) < sec; i++) await wait(10);
};
/** The plan of the deal on the screen (once a frame has drawn it). */
const plan = async () => {
  await wait(80);
  return ev(() => window.__app.hud.modals.dealPlan);
};

// ---- The film. The recorder runs in the page.
await ev(async () => {
  const game = document.getElementById('game');
  const k = Math.max(1, Math.round(1280 / game.width));
  const big = document.createElement('canvas');
  big.width = game.width * k;
  big.height = game.height * k;
  const bg = big.getContext('2d');
  bg.imageSmoothingEnabled = false;
  const R = (window.__rec = { on: true, chunks: [] });
  const copy = () => {
    bg.drawImage(game, 0, 0, big.width, big.height);
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
});

// 1. Commons and a Rare.
await deal(['hardHulls', 'starCharts', 'emberTithe']);
await wait(2400);
// 2. An Epic.
await deal(['stargazers', 'bpStarfall', 'bpLancer']);
await wait(2800);
await shot('1-epic');
// 3. A Legendary.
await deal(['emberTithe', 'singularity', 'starCharts']);
let pl = await plan();
const moment = pl.cards[1].shownAt;
await until(moment - 0.25);
await shot('2-before');
await until(moment + 0.06);
await shot('3-moment');
await until(moment + 0.35);
await shot('4-after');
await wait(1800);
await shot('5-rest');
// The pointer passes over the cards.
const cardAt = (i) =>
  ev((n) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf('card-' + n);
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, i);
for (const i of [0, 1, 2]) {
  const p = await cardAt(i);
  if (p) await page.mouse.move(p.x, p.y, { steps: 8 });
  await wait(900);
  if (i === 1) await shot('6-hover');
}
await page.mouse.move(640, 700);
await wait(600);

const film = await ev(async () => {
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
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
