// The gameplay trailer: the game itself, its screens and its HUD, with the bot (scripts/lib/bot.ts) in
// the player's seat, captured frame by frame with the page's clock in our hands (30 frames a second, none
// lost); the sounds the game plays are noted at their frame and made offline with the music (studio.ts).
//   npx vite --port 5173 --strictPort, then node scripts/trailer/gameplay.mjs [probe]
// Writes promo/trailers/gameplay.mp4. (FFMPEG: ffmpeg, if it is not on the PATH.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEV_URL, gameUi, openBrowser } from '../lib/browser.mjs';

const OUT = 'promo/trailers';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const probe = process.argv[2] === 'probe';
const FPS = 30;
fs.mkdirSync(OUT, { recursive: true });

/** The run the bot is crowned in (Dominion, at 51.4 minutes), and the one it only begins (for a draft and an order). */
const MAIN = { seed: 808, size: 'medium', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true };
const SCRATCH = { ...MAIN, seed: 202 };

const { browser, page, errors } = await openBrowser({ viewport: { width: 1920, height: 1080 }, context: { deviceScaleFactor: 1 } });
const ui = gameUi(page);
const ev = (fn, arg) => page.evaluate(fn, arg);

// A player who has played a while: every house, no tips or goals over the picture, nothing paused for them.
await page.goto(DEV_URL);
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await ev(async () => {
  const { defaultProfile, saveProfile } = await import('/src/meta/profile.ts');
  const { HEIRS } = await import('/src/game/data/heirs.ts');
  const { GOALS } = await import('/src/game/data/goals.ts');
  const { KEY_IDS } = await import('/src/game/data/boonKeys.ts');
  const p = defaultProfile();
  Object.assign(p, {
    tutorialDone: true, runs: 14, wins: 4, legacy: 820, totalLegacy: 5400, maxDifficulty: 3, unlockLegendary: true, unlockPacts: true, agesSeen: true,
    heirs: HEIRS.map((h) => h.id), goalsDone: GOALS.map((g) => g.id), boonKeys: [...KEY_IDS], lastSetup: { heir: 'concord', size: 'medium', difficulty: 1 },
  });
  p.settings = { ...p.settings, tips: false, autoPause: false };
  saveProfile(p);
});
await page.reload();
await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.clock.install();

// The game's sounds are noted, not played: each at its moment of the trailer.
await ev(async () => {
  const app = window.__app;
  window.__heard = [];
  window.__t = 0;
  app.sfx.unlock();
  app.music.play(null);
  app.music.play = () => {};
  app.music.playTrack = () => {};
  app.sfx.play = (id, vol = 0.5, pan = 0) => window.__heard.push([window.__t, id, vol, pan]);
  app.sfx.note = () => {};
  // The words over the picture, in the game's own type.
  const cap = document.createElement('div');
  cap.id = 'caption';
  cap.style.cssText = 'position:fixed;left:0;right:0;top:296px;text-align:center;z-index:9999;pointer-events:none;font:32px "Press Start 2P",monospace;color:#fff4e0;' +
    'text-shadow:4px 0 0 #0b0a1a,-4px 0 0 #0b0a1a,0 4px 0 #0b0a1a,0 -4px 0 #0b0a1a,4px 4px 0 #0b0a1a,-4px -4px 0 #0b0a1a,4px -4px 0 #0b0a1a,-4px 4px 0 #0b0a1a';
  document.body.appendChild(cap);
});

/** Let the page's clock run by `ms` (its frames are drawn as they come). */
const run = (ms) => page.clock.runFor(ms);

/** A run of the game's own, begun as the setup's LAUNCH begins one, with the bot in the player's seat. */
async function begin(config) {
  await ev(async (config) => {
    const { startRun } = await import('/src/app/run.ts');
    window.__started = startRun(window.__app, config);
  }, config);
  for (let i = 0; i < 20 && !(await ev(() => window.__app.screen === 'game')); i++) await run(100);
  await ev(async () => {
    const { attachBot } = await import('/scripts/lib/bot.ts');
    const app = window.__app;
    const g = app.session.game;
    window.__bot?.detach();
    const bot = attachBot(g);
    window.__bot = bot;
    const step = g.step.bind(g);
    window.__botOff = false;
    g.step = () => {
      if (!window.__botOff) bot.think();
      step();
    };
    // (The omens of the sector are shown first: put them away.)
    app.session.modal = null;
  });
}

/** Play on, unseen, to a tick (the bot playing). */
async function forward(tick) {
  await ev(async (tick) => {
    const g = window.__app.session.game;
    g.fxEnabled = false;
    while (g.tick < tick && !g.outcome) g.step();
    g.fx.length = 0;
    g.fxEnabled = true;
  }, tick);
}

