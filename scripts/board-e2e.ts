/**
 * The Daily board from end to end (1.25): today's Daily, crowned by a bot (scripts/lib/bot.ts: the game's
 * AI, giving its orders as a player does), sent to the board's server (worker/, on a SQLite stand-in for
 * D1), played again by the checker (scripts/verify-daily.ts) in this tree's game code, and shown on the
 * board; and two runs that are not what they say, which the checker turns down: one with an order given
 * for a rival house, and one said to be won in a quarter of its time.
 *   npx tsx scripts/board-e2e.ts [heir,heir,...]
 */
import { Game } from '../src/game/Game';
import { HEIRS } from '../src/game/data/heirs';
import { replay, dailyConfig } from '../src/game/replay';
import { dayOf, packOrders, type BoardEntry } from '../src/meta/board';
import worker, { type Env } from '../worker/src/index';
import { botDaily } from './lib/bot';
import { testDb } from './lib/d1';
import { checkRun, commitOf, treeFor, type Waiting } from './verify-daily';

const fails: string[] = [];
const check = (what: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? `: ${extra}` : ''}`);
  if (!ok) fails.push(what);
};

const day = dayOf(Date.now());
const heirs = process.argv[2] ? process.argv[2].split(',') : HEIRS.slice(0, 6).map((h) => h.id);
let won: Game | null = null;
for (const heir of heirs) {
  const t0 = Date.now();
  const g = botDaily(day, heir, 150);
  const o = g.outcome;
  console.log(`${day} ${heir}: ${o ? `${o.playerWon ? 'crowned' : 'fell'} by ${o.victory} at ${(o.time / 60).toFixed(1)} min` : 'undecided'}, ${g.orders!.length} orders (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  if (o?.playerWon) {
    won = g;
    break;
  }
}
if (!won) {
  console.log('no crown in these houses: nothing to send (try others)');
  process.exit(2);
}
const g = won;
const o = g.outcome!;

// Played again from its orders, it is the same run.
const again = replay(dailyConfig(day, g.player.heir), JSON.parse(JSON.stringify(g.orders)));
check('played again from its orders, the run ends the same', again.outcome?.playerWon === true && again.outcome.time === o.time && again.outcome.victory === o.victory,
  `${again.outcome?.victory} at ${again.outcome?.time} (was ${o.victory} at ${o.time})`);

// The board's server, and the checker.
const env: Env = { DB: testDb(), VERIFY_SECRET: 'the-secret' };
const ctx = { waitUntil: () => {} };
const call = async (path: string, init?: RequestInit) => {
  const res = await worker.fetch(new Request(`https://hegemarch.com/api/daily${path}`, init), env, ctx);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const send = async (orders: unknown[], name: string, time = o.time) => {
  const packed = await packOrders(orders);
  const entry: BoardEntry = { day, heir: g.player.heir, version: '1.25.0', name, time, victory: o.victory, ...packed };
  return call('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
};
const checker = { authorization: 'Bearer the-secret' };
const checkAll = async () => {
  const { body } = await call('/pending', { headers: checker });
  for (const run of body.runs as Waiting[]) {
    const t0 = Date.now();
    const found = checkRun('.', run);
    console.log(`     checked ${run.id}: ${found.ok ? `stands at ${found.time}` : found.reason} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    await call('/verdict', { method: 'POST', headers: checker, body: JSON.stringify({ id: run.id, ...found }) });
  }
};

const sent = await send(g.orders!, 'BOT');
check('the board takes the run, to be checked', sent.status === 202 && sent.body.status === 'pending', JSON.stringify(sent.body));
const packedSize = (await packOrders(g.orders!)).orders.length;
console.log(`     ${g.orders!.length} orders, ${packedSize} characters sent`);
const rival = JSON.parse(JSON.stringify(g.orders)) as [number, string, unknown[]][];
const moved = rival.findIndex(([, name]) => name === 'cmdMove');
rival[moved][2][0] = 1;
const forRival = await send(rival, 'RIV');
const quick = await send(g.orders!.slice(0, -1), 'FST', o.time / 4);
check('and the two that are not what they say', forRival.status === 202 && quick.status === 202, `${JSON.stringify(forRival.body)} ${JSON.stringify(quick.body)}`);
// (The same run sent again, whatever time it is said to take, is the same run: its time is the checker's.)
const again2 = await send(g.orders!, 'DUP', o.time / 4);
check('the same run sent again is the one already sent', again2.body.id === sent.body.id, JSON.stringify(again2.body));
await checkAll();
const mine = await call(`/status?id=${sent.body.id}`);
check('the crown stands, first on the board', mine.body.status === 'verified' && mine.body.rank === 1 && mine.body.of === 1 && mine.body.time === o.time, JSON.stringify(mine.body));
for (const [what, r] of [['an order for a rival house', forRival], ['a crown said to be four times faster', quick]] as const) {
  const theirs = await call(`/status?id=${r.body.id}`);
  check(`${what} does not stand`, theirs.body.status === 'rejected' && typeof theirs.body.reason === 'string', JSON.stringify(theirs.body));
}
const board = await call(`/board?day=${day}`);
const runs = board.body.runs as { name: string; time: number }[];
check("today's board shows the one crown", board.body.count === 1 && runs.length === 1 && runs[0].name === 'BOT' && runs[0].time === o.time, JSON.stringify(board.body));

// A version's code is the last commit with that version (1.24.1: the commit before 1.24.2's); a run said to
// be of a version from before the board is played in that version's code, and does not stand.
const v1241 = commitOf('1.24.1');
check("a version's code is found by the version in package.json", !!v1241?.startsWith('78c9ac0'), v1241 ?? 'none');
check('a version not yet on record waits', commitOf('99.0.0') === null && treeFor('99.0.0') === null);
const old = treeFor('1.24.1');
const before = old ? checkRun(old, { id: 'old', day, heir: g.player.heir, version: '1.24.1', claimed: o.time, orders: (await packOrders(g.orders!)).orders, enc: 'gzip' }) : null;
check('a run of a version from before the board does not stand', before !== null && !before.ok, JSON.stringify(before));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nthe board works from end to end');
process.exit(fails.length ? 1 : 0);
