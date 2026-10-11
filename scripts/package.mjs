// Release packaging: everything to upload, in release/ (run after the build; `npm run package` does both).
//   release/site/                 the website: landing page (and its script), the game at /play/, the download at /hegemarch.zip
//   release/itch/hegemarch-web.zip  itch.io, "played in the browser" (index.html at the top of the zip)
//   release/itch/hegemarch.zip      itch.io, the download (the same file the website offers)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const gameFile = path.join('dist', 'hegemarch.html');
// The landing page's script, built from src/site by `npm run build:site`.
const siteScript = path.join('dist', 'site', 'site.js');
if (!fs.existsSync(gameFile) || !fs.existsSync(siteScript)) throw new Error('package: run the builds first (npm run package does)');
const game = fs.readFileSync(gameFile);

const README = `Hegemarch v${version}
An 8-bit real-time space strategy roguelite.

To play: open hegemarch.html in any modern browser (Chrome, Edge, Firefox or Safari).
Nothing to install, and it plays offline. Your progress is saved in that browser.

https://hegemarch.com
`;

// ---------------------------------------------------------------------------
// A small .zip writer (deflate), so packaging needs nothing beyond Node.
// ---------------------------------------------------------------------------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip [name, contents] pairs. */
function zip(entries) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const packed = zlib.deflateRawSync(raw, { level: 9 });
    const fname = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fname.length, 26);
    local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(fname.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, fname, packed);
    central.push(head, fname);
    offset += local.length + fname.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

// ---------------------------------------------------------------------------

const out = 'release';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'site', 'play'), { recursive: true });
fs.mkdirSync(path.join(out, 'itch'), { recursive: true });

// The website: the landing page (and anything beside it in site/), the game, the download.
for (const f of fs.readdirSync('site')) {
  const from = path.join('site', f);
  if (f.endsWith('.html')) fs.writeFileSync(path.join(out, 'site', f), fs.readFileSync(from, 'utf8').replaceAll('{{VERSION}}', version));
  else fs.copyFileSync(from, path.join(out, 'site', f));
}
// The typefaces, and their licences (the game carries its own copies inside its one file).
fs.mkdirSync(path.join(out, 'site', 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join('src', 'fonts'))) fs.copyFileSync(path.join('src', 'fonts', f), path.join(out, 'site', 'fonts', f));
fs.copyFileSync(siteScript, path.join(out, 'site', 'site.js'));
fs.writeFileSync(path.join(out, 'site', 'play', 'index.html'), game);
const download = zip([
  ['hegemarch.html', game],
  ['README.txt', README],
]);
fs.writeFileSync(path.join(out, 'site', 'hegemarch.zip'), download);

// itch.io: the browser build wants index.html at the top of its zip; the download is the same as the site's.
fs.writeFileSync(path.join(out, 'itch', 'hegemarch-web.zip'), zip([['index.html', game]]));
fs.writeFileSync(path.join(out, 'itch', 'hegemarch.zip'), download);

const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;
console.log(`package: Hegemarch v${version}
  release/site/                    the website (upload this folder)
  release/itch/hegemarch-web.zip   itch.io, played in the browser (${kb(path.join(out, 'itch', 'hegemarch-web.zip'))})
  release/itch/hegemarch.zip       itch.io and website download (${kb(path.join(out, 'itch', 'hegemarch.zip'))})`);
