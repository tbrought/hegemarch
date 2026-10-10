// Audio in battle: with a big fight on screen, every music note must be exactly in tune (sound effects
// wobble in pitch, and that must never leak into the music) and the final mix must not clip.
//   node scripts/audio.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = process.argv[2] ?? 'http://localhost:5173/';
await page.goto(url);
await page.waitForTimeout(1500);
await page.evaluate(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 2, seenTips: ['role', 'raid', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'anomaly'] })));
await page.reload();
await page.waitForTimeout(2000);
await page.mouse.click(640, 700);
await page.click('[data-sa="setup"]');
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const app = window.__app;
  const s = app.session;
  s.modal = null;
  s.profile.settings.autoPause = false;
  const sfx = app.sfx;
  const music = app.music;
  // Record every music note's real pitch (the frequency asked for, times any pitch factor applied).
  window.__notes = [];
  const orig = sfx.tone.bind(sfx);
  sfx.tone = (dest, w, f0, ...rest) => {
    if (dest === music.bus) window.__notes.push(f0 * (sfx.pitch ?? 1));
    return orig(dest, w, f0, ...rest);
  };
  // Tap the final mix for its loudest samples.
  const an = sfx.ctx.createAnalyser();
  an.fftSize = 2048;
  sfx.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  window.__peaks = [];
  window.__tap = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let m = 0;
    for (const v of buf) m = Math.max(m, Math.abs(v));
    window.__peaks.push(m);
  }, 40);
  // A big battle on screen: two houses, 30 warships each, at a quiet star.
  const g = s.game;
  const star = g.nodes.find((n) => n.kind === 'star' && !g.systems[n.system].home && g.buckets[n.id].length === 0);
  const rival = g.factions.find((f) => f.kind === 'empire' && f.id !== g.playerId);
  for (let i = 0; i < 30; i++) {
    g.spawnUnit(i % 3 === 0 ? 'guardian' : 'striker', g.playerId, star.id);
    g.spawnUnit(i % 3 === 0 ? 'breaker' : 'striker', rival.id, star.id);
  }
  g.player.explored[star.id] = 1;
  s.view.reveal = true;
  s.focusNode(star.id, 0.2);
  s.paused = false;
});
await page.waitForTimeout(12000);
const r = await page.evaluate(() => {
  clearInterval(window.__tap);
  const cents = window.__notes.map((f) => {
    const n = 69 + 12 * Math.log2(f / 440);
    return Math.abs(n - Math.round(n)) * 100;
  });
  const off = cents.filter((c) => c > 1);
  return {
    song: window.__app.music.playing,
    notes: cents.length,
    offPitch: off.length,
    worstCents: Math.round(Math.max(0, ...cents)),
    peak: Math.max(...window.__peaks).toFixed(2),
    clippedFrames: window.__peaks.filter((p) => p >= 1).length,
    frames: window.__peaks.length,
  };
});
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
check('the battle music plays', r.song === 'war' && r.notes > 40, `${r.song}, ${r.notes} notes`);
check('every music note is in tune during the battle', r.offPitch === 0, `${r.offPitch} off, worst ${r.worstCents} cents`);
check('the mix never clips', r.clippedFrames === 0, `peak ${r.peak}`);
check('no errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
