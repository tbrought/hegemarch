/** Anti-warp fields: what holds a fleet, how far a Bastion reaches, and the worlds it protects. */
import { describe, expect, it } from 'vitest';
import { HOLD_FIELD as FIELD, FIELD_GUARD, FIRE_SPOOL, HOLD_FIELD, JUMP_CHARGE, UNDER_FIRE } from '../src/game/constants';
import { Game } from '../src/game/Game';
import { mk, run } from './helpers';

describe('a fleet can be made to stand', () => {
  it('a Bastion, a Hearth and a world with a Starbase keep an anti-warp field up: enemy ships take longer to jump away', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const hearth = g.nodes[p.capital];
    const plain = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1)!;
    g.kindleWorld(plain, p.id);
    expect(g.fieldAt(hearth)).toBe(true);
    expect(g.fieldAt(plain)).toBe(false);
    const raider = g.spawnUnit('striker', rival.id, plain.id);
    const mine = g.spawnUnit('striker', p.id, plain.id);
    expect(g.jumpChargeOf(raider)).toBeCloseTo(JUMP_CHARGE, 5);
    // As a Bastion (its first role costs no time) the world holds the raider, not its owner's ships.
    expect(g.cmdSetRole(p.id, plain.id, 'bastion')).toBe(true);
    expect(g.fieldAt(plain)).toBe(true);
    expect(g.holdAt(raider)).toBe(HOLD_FIELD);
    expect(g.jumpChargeOf(raider)).toBeCloseTo(JUMP_CHARGE + HOLD_FIELD, 5);
    expect(g.jumpChargeOf(mine)).toBeCloseTo(JUMP_CHARGE, 5);
    // A Starbase does the same for a world that is no Bastion.
    const other = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1)!;
    g.kindleWorld(other, p.id);
    const raider2 = g.spawnUnit('guardian', rival.id, other.id);
    expect(g.holdAt(raider2)).toBe(0);
    g.spawnUnit('starbase', p.id, other.id);
    expect(g.fieldAt(other)).toBe(true);
    expect(g.holdAt(raider2)).toBe(HOLD_FIELD);
    // A Scout is held like any other ship, and a dark world holds no one.
    expect(g.holdAt(g.spawnUnit('scout', rival.id, plain.id))).toBe(HOLD_FIELD);
    const dark = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1)!;
    expect(g.fieldAt(dark)).toBe(false);
    expect(g.holdAt(g.spawnUnit('striker', rival.id, dark.id))).toBe(0);
  });

  it('the Gravity Anchors Boon holds at every world of the house, on top of a field', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const plain = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1)!;
    g.kindleWorld(plain, p.id);
    g.addCard(p, 'anchors');
    const raider = g.spawnUnit('striker', rival.id, plain.id);
    expect(g.holdAt(raider)).toBe(4);
    expect(g.holdAt(g.spawnUnit('striker', rival.id, p.capital))).toBe(HOLD_FIELD + 4);
  });

  it('under fire a drive spools at half speed: running from a fight costs time', () => {
    const g = mk();
    const p = g.player;
    const dark = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1 && !g.buckets[n.id].length)!;
    const to = g.nodes.find((n) => n.id !== dark.id && g.hops(dark.id, n.id) === 1)!;
    const calm = g.spawnUnit('striker', p.id, dark.id);
    const shot = g.spawnUnit('striker', p.id, dark.id);
    g.cmdMove(p.id, [calm.id, shot.id], to.id);
    let tCalm = -1;
    let tShot = -1;
    for (let i = 0; i < 400 && (tCalm < 0 || tShot < 0); i++) {
      shot.lastHit = 0; // (kept under fire)
      g.step();
      if (tCalm < 0 && calm.lane) tCalm = g.time;
      if (tShot < 0 && shot.lane) tShot = g.time;
    }
    expect(tCalm).toBeGreaterThan(0);
    expect(tShot).toBeGreaterThan(tCalm);
    expect(FIRE_SPOOL).toBe(0.5);
    expect(UNDER_FIRE).toBeGreaterThan(0);
    expect((tShot - 0) / (tCalm - 0)).toBeGreaterThan(1.6);
  });
});

