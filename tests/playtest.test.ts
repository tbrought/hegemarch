/**
 * Rules and messages that came out of player feedback (the first public playtest, October 2026):
 * what a player sees must be what happened.
 */
import { describe, expect, it } from 'vitest';
import { Game, HISTORY_EVERY } from '../src/game/Game';
import { FIRE_SPOOL, HOLD_FIELD, JUMP_CHARGE, TICK, UNDER_FIRE } from '../src/game/constants';
import { CARD_BY_ID, LEGENDARY_BY } from '../src/game/data/cards';
import { GOAL_REWARD, GOALS } from '../src/game/data/goals';
import type { GameConfig } from '../src/game/types';
import { EPIC_ODDS, perkDesc, PERKS, perksSpent, UNLOCKS } from '../src/meta/legacy';
import { PERK_EMBERS, PERK_HEARTH, PERK_HULL, PERK_LORE, PERK_WALLS } from '../src/meta/perks';
import { ECON } from '../src/game/data/worlds';
import { HOLD_FIELD as FIELD } from '../src/game/constants';
import { modDelta, modLines } from '../src/game/modstats';
import { scale } from '../src/app/charts';
import { readRunData, runData } from '../src/app/rundata';
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

describe('Scouts explore without throwing themselves away', () => {
  /** Enough of a rival's ships at a place for it to count as guarded, and the place in the player's sight. */
  function guard(g: Game, nodeId: number) {
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    for (let i = 0; i < 4; i++) g.spawnUnit('striker', rival.id, nodeId);
    g.player.explored[nodeId] = 1;
  }

  it('a Scout is a ship like any other: no quicker drive, and guards fire on it at once', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const scout = g.spawnUnit('scout', p.id, rival.capital);
    const striker = g.spawnUnit('striker', p.id, p.capital);
    expect(g.jumpChargeOf(g.spawnUnit('scout', p.id, p.capital))).toBeCloseTo(g.jumpChargeOf(striker), 5);
    expect(g.jumpChargeOf(striker)).toBeCloseTo(JUMP_CHARGE, 5);
    // At a rival Hearth it is held by the anti-warp field like any ship, and shot at from the start.
    expect(g.holdAt(scout)).toBe(HOLD_FIELD);
    const hp = scout.hp + scout.sh;
    scout.arrivedAt = g.time;
    run(g, 3);
    expect(scout.dead || scout.hp + scout.sh < hp).toBe(true);
  });

  it('an exploring Scout charts a place from next door: once the place is in sight it does not fly in', () => {
    const g = mk();
    const p = g.player;
    const scout = g.unitsOf(p.id).find((u) => u.type === 'scout') ?? g.spawnUnit('scout', p.id, p.capital);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    const first = scout.dest;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(p.explored[first]).toBeFalsy();
    expect(scout.path[scout.path.length - 1]).toBe(first);
    // The place comes into sight (as it does when the Scout reaches the place next door).
    p.explored[first] = 1;
    g.step();
    expect(scout.dest).not.toBe(first);
    expect(scout.path).not.toContain(first);
    expect(scout.order).toBe('explore');
  });

  it('it never plans a way through a place it has seen to be guarded, and looks before every leap', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const scout = g.unitsOf(p.id).find((u) => u.type === 'scout') ?? g.spawnUnit('scout', p.id, p.capital);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.path.length).toBeGreaterThan(1);
    const through = scout.path[0];
    // A rival fleet turns up at the next place on its way: the Scout thinks again, at once.
    guard(g, through);
    g.step();
    expect(scout.path).not.toContain(through);
    // Whatever it picks from now on, no guarded place is on the way (the last stop is the uncharted goal).
    for (let i = 0; i < 6; i++) {
      scout.path = [];
      scout.dest = -1;
      scout.charge = -1;
      g.step();
      const onTheWay = scout.path.slice(0, -1);
      expect(onTheWay.some((id) => p.explored[id] && g.hostilePowerAt(id, p.id) > 1)).toBe(false);
      if (scout.dest >= 0) p.explored[scout.dest] = 1;
    }
  });

  it('with no safe way on, it says how much lies beyond guards and goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    // Everything is charted but one place, and every way to that one is guarded.
    const far = g.nodes.filter((n) => n.owner !== p.id && g.hops(p.capital, n.id) >= 3).sort((a, b) => g.hops(p.capital, b.id) - g.hops(p.capital, a.id))[0];
    p.explored.fill(1);
    p.explored[far.id] = 0;
    for (const nb of far.lanes) guard(g, nb);
    const start = g.nodes.find((n) => n.kind === 'planet' && n.owner === -1 && !far.lanes.includes(n.id) && n.id !== far.id && !g.buckets[n.id].length)!;
    const scout = g.spawnUnit('scout', p.id, start.id);
    g.cmdExplore(p.id, [scout.id]);
    g.step();
    expect(scout.order).toBe('idle');
    const note = g.notes[g.notes.length - 1].text;
    expect(note).toMatch(/Scouting done as far as it is safe: 1 place lies beyond guarded passages/);
    expect(g.nodes[scout.dest].owner).toBe(p.id);
    // By hand it still goes wherever it is sent: that is the player's call.
    g.cmdMove(p.id, [scout.id], far.id);
    expect(scout.dest).toBe(far.id);
    expect(scout.path.length).toBeGreaterThan(0);
    void rival;
  });

  it('the game knows how much a Scout could chart safely from home', () => {
    const g = mk();
    const p = g.player;
    const open = g.chartable(p.id);
    expect(open).toBeGreaterThan(3);
    // Guard every place next to the house's worlds: nothing can be reached safely any more.
    const rival = g.empires().find((f) => f.id !== p.id)!;
    for (const n of g.nodes) {
      if (!p.explored[n.id] || n.owner === p.id) continue;
      for (let i = 0; i < 4; i++) g.spawnUnit('striker', rival.id, n.id);
    }
    expect(g.chartable(p.id)).toBe(0);
    const far = g.nodes.find((n) => !p.explored[n.id])!;
    expect(g.safeWay(p, p.capital, far.id)).toEqual([]);
  });

  it('a Scout with nothing left to chart goes home', () => {
    const g = mk();
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    p.explored.fill(1);
    const scout = g.spawnUnit('scout', p.id, rival.capital);
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
    // (Home: the Hearth, or a place a jump or two from it where they gather while they are too few to win.)
    const home = (id: number) => id >= 0 && g.hops(id, rival.capital) <= 2;
    const coming = fleet.filter((u) => !u.dead && (home(u.dest) || (u.dest < 0 && home(u.node))));
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

describe('saving changes nothing', () => {
  it('a Hearth comes back from a save with the walls it had, also between two seconds', () => {
    const g = mk();
    run(g, 100.45);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    for (const f of g.empires()) {
      const a = g.nodes[f.capital];
      const b = again.nodes[f.capital];
      expect(b.maxHp).toBe(a.maxHp);
      expect(b.maxSh).toBe(a.maxSh);
      expect(again.wallsOf(b)).toBe(g.wallsOf(a));
    }
    // And they go on growing in step.
    run(g, 5.2);
    run(again, 5.2);
    for (const f of g.empires()) expect(again.nodes[f.capital].maxHp).toBe(g.nodes[f.capital].maxHp);
    expect(g.wallsOf(g.nodes[g.player.capital])).toBeGreaterThan(0.45);
  });
});

describe('the map says what is left', () => {
  it('a place with nothing left in it is known as spent: an opened anomaly, an empty vault, a dead Corsair base, a purged Maw', () => {
    const g = mk({ size: 'medium', forcedVictories: ['conquest', 'crisis', 'relics'] });
    const anomaly = g.nodes.find((n) => n.kind === 'anomaly' && n.anomaly)!;
    const vault = g.nodes.find((n) => n.kind === 'relic' && n.relic)!;
    const base = g.nodes.find((n) => n.kind === 'pirate')!;
    const maw = g.nodes.find((n) => n.kind === 'rift')!;
    for (const n of [anomaly, vault, base, maw]) expect(g.siteSpent(n)).toBe(false);
    anomaly.anomaly = null;
    vault.relic = null;
    g.pirates.alive = false;
    g.crisis!.dead = true;
    for (const n of [anomaly, vault, base, maw]) expect(g.siteSpent(n)).toBe(true);
    // A world or a star is never "spent".
    expect(g.siteSpent(g.nodes[g.player.capital])).toBe(false);
    expect(g.siteSpent(g.nodes.find((n) => n.kind === 'star')!)).toBe(false);
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

describe('a rival house wants a derelict too', () => {
  /** A derelict Dreadnought drifting at an empty place the house knows, as near its Hearth as there is one. */
  function derelictNear(g: Game, fid: number) {
    const f = g.factions[fid];
    const n = g.nodes
      .filter((x) => (x.kind === 'star' || (x.kind === 'planet' && x.owner < 0)) && !x.claim && !x.hazard && x.id !== f.capital && g.hostilePowerAt(x.id, fid) === 0 && g.buckets[x.id].length === 0)
      .sort((a, b) => g.hops(a.id, f.capital) - g.hops(b.id, f.capital))[0];
    n.claim = { what: 'derelict', f: -1, t: 0 };
    f.explored[n.id] = 1;
    return n;
  }

  it('two of its free ships go and hold one that drifts within reach, and the Dreadnought is theirs', () => {
    const g = mk({ size: 'medium' });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    const n = derelictNear(g, rival.id);
    expect(g.hops(n.id, rival.capital)).toBeLessThanOrEqual(3);
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', rival.id, rival.capital);
    run(g, 8);
    const sent = g.unitsOf(rival.id).filter((u) => u.dest === n.id || u.node === n.id);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    run(g, 90);
    expect(n.claim).toBeNull();
    expect(g.unitsOf(rival.id).some((u) => u.type === 'dreadnought')).toBe(true);
  });

  it('one that is held by someone else is not a detour: that is a fight, and the army decides it', () => {
    const g = mk({ size: 'medium' });
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    const n = derelictNear(g, rival.id);
    for (let i = 0; i < 6; i++) g.spawnUnit('striker', rival.id, rival.capital);
    for (let i = 0; i < 12; i++) g.spawnUnit('breaker', g.playerId, n.id);
    g.step();
    const before = g.unitsOf(rival.id).filter((u) => u.dest === n.id).length;
    run(g, 4);
    // (Whatever the army makes of it, it is not the two-ship errand: that never flies into guns.)
    const errand = g.unitsOf(rival.id).filter((u) => u.dest === n.id);
    expect(errand.length === 0 || errand.length > 2 || before > 0).toBe(true);
  });
});

describe('what the Hall of Heirs sells for rarer Boons can be felt', () => {
  /** A run's first Boon offers for a player who takes the first card of each. */
  function offers(g: Game, n: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < n; i++) {
      g.player.pendingDrafts = 1;
      const offer = g.ensureOffer(g.player)!;
      out.push(offer);
      g.cmdChooseCard(g.playerId, offer[offer.length - 1]);
    }
    return out;
  }
  const has = (offer: string[], rarity: string) => offer.some((id) => CARD_BY_ID[id].rarity === rarity);

  it('Fortunate Stars: an Epic Boon is in as many offers as the Hall says, at every rank', () => {
    const max = PERKS.find((p) => p.id === 'luck')!.costs.length;
    expect(EPIC_ODDS.length).toBe(max + 1);
    const seen: number[] = [];
    for (let rank = 0; rank <= max; rank++) {
      let all = 0;
      let epic = 0;
      for (let seed = 1; seed <= 90; seed++) {
        for (const offer of offers(mk({ seed: 700 + seed * 13, perks: { luck: rank }, unlockLegendary: seed % 2 === 0, unlockPacts: seed % 3 === 0 }), 9)) {
          all++;
          if (has(offer, 'epic')) epic++;
        }
      }
      seen.push((100 * epic) / all);
      expect(Math.abs(seen[rank] - EPIC_ODDS[rank])).toBeLessThan(4);
    }
    // Each rank can be felt: several more offers in a hundred, and twice as many at the last rank as with none.
    for (let rank = 1; rank <= max; rank++) expect(seen[rank] - seen[rank - 1]).toBeGreaterThan(3);
    expect(seen[max]).toBeGreaterThan(seen[0] * 1.8);
  });

  it('the Hall says the odds at the rank the player holds, and what the next rank brings', () => {
    const pk = PERKS.find((p) => p.id === 'luck')!;
    expect(perkDesc(pk, 0)).toContain(`[${EPIC_ODDS[0]}%]`);
    expect(perkDesc(pk, 0)).toContain(`[${EPIC_ODDS[1]}%]`);
    expect(perkDesc(pk, 2)).toContain(`[${EPIC_ODDS[2]}%]`);
    expect(perkDesc(pk, 2)).toContain(`[${EPIC_ODDS[3]}%] at the next rank`);
    const max = pk.costs.length;
    expect(perkDesc(pk, max)).toContain(`[${EPIC_ODDS[max]}%]`);
    expect(perkDesc(pk, max)).not.toContain('next rank');
    // (Every other perk says what it always said.)
    for (const other of PERKS) if (other.id !== 'luck') expect(perkDesc(other, 1)).toBe(other.desc);
    expect(UNLOCKS.find((u) => u.id === 'legendary')!.desc).toMatch(/at least one in every run/);
  });

  it('Legendary Lineage: every run shows a Legendary Boon by the fifth offer, in place of a Common one', () => {
    let forced = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = mk({ seed: 900 + seed * 7 });
      const dealt = offers(g, LEGENDARY_BY);
      expect(dealt.some((o) => has(o, 'legendary'))).toBe(true);
      if (!dealt.slice(0, LEGENDARY_BY - 1).some((o) => has(o, 'legendary'))) {
        forced++;
        // The fifth offer is as big as any other: the Legendary took a card's place, it did not add one.
        expect(dealt[LEGENDARY_BY - 1].length).toBeGreaterThanOrEqual(3);
        expect(dealt[LEGENDARY_BY - 1].length).toBeLessThanOrEqual(5);
        expect(new Set(dealt[LEGENDARY_BY - 1]).size).toBe(dealt[LEGENDARY_BY - 1].length);
      }
      // Once is the promise: after it the odds are the odds again.
      expect(g.ui.legendarySeen).toBe(1);
    }
    // (Left to chance, most runs would have shown none in five offers.)
    expect(forced).toBeGreaterThan(20);
  });

  it('without it no Legendary is dealt, and a rival house is promised nothing', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = mk({ seed: 900 + seed * 7, unlockLegendary: false });
      expect(offers(g, 8).some((o) => has(o, 'legendary'))).toBe(false);
      expect(g.ui.offersDealt).toBeUndefined();
    }
    const g = mk();
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    for (let i = 0; i < 8; i++) g.generateOffer(rival);
    expect(g.ui.offersDealt).toBeUndefined();
  });

  it('the promise is kept across a save: the count of offers is part of the run', () => {
    const g = mk({ seed: 907 });
    const first = offers(g, 3);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.ui.offersDealt).toBe(g.ui.offersDealt);
    const rest = offers(again, LEGENDARY_BY - 3);
    expect([...first, ...rest].some((o) => has(o, 'legendary'))).toBe(true);
    expect(offers(g, LEGENDARY_BY - 3)).toEqual(rest);
  });
});

describe('a rival house under siege at its Hearth (the third playtest)', () => {
  /** A rival whose eight Guardians are away from home when thirty ships come for its Hearth (which is made to hold). */
  function siege() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    rival.ai!.firstAttackAt = 0;
    const far = g.nodes.filter((n) => n.kind === 'planet' && g.hops(n.id, rival.capital) === 3 && g.hostilePowerAt(n.id, rival.id) === 0)[0];
    for (const u of g.unitsOf(rival.id)) if (u.type !== 'ark' && u.type !== 'scout') g.killUnit(u, -1);
    const fleet = [0, 1, 2, 3, 4, 5, 6, 7].map(() => g.spawnUnit('guardian', rival.id, far.id));
    for (let i = 0; i < 30; i++) g.spawnUnit(i % 2 ? 'breaker' : 'striker', p.id, rival.capital);
    return { g, rival, fleet, hearth: g.nodes[rival.capital] };
  }

  it('its ships keep the course they are given: no turning back and forth, never leaving', () => {
    const { g, fleet, hearth } = siege();
    const changes = new Map<number, number>();
    const last = new Map<number, number>();
    for (let t = 0; t < 60 / TICK; t++) {
      hearth.hp = hearth.maxHp;
      g.step();
      g.fx.length = 0;
      for (const u of fleet) {
        if (u.dead || last.get(u.id) === u.dest) continue;
        last.set(u.id, u.dest);
        changes.set(u.id, (changes.get(u.id) ?? 0) + 1);
      }
    }
    // (Before: up to sixty orders in two and a half minutes, each one starting the drive's charge again.)
    expect(Math.max(...fleet.map((u) => changes.get(u.id) ?? 0))).toBeLessThanOrEqual(4);
  });

  it('too few to win, they gather a jump or two short of the Hearth instead of flying in one by one', () => {
    const { g, rival, fleet, hearth } = siege();
    for (let t = 0; t < 20 / TICK; t++) {
      hearth.hp = hearth.maxHp;
      g.step();
      g.fx.length = 0;
    }
    const living = fleet.filter((u) => !u.dead);
    expect(living.length).toBe(8);
    for (const u of living) {
      expect(u.dest).not.toBe(rival.capital);
      const hops = g.hops(u.dest >= 0 ? u.dest : u.node, rival.capital);
      expect(hops).toBeGreaterThanOrEqual(1);
      expect(hops).toBeLessThanOrEqual(2);
    }
  });
});

