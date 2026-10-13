// The Starfall in the browser: the build button at the Hearth, ARM on the device's card, the clocks, a
// star that erupts and burns, an order that leads through the fire, and a rival's Starfall at home.
//   node scripts/starfall.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
// Screenshots go to .shots/starfall-*.png.
import { checks, DEV_URL, gameUi, openBrowser } from './lib/browser.mjs';

const url = process.argv[2] ?? DEV_URL;
const { browser, page, errors } = await openBrowser({ viewport: { width: 1440, height: 810 } });
const { wait, ev, clickUi, uiRect } = gameUi(page);
const { check, done } = checks();
const shot = (name) => page.screenshot({ path: `.shots/starfall-${name}.png` });
/** Let game time pass at once (the page's own clock stands still meanwhile). */
const pass = (seconds) =>
  ev((s) => {
    const g = window.__app.session.game;
    for (let i = 0; i < s * 20 && !g.outcome; i++) {
      g.step();
      g.fx.length = 0;
    }
  }, seconds);
const tipOf = (id) => ev((rid) => window.__app.hud.ui.regions.find((r) => r.id === rid)?.tip ?? window.__app.hud.ui.lastHints?.find((h) => h.id === rid)?.tip ?? null, id);
const toast = () => ev(() => window.__app.session.toast?.text ?? '');

