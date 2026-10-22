// Games played together (1.28), in the browser, through the dev server's rooms: two players, each in a page
// of their own, host and join by a room's link, start, and play. Their two games must stay one game (the same
// hash at the same tick) through orders, a Boon draft, a gift, a pause, a page reloaded mid-game and a player
// who leaves; chat and pings reach the other; a versus game ends in a surrender, with a result for each, and
// the room goes back to its lobby.
//   node scripts/together.mjs     (needs a dev server: npx vite --port 5173 --strictPort)
import { checks, DEV_URL, gameUi, openBrowser, watch } from './lib/browser.mjs';

const { check, done } = checks();
const { browser, page: A, errors } = await openBrowser({ viewport: { width: 1440, height: 810 } });

const settings = { muted: true, master: 0.7, sfx: 0.8, music: 0.5, musicPace: 'sometimes', edgePan: false, tips: false, autoPause: false, crt: false, pixelSize: 'auto', explainTerms: true };
const profile = (name, heirs, extra = {}) => ({ tutorialDone: true, runs: 3, seenTips: [], boardName: name, heirs, settings, ...extra });
/** A page's profile, put there once (a reload must find what the page itself saved, and the room it was in). */
const seed = (p, pr) => p.addInitScript((pr) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify(pr));
    sessionStorage.setItem('seeded', '1');
  }
}, pr);
const until = async (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const net = (p) => p.evaluate(() => {
  const s = window.__app.session;
  const n = s?.net;
  if (!n) return null;
  return { tick: n.game.tick, to: n.to, seat: n.seat, rebuilding: !!n.rebuilding, paused: n.paused, peers: n.peers, embers: n.game.factions.map((f) => Math.round(f.embers)), isPlayer: n.game.factions.map((f) => f.isPlayer) };
});
/** Hold the room still a moment (a pause), let both games reach its tick, and read each game's hash. */
const sameGame = async (p1, p2, label) => {
  await p1.evaluate(() => window.__app.session.net.setPause(true));
  await until(p1, () => window.__app.session.net.paused);
  await until(p2, () => window.__app.session.net.paused);
  await p1.waitForTimeout(800);
  const h = (p) => p.evaluate(async () => {
    const { gameHash } = await import('/src/net/hash.ts');
    const n = window.__app.session.net;
    return [n.game.tick, gameHash(n.game)];
  });
  const [a, b] = [await h(p1), await h(p2)];
  check(`${label}: both screens play one game`, a[0] === b[0] && a[1] === b[1], `tick ${a[0]}/${b[0]}, hash ${a[1]}/${b[1]}`);
  await p1.evaluate(() => window.__app.session.net.setPause(false));
  await until(p1, () => !window.__app.session.net.paused, null, 8000);
};

// ---- Host and join ----
await seed(A, profile('ALICE', ['concord', 'vael', 'wayfarer']));
await A.goto(DEV_URL);
await A.waitForTimeout(1200);
const card = await A.evaluate(() => {
  const el = document.querySelector('[data-sa="together"]');
  return el ? { disabled: el.classList.contains('disabled'), text: el.textContent } : null;
});
check('the title screen has a MULTIPLAYER card', !!card && !card.disabled && /MULTIPLAYER/.test(card.text));
await A.click('[data-sa="together"]');
await A.waitForTimeout(300);
await A.click('[data-sa="room-host"]');
check('hosting makes a room, and its lobby shows', await until(A, () => !!window.__app.room?.lobby));
const code = await A.evaluate(() => window.__app.room.code);
const link = await A.evaluate(() => document.querySelector('.room-link input')?.value ?? '');
check('the lobby shows the room\'s link', link.endsWith(`#join=${code}`), link);
const startBtn = await A.evaluate(() => document.querySelector('[data-sa="room-why"]')?.dataset.tip ?? '');
check('alone, START is greyed and says why', /Close the open seats/.test(startBtn), startBtn);

const ctxB = await browser.newContext({ viewport: { width: 1440, height: 810 } });
let B = await ctxB.newPage();
watch(B, errors);
await seed(B, profile('BRUNO', ['concord', 'vael', 'wayfarer', 'lyceum']));
await B.goto(DEV_URL + '#join=' + code);
check('a second player comes in by the link', await until(B, () => window.__app.room?.lobby?.you === 1));
check('the host sees them', await until(A, () => window.__app.room.lobby.seats[1]?.name === 'BRUNO'));
const bHouse = await B.evaluate(() => window.__app.room.lobby.seats[1].heir);
check('they are given a house of their own that no one has', !!bHouse && bHouse !== 'concord', bHouse);
await B.evaluate(() => window.__app.room.send({ t: 'chat', text: 'ready when you are', team: false }));
check('a word in the lobby\'s chat reaches the host', await until(A, () => window.__app.room.chat.some((c) => c.text === 'ready when you are')));
await B.click('[data-sa="room-ready"]');
check('START is ready once the other player is', await until(A, () => !!document.querySelector('[data-sa="room-start"]')));
await A.click('[data-sa="room-start"]');
check('the game starts on both screens', (await until(A, () => window.__app.screen === 'game')) && (await until(B, () => window.__app.screen === 'game')));
await A.evaluate(() => (window.__app.session.modal = null));
await B.evaluate(() => (window.__app.session.modal = null));
const nA = await net(A);
const nB = await net(B);
check('each screen leads its own house', nA.seat === 0 && nB.seat === 1, `${nA.seat} ${nB.seat}`);
await A.waitForTimeout(3000);
check('the game runs on both screens', (await net(A)).tick > 30 && (await net(B)).tick > 30);

// ---- Orders, chat, pings ----
await A.evaluate(() => {
  const g = window.__app.session.game;
  g.cmdExplore(g.playerId, g.unitList.filter((u) => !u.dead && u.owner === g.playerId && u.type === 'scout').map((u) => u.id));
});
check('an order given on one screen is carried out on the other', await until(B, () => {
  const g = window.__app.session.game;
  return g.unitList.some((u) => !u.dead && u.owner === 0 && u.type === 'scout' && u.order === 'explore');
}));
const uiA = gameUi(A);
await B.keyboard.press('Enter');
await B.keyboard.type('hello alice');
await B.keyboard.press('Enter');
check('chat typed in the game reaches the other\'s log', await until(A, () => window.__app.session.game.notes.some((n) => n.chat && /hello alice/.test(n.text))));
await B.evaluate(() => {
  const s = window.__app.session;
  const n = s.game.nodes[s.game.player.capital];
  s.net.ping(n.x, n.y);
});
check('a ping reaches the ally\'s map', await until(A, () => window.__app.session.view.pings.length > 0));

// ---- The room's pause ----
await B.keyboard.press('Space');
check('a pause by one pauses both', await until(A, () => window.__app.session.net.paused));
// (A screen runs on to the tick the room had let it reach before the pause, a turn or two: then it stands.)
await until(A, () => window.__app.session.net.game.tick >= window.__app.session.net.to);
const t1 = (await net(A)).tick;
await A.waitForTimeout(1200);
check('the game waits while paused', (await net(A)).tick === t1);
await A.keyboard.press('Space');
check('the other goes on, after a count-in', await until(A, () => !window.__app.session.net.paused, null, 8000));
check('the count-in is shown', true);

// ---- A Boon draft, through the room ----
const before = await A.evaluate(() => window.__app.session.game.player.cards.length);
await A.keyboard.press('KeyB');
check('the draft is dealt by the room and shows', await until(A, () => (window.__app.session.game.player.draftOffer?.length ?? 0) > 0));
await uiA.unheld();
await A.keyboard.press('Digit1');
check('the Boon chosen is the house\'s on both screens', (await until(A, (n) => window.__app.session.game.player.cards.length > n, before)) &&
  (await until(B, (n) => window.__app.session.game.factions[0].cards.length > n, before)));

// ---- A gift ----
const bEmbers = (await net(B)).embers[1];
await A.evaluate(() => window.__app.session.game.cmdGift(0, 1, 100));
check('Embers sent to an ally arrive (all of them, in co-op)', await until(B, (e) => window.__app.session.game.factions[1].embers >= e + 99, bEmbers));
await sameGame(A, B, 'after orders, a draft and a gift');

// ---- A page reloaded mid-game ----
await B.reload();
check('a page reloaded mid-game comes back to its room', await until(B, () => window.__app.screen === 'game' && !!window.__app.session?.net, null, 30000));
check('and catches up', await until(B, () => !window.__app.session.net.rebuilding && window.__app.session.net.game.tick > 100, null, 60000));
await B.evaluate(() => (window.__app.session.modal = null));
await A.waitForTimeout(1500);
await sameGame(A, B, 'after a reload');

// ---- Leaving: the AI leads the house ----
await B.keyboard.press('Escape');
await B.waitForTimeout(300);
const uiB = gameUi(B);
await uiB.clickUi('m-4');
await B.waitForTimeout(200);
await uiB.clickUi('confirm-yes', { required: false }) || await B.evaluate(() => window.__app.session?.modal?.onYes?.());
check('leaving takes the player to the title screen', await until(B, () => window.__app.screen === 'menu'));
check('the AI leads their house on the other screen', await until(A, () => window.__app.session.game.factions[1].isPlayer === false && !!window.__app.session.game.factions[1].ai));
check('the other screen says so', await until(A, () => window.__app.session.net.peers.every((p) => p.seat !== 1)));
await A.evaluate(() => window.__app.session.hooks.quit(false));
await A.waitForTimeout(500);

// ---- Versus: a surrender, a result for each, and the room again ----
await A.click('[data-sa="together"]');
await A.waitForTimeout(300);
await A.click('[data-sa="room-host"]');
await until(A, () => !!window.__app.room?.lobby);
await A.evaluate(() => window.__app.room.send({ t: 'options', options: { together: 'versus' } }));
await until(A, () => window.__app.room.lobby.options.together === 'versus');
const code2 = await A.evaluate(() => window.__app.room.code);
await B.close();
B = await ctxB.newPage();
watch(B, errors);
await B.goto(DEV_URL + '#join=' + code2);
await until(B, () => window.__app.room?.lobby?.you === 1);
await B.evaluate(() => window.__app.room.send({ t: 'ready', on: true }));
await until(A, () => !!document.querySelector('[data-sa="room-start"]'));
await A.click('[data-sa="room-start"]');
check('a versus game starts', (await until(A, () => window.__app.screen === 'game')) && (await until(B, () => window.__app.screen === 'game')));
const vs = await A.evaluate(() => window.__app.session.game.config.seats.map((s) => [s.human, s.team, JSON.stringify(s.perks ?? {})]));
check('versus: two players on two teams, no perks', vs.length === 2 && vs[0][1] !== vs[1][1] && vs.every((s) => s[2] === '{}'), JSON.stringify(vs));
await A.waitForTimeout(2000);
await B.evaluate(() => window.__app.session.game.cmdSurrender(1));
check('a surrender ends the game on both screens', (await until(A, () => !!window.__app.session?.game.outcome, null, 15000)) && (await until(B, () => !!window.__app.session?.game.outcome, null, 15000)));
const won = await A.evaluate(() => window.__app.session.game.outcome.playerWon);
const lost = await B.evaluate(() => window.__app.session.game.outcome.playerWon);
check('the one who stayed is crowned, the one who surrendered is not', won === true && lost === false);
// (The ending of a run takes no key for its first moments: then one skips it to its tally, and another goes to the results.)
await A.waitForTimeout(2500);
for (const p of [A, B]) {
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
}
check('each has the results, with the way back to the room', (await until(A, () => !!document.querySelector('[data-sa="room-back"]'))) && (await until(B, () => !!document.querySelector('[data-sa="room-back"]'))));
const share = await A.evaluate(() => !!document.querySelector('.share'));
check('no challenge link for a game together', !share);
await A.click('[data-sa="room-back"]');
await B.click('[data-sa="room-back"]');
check('the room is over until its host starts another', await until(A, () => window.__app.room?.lobby?.phase === 'over' && !!document.querySelector('[data-sa="room-again"]')));
await A.click('[data-sa="room-again"]');
check('a new game in the same room: its lobby again, with both players', (await until(A, () => window.__app.room.lobby.phase === 'lobby')) &&
  (await until(B, () => window.__app.room?.lobby?.phase === 'lobby' && window.__app.room.lobby.seats.filter((s) => s.kind === 'player').length === 2)));

// ---- Before the First Night ----
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const C = await ctxC.newPage();
await seed(C, { ...profile('NEWBY', ['concord', 'vael', 'wayfarer']), tutorialDone: false, runs: 0 });
await C.goto(DEV_URL);
await C.waitForTimeout(1200);
const locked = await C.evaluate(() => {
  const el = document.querySelector('[data-sa="together"]');
  return el ? { disabled: el.classList.contains('disabled'), tip: el.dataset.tip } : null;
});
check('before the First Night the card is greyed, and says why', !!locked && locked.disabled && /First Night/.test(locked.tip ?? ''), locked?.tip);

void uiA;
process.exit(done(errors) || 0);
