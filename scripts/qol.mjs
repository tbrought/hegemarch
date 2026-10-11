// The small things that make the game easy to live with: a setup that is remembered, Escape as BACK,
// controls the keyboard can reach, fullscreen, a hidden tab that is silent, a word for touch screens,
// and, in a run, dialogs of one size, a goal named in full and a way on to the next track.
//   node scripts/qol.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const errors = [];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const PROFILE = { tutorialDone: true, runs: 4, wins: 1, legacy: 140, maxDifficulty: 1, seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen'], settings: { autoPause: false } };

async function open(context = {}) {
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
  await page.goto(url);
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
    window.__ended = sfx.ctx.currentTime;
    const g = app.session.game;
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
  });
  await page.waitForTimeout(1200);
  let end = await ev(page, () => ({ mood: window.__app.music.playing, notes: window.__notes.filter((t) => t > window.__ended + 0.35).length, screen: window.__app.screen }));
  check(end.mood === null && end.notes === 0 && end.screen === 'game', `when the run ends the music stops for the fanfare, and stays stopped (${end.mood}, ${end.notes} notes since)`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__app?.screen === 'results', null, { timeout: 15000 });
  end = await ev(page, () => ({ mood: window.__app.music.playing, wait: window.__app.music.startAt - window.__app.sfx.ctx.currentTime, since: window.__app.sfx.ctx.currentTime - window.__ended }));
  check(end.mood === 'title' && end.since < 2 && end.wait > 0.1 && end.since + end.wait > 2.1, `skipped to the results, their music waits for the fanfare to end (asked ${end.since.toFixed(1)} s in, starts ${(end.since + end.wait).toFixed(1)} s in)`);
  await page.waitForTimeout(3200);
  const playing = await ev(page, () => ({ notes: window.__notes.filter((t) => t > window.__ended + 2.1).length, early: window.__notes.filter((t) => t > window.__ended + 0.35 && t < window.__ended + 2.1).length }));
  check(playing.notes > 5 && playing.early === 0, `and then plays (${playing.notes} notes, none before the fanfare was over)`);
  await browser.close();
}

if (errors.length) console.log('errors:', errors);
console.log(failed || errors.length ? `FAILED (${failed} checks, ${errors.length} errors)` : 'all checks passed');
process.exit(failed || errors.length ? 1 : 0);
