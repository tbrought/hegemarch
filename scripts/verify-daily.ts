/**
 * The Daily board's checker (1.25): it plays each run sent to the board again from its orders, in the
 * version of the game the run was played in, and tells the board what it found: the run stands (a crown
 * of the player's own, in the time the game itself finds) or it does not, and why. A time on the board
 * is never taken on its player's word.
 *
 * GitHub Actions runs it (.github/workflows/verify-daily.yml) when the board (worker/) calls for it. It
 * takes every run waiting, looks again until none has come for a minute and a half, and stops.
 *
 *   BOARD_API=https://hegemarch.com/api/daily VERIFY_SECRET=... npx tsx scripts/verify-daily.ts
 *   npx tsx scripts/verify-daily.ts --one <tree>     one run (JSON on stdin), in the game code of <tree>
 *
 * A version's game code is the last commit with that version in package.json, checked out beside this
 * one in .verify/<version> (git worktree). The game code (src/game) needs nothing installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

/** A run as the board hands it to the checker. */
export interface Waiting {
  id: string;
  day: string;
  heir: string;
  version: string;
  claimed: number;
  orders: string;
  enc: string;
}

/** What the checker found. */
export interface Found {
  ok: boolean;
  time: number;
  victory: string;
  reason: string;
}

/** Seconds of game time a run is played for past the time its player's game gave. */
const MARGIN = 60;
/** Real seconds one run may take to play again. */
const RUN_TIMEOUT = 300;
/** Real seconds with nothing to check before the checker stops. */
const IDLE = 90;
/** Real minutes the checker runs at most (the workflow allows thirty). */
const LONGEST = 25;

function git(args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** The version in package.json at a commit. */
function versionAt(commit: string): string | null {
  try {
    return (JSON.parse(git(['show', `${commit}:package.json`])) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/**
 * The last commit with this version in package.json (the code that was deployed as it), or null if there
 * is none yet (a version deployed before it was pushed: the run waits).
 */
export function commitOf(version: string): string | null {
  // Newest first, the commits that changed package.json: the first with this version is where it began,
  // and the one just newer than it (another version) is where it ended.
  const log = git(['log', '--format=%H', '--first-parent', 'HEAD', '--', 'package.json']).split('\n').filter(Boolean);
  let newer: string | null = null;
  for (const c of log) {
    if (versionAt(c) === version) return newer ? git(['rev-parse', `${newer}^`]) : git(['rev-parse', 'HEAD']);
    newer = c;
  }
  return null;
}

/** The game code of a version, checked out in .verify/<version>, or null if the version is not known yet. */
export function treeFor(version: string): string | null {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)) return null;
  const commit = commitOf(version);
  if (!commit) return null;
  const tree = resolve('.verify', version);
  if (existsSync(tree) && git(['-C', tree, 'rev-parse', 'HEAD']) === commit) return tree;
  if (existsSync(tree)) git(['worktree', 'remove', '--force', tree]);
  git(['worktree', 'add', '--detach', '--force', tree, commit]);
  return tree;
}

/** A run's orders, as they were sent: gzip and base64, or JSON. */
export function unpack(orders: string, enc: string): unknown {
  if (enc === 'json') return JSON.parse(orders);
  if (enc !== 'gzip') throw new Error('orders in no known form');
  return JSON.parse(gunzipSync(Buffer.from(orders, 'base64'), { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8'));
}

/** Play one run again in the game code of `tree`, in a process of its own (a run that will not end is stopped). */
export function checkRun(tree: string, run: Waiting): Found {
  let orders: unknown;
  try {
    orders = unpack(run.orders, run.enc);
  } catch {
    return { ok: false, time: 0, victory: '', reason: 'its orders could not be read' };
  }
  const tsx = resolve('node_modules/tsx/dist/cli.mjs');
  const r = spawnSync(process.execPath, [tsx, resolve('scripts/verify-daily.ts'), '--one', tree], {
    input: JSON.stringify({ day: run.day, heir: run.heir, orders, limit: run.claimed + MARGIN }),
    encoding: 'utf8',
    timeout: RUN_TIMEOUT * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    console.error(`  ${run.id}: ${r.error?.message ?? r.stderr.slice(-2000)}`);
    return { ok: false, time: 0, victory: '', reason: r.error ? 'it took too long to play again' : 'it could not be played again' };
  }
  const last = r.stdout.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(last) as Found;
  } catch {
    return { ok: false, time: 0, victory: '', reason: 'it could not be played again' };
  }
}

/** One run, as JSON on stdin, played again in the game code of `tree`: what was found, as JSON on stdout. */
async function one(tree: string) {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { day: string; heir: string; orders: unknown; limit: number };
  const { checkDaily } = (await import(pathToFileURL(resolve(tree, 'src/game/replay.ts')).href)) as typeof import('../src/game/replay');
  const { TICK } = (await import(pathToFileURL(resolve(tree, 'src/game/constants.ts')).href)) as typeof import('../src/game/constants');
  const found = checkDaily(input.day, input.heir, input.orders, Math.ceil(input.limit / TICK));
  process.stdout.write(`\n${JSON.stringify(found)}\n`);
}

async function main() {
  const api = process.env.BOARD_API?.replace(/\/+$/, '');
  const secret = process.env.VERIFY_SECRET;
  if (!api || !secret) throw new Error('BOARD_API and VERIFY_SECRET are needed (worker/README.md)');
  const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json' };
  const tell = async (body: object) => {
    const res = await fetch(`${api}/verdict`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`the board would not take a verdict: ${res.status} ${await res.text()}`);
  };
  const start = Date.now();
  let lastWork = Date.now();
  let checked = 0;
  while (Date.now() - start < LONGEST * 60_000) {
    const res = await fetch(`${api}/pending`, { headers });
    if (!res.ok) throw new Error(`the board would not hand over its runs: ${res.status} ${await res.text()}`);
    const { runs } = (await res.json()) as { runs: Waiting[] };
    if (!runs.length) {
      if (Date.now() - lastWork > IDLE * 1000) break;
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    for (const run of runs) {
      const tree = treeFor(run.version);
      if (!tree) {
        console.log(`${run.id} ${run.day} ${run.heir}: version ${run.version} is not known yet: it waits`);
        await tell({ id: run.id, wait: true });
        continue;
      }
      const t0 = Date.now();
      const found = checkRun(tree, run);
      console.log(`${run.id} ${run.day} ${run.heir} v${run.version}: ${found.ok ? `stands, ${found.time.toFixed(1)}s` : `does not stand: ${found.reason}`} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      await tell({ id: run.id, ok: found.ok, time: found.time, victory: found.victory, reason: found.reason });
      checked++;
    }
    lastWork = Date.now();
  }
  console.log(`checked ${checked} run${checked === 1 ? '' : 's'}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve('scripts/verify-daily.ts');
if (isMain) {
  const run = process.argv[2] === '--one' ? one(process.argv[3]) : main();
  run.catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
