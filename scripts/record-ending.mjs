// A film of how a run ends, for looking at without playing one: a sector is played forward, the player's
// house is given a realm worth crowning, and the last rival Hearth falls (or, with "defeat", the player's
// own) while the game's picture and sound are recorded.
//   node scripts/record-ending.mjs [victory|defeat] [out file]     (needs a dev server: npx vite --port 5173 --strictPort)
// The film is recorded by the browser itself from the game's canvas and its sound, at twice the game's
// pixels: MP4 where the browser can write one, WebM otherwise or with --webm (the file's ending says which).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const kind = process.argv[2] === 'defeat' ? 'defeat' : 'victory';
const out = process.argv.slice(3).find((a) => !a.startsWith('--')) ?? `.shots/ending-${kind}`;
const url = 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// A player who has records to beat, so that the tally has something to stamp.
await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  tutorialDone: true, runs: 6, wins: 2, maxDifficulty: 2, lastSetup: { heir: 'concord', size: 'medium', difficulty: 1 },
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld'],
  settings: { autoPause: false, tips: false, muted: false, master: 0.8, sfx: 0.8, music: 0.6 },
  records: { 'classic:medium:1': { crown: 2400, stand: 600, worlds: 12, kills: 400, boons: 30, legacy: 150 } },
})));
await page.goto(url);
await page.waitForTimeout(1500);
await page.click('[data-sa="setup"]');
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await page.waitForTimeout(600);

// The sector, some minutes in: the rivals have grown by themselves, and the player's house as a player's would.
await page.evaluate((minutes) => {
  const app = window.__app;
  const s = app.session;
  const g = s.game;
  const p = g.player;
  s.modal = null;
  for (let i = 0; i < minutes * 60 * 20 && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
    while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
    g.prompts.length = 0;
    if (i % 900 === 0) {
      const dark = g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0).sort((a, b) => g.hops(a.id, p.capital) - g.hops(b.id, p.capital))[0];
      if (dark && g.hops(dark.id, p.capital) <= 4) {
        for (const u of [...g.buckets[dark.id]]) if (u.owner !== p.id) g.killUnit(u, -1);
        g.kindleWorld(dark, p.id);
        g.setLevel(dark, 1 + (i % 3));
      }
      p.embers += 400;
      for (const t of ['striker', 'guardian', 'breaker']) g.cmdQueueShip(p.id, p.capital, t);
    }
  }
  for (const t of ['lancer', 'carrier', 'dreadnought']) g.spawnUnit(t, p.id, p.capital);
  p.stats.kills += 180;
  s.modal = null;
}, kind === 'victory' ? 16 : 11);

// The moment before the end: the fleets are where it will be decided, and the view with them.
await page.evaluate((kind) => {
  const app = window.__app;
  const s = app.session;
  const g = s.game;
  const p = g.player;
  const rivals = g.empires().filter((f) => f.id !== p.id && f.alive);
  if (kind === 'victory') {
    const last = rivals[rivals.length - 1];
    for (const r of rivals) {
      if (r === last) continue;
      g.planetDefeated(g.nodes[r.capital], p.id);
      g.flushDeferred();
    }
    const n = g.nodes[last.capital];
    for (const u of g.unitsOf(p.id)) if (u.type !== 'scout' && u.type !== 'seed' && !u.lane) { u.node = n.id; u.x = n.x + (Math.random() - 0.5) * 320; u.y = n.y + (Math.random() - 0.5) * 320; u.path = []; }
    n.hp = n.maxHp * 0.08;
    n.sh = 0;
    app.renderer.cam.focus(n.x, n.y, 0.2);
    window.__end = () => { g.planetDefeated(g.nodes[last.capital], p.id); g.flushDeferred(); };
  } else {
    const rival = rivals[0];
    const n = g.nodes[p.capital];
    for (let i = 0; i < 22; i++) g.spawnUnit(i % 2 ? 'breaker' : 'striker', rival.id, n.id);
    n.hp = n.maxHp * 0.1;
    n.sh = 0;
    app.renderer.cam.focus(n.x, n.y, 0.2);
    window.__end = () => { g.planetDefeated(g.nodes[p.capital], rival.id); g.flushDeferred(); };
  }
  s.clearSelection();
  s.paused = false;
  s.speed = 1;
}, kind);
await page.waitForTimeout(800);

// Record: the canvas at twice its pixels (sharp, as the game is shown), and what the game plays.
const seconds = kind === 'victory' ? 23 : 13;
const film = await page.evaluate(async ({ seconds, lead, wantWebm }) => {
  const game = document.getElementById('game');
  const k = Math.max(1, Math.round(1280 / game.width));
  const big = document.createElement('canvas');
  big.width = game.width * k;
  big.height = game.height * k;
  const bg = big.getContext('2d');
  bg.imageSmoothingEnabled = false;
  let on = true;
  const copy = () => {
    bg.drawImage(game, 0, 0, big.width, big.height);
    if (on) requestAnimationFrame(copy);
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
  const want = wantWebm ? [] : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  const type = [...want, 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(250);
  await new Promise((r) => setTimeout(r, lead * 1000));
  window.__end();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  await stopped;
  on = false;
  const blob = new Blob(chunks, { type });
  const data = await new Promise((r) => {
    const fr = new FileReader();
    // (After "base64,": the kind of film has a comma of its own, between its two codecs.)
    fr.onload = () => r(String(fr.result).slice(String(fr.result).indexOf('base64,') + 7));
    fr.readAsDataURL(blob);
  });
  return { type, data, size: [big.width, big.height], audio: tracks.length > 1, tally: window.__app.session.endTally.map((l) => `${l.label} ${Math.round(l.value)}${l.record ? ' (record)' : ''}`), done: window.__app.hud.ending.done };
}, { seconds, lead: 2.5, wantWebm: process.argv.includes('--webm') });
await browser.close();

const file = `${out}.${film.type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
fs.writeFileSync(file, Buffer.from(film.data, 'base64'));
console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB, ${film.size.join('x')}, ${film.type}, ${film.audio ? 'with sound' : 'no sound'}, ${seconds + 2.5} s`);
console.log(`tally: ${film.tally.join(' · ')}${film.done ? '' : ' (the film ended before the tally did)'}`);
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
