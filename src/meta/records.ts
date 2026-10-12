import type { Difficulty, MapSize } from '../game/types';

/**
 * A player's records: the best of each figure a run is told by, kept for each kind of run (classic or
 * Ages, the size of its sector, its difficulty), since a crown in twenty minutes on a small sector says
 * nothing about a large one. A run is measured against them when it ends: the crowning stamps a figure
 * that beat its record, and the results show the record beside every figure.
 */
export interface Records {
  /** The fastest crown, in seconds. */
  crown?: number;
  /** The longest a house lasted in a run it lost, in seconds. */
  stand?: number;
  worlds?: number;
  kills?: number;
  boons?: number;
  legacy?: number;
}

export type RecordKey = keyof Records;

/** What a run that has ended is measured by. */
export interface RunFigures {
  won: boolean;
  /** The run's time in seconds (an Ages run: the cradle and the stars together). */
  time: number;
  worlds: number;
  kills: number;
  boons: number;
  legacy: number;
}

/** The kind of run a record belongs to: "classic:medium:1". */
export function bracketOf(c: { mode?: string; size: MapSize; difficulty: Difficulty }): string {
  return `${c.mode === 'ages' ? 'ages' : 'classic'}:${c.size}:${c.difficulty}`;
}

/** The figures of a run as records: its time is a crown's if it was won, a stand's if it was lost. */
export function recordsOf(f: RunFigures): Records {
  return { ...(f.won ? { crown: f.time } : { stand: f.time }), worlds: f.worlds, kills: f.kills, boons: f.boons, legacy: f.legacy };
}

/** Is `now` better than `was`? (Every record is a most, but a crown, which is a least.) */
export function beats(key: RecordKey, now: number, was: number | undefined): boolean {
  if (was === undefined) return true;
  return key === 'crown' ? now < was - 1e-6 : now > was + 1e-6;
}

/**
 * Measure a run against the records of its kind and keep what it bettered. Returns, for each figure of
 * the run, what the record was before it (undefined: there was none), and whether the run beat it.
 * A first run of its kind sets every record and beats none: there was nothing to beat.
 */
export function applyRecords(all: Record<string, Records>, bracket: string, f: RunFigures): Partial<Record<RecordKey, { was: number | undefined; beaten: boolean }>> {
  const had = all[bracket] ?? {};
  const now = recordsOf(f);
  const next: Records = { ...had };
  const out: Partial<Record<RecordKey, { was: number | undefined; beaten: boolean }>> = {};
  for (const key of Object.keys(now) as RecordKey[]) {
    const v = now[key]!;
    const was = had[key];
    const better = beats(key, v, was);
    out[key] = { was, beaten: better && was !== undefined };
    if (better) next[key] = v;
  }
  all[bracket] = next;
  return out;
}
