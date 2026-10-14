// A film and stills of a decision coming in (modals/event.ts): an anomaly a ship has reached, with a
// choice made and its outcome, and a visitor at the Hearth.
//   node scripts/record-event.mjs     (npm run record:event; needs a dev server: npx vite --port 5173 --strictPort)
// The film (.shots/event.mp4) is recorded by the browser from the game's canvas and its sound. The
// stills (.shots/event-*.png) are taken at chosen moments: opening, the story half in, all of it, a
// choice under the pointer, the outcome coming in, and the visitor.
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const out = '.shots/event';
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
  const a = window.__app;
  a.session.modal = null;
  a.session.paused = true;
  a.session.game.player.embers = 2000;
});
await page.mouse.move(640, 700);

/** A decision opens by itself, as one does when a ship reaches an anomaly (and a frame is drawn, so that its clock has started). */
const raise = (id, event, where) =>
  ev(([pid, evId, at]) => {
    const a = window.__app;
    const g = a.session.game;
    a.session.modal = null;
    const node = at === 'hearth' ? g.player.capital : g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0).sort((x, y) => g.hops(x.id, g.player.capital) - g.hops(y.id, g.player.capital))[0].id;
    g.prompts.push({ id: pid, event: evId, node, unit: -1 });
    a.hud.modals.open({ kind: 'event', promptId: pid, unbidden: true });
  }, [id, event, where]).then(() => wait(80));
const since = () => ev(() => window.__app.hud.modals.ui.time - window.__app.hud.modals.evAt);
const until = async (s) => {
  for (let i = 0; i < 600 && (await since()) < s; i++) await wait(10);
};
const settle = async () => {
  for (let i = 0; i < 100 && (await ev(() => window.__app.hud.modals.revealing())); i++) await wait(50);
};
const rectOf = (id) =>
  ev((rid) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf(rid);
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);

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

// 1. An anomaly: it opens, its story comes in, the pointer goes over the choices, one is taken, and its outcome comes in.
await raise(910001, 'derelict', 'near');
await until(0.1);
await shot('1-opening');
await until(1.0);
await shot('2-story');
await settle();
await wait(600);
await shot('3-all');
for (const i of [0, 1]) {
  const p = await rectOf('choice-' + i);
  if (p) await page.mouse.move(p.x, p.y, { steps: 8 });
  await wait(800);
}
await shot('4-hover');
const c0 = await rectOf('choice-0');
await page.mouse.click(c0.x, c0.y);
await wait(450);
await shot('5-outcome');
await settle();
await wait(1200);
await ev(() => window.__app.hud.modals.close());
await page.mouse.move(640, 700);
await wait(700);
// 2. A visitor at the Hearth.
await raise(910002, 'merchant', 'hearth');
await until(0.8);
await shot('6-visitor');
await settle();
await wait(2200);
await ev(() => window.__app.hud.modals.close());
await wait(400);

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
