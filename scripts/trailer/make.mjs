// Trailers of the game, made from the game itself (studio.ts: its sectors, its renderer, its music).
//   npx vite --port 5173 --strictPort         (the dev server serves the studio)
//   node scripts/trailer/make.mjs scan 11,23,47        what happens in these sectors, and where (promo/trailers/scan-<seed>.json)
//   node scripts/trailer/make.mjs stills <name>        one frame of every shot of a trailer (promo/trailers/<name>-stills/)
//   node scripts/trailer/make.mjs listen <name>        its music and its own sounds alone, without a frame (a WAV)
//   node scripts/trailer/make.mjs video <name>         the trailer (promo/trailers/<name>.mp4, 1920x1080, 30 fps)
// The trailers are written in trailers.mjs. Videos are made with ffmpeg (FFMPEG, or ffmpeg on the PATH).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEV_URL, openBrowser } from '../lib/browser.mjs';
import { TRAILERS } from './trailers.mjs';

const OUT = 'promo/trailers';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const [mode, arg] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

// (A Short is upright: 1080x1920, its studio opened so.)
const PORTRAIT = TRAILERS[arg]?.format === 'portrait';
const [VW, VH] = PORTRAIT ? [1080, 1920] : [1920, 1080];
const { browser, page, errors } = await openBrowser({ viewport: { width: VW, height: VH }, context: { deviceScaleFactor: 1 } });
let onFrame = async () => {};
await page.exposeFunction('sendFrame', (png) => onFrame(Buffer.from(png.slice(png.indexOf(',') + 1), 'base64')));
await page.goto(new URL(`scripts/trailer/studio.html${PORTRAIT ? '?portrait' : ''}`, DEV_URL).href);
await page.waitForFunction(() => window.studioReady === true, null, { timeout: 60000 });

function ffmpeg(args) {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
  return { stdin: p.stdin, done };
}