/** The camera on a world, or a place, at a zoom. */
const look = (x, y, zoom) => ev(([x, y, zoom]) => {
  const cam = window.__app.renderer.cam;
  cam.x = cam.tx = x;
  cam.y = cam.ty = y;
  cam.zoom = cam.tzoom = zoom;
}, [x, y, zoom]);
const lookAt = async (node, zoom) => {
  const [x, y] = await ev((n) => [window.__app.session.game.nodes[n].x, window.__app.session.game.nodes[n].y], node);
  await look(x, y, zoom);
};

// ------------------------------------------------------------------------------------------------
// Capture
// ------------------------------------------------------------------------------------------------

function ffmpeg(args) {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  return { stdin: p.stdin, done: new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))))) };
}

/** Segments captured, by name: their frames (a lossless file) and the sounds heard in them. */
const segments = {};
/**
 * Capture `seconds` of the page as it plays, into a segment of its own. `each(frame)` is called before
 * each frame (for the mouse, the words); `caption`: words over it, typed in.
 */
async function capture(name, seconds, { each, caption, captionTop = 296 } = {}) {
  const file = path.join(OUT, `gp-${name}.mkv`);
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-vf', 'crop=1920:1080:0:0', '-pix_fmt', 'yuv444p', '-c:v', 'ffv1', file]);
  await ev((top) => {
    window.__heard = [];
    document.getElementById('caption').style.top = `${top}px`;
  }, captionTop);
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    await ev(([t, text]) => {
      window.__t = t;
      document.getElementById('caption').textContent = text;
    }, [i / FPS, caption ? caption.slice(0, Math.max(0, Math.floor((i / FPS - 0.15) * 34))) : '']);
    await each?.(i);
    await run(1000 / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  }
  enc.stdin.end();
  await enc.done;
  segments[name] = { file, seconds: n / FPS, sounds: await ev(() => window.__heard) };
  console.log(`  ${name}: ${n} frames, ${segments[name].sounds.length} sounds`);
}

