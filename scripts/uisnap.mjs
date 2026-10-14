// A snapshot of the interface: the proof that a change to the code changed nothing a player sees.
//
// The game is played in a browser whose clock the script holds (every frame comes when the script says
// so, and Math.random is seeded), a fixed sector is staged scene by scene (every card, every dialog, the
// menus, the end of a run), and of each scene three things are written down: the pixels of the game's
// canvas, every button of the HUD with its place and its tooltip, and the HTML of a menu page.
// `record` writes them; `check` stages the same scenes again and compares.
//
//   node scripts/uisnap.mjs record            before the change
//   node scripts/uisnap.mjs check             after it
//   node scripts/uisnap.mjs check --only=forge    the scenes whose name has "forge" in it (all are staged)
//
// (Needs a dev server: npx vite --port 5173 --strictPort. The snapshot lives in .golden/, not in git;
// a picture of every scene is saved to .shots/uisnap-*.png, to be looked at when one differs.)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const mode = process.argv[2];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const FILE = '.golden/ui.json';
const FULL = '.golden/ui-full.json';
if (mode !== 'record' && mode !== 'check') {
  console.log('usage: node scripts/uisnap.mjs record|check [--only=part-of-a-scene-name]');
  process.exit(2);
}
fs.mkdirSync('.golden', { recursive: true });
const sha = (v) => createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16);
const PROFILE = {
  tutorialDone: true, runs: 4, wins: 1, legacy: 140, maxDifficulty: 1, agesSeen: true,
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'dawn', 'boonReady', 'anomalySeen', 'blueprint', 'arkLevel', 'lostWorld', 'converted', 'crisis', 'ageReady', 'ageNew', 'ageSiege', 'ageRival', 'ageGone', 'ageArk'],
  settings: { autoPause: false },
};
const T0 = new Date('2026-03-01T10:00:00Z');

let scenes = {};
let full = {};
let order = [];
const allErrors = [];

/** A page whose time stands still until `frames` moves it. */
async function open() {
  const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 } });
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(new Date(T0.getTime() + 1000));
  await page.addInitScript((profile) => {
    let a = 12345;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem('hegemarch.profile.v1', JSON.stringify(profile));
      sessionStorage.setItem('seeded', '1');
    }
  }, PROFILE);
  await page.goto(DEV_URL);
  await page.waitForTimeout(1500);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // (The app measures a frame from the one before, and the first from the moment it was made: that
  // moment is a millisecond or two after the page's, never the same twice.)
  await ev(() => (window.__app.last = 0));
  const frames = (ms = 160) => page.clock.runFor(ms);
  /** Write a scene down: the game's pixels, buttons and tooltips while a run is on the screen; the page's HTML otherwise. */
  const snap = async (name, { pixels = true } = {}) => {
    // (The camera is where it is going, and two frames have been drawn since the last change.)
    await ev(() => window.__app.screen === 'game' && window.__app.renderer.cam.update(10));
    await frames(160);
    const got = await ev((wantPixels) => {
      const app = window.__app;
      const out = { screen: app.screen };
      if (app.screen === 'game' && app.hud) {
        const ui = app.hud.ui;
        const say = (t) => (typeof t === 'function' ? t() : t) ?? '';
        out.regions = ui.regions.map((r) => [r.id, r.x, r.y, r.w, r.h, r.disabled ? 1 : 0, say(r.tipTitle), say(r.tip), (r.terms ?? []).map((t) => t.id).join(',')]);
        out.hints = ui.hints.map((h) => [h.key, h.x, h.y, h.w, h.h, say(h.tipTitle), say(h.tip), (h.terms ?? []).map((t) => t.id).join(',')]);
        if (wantPixels) {
          const c = document.getElementById('game');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let h = 2166136261;
          for (let i = 0; i < d.length; i++) {
            h ^= d[i];
            h = Math.imul(h, 16777619);
          }
          out.pixels = (h >>> 0).toString(16) + ' ' + c.width + 'x' + c.height;
        }
      } else {
        out.html = document.getElementById('ui').innerHTML;
      }
      return out;
    }, pixels);
    if (scenes[name]) throw new Error('two scenes are named ' + name);
    order.push(name);
    full[name] = got;
    scenes[name] = { screen: got.screen, pixels: got.pixels, regions: got.regions && sha(got.regions), hints: got.hints && sha(got.hints), html: got.html !== undefined ? sha(got.html) : undefined };
    await page.screenshot({ path: `.shots/uisnap-${name}.png` });
  };
  const close = async () => {
    allErrors.push(...errors);
    await browser.close();
  };
  return { page, ev, frames, snap, close };
}