if (mode === 'audit') {
  // The game's own mix in its biggest battles (its levels, its limit of voices, no compressor), measured.
  const S = (seed) => ({ seed, size: 'medium', heir: 'concord', difficulty: 2 });
  const battles = [
    ['the last siege (seed 90)', { sector: S(90), from: Math.round(58.55 * 1200), dur: 10, speed: 1, sounds: true, cam: [{ t: 0, node: 46, zoom: 0.25 }] }],
    ['a Hearth falls (seed 11)', { sector: S(11), from: Math.round(30.05 * 1200), dur: 10, speed: 1, sounds: true, cam: [{ t: 0, node: 34, zoom: 0.3 }] }],
    ['the same, at three times the speed', { sector: S(11), from: Math.round(30.05 * 1200), dur: 10, speed: 3, sounds: true, cam: [{ t: 0, node: 34, zoom: 0.3 }] }],
  ];
  for (const [name, shot] of battles) {
    const sounds = await page.evaluate(({ shot }) => window.studio.shoot([shot], 1e9), { shot });
    const r = await page.evaluate(({ sounds, raw }) => window.studio.audit(10, sounds, [{ track: 'To Arms', at: 0, until: 10, part: 1 }], raw), { sounds, raw: process.env.FIXED !== '1' });
    const perSec = (sounds.length / 10).toFixed(0);
    console.log(`${name}: ${perSec} sounds a second asked for; peak ${r.peak.toFixed(2)}, ${r.over} samples past full scale (${r.overPct.toFixed(2)}%), ${r.impulses} single-sample leaps`);
  }
} else if (mode === 'scan') {
  for (const seed of (arg ?? '11').split(',').map(Number)) {
    // (AGES=1: an Ages run, on its cradle world.)
    const sector = { seed, size: 'medium', heir: 'concord', difficulty: 2, ...(process.env.AGES ? { ages: true } : {}) };
    const r = await page.evaluate(({ sector }) => window.studio.scan(sector, 75), { sector });
    fs.writeFileSync(path.join(OUT, `scan-${process.env.AGES ? 'ages-' : ''}${seed}.json`), JSON.stringify({ sector, ...r }));
    const best = (kind, n = 4) => r.moments.filter((m) => m.kind === kind).sort((a, b) => b.score - a.score).slice(0, n)
      .map((m) => `${(m.tick / 1200).toFixed(1)}m@${m.node}${m.kind === 'battle' ? `(${m.score})` : ''}`).join(' ');
    console.log(`seed ${seed}: ${r.ms}ms, ${r.end ? `ends at ${(r.end.tick / 1200).toFixed(1)} min (${r.end.victory})` : 'undecided'}; ` +
      `kindles ${r.moments.filter((m) => m.kind === 'kindle').length}, battles: ${best('battle')}, hearths: ${best('hearth')}, novas: ${best('nova')}, falls: ${best('fall')}`);
  }
} else {
  const trailer = TRAILERS[arg];
  if (!trailer) throw new Error(`no trailer "${arg}" (trailers.mjs: ${Object.keys(TRAILERS).join(', ')})`);
  const shots = trailer.shots;
  // Every line measured in its own type first: none too wide, no word left on its own.
  const problems = await page.evaluate(({ shots }) => window.studio.lint(shots), { shots });
  if (problems.length) throw new Error(`the words of "${arg}" will not do:\n  ${problems.join('\n  ')}`);
  const dur = shots.reduce((s, x) => s + x.dur, 0);
  if (mode === 'stills') {
    // One frame of each shot, 60% of the way through it (or at its \`still\`), from the trailer as it plays.
    const dir = path.join(OUT, `${arg}-stills`);
    fs.mkdirSync(dir, { recursive: true });
    // (AT=0.2,0.6,0.95: these frames of each shot instead.)
    const ats = process.env.AT ? process.env.AT.split(',').map(Number) : null;
    let start = 0;
    const pick = shots.flatMap((shot) => {
      const n = Math.round(shot.dur * 30);
      const fs = (ats ?? [shot.still ?? 0.6]).map((k) => start + Math.min(n - 1, Math.floor(n * k)));
      start += n;
      return fs;
    });
    let i = 0;
    onFrame = async (buf) => {
      const name = path.join(dir, `${String(++i).padStart(2, '0')}.png`);
      fs.writeFileSync(name, buf);
    };
    await page.evaluate(({ shots, pick }) => window.studio.shoot(shots, 1, pick), { shots, pick });
    console.log(`${dir}: ${i} stills`);
  } else if (mode === 'listen') {
    // Its music and its own sounds alone, without a frame (promo/trailers/<name>.listen.wav): the arrangement, heard.
    const wav = await page.evaluate(({ dur, music, sounds, sfx, shots }) => window.studio.sound(dur, music, sounds, sfx, window.studio.ducksOf(shots)), {
      shots, dur, music: trailer.music, sounds: trailer.sounds ?? [], sfx: trailer.sfxVol ?? 0.55,
    });
    fs.writeFileSync(path.join(OUT, `${arg}.listen.wav`), Buffer.from(wav, 'base64'));
    console.log(`${path.join(OUT, `${arg}.listen.wav`)}: ${dur.toFixed(1)} s`);
  } else if (mode === 'video') {
    const t0 = Date.now();
    const frames = path.join(OUT, `${arg}.frames.mkv`);
    // The frames, at the game's size, lossless; made four times larger pixel for pixel at the end.
    const enc = ffmpeg(['-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', '-c:v', 'ffv1', frames]);
    let n = 0;
    onFrame = async (buf) => {
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
      if (++n % 150 === 0) console.log(`  ${n} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    };
    const sounds = await page.evaluate(({ shots }) => window.studio.shoot(shots), { shots });
    enc.stdin.end();
    await enc.done;
    console.log(`${n} frames, ${sounds.length} sounds; the sound...`);
    const wav = await page.evaluate(({ dur, music, sounds, sfx, shots }) => window.studio.sound(dur, music, sounds, sfx, window.studio.ducksOf(shots)), {
      shots,
      // (ONLY=music or ONLY=sounds: the one without the other, to hear how they sit together.)
      dur, music: process.env.ONLY === 'sounds' ? [] : trailer.music, sounds: process.env.ONLY === 'music' ? [] : [...sounds, ...(trailer.sounds ?? [])], sfx: trailer.sfxVol ?? 0.55,
    });
    const wavPath = path.join(OUT, `${arg}.wav`);
    fs.writeFileSync(wavPath, Buffer.from(wav, 'base64'));
    const mp4 = path.join(OUT, `${arg}.mp4`);
    // As loud as YouTube plays a video (-14 LUFS, peaks under -1.5 dB), measured first and then set in one
    // move for the whole of it: a level that rode up and down with the music would not be smooth, and a
    // trailer's build (soft, then full) is the point of it. (loudnorm itself turns to riding the level the
    // moment one gain would put a peak over: so the gain is set here, plainly.) A limiter last of all keeps
    // every peak under -1.5 dB (the sound is encoded after it, and must never pass full scale).
    const measured = await new Promise((res, rej) => {
      const p = spawn(FFMPEG, ['-hide_banner', '-i', wavPath, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('close', () => {
        const m = /\{[\s\S]*\}/.exec(err.slice(err.lastIndexOf('[Parsed_loudnorm')));
        m ? res(JSON.parse(m[0])) : rej(new Error('loudnorm measured nothing'));
      });
    });
    // (And the last second and a half fades out, whatever is still sounding: a trailer ends in silence, not cut off.)
    const norm = `volume=${((trailer.lufs ?? -14) - Number(measured.input_i)).toFixed(2)}dB,alimiter=limit=0.84:attack=5:release=60:level=false,afade=t=out:st=${(dur - 1.5).toFixed(2)}:d=1.5`;
    const mux = ffmpeg(['-i', frames, '-i', wavPath, '-vf', `scale=${VW}:${VH}:flags=neighbor`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation',
      '-pix_fmt', 'yuv420p', '-r', '30', '-af', norm, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', mp4]);
    mux.stdin.end();
    await mux.done;
    fs.rmSync(frames);
    fs.rmSync(wavPath);
    console.log(`${mp4}: ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, ${dur.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)}s to make)`);
  }
}
if (errors.length) console.log(errors.join('\n'));
await browser.close();
