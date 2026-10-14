// Every decision (and the outcome of each of its choices), level-ups with the choices that take the most
// room, the omens card with every pair of omens, and heralds with the longest names, at the smallest game
// screens (400x225 and 480x270, and a tall narrow one): all of it inside its frame, the frame on the
// screen, and a herald under the objective banner.
//   node scripts/fit.mjs     (npm run test:fit; needs a dev server)
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const EVENTS = [...fs.readFileSync('src/game/data/events.ts', 'utf8').matchAll(/^\s{4}id: '(\w+)', kind:/gm)].map((m) => m[1]);
const TRAITS = [...fs.readFileSync('src/game/data/traits.ts', 'utf8').matchAll(/id: '(\w+)', name:/g)].map((m) => m[1]);
const AMBITIONS = [...fs.readFileSync('src/game/data/ambitions.ts', 'utf8').matchAll(/id: '(\w+)', name:/g)].map((m) => m[1]);
console.log(`${EVENTS.length} events, ${TRAITS.length} omens, ${AMBITIONS.length} ambitions`);
const problems = [];

for (const [label, vw, vh, px] of [['400x225', 1200, 675, 'large'], ['480x270', 1440, 810, 'auto'], ['400x450', 800, 900, 'large']]) {
  const { browser, page, errors } = await openBrowser({ viewport: { width: vw, height: vh } });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  await page.addInitScript((pixelSize) => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
    tutorialDone: true, runs: 6, heirs: ['concord', 'vael', 'wayfarer', 'nyx', 'ironclad', 'ashen'],
    seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted', 'starfall'],
    settings: { autoPause: false, tips: false, pixelSize },
  })), px);
  await page.goto(DEV_URL);
  await wait(1500);
  await page.click('[data-sa="setup"]');
  await page.click('[data-sa="size:large"]');
  await page.click('[data-sa="launch"]');
  await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
  await wait(600);
  const dims = await ev(() => [window.__app.session.screen.W, window.__app.session.screen.H]);
  console.log(label, 'game pixels', dims.join('x'));
  await ev(() => {
    const s = window.__app.session;
    s.paused = true;
    s.game.player.embers = 99999;
  });
  /** What the dialog on screen holds: its frame, and every region and hint in it; anything outside its frame or the screen is a problem. */
  const fits = (what, ids) =>
    ev(([w, re]) => {
      const a = window.__app;
      const { W, H } = a.session.screen;
      const ui = a.hud.ui;
      const f = ui.regions.find((r) => r.id === 'modal');
      if (!f) return [`${w}: no dialog`];
      const bad = [];
      if (f.x < 0 || f.y < 0 || f.x + f.w > W || f.y + f.h > H) bad.push(`${w}: frame off screen ${f.x},${f.y} ${f.w}x${f.h} on ${W}x${H}`);
      const rx = new RegExp(re);
      for (const r of [...ui.regions, ...ui.hints.map((h) => ({ id: h.key, x: h.x, y: h.y, w: h.w, h: h.h }))]) {
        if (!rx.test(r.id)) continue;
        if (r.x < f.x || r.y < f.y || r.x + r.w > f.x + f.w || r.y + r.h > f.y + f.h) bad.push(`${w}: ${r.id} ${r.x},${r.y} ${r.w}x${r.h} outside its frame ${f.x},${f.y} ${f.w}x${f.h}`);
      }
      return bad;
    }, [what, ids]);
  const frame = () => wait(120);

  // ---- Every decision, all there; then the outcome of each of its choices.
  for (const id of EVENTS) {
    await ev((e) => {
      const a = window.__app;
      const g = a.session.game;
      a.session.modal = null;
      a.hud.modals.result = null;
      g.prompts.push({ id: 880000, event: e, node: g.player.capital, unit: g.player.ark });
      a.hud.modals.open({ kind: 'event', promptId: 880000 });
    }, id);
    await frame();
    await ev(() => (window.__app.hud.modals.evAt -= 60));
    await frame();
    problems.push(...(await fits(`[${label}] event ${id}`, '^(choice-|modal-close|ev-story)')));
    const n = await ev(() => window.__app.hud.ui.regions.filter((r) => /^choice-/.test(r.id)).length);
    if (!n) problems.push(`[${label}] event ${id}: no choices to click`);
    for (let i = 0; i < n; i++) {
      // (A choice's outcome, as it reads; on a copy of the decision so that each choice is tried.)
      const text = await ev(([e, k]) => {
        const a = window.__app;
        const g = a.session.game;
        a.session.modal = null;
        g.prompts = g.prompts.filter((p) => p.id < 880000);
        g.prompts.push({ id: 880001 + k, event: e, node: g.player.capital, unit: g.player.ark });
        const r = g.cmdResolvePrompt(880001 + k, k);
        if (r === null) return null;
        a.hud.modals.result = { promptId: 880001 + k, text: r };
        a.session.modal = { kind: 'event', promptId: 880001 + k };
        return r;
      }, [id, i]);
      if (text === null) continue;
      await frame();
      await ev(() => (window.__app.hud.modals.evAt -= 60));
      await frame();
      problems.push(...(await fits(`[${label}] event ${id} outcome ${i + 1} ("${text.slice(0, 40)}…")`, '^(ev-ok|ev-story)')));
      if (!(await ev(() => !!window.__app.hud.ui.rectOf('ev-ok')))) problems.push(`[${label}] event ${id} outcome ${i + 1}: no CONTINUE`);
    }
    await ev(() => {
      const a = window.__app;
      a.session.modal = null;
      a.hud.modals.result = null;
      a.session.game.prompts = a.session.game.prompts.filter((p) => p.id < 880000);
    });
  }

  // ---- Level-ups: an Ark and a Dreadnought, with the three choices that take the most room.
  for (const type of ['ark', 'dreadnought']) {
    for (const set of [['snare', 'emp', 'repairdrones'], ['aegis', 'strikewing', 'nanite'], ['rally', 'overdrive', 'barrage']]) {
      await ev(([t, abil]) => {
        const a = window.__app;
        const g = a.session.game;
        a.session.modal = null;
        const u = t === 'ark' ? g.units.get(g.player.ark) : g.spawnUnit('dreadnought', g.playerId, g.player.capital);
        u.pendingAbil = [abil];
        a.hud.modals.open({ kind: 'ability', unitId: u.id });
      }, [type, set]);
      await frame();
      await ev(() => (window.__app.hud.modals.abAt -= 60));
      await frame();
      problems.push(...(await fits(`[${label}] level-up of a ${type}: ${set.join(', ')}`, '^ab-')));
      if ((await ev(() => window.__app.hud.ui.regions.filter((r) => /^ab-\d/.test(r.id)).length)) !== 3) problems.push(`[${label}] level-up of a ${type}: not three choices to click`);
    }
  }
  await ev(() => (window.__app.session.modal = null));

  // ---- The omens card: every pair of omens, with the longest Ambition and with none.
  for (const a1 of TRAITS) {
    for (const a2 of TRAITS) {
      if (a1 >= a2) continue;
      for (const amb of ['corsairsBane', 'explorer', '']) {
        await ev(([x, y2, am]) => {
          const a = window.__app;
          const g = a.session.game;
          g.traits = [x, y2];
          g.ambition = am;
          a.session.modal = { kind: 'omens' };
        }, [a1, a2, amb]);
        await wait(40);
        await ev(() => (window.__app.hud.modals.omAt -= 60));
        await wait(40);
        problems.push(...(await fits(`[${label}] omens ${a1}+${a2} ${amb || '(no ambition)'}`, '^(omens-begin|om-)')));
      }
    }
  }
  console.log(label, 'omens checked');
  await ev(() => (window.__app.session.modal = null));

  // ---- Heralds with the longest names there are: on screen, under the objective banner.
  const heralds = await ev(() => {
    const a = window.__app;
    const g = a.session.game;
    const out = [];
    const long = 'Starfire Gate at Kaus Borealis IV';
    for (const h of [
      { title: 'THE IRONCLAD DOMINION FALLS', sub: 'Its Hearth has gone dark, taken by Ironclad Dominion.', tone: 'house', fid: 1 },
      { title: 'THE GATE IS HALF CHARGED', sub: 'Ironclad Dominion will be crowned unless you stop them.', tone: 'house', fid: 1 },
      { title: 'A STARFIRE GATE RISES', sub: `Ironclad Dominion is raising one at ${long}.`, tone: 'house', fid: 1 },
      { title: 'STARFALL ARMED', sub: 'Ironclad Dominion armed one at Kaus Borealis IV: it erupts in 2 minutes.', tone: 'red' },
      { title: 'THE AGE OF THE INDUSTRIAL REVOLUTION', sub: 'All your units are upgraded. A Boon of the new age awaits.', tone: 'gold' },
    ]) out.push(h);
    return out;
  });
  for (const h of heralds) {
    await ev((x) => {
      const a = window.__app;
      a.hud.heralds.length = 0;
      a.session.game.notify(-1, x.title, 'alert', undefined, false, x);
    }, h);
    await wait(900);
    const r = await ev(() => ({ r: window.__app.hud.heraldRect, b: window.__app.hud.bannerRect, W: window.__app.session.screen.W, H: window.__app.session.screen.H }));
    if (!r.r.w) problems.push(`[${label}] herald "${h.title}" not shown`);
    else {
      if (r.r.x < 0 || r.r.x + r.r.w > r.W || r.r.y + r.r.h > r.H) problems.push(`[${label}] herald "${h.title}" off screen: ${JSON.stringify(r.r)} on ${r.W}x${r.H}`);
      if (r.b.w && r.r.y < r.b.y + r.b.h) problems.push(`[${label}] herald "${h.title}" over the objective banner`);
    }
  }
  await page.screenshot({ path: `.shots/review-${label}-herald.png` });
  if (errors.length) problems.push(...errors.map((e) => `[${label}] console: ${e}`));
  await browser.close();
}
for (const p of problems) console.log('FAIL  ' + p);
console.log(problems.length ? `${problems.length} FAILED` : 'ALL PASSED: all of it fits');
process.exit(problems.length ? 1 : 0);
