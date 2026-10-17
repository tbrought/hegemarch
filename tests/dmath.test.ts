/**
 * The simulation's sine, cosine, arc tangent and vector length (dmath.ts): as near Math's as Math's own
 * are to the truth, the same to the last bit in every engine (they are made of + - * / and sqrt alone),
 * and the only ones the simulation uses, so a Daily run comes out the same in every browser (the board, 1.25).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { datan2, dcos, dhypot, dsin } from '../src/game/dmath';

describe('the simulation\'s own sine, cosine and arc tangent', () => {
  it('are within a bit or so of Math\'s', () => {
    let worst = 0;
    for (let i = 0; i < 100000; i++) {
      const x = (i - 50000) * 0.01337;
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
      const y = Math.sin(i) * 500;
      const z = Math.cos(i * 1.7) * 500;
      worst = Math.max(worst, Math.abs(datan2(y, z) - Math.atan2(y, z)), Math.abs(dhypot(y, z) - Math.hypot(y, z)));
    }
    expect(worst).toBeLessThan(3e-13);
  });

  it('give these values, to the last bit, wherever they run', () => {
    expect([1, 3, 10, -7.25, 1234.5].map(dsin)).toEqual([0.8414709848078965, 0.1411200080598672, -0.5440211108893698, -0.8230808790115055, 0.14539565052293643]);
    expect([1, 3, 10, -7.25, 1234.5].map(dcos)).toEqual([0.5403023058681398, -0.9899924966004454, -0.8390715290764524, 0.5679241732886948, -0.989373592132422]);
    expect([datan2(1, 1), datan2(-3, 2), datan2(2, -5), datan2(-0.5, -0.25), datan2(1e-9, 3)]).toEqual([
      0.7853981633974483, -0.982793723247329, 2.761086276477428, -2.0344439357957027, 3.3333333333333337e-10,
    ]);
  });

  it('and keep Math\'s answers at the edges', () => {
    for (const x of [0, -0, Math.PI / 2, -Math.PI, 1e-12]) {
      expect(dsin(x)).toBeCloseTo(Math.sin(x), 15);
      expect(dcos(x)).toBeCloseTo(Math.cos(x), 15);
    }
    expect(Object.is(dsin(-0), -0)).toBe(true);
    expect(dsin(NaN)).toBeNaN();
    expect(dcos(Infinity)).toBeNaN();
    for (const [y, x] of [[0, 1], [0, -1], [-0, -1], [1, 0], [-1, 0], [0, 0], [0, -0]]) expect(datan2(y, x)).toBe(Math.atan2(y, x));
    expect(dhypot(3, 4)).toBe(5);
  });
});

describe('the simulation uses no math an engine may do its own way', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

  it('no Math.sin, cos, tan, atan2, hypot, exp, log or pow, and no ** (src/game)', () => {
    const odd: string[] = [];
    for (const f of files('src/game')) {
      if (f.endsWith('dmath.ts')) continue;
      readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          const code = line.replace(/\/\*.*?(\*\/|$)/g, '').replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          if (/Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|hypot|exp|expm1|log|log2|log10|log1p|pow|cbrt)\b|\*\*/.test(code)) odd.push(`${f}:${i + 1}`);
        });
    }
    expect(odd).toEqual([]);
  });

  it('and chance from outside the run only for what is drawn (Math.random: effects, a new seed)', () => {
    const odd: string[] = [];
    for (const f of files('src/game')) {
      const lines = readFileSync(f, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!line.includes('Math.random')) return;
        const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (!near.includes('fxEnabled') && !near.includes('function randomSeed')) odd.push(`${f}:${i + 1}`);
      });
    }
    expect(odd).toEqual([]);
  });
});