describe('Embers from kills (the third playtest)', () => {
  it('Salvage Crews and War Economy are one figure, and each card shows the other in it', () => {
    const g = mk();
    const p = g.player;
    p.cards.push('warEconomy');
    g.recomputeMods(p);
    const line = modLines(g.computeMods(p)).find((l) => l.key === 'killEmbers')!;
    expect(line.label).toBe('Embers from kills');
    // Salvage Crews, offered to a house that has War Economy: from 40% to 65%.
    const d = modDelta(g.computeMods(p), g.computeMods(p, ['salvage'])).find((x) => x.key === 'killEmbers')!;
    expect([d.from, d.to, d.novel]).toEqual(['+40%', '+65%', false]);
    // (With neither, the card's own words say it: no line that only repeats them.)
    const plain = mk();
    expect(modDelta(plain.computeMods(plain.player), plain.computeMods(plain.player, ['salvage'])).find((x) => x.key === 'killEmbers')?.novel).toBe(true);
  });
});

describe("the run's details for a machine (the third playtest)", () => {
  it('the last line of COPY RUN DETAILS is the run as JSON, and reads back', () => {
    const g = mk();
    g.player.cards.push('salvage');
    g.planetDefeated(g.nodes[g.player.capital], 1);
    g.flushDeferred();
    const text = runData(g, '9.9.9');
    expect(text).toMatch(/^[A-Za-z0-9+/=]+$/);
    const back = readRunData(text);
    expect(back.v).toBe('9.9.9');
    expect(back.seed).toBe(4242);
    expect(back.outcome.won).toBe(false);
    expect(back.outcome.victory).toBe('defeat');
    expect(back.boons).toContain('salvage');
    expect(back.houses.length).toBe(g.empires().length);
    expect(back.houses.filter((h: { player: boolean }) => h.player).length).toBe(1);
  });
});

