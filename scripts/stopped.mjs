// A pause is a pause to think: while the game stands still (paused, or held by a tip card) the player
// looks around and gives orders, by mouse and by key, and the game does not move. Once the run is over
// nothing acts any more.
//   node scripts/stopped.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? '  (' + detail + ')' : ''}`);
};
const toPage = (ix, iy) =>
  ev(([x, y]) => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return [r.left + ((x + 0.5) * r.width) / c.width, r.top + ((y + 0.5) * r.height) / c.height];
  }, [ix, iy]);
const uiRect = (id) => ev((rid) => window.__app.hud.ui.rectOf(rid), id);
const clickUi = async (id) => {
  let r = await uiRect(id);
  for (let i = 0; i < 10 && !r; i++) {
    await wait(100);
    r = await uiRect(id);
  }
  if (!r) return false;
  await wait(120);
  await page.mouse.click(...(await toPage(r.x + r.w / 2, r.y + r.h / 2)));
  await wait(140);
  return true;
};
/** Everything an order could change: Embers, seed ships, queues, roles, levels, rally points, and what every ship is doing. */
const snap = () =>
  ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    return JSON.stringify({
      embers: Math.round(p.embers),
      bays: p.bays ?? 0,
      worlds: g.nodes.filter((n) => n.owner === p.id).map((n) => [n.id, n.role, n.level, n.rally, n.shipQ.length, n.buildQ.length, n.retool > 0]),
      ships: g.unitList.filter((u) => !u.dead && u.owner === p.id).map((u) => [u.id, u.type, u.order, u.dest, u.path.length, u.orderTarget]),
    });
  });
const state = () =>
  ev(() => {
    const s = window.__app.session;
    return { mode: s.mode, halted: s.halted, paused: s.paused, tipHold: s.tipHold, tip: window.__app.hud.tips.current?.id ?? null, modal: s.modal?.kind ?? null, toast: s.toast?.text ?? '', orderMode: s.view.orderMode, selected: s.ownSelected().length, node: s.view.selectedNode, time: s.game.time };
  });
const selectWorld = (id) => ev((n) => window.__app.session.selectNode(n), id);
const screenOf = (id) =>
  ev((nid) => {
    const a = window.__app;
    const n = a.session.game.nodes[nid];
    a.renderer.cam.focus(n.x, n.y, 0.16);
    a.renderer.cam.update(10);
    return [a.renderer.sx(n.x), a.renderer.sy(n.y)];
  }, id);

