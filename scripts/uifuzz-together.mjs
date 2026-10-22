// Random play in a game together (1.28): two players in one room, each clicking, dragging, typing and pressing
// keys at random in their own page. Whatever the interface does, the two games must stay one game: an
// interface that changed the game by anything but an order would put the screens out of step. Every so often
// both games are held still and compared; at the end the room must never have had to put them back in step.
// Fails on any page error, on two games that differ, or on a screen put back in step.
// In versus (each player's pauses are few), the games are not held still: the room compares them as they run.
//   node scripts/uifuzz-together.mjs [seconds=150] [seed=1] [coop|versus]     (needs a dev server on port 5173)
import { DEV_URL, openBrowser, watch } from './lib/browser.mjs';
import fs from 'node:fs';

const SECONDS = Number(process.argv[2] ?? 150);
let seed = Number(process.argv[3] ?? 1);
const VERSUS = process.argv[4] === 'versus';
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
fs.mkdirSync('.shots', { recursive: true });

const settings = { muted: true, master: 0.7, sfx: 0.8, music: 0.5, musicPace: 'sometimes', edgePan: false, tips: true, autoPause: true, crt: false, pixelSize: 'auto', explainTerms: true };
const profile = (name) => ({ tutorialDone: true, runs: 3, seenTips: [], boardName: name, heirs: ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'], settings });
const seedProfile = (p, pr) => p.addInitScript((pr) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify(pr));
    sessionStorage.setItem('seeded', '1');
  }
}, pr);
const { browser, page: A, errors } = await openBrowser({ viewport: { width: 1280, height: 720 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const B = await ctxB.newPage();
watch(B, errors);
await seedProfile(A, profile('ALICE'));
await seedProfile(B, profile('BRUNO'));

const ev = (p, fn, arg) => p.evaluate(fn, arg);
const KEYS = ['Space', 'Escape', 'b', 'u', 'h', 'l', 'f', 'k', 'e', 'a', 's', 'r', 'c', 'm', 'd', 'q', 'w', 't', 'x', 'g', '1', '2', 'Equal', 'Minus', 'ArrowLeft', 'ArrowUp', 'Enter', 'Tab'];
const log = [];
const note = (s) => {
  log.push(s);
  if (log.length > 30) log.shift();
};

/** One random action in a page's game (never the yes of a dialog that would leave or surrender). */
async function act(p, who) {
  const r = rand();
  const box = await ev(p, () => {
    const c = document.getElementById('game').getBoundingClientRect();
    return { x: c.left, y: c.top, w: c.width, h: c.height, modal: window.__app.session?.modal?.kind ?? null };
  });
  // (Asked whether to leave: never yes. A real player may leave; this one stays to the end.)
  if (box.modal === 'confirm') {
    note(`${who} cancel`);
    await p.keyboard.press('Escape');
    return;
  }
  const px = () => box.x + rand() * box.w;
  const py = () => box.y + rand() * box.h;
  if (r < 0.4) {
    const target = await ev(p, (k) => {
      const app = window.__app;
      const regs = app.hud?.ui.regions.filter((x) => x.onClick && !x.disabled && x.id !== 'modal-back' && x.id !== 'cf-yes') ?? [];
      if (!regs.length) return null;
      const g = regs[Math.floor(k * regs.length)];
      const c = app.canvas.getBoundingClientRect();
      const s = c.width / app.session.screen.W;
      return { id: g.id, x: c.left + (g.x + g.w / 2) * s, y: c.top + (g.y + g.h / 2) * s };
    }, rand());
    if (target) {
      note(`${who} ui ${target.id}`);
      await p.mouse.click(target.x, target.y);
    }
  } else if (r < 0.6) {
    const button = pick(['left', 'left', 'right']);
    const alt = rand() < 0.1;
    note(`${who} click ${button}${alt ? ' alt' : ''}`);
    await p.mouse.click(px(), py(), { button, modifiers: alt ? ['Alt'] : [] });
  } else if (r < 0.68) {
    const button = pick(['left', 'right']);
    note(`${who} drag ${button}`);
    await p.mouse.move(px(), py());
    await p.mouse.down({ button });
    await p.mouse.move(px(), py(), { steps: 4 });
    await p.mouse.up({ button });
  } else if (r < 0.72) {
    note(`${who} wheel`);
    await p.mouse.move(px(), py());
    await p.mouse.wheel(0, rand() < 0.5 ? -240 : 240);
  } else {
    const k = pick(KEYS);
    note(`${who} key ${k}`);
    await p.keyboard.press(k);
    // (A chat opened: a few letters, then said or put away.)
    if (k === 'Enter' && (await ev(p, () => !!window.__app.hud?.chat))) {
      await p.keyboard.type('gl hf');
      await p.keyboard.press(rand() < 0.7 ? 'Enter' : 'Escape');
    }
  }
}

/** Hold the room still, let both games reach its tick, and compare them. */
async function compare(label) {
  if (VERSUS) {
    const r = (p) => ev(p, () => {
      const n = window.__app.session?.net;
      return n ? [n.game.tick, n.resyncs, n.game.config.together] : null;
    });
    const [a, b] = [await r(A), await r(B)];
    if (!a || !b) errors.push(`${label}: a page is not in the game`);
    else if (a[1] || b[1]) errors.push(`${label}: the room had to put the screens back in step (${a[1]}, ${b[1]})`);
    return a && b ? `${label}: ${a[2]}, tick ${a[0]}/${b[0]}, the room found the games in step` : label;
  }
  await ev(A, () => window.__app.session?.net?.setPause(true));
  await A.waitForFunction(() => window.__app.session?.net?.paused, null, { timeout: 8000 }).catch(() => {});
  await B.waitForFunction(() => window.__app.session?.net?.paused, null, { timeout: 8000 }).catch(() => {});
  await A.waitForTimeout(800);
  const h = (p) => ev(p, async () => {
    const { gameHash } = await import('/src/net/hash.ts');
    const n = window.__app.session?.net;
    return n ? [n.game.tick, gameHash(n.game), n.resyncs] : null;
  });
  const [a, b] = [await h(A), await h(B)];
  if (!a || !b) errors.push(`${label}: a page is not in the game (${JSON.stringify([a, b])})`);
  else if (a[0] === b[0] && a[1] !== b[1]) errors.push(`${label}: the two games differ at tick ${a[0]} (${a[1]} / ${b[1]})`);
  else if (a[2] || b[2]) errors.push(`${label}: the room had to put the screens back in step (${a[2]}, ${b[2]})`);
  await ev(A, () => window.__app.session?.net?.setPause(false));
  await A.waitForTimeout(300);
  return a && b ? `${label}: tick ${a[0]}/${b[0]}, ${a[0] === b[0] && a[1] === b[1] ? 'one game' : 'NOT one game'}` : label;
}

const t0 = Date.now();
let steps = 0;
let compared = 0;
try {
  await A.goto(DEV_URL);
  await A.waitForTimeout(1200);
  await A.click('[data-sa="together"]');
  await A.waitForTimeout(300);
  await A.click('[data-sa="room-host"]');
  await A.waitForFunction(() => !!window.__app.room?.lobby, null, { timeout: 15000 });
  await ev(A, (versus) => window.__app.room.send({ t: 'options', options: { speed: 3, ...(versus ? { together: 'versus' } : {}) } }), VERSUS);
  const code = await ev(A, () => window.__app.room.code);
  await B.goto(DEV_URL + '#join=' + code);
  await B.waitForFunction(() => window.__app.room?.lobby?.you === 1, null, { timeout: 15000 });
  await B.click('[data-sa="room-ready"]');
  await A.waitForFunction(() => !!document.querySelector('[data-sa="room-start"]'), null, { timeout: 15000 });
  await A.click('[data-sa="room-start"]');
  await A.waitForFunction(() => window.__app.screen === 'game', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__app.screen === 'game', null, { timeout: 30000 });
  while ((Date.now() - t0) / 1000 < SECONDS && !errors.length) {
    const b = rand() < 0.5;
    await act(b ? B : A, b ? 'B' : 'A');
    steps++;
    await A.waitForTimeout(20 + rand() * 60);
    for (const [p, w] of [[A, 'A'], [B, 'B']]) {
      const where = await ev(p, () => [window.__app.screen, !!window.__app.session?.net, window.__app.session?.net?.ended ?? null]);
      if (where[0] !== 'game' || !where[1]) errors.push(`${w} is no longer in the game: ${JSON.stringify(where)}`);
    }
    if (steps % 150 === 0) {
      console.log(await compare(`after ${steps} actions`));
      compared++;
    }
    const over = await ev(A, () => !!window.__app.session?.game.outcome);
    if (over) break;
  }
  console.log(await compare('at the end'));
  compared++;
} catch (e) {
  errors.push('[script] ' + e.message);
}
await A.screenshot({ path: '.shots/uifuzz-together-A.png' }).catch(() => {});
await B.screenshot({ path: '.shots/uifuzz-together-B.png' }).catch(() => {});
console.log(`${steps} random actions by two players in ${Math.round((Date.now() - t0) / 1000)}s, the two games compared ${compared} times`);
if (errors.length) {
  console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
  console.log('last actions: ' + log.join(' · '));
} else console.log('no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
