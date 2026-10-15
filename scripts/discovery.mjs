// Boons a player discovers (game/data/boonKeys.ts), played as a new player would: the starting deck, a
// world attacked (a key turns: the herald, the profile keeps it), the next Boon choice holding one of the
// Boons it opened (tagged DISCOVERED), the Boons screen, a new run that remembers, and a player from before
// discovery who is dealt everything as ever.
//   node scripts/discovery.mjs     (npm run test:discovery; needs a dev server)
import fs from 'node:fs';
import { checks, DEV_URL, gameUi, openBrowser } from './lib/browser.mjs';

const src = fs.readFileSync('src/game/data/boonKeys.ts', 'utf8');
/** Every Boon a key opens (the rest are the starting deck), and the Boons of a world attacked. */
const KEYED = [...src.matchAll(/cards: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]));
const ATTACKED = [...src.match(/id: 'attacked'[\s\S]*?cards: \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);

const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 } });
const { wait, ev, clickUi, unheld } = gameUi(page);
const { check, done } = checks();
const shot = (name) => page.screenshot({ path: `.shots/discovery-${name}.png` });
const profile = () => ev(() => JSON.parse(localStorage.getItem('hegemarch.profile.v1')));
const launch = async () => {
  await page.goto(DEV_URL);
  await wait(1500);
  await page.click('[data-sa="setup"]');
  if (await page.$('[data-sa="guided"].active')) await page.click('[data-sa="guided"]');
  await page.click('[data-sa="size:small"]');
  await page.click('[data-sa="launch"]');
  await wait(300);
  if (await page.$('.dialog [data-sa="confirm-new"]')) await page.click('.dialog [data-sa="confirm-new"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(600);
  if (await ev(() => window.__app.session.modal?.kind === 'omens')) await clickUi('omens-begin');
  await wait(200);
};

// ---- A new player.
await page.goto(DEV_URL);
await page.evaluate(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  v: 1, tutorialDone: true, runs: 0, boonKeys: [],
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
  settings: { autoPause: false, tips: false },
})));
await launch();
check('a new player\'s run is told they have found no key yet', JSON.stringify(await ev(() => window.__app.session.game.config.boonKeys)) === '[]');
const firstOffer = await ev(() => {
  const g = window.__app.session.game;
  return g.ensureOffer(g.player);
});
check('their first Boon choice is from the starting deck', firstOffer.length >= 3 && firstOffer.every((id) => !KEYED.includes(id)), firstOffer.join(', '));
await ev(() => window.__app.hud.modals.open({ kind: 'status', tab: 'boons' }));
await wait(400);
await shot('1-boons-screen');
await ev(() => window.__app.hud.modals.close());
// A key that holds from the start (Solar Concord begins with Guardians) opens quietly, and is kept.
await ev(() => (window.__app.session.paused = false));
await wait(2500);
check('a key that holds from the start opens quietly, and is kept', (await profile()).boonKeys.includes('guardian') && (await ev(() => window.__app.hud.heralds.length === 0)), JSON.stringify((await profile()).boonKeys));

// ---- One of their worlds is attacked.
await ev(() => {
  const g = window.__app.session.game;
  const rival = g.empires().find((f) => f.id !== g.playerId);
  g.damagePlanet(g.nodes[g.player.capital], 20, 'siege', rival.id);
});
await wait(1600);
const told = await ev(() => ({ h: window.__app.hud.heralds[0]?.h ?? null, w: window.__app.hud.heraldRect.w, log: window.__app.hud.log.some((l) => /New Boons discovered/.test(l.text)) }));
check('a world attacked: NEW BOONS DISCOVERED across the screen, and in the log', told.h?.title === 'NEW BOONS DISCOVERED' && /^For when your worlds are attacked: /.test(told.h.sub) && told.w > 0 && told.log, JSON.stringify(told));
await shot('2-herald');
check('the player keeps it, for good', (await profile()).boonKeys.includes('attacked'));
// The next Boon choice holds one of them, and says so.
await wait(2500);
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.pendingDrafts = Math.max(1, p.pendingDrafts) + (p.draftOffer ? 1 : 0);
  if (p.draftOffer) a.session.game.cmdChooseCard(p.id, p.draftOffer[0]);
  a.hud.modals.open({ kind: 'draft' });
});
await unheld();
await wait(300);
const offer = await ev(() => window.__app.session.game.player.draftOffer);
const i = offer.findIndex((id) => ATTACKED.includes(id));
check('the next Boon choice holds one of the Boons just discovered', i >= 0, offer.join(', '));
const tag = await ev((k) => {
  const h = window.__app.hud.ui.lastHints.find((x) => x.key === 'card-tag-' + k);
  return h ? (typeof h.tip === 'function' ? h.tip() : h.tip) : null;
}, i);
check('it is tagged as discovered, and says what for', /^You discovered .* in this run: for when your worlds are attacked/.test(tag ?? ''), tag);
await shot('3-draft');
await page.keyboard.press(`Digit${i + 1}`);
await wait(300);
check('and can be taken', await ev((id) => window.__app.session.game.player.cards.includes(id), offer[i]));

// ---- A new run remembers what was found.
await launch();
const cfg = await ev(() => window.__app.session.game.config.boonKeys);
check('a new run is told what the player has found', Array.isArray(cfg) && cfg.includes('attacked') && cfg.includes('guardian') && !cfg.includes('hangar'), JSON.stringify(cfg));
check('and deals it from the start', await ev((ids) => {
  const g = window.__app.session.game;
  return ids.every((id) => g.cardPool(g.player).some((c) => c.id === id));
}, ATTACKED.filter((id) => id !== 'scorchedEarth')));

// ---- A player from before discovery is dealt every Boon, as ever.
await page.evaluate(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ v: 1, tutorialDone: true, runs: 4, settings: { autoPause: false, tips: false } })));
await launch();
check('a player from before discovery has found everything: the run is told nothing, and deals every Boon', (await ev(() => window.__app.session.game.config.boonKeys)) === undefined && (await profile()).boonKeys?.length === 9);
await browser.close();
process.exit(done(errors));
