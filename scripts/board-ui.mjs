// The Daily board in the game (1.25), against a board that answers as the real one does (worker/): a
// crowned Daily goes by the throne (1.25.3: the day's board as an arcade's table, its letters typed there,
// three to five) on its way to its results; posted there, or from its results; letters that will not do;
// a board that cannot be reached; a Daily that was lost (no throne; the button there, greyed, with why);
// and a classic run, which has no board. And the game opened from the website's throne (play/#daily).
//   node scripts/board-ui.mjs     (npm run test:board-ui; needs a dev server)
import zlib from 'node:zlib';
import { checks, DEV_URL, openBrowser } from './lib/browser.mjs';

// (A board out of reach is one of the cases: the browser's word for it is not an error of the game's.)
const { browser, page, errors } = await openBrowser({ viewport: { width: 1400, height: 900 }, ignore: /fonts\.g|ERR_INTERNET_DISCONNECTED/ });
const { check, done } = checks();
await page.context().addInitScript(() => {
  localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 6, settings: { autoPause: false, tips: false } }));
});

// The board: it takes a run, says it is being checked, then where it stands.
const sent = [];
let asked = 0;
let down = false;
await page.route('https://hegemarch.com/api/daily/**', async (route) => {
  const url = new URL(route.request().url());
  if (down) return route.abort('internetdisconnected');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (url.pathname.endsWith('/submit')) {
    sent.push(JSON.parse(route.request().postData()));
    return json({ id: '0123456789abcdef', status: 'pending' }, 202);
  }
  if (url.pathname.endsWith('/board')) return json({ day: url.searchParams.get('day'), runs: [{ name: 'ZED', heir: 'vael', time: 2210, victory: 'conquest' }], count: 1 });
  // (The first run sent is placed second; any after it is the fastest of the day.)
  if (url.pathname.endsWith('/status')) return json(++asked < 2 ? { status: 'pending' } : sent.length > 1 ? { status: 'verified', time: 2, rank: 1, of: 6 } : { status: 'verified', time: 1234, rank: 2, of: 5 });
  return json({ error: 'Nothing here.' }, 404);
});

const ev = (fn, arg) => page.evaluate(fn, arg);
await page.goto(DEV_URL);
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await page.waitForTimeout(800);

/** A run of this mode, ended as it ends: crowned (or not), and its results shown. */
async function ended(mode, won) {
  let shownSeed = null;
  await ev(() => window.__app.showMenu());
  await page.waitForTimeout(200);
  await page.click(`.mode[data-sa="${mode}"]`);
  await page.waitForTimeout(200);
  if (mode === 'daily') {
    const lead = await page.textContent('.lead');
    check('the Daily says its rules are the same for everyone, and that it has a board', /same rules/.test(lead) && /board/.test(lead), lead);
    // (Its settings are the setup's own panel, set: the day's lit, the rest greyed, today's seed, and its rules.)
    shownSeed = await ev(() => {
      const opts = document.querySelector('.opts');
      return {
        lit: [...opts.querySelectorAll('button.active')].map((b) => b.textContent),
        greyed: opts.querySelectorAll('button.disabled').length,
        seed: opts.querySelector('input.fixed')?.value,
        rules: [...opts.querySelectorAll('.rule, .purse')].map((b) => b.textContent),
      };
    });
    const set = shownSeed;
    check("the Daily's settings are the setup's panel, set: MEDIUM and NORMAL lit, the rest greyed", set.lit.join() === 'MEDIUM,NORMAL' && set.greyed === 6, JSON.stringify(set));
    check('its rules there, and its Legacy in its purse', set.rules.join() === 'EVERY BOON,NO PERKS,LEGACY ×1.25', JSON.stringify(set));
  }
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app.screen === 'game', null, { timeout: 60000 });
  if (mode === 'daily') {
    const seed = await ev(() => window.__app.session.game.config.seed);
    check('the seed the Daily shows is the one it is played on', String(seed) === shownSeed.seed, `${shownSeed.seed} / ${seed}`);
  }
  await page.waitForTimeout(600);
  await ev((won) => {
    const app = window.__app;
    app.hud.modals.close();
    const g = app.session.game;
    // (A few orders, as a player gives them, for the board to play again.)
    const ship = g.unitList.find((u) => u.owner === g.playerId && u.type !== 'seed');
    if (ship) g.cmdStop(g.playerId, [ship.id]);
    for (let i = 0; i < 40; i++) g.step();
    g.declareWinner(won ? g.playerId : 1, 'conquest', 'The test says so.');
  }, won);
  await page.waitForFunction(() => window.__app.results !== null && window.__app.session?.game.outcomeHandled, null, { timeout: 10000 });
  await ev(() => window.__app.showResults());
  await page.waitForTimeout(600);
}

