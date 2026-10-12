// The small things that make the game easy to live with: a setup that is remembered, Escape as BACK,
// controls the keyboard can reach, fullscreen, a hidden tab that is silent, a word for touch screens,
// and, in a run, dialogs of one size, a goal named in full and a way on to the next track.
//   node scripts/qol.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const errors = [];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const PROFILE = { tutorialDone: true, runs: 4, wins: 1, legacy: 140, maxDifficulty: 1, seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen'], settings: { autoPause: false } };

async function open(context = {}, hash = '') {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...context });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
  // (The profile is put there once: a reload must find what the page itself saved.)
  await page.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('hegemarch.profile.v1', JSON.stringify(p));
      sessionStorage.setItem('seeded', '1');
    }
  }, PROFILE);
  await page.goto(url + hash);
  await page.waitForTimeout(1600);
  return { browser, page };
}
const ev = (page, f, a) => page.evaluate(f, a);
const screen = (page) => ev(page, () => window.__app.screen);

// ---- The menus ----
{
  const { browser, page } = await open();
  // Escape is BACK on every page behind the title screen.
  for (const sa of ['setup', 'hall', 'howto', 'settings']) {
    await page.click(`[data-sa="${sa}"]`);
    await page.waitForTimeout(200);
    const there = await screen(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check(there !== 'menu' && (await screen(page)) === 'menu', `Escape goes back from ${there}`);
  }
  // The setup is worked with the keyboard, and remembered.
  await page.click('[data-sa="setup"]');
  await page.waitForTimeout(200);
  await page.focus('[data-sa="heir:vael"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let st = await ev(page, () => ({ heir: window.__app.setup.heir, focus: document.activeElement?.dataset?.sa, pressed: document.querySelector('[data-sa="heir:vael"]').getAttribute('aria-pressed') }));
  check(st.heir === 'vael' && st.pressed === 'true', `Enter on a house card chooses the house (${st.heir})`);
  check(st.focus === 'heir:vael', `and the keyboard stays on the card (${st.focus})`);
  await page.keyboard.press('Tab');
  st = await ev(page, () => ({ focus: document.activeElement?.dataset?.sa }));
  check(st.focus === 'heir:wayfarer', `Tab goes on to the next card (${st.focus})`);
  await page.click('[data-sa="size:small"]');
  await page.click('[data-sa="diff:0"]');
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(1600);
  await page.click('[data-sa="setup"]');
  await page.waitForTimeout(200);
  st = await ev(page, () => ({ ...window.__app.setup, sel: document.querySelector('.heir.sel')?.dataset.sa }));
  check(st.heir === 'vael' && st.size === 'small' && st.difficulty === 0 && st.sel === 'heir:vael', `the setup opens on what was chosen last time (${st.heir}, ${st.size}, difficulty ${st.difficulty})`);
  // A difficulty the player may no longer choose is not brought back.
  await ev(page, () => {
    const p = JSON.parse(localStorage.getItem('hegemarch.profile.v1'));
    p.lastSetup = { heir: 'ashen', size: 'large', difficulty: 3 };
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(1600);
  st = await ev(page, () => ({ ...window.__app.setup }));
  check(st.heir !== 'ashen' && st.difficulty <= 1 && st.size === 'large', `but not on a house or a difficulty that is locked (${st.heir}, difficulty ${st.difficulty})`);
  // Settings: tick boxes by keyboard, and fullscreen.
  await page.click('[data-sa="settings"]');
  await page.waitForTimeout(200);
  await page.focus('[data-sa="toggle:crt"]');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  st = await ev(page, () => ({ crt: window.__app.profile.settings.crt, focus: document.activeElement?.dataset?.sa, checked: document.querySelector('[data-sa="toggle:crt"]').getAttribute('aria-checked') }));
  check(st.crt === true && st.checked === 'true' && st.focus === 'toggle:crt', `Space ticks a box in Settings, and the keyboard stays on it (${st.focus})`);
  await page.keyboard.press('Space');
  const full = await ev(page, () => ({ offered: document.fullscreenEnabled, button: !!document.querySelector('[data-sa="fullscreen"]') }));
  check(full.offered === full.button, `Settings offers fullscreen where the browser does (${full.offered})`);
  if (full.button) {
    await page.click('[data-sa="fullscreen"]');
    await page.waitForTimeout(600);
    st = await ev(page, () => ({ on: !!document.fullscreenElement, label: document.querySelector('[data-sa="fullscreen"]')?.textContent }));
    check((st.on && st.label === 'ON') || (!st.on && st.label === 'OFF'), `the fullscreen switch says what is so (${st.label})`);
    if (st.on) {
      await page.click('[data-sa="fullscreen"]');
      await page.waitForTimeout(600);
      check(!(await ev(page, () => !!document.fullscreenElement)), 'and turns it off again');
    }
  }
  // A hidden tab is silent, and the sound comes back with it.
  await page.mouse.click(30, 300);
  await page.waitForTimeout(400);
  const hide = (hidden) =>
    ev(page, (hidden) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  const audio = () => ev(page, () => window.__app.sfx.ctx.state);
  const before = await audio();
  await hide(true);
  await page.waitForTimeout(400);
  const hidden = await audio();
  await hide(false);
  await page.waitForTimeout(400);
  check(before === 'running' && hidden === 'suspended' && (await audio()) === 'running', `the sound stops while the tab is hidden and comes back with it (${before}, ${hidden}, ${await audio()})`);
  check(!(await page.$('.menu .notice')), 'with a mouse there is no word about touch screens');
  await browser.close();
}

// ---- A phone ----
{
  const { browser, page } = await open({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  await page.waitForTimeout(300);
  const note = await ev(page, () => document.querySelector('.menu .notice')?.textContent ?? '');
  check(/mouse and keyboard/.test(note), `on a touch screen the title says the game needs a mouse (${note.slice(0, 44)}…)`);
  const wide = await ev(page, () => document.querySelector('.screen').scrollWidth > document.querySelector('.screen').clientWidth);
  check(!wide, 'and the title still fits the screen');
  await page.screenshot({ path: '.shots/qol-phone.png' });
  await browser.close();
}

// ---- In a run ----
{
  const { browser, page } = await open();
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await page.waitForTimeout(900);
  await ev(page, () => (window.__app.session.modal = null));
  // The dialogs that are read are one size.
  const sizes = {};
  for (const [key, kind] of [['KeyU', 'status'], ['KeyH', 'help'], ['KeyL', 'log']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    sizes[kind] = await ev(page, () => {
      const r = window.__app.hud.ui.rectOf('modal');
      return r ? `${r.w}x${r.h}` : 'none';
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  check(sizes.status !== 'none' && sizes.status === sizes.help && sizes.help === sizes.log, `Status, How to Play and the Comms Log are one size (${Object.values(sizes).join(', ')})`);
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.shots/qol-help.png' });
  await page.keyboard.press('Escape');
  // The goal card names its goal in full.
  const goal = await ev(page, () => {
    const app = window.__app;
    const left = app.hud.goals.left();
    const r = app.hud.ui.lastHints.find((h) => h.key === 'goal');
    return { label: left[0]?.label, box: r ? [r.w, r.h] : null, shown: app.hud.goals.shown(), all: left.map((x) => x.label) };
  });
  check(goal.shown && goal.box && goal.box[1] >= 21, `the goal card is there (${goal.label}: ${goal.box})`);
  // The longest of them, at the largest pixels (the least room): on two lines, not cut short.
  const long = await ev(page, () => {
    const app = window.__app;
    const longest = [...app.hud.goals.left()].sort((a, b) => b.label.length - a.label.length)[0];
    app.profile.goalsDone = app.hud.goals.left().filter((x) => x.id !== longest.id).map((x) => x.id);
    return longest.label;
  });
  await page.waitForTimeout(300);
  const tall = await ev(page, () => {
    const r = window.__app.hud.ui.lastHints.find((h) => h.key === 'goal');
    return r ? [r.w, r.h] : null;
  });
  check(tall && tall[1] > 21 && tall[0] <= 162, `a long goal takes a second line and is named in full (${long}: ${tall})`);
  await page.screenshot({ path: '.shots/qol-goal.png' });
  // Settings in a run: the track that plays, and the next; fullscreen.
  const click = async (id) => {
    const r = await ev(page, (id) => {
      const c = document.getElementById('game').getBoundingClientRect();
      const app = window.__app;
      const r = app.hud.ui.rectOf(id);
      return r ? { x: c.left + ((r.x + r.w / 2) * c.width) / app.hud.W, y: c.top + ((r.y + r.h / 2) * c.height) / app.hud.H } : null;
    }, id);
    if (!r) return false;
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(200);
    return true;
  };
  await ev(page, () => window.__app.hud.modals.open({ kind: 'settings' }));
  await page.waitForTimeout(300);
  const track = await ev(page, () => window.__app.music.title);
  check(await click('tg-track'), 'Settings in a run has a row for the track');
  const next = await ev(page, () => ({ title: window.__app.music.title, mood: window.__app.music.playing }));
  check(next.title !== track && ['night', 'war'].includes(next.mood), `NEXT plays another track of the same kind (${track} > ${next.title}, ${next.mood})`);
  const full = await ev(page, () => ({ offered: document.fullscreenEnabled, row: !!window.__app.hud.ui.rectOf('tg-full') }));
  check(full.offered === full.row, `and one for fullscreen where the browser offers it (${full.offered})`);
  const fits = await ev(page, () => {
    const u = window.__app.hud.ui;
    const m = u.rectOf('modal');
    return ['tg-sound', 'tg-track', 'tg-full', 'px-large'].every((id) => {
      const r = u.rectOf(id);
      return !r || (r.y >= m.y && r.y + r.h <= m.y + m.h && r.x >= m.x && r.x + r.w <= m.x + m.w);
    });
  });
  check(fits, 'every row is inside the dialog');
  await page.screenshot({ path: '.shots/qol-settings.png' });
  await page.keyboard.press('Escape');
  // Build keys and the next Forge. (The game is held still by its clock, not by a pause: a pause takes no orders.)
  await page.waitForTimeout(200);
  const k = await ev(page, () => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    s.modal = null;
    window.__step = g.step;
    g.step = () => {};
    g.player.embers = 9000;
    g.player.hangarCap = 99;
    s.clearSelection();
    return { hearth: g.player.capital, types: g.shipTypesFor(g.player), idle: !!app.hud.ui.rectOf('idle-forges') };
  });
  await page.waitForTimeout(300);
  check(await ev(page, () => !!window.__app.hud.ui.rectOf('idle-forges')), 'the top bar counts the Forges that build nothing');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  let kq = await ev(page, () => window.__app.session.view.selectedNode);
  check(kq === k.hearth, `Tab goes to a world that builds, the idle ones first (the Hearth: ${kq === k.hearth})`);
  const queue = () => ev(page, () => { const g = window.__app.session.game; return g.nodes[g.player.capital].shipQ.map((x) => x.id); });
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Shift+KeyW');
  await page.waitForTimeout(200);
  kq = await queue();
  check(kq.join() === [k.types[0], k.types[2], k.types[1], k.types[1], k.types[1]].join(), `Q, E and Shift+W queue the first, third and second ships, five in all (${kq.join(', ')})`);
  check(await ev(page, () => !window.__app.hud.ui.rectOf('idle-forges')), 'and with every Forge at work, the count is gone');
  // With ships selected, E is still Explore, and builds nothing.
  await ev(page, () => {
    const s = window.__app.session;
    const g = s.game;
    for (const it of g.nodes[g.player.capital].shipQ) g.player.embers += it.cost;
    g.nodes[g.player.capital].shipQ.length = 0;
    s.selectUnits(s.fleetAt(g.player.capital).map((u) => u.id));
  });
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(200);
  check((await queue()).length === 0, 'with ships selected the keys keep their own meaning: nothing is built');
  // The count in the top bar is a way to the next idle Forge as well.
  await ev(page, () => window.__app.session.clearSelection());
  await page.waitForTimeout(200);
  const r = await ev(page, () => {
    const c = document.getElementById('game').getBoundingClientRect();
    const app = window.__app;
    const r = app.hud.ui.rectOf('idle-forges');
    return r ? { x: c.left + ((r.x + r.w / 2) * c.width) / app.hud.W, y: c.top + ((r.y + r.h / 2) * c.height) / app.hud.H } : null;
  });
  if (r) await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(200);
  check(r && (await ev(page, () => window.__app.session.view.selectedNode)) === k.hearth, 'a click on the count goes there too');
  await page.screenshot({ path: '.shots/qol-build-keys.png' });
  // (The third playtest.) The top bar can be read above an open dialog: the next Boon is a question of Lore.
  // (Lore, or the BOON button in its place while one is waiting.)
  await ev(page, () => window.__app.hud.modals.open({ kind: 'status' }));
  await page.waitForTimeout(300);
  const lore = await ev(page, () => {
    const c = document.getElementById('game').getBoundingClientRect();
    const app = window.__app;
    const h = app.hud.ui.lastHints.find((x) => x.key === 'lore-read' || x.key === 'boon-read');
    return h ? { x: c.left + ((h.x + h.w / 2) * c.width) / app.hud.W, y: c.top + ((h.y + h.h / 2) * c.height) / app.hud.H } : null;
  });
  if (lore) await page.mouse.move(lore.x, lore.y);
  await page.waitForTimeout(900);
  const read = await ev(page, () => {
    const u = window.__app.hud.ui;
    const h = u.hintNow;
    return { key: h?.key, tip: h ? (typeof h.tip === 'function' ? h.tip() : h.tip) : '', modal: window.__app.session.modal?.kind };
  });
  check(read.modal === 'status' && /^(lore|boon)-read$/.test(read.key) && /The next Boon: \d+ of \d+ Lore/.test(read.tip), `with Status open, the Lore (or the waiting Boon) in the top bar still has its tooltip, with the next Boon (${read.key}: ${read.tip.split('\n').pop()})`);
  await page.screenshot({ path: '.shots/qol-bar-over-dialog.png' });
  await page.keyboard.press('Escape');
  await page.mouse.move(640, 400);
  // The Destinies at the top right say how far: "3/12", and the time left once one is on the clock.
  const chips = await ev(page, () => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    const out = { plain: g.victories.map((v) => app.hud.chipText(p, v).text), timed: null };
    const v = g.victories.find((x) => ['domination', 'relics', 'treasury'].includes(x));
    if (v === 'domination') p.holdTimer = 30;
    if (v === 'relics') p.relicTimer = 30;
    if (v === 'treasury') p.treasuryTimer = 30;
    if (v) out.timed = { v, ...app.hud.chipText(p, v) };
    return out;
  });
  check(chips.plain.every((t) => /^\d+\/\d+$|^\d+%$|^—$/.test(t)), `every Destiny chip says how far it is (${chips.plain.join(', ')})`);
  check(!chips.timed || (chips.timed.clock && /^\d+:\d\d$/.test(chips.timed.text)), `and one on the clock says the time left (${chips.timed ? `${chips.timed.v}: ${chips.timed.text}` : 'none of the timed Destinies in this run'})`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '.shots/qol-destinies.png' });
  // A fleet that charges its drives says so, and how long it will be.
  const jump = await ev(page, () => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    const p = g.player;
    p.holdTimer = 0;
    p.relicTimer = 0;
    p.treasuryTimer = 0;
    const units = s.fleetAt(p.capital).filter((u) => u.type !== 'ark');
    const next = g.nodes.find((n) => n.id !== p.capital && g.hops(n.id, p.capital) === 1);
    g.cmdMove(p.id, units.map((u) => u.id), next.id);
    for (let i = 0; i < 4; i++) window.__step.call(g);
    s.selectUnits(units.map((u) => u.id));
    const w = app.hud.jumpWait(units);
    return { n: units.length, text: w ? app.hud.jumpWaitText(w) : null };
  });
  check(jump.n > 0 && /^Jumping in \d+ s/.test(jump.text ?? ''), `a fleet charging its drives says when it will jump (${jump.text})`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.shots/qol-jump-charge.png' });
  // The Hearth's projects are buttons with a picture and a price: a Hangar Bay to be had, a Starfire
  // Gate that counts the Boons it waits for.
  const proj = await ev(page, () => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    const p = g.player;
    if (!g.victories.includes('ascension')) g.victories[g.victories.length - 1] = 'ascension';
    // (No bay yet, and a hangar with plenty of room: the button is there all the same.)
    p.boons = Math.min(p.boons, 6);
    s.clearSelection();
    s.selectNode(p.capital);
    return { bays: p.bays ?? 0, boons: p.boons, used: p.hangarUsed, cap: p.hangarCap };
  });
  await page.waitForTimeout(300);
  const projects = await ev(page, () => {
    const u = window.__app.hud.ui;
    const card = u.rectOf('bay');
    const gate = u.rectOf('gate');
    return { bay: card ? [card.w, card.h, !card.disabled] : null, gate: gate ? [gate.w, gate.h, !!gate.disabled] : null, W: window.__app.hud.W };
  });
  check(proj.bays === 0 && projects.bay && projects.bay[2] && projects.gate && projects.gate[2], `the Hearth offers its Hangar Bay from the start (${proj.used}/${proj.cap} of the hangar used, no bay yet), and its Starfire Gate waits for Boons (bay ${projects.bay}, gate ${projects.gate})`);
  check(await click('bay'), 'the Hangar Bay is a button');
  const bought = await ev(page, () => window.__app.session.game.player.bays);
  check(bought === proj.bays + 1, `and a click builds it (${proj.bays} > ${bought} bays)`);
  // With every bay built the button stays, and says so.
  const allBuilt = await ev(page, async () => {
    const app = window.__app;
    const p = app.session.game.player;
    const before = p.bays;
    p.bays = 10;
    await new Promise((r) => setTimeout(r, 250));
    const r = app.hud.ui.rectOf('bay');
    const out = r ? { there: true, disabled: !!r.disabled, tip: typeof r.tip === 'function' ? r.tip() : r.tip } : { there: false };
    p.bays = before;
    return out;
  });
  check(allBuilt.there && allBuilt.disabled && /Every bay is built/.test(allBuilt.tip ?? ''), `with every bay built it is still there, greyed, with the reason (${(allBuilt.tip ?? '').slice(-40)})`);
  await page.screenshot({ path: '.shots/qol-projects.png' });
  await ev(page, () => window.__app.session.clearSelection());
  // (The fourth playtest.) A Bastion's field reaches the places one jump from it, and it protects the
  // worlds of its house there. A world next to the Hearth: before it is a Bastion, that role's button
  // says what it would do here and the map shows it; made one, its card, the Hearth's and the card of
  // a place next door say it.
  const reach = await ev(page, () => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    const p = g.player;
    const hearth = g.nodes[p.capital];
    const world = g.nodes
      .filter((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, hearth.id) === 1)
      .sort((a, b) => g.neighbours(b.id).length - g.neighbours(a.id).length)[0];
    for (const u of [...g.buckets[world.id]]) g.killUnit(u, -1);
    g.kindleWorld(world, p.id);
    g.flushDeferred();
    world.role = 'mine';
    world.retool = 0;
    world.fresh = undefined;
    g.setLevel(world, 1);
    s.selectNode(world.id);
    window.__bastion = world.id;
    return { id: world.id, name: world.name, next: g.neighbours(world.id).length, fields: g.fieldReaches().filter((r) => r.owner === p.id).length };
  });
  await page.waitForTimeout(300);
  const cardLine = () => ev(page, () => window.__app.hud.ui.lastHints.map((h) => h.key).filter((k) => k.startsWith('card-line:') && /FIELD|PROTECT/.test(k)).map((k) => k.slice(10)));
  const spot = (id) => ev(page, (id) => {
    const c = document.getElementById('game').getBoundingClientRect();
    const app = window.__app;
    const r = app.hud.ui.rectOf(id);
    return r ? { x: c.left + ((r.x + r.w / 2) * c.width) / app.hud.W, y: c.top + ((r.y + r.h / 2) * c.height) / app.hud.H } : null;
  }, id);
  const before = await cardLine();
  const btn = await spot('role-bastion');
  await page.mouse.move(btn.x - 40, btn.y - 60);
  await page.mouse.move(btn.x, btn.y, { steps: 5 });
  await page.waitForTimeout(500);
  const pre = await ev(page, () => {
    const app = window.__app;
    const r = app.hud.ui.rectOf('role-bastion');
    return { preview: app.session.view.fieldPreview, tip: (typeof r.tip === 'function' ? r.tip() : r.tip) ?? '' };
  });
  check(reach.fields === 0 && !before.some((t) => /REACHES|PROTECT/.test(t)), `a Mine next to the Hearth has no field (${before.join(' | ') || 'no line'})`);
  check(pre.preview === reach.id, `with the pointer on the Bastion button, the map shows where its field would reach (${pre.preview} for world ${reach.id})`);
  check(new RegExp(`Here its field would reach ${reach.next} places? and protect .*your Hearth`).test(pre.tip), `and the button says what it would do here (${(pre.tip.match(/Here its field[^.]*\./) ?? ['no such sentence'])[0]})`);
  await page.screenshot({ path: '.shots/qol-field-preview.png' });
  await page.mouse.move(btn.x - 40, btn.y - 200, { steps: 5 });
  await page.waitForTimeout(300);
  check((await ev(page, () => window.__app.session.view.fieldPreview)) === -1, 'and no longer once the pointer has left it');
  const made = await ev(page, () => {
    const g = window.__app.session.game;
    const p = g.player;
    const world = g.nodes[window.__bastion];
    world.role = 'bastion';
    world.retool = 0;
    const hearth = g.nodes[p.capital];
    const other = g.neighbours(world.id).map((id) => g.nodes[id]).find((n) => n.owner !== p.id);
    window.__next = other ? other.id : -1;
    return { reaches: g.fieldReaches().filter((r) => r.from === world.id).length, guard: g.guardOf(hearth), guards: g.guardsOf(hearth).length, other: other ? other.name : null };
  });
  await page.waitForTimeout(300);
  const own = await cardLine();
  check(made.reaches === reach.next && own.some((t) => /^FIELD ALSO REACHES /.test(t)), `made a Bastion at level I, its field reaches every place one jump away at once (${made.reaches} of ${reach.next}: ${own.find((t) => t.startsWith('FIELD ALSO')) ?? 'no line'})`);
  check(own.some((t) => /^PROTECTS .+: 20% LESS DAMAGE$/.test(t)), `and its card says what it protects (${own.find((t) => t.startsWith('PROTECTS')) ?? 'no line'})`);
  await ev(page, () => window.__app.session.selectNode(window.__app.session.game.player.capital));
  await page.waitForTimeout(300);
  const hearthCard = await cardLine();
  check(made.guards === 1 && made.guard === 0.2 && hearthCard.some((t) => /^PROTECTED BY .+: 20% LESS DAMAGE$/.test(t)), `the Hearth's card says what protects it (${hearthCard.find((t) => t.startsWith('PROTECTED')) ?? 'no line'})`);
  await ev(page, () => { const g = window.__app.session.game; g.setLevel(g.nodes[window.__bastion], 2); });
  await page.waitForTimeout(300);
  const raised = await cardLine();
  check(raised.some((t) => /^PROTECTED BY .+: 30% LESS DAMAGE$/.test(t)), `raised to level II the Bastion protects by more, and reaches no further (${raised.find((t) => t.startsWith('PROTECTED')) ?? 'no line'})`);
  if (made.other) {
    await ev(page, () => window.__app.session.selectNode(window.__next));
    await page.waitForTimeout(300);
    const next = await cardLine();
    check(next.some((t) => /^(FIELD FROM .+|IN YOUR FIELD): ENEMIES JUMP/.test(t)), `and the card of ${made.other}, next door, says the field reaches it (${next.join(' | ') || 'no line'})`);
  }
  await ev(page, () => window.__app.session.selectNode(window.__bastion));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.shots/qol-field.png' });
  await ev(page, () => window.__app.session.clearSelection());
  // An event that comes up by itself, in the middle of play: a click already on its way must not choose
  // in it. For a moment it takes no click and no key; then it does. One the player opens takes a click
  // at once.
  const raise = (id, unbidden) => ev(page, ({ id, unbidden }) => {
    const app = window.__app;
    const g = app.session.game;
    g.prompts.push({ id, event: 'comet', node: g.player.capital, unit: -1 });
    app.hud.modals.open({ kind: 'event', promptId: id, unbidden });
  }, { id, unbidden });
  const eventState = (id) => ev(page, (id) => {
    const app = window.__app;
    const g = app.session.game;
    const pr = g.prompts.find((x) => x.id === id);
    return { open: app.session.modal?.kind === 'event', chosen: !!pr && pr.result !== undefined, there: !!pr, holding: app.hud.ui.holding(), guarded: app.hud.modals.guarded(), hot: app.hud.ui.hot };
  }, id);
  const released = async () => {
    for (let i = 0; i < 50 && (await ev(page, () => window.__app.hud.ui.holding())); i++) await page.waitForTimeout(100);
  };
  await raise(9001, true);
  await page.waitForTimeout(150);
  const choice = await spot('choice-0');
  await page.mouse.move(choice.x, choice.y, { steps: 3 });
  await page.waitForTimeout(80);
  await page.mouse.click(choice.x, choice.y);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const early = await eventState(9001);
  check(early.open && !early.chosen && early.holding && early.guarded && early.hot === null, `an event that opens by itself takes no click, no digit and no Escape at first (open ${early.open}, chosen ${early.chosen}, lit ${early.hot})`);
  await page.screenshot({ path: '.shots/qol-guard.png' });
  await released();
  const freed = await eventState(9001);
  await page.mouse.click(choice.x, choice.y);
  await page.waitForTimeout(120);
  const picked = await eventState(9001);
  check(freed.open && !freed.holding && !freed.chosen && picked.chosen, `after a moment it takes the click (chosen ${picked.chosen})`);
  // The outcome stays a moment too: a double click on a choice does not put it away unread.
  const okBtn = await spot('ev-ok');
  await page.mouse.click(okBtn.x, okBtn.y);
  await page.waitForTimeout(80);
  const outcome = await eventState(9001);
  await released();
  await page.mouse.click(okBtn.x, okBtn.y);
  await page.waitForTimeout(150);
  const gone = await eventState(9001);
  check(outcome.open && outcome.there && !gone.open && !gone.there, `its outcome cannot be clicked away at once, and can a moment later (open ${outcome.open}, then ${gone.open})`);
  const logged = await ev(page, () => window.__app.session.game.notes.filter((n) => n.kind === 'event').map((n) => n.text).pop());
  check(/^.+: .+\. .+/.test(logged ?? ''), `and what was chosen stays in the log (${(logged ?? 'no line').slice(0, 70)})`);
  // Opened by the player (the button at the edge of the screen), it is theirs at once.
  await raise(9002, false);
  await page.waitForTimeout(150);
  const asked = await eventState(9002);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(120);
  const direct = await eventState(9002);
  check(!asked.holding && !asked.guarded && direct.chosen, `an event the player opens takes a choice at once (chosen ${direct.chosen})`);
  await released();
  await ev(page, () => window.__app.hud.modals.close());
  await page.waitForTimeout(150);
  // (The third playtest.) A right-click shows the way for a moment; Shift+right-click adds a stop.
  const way = await ev(page, () => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    const p = g.player;
    const units = s.fleetAt(p.capital).filter((u) => u.type !== 'ark');
    g.cmdStop(p.id, units.map((u) => u.id));
    s.selectUnits(units.map((u) => u.id));
    // (A place two jumps away, and the stop on the way to it.)
    const far = g.nodes.find((n) => p.explored[n.id] && g.hops(n.id, p.capital) === 2) ?? g.nodes.find((n) => g.hops(n.id, p.capital) === 2);
    const near = g.nodes[g.pathTo(p.capital, far.id)[0]];
    p.explored[far.id] = 1;
    p.explored[near.id] = 1;
    // (The Hearth, the stop and the place beyond it, all on the screen.)
    const cam = app.renderer.cam;
    const span = Math.max(...[p.capital, near.id, far.id].map((id) => Math.hypot(g.nodes[id].x - (g.nodes[p.capital].x + far.x) / 2, g.nodes[id].y - (g.nodes[p.capital].y + far.y) / 2)));
    cam.zoom = cam.tzoom = Math.min(0.12, (cam.h * 0.35) / Math.max(1, span));
    cam.x = cam.tx = (g.nodes[p.capital].x + far.x) / 2;
    cam.y = cam.ty = (g.nodes[p.capital].y + far.y) / 2;
    return { ids: units.map((u) => u.id), near: near.id, far: far.id };
  });
  await page.waitForTimeout(200);
  const at = (id) => ev(page, (id) => {
    const c = document.getElementById('game').getBoundingClientRect();
    const app = window.__app;
    const n = app.session.game.nodes[id];
    const cam = app.renderer.cam;
    const [x, y] = cam.worldToScreen(n.x, n.y);
    return { x: c.left + (x * c.width) / app.hud.W, y: c.top + (y * c.height) / app.hud.H };
  }, id);
  let pt = await at(way.near);
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await page.waitForTimeout(150);
  const flash = await ev(page, () => window.__app.session.view.route);
  check(flash > 0.8, `a right-click order shows the way the ships will take, for a moment (${flash.toFixed(2)} s left)`);
  pt = await at(way.far);
  await page.keyboard.down('Shift');
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  const queued = await ev(page, (w) => {
    const g = window.__app.session.game;
    const u = g.units.get(w.ids[0]);
    return { dest: u.dest, path: [...u.path], near: w.near, far: w.far };
  }, way);
  check(queued.dest === queued.far && queued.path.includes(queued.near) && queued.path[queued.path.length - 1] === queued.far, `Shift+right-click adds a stop on the way (bound for ${queued.far} by way of ${queued.near}: ${queued.path.join(' > ')})`);
  await page.screenshot({ path: '.shots/qol-route.png' });
  await ev(page, (w) => {
    const s = window.__app.session;
    s.game.cmdStop(s.game.playerId, w.ids);
  }, way);
  // A shake that began before a pause dies down while paused (it went on as long as the pause did).
  await ev(page, () => {
    const app = window.__app;
    app.session.clearSelection();
    app.session.paused = true;
    app.renderer.fx.shake = 6;
  });
  await page.waitForTimeout(1500);
  const shake = await ev(page, () => window.__app.renderer.fx.shake);
  check(shake === 0, `paused, the screen stops shaking (${shake})`);
  await ev(page, () => {
    const g = window.__app.session.game;
    window.__app.session.paused = false;
    g.step = window.__step;
  });
  // The run ends: the music stops for the fanfare and stays stopped, and the music of the results
  // waits for the fanfare to be over, also for a player who skips straight to them.
  await page.waitForTimeout(300);
  await ev(page, () => {
    const app = window.__app;
    app.session.modal = null;
    const sfx = app.sfx;
    const music = app.music;
    window.__notes = [];
    const tone = sfx.tone.bind(sfx);
    sfx.tone = (dest, ...rest) => {
      // (When the note sounds, not when it is asked for: notes are scheduled a little ahead.)
      if (dest === music.bus) window.__notes.push(rest[3]);
      return tone(dest, ...rest);
    };
    const g = app.session.game;
    // (Three minutes of the run first, so that its results have something to draw.)
    for (let i = 0; i < 3 * 60 * 20 && !g.outcome; i++) {
      g.step();
      g.fx.length = 0;
    }
    app.session.modal = null;
    window.__ended = sfx.ctx.currentTime;
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
  });
  await page.waitForTimeout(1200);
  let end = await ev(page, () => ({ mood: window.__app.music.playing, notes: window.__notes.filter((t) => t > window.__ended + 0.35).length, screen: window.__app.screen }));
  check(end.mood === 'crown' && end.notes === 0 && end.screen === 'game', `when the run is won the music stops for the fanfare, and the crowning's own waits for it to be over (${end.mood}, ${end.notes} notes since)`);
  // One press skips the ending to its tally; the next goes on to the results.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const skipped = await ev(page, () => ({ done: window.__app.hud.ending.done, screen: window.__app.screen, tally: window.__app.session.endTally.map((l) => l.label) }));
  check(skipped.done && skipped.screen === 'game' && skipped.tally.length === 5 && skipped.tally[0] === 'TIME TO THE CROWN', `a key skips the crowning to its tally (${skipped.tally.join(', ')})`);
  await page.screenshot({ path: '.shots/qol-crowning.png' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__app?.screen === 'results', null, { timeout: 15000 });
  end = await ev(page, () => ({ mood: window.__app.music.playing, wait: window.__app.music.startAt - window.__app.sfx.ctx.currentTime, since: window.__app.sfx.ctx.currentTime - window.__ended }));
  check(end.mood === 'title' && end.since < 2 && end.wait > 0.1 && end.since + end.wait > 2.1, `skipped to the results, their music waits for the fanfare to end (asked ${end.since.toFixed(1)} s in, starts ${(end.since + end.wait).toFixed(1)} s in)`);
  await page.waitForTimeout(3200);
  const playing = await ev(page, () => ({ notes: window.__notes.filter((t) => t > window.__ended + 2.1).length, early: window.__notes.filter((t) => t > window.__ended + 0.35 && t < window.__ended + 2.1).length }));
  check(playing.notes > 5 && playing.early === 0, `and then plays (${playing.notes} notes, none before the fanfare was over)`);
  // (The third playtest.) The results draw the run, minute by minute.
  await ev(page, () => document.querySelector('#run-charts')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const charts = await ev(page, () => {
    const app = window.__app;
    const g = app.session.game;
    const box = document.querySelector('#run-charts');
    if (!box) return null;
    return {
      houses: g.empires().length,
      samples: g.history.length,
      charts: [...box.querySelectorAll('.rc-chart')].map((f) => ({ key: f.dataset.key, lines: f.querySelectorAll('path.rc-line').length, lit: f.querySelectorAll('path.rc-line:not(.rest)').length, ends: f.querySelectorAll('text.rc-end').length, w: f.querySelector('svg')?.getBoundingClientRect().width ?? 0, room: f.getBoundingClientRect().width })),
      picks: box.querySelectorAll('.rc-pick').length,
      pressed: box.querySelectorAll('.rc-pick[aria-pressed="true"]').length,
      tables: box.querySelectorAll('.rc-table table').length,
      rows: box.querySelector('.rc-table table').rows.length,
      wide: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(charts && charts.charts.length === 4 && charts.charts.every((c) => c.lines === charts.houses && c.lit === 2 && c.ends >= 1 && c.w > 100 && c.w <= c.room + 1), `the results draw four charts, a line for every house, the player and one rival in colour (${charts ? charts.charts.map((c) => `${c.key}: ${c.lines} lines`).join(', ') : 'no charts'}; ${charts?.samples} samples)`);
  check(charts && charts.picks === charts.houses - 1 && charts.pressed === 1 && !charts.wide, `with a button for every rival, one of them compared (${charts?.picks} rivals)`);
  check(charts && charts.tables === 4 && charts.rows >= 3, `and the figures as a table (${charts?.tables} tables, ${charts?.rows} rows each)`);
  // What "fleet strength" is: every warship with its picture and its power, and the three rules.
  const note = await ev(page, () => {
    const n = document.querySelector('.rc-note');
    return n ? { ships: [...n.querySelectorAll('.rc-ships li')].map((li) => li.textContent.trim()), pics: n.querySelectorAll('.rc-ships img').length, rules: n.querySelectorAll('.rc-rules li').length, text: n.textContent } : null;
  });
  check(note && note.ships.length === 7 && note.pics === 7 && note.rules === 3 && /counts 35%/.test(note.text), `under the charts the page says how fleet strength is counted (${note ? note.ships.join(', ') : 'no note'})`);
  const plot = page.locator('.rc-chart[data-key="e"] .rc-plot');
  const pb = await plot.boundingBox();
  await page.mouse.move(pb.x + 60, pb.y - 30);
  await page.mouse.move(pb.x + 100, pb.y + 50, { steps: 4 });
  await page.mouse.move(pb.x + 120, pb.y + 60, { steps: 4 });
  await page.waitForTimeout(200);
  const readout = await ev(page, () => {
    const host = document.querySelector('.rc-chart[data-key="e"] .rc-plot');
    const b = host.getBoundingClientRect();
    const under = document.elementFromPoint(b.left + 120, b.top + 60);
    return { hidden: document.querySelector('.rc-tip').hidden, rows: document.querySelectorAll('.rc-tip-row').length, head: document.querySelector('.rc-tip-head')?.textContent, cross: document.querySelectorAll('.rc-cross').length, under: under ? `${under.tagName}.${under.getAttribute('class') ?? ''}#${under.id}` : 'nothing', box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] };
  });
  check(!readout.hidden && readout.rows === charts.houses && readout.cross === 4, `the pointer reads every house at a moment of the run, on all four charts (${readout.head}: ${readout.rows} houses; under the pointer: ${readout.under}, plot at ${readout.box})`);
  await page.screenshot({ path: '.shots/qol-charts.png' });
  await page.mouse.move(5, 5);
  const other = await ev(page, () => {
    const b = [...document.querySelectorAll('.rc-pick')].find((x) => x.getAttribute('aria-pressed') === 'false');
    if (!b) return null;
    const before = document.querySelector('.rc-chart path.rc-line:not(.rest)').getAttribute('stroke');
    b.click();
    return { pressed: b.getAttribute('aria-pressed'), before, after: document.querySelector('.rc-chart path.rc-line:not(.rest)').getAttribute('stroke'), one: document.querySelectorAll('.rc-pick[aria-pressed="true"]').length };
  });
  check(!other || (other.pressed === 'true' && other.one === 1 && other.before !== other.after), `another rival's button compares that rival instead (${other ? `${other.before} > ${other.after}` : 'one rival only'})`);
  await plot.focus();
  await page.keyboard.press('ArrowLeft');
  const keyed = await ev(page, () => ({ hidden: document.querySelector('.rc-tip').hidden, head: document.querySelector('.rc-tip-head')?.textContent, screen: window.__app.screen }));
  check(!keyed.hidden && keyed.screen === 'results', `and the arrow keys read the charts too (${keyed.head})`);
  // The run to tell someone else: three lines to paste, and a link to the same sector.
  const share = await ev(page, () => ({ ...window.__app.results.share, shown: document.querySelector('.share-text')?.textContent, config: (({ seed, size, difficulty }) => ({ seed, size, difficulty }))(window.__app.session.game.config) }));
  check(share.shown === share.text && /^HEGEMARCH · .+, crowned by Conquest in \d+:\d\d\n.+ sector · .+ · Worlds \d+ · Destroyed \d+ · Lost \d+ · Boons \d+\nPlay the same sector: https:\/\/hegemarch\.com\/play\/#c\.[A-Za-z0-9_-]+$/.test(share.text), `the results have the run to paste (${share.text.split('\n')[0]})`);
  await page.click('[data-sa="copy-share"]');
  await page.waitForTimeout(300);
  const copied = await ev(page, () => ({ label: document.querySelector('[data-sa="copy-share"]').textContent, box: document.querySelector('#share-box').hidden ? null : document.querySelector('#share-box').value }));
  check(copied.label === 'COPIED' || copied.box === share.text, `COPY RESULT copies it (or, where the clipboard is refused, shows it to select: ${copied.label})`);
  // The Hall keeps the records the run set.
  await page.click('[data-sa="results-hall"]');
  await page.waitForTimeout(400);
  const rec = await ev(page, () => ({ rows: document.querySelectorAll('table.records tr').length, text: document.querySelector('table.records')?.innerText.replace(/\s+/g, ' '), kinds: Object.keys(window.__app.profile.records) }));
  check(rec.rows === 2 && rec.kinds.length === 1 && /Fastest crown|FASTEST CROWN/i.test(rec.text ?? ''), `the Hall of Heirs lists the records of the kind of run that was played (${rec.kinds.join(', ')}: ${rec.text?.slice(-60)})`);
  await browser.close();

  // Whoever follows the link: the setup, on that sector, with the result to beat.
  const friend = await open({}, '#' + share.link.split('#')[1]);
  const ch = await ev(friend.page, () => ({ screen: window.__app.screen, hash: location.hash, banner: document.querySelector('.challenge')?.innerText.replace(/\s+/g, ' ') ?? '', opts: !!document.querySelector('.opts') }));
  check(ch.screen === 'setup' && ch.hash === '' && /crowned by Conquest in \d+:\d\d/.test(ch.banner) && !ch.opts, `a challenge link opens the setup on that sector, with the result to beat (${ch.banner.slice(0, 90)})`);
  await friend.page.click('[data-sa="launch"]');
  await friend.page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  const same = await ev(friend.page, () => { const c = window.__app.session.game.config; return { seed: c.seed, size: c.size, difficulty: c.difficulty, challenge: !!c.challenge, guided: !!c.tutorial }; });
  check(same.seed === share.config.seed && same.size === share.config.size && same.difficulty === share.config.difficulty && same.challenge && !same.guided, `and launches the same sector: seed, size and difficulty (${same.seed} ${same.size} ${same.difficulty})`);
  await friend.browser.close();
}

if (errors.length) console.log('errors:', errors);
console.log(failed || errors.length ? `FAILED (${failed} checks, ${errors.length} errors)` : 'all checks passed');
process.exit(failed || errors.length ? 1 : 0);
