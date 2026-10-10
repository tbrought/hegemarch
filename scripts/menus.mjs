// Screenshots of every menu screen over the live sector, for checking that text stays readable.
//   node scripts/menus.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 810) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/menus-${name}.png` });
  console.log('saved', name);
};
/** Point the menu backdrop camera at a busy spot with labels, so overlaps show up. */
const busyBackdrop = () =>
  page.evaluate(() => {
    const app = window.__app;
    const g = app.attract;
    if (!g) return;
    const n = g.nodes.filter((x) => x.kind === 'planet' && x.owner >= 0)[0] ?? g.nodes[0];
    app.attractT = 999;
    app.renderer.cam.focus(n.x, n.y, 0.22);
    app.renderer.cam.update(10);
  });

try {
  await page.goto(url);
  await wait(1500);
  await page.evaluate(() =>
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 4, wins: 1, legacy: 140, totalLegacy: 300, seenTips: [] })),
  );
  await page.reload();
  await wait(3000);
  await busyBackdrop();
  await wait(400);
  await shot('title');
  await page.click('[data-sa="setup"]');
  await busyBackdrop();
  await wait(400);
  await shot('setup');
  await page.click('[data-sa="menu"]');
  await page.click('[data-sa="hall"]');
  await busyBackdrop();
  await wait(400);
  await shot('hall');
  await page.click('[data-sa="menu"]');
  await page.click('[data-sa="settings"]');
  await wait(300);
  await shot('settings');
  await page.click('[data-sa="menu"]');
  await page.click('[data-sa="howto"]');
  await wait(300);
  await shot('howto');
  await page.click('[data-sa="menu"]');
  // A run, then defeat: the results page sits over the final frame of the game.
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  await page.evaluate(() => {
    const app = window.__app;
    app.session.modal = null;
    const g = app.session.game;
    app.renderer.cam.focus(g.nodes[g.player.capital].x, g.nodes[g.player.capital].y, 0.22);
    g.declareWinner(1, 'conquest', 'Vael Imperium put out every rival Hearth.');
    app.session.paused = false;
  });
  await page.waitForSelector('.results', { timeout: 10000 });
  await wait(500);
  await shot('results');
} catch (e) {
  console.error('FAILED:', e);
  await shot('failure').catch(() => {});
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
