/** Heralds: the big moments of a run, announced across the screen. Which moments the game marks, and how the band comes and goes. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { TICK } from '../src/game/constants';
import { ERAS, LAST_CRADLE_ERA } from '../src/game/data/eras';
import { treasuryTarget } from '../src/game/data/victories';
import type { GameConfig, Herald } from '../src/game/types';
import { herald, HERALD, heraldPose, heraldTime, queueHerald, type HeraldShown } from '../src/ui/hud/herald';
import { mk, run } from './helpers';

/** The heralds among the news so far. */
const heralds = (g: Game): Herald[] => g.notes.filter((n) => n.herald).map((n) => n.herald!);

/** A game in which nobody gives orders but the test. */
function quiet(opts: Partial<GameConfig> = {}): Game {
  const g = mk(opts);
  for (const f of g.factions) f.ai = null;
  return g;
}

describe('the game heralds the big moments of a run', () => {
  it('a house falls: its name, in its own colour, and who took it', () => {
    let g = quiet();
    const r1 = g.factions[1];
    g.planetDefeated(g.nodes[r1.capital], g.playerId);
    g.flushDeferred();
    expect(heralds(g)).toContainEqual({ title: `${g.shortName(r1).toUpperCase()} FALLS`, sub: 'Its Hearth has gone dark, taken by you.', tone: 'house', fid: r1.id });
    g = quiet();
    const [a, b] = [g.factions[1], g.factions[2]];
    g.planetDefeated(g.nodes[a.capital], b.id);
    g.flushDeferred();
    expect(heralds(g)).toContainEqual({ title: `${g.shortName(a).toUpperCase()} FALLS`, sub: `Its Hearth has gone dark, taken by ${g.shortName(b)}.`, tone: 'house', fid: a.id });
  });

  it('your Last Stand, once a siege', () => {
    const g = quiet();
    const home = g.nodes[g.player.capital];
    home.sh = 0;
    home.hp = home.maxHp * 0.31;
    g.damagePlanet(home, home.maxHp * 0.02, 'siege', 1);
    g.damagePlanet(home, home.maxHp * 0.02, 'siege', 1);
    expect(heralds(g)).toEqual([{ title: 'LAST STAND', sub: `The defenders of ${home.name} rise to arms.`, tone: 'red' }]);
  });

  it("a rival's Destiny counting down is heralded; the player's own is only told", () => {
    const g = quiet({ forcedVictories: ['conquest', 'treasury', 'relics'], difficulty: 0 });
    const r = g.factions[1];
    r.embers = treasuryTarget('small') + 2000;
    g.player.embers = treasuryTarget('small') + 2000;
    run(g, 2);
    expect(heralds(g)).toEqual([{ title: 'THE HOARD IS FULL', sub: `${g.shortName(r)} will be crowned unless you stop them.`, tone: 'house', fid: r.id }]);
    expect(g.notes.some((n) => n.kind === 'good' && /hoarded/.test(n.text) && !n.herald)).toBe(true);
  });

  it("a rival's Starfall armed is heralded in red; the player's own is not", () => {
    const g = quiet();
    const r = g.factions[1];
    const star = (fid: number) => g.starOf(g.nodes[g.factions[fid].capital])!;
    const theirs = g.spawnUnit('starfall', r.id, star(r.id).id);
    expect(g.cmdArm(r.id, theirs.id)).toBe(true);
    const mine = g.spawnUnit('starfall', g.playerId, star(g.playerId).id);
    expect(g.cmdArm(g.playerId, mine.id)).toBe(true);
    expect(heralds(g)).toEqual([{ title: 'STARFALL ARMED', sub: `${g.shortName(r)} armed one at ${star(r.id).name}: it erupts in 2 minutes.`, tone: 'red' }]);
  });

  it('the Maw opening is heralded in the Hollow\'s pink; its warning a minute before is only told', () => {
    const g = mk({ forcedVictories: ['conquest', 'crisis', 'relics'] });
    g.crisis!.awakenAt = 0.5;
    run(g, 2);
    expect(heralds(g)).toEqual([{ title: 'THE MAW HAS OPENED', sub: 'The Hollow pour into the sector.', tone: 'pink' }]);
  });

  it("Ages: the player's new age in gold; a rival's Ark rising, and leaving, in its colour", () => {
    const g = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, mode: 'ages', stage: 'cradle' });
    for (const f of g.factions) f.ai = null;
    const steps = (s: number) => {
      for (let i = 0; i < Math.round(s / TICK) && !g.outcome; i++) g.step();
    };
    const p = g.player;
    p.lore = ERAS[p.era].lore;
    p.embers = Math.max(p.embers, ERAS[p.era].cost);
    expect(g.cmdAdvance(p.id)).toBe(true);
    steps(ERAS[p.era].time + 1);
    expect(heralds(g)).toEqual([{ title: `THE ${ERAS[p.era].name.toUpperCase()}`, sub: 'All your units are upgraded. A Boon of the new age awaits.', tone: 'gold' }]);
    const r = g.factions[1];
    r.era = LAST_CRADLE_ERA;
    r.lore = ERAS[r.era].lore;
    r.embers = ERAS[r.era].cost;
    expect(g.cmdAdvance(r.id)).toBe(true);
    steps(ERAS[r.era].time + 1);
    expect(heralds(g).slice(1)).toEqual([
      { title: 'AN ARK IS RISING', sub: `${g.shortName(r)} is building one at its Hearth.`, tone: 'house', fid: r.id },
      { title: 'AN ARK HAS LEFT', sub: `${g.shortName(r)} is gone to the stars. Its lands lie dark.`, tone: 'house', fid: r.id },
    ]);
  });
});

