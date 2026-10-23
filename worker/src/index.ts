/**
 * The Daily board's server (1.25): a Cloudflare Worker on hegemarch.com/api/daily, with a D1 database
 * (schema.sql). It takes crowned Daily runs, keeps each until the checker has played it again from its
 * orders (scripts/verify-daily.ts, run by GitHub Actions, which this calls when a run comes in), and shows
 * the ones that stand.
 *
 *   POST /api/daily/submit        a run (meta/board.ts: BoardEntry): { id, status }
 *   GET  /api/daily/status?id=    what became of it: { status, time, rank, of, reason }
 *   GET  /api/daily/board?day=    a day's fastest crowns: { day, runs, count }
 *   GET  /api/daily/throne        today's three fastest and the Hegemarchs of the days before (meta/board.ts: Throne)
 *   GET  /api/daily/alltime       the fastest crowns ever, each player's best (meta/board.ts: AllTime)
 *   GET  /api/daily/pending       the checker's: runs to check, with their orders (VERIFY_SECRET)
 *   POST /api/daily/verdict       the checker's: what it found (VERIFY_SECRET)
 *
 * And the rooms of games played together (1.28, room.ts): a Durable Object for each.
 *
 *   POST /api/room/new            a new room: { code }
 *   GET  /api/room/<CODE>/ws      a screen's WebSocket to its room
 *
 * It keeps three letters, a house, a time and a run's orders, and nothing else: no account, no address,
 * no cookie, no IP. A run's orders are dropped once they are no longer needed (`prune`).
 */
import { ALLTIME_SHOWN, BOARD_LONGEST, BOARD_SHOWN, dayOf, isBoardDay, nameProblem, ordOf, THRONE_DAYS, type AllTime, type BoardEntry } from '../../src/meta/board';
import { newRoom, Room, roomSocket, type RoomNamespace } from './room';

// (The Durable Object of a room: wrangler.toml binds it as ROOMS.)
export { Room };

// The little of D1 and of the Workers runtime used here (@cloudflare/workers-types has it all).
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

export interface Env {
  DB: D1Database;
  /** Shared with the checker (a GitHub secret of the same name): it alone may read the orders and give verdicts. */
  VERIFY_SECRET: string;
  /** A fine-grained GitHub token for the one repository, "Actions: read and write": to call the checker. */
  GITHUB_TOKEN?: string;
  /** "tbrought/hegemarch" (wrangler.toml). */
  GITHUB_REPO?: string;
  /** "verify-daily.yml" (wrangler.toml). */
  GITHUB_WORKFLOW?: string;
  /** The rooms of games played together (wrangler.toml: a Durable Object for each). */
  ROOMS?: RoomNamespace;
}

/** The most a request may hold, and a run's orders (a long run's are some tens of kilobytes, gzipped). */
const MAX_BODY = 1_100_000;
const MAX_ORDERS = 1_000_000;
/** The most runs waiting to be checked: past it, the board is busy. */
const MAX_PENDING = 300;
/** The least time between two calls of the checker, and between two looks at a run it cannot check yet. */
const CALL_GAP = 60_000;
const RETRY_GAP = 30 * 60_000;
const DAY = 24 * 60 * 60_000;
/** A name taken down by hand (README.md, "Taking a name down"): it shows as this, and counts as no one's. */
const BLANKED = '???';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } });
}
const fail = (error: string, status = 400) => json({ error }, status);

/** Is this the checker? (The secret, compared in a time that does not tell how much of it was right.) */
function isChecker(req: Request, env: Env): boolean {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const want = env.VERIFY_SECRET ?? '';
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A body of JSON no bigger than it may be, or null. */
async function body(req: Request): Promise<Record<string, unknown> | null> {
  const n = Number(req.headers.get('content-length') ?? 0);
  if (n > MAX_BODY) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Why a run sent is not one the board takes, or null. */
function entryProblem(e: Record<string, unknown>, now: number): string | null {
  if (typeof e.day !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(e.day)) return 'No such day.';
  if (!isBoardDay(e.day, now)) return 'The board for that day is closed.';
  if (typeof e.heir !== 'string' || !/^[a-z]{2,24}$/.test(e.heir)) return 'No such house.';
  if (typeof e.version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(e.version)) return 'No such version.';
  const name = nameProblem(e.name);
  if (name) return name;
  if (typeof e.time !== 'number' || !Number.isFinite(e.time) || e.time <= 0 || e.time > BOARD_LONGEST) return 'The board takes crowns of three hours or less.';
  if (typeof e.victory !== 'string' || !/^[a-z]{2,24}$/.test(e.victory)) return 'No such Destiny.';
  if (e.enc !== 'gzip' && e.enc !== 'json') return 'Orders in no known form.';
  if (typeof e.orders !== 'string' || !e.orders.length || e.orders.length > MAX_ORDERS) return 'Too many orders.';
  return null;
}

/**
 * Call the checker (GitHub Actions: workflow_dispatch), unless it was called less than `gap` ago. (One
 * call does for every run waiting: the checker takes them all, and looks again before it stops.)
 */
export async function callChecker(env: Env, now: number, gap = CALL_GAP): Promise<boolean> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return false;
  const took = await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'dispatched' AND CAST(value AS INTEGER) <= ?")
    .bind(String(now), now - gap)
    .run();
  if (!took.meta.changes) return false;
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW ?? 'verify-daily.yml'}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'hegemarch-board',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) console.error(`the checker could not be called: ${res.status} ${await res.text()}`);
  return res.ok;
}

