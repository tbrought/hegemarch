/**
 * The Daily board (1.25): what the game, the website and the board's server agree on (meta/board.ts),
 * and the server itself (worker/), on its own schema in Node's SQLite: what it takes and turns down,
 * what it keeps (and what it does not: no address), what the checker sees and says, the board it shows,
 * its call to the checker, and how it keeps itself small.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICK } from '../src/game/constants';
import { REPLAY_TICKS } from '../src/game/replay';
import { BOARD_LONGEST, dayOf, isBoardDay, nameProblem, ordinal, ordOf, packOrders, regnal, type BoardEntry } from '../src/meta/board';
import { todayKey } from '../src/meta/profile';
import worker, { callChecker, crownDays, prune, type Env } from '../worker/src/index';
import { testDb } from '../scripts/lib/d1';
import { unpack } from '../scripts/verify-daily';

const DAY = 24 * 60 * 60 * 1000;

describe('what the board and the game agree on', () => {
  it('three letters, A to Z, and not those that are not to stand on a board', () => {
    expect(nameProblem('ABC')).toBeNull();
    expect(nameProblem('abc')).toMatch(/Three letters/);
    expect(nameProblem('AB')).toMatch(/Three letters/);
    expect(nameProblem('AB1')).toMatch(/Three letters/);
    expect(nameProblem(42)).toMatch(/Three letters/);
    expect(nameProblem('KKK')).toMatch(/Not those three/);
  });

  it('the day as the seed knows it, today\'s and yesterday\'s board open', () => {
    const now = Date.UTC(2026, 9, 7, 23, 30);
    expect(dayOf(now)).toBe('2026-10-7');
    expect(dayOf(Date.now())).toBe(todayKey());
    expect(isBoardDay('2026-10-7', now)).toBe(true);
    expect(isBoardDay('2026-10-6', now)).toBe(true);
    expect(isBoardDay('2026-10-5', now)).toBe(false);
    expect(isBoardDay('2026-10-8', now)).toBe(false);
  });

  it('a day as a number, and a name with its reign, as a ruler\'s is written', () => {
    expect(ordOf('1970-1-2')).toBe(1);
    expect(ordOf('2026-10-17') - ordOf('2026-10-7')).toBe(10);
    expect(ordOf('2026-3-1') - ordOf('2026-2-28')).toBe(1);
    expect([1, 2, 3, 4, 9, 14, 40, 1999].map((n) => regnal('ABC', n))).toEqual(['ABC', 'ABC II', 'ABC III', 'ABC IV', 'ABC IX', 'ABC XIV', 'ABC XL', 'ABC MCMXCIX']);
  });

  it('places, and the longest crown the checker plays', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
    expect(Math.round(BOARD_LONGEST / TICK)).toBe(REPLAY_TICKS);
  });

  it('a run\'s orders, packed by the game and unpacked by the checker, are what they were', async () => {
    const orders = [[0, 'cmdMove', [0, [1, 2, 3], 7, null, null, null]], [12, 'ensureOffer', [0]], [40, 'cmdChooseCard', [0, 'warp']]];
    const packed = await packOrders(orders);
    expect(packed.enc).toBe('gzip');
    expect(unpack(packed.orders, packed.enc)).toEqual(orders);
    expect(unpack(JSON.stringify(orders), 'json')).toEqual(orders);
  });
});

// ---------------------------------------------------------------------------------------------------

const SECRET = 'the-checker-and-the-board';
function board() {
  const env: Env = { DB: testDb(), VERIFY_SECRET: SECRET };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const call = async (path: string, init?: RequestInit & { headers?: Record<string, string> }) => {
    const res = await worker.fetch(new Request(`https://hegemarch.com/api/daily${path}`, init), env, ctx);
    return { status: res.status, headers: res.headers, body: res.status === 204 ? {} : ((await res.json()) as Record<string, unknown>) };
  };
  const entry = (over: Partial<BoardEntry> = {}): BoardEntry => ({
    day: dayOf(Date.now()), heir: 'concord', version: '1.25.0', name: 'ABC', time: 1800, victory: 'conquest', orders: 'H4sIAAAA' + Math.random(), enc: 'gzip', ...over,
  });
  const submit = (e: unknown, headers: Record<string, string> = {}) =>
    call('/submit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof e === 'string' ? e : JSON.stringify(e) });
  const checker = { authorization: `Bearer ${SECRET}` };
  const verdict = (v: object) => call('/verdict', { method: 'POST', headers: checker, body: JSON.stringify(v) });
  const sql = async (q: string, ...v: unknown[]) => (await env.DB.prepare(q).bind(...v).all()).results;
  return { env, ctx, waits, call, entry, submit, checker, verdict, sql };
}

describe('the board\'s server', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes a run to be checked, the same run once, and keeps no address', async () => {
    const b = board();
    const e = b.entry();
    const first = await b.submit(e, { 'cf-connecting-ip': '203.0.113.9' });
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ id: expect.stringMatching(/^[0-9a-f]{16}$/), status: 'pending' });
    expect(first.headers.get('access-control-allow-origin')).toBe('*');
    const again = await b.submit({ ...e, name: 'XYZ', time: 10 });
    expect(again.body).toEqual({ id: first.body.id, status: 'pending' });
    const rows = await b.sql('SELECT * FROM runs');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
    expect(Object.keys(rows[0]).sort()).toEqual(['checked', 'claimed', 'created', 'day', 'enc', 'heir', 'id', 'name', 'orders', 'reason', 'status', 'time', 'version', 'victory']);
  });

  it('turns down what is not a run it takes, and says why', async () => {
    const b = board();
    const now = Date.now();
    const cases: [unknown, RegExp][] = [
      ['not json', /A run, in JSON/],
      [b.entry({ day: dayOf(now - 3 * DAY) }), /closed/],
      [b.entry({ day: 'today' }), /No such day/],
      [b.entry({ heir: 'Robert"); DROP TABLE runs;--' }), /No such house/],
      [b.entry({ version: 'latest' }), /No such version/],
      [b.entry({ name: 'KKK' }), /Not those three/],
      [b.entry({ name: 'ab' }), /Three letters/],
      [b.entry({ time: 4 * 60 * 60 }), /three hours or less/],
      [b.entry({ time: -1 }), /three hours or less/],
      [b.entry({ victory: '' }), /No such Destiny/],
      [{ ...b.entry(), enc: 'zip' }, /no known form/],
      [b.entry({ orders: 'x'.repeat(1_000_001) }), /megabyte|Too many orders/],
    ];
    for (const [e, why] of cases) {
      const r = await b.submit(e);
      expect(r.status, String(why)).toBeGreaterThanOrEqual(400);
      expect(r.body.error).toMatch(why);
    }
    expect(await b.sql('SELECT id FROM runs')).toHaveLength(0);
  });

  it('is busy, not flooded, when many runs wait', async () => {
    const b = board();
    for (let i = 0; i < 300; i++) {
      await b.env.DB.prepare("INSERT INTO runs (id, day, name, heir, version, claimed, victory, orders, enc, status, created) VALUES (?, ?, 'ABC', 'concord', '1.25.0', 60, 'conquest', 'x', 'gzip', 'pending', ?)")
        .bind(i.toString(16).padStart(16, '0'), dayOf(Date.now()), Date.now())
        .run();
    }
    const r = await b.submit(b.entry());
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/busy/);
  });

  it('hands its runs to the checker alone, takes its verdicts, and shows the day\'s board', async () => {
    const b = board();
    const ids: string[] = [];
    for (const [name, time] of [['SLO', 2400], ['FST', 1500], ['MID', 1900], ['BAD', 900]] as const) ids.push((await b.submit(b.entry({ name, time }))).body.id as string);
    expect((await b.call('/pending')).status).toBe(401);
    expect((await b.call('/pending', { headers: { authorization: 'Bearer wrong-but-the-same-length-ok' } })).status).toBe(401);
    expect((await b.verdict({ id: ids[0], ok: true, time: 1, victory: 'conquest' }).then(() => b.call('/pending', { headers: { authorization: 'nope' } }))).status).toBe(401);
    const pending = await b.call('/pending', { headers: b.checker });
    expect((pending.body.runs as { id: string; orders: string }[]).map((r) => r.id)).toEqual(ids.slice(1));
    expect((pending.body.runs as { orders: string }[])[0].orders).toMatch(/^H4sIAAAA/);
    // (The first was given a verdict above, by the checker: a time it found, not the one claimed.)
    await b.verdict({ id: ids[1], ok: true, time: 1499.5, victory: 'domination' });
    await b.verdict({ id: ids[2], ok: true, time: 1900, victory: 'conquest' });
    await b.verdict({ id: ids[3], ok: false, time: 0, victory: '', reason: 'played again, the run did not end in your crown' });
    const day = dayOf(Date.now());
    const shown = await b.call(`/board?day=${day}`);
    expect(shown.headers.get('cache-control')).toMatch(/max-age/);
    expect(shown.body).toEqual({
      day,
      count: 3,
      runs: [
        { name: 'SLO', heir: 'concord', time: 1, victory: 'conquest' },
        { name: 'FST', heir: 'concord', time: 1499.5, victory: 'domination' },
        { name: 'MID', heir: 'concord', time: 1900, victory: 'conquest' },
      ],
    });
    expect((await b.call(`/status?id=${ids[2]}`)).body).toEqual({ status: 'verified', time: 1900, rank: 3, of: 3 });
    expect((await b.call(`/status?id=${ids[3]}`)).body).toEqual({ status: 'rejected', reason: 'played again, the run did not end in your crown' });
    expect((await b.sql('SELECT orders FROM runs WHERE id = ?', ids[3]))[0].orders).toBeNull();
    expect((await b.call('/status?id=0000000000000000')).status).toBe(404);
    expect((await b.call('/status?id=../../etc')).status).toBe(404);
    // A verdict given once stands: a second is not taken.
    await b.verdict({ id: ids[3], ok: true, time: 5, victory: 'conquest' });
    expect((await b.call(`/status?id=${ids[3]}`)).body.status).toBe('rejected');
    expect((await b.call('/pending', { headers: b.checker })).body.runs).toEqual([]);
  });

  it('a run the checker cannot check yet waits, and is not handed over again for half an hour', async () => {
    const b = board();
    const { id } = (await b.submit(b.entry())).body as { id: string };
    await b.verdict({ id, wait: true });
    expect((await b.call('/pending', { headers: b.checker })).body.runs).toEqual([]);
    expect((await b.call(`/status?id=${id}`)).body).toEqual({ status: 'pending' });
    await b.env.DB.prepare('UPDATE runs SET checked = ? WHERE id = ?').bind(Date.now() - 31 * 60_000, id).run();
    expect(((await b.call('/pending', { headers: b.checker })).body.runs as { id: string }[]).map((r) => r.id)).toEqual([id]);
  });

  it('answers a browser\'s question before a POST, and nothing where there is nothing', async () => {
    const b = board();
    const pre = await b.call('/submit', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect((await b.call('/elsewhere')).status).toBe(404);
    expect((await b.call('/board?day=x')).status).toBe(400);
  });

  it('calls the checker when a run comes in, once a minute at most', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    const b = board();
    b.env.GITHUB_TOKEN = 'github_pat_x';
    b.env.GITHUB_REPO = 'tbrought/hegemarch';
    b.env.GITHUB_WORKFLOW = 'verify-daily.yml';
    await b.submit(b.entry());
    await b.submit(b.entry());
    await Promise.all(b.waits);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.github.com/repos/tbrought/hegemarch/actions/workflows/verify-daily.yml/dispatches');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ ref: 'main' });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer github_pat_x');
    expect(await callChecker(b.env, Date.now() + 61_000)).toBe(true);
    expect(calls).toHaveLength(2);
    // (No token: no call, and no harm.)
    expect(await callChecker({ ...b.env, GITHUB_TOKEN: undefined }, Date.now() + 10 * 60_000)).toBe(false);
  });

  it('crowns each day gone by its Hegemarch, counts their reigns, and shows the throne', async () => {
    const b = board();
    const now = Date.now();
    let n = 0;
    const add = (day: string, name: string, time: number, status = 'verified') =>
      b.env.DB.prepare("INSERT INTO runs (id, day, name, heir, version, claimed, time, victory, orders, enc, status, created) VALUES (?, ?, ?, 'vael', '1.25.0', 60, ?, 'conquest', 'o', 'gzip', ?, ?)")
        .bind(`d${String(++n).padStart(15, '0')}`, day, name, time, status, now)
        .run();
    const ago = (k: number) => dayOf(now - k * DAY);
    // Four days ago and three days ago, ABC was fastest; two days ago, ZED (ABC was slower, and a faster run did not stand); yesterday, no one.
    await add(ago(4), 'ABC', 2000);
    await add(ago(4), 'ZED', 2100);
    await add(ago(3), 'ABC', 1900);
    await add(ago(2), 'ABC', 2500);
    await add(ago(2), 'ZED', 2400);
    await add(ago(2), 'BAD', 100, 'rejected');
    // Today: ABC leads, MOM second, ZED third, and a fourth.
    for (const [name, time] of [['ZED', 2300], ['ABC', 1500], ['MOM', 1700], ['SLO', 4000]] as const) await add(dayOf(now), name, time);
    await crownDays(b.env, now);
    expect(await b.sql('SELECT day, name, time FROM crowns ORDER BY ord')).toEqual([
      { day: ago(4), name: 'ABC', time: 2000 },
      { day: ago(3), name: 'ABC', time: 1900 },
      { day: ago(2), name: 'ZED', time: 2400 },
    ]);
    const t = await b.call('/throne');
    expect(t.headers.get('cache-control')).toMatch(/max-age/);
    expect(t.body).toEqual({
      day: dayOf(now),
      count: 4,
      today: [
        { name: 'ABC', heir: 'vael', time: 1500, victory: 'conquest', reign: 3 },
        { name: 'MOM', heir: 'vael', time: 1700, victory: 'conquest', reign: 1 },
        { name: 'ZED', heir: 'vael', time: 2300, victory: 'conquest', reign: 2 },
      ],
      past: [
        { day: ago(2), name: 'ZED', heir: 'vael', time: 2400, victory: 'conquest', reign: 1 },
        { day: ago(3), name: 'ABC', heir: 'vael', time: 1900, victory: 'conquest', reign: 2 },
        { day: ago(4), name: 'ABC', heir: 'vael', time: 2000, victory: 'conquest', reign: 1 },
      ],
    });
    // A late run of two days ago, checked now, takes that day's crown: the days are crowned again.
    await add(ago(2), 'ABC', 2200);
    await crownDays(b.env, now);
    expect((await b.call('/throne')).body.past).toMatchObject([{ name: 'ABC', reign: 3 }, { name: 'ABC', reign: 2 }, { name: 'ABC', reign: 1 }]);
  });

  it('keeps itself small: a run never checked is given up, one turned down forgotten, and old orders dropped but for the fastest', async () => {
    const b = board();
    const now = Date.now();
    const add = (id: string, day: string, status: string, time: number | null, created: number) =>
      b.env.DB.prepare("INSERT INTO runs (id, day, name, heir, version, claimed, time, victory, orders, enc, status, created) VALUES (?, ?, 'ABC', 'concord', '1.25.0', 60, ?, 'conquest', 'orders', 'gzip', ?, ?)")
        .bind(id, day, time, status, created)
        .run();
    await add('a000000000000000', '2026-1-1', 'pending', null, now - 4 * DAY);
    await add('a000000000000001', '2026-1-1', 'rejected', null, now - 8 * DAY);
    for (let i = 0; i < 12; i++) await add(`b0000000000000${String(i).padStart(2, '0')}`, '2026-1-2', 'verified', 1000 + i, now - 15 * DAY);
    await add('c000000000000000', '2026-1-3', 'verified', 5000, now - DAY);
    await prune(b.env, now);
    const rows = await b.sql('SELECT id, status, orders FROM runs ORDER BY id');
    const of = (id: string) => rows.find((r) => r.id === id);
    expect(of('a000000000000000')).toMatchObject({ status: 'rejected', orders: null });
    expect(of('a000000000000001')).toBeUndefined();
    expect(rows.filter((r) => String(r.id).startsWith('b') && r.orders !== null)).toHaveLength(10);
    expect(of('b000000000000010')?.orders).toBeNull();
    expect(of('b000000000000011')?.orders).toBeNull();
    expect(of('c000000000000000')?.orders).toBe('orders');
  });
});
