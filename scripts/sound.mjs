// Sound on the menu screens: it starts with the page where the browser lets it, the first click starts
// it where it does not, and the button in the corner says what is heard and changes it.
//   node scripts/sound.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
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
const PROFILE = { tutorialDone: true, runs: 4, wins: 1, legacy: 140, totalLegacy: 300, seenTips: [] };

/** A browser with the given autoplay rule, on the title screen with the given profile. */
async function open(policy, size = { width: 1280, height: 720 }, scrollbars = false) {
  // (A headless browser is started with its scrollbars hidden; `scrollbars` leaves them in.)
  const browser = await chromium.launch({ executablePath, headless: true, args: [`--autoplay-policy=${policy}`], ignoreDefaultArgs: scrollbars ? ['--hide-scrollbars'] : [] });
  const page = await browser.newPage({ viewport: size });
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
  await page.waitForTimeout(1800);
  return { browser, page };
}

const state = (page) =>
  page.evaluate(() => {
    const app = window.__app;
    // (In a run the button is in no screen, and so not in the page at all.)
    const b = document.getElementById('sound') ?? Object.assign(document.createElement('button'), { hidden: true });
    const r = b.getBoundingClientRect();
    const pg = document.querySelector('.page')?.getBoundingClientRect();
    return {
      ctx: app.sfx.ctx?.state ?? 'none',
      playing: app.music.playing,
      muted: app.profile.settings.muted,
      gain: app.sfx.master?.gain.value ?? -1,
      label: b.textContent,
      shown: !b.hidden && r.width > 0,
      state: b.dataset.state,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      saved: JSON.parse(localStorage.getItem('hegemarch.profile.v1') ?? '{}').settings?.muted ?? null,
      screen: app.screen,
      pageTop: pg ? Math.round(pg.top) : -1,
    };
  });