async function submit(req: Request, env: Env, ctx: Ctx, now: number): Promise<Response> {
  const e = await body(req);
  if (!e) return fail('A run, in JSON, of no more than a megabyte.', 413);
  const why = entryProblem(e, now);
  if (why) return fail(why);
  const entry = e as unknown as BoardEntry;
  const id = (await sha256(`${entry.day}|${entry.heir}|${entry.orders}`)).slice(0, 16);
  const had = await env.DB.prepare('SELECT status FROM runs WHERE id = ?').bind(id).first<{ status: string }>();
  if (had) return json({ id, status: had.status });
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'pending'").first<{ n: number }>();
  if ((waiting?.n ?? 0) >= MAX_PENDING) return fail('The board is busy: send it again in a few minutes.', 503);
  await env.DB.prepare('INSERT INTO runs (id, day, name, heir, version, claimed, victory, orders, enc, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, entry.day, entry.name, entry.heir, entry.version, entry.time, entry.victory, entry.orders, entry.enc, 'pending', now)
    .run();
  ctx.waitUntil(callChecker(env, now).catch((err) => console.error('the checker could not be called', err)));
  return json({ id, status: 'pending' }, 202);
}

async function status(url: URL, env: Env): Promise<Response> {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{16}$/.test(id)) return fail('No such run.', 404);
  const r = await env.DB.prepare('SELECT day, status, time, reason, created FROM runs WHERE id = ?').bind(id).first<{ day: string; status: string; time: number | null; reason: string | null; created: number }>();
  if (!r) return fail('No such run.', 404);
  if (r.status !== 'verified') return json({ status: r.status, ...(r.reason ? { reason: r.reason } : {}) });
  const ahead = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE day = ? AND status = 'verified' AND (time < ? OR (time = ? AND created < ?))")
    .bind(r.day, r.time, r.time, r.created)
    .first<{ n: number }>();
  const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE day = ? AND status = 'verified'").bind(r.day).first<{ n: number }>();
  return json({ status: 'verified', time: r.time, rank: (ahead?.n ?? 0) + 1, of: all?.n ?? 1 });
}

async function board(url: URL, env: Env): Promise<Response> {
  const day = url.searchParams.get('day') ?? '';
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(day)) return fail('No such day.');
  const runs = await env.DB.prepare(`SELECT name, heir, time, victory FROM runs WHERE day = ? AND status = 'verified' ORDER BY time, created LIMIT ${BOARD_SHOWN}`)
    .bind(day)
    .all<{ name: string; heir: string; time: number; victory: string }>();
  const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE day = ? AND status = 'verified'").bind(day).first<{ n: number }>();
  return json({ day, runs: runs.results, count: all?.n ?? 0 }, 200, { 'cache-control': 'public, max-age=30' });
}

/**
 * The throne (1.25.2): today's three fastest crowns, and the Hegemarch of each day before, newest first.
 * Each with its reign: how many days its letters have been crowned, this one too (today's, if they keep it).
 */
