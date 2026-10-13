// Pictures of the Starfall itself, for looking at how it reads on the map: in a fleet and alone, not armed
// and armed, the player's and a rival's, from close, from the usual height and from far out; and on its cards.
//   node scripts/starfall-look.mjs     (needs a dev server: npx vite --port 5173 --strictPort)
// The pictures go to .shots/starfall-look-*.png.
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 } });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/starfall-look-${name}.png` });
  console.log('shot', name);
};

await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  tutorialDone: true, runs: 6, settings: { autoPause: false, tips: false },
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
})));
await page.goto(DEV_URL);
await wait(1500);
await page.click('[data-sa="setup"]');
await ev(() => (window.__app.setup.seed = '20261012'));
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await wait(600);

// A fleet of every kind of ship at a quiet star, the Starfall among them; a rival's fleet with one of its own beside it.
const scene = await ev(() => {
  const a = window.__app;
  const s = a.session;
  const g = s.game;
  const p = g.player;
  s.modal = null;
  s.paused = true;
  for (const f of g.factions) f.ai = null;
  for (let i = 0; i < g.nodes.length; i++) p.explored[i] = 1;
  s.view.reveal = true;
  for (const id of ['bpStarfall', 'bpCarrier', 'bpLancer', 'bpDread']) g.addCard(p, id);
  p.bays = 10;
  const star = g.nodes.find((n) => n.kind === 'star' && !g.systems[n.system].home);
  for (const u of [...g.buckets[star.id]]) g.killUnit(u, -1);
  const rival = g.empires().find((f) => f.id !== p.id);
  const put = (type, owner, dx, dy) => {
    const u = g.spawnUnit(type, owner, star.id, { x: star.x + dx, y: star.y + dy });
    u.a = u.pa = owner === p.id ? 0 : Math.PI;
    u.ax = u.x;
    u.ay = u.y;
    return u;
  };
  // (Nobody fires: the picture is of ships standing, not of a battle.)
  const mine = put('starfall', p.id, -230, 30);
  [['ark', -330, -60], ['dreadnought', -320, 110], ['carrier', -150, 130], ['breaker', -120, -70], ['guardian', -200, -110], ['striker', -260, -150], ['lancer', -90, 60], ['scout', -160, -20]]
    .forEach(([t, dx, dy]) => put(t, p.id, dx, dy));
  const theirs = put('starfall', rival.id, 240, 20);
  [['ark', 340, -70], ['breaker', 150, -80], ['guardian', 200, 120], ['striker', 290, 130], ['striker', 120, 70]].forEach(([t, dx, dy]) => put(t, rival.id, dx, dy));
  g.step = () => {};
  a.renderer.cam.focus(star.x, star.y, 0.5);
  return { star: star.id, mine: mine.id, theirs: theirs.id, rival: rival.id };
});
await wait(700);
await shot('1-close');
await ev((sc) => window.__app.renderer.cam.focus(window.__app.session.game.nodes[sc.star].x, window.__app.session.game.nodes[sc.star].y, 0.25), scene);
await wait(500);
await shot('2-usual');
// Armed, both of them: the rings, the hearts, the motes.
await ev((sc) => {
  const a = window.__app;
  const g = a.session.game;
  g.units.get(sc.mine).fuse = 95;
  g.units.get(sc.theirs).fuse = 31;
  a.renderer.cam.focus(g.nodes[sc.star].x, g.nodes[sc.star].y, 0.5);
}, scene);
await wait(600);
await shot('3-armed-close');
await wait(430);
await shot('4-armed-close-later');
await ev((sc) => window.__app.renderer.cam.focus(window.__app.session.game.nodes[sc.star].x, window.__app.session.game.nodes[sc.star].y, 0.25), scene);
await wait(500);
await shot('5-armed-usual');
await ev((sc) => window.__app.renderer.cam.focus(window.__app.session.game.nodes[sc.star].x, window.__app.session.game.nodes[sc.star].y, 0.12), scene);
await wait(500);
await shot('6-armed-far');
await ev((sc) => window.__app.renderer.cam.focus(window.__app.session.game.nodes[sc.star].x, window.__app.session.game.nodes[sc.star].y, 0.05), scene);
await wait(500);
await shot('7-armed-dots');
// Its card (the player's fleet with it), and the Boon's card in a draft.
await ev((sc) => {
  const a = window.__app;
  const g = a.session.game;
  a.renderer.cam.focus(g.nodes[sc.star].x, g.nodes[sc.star].y, 0.3);
  delete g.units.get(sc.mine).fuse;
  a.session.selectUnits(g.buckets[sc.star].filter((u) => u.owner === g.playerId).map((u) => u.id), false, false);
}, scene);
await wait(500);
await shot('8-fleet-card');
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.cards = p.cards.filter((id) => id !== 'bpStarfall');
  p.pendingDrafts = 1;
  p.draftOffer = ['hardHulls', 'bpStarfall', 'emberTithe'];
  a.session.clearSelection();
  a.hud.modals.open({ kind: 'draft' });
});
await wait(1600);
await shot('9-boon-card');
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
