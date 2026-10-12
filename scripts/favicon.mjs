// The icon of the site and of the game: the flame, drawn in the game's own palette on a 16x16 grid.
// Writes site/favicon.svg, site/favicon.ico (16, 32 and 48 pixels), site/apple-touch-icon.png (180 pixels)
// and the icon inside index.html (the game's own page carries it in a data address, so one file is the game).
//   node scripts/favicon.mjs        (needs Edge or Chrome, to draw the PNGs)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const PAL = { V: '#0b0a1a', R: '#e0402f', E: '#ff8a1f', G: '#ffd23f', B: '#fff4e0' };
// The flame: where there is fire...
const FLAME = [
  '................',
  '.........#......',
  '........##......',
  '........##......',
  '.......###......',
  '.......####.....',
  '......#####.....',
  '.....######..#..',
  '....#######.##..',
  '....##########..',
  '...###########..',
  '...############.',
  '...############.',
  '...###########..',
  '....#########...',
  '.....#######....',
];
// ...and its colours by how deep a pixel lies inside it: red at the edge, ember, gold, and white-hot at
// the heart. (Its foot counts as deep, so the heart sits low, as in the game's ember.)
const RAMP = ['R', 'E', 'E', 'G', 'B'];
function shade(mask) {
  const H = mask.length;
  const W = mask[0].length;
  const inside = (x, y) => y >= H || (y >= 0 && x >= 0 && x < W && mask[y][x] === '#');
  return mask.map((row, y) => [...row].map((c, x) => {
    if (c !== '#') return '.';
    let d = 99;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
      let k = 0;
      while (inside(x + dx * (k + 1), y + dy * (k + 1)) && k < 9) k++;
      d = Math.min(d, k);
    }
    return RAMP[Math.min(RAMP.length - 1, d)];
  }).join(''));
}
const rows = shade(FLAME);

/** The flame as an SVG. `pad`: pixels of the tile left free round the 16x16 picture; `round`: the tile's corners. */
function svg({ pad = 0, round = 3 } = {}) {
  const size = 16 + pad * 2;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}"${round ? ` rx="${round}"` : ''} fill="${PAL.V}"/>`;
  rows.forEach((row, y) => {
    let x = 0;
    while (x < 16) {
      const ch = row[x];
      if (ch === '.') {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && row[x + w] === ch) w++;
      s += `<rect x="${x + pad}" y="${y + pad}" width="${w}" height="1" fill="${PAL[ch]}"/>`;
      x += w;
    }
  });
  return s + '</svg>';
}

const icon = svg();
fs.writeFileSync('site/favicon.svg', icon + '\n');

// The game's page: the same picture, in the address of its icon.
const uri = 'data:image/svg+xml,' + icon.replace(/"/g, '%27').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
const page = fs.readFileSync('index.html', 'utf8');
const link = /<link rel="icon" href="data:image\/svg\+xml,[^"]*" \/>/;
if (!link.test(page)) throw new Error('index.html: the icon link was not found');
fs.writeFileSync('index.html', page.replace(link, `<link rel="icon" href="${uri}" />`));

// The PNGs, drawn by a browser at their own sizes.
const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
async function png(markup, px) {
  const p = await (await browser.newContext({ viewport: { width: px, height: px }, deviceScaleFactor: 1 })).newPage();
  await p.setContent(`<body style="margin:0;background:transparent"><img src="data:image/svg+xml,${encodeURIComponent(markup)}" width="${px}" height="${px}" style="display:block;image-rendering:pixelated"></body>`);
  const buf = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  await p.close();
  return buf;
}
// (A phone rounds the corners of its icons itself, and wants no see-through ones: the tile to the edge,
// with a little room round the flame.)
fs.writeFileSync('site/apple-touch-icon.png', await png(svg({ pad: 1, round: 0 }), 180));
const sizes = [16, 32, 48];
const images = [];
for (const px of sizes) images.push(await png(icon, px));
await browser.close();

// An .ico is a list of pictures; a PNG may be one of them as it is.
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let at = head.length;
images.forEach((img, i) => {
  const o = 6 + i * 16;
  head.writeUInt8(sizes[i], o);
  head.writeUInt8(sizes[i], o + 1);
  head.writeUInt8(0, o + 2);
  head.writeUInt8(0, o + 3);
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(img.length, o + 8);
  head.writeUInt32LE(at, o + 12);
  at += img.length;
});
fs.writeFileSync('site/favicon.ico', Buffer.concat([head, ...images]));
console.log(`favicon: site/favicon.svg (${icon.length} bytes), site/favicon.ico (${sizes.join(', ')} px), site/apple-touch-icon.png (180 px), and the icon of index.html`);
