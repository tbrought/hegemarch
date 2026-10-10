// The First Night, end to end and at its edges: the normal path, the closing card (MAIN MENU or
// KEEP PLAYING), tips that keep quiet for a while and can be read again, a lost seed ship, a raider
// nobody fights, a Scout that is gone, already out exploring, picked with E, or has nothing left to
// chart, the Destinies card going away, and runs saved before the Scout step existed.
//   node scripts/tutorial.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
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
  if (!r) throw new Error('no UI region ' + id);
  // Clicks are tested against the last finished frame: let a just-opened panel draw once more.
  await wait(120);
  const [x, y] = await toPage(r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(x, y);
};
/** Resolve decisions that were waiting behind the guide, and stop new ones from popping up. */
const settle = () =>
  ev(() => {
    const s = window.__app.session;
    const g = s.game;
    s.profile.settings.autoPause = false;
    for (const p of g.prompts) if (p.result === undefined) g.cmdResolvePrompt(p.id, 0);
    g.prompts.length = 0;
    if (s.modal?.kind === 'event') s.modal = null;
  });
const step = () => ev(() => window.__app.session.game.ui.tut ?? 0);
const fastForward = (secs) =>
  ev((s) => {
    const g = window.__app.session.game;
    for (let i = 0; i < s * 20 && !g.outcome; i++) g.step();
  }, secs);
/** Run the HUD logic (tutorial, tips) as if `secs` of real time had passed. */
const tick = (secs) => ev((s) => window.__app.hud.update(s), secs);

/** A fresh guided run from the title screen. */
async function freshGuidedRun() {
  await page.goto(url);
  await wait(1200);
  await ev(() => localStorage.clear());
  await page.reload();
  await wait(2000);
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="first-night"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(1000);
}

/** Steps 1-3 the quick way: kindle the tutorial world, queue a Striker, take the first Boon. */
async function throughStep3() {
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdKindle(g.playerId, g.ui.tutWorld);
  });
  await tick(0.1);
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdQueueShip(g.playerId, g.player.capital, 'striker');
  });
  await tick(0.1);
  await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    if (p.pendingDrafts <= 0) p.pendingDrafts = 1;
    g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
  });
  await tick(0.1);
}