if (probe) {
  await begin(MAIN);
  await forward(240);
  await ev(() => (window.__app.session.speed = 3));
  await run(3000);
  await page.screenshot({ path: path.join(OUT, 'probe-early.png') });
  await ev(() => window.__app.hud.modals.open({ kind: 'draft' }));
  await run(2500);
  await page.screenshot({ path: path.join(OUT, 'probe-draft.png') });
  console.log(await ev(() => ({ tick: window.__app.session.game.tick, drafts: window.__app.session.game.player.pendingDrafts, modal: window.__app.session.modal?.kind })));
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------
// The footage
// ------------------------------------------------------------------------------------------------

const t0 = Date.now();
const centre = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

// The title screen, as it opens on the game's own sector.
await page.mouse.move(1900, 1060);
await capture('menu', 4.5);

// A new run: the mouse across the houses, and on the Solar Concord.
const [mx, my] = await centre('.mode[data-sa="setup"]');
await page.mouse.click(mx, my);
await run(400);
const houses = await page.$$eval('.heir', (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}));
await capture('setup', 4, {
  each: async (i) => {
    const k = Math.min(1, i / 80) * (houses.length - 1);
    const a = houses[Math.floor(k)];
    const b = houses[Math.min(houses.length - 1, Math.floor(k) + 1)];
    const f = k - Math.floor(k);
    if (i <= 80) await page.mouse.move(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
    if (i === 95) await page.mouse.move(houses[0][0], houses[0][1]);
    if (i === 100) await page.mouse.click(houses[0][0], houses[0][1]);
  },
});

// The run the bot is crowned in: its seeds go out to the dark worlds round its Hearth.
await page.mouse.move(1900, 1060);
await begin(MAIN);
const home = await ev(() => window.__app.session.game.player.capital);
await forward(300);
await lookAt(home, 0.06);
await ev(() => (window.__app.session.speed = 3));
await capture('early', 6, { caption: 'SEND SEEDS TO DARK WORLDS.' });

// Its biggest battle.
await forward(Math.round(46.55 * 60 * 20));
await lookAt(37, 0.3);
await ev(() => (window.__app.session.speed = 1));
await capture('battle', 7, { caption: 'TAKE THEIR WORLDS.' });

// Its crowning (Dominion), from a little before it, over the whole sector.
await forward(61680 - 50);
await ev(() => {
  const cam = window.__app.renderer.cam;
  cam.fitAll();
  cam.zoom = cam.tzoom = cam.minZoom * 1.15;
});
await capture('crown', 7);
const crowned = await ev(() => {
  const o = window.__app.session?.game.outcome;
  return o ? { won: o.playerWon, victory: o.victory, tick: window.__app.session.game.tick } : null;
});
console.log('  the crown:', JSON.stringify(crowned));

// Another run, begun only: its first Boon chosen by hand, and its first fleet sent by hand.
await begin(SCRATCH);
await ev(() => (window.__bot.leaveBoons = true));
const home2 = await ev(() => window.__app.session.game.player.capital);
await lookAt(home2, 0.2);
await ev(() => window.__app.hud.modals.open({ kind: 'draft' }));
await capture('draft', 5, {
  caption: 'CHOOSE YOUR BOONS.',
  // (Under the draft, whose own title is where the words go elsewhere.)
  captionTop: 900,
  each: async (i) => {
    if (i !== 78) return;
    const r = await ui.uiRect('card-1');
    if (!r) throw new Error('no card to choose');
    const [x, y] = await ui.toPage(r.x + r.w / 2, r.y + r.h / 2);
    await page.mouse.click(x, y);
    await page.mouse.move(1900, 1060);
  },
});
await ev(() => (window.__bot.leaveBoons = false));
await forward(Math.round(9 * 60 * 20));
// (The bot leaves the fleet to the hand that sends it.)
await ev(() => (window.__botOff = true));
const target = await ev(() => {
  const g = window.__app.session.game;
  const home = g.nodes[g.player.capital];
  const near = g.neighbours(home.id).map((id) => g.nodes[id]).filter((n) => n.kind === 'planet');
  const t = near.find((n) => n.owner !== g.playerId) ?? near[0] ?? g.nodes[g.neighbours(home.id)[0]];
  return { id: t.id, x: (home.x + t.x) / 2, y: (home.y + t.y) / 2 };
});
// (The Hearth and the world the fleet is sent to, a little below the middle: the words are above them.)
await look(target.x, target.y - 25 / 0.11, 0.11);
await ev(() => (window.__app.session.speed = 2));
await capture('command', 6, {
  caption: 'COMMAND YOUR FLEETS.',
  each: async (i) => {
    if (i === 20) await page.keyboard.press('f');
    if (i === 45) {
      const [ix, iy] = await ev((id) => {
        const n = window.__app.session.game.nodes[id];
        return window.__app.renderer.cam.worldToScreen(n.x, n.y);
      }, target.id);
      const [x, y] = await ui.toPage(ix, iy);
      await page.mouse.click(x, y, { button: 'right' });
      await page.mouse.move(1900, 1060);
    }
  },
});

// The end: the name, and where to play (drawn by the studio, as in the other trailers).
const studio = await page.context().newPage();
let endFrames = null;
await studio.exposeFunction('sendFrame', async (png) => {
  if (!endFrames.stdin.write(Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'))) await new Promise((r) => endFrames.stdin.once('drain', r));
});
await studio.goto(new URL('scripts/trailer/studio.html', DEV_URL).href);
await studio.waitForFunction(() => window.studioReady === true, null, { timeout: 60000 });
const endFile = path.join(OUT, 'gp-end.mkv');
endFrames = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-vf', 'scale=1920:1080:flags=neighbor', '-pix_fmt', 'yuv444p', '-c:v', 'ffv1', endFile]);
const END = 5;
await studio.evaluate((END) => window.studio.shoot([{ blank: true, dur: END, dither: 0, text: [{ at: 0.2, until: END, style: 'logo', lines: ['PLAY FREE IN YOUR BROWSER', 'HEGEMARCH.COM'] }] }]), END);
endFrames.stdin.end();
await endFrames.done;
segments.end = { file: endFile, seconds: END, sounds: [] };

// The trailer, in the order of a run: its frames, then its sound (the game's sounds where they were
// heard, and its music), and the two together.
const ORDER = ['menu', 'setup', 'early', 'draft', 'command', 'battle', 'crown', 'end'];
const DUCK = { battle: 0.6, crown: 0.75 };
let at = 0;
const sounds = [];
const ducks = [];
const starts = {};
for (const name of ORDER) {
  const seg = segments[name];
  starts[name] = at;
  for (const [t, id, vol, pan] of seg.sounds) sounds.push([at + t, id, vol, pan]);
  ducks.push([at, at + seg.seconds, DUCK[name] ?? 1]);
  at += seg.seconds;
}
const dur = at;
const music = [
  { track: 'To Arms', at: 0, until: starts.crown + 0.4, part: 1, fade: 0.8 },
  { track: 'The Crowning', at: starts.crown + 2.6, until: dur, part: 0, fade: 2 },
];
const wav = await studio.evaluate(({ dur, music, sounds, ducks }) => window.studio.sound(dur, music, sounds, 1.1, ducks), { dur, music, sounds, ducks });
const wavFile = path.join(OUT, 'gp.wav');
fs.writeFileSync(wavFile, Buffer.from(wav, 'base64'));
const list = path.join(OUT, 'gp-list.txt');
fs.writeFileSync(list, ORDER.map((n) => `file '${path.resolve(segments[n].file).split(path.sep).join('/')}'`).join('\n'));
const mp4 = path.join(OUT, 'gameplay.mp4');
const mux = ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-i', wavFile, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', mp4]);
mux.stdin.end();
await mux.done;
for (const n of ORDER) fs.rmSync(segments[n].file);
fs.rmSync(wavFile);
fs.rmSync(list);
console.log(`${mp4}: ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, ${dur.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)}s to make)`);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
