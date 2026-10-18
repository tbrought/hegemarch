// The Daily board in the game (1.25), against a board that answers as the real one does (worker/): a
// crowned Daily posted under three letters, sent, checked and placed; letters that will not do; a board
// that cannot be reached; a Daily that was lost (the button there, greyed, with why); and a classic run,
// which has no board. And the game opened from the website's throne (play/#daily).
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
  if (url.pathname.endsWith('/status')) return json(++asked < 2 ? { status: 'pending' } : { status: 'verified', time: 1234, rank: 2, of: 5 });
  return json({ error: 'Nothing here.' }, 404);
});

const ev = (fn, arg) => page.evaluate(fn, arg);
await page.goto(DEV_URL);
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await page.waitForTimeout(800);

/** A run of this mode, ended as it ends: crowned (or not), and its results shown. */
async function ended(mode, won) {
  await ev(() => window.__app.showMenu());
  await page.waitForTimeout(200);
  await page.click(`.mode[data-sa="${mode}"]`);
  await page.waitForTimeout(200);
  if (mode === 'daily') {
    const lead = await page.textContent('.lead');
    check('the Daily says its rules are the same for everyone, and that it has a board', /same rules/.test(lead) && /no perks from the Hall/.test(lead) && /board/.test(lead), lead);
  }
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app.screen === 'game', null, { timeout: 60000 });
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
  await page.waitForTimeout(400);
}

// A crowned Daily.
await ended('daily', true);
const state = () => page.textContent('.board-state');
check('a crowned Daily has the board on its results', (await page.$('.board-box')) !== null);
check('with its button ready', (await page.textContent('[data-sa="board-post"]')) === 'POST TO THE BOARD' && !(await page.$eval('[data-sa="board-post"]', (b) => b.classList.contains('disabled'))));
await page.fill('#board-name', '');
await page.type('#board-name', 'a1b');
check('the letters are A to Z, as they are typed', (await page.inputValue('#board-name')) === 'AB', await page.inputValue('#board-name'));
await page.click('[data-sa="board-post"]');
check('two letters will not do, and it says why', /Three letters/.test(await state()) && sent.length === 0, await state());
// The board out of reach: it says so, and the button is there to try again.
down = true;
await page.fill('#board-name', '');
await page.type('#board-name', 'xyz');
await page.click('[data-sa="board-post"]');
await page.waitForTimeout(600);
check('a board out of reach is said, and can be tried again', /could not be reached/.test(await state()) && (await page.textContent('[data-sa="board-post"]')) === 'POST TO THE BOARD', await state());
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

// A Daily that was lost: the button is there, greyed, with why.
await ended('daily', false);
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
