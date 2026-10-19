// The House Power in the browser (1.27): its button over the minimap, D to aim it and D again (or a click) to
// cast it, Escape or a right-click to put it away, the banner saying what it would do, the reason said when it
// cannot be cast, and a Wayfinder's starlane cut to a world clicked on the map.
//   node scripts/powers.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { checks, DEV_URL, gameUi, openBrowser } from './lib/browser.mjs';

const url = process.argv[2] ?? DEV_URL;
const { browser, page, errors } = await openBrowser({ viewport: { width: 1440, height: 810 } });
const { wait, ev, toPage, uiRect, clickUi } = gameUi(page);
const { check, done } = checks();

/** A run as this house, paused, with tips off and nothing to answer. */
async function start(heir) {
  await page.goto(url);
  await wait(800);
  await ev((h) => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
    tutorialDone: true, runs: 5, heirs: ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'], seenTips: [], lastSetup: { heir: h, size: 'small', difficulty: 1 },
    settings: { master: 0, sfx: 0, music: 0, edgePan: false, tips: false, autoPause: false, crt: false, pixelSize: 'auto', explainTerms: true },
  })), heir);
  await page.reload();
  await wait(2000);
  await page.click('[data-sa="setup"]');
  await page.click(`[data-sa="heir:${heir}"]`);
  await page.click('[data-sa="launch"]');
  await wait(400);
  if (await page.$('[data-sa="confirm-new"]')) await page.click('[data-sa="confirm-new"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(1200);
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.paused = true;
    app.session.focusNode(app.session.game.player.capital, 0.22);
  });
  await wait(300);
}
const state = () => ev(() => {
  const app = window.__app;
  const s = app.session;
  const g = s.game;
  return { aim: !!s.view.powerAim, cd: g.player.powerCd, toast: s.toast?.text ?? '', banner: app.hud.objective()?.text ?? '', worlds: g.worldsOf(g.playerId).length, lanes: g.lanes.length };
});
/** No message on the banner: what it says is the power's (or the next message). */
const quiet = () => ev(() => (window.__app.session.toast = null));
/** The tooltip of a HUD region, as it is drawn. */
const tipOf = (id) => ev((rid) => {
  const r = window.__app.hud.ui.rectOf(rid);
  const t = r?.tip;
  return typeof t === 'function' ? t() : (t ?? '');
}, id);

