import type { Difficulty, MapSize } from '../game/types';

/**
 * A run told to someone else: a few lines to paste, and a link that opens the same sector with the same
 * setup, so that a friend plays exactly what was played and the two can be compared. There is no server
 * and no leaderboard: the comparison travels in the link itself.
 */

/** Where a challenge link leads: the game on its own site, wherever the run was played. */
export const PLAY_URL = 'https://hegemarch.com/play/';

/** A run to be played again by someone else: its sector and setup, and what its first player made of it. */
export interface Challenge {
  seed: number;
  size: MapSize;
  difficulty: Difficulty;
  ages: boolean;
  /** The house that played it (the one who takes the challenge plays what they like). */
  heir: string;
  won: boolean;
  /** Seconds: to the crown, or until the house fell. */
  time: number;
  /** The Destiny it was won by ('' for a run that was lost). */
  victory: string;
}

const SIZES: MapSize[] = ['small', 'medium', 'large'];

/** A challenge as a short code of letters, digits, "-" and "_": nothing a chat or a link mangles. */
export function challengeCode(c: Challenge): string {
  const raw = JSON.stringify([1, c.seed >>> 0, SIZES.indexOf(c.size), c.difficulty, c.ages ? 1 : 0, c.heir, c.won ? 1 : 0, Math.floor(c.time), c.victory]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The other way. Null for anything that is not a challenge this build can read: a link is typed by strangers. */
export function readChallenge(code: string): Challenge | null {
  try {
    if (!/^[A-Za-z0-9_-]{8,400}$/.test(code)) return null;
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const a: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    if (!Array.isArray(a) || a[0] !== 1 || a.length < 9) return null;
    const [, seed, size, difficulty, ages, heir, won, time, victory] = a as unknown[];
    const whole = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;
    if (!whole(seed, 0, 0xffffffff) || !whole(size, 0, 2) || !whole(difficulty, 0, 3) || !whole(time, 0, 24 * 3600)) return null;
    if (typeof heir !== 'string' || !/^[a-z]{2,20}$/.test(heir) || typeof victory !== 'string' || !/^[a-z]{0,20}$/.test(victory)) return null;
    return { seed, size: SIZES[size], difficulty: difficulty as Difficulty, ages: ages === 1, heir, won: won === 1, time, victory };
  } catch {
    return null;
  }
}

export function challengeLink(c: Challenge): string {
  return `${PLAY_URL}#c.${challengeCode(c)}`;
}

/** The challenge a page was opened with ("#c.<code>"), if any. */
export function challengeFromHash(hash: string): Challenge | null {
  const m = /^#?c\.([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? readChallenge(m[1]) : null;
}

/** What a run's result is told with. */
export interface ShareRun {
  house: string;
  won: boolean;
  /** The Destiny's name ("Conquest"), or the house that was crowned instead, or ''. */
  by: string;
  time: string;
  size: MapSize;
  difficulty: string;
  /** The day of a Daily run ("2026-10-11"), or null. */
  daily: string | null;
  ages: boolean;
  worlds: number;
  kills: number;
  lost: number;
  boons: number;
  link: string;
}

/** A run in one line: what a Daily run is compared by, pasted as it is. */
export function shareLine(r: ShareRun): string {
  const what = r.daily ? `HEGEMARCH DAILY ${r.daily}` : r.ages ? 'HEGEMARCH · AGES' : 'HEGEMARCH';
  const how = r.won ? `crowned${r.by ? ` by ${r.by}` : ''} in ${r.time}` : `fell after ${r.time}`;
  return `${what} · ${r.house}, ${how}`;
}

/** A run in three lines to paste: what happened, the sector and its figures, and the link to play it. */
export function shareText(r: ShareRun): string {
  const size = r.size[0].toUpperCase() + r.size.slice(1);
  return [
    shareLine(r),
    `${size} sector · ${r.difficulty} · Worlds ${r.worlds} · Destroyed ${r.kills} · Lost ${r.lost} · Boons ${r.boons}`,
    `Play the same sector: ${r.link}`,
  ].join('\n');
}

/** A time against the time to beat: "3:10 faster", "0:42 slower". */
export function versus(mine: number, theirs: number, fmt: (s: number) => string): string {
  const d = Math.round(mine) - Math.round(theirs);
  return d === 0 ? 'the same time to the second' : `${fmt(Math.abs(d))} ${d < 0 ? 'faster' : 'slower'}`;
}
