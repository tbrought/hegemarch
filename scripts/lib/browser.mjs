// What every browser script needs: the browser on this machine, a page on the dev server, the few moves
// a script makes in the game's own canvas UI, and a way to count what passed.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

/** The dev server (`npx vite --port 5173 --strictPort`). */
export const DEV_URL = 'http://localhost:5173/';

/** Where a browser is on this machine: Edge or Chrome. */
export function browserPath() {
  const found = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => fs.existsSync(p));
  if (!found) throw new Error('no Edge or Chrome found on this machine');
  return found;
}

/** Collect a page's errors (console errors and uncaught exceptions) in `errors`. */
export function watch(page, errors, ignore = /fonts\.g/) {
  page.on('console', (m) => m.type() === 'error' && !ignore.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
}

/**
 * Launch the browser, headless, and open one page. `launch` and `context` go to Playwright as they
 * are (a viewport is a context option); the page's errors are collected in `errors`.
 */
export async function openBrowser({ viewport = { width: 1366, height: 768 }, launch = {}, context = {}, ignore } = {}) {
  fs.mkdirSync('.shots', { recursive: true });
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true, ...launch });
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const errors = [];
  watch(page, errors, ignore);
  return { browser, ctx, page, errors };
}

/**
 * The moves of a script in the game: the HUD is drawn on a canvas, so its buttons are found by the id
 * of their region (`Ui.rectOf`) and clicked at their place on the page.
 */
export function gameUi(page) {
  const wait = (ms) => page.waitForTimeout(ms);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  /** A point of the game's canvas, in the page's coordinates. */
  const toPage = (ix, iy) =>
    ev(([x, y]) => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      return [r.left + ((x + 0.5) * r.width) / c.width, r.top + ((y + 0.5) * r.height) / c.height];
    }, [ix, iy]);
  const uiRect = (id) => ev((rid) => window.__app.hud?.ui.rectOf(rid) ?? null, id);
  /**
   * A dialog that has just opened by itself takes no click and no key for a moment (`Modals.guarded`): wait it out, as a
   * player would. (The dialog is asked, not only the last frame: one that has opened and is not drawn yet is guarded already.)
   * And a Boon draft's cards take a moment to come in (`Modals.revealing`): a key or a click before then brings them all and
   * takes none.
   */
  const unheld = async () => {
    for (let i = 0; i < 60 && (await ev(() => window.__app.hud?.modals.guarded() || window.__app.hud?.ui.holding() || window.__app.hud?.modals.revealing())); i++) await wait(100);
  };
  /** Click a HUD region by its id. Waits a second for it to be there; throws if it is not (`required: false`: returns false). */
  const clickUi = async (id, { button = 'left', after = 120, required = true } = {}) => {
    let r = await uiRect(id);
    for (let i = 0; i < 10 && !r; i++) {
      await wait(100);
      r = await uiRect(id);
    }
    if (!r) {
      if (required) throw new Error('no UI region ' + id);
      return false;
    }
    // (Clicks are tested against the last finished frame: let a just-opened panel draw once more.)
    await wait(120);
    await unheld();
    const [x, y] = await toPage(r.x + r.w / 2, r.y + r.h / 2);
    await page.mouse.click(x, y, { button });
    await wait(after);
    return true;
  };
  return { wait, ev, toPage, uiRect, unheld, clickUi };
}

/**
 * Counting checks. `check('what', ok, detail)` prints a line; `done(errors)` adds the page's errors,
 * prints the verdict and returns the exit code.
 */
export function checks() {
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    return !!ok;
  };
  const done = (errors = []) => {
    if (errors.length) {
      failed++;
      console.log('FAIL  console errors:\n  ' + errors.slice(0, 8).join('\n  '));
    }
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
    return failed ? 1 : 0;
  };
  return { check, done, failures: () => failed };
}
