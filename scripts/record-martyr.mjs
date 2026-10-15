// A film and stills of Martyr Cores as the player meets it, and of the news in its colours (a playtest of
// 1.23): the player is the Lyceum Collective (violet); a rival's Striker swarm with Martyr Cores dies
// against the player's fleet at their Hearth (MARTYR over the blasts, the Hearth hurt, the player told),
// a rival's news in the log (in a colour no house wears, the rival's name in its own), and the Rivals tab.
//   node scripts/record-martyr.mjs     (npm run record:martyr; needs a dev server)
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/martyr';
const { browser, page, errors } = await filmRun('20261013', {
  heirs: ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'],
  lastSetup: { heir: 'lyceum', size: 'small', difficulty: 1 },
  settings: { autoPause: false, tips: true, muted: false, master: 0.8, sfx: 0.8, music: 0.4 },
});
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
const rival = await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  const r = g.empires().find((f) => f.id !== g.playerId);
  for (const f of g.factions) f.ai = null;
  g.addCard(r, 'martyr');
  const home = g.player.capital;
  for (let i = 0; i < 2; i++) g.spawnUnit('dreadnought', g.playerId, home);
  for (let i = 0; i < 8; i++) g.spawnUnit('guardian', g.playerId, home);
  a.session.focusNode(home, 0.5);
  return r.id;
});

await startFilm(page);
await wait(800);
// The swarm arrives at the Hearth.
await ev((rid) => {
  const a = window.__app;
  const g = a.session.game;
  for (let i = 0; i < 30; i++) g.spawnUnit('striker', rid, g.player.capital);
  a.session.paused = false;
}, rival);
await wait(2500);
await shot('1-blasts');
await wait(3000);
await shot('2-told');
await wait(3500);
// A rival's news: in a colour no house wears, the rival's name in its own.
await ev((rid) => {
  const g = window.__app.session.game;
  const r = g.factions[rid];
  g.notify(-1, `${r.name} has claimed the drifting derelict dreadnought at ${g.nodes[r.capital].name}.`, 'event', r.capital);
}, rival);
await wait(1500);
await shot('3-news');
// The Rivals tab: who has Martyr Cores, and every rival's Boons under the pointer.
await ev(() => {
  const a = window.__app;
  a.session.paused = true;
  a.hud.tips.dismiss();
  a.hud.modals.open({ kind: 'status', tab: 'rivals' });
});
await wait(500);
const row = await ev((rid) => {
  const a = window.__app;
  const h = a.hud.ui.lastHints.find((x) => x.key === 'st-rival-' + rid);
  const c = a.canvas.getBoundingClientRect();
  const k = c.width / a.session.screen.W;
  return h && { x: c.left + (h.x + 30) * k, y: c.top + (h.y + 4) * k };
}, rival);
if (row) await page.mouse.move(row.x, row.y, { steps: 10 });
await wait(1600);
await shot('4-rivals');
await ev(() => window.__app.hud.modals.close());
await wait(400);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