/** Rest the pointer on a HUD region (found by its id) long enough for its tooltip. */
async function hoverUi(t, id, fx = 0.5, fy = 0.5) {
  const p = await t.ev(([rid, ax, ay]) => {
    const app = window.__app;
    const r = app.hud.ui.rectOf(rid);
    if (!r) return null;
    const c = app.canvas.getBoundingClientRect();
    const k = c.width / app.session.screen.W;
    return { x: c.left + (r.x + r.w * ax) * k, y: c.top + (r.y + r.h * ay) * k };
  }, [id, fx, fy]);
  if (!p) throw new Error('no UI region ' + id);
  await t.page.mouse.move(p.x - 3, p.y - 2);
  await t.page.mouse.move(p.x, p.y);
  await t.frames(900);
}
const away = async (t) => {
  await t.page.mouse.move(640, 5);
  await t.frames(160);
};

/** Launch a run from the setup page on a seed, and hold it at its first frame. */
async function launch(t, seed) {
  await t.ev((s) => (window.__app.setup.seed = s), String(seed));
  await t.page.click('[data-sa="launch"]');
  for (let i = 0; i < 400 && (await t.ev(() => window.__app.screen)) !== 'game'; i++) await t.frames(50);
  if ((await t.ev(() => window.__app.screen)) !== 'game') throw new Error('the run did not start');
  await t.frames(400);
}

/**
 * Load the game once and let it be. (After a change to the code the dev server builds what changed on
 * the first request, and may then reload the page under whoever asked: better that it is this one.)
 */
