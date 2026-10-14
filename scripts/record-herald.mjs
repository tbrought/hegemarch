// A film and stills of the big moments of a run announced across the screen (hud/herald.ts): a rival
// house falls, your Last Stand, a rival's Starfall armed, a new age; then the pointer over one (it turns
// see-through) and two at once (the first is hurried along).
//   node scripts/record-herald.mjs     (npm run record:herald; needs a dev server: npx vite --port 5173 --strictPort)
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/herald';
const { browser, page, errors } = await filmRun();
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};

/** The game tells the player a big moment, as it does in a run. */
const tell = (text, kind, herald) =>
  ev(([t, k, h]) => {
    const g = window.__app.session.game;
    if (h.tone === 'house') h.fid = g.empires().find((f) => f.id !== g.playerId).id;
    g.notify(-1, t, k, g.player.capital, false, h);
  }, [text, kind, herald]);
/** Where the herald's band is on the page (its middle). */
const band = () =>
  ev(() => {
    const a = window.__app;
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return { x: c.left + c.width / 2, y: c.top + (Math.round(a.hud.H * 0.24) + 17) * k };
  });

const moments = [
  ['The Hearth of Vael Imperium has gone dark, taken by Solar Concord!', 'good', { title: 'VAEL IMPERIUM FALLS', sub: 'Its Hearth has gone dark, taken by you.', tone: 'house' }],
  ['LAST STAND! The defenders of Aurelia rise to arms.', 'alert', { title: 'LAST STAND', sub: 'The defenders of Aurelia rise to arms.', tone: 'red' }],
  ['Vael Imperium armed a Starfall at Electra!', 'alert', { title: 'STARFALL ARMED', sub: 'Vael Imperium armed one at Electra: it erupts in 2 minutes.', tone: 'red' }],
  ['The Bronze Age begins!', 'good', { title: 'THE BRONZE AGE', sub: 'All your units are upgraded. A Boon of the new age awaits.', tone: 'gold' }],
];

await startFilm(page);
await wait(600);
let k = 0;
for (const [t, kind, h] of moments) {
  await tell(t, kind, h);
  await wait(150);
  if (k === 0) await shot('1-coming');
  await wait(1000);
  await shot(`${++k + 1}-held`);
  await wait(2300);
}
// The pointer over it: it turns see-through, and back when the pointer leaves.
await tell('THE MAW HAS OPENED!', 'alert', { title: 'THE MAW HAS OPENED', sub: 'The Hollow pour into the sector.', tone: 'pink' });
await wait(700);
const b = await band();
await page.mouse.move(b.x, b.y, { steps: 10 });
await wait(600);
await shot('6-see-through');
await wait(500);
await page.mouse.move(b.x, b.y + 120, { steps: 10 });
await wait(2200);
// Two at once: the first holds for less, the second follows.
await tell('Vael Imperium has begun raising a Starfire Gate at Mizar I!', 'alert', { title: 'A STARFIRE GATE RISES', sub: 'Vael Imperium is raising one at Mizar I.', tone: 'house' });
await tell("Vael Imperium's Starfire Gate is half charged!", 'alert', { title: 'THE GATE IS HALF CHARGED', sub: 'Vael Imperium will be crowned unless you stop them.', tone: 'house' });
await wait(6200);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
