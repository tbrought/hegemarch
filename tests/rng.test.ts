import { describe, expect, it } from 'vitest';
import { RNG, dailySeed, hashString } from '../src/game/rng';

describe('RNG', () => {
  it('is deterministic for a seed', () => {
    const a = new RNG(42);
    const b = new RNG(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(3);
  });

  it('round-trips its state', () => {
    const a = new RNG(7);
    for (let i = 0; i < 50; i++) a.next();
    const b = new RNG(a.state());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it('respects ranges', () => {
    const r = new RNG(9);
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('weighted picks never choose zero-weight items', () => {
    const r = new RNG(3);
    for (let i = 0; i < 500; i++) expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
  });

  it('hashes strings and produces stable daily seeds', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    const d = new Date(Date.UTC(2026, 9, 7));
    expect(dailySeed(d)).toBe(dailySeed(new Date(Date.UTC(2026, 9, 7, 23))));
  });
});
