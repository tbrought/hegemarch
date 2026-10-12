import { describe, expect, it } from 'vitest';
import { computePaths, EMPIRES_BY_SIZE, generateMap } from '../src/game/mapgen';
import type { MapSize } from '../src/game/types';
import { dist } from '../src/game/util';

const sizes: MapSize[] = ['small', 'medium', 'large'];

describe('map generation', () => {
  for (const size of sizes) {
    for (const seed of [1, 2, 3, 99, 12345, 777777]) {
      it(`${size} seed ${seed} is valid`, () => {
        const m = generateMap(seed, { size, empires: EMPIRES_BY_SIZE[size], crisis: seed % 2 === 0 });
        // Homeworlds
        expect(m.homes.length).toBe(EMPIRES_BY_SIZE[size]);
        // Connectivity
        const { dist: D } = computePaths(m.nodes, m.lanes);
        const N = m.nodes.length;
        for (let i = 0; i < N; i++) expect(isFinite(D[i])).toBe(true);
        // No overlapping gravity wells
        for (let i = 0; i < N; i++) {
          for (let j = i + 1; j < N; j++) {
            const a = m.nodes[i];
            const b = m.nodes[j];
            expect(dist(a.x, a.y, b.x, b.y)).toBeGreaterThan(a.well + b.well);
          }
        }
        // Special content
        expect(m.pirateBase).toBeGreaterThanOrEqual(0);
        if (seed % 2 === 0) expect(m.rift).toBeGreaterThanOrEqual(0);
        else expect(m.rift).toBe(-1);
        expect(m.relicSites.length).toBeGreaterThanOrEqual(2);
        // Fairness: each home has at least 3 colonizable planets within its own system
        for (const h of m.homes) {
          const sys = m.nodes[h].system;
          const local = m.nodes.filter((n) => n.system === sys && n.kind === 'planet' && n.id !== h);
          expect(local.length).toBeGreaterThanOrEqual(3);
        }
        // Lanes are symmetric
        for (const n of m.nodes) for (const nb of n.lanes) expect(m.nodes[nb].lanes).toContain(n.id);
      });
    }
  }

  it('every Hearth has a world next door (a Bastion protects the worlds one jump from it)', () => {
    for (const size of sizes) {
      for (let seed = 1; seed <= 40; seed++) {
        const m = generateMap(seed * 31, { size, empires: EMPIRES_BY_SIZE[size], crisis: seed % 2 === 0 });
        for (const h of m.homes) {
          const next = m.nodes[h].lanes.map((id) => m.nodes[id]);
          expect(next.some((n) => n.kind === 'planet')).toBe(true);
          // (And still no Hearth next to another.)
          expect(next.some((n) => n.tag === 'home')).toBe(false);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = generateMap(5, { size: 'medium', empires: 4, crisis: true });
    const b = generateMap(5, { size: 'medium', empires: 4, crisis: true });
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
  });
});