try {
  // ---- Solar Concord: Dawn ----
  await start('concord');
  const btn = await uiRect('power');
  check('the House Power has its button over the minimap', !!btn && (await ev(() => { const m = window.__app.hud.minimapRect; const p = window.__app.hud.powerRect; return p.w > 0 && p.y + p.h <= m.y; })));
  check('its tooltip says what it is, its key, and why it cannot be cast yet', /\{Dawn\}/.test(await tipOf('power')) && /\[D\] aims it/.test(await tipOf('power')) && /Ready in 1:\d\d/.test(await tipOf('power')), await tipOf('power'));
  await page.keyboard.press('KeyD');
  await wait(150);
  let st = await state();
  check('D before it is ready says when it will be, and aims nothing', !st.aim && /^Ready in 1:\d\d$/.test(st.toast), JSON.stringify(st));
  // (Ready, with the Ark at the star of its home system: its worlds are one starlane from it. Two guards at
  // one of them, which Dawn burns.)
  const guards = await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    const ark = g.units.get(p.ark);
    const star = g.nodes[g.systems[g.nodes[p.capital].system].star];
    Object.assign(ark, { node: star.id, x: star.x + star.r + 60, y: star.y, px: star.x + star.r + 60, py: star.y });
    // (Seen, so that the banner counts its guards: a world of the home system may be out of sight at the start.)
    const world = g.neighbours(star.id).map((id) => g.nodes[id]).find((n) => n.kind === 'planet' && n.owner < 0);
    p.visible[world.id] = 1;
    p.explored[world.id] = 1;
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push(g.spawnUnit('militia', g.guardianId, world.id).id);
    g.rebuildBuckets();
    p.powerCd = 0;
    window.__app.session.toast = null;
    return { ids, all: g.buckets[world.id].filter((u) => u.owner === g.guardianId).length };
  });
  await page.keyboard.press('KeyD');
  await wait(200);
  st = await state();
  // (As many guards as the player can see at all the worlds it would light: those two at least.)
  const burns = Number(/^DAWN: .+ kindled at once, and (\d+) guards burn\.$/.exec(st.banner ?? '')?.[1] ?? 0);
  check('D aims it: the banner says what it would do, and how many guards burn', st.aim && burns >= guards.all, JSON.stringify(st));
  await page.keyboard.press('Escape');
  await wait(150);
  check('Escape puts it away, and the menu does not open', !(await state()).aim && !(await ev(() => window.__app.session.modal)));
  await page.keyboard.press('KeyD');
  await wait(150);
  const c = await toPage(240, 140);
  await page.mouse.click(c[0], c[1], { button: 'right' });
  await wait(150);
  check('a right-click puts it away', !(await state()).aim);
  await page.keyboard.press('KeyD');
  await wait(150);
  await page.keyboard.press('KeyU');
  await wait(250);
  check('a dialog opening puts it away', !(await state()).aim);
  await ev(() => (window.__app.session.modal = null));
  await wait(150);
  // Cast with its button: aimed by one click, cast by the next.
  const before = await state();
  await clickUi('power');
  check('its button aims it', (await state()).aim);
  await clickUi('power');
  await wait(200);
  st = await state();
  check('and casts it: worlds kindled, and it is not ready again for five minutes', !st.aim && st.worlds > before.worlds && st.cd > 290, `${before.worlds} → ${st.worlds}, ${st.cd}`);
  check('the guards at a world it lit burned', await ev((ids) => ids.every((id) => !window.__app.session.game.units.get(id) || window.__app.session.game.units.get(id).dead), guards.ids));
  check('the button says when it is back', /Ready in [45]:\d\d/.test(await tipOf('power')));
  // The Ark's card names it.
  await ev(() => {
    const s = window.__app.session;
    s.view.selected = new Set([s.game.player.ark]);
  });
  await wait(200);
  check('the Ark\'s card names the power and its key', await ev(() => {
    const ui = window.__app.hud.ui;
    const tips = [...ui.regions, ...(ui.lastHints ?? [])].filter((r) => r.id !== 'power').map((r) => (typeof r.tip === 'function' ? r.tip() : r.tip));
    return tips.some((t) => typeof t === 'string' && /^\{Dawn\}:/.test(t) && /\[D\] aims it/.test(t));
  }));
  // No Ark, no power: the reason is said.
  await ev(() => {
    const g = window.__app.session.game;
    g.player.powerCd = 0;
    g.killUnit(g.units.get(g.player.ark), -1);
  });
  // (The news of the Ark lost is said first; then the key.)
  await wait(300);
  await quiet();
  await page.keyboard.press('KeyD');
  await wait(150);
  st = await state();
  check('with the Ark lost, D says to rebuild it', !st.aim && st.toast === 'Your Ark is lost: rebuild it at your Hearth', st.toast);

  // ---- Wayfarer Clans: Wayfinder, aimed at a world ----
  await start('wayfarer');
  const target = await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const p = g.player;
    g.exploreAll(p);
    p.powerCd = 0;
    const ark = g.units.get(p.ark);
    const ok = g.nodes.filter((n) => !g.checkPower(p.id, n.id)).sort((a, b) => g.hops(ark.node, b.id) - g.hops(ark.node, a.id));
    const t = ok[0];
    const A = g.nodes[ark.node];
    app.session.focusNode(ark.node, Math.min(0.12, (0.4 * 270) / Math.hypot(t.x - A.x, t.y - A.y)));
    return { id: t.id, near: g.neighbours(ark.node)[0] };
  });
  await wait(400);
  await quiet();
  const at = async (id) => ev((nid) => {
    const r = window.__app.session.renderer;
    const n = window.__app.session.game.nodes[nid];
    return [r.sx(n.x), r.sy(n.y)];
  }, id);
  await page.keyboard.press('KeyD');
  await wait(150);
  st = await state();
  check('a Wayfinder aimed asks for a world', st.aim && /^WAYFINDER: click a world for a new starlane \(\d+ within reach\)\.$/.test(st.banner), st.banner);
  // A world already joined: refused, with the reason, and still aimed.
  const [nx, ny] = await at(target.near);
  const [px1, py1] = await toPage(nx, ny);
  await page.mouse.move(px1, py1);
  await wait(200);
  check('pointing at a world already joined, the banner says so in red', /^WAYFINDER: A starlane joins them already\.$/.test((await state()).banner), (await state()).banner);
  await page.mouse.click(px1, py1);
  await wait(200);
  st = await state();
  check('clicked, it is refused with the reason, and stays aimed', st.aim && st.toast === 'A starlane joins them already', JSON.stringify(st));
  await quiet();
  const [tx, ty] = await at(target.id);
  const [px2, py2] = await toPage(tx, ty);
  await page.mouse.move(px2, py2);
  await wait(200);
  check('pointing at a world in reach, the banner names it', /^WAYFINDER: a new starlane to .+\.$/.test((await state()).banner), (await state()).banner);
  const lanes = (await state()).lanes;
  await page.mouse.click(px2, py2);
  await wait(300);
  st = await state();
  check('clicked, the starlane is cut, and the power put away', !st.aim && st.lanes === lanes + 1, JSON.stringify(st));
  check('the starlane is the one asked for', await ev((t) => { const g = window.__app.session.game; const l = g.lanes[g.lanes.length - 1]; return l.b === t && l.by === g.playerId; }, target.id));
} catch (e) {
  check('the suite ran to its end', false, e.message);
}
await browser.close();
process.exit(done(errors));
