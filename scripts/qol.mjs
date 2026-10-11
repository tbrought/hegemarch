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
  await browser.close();
}

if (errors.length) console.log('errors:', errors);
console.log(failed || errors.length ? `FAILED (${failed} checks, ${errors.length} errors)` : 'all checks passed');
process.exit(failed || errors.length ? 1 : 0);
