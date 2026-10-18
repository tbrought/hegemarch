// An Ages run end to end through real mouse and keyboard input: from the menu to the cradle, up the
// ages, across to the stars, and back from a save. Screenshots land in .shots/agesrun-*.png.
//   node scripts/ages.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
const wait = (ms) => page.waitForTimeout(ms);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
const ev = (fn, arg) => page.evaluate(fn, arg);
/** The cards of a Boon draft take a moment to come in: a key before then brings them all and takes none. */
const dealt = async () => {
  for (let i = 0; i < 40 && (await ev(() => window.__app.hud?.modals.revealing())); i++) await wait(100);
};
const shot = (name) => page.screenshot({ path: `.shots/agesrun-${name}.png` });
const toPage = (ix, iy) =>
  ev(([x, y]) => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return [r.left + ((x + 0.5) * r.width) / c.width, r.top + ((y + 0.5) * r.height) / c.height];
  }, [ix, iy]);
const uiRect = (id) => ev((rid) => window.__app.hud?.ui.rectOf(rid) ?? null, id);
const clickUi = async (id) => {
  let r = await uiRect(id);
  for (let i = 0; i < 12 && !r; i++) {
    await wait(100);
    r = await uiRect(id);
  }
  if (!r) throw new Error('no UI region ' + id);
  // (A dialog that has just opened by itself takes no click for a moment (`Modals.guarded`): wait it out, as a player would.
  // This suite clicked the Ark's card 0.9 s after it opened, and one run in five the click was lost.)
  for (let i = 0; i < 60 && (await ev(() => window.__app.hud?.modals.guarded() || window.__app.hud?.ui.holding() || window.__app.hud?.modals.revealing())); i++) await wait(100);
  const [x, y] = await toPage(r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(x, y);
  await wait(140);
};
/** The tooltip a region would show: its title and text, in the words on screen. */
const hover = (id) =>
  ev((rid) => {
    const hud = window.__app.hud;
    const r = hud.ui.rectOf(rid);
    if (!r) return '';
    return hud.words(`${r.tipTitle ?? ''} ${typeof r.tip === 'function' ? r.tip() : (r.tip ?? '')}`);
  }, id);
const skip = (seconds) =>
  ev((secs) => {
    const g = window.__app.session.game;
    g.fxEnabled = false;
    for (let i = 0; i < secs * 20 && !g.outcome && !g.ascended; i++) g.step();
    g.fx.length = 0;
    g.fxEnabled = true;
  }, seconds);
const state = () =>
  ev(() => {
    const s = window.__app.session;
    const g = s.game;
    const p = g.player;
    return {
      cradle: g.cradle, stage: g.config.stage, mode: g.config.mode, era: p.era, lore: p.lore, embers: p.embers, drafts: p.pendingDrafts, cards: [...p.cards],
      advance: p.advance ? p.advance.t / p.advance.total : -1, modal: s.modal?.kind ?? '', ascended: g.ascended, time: g.time, houses: g.empires().length,
      units: g.unitsOf(p.id).map((u) => `${u.type}:${u.era}`),
    };
  });

try {
  await page.goto(url);
  await wait(1500);
  await ev(() => {
    localStorage.clear();
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 3, wins: 1, legacy: 100, totalLegacy: 200, seenTips: [] }));
  });
  await page.reload();
  await wait(2500);

  // ---- From the menu to the cradle ----
  check('the menu offers an Ages run', (await page.$('[data-sa="ages"]')) !== null);
  await page.click('[data-sa="ages"]');
  await wait(300);
  check('its setup says what it is, and has no First Night guide', (await page.textContent('.mode-tabs .active')) === 'AGES RUN' && (await page.$('[data-sa="guided"]')) === null && /Stone Age/.test(await page.textContent('.lead')));
  await page.click('[data-sa="size:small"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(1200);
  let st = await state();
  check('the run begins on the cradle, in the Stone Age', st.cradle && st.mode === 'ages' && st.era === 0 && st.houses === 3, JSON.stringify({ era: st.era, houses: st.houses }));
  check('a card explains the cradle, and the game waits behind it', st.modal === 'cradle' && (await ev(() => window.__app.session.halted)));
  await shot('1-card');
  await clickUi('cradle-begin');
  st = await state();
  check('BEGIN closes it', st.modal === '');
  check('the cradle has music of its own', await ev(() => window.__app.music.playing === 'cradle' && ['First Fires', 'Long Road'].includes(window.__app.music.title)), await ev(() => `${window.__app.music.playing}: ${window.__app.music.title}`));
  check('there is no Ark yet, and no siege unit', st.units.every((u) => /^(striker|guardian|scout):0$/.test(u)), st.units.join(','));
  await ev(() => (window.__app.session.profile.settings.autoPause = false));

  // ---- The first Boon is one of the cradle's ----
  await page.keyboard.press('KeyB');
  await wait(900);
  check('B opens the Boon of the age', (await state()).modal === 'draft');
  await dealt();
  await page.keyboard.press('Digit1');
  await wait(900);
  st = await state();
  check('the Boon chosen is a Boon of the cradle', st.drafts === 0 && st.cards.length === 1 && (await ev((id) => window.__app.session.game.cardPool(window.__app.session.game.player).length > 0 && id.length > 0, st.cards[0])), st.cards.join(','));

  // ---- The HUD speaks the cradle's words ----
  await ev(() => {
    const s = window.__app.session;
    s.selectNode(s.game.player.capital);
  });
  await wait(300);
  check('the Hearth card offers the units of the age', !!(await uiRect('build-striker')) && !!(await uiRect('build-guardian')) && !(await uiRect('build-breaker')));
  const tip = await hover('build-striker');
  check('a Striker is a Hunter here', /Hunter/.test(tip) && !/Striker/.test(tip), tip.slice(0, 80));
  const before = (await state()).embers;
  await clickUi('build-striker');
  check('a click raises one', (await state()).embers < before && (await ev(() => window.__app.session.game.nodes[window.__app.session.game.player.capital].shipQ.length === 1)));
  check('the corner shows the climb, not the Destinies', !!(await uiRect('ages')) && !(await uiRect('dest-conquest')));
  const ageTip = await hover('age');
  check('the top bar shows the Lore of the age', /Stone Age/.test(ageTip) && /Lore/.test(ageTip), ageTip.slice(0, 90));

  // ---- Climbing ----
  check('no order to advance before the Lore is gathered', !(await uiRect('advance')));
  await page.keyboard.press('KeyA');
  await wait(200);
  check('A is refused, with the reason', (await state()).advance < 0 && /Lore/.test(await ev(() => window.__app.session.toast?.text ?? '')));
  await ev(() => {
    const p = window.__app.session.game.player;
    p.lore = 230;
    p.embers = 60;
  });
  await wait(300);
  check('with the Lore gathered the order appears (and says what it lacks)', !!(await uiRect('advance')) && /Not enough Embers/.test(await hover('advance')));
  await ev(() => (window.__app.session.game.player.embers = 900));
  await wait(300);
  await shot('2-ready');
  await clickUi('advance');
  st = await state();
  check('the order spends Lore and Embers and starts the work', st.advance >= 0 && st.lore < 60 && st.embers < 720, JSON.stringify({ lore: Math.round(st.lore), embers: Math.round(st.embers) }));
  await skip(40);
  await wait(400);
  st = await state();
  check('the Bronze Age begins, with a Boon', st.era === 1 && st.drafts === 1, JSON.stringify({ era: st.era, drafts: st.drafts }));
  await page.keyboard.press('KeyB');
  await wait(900);
  await dealt();
  await page.keyboard.press('Digit2');
  await wait(900);
  await ev(() => {
    const s = window.__app.session;
    s.modal = null;
    s.selectNode(s.game.player.capital);
  });
  await wait(300);
  check('siege units come with bronze', !!(await uiRect('build-breaker')) && /Ram/.test(await hover('build-breaker')));
  await skip(45);
  check('the new age has upgraded every unit the house had', (await state()).units.filter((u) => u.endsWith(':0')).length === 0, (await state()).units.join(','));
  await page.keyboard.press('KeyU');
  await wait(400);
  check('the status screen shows the climb', (await state()).modal === 'status' && !!(await uiRect('tab-destinies')));
  await shot('3-status');
  await page.keyboard.press('Escape');
  await wait(200);

  // ---- Saved on the cradle, and back ----
  await ev(() => window.__app.session.hooks.quit(true));
  await wait(600);
  check('a saved Ages run can be continued', (await page.$('[data-sa="continue"]')) !== null);
  await page.click('[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 30000 });
  await wait(600);
  st = await state();
  check('it comes back on the cradle, in its age, with its Boons', st.cradle && st.era === 1 && st.cards.length === 2, JSON.stringify({ era: st.era, cards: st.cards.length }));
  await ev(() => {
    const s = window.__app.session;
    s.paused = false;
    s.modal = null;
    s.profile.settings.autoPause = false;
  });

  // ---- The Ark ----
  await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    p.era = 4;
    g.recomputeMods(p);
    p.lore = 1200;
    p.embers = 3000;
    // One rival's Ark left four minutes ago; another is still climbing.
    const rivals = g.empires().filter((f) => !f.isPlayer && f.alive);
    g.time = Math.max(g.time, 400);
    const gone = rivals[0];
    gone.launchedAt = g.time - 240;
    gone.alive = false;
    for (const n of g.nodes) if (n.owner === gone.id) n.owner = -1;
    for (const u of g.unitsOf(gone.id)) u.dead = true;
  });
  await wait(400);
  check('the last step is the Ark', /Build your Ark/.test(await hover('advance')), (await hover('advance')).slice(0, 60));
  await clickUi('advance');
  await skip(170);
  await wait(600);
  st = await state();
  check('when it is done, a card says what goes with it', st.ascended && st.modal === 'ascend');
  await shot('4-ark');
  await page.keyboard.press('Escape');
  await wait(300);
  check('the card cannot be put aside', (await state()).modal === 'ascend');
  await clickUi('ascend-go');
  await page.waitForFunction(() => window.__app?.screen === 'game' && window.__app.session?.game.config.stage === 'stars', null, { timeout: 90000 });
  await wait(1200);

  // ---- Among the stars ----
  st = await state();
  const stars = await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    return {
      arrival: g.config.ages.arrival, time: g.time, ark: g.units.get(p.ark)?.type, eras: [...new Set(g.unitList.map((u) => u.era))], victories: g.victories.length,
      rivals: g.empires().filter((f) => !f.isPlayer).map((f) => ({ asleep: g.asleep(f.id), worlds: g.worldsOf(f.id).length, built: f.stats.shipsBuilt })),
      saved: JSON.parse(localStorage.getItem('hegemarch.run.v1') ?? 'null')?.config?.stage,
    };
  });
  check('among the stars the music is the music of the stars', await ev(() => ['night', 'war'].includes(window.__app.music.playing) && !['First Fires', 'Long Road'].includes(window.__app.music.title)), await ev(() => `${window.__app.music.playing}: ${window.__app.music.title}`));
  check('the run goes on among the stars', !st.cradle && st.stage === 'stars' && st.era === 5 && stars.ark === 'ark' && stars.eras.join() === '5', JSON.stringify({ stage: st.stage, era: st.era }));
  check('the Boons of the ages came along, and Lore makes Boons again', st.cards.length >= 2 && st.drafts === 1, JSON.stringify({ cards: st.cards.length, drafts: st.drafts }));
  check('the rival that left earlier has been playing; the other is still on its way', stars.arrival > 200 && stars.rivals.some((r) => !r.asleep && r.worlds >= 1) && stars.rivals.some((r) => r.asleep), JSON.stringify(stars));
  check('the omens of the sector are shown on arrival', st.modal === 'omens' && stars.victories === 3);
  check('the run was saved on arrival', stars.saved === 'stars');
  await shot('5-stars');
  // (A click while the omens are still coming in brings them all and takes nothing, as a player's would:
  // BEGIN is clicked until the card has gone.)
  for (let i = 0; i < 4 && (await ev(() => window.__app.session.modal?.kind)) === 'omens'; i++) await clickUi('omens-begin', { required: false });
  check('the omens are put away', (await ev(() => window.__app.session.modal?.kind ?? null)) !== 'omens');
  check('the HUD is the HUD of the stars', !!(await uiRect('dest-conquest')) && !(await uiRect('ages')) && !(await uiRect('age')));
  await ev(() => {
    const s = window.__app.session;
    s.selectNode(s.game.player.capital);
  });
  await wait(300);
  const starTip = await hover('build-striker');
  check('and a Striker is a Striker again', /Striker/.test(starTip) && !/Hunter/.test(starTip), starTip.slice(0, 60));
  // (U opens the Status screen. A key pressed in the moment something else has the game's attention, a
  // herald coming in, is not lost on a player, who presses it again: the script does as a player would.)
  for (let i = 0; i < 4 && (await ev(() => window.__app.session.modal?.kind)) !== 'status'; i++) {
    if (i) console.log(`  (U again: ${JSON.stringify(await ev(() => ({ modal: window.__app.session.modal?.kind ?? null, focus: document.activeElement?.tagName })))})`);
    await page.keyboard.press('KeyU');
    await wait(400);
  }
  await clickUi('tab-rivals');
  await wait(300);
  await shot('6-rivals');
  await page.keyboard.press('Escape');

  // ---- Back from a save among the stars ----
  await page.reload();
  await wait(2500);
  await page.click('[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 30000 });
  await wait(600);
  st = await state();
  check('a run saved among the stars comes back there', !st.cradle && st.stage === 'stars' && st.cards.length >= 2 && st.modal !== 'omens', JSON.stringify({ stage: st.stage, modal: st.modal }));

  // ---- A run that ends on the cradle ----
  await ev(() => window.__app.session.hooks.quit(false));
  await wait(500);
  await page.click('[data-sa="ages"]');
  await wait(300);
  await page.click('[data-sa="launch"]');
  await wait(400);
  if (await page.$('[data-sa="confirm-new"]')) await page.click('[data-sa="confirm-new"]');
  await page.waitForFunction(() => window.__app?.screen === 'game' && window.__app.session?.game.cradle, null, { timeout: 60000 });
  await wait(800);
  await ev(() => {
    const s = window.__app.session;
    s.modal = null;
    const g = s.game;
    g.eliminate(g.playerId, g.empires().find((f) => !f.isPlayer).id);
  });
  // (The ending is skipped: once to its tally, once more to the results.)
  await wait(1500);
  await page.keyboard.press('Enter');
  await wait(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__app?.screen === 'results', null, { timeout: 30000 });
  const res = await page.textContent('#ui');
  check('losing the Hearth on the cradle ends the run, told in the cradle\'s words', /DEFEAT/.test(res) && /Age reached/.test(res) && /Most lands held/.test(res) && !/Most worlds held/.test(res));
  await shot('7-results');

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  script error: ' + e.message);
  // (What the page itself said, if anything: a wait that runs out usually has its reason there.)
  if (errors.length) console.log('      page errors: ' + errors.slice(0, 3).join(' | ').slice(0, 1500));
  const where = await ev(() => {
    const a = window.__app;
    const g = a?.session?.game;
    return { screen: a?.screen, modal: a?.session?.modal?.kind ?? null, seed: g?.config.seed, stage: g?.config.stage, time: g ? Math.round(g.time) : null, outcome: g?.outcome ?? null, ascended: g?.ascended ?? null, paused: a?.session?.paused };
  }).catch((x) => 'the page does not answer: ' + x.message);
  console.log('      where it stood: ' + JSON.stringify(where));
  failures++;
  await shot('error');
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
