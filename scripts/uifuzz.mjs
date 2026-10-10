// Random play in the real UI: clicks on real buttons and on the map, drags, wheel, every hotkey,
// window resizes and fast-forwards, through menus and runs. Fails on any page error, console
// error, or a dialog that cannot be left.
//   node scripts/uifuzz.mjs [seconds=240] [seed=1] [--ages]     (needs a dev server on port 5173)
// --ages: start in an Ages run, and feed it Lore and Embers so that the random play climbs the ages,
// builds the Ark and crosses to the stars.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const AGES = process.argv.includes('--ages');
const SECONDS = Number(process.argv[2] ?? 240);
let seed = Number(process.argv[3] ?? 1);
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
const executablePath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const KEYS = ['Space', 'Escape', 'b', 'u', 'h', 'l', 'f', 'k', 'e', 'a', 's', 'r', 'c', 'm', '1', '2', '3', 'Equal', 'Minus', 'ArrowLeft', 'ArrowUp', 'Enter', 'Tab', 'F1'];
const log = [];
const note = (s) => {
  log.push(s);
  if (log.length > 30) log.shift();
};

async function domStep() {
  const buttons = await page.$$('[data-sa]');
  const safe = [];
  for (const b of buttons) {
    const sa = await b.getAttribute('data-sa');
    if (sa === 'reset' || sa?.startsWith('perk') || sa?.startsWith('unlock')) continue;
    if (await b.isVisible()) safe.push([b, sa]);
  }
  if (!safe.length) return;
  const [b, sa] = pick(safe);
  note('dom ' + sa);
  await b.click({ timeout: 2000 }).catch(() => {});
}

async function gameStep() {
  const r = rand();
  const box = await ev(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    return { x: c.left, y: c.top, w: c.width, h: c.height };
  });
  const px = () => box.x + rand() * box.w;
  const py = () => box.y + rand() * box.h;
  if (r < 0.35) {
    // A real button or region from the last frame.
    const target = await ev(() => {
      const app = window.__app;
      const regs = app.hud?.ui.regions.filter((x) => x.onClick && !x.disabled && x.id !== 'modal-back' && !/^m-5$/.test(x.id)) ?? [];
      if (!regs.length) return null;
      const g = regs[Math.floor(Math.random() * regs.length)];
      const c = app.canvas.getBoundingClientRect();
      const k = c.width / app.session.screen.W;
      return { id: g.id, x: c.left + (g.x + g.w / 2) * k, y: c.top + (g.y + g.h / 2) * k };
    });
    if (target) {
      note('ui ' + target.id);
      await page.mouse.click(target.x, target.y);
    }
  } else if (r < 0.55) {
    const button = pick(['left', 'left', 'right']);
    const x = px();
    const y = py();
    note(`click ${button} ${Math.round(x)},${Math.round(y)}`);
    await page.mouse.click(x, y, { button });
  } else if (r < 0.65) {
    const button = pick(['left', 'right', 'middle']);
    note('drag ' + button);
    await page.mouse.move(px(), py());
    await page.mouse.down({ button });
    await page.mouse.move(px(), py(), { steps: 5 });
    await page.mouse.up({ button });
  } else if (r < 0.72) {
    note('wheel');
    await page.mouse.move(px(), py());
    await page.mouse.wheel(0, rand() < 0.5 ? -240 : 240);
  } else if (r < 0.92) {
    const k = pick(KEYS);
    const ctrl = k.length === 1 && /\d/.test(k) && rand() < 0.3;
    note('key ' + (ctrl ? 'Ctrl+' : '') + k);
    await page.keyboard.press(ctrl ? `Control+${k}` : k);
  } else if (r < 0.96) {
    note('fast-forward');
    await ev(() => {
      const g = window.__app.session?.game;
      if (!g) return;
      for (let i = 0; i < 1200 && !g.outcome; i++) g.step();
    });
  } else if (r < 0.98) {
    const sizes = [[1280, 720], [1024, 640], [1600, 900], [800, 600], [1920, 1080]];
    const [w, h] = pick(sizes);
    note(`resize ${w}x${h}`);
    await page.setViewportSize({ width: w, height: h });
  } else {
    note('pixel size');
    await ev(() => {
      const app = window.__app;
      const s = app.session?.profile.settings;
      if (!s) return;
      s.pixelSize = ['small', 'auto', 'large'][Math.floor(Math.random() * 3)];
      app.applySettings?.();
    });
  }
}

const t0 = Date.now();
let steps = 0;
let stuckSince = 0;
let lastModal = '';
try {
  await page.goto('http://localhost:5173/');
  await wait(1500);
  await ev(() => localStorage.clear());
  await page.reload();
  await wait(2000);
  if (AGES) {
    await page.click('[data-sa="ages"]');
    await page.click('[data-sa="launch"]');
    await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  }
  while ((Date.now() - t0) / 1000 < SECONDS) {
    if (AGES && steps % 60 === 0) {
      await ev(() => {
        const g = window.__app?.session?.game;
        if (!g?.cradle) return;
        g.player.lore += 350;
        g.player.embers += 350;
        // (Now and then the order to advance is given for the random player, who seldom finds the button.)
        if (Math.random() < 0.5) g.cmdAdvance(g.playerId);
      });
    }
    const screen = await ev(() => window.__app?.screen);
    if (screen === 'game') await gameStep();
    else if (screen === 'loading') await wait(200);
    else await domStep();
    steps++;
    await wait(30 + rand() * 80);
    // A dialog nobody can leave is a bug: Escape must close it within a few presses (or it moves on).
    const m = await ev(() => (window.__app?.screen === 'game' ? window.__app.session.modal?.kind ?? '' : ''));
    if (m && m === lastModal) {
      if (!stuckSince) stuckSince = Date.now();
      else if (Date.now() - stuckSince > 20000) {
        for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
        await wait(200);
        const still = await ev(() => window.__app.session.modal?.kind ?? '');
        if (still === m && m !== 'draft' && m !== 'ability' && m !== 'destinies' && m !== 'ascend') {
          errors.push(`stuck in the ${m} dialog`);
          break;
        }
        stuckSince = 0;
      }
    } else stuckSince = 0;
    lastModal = m;
    if (errors.length) break;
  }
} catch (e) {
  errors.push('[script] ' + e.message);
}
await page.screenshot({ path: '.shots/uifuzz-end.png' }).catch(() => {});
console.log(`${steps} random actions in ${Math.round((Date.now() - t0) / 1000)}s`);
if (AGES) console.log('ended ' + (await ev(() => {
  const g = window.__app?.session?.game;
  return g ? (g.cradle ? `on the cradle, age ${g.player.era}` : g.config.mode === 'ages' ? 'among the stars' : 'in a classic run') + ` at ${(g.time / 60).toFixed(1)}m` : `on the ${window.__app?.screen} screen`;
}).catch(() => '?')));
if (errors.length) {
  console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
  console.log('last actions: ' + log.join(' · '));
} else console.log('no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
