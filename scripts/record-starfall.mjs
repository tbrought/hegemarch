// A film and screenshots of the Starfall, for looking at without playing to one: a sector is played
// forward, the player's fleet brings a Starfall to a rival's home star and arms it, the rival's ships come
// for it, the fleet leaves at the last moment, and the star erupts and burns.
//   node scripts/record-starfall.mjs [out]     (needs a dev server: npx vite --port 5173 --strictPort)
// The film (.shots/starfall.mp4 by default) is recorded by the browser from the game's canvas and its
// sound. The middle of the two minutes runs at the game's own 3× speed, as its speed buttons show; nothing
// else is hurried. The screenshots (.shots/starfall-shot-*.png) are of the same scene and of two more:
// the Blueprint in a draft, and a rival's Starfall armed at the player's own star.
import fs from 'node:fs';
import { DEV_URL, openBrowser } from './lib/browser.mjs';

const out = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.shots/starfall';
const { browser, page, errors } = await openBrowser({ viewport: { width: 1280, height: 720 }, launch: { args: ['--autoplay-policy=no-user-gesture-required'] } });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await page.screenshot({ path: `.shots/starfall-shot-${name}.png` });
  console.log('shot', name);
};
/** Seconds left on the player's fuse (Infinity when nothing is armed). (Asked many times a second: it also keeps events from asking for a decision in the middle of the film.) */
const fuse = () =>
  ev(() => {
    const g = window.__app.session.game;
    g.prompts.length = 0;
    return g.armedStarfalls().find((d) => d.owner === g.playerId)?.fuse ?? Infinity;
  });
const untilFuse = async (seconds) => {
  for (let i = 0; i < 2400; i++) {
    const left = await fuse();
    // (Nothing armed any more: the star has erupted, or the Starfall was destroyed.)
    if (left <= seconds || left === Infinity) return;
    await wait(40);
  }
};

await page.addInitScript(() => localStorage.setItem('hegemarch.profile.v1', JSON.stringify({
  tutorialDone: true, runs: 6, wins: 2, maxDifficulty: 2, lastSetup: { heir: 'concord', size: 'medium', difficulty: 1 },
  seenTips: ['role', 'raid', 'anomaly', 'fleet', 'hangar', 'boonReady', 'anomalySeen', 'blueprint', 'crisis', 'arkLevel', 'lostWorld', 'converted'],
  settings: { autoPause: false, tips: true, muted: false, master: 0.8, sfx: 0.8, music: 0.6 },
})));
await page.goto(DEV_URL);
await wait(1500);
await page.click('[data-sa="setup"]');
// (Always the same sector: the film can be made again as it was.)
await ev(() => (window.__app.setup.seed = '20261012'));
await page.click('[data-sa="launch"]');
await page.waitForFunction(() => window.__app?.screen === 'game', null, { timeout: 60000 });
await wait(600);

// The sector, a quarter of an hour in: the rivals have grown by themselves, and the player's house as a player's would.
await ev(() => {
  const s = window.__app.session;
  const g = s.game;
  const p = g.player;
  s.modal = null;
  for (let i = 0; i < 15 * 60 * 20 && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
    while (p.pendingDrafts > 0) g.cmdChooseCard(p.id, g.ensureOffer(p).find((id) => id !== 'bpStarfall') ?? g.ensureOffer(p)[0]);
    g.prompts.length = 0;
    if (i % 900 === 0) {
      const dark = g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0).sort((a, b) => g.hops(a.id, p.capital) - g.hops(b.id, p.capital))[0];
      if (dark && g.hops(dark.id, p.capital) <= 4) {
        for (const u of [...g.buckets[dark.id]]) if (u.owner !== p.id) g.killUnit(u, -1);
        g.kindleWorld(dark, p.id);
        g.setLevel(dark, 1 + (i % 3));
      }
      p.embers += 400;
      for (const t of ['striker', 'guardian', 'breaker']) g.cmdQueueShip(p.id, p.capital, t);
    }
  }
  s.modal = null;
  s.paused = true;
});

// ---- 1. The Blueprint in a draft.
await ev(() => {
  const a = window.__app;
  const p = a.session.game.player;
  p.pendingDrafts = 1;
  p.draftOffer = ['hardHulls', 'bpStarfall', 'emberTithe'];
  a.hud.modals.open({ kind: 'draft' });
});
await wait(1600);
await shot('1-blueprint');
await ev(() => {
  const a = window.__app;
  const g = a.session.game;
  g.cmdChooseCard(g.playerId, 'bpStarfall');
  a.session.modal = null;
  g.player.embers = Math.max(g.player.embers, 3200);
  a.session.selectNode(g.player.capital);
  a.session.focusNode(g.player.capital, 0.2);
});
await wait(900);