async function warmUp() {
  const { browser, page } = await openBrowser({ viewport: { width: 1280, height: 720 } });
  await page.goto(DEV_URL);
  await page.waitForFunction(() => window.__app, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await browser.close();
}

/** Stage every scene once. */
async function stageAll() {
  scenes = {};
  full = {};
  order = [];
  // ------------------------------------------------------------------------------------ the menus
  {
    const t = await open();
    await t.frames(400);
    await t.snap('menu');
    for (const [name, clicks] of [
      ['setup', ['[data-sa="setup"]']],
      ['setup-small-hard', ['[data-sa="size:small"]', '[data-sa="diff:1"]', '[data-sa="heir:concord"]']],
      ['setup-ages', ['[data-sa="menu"]', '[data-sa="ages"]']],
      ['setup-daily', ['[data-sa="menu"]', '[data-sa="daily"]']],
      ['hall', ['[data-sa="menu"]', '[data-sa="hall"]']],
      ['settings', ['[data-sa="menu"]', '[data-sa="settings"]']],
      ['howto', ['[data-sa="menu"]', '[data-sa="howto"]']],
    ]) {
      for (const sel of clicks) {
        await t.page.click(sel);
        await t.frames(120);
      }
      await t.snap(name);
    }
    await t.close();
  }

  // ------------------------------------------------------------------------------------ a classic run
  {
    const t = await open();
    const { ev, frames, snap, page } = t;
    await page.click('[data-sa="setup"]');
    await frames(120);
    await page.click('[data-sa="size:medium"]');
    await launch(t, 424242);
    // (The omens come in under their stars, the Ambition last: under two and a half seconds.)
    await frames(900);
    await snap('omens-coming');
    await frames(3000);
    await snap('omens');
    await ev(() => {
      const s = window.__app.session;
      s.modal = null;
      s.paused = true;
    });
    await snap('start');
    await ev(() => {
      const s = window.__app.session;
      s.selectNode(s.game.player.capital);
      s.focusNode(s.game.player.capital, 0.2);
    });
    await snap('hearth-start');
    // A minute and a half in: the Hearth's walls are still rising, ours and a rival's.
    await ev(() => {
      const g = window.__app.session.game;
      g.fxEnabled = false;
      for (let i = 0; i < 90 * 20; i++) g.step();
      g.fx.length = 0;
      g.fxEnabled = true;
    });
    await snap('hearth-walls');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const r = g.factions.find((f) => f.kind === 'empire' && !f.isPlayer);
      g.player.explored[r.capital] = 1;
      s.view.reveal = true;
      s.selectNode(r.capital);
      s.focusNode(r.capital, 0.2);
    });
    await snap('rival-hearth');
    // Fourteen minutes of a simple autopilot, so that the sector fills up; then a few things by hand.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      s.view.reveal = false;
      s.clearSelection();
      g.fxEnabled = false;
      const p = g.player;
      for (let t = 0; t < 14 * 60 * 20; t++) {
        g.step();
        if (t % 200 === 0) {
          while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
          for (const pr of g.prompts) if (pr.result === undefined) g.cmdResolvePrompt(pr.id, 0);
          g.prompts.length = 0;
          const dark = g.nodes
            .filter((n) => n.kind === 'planet' && n.owner === -1 && p.explored[n.id] && !g.hasHostiles(n.id, p.id))
            .sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id));
          if (dark[0]) g.cmdKindle(p.id, dark[0].id);
          g.cmdQueueShip(p.id, p.capital, ['striker', 'guardian', 'breaker'][(t / 200) % 3 | 0]);
        }
      }
      g.fx.length = 0;
      g.fxEnabled = true;
      const mines = g.worldsOf(p.id).filter((n) => n.capitalOf < 0 && n.role === 'mine' && n.retool <= 0);
      const byHearth = mines.find((n) => g.hops(n.id, p.capital) === 1) ?? mines[0];
      const forge = mines.find((n) => n !== byHearth);
      const obs = mines.find((n) => n !== byHearth && n !== forge);
      for (const [n, role] of [[forge, 'forge'], [byHearth, 'bastion'], [obs, 'observatory']]) {
        if (!n) continue;
        n.role = role;
        n.retool = 0;
        n.fresh = undefined;
        g.refreshWorld(n);
      }
      if (byHearth) g.setLevel(byHearth, 2);
      g.addCard(p, 'bpStarbase');
      g.addCard(p, 'bpLancer');
      p.embers = 2500;
      window.__w = { forge: forge?.id ?? -1, bastion: byHearth?.id ?? -1, obs: obs?.id ?? -1, mine: mines.find((n) => n.role === 'mine')?.id ?? -1 };
      if (forge) {
        g.cmdQueueShip(p.id, forge.id, 'lancer');
        g.cmdQueueShip(p.id, forge.id, 'guardian');
        g.cmdSetRally(p.id, forge.id, p.capital);
      }
    });
    const world = async (name, pick, zoom = 0.2) => {
      const ok = await ev(([src, z]) => {
        const s = window.__app.session;
        const g = s.game;
        // eslint-disable-next-line no-new-func
        const id = new Function('g', 'p', 'w', `return (${src})(g, p, w)`)(g, g.player, window.__w);
        if (id === undefined || id === null || id < 0) return false;
        s.clearSelection();
        s.selectNode(id);
        s.focusNode(id, z);
        return true;
      }, [pick.toString(), zoom]);
      if (!ok) console.log(`(no place for the scene ${name} in this sector)`);
      else await snap(name);
    };
    await world('forge-world', (g, p, w) => w.forge);
    await hoverUi(t, 'role-observatory');
    await snap('hover-role');
    await hoverUi(t, 'build-lancer');
    await snap('hover-build');
    await away(t);
    await world('hearth', (g, p) => p.capital, 0.24);
    await hoverUi(t, 'bay');
    await snap('hover-bay');
    await away(t);
    await world('bastion', (g, p, w) => w.bastion);
    await world('observatory', (g, p, w) => w.obs);
    await world('mine', (g, p, w) => w.mine);
    await hoverUi(t, 'role-bastion');
    await snap('hover-bastion-role');
    await away(t);
    await world('star', (g, p) => g.nodes.find((n) => n.kind === 'star' && n.system === g.nodes[p.capital].system)?.id);
    await world('anomaly', (g, p) => g.nodes.find((n) => n.kind === 'anomaly' && p.explored[n.id])?.id);
    await ev(() => (window.__app.session.view.reveal = true));
    await world('dark-world', (g) => g.nodes.find((n) => n.kind === 'planet' && n.owner < 0)?.id);
    await world('relic', (g) => g.nodes.find((n) => n.kind === 'relic')?.id);
    await world('corsairs', (g) => g.nodes.find((n) => n.kind === 'pirate')?.id);
    await world('maw', (g) => g.nodes.find((n) => n.kind === 'rift')?.id);
    await world('rival-world', (g) => g.nodes.find((n) => n.kind === 'planet' && n.owner > 0 && n.capitalOf < 0 && g.factions[n.owner].kind === 'empire')?.id);
    await world('rival-hearth-late', (g) => g.factions.find((f) => f.kind === 'empire' && !f.isPlayer && f.capital >= 0)?.capital);
    await ev(() => {
      const app = window.__app;
      app.session.clearSelection();
      app.renderer.cam.fitAll();
    });
    await snap('sector');
    await ev(() => (window.__app.session.view.reveal = false));
    // Fleets: our own at the Hearth, one ship, the Ark, and a rival's.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const p = g.player;
      s.focusNode(p.capital, 0.24);
      s.selectUnits(g.buckets[p.capital].filter((u) => !u.dead && u.owner === p.id && u.type !== 'fighter').map((u) => u.id));
    });
    await snap('fleet');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const u = g.unitList.find((x) => !x.dead && x.owner === g.playerId && x.type === 'striker');
      if (u) s.selectUnits([u.id]);
    });
    await snap('one-ship');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const ark = g.units.get(g.player.ark);
      if (ark) {
        s.selectUnits([ark.id]);
        s.focusUnit(ark);
      }
    });
    await snap('ark');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      s.view.reveal = true;
      const u = g.unitList.find((x) => !x.dead && g.factions[x.owner].kind === 'empire' && x.owner !== g.playerId && x.node >= 0 && x.type !== 'scout');
      if (u) {
        s.selectUnits(g.buckets[u.node].filter((x) => !x.dead && x.owner === u.owner).map((x) => x.id));
        s.focusNode(u.node, 0.22);
      }
    });
    await snap('rival-fleet');
    await ev(() => {
      const s = window.__app.session;
      s.view.reveal = false;
      s.clearSelection();
    });
    // One of our worlds under attack off the screen: an arrow at the edge.
    await ev(() => {
      const app = window.__app;
      const g = app.session.game;
      const cap = g.nodes[g.player.capital];
      cap.lastHit = 0;
      const far = g.nodes.reduce((b, n) => (Math.hypot(n.x - cap.x, n.y - cap.y) > Math.hypot(b.x - cap.x, b.y - cap.y) ? n : b), cap);
      app.renderer.cam.focus(far.x, far.y, 0.2);
    });
    await snap('attack-arrow');
    // A big moment heralded across the screen, well into its hold.
    await ev(() => window.__app.session.game.notify(-1, 'LAST STAND! The defenders of the Hearth rise to arms.', 'alert', undefined, false, { title: 'LAST STAND', sub: 'The defenders of the Hearth rise to arms.', tone: 'red' }));
    await frames(1200);
    await snap('herald');
    await ev(() => (window.__app.hud.heralds.length = 0));
    await ev(() => {
      const s = window.__app.session;
      s.game.nodes[s.game.player.capital].lastHit = 999;
      s.focusNode(s.game.player.capital, 0.2);
    });
    // The dialogs.
    const dialog = async (name, stage) => {
      await ev(stage);
      await snap(name);
    };
    // (A ship rising a level powers up first: rings close on it, then a flash; its abilities come in after, under a second and a half in all.)
    await ev(() => {
      const app = window.__app;
      const g = app.session.game;
      const ark = g.units.get(g.player.ark);
      g.grantLevels(ark, 3 - ark.level);
      app.hud.modals.open({ kind: 'ability', unitId: ark.id });
    });
    await frames(200);
    await snap('ability-powering');
    await frames(2000);
    await snap('ability');
    await dialog('menu-dialog', () => (window.__app.session.modal = { kind: 'menu' }));
    await dialog('settings-dialog', () => (window.__app.session.modal = { kind: 'settings' }));
    for (const tab of ['basics', 'controls', 'tips']) await dialog('help-' + tab, new Function(`window.__app.session.modal = null; window.__app.hud.modals.open({ kind: 'help', tab: '${tab}' });`));
    for (const tab of ['destinies', 'boons', 'rivals', 'run']) await dialog('status-' + tab, new Function(`window.__app.session.modal = null; window.__app.hud.modals.open({ kind: 'status', tab: '${tab}' });`));
    await ev(() => window.__app.hud.modals.wheel(400));
    await snap('status-run-scrolled');
    await dialog('log', () => {
      window.__app.session.modal = null;
      window.__app.hud.modals.open({ kind: 'log' });
    });
    await dialog('destinies-card', () => (window.__app.session.modal = { kind: 'destinies' }));
    await dialog('night-done', () => (window.__app.session.modal = { kind: 'nightDone' }));
    await dialog('confirm', () => (window.__app.session.modal = { kind: 'confirm', text: 'Abandon this run? It will count as a defeat.', yes: 'ABANDON', onYes: () => {} }));
    const draft = (offer, own = []) => `(() => {
      const app = window.__app; const g = app.session.game; const p = g.player;
      app.session.modal = null;
      for (const id of ${JSON.stringify(own)}) g.addCard(p, id);
      p.pendingDrafts = 1; p.draftOffer = ${JSON.stringify(offer)};
      app.hud.modals.open({ kind: 'draft' });
    })()`;
    // (The cards come in one by one, a Legendary last: under three seconds in all.)
    await ev(draft(['bpCarrier', 'hotBarrels', 'goldenAge', 'bloodPact']));
    await frames(4000);
    await snap('draft-blueprint');
    await ev(draft(['kindlingRites', 'fighterBays', 'bpCarrier', 'gildedCage']));
    await frames(4000);
    await hoverUi(t, 'card-0', 0.5, 0.3);
    await snap('hover-card-first');
    await hoverUi(t, 'card-3', 0.5, 0.3);
    await snap('hover-card-last');
    await away(t);
    await ev(draft(['strikerWings', 'emberTithe', 'singularity', 'gildedCage'], ['strikerWings', 'emberTithe', 'emberTithe']));
    await frames(4000);
    await snap('draft-stacks');
    // A Legendary coming in: the motes rise on its pad, and its face is half drawn.
    await ev(draft(['strikerWings', 'singularity', 'emberTithe']));
    await frames(1700);
    await snap('draft-coming');
    await ev(() => {
      const app = window.__app;
      app.session.modal = null;
      app.session.game.player.pendingDrafts = 0;
      app.session.game.player.draftOffer = null;
    });
    await snap('boon-tray');
    await dialog('boons-screen', () => window.__app.hud.modals.open({ kind: 'status', tab: 'boons' }));
    // (A decision's story comes in word by word, and its choices after it: four seconds for all of it.)
    await ev(() => {
      const app = window.__app;
      const g = app.session.game;
      app.session.modal = null;
      g.prompts.push({ id: 900001, event: 'derelict', node: g.worldsOf(g.playerId)[0].id, unit: -1 });
      app.hud.modals.open({ kind: 'event', promptId: 900001 });
    });
    await frames(4000);
    await snap('event');
    await hoverUi(t, 'choice-0', 0.3, 0.5);
    await snap('hover-event-choice');
    await away(t);
    await dialog('event-unbidden', () => {
      const app = window.__app;
      const g = app.session.game;
      app.session.modal = null;
      g.prompts.push({ id: 900002, event: 'comet', node: g.player.capital, unit: -1 });
      app.hud.modals.open({ kind: 'event', promptId: 900002, unbidden: true });
    });
    await frames(4000);
    await ev(() => window.__app.hud.ui.rectOf('choice-0')?.onClick());
    await frames(3000);
    await snap('event-outcome');
    // A decision coming in: the story half there, a word fading up out of the dark.
    await ev(() => {
      const app = window.__app;
      const g = app.session.game;
      app.session.modal = null;
      g.prompts.push({ id: 900003, event: 'sentinels', node: g.player.capital, unit: -1 });
      app.hud.modals.open({ kind: 'event', promptId: 900003 });
    });
    await frames(1100);
    await snap('event-coming');
    await ev(() => {
      const app = window.__app;
      app.session.modal = null;
      app.session.game.prompts.length = 0;
    });
    // Not paused: the top bar and the map of a game that runs (two seconds of it).
    await ev(() => (window.__app.session.paused = false));
    await frames(2000);
    await ev(() => (window.__app.session.paused = true));
    await snap('running');
    // The end of the run: the crowning, its tally, and the results.
    await ev(() => {
      const s = window.__app.session;
      s.game.declareWinner(0, 'domination', 'Solar Concord rules the sector.');
      s.paused = false;
    });
    await frames(1500);
    await snap('ending-moment');
    await frames(5500);
    await snap('ending-crowning');
    await frames(6000);
    await snap('ending-tally');
    await page.keyboard.press('Enter');
    await frames(300);
    await page.keyboard.press('Enter');
    for (let i = 0; i < 100 && !(await page.$('.results')); i++) await frames(100);
    await frames(3000);
    await snap('results');
    await t.close();
  }

  // ------------------------------------------------------------------------------------ a run with a Starfall
  {
    const t = await open();
    const { ev, frames, snap, page } = t;
    await page.click('[data-sa="setup"]');
    await frames(120);
    await page.click('[data-sa="size:small"]');
    await launch(t, 616161);
    // Its button at the Hearth, once the Blueprint is drafted.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      s.modal = null;
      s.paused = true;
      for (const f of g.factions) if (!f.isPlayer) f.ai = null;
      g.addCard(g.player, 'bpStarfall');
      g.player.embers = 3000;
      s.selectNode(g.player.capital);
      s.focusNode(g.player.capital, 0.2);
    });
    await frames(300);
    await hoverUi(t, 'starfall');
    await snap('starfall-hearth');
    // The device, just built: ARM is on its card, greyed away from a star.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const d = g.spawnUnit('starfall', g.playerId, g.player.capital, { x: g.nodes[g.player.capital].x + 160, y: g.nodes[g.player.capital].y });
      s.selectUnits([d.id], false, false);
    });
    await frames(300);
    await hoverUi(t, 'arm');
    await snap('starfall-device');
    // Armed at the home star: the clock over the star and at the top right, and what its card says.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const d = g.starfallOf(g.playerId);
      const star = g.starOf(g.nodes[g.player.capital]);
      g.buckets[d.node].splice(g.buckets[d.node].indexOf(d), 1);
      d.node = star.id;
      d.x = d.ax = star.x + 110;
      d.y = d.ay = star.y;
      g.buckets[star.id].push(d);
      g.cmdArm(g.playerId, d.id);
      s.selectUnits([d.id], false, false);
      s.focusNode(star.id, 0.2);
    });
    await page.mouse.move(5, 5);
    await frames(1500);
    await snap('starfall-armed');
    // A world in that system says what is coming.
    await ev(() => {
      const s = window.__app.session;
      s.selectNode(s.game.player.capital);
    });
    await frames(300);
    await snap('starfall-doomed');
    // The star after the eruption, and its card.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const d = g.starfallOf(g.playerId);
      d.fuse = 0.04;
      s.selectNode(d.node);
      s.paused = false;
    });
    await frames(3000);
    await ev(() => (window.__app.session.paused = true));
    await frames(200);
    await snap('starfall-burning');
    // Two houses' seed ships at one dark world: a ring for each on the map, and the card says who is ahead.
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const p = g.player;
      const rival = g.empires().find((f) => f.id !== p.id && f.alive);
      const world = g.nodes.filter((n) => n.kind === 'planet' && n.owner === -1).sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id))[0];
      for (const u of [...g.buckets[world.id]]) g.removeUnit(u);
      g.buckets[world.id].length = 0;
      p.explored[world.id] = 1;
      p.visible[world.id] = 1;
      const seeds = [[p.id, 9, -1], [rival.id, 14, 1]].map(([fid, kindle, side]) => {
        const u = g.spawnUnit('seed', fid, world.id, { x: world.x + side * (world.r + 70), y: world.y + 30 });
        g.cmdSendSeed(fid, u.id, world.id);
        u.kindle = kindle;
        return u;
      });
      g.buckets[world.id].push(...seeds.filter((u) => !g.buckets[world.id].includes(u)));
      s.clearSelection();
      s.selectNode(world.id);
      s.focusNode(world.id, 0.3);
    });
    await page.mouse.move(900, 250);
    await frames(1200);
    await snap('kindle-race');
    await t.close();
  }

  // ------------------------------------------------------------------------------------ an Ages run, on its cradle
  {
    const t = await open();
    const { ev, frames, snap, page } = t;
    await page.click('[data-sa="ages"]');
    await frames(120);
    await launch(t, 515151);
    await snap('cradle-card');
    await ev(() => {
      const s = window.__app.session;
      s.modal = null;
      s.paused = true;
      s.selectNode(s.game.player.capital);
    });
    await snap('cradle-hearth');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      const p = g.player;
      g.fxEnabled = false;
      for (let i = 0; i < 6 * 60 * 20; i++) {
        g.step();
        if (i % 200 === 0) {
          while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p)[0]);
          const dark = g.nodes.filter((n) => n.kind === 'planet' && n.owner === -1 && p.explored[n.id] && !g.hasHostiles(n.id, p.id)).sort((a, b) => g.pathLen(p.capital, a.id) - g.pathLen(p.capital, b.id));
          if (dark[0]) g.cmdKindle(p.id, dark[0].id);
        }
      }
      g.fx.length = 0;
      g.fxEnabled = true;
      p.lore += 400;
      p.embers += 900;
      s.selectNode(p.capital);
    });
    await snap('cradle-later');
    await ev(() => {
      const s = window.__app.session;
      const g = s.game;
      s.selectUnits(g.unitList.filter((u) => !u.dead && u.owner === g.playerId).map((u) => u.id));
    });
    await snap('cradle-units');
    await ev(() => {
      window.__app.session.clearSelection();
      window.__app.hud.modals.open({ kind: 'status' });
    });
    await snap('cradle-status');
    await ev(() => {
      window.__app.session.modal = null;
      window.__app.hud.modals.open({ kind: 'help' });
    });
    await snap('cradle-help');
    await ev(() => {
      const s = window.__app.session;
      s.modal = null;
      s.game.cmdAdvance(s.game.playerId);
      s.selectNode(s.game.player.capital);
    });
    await snap('cradle-advancing');
    await t.close();
  }
  return { scenes, full, order };
}

