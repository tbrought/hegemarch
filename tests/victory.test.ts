/** Worlds taken, houses fallen, and every way to the crown. */
import { describe, expect, it } from 'vitest';
import { RELICS } from '../src/game/data/relics';
import { UNITS } from '../src/game/data/units';
import { ASCENSION_BOONS, DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget } from '../src/game/data/victories';
import { mk, run } from './helpers';

describe('capture and victory', () => {
  it('taking a Hearth puts out its house; conquest ends the run', () => {
    const g = mk();
    const p = g.player;
    const r1 = g.factions[1];
    g.planetDefeated(g.nodes[r1.capital], p.id);
    g.flushDeferred();
    expect(r1.alive).toBe(false);
    expect(g.outcome).toBeNull();
    const r2 = g.factions[2];
    g.planetDefeated(g.nodes[r2.capital], p.id);
    g.flushDeferred();
    run(g, 2);
    expect(g.outcome?.victory).toBe('conquest');
    expect(g.outcome?.playerWon).toBe(true);
  });

  it('losing your Hearth is a defeat', () => {
    const g = mk();
    g.planetDefeated(g.nodes[g.player.capital], 1);
    g.flushDeferred();
    expect(g.outcome?.victory).toBe('defeat');
    expect(g.outcome?.playerWon).toBe(false);
  });

  it('dominion requires holding the share for the full duration', () => {
    const g = mk({ forcedVictories: ['conquest', 'domination', 'relics'], difficulty: 0 });
    const need = Math.ceil(g.worldCount * DOMINATION_SHARE);
    let owned = g.worldsOf(0).length;
    for (const n of g.nodes) {
      if (owned >= need) break;
      if (n.kind !== 'planet' || n.owner !== -1) continue;
      g.kindleWorld(n, 0);
      owned++;
    }
    run(g, DOMINATION_HOLD - 20);
    expect(g.outcome).toBeNull();
    run(g, 30);
    expect(g.outcome?.victory).toBe('domination');
  });

  it('Ember Hoard requires holding the hoard', () => {
    const g = mk({ forcedVictories: ['conquest', 'treasury', 'relics'], difficulty: 0 });
    g.player.embers = treasuryTarget('small') + 2000;
    run(g, TREASURY_HOLD - 10);
    expect(g.outcome).toBeNull();
    run(g, 15);
    expect(g.outcome?.victory).toBe('treasury');
  });

  it('relic victory requires holding enough relics', () => {
    const g = mk({ forcedVictories: ['conquest', 'relics', 'treasury'], difficulty: 0 });
    const need = relicsRequired(g.relicTotal);
    g.player.relics = RELICS.slice(0, need).map((r) => r.id);
    g.recomputeMods(g.player);
    run(g, RELIC_HOLD - 10);
    expect(g.outcome).toBeNull();
    run(g, 15);
    expect(g.outcome?.victory).toBe('relics');
  });

  it('the Starfire Gate charges to Ascension', () => {
    const g = mk({ forcedVictories: ['conquest', 'ascension', 'relics'], difficulty: 0 });
    const p = g.player;
    p.embers = 20000;
    expect(g.checkGate(p.id, p.capital)).toMatch(/Boons/);
    p.boons = ASCENSION_BOONS;
    expect(g.cmdQueueGate(p.id, p.capital)).toBe(true);
    run(g, UNITS.gate.buildTime + 2);
    expect(p.gate).not.toBeNull();
    run(g, GATE_CHARGE + 5);
    expect(g.outcome?.victory).toBe('ascension');
  });

  it('destroying the Rift Heart wins Purge the Void', () => {
    const g = mk({ forcedVictories: ['conquest', 'crisis', 'relics'] });
    expect(g.crisis).not.toBeNull();
    g.crisis!.awakenAt = 0.5;
    run(g, 1);
    const heart = g.units.get(g.crisis!.heart)!;
    expect(heart.type).toBe('heart');
    g.killUnit(heart, g.player.id);
    g.flushDeferred();
    expect(g.outcome?.victory).toBe('crisis');
  });
});
