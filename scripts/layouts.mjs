// Every dialog at the extremes: the smallest screen (large pixels), the default, and the biggest
// offers and longest texts the game can produce. Screenshots go to .shots/layout-*.
//   node scripts/layouts.mjs     (needs a dev server on port 5173)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const problems = [];

for (const [label, vw, vh, pixels] of [
  ['small', 1200, 675, 'large'],
  ['default', 1440, 810, 'auto'],
  ['narrow', 1000, 760, 'auto'],
]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(`[${label}] ${m.text()}`));
  const wait = (ms) => page.waitForTimeout(ms);
  /** A Boon draft's cards take a moment to come in: wait until all are there (and a frame more). */
  const dealt = async () => {
    await wait(100);
    for (let i = 0; i < 50 && (await page.evaluate(() => window.__app.hud?.modals.revealing())); i++) await wait(100);
    await wait(150);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name) => page.screenshot({ path: `.shots/layout-${label}-${name}.png` });
  /** Every UI region must lie on screen. */
  const onScreen = async (what) => {
    const bad = await ev(() => {
      const ui = window.__app.hud.ui;
      const W = window.__app.session.screen.W;
      const H = window.__app.session.screen.H;
      return ui.regions.filter((r) => r.id !== 'modal-back' && (r.x < 0 || r.y < 0 || r.x + r.w > W + 1 || r.y + r.h > H + 1)).map((r) => `${r.id} ${r.x},${r.y} ${r.w}x${r.h}`);
    });
    if (bad.length) problems.push(`[${label}] ${what}: off screen: ${bad.slice(0, 6).join(' | ')}`);
  };
  await page.goto('http://localhost:5173/');
  await wait(1200);
  await ev((px) => {
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 5, seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady'], heirs: ['concord', 'vael', 'wayfarer', 'nyx', 'ironclad', 'ashen'], settings: { pixelSize: px } }));
  }, pixels);
  await page.reload();
  await wait(2000);
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="heir:ashen"]');
  await page.click('[data-sa="size:large"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  const dims = await ev(() => [window.__app.session.screen.W, window.__app.session.screen.H]);
  console.log(label, 'game pixels', dims.join('x'));
  await shot('omens');
  await onScreen('omens');
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.profile.settings.autoPause = false;
    const g = app.session.game;
    const p = g.player;
    // The biggest draft there is: Ashen Remnant (+1), Quantum Archives (+1), Codex Infinitum (+1).
    g.addCard(p, 'quantum');
    p.relics.push('codex');
    g.recomputeMods(p);
    p.pendingDrafts = 2;
    p.draftOffer = null;
    g.ensureOffer(p);
    app.hud.modals.open({ kind: 'draft' });
  });
  await dealt();
  console.log(label, 'offer size', await ev(() => window.__app.session.game.player.draftOffer.length));
  await shot('draft-6');
  await onScreen('draft with 6 choices');
  await ev(() => {
    const app = window.__app;
    const p = app.session.game.player;
    p.draftOffer = ['bpDread', 'scorchedEarth', 'stormcaller', 'bpStarfall', 'dreadDoctrine'];
  });
  await wait(100);
  await dealt();
  await shot('draft-long');
  await onScreen('draft with long cards');
  // The longest event.
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    const g = app.session.game;
    g.prompts.push({ id: 777, event: 'derelict', node: g.player.capital, unit: -1 });
    app.hud.modals.open({ kind: 'event', promptId: 777 });
  });
  await wait(300);
  await shot('event');
  await onScreen('event');
  // Lots of Boons on the Boons screen and in the tray.
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.game.prompts.length = 0;
    const g = app.session.game;
    const p = g.player;
    for (const id of ['hotBarrels', 'hardHulls', 'deflectors', 'afterburners', 'strikerWings', 'guardianDoctrine', 'heavyPayloads', 'emberTithe', 'deepShafts', 'thriftyYards', 'salvage', 'kindlingRites', 'brightGlow', 'wideHangars', 'masons', 'shipwrights', 'stargazers', 'bulwark', 'batteries', 'longSights', 'ablative', 'bloodPact', 'glassCannon', 'goldenAge']) g.addCard(p, id);
    p.relics.push('emberCrown', 'lantern', 'tides');
    g.recomputeMods(p);
    p.pendingDrafts = 0;
    app.hud.modals.open({ kind: 'status', tab: 'boons' });
  });
  await wait(400);
  await shot('boons-full');
  await onScreen('boons screen, full');
  await ev(() => (window.__app.session.modal = null));
  await wait(300);
  await shot('tray-full');
  await onScreen('tray, full');
  for (const tab of ['destinies', 'rivals', 'run']) {
    await ev((t) => window.__app.hud.modals.open({ kind: 'status', tab: t }), tab);
    await wait(250);
    await shot('status-' + tab);
    await onScreen('status ' + tab);
  }
  for (const kind of ['help', 'settings', 'menu', 'log', 'nightDone', 'destinies', 'omens']) {
    await ev((k) => (window.__app.session.modal = { kind: k }), kind);
    await wait(250);
    await shot(kind);
    await onScreen(kind);
  }
  await ev(() => (window.__app.session.modal = { kind: 'help', tab: 'tips' }));
  await wait(250);
  await shot('help-tips');
  // The Hearth card with every extra button.
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    const g = app.session.game;
    const p = g.player;
    for (const id of ['bpStarbase', 'bpCarrier', 'bpLancer', 'bpDread', 'bpStarfall']) g.addCard(p, id);
    p.embers = 9999;
    p.boons = 15;
    app.session.selectNode(p.capital);
    app.session.focusNode(p.capital, 0.2);
  });
  await wait(600);
  await shot('hearth-card');
  await onScreen('hearth card');
  // A Starfall's card with every order a fleet can have beside ARM (a Scout with it, an Ark with an ability to learn),
  // armed in a system that another Starfall is about to take: every line it can show.
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    const star = g.starOf(g.nodes[p.capital]);
    const d = g.spawnUnit('starfall', p.id, star.id);
    const scout = g.spawnUnit('scout', p.id, star.id);
    const ark = g.units.get(p.ark);
    if (ark) ark.pendingAbil.push(['aegis', 'barrage', 'nanite']);
    const rival = g.empires().find((f) => f.id !== p.id);
    g.cmdArm(rival.id, g.spawnUnit('starfall', rival.id, star.id).id);
    g.cmdArm(p.id, d.id);
    app.session.selectUnits([d.id, scout.id, ...(ark ? [ark.id] : [])], false, false);
    // (From far enough out that the star and the Hearth are both in view: a fleet badge off the screen would be counted as a fault.)
    app.session.focusNode(star.id, 0.05);
  });
  await wait(600);
  await shot('starfall-card');
  await onScreen('starfall card');

  // ---- An Ages run: the cradle's cards and bars at their fullest (six houses, the longest labels) ----
  await ev(() => window.__app.session.hooks.quit(false));
  await wait(500);
  await page.click('[data-sa="ages"]');
  await page.click('[data-sa="heir:ashen"]');
  await page.click('[data-sa="size:large"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game' && window.__app.session?.game.cradle, null, { timeout: 60000 });
  await wait(800);
  await shot('ages-cradle-card');
  await onScreen('ages: the cradle card');
  await ev(() => {
    const s = window.__app.session;
    s.profile.settings.autoPause = false;
    s.modal = null;
    window.__app.hud.modals.open({ kind: 'draft' });
  });
  await dealt();
  await shot('ages-draft');
  await onScreen('ages: draft');
  for (const kind of ['status', 'help', 'ascend']) {
    await ev((k) => (window.__app.session.modal = k === 'status' ? { kind: k, tab: 'destinies' } : { kind: k }), kind);
    await wait(300);
    await shot('ages-' + kind);
    await onScreen('ages: ' + kind);
  }
  // The top bar and the Hearth's card with everything on them: a Boon waiting, the order to advance, supply full.
  for (const era of [0, 3, 4]) {
    await ev((e) => {
      const s = window.__app.session;
      const g = s.game;
      const p = g.player;
      s.modal = null;
      p.era = e;
      g.recomputeMods(p);
      p.lore = 5000;
      p.embers = 99999;
      p.pendingDrafts = 2;
      p.hangarUsed = p.hangarCap;
      s.selectNode(p.capital);
      s.focusNode(p.capital, 0.2);
    }, era);
    await wait(500);
    await shot('ages-bar-' + era);
    await onScreen('ages: top bar and Hearth card, age ' + era);
    const overlap = await ev(() => {
      const ui = window.__app.hud.ui;
      const a = ui.rectOf('advance');
      const c = ui.rectOf('clock');
      const h = ui.rectOf('hangar');
      return { advance: a ? a.x + a.w : 0, hangar: h ? h.x + h.w : 0, clock: c ? c.x : 9999 };
    });
    if (Math.max(overlap.advance, overlap.hangar) > overlap.clock) problems.push(`[${label}] ages top bar, age ${era}: runs into the clock (${JSON.stringify(overlap)})`);
  }
  await ev(() => {
    const s = window.__app.session;
    s.game.player.advance = { t: 12, total: 40, lore: 0, cost: 0 };
  });
  await wait(300);
  await shot('ages-advancing');
  await onScreen('ages: advancing');
  await page.close();
}
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'all regions on screen');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
