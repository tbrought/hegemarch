// End-to-end test through real mouse and keyboard input in headless Edge/Chrome.
//   node scripts/e2e.mjs [url]     (needs a dev server: npx vite --port 5173 --strictPort)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { browserPath } from './lib/browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const executablePath = browserPath();
fs.mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
const wait = (ms) => page.waitForTimeout(ms);
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const toPage = (ix, iy) =>
  ev(([x, y]) => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return [r.left + ((x + 0.5) * r.width) / c.width, r.top + ((y + 0.5) * r.height) / c.height];
  }, [ix, iy]);
const uiRect = (id) => ev((rid) => window.__app.hud?.ui.rectOf(rid) ?? null, id);
// A dialog that has just opened by itself takes no click and no key for a moment (Modals.guarded): wait
// it out, as a player would.
const unheld = async () => {
  for (let i = 0; i < 60 && (await ev(() => window.__app.hud?.modals.guarded() || window.__app.hud?.ui.holding() || window.__app.hud?.modals.revealing())); i++) await wait(100);
};
const clickUi = async (id, button = 'left') => {
  let r = await uiRect(id);
  for (let i = 0; i < 10 && !r; i++) {
    await wait(100);
    r = await uiRect(id);
  }
  if (!r) throw new Error('no UI region ' + id);
  await unheld();
  const [x, y] = await toPage(r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(x, y, { button });
  await wait(120);
};
const clickWorld = async (id, button = 'left') => {
  const [ix, iy] = await ev((nid) => {
    const app = window.__app;
    const n = app.session.game.nodes[nid];
    app.renderer.cam.focus(n.x, n.y, Math.max(app.renderer.cam.tzoom, 0.16));
    app.renderer.cam.update(10);
    return [app.renderer.sx(n.x), app.renderer.sy(n.y)];
  }, id);
  const [x, y] = await toPage(ix, iy);
  await page.mouse.click(x, y, { button });
  await wait(150);
};
/** Fast-forward the simulation, then settle anything that popped up (decisions, tips). */
const fastForward = async (seconds) => {
  await ev((secs) => {
    const g = window.__app.session.game;
    g.fxEnabled = false;
    for (let i = 0; i < secs * 20 && !g.outcome; i++) g.step();
    g.fx.length = 0;
    g.fxEnabled = true;
  }, seconds);
  await wait(150);
  await settle();
};
const settle = () =>
  ev(() => {
    const s = window.__app.session;
    const g = s.game;
    for (const p of g.prompts) if (p.result === undefined) g.cmdResolvePrompt(p.id, 0);
    g.prompts.length = 0;
    s.modal = null;
    s.paused = false;
  });

try {
  await page.goto(url);
  await wait(2500);
  await ev(() => localStorage.clear());
  await page.reload();
  await wait(3000);

  // ---- Menus ----
  check('title screen shows HEGEMARCH', (await page.textContent('.logo'))?.includes('HEGEMARCH'));
  check('no CONTINUE without a save', (await page.$('[data-sa="continue"]')) === null);
  // The sector behind the menus plays itself; when a house is crowned there, one new sector follows.
  await page.waitForFunction(() => window.__app.attract.game !== null, null, { timeout: 30000 });
  await ev(() => {
    const a = window.__app.attract;
    window.__backdrop = a.game;
    a.game.declareWinner(a.game.factions.find((f) => f.kind === 'empire' && f.alive).id, 'conquest', 'test');
  });
  await page.waitForFunction(() => window.__app.attract.game !== window.__backdrop, null, { timeout: 30000 });
  await ev(() => (window.__backdrop = window.__app.attract.game));
  await wait(1500);
  // (Now and then a house wins the new sector within its opening minutes, before it is ever shown; that one is rightly replaced too.)
  check('a finished backdrop sector is replaced by one new sector', await ev(() => !!window.__backdrop.outcome || (window.__app.attract.game === window.__backdrop && window.__app.attract.phase === 'live')));
  await page.click('[data-sa="settings"]');
  await page.click('[data-sa="toggle:crt"]');
  check('settings toggle (CRT) persists', await ev(() => JSON.parse(localStorage.getItem('hegemarch.profile.v1')).settings.crt === true));
  await page.click('[data-sa="toggle:crt"]');
  await page.click('[data-sa="menu"]');
  await page.click('[data-sa="hall"]');
  check('Hall of Heirs lists perks', (await page.$$('[data-sa^="perk:"]')).length >= 5);
  // Fortunate Stars shows its odds as a table at every rank, the rank held lit (rank 0 here): Epic and Legendary, with or without Legendary Lineage (without, here).
  const odds = await ev(() => {
    const t = [...document.querySelectorAll('.perk')].find((e) => /FORTUNATE STARS/.test(e.textContent))?.querySelector('.odds');
    return t && { cells: t.children.length, lit: [...t.querySelectorAll('.now')].map((e) => e.textContent), legendary: !!t.querySelector('.legendary'), inside: t.getBoundingClientRect().right <= t.closest('.perk').getBoundingClientRect().right + 1 };
  });
  check('Fortunate Stars shows its odds at every rank, the rank held lit', !!odds && odds.cells === 21 && odds.lit.length === 3 && odds.lit[0] === '0' && /%$/.test(odds.lit[1]) && odds.inside, JSON.stringify(odds));
  check('its Legendary row is there without Legendary Lineage: Legendary Boons are dealt to every player at their odds', !!odds && odds.legendary, JSON.stringify(odds));
  await page.click('[data-sa="menu"]');

  // ---- The title screen: a new player is offered the guided First Night first, and the ways to play under it ----
  check('first run offers The First Night, as the banner of the title screen', (await page.$('.hero[data-sa="first-night"]')) !== null && /FIRST NIGHT/.test(await page.textContent('.hero')));
  check('the three ways to play stand under it, each with its picture', await ev(() => ['setup', 'ages', 'daily'].every((a) => document.querySelector(`.modes .mode[data-sa="${a}"] canvas.mode-art`))));
  await wait(300); // (the pictures are drawn with the next frame)
  check('their pictures are drawn', await ev(() =>
    [...document.querySelectorAll('.mode canvas.mode-art')].every((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return c.width > 40 && n > 20;
    })));
  check('the Ages run is marked as new until it has been looked at', (await page.textContent('.mode.ages .mode-flag')) === 'NEW');
  check('the daily run counts down to the next one', /^ENDS IN (\d+H )?\d+M$/.test(await page.textContent('[data-daily]')), await page.textContent('[data-daily]'));
  await page.click('[data-sa="setup"]');
  check('CLASSIC RUN opens its setup, with the houses', (await page.$$('.heir')).length === 6 && (await page.textContent('.mode-tabs .active')) === 'CLASSIC RUN');
  // The ways to play are tabs here: a change of mind costs one click.
  await page.click('.mode-tabs [data-sa="ages"]');
  check('the setup switches to an Ages run in place', (await page.textContent('.mode-tabs .active')) === 'AGES RUN' && (await page.$('.ages-head canvas.mode-art')) !== null && (await page.$('[data-sa="guided"]')) === null);
  await page.click('.mode-tabs [data-sa="daily"]');
  check('and to the daily run', /^DAILY RUN/.test(await page.textContent('.mode-tabs .active')) && (await page.$('[data-sa="size:small"]')) === null);
  await page.click('[data-sa="menu"]');
  check('once looked at, the Ages run is no longer marked as new', (await page.$('.mode-flag')) === null);
  await page.click('[data-sa="setup"]');
  // Each house card carries a banner: its Hearth and starting fleet, drawn by the game, and alive.
  const banner = () =>
    ev(() => {
      const c = document.querySelector('.heir canvas.heir-art');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
        sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0;
      }
      return { n: document.querySelectorAll('.heir canvas.heir-art').length, lit, sum, tip: c.dataset.tip };
    });
  await wait(400);
  const b1 = await banner();
  await wait(700);
  const b2 = await banner();
  check('every house card has a banner showing its starting fleet', b1.n === 6 && b1.lit > 60 && /starts with the Ark/.test(b1.tip), `${b1.n} banners, ${b1.lit} lit pixels`);
  check('the banners move', b1.sum !== b2.sum);
  const term = await page.$('.heir .gl[data-gl="ab-aegis"]');
  if (term) await term.hover();
  await wait(200);
  check('menu terms explain themselves on hover', !!term && (await page.$eval('.gtip', (el) => !el.hidden && /Aegis Field/.test(el.textContent))));
  await page.mouse.move(5, 5);
  await wait(100);
  check('the menu tooltip goes away', await page.$eval('.gtip', (el) => el.hidden));
  await page.click('[data-sa="guided"]');
  await page.click('[data-sa="size:small"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(1000);
  check('unguided run opens with the omen card', await ev(() => window.__app.session.modal?.kind === 'omens'));
  check('the game waits while the omen card is open', await ev(() => window.__app.session.halted));
  check('its omens come in one by one under their stars, explained once they are there', await ev(() => window.__app.hud.modals.revealing() && !window.__app.hud.ui.lastHints.some((h) => h.key === 'om-amb')));
  for (let i = 0; i < 30 && (await ev(() => window.__app.hud.modals.guarded())); i++) await wait(100);
  if (await ev(() => window.__app.hud.modals.revealing())) {
    await page.keyboard.press('Enter');
    await wait(200);
    check('Enter while they come brings them all, and leaves the card open to be read', await ev(() => window.__app.session.modal?.kind === 'omens' && !window.__app.hud.modals.revealing()));
  }
  // The ambition explains the words it uses (the Iron Will ambition mentions the Ark).
  await ev(() => (window.__app.session.game.ambition = 'ironWill'));
  await wait(300);
  const amb = await ev(() => {
    const app = window.__app;
    const h = app.hud.ui.lastHints.find((x) => x.key === 'om-amb');
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return h && { x: c.left + (h.x + 20) * k, y: c.top + (h.y + 4) * k };
  });
  if (amb) await page.mouse.move(amb.x, amb.y);
  await wait(700);
  check('hovering the ambition explains the Ark', (await ev(() => window.__app.hud.ui.shownTerms)).includes('ark'));
  await ev(() => (window.__app.session.profile.settings.explainTerms = false));
  await wait(200);
  check('the setting turns term boxes off', (await ev(() => window.__app.hud.ui.shownTerms)).length === 0);
  await ev(() => (window.__app.session.profile.settings.explainTerms = true));
  await page.mouse.move(5, 5);
  await clickUi('omens-begin');
  check('BEGIN closes the omen card', await ev(() => window.__app.session.modal === null));
  await wait(300);
  check('unguided run: full HUD from the start', !!(await uiRect('minimap')) && !!(await uiRect('dest-conquest')) && !!(await uiRect('boon')));

  // ---- Scouts wait for orders: select one, then EXPLORE (or E) ----
  const scoutOrders = () =>
    ev(() => {
      const g = window.__app.session.game;
      const mine = g.unitList.filter((u) => !u.dead && u.type === 'scout' && u.owner === g.playerId);
      // (In a sector that an omen has charted for every house, a rival's Scout has nothing to explore and stays home.)
      const rivals = g.unitList.filter((u) => !u.dead && u.type === 'scout' && u.owner !== g.playerId && g.factions[u.owner].kind === 'empire' && g.hasUncharted(g.factions[u.owner]));
      return { mine: mine.map((u) => u.order), rivals: rivals.map((u) => u.order) };
    });
  await wait(1500);
  let so = await scoutOrders();
  check('your Scout waits at the Hearth for orders', so.mine.length > 0 && so.mine.every((o) => o === 'idle'), so.mine.join(','));
  check('rival Scouts set out at once', so.rivals.every((o) => o === 'explore'), so.rivals.join(','));
  check('no decision pops up on its own at the start', await ev(() => window.__app.session.game.prompts.length === 0 && window.__app.session.modal === null));
  check('the banner says how to send the Scout (after the first Boon), with the real count on its badge', await ev(() => {
    const app = window.__app;
    const p = app.session.game.player;
    const keep = p.pendingDrafts;
    p.pendingDrafts = 0;
    const o = app.hud.objective();
    p.pendingDrafts = keep;
    return !!o && o.text.includes('EXPLORE') && o.badge === String(app.session.fleetAt(p.capital).length);
  }));
  await page.keyboard.press('e');
  await wait(150);
  check('E with nothing selected picks your Scout, and says how to send it', await ev(() => {
    const s = window.__app.session;
    return s.ownSelected().length > 0 && s.ownSelected().every((u) => u.type === 'scout') && !s.view.orderMode && (s.toast?.text ?? '').includes('Press E again');
  }));
  await ev(() => window.__app.session.clearSelection());
  await clickUi('fleet-' + (await ev(() => window.__app.session.game.player.capital)));
  await wait(150);
  check('the Hearth fleet card offers EXPLORE', !!(await uiRect('explore')));
  await page.keyboard.press('e');
  await wait(150);
  so = await scoutOrders();
  check('E sends the Scout exploring', so.mine.every((o) => o === 'explore'));
  check('and only the Scout: the Ark stays home', await ev(() => {
    const g = window.__app.session.game;
    const ark = g.unitList.find((u) => !u.dead && u.owner === g.playerId && u.type === 'ark');
    return ark.order !== 'explore' && ark.node === g.player.capital && ark.path.length === 0;
  }));
  check('the Scout leaves the selection, the rest stays picked', await ev(() => {
    const own = window.__app.session.ownSelected();
    return own.length > 0 && own.every((u) => u.type !== 'scout');
  }));
  await ev(() => window.__app.hud.update(0.6));
  check('the Scout hint is gone once a Scout explores', await ev(() => !(window.__app.hud.objective()?.text ?? '').includes('EXPLORE')));
  await ev(() => window.__app.session.clearSelection());
  await page.keyboard.press('e');
  await wait(150);
  check('E with the Scout already out says so', (await ev(() => window.__app.session.toast?.text ?? '')).includes('already out exploring'));
  // A decision can chart the whole sector: then there is no EXPLORE, and E says why.
  await ev(() => {
    const g = window.__app.session.game;
    window.__keepExplored = [...g.player.explored];
    g.exploreAll(g.player);
    const sc = g.unitList.find((u) => !u.dead && u.owner === g.playerId && u.type === 'scout');
    window.__app.session.selectUnits([sc.id]);
  });
  await wait(300);
  check('a charted sector offers no EXPLORE', !(await uiRect('explore')));
  await page.keyboard.press('e');
  await wait(150);
  check('and E says the sector is charted', (await ev(() => window.__app.session.toast?.text ?? '')).includes('charted'));
  await ev(() => {
    window.__app.session.game.player.explored = window.__keepExplored;
    window.__app.session.clearSelection();
  });
  // Keep random anomalies from popping up mid-test (auto-pause is tested on its own below).
  await ev(() => (window.__app.session.profile.settings.autoPause = false));

  // ---- Boon via keyboard ----
  await page.keyboard.press('b');
  await wait(300);
  check('B opens the Boon draft', await ev(() => window.__app.session.modal?.kind === 'draft'));
  check('game is halted during the draft', await ev(() => window.__app.session.halted));
  // The cards come in one by one (modals/reveal.ts). A key before they are all there brings them all, and takes none.
  check('the cards of a draft come in one by one', await ev(() => window.__app.hud.modals.revealing()));
  const had = await ev(() => window.__app.session.game.player.cards.length);
  await page.keyboard.press('1');
  await wait(150);
  check('a key while they come brings them all and takes none', await ev((n) => !window.__app.hud.modals.revealing() && window.__app.session.game.player.cards.length === n && window.__app.session.modal?.kind === 'draft', had));
  check('every Boon card shows pictures of what it affects', await ev(() => {
    const app = window.__app;
    const n = app.session.game.player.draftOffer.length;
    const tips = app.hud.ui.lastHints.filter((h) => h.key.startsWith('card-sub-')).map((h) => (typeof h.tip === 'function' ? h.tip() : h.tip));
    return tips.length === n && tips.every((t) => /^This Boon affects: \S/.test(t));
  }));
  await page.keyboard.press('1');
  await wait(300);
  check('key 1 picks the first Boon', await ev(() => window.__app.session.game.player.cards.length >= 1));
  await wait(900);
  const firstBoon = await ev(() => window.__app.session.game.player.cards[0]);
  check('the chosen Boon lands in the tray', !!(await uiRect('tray-' + firstBoon)));

  // ---- Hovering a Boon card explains its terms beside it ----
  await ev(() => {
    const app = window.__app;
    const p = app.session.game.player;
    p.pendingDrafts = 1;
    p.draftOffer = ['kindlingRites', 'hotBarrels', 'emberTithe'];
    app.hud.modals.open({ kind: 'draft' });
  });
  await wait(300);
  await unheld();
  const card = await uiRect('card-0');
  const [hx, hy] = await toPage(card.x + card.w / 2, card.y + 20);
  await page.mouse.move(hx, hy);
  await wait(700);
  check('hovering Kindling Rites explains Kindle', (await ev(() => window.__app.hud.ui.shownTerms)).includes('kindle'));
  check('the Embers count stays readable behind dialogs', await ev(() => {
    const g = window.__app.session.screen.g;
    const d = g.getImageData(0, 0, 60, 13).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150) bright++;
    return bright > 20;
  }));
  await page.mouse.move(5, 5);
  await ev(() => {
    const app = window.__app;
    app.session.modal = null;
    app.session.game.player.pendingDrafts = 0;
    app.session.game.player.draftOffer = null;
  });

  // ---- The Boons screen: B with no draft waiting, or a click on the tray ----
  await ev(() => (window.__app.session.game.player.pendingDrafts = 0));
  await page.keyboard.press('b');
  await wait(300);
  check('B opens the Boons screen when no draft waits', await ev(() => window.__app.session.modal?.kind === 'status' && window.__app.hud.modals.statusTab === 'boons'));
  // (The zoom the map is heading for: the wheel moves it, a camera still gliding from the last step does not.)
  const zoom0 = await ev(() => window.__app.renderer.cam.tzoom);
  const mid = await toPage(240, 135);
  await page.mouse.move(mid[0], mid[1]);
  await page.mouse.wheel(0, 300);
  await wait(200);
  check('the wheel scrolls the Boons screen, not the map', (await ev(() => window.__app.renderer.cam.tzoom)) === zoom0);
  await page.keyboard.press('b');
  await wait(200);
  check('B closes the Boons screen', await ev(() => window.__app.session.modal === null));
  await clickUi('tray-' + firstBoon);
  await wait(200);
  check('clicking the tray opens the Boons screen', await ev(() => window.__app.session.modal?.kind === 'status' && window.__app.hud.modals.statusTab === 'boons'));
  await page.keyboard.press('Escape');
  await wait(200);

  // ---- Build at the Hearth ----
  const cap = await ev(() => window.__app.session.game.player.capital);
  await clickWorld(cap);
  check('clicking the Hearth selects it', await ev((c) => window.__app.session.view.selectedNode === c, cap));
  const before = await ev(() => window.__app.session.game.player.embers);
  await clickUi('build-guardian');
  const queued = await ev((c) => window.__app.session.game.nodes[c].shipQ.length, cap);
  check('Guardian queued from the context card', queued === 1);
  check('Embers spent on the Guardian', (await ev(() => window.__app.session.game.player.embers)) < before);
  const guardians = () => ev(() => window.__app.session.game.unitsOf(0).filter((u) => u.type === 'guardian').length);
  const g0 = await guardians();
  for (let i = 0; i < 8 && (await guardians()) <= g0; i++) await fastForward(5);
  check('Guardian built', (await guardians()) > g0);

  // ---- Kindle with K ----
  const dark = await ev(() => {
    const g = window.__app.session.game;
    const p = g.player;
    return g.nodes
      .filter((n) => n.kind === 'planet' && n.owner === -1 && p.explored[n.id] && !g.hasHostiles(n.id, p.id))
      .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id))[0].id;
  });
  await clickWorld(dark);
  await page.keyboard.press('k');
  await wait(200);
  check('K kindles the selected dark world', await ev((d) => !!window.__app.session.game.seedFor(0, d), dark));
  // A seed ship on its mission is not swept up with the fleet it launched beside: selecting the Hearth's
  // fleet by its badge (or everything at once) leaves it out, and sending that fleet off does not stop it.
  const capNode = await ev(() => window.__app.session.game.player.capital);
  await ev((c) => {
    const app = window.__app;
    const n = app.session.game.nodes[c];
    app.renderer.cam.focus(n.x, n.y, 0.16);
    app.renderer.cam.update(10);
  }, capNode);
  await wait(200);
  await clickUi('fleet-' + capNode);
  check('the fleet badge leaves a seed ship on its mission alone', await ev(() => {
    const own = window.__app.session.ownSelected();
    return own.length > 0 && own.every((u) => u.type !== 'seed');
  }));
  await ev(() => {
    const s = window.__app.session;
    const g = s.game;
    s.selectUnits(g.unitList.filter((u) => !u.dead && u.owner === g.playerId).map((u) => u.id));
  });
  check('so does selecting everything at once', await ev(() => window.__app.session.ownSelected().every((u) => u.type !== 'seed')));
  await ev((c) => {
    const app = window.__app;
    const g = app.session.game;
    app.hud.actions.orderAt(g.nodes[c].lanes[0]);
    app.hud.actions.orderAt(c);
    app.session.clearSelection();
  }, capNode);
  check('sending the fleet around does not call the kindling off', await ev((d) => {
    const g = window.__app.session.game;
    const seed = g.seedFor(g.playerId, d);
    return !!seed && seed.order === 'kindle';
  }, dark));
  for (let i = 0; i < 15 && !(await ev((d) => window.__app.session.game.nodes[d].owner === 0, dark)); i++) await fastForward(10);
  check('the world is kindled', await ev((d) => window.__app.session.game.nodes[d].owner === 0, dark));

  // ---- A seed ship ordered away by itself: the kindling is called off, plainly, and the ship is not wasted ----
  const seedTest = await ev(() => {
    const app = window.__app;
    const s = app.session;
    const g = s.game;
    const p = g.player;
    p.embers = 5000;
    const near = (a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id);
    let darks = g.nodes.filter((n) => n.kind === 'planet' && n.owner === -1 && !g.checkKindle(p.id, n.id) && !g.hasHostiles(n.id, p.id)).sort(near);
    if (!darks.length) {
      // (The sector is dealt at random: in some, every dark world in reach is guarded or not yet charted.
      // The nearest one is charted and cleared for the test, then.)
      const n = g.nodes.filter((x) => x.kind === 'planet' && x.owner === -1).sort(near)[0];
      if (n) {
        p.explored[n.id] = 1;
        for (const u of [...g.buckets[n.id]]) if (!u.dead && g.hostile(u.owner, p.id)) g.killUnit(u, -1);
        if (!g.checkKindle(p.id, n.id)) darks = [n];
      }
    }
    if (!darks.length) return null;
    app.hud.actions.kindle(darks[0].id);
    const seed = g.seedFor(p.id, darks[0].id);
    s.selectUnits([seed.id]);
    const picked = s.ownSelected().length === 1 && s.ownSelected()[0].id === seed.id;
    app.hud.actions.orderAt(p.capital);
    const calledOff = seed.order !== 'kindle' && (s.toast?.text ?? '').includes('called off');
    s.clearSelection();
    for (let i = 0; i < 20 * 20; i++) g.step();
    app.hud.update(5);
    s.toast = null; // (a reminder about unspent Embers may be showing)
    const banner = app.hud.objective()?.text ?? '';
    const before = p.embers;
    s.selectNode(darks[0].id);
    return { world: darks[0].id, picked, calledOff, banner, before, seed: seed.id };
  });
  check('a seed ship can still be selected by itself', !!seedTest && seedTest.picked);
  check('ordering it away calls the kindling off and says so', !!seedTest && seedTest.calledOff);
  check('the banner says a seed ship is waiting', !!seedTest && seedTest.banner.includes('seed ship waits'), seedTest?.banner);
  await wait(300);
  await clickUi('kindle');
  await wait(150);
  check('KINDLE then sends the waiting seed ship, free', await ev((t) => {
    const g = window.__app.session.game;
    const seed = g.seedFor(g.playerId, t.world);
    return !!seed && seed.id === t.seed && Math.abs(g.player.embers - t.before) < 30;
  }, seedTest));
  check('a seed ship destroyed on its way is reported', await ev((t) => {
    const g = window.__app.session.game;
    g.killUnit(g.units.get(t.seed), -1);
    return g.notes.some((n) => /seed ship was destroyed on its way/.test(n.text));
  }, seedTest));
  await settle();

  // ---- Roles ----
  await clickWorld(dark);
  await clickUi('role-forge');
  check('the first role given to a newly kindled world costs no time', await ev((d) => {
    const n = window.__app.session.game.nodes[d];
    return n.role === 'forge' && n.retool === 0 && !n.fresh;
  }, dark));
  await clickUi('role-observatory');
  check('a later change of role retools the world', await ev((d) => {
    const n = window.__app.session.game.nodes[d];
    return n.role === 'observatory' && n.retool > 0;
  }, dark));
  await clickUi('role-forge').catch(() => {});
  await ev((d) => {
    // (Back to a Forge, ready, for the checks that follow.)
    const g = window.__app.session.game;
    const n = g.nodes[d];
    n.role = 'forge';
    n.retool = 0;
    g.refreshWorld(n);
  }, dark);

  // ---- Fleet orders: badge, then a world ----
  await ev((c) => {
    const app = window.__app;
    const n = app.session.game.nodes[c];
    app.renderer.cam.focus(n.x, n.y, 0.16);
    app.renderer.cam.update(10);
  }, cap);
  await wait(200);
  await clickUi('fleet-' + cap);
  check('fleet badge selects the fleet', await ev(() => window.__app.session.ownSelected().length >= 3));
  check('selecting a fleet enters order mode', await ev(() => window.__app.session.view.orderMode));
  await clickWorld(dark);
  check('clicking a world sends the fleet', await ev((d) => window.__app.session.ownSelected().some((u) => u.dest === d), dark));
  await page.keyboard.press('Escape');
  check('Esc clears the selection', await ev(() => window.__app.session.ownSelected().length === 0 && window.__app.session.modal === null));

  // ---- One ship, then another: a click on a second ship picks it (it is not an order to the world around it) ----
  const pair = await ev((capId) => {
    const app = window.__app;
    const g = app.session.game;
    const n = g.nodes[capId];
    // Two fresh ships, held apart and still, clear of the world itself.
    const a = g.spawnUnit('striker', g.playerId, capId, { x: n.x - 260, y: n.y - 200 });
    const b = g.spawnUnit('guardian', g.playerId, capId, { x: n.x + 260, y: n.y - 200 });
    for (const u of [a, b]) {
      u.vx = 0;
      u.vy = 0;
    }
    // (Hold the world still without pausing: a paused game takes no orders, and this is about orders.)
    g.heldStep = g.step;
    g.step = () => {};
    app.renderer.cam.focus(n.x, n.y - 100, 0.2);
    app.renderer.cam.update(10);
    return { a: a.id, b: b.id, ax: app.renderer.sx(a.x), ay: app.renderer.sy(a.y), bx: app.renderer.sx(b.x), by: app.renderer.sy(b.y) };
  }, cap);
  await wait(250);
  await page.mouse.click(...(await toPage(pair.ax, pair.ay)));
  await wait(450); // (longer than a double click)
  check('a click on a ship selects it', await ev((id) => {
    const own = window.__app.session.ownSelected();
    return own.length === 1 && own[0].id === id && window.__app.session.view.orderMode;
  }, pair.a));
  await page.mouse.click(...(await toPage(pair.bx, pair.by)));
  await wait(200);
  check('a click on another ship at the same world selects that one, and orders nothing', await ev(([a, b, capId]) => {
    const s = window.__app.session;
    const own = s.ownSelected();
    const first = s.game.units.get(a);
    return own.length === 1 && own[0].id === b && first.path.length === 0 && first.node === capId && isNaN(first.ox);
  }, [pair.a, pair.b, cap]), await ev(() => window.__app.session.ownSelected().map((u) => u.type).join(',')));
  await ev(() => {
    const g = window.__app.session.game;
    window.__app.session.clearSelection();
    g.step = g.heldStep;
  });

  // ---- Drag-select: the box shows while dragging, and selects what it covers ----
  await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const n = g.nodes[g.player.capital];
    app.renderer.cam.focus(n.x, n.y, 0.2);
    app.renderer.cam.update(10);
  });
  await wait(300);
  // Ships of our own up and to the left of the Hearth (where ships happen to sit varies by map), and a
  // box around them.
  const box = await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const n = g.nodes[g.player.capital];
    const r = app.renderer;
    const pts = [];
    for (const [ox, oy] of [[-420, -380], [-340, -300], [-460, -260]]) {
      const u = g.spawnUnit('striker', g.playerId, n.id, { x: n.x + ox, y: n.y + oy });
      u.ax = u.x;
      u.ay = u.y;
      pts.push([r.sx(u.x), r.sy(u.y)]);
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs) - 14, Math.min(...ys) - 14, Math.max(...xs) + 14, Math.max(...ys) + 14];
  });
  const [dx0, dy0] = await toPage(box[0], box[1]);
  const [dx1, dy1] = await toPage(box[2], box[3]);
  await page.mouse.move(dx0, dy0);
  await page.mouse.down();
  await page.mouse.move((dx0 + dx1) / 2, (dy0 + dy1) / 2, { steps: 4 });
  await page.mouse.move(dx1, dy1, { steps: 4 });
  await wait(120);
  check('dragging shows a selection box', !!(await ev(() => window.__app.session.view.box)));
  check('the box is drawn in gold on screen', await ev(() => {
    const app = window.__app;
    const b = app.session.view.box;
    const g = app.session.screen.g;
    const y = Math.round(Math.min(b.y0, b.y1));
    const x0 = Math.round(Math.min(b.x0, b.x1)) + 4;
    const d = g.getImageData(x0, y, 20, 1).data;
    let gold = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 190 && d[i + 2] < 120) gold++;
    return gold >= 12;
  }));
  await page.mouse.up();
  await wait(150);
  check('releasing the box selects the ships inside', (await ev(() => window.__app.session.ownSelected().length)) > 0);
  await page.keyboard.press('Escape');

  // ---- The comms log never hides the end of a message ----
  const logTest = await ev(() => {
    const app = window.__app;
    const g = app.session.game;
    const long = 'The Corsairs have put a bounty on your house! A raid is coming, and it will be stronger than the last one you fought off.';
    g.notify(g.playerId, long + ' (first)', 'event', g.player.capital);
    g.notify(g.playerId, long + ' (second)', 'event', g.player.capital);
    app.hud.update(0.1);
    return long;
  });
  await wait(400);
  const logHints = () => ev(() => window.__app.hud.ui.lastHints.filter((h) => h.key.startsWith('log-')).map((h) => ({ key: h.key, x: h.x, y: h.y, h: h.h })));
  let lh = await logHints();
  check('the newest message is shown whole; older ones fold to a line', lh.length >= 2 && lh[0].h > 12 && lh[1].h <= 12, JSON.stringify(lh.map((x) => x.h)));
  {
    const [hx, hy] = await toPage(lh[1].x + 20, lh[1].y + 4);
    await page.mouse.move(hx, hy);
    await wait(400);
    const key = lh[1].key;
    lh = await logHints();
    check('pointing at a folded message unfolds it', (lh.find((x) => x.key === key)?.h ?? 0) > 12);
    await page.mouse.move(5, 300);
  }
  await page.keyboard.press('l');
  await wait(300);
  check('the full log (L) opens, with every message in full', await ev(() => window.__app.session.modal?.kind === 'log'));
  await page.keyboard.press('Escape');
  await wait(150);
  void logTest;

  // ---- Pause and speed ----
  await page.keyboard.press('Space');
  check('Space pauses', await ev(() => window.__app.session.paused));
  await page.keyboard.press('Space');
  await clickUi('speed2');
  check('speed buttons work', await ev(() => window.__app.session.speed === 2));
  await clickUi('speed1');

  // ---- Status and help ----
  await settle();
  await page.keyboard.press('u');
  check('U opens the status screen', await ev(() => window.__app.session.modal?.kind === 'status'));
  await clickUi('tab-rivals');
  await page.keyboard.press('Escape');
  await settle();
  await page.keyboard.press('h');
  check('H opens help', await ev(() => window.__app.session.modal?.kind === 'help'));
  await page.keyboard.press('Escape');

  // ---- Decisions wait if closed ----
  await settle();
  await ev(() => (window.__app.session.profile.settings.autoPause = true));
  await ev(() => {
    const g = window.__app.session.game;
    g.prompts.push({ id: 777, event: 'comet', node: g.player.capital, unit: -1 });
  });
  await wait(300);
  check('a decision opens itself (auto-pause)', await ev(() => window.__app.session.modal?.kind === 'event'));
  // (It came up by itself: for a moment it takes no key, so that a key already on its way does not
  // answer it or put it away unread.)
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  await wait(100);
  check('and takes no key for its first moment', await ev(() => window.__app.session.modal?.kind === 'event' && window.__app.session.game.prompts.find((p) => p.id === 777)?.result === undefined));
  await unheld();
  await page.keyboard.press('Escape');
  await wait(300);
  check('closing a decision does not reopen it', await ev(() => window.__app.session.modal === null));
  await clickUi('prompt');
  // (Its story comes in under a scan line; a key before it is all there brings all of it and answers nothing.)
  await unheld();
  await page.keyboard.press('1');
  await wait(200);
  check('choosing resolves the decision', await ev(() => window.__app.session.game.prompts.find((p) => p.id === 777)?.result !== undefined));
  await clickUi('ev-ok');

  // ---- Save, quit and continue ----
  await ev(() => window.__app.session.clearSelection());
  await page.keyboard.press('Escape');
  await wait(200);
  check('Esc opens the pause menu', await ev(() => window.__app.session.modal?.kind === 'menu'));
  const t0 = await ev(() => window.__app.session.game.time);
  await clickUi('m-4');
  await wait(600);
  check('save and quit returns to the menu with CONTINUE', (await page.$('[data-sa="continue"]')) !== null);
  check('the run in progress is the banner of the title screen: what it is, and one word for the click', await ev(() => {
    const h = document.querySelector('.hero[data-sa="continue"]');
    return !!h && /CLASSIC RUN IN PROGRESS/.test(h.textContent) && /played/.test(h.querySelector('.hero-line').textContent) && h.querySelector('.hero-go').textContent === 'CONTINUE' && !!h.querySelector('canvas.heir-art');
  }), await ev(() => document.querySelector('.hero')?.textContent.replace(/\s+/g, ' ')));
  check('and the First Night is not offered over it', (await page.$('[data-sa="first-night"]')) === null);

  // ---- A new run while one is saved: asked in a pop-up on LAUNCH, and the page stays put ----
  await page.setViewportSize({ width: 1100, height: 600 }); // short enough that the setup page scrolls
  await page.click('[data-sa="setup"]');
  await wait(300);
  check('the setup page carries no notice about the saved run (the pop-up on LAUNCH says it)', (await page.$('.notice')) === null && !/run in progress/i.test(await page.textContent('.page')));
  const scrollTop = () => ev(() => Math.round(document.querySelector('.screen').scrollTop));
  await ev(() => {
    const el = document.querySelector('.screen');
    el.scrollTop = el.scrollHeight;
  });
  const down = await scrollTop();
  await page.click('[data-sa="size:small"]');
  await wait(150);
  check('choosing an option does not jump the page back to the top', down > 100 && Math.abs((await scrollTop()) - down) < 40, `${down} then ${await scrollTop()}`);
  await page.click('[data-sa="launch"]');
  await wait(250);
  check('LAUNCH asks in a pop-up, in view, before replacing the saved run', await ev(() => {
    const d = document.querySelector('.dialog');
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && /START A NEW RUN\?/.test(d.textContent) && window.__app.screen === 'setup';
  }));
  check('and the page behind it has not moved', Math.abs((await scrollTop()) - down) < 40);
  check('the question has two answers, and the marked one is the launch that was asked for', await ev(() => {
    const b = [...document.querySelectorAll('.dialog button')];
    return b.length === 2 && b[0].dataset.sa === 'confirm-new' && b[0].classList.contains('primary') && b[1].dataset.sa === 'confirm-cancel' && !b[1].classList.contains('primary');
  }));
  check('continuing the saved run is not one of them', (await page.$('.dialog [data-sa="continue"]')) === null);
  check('it says that the saved run keeps its Legacy, and how much', /ends here/.test(await page.textContent('.dialog')) && /keeps the Legacy it has earned: ◆\d+/.test(await page.textContent('.dialog')), (await page.textContent('.dialog')).replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await wait(150);
  check('Esc cancels: still on the setup page, the save untouched', (await page.$('.dialog')) === null && (await ev(() => !!localStorage.getItem('hegemarch.run.v1') || Object.keys(localStorage).some((k) => /run/.test(k)))));
  await page.click('[data-sa="launch"]');
  await wait(150);
  await page.click('.dialog [data-sa="confirm-cancel"]');
  await wait(150);
  check('GO BACK closes the question: the setup as it was chosen, the save untouched', (await page.$('.dialog')) === null && (await ev(() => window.__app.screen === 'setup' && !!localStorage.getItem('hegemarch.run.v1') && !!document.querySelector('[data-sa="size:small"].active'))));
  // The saved run is where it always is: the banner of the title screen.
  await page.click('[data-sa="menu"]');
  await page.click('.hero[data-sa="continue"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 30000 });
  await page.setViewportSize({ width: 1366, height: 768 });
  await wait(300);
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 30000 });
  check('continue restores the run', Math.abs((await ev(() => window.__app.session.game.time)) - t0) < 2);
  check('restored run starts paused', await ev(() => window.__app.session.paused));

  // ---- An Ark that may learn an ability: its choice opens by itself (with auto-pause on), once ----
  await ev(() => {
    const a = window.__app;
    const s = a.session;
    const g = s.game;
    s.modal = null;
    s.paused = false;
    s.clearSelection();
    while (a.hud.tips.current) a.hud.tips.dismiss();
    s.profile.settings.autoPause = true;
    for (const p of g.prompts) if (p.result === undefined) g.cmdResolvePrompt(p.id, 0);
    const ark = g.units.get(g.player.ark);
    ark.pendingAbil = [];
    g.grantLevels(ark, ark.level < 3 ? 3 - ark.level : ark.level < 5 ? 5 - ark.level : 7 - ark.level);
  });
  await wait(600);
  check('the choice of an ability opens by itself', await ev(() => window.__app.session.modal?.kind === 'ability'));
  check('the ship powers up first: its abilities take no click until they are all there', await ev(() => window.__app.hud.modals.revealing() && !window.__app.hud.ui.rectOf('ab-0')));
  await unheld();
  check('then they do', !!(await uiRect('ab-0')));
  await page.keyboard.press('Escape');
  await wait(600);
  check('closed without a choice, it does not open again, and waits behind its button', await ev(() => window.__app.session.modal === null && window.__app.session.game.units.get(window.__app.session.game.player.ark).pendingAbil.length === 1) && !!(await ev(() => window.__app.hud.ui.rectOf('abil-' + window.__app.session.game.player.ark))));
  await ev(() => {
    const s = window.__app.session;
    const g = s.game;
    const ark = g.units.get(g.player.ark);
    g.cmdChooseAbility(g.playerId, ark.id, ark.pendingAbil[0][0]);
    s.profile.settings.autoPause = false;
    s.modal = null;
    s.paused = false;
  });

  // ---- A big moment is heralded across the screen: it stops nothing and takes no click ----
  const tell = (title) =>
    ev((t) => window.__app.session.game.notify(-1, `${t}!`, 'alert', undefined, false, { title: t, sub: 'A line under it.', tone: 'red' }), title);
  /** The middle of the herald showing, on the page (null when none). */
  const heraldAt = () =>
    ev(() => {
      const a = window.__app;
      const r = a.hud.heraldRect;
      if (!r.w) return null;
      const c = a.canvas.getBoundingClientRect();
      const k = c.width / a.session.screen.W;
      return { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
    });
  await page.mouse.move(5, 400);
  await ev(() => {
    const s = window.__app.session;
    s.modal = null;
    s.paused = false;
    s.speed = 1;
    window.__app.hud.modals.open({ kind: 'help' });
  });
  await tell('A TEST OF HERALDS');
  await wait(400);
  check('a herald waits while a dialog is open', await ev(() => window.__app.hud.heralds[0]?.h.title === 'A TEST OF HERALDS' && window.__app.hud.heralds[0].at < 0 && !window.__app.hud.heraldRect.w));
  await ev(() => window.__app.hud.modals.close());
  await wait(600);
  const shown = await ev(() => ({ at: window.__app.hud.heralds[0]?.at ?? -1, t: window.__app.session.game.time, halted: window.__app.session.halted }));
  check('and shows once it is closed', shown.at >= 0 && !!(await heraldAt()));
  await wait(500);
  check('the game runs on under it', !shown.halted && (await ev(() => window.__app.session.game.time)) > shown.t + 0.3);
  const hp = await heraldAt();
  await page.mouse.move(hp.x, hp.y, { steps: 4 });
  await wait(450);
  const under = await ev(() => ({ veil: window.__app.hud.heralds[0]?.veil ?? 1, hot: window.__app.hud.ui.hot }));
  check('under the pointer it turns see-through', under.veil < 0.3, String(under.veil));
  await page.mouse.move(5, 400, { steps: 4 });
  await wait(450);
  check('and solid again when the pointer leaves', (await ev(() => window.__app.hud.heralds[0]?.veil ?? 0)) > 0.95);
  await page.waitForFunction(() => window.__app.hud.heralds.length === 0, null, { timeout: 4000 }).catch(() => {});
  check('it is gone after a few seconds', await ev(() => window.__app.hud.heralds.length === 0 && !window.__app.hud.heraldRect.w));
  await page.mouse.move(hp.x, hp.y, { steps: 4 });
  await wait(300);
  check('it took no click: what is under it is just what was there without it', (await ev(() => window.__app.hud.ui.hot)) === under.hot, `${under.hot} / ${await ev(() => window.__app.hud.ui.hot)}`);
  await page.mouse.move(5, 400);
  await ev(() => (window.__app.session.paused = true));
  await tell('A PAUSED HERALD');
  await tell('A PAUSED HERALD');
  await tell('ANOTHER HERALD');
  await wait(400);
  // A Boon more waiting marks its button; one chosen does not.
  const flashAt = () => ev(() => window.__app.hud.boonReadyAt);
  const f0 = await flashAt();
  await ev(() => window.__app.session.game.player.pendingDrafts++);
  await wait(150);
  const f1 = await flashAt();
  await ev(() => window.__app.session.game.player.pendingDrafts--);
  await wait(150);
  check('one more Boon waiting marks its button with a flash; one fewer does not', f1 > f0 && (await flashAt()) === f1, `${f0} ${f1}`);
  check('it plays while the game is paused; the same news is heralded once, and the next waits its turn', await ev(() => {
    const h = window.__app.hud.heralds;
    return h.length === 2 && h[0].h.title === 'A PAUSED HERALD' && h[0].at >= 0 && h[1].h.title === 'ANOTHER HERALD' && h[1].at < 0;
  }));
  await ev(() => {
    window.__app.hud.heralds.length = 0;
    window.__app.session.paused = false;
  });

  // ---- A Destiny that runs on a clock shows the clock, a rival's too ----
  const clk = await ev(() => {
    const a = window.__app;
    const g = a.session.game;
    const rival = g.aliveEmpires().find((f) => f.id !== g.playerId);
    const v = ['domination', 'relics', 'treasury'].find((x) => g.victories.includes(x));
    if (!v || !rival) return null;
    const key = v === 'domination' ? 'holdTimer' : v === 'relics' ? 'relicTimer' : 'treasuryTimer';
    const was = rival[key];
    rival[key] = 30;
    const mine = g.player[key];
    g.player[key] = 10;
    const c = a.hud.destinyClocks();
    rival[key] = was;
    g.player[key] = mine;
    return { texts: c.map((x) => x.text), mine: c.map((x) => x.mine), left: c.map((x) => x.left) };
  });
  check('houses on the clock for a Destiny are countdowns, the soonest first', !clk || (clk.texts.length === 2 && clk.texts.every((t) => / IN \d+:\d\d$/.test(t)) && clk.left[0] <= clk.left[1] && clk.mine.includes(true) && clk.mine.includes(false) && clk.texts.some((t) => /YOURS IN/.test(t))), JSON.stringify(clk));

  // ---- Abandon and results ----
  await ev(() => window.__app.hud.modals.open({ kind: 'menu' }));
  await wait(150);
  await clickUi('m-5');
  await clickUi('cf-yes');
  await page.waitForSelector('.results', { timeout: 10000 });
  check('abandoning shows the results', (await page.textContent('.results .logo'))?.includes('DEFEAT'));
  check('legacy is awarded', await ev(() => JSON.parse(localStorage.getItem('hegemarch.profile.v1')).runs === 1));
  await wait(1700); // (the Legacy total counts up)
  check('Legacy is the headline of the results: how much, what it is for, and where to spend it', await ev(() => {
    const h = document.querySelector('.legacy-hero');
    const total = JSON.parse(localStorage.getItem('hegemarch.profile.v1')).legacy;
    return !!h && /Legacy is yours to keep/.test(h.textContent) && /Hall of Heirs/.test(h.textContent) && h.querySelector('#legacy-total').textContent === String(window.__app.results.report.total) && h.textContent.includes('◆' + total) && !!h.querySelector('[data-sa="results-hall"]') && !!h.querySelector('.lh-buys');
  }), await ev(() => document.querySelector('.legacy-hero')?.textContent.replace(/\s+/g, ' ').slice(0, 200)));
  check('the results name the seed and the setup', /Seed\s*\d+ · Small · /.test((await page.textContent('.results table.stats')) ?? ''), ((await page.textContent('.results table.stats')) ?? '').slice(-60));
  await page.click('[data-sa="copy-run"]');
  await wait(300);
  check('COPY RUN DETAILS copies the run (or, where the clipboard is refused, shows it to select)', await ev(() => {
    const b = document.querySelector('[data-sa="copy-run"]');
    const t = document.getElementById('run-details');
    return (b.textContent === 'COPIED' || !t.hidden) && /^Hegemarch v\d/.test(t.value) && /seed \d+, small/.test(t.value) && /Defeat by/.test(t.value);
  }), await ev(() => document.getElementById('run-details')?.value.slice(0, 160)));
  await page.screenshot({ path: '.shots/e2e-results.png' });
  await page.click('[data-sa="results-again"]');
  check('after a run, setup skips the First Night card', (await page.$('[data-sa="launch"]')) !== null);

  // ---- A new run over a saved one: the saved run ends as an abandoned one, and is paid its Legacy ----
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(500);
  await ev(() => {
    const a = window.__app;
    const g = a.session.game;
    a.session.modal = null;
    for (let i = 0; i < 20 * 90; i++) g.step();
    // (Save and quit, as the pause menu does.)
    a.autosave();
    a.teardownSession();
    a.showMenu();
    void a.attract.start();
  });
  await wait(300);
  const tally = () => ev(() => {
    const p = JSON.parse(localStorage.getItem('hegemarch.profile.v1'));
    return { legacy: p.legacy, runs: p.runs, last: p.history[0], saved: !!localStorage.getItem('hegemarch.run.v1') };
  });
  const was = await tally();
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="launch"]');
  await wait(200);
  const promised = Number(/◆(\d+)/.exec(await page.textContent('.dialog'))?.[1] ?? -1);
  await page.screenshot({ path: '.shots/e2e-new-run-question.png' });
  await page.click('.dialog [data-sa="confirm-new"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(300);
  const now = await tally();
  const toast = await ev(() => window.__app.session.toast?.text ?? '');
  check('START NEW RUN starts the new run', was.saved && (await ev(() => window.__app.session.game.time < 5)));
  check('the run it replaced is paid the Legacy the question promised', promised > 0 && now.legacy === was.legacy + promised, `${was.legacy} + ${promised} -> ${now.legacy}`);
  check('and is entered in the Chronicle as a run that ended', now.runs === was.runs + 1 && now.last.won === false && now.last.legacy === promised, JSON.stringify(now.last));
  check('the new run says so', toast === `Your last run ended: +${promised} Legacy.`, toast);
} catch (e) {
  failures++;
  console.error('FAILED:', e);
  await page.screenshot({ path: '.shots/e2e-failure.png' }).catch(() => {});
}
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
