// Stages a mid-game state and screenshots every panel for a visual review (saved to .shots/gallery-*).
//   node scripts/gallery.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 810) } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/gallery-${name}.png` });
  console.log('saved', name);
};
/** Rest the pointer on a HUD region (by id), at a point inside it given as fractions. */
const hoverUi = async (id, fx = 0.5, fy = 0.5) => {
  const p = await ev(([rid, ax, ay]) => {
    const app = window.__app;
    const r = app.hud.ui.rectOf(rid);
    if (!r) return null;
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return { x: c.left + (r.x + r.w * ax) * k, y: c.top + (r.y + r.h * ay) * k };
  }, [id, fx, fy]);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await wait(700);
  return true;
};

try {
  await page.goto(url);
  await wait(1500);
  await ev(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 3, seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'dawn', 'boonReady'] })));
  await page.reload();
  await wait(2500);
  await page.click('[data-sa="setup"]');
  await page.hover('.heir .gl[data-gl="kindle"]');
  await wait(300);
  await shot('menu-tooltip');
  await page.mouse.move(5, 5);
  await page.click('[data-sa="size:medium"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(3000);
  await shot('omens');
  await page.evaluate(() => (window.__app.session.modal = null));
  await wait(500);
  // Hearth walls are still rising at the start of a run: ours, then a rival's.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    for (let t = 0; t < 90 * 20; t++) g.step();
    app.session.paused = true;
    app.session.selectNode(g.player.capital);
    app.session.focusNode(g.player.capital, 0.2);
  });
  await wait(700);
  await shot('hearth-walls');
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const r = g.factions.find((f) => f.kind === 'empire' && !f.isPlayer);
    g.player.explored[r.capital] = 1;
    app.session.view.reveal = true;
    app.session.selectNode(r.capital);
    app.session.focusNode(r.capital, 0.2);
  });
  await wait(700);
  await shot('rival-walls');
  await ev(() => {
    const app = window.__app;
    app.session.view.reveal = false;
    app.session.clearSelection();
  });
  // Play forward 14 minutes with a simple autopilot so the sector fills up.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    g.fxEnabled = false;
    const p = g.player;
    for (let t = 0; t < 14 * 60 * 20; t++) {
      g.step();
      if (t % 200 === 0) {
        while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
        for (const pr of g.prompts) if (pr.result === undefined) g.cmdResolvePrompt(pr.id, 0);
        g.prompts.length = 0;
        const dark = g.nodes
          .filter((n) => n.kind === 'planet' && n.owner === -1 && p.explored[n.id] && !g.hasHostiles(n.id, p.id))
          .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id));
        if (dark[0]) g.cmdKindle(p.id, dark[0].id);
        g.cmdQueueShip(p.id, p.capital, ['striker', 'guardian', 'breaker'][(t / 200) % 3 | 0]);
      }
    }
    g.fx.length = 0;
    g.fxEnabled = true;
    for (const n of g.worldsOf(p.id)) if (n.capitalOf < 0 && n.role === 'mine') {
      g.cmdSetRole(p.id, n.id, 'forge');
      break;
    }
    g.addCard(p, 'bpStarbase');
    g.addCard(p, 'bpLancer');
    p.embers = 2500;
    app.session.paused = true;
  });
  await wait(300);
  // Own forge world.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const w = g.worldsOf(g.playerId).find((n) => n.role === 'forge') ?? g.worldsOf(g.playerId)[1];
    g.cmdQueueShip(g.playerId, w.id, 'lancer');
    g.cmdQueueShip(g.playerId, w.id, 'guardian');
    app.session.selectNode(w.id);
    app.session.focusNode(w.id, 0.2);
  });
  await wait(900);
  await shot('forge-world');
  await hoverUi('role-observatory');
  await shot('hover-role');
  // Info lines on the card explain themselves too (they are tip-only areas, found by key).
  const hint = await ev(() => {
    const app = window.__app;
    const h = app.hud.ui.lastHints.find((x) => x.key.startsWith('card-line:') && /WORLD/.test(x.key));
    if (!h) return null;
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return { x: c.left + (h.x + 6) * k, y: c.top + (h.y + 3) * k };
  });
  if (hint) {
    await page.mouse.move(hint.x, hint.y);
    await wait(700);
    await shot('hover-world-line');
  }
  await page.mouse.move(5, 790);
  // The Hearth.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    app.session.selectNode(g.player.capital);
    app.session.focusNode(g.player.capital, 0.24);
  });
  await wait(900);
  await shot('hearth');
  // A rival world.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const r = g.nodes.find((n) => n.owner > 0 && n.owner < 4 && g.player.explored[n.id]) ?? g.nodes[g.factions[1].capital];
    g.player.explored[r.id] = 1;
    app.session.view.reveal = true;
    app.session.selectNode(r.id);
    app.session.focusNode(r.id, 0.2);
  });
  await wait(900);
  await shot('rival-world');
  // Whole sector, revealed.
  await ev(() => {
    const app = window.__app;
    app.session.clearSelection();
    app.renderer.cam.fitAll();
  });
  await wait(900);
  await shot('sector');
  await ev(() => (window.__app.session.view.reveal = false));
  // One of your worlds under attack off screen: an arrow at the edge points the way.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const cap = g.nodes[g.player.capital];
    cap.lastHit = 0;
    const far = g.nodes.reduce((b, n) => (Math.hypot(n.x - cap.x, n.y - cap.y) > Math.hypot(b.x - cap.x, b.y - cap.y) ? n : b), cap);
    app.renderer.cam.focus(far.x, far.y, 0.2);
    app.renderer.cam.update(10);
  });
  await wait(400);
  await shot('attack-arrow');
  // Ark ability choice.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const ark = g.units.get(g.player.ark);
    if (ark) {
      g.grantLevels(ark, 3 - ark.level);
      app.hud.modals.open({ kind: 'ability', unitId: ark.id });
    }
  });
  await wait(400);
  await shot('ability');
  await ev(() => (window.__app.session.modal = { kind: 'settings' }));
  await wait(300);
  await shot('settings');
  await ev(() => (window.__app.session.modal = { kind: 'help' }));
  await wait(300);
  await shot('help');
  await ev(() => (window.__app.session.modal = { kind: 'status' }));
  await wait(200);
  await ev(() => window.__app.hud.ui.rectOf('tab-rivals') && window.__app.hud.ui.rectOf('tab-rivals').onClick());
  await wait(300);
  await shot('status-rivals');
  await ev(() => window.__app.hud.ui.rectOf('tab-boons')?.onClick());
  await wait(300);
  await shot('status-boons');
  await ev(() => (window.__app.session.modal = { kind: 'log' }));
  await wait(300);
  await shot('log');
  await ev(() => (window.__app.session.modal = null));
  // A Boon draft with a Blueprint in it.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    p.pendingDrafts = 1;
    p.draftOffer = ['bpCarrier', 'hotBarrels', 'goldenAge', 'bloodPact'];
    app.hud.modals.open({ kind: 'draft' });
  });
  await wait(400);
  await shot('draft-blueprint');
  await ev(() => (window.__app.session.modal = null));
  // Hovering a Boon card explains its terms beside it.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    p.pendingDrafts = 1;
    p.draftOffer = ['kindlingRites', 'fighterBays', 'bpCarrier', 'gildedCage'];
    app.hud.modals.open({ kind: 'draft' });
  });
  await wait(400);
  await hoverUi('card-0', 0.5, 0.3);
  await shot('hover-card-first');
  await hoverUi('card-3', 0.5, 0.3);
  await shot('hover-card-last');
  await hoverUi('card-2', 0.5, 0.97);
  await page.mouse.move(5, 790);
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.game.player.pendingDrafts = 0;
    app.session.game.player.draftOffer = null;
  });
  // A draft with stacks and before/after lines.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    for (const id of ['strikerWings', 'emberTithe', 'emberTithe']) g.addCard(p, id);
    p.pendingDrafts = 1;
    p.draftOffer = ['strikerWings', 'emberTithe', 'singularity', 'gildedCage'];
    app.hud.modals.open({ kind: 'draft' });
  });
  await wait(400);
  await shot('draft-stacks');
  // Pick one with a click and catch it in flight to the tray.
  const card = await ev(() => {
    const app = window.__app;
    const r = app.hud.ui.rectOf('card-2');
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + 30) * k };
  });
  await page.mouse.click(card.x, card.y);
  await wait(260);
  await shot('boon-flight');
  await wait(900);
  // Hover a tile in the Boon tray.
  const tile = await ev(() => {
    const app = window.__app;
    const r = app.hud.ui.rectOf('tray-emberTithe');
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return r ? { x: c.left + (r.x + 5) * k, y: c.top + (r.y + 5) * k } : null;
  });
  if (tile) {
    await page.mouse.move(tile.x, tile.y);
    await wait(700);
    await shot('boon-tray');
    await page.mouse.move(5, 400);
  }
  // The Boons screen (B).
  await ev(() => window.__app.hud.modals.open({ kind: 'status', tab: 'boons' }));
  await wait(400);
  await shot('boons-screen');
  const totals = await ev(() => {
    const app = window.__app;
    const k = Object.keys(app.hud.ui).length ? null : null;
    void k;
    return app.hud.ui.lastHints?.find((h) => h.key === 'bt-embers') ?? null;
  });
  if (totals) {
    const c = await ev(() => {
      const app = window.__app;
      const r = app.canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, k: r.width / app.session.screen.W };
    });
    await page.mouse.move(c.left + (totals.x + totals.w / 2) * c.k, c.top + (totals.y + 3) * c.k);
    await wait(700);
    await shot('hover-totals');
  }
  await page.mouse.move(5, 790);
  await ev(() => window.__app.hud.modals.wheel(400));
  await wait(200);
  await shot('boons-screen-scrolled');
  await ev(() => (window.__app.session.modal = null));
  // An anomaly with colored choices.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const id = 900001;
    g.prompts.push({ id, event: 'derelict', node: g.worldsOf(g.playerId)[0].id, unit: -1 });
    app.hud.modals.open({ kind: 'event', promptId: id });
  });
  await wait(400);
  await shot('event');
  await hoverUi('choice-0', 0.3, 0.5);
  await shot('hover-event-choice');
  await page.mouse.move(5, 790);
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.game.prompts.length = 0;
  });
  // Victory.
  await ev(() => {
    const g = window.__app.session.game;
    g.declareWinner(0, 'domination', 'Solar Concord rules the sector.');
    window.__app.session.paused = false;
  });
  await page.waitForSelector('.results', { timeout: 10000 });
  await wait(300);
  await shot('victory');
} catch (e) {
  console.error('FAILED:', e);
  await shot('failure').catch(() => {});
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
