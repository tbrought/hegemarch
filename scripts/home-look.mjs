// Screenshots of the title screen for a visual review: a new player, a returning one, a run in progress
// (among the stars, and an Ages run on its cradle), the setup's tabs, and narrow, short and wide windows.
// Saves to .shots/home-*.png.
//   node scripts/home-look.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/home-${name}.png` });
  console.log('saved', name);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const profile = (extra = {}) =>
  ev((x) => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 4, wins: 1, legacy: 140, totalLegacy: 300, bestTime: 1880, seenTips: [], settings: { master: 0.7, sfx: 0.8, music: 0.5, edgePan: false, tips: false, autoPause: false, crt: false, pixelSize: 'auto', explainTerms: true }, ...x })), extra);
/** Leave the run that is being played, saved, as the pause menu's "save and quit" does. */
const saveAndQuit = () =>
  ev(() => {
    const a = window.__app;
    a.autosave();
    a.teardownSession();
    a.showMenu();
    void a.attract.start();
  });
const size = async (w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await wait(500);
};

try {
  // A new player: the First Night.
  await page.goto(url);
  await wait(1200);
  await ev(() => localStorage.clear());
  await page.reload();
  await wait(1800);
  await shot('first');
  // A returning player with nothing saved: the ways to play.
  await profile();
  await page.reload();
  await wait(4200);
  await shot('choose');
  await page.hover('.mode.daily');
  await wait(2600);
  await shot('choose-hover');
  await page.mouse.move(5, 5);
  for (const [w, h, name] of [[1920, 1080, 'wide'], [1280, 640, 'short'], [1024, 600, 'small'], [400, 800, 'phone']]) {
    await size(w, h);
    await shot('choose-' + name);
  }
  await size(1440, 810);
  // The setup, and its tabs.
  await page.click('[data-sa="setup"]');
  await wait(500);
  await shot('setup-sector');
  await page.click('.mode-tabs [data-sa="daily"]');
  await wait(400);
  await shot('setup-daily');
  await page.click('.mode-tabs [data-sa="setup"]');
  // A run in progress, among the stars.
  await page.click('[data-sa="heir:wayfarer"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  await ev(() => {
    const g = window.__app.session.game;
    for (let i = 0; i < 20 * 754; i++) g.step();
  });
  await saveAndQuit();
  await wait(2500);
  await shot('resume');
  await page.hover('.hero');
  await wait(600);
  await shot('resume-hover');
  await page.mouse.move(5, 5);
  for (const [w, h, name] of [[1280, 640, 'short'], [400, 800, 'phone']]) {
    await size(w, h);
    await shot('resume-' + name);
    if (name === 'phone') {
      await ev(() => document.querySelector('.screen').scrollTo(0, 99999));
      await wait(200);
      await shot('resume-phone-foot');
    }
  }
  await size(1440, 810);
  // An Ages run in progress, in the Iron Age.
  await page.click('[data-sa="ages"]');
  await page.click('[data-sa="launch"]');
  await wait(300);
  await shot('new-run-question');
  await page.click('[data-sa="confirm-new"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  await ev(() => {
    const g = window.__app.session.game;
    g.player.era = 2;
    for (let i = 0; i < 20 * 300; i++) g.step();
  });
  await saveAndQuit();
  await wait(2500);
  await shot('resume-ages');
  console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'no errors');
} catch (e) {
  console.error(e);
  // (On the same stream as the rest: a failure that comes and goes must leave its reason behind.)
  console.log(`FAILED: ${e?.message ?? e}`);
  console.log(errors.join('\n'));
  await shot('failure');
} finally {
  await browser.close();
}