describe("a fleet's way (the third playtest)", () => {
  /** The player's warships at the Hearth, and two places: one next door, and one beyond it. */
  function setup() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const ships = [0, 1, 2].map(() => g.spawnUnit('striker', p.id, p.capital));
    const next = g.nodes.find((n) => g.hops(n.id, p.capital) === 1 && n.kind === 'star')!;
    const beyond = g.nodes.find((n) => g.hops(n.id, next.id) === 2 && g.hops(n.id, p.capital) === 3)!;
    return { g, p, ships, next, beyond };
  }

  it('Shift adds a stop: the way there comes after the way the ships have, and their drives go on charging', () => {
    const { g, p, ships, next, beyond } = setup();
    const ids = ships.map((u) => u.id);
    g.cmdMove(p.id, ids, next.id);
    run(g, 1);
    const charge = ships[0].charge;
    expect(charge).toBeGreaterThan(0);
    g.cmdMove(p.id, ids, beyond.id, undefined, undefined, undefined, true);
    for (const u of ships) {
      expect(u.dest).toBe(beyond.id);
      expect(u.path).toEqual([...g.pathTo(p.capital, next.id), ...g.pathTo(next.id, beyond.id)]);
    }
    expect(ships[0].charge).toBe(charge);
    // They go by way of the stop, and on to the end.
    let passed = false;
    for (let t = 0; t < 240 / TICK && ships[0].node !== beyond.id; t++) {
      g.step();
      g.fx.length = 0;
      if (ships[0].node === next.id) passed = true;
    }
    expect(passed).toBe(true);
    expect(ships[0].node).toBe(beyond.id);
  });

  it('a ship that is not on its way anywhere simply goes', () => {
    const { g, p, ships, beyond } = setup();
    g.cmdMove(p.id, [ships[0].id], beyond.id, undefined, undefined, undefined, true);
    expect(ships[0].path).toEqual(g.pathTo(p.capital, beyond.id));
  });

  it('danger on the way is what the house knows: seen enemies and rival worlds, not fleets out of sight', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const seen = g.nodes.find((n) => p.visible[n.id] && n.id !== p.capital && g.hostilePowerAt(n.id, p.id) === 0)!;
    expect(g.dangerKnown(p.id, seen.id)).toBe(false);
    g.spawnUnit('breaker', rival.id, seen.id);
    expect(g.dangerKnown(p.id, seen.id)).toBe(true);
    // Charted but out of sight: a rival fleet there is not known...
    const away = g.nodes.find((n) => !p.visible[n.id] && n.kind === 'star' && g.buckets[n.id].length === 0)!;
    p.explored[away.id] = 1;
    g.spawnUnit('breaker', rival.id, away.id);
    expect(g.dangerKnown(p.id, away.id)).toBe(false);
    // ...a rival's world the house has seen is.
    const hearth = g.nodes[rival.capital];
    p.explored[hearth.id] = 1;
    p.seenOwner[hearth.id] = rival.id;
    if (!p.visible[hearth.id]) expect(g.dangerKnown(p.id, hearth.id)).toBe(true);
    // And a place never charted is not known at all.
    const dark = g.nodes.find((n) => !p.explored[n.id] && !p.visible[n.id])!;
    expect(g.dangerKnown(p.id, dark.id)).toBe(false);
  });
});