try {
  await page.goto(url);
  await wait(1200);
  await ev(() =>
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
      tutorialDone: true, runs: 3, wins: 1, agesSeen: true, goalsDone: ['role', 'worlds', 'level', 'fleet', 'boons', 'fight', 'capture'],
      seenTips: ['role', 'anomaly', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'hangar', 'boonReady', 'fleet', 'lostWorld'],
      settings: { master: 0, sfx: 0, music: 0, edgePan: false, tips: true, autoPause: true, crt: false, pixelSize: 'auto', explainTerms: true },
    })));
  await page.reload();
  await wait(1500);
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="size:small"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  // A Hearth, a second world of ours, a dark world in sight, Embers to spend, and no dialog in the way.
  const w = await ev(() => {
    const a = window.__app;
    const s = a.session;
    const g = s.game;
    const p = g.player;
    s.modal = null;
    p.pendingDrafts = 0;
    p.embers = 3000;
    const home = g.nodes[p.capital];
    const near = g.nodes.filter((n) => n.kind === 'planet' && n.owner === -1 && n.system === home.system);
    for (const n of near) {
      for (const u of [...g.buckets[n.id]]) if (u.owner !== p.id) g.killUnit(u, -1);
      p.explored[n.id] = 1;
    }
    g.kindleWorld(near[0], p.id);
    near[0].glow = 1;
    return { cap: p.capital, mine: near[0].id, dark: near[1].id, dark2: near[2]?.id ?? near[1].id };
  });
  await wait(300);

  // ---- Playing: orders go through (the control) ----
  check('while playing, the player may do everything', (await state()).mode === 'play');
  let before = await snap();
  await selectWorld(w.dark2);
  await page.keyboard.press('k');
  await wait(200);
  check('K kindles while the game runs', (await snap()) !== before);

  // ---- Paused: a pause to think. Orders go through; the game does not move. ----
  await page.keyboard.press('Space');
  await wait(200);
  let st = await state();
  check('Space pauses: the game stands still, and the player may still give orders', st.paused && st.halted && st.mode === 'play');
  before = await snap();
  await selectWorld(w.dark);
  await wait(150);
  await page.keyboard.press('k');
  await wait(200);
  check('K kindles while paused', (await snap()) !== before);
  before = await snap();
  await selectWorld(w.cap);
  await wait(150);
  check('a build button at the Hearth queues a ship', (await clickUi('build-striker')) && (await snap()) !== before);
  before = await snap();
  await page.keyboard.press('q');
  await wait(150);
  check('and so does its key', (await snap()) !== before);
  before = await snap();
  await selectWorld(w.mine);
  await wait(150);
  check('a role button changes the role', (await clickUi('role-forge')) && (await snap()) !== before);
  // Ships picked while paused wait for their destination, and a right-click sends them.
  await ev((c) => {
    const a = window.__app;
    const n = a.session.game.nodes[c];
    a.renderer.cam.focus(n.x, n.y, 0.16);
    a.renderer.cam.update(10);
  }, w.cap);
  await wait(200);
  await clickUi('fleet-' + w.cap);
  st = await state();
  check('a fleet picked while paused waits for its destination', st.selected >= 3 && st.orderMode);
  before = await snap();
  const [dx, dy] = await screenOf(w.dark);
  await wait(150);
  await page.mouse.click(...(await toPage(dx, dy)), { button: 'right' });
  await wait(200);
  check('and a right-click sends it', (await snap()) !== before);
  // Looking and reading work as ever.
  const zoom0 = await ev(() => window.__app.renderer.cam.tzoom);
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, -300);
  await wait(200);
  check('the camera zooms', (await ev(() => window.__app.renderer.cam.tzoom)) !== zoom0);
  await page.keyboard.press('u');
  await wait(200);
  check('the status screen opens', (await state()).modal === 'status');
  await page.keyboard.press('Escape');
  await wait(150);
  check('all through the pause, the game has not moved', (await state()).time === st.time);
  check('and nothing said an order was refused', !/paused: press Space/i.test((await state()).toast));
  await page.screenshot({ path: '.shots/stopped-paused.png' });
  await page.keyboard.press('Space');
  await wait(300);
  st = await state();
  check('Space goes on', !st.paused && st.mode === 'play');

  // ---- A tip card holds the game: the same ----
  await ev(() => {
    const a = window.__app;
    a.session.clearSelection();
    a.hud.tips.showFirst('raid');
  });
  await wait(900);
  st = await state();
  check('a tip card holds the game', st.tip === 'raid' && st.tipHold && st.halted, JSON.stringify(st));
  before = await snap();
  await selectWorld(w.cap);
  await wait(150);
  await page.keyboard.press('w');
  await wait(200);
  check('and a ship can be queued behind it all the same', (await snap()) !== before);
  await page.screenshot({ path: '.shots/stopped-tip.png' });
  await page.keyboard.press('Space');
  await wait(300);
  st = await state();
  check('Space answers the card and the game goes on', st.tip === null && !st.halted);

  // ---- A tip waits until the player's hands are free ----
  await ev((c) => {
    const a = window.__app;
    const n = a.session.game.nodes[c];
    a.renderer.cam.focus(n.x, n.y, 0.16);
    a.renderer.cam.update(10);
    a.session.profile.seenTips = a.session.profile.seenTips.filter((id) => id !== 'blueprint');
  }, w.cap);
  await wait(200);
  await clickUi('fleet-' + w.cap);
  check('(a fleet is picked and waits for its destination)', (await state()).orderMode);
  await ev(() => window.__app.hud.tips.showFirst('blueprint'));
  await wait(1500);
  check('a tip does not come up in the middle of an order', (await state()).tip === null);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await wait(900);
  check('it comes up once the hands are free', (await state()).tip === 'blueprint');
  await ev(() => {
    while (window.__app.hud.tips.current) window.__app.hud.tips.dismiss();
  });

  // ---- The run is over: nothing acts ----
  await ev(([d]) => {
    const s = window.__app.session;
    const g = s.game;
    s.clearSelection();
    s.selectNode(d);
    g.player.pendingDrafts = 1;
    g.declareWinner(1, 'conquest', 'test');
  }, [w.dark]);
  await wait(1500);
  before = await snap();
  for (const key of ['k', 'b', 'u', 'e', 'h']) {
    await page.keyboard.press(key);
    await wait(120);
  }
  st = await state();
  check('after the run has ended no key orders anything or opens anything', (await snap()) === before && st.modal === null && st.mode === 'none', JSON.stringify(st));
  // The ending is skipped with one press (to its tally), and left with the next.
  await page.keyboard.press('Enter');
  await wait(300);
  check('Enter skips the ending to its tally, and the run is still on the screen', (await page.$('.results')) === null && (await page.evaluate(() => window.__app.hud.ending.done)));
  await page.keyboard.press('Enter');
  await page.waitForSelector('.results', { timeout: 10000 }).catch(() => {});
  check('Enter again shows the results', (await page.$('.results')) !== null);
} catch (e) {
  failures++;
  console.error('FAILED:', e);
  await page.screenshot({ path: '.shots/stopped-failure.png' }).catch(() => {});
}
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
