// Stills from a film, for checking one without watching it: the frames at the given seconds, as PNGs.
//   node scripts/film-frames.mjs <film> <seconds,seconds,...> [out prefix]
// Prints the film's length; the stills go to <prefix>-<seconds>.png (.shots/frame by default).
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser } from './lib/browser.mjs';

const [file, times = '', prefix = '.shots/frame'] = process.argv.slice(2);
const { browser, page } = await openBrowser({ viewport: { width: 1280, height: 720 } });
const data = fs.readFileSync(file).toString('base64');
const type = path.extname(file) === '.webm' ? 'video/webm' : 'video/mp4';
await page.setContent('<body style="margin:0;background:#000"><video id="v" muted style="width:1280px;height:720px"></video></body>');
const length = await page.evaluate(async ([b64, mime]) => {
  const v = document.getElementById('v');
  v.src = URL.createObjectURL(await (await fetch(`data:${mime};base64,${b64}`)).blob());
  await new Promise((r) => (v.onloadedmetadata = r));
  // (A film from MediaRecorder may not know its own length until it has been sought to its end.)
  if (!isFinite(v.duration)) {
    v.currentTime = 1e7;
    await new Promise((r) => (v.onseeked = r));
  }
  return v.duration;
}, [data, type]);
console.log(`${file}: ${length.toFixed(1)} s`);
for (const t of times.split(',').filter(Boolean).map(Number)) {
  await page.evaluate(async (s) => {
    const v = document.getElementById('v');
    v.currentTime = s;
    await new Promise((r) => (v.onseeked = r));
  }, t);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${prefix}-${t}.png` });
}
await browser.close();
