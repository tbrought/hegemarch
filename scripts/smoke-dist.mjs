// Smoke-test the single-file production build straight from disk (file://).
//   node scripts/smoke-dist.mjs [path-to-html]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const file = pathToFileURL(path.resolve(process.argv[2] ?? 'dist/hegemarch.html')).href;
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(file);
await page.waitForSelector('[data-sa="setup"]', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '.shots/dist-menu.png' });
await page.click('[data-sa="first-night"]');
// In game the DOM overlay is empty and everything is drawn on the canvas.
await page.waitForFunction(() => document.getElementById('ui').children.length === 0, null, { timeout: 60000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: '.shots/dist-game.png' });
const lit = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) bright++;
  return { w: c.width, h: c.height, bright };
});
console.log(`canvas ${lit.w}x${lit.h}, bright pixels: ${lit.bright}`);
const hasDevHook = await page.evaluate(() => '__app' in window);
console.log('dev hook exposed in production:', hasDevHook);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
process.exit(errors.length || lit.bright < 500 ? 1 : 0);