// ---- A browser that plays nothing before the first click (what most visitors have) ----
{
  const { browser, page } = await open('document-user-activation-required');
  let s = await state(page);
  check(s.shown && s.state === 'asleep' && /CLICK FOR SOUND/.test(s.label), `before any click the button says the sound waits for one (${s.label}, audio ${s.ctx})`);
  check(s.ctx !== 'running', 'and nothing plays');
  await page.screenshot({ path: '.shots/sound-asleep.png' });
  await page.mouse.click(24, 400);
  await page.waitForTimeout(500);
  s = await state(page);
  check(s.ctx === 'running' && s.playing === 'title' && s.state === 'on' && /SOUND ON/.test(s.label), `a click anywhere starts the title music, and the button says so (${s.label}, playing ${s.playing})`);
  check(s.screen === 'menu', 'that click was on nothing: the title screen is still up');
  await page.click('#sound');
  await page.waitForTimeout(300);
  s = await state(page);
  check(s.muted && s.state === 'off' && /SOUND OFF/.test(s.label) && s.saved === true, `one click on the button turns the sound off, and it is remembered (${s.label})`);
  check(s.gain < 0.02, `nothing is heard (master gain ${s.gain.toFixed(3)})`);
  await page.screenshot({ path: '.shots/sound-off.png' });
  await page.reload();
  await page.waitForTimeout(1800);
  s = await state(page);
  check(s.muted && s.state === 'off', `it is still off after a reload (${s.label})`);
  await page.click('#sound');
  await page.waitForTimeout(500);
  s = await state(page);
  check(!s.muted && s.state === 'on' && s.ctx === 'running' && s.gain > 0.1, `and one click turns it on again (${s.label}, gain ${s.gain.toFixed(2)})`);
  // Every menu screen has the button, and it covers nothing.
  for (const sa of ['setup', 'hall', 'howto', 'settings']) {
    await page.click(`[data-sa="${sa}"]`);
    await page.waitForTimeout(250);
    s = await state(page);
    check(s.shown && s.pageTop >= 0 && s.box[3] <= s.pageTop + 1, `${sa}: the button is there, above the page (button to ${s.box[3]}px, page from ${s.pageTop}px)`);
    if (sa !== 'settings') await page.click('[data-sa="menu"]');
  }
  // Settings has the same switch.
  await page.click('[data-sa="sound:off"]');
  await page.waitForTimeout(250);
  s = await state(page);
  check(s.muted && s.state === 'off', 'Settings: OFF turns it off, and the corner button agrees');
  await page.click('[data-sa="sound:on"]');
  await page.waitForTimeout(250);
  s = await state(page);
  check(!s.muted && s.state === 'on', 'Settings: ON turns it on');
  await page.click('#sound');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => document.querySelector('[data-sa="sound:off"]').classList.contains('active')), 'and the corner button moves the switch in Settings');
  // Settings has one row for the tracks: a selector, grouped by mood, and NEXT. Picking one plays it,
  // also when the sound was off (it is, here).
  const listed = await page.evaluate(() => ({
    tracks: [...document.querySelectorAll('select[data-track] option')].map((o) => o.value),
    groups: [...document.querySelectorAll('select[data-track] optgroup')].map((o) => o.label),
    old: document.querySelectorAll('[data-sa^="track:"]').length,
    box: (() => {
      const r = document.querySelector('select[data-track]').getBoundingClientRect();
      const pg = document.querySelector('.page').getBoundingClientRect();
      return r.left >= pg.left && r.right <= pg.right && r.height < 40;
    })(),
  }));
  check(listed.tracks.length >= 11 && new Set(listed.tracks).size === listed.tracks.length && listed.groups.length === 5 && listed.old === 0 && listed.box, `Settings has the tracks in one selector (${listed.tracks.length} tracks, ${listed.groups.join(', ')})`);
  const now = () =>
    page.evaluate(() => ({
      title: window.__app.music.title,
      mood: window.__app.music.playing,
      muted: window.__app.profile.settings.muted,
      shown: document.querySelector('select[data-track]')?.value,
      switchOn: document.querySelector('[data-sa="sound:on"]')?.classList.contains('active'),
    }));
  await page.selectOption('select[data-track]', 'Starlanes');
  await page.waitForTimeout(400);
  let t = await now();
  check(t.title === 'Starlanes' && t.shown === 'Starlanes' && !t.muted && t.switchOn, `picking Starlanes plays it and turns the sound on (${t.mood}: ${t.title}, shown ${t.shown}, sound ${t.muted ? 'off' : 'on'})`);
  for (const name of ['Last Stand', 'First Fires']) {
    await page.selectOption('select[data-track]', name);
    await page.waitForTimeout(300);
    t = await now();
    check(t.title === name && t.shown === name, `picking ${name} plays it (${t.mood}: ${t.title})`);
  }
  // With the keyboard on the selector, the arrow keys go through the tracks.
  await page.focus('select[data-track]');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  t = await now();
  check(t.title === 'Long Road' && t.shown === 'Long Road', `the arrow keys go through them (${t.title})`);
  // NEXT goes on down the list (to the last of it, the tune of a crowning), and round to the top.
  await page.click('[data-sa="track-next"]');
  await page.waitForTimeout(300);
  t = await now();
  check(t.title === 'The Crowning' && t.shown === 'The Crowning' && t.mood === 'crown', `NEXT plays the next in the list (${t.title})`);
  await page.click('[data-sa="track-next"]');
  await page.waitForTimeout(300);
  t = await now();
  check(t.title === 'Hegemarch' && t.shown === 'Hegemarch', `and from the last of it, round to the first (${t.title})`);
  await page.click('[data-sa="track-next"]');
  await page.waitForTimeout(300);
  t = await now();
  check(t.title === 'The Empty Throne' && t.shown === 'The Empty Throne', `and the one after (${t.title})`);
  // The music moves on by itself: the selector follows it.
  await page.evaluate(() => window.__app.music.skip());
  await page.waitForTimeout(300);
  t = await now();
  check(t.title !== 'The Empty Throne' && t.shown === t.title, `when the music moves on, the selector shows what plays (${t.title})`);
  await page.screenshot({ path: '.shots/sound-tracks.png', fullPage: false });
  await page.click('[data-sa="menu"]');
  await page.waitForTimeout(300);
  t = await now();
  check(t.mood === 'title', `back on the title screen, the title music plays (${t.title})`);
  await page.click('[data-sa="settings"]');
  await browser.close();
}