describe("fields link: two towers and the wall between them (the third playtest)", () => {
  /**
   * Two systems side by side, far from every Hearth, each with planets one jump from its star. The
   * rival's Bastions go there; a ship of the player's waits at each place that might be held.
   */
  function sector() {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const beside = (star: { id: number; system: number }) => g.nodes.filter((n) => n.kind === 'planet' && n.capitalOf < 0 && n.owner < 0 && n.system === star.system && g.hops(n.id, star.id) === 1);
    const stars = g.nodes.filter((n) => n.kind === 'star' && beside(n).length >= 3 && g.hops(n.id, rival.capital) >= 3 && g.hops(n.id, p.capital) >= 2);
    const starA = stars.find((x) => stars.some((y) => y.id !== x.id && g.hops(x.id, y.id) === 1))!;
    const starB = stars.find((y) => y.id !== starA.id && g.hops(starA.id, y.id) === 1)!;
    // (a1 and a2 meet only at the star: worlds joined by a starlane of their own link along that.)
    const planets = beside(starA);
    const a1 = planets.find((x) => planets.filter((y) => y.id !== x.id && g.hops(x.id, y.id) === 2).length >= 2)!;
    const [a2, a3] = planets.filter((y) => y.id !== a1.id);
    const b1 = beside(starB).find((x) => g.hops(a1.id, x.id) === 3)!;
    for (const n of [starA, starB, a1, a2, a3, b1]) for (const u of [...g.buckets[n.id]]) g.killUnit(u, -1);
    const bastion = (n: typeof a1, level: number, owner = rival.id) => {
      g.kindleWorld(n, owner);
      g.flushDeferred();
      n.role = 'bastion';
      n.retool = 0;
      g.setLevel(n, level);
    };
    const ship = (at: { id: number }, owner = p.id) => g.spawnUnit('striker', owner, at.id);
    return { g, p, rival, starA, starB, a1, a2, a3, b1, bastion, ship };
  }

  it('a Bastion alone holds only its own world, at every level', () => {
    const { g, starA, a1, a2, bastion, ship } = sector();
    const [atBastion, atStar, atOther] = [ship(a1), ship(starA), ship(a2)];
    for (const level of [1, 2, 3]) {
      bastion(a1, level);
      expect([g.holdAt(atBastion), g.holdAt(atStar), g.holdAt(atOther)]).toEqual([FIELD, 0, 0]);
      expect(g.fieldLinks().filter((l) => l.a === a1.id || l.b === a1.id)).toEqual([]);
    }
  });

  it('two Bastions on one star hold the star between them from level II, and nothing else', () => {
    const { g, rival, starA, a1, a2, a3, bastion, ship } = sector();
    const [atStar, atThird] = [ship(starA), ship(a3)];
    bastion(a1, 1);
    bastion(a2, 1);
    expect(g.holdAt(atStar)).toBe(0);
    // One of the two at level II reaches the other.
    bastion(a1, 2);
    const link = g.fieldLinks().find((l) => [l.a, l.b].includes(a1.id) && [l.a, l.b].includes(a2.id))!;
    expect(link.owner).toBe(rival.id);
    expect(link.way.slice(1, -1)).toEqual([starA.id]);
    expect(g.holdAt(atStar)).toBe(FIELD);
    expect(g.holdAt(atThird)).toBe(0);
    // It holds the house's enemies only, and two links through a place are still one field.
    expect(g.holdAt(ship(starA, rival.id))).toBe(0);
    bastion(a3, 2);
    expect(g.fieldLinks().filter((l) => l.way.includes(starA.id)).length).toBeGreaterThanOrEqual(2);
    expect(g.holdAt(atStar)).toBe(FIELD);
    expect(g.jumpChargeOf(atStar)).toBeCloseTo(JUMP_CHARGE + FIELD, 5);
  });

  it('level III links across to the next system: both stars of the starlane between', () => {
    const { g, starA, starB, a1, b1, bastion, ship } = sector();
    expect(g.hops(a1.id, b1.id)).toBe(3);
    const [atA, atB] = [ship(starA), ship(starB)];
    bastion(b1, 1);
    bastion(a1, 2);
    expect([g.holdAt(atA), g.holdAt(atB)]).toEqual([0, 0]);
    bastion(a1, 3);
    const link = g.fieldLinks().find((l) => [l.a, l.b].includes(a1.id) && [l.a, l.b].includes(b1.id))!;
    expect([...link.way.slice(1, -1)].sort()).toEqual([starA.id, starB.id].sort());
    // (The way runs lane by lane from one world to the other.)
    for (let i = 1; i < link.way.length; i++) expect(g.hops(link.way[i - 1], link.way[i])).toBe(1);
    expect([g.holdAt(atA), g.holdAt(atB)]).toEqual([FIELD, FIELD]);
  });

  it('lose or retool one end, and the wall is down on both sides', () => {
    const { g, p, rival, starA, a1, a2, bastion, ship } = sector();
    const atStar = ship(starA);
    bastion(a1, 2);
    bastion(a2, 2);
    expect(g.holdAt(atStar)).toBe(FIELD);
    expect(g.cmdSetRole(rival.id, a2.id, 'mine')).toBe(true);
    expect(g.holdAt(atStar)).toBe(0);
    expect(g.cmdSetRole(rival.id, a2.id, 'bastion')).toBe(true);
    // (Retooling: no field, and no link, until the work is done.)
    expect(g.holdAt(atStar)).toBe(0);
    a2.retool = 0;
    expect(g.holdAt(atStar)).toBe(FIELD);
    // Taken by the player: the rival's link is gone (and one Bastion of the player's links with nothing).
    g.planetDefeated(a2, p.id);
    g.flushDeferred();
    run(g, 0.1);
    expect(g.fieldLinks().filter((l) => l.way.includes(starA.id))).toEqual([]);
  });

  it("a Hearth can be an end of a link, but it takes a Bastion to make one", () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const rival = g.empires().find((f) => f.id !== p.id)!;
    const hearth = g.nodes[p.capital];
    const [near, other] = g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0 && g.hops(n.id, hearth.id) === 2);
    for (const n of [near, other]) {
      for (const u of [...g.buckets[n.id]]) g.killUnit(u, -1);
      g.kindleWorld(n, p.id);
    }
    g.flushDeferred();
    // A world with a Starbase two jumps from the Hearth: two fields, and no link.
    g.spawnUnit('starbase', p.id, other.id);
    run(g, 0.1);
    expect(g.fieldAt(other)).toBe(true);
    expect(g.fieldLinks().filter((l) => l.owner === p.id)).toEqual([]);
    expect(g.linkReach(hearth)).toBe(0);
    // A Bastion at level II two jumps from the Hearth: linked, and the place between is held.
    near.role = 'bastion';
    near.retool = 0;
    g.setLevel(near, 2);
    const link = g.fieldLinks().find((l) => [l.a, l.b].includes(hearth.id) && [l.a, l.b].includes(near.id))!;
    expect(link.way.length).toBe(3);
    const between = g.nodes[link.way[1]];
    expect(g.holdAt(g.spawnUnit('striker', rival.id, between.id))).toBe(FIELD);
    expect(g.holdAt(g.spawnUnit('striker', p.id, between.id))).toBe(0);
  });
});