let code = 1;
try {
  await page.goto(url);
  await wait(1200);
  await ev(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
    tutorialDone: true, runs: 3, settings: { autoPause: false, tips: true },
    seenTips: ['role', 'raid', 'anomaly', 'anomalySeen', 'fleet', 'hangar', 'boonReady', 'blueprint', 'arkLevel', 'lostWorld', 'crisis', 'converted'],
  })));
  await page.reload();
  await wait(2000);
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="size:medium"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(800);
  await ev(() => (window.__app.session.modal = null));
  // Nobody else gives orders: the scenes are staged.
  await ev(() => {
    const a = window.__app;
    const g = a.session.game;
    for (const f of g.factions) if (!f.isPlayer) f.ai = null;
    g.player.embers = 9000;
    a.session.paused = true;
  });

  // ---- 1. The button: not there without the Blueprint, there with it.
  await ev(() => window.__app.session.selectNode(window.__app.session.game.player.capital));
  await wait(300);
  check('without its Blueprint the Hearth offers no Starfall', !(await uiRect('starfall')));
  await ev(() => window.__app.session.game.addCard(window.__app.session.game.player, 'bpStarfall'));
  await wait(300);
  check('with it, STARFALL is on the Hearth\'s card', !!(await uiRect('starfall')));
  await shot('1-hearth');
  await clickUi('starfall');
  check('a click queues one', await ev(() => window.__app.session.game.nodes[window.__app.session.game.player.capital].shipQ.some((q) => q.id === 'starfall')));
  check('and takes its price', (await ev(() => window.__app.session.game.player.embers)) === 9000 - 2500);
  await pass(70);
  const dev = await ev(() => window.__app.session.game.starfallOf(window.__app.session.game.playerId)?.id ?? -1);
  check('a minute later it is built, at the Hearth', dev >= 0 && (await ev(() => window.__app.session.game.starfallOf(window.__app.session.game.playerId).node === window.__app.session.game.player.capital)));
  await wait(300);
  check('the button stays, greyed, and says why', /One Starfall at a time/.test((await tipOf('starfall')) ?? ''), await tipOf('starfall'));

  // ---- 2. Its card: ARM is there, greyed away from a star.
  await ev((id) => window.__app.session.selectUnits([id], false, false), dev);
  await wait(300);
  check('ARM is on its card', !!(await uiRect('arm')));
  check('greyed at a world: only at a star', /Only at a star/.test((await tipOf('arm')) ?? ''), await tipOf('arm'));
  await shot('2-device');
  await clickUi('arm');
  check('a click there arms nothing', await ev(() => window.__app.session.game.armedStarfalls().length === 0));

  // ---- 3. At a star: armed, with a clock over the star and one at the top right.
  const star = await ev(() => {
    const a = window.__app;
    const g = a.session.game;
    const d = g.starfallOf(g.playerId);
    // (A quiet star of another system, with something of a rival's to burn.)
    const rival = g.empires().find((f) => f.id !== g.playerId);
    const s = g.starOf(g.nodes[rival.capital]);
    g.buckets[d.node].splice(g.buckets[d.node].indexOf(d), 1);
    d.node = s.id;
    d.x = d.ax = s.x + 120;
    d.y = d.ay = s.y;
    g.buckets[s.id].push(d);
    for (const f of [g.player]) for (let i = 0; i < g.nodes.length; i++) f.explored[i] = 1;
    a.session.focusNode(s.id);
    g.spawnUnit('guardian', rival.id, rival.capital);
    return { id: s.id, name: s.name, rival: rival.id, hearth: rival.capital };
  });
  await ev((id) => window.__app.session.selectUnits([id], false, false), dev);
  await wait(400);
  check('at a star ARM can be pressed', !/Can't arm/.test((await tipOf('arm')) ?? ''), await tipOf('arm'));
  await clickUi('arm');
  check('armed', await ev(() => window.__app.session.game.armedStarfalls().length === 1));
  await ev(() => (window.__app.session.paused = false));
  await wait(900);
  await ev(() => (window.__app.session.paused = true));
  check('a clock at the top right counts it down', !!(await uiRect(`clock-starfall-${dev}`)));
  check('its card says ARMED', /ARMED/.test(JSON.stringify(await ev(() => window.__app.hud.ui.regions.filter((r) => r.id === 'arm').map((r) => r.label ?? '')))) || /Already armed/.test((await tipOf('arm')) ?? ''));
  await shot('3-armed');
  // The rival's Hearth says what is coming.
  await ev((id) => window.__app.session.selectNode(id), star.hearth);
  await wait(400);
  await shot('4-doomed-world');

  // ---- 4. The eruption, and the star that burns.
  await ev(() => (window.__app.session.paused = false));
  await pass(118);
  await wait(2600);
  await shot('5-eruption');
  await ev(() => (window.__app.session.paused = true));
  const after = await ev((s) => {
    const g = window.__app.session.game;
    const n = g.nodes[s.hearth];
    return { burns: !!g.nodes[s.id].hazard && g.nodes[s.id].hazard.by === g.playerId, owner: n.owner, sh: n.sh, maxSh: n.maxSh, glow: n.glow, alive: g.factions[s.rival].alive, ships: g.unitList.filter((u) => !u.dead && u.owner === s.rival && u.node >= 0 && g.nodes[u.node].system === n.system).length };
  }, star);
  check('the star burns', after.burns);
  check('the rival\'s Hearth is scorched, and its own still', after.owner === star.rival && after.sh < after.maxSh * 0.1 && after.glow < 0.3 && after.alive, JSON.stringify(after));
  check('no ship of the rival\'s is left in the system', after.ships === 0, String(after.ships));
  await wait(600);
  await shot('6-burning');
  await ev((id) => window.__app.session.selectNode(id), star.id);
  await wait(400);
  await shot('7-star-card');

  // ---- 5. An order that leads through the fire: the ships wait; the same order again sends them through.
  const fleet = await ev((s) => {
    const a = window.__app;
    const g = a.session.game;
    const from = g.nodes[s.id].lanes.find((id) => g.nodes[id].system !== g.nodes[s.id].system);
    const u = g.spawnUnit('dreadnought', g.playerId, from);
    a.session.selectUnits([u.id], false, false);
    return { id: u.id, from };
  }, star);
  await wait(300);
  await ev(([s]) => window.__app.hud.actions.orderAt(s.hearth), [star]);
  await wait(200);
  check('the first order says that they will wait', /wait in front of it/.test(await toast()), await toast());
  check('and they are not sent through', await ev((id) => !window.__app.session.game.units.get(id).fire, fleet.id));
  await ev(() => (window.__app.session.paused = false));
  await pass(20);
  await wait(300);
  await ev(() => (window.__app.session.paused = true));
  check('they wait where they are', await ev((f) => window.__app.session.game.units.get(f.id).node === f.from, fleet));
  await wait(300);
  await shot('8-waiting');
  // (Too late to count as the same order: it asks again.)
  await wait(6200);
  await ev(([s]) => window.__app.hud.actions.orderAt(s.hearth), [star]);
  await wait(100);
  check('after a while the order asks again', await ev((id) => !window.__app.session.game.units.get(id).fire, fleet.id));
  await ev(([s]) => window.__app.hud.actions.orderAt(s.hearth), [star]);
  await wait(200);
  check('the same order again sends them through', await ev((id) => window.__app.session.game.units.get(id).fire === true, fleet.id), await toast());
  await ev(([s]) => window.__app.hud.actions.orderAt(s.hearth), [star]);
  await wait(200);
  check('and a third time changes nothing', await ev((id) => window.__app.session.game.units.get(id).fire === true, fleet.id), await toast());

  // ---- 6. A rival's Starfall at the player's own star: the alarm, the tip, the cards.
  const home = await ev((s) => {
    const a = window.__app;
    const g = a.session.game;
    const hs = g.starOf(g.nodes[g.player.capital]);
    const d = g.spawnUnit('starfall', s.rival, hs.id);
    g.factions[s.rival].alive = true;
    g.cmdArm(s.rival, d.id);
    a.session.selectNode(g.player.capital);
    a.session.focusNode(g.player.capital);
    a.session.paused = false;
    return { star: hs.id, name: hs.name, dev: d.id };
  }, star);
  await wait(1500);
  check('the log tells the player', await ev(() => window.__app.session.game.notes.some((n) => / armed a Starfall at /.test(n.text) && n.kind === 'alert')));
  check('a tip explains it the first time', await ev(() => window.__app.hud.tips.current?.id === 'starfall' || window.__app.session.profile.seenTips.includes('starfall')));
  await shot('9-alarm');
  await ev(() => window.__app.hud.tips.dismiss?.());
  await wait(300);
  check('the rival\'s clock is at the top right', !!(await uiRect(`clock-starfall-${home.dev}`)));
  await shot('10-home');
  code = done(errors);
} catch (e) {
  console.log('FAIL  ' + (e.stack ?? e));
  await shot('error').catch(() => {});
} finally {
  await browser.close();
}
process.exit(code);