// ------------------------------------------------------------------------------------ the verdict
if (mode === 'record') {
  // Twice: what is not the same both times cannot be compared later. (Buttons, tooltips and pages always
  // are; of the pixels, a scene or two has something that turns on a millisecond.)
  await warmUp();
  const first = await stageAll();
  const second = await stageAll();
  const loose = [];
  for (const name of second.order) {
    const a = first.scenes[name];
    const b = second.scenes[name];
    for (const k of ['screen', 'html', 'regions', 'hints']) if (!a || a[k] !== b[k]) throw new Error(`the scene ${name} is not the same twice (${k}): it cannot be recorded`);
    if (a.pixels !== b.pixels) {
      loose.push(name);
      delete b.pixels;
    }
  }
  if (allErrors.length) console.log('ERRORS in the page:\n  ' + allErrors.slice(0, 8).join('\n  '));
  fs.writeFileSync(FILE, JSON.stringify({ order: second.order, scenes: second.scenes }, null, 1));
  fs.writeFileSync(FULL, JSON.stringify(second.full));
  console.log(`${second.order.length} scenes recorded in ${FILE}${loose.length ? ` (pixels not compared in ${loose.length}: ${loose.join(', ')})` : ', pixels and all'}`);
  process.exit(allErrors.length ? 1 : 0);
}
if (!fs.existsSync(FILE)) {
  console.log(`nothing recorded in ${FILE}: run "node scripts/uisnap.mjs record" on the code before the change`);
  process.exit(2);
}
const want = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const wantFull = fs.existsSync(FULL) ? JSON.parse(fs.readFileSync(FULL, 'utf8')) : {};