async function throne(env: Env, now: number): Promise<Response> {
  const day = dayOf(now);
  const ord = ordOf(day);
  const top = await env.DB.prepare("SELECT name, heir, time, victory FROM runs WHERE day = ? AND status = 'verified' ORDER BY time, created LIMIT 3")
    .bind(day)
    .all<{ name: string; heir: string; time: number; victory: string }>();
  const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE day = ? AND status = 'verified'").bind(day).first<{ n: number }>();
  const today = [];
  for (const r of top.results) {
    // (A name taken down is "???": it reigns once, whoever it was.)
    const had = r.name === BLANKED ? null : await env.DB.prepare('SELECT COUNT(*) AS n FROM crowns WHERE name = ? AND ord < ?').bind(r.name, ord).first<{ n: number }>();
    today.push({ ...r, reign: (had?.n ?? 0) + 1 });
  }
  const past = await env.DB.prepare(
    `SELECT day, name, heir, time, victory,
            CASE WHEN c.name = ? THEN 1 ELSE (SELECT COUNT(*) FROM crowns d WHERE d.name = c.name AND d.ord <= c.ord) END AS reign
       FROM crowns c WHERE c.ord < ? ORDER BY c.ord DESC LIMIT ${THRONE_DAYS}`,
  )
    .bind(BLANKED, ord)
    .all();
  return json({ day, today, count: all?.n ?? 0, past: past.results }, 200, { 'cache-control': 'public, max-age=30' });
}

/**
 * Crown the days gone by: each of the last few days' fastest crown is its Hegemarch. (Set again each time,
 * while a run of that day may still come in or be checked: after three days, every run of it has been.)
 */
