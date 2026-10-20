// The First Night, end to end and at its edges: the normal path (a rally point set and cleared with the
// mouse, a Breaker, a guarded world, the Hearth raided), the closing card (MAIN MENU or KEEP PLAYING),
// tips that keep quiet for a while and can be read again, a lost seed ship, a raider nobody fights, a
// Scout that is gone, already out exploring, picked with E, or has nothing left to chart, no guarded
// world near, the Destinies card going away, and runs saved before the Scout step and before the
// rally, Breaker and Hearth steps existed.
//   node scripts/tutorial.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
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
// A dialog that has just opened by itself takes no click and no key for a moment (Modals.guarded): wait
// it out, as a player would.
// (The dialog is asked, not only the last frame: one that has opened and is not drawn yet is guarded already, and a key
// pressed then is ignored, as it should be. Asking the frame alone, this suite pressed Esc into the guard now and then.)
const unheld = async () => {
  for (let i = 0; i < 60 && (await ev(() => window.__app.hud?.modals.guarded() || window.__app.hud?.ui.holding() || window.__app.hud?.modals.revealing())); i++) await wait(100);
};
const clickUi = async (id) => {
  let r = await uiRect(id);
  for (let i = 0; i < 10 && !r; i++) {
    await wait(100);
    r = await uiRect(id);
  }
  if (!r) throw new Error('no UI region ' + id);
  // Clicks are tested against the last finished frame: let a just-opened panel draw once more.
  await wait(120);
  await unheld();
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
/** Click (or right-click) a world on the map, where it is drawn. */
const clickWorld = async (id, button = 'left') => {
  const [ix, iy] = await ev((n) => {
    const app = window.__app;
    const w = app.session.game.nodes[n];
    return [app.renderer.sx(w.x), app.renderer.sy(w.y)];
  }, id);
  const [x, y] = await toPage(ix, iy);
  await page.mouse.click(x, y, { button });
};
/** Straight on to the Destinies (step 9), past the rally, Breaker and Hearth steps. */
const toDestinies = () => ev(() => (window.__app.session.game.ui.tut = 9));

/** A fresh guided run from the title screen. */
async function freshGuidedRun() {
  await page.goto(url);
  await wait(1200);
  await ev(() => localStorage.clear());
  await page.reload();
  await wait(2000);
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
  const sub = () => ev(() => window.__app.hud.tutorial.banner()?.sub ?? '');
  check('the step says what its words mean and why it matters', /Embers, your only currency/.test(await sub()), await sub());
  check('the First Night has the three Destinies that need the least explaining (no Maw)', (await ev(() => window.__app.session.game.victories.join(','))) === 'conquest,domination,ascension');
  check('its first Boons are dealt by hand: Embers, Strikers, kindling', await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    const had = p.pendingDrafts;
    p.pendingDrafts = Math.max(1, had);
    const offer = g.ensureOffer(p).join(',');
    p.pendingDrafts = had;
    return offer === 'emberTithe,strikerWings,kindlingRites';
  }));
  await ev(() => {
    const g = window.__app.session.game;
    g.cmdKindle(g.playerId, g.ui.tutWorld);
  });
  await tick(0.1);
  check('step 2 says what a Hearth and a Striker are', /Hearth is your home world.*Striker is a fast, cheap gunship/.test(await sub()), await sub());
  await throughStep3();
  check('kindle, Striker and Boon reach step 4', (await step()) === 4);
  await fastForward(40);
  // (The First Night's sector is another one every time, and in one in a few dozen the seed ship's way
  // is longer than forty seconds: wait for the world to be lit, as the raider does.)
  for (let i = 0; i < 8 && !(await ev(() => window.__app.session.game.worldsOf(window.__app.session.game.playerId).length > 1)); i++) await fastForward(10);
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

  // Step 6: a rally point, set from the Hearth with a right-click and cleared again.
  await tick(0.1);
  const home = await ev(() => window.__app.session.game.player.capital);
  const rallyTo = await ev(() => window.__app.hud.tutorial.rallyTarget());
  check('step 6 asks for a rally point: the Hearth, then a right-click on the new world', /Set a rally point: click your Hearth, then right-click/.test(await banner()) && rallyTo >= 0, await banner());
  check('and says what it does', /fly there by themselves, one by one/.test(await sub()), await sub());
  await wait(1200);
  await clickWorld(home);
  await wait(200);
  await tick(0.1);
  check('the Hearth picked, the banner names the world to right-click', (await ev(() => window.__app.session.view.selectedNode)) === home && /Now right-click/.test(await banner()), await banner());
  // (The camera brings that world on screen if it is not: let it settle.)
  await wait(1200);
  await clickWorld(rallyTo, 'right');
  await wait(200);
  check('the right-click sets the rally point', (await ev((h) => window.__app.session.game.nodes[h].rally, home)) === rallyTo);
  await tick(0.1);
  check('the banner shows the flag, and how to clear it', /See the flag at .*Now clear it: right-click your Hearth itself/.test(await banner()), await banner());
  check('no tip about it while the guide teaches it', await ev(() => !window.__app.hud.tips.queue.includes('rally') && window.__app.hud.tips.current?.id !== 'rally'));
  await wait(300);
  await page.screenshot({ path: '.shots/tutorial-rally.png' });
  check('the way to it and its flag are drawn on the map', await ev((t) => {
    // (The flag's pennant: sky pixels just left of the world, where nothing else is sky.)
    const app = window.__app;
    const n = app.session.game.nodes[t];
    const x = Math.round(app.renderer.sx(n.x) - app.renderer.nodeR(n) - 3);
    const y = Math.round(app.renderer.sy(n.y) - 8);
    const d = app.screenObj.g.getImageData(x - 5, y + 1, 5, 1).data;
    let sky = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0x3f && d[i + 1] === 0xa7 && d[i + 2] === 0xff) sky++;
    return sky >= 4;
  }, rallyTo));
  // (A moment on the flag, and the camera comes back to the Hearth if it had gone.)
  await wait(2500);
  await clickWorld(home, 'right');
  await wait(200);
  check('a right-click on the Hearth itself clears it', (await ev((h) => window.__app.session.game.nodes[h].rally, home)) === -1);
  await tick(0.1);
  check('which reaches step 7, the rally tip counted as read', (await step()) === 7 && (await ev(() => window.__app.session.profile.seenTips.includes('rally'))));

  // Step 7: a Breaker (the ring of ships, while it is built), then a guarded world.
  check('step 7 asks for a Breaker, and tells the ring of ships', /Build a Breaker/.test(await banner()) && /Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers/.test(await sub()), await sub());
  await ev(() => (window.__app.session.game.player.embers += 400));
  await clickWorld(home);
  await wait(300);
  await clickUi('build-breaker');
  await tick(0.1);
  check('queued, the banner waits for it to be built', /Breaker is being built/.test(await banner()), await banner());
  await fastForward(40);
  await tick(0.1);
  const guarded = await ev(() => (window.__app.session.game.ui.tutGuarded ?? 0) - 1);
  if (guarded >= 0) {
    check('built, it names a guarded world near home to take', /Take a guarded world: click your Breaker's fleet badge .*, then/.test(await banner()) && (await ev((w) => window.__app.session.game.buckets[w].some((u) => !u.dead && u.owner === window.__app.session.game.guardianId), guarded)), await banner());
    await ev((w) => {
      // (The guards fall: the fight itself is the game's, tested elsewhere.)
      const g = window.__app.session.game;
      for (const u of [...g.buckets[w]]) if (!u.dead && u.owner === g.guardianId) g.killUnit(u, g.playerId);
    }, guarded);
    await tick(0.1);
    check('its guards gone, the guide moves on to step 8', (await step()) === 8);
  } else {
    check('with no guarded world near, the guide moves on to step 8', (await step()) === 8);
  }

  // Step 8: a raider comes for the Hearth.
  await tick(3);
  const hearthRaid = await ev(() => {
    const g = window.__app.session.game;
    const r = g.units.get(g.ui.tutRaider ?? 0);
    return r ? r.dest : -1;
  });
  check('step 8 sends a raider for the Hearth', hearthRaid === home, `heading for ${hearthRaid}`);
  check('and says that if the Hearth falls the run is over', /A raider comes for your Hearth/.test(await banner()) && /If it falls, the run is over/.test(await sub()), await banner());
  await ev(() => {
    const g = window.__app.session.game;
    g.killUnit(g.units.get(g.ui.tutRaider), 0);
  });
  await tick(0.1);
  check('the raider gone, step 9: the Destinies', (await step()) === 9);
  await tick(0.1);
  check('the Destinies wait a moment', await ev(() => window.__app.session.modal?.kind !== 'destinies'));
  await tick(3);
  check('step 9 shows the Destinies', await ev(() => window.__app.session.modal?.kind === 'destinies'));
  await wait(200);
  check('as a list down the card, one under the other (three side by side read as a choice of one)', await ev(() => {
    const u = window.__app.hud.ui;
    const r = [0, 1, 2].map((i) => u.rectOf('dest-card-' + i));
    return r.every(Boolean) && r[0].x === r[1].x && r[1].x === r[2].x && r[1].y >= r[0].y + r[0].h && r[2].y >= r[1].y + r[1].h;
  }));
  await clickUi('dest-begin');
  await wait(200);
  check('BEGIN finishes the First Night', (await step()) === 10 && (await ev(() => window.__app.session.profile.tutorialDone)));
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
    // (A tip waits for free hands: nothing picked, no order pending.)
    window.__app.session.clearSelection();
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

  // ---- With auto-pause on (as it is for a new player), a tip card holds the game until it is answered ----
  await ev(() => {
    const a = window.__app;
    const s = a.session;
    s.profile.settings.autoPause = true;
    s.modal = null;
    s.paused = false;
    while (a.hud.tips.current) a.hud.tips.dismiss();
    // (Every other tip counts as read, so that none comes up behind this one and holds the game again.)
    s.profile.seenTips = ['role', 'raid', 'anomaly', 'anomalySeen', 'crisis', 'arkLevel', 'hangar', 'boonReady', 'fleet', 'lostWorld', 'power'];
    a.hud.tips.queue.length = 0;
    a.hud.tips.showFirst('blueprint');
  });
  await tick(0.2);
  await wait(400);
  const held = await ev(() => ({ id: window.__app.hud.tips.current?.id, hold: window.__app.session.tipHold, halted: window.__app.session.halted, t: window.__app.session.game.time }));
  await wait(800);
  check('a tip card holds the game while it is read', held.id === 'blueprint' && held.hold && held.halted && (await ev(() => window.__app.session.game.time)) === held.t, JSON.stringify(held));
  await tick(120);
  check('and waits for an answer, however long that takes', await ev(() => window.__app.hud.tips.current?.id === 'blueprint'));
  await page.keyboard.press('Space');
  await wait(200);
  check('Space answers it (it does not pause on top of the hold)', await ev(() => window.__app.hud.tips.current?.id !== 'blueprint' && !window.__app.session.paused));
  // (Other tips may have been waiting behind it: put those away too, or the next one holds the game again.)
  await ev(() => {
    const t = window.__app.hud.tips;
    t.queue.length = 0;
    while (t.current) t.dismiss();
  });
  await wait(600);
  check('and the game goes on', await ev((t) => !window.__app.session.tipHold && window.__app.session.game.time > t, held.t), await ev(() => JSON.stringify({ hold: window.__app.session.tipHold, paused: window.__app.session.paused, modal: window.__app.session.modal?.kind, tip: window.__app.hud.tips.current?.id, out: !!window.__app.session.game.outcome, t: window.__app.session.game.time })));
  await ev(() => (window.__app.session.profile.settings.autoPause = false));

  // ---- After the guide, a small box names a first goal; reaching it pays, and the box moves on ----
  const goal = () => ev(() => {
    const a = window.__app;
    return { shown: a.hud.goals.shown(), first: a.hud.goals.left()[0]?.id, hint: a.hud.ui.lastHints.some((h) => h.key === 'goal'), embers: a.session.game.player.embers, done: [...a.session.profile.goalsDone] };
  });
  await ev(() => {
    window.__app.session.modal = null;
    while (window.__app.hud.tips.current) window.__app.hud.tips.dismiss();
  });
  await wait(300);
  const g0 = await goal();
  check('a first goal is on screen once the guide is over', g0.shown && g0.hint && !!g0.first, JSON.stringify(g0));
  await ev(() => {
    const g = window.__app.session.game;
    const w = g.worldsOf(g.playerId).find((n) => n.capitalOf < 0);
    g.cmdSetRole(g.playerId, w.id, w.role === 'forge' ? 'observatory' : 'forge');
  });
  await tick(0.6);
  await wait(200);
  const g1 = await goal();
  check('giving a world a role reaches the first goal: Embers paid, remembered, and the box moves on', g1.done.includes('role') && g1.first !== 'role' && g1.embers >= g0.embers + 39 && (await ev(() => JSON.parse(localStorage.getItem('hegemarch.profile.v1')).goalsDone.includes('role'))), JSON.stringify(g1));
  const mark = () => ev(() => ({ marking: window.__app.hud.goals.marking(), away: window.__app.hud.embersAway, shown: Math.round(window.__app.hud.embersShown), embers: Math.round(window.__app.session.game.player.embers) }));
  const m1 = await mark();
  check('the box marks the goal while its Embers fly to the count, which takes them in as they land', m1.marking && m1.away === 40 && m1.shown <= m1.embers - 39, JSON.stringify(m1));
  await wait(2600);
  const m2 = await mark();
  check('then the count holds them all, and the box names the next goal', !m2.marking && m2.away === 0 && Math.abs(m2.shown - m2.embers) <= 1 && (await goal()).shown, JSON.stringify(m2));

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

  // ---- No guarded world near: step 7 ends with its Breaker ----
  await ev(() => {
    const g = window.__app.session.game;
    g.ui.tut = 7;
    g.ui.tutBreakers = 0;
    g.player.embers += 400;
    for (const u of g.unitList) if (!u.dead && (u.owner === g.guardianId || (u.owner === g.playerId && u.type === 'breaker'))) g.killUnit(u, -1);
    g.ui.tutBreakers = 0;
    g.cmdQueueShip(g.playerId, g.player.capital, 'breaker');
  });
  await tick(0.1);
  await fastForward(40);
  await tick(0.1);
  check('with no guarded world near, the Breaker built ends step 7', (await step()) === 8);

  // ---- Nobody fights the raider at the Hearth: it leaves, and the guide goes on ----
  await tick(3);
  check('(the raider comes for the Hearth)', (await ev(() => window.__app.session.game.ui.tutRaider ?? 0)) > 0);
  await ev(() => (window.__app.session.game.ui.tutRaidAt = window.__app.session.game.time - 200));
  await tick(0.1);
  await tick(0.1);
  check('an ignored raider at the Hearth leaves too, and the guide reaches the Destinies', (await step()) === 9);

  // ---- The Destinies card goes away some other way ----
  await tick(3);
  check('the Destinies card opens', await ev(() => window.__app.session.modal?.kind === 'destinies'));
  await ev(() => (window.__app.session.modal = { kind: 'help' }));
  await tick(0.1);
  check('the guide still finishes if the card is replaced', (await step()) === 10);
  await ev(() => (window.__app.session.modal = null));
  await tick(0.1);
  check('and its closing card waits until the other one is gone', await ev(() => window.__app.session.modal?.kind === 'nightDone'));
  await unheld();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 10 && (await ev(() => window.__app.session.modal !== null)); i++) await wait(100);
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
  await toDestinies();
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
  check('continuing it does not bring the closing card back', (await step()) === 10 && (await ev(() => window.__app.session.modal?.kind !== 'nightDone')));

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
  check('and its banner', (await ev(() => window.__app.hud.tutorial.banner()?.text ?? '')).startsWith('STEP 2 OF 9'));

  /** Save, quit to the title and continue the run, with its guide set to `tut` (and `tutV`, or none) first. */
  const reloadAt = async (tut, tutV) => {
    await ev(([t, v]) => {
      const g = window.__app.session.game;
      g.ui.tut = t;
      if (v) g.ui.tutV = v;
      else delete g.ui.tutV;
    }, [tut, tutV]);
    await ev(() => window.__app.hud.modals.open({ kind: 'menu' }));
    await wait(200);
    await clickUi('m-4');
    await page.waitForSelector('[data-sa="continue"]', { timeout: 10000 });
    await page.click('[data-sa="continue"]');
    await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
    await wait(500);
  };

  // ---- A run saved at its Destinies before the rally, Breaker and Hearth steps: still at its Destinies ----
  await reloadAt(6, 2);
  check('a save from the six-step guide at its Destinies is at the Destinies (step 9)', (await step()) === 9, `step ${await step()}`);
  await reloadAt(5, 2);
  check('and one at its Scout step is still there', (await step()) === 5, `step ${await step()}`);

  // ---- A run saved before the Scout step: a finished guide stays finished ----
  await reloadAt(6); // "done" in the five-step numbering
  check('an older save keeps a finished guide finished', (await step()) === 10 && (await ev(() => window.__app.session.modal?.kind !== 'destinies' && !window.__app.hud.tutorial.busy())));
} catch (e) {
  console.error('FAILED:', e);
  failures++;
  await page.screenshot({ path: '.shots/tutorial-failure.png' }).catch(() => {});
}
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
