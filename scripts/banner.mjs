// A banner for a channel (YouTube: 2560x1440): a real sector, played by the game's own houses and drawn
// by the game's own renderer, with the flame and the name in the middle. What each screen shows of it:
// a television all of it, a computer the band across the middle (2560x423), a phone the middle of that
// band (1546x423). So the camera is put where the most lit worlds lie in that band, either side of the
// name, and the name lies in the phone's part.
// Writes promo/banner-<seed>.png for each seed given (default three). The channel's, promo/banner.png, is seed 23's.
//   npx vite --port 5173 --strictPort (the dev server), then node scripts/banner.mjs [seed,seed,...]
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const W = 2560;
const H = 1440;
const SEEDS = (process.argv[2] ?? '11,23,47').split(',').map(Number);
// The line under the name, in the two tones of the website's words: what it names in bone, what to take away
// in gold. (C by default; TAG=a|b|c makes one of the three looks offered, promo/banner-<seed>-<tag>.png.)
const NIGHT = 'text-shadow:3px 3px 0 #0b0a1a,-3px -3px 0 #0b0a1a,3px -3px 0 #0b0a1a,-3px 3px 0 #0b0a1a';
const GOLD = 'color:#ffd23f;text-shadow:0.08em 0.08em 0 #ff8a1f,0.16em 0.16em 0 #8c2a3c,-3px -3px 0 #0b0a1a';
const TAGS = {
  a: `<div style="white-space:nowrap;font-family:var(--body, monospace);font-size:42px;color:#c9c3e6;${NIGHT}">Light the <span style="color:#fff4e0">dark sector</span>, world by world. <span style="color:#ffd23f">Take the crown.</span></div>`,
  b: `<div style="white-space:nowrap;display:flex;flex-direction:column;gap:18px;font-family:var(--display, monospace);font-size:28px;letter-spacing:0.06em;line-height:1">
      <div style="color:#fff4e0;${NIGHT}">LIGHT THE DARK SECTOR, WORLD BY WORLD.</div><div style="${GOLD}">TAKE THE CROWN.</div></div>`,
  c: `<div style="white-space:nowrap;display:flex;flex-direction:column;gap:20px">
      <div style="font-family:var(--body, monospace);font-size:44px;color:#c9c3e6;${NIGHT}">Light the <span style="color:#fff4e0">dark sector</span>, world by world.</div>
      <div style="font-family:var(--display, monospace);font-size:38px;letter-spacing:0.06em;line-height:1;${GOLD}">TAKE THE CROWN.</div></div>`,
};
const TAG = process.env.TAG;
const tagline = TAGS[TAG ?? 'c'];
const flame = fs.readFileSync('site/favicon.svg', 'utf8').replace(/<rect width="16" height="16"[^>]*\/>/, '');

const { browser, page, errors } = await openBrowser({ viewport: { width: W, height: H }, context: { deviceScaleFactor: 1 } });
await page.goto(DEV_URL);
await page.waitForTimeout(1500);
fs.mkdirSync('promo', { recursive: true });