/** A page without the game's version on it: a new version number is not a change to the page. */
const sansVersion = (html) =>
  html
    .replace(/\bv\d+\.\d+\.\d+\b/g, 'v#')
    // (the results page says it again in the run's details for a machine: JSON in base64, see app/rundata.ts)
    .replace(/Data: ([A-Za-z0-9+/=]+)/g, (all, b64) => {
      try {
        return 'Data: ' + JSON.stringify({ ...JSON.parse(Buffer.from(b64, 'base64').toString('utf8')), v: '#' });
      } catch {
        return all;
      }
    });

/** What differs between the recording and the scenes as they were just staged: scene name -> what to say of it. */
function compare() {
  const out = new Map();
  const names = [...new Set([...want.order, ...order])].filter((n) => !only || n.includes(only));
  for (const name of names) {
    const a = want.scenes[name];
    const b = scenes[name];
    if (!a || !b) {
      out.set(name, a ? 'no longer staged' : 'not recorded');
      continue;
    }
    let parts = ['screen', 'html', 'regions', 'hints', 'pixels'].filter((k) => a[k] !== b[k] && !(k === 'pixels' && a.pixels === undefined));
    if (parts.includes('html') && wantFull[name]?.html !== undefined && sansVersion(wantFull[name].html) === sansVersion(full[name].html ?? '')) parts = parts.filter((k) => k !== 'html');
    if (!parts.length) continue;
    const why = [];
    for (const k of ['regions', 'hints']) {
      if (!parts.includes(k)) continue;
      const x = wantFull[name]?.[k] ?? [];
      const y = full[name][k] ?? [];
      let i = 0;
      while (i < x.length && i < y.length && JSON.stringify(x[i]) === JSON.stringify(y[i])) i++;
      why.push(`${k}: ${x.length} then, ${y.length} now; the first that differs is number ${i}: ${JSON.stringify(x[i] ?? null).slice(0, 160)}  now  ${JSON.stringify(y[i] ?? null).slice(0, 160)}`);
    }
    if (parts.includes('html')) {
      const x = wantFull[name]?.html ?? '';
      const y = full[name].html ?? '';
      let i = 0;
      while (i < x.length && i < y.length && x[i] === y[i]) i++;
      why.push(`html: from character ${i}: …${x.slice(Math.max(0, i - 60), i + 80)}…  now  …${y.slice(Math.max(0, i - 60), i + 80)}…`);
    }
    if (parts.includes('pixels')) why.push(`pixels: ${a.pixels} then, ${b.pixels} now (see .shots/uisnap-${name}.png)`);
    out.set(name, `${parts.join(', ')}\n     ${why.join('\n     ')}`);
  }
  return { out, count: names.length };
}

await warmUp();
await stageAll();
let { out: diffs, count } = compare();
// A scene that differs is staged once more before it is called different: right after a change to the
// code the dev server is still busy, and a picture that is made over several frames can come a frame late.
let once = 0;
if (diffs.size) {
  await stageAll();
  const again = compare().out;
  once = [...diffs.keys()].filter((n) => !again.has(n)).length;
  diffs = new Map([...again].filter(([n]) => diffs.has(n)));
}
if (allErrors.length) console.log('ERRORS in the page:\n  ' + allErrors.slice(0, 8).join('\n  '));
for (const [name, what] of diffs) console.log(`DIFF ${name}: ${what}`);
const differ = diffs.size;
console.log(`${count} scenes · ${differ ? `${differ} DIFFER` : 'all the same'}${once ? ` (${once} came out differently once, and the same when staged again)` : ''}`);
process.exit(differ || allErrors.length ? 1 : 0);
