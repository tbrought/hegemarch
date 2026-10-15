// A player whose computer asks for less motion (CALM in ui/modals/pixelFx.ts): the omens, a Boon deal with an
// Epic and a Legendary, a level-up, a decision and its outcome, a Boon ready and a herald all come and go
// with no error. Stills in .shots/calm-*.png.
//   node scripts/calm.mjs     (npm run test:calm; needs a dev server)
import { checks, DEV_URL, gameUi, openBrowser } from './lib/browser.mjs';
const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 }, context: { reducedMotion: 'reduce' } });
const { wait, ev } = gameUi(page);
const { check, done } = checks();
await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 6, settings: { autoPause: false, tips: true } })));
await page.goto(DEV_URL);
await wait(1500);
check('the browser asks for less motion', await ev(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
// (The game's own switch: no kindling ring and no sparks off it, ui/modals/pixelFx.ts.)
check('the game holds back its kindling rings', await ev(async () => (await import('/src/ui/modals/pixelFx.ts')).CALM === true));
await page.click('[data-sa="setup"]');
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await wait(800);
await page.screenshot({ path: '.shots/calm-omens.png' });
await ev(() => window.__app.hud.modals.close());
await wait(300);
// A deal with an Epic and a Legendary.
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.pendingDrafts = 2;
  p.draftOffer = ['longSights', 'nanites', 'singularity'];
  a.hud.modals.open({ kind: 'draft' });
});
await wait(2600);
await page.screenshot({ path: '.shots/calm-draft.png' });
await ev(() => window.__app.hud.modals.close());
// A level-up.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  const ark = g.units.get(g.player.ark);
  g.grantLevels(ark, 1);
  a.hud.modals.open({ kind: 'ability', unitId: ark.id, unbidden: true });
});
await wait(900);
await page.screenshot({ path: '.shots/calm-level.png' });
await ev(() => { const g = window.__app.session.game; g.units.get(g.player.ark).pendingAbil = []; window.__app.session.modal = null; });
// A decision and its outcome.
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  g.player.embers = 5000;
  g.prompts.push({ id: 880001, event: 'derelict', node: g.player.capital, unit: -1 });
  a.hud.modals.open({ kind: 'event', promptId: 880001 });
});
await wait(1100);
await page.keyboard.press('Digit1');
await wait(700);
await page.screenshot({ path: '.shots/calm-outcome.png' });
await page.keyboard.press('Enter');
await wait(200);
// A Boon becoming ready, and a herald.
await ev(() => { const g = window.__app.session.game; g.player.pendingDrafts += 1; g.notify(-1, 'A TEST', 'alert', undefined, false, { title: 'A TEST', sub: 'A line.', tone: 'red' }); });
await wait(300);
await page.screenshot({ path: '.shots/calm-boon.png' });
check('every moment came and went with no dialog left open', (await ev(() => window.__app.session.modal)) === null);
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
done();
