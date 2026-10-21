// A cover for the game's page on a store or a catalog (IGDB, for Twitch: portrait, 3:4, at least 600x800,
// the logo over the game's art and no other words): a real moment of a real sector, played by the game's
// own houses and drawn by its own renderer at its own pixel size, with the flame and the name over it.
// Writes promo/cover-<name>.png (1200x1600) for each cover below; and promo/thumb-<name>.png (1280x720), a
// video's thumbnail (YouTube's size), the same way. (The game's own words on the map, a star's burning time
// or a Starfall's fuse, are left out of the frame taken.)
//   npx vite --port 5173 --strictPort (the dev server), then node scripts/cover.mjs [name,name]
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const min = (m) => Math.round(m * 60 * 20);
const sector = (seed, extra = {}) => ({ seed, size: 'medium', difficulty: 2, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true, ...extra });
// A thumbnail: wide, at the game's small pixels (two of the screen's to one), the name over its upper third.
const THUMB = { w: 1280, h: 720, px: 'small', kind: 'thumb', logo: 0.36 };

// The moments (scripts/trailer/make.mjs scan found them): where the camera is, and where the name sits (0..1, top to bottom).
const COVERS = {
  // A swarm of the Lyceum Collective storming the Hearth of the Vael Imperium: the last battle of a sector.
  siege: { config: sector(90), tick: min(58.78), node: 46, zoom: 0.36, dy: 0.12, logo: 0.2, frames: 75 },
  // A star erupting: a Starfall, the fire on its rings, the worlds round it. (Xanth, in seed 8: since 1.27 the star
  // of seed 23 that these were first made from no longer erupts. NOVA in trailer/trailers.mjs is the same one.)
  starfall: { config: sector(8), tick: 38617 + 8, node: 23, zoom: 0.24, dy: 0.12, logo: 0.2, frames: 40 },
  // A dark world kindled: the house's color floods it, with the ring of its kindling.
  kindle: { config: sector(90), tick: 603 + 9, node: 34, zoom: 0.72, dy: 0.1, logo: 0.2, frames: 40 },
  // Thumbnails. Three houses at war over one world: the Vael's red, the Concord's gold, the Lyceum's violet.
  battle: { ...THUMB, config: sector(90), tick: min(18.2), node: 26, zoom: 0.5, dx: -0.08, dy: 0.2, frames: 40 },
  // A star erupting, its fire on its rings.
  eruption: { ...THUMB, config: sector(8), tick: 38617 + 8, node: 23, zoom: 0.3, dy: 0.18, frames: 40 },
  // A Short's thumbnail (YouTube's upright 9:16), for the pitch Short: the same star erupting, the name over it and
  // a line of what it is, clear of the foot of the picture, where YouTube lays a Short's title over it.
  'short-pitch': { w: 1080, h: 1920, px: 'large', kind: 'thumb', config: sector(8), tick: 38617 + 8, node: 23, zoom: 0.46, dy: 0.08, logo: 0.22, frames: 40,
    tagline: 'FREE IN YOUR BROWSER' },
  // The cradle in its later ages, every land lit by its tribes: where the story of a run of Ages begins.
  cradle: { ...THUMB, config: sector(12, { mode: 'ages', stage: 'cradle' }), tick: min(14.5), fit: 1.25, frames: 40, logo: 0.3 },
  // The Ages Short's thumbnail, upright: its war on the cradle (the Lyceum at Aurelia, the Concord's home, in seed 3:
  // the Short's own shot), close enough to read at a phone's size, and the name and what the mode is over it.
  'short-ages': { w: 1080, h: 1920, px: 'large', kind: 'thumb', config: sector(3, { mode: 'ages', stage: 'cradle' }), tick: min(16.33), node: 1, dx: -0.12,
    zoom: 0.6, dy: 0.1, frames: 40, logo: 0.22, tagline: 'STONE AGE TO THE STARS' },
};

const only = process.argv[2]?.split(',');
const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 1600 }, context: { deviceScaleFactor: 1 } });
await page.goto(DEV_URL);
await page.waitForTimeout(1500);
const flame = fs.readFileSync('site/favicon.svg', 'utf8');
fs.mkdirSync('promo', { recursive: true });