describe('a Forge that suits its world builds cheaper (the third playtest)', () => {
  it('its ships cost 15% less there, and it builds no faster than another Forge', () => {
    const g = mk({ size: 'medium' });
    const p = g.player;
    const fit = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && g.affinityOf(n) === 'forge')!;
    const plain = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0 && n.size === fit.size && g.affinityOf(n) !== 'forge')!;
    for (const n of [fit, plain]) {
      g.kindleWorld(n, p.id);
      n.role = 'forge';
      n.retool = 0;
      n.level = 1;
    }
    g.flushDeferred();
    const base = g.shipCost(p, 'breaker');
    expect(g.shipCost(p, 'breaker', fit)).toBe(Math.round(base * (1 - ECON.forgeFitDiscount)));
    expect(g.shipCost(p, 'breaker', plain)).toBe(base);
    expect(g.shipCost(p, 'breaker', g.nodes[p.capital])).toBe(base);
    expect(g.forgeMul(fit)).toBe(g.forgeMul(plain));
    // What the queue takes is what the button says.
    p.embers = 5000;
    p.hangarCap = 99;
    g.cmdQueueShip(p.id, fit.id, 'breaker');
    expect(5000 - p.embers).toBe(g.shipCost(p, 'breaker', fit));
  });
});

describe('Dreadnoughts take no hangar room (the third playtest)', () => {
  it('a house with two Dreadnoughts has the room it had without them', () => {
    const g = mk();
    const p = g.player;
    g.spawnUnit('striker', p.id, p.capital);
    g.recomputeMods(p);
    const before = p.hangarUsed;
    g.spawnUnit('dreadnought', p.id, p.capital);
    g.spawnUnit('dreadnought', p.id, p.capital);
    g.recomputeMods(p);
    expect(p.hangarUsed).toBe(before);
  });
});