describe("a Bastion's field reaches the places one jump from it (the third playtest, and the fourth)", () => {
  /**
   * A star with no Hearth in its system and two dark worlds that meet only at it. The rival's Bastions
   * go there; a ship of the player's waits at each place that might be held.
   */
  function sector() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const beside = (star: { id: number; system: number }) => g.nodes.filter((n) => n.kind === 'planet' && n.capitalOf < 0 && n.owner < 0 && n.system === star.system && g.hops(n.id, star.id) === 1);
    const apart = (star: { id: number; system: number }) => beside(star).filter((x) => beside(star).some((y) => y.id !== x.id && g.hops(x.id, y.id) === 2));
    const star = g.nodes.find((n) => n.kind === 'star' && !g.nodes.some((o) => o.system === n.system && o.capitalOf >= 0) && apart(n).length >= 2)!;
    const a1 = apart(star)[0];
    const far = beside(star).find((y) => y.id !== a1.id && g.hops(a1.id, y.id) === 2)!;
    for (const n of [star, a1, far, ...g.neighbours(a1.id).map((id) => g.nodes[id])]) for (const u of [...g.buckets[n.id]]) g.killUnit(u, -1);
    const bastion = (n: typeof a1, level: number, owner = rival.id) => {
      if (n.owner !== owner) {
        g.kindleWorld(n, owner);
        g.flushDeferred();
      }
      n.role = 'bastion';
      n.retool = 0;
      g.setLevel(n, level);
    };
    const ship = (at: { id: number }, owner = p.id) => g.spawnUnit('striker', owner, at.id);
    return { g, p, rival, star, a1, far, bastion, ship };
  }

  it('it holds its own world and every place one jump away, at every level, and nothing further', () => {
    const { g, rival, star, a1, far, bastion, ship } = sector();
    const next = g.neighbours(a1.id);
    expect(next).toContain(star.id);
    const atNext = next.map((id) => ship({ id }));
    const [atBastion, atFar] = [ship(a1), ship(far)];
    for (const u of [atBastion, atFar, ...atNext]) expect(g.holdAt(u)).toBe(0);
    for (const level of [1, 2, 3]) {
      bastion(a1, level);
      expect(g.holdAt(atBastion)).toBe(FIELD);
      for (const u of atNext) expect(g.holdAt(u)).toBe(FIELD);
      // (Two jumps away, through the star: not held, whatever the Bastion's level.)
      expect(g.holdAt(atFar)).toBe(0);
      expect(g.fieldReaches().filter((r) => r.from === a1.id).map((r) => r.to).sort()).toEqual([...next].sort());
    }
    expect(g.fieldsOver(star)).toEqual([rival.id]);
    expect(g.fieldsFrom(star)).toEqual([a1.id]);
    expect(g.jumpChargeOf(atNext[0])).toBeCloseTo(JUMP_CHARGE + FIELD, 5);
    // It holds the house's enemies only.
    expect(g.holdAt(ship(star, rival.id))).toBe(0);
  });

  it('two Bastions on one star both hold it, and it is one field; retool or lose one, and the other still holds', () => {
    const { g, p, rival, star, a1, far, bastion, ship } = sector();
    const atStar = ship(star);
    bastion(a1, 1);
    bastion(far, 1);
    expect([...g.fieldsFrom(star)].sort()).toEqual([a1.id, far.id].sort());
    expect(g.fieldsOver(star)).toEqual([rival.id]);
    expect(g.holdAt(atStar)).toBe(FIELD);
    expect(g.cmdSetRole(rival.id, far.id, 'mine')).toBe(true);
    expect(g.fieldsFrom(star)).toEqual([a1.id]);
    expect(g.holdAt(atStar)).toBe(FIELD);
    far.retool = 0;
    expect(g.cmdSetRole(rival.id, far.id, 'bastion')).toBe(true);
    // (Retooling: no field until the work is done.)
    expect(far.retool).toBeGreaterThan(0);
    expect(g.fieldsFrom(star)).toEqual([a1.id]);
    far.retool = 0;
    expect([...g.fieldsFrom(star)].sort()).toEqual([a1.id, far.id].sort());
    // Both taken by the player: the rival holds the star no more, and the player's Bastions do.
    for (const n of [a1, far]) g.planetDefeated(n, p.id);
    g.flushDeferred();
    run(g, 0.1);
    expect(g.fieldsOver(star)).not.toContain(rival.id);
    expect(g.holdAt(atStar)).toBe(0);
  });

  it("a Hearth's field and a Starbase's hold their own world only", () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const hearth = g.nodes[p.capital];
    expect(g.fieldAt(hearth)).toBe(true);
    expect(g.isBastion(hearth)).toBe(false);
    for (const id of g.neighbours(hearth.id)) expect(g.fieldsOver(g.nodes[id])).toEqual([]);
    const other = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, hearth.id) === 2)!;
    for (const u of [...g.buckets[other.id]]) g.killUnit(u, -1);
    g.kindleWorld(other, p.id);
    g.flushDeferred();
    g.spawnUnit('starbase', p.id, other.id);
    run(g, 0.1);
    expect(g.fieldAt(other)).toBe(true);
    expect(g.isBastion(other)).toBe(false);
    expect(g.fieldReaches().filter((r) => r.owner === p.id)).toEqual([]);
    expect(g.holdAt(g.spawnUnit('striker', rival.id, other.id))).toBe(FIELD);
    for (const id of g.neighbours(other.id)) expect(g.fieldsOver(g.nodes[id]).includes(p.id)).toBe(g.nodes[id].capitalOf === p.id);
  });
});

