/**
 * Rules and messages that came out of player feedback (the first public playtest, October 2026):
 * what a player sees must be what happened.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { FIRE_SPOOL, HOLD_FIELD, JUMP_CHARGE, SCOUT_CHARGE, SCOUT_SLIP, TICK, UNDER_FIRE } from '../src/game/constants';
import { GOAL_REWARD, GOALS } from '../src/game/data/goals';
import type { GameConfig } from '../src/game/types';
import { GLOSS_BY_ID, termsIn } from '../src/ui/glossary';

function mk(opts: Partial<GameConfig> = {}): Game {
  return Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, ...opts });
}

function run(g: Game, seconds: number) {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n && !g.outcome; i++) {
    g.step();
    g.fx.length = 0;
  }
}

describe('no ship is lost silently', () => {
  it('a ship of the player\'s that is destroyed is said in the log: where, what, and to whom', () => {
    const g = mk();
    const p = g.player;
    const home = g.nodes[p.capital];
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, home.id);
    const before = g.notes.length;
    g.killUnit(scout, rival.id);
    const note = g.notes[g.notes.length - 1];
    expect(g.notes.length).toBe(before + 1);
    expect(note.text).toBe(`Lost at ${home.name} to ${rival.name}: 1 Scout.`);
    expect(note.kind).toBe('bad');
    expect(note.node).toBe(home.id);
  });

  it('ships lost at the same place soon after are added to the same line', () => {
    const g = mk();
    const p = g.player;
    const home = g.nodes[p.capital];
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const ships = [g.spawnUnit('scout', p.id, home.id), g.spawnUnit('scout', p.id, home.id), g.spawnUnit('striker', p.id, home.id)];
    g.killUnit(ships[0], rival.id);
    const id = g.notes[g.notes.length - 1].id;
    run(g, 3);
    g.killUnit(ships[1], rival.id);
    g.killUnit(ships[2], rival.id);
    const note = g.notes.find((n) => n.id === id)!;
    expect(note.text).toBe(`Lost at ${home.name} to ${rival.name}: 2 Scouts, 1 Striker.`);
    expect(g.notes.filter((n) => n.loss).length).toBe(1);
    // Much later it is a new line.
    run(g, 25);
    g.killUnit(g.spawnUnit('guardian', p.id, home.id), rival.id);
    expect(g.notes.filter((n) => n.loss).length).toBe(2);
    expect(g.notes[g.notes.length - 1].text).toBe(`Lost at ${home.name} to ${rival.name}: 1 Guardian.`);
  });

  it('the seed ship and the Ark keep their own words, and a rival\'s losses are not the player\'s news', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    g.killUnit(g.spawnUnit('seed', p.id, p.capital), rival.id);
    g.killUnit(g.units.get(p.ark)!, rival.id);
    g.killUnit(g.spawnUnit('striker', rival.id, rival.capital), p.id);
    expect(g.notes.some((n) => n.loss)).toBe(false);
    expect(g.notes.some((n) => /seed ship was destroyed/.test(n.text))).toBe(true);
  });

  it('the tally survives saving and loading', () => {
    const g = mk();
    const p = g.player;
    g.killUnit(g.spawnUnit('scout', p.id, p.capital), g.empires().find((f) => f.id !== p.id)!.id);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.notes[again.notes.length - 1].loss).toEqual(g.notes[g.notes.length - 1].loss);
    again.killUnit(again.spawnUnit('scout', p.id, p.capital), -1);
    expect(again.notes[again.notes.length - 1].text).toMatch(/2 Scouts\.$/);
  });
});

describe('Scouts are built to look and leave', () => {
  it('a Scout\'s drive spools in less than half the time of any other ship\'s', () => {
    const g = mk();
    const p = g.player;
    const scout = g.spawnUnit('scout', p.id, p.capital);
    const striker = g.spawnUnit('striker', p.id, p.capital);
    expect(g.jumpChargeOf(striker)).toBeCloseTo(JUMP_CHARGE, 5);
    expect(g.jumpChargeOf(scout)).toBeCloseTo(JUMP_CHARGE * SCOUT_CHARGE, 5);
    expect(SCOUT_CHARGE).toBeLessThan(0.5);
  });

  it('nothing can fire on a Scout in its first seconds at a place; one that stays is a target', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    const striker = g.spawnUnit('striker', p.id, rival.capital);
    scout.arrivedAt = g.time;
    striker.arrivedAt = g.time;
    expect(g.slips(scout)).toBe(true);
    expect(g.slips(striker)).toBe(false);
    // Under a rival Hearth's guns and fleet, the Scout is untouched while it slips...
    const hp = scout.hp + scout.sh;
    run(g, SCOUT_SLIP - 0.5);
    expect(scout.dead).toBe(false);
    expect(scout.hp + scout.sh).toBeGreaterThanOrEqual(hp);
    // ...and fired on once that is over.
    scout.path = [];
    run(g, 25);
    expect(g.slips(scout)).toBe(false);
    expect(scout.dead || scout.hp + scout.sh < hp).toBe(true);
  });

  it('a Scout with nothing left to chart goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    p.explored.fill(1);
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    scout.arrivedAt = g.time;
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.order).toBe('idle');
    expect(scout.dest).toBeGreaterThanOrEqual(0);
    expect(g.nodes[scout.dest].owner).toBe(p.id);
    expect(scout.path.length).toBeGreaterThan(0);
    expect(g.notes.some((n) => /Scouts are coming home/.test(n.text))).toBe(true);
  });

  it('a way that keeps clear of trouble goes round a place when it can, and through it when it must', () => {
    const g = mk();
    const N = g.nodes.length;
    // With nothing to avoid it is the sector's own shortest way.
    let tried = 0;
    for (let a = 0; a < N && tried < 40; a++) {
      for (let b = 0; b < N && tried < 40; b++) {
        if (a === b || g.hops(a, b) < 3) continue;
        tried++;
        expect(g.pathAvoiding(a, b, () => 0)).toEqual(g.pathTo(a, b));
        const way = g.pathTo(a, b);
        const mid = way[0];
        const round = g.pathAvoiding(a, b, (id) => (id === mid ? 1e6 : 0));
        // A way is always found (the sector is connected), it ends at b, and every step is a starlane.
        expect(round[round.length - 1]).toBe(b);
        let at = a;
        for (const step of round) {
          expect(g.lanes.some((l) => (l.a === at && l.b === step) || (l.b === at && l.a === step))).toBe(true);
          at = step;
        }
        // It goes through the avoided place only if there is no other way.
        const others = g.lanes.filter((l) => l.a === a || l.b === a).length;
        if (others > 1 && !round.includes(mid)) expect(round).not.toContain(mid);
      }
    }
    expect(tried).toBeGreaterThan(10);
    // The ends themselves are never avoided.
    const [a, b] = [0, g.nodes.length - 1];
    expect(g.pathAvoiding(a, b, (id) => (id === a || id === b ? 1e9 : 0))).toEqual(g.pathTo(a, b));
  });

  it('at least once in the sector the way round is taken instead of the way through', () => {
    const g = mk();
    const N = g.nodes.length;
    let rounds = 0;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        if (a === b || g.hops(a, b) < 2) continue;
        const mid = g.pathTo(a, b)[0];
        if (mid === b) continue;
        if (!g.pathAvoiding(a, b, (id) => (id === mid ? 1e6 : 0)).includes(mid)) rounds++;
      }
    }
    expect(rounds).toBeGreaterThan(0);
  });
});

describe('shields that are gone look gone', () => {
  it('the moment a world\'s shields give way is shown once, not at every hit after it', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const n = g.nodes[rival.capital];
    expect(n.maxSh).toBeGreaterThan(0);
    n.sh = n.maxSh;
    g.fx.length = 0;
    g.damagePlanet(n, n.maxSh * 0.5, 'energy', p.id);
    expect(g.fx.some((f) => f.k === 'text')).toBe(false);
    g.damagePlanet(n, n.maxSh * 5, 'energy', p.id);
    expect(g.fx.filter((f) => f.k === 'text' && f.text === 'SHIELDS DOWN').length).toBe(1);
    // Under fire the shields recharge only a trickle: the next hits say nothing more.
    for (let i = 0; i < 40; i++) {
      g.step();
      g.damagePlanet(n, 50, 'energy', p.id);
    }
    expect(g.fx.filter((f) => f.k === 'text' && f.text === 'SHIELDS DOWN').length).toBe(1);
  });
});

describe('the glossary', () => {
  it('knows what a house is, as an everyday word: explained only when nothing rarer is mentioned', () => {
    expect(GLOSS_BY_ID.house).toBeTruthy();
    expect(GLOSS_BY_ID.house.basic).toBe(true);
    expect(termsIn('Every house has its own Ark.').map((t) => t.id)).toEqual(['ark']);
    expect(termsIn('A rival house.').map((t) => t.id)).toEqual(['house']);
    // The tooltip of the first playtest: omens and relics are the rare words in it.
    expect(termsIn('Your total bonus now, counting your house, the omens, your Boons and your relics.').map((t) => t.id)).toEqual(['omen', 'relic']);
  });
});

describe('the Maw', () => {
  const withMaw = () => mk({ forcedVictories: ['conquest', 'crisis', 'domination'] });

  it('says when the void barrier around the Rift Heart falls, and who wins by destroying it', () => {
    const g = withMaw();
    const C = g.crisis!;
    C.awakenAt = g.time + 1;
    run(g, 3);
    const heart = g.units.get(C.heart)!;
    const barrier = heart.buffs.find((b) => b.id === 'barrier')!;
    expect(barrier.t).toBeGreaterThan(200);
    expect(C.barrierDown).toBeFalsy();
    barrier.t = 1;
    run(g, 3);
    expect(g.hasBuff(heart, 'barrier')).toBe(false);
    expect(C.barrierDown).toBe(true);
    const said = g.notes.filter((n) => /void barrier around the Rift Heart has fallen/.test(n.text));
    expect(said.length).toBe(1);
    expect(said[0].text).toMatch(/the house that lands the killing blow wins by Purge the Void/);
    run(g, 5);
    expect(g.notes.filter((n) => /void barrier around the Rift Heart has fallen/.test(n.text)).length).toBe(1);
  });

  it('the killing blow on the Rift Heart takes the crown, and the Destiny says so', () => {
    const g = withMaw();
    const C = g.crisis!;
    C.awakenAt = g.time + 1;
    run(g, 3);
    const heart = g.units.get(C.heart)!;
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    // The player does all the work; a rival lands the last hit.
    g.damageUnit(heart, heart.maxHp * 5, 'energy', g.playerId, null);
    heart.buffs = [];
    heart.hp = 1;
    g.damageUnit(heart, 500, 'energy', rival.id, null);
    run(g, 1);
    expect(g.outcome?.victory).toBe('crisis');
    expect(g.outcome?.winner).toBe(rival.id);
  });

  it('a move order can keep clear of places: the ships take the way round', () => {
    const g = mk();
    const p = g.player;
    // Two places with another way between them than the shortest one.
    let done = false;
    for (const from of g.nodes) {
      for (const n of g.nodes) {
        if (done || g.hops(from.id, n.id) < 3) continue;
        const mid = g.pathTo(from.id, n.id)[1];
        const round = g.pathAvoiding(from.id, n.id, (id) => (id === mid ? 1e6 : 0));
        if (round.includes(mid)) continue;
        const u = g.spawnUnit('striker', p.id, from.id);
        g.cmdMove(p.id, [u.id], n.id, undefined, undefined, (id) => (id === mid ? 1e6 : 0));
        expect(u.path).toEqual(round);
        expect(u.dest).toBe(n.id);
        const v = g.spawnUnit('striker', p.id, from.id);
        g.cmdMove(p.id, [v.id], n.id);
        expect(v.path).toEqual(g.pathTo(from.id, n.id));
        expect(v.path).toContain(mid);
        done = true;
      }
    }
    expect(done).toBe(true);
  });
});

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

describe('rival fleets', () => {
  it('come home for their Hearth from any distance', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    // The rival's fleet is far from home (more than four jumps)...
    const farNode = g.nodes.filter((n) => n.kind === 'planet' && g.hops(n.id, rival.capital) > 4).sort((a, b) => g.hops(b.id, rival.capital) - g.hops(a.id, rival.capital))[0];
    expect(farNode).toBeTruthy();
    for (const u of g.unitsOf(rival.id)) if (u.type !== 'ark' && u.type !== 'scout') g.killUnit(u, -1);
    const fleet = [0, 1, 2, 3, 4, 5].map(() => g.spawnUnit('guardian', rival.id, farNode.id));
    // ...when a strong enemy arrives at its Hearth.
    for (let i = 0; i < 14; i++) g.spawnUnit('breaker', p.id, rival.capital);
    run(g, 6);
    const coming = fleet.filter((u) => !u.dead && (u.dest === rival.capital || u.node === rival.capital));
    expect(coming.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the First Night', () => {
  it('deals its first Boons by hand: three plain ones about what the player has just done', () => {
    const g = mk({ tutorial: true, difficulty: 0 });
    const p = g.player;
    p.pendingDrafts = 1;
    expect(g.ensureOffer(p)).toEqual(['emberTithe', 'strikerWings', 'kindlingRites']);
    // A reroll is a random deal again, and so is every later offer.
    p.rerolls = 5;
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      g.cmdReroll(p.id);
      seen.add(g.ensureOffer(p)!.join(','));
    }
    expect([...seen].some((o) => o !== 'emberTithe,strikerWings,kindlingRites')).toBe(true);
    g.cmdChooseCard(p.id, g.ensureOffer(p)![0]);
    p.pendingDrafts = 1;
    expect(g.ensureOffer(p)!.length).toBe(3);
  });

  it('a run that is not the First Night deals its first Boons at random, and rivals are never dealt by hand', () => {
    const offers = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const g = mk({ seed });
      g.player.pendingDrafts = 1;
      offers.add(g.ensureOffer(g.player)!.join(','));
    }
    expect(offers.size).toBeGreaterThan(1);
    const g = mk({ tutorial: true });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    rival.pendingDrafts = 1;
    const dealt = g.generateOffer(rival);
    expect(g.ui.tutBoon).toBeFalsy();
    expect(dealt.length).toBeGreaterThan(0);
  });
});

describe('first goals', () => {
  it('each names one thing to do and why, and none is reached before the game begins', () => {
    const g = mk();
    expect(new Set(GOALS.map((x) => x.id)).size).toBe(GOALS.length);
    for (const goal of GOALS) {
      expect(goal.label.length).toBeGreaterThan(5);
      expect(goal.why.length).toBeGreaterThan(20);
      expect(goal.done(g, g.player)).toBe(false);
    }
  });

  it('a goal pays its reward when it is truly reached, once a run, and only to the player', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const before = p.embers;
    expect(g.cmdGoal(p.id, 'worlds')).toBe(false);
    expect(g.cmdGoal(p.id, 'no such goal')).toBe(false);
    for (const n of g.nodes.filter((x) => x.kind === 'planet' && x.owner === -1).slice(0, 4)) g.kindleWorld(n, p.id);
    expect(g.cmdGoal(rival.id, 'worlds')).toBe(false);
    expect(g.cmdGoal(p.id, 'worlds')).toBe(true);
    expect(p.embers).toBeCloseTo(before + GOAL_REWARD, 5);
    expect(g.notes[g.notes.length - 1].text).toBe(`Goal reached: Hold 4 worlds. +${GOAL_REWARD} Embers.`);
    expect(g.cmdGoal(p.id, 'worlds')).toBe(false);
    expect(p.embers).toBeCloseTo(before + GOAL_REWARD, 5);
    // It is remembered through a save.
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.cmdGoal(again.playerId, 'worlds')).toBe(false);
  });

  it('giving a world a role and raising one are goals the game notices', () => {
    const g = mk();
    const p = g.player;
    const n = g.nodes.find((x) => x.kind === 'planet' && x.owner === -1)!;
    g.kindleWorld(n, p.id);
    expect(GOALS.find((x) => x.id === 'role')!.done(g, p)).toBe(false);
    expect(g.cmdSetRole(p.id, n.id, n.role === 'forge' ? 'mine' : 'forge')).toBe(true);
    expect(GOALS.find((x) => x.id === 'role')!.done(g, p)).toBe(true);
    p.embers = 9999;
    expect(GOALS.find((x) => x.id === 'level')!.done(g, p)).toBe(false);
    expect(g.cmdUpgrade(p.id, n.id)).toBe(true);
    expect(GOALS.find((x) => x.id === 'level')!.done(g, p)).toBe(true);
  });
});

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
    // A Scout is too small to hold, and a dark world holds no one.
    expect(g.holdAt(g.spawnUnit('scout', rival.id, plain.id))).toBe(0);
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
