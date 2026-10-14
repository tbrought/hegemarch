// A film and stills of a ship rising a level and choosing an ability (modals/event.ts): the Ark rises
// from level 1 to 5 at once, so two choices come one after the other (levels 3 and 5).
//   node scripts/record-ability.mjs     (npm run record:ability; needs a dev server: npx vite --port 5173 --strictPort)
// The film is .shots/ability.mp4; the stills (.shots/ability-*.png): the rings closing, the flash, all
// of it there, and a choice under the pointer.
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/ability';
const { browser, page, errors } = await filmRun();
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
const since = () => ev(() => window.__app.hud.modals.ui.time - window.__app.hud.modals.abAt);
const until = async (s) => {
  for (let i = 0; i < 600 && (await since()) < s; i++) await wait(10);
};
const settle = async () => {
  for (let i = 0; i < 100 && (await ev(() => window.__app.hud.modals.revealing())); i++) await wait(50);
};
const rectOf = (id) =>
  ev((rid) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf(rid);
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);

await startFilm(page);
await wait(500);
// The Ark rises to level 5: its first choice opens by itself.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  const ark = g.units.get(g.player.ark);
  g.grantLevels(ark, 5 - ark.level);
  a.session.focusNode(ark.node, 0.25);
  a.hud.modals.open({ kind: 'ability', unitId: ark.id, unbidden: true });
});
await wait(80);
await until(0.3);
await shot('1-powering');
await until(0.75);
await shot('2-flash');
await settle();
await wait(500);
await shot('3-all');
const p1 = await rectOf('ab-1');
await page.mouse.move(p1.x, p1.y, { steps: 8 });
await wait(900);
await shot('4-hover');
await page.mouse.click(p1.x, p1.y);
// The second choice comes in anew.
await wait(1300);
await settle();
await wait(1200);
const p0 = await rectOf('ab-0');
await page.mouse.move(p0.x, p0.y, { steps: 8 });
await wait(500);
await page.mouse.click(p0.x, p0.y);
await wait(800);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
