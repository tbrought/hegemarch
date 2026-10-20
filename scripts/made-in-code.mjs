// A picture for a post about how the game is made (promo/reddit/made-in-code.png, 1600x900): what its art and
// sound are made of, drawn by the game's own code. A ship's lines of text beside the pixels they become, in every
// house's colour and turned through its 16 facings; worlds of every kind, from noise on a sphere, and one lit
// the way a world is kindled; and the waves its sounds are made of.
//   npx vite --port 5173 --strictPort (the dev server), then node scripts/made-in-code.mjs
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const W = 1600;
const H = 900;
const OUT = 'promo/reddit/made-in-code.png';

const { browser, page, errors } = await openBrowser({ viewport: { width: W, height: H }, context: { deviceScaleFactor: 1 } });
await page.goto(DEV_URL);
await page.waitForTimeout(1500);
fs.mkdirSync('promo/reddit', { recursive: true });

await page.evaluate(async ({ W, H }) => {
  const { art, shipSprite } = await import('/src/render/sprites.ts');
  const { worldSprite, drawWorldBlend } = await import('/src/render/worlds.ts');
  const { HEIRS, PAL } = await import('/src/game/data/heirs.ts');
  const NIGHT = '#0b0a1a';
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;background:${NIGHT};overflow:hidden;color:${PAL.mist};font-family:var(--body, monospace)`;
  document.body.appendChild(box);
  const el = (tag, css, html = '') => {
    const e = document.createElement(tag);
    e.style.cssText = css;
    e.innerHTML = html;
    return e;
  };
  /** A canvas drawn at `k` times its size, pixels kept square. */
  const big = (src, k) => {
    const c = document.createElement('canvas');
    c.width = src.width * k;
    c.height = src.height * k;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    c.style.cssText = 'display:block;image-rendering:pixelated';
    return c;
  };
  const head = (t) => `<div style="font-family:var(--display, monospace);font-size:17px;letter-spacing:0.05em;color:${PAL.gold};line-height:1.5">${t}</div>`;
  const note = (t) => `<div style="font-size:21px;line-height:1.35;color:${PAL.mist}">${t}</div>`;

  // The title.
  box.appendChild(el('div', `position:absolute;left:56px;top:40px;right:56px`,
    `<div style="font-family:var(--display, monospace);font-size:30px;letter-spacing:0.05em;color:${PAL.gold};text-shadow:3px 3px 0 ${PAL.wine}">NO SPRITE SHEETS. NO SOUND FILES.</div>` +
    `<div style="margin-top:14px;font-size:26px;color:${PAL.bone}">Every ship, world and sound in Hegemarch is made by its code while it runs.</div>`));

  const col = (x, w) => {
    const c = el('div', `position:absolute;left:${x}px;top:170px;width:${w}px;height:640px;display:flex;flex-direction:column;gap:16px`);
    box.appendChild(c);
    return c;
  };

  // ---- A ship: its lines of text, the pixels, every house, every facing ----
  const a = col(56, 520);
  a.appendChild(el('div', '', head('A SHIP IS 7 LINES OF TEXT')));
  const rows = art('ark');
  const ink = { x: PAL.gold, w: PAL.bone, e: PAL.ember, '.': PAL.slate };
  const code = rows.map((r) => `'${[...r].map((ch) => `<span style="color:${ink[ch] ?? PAL.mist}">${ch}</span>`).join('')}'`).join(',<br>');
  const shipRow = el('div', 'display:flex;align-items:center;gap:26px');
  shipRow.appendChild(el('div', `font-family:Consolas, 'Courier New', monospace;font-size:22px;line-height:1.25;color:${PAL.dusk};background:#14122a;border:2px solid ${PAL.indigo};padding:12px 16px`, `ark: [<br>${code}<br>]`));
  shipRow.appendChild(el('div', `font-size:34px;color:${PAL.dusk}`, '→'));
  shipRow.appendChild(big(shipSprite('ark', PAL.gold, 0), 12));
  a.appendChild(shipRow);
  a.appendChild(el('div', '', note(`<span style="color:${PAL.gold}">x</span> is the house's colour, <span style="color:${PAL.bone}">w</span> a highlight, <span style="color:${PAL.ember}">e</span> an engine that flickers. The same lines, in each house's colour:`)));
  const houses = el('div', 'display:flex;gap:20px;align-items:center');
  for (const h of HEIRS.slice(0, 6)) houses.appendChild(big(shipSprite('ark', h.color, 0), 6));
  a.appendChild(houses);
  a.appendChild(el('div', '', note('And turned through 16 facings, pixel by pixel:')));
  const turns = el('div', 'display:grid;grid-template-columns:repeat(8, 56px);gap:10px 8px;align-items:center;justify-items:center');
  for (let d = 0; d < 16; d++) turns.appendChild(big(shipSprite('striker', PAL.teal, d), 4));
  a.appendChild(turns);

  // ---- Worlds: noise on a sphere, and one kindled ----
  const b = col(640, 440);
  b.appendChild(el('div', '', head('A WORLD IS NOISE<br>ON A SPHERE')));
  // (The kinds that are spheres: an asteroid belt is a scatter of rocks.)
  const kinds = ['terran', 'ocean', 'desert', 'volcanic', 'ice', 'gas', 'barren', 'terran'];
  const grid = el('div', 'display:grid;grid-template-columns:repeat(4, 96px);gap:14px 18px;align-items:center;justify-items:center');
  kinds.forEach((ptype, i) => {
    const n = { id: 900000 + i, seed: 7 + i * 131, ptype, kind: 'planet' };
    grid.appendChild(big(worldSprite(n, 15, true), 3));
  });
  b.appendChild(grid);
  b.appendChild(el('div', '', note('Each kind of world has its own noise, wrapped round a sphere, lit, and shaded into four or five colours with a dither.')));
  b.appendChild(el('div', '', note('A world that a house takes is lit pixel by pixel:')));
  const lit = el('div', 'display:flex;gap:10px;align-items:center');
  const world = { id: 900100, seed: 41, ptype: 'terran', kind: 'planet' };
  for (const p of [0, 0.3, 0.55, 0.8, 1]) {
    const c = document.createElement('canvas');
    c.width = 31;
    c.height = 31;
    drawWorldBlend(c.getContext('2d'), world, 15, 0, 0, p);
    lit.appendChild(big(c, 2.6));
  }
  b.appendChild(lit);

  // ---- Sound: the waves ----
  const s = col(1130, 414);
  s.appendChild(el('div', '', head('A SOUND IS A WAVE')));
  /** One wave, drawn as a line of pixels: `f(t)` in -1..1 over two periods. */
  const wave = (label, f) => {
    const w = 138;
    const h = 18;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = PAL.teal;
    let last = null;
    for (let x = 0; x < w; x++) {
      const y = Math.round((1 - f(x / w)) * 0.5 * (h - 3)) + 1;
      if (last !== null) for (let k = Math.min(last, y); k <= Math.max(last, y); k++) g.fillRect(x, k, 1, 1);
      else g.fillRect(x, y, 1, 1);
      last = y;
    }
    const r = el('div', 'display:flex;flex-direction:column;gap:4px');
    r.appendChild(el('div', `font-size:20px;color:${PAL.bone}`, label));
    r.appendChild(big(c, 3));
    return r;
  };
  const pulse = (duty) => (t) => ((t * 2) % 1 < duty ? 1 : -1);
  s.appendChild(wave('Pulse, 12.5%', pulse(0.125)));
  s.appendChild(wave('Pulse, 50%', pulse(0.5)));
  s.appendChild(wave('Triangle', (t) => { const p = (t * 2) % 1; return p < 0.5 ? p * 4 - 1 : 3 - p * 4; }));
  // (The noise as the game makes it: a 15-bit shift register, as an 8-bit console's noise channel.)
  // (Run on a while first: from its seed of all ones it gives a long run of them.)
  let lfsr = 0x7fff;
  const step = () => {
    const bit = (lfsr ^ (lfsr >> 1)) & 1;
    lfsr = (lfsr >> 1) | (bit << 14);
  };
  for (let i = 0; i < 3000; i++) step();
  const bits = [];
  for (let i = 0; i < 138; i++) {
    if (i % 2 === 0) step();
    bits.push(lfsr & 1 ? 1 : -1);
  }
  s.appendChild(wave('Noise, from a shift register', (t) => bits[Math.min(137, Math.floor(t * 138))]));
  s.appendChild(el('div', '', note('Every sound is played on these at the moment it is heard. The 12 music tracks are written as chords and tunes, and played the same way.')));

  // The foot.
  box.appendChild(el('div', `position:absolute;left:56px;right:56px;bottom:34px;display:flex;justify-content:space-between;font-size:22px;color:${PAL.dusk}`,
    `<span><span style="color:${PAL.gold}">hegemarch.com</span> · free, in the browser</span><span>TypeScript and Canvas · one HTML file, about 250 KB zipped</span>`));
}, { W, H });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
console.log(OUT);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
