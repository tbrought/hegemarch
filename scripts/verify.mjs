// Everything that is checked before a change is called done, in one command.
//
//   node scripts/verify.mjs              types, unit tests, the simulation's fuzzers, the golden traces and
//                                        the UI snapshot if they were recorded, and every browser suite
//   node scripts/verify.mjs --quick      without the browser (types, unit tests, fuzzers, golden traces)
//   node scripts/verify.mjs --release    then builds and packages, and checks the built game and the site
//   node scripts/verify.mjs --only=qol,e2e     some steps, by name
//
// It starts its own dev server for the browser suites (port 5173) and stops it again; if one is running
// already, it uses that one and leaves it alone.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const release = args.includes('--release');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const PORT = 5173;

/** [name, command, needs a browser?] */
const steps = [
  ['types', 'npx tsc --noEmit', false],
  ['unit tests', 'npx vitest run', false],
  ['fuzz', 'npx tsx scripts/fuzz.ts 10 20', false],
  ['fuzz --ai', 'npx tsx scripts/fuzz.ts 4 25 --ai', false],
  ['fuzz --ages', 'npx tsx scripts/fuzz.ts 4 20 --ages', false],
  ...(fs.existsSync('.golden/trace.json') ? [['golden', 'npx tsx scripts/golden.ts check', false]] : []),
  ...(fs.existsSync('.golden/ui.json') ? [['uisnap', 'node scripts/uisnap.mjs check', true]] : []),
  ['e2e', 'node scripts/e2e.mjs', true],
  ['tutorial', 'node scripts/tutorial.mjs', true],
  ['stopped', 'node scripts/stopped.mjs', true],
  ['qol', 'node scripts/qol.mjs', true],
  ['starfall', 'node scripts/starfall.mjs', true],
  ['ages', 'node scripts/ages.mjs', true],
  ['layouts', 'node scripts/layouts.mjs', true],
  ['menus', 'node scripts/menus.mjs', true],
  ['sound', 'node scripts/sound.mjs', true],
  ['uifuzz', 'node scripts/uifuzz.mjs 120 1', true],
  ['uifuzz --ages', 'node scripts/uifuzz.mjs 100 2 --ages', true],
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
const t0 = Date.now();
try {
  for (const [name, cmd, browser] of [...steps, ...after]) {
    if (browser) await startServer();
    else if (name === 'package') stopServer();
    const t = Date.now();
    process.stdout.write(`${name.padEnd(14)} `);
    const { code, out } = await run(cmd);
    const ok = code === 0 && !BAD.test(out);
    const secs = Math.round((Date.now() - t) / 1000);
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${String(secs).padStart(4)}s`);
    results.push({ name, ok });
    if (!ok) {
      const lines = out.trimEnd().split(/\r?\n/);
      const bad = lines.filter((l) => BAD.test(l) || /error/i.test(l));
      console.log(
        (bad.length ? bad.slice(0, 12) : lines.slice(-12))
          .map((l) => '    ' + l.slice(0, 300))
          .join('\n'),
      );
    }
  }
} finally {
  stopServer();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} steps in ${Math.round((Date.now() - t0) / 1000)}s · ${failed.length ? `FAILED: ${failed.map((r) => r.name).join(', ')}` : 'all passed'}`);
process.exit(failed.length ? 1 : 0);