describe("a Bastion protects the worlds of its house one jump from it (why build one?)", () => {
  /** What a hit of a hundred takes off a world (its shields and hull together). */
  function hitOf(g: Game, by: number) {
    return (n: Game['nodes'][number]) => {
      n.hp = n.maxHp;
      n.sh = n.maxSh;
      g.damagePlanet(n, 100, 'siege', by);
      return n.maxHp + n.maxSh - n.hp - n.sh;
    };
  }

  function make(g: Game, n: Game['nodes'][number], owner: number) {
    for (const u of [...g.buckets[n.id]]) g.killUnit(u, -1);
    g.kindleWorld(n, owner);
    g.flushDeferred();
  }

  function bastion(g: Game, n: Game['nodes'][number], level: number) {
    n.role = 'bastion';
    n.retool = 0;
    g.setLevel(n, level);
  }

  it('the Hearth takes less while a Bastion next to it stands, and less still as the Bastion is raised; the Bastion itself is the way in', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const hearth = g.nodes[p.capital];
    const hit = hitOf(g, rival.id);
    // (Every Hearth has a world next door: the map sees to it.)
    const near = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, hearth.id) === 1)!;
    const far = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, hearth.id) === 2)!;
    make(g, near, p.id);
    make(g, far, p.id);
    const full = hit(hearth);
    const open = hit(near);
    expect(g.guardsOf(hearth)).toEqual([]);
    expect(g.guardOf(hearth)).toBe(0);
    // Two jumps away a Bastion does nothing for the Hearth, at any level.
    bastion(g, far, 3);
    expect(g.guardsOf(hearth)).toEqual([]);
    expect(hit(hearth)).toBeCloseTo(full, 5);
    // Next door it protects it from level I, and by more with every level.
    expect(FIELD_GUARD.slice(1)).toEqual([0.2, 0.3, 0.4]);
    for (const level of [1, 2, 3]) {
      bastion(g, near, level);
      expect(g.guardsOf(hearth)).toEqual([near.id]);
      expect(g.guardedBy(near)).toContain(hearth.id);
      expect(g.guardOf(hearth)).toBe(FIELD_GUARD[level]);
      expect(hit(hearth)).toBeCloseTo(full * (1 - FIELD_GUARD[level]), 5);
    }
    // The Bastion is not protected by the Hearth: it takes what any world takes.
    expect(g.guardsOf(near)).toEqual([]);
    expect(hit(near)).toBeCloseTo(open, 5);
    // Retooled (or taken), the protection is gone with it.
    expect(g.cmdSetRole(p.id, near.id, 'mine')).toBe(true);
    expect(g.guardsOf(hearth)).toEqual([]);
    expect(hit(hearth)).toBeCloseTo(full, 5);
  });

  it('two Bastions next to one world do not add up: the stronger counts, and both must fall before it is gone', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const hit = hitOf(g, rival.id);
    const dark = (n: Game['nodes'][number]) => n.kind === 'planet' && n.owner < 0 && n.capitalOf < 0;
    const beside = (n: { id: number }) => g.neighbours(n.id).map((id) => g.nodes[id]).filter(dark);
    const world = g.nodes.find((n) => dark(n) && beside(n).length >= 2)!;
    const [a, b] = beside(world);
    for (const n of [world, a, b]) make(g, n, p.id);
    const full = hit(world);
    bastion(g, a, 1);
    bastion(g, b, 3);
    expect([...g.guardsOf(world)].sort()).toEqual([a.id, b.id].sort());
    expect(g.guardOf(world)).toBe(FIELD_GUARD[3]);
    expect(hit(world)).toBeCloseTo(full * (1 - FIELD_GUARD[3]), 5);
    // The stronger is taken: the weaker still protects.
    g.planetDefeated(b, rival.id);
    g.flushDeferred();
    expect(g.guardsOf(world)).toEqual([a.id]);
    expect(hit(world)).toBeCloseTo(full * (1 - FIELD_GUARD[1]), 5);
    expect(g.cmdSetRole(p.id, a.id, 'mine')).toBe(true);
    expect(hit(world)).toBeCloseTo(full, 5);
  });

  it("two Bastions next to each other protect each other; another house's world next door is held, not protected", () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const dark = (n: Game['nodes'][number]) => n.kind === 'planet' && n.owner < 0 && n.capitalOf < 0;
    const a = g.nodes.find((n) => dark(n) && g.neighbours(n.id).some((id) => dark(g.nodes[id])))!;
    const b = g.nodes[g.neighbours(a.id).find((id) => dark(g.nodes[id]))!];
    make(g, a, rival.id);
    bastion(g, a, 2);
    // b is the player's: the rival's field reaches it, and protects nothing there.
    make(g, b, p.id);
    expect(g.guardsOf(b)).toEqual([]);
    expect(g.holdAt(g.spawnUnit('striker', p.id, b.id))).toBe(FIELD);
    // b is the rival's, with a Starbase: protected by the Bastion, and protecting nothing itself.
    g.planetDefeated(b, rival.id);
    g.flushDeferred();
    expect(b.owner).toBe(rival.id);
    b.role = 'mine';
    b.retool = 0;
    g.spawnUnit('starbase', rival.id, b.id);
    expect(g.guardsOf(b)).toEqual([a.id]);
    expect(g.guardsOf(a)).toEqual([]);
    // b a Bastion too: each protects the other, each by its own level.
    bastion(g, b, 1);
    expect(g.guardsOf(a)).toEqual([b.id]);
    expect(g.guardsOf(b)).toEqual([a.id]);
    expect([g.guardOf(a), g.guardOf(b)]).toEqual([FIELD_GUARD[1], FIELD_GUARD[2]]);
  });
});