for (const [name, c] of Object.entries(COVERS)) {
  if (only && !only.includes(name)) continue;
  const W = c.w ?? 1200;
  const H = c.h ?? 1600;
  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(async ({ c, flame, W, H }) => {
    document.querySelector('#cover')?.remove();
    const box = document.createElement('div');
    box.id = 'cover';
    box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;background:#0b0a1a;overflow:hidden`;
    // The world, and over it the name, both at the game's pixel size (three of the screen's to one of the game's).
    box.innerHTML = '<canvas class="world" style="position:absolute;left:0;top:0;image-rendering:pixelated"></canvas>' +
      '<canvas class="name" style="position:absolute;left:0;top:0;image-rendering:pixelated"></canvas>';
    document.body.appendChild(box);
    await document.fonts.load('32px "Press Start 2P"');
    const { Game } = await import('/src/game/Game.ts');
    const { Renderer, emptyView } = await import('/src/render/Renderer.ts');
    const { Screen } = await import('/src/render/Screen.ts');
    const { PAL } = await import('/src/game/data/heirs.ts');
    const screen = new Screen(box.querySelector('.world'), box);
    screen.setPixelSize(c.px ?? 'large');
    const r = new Renderer(screen);
    const g = Game.create(c.config);
    g.fxEnabled = false;
    while (g.tick < c.tick - c.frames && !g.outcome) g.step();
    g.fxEnabled = true;
    r.prepare(g);
    const cam = r.cam;
    const place = () => {
      if (c.fit) {
        cam.fitAll();
        cam.zoom = cam.tzoom = cam.minZoom * c.fit;
        return;
      }
      const n = g.nodes[c.node];
      cam.zoom = cam.tzoom = c.zoom;
      cam.x = cam.tx = n.x - ((c.dx ?? 0) * screen.W) / c.zoom;
      // (The world a little below the middle: the name is over the top of the picture.)
      cam.y = cam.ty = n.y - (c.dy * screen.H) / c.zoom;
    };
    const view = emptyView(true);
    for (let f = 0; f < c.frames; f++) {
      g.step();
      r.fx.ingest(g.fx, () => true, (x, y, pad) => cam.sees(x, y, pad), cam.zoom);
      g.fx.length = 0;
      r.fx.update(0.05);
      place();
      // (The last frame has no words of the game's over it: a star's "BURNS 3:00", a Starfall's fuse.)
      const last = f === c.frames - 1;
      const fires = last ? g.nodes.filter((n) => n.hazard?.by !== undefined).map((n) => [n, n.hazard.by]) : [];
      const armedAt = g.armedAt;
      if (last) {
        for (const [n] of fires) n.hazard.by = undefined;
        g.armedAt = () => null;
      }
      r.render(g, 1, 0.05, view, true);
      for (const [n, by] of fires) n.hazard.by = by;
      g.armedAt = armedAt;
    }
    // The name: the flame, and HEGEMARCH as the website has it (gold, its shadows ember and wine).
    const w = screen.W;
    const h = screen.H;
    const name = box.querySelector('.name');
    name.width = w;
    name.height = h;
    name.style.width = `${w * screen.scale}px`;
    name.style.height = `${h * screen.scale}px`;
    const g2 = name.getContext('2d');
    const cy = Math.round(h * c.logo);
    // (A band of the night behind the name, darker in its middle, pixel by pixel: the name reads over anything.)
    const band = 64;
    for (let y = cy - band - 36; y < cy + band - 10; y++) {
      for (let x = 0; x < w; x++) {
        const k = 1 - Math.abs(y - (cy - 23)) / (band + 13);
        const level = Math.max(0, Math.min(1, k * 1.6));
        const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)];
        if ((bayer + 0.5) / 16 < level * 0.8) {
          g2.fillStyle = PAL.void;
          g2.fillRect(x, y, 1, 1);
        }
      }
    }
    const rects = [...flame.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)];
    const fs = 5;
    for (const m of rects) {
      g2.fillStyle = m[5];
      g2.fillRect(Math.round(w / 2 - 8 * fs) + +m[1] * fs, cy - 92 + +m[2] * fs, +m[3] * fs, +m[4] * fs);
    }
    g2.font = '32px "Press Start 2P"';
    g2.textBaseline = 'top';
    const text = 'HEGEMARCH';
    const left = Math.round(w / 2 - g2.measureText(text).width / 2);
    const top = cy + 2;
    g2.fillStyle = PAL.void;
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, -4], [-4, 4], [4, 4]]) g2.fillText(text, left + dx, top + dy);
    g2.fillStyle = PAL.wine;
    g2.fillText(text, left + 4, top + 4);
    g2.fillStyle = PAL.ember;
    g2.fillText(text, left + 2, top + 2);
    g2.fillStyle = PAL.gold;
    g2.fillText(text, left, top);
    // (A line of what it is, under the name, in bone on its own outline of night.)
    if (c.tagline) {
      g2.font = '16px "Press Start 2P"';
      const tl = Math.round(w / 2 - g2.measureText(c.tagline).width / 2);
      const tt = top + 46;
      g2.fillStyle = PAL.void;
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, -3], [-3, 3], [3, 3]]) g2.fillText(c.tagline, tl + dx, tt + dy);
      g2.fillStyle = PAL.bone;
      g2.fillText(c.tagline, tl, tt);
    }
  }, { c, flame, W, H });
  const out = `promo/${c.kind ?? 'cover'}-${name}.png`;
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(out);
}
if (errors.length) console.log(errors.join('\n'));
await browser.close();
