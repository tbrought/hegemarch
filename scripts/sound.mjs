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
async function open(policy, size = { width: 1280, height: 720 }) {
  const browser = await chromium.launch({ executablePath, headless: true, args: [`--autoplay-policy=${policy}`] });
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
    const b = document.getElementById('sound');
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
