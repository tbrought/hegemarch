// Everything that is checked before a change is called done, in one command.
//
//   node scripts/verify.mjs              types, unit tests, the simulation's fuzzers, the golden traces and
//                                        the UI snapshot if they were recorded, and every browser suite
//   node scripts/verify.mjs --quick      without the browser (types, unit tests, fuzzers, golden traces)
//   node scripts/verify.mjs --release    then builds and packages, and checks the built game and the site
//   node scripts/verify.mjs --only=qol,e2e     some steps, by name
//   node scripts/verify.mjs --serial     one step at a time, as it was before 1.26 (to look into a failure
//                                        with nothing else running beside it)
//
// It starts its own dev server for the browser suites (port 5173) and stops it again; if one is running
// already, it uses that one and leaves it alone.
//
// Since 1.26 the steps run side by side (they took 29 minutes one after another, on a machine of 16 cores
// that sat mostly idle): the simulation's steps one after another, and beside them the browser suites, three
// at a time, the longest first (each has a browser of its own: nothing it keeps is another's). The few that
// time what they hear or see (`ALONE`) run after, with nothing else running. Then the release steps, which
// check the build, last.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const release = args.includes('--release');
const serial = args.includes('--serial');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const PORT = 5173;
/** Browser suites at a time. */
const AT_ONCE = 3;
/**
 * Suites that time what they hear or see, or compare a picture to the pixel: run with nothing else beside
 * them (a busy machine is heard as clicks, and a picture made over several frames comes a frame late).
 */
const ALONE = new Set(['uisnap', 'audio', 'music', 'reveals', 'frame']);

/** [name, command, needs a browser?]. The browser suites stand longest first: they are started in this order. */
const steps = [
  ['types', 'npx tsc --noEmit', false],
  ['unit tests', 'npx vitest run', false],
  ['fuzz', 'npx tsx scripts/fuzz.ts 10 20', false],
  ['fuzz --ai', 'npx tsx scripts/fuzz.ts 4 25 --ai', false],
  ['fuzz --ages', 'npx tsx scripts/fuzz.ts 4 20 --ages', false],
  ['board', 'npx tsx scripts/board-e2e.ts', false],
  ...(fs.existsSync('.golden/trace.json') ? [['golden', 'npx tsx scripts/golden.ts check', false]] : []),
  ['uifuzz', 'node scripts/uifuzz.mjs 120 1', true],
  ['uifuzz --ages', 'node scripts/uifuzz.mjs 100 2 --ages', true],
  ...(fs.existsSync('.golden/ui.json') ? [['uisnap', 'node scripts/uisnap.mjs check', true]] : []),
  ['sound', 'node scripts/sound.mjs', true],
  // (Games played together, 1.28: two players through the dev server's rooms.)
  ['together', 'node scripts/together.mjs', true],
  ['uifuzz together', 'node scripts/uifuzz-together.mjs 90 1', true],
  ['uifuzz together --versus', 'node scripts/uifuzz-together.mjs 60 4 versus', true],
  ['layouts', 'node scripts/layouts.mjs', true],
  ['ages', 'node scripts/ages.mjs', true],
  ['fit', 'node scripts/fit.mjs', true],
  ['e2e', 'node scripts/e2e.mjs', true],
  ['tutorial', 'node scripts/tutorial.mjs', true],
  ['qol', 'node scripts/qol.mjs', true],
  ['discovery', 'node scripts/discovery.mjs', true],
  ['menus', 'node scripts/menus.mjs', true],
  ['calm', 'node scripts/calm.mjs', true],
  ['board ui', 'node scripts/board-ui.mjs', true],
  ['starfall', 'node scripts/starfall.mjs', true],
  ['stopped', 'node scripts/stopped.mjs', true],
  // (The House Powers: their button, D to aim and cast, the aim put away, a Wayfinder's world: 1.27.)
  ['powers', 'node scripts/powers.mjs', true],
  ['reveals', 'node scripts/reveals.mjs', true],
  ['frame', 'node scripts/frame.mjs', true],
  // (A battle's music in tune and never clipping, and every sound starting from silence: 1.25.1.)
  ['audio', 'node scripts/audio.mjs', true],
  // (Every track through the real sound engine: it was not run here, and a check of it went stale unseen in 1.27.1.)
  ['music', 'node scripts/music.mjs', true],
].filter(([name, , browser]) => (only ? only.includes(name) : !(quick && browser)));
const after = release
  ? [
      ['package', 'npm run package', false],
      ['built game', 'node scripts/smoke-dist.mjs', false],
      ['site', 'node scripts/site.mjs', false],
    ]
  : [];

/** A step has failed if it says so, by its exit code or in its words (some suites only print their problems). */
const BAD = /^(FAIL|DIFF)\b|\bFAILED\b|^PROBLEMS:|^ERRORS|\bFAILURES\b|DIFFER\b/m;

function run(cmd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, { shell: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

const up = async () => {
  try {
    return (await fetch(`http://localhost:${PORT}/`)).ok;
  } catch {
    return false;
  }
};

let server = null;
async function startServer() {
  if (await up()) return;
  server = spawn(`npx vite --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) throw new Error('the dev server did not start');
}
function stopServer() {
  if (!server) return;
  if (process.platform === 'win32') spawn(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  else server.kill('SIGTERM');
  server = null;
}

const results = [];
/** Run one step and say how it went, all on one line when it is done (steps run side by side). */
async function step([name, cmd]) {
  const t = Date.now();
  const { code, out } = await run(cmd);
  const ok = code === 0 && !BAD.test(out);
  const secs = Math.round((Date.now() - t) / 1000);
  let said = `${name.padEnd(14)} ${ok ? 'ok  ' : 'FAIL'}  ${String(secs).padStart(4)}s`;
  if (!ok) {
    const lines = out.trimEnd().split(/\r?\n/);
    // (What it said was wrong, and the lines under each that say how: "DIFF setup: html", then what differs.)
    const bad = lines.flatMap((l, i) => (BAD.test(l) || /error/i.test(l) ? [l, ...lines.slice(i + 1, i + 4).filter((x) => /^\s/.test(x))] : []));
    said += '\n' + (bad.length ? bad.slice(0, 16) : lines.slice(-12)).map((l) => '    ' + l.slice(0, 300)).join('\n');
  }
  console.log(said);
  results.push({ name, ok });
}
/** Steps one after another. */
async function inTurn(list) {
  for (const s of list) await step(s);
}
/** Steps `n` at a time, each taken up in its order as one ends. */
async function atOnce(list, n) {
  const queue = [...list];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await step(queue.shift());
  }));
}

const t0 = Date.now();
try {
  const sim = steps.filter(([, , browser]) => !browser);
  const web = steps.filter(([, , browser]) => browser);
  if (web.length) await startServer();
  if (serial) await inTurn(steps);
  else {
    await Promise.all([inTurn(sim), atOnce(web.filter(([name]) => !ALONE.has(name)), AT_ONCE)]);
    await inTurn(web.filter(([name]) => ALONE.has(name)));
  }
  for (const s of after) {
    if (s[0] === 'package') stopServer();
    await step(s);
  }
} finally {
  stopServer();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} steps in ${Math.round((Date.now() - t0) / 1000)}s · ${failed.length ? `FAILED: ${failed.map((r) => r.name).join(', ')}` : 'all passed'}`);
process.exit(failed.length ? 1 : 0);
