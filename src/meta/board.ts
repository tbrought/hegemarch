/**
 * The Daily board (1.25): the fastest crowns of each day's sector, at hegemarch.com. A crowned Daily can
 * be sent to it under three letters; a checker plays the run again from its orders before it goes up
 * (game/replay.ts, scripts/verify-daily.ts), so a time on the board is one the game itself found.
 *
 * What the game, the website and the board's server (worker/) agree on: where the board is, the letters
 * a run goes up under, the days it takes runs for, and what a run sent to it holds. The board keeps the
 * letters, the house, the time and the orders, and nothing else: no account, no address, no cookie.
 */

/** The board's server. */
export const BOARD_API = 'https://hegemarch.com/api/daily';
/** The board, on the website. */
export const BOARD_PAGE = 'https://hegemarch.com/#board';
/** How many runs of a day the board shows. */
export const BOARD_SHOWN = 50;
/** The longest crown the board takes, in seconds of game time (the checker plays no longer). */
export const BOARD_LONGEST = 3 * 60 * 60;

/** A run sent to the board. */
export interface BoardEntry {
  /** The Daily's day, as its seed knows it: "2026-10-17" (UTC, unpadded). */
  day: string;
  heir: string;
  /** The version of the game the run began in: the checker plays it again in that version. */
  version: string;
  /** Three letters, A to Z. */
  name: string;
  /** The crown's time, in seconds of game time, as the player's game found it (the checker finds its own). */
  time: number;
  victory: string;
  /** The run's orders (`Game.orders`): JSON, gzipped and in base64 (`enc: 'gzip'`), or as it is (`'json'`). */
  orders: string;
  enc: 'gzip' | 'json';
}

/** A run on the board. */
export interface BoardRun {
  name: string;
  heir: string;
  time: number;
  victory: string;
}

/** A day's board: its fastest crowns, first to last, and how many crowns stand on it. */
export interface Board {
  day: string;
  runs: BoardRun[];
  count: number;
}

/** A day's Hegemarch: the fastest crown of a day gone by, and how many days its letters have been crowned. */
export interface Crowned extends BoardRun {
  day: string;
  reign: number;
}

/**
 * The throne (1.25.2): today's three fastest crowns (each with the reign it would be, if it holds), how
 * many crowns stand today, and the Hegemarchs of the days before, newest first.
 */
export interface Throne {
  day: string;
  today: (BoardRun & { reign: number })[];
  count: number;
  past: Crowned[];
}
/** How many days gone by the throne shows. */
export const THRONE_DAYS = 14;

/** What became of a run sent to the board. */
export interface BoardStatus {
  status: 'pending' | 'verified' | 'rejected';
  /** Checked: its time, and its place among the day's crowns (1: the fastest). */
  time?: number;
  rank?: number;
  of?: number;
  /** Not taken: why. */
  reason?: string;
}

/** The day of a moment, as a Daily's seed and its board know it: "2026-10-17" (UTC, unpadded: "2026-10-7"). */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/** A day as a number, to put days in order: days since 1 January 1970. */
export function ordOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000));
}

/** A name with its reign, as a ruler's is written: "ABC" the first time, then "ABC II", "ABC III". */
export function regnal(name: string, reign: number): string {
  if (reign <= 1) return name;
  const R: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let n = reign;
  let out = '';
  for (const [v, s] of R) for (; n >= v; n -= v) out += s;
  return `${name} ${out}`;
}

/** "1st", "2nd", "3rd", "11th": a place on the board. */
export function ordinal(n: number): string {
  const ten = n % 100;
  return `${n}${ten >= 11 && ten <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/** Does the board still take runs of this day? Today's, and yesterday's (a Daily begun late is won after midnight). */
export function isBoardDay(day: string, now = Date.now()): boolean {
  return day === dayOf(now) || day === dayOf(now - 24 * 60 * 60 * 1000);
}

// Three letters that are not to stand on a board others read.
const UNSAID = new Set([
  'ASS', 'CNT', 'COC', 'COK', 'CUM', 'CUK', 'CUN', 'DIC', 'DIK', 'DIX', 'FAG', 'FAP', 'FCK', 'FKU', 'FUC', 'FUK', 'FUQ', 'HOE', 'JIZ',
  'KKK', 'KYS', 'NAZ', 'NGA', 'NGR', 'NIG', 'PIS', 'PNS', 'PUS', 'RAP', 'SEX', 'SHT', 'SLT', 'SUK', 'TIT', 'TWT', 'VAG', 'WTF', 'XXX',
]);

/** Why these are not letters a run can go up under, or null when they are. */
export function nameProblem(name: unknown): string | null {
  if (typeof name !== 'string' || !/^[A-Z]{3}$/.test(name)) return 'Three letters, A to Z.';
  if (UNSAID.has(name)) return 'Not those three: try others.';
  return null;
}

/** A run's orders, small enough to send: JSON, gzipped and in base64 where the browser can gzip. */
export async function packOrders(orders: unknown[]): Promise<{ orders: string; enc: 'gzip' | 'json' }> {
  const json = JSON.stringify(orders);
  if (typeof CompressionStream === 'undefined') return { orders: json, enc: 'json' };
  const zipped = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < zipped.length; i += 0x8000) bin += String.fromCharCode(...zipped.subarray(i, i + 0x8000));
  return { orders: btoa(bin), enc: 'gzip' };
}

/**
 * Where the board is asked: at hegemarch.com, the site's own address (the website and the game at /play/
 * ask nothing of another site); anywhere else the game is played (itch.io, the download, another name of
 * the site), hegemarch.com's, where the board's server is.
 */
export function boardApi(): string {
  try {
    if (location.hostname === new URL(BOARD_API).hostname) return new URL(BOARD_API).pathname;
  } catch {
    /* (No page: the board's full address.) */
  }
  return BOARD_API;
}

async function ask<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(boardApi() + path, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `the board answered ${res.status}`);
  return body;
}

/** Send a crowned Daily to the board: it is checked before it goes up. */
export function postRun(entry: BoardEntry): Promise<{ id: string } & BoardStatus> {
  return ask('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
}

/** What became of a run sent to the board. */
export function runStatus(id: string): Promise<BoardStatus> {
  return ask(`/status?id=${encodeURIComponent(id)}`);
}

/** A day's board. */
export function fetchBoard(day: string): Promise<Board> {
  return ask(`/board?day=${encodeURIComponent(day)}`);
}

/** The throne: today's fastest three and the Hegemarchs of the days before. */
export function fetchThrone(): Promise<Throne> {
  return ask('/throne');
}