try {
  // ---- The normal path ----
  await freshGuidedRun();
  check('a guided run starts at step 1', (await step()) === 1);
  await throughStep3();
  check('kindle, Striker and Boon reach step 4', (await step()) === 4);
  await fastForward(40);
  await tick(3);
  const raider = await ev(() => window.__app.session.game.ui.tutRaider ?? 0);
  check('the raider arrives at the new world', raider > 0);
  await ev((id) => {
    const g = window.__app.session.game;
    g.killUnit(g.units.get(id), 0);
  }, raider);
  await tick(0.1);
  check('beating the raider reaches step 5', (await step()) === 5);
  const banner = () => ev(() => window.__app.hud.tutorial.banner()?.text ?? '');
  check('step 5 asks you to send the Scout exploring', (await banner()).includes('Send your Scout'));
  const scouts = () =>
    ev(() => {
      const g = window.__app.session.game;
      return g.unitList.filter((u) => !u.dead && u.owner === g.playerId && u.type === 'scout').map((u) => ({ order: u.order, node: u.node, lane: !!u.lane }));
    });
  check('the Scout has waited at home for orders', (await scouts()).every((u) => u.order === 'idle' && !u.lane));
  // The badge in the banner shows the count on the map's badge, however the ships have been moved.
  const badgeMatches = () =>
    ev(() => {
      const app = window.__app;
      const g = app.session.game;
      const sc = g.unitList.find((u) => !u.dead && u.owner === g.playerId && u.type === 'scout');
      const b = app.hud.tutorial.banner()?.badge;
      return { ok: b === String(app.session.fleetAt(sc.node).length), b };
    });
  const before = await badgeMatches();
  check('the banner badge shows the real number of ships with the Scout', before.ok, `badge ${before.b}`);
  await ev(() => {
    const g = window.__app.session.game;
    const sc = g.unitList.find((u) => !u.dead && u.owner === g.playerId && u.type === 'scout');
    g.spawnUnit('striker', g.playerId, sc.node);
    g.spawnUnit('striker', g.playerId, sc.node);
  });
  const after = await badgeMatches();
  check('and keeps up when ships come and go', after.ok && after.b !== before.b, `${before.b} then ${after.b}`);
  await tick(0.1);
  // The camera glides to the Scout's fleet first: click once it has settled.
  await wait(1200);
  await clickUi('fleet-' + (await scouts())[0].node);
  await tick(0.1);
  check('with the fleet picked, the banner points to EXPLORE', (await banner()).includes('Press EXPLORE'));
  await wait(200);
  await page.screenshot({ path: '.shots/tutorial-explore.png' });
  await clickUi('explore');
  await tick(0.1);
  check('EXPLORE sends the Scout out and reaches step 6', (await step()) === 6 && (await scouts()).every((u) => u.order === 'explore'));
  check('the rest of the fleet stays put', await ev(() => {
    const g = window.__app.session.game;
    return g.unitList.filter((u) => !u.dead && u.owner === g.playerId && u.type !== 'scout').every((u) => u.order !== 'explore');
  }));
  check('the Scout leaves the selection, so a click on a world cannot call it back', await ev(() => window.__app.session.ownSelected().every((u) => u.type !== 'scout')));
  await tick(0.1);
  check('the Destinies wait a moment while the Scout sets out', await ev(() => window.__app.session.modal?.kind !== 'destinies'));
  await tick(3);
  check('step 6 shows the Destinies', await ev(() => window.__app.session.modal?.kind === 'destinies'));
  await clickUi('dest-begin');
  await wait(200);
  check('BEGIN finishes the First Night', (await step()) === 7 && (await ev(() => window.__app.session.profile.tutorialDone)));
  await tick(0.1);
  check('the end gets a card of its own, with MAIN MENU and KEEP PLAYING', await ev(() => window.__app.session.modal?.kind === 'nightDone') && !!(await uiRect('nd-menu')) && !!(await uiRect('nd-keep')));
  check('the game waits while it is open', await ev(() => window.__app.session.halted));
  check('decisions from the guide wait behind the ! button', await ev(() => {
    const app = window.__app;
    return app.session.game.prompts.filter((p) => p.result === undefined).every((p) => app.hud.snoozed.has(p.id));
  }));
  await wait(300);
  await page.screenshot({ path: '.shots/tutorial-complete.png' });
  await clickUi('nd-keep');
  await wait(200);
  check('KEEP PLAYING plays the run on', await ev(() => window.__app.session.modal === null && window.__app.screen === 'game'));
  await settle();
  await ev(() => window.__app.hud.tips.show('raid'));
  await tick(0.1);
  check('no tip pops up right after the guide', await ev(() => !window.__app.hud.tips.current));
  await fastForward(50);
  await settle();
  await tick(0.1);
  // (Tips held back during the guide, like the one about world roles, come first.)
  const tipId = await ev(() => window.__app.hud.tips.current?.id);
  check('tips come back a little later', !!tipId, String(tipId));

  // ---- Tips wait while they cannot be read, and can be read again ----
  await ev(() => (window.__app.session.modal = { kind: 'settings' }));
  await tick(60);
  check('a tip does not run out behind a dialog', await ev((id) => window.__app.hud.tips.current?.id === id, tipId));
  await ev(() => (window.__app.session.modal = null));
  await ev(() => (window.__app.session.paused = true));
  await tick(60);
  check('a tip does not run out while paused', await ev((id) => window.__app.hud.tips.current?.id === id, tipId));
  await ev(() => (window.__app.session.paused = false));
  await page.mouse.move(5, 400);
  await tick(30);
  await wait(200);
  check('an unread tip leaves a flashing TIP button behind', (await ev(() => window.__app.hud.tips.current?.id)) !== tipId && !!(await uiRect('tip-reopen')));
  await page.screenshot({ path: '.shots/tutorial-tip-button.png' });
  await clickUi('tip-reopen');
  await wait(200);
  check('the TIP button brings the card back', await ev((id) => window.__app.hud.tips.current?.id === id, tipId));
  await wait(200);
  await clickUi('tip-all');
  await wait(300);
  check('ALL TIPS opens How to Play on the TIPS tab', await ev(() => window.__app.session.modal?.kind === 'help' && window.__app.hud.modals.helpTab === 'tips'));
  await page.screenshot({ path: '.shots/tutorial-tips-tab.png' });
  await page.keyboard.press('Escape');
  await wait(200);
  await clickUi('tip-ok');
  await tick(0.1);
  check('OK moves on to the next tip', await ev((id) => window.__app.hud.tips.current?.id !== id, tipId));
  check('a tip read with OK leaves no TIP button', !(await uiRect('tip-reopen')));
  await ev(() => {
    const t = window.__app.hud.tips;
    if (!t.current) t.showFirst('hangar');
  });
  await tick(0.1);
  await wait(200);
  const later = await ev(() => window.__app.hud.tips.current?.id);
  await clickUi('tip-later');
  await wait(200);
  check('LATER puts a tip away behind the TIP button', (await ev(() => window.__app.hud.tips.current?.id)) !== later && !!(await uiRect('tip-reopen')));
  await clickUi('tip-reopen');
  await wait(100);
  check('and it comes back on click', (await ev(() => window.__app.hud.tips.current?.id)) === later);
  await page.keyboard.press('h');
  await wait(200);
  await clickUi('htab-tips');
  await wait(200);
  check('H, then TIPS, works any time', await ev(() => window.__app.session.modal?.kind === 'help' && window.__app.hud.modals.helpTab === 'tips'));
  await page.keyboard.press('Escape');

  // ---- The seed ship never arrives: the raid comes to the Hearth instead ----
  await freshGuidedRun();
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdKindle(g.playerId, g.ui.tutWorld);
  });
  await tick(0.1);
  await ev(() => {
    const g = window.__app.session.game;
    for (const u of g.unitList) if (!u.dead && u.owner === g.playerId && u.type === 'seed') g.killUnit(u, -1);
  });
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdQueueShip(g.playerId, g.player.capital, 'striker');
    const p = g.player;
    if (p.pendingDrafts <= 0) p.pendingDrafts = 1;
    g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
  });
  await tick(0.1);
  await tick(0.1);
  check('a lost seed ship does not stop the guide', (await step()) === 4);
  check('the banner does not promise a seed ship that is gone', !(await ev(() => window.__app.hud.tutorial.banner()?.text ?? '')).includes('seed ship is on its way'));
  await tick(7);
  await tick(0.1);
  const raidAt = await ev(() => {
    const g = window.__app.session.game;
    const r = g.units.get(g.ui.tutRaider ?? 0);
    return r ? r.dest : -1;
  });
  check('the raid comes to the Hearth instead', raidAt === (await ev(() => window.__app.session.game.player.capital)), `heading for ${raidAt}`);

  // ---- Nobody fights the raider: it leaves, and the guide says so ----
  await ev(() => (window.__app.session.game.ui.tutRaidAt = window.__app.session.game.time - 200));
  await tick(0.1);
  await tick(0.1);
  check('an ignored raider leaves after a while', (await step()) === 5);
  check('the message fits what happened', await ev(() => (window.__app.session.toast?.text ?? '').includes('slipped away')));

  // ---- No Scout left: step 5 has nothing to teach ----
  await ev(() => {
    const g = window.__app.session.game;
    for (const u of g.unitList) if (!u.dead && u.owner === g.playerId && u.type === 'scout') g.killUnit(u, -1);
  });
  await tick(0.1);
  check('with no Scout left, the guide moves on', (await step()) === 6);

  // ---- The Destinies card goes away some other way ----
  await tick(3);
  check('the Destinies card opens', await ev(() => window.__app.session.modal?.kind === 'destinies'));
  await ev(() => (window.__app.session.modal = { kind: 'help' }));
  await tick(0.1);
  check('the guide still finishes if the card is replaced', (await step()) === 7);
  await ev(() => (window.__app.session.modal = null));
  await tick(0.1);
  check('and its closing card waits until the other one is gone', await ev(() => window.__app.session.modal?.kind === 'nightDone'));
  await page.keyboard.press('Escape');
  await wait(150);
  check('Esc on the closing card keeps playing', await ev(() => window.__app.session.modal === null && window.__app.screen === 'game'));

  // ---- A Scout already out exploring: step 5 is skipped ----
  await freshGuidedRun();
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdExplore(g.playerId, g.unitList.filter((u) => u.owner === g.playerId && u.type === 'scout').map((u) => u.id));
    g.ui.tut = 5;
  });
  await tick(0.1);
  check('a Scout already exploring skips step 5', (await step()) === 6);

  // ---- The whole sector charted at step 5 (a decision can do that): nothing to teach ----
  await freshGuidedRun();
  await ev(() => {
    const g = window.__app.session.game;
    g.ui.tut = 5;
    g.exploreAll(g.player);
  });
  await tick(0.1);
  check('a charted sector skips step 5', (await step()) === 6);

  // ---- E at step 5 with nothing selected: it picks the Scout, and E again sends it ----
  await freshGuidedRun();
  await ev(() => {
    const s = window.__app.session;
    s.profile.settings.autoPause = false;
    s.game.ui.tut = 5;
    s.clearSelection();
  });
  await tick(0.1);
  await page.keyboard.press('e');
  await wait(150);
  check('E with nothing selected picks the Scout', await ev(() => window.__app.session.ownSelected().some((u) => u.type === 'scout')));
  check('and says to press it again', (await ev(() => window.__app.session.toast?.text ?? '')).includes('Press E again'));
  check('the banner follows: press EXPLORE', (await banner()).includes('Press EXPLORE'));
  await page.keyboard.press('e');
  await wait(150);
  await tick(0.1);
  check('E again sends it exploring, and the guide moves on', (await step()) === 6 && (await scouts()).every((u) => u.order === 'explore'));

  // ---- MAIN MENU on the closing card: back to the title, the run saved ----
  await tick(3);
  check('(the Destinies open)', await ev(() => window.__app.session.modal?.kind === 'destinies'));
  await clickUi('dest-begin');
  await tick(0.1);
  await clickUi('nd-menu');
  await page.waitForSelector('[data-sa="continue"]', { timeout: 10000 });
  check('MAIN MENU goes back to the title, with the run saved to CONTINUE', await ev(() => window.__app.screen === 'menu'));
  await page.click('[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(500);
  await tick(0.1);
  check('continuing it does not bring the closing card back', (await step()) === 7 && (await ev(() => window.__app.session.modal?.kind !== 'nightDone')));

  // ---- Save and continue in the middle of the guide ----
  await freshGuidedRun();
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdKindle(g.playerId, g.ui.tutWorld);
  });
  await tick(0.1);
  check('guide at step 2 before saving', (await step()) === 2, await ev(() => {
    const s = window.__app.session;
    const g = s.game;
    return `step ${g.ui.tut}, guided ${s.guided}, world ${g.ui.tutWorld}: ${g.checkKindle(g.playerId, g.ui.tutWorld ?? -1)}`;
  }));
  await ev(() => window.__app.hud.modals.open({ kind: 'menu' }));
  await wait(200);
  await clickUi('m-4');
  await page.waitForSelector('[data-sa="continue"]', { timeout: 10000 });
  await page.click('[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(500);
  check('continuing keeps the guide where it was', (await step()) === 2);
  check('and its banner', (await ev(() => window.__app.hud.tutorial.banner()?.text ?? '')).startsWith('STEP 2 OF 6'));

  // ---- A run saved before the Scout step: a finished guide stays finished ----
  await ev(() => {
    const g = window.__app.session.game;
    g.ui.tut = 6; // "done" in the five-step numbering
    delete g.ui.tutV;
  });
  await ev(() => window.__app.hud.modals.open({ kind: 'menu' }));
  await wait(200);
  await clickUi('m-4');
  await page.waitForSelector('[data-sa="continue"]', { timeout: 10000 });
  await page.click('[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(500);
  check('an older save keeps a finished guide finished', (await step()) === 7 && (await ev(() => window.__app.session.modal?.kind !== 'destinies' && !window.__app.hud.tutorial.busy())));
} catch (e) {
  console.error('FAILED:', e);
  failures++;
  await page.screenshot({ path: '.shots/tutorial-failure.png' }).catch(() => {});
}
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
