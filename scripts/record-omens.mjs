// A film and stills of the omens over the sector coming in at the start of a run, their stars lighting
// in the sky above them, and the Ambition last (modals/cards.ts).
//   node scripts/record-omens.mjs     (npm run record:omens; needs a dev server: npx vite --port 5173 --strictPort)
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/omens';
const { browser, page, errors } = await filmRun();
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
await ev(() => {
  const g = window.__app.session.game;
  // (Two omens with gains and losses in them, and an Ambition that names the Ark.)
  g.traits = ['golden', 'ion'];
  g.ambition = 'ironWill';
});
const since = () => ev(() => window.__app.hud.modals.ui.time - window.__app.hud.modals.omAt);
const until = async (s) => {
  for (let i = 0; i < 600 && (await since()) < s; i++) await wait(10);
};
const settle = async () => {
  for (let i = 0; i < 200 && (await ev(() => window.__app.hud.modals.revealing())); i++) await wait(50);
};

await startFilm(page);
await wait(600);
await ev(() => (window.__app.session.modal = { kind: 'omens', unbidden: true }));
await wait(80);
await until(0.6);
await shot('1-first');
await until(1.8);
await shot('2-ambition');
await settle();
await wait(2000);
await shot('3-all');
await ev(() => window.__app.hud.modals.close());
await wait(600);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
