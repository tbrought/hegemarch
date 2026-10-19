// Screenshots of every menu screen over the live sector, for checking that text stays readable.
//   node scripts/menus.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath, checks } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
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
    const g = app.attract.game;
    if (!g) return;
    const n = g.nodes.filter((x) => x.kind === 'planet' && x.owner >= 0)[0] ?? g.nodes[0];
    app.attract.lookAt(n.x, n.y, 0.22, 999);
    app.renderer.cam.update(10);
  });

const { check } = checks();

/**
 * Legacy on the title screen (1.26.1): in its purse on the Hall of Heirs, framed in gold whatever it holds and lit
 * only when it would buy something; its mark, ◆, the game's own (a system font's was small and low, and made
 * the row taller); and a 5 that is not an S.
 */
async function legacyChecks() {
  const look = () =>
    page.evaluate(() => {
      const purse = document.querySelector('[data-sa="hall"] .purse');
      const s = purse && getComputedStyle(purse);
      const row = [...document.querySelectorAll('.home-links button')];
      const ink = document.createElement('canvas').getContext('2d');
      ink.font = "10px 'Press Start 2P', 'Legacy Mark Display', 'Courier New', monospace";
      // (A small button on its own, with no ◆ in it: how tall the row's buttons should be.)
      const alone = document.createElement('button');
      alone.className = 'small';
      alone.textContent = 'HOW TO PLAY';
      document.body.appendChild(alone);
      const small = alone.offsetHeight;
      alone.remove();
      return {
        text: purse?.textContent,
        framed: !!s && s.boxShadow.includes('rgb(255, 210, 63)'),
        lit: !!purse && getComputedStyle(purse, '::after').content !== 'none',
        heights: row.map((b) => b.offsetHeight),
        small,
        mark: ink.measureText('◆').width,
      };
    });
  const lit = await look();
  check('Legacy in its purse on the Hall of Heirs', lit.text === '◆140', lit.text);
  check('the purse is framed in gold, and lit when Legacy would buy something', lit.framed && lit.lit);
  check("the ◆ is the game's own: a capital's height and an em wide", lit.mark === 10, String(lit.mark));
  check('the row is as tall as a small button, with no ◆ to stretch it', lit.heights.every((h) => h === lit.small), `${lit.heights} / ${lit.small}`);
  const five = await page.evaluate(async () => {
    await document.fonts.load("70px 'Pixelify Sans'");
    // (At 70px a pixel of the face is 6.4: the middle of its top-left pixel is 7 px in and 41 up from the foot.)
    const at = (ch) => {
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      const x = c.getContext('2d');
      x.font = "70px 'Pixelify Sans'";
      x.fillText(ch, 0, 70);
      return x.getImageData(7, 70 - 41, 1, 1).data[3];
    };
    return { five: at('5'), s: at('S') };
  });
  check('a 5 has a square corner at the top left, which an S never has', five.five > 200 && five.s < 50, JSON.stringify(five));
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('hegemarch.profile.v1'));
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ ...p, legacy: 30 }));
  });
  await page.reload();
  await wait(2500);
  const dark = await look();
  check('with nothing it would buy, the purse is framed still, and not lit', dark.text === '◆30' && dark.framed && !dark.lit, JSON.stringify(dark));
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('hegemarch.profile.v1'));
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ ...p, legacy: 140 }));
  });
  await page.reload();
  await wait(2500);
}

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
  await legacyChecks();
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
  // (The ending is skipped: once to its tally, once more to the results.)
  await wait(1200);
  await page.keyboard.press('Enter');
  await wait(300);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.results', { timeout: 10000 });
  await wait(500);
  await shot('results');
} catch (e) {
  console.error('FAILED:', e);
  await shot('failure').catch(() => {});
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