export async function crownDays(env: Env, now: number) {
  for (let k = 1; k <= 4; k++) {
    const day = dayOf(now - k * DAY);
    const best = await env.DB.prepare("SELECT name, heir, time, victory FROM runs WHERE day = ? AND status = 'verified' ORDER BY time, created LIMIT 1")
      .bind(day)
      .first<{ name: string; heir: string; time: number; victory: string }>();
    if (!best) {
      await env.DB.prepare('DELETE FROM crowns WHERE day = ?').bind(day).run();
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO crowns (day, ord, name, heir, time, victory) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (day) DO UPDATE SET name = excluded.name, heir = excluded.heir, time = excluded.time, victory = excluded.victory`,
    )
      .bind(day, ordOf(day), best.name, best.heir, best.time, best.victory)
      .run();
  }
}

/**
 * The all-time board (1.28): the fastest crowns of every day there has been, each player's best by their letters
 * (a name taken down, "???", keeps its place as itself, as on its day's board), ties to the one that came first. Every
 * run that stands is kept for good (`prune` drops old orders, never a crown), so this board never forgets one.
 */
export async function allTimeOf(env: Env): Promise<AllTime> {
  const who = `CASE WHEN name = '${BLANKED}' THEN id ELSE name END`;
  const runs = await env.DB.prepare(
    `SELECT name, heir, time, victory, day FROM (
       SELECT name, heir, time, victory, day, created, ROW_NUMBER() OVER (PARTITION BY ${who} ORDER BY time, created) AS best
         FROM runs WHERE status = 'verified')
     WHERE best = 1 ORDER BY time, created LIMIT ${ALLTIME_SHOWN}`,
  ).all<AllTime['runs'][number]>();
  const players = await env.DB.prepare(`SELECT COUNT(DISTINCT ${who}) AS n FROM runs WHERE status = 'verified'`).first<{ n: number }>();
  return { runs: runs.results, players: players?.n ?? 0 };
}

/**
 * Work the all-time board out again, and keep it (in `meta`): when a run comes to stand, and once a day. Asked for, it
 * is read as it was kept (one row), not worked out from every crown there has ever been at each look at the page.
 */
export async function keepAllTime(env: Env): Promise<AllTime> {
  const a = await allTimeOf(env);
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('alltime', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(a)).run();
  return a;
}

async function allTime(env: Env): Promise<Response> {
  const kept = await env.DB.prepare("SELECT value FROM meta WHERE key = 'alltime'").first<{ value: string }>();
  // (Not kept yet: the first look after the Worker that keeps it was deployed, or after it was cleared by hand.)
  const a = kept ? (JSON.parse(kept.value) as AllTime) : await keepAllTime(env);
  return json(a, 200, { 'cache-control': 'public, max-age=60' });
}

/** The checker's: the runs to check, oldest first (not one it looked at in the last half hour and could not check yet). */
async function pending(env: Env, now: number): Promise<Response> {
  const runs = await env.DB.prepare(
    "SELECT id, day, heir, version, claimed, orders, enc FROM runs WHERE status = 'pending' AND (checked IS NULL OR checked < ?) ORDER BY created LIMIT 10",
  )
    .bind(now - RETRY_GAP)
    .all();
  return json({ runs: runs.results });
}

/** The checker's: what it found. `wait`: it cannot check this run yet (its version is not known to it yet). */
async function verdict(req: Request, env: Env, now: number): Promise<Response> {
  const v = await body(req);
  if (!v || typeof v.id !== 'string') return fail('A verdict, in JSON.');
  if (v.wait) {
    await env.DB.prepare("UPDATE runs SET checked = ? WHERE id = ? AND status = 'pending'").bind(now, v.id).run();
    return json({ ok: true });
  }
  const reason = typeof v.reason === 'string' ? v.reason.slice(0, 200) : '';
  if (v.ok === true && typeof v.time === 'number' && Number.isFinite(v.time) && typeof v.victory === 'string') {
    const took = await env.DB.prepare("UPDATE runs SET status = 'verified', time = ?, victory = ?, reason = NULL, checked = ? WHERE id = ? AND status = 'pending'")
      .bind(v.time, v.victory.slice(0, 24), now, v.id)
      .run();
    // (A crown that stands may be one of the fastest ever.)
    if (took.meta.changes) await keepAllTime(env);
  } else {
    await env.DB.prepare("UPDATE runs SET status = 'rejected', reason = ?, orders = NULL, checked = ? WHERE id = ? AND status = 'pending'")
      .bind(reason || 'It did not stand.', now, v.id)
      .run();
  }
  return json({ ok: true });
}

/**
 * Keep the board small: a run never checked is given up after three days, a run that did not stand is
 * forgotten after seven, and the orders of a run that stands are dropped after fourteen days, but for the
 * ten fastest of each day.
 */
export async function prune(env: Env, now: number) {
  await env.DB.prepare("UPDATE runs SET status = 'rejected', reason = 'It could not be checked in time.', orders = NULL, checked = ? WHERE status = 'pending' AND created < ?")
    .bind(now, now - 3 * DAY)
    .run();
  await env.DB.prepare("DELETE FROM runs WHERE status = 'rejected' AND created < ?").bind(now - 7 * DAY).run();
  await env.DB.prepare(
    `UPDATE runs SET orders = NULL WHERE id IN (
       SELECT id FROM (SELECT id, created, ROW_NUMBER() OVER (PARTITION BY day ORDER BY time, created) AS place
                       FROM runs WHERE status = 'verified' AND orders IS NOT NULL)
       WHERE place > 10 AND created < ?)`,
  )
    .bind(now - 14 * DAY)
    .run();
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const now = Date.now();
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (path === '/api/daily/submit' && req.method === 'POST') return await submit(req, env, ctx, now);
      if (path === '/api/daily/status' && req.method === 'GET') return await status(url, env);
      if (path === '/api/daily/board' && req.method === 'GET') return await board(url, env);
      if (path === '/api/daily/throne' && req.method === 'GET') return await throne(env, now);
      if (path === '/api/daily/alltime' && req.method === 'GET') return await allTime(env);
      if (path === '/api/daily/pending' && req.method === 'GET') return isChecker(req, env) ? await pending(env, now) : fail('Not yours.', 401);
      if (path === '/api/daily/verdict' && req.method === 'POST') return isChecker(req, env) ? await verdict(req, env, now) : fail('Not yours.', 401);
      // Games played together.
      if (path === '/api/room/new' && req.method === 'POST') {
        if (!env.ROOMS) return fail('Rooms are not set up here.', 503);
        const made = await newRoom(env.ROOMS);
        return made ? json(made) : fail('No room could be made just now.', 503);
      }
      const room = /^\/api\/room\/([A-Z2-9]{5})\/ws$/.exec(path);
      if (room && env.ROOMS) return await roomSocket(req, env.ROOMS, room[1]);
      return fail('Nothing here.', 404);
    } catch (err) {
      console.error(err);
      return fail('The board could not do that just now.', 500);
    }
  },

  /**
   * Every ten minutes (wrangler.toml): call the checker again for a run left waiting, crown the days gone by, and once a
   * day, prune and work the all-time board out again (a name taken down by hand is blanked there by then).
   */
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const now = Date.now();
    const late = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'pending' AND created < ? AND (checked IS NULL OR checked < ?)")
      .bind(now - 5 * 60_000, now - RETRY_GAP)
      .first<{ n: number }>();
    if (late?.n) ctx.waitUntil(callChecker(env, now, 5 * 60_000).catch((err) => console.error('the checker could not be called', err)));
    await crownDays(env, now);
    const d = new Date(now);
    if (d.getUTCHours() === 4 && d.getUTCMinutes() < 10) {
      await prune(env, now);
      await keepAllTime(env);
    }
  },
};
