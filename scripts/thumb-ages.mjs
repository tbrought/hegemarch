// An upright thumbnail for the Ages Short (promo/thumb-short-ages-symbol.png, 1080x1920): the Ages run's own
// picture from the title screen (app/modeArt.ts: the swift line of each age, each in a house's colour, marching
// toward an Ark that lifts into the stars), drawn by the game's code and scaled up whole, with the ages named
// under it and the flame and the name over it.
//   npx vite --port 5173 --strictPort (the dev server), then node scripts/thumb-ages.mjs
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const W = 1080;
const H = 1920;
const OUT = 'promo/thumb-short-ages-symbol.png';
const flame = fs.readFileSync('site/favicon.svg', 'utf8').replace(/<rect width="16" height="16"[^>]*\/>/, '');

const { browser, page, errors } = await openBrowser({ viewport: { width: W, height: H }, context: { deviceScaleFactor: 1 } });
await page.goto(DEV_URL);
await page.waitForTimeout(1500);

await page.evaluate(async ({ W, H, flame }) => {
  const { drawModeArt } = await import('/src/app/modeArt.ts');
  const { PAL } = await import('/src/game/data/heirs.ts');
  await document.fonts.load('32px "Press Start 2P"');
  const NIGHT = '#0b0a1a';
  // The picture at the game's own size: 72x30 game pixels (the title screen shows it three times over).
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:216px;height:90px;opacity:0;pointer-events:none';
  host.innerHTML = '<canvas class="mode-art" data-art="ages" style="width:216px;height:90px"></canvas>';
  document.body.appendChild(host);
  // (Two frames: the first sets the picture's clock, the second draws it a moment on, the units mid-stride.)
  drawModeArt(host, 1);
  drawModeArt(host, 1.06);
  const src = host.querySelector('canvas');
  const K = 14;
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;background:${NIGHT};overflow:hidden`;
  document.body.appendChild(box);
  const art = document.createElement('canvas');
  art.width = src.width * K;
  art.height = src.height * K;
  const g = art.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, art.width, art.height);
  const top = Math.round(H * 0.43);
  art.style.cssText = `position:absolute;left:${Math.round((W - art.width) / 2)}px;top:${top}px;image-rendering:pixelated`;
  box.appendChild(art);
  // The ages, each under its own figure (as on the title screen).
  const names = ['STONE', 'BRONZE', 'IRON', 'POWDER', 'MACHINE', 'SPACE'];
  names.forEach((n, i) => {
    const x = Math.round((W - art.width) / 2 + (art.width * (i + 0.5)) / 6);
    const t = document.createElement('div');
    t.textContent = n;
    t.style.cssText = `position:absolute;left:${x}px;top:${top + art.height + 34}px;transform:translateX(-50%);font-family:var(--display, monospace);` +
      `font-size:22px;letter-spacing:0.02em;color:${i === 5 ? PAL.gold : PAL.mist};white-space:nowrap`;
    box.appendChild(t);
  });
  // The flame, the name and what the mode is.
  const head = document.createElement('div');
  head.style.cssText = `position:absolute;left:0;right:0;top:${Math.round(H * 0.15)}px;display:flex;flex-direction:column;align-items:center;gap:34px`;
  head.innerHTML = `<div style="width:150px;height:150px">${flame.replace('<svg ', '<svg width="150" height="150" ')}</div>` +
    `<div style="font-family:var(--display, monospace);font-size:84px;line-height:1;letter-spacing:0.04em;color:#ffd23f;` +
    `text-shadow:0.06em 0.06em 0 #ff8a1f,0.12em 0.12em 0 #8c2a3c,-3px -3px 0 ${NIGHT}">HEGEMARCH</div>` +
    `<div style="font-family:var(--display, monospace);font-size:34px;letter-spacing:0.05em;color:${PAL.bone};text-shadow:3px 3px 0 ${NIGHT}">STONE AGE TO THE STARS</div>`;
  box.appendChild(head);
}, { W, H, flame });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
console.log(OUT);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
