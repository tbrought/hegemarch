// The flame of the site's icon (site/favicon.svg, drawn by scripts/favicon.mjs), large and square, for a
// profile picture (a YouTube channel, a store page): every pixel of the 16x16 flame a block of the same
// size, on the night of the game, with room round it for the circle a profile picture is cut to.
// Writes promo/logo-800.png (800x800) and promo/logo-circle-preview.png (as the circle shows it).
//   node scripts/logo.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const svg = fs.readFileSync('site/favicon.svg', 'utf8');
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const NIGHT = hex(/<rect width="16" height="16"[^>]*fill="(#[0-9a-f]{6})"/.exec(svg)[1]);
const cells = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)].map((m) => ({
  x: +m[1], y: +m[2], w: +m[3], h: +m[4], c: hex(m[5]),
}));
if (cells.length < 40) throw new Error('site/favicon.svg: the flame was not found');

// The flame on a grid of 20 (two blocks of night round it), 40 pixels a block: 800 pixels.
const GRID = 20;
const PAD = 2;
const BLOCK = 40;
const SIZE = GRID * BLOCK;
// (The flame's outline centred: it stands from x 3 to 14 and y 1 to 15 of its grid.)
const left = Math.min(...cells.map((r) => r.x));
const right = Math.max(...cells.map((r) => r.x + r.w));
const top = Math.min(...cells.map((r) => r.y));
const bottom = Math.max(...cells.map((r) => r.y + r.h));
const OX = Math.round(SIZE / 2 - ((left + right) / 2 + PAD) * BLOCK);
const OY = Math.round(SIZE / 2 - ((top + bottom) / 2 + PAD) * BLOCK);

function picture(circle) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      const dx = x + 0.5 - SIZE / 2;
      const dy = y + 0.5 - SIZE / 2;
      const out = circle && dx * dx + dy * dy > (SIZE / 2) * (SIZE / 2);
      [px[o], px[o + 1], px[o + 2]] = NIGHT;
      px[o + 3] = out ? 0 : 255;
    }
  }
  for (const r of cells) {
    for (let y = (r.y + PAD) * BLOCK + OY; y < (r.y + PAD + r.h) * BLOCK + OY; y++) {
      for (let x = (r.x + PAD) * BLOCK + OX; x < (r.x + PAD + r.w) * BLOCK + OX; x++) {
        const o = (y * SIZE + x) * 4;
        if (px[o + 3] === 0) continue;
        [px[o], px[o + 1], px[o + 2]] = r.c;
      }
    }
  }
  return png(px);
}

// A PNG: its rows (each led by "no filter"), deflated, in chunks with their CRCs.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(SIZE, 0);
  head.writeUInt32BE(SIZE, 4);
  head[8] = 8;
  head[9] = 6;
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('promo', { recursive: true });
fs.writeFileSync('promo/logo-800.png', picture(false));
fs.writeFileSync('promo/logo-circle-preview.png', picture(true));
console.log(`logo: promo/logo-800.png (${SIZE}x${SIZE}), promo/logo-circle-preview.png`);
