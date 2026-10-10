import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import type { MapSize } from '../src/game/types';

/** Full headless AI-vs-AI runs: nothing may throw, go NaN, or go negative. */
function soak(seed: number, size: MapSize, minutes: number) {
  const g = Game.create({ seed, size, difficulty: 2, heir: 'vael', perks: {}, unlockLegendary: true, unlockPacts: true, autoplay: true });
  g.fxEnabled = false;
  const ticks = minutes * 60 * 20;
  for (let i = 0; i < ticks && !g.outcome; i++) {
    g.step();
    if (i % 1200 === 0) {
      for (const u of g.unitList) {
        if (u.dead) continue;
        expect(Number.isFinite(u.x) && Number.isFinite(u.y), `unit ${u.type} position`).toBe(true);
        expect(Number.isFinite(u.hp), `unit ${u.type} hp`).toBe(true);
        expect(u.node >= 0 || u.lane !== null).toBe(true);
      }
      for (const f of g.factions) {
        expect(Number.isFinite(f.embers) && f.embers >= 0).toBe(true);
        expect(Number.isFinite(f.lore) && f.lore >= 0).toBe(true);
        // A house that loses worlds may end up over its hangar cap; it just cannot build until it is back under.
        expect(Number.isFinite(f.hangarUsed) && Number.isFinite(f.hangarCap)).toBe(true);
      }
      for (const p of g.projectiles) expect(Number.isFinite(p.x)).toBe(true);
      for (const n of g.nodes) {
        expect(Number.isFinite(n.hp) && Number.isFinite(n.glow)).toBe(true);
        expect(n.level >= 1 && n.level <= 3).toBe(true);
      }
    }
  }
  return g;
}

describe('headless soak', () => {
  it('small sector, seed 11', () => {
    const g = soak(11, 'small', 35);
    expect(g.time).toBeGreaterThan(60);
  });
  it('medium sector, seed 23', () => {
    soak(23, 'medium', 30);
  });
  it('large sector, seed 37', () => {
    soak(37, 'large', 20);
  });
});
