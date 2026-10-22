// An upright thumbnail for the Multiplayer Short (promo/thumb-short-multiplayer.png, 1080x1920): the MULTIPLAYER card's
// own picture from the title screen (app/modeArt.ts: two allies, the Concord's gold and the Wayfarers' teal, closing on
// a Vael ship from either side and firing on it), drawn by the game's code at the moment they fire and scaled up whole,
// with the flame, the name and the mode over it, and its two ways to play under it. (A frame of the Short's battles was
// tried first: at a phone's size its ships were specks.)
//   npx vite --port 5173 --strictPort (the dev server), then node scripts/thumb-multiplayer.mjs
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const W = 1080;
const H = 1920;
const OUT = 'promo/thumb-short-multiplayer.png';
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
  host.innerHTML = '<canvas class="mode-art" data-art="together" style="width:216px;height:90px"></canvas>';
  document.body.appendChild(host);
  // (Its clock run on to 2.3 seconds, a tenth at a time as the title screen runs it: the allies stopped short of
  // the rival, their shots in flight.)
  for (let t = 1; t <= 3.31; t += 0.1) drawModeArt(host, t);
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
  // Its two ways to play, under it.
  const under = document.createElement('div');
  under.textContent = 'CO-OP · VERSUS';
  under.style.cssText = `position:absolute;left:0;right:0;top:${top + art.height + 34}px;text-align:center;font-family:var(--display, monospace);` +
    `font-size:30px;letter-spacing:0.04em;color:${PAL.mist};white-space:nowrap`;
  box.appendChild(under);
  // The flame, the name and the mode.
  const head = document.createElement('div');
  head.style.cssText = `position:absolute;left:0;right:0;top:${Math.round(H * 0.15)}px;display:flex;flex-direction:column;align-items:center;gap:34px`;
  head.innerHTML = `<div style="width:150px;height:150px">${flame.replace('<svg ', '<svg width="150" height="150" ')}</div>` +
    `<div style="font-family:var(--display, monospace);font-size:84px;line-height:1;letter-spacing:0.04em;color:#ffd23f;` +
    `text-shadow:0.06em 0.06em 0 #ff8a1f,0.12em 0.12em 0 #8c2a3c,-3px -3px 0 ${NIGHT}">HEGEMARCH</div>` +
    `<div style="font-family:var(--display, monospace);font-size:50px;letter-spacing:0.05em;color:${PAL.bone};text-shadow:3px 3px 0 ${NIGHT}">MULTIPLAYER</div>`;
  box.appendChild(head);
}, { W, H, flame });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
console.log(OUT);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