describe('the Hall of Heirs: perks for the whole run, and a refund (the third playtest)', () => {
  it('each perk is felt all run long, as its words say', () => {
    const plain = mk().player.mods;
    const g = mk({ perks: { oldCoin: 3, loreSeed: 2, escort: 2, bastion: 2 } });
    const m = g.player.mods;
    expect(m.embers - plain.embers).toBeCloseTo(3 * PERK_EMBERS);
    expect(m.lore - plain.lore).toBeCloseTo(2 * PERK_LORE);
    expect(m.hull - plain.hull).toBeCloseTo(2 * PERK_HULL);
    expect(m.worldHp - plain.worldHp).toBeCloseTo(2 * PERK_WALLS);
    expect(m.worldHp + m.hearthHp - plain.worldHp - plain.hearthHp).toBeCloseTo(2 * PERK_HEARTH);
    // (Nothing at the start any more: Old Coin and Lorekeepers were spent in the first minute.)
    expect(g.player.embers).toBe(mk().player.embers);
    const words = (id: string) => PERKS.find((p) => p.id === id)!.desc;
    expect(words('oldCoin')).toContain(`+${Math.round(PERK_EMBERS * 100)}% Embers`);
    expect(words('loreSeed')).toContain(`+${Math.round(PERK_LORE * 100)}% Lore`);
    expect(words('escort')).toContain(`+${Math.round(PERK_HULL * 100)}% hull`);
    expect(words('bastion')).toContain(`+${Math.round(PERK_WALLS * 100)}% hull`);
  });

  it('REFUND ALL gives back what every rank cost', () => {
    expect(perksSpent({})).toBe(0);
    expect(perksSpent({ oldCoin: 2, luck: 1 })).toBe(40 + 80 + 60);
    const all: Record<string, number> = {};
    for (const pk of PERKS) all[pk.id] = pk.costs.length;
    expect(perksSpent(all)).toBe(PERKS.reduce((s, pk) => s + pk.costs.reduce((a, c) => a + c, 0), 0));
  });
});

