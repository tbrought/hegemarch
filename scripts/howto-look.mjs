// How to Play, looked at: the page at desktop, laptop and phone widths, its pictures at several moments,
// and checks that nothing is cut off or runs off the page.
//   node scripts/howto-look.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
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
const errors = [];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};

// (The last one asks for less motion: the pictures stand still, and must still say what they are for.)
for (const [w, h, still] of [[1440, 900], [1024, 700], [420, 800], [900, 900, true]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: still ? 'reduce' : 'no-preference' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 4, wins: 1, legacy: 140, totalLegacy: 300, seenTips: [] })));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.click('[data-sa="howto"]');
  await page.waitForTimeout(3600);
  const m = await page.evaluate(() => {
    const pg = document.querySelector('.page.howto');
    const scr = document.querySelector('.screen');
    const r = pg.getBoundingClientRect();
    // Anything inside the page that reaches past its edge, or is cut by its own box.
    const out = [];
    for (const el of pg.querySelectorAll('h3, p, kbd, dd, dt, .how-tile, .how-names span, .how-clock > div, canvas, img')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.right > r.right + 1 || b.left < r.left - 1) out.push(`${el.tagName}.${el.className} "${(el.textContent ?? '').slice(0, 24)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    const cut = [];
    for (const el of pg.querySelectorAll('.how-pic')) {
      for (const k of el.querySelectorAll('.how-tile, .how-names, canvas')) {
        const a = el.getBoundingClientRect();
        const b = k.getBoundingClientRect();
        if (b.bottom > a.bottom + 1 || b.top < a.top - 1 || b.right > a.right + 1 || b.left < a.left - 1) cut.push(`${k.className} "${(k.textContent ?? '').slice(0, 20)}"`);
      }
    }
    const words = pg.innerText.split(/\s+/).filter(Boolean).length;
    const drawn = [...pg.querySelectorAll('canvas')].map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return `${c.dataset.art}:${c.width}x${c.height}:${n}`;
    });
    return { height: Math.round(r.height), scrollW: scr.scrollWidth, clientW: scr.clientWidth, out, cut, words, drawn, steps: pg.querySelectorAll('.how-step').length };
  });
  console.log(`${w}x${h}: page ${m.height}px tall, ${m.words} words, pictures ${m.drawn.join(' ')}`);
  check(m.steps === 5, `${w}: five steps`);
  check(m.scrollW <= m.clientW, `${w}: no sideways scroll (${m.scrollW} / ${m.clientW})`);
  check(m.out.length === 0, `${w}: nothing reaches past the page${m.out.length ? ': ' + m.out.slice(0, 4).join(' | ') : ''}`);
  check(m.cut.length === 0, `${w}: no picture is cut${m.cut.length ? ': ' + m.cut.slice(0, 4).join(' | ') : ''}`);
  check(m.drawn.every((d) => parseInt(d.split(':')[2], 10) > 20), `${w}: every picture is drawn`);
  if (still) {
    const again = await page.evaluate(() => [...document.querySelectorAll('.page.howto canvas')].map((c) => c.toDataURL()).join());
    await page.waitForTimeout(900);
    const later = await page.evaluate(() => [...document.querySelectorAll('.page.howto canvas')].map((c) => c.toDataURL()).join());
    check(again === later, `${w}: with less motion asked for, the pictures stand still`);
  }
  await page.screenshot({ path: `.shots/howto-${w}${still ? '-still' : ''}.png`, fullPage: false });
  // The whole page, scrolled: the screen is the scroller, so shoot it in parts.
  const parts = Math.min(3, Math.ceil((m.height + 80) / h));
  for (let i = 1; i < parts; i++) {
    await page.evaluate((y) => (document.querySelector('.screen').scrollTop = y), i * (h - 60));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `.shots/howto-${w}-${i + 1}.png` });
  }
  await page.close();
}

if (errors.length) console.log('errors:', errors);
console.log(failed || errors.length ? `FAILED (${failed} checks, ${errors.length} errors)` : 'how to play looks right');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