// A crowned Daily: the throne first, its row already in its place, waiting for letters.
await ended('daily', true);
const throne = () => ev(() => ({ screen: window.__app.screen, head: document.querySelector('.throne-head')?.textContent, rows: [...document.querySelectorAll('.throne-table tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()) }));
let t = await throne();
check('a crowned Daily goes by the throne, its row first on the day\'s board', t.screen === 'throne' && t.head === 'YOU WOULD TAKE THE THRONE' && /^1st/.test(t.rows[0] ?? '') && /YOU/.test(t.rows[0] ?? '') && /ZED/.test(t.rows[1] ?? ''), JSON.stringify(t));
await page.keyboard.type('a1bcdeX');
const slots = () => page.$$eval('.throne-entry .slot', (els) => els.map((e) => e.textContent).join(''));
check('letters as an arcade takes them: A to Z, five at most', (await slots()) === 'ABCDX', await slots());
await page.keyboard.press('ArrowUp');
check('rolled: the letter under the cursor goes on one', (await slots()) === 'ABCDY', await slots());
for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
check('erased back to two, and the post button greyed with why', (await slots()) === 'AB···' && (await page.$eval('[data-sa="throne-post"]', (b) => b.classList.contains('disabled'))), await slots());
await page.click('[data-sa="throne-skip"]');
await page.waitForTimeout(300);
check('NOT TODAY: to the results, where it can still be posted', (await ev(() => window.__app.screen)) === 'results' && (await page.$('.board-box')) !== null);
const state = () => page.textContent('.board-state');
check('a crowned Daily has the board on its results', (await page.$('.board-box')) !== null);
check('with its button ready', (await page.textContent('[data-sa="board-post"]')) === 'POST TO THE BOARD' && !(await page.$eval('[data-sa="board-post"]', (b) => b.classList.contains('disabled'))));
await page.fill('#board-name', '');
await page.type('#board-name', 'a1b');
check('the letters are A to Z, as they are typed', (await page.inputValue('#board-name')) === 'AB', await page.inputValue('#board-name'));
check('the box shows what it takes', (await page.getAttribute('#board-name', 'placeholder')) === 'ABC' && (await page.getAttribute('#board-name', 'maxlength')) === '5');
await page.click('[data-sa="board-post"]');
check('two letters will not do, and it says why', /Three to five letters/.test(await state()) && sent.length === 0, await state());
// The board out of reach: it says so, and the button is there to try again.
down = true;
await page.fill('#board-name', '');
await page.type('#board-name', 'xyz');
await page.click('[data-sa="board-post"]');
await page.waitForTimeout(600);
check('a board out of reach is said (not in the browser\'s words), and can be tried again', /^The board could not be reached\. Try again/.test(await state()) && (await page.textContent('[data-sa="board-post"]')) === 'POST TO THE BOARD', await state());
down = false;
await page.click('[data-sa="board-post"]');
await page.waitForTimeout(800);
check('sent: it is being checked', /playing your run again/.test(await state()) && (await page.textContent('[data-sa="board-post"]')) === 'BEING CHECKED', await state());
const e = sent[0] ?? {};
const today = await ev(async () => (await import('/src/meta/profile.ts')).todayKey());
const version = await ev(async () => (await import('/src/app/env.ts')).GAME_VERSION);
let orders = null;
try {
  orders = JSON.parse(zlib.gunzipSync(Buffer.from(e.orders, 'base64')).toString('utf8'));
} catch {
  /* checked below */
}
check('what was sent: today, the house, this version, the letters, the crown', e.day === today && e.heir && e.version === version && e.name === 'XYZ' && e.victory === 'conquest' && e.time > 0, JSON.stringify({ ...e, orders: undefined }));
check('and the orders, gzipped, as the run kept them', e.enc === 'gzip' && Array.isArray(orders) && orders.some((o) => o[1] === 'cmdStop'), JSON.stringify(orders?.slice(0, 3)));
check('the letters are remembered for next time', (await ev(() => window.__app.profile.boardName)) === 'XYZ');
await page.waitForFunction(() => /On the board/.test(document.querySelector('.board-state')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
check('checked: its place on the day\'s board', new RegExp(`On the board: 2nd of 5 on ${today}`).test(await state()) && (await page.textContent('[data-sa="board-post"]')) === 'ON THE BOARD', await state());
check('and it cannot be sent twice', await page.$eval('[data-sa="board-post"]', (b) => b.classList.contains('disabled')) && (await page.isDisabled('#board-name')));
await page.screenshot({ path: '.shots/board-results.png' });

// Another crowned Daily, posted from the throne: its letters stamped, the run sent, the results after; the fastest of the day, so said.
await ended('daily', true);
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.type('acers');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('posted from the throne: the letters stamped, the run sent under them', (await page.$$('.throne-entry .slot.stamped')).length === 5 && sent.length === 2 && sent[1].name === 'ACERS', JSON.stringify(sent.map((x) => x.name)));
await page.waitForFunction(() => window.__app.screen === 'results', null, { timeout: 8000 }).catch(() => {});
check('and on to the results, where it is followed', (await ev(() => window.__app.screen)) === 'results' && (await page.$eval('[data-sa="board-post"]', (b) => b.classList.contains('disabled'))));
await page.waitForFunction(() => /front page/.test(document.querySelector('.board-state')?.textContent ?? ''), null, { timeout: 40000 }).catch(() => {});
check("the fastest of the day: today's Hegemarch, in gold", /YOU ARE TODAY'S HEGEMARCH/.test(await page.textContent('.board-box h3')) && (await page.$('.board-box.crowned')) !== null, await page.textContent('.board-box h3'));
await page.screenshot({ path: '.shots/board-results-crowned.png' });

// A Daily that was lost: no throne; on its results, the button is there, greyed, with why.
await ended('daily', false);
check('a lost Daily does not go by the throne', (await ev(() => window.__app.screen)) === 'results');
check('a lost Daily has the board too, greyed, with why', /Only a crown goes on the board/.test(await page.textContent('.board-box')) &&
  (await page.$eval('[data-sa="board-post"]', (b) => b.classList.contains('disabled'))) && (await page.isDisabled('#board-name')));
await page.screenshot({ path: '.shots/board-results-lost.png' });
const before = sent.length;
await page.click('[data-sa="board-post"]', { force: true });
await page.waitForTimeout(300);
check('and sends nothing', sent.length === before);

// A classic run has no board.
await ended('setup', true);
check('a classic run has no board', (await page.$('.board-box')) === null);

// Opened from the website's throne (1.25.2): play/#daily is today's Daily, ready to play; a first visit, the
// title screen (where the First Night is offered).
// (A new address, not a new hash alone: the page is loaded again.)
await page.goto(DEV_URL + '?from=site#daily');
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await page.waitForTimeout(500);
const opened = await ev(() => ({ screen: window.__app.screen, daily: window.__app.setup.daily, hash: location.hash }));
check("#daily opens today's Daily, ready to play, and leaves the address as it was", opened.screen === 'setup' && opened.daily === true && opened.hash === '', JSON.stringify(opened));
const fresh = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const first = await fresh.newPage();
await first.goto(DEV_URL + '#daily');
await first.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await first.waitForTimeout(500);
const met = await first.evaluate(() => ({ screen: window.__app.screen, hash: location.hash }));
check('a first visit by #daily is shown the title screen, and the First Night', met.screen === 'menu' && met.hash === '' && (await first.$('[data-sa="first-night"]')) !== null, JSON.stringify(met));
await fresh.close();

const code = done(errors);
await browser.close();
process.exit(code);
