/** The abilities of ships that rise in level: what they do, and that one earned is never lost. */
import { describe, expect, it } from 'vitest';
import { mk, run } from './helpers';

describe('Gravity Snare', () => {
  it('holds every enemy ship at the world, wherever it is there, and says how many', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const ark = g.units.get(p.ark)!;
    const home = g.nodes[p.capital];
    ark.abil = [{ id: 'snare', cd: 0 }];
    // One enemy beside the Ark, one at the far edge of the world's well.
    const near = g.spawnUnit('striker', rival.id, home.id, { x: ark.x + 60, y: ark.y });
    const far = g.spawnUnit('striker', rival.id, home.id, { x: home.x + home.well * 0.95, y: home.y });
    expect(Math.hypot(far.x - ark.x, far.y - ark.y)).toBeGreaterThan(200);
    g.fx.length = 0;
    let said = '';
    for (let i = 0; i < 60 && !said; i++) {
      g.step();
      const t = g.fx.find((f) => f.k === 'text' && /^SNARED/.test(f.text));
      if (t && t.k === 'text') said = t.text;
    }
    expect(said).toBe('SNARED 2');
    expect(near.dead || near.snare > 10).toBe(true);
    expect(far.dead || far.snare > 10).toBe(true);
    // A snared ship cannot spool its jump.
    if (!far.dead) {
      g.cmdMove(rival.id, [far.id], rival.capital);
      const charge = far.charge;
      run(g, 2);
      expect(far.lane).toBeFalsy();
      expect(far.charge < 0 || far.charge >= charge - 1e-6 || far.snare > 0).toBe(true);
    }
  });
});

describe('an Ark never loses an ability it has earned', () => {
  it('Ark Ascendant gives two levels and the choice of an ability that comes with them', () => {
    const g = mk();
    const p = g.player;
    const ark = g.units.get(p.ark)!;
    expect(ark.level).toBe(1);
    expect(ark.pendingAbil.length).toBe(0);
    g.addCard(p, 'arkAscendant');
    expect(ark.level).toBe(3);
    expect(ark.pendingAbil.length).toBe(1);
    expect(ark.pendingAbil[0].length).toBe(3);
    expect(g.notes.some((n) => /reached level 3\. Choose a new ability/.test(n.text))).toBe(true);
  });

  it('taken while the Ark is destroyed, its levels wait for the new Ark, and so does the ability', () => {
    const g = mk();
    const p = g.player;
    g.killUnit(g.units.get(p.ark)!, -1);
    expect(p.ark).toBe(-1);
    g.addCard(p, 'arkAscendant');
    expect(p.arkLevel).toBe(3);
    const again = g.spawnUnit('ark', p.id, p.capital);
    expect(again.level).toBe(3);
    // It knows its house's own ability, and is owed the one of level 3.
    expect(again.abil.length).toBe(1);
    expect(again.pendingAbil.length).toBe(1);
    // An Ark that is owed nothing is offered nothing.
    const g2 = mk();
    const ark2 = g2.units.get(g2.player.ark)!;
    g2.grantLevels(ark2, 4);
    const known = ark2.abil.length + ark2.pendingAbil.length;
    expect(known).toBe(3);
    g2.cmdChooseAbility(g2.playerId, ark2.id, ark2.pendingAbil[0][0]);
    g2.cmdChooseAbility(g2.playerId, ark2.id, ark2.pendingAbil[0][0]);
    g2.killUnit(ark2, -1);
    const back = g2.spawnUnit('ark', g2.playerId, g2.player.capital);
    expect(back.level).toBe(5);
    expect(back.abil.length).toBe(3);
    expect(back.pendingAbil.length).toBe(0);
  });

  it('a rival house in the same case learns at once, as it always does', () => {
    const g = mk();
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    g.killUnit(g.units.get(rival.ark)!, -1);
    rival.arkLevel = 5;
    const ark = g.spawnUnit('ark', rival.id, rival.capital);
    expect(ark.abil.length).toBe(3);
    expect(ark.pendingAbil.length).toBe(0);
  });

  it('the Boon is not dealt to a house whose Ark is at level 7 or 8: its levels would be lost', () => {
    const g = mk();
    const p = g.player;
    const inPool = () => g.cardPool(p).some((c) => c.id === 'arkAscendant');
    expect(inPool()).toBe(true);
    p.arkLevel = 6;
    expect(inPool()).toBe(true);
    p.arkLevel = 7;
    expect(inPool()).toBe(false);
    p.arkLevel = 8;
    expect(inPool()).toBe(false);
  });
});
