/** The First Night (the guided first run) and the first goals after it. */
import { describe, expect, it } from 'vitest';
import { GOAL_REWARD, GOALS } from '../src/game/data/goals';
import { Game } from '../src/game/Game';
import { mk } from './helpers';

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
