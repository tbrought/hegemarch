// A film and stills of two small moments of the HUD, filmed close (twice the size): a Boon becoming
// ready in the top bar, and a first goal reached, its Embers flying to the count (hud/touches.ts, Goals.ts).
//   node scripts/record-touches.mjs     (npm run record:touches; needs a dev server: npx vite --port 5173 --strictPort)
import { endFilm, filmRun, lookAt, startFilm } from './lib/film.mjs';

const out = '.shots/touches';
const { browser, page, errors } = await filmRun();
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
await ev(() => {
  const s = window.__app.session;
  // (The first goals on show, as for a new player; the game stays paused, so no tip card comes up.)
  s.profile.settings.tips = true;
  s.profile.goalsDone = [];
  const p = s.game.player;
  p.pendingDrafts = 0;
  p.draftOffer = null;
  p.lore = 0;
});
const W = await ev(() => window.__app.session.screen.W);

await startFilm(page, { zoom: 2 });
await lookAt(page, 0, 0, true);
await wait(700);
// The Lore bar fills, and a Boon is ready.
for (let i = 0; i <= 12; i++) {
  await ev((k) => {
    const g = window.__app.session.game;
    g.player.lore = g.boonCostOf(g.player) * (0.55 + k * 0.035);
  }, i);
  await wait(90);
}
// (As the game does when the Lore is full: systems/economy.ts.)
await ev(() => {
  const g = window.__app.session.game;
  const p = g.player;
  p.lore = 0;
  p.pendingDrafts = 1;
  g.notify(p.id, 'Your Lore is full: a Boon is ready! (B)', 'good');
});
await wait(120);
await shot('1-boon');
await wait(1500);
// A goal reached: the view goes to its box, and follows its Embers home.
await lookAt(page, W / 2, 0);
await wait(900);
await ev(() => (window.__app.session.game.ui.roleSet = 1));
for (let i = 0; i < 60 && !(await ev(() => window.__app.hud.embersAway > 0)); i++) await wait(20);
await wait(150);
await shot('2-goal');
await wait(350);
await lookAt(page, 0, 0);
await wait(250);
await shot('3-flying');
await wait(1400);
await shot('4-landed');
await lookAt(page, W / 2, 0);
await wait(1600);
await shot('5-next');
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
