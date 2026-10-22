// Every track, heard: each part of each track is played for a moment through the real sound engine
// (tests/music.test.ts checks the notes on paper). Each must sound, none may clip, nothing may throw.
//   node scripts/music.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import { browserPath } from './lib/browser.mjs';

const browser = await chromium.launch({
  executablePath: browserPath(),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
const url = process.argv[2] ?? 'http://localhost:5173/';
await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 2, seenTips: [] })));
await page.goto(url);
await page.waitForTimeout(2000);

const heard = await page.evaluate(async () => {
  const { TRACKS, trackSeconds } = await import('/src/audio/Music.ts');
  const app = window.__app;
  const m = app.music;
  const sfx = app.sfx;
  const an = sfx.ctx.createAnalyser();
  an.fftSize = 2048;
  sfx.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  /** The loudest sample of the next `ms` milliseconds. */
  const listen = async (ms) => {
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      await new Promise((r) => setTimeout(r, 25));
    }
    return peak;
  };
  const out = [];
  for (const t of TRACKS) {
    m.play(t.mood);
    const parts = [];
    for (let i = 0; i < t.form.length; i++) {
      m.cut();
      m.track = t;
      m.seg = i;
      m.step = 0;
      await new Promise((r) => setTimeout(r, 450));
      parts.push(await listen(1100));
      if (m.title !== t.name) parts.push(-1);
    }
    // The way it ends: home, and left to ring.
    m.cut();
    m.play(null);
    await new Promise((r) => setTimeout(r, 500));
    m.play(t.mood);
    m.track = t;
    m.pump();
    // (The breath of OFTEN: NOW AND THEN, the default since 1.27.1, follows a calm track with a minute or two
    // of quiet, which tests/music.test.ts measures.)
    const pace = m.pace;
    m.pace = 'often';
    const rest = m.close(t, sfx.ctx.currentTime + 0.05, 60 / t.bpm / 2);
    m.pace = pace;
    m.track = null;
    const ring = await listen(900);
    m.play(null);
    await new Promise((r) => setTimeout(r, 400));
    out.push({ name: t.name, mood: t.mood, seconds: Math.round(trackSeconds(t)), parts, ring, rest });
  }
  return out;
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
for (const t of heard) {
  const peaks = t.parts.map((p) => p.toFixed(2)).join(' ');
  check(`${t.mood}: ${t.name} (${t.seconds} s) sounds in every part and never clips`, t.parts.every((p) => p > 0.004 && p < 0.9), `peaks ${peaks}`);
  if (t.mood === 'war') check(`${t.name} runs on into the next battle track`, t.rest < 1, `${t.rest.toFixed(2)} s`);
  else check(`${t.name} comes home and rings, then leaves a breath`, t.ring > 0.004 && t.ring < 0.9 && t.rest > 2 && t.rest < 12, `ring ${t.ring.toFixed(2)}, ${t.rest.toFixed(1)} s`);
}
check('no errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
