/**
 * How the abilities are seen and heard (1.26, render/abilityLooks.ts): every one has a sound of its own, says
 * what it did over the ship that cast it, and draws what it leaves for as long as it lasts; a cast tells
 * who cast it and what it touched, and each of the houses' own has its shape.
 */
import { describe, expect, it } from 'vitest';
import { CAST_SOUND } from '../src/audio/battleSounds';
import { ABILITIES, castWords } from '../src/game/data/abilities';
import type { Fx, Unit } from '../src/game/types';
import { LASTING } from '../src/render/abilityLooks';
import { Effects } from '../src/render/Effects';
import { mk } from './helpers';

describe('every ability is seen and heard', () => {
  it('has a sound of its own, its words, and a mark for what it leaves', () => {
    for (const a of ABILITIES) {
      expect(CAST_SOUND[a.id], a.id).toBeTruthy();
      if (!a.boss) expect(a.says, a.id).toBeTruthy();
      if (a.leaves) expect(LASTING[a.leaves], a.id).toBeTypeOf('function');
    }
    const sounds = ABILITIES.filter((a) => !a.boss).map((a) => CAST_SOUND[a.id]);
    expect(new Set(sounds).size).toBe(sounds.length);
  });
});

/** The Ark at home with three of its own, hurt, and two enemy Strikers beside it: every ability has its reason. */
function stage(id: string) {
  const g = mk();
  const p = g.player;
  const rival = g.empires().find((f) => f.id !== p.id)!;
  const ark = g.units.get(p.ark)!;
  const home = g.nodes[p.capital];
  const allies: Unit[] = [];
  for (let i = 0; i < 3; i++) {
    const a = g.spawnUnit('striker', p.id, home.id, { x: ark.x - 40 - i * 20, y: ark.y + 30 });
    a.hp = a.maxHp * 0.5;
    allies.push(a);
  }
  ark.hp = ark.maxHp * 0.5;
  for (let i = 0; i < 2; i++) g.spawnUnit('striker', rival.id, home.id, { x: ark.x + 70, y: ark.y + i * 25 });
  ark.abil = [{ id, cd: 0 }];
  const fx: Fx[] = [];
  let cast: Extract<Fx, { k: 'ability' }> | undefined;
  for (let i = 0; i < 400 && !cast; i++) {
    g.fx.length = 0;
    g.step();
    fx.push(...g.fx);
    cast = g.fx.find((f): f is Extract<Fx, { k: 'ability' }> => f.k === 'ability' && f.by === ark.id && f.id === id);
  }
  return { g, ark, fx, cast, allies };
}

describe('a cast says who, what and on whom', () => {
  for (const a of ABILITIES.filter((x) => !x.boss)) {
    it(`${a.name}: the ship that cast it, what it touched, its words, and its shape`, () => {
      const { g, ark, fx, cast } = stage(a.id);
      expect(cast, `${a.id} was never cast`).toBeDefined();
      expect(cast!.by).toBe(ark.id);
      expect(cast!.on.length).toBeGreaterThan(0);
      expect(cast!.says).toBe(castWords(a, cast!.on.length));
      // What the eye is given: the caster lit, its words over it, the ships it touched ticked as the reach comes.
      const e = new Effects();
      e.unitPos = (id) => {
        const u = g.units.get(id);
        return u && !u.dead ? { x: u.x, y: u.y, r: 10, a: u.a } : null;
      };
      e.ingest(fx, () => true, () => true, 0.5);
      expect(e.marks.get(ark.id)?.some((m) => m.kind === 'lit')).toBe(true);
      expect(e.floaters.some((f) => f.label && f.text === cast!.says && f.c === g.factions[ark.owner].color)).toBe(true);
      const touched = cast!.on.filter((id) => id !== ark.id && g.units.get(id) && !g.units.get(id)!.dead);
      if (a.id !== 'strikewing') for (const id of touched) expect(e.marks.get(id)?.some((m) => m.kind === 'tick' || m.kind === 'wipe'), `${a.id} on ${id}`).toBe(true);
      // Its own shape.
      if (a.id === 'nanite') expect(e.motes.length).toBeGreaterThan(0);
      if (a.id === 'strikewing') {
        expect(cast!.on.filter((id) => e.marks.get(id)?.some((m) => m.kind === 'trail')).length).toBe(6);
        // (No ring round the ship but the one that lights it: a ring round a ship is a Gravity Snare's, a ship held.)
        expect(e.rings.filter((r) => r.c === a.color || r.c === '#ff6fb5').length).toBe(1);
        expect(e.sparks.filter((s) => s.c === a.color).length).toBeGreaterThanOrEqual(12);
      }
      if (a.id === 'emp') expect(touched.some((id) => e.marks.get(id)?.some((m) => m.kind === 'crackle'))).toBe(true);
      if (a.id === 'phaselance') {
        expect(e.lances.length).toBe(1);
        expect(e.floaters.some((f) => f.num && /^-\d+$/.test(f.text))).toBe(true);
      }
      if (a.id === 'conversion') {
        expect(e.threads.length).toBe(cast!.on.length);
        for (const id of cast!.on) {
          const w = e.marks.get(id)?.find((m) => m.kind === 'wipe');
          expect(w?.from).toBe(g.factions.find((f) => f.id !== ark.owner && f.kind === 'empire' && f.color === w?.from)?.color);
          expect(w?.c).toBe(g.factions[ark.owner].color);
        }
      }
    });
  }
});

describe('the simulation is untouched by being seen', () => {
  it('a run with its effects drawn from and one without come out the same', () => {
    const a = mk();
    const b = mk();
    b.fxEnabled = false;
    for (let i = 0; i < 20 * 60 * 3; i++) {
      a.step();
      a.fx.length = 0;
      b.step();
    }
    const units = (g: typeof a) => JSON.stringify(g.unitList.filter((u) => !u.dead).map((u) => [u.id, u.owner, Math.round(u.x), Math.round(u.hp)]));
    expect(units(a)).toBe(units(b));
  });
});