describe("the run, minute by minute (the third playtest's graphs)", () => {
  it('every house is sampled at the start, every half minute and at the end', () => {
    const g = mk();
    run(g, 95);
    expect(g.history.map((s) => s.t)).toEqual([0, 30, 60, 90]);
    for (const s of g.history) expect(s.h.map((x) => x.f)).toEqual(g.empires().map((f) => f.id));
    const first = g.history[0].h.find((x) => x.f === g.playerId)!;
    expect(first.e).toBeGreaterThan(0);
    expect(first.w).toBe(1);
    expect(first.s).toBeGreaterThan(0);
    g.declareWinner(g.playerId, 'conquest', 'Every rival Hearth is dark.');
    expect(g.history[g.history.length - 1].t).toBe(95);
    expect(HISTORY_EVERY).toBe(30);
  });

  it('a house that is put out has one last sample with nothing in it, and its line ends there', () => {
    const g = mk();
    run(g, 31);
    const rival = g.empires().find((f) => f.id !== g.playerId)!;
    g.planetDefeated(g.nodes[rival.capital], g.playerId);
    g.flushDeferred();
    run(g, 60);
    const of = (i: number) => g.history[i].h.find((x) => x.f === rival.id);
    expect(of(1)!.w).toBeGreaterThan(0);
    expect(of(2)).toMatchObject({ w: 0, s: 0, e: 0 });
    expect(of(3)).toBeUndefined();
  });

  it('the charts count in round numbers, and in whole ones what is counted', () => {
    expect(scale(27)).toEqual({ max: 30, step: 10 });
    expect(scale(11.4)).toEqual({ max: 15, step: 5 });
    expect(scale(1, true)).toEqual({ max: 1, step: 1 });
    expect(scale(4, true)).toEqual({ max: 4, step: 2 });
    expect(scale(7, true)).toEqual({ max: 10, step: 5 });
    expect(scale(0)).toEqual({ max: 1, step: 1 });
    for (let v = 1; v < 400; v += 7) {
      const s = scale(v, true);
      expect(Number.isInteger(s.step)).toBe(true);
      expect(s.max).toBeGreaterThanOrEqual(v);
      expect(s.max / s.step).toBeLessThanOrEqual(4);
    }
  });

  it('a saved run keeps its history', () => {
    const g = mk();
    run(g, 65);
    const back = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(back.history).toEqual(g.history);
    run(g, 30);
    run(back, 30);
    expect(back.history).toEqual(g.history);
  });
});
