// The game inside a frame, as it is played in the artifact and on itch.io: a click outside the frame takes
// the keyboard to the page around it, and a press on the game, on the map or on a button of the HUD, must
// take it back (Input.takeKeys). Until 1.23.4 nothing did: the mouse went on working and every key went
// nowhere, a player said, halfway through a run.
//   node scripts/frame.mjs     (npm run test:frame; needs a dev server)
import { checks, DEV_URL, openBrowser } from './lib/browser.mjs';

const { browser, page, errors } = await openBrowser({ viewport: { width: 1400, height: 860 } });
const { check, done } = checks();
await page.context().addInitScript(() => {
  try {
    localStorage.setItem('hegemarch.profile.v1', JSON.stringify({ tutorialDone: true, runs: 6, settings: { autoPause: false, tips: false } }));
  } catch {
    /* the page around the frame */
  }
});
await page.setContent(`<body style="margin:0;background:#222"><div id="outside" style="height:60px;color:#fff">the page around the game</div><iframe id="f" src="${DEV_URL}" style="width:1280px;height:720px;border:0"></iframe></body>`);
const frame = await (await page.$('#f')).contentFrame();
await frame.waitForTimeout(1500);
await frame.click('[data-sa="setup"]');
await frame.click('[data-sa="launch"]');
await frame.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await frame.waitForTimeout(800);
await frame.evaluate(() => {
  window.__app.hud.modals.close();
  window.__keys = 0;
  window.addEventListener('keydown', () => window.__keys++, true);
});
const box = await (await page.$('#f')).boundingBox();
const st = () => frame.evaluate(() => ({ focus: document.hasFocus(), keys: window.__keys, cam: Math.round(window.__app.renderer.cam.x) }));
/** Hold the right arrow a moment: did the key reach the game, and did the camera move? */
const arrow = async () => {
  const a = await st();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  const b = await st();
  return { focus: b.focus, reached: b.keys > a.keys, moved: b.cam !== a.cam };
};
/** The middle of a HUD button, on the page. */
const button = (id) =>
  frame.evaluate((rid) => {
    const r = window.__app.hud.ui.rectOf(rid);
    const c = document.querySelector('canvas');
    const q = c.getBoundingClientRect();
    return r ? { x: q.left + ((r.x + r.w / 2) * q.width) / c.width, y: q.top + ((r.y + r.h / 2) * q.height) / c.height } : null;
  }, id);

check('the run starts with the keyboard', (await arrow()).moved);
await page.click('#outside');
let r = await arrow();
check('a click outside the frame takes it away (what a player meets)', !r.focus && !r.reached, JSON.stringify(r));
const pause = await button('pause');
check('the HUD has its pause button', !!pause);
await page.mouse.click(box.x + pause.x, box.y + pause.y);
r = await arrow();
check('a click on a button of the HUD takes it back', r.focus && r.reached && r.moved, JSON.stringify(r));
await page.click('#outside');
await page.mouse.click(box.x + 640, box.y + 360);
r = await arrow();
check('so does a click on the map', r.focus && r.reached && r.moved, JSON.stringify(r));
await page.click('#outside');
await page.mouse.click(box.x + 640, box.y + 360, { button: 'right' });
r = await arrow();
check('and a right click (an order)', r.focus && r.reached && r.moved, JSON.stringify(r));
check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
done();
