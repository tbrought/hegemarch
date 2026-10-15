// A film of the kindling (1.23.2: a playtester shielded his eyes from the white flashes, and found the
// story text too slow): a Boon offer with a Rare, an Epic and a Legendary dealt, the rarer two kindling,
// and the Legendary taken; a decision, its story under the scan line, a choice and its outcome; the Ark
// rising a level, its window kindling, and an ability taken. Stills at the moments, and the film.
//   node scripts/record-fx.mjs     (needs a dev server)
import { endFilm, filmRun, startFilm } from './lib/film.mjs';

const out = '.shots/fx';
const { browser, page, errors } = await filmRun();
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log('shot', name);
};
const settle = async () => {
  for (let i = 0; i < 120 && (await ev(() => window.__app.hud.modals.revealing() || window.__app.hud.modals.guarded())); i++) await wait(25);
};
const key = async (k) => {
  await page.keyboard.press(k);
  await wait(60);
};

await startFilm(page);
await wait(500);
// 1. A Boon offer: a Rare, an Epic, a Legendary.
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.pendingDrafts = 1;
  p.draftOffer = ['longSights', 'nanites', 'singularity'];
  a.hud.modals.open({ kind: 'draft' });
});
await wait(250);
await shot('1-dealing');
await settle();
await wait(150);
await shot('2-dealt');
await wait(1300);
await key('Digit3');
await wait(900);
// 2. A decision: its story, a choice, its outcome.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  a.session.modal = null;
  const node = g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0).sort((x, y) => g.hops(x.id, g.player.capital) - g.hops(y.id, g.player.capital))[0].id;
  g.prompts.push({ id: 960001, event: 'derelict', node, unit: -1 });
  a.hud.modals.open({ kind: 'event', promptId: 960001 });
});
await wait(500);
await shot('3-story');
await settle();
await wait(1800);
await key('Digit1');
await settle();
await wait(1600);
await key('Enter');
await wait(700);
// 3. The Ark rises a level.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  const ark = g.units.get(g.player.ark);
  g.grantLevels(ark, 3 - ark.level);
  a.hud.modals.open({ kind: 'ability', unitId: ark.id });
});
await wait(450);
await shot('4-level');
await settle();
await wait(1400);
await key('Digit1');
await wait(800);
await endFilm(page, out);
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