for (const seed of SEEDS) {
  await page.evaluate(async ({ seed, flame, W, H, tagline }) => {
    document.querySelector('#banner')?.remove();
    const box = document.createElement('div');
    box.id = 'banner';
    box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;background:#0b0a1a;overflow:hidden`;
    box.innerHTML = `<canvas style="position:absolute;left:0;top:0;image-rendering:pixelated"></canvas>
      <div class="shade" style="position:absolute;inset:0;background:radial-gradient(ellipse 760px 250px at 50% 50%, rgba(11,10,26,0.82) 0, rgba(11,10,26,0.55) 60%, rgba(11,10,26,0) 100%)"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:52px">
        <div style="width:192px;height:192px;flex:none">${flame.replace('<svg ', '<svg width="192" height="192" ')}</div>
        <div style="display:flex;flex-direction:column;gap:24px">
          <div style="font-family:var(--display, 'Press Start 2P', monospace);font-size:104px;line-height:1;letter-spacing:0.06em;color:#ffd23f;
            text-shadow:0.06em 0.06em 0 #ff8a1f,0.12em 0.12em 0 #8c2a3c,-3px -3px 0 #0b0a1a">HEGEMARCH</div>
          ${tagline}
        </div>
      </div>`;
    document.body.appendChild(box);
    const canvas = box.querySelector('canvas');
    const { Game } = await import('/src/game/Game.ts');
    const { Renderer, emptyView } = await import('/src/render/Renderer.ts');
    const { Screen } = await import('/src/render/Screen.ts');
    const { HEIRS } = await import('/src/game/data/heirs.ts');
    const screen = new Screen(canvas, box);
    screen.setPixelSize('small');
    const r = new Renderer(screen);
    const g = Game.create({ seed, size: 'medium', difficulty: 2, heir: HEIRS[seed % HEIRS.length].id, perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
    g.fxEnabled = false;
    for (let i = 0; i < 18 * 60 * 20 && !g.outcome; i++) g.step();
    g.fxEnabled = true;
    r.prepare(g);
    const cam = r.cam;
    // Where the most lit worlds lie: in the middle band either side of the name (what a computer shows),
    // as many on the left as on the right, and in the whole picture (what a television shows).
    const band = (423 / H) * screen.H;
    // (The flame and the name take about 1260x200 of the middle: no world under them, nor touching them.)
    const nameW = (1260 / W) * screen.W + 24;
    const nameH = (200 / H) * screen.H + 20;
    let best = { s: -1, x: 0, y: 0, z: 0.1 };
    const cx = (g.bounds.minX + g.bounds.maxX) / 2;
    const cy = (g.bounds.minY + g.bounds.maxY) / 2;
    for (const k of [1, 1.25, 1.55, 1.9, 2.3]) {
      const z = cam.minZoom * k;
      const spots = [{ x: cx, y: cy }, ...g.nodes.map((n) => ({ x: n.x, y: n.y }))];
      for (const p of spots) {
        let left = 0;
        let right = 0;
        let all = 0;
        let hidden = 0;
        for (const m of g.nodes) {
          if (m.kind !== 'planet') continue;
          const sx = (m.x - p.x) * z + screen.W / 2;
          const sy = (m.y - p.y) * z + screen.H / 2;
          if (sx < 6 || sx > screen.W - 6 || sy < 6 || sy > screen.H - 6) continue;
          const lit = m.owner >= 0 ? 1 : 0.25;
          all += lit;
          if (Math.abs(sx - screen.W / 2) < nameW / 2 && Math.abs(sy - screen.H / 2) < nameH / 2) {
            hidden += 1;
            continue;
          }
          const inBand = Math.abs(sy - screen.H / 2) < band / 2 - 4;
          if (!inBand) continue;
          if (Math.abs(sx - screen.W / 2) < nameW / 2) continue;
          if (sx < screen.W / 2) left += lit;
          else right += lit;
        }
        const s = Math.min(left, right) * 3 + (left + right) + all * 0.6 - hidden * 4;
        if (s > best.s) best = { s, x: p.x, y: p.y, z };
      }
    }
    cam.tzoom = cam.zoom = best.z;
    cam.tx = cam.x = best.x;
    cam.ty = cam.y = best.y;
    const view = emptyView(true);
    for (let f = 0; f < 120; f++) {
      g.step();
      // (No words of the game's over the picture: an ability's name as it is cast, a world's news.)
      r.fx.ingest(g.fx.filter((f) => f.k !== 'text' && f.k !== 'ability'), () => true, (x, y, pad) => cam.sees(x, y, pad), cam.zoom);
      g.fx.length = 0;
      r.fx.update(0.05);
      cam.tzoom = cam.zoom = best.z;
      cam.tx = cam.x = best.x;
      cam.ty = cam.y = best.y;
      r.render(g, 1, 0.05, view, true);
    }
  }, { seed, flame, W, H, tagline });
  const out = TAG ? `promo/banner-${seed}-${TAG}.png` : `promo/banner-${seed}.png`;
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(out);
}
if (errors.length) console.log(errors.join('\n'));
await browser.close();