// ---- A page that scrolls: the button stands beside the scrollbar, and goes up with the page ----
{
  // (With a scrollbar that takes room, as desktop browsers have.)
  const { browser, page } = await open('document-user-activation-required', { width: 1100, height: 600 }, true);
  const where = () =>
    page.evaluate(() => {
      const scr = document.querySelector('.screen');
      const b = document.getElementById('sound').getBoundingClientRect();
      const r = scr.getBoundingClientRect();
      const logo = document.querySelector('.logo')?.getBoundingClientRect();
      const foot = document.querySelector('.menu-foot')?.getBoundingClientRect();
      return {
        bar: scr.offsetWidth - scr.clientWidth,
        inside: scr.contains(document.getElementById('sound')),
        right: Math.round(b.right),
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        edge: Math.round(r.left + scr.clientLeft + scr.clientWidth),
        scrolls: scr.scrollHeight > scr.clientHeight,
        above: logo ? Math.round(logo.top - r.top) : -1,
        below: foot ? Math.round(r.top + scr.scrollHeight - (foot.bottom + scr.scrollTop)) : -1,
      };
    });
  let p = await where();
  check(p.inside && Math.abs(p.above - p.below) <= 2 + 40, `the title screen is laid out as before, with the button in it (${p.above}px above the title, ${p.below}px under the foot)`);
  await page.click('[data-sa="setup"]');
  await page.waitForTimeout(400);
  p = await where();
  check(p.scrolls && p.bar >= 10, `the setup page scrolls, with a scrollbar ${p.bar}px wide`);
  check(p.right <= p.edge, `the button stands beside the scrollbar, not on it (button to ${p.right}px, scrollbar from ${p.edge}px)`);
  await page.screenshot({ path: '.shots/sound-scrollbar.png' });
  await page.evaluate(() => (document.querySelector('.screen').scrollTop = 300));
  await page.waitForTimeout(300);
  p = await where();
  check(p.bottom < 0, `scrolled down, it has gone up with the top of the page (button at ${p.top}px)`);
  // A click on an option draws the page again: the button is still in it, and the page keeps its place.
  // (Clicked from inside the page: a click from here would first scroll the option into view.)
  await page.evaluate(() => [...document.querySelectorAll('.opt button.small:not(.active):not(.disabled)')][0].click());
  await page.waitForTimeout(300);
  p = await where();
  const top = await page.evaluate(() => document.querySelector('.screen').scrollTop);
  check(p.inside && Math.abs(top - 300) <= 2, `after the page is drawn again the button is still in it, and the page has kept its place (scrolled to ${top}px)`);
  await page.evaluate(() => (document.querySelector('.screen').scrollTop = 0));
  await page.waitForTimeout(300);
  p = await where();
  check(p.top >= 0 && p.right <= p.edge, 'and back at the top it is there again');
  await browser.close();
}

// ---- The first click of all is on the sound button itself ----
{
  const { browser, page } = await open('document-user-activation-required');
  await page.click('#sound');
  await page.waitForTimeout(500);
  const s = await state(page);
  check(!s.muted && s.ctx === 'running' && s.state === 'on', `a first click on CLICK FOR SOUND starts the sound, it does not turn it off (${s.label})`);
  await page.click('#sound');
  await page.waitForTimeout(300);
  check((await state(page)).muted, 'the next click on it turns it off');
  await browser.close();
}

// ---- The first key ----
{
  const { browser, page } = await open('document-user-activation-required');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(500);
  const s = await state(page);
  check(s.ctx === 'running' && s.state === 'on', `a key starts it too (${s.label})`);
  await browser.close();
}

// ---- A browser that lets the page play at once (a visitor who clicked PLAY on the site) ----
{
  const { browser, page } = await open('no-user-gesture-required');
  const s = await state(page);
  check(s.ctx === 'running' && s.playing === 'title' && s.state === 'on', `where the browser allows it, the title music plays with no click at all (${s.label}, audio ${s.ctx})`);
  await browser.close();
}

// ---- A phone: the button stays on screen, and is the picture alone once the sound plays ----
{
  const { browser, page } = await open('document-user-activation-required', { width: 420, height: 800 });
  let s = await state(page);
  check(s.shown && s.box[2] <= 420 && s.box[0] >= 0, `on a phone the button is on screen (${s.box.join(',')})`);
  await page.screenshot({ path: '.shots/sound-phone.png' });
  await page.mouse.click(10, 400);
  await page.waitForTimeout(400);
  s = await state(page);
  check(s.state === 'on' && s.box[2] - s.box[0] < 40, `once it plays, it is the picture alone (${s.box[2] - s.box[0]}px wide)`);
  for (const sa of ['setup', 'hall', 'howto', 'settings']) {
    await page.click(`[data-sa="${sa}"]`);
    await page.waitForTimeout(250);
    s = await state(page);
    check(s.shown && s.pageTop >= 0 && s.box[3] <= s.pageTop + 1, `${sa} on a phone: the button is above the page (button to ${s.box[3]}px, page from ${s.pageTop}px)`);
    await page.click('[data-sa="menu"]');
  }
  await browser.close();
}

// ---- In a run the corner belongs to the game ----
{
  const { browser, page } = await open('document-user-activation-required');
  await page.click('[data-sa="setup"]');
  await page.waitForTimeout(300);
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app.screen === 'game', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const s = await state(page);
  check(!s.shown, 'in a run the button is gone (sound is under Menu, Settings)');
  check(s.ctx === 'running' && s.playing === 'night', `and the run has its music (${s.playing})`);
  await browser.close();
}

if (errors.length) console.log('errors:', errors);
console.log(failed || errors.length ? `FAILED (${failed} checks, ${errors.length} errors)` : 'all sound checks passed');
process.exit(failed || errors.length ? 1 : 0);