describe('a herald comes and goes without being in the way', () => {
  it('drifts in from the left as it fades up, holds still, and drifts on to the right as it fades away, a few pixels a frame at most', () => {
    const end = heraldTime(false);
    expect(heraldPose(0, end)).toEqual({ dx: -HERALD.DRIFT, alpha: 0 });
    expect(heraldPose(HERALD.IN, end)).toEqual({ dx: 0, alpha: 1 });
    expect(heraldPose(end / 2, end)).toEqual({ dx: 0, alpha: 1 });
    expect(heraldPose(end, end).dx).toBe(HERALD.DRIFT);
    expect(heraldPose(end, end).alpha).toBeCloseTo(0);
    let prev = heraldPose(0, end);
    for (let t = 1 / 60; t <= end; t += 1 / 60) {
      const pose = heraldPose(t, end);
      expect(Math.abs(pose.dx - prev.dx)).toBeLessThanOrEqual(4);
      expect(Math.abs(pose.alpha - prev.alpha)).toBeLessThanOrEqual(0.1);
      prev = pose;
    }
  });

  it('stays a little over three seconds; a little over two while another waits', () => {
    expect(heraldTime(false)).toBeCloseTo(3.2);
    expect(heraldTime(true)).toBeCloseTo(2.2);
  });

  it('the same news never twice, no more than three waiting; the one showing is hurried along, but never cut off', () => {
    const h = (title: string): Herald => ({ title, sub: 'A line.', tone: 'red' });
    const list: HeraldShown[] = [];
    expect(queueHerald(list, h('A'), 0, 0)).toBe(true);
    list[0].at = 0;
    expect(list[0].end).toBeCloseTo(heraldTime(false));
    expect(queueHerald(list, h('A'), 0, 0.5)).toBe(false);
    expect(queueHerald(list, h('B'), 0, 0.5)).toBe(true);
    expect(list[0].end).toBeCloseTo(heraldTime(true));
    expect(queueHerald(list, h('C'), 0, 0.6)).toBe(true);
    expect(queueHerald(list, h('D'), 0, 0.7)).toBe(false);
    expect(list.map((x) => x.h.title)).toEqual(['A', 'B', 'C']);
    // Far into its hold when another comes: it starts to leave from where it is, without a jump.
    const late: HeraldShown[] = [];
    queueHerald(late, h('A'), 0, 0);
    late[0].at = 0;
    queueHerald(late, h('B'), 0, 2.5);
    expect(late[0].end).toBeCloseTo(2.5 + HERALD.OUT);
    expect(heraldPose(2.5, late[0].end)).toEqual({ dx: 0, alpha: 1 });
  });

  it("the same moment of the same house is not heralded again within a minute (a rival that keeps crossing a mark); another house’s is", () => {
    const hud = { heralds: [] as HeraldShown[], heraldLast: new Map<string, number>(), clock: 0 };
    const dom = (fid: number): Herald => ({ title: 'DOMINATION LOOMS', sub: 'They will be crowned unless you stop them.', tone: 'house', fid });
    expect(herald(hud, dom(1), 0)).toBe(true);
    hud.heralds.length = 0;
    hud.clock = 40;
    expect(herald(hud, dom(1), 40)).toBe(false);
    expect(herald(hud, dom(2), 40)).toBe(true);
    hud.heralds.length = 0;
    hud.clock = 61;
    expect(herald(hud, dom(1), 61)).toBe(true);
    // (Not queued, it is not heralded either: the news is shown as any other.)
    hud.heralds.length = 0;
    for (const t of ['A', 'B', 'C']) herald(hud, { title: t, sub: '', tone: 'red' }, 61);
    expect(herald(hud, { title: 'D', sub: '', tone: 'red' }, 61)).toBe(false);
  });
});
