// Automated browser smoke test: plays the First Night in headless Edge/Chrome and saves screenshots to .shots/
//   node scripts/shot.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const vw = Number(process.env.VW ?? 1440);
const vh = Number(process.env.VH ?? 810);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack ?? '')));
const shot = async (name) => {
  await page.screenshot({ path: `.shots/${name}.png` });
  console.log('saved', name);
};
const wait = (ms) => page.waitForTimeout(ms);
const finish = async (code) => {
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
  process.exit(code);
};
/** Advance the simulation quickly (no effects) by `seconds`. */
const fastForward = (seconds) =>
  page.evaluate((secs) => {
    const g = window.__app.session.game;
    g.fxEnabled = false;
    for (let i = 0; i < secs * 20 && !g.outcome; i++) g.step();
    g.fx.length = 0;
    g.fxEnabled = true;
  }, seconds);
/** Page coordinates of a game pixel. */
const toPage = (ix, iy) =>
  page.evaluate(
    ([x, y]) => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      return [r.left + ((x + 0.5) * r.width) / c.width, r.top + ((y + 0.5) * r.height) / c.height];
    },
    [ix, iy],
  );
/** Click the center of a HUD region by id. */
const clickUi = async (id, button = 'left') => {
  const r = await page.evaluate((rid) => window.__app.hud.ui.rectOf(rid), id);
  if (!r) throw new Error('no UI region ' + id);
  const [x, y] = await toPage(r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(x, y, { button });
};
/** Click a world on the map. */
const clickWorld = async (nodeId, button = 'left') => {
  const [ix, iy] = await page.evaluate((id) => {
    const app = window.__app;
    const n = app.session.game.nodes[id];
    return [app.renderer.sx(n.x), app.renderer.sy(n.y)];
  }, nodeId);
  const [x, y] = await toPage(ix, iy);
  await page.mouse.click(x, y, { button });
};
const look = (nodeId, zoom) =>
  page.evaluate(
    ([id, z]) => {
      const app = window.__app;
      const n = app.session.game.nodes[id];
      app.renderer.cam.focus(n.x, n.y, z);
      app.renderer.cam.update(10);
    },
    [nodeId, zoom],
  );

try {
  await page.goto(url);
  await wait(5500);
  await shot('01-menu');

  await page.click('[data-sa="first-night"]');
  await page.waitForFunction(() => window.__app && window.__app.screen === 'game', null, { timeout: 60000 });
  await wait(2500);
  await shot('03-start');

  // Step 1: kindle the highlighted dark world.
  const tw = await page.evaluate(() => window.__app.session.game.ui.tutWorld);
  await clickWorld(tw);
  await wait(500);
  await shot('04-dark-world');
  await clickUi('kindle');
  await wait(800);
  await shot('05-kindle-sent');

  // Step 2: build a Striker at the Hearth.
  const cap = await page.evaluate(() => window.__app.session.game.player.capital);
  await clickWorld(cap);
  await wait(500);
  await shot('06-hearth');
  await clickUi('build-striker');
  await wait(600);

  // Step 3: the Boon.
  await clickUi('boon');
  await wait(600);
  await shot('07-boon-draft');
  await page.keyboard.press('1');
  await wait(800);
  await shot('08-after-boon');

  // Step 4: wait for the world to light up and the raider to come.
  await fastForward(70);
  await wait(3500);
  await shot('09-raid');
  const fleetNode = await page.evaluate(() => {
    const s = window.__app.session;
    let best = -1;
    let bc = 0;
    for (const n of s.game.nodes) {
      const c = s.fleetAt(n.id).length;
      if (c > bc) {
        bc = c;
        best = n.id;
      }
    }
    return best;
  });
  await clickUi('fleet-' + fleetNode);
  await wait(400);
  await shot('10-fleet-selected');
  const newWorld = await page.evaluate(() => {
    const g = window.__app.session.game;
    return g.worldsOf(g.playerId).find((n) => n.capitalOf < 0)?.id ?? -1;
  });
  await clickWorld(newWorld);
  await wait(500);
  await shot('11-fleet-sent');
  for (let i = 0; i < 12; i++) {
    const step = await page.evaluate(() => window.__app.session.game.ui.tut);
    if (step >= 5) break;
    await fastForward(10);
    await wait(200);
  }
  // Step 5: send the Scout exploring (let it land first if it is still flying with the fleet).
  const scoutAt = () =>
    page.evaluate(() => {
      const g = window.__app.session.game;
      const sc = g.unitList.find((u) => !u.dead && u.owner === g.playerId && u.type === 'scout');
      return sc ? { node: sc.node, lane: !!sc.lane } : null;
    });
  for (let i = 0; i < 10 && (await scoutAt())?.lane; i++) await fastForward(2);
  await wait(800);
  await shot('12-explore-step');
  const sc = await scoutAt();
  if (sc && sc.node >= 0) {
    await clickUi('fleet-' + sc.node);
    await wait(400);
    await shot('12b-explore-button');
    await clickUi('explore');
  }
  await wait(3200);
  await shot('12c-destinies');
  await clickUi('dest-begin').catch(() => {});
  await wait(800);
  await shot('13-tutorial-done');

  // Settle any decisions that came up during the tutorial.
  await page.evaluate(() => {
    const app = window.__app;
    const g = app.session.game;
    for (const p of g.prompts) if (p.result === undefined) g.cmdResolvePrompt(p.id, 0);
    g.prompts.length = 0;
    app.session.modal = null;
  });
  // A battle up close.
  await page.evaluate(() => {
    const s = window.__app.session;
    const g = s.game;
    g.time = Math.max(g.time, 500);
    g.nextGalactic = 1e9;
    g.pirates.nextRaid = 1e9;
    const star = g.nodes.find((n) => n.kind === 'star' && g.systems[n.system].home && g.nodes[g.player.capital].system === n.system);
    const at = star.id;
    for (let i = 0; i < 5; i++) g.spawnUnit('guardian', 0, at);
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', 0, at);
    for (let i = 0; i < 3; i++) g.spawnUnit('breaker', 0, at);
    g.spawnUnit('carrier', 0, at);
    for (let i = 0; i < 5; i++) g.spawnUnit('marauder', g.pirateId, at);
    for (let i = 0; i < 8; i++) g.spawnUnit('raider', g.pirateId, at);
    window.__app.renderer.cam.focus(star.x, star.y, 0.32);
    s.paused = false;
  });
  await wait(5000);
  await shot('14-battle');

  await page.evaluate(() => window.__app.renderer.cam.fitAll());
  await wait(900);
  await shot('15-sector');

  await page.evaluate(() => window.__app.hud.modals.open({ kind: 'status' }));
  await wait(400);
  await shot('16-status');
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const g = window.__app.session.game;
    g.prompts.push({ id: 9999, event: 'derelict', node: g.player.capital, unit: -1 });
    window.__app.hud.modals.open({ kind: 'event', promptId: 9999 });
  });
  await wait(400);
  await shot('17-event');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await wait(300);
  await shot('18-menu');
  await page.keyboard.press('Escape');

  await finish(errors.length ? 1 : 0);
} catch (e) {
  console.error('FAILED:', e);
  await shot('XX-failure').catch(() => {});
  await finish(1);
}
