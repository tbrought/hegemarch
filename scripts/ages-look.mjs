// Screenshots of an Ages run for a visual review: the cradle's opening card, its panels, the top bar in
// every state, the troops and settlements of each age, and the whole map as the rivals climb.
// Saves to .shots/ages-*.png.
//   node scripts/ages-look.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 810) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/ages-${name}.png` });
  console.log('saved', name);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Run the game forward by `seconds` at once (no drawing in between). */
const skip = (seconds) =>
  ev((s) => {
    const g = window.__app.session.game;
    for (let i = 0; i < s * 20 && !g.outcome && !g.ascended; i++) g.step();
    g.fx.length = 0;
  }, seconds);
const look = (zoom, node) =>
  ev(
    ([z, id]) => {
      const app = window.__app;
      const g = app.session.game;
      const n = g.nodes[id ?? g.player.capital];
      const cam = app.renderer.cam;
      cam.focus(n.x, n.y, z);
      cam.update(10);
    },
    [zoom, node],
  );

try {
  await page.goto(url);
  await wait(1200);
  await ev(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 4, wins: 1, legacy: 140, totalLegacy: 300, seenTips: [], settings: { master: 0.7, sfx: 0.8, music: 0.5, edgePan: false, tips: false, autoPause: false, crt: false, pixelSize: 'auto', explainTerms: true } })));
  await page.reload();
  await wait(1500);
  await shot('menu');
  await page.click('[data-sa="ages"]');
  await wait(400);
  await shot('setup');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(1800);
  await shot('card-cradle');
  await ev(() => (window.__app.session.modal = null));
  await page.keyboard.press('KeyB');
  await wait(900);
  await shot('draft');
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdChooseCard(g.playerId, g.ensureOffer(g.player)[0]);
    window.__app.session.modal = null;
  });
  // The Hearth, selected: its card, and the top bar while the Lore of the age gathers.
  await ev(() => {
    const s = window.__app.session;
    s.paused = true;
    s.selectNode(s.game.player.capital);
    s.game.player.lore = 120;
  });
  await look(0.2);
  await wait(500);
  await shot('hearth-card');
  // The Lore is full: the order to advance.
  await ev(() => {
    const p = window.__app.session.game.player;
    p.lore = 260;
    p.embers = 900;
  });
  await wait(400);
  await shot('advance-ready');
  await page.keyboard.press('KeyA');
  await ev(() => (window.__app.session.paused = false));
  await wait(1500);
  await shot('advance-going');
  // The Boons of two later ages (their own names, the age's own units and buildings in the pictures).
  for (const era of [1, 2, 4]) {
    await ev((e) => {
      const s = window.__app.session;
      const p = s.game.player;
      p.advance = null;
      p.era = e;
      s.game.recomputeMods(p);
      p.pendingDrafts = 1;
      p.draftOffer = null;
      p.rerolls = 3;
      window.__app.hud.modals.open({ kind: 'draft' });
    }, era);
    await wait(900);
    await shot(`draft-era-${era}`);
    await ev(() => {
      const s = window.__app.session;
      s.game.cmdReroll(s.game.playerId);
    });
    await wait(900);
    await shot(`draft-era-${era}-b`);
    await ev(() => {
      const s = window.__app.session;
      s.game.player.pendingDrafts = 0;
      s.game.player.draftOffer = null;
      s.modal = null;
    });
  }
  await ev(() => {
    const p = window.__app.session.game.player;
    p.era = 0;
    window.__app.session.game.recomputeMods(p);
    p.advance = { t: 5, total: 30, lore: 0, cost: 0 };
  });
  await page.keyboard.press('KeyU');
  await wait(500);
  await shot('status');
  await ev(() => (window.__app.session.modal = null));
  // Every age up close: its settlement and its three lines of units (and an older unit among them).
  for (let era = 0; era < 5; era++) {
    await ev((e) => {
      const s = window.__app.session;
      const g = s.game;
      const p = g.player;
      p.advance = null;
      p.era = e;
      g.recomputeMods(p);
      for (const u of g.unitsOf(p.id)) u.dead = true;
      window.__app.renderer.fx.clear();
      const cap = g.nodes[p.capital];
      g.setLevel(cap, e >= 2 ? 3 : 2);
      const types = e === 0 ? ['striker', 'guardian'] : ['striker', 'guardian', 'breaker'];
      types.forEach((t, i) => {
        for (let k = 0; k < 3; k++) g.spawnUnit(t, p.id, p.capital, { x: cap.x - 230 + i * 190 + k * 46, y: cap.y + 210 + k * 26 });
      });
      g.spawnUnit('seed', p.id, p.capital, { x: cap.x + 330, y: cap.y - 150 });
      s.clearSelection();
      s.paused = true;
    }, era);
    await look(0.36);
    await wait(500);
    await shot(`era-${era}`);
  }
  await ev(() => (window.__app.session.paused = false));
  // Let the rivals play a while (the player stands still), and look at the whole cradle.
  await ev(() => window.__app.session.game.exploreAll(window.__app.session.game.player));
  for (const [name, minutes] of [['8min', 8], ['20min', 12]]) {
    await skip(minutes * 60);
    await ev(() => window.__app.renderer.cam.fitAll());
    await wait(500);
    await shot(`cradle-${name}-whole`);
    const busy = await ev(() => {
      const g = window.__app.session.game;
      let best = g.player.capital;
      let n = -1;
      g.nodes.forEach((x) => {
        const c = g.buckets[x.id].length + (x.owner >= 0 && x.owner !== g.playerId ? 4 : 0);
        if (c > n) {
          n = c;
          best = x.id;
        }
      });
      return best;
    });
    await look(0.2, busy);
    await wait(500);
    await shot(`cradle-${name}-close`);
  }
  console.log(errors.length ? `ERRORS:\n${errors.slice(0, 8).join('\n')}` : 'no errors');
} finally {
  await browser.close();
}
