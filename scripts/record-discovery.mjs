// A film and stills of a new player discovering Boons (game/data/boonKeys.ts): their first choice from
// the starting deck, then one of their worlds attacked (NEW BOONS DISCOVERED across the screen), the next
// Boon choice holding one of them (DISCOVERED on its card), and the Boons screen with what is left to find.
//   node scripts/record-discovery.mjs     (npm run record:discovery; needs a dev server)
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/discovery';
const { browser, page, errors } = await filmRun('20261013', { runs: 0, boonKeys: [] });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
const settle = async () => {
  for (let i = 0; i < 100 && (await ev(() => window.__app.hud.modals.revealing() || window.__app.hud.modals.guarded())); i++) await wait(50);
};
const onPage = (id) =>
  ev((rid) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf(rid);
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);

await startFilm(page);
await wait(500);
// The first choice: the starting deck.
await ev(() => window.__app.hud.modals.open({ kind: 'draft' }));
await settle();
await wait(1500);
await shot('1-first-choice');
await page.keyboard.press('Digit1');
await wait(900);
// The game runs; a rival's raiders reach the Hearth.
await ev(() => (window.__app.session.paused = false));
await wait(2200);
await ev(() => {
  const g = window.__app.session.game;
  const rival = g.empires().find((f) => f.id !== g.playerId);
  g.damagePlanet(g.nodes[g.player.capital], 20, 'siege', rival.id);
});
await wait(2000);
await shot('2-discovered');
await wait(2400);
// The next choice holds one of them.
await ev(() => {
  const a = window.__app;
  a.session.paused = true;
  a.session.game.player.pendingDrafts = 1;
  a.session.game.player.draftOffer = null;
  a.hud.modals.open({ kind: 'draft' });
});
await settle();
await wait(600);
const i = await ev(() => window.__app.session.game.player.draftOffer.findIndex((id) => ['bulwark', 'batteries', 'militia', 'fortressHearth', 'anchors', 'bpStarbase', 'scorchedEarth'].includes(id)));
const tag = await onPage(`card-tag-${i}`);
if (tag) await page.mouse.move(tag.x, tag.y, { steps: 10 });
await wait(1800);
await shot('3-next-choice');
await page.keyboard.press(`Digit${i + 1}`);
await wait(900);
// The Boons screen: what is found, and what is left.
await page.mouse.move(640, 700);
await ev(() => window.__app.hud.modals.open({ kind: 'status', tab: 'boons' }));
await wait(2500);
await shot('4-boons-screen');
await ev(() => window.__app.hud.modals.close());
await wait(500);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
