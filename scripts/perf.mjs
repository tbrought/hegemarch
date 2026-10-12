// Big-battle visual check + frame-rate measurement in headless Edge/Chrome.
//   node scripts/perf.mjs [url] [shipsPerSide]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const per = Number(process.argv[3] ?? 90);
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(2500);
await page.evaluate(() => {
  localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 1 }));
});
await page.reload();
await page.waitForTimeout(2500);
await page.click('[data-sa="setup"]');
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await page.evaluate(() => (window.__app.session.modal = null));
await page.waitForTimeout(500);
await page.evaluate((n) => {
  const s = window.__app.session;
  const g = s.game;
  const star = g.nodes.find((x) => x.kind === 'star' && g.systems[x.system].home === false) ?? g.nodes[0];
  const mix = ['guardian', 'guardian', 'striker', 'lancer', 'carrier', 'breaker'];
  for (let i = 0; i < n; i++) {
    g.spawnUnit(mix[i % mix.length], 0, star.id, { x: star.x - 350 + Math.random() * 120, y: star.y - 250 + Math.random() * 500 });
    g.spawnUnit(i % 3 ? 'raider' : 'marauder', g.pirateId, star.id, { x: star.x + 250 + Math.random() * 120, y: star.y - 250 + Math.random() * 500 });
  }
  g.spawnUnit('dreadnought', 0, star.id, { x: star.x - 420, y: star.y });
  s.view.reveal = true;
  g.nextGalactic = 1e9;
  g.pirates.nextRaid = 1e9;
  window.__app.renderer.cam.focus(star.x, star.y, 0.35);
  window.__app.renderer.cam.update(10);
  s.speed = 1;
}, per);
await page.waitForTimeout(2500);
await page.screenshot({ path: '.shots/perf-battle-1.png' });
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      let worst = 0;
      let last = performance.now();
      const t0 = last;
      const tick = (now) => {
        frames++;
        worst = Math.max(worst, now - last);
        last = now;
        if (now - t0 < 4000) requestAnimationFrame(tick);
        else resolve({ fps: (frames * 1000) / (now - t0), worstFrameMs: worst });
      };
      requestAnimationFrame(tick);
    }),
);
await page.screenshot({ path: '.shots/perf-battle-2.png' });
const units = await page.evaluate(() => window.__app.session.game.unitList.filter((u) => !u.dead).length);
console.log(`units alive: ${units}  fps: ${fps.fps.toFixed(1)}  worst frame: ${fps.worstFrameMs.toFixed(1)}ms`);
await page.evaluate(() => window.__app.renderer.cam.focus(window.__app.renderer.cam.x, window.__app.renderer.cam.y, 0.12));
await page.waitForTimeout(1200);
await page.screenshot({ path: '.shots/perf-battle-3.png' });
console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'no errors');
await browser.close();
