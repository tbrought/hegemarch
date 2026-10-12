/** A run told to someone else: lines to paste, and a link that opens the same sector. */
import { describe, expect, it } from 'vitest';
import { challengeCode, challengeFromHash, challengeLink, PLAY_URL, readChallenge, shareLine, shareText, versus, type Challenge } from '../src/app/share';

const c: Challenge = { seed: 3645259011, size: 'medium', difficulty: 1, ages: false, heir: 'concord', won: true, time: 2052, victory: 'conquest' };
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

describe('a challenge link', () => {
  it('carries the sector, its setup and the result to beat, in letters a chat does not mangle', () => {
    const code = challengeCode(c);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(readChallenge(code)).toEqual(c);
    expect(challengeLink(c)).toBe(`${PLAY_URL}#c.${code}`);
    expect(challengeFromHash(`#c.${code}`)).toEqual(c);
    for (const other of [{ ...c, size: 'large' as const, difficulty: 3 as const, ages: true }, { ...c, won: false, victory: '', time: 911, heir: 'lyceum', seed: 0 }, { ...c, seed: 0xffffffff }]) {
      expect(readChallenge(challengeCode(other))).toEqual(other);
    }
  });

  it('is typed by strangers: anything that is not a challenge is no challenge', () => {
    const enc = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    for (const junk of ['', 'hello', '!!!!', enc({ seed: 1 }), enc([2, 1, 1, 1, 0, 'concord', 1, 60, 'conquest']), enc([1, -5, 1, 1, 0, 'concord', 1, 60, 'conquest']), enc([1, 1, 7, 1, 0, 'concord', 1, 60, 'conquest']), enc([1, 1, 1, 9, 0, 'concord', 1, 60, 'conquest']), enc([1, 1, 1, 1, 0, '<img src=x>', 1, 60, 'conquest']), enc([1, 1, 1, 1, 0, 'concord', 1, 1e9, 'conquest']), enc([1, 1.5, 1, 1, 0, 'concord', 1, 60, 'conquest'])]) {
      expect(readChallenge(junk), junk).toBeNull();
    }
    expect(challengeFromHash('#setup')).toBeNull();
    expect(challengeFromHash('')).toBeNull();
    expect(challengeFromHash('#c.')).toBeNull();
  });
});

describe('a run to paste', () => {
  const run = { house: 'Solar Concord', won: true, by: 'Conquest', time: '34:12', size: 'medium' as const, difficulty: 'Normal', daily: null, ages: false, worlds: 14, kills: 212, lost: 61, boons: 11, link: 'https://hegemarch.com/play/#c.x' };

  it('is three lines: what happened, the sector and its figures, the link', () => {
    expect(shareText(run).split('\n')).toEqual([
      'HEGEMARCH · Solar Concord, crowned by Conquest in 34:12',
      'Medium sector · Normal · Worlds 14 · Destroyed 212 · Lost 61 · Boons 11',
      'Play the same sector: https://hegemarch.com/play/#c.x',
    ]);
    expect(shareLine({ ...run, won: false, by: '' })).toBe('HEGEMARCH · Solar Concord, fell after 34:12');
    expect(shareLine({ ...run, ages: true })).toBe('HEGEMARCH · AGES · Solar Concord, crowned by Conquest in 34:12');
  });

  it('a Daily run names its day: the same sector for everyone, one line to compare by', () => {
    expect(shareLine({ ...run, daily: '2026-10-11' })).toBe('HEGEMARCH DAILY 2026-10-11 · Solar Concord, crowned by Conquest in 34:12');
  });

  it('a time against the time to beat', () => {
    expect(versus(1862, 2052, time)).toBe('3:10 faster');
    expect(versus(2094, 2052, time)).toBe('0:42 slower');
    expect(versus(2052.2, 2052, time)).toBe('the same time to the second');
  });
});