// ---- 2. Its button at the Hearth.
const hover = async (id) => {
  const p = await ev((rid) => {
    const a = window.__app;
    const r = a.hud.ui.rectOf(rid);
    if (!r) return null;
    const c = a.canvas.getBoundingClientRect();
    const k = c.width / a.session.screen.W;
    return { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);
  if (p) await page.mouse.move(p.x, p.y);
  await wait(700);
};
await hover('starfall');
await shot('2-hearth');
await page.mouse.move(640, 200);

// ---- 3. At a rival's home star, with the fleet. (Staged: the fleet and the Starfall are put there.)
const scene = await ev(() => {
  const a = window.__app;
  const s = a.session;
  const g = s.game;
  const p = g.player;
  const rival = g.empires().filter((f) => f.id !== p.id && f.alive).sort((x, y) => g.worldsOf(y.id).length - g.worldsOf(x.id).length)[0];
  // (The rival's ships are given their orders by this script, so that the film shows what it means to.)
  rival.ai = null;
  const star = g.starOf(g.nodes[rival.capital]);
  for (const u of [...g.buckets[star.id]]) if (u.owner !== p.id) g.killUnit(u, -1);
  // (The sector is charted, so that the map is not black. It is not revealed: the film shows what the
  // player's house sees and no more. The first film was shot with the fog lifted, and so it did not show
  // that the house which armed a Starfall saw nothing of what it did: a playtester found that out.)
  for (let i = 0; i < g.nodes.length; i++) p.explored[i] = 1;
  const place = (u, i, n) => {
    const ang = (i / n) * Math.PI * 2;
    if (u.node >= 0) g.buckets[u.node].splice(g.buckets[u.node].indexOf(u), 1);
    u.lane = null;
    u.node = star.id;
    u.path = [];
    u.x = u.ax = star.x + Math.cos(ang) * 190;
    u.y = u.ay = star.y + Math.sin(ang) * 150;
    g.buckets[star.id].push(u);
  };
  const fleet = [];
  for (const [t, n] of [['striker', 6], ['guardian', 5], ['breaker', 3], ['lancer', 2], ['dreadnought', 1]]) for (let i = 0; i < n; i++) fleet.push(g.spawnUnit(t, p.id, star.id));
  fleet.forEach((u, i) => place(u, i, fleet.length));
  const d = g.spawnUnit('starfall', p.id, star.id);
  place(d, 0, 1);
  d.x = d.ax = star.x + 90;
  d.y = d.ay = star.y + 40;
  // The rival's fleet, at its Hearth: it will come for the Starfall.
  const guard = [];
  for (const [t, n] of [['striker', 4], ['guardian', 3], ['breaker', 3]]) for (let i = 0; i < n; i++) guard.push(g.spawnUnit(t, rival.id, rival.capital));
  const outside = star.lanes.find((id) => g.nodes[id].system !== star.system);
  s.selectUnits([d.id], false, false);
  // (Room in the hangar for the fleet that was put here: the top bar should not show it over full.)
  p.bays = 10;
  a.renderer.cam.focus(star.x, star.y, 0.3);
  return { star: star.id, name: star.name, rival: rival.id, rivalName: rival.name, hearth: rival.capital, dev: d.id, fleet: fleet.map((u) => u.id), guard: guard.map((u) => u.id), outside };
});
await wait(900);
await hover('arm');
await shot('3-device');
await page.mouse.move(640, 120);

// ---- The film. The recorder runs in the page; the scene is played from here.
await ev(async () => {
  const game = document.getElementById('game');
  const k = Math.max(1, Math.round(1280 / game.width));
  const big = document.createElement('canvas');
  big.width = game.width * k;
  big.height = game.height * k;
  const bg = big.getContext('2d');
  bg.imageSmoothingEnabled = false;
  const R = (window.__rec = { on: true, chunks: [] });
  const copy = () => {
    bg.drawImage(game, 0, 0, big.width, big.height);
    if (R.on) requestAnimationFrame(copy);
  };
  copy();
  const tracks = [...big.captureStream(30).getVideoTracks()];
  const sfx = window.__app.sfx;
  sfx.unlock?.();
  if (sfx.ctx && sfx.master) {
    await sfx.ctx.resume().catch(() => {});
    const dest = sfx.ctx.createMediaStreamDestination();
    sfx.master.connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }
  R.type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  R.audio = tracks.length > 1;
  R.size = [big.width, big.height];
  R.rec = new MediaRecorder(new MediaStream(tracks), { mimeType: R.type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  R.rec.ondataavailable = (e) => e.data.size && R.chunks.push(e.data);
  R.stopped = new Promise((r) => (R.rec.onstop = r));
  R.rec.start(250);
});
const t0 = Date.now();
await ev(() => {
  const s = window.__app.session;
  s.paused = false;
  s.speed = 1;
});
await wait(2500);
// Armed.
await ev((sc) => window.__app.hud.actions.arm(sc.dev), scene);
await wait(4500);
await shot('4-armed');
// The middle of the two minutes, at the game's 3× speed. The rival's fleet sets out for the star.
await ev((sc) => {
  const s = window.__app.session;
  const g = s.game;
  s.speed = 3;
  g.cmdMove(sc.rival, sc.guard, sc.star);
}, scene);
let sent = false;
for (let i = 0; i < 1200 && (await fuse()) > 26; i++) {
  // Once they are at the star, the ships that break structures go for the Starfall.
  if (!sent && (await ev((sc) => sc.guard.some((id) => window.__app.session.game.units.get(id)?.node === sc.star), scene))) {
    sent = true;
    await wait(700);
    await ev((sc) => {
      const g = window.__app.session.game;
      g.cmdAttack(sc.rival, sc.guard.filter((id) => g.units.get(id)?.type === 'breaker'), sc.dev);
    }, scene);
    await wait(2200);
    await shot('5-defenders');
  }
  await wait(50);
}
// The last seconds at the game's own pace: the fleet leaves, the Starfall stays.
await ev(() => (window.__app.session.speed = 1));
await untilFuse(18);
await ev((sc) => {
  const s = window.__app.session;
  const g = s.game;
  s.selectUnits(sc.fleet.filter((id) => g.units.get(id) && !g.units.get(id).dead), false, false);
  window.__app.hud.actions.orderAt(sc.outside);
}, scene);
await untilFuse(4);
await shot('6-last-seconds');
await untilFuse(0.05);
await wait(500);
await shot('7-eruption');
await wait(1500);
await shot('8-after');
await wait(6000);
// What it did, on the rival's Hearth.
await ev((sc) => {
  const s = window.__app.session;
  s.game.prompts.length = 0;
  s.clearSelection();
  s.selectNode(sc.hearth);
  s.focusNode(sc.hearth, 0.3);
}, scene);
await wait(4000);
await shot('9-scorched');
const film = await ev(async () => {
  const R = window.__rec;
  R.rec.stop();
  await R.stopped;
  R.on = false;
  const blob = new Blob(R.chunks, { type: R.type });
  const data = await new Promise((r) => {
    const fr = new FileReader();
    // (After "base64,": the kind of film has a comma of its own, between its two codecs.)
    fr.onload = () => r(String(fr.result).slice(String(fr.result).indexOf('base64,') + 7));
    fr.readAsDataURL(blob);
  });
  return { type: R.type, data, size: R.size, audio: R.audio };
});
const seconds = (Date.now() - t0) / 1000;
const file = `${out}.${film.type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
fs.writeFileSync(file, Buffer.from(film.data, 'base64'));
console.log(`${file}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB, ${film.size.join('x')}, ${film.type}, ${film.audio ? 'with sound' : 'no sound'}, ${seconds.toFixed(0)} s`);
const result = await ev((sc) => {
  const g = window.__app.session.game;
  const n = g.nodes[sc.hearth];
  return { burns: !!g.nodes[sc.star].hazard, rivalShips: sc.guard.filter((id) => g.units.get(id) && !g.units.get(id).dead).length, saved: sc.fleet.filter((id) => g.units.get(id) && !g.units.get(id).dead).length, of: sc.fleet.length, owner: n.owner === sc.rival, level: n.level, glow: n.glow };
}, scene);
console.log(`at ${scene.name}, home of ${scene.rivalName}: ${JSON.stringify(result)}`);

// ---- A rival's Starfall at the player's own star: the alarm, the clock, the tip, the card.
await ev((sc) => {
  const a = window.__app;
  const s = a.session;
  const g = s.game;
  const hs = g.starOf(g.nodes[g.player.capital]);
  const d = g.spawnUnit('starfall', sc.rival, hs.id);
  for (let i = 0; i < 6; i++) g.spawnUnit(i % 2 ? 'guardian' : 'striker', sc.rival, hs.id);
  g.cmdArm(sc.rival, d.id);
  s.clearSelection();
  s.selectNode(g.player.capital);
  s.focusNode(g.player.capital, 0.2);
  s.speed = 1;
}, scene);
await page.mouse.move(900, 430);
await wait(2600);
await shot('10-rival-at-home');
await ev(() => {
  const a = window.__app;
  a.hud.tips.dismiss?.();
  const g = a.session.game;
  const hs = g.starOf(g.nodes[g.player.capital]);
  a.session.selectNode(hs.id);
  a.session.focusNode(hs.id, 0.2);
});
await wait(2200);
await shot('11-rival-star');
await browser.close();
if (errors.length) console.log('errors:', errors);
process.exit(errors.length ? 1 : 0);
