/**
 * The House Powers (1.27): each house's own move, cast by its Ark at the house's order and by nothing
 * else (commands/power.ts). What each does, why its button says it cannot be cast, that it comes back for
 * the house and not for the Ark, that a save keeps a starlane cut and a coin in the air, that a Daily
 * plays it again to the tick, and that the rival houses cast theirs too.
 */
import { describe, expect, it, vi } from 'vitest';
import { burnable, dawnWorlds, levyWorlds, POWER_WHY, wayTargets } from '../src/game/commands/power';
import { Game } from '../src/game/Game';
import { ABILITY_BY_ID, LEARNABLE_ABILITIES, LEVY_SHIPS, LEVY_TIME, LEVY_WORLDS, POWER_FIRST, POWERS, WAGER_TIME, WAYFINDER_REACH } from '../src/game/data/abilities';
import { CARD_BY_ID, CARDS } from '../src/game/data/cards';
import { HEIRS } from '../src/game/data/heirs';
import { dailyConfig, replay } from '../src/game/replay';
import type { Faction, GameConfig, Unit } from '../src/game/types';
import { dist } from '../src/game/util';
import { recomputeHangar } from '../src/game/worldStats';
import { mk, run, snapshot } from './helpers';

const arkOf = (g: Game, f: Faction): Unit => g.units.get(f.ark)!;
const ready = (_g: Game, f: Faction) => (f.powerCd = 0);
const rivalOf = (g: Game) => g.empires().find((f) => f.id !== g.playerId)!;
/** A game as the house that has this power. */
const as = (heir: string, opts: Partial<GameConfig> = {}) => mk({ heir, ...opts });

describe('a house and its power', () => {
  it('every house has one, its own, which no ship learns; an Ark is built knowing nothing else', () => {
    expect(POWERS.length).toBe(6);
    expect(new Set(HEIRS.map((h) => h.power))).toEqual(new Set(POWERS.map((p) => p.id)));
    for (const p of POWERS) expect(LEARNABLE_ABILITIES).not.toContain(p);
    // The abilities it once started with are anyone's now, at levels 3, 5 and 7.
    for (const id of ['aegis', 'barrage', 'nanite', 'strikewing', 'phaselance']) expect(LEARNABLE_ABILITIES.map((a) => a.id)).toContain(id);
    for (const h of HEIRS) {
      const g = as(h.id);
      expect(arkOf(g, g.player).abil, h.id).toEqual([]);
      // A Dreadnought is built with an ability anyone could learn: never a house's power.
      const d = g.spawnUnit('dreadnought', g.playerId, g.player.capital);
      expect(ABILITY_BY_ID[d.abil[0].id].power).toBeFalsy();
    }
  });

  it('is first ready a minute and a half in, and its button says when; then it comes back after its time, for the house', () => {
    const g = as('vael');
    const p = g.player;
    expect(p.powerCd).toBe(POWER_FIRST);
    expect(g.checkPower(p.id)).toBe('Ready in 1:30');
    run(g, 31);
    expect(g.checkPower(p.id)).toBe('Ready in 0:59');
    run(g, 60);
    expect(g.checkPower(p.id)).toBeNull();
    expect(g.cmdPower(p.id)).toBe(true);
    expect(p.powerCd).toBe(ABILITY_BY_ID.callarms.cd);
    // An Ark rebuilt does not bring it back sooner.
    g.killUnit(arkOf(g, p), -1);
    expect(g.checkPower(p.id)).toBe('Your Ark is lost: rebuild it at your Hearth');
    g.spawnUnit('ark', p.id, p.capital);
    expect(g.checkPower(p.id)).toBe('Ready in 4:00');
  });

  it('is cast from a world, by an Ark that can act: not on a starlane, not stunned, not on the cradle', () => {
    const g = as('vael');
    const p = g.player;
    ready(g, p);
    const ark = arkOf(g, p);
    ark.stun = 2;
    expect(g.checkPower(p.id)).toBe('Your Ark is stunned');
    ark.stun = 0;
    g.cmdMove(p.id, [ark.id], g.neighbours(ark.node)[0]);
    run(g, 20);
    if (ark.lane) expect(g.checkPower(p.id)).toBe('Your Ark is between worlds');
    const cradle = mk({ heir: 'vael', mode: 'ages', stage: 'cradle' });
    ready(cradle, cradle.player);
    expect(cradle.checkPower(cradle.playerId)).toMatch(/Space Age/);
    // A house with no power (the Corsairs) is told so, and nothing happens.
    expect(g.checkPower(g.pirateId)).toBe('This house has no power');
    expect(g.cmdPower(g.pirateId)).toBe(false);
  });
});

describe('Dawn (Solar Concord)', () => {
  it('kindles every dark world one starlane from the Ark at once, but none a guard or a warship holds', () => {
    const g = as('concord');
    const p = g.player;
    ready(g, p);
    const ark = arkOf(g, p);
    // (At the star of its home system: the worlds of the system are one starlane from it.)
    const star = g.nodes[g.systems[g.nodes[p.capital].system].star];
    Object.assign(ark, { node: star.id, x: star.x + star.r + 60, y: star.y });
    g.rebuildBuckets();
    const around = g.neighbours(ark.node).map((id) => g.nodes[id]).filter((n) => n.kind === 'planet' && n.owner < 0);
    expect(around.length).toBeGreaterThan(1);
    // A guard on one of them: that one is held.
    const held = around[0];
    g.spawnUnit('striker', rivalOf(g).id, held.id);
    const lit = dawnWorlds(g, p, ark);
    expect(lit).not.toContain(held);
    const worlds = g.worldsOf(p.id).length;
    expect(g.cmdPower(p.id)).toBe(true);
    expect(g.worldsOf(p.id).length).toBe(worlds + lit.length);
    for (const n of lit) expect(n.owner).toBe(p.id);
    expect(held.owner).toBe(-1);
    expect(g.notes[g.notes.length - 1].text).toMatch(/^Dawn: .+ kindled at once\.$/);
    expect(g.fx.some((f) => f.k === 'ability' && f.id === 'dawn' && f.at?.length === lit.length && f.says === `DAWN · ${lit.length} KINDLED`)).toBe(true);
  });

  it('says why it cannot be cast with nothing dark beside the Ark', () => {
    const g = as('concord');
    const p = g.player;
    ready(g, p);
    for (const id of g.neighbours(arkOf(g, p).node)) if (g.nodes[id].kind === 'planet' && g.nodes[id].owner < 0) g.kindleWorld(g.nodes[id], p.id, true);
    expect(g.checkPower(p.id)).toBe('No dark world one starlane from your Ark');
  });
});

describe('Call to Arms (Vael Imperium)', () => {
  it('the Forges nearest the Ark each send it three warships, which serve for a while and take no room in the hangar', () => {
    const g = as('vael');
    const p = g.player;
    ready(g, p);
    // Two Forges of its own, besides its Hearth.
    const forges = g.nodes.filter((n) => n.kind === 'planet' && n.owner < 0 && n.system === g.nodes[p.capital].system).slice(0, 2);
    for (const n of forges) {
      g.kindleWorld(n, p.id, true);
      n.role = 'forge';
    }
    const ark = arkOf(g, p);
    const from = levyWorlds(g, p, ark);
    expect(from.length).toBe(Math.min(LEVY_WORLDS, 1 + forges.length));
    recomputeHangar(g, p);
    const hangar = p.hangarUsed;
    const before = new Set(g.unitsOf(p.id).map((u) => u.id));
    expect(g.cmdPower(p.id)).toBe(true);
    const levy = g.unitsOf(p.id).filter((u) => !before.has(u.id));
    expect(levy.length).toBe(from.length * LEVY_SHIPS.length);
    expect(levy.every((u) => u.temp > 0 && (u.node === ark.node || u.dest === ark.node))).toBe(true);
    recomputeHangar(g, p);
    expect(p.hangarUsed).toBe(hangar);
    run(g, LEVY_TIME + 1);
    expect(levy.every((u) => u.dead)).toBe(true);
  });
});

describe('Wayfinder (Wayfarer Clans)', () => {
  it('waits for a world to be chosen; a world too far, already joined, uncharted or itself is refused with its reason', () => {
    const g = as('wayfarer');
    const p = g.player;
    ready(g, p);
    const ark = arkOf(g, p);
    expect(g.checkPower(p.id)).toBe(POWER_WHY.aim);
    expect(g.checkPower(p.id, ark.node)).toBe('Choose another world');
    expect(g.checkPower(p.id, g.neighbours(ark.node)[0])).toBe('A starlane joins them already');
    const far = g.nodes.find((n) => p.explored[n.id] && dist(n.x, n.y, g.nodes[ark.node].x, g.nodes[ark.node].y) > WAYFINDER_REACH);
    if (far) expect(g.checkPower(p.id, far.id)).toBe('Too far for a starlane');
    const dark = g.nodes.find((n) => !p.explored[n.id]);
    if (dark) expect(g.checkPower(p.id, dark.id)).toBe('Not yet charted');
    expect(g.cmdPower(p.id)).toBe(false);
  });

  it('cuts a starlane that stays: the ways through the sector know it, a save keeps it, and any house can use it', () => {
    const g = as('wayfarer');
    const p = g.player;
    ready(g, p);
    g.exploreAll(p);
    const ark = arkOf(g, p);
    const to = wayTargets(g, p, ark).sort((a, b) => g.hops(ark.node, b) - g.hops(ark.node, a))[0];
    expect(to).toBeDefined();
    const hops = g.hops(ark.node, to);
    expect(hops).toBeGreaterThan(1);
    const lanes = g.lanes;
    expect(g.cmdPower(p.id, to)).toBe(true);
    expect(g.lanes).not.toBe(lanes);
    expect(g.lanes.length).toBe(lanes.length + 1);
    expect(g.lanes[g.lanes.length - 1]).toMatchObject({ a: ark.node, b: to, by: p.id });
    expect(g.neighbours(ark.node)).toContain(to);
    expect(g.hops(ark.node, to)).toBe(1);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.neighbours(ark.node)).toContain(to);
    expect(again.hops(ark.node, to)).toBe(1);
    // A rival's ship goes by it as well as the house's own.
    const rival = rivalOf(g);
    const s = g.spawnUnit('scout', rival.id, ark.node);
    g.cmdMove(rival.id, [s.id], to);
    expect(s.path[0] ?? s.dest).toBe(to);
    for (let i = 0; i < 400; i++) {
      g.step();
      again.step();
    }
    g.fx.length = 0;
    again.fx.length = 0;
  });
});

describe('Mind Theft (Lyceum Collective)', () => {
  /** A rival's Ark at the player's Ark's world, holding a Legendary Boon and a Common one. */
  function staged() {
    const g = as('lyceum');
    const p = g.player;
    ready(g, p);
    const rival = rivalOf(g);
    const ark = arkOf(g, p);
    g.killUnit(arkOf(g, rival), -1);
    const theirs = g.spawnUnit('ark', rival.id, ark.node, { x: ark.x + 80, y: ark.y });
    const legendary = CARDS.find((c) => c.rarity === 'legendary' && !c.pact && !c.cradle && !c.requires && !g.hasCard(p, c.id))!;
    g.addCard(rival, legendary.id);
    g.addCard(rival, 'hotBarrels');
    return { g, p, rival, ark, theirs, legendary };
  }

  it('learns the rarest Boon of the rival Ark at its world; the rival keeps it, and is told', () => {
    const { g, p, rival, legendary } = staged();
    expect(g.cmdPower(p.id)).toBe(true);
    expect(g.hasCard(p, legendary.id)).toBe(true);
    expect(g.hasCard(rival, legendary.id)).toBe(true);
    expect(g.notes.some((n) => n.text === `Mind Theft: your Ark read ${rival.name}${rival.name.endsWith('s') ? "'" : "'s"} Ark and learned ${legendary.name}.`)).toBe(true);
    expect(g.fx.some((f) => f.k === 'ability' && f.id === 'mindtheft' && f.says === `LEARNED ${legendary.name.toUpperCase()}`)).toBe(true);
  });

  it('nothing to learn, or no rival Ark there: it says so, and is not spent', () => {
    const { g, p, rival, theirs } = staged();
    for (const id of new Set(rival.cards)) while (g.cardCount(p, id) < CARD_BY_ID[id].max) g.addCard(p, id);
    expect(g.checkPower(p.id)).toBe('It knows no Boon your house could learn');
    g.killUnit(theirs, -1);
    expect(g.checkPower(p.id)).toBe('No rival Ark at your Ark\'s world');
    expect(g.cmdPower(p.id)).toBe(false);
    expect(p.powerCd).toBe(0);
  });
});

describe('Fate\'s Wager (Ashen Remnant)', () => {
  function staged(heads: boolean) {
    const g = as('ashen');
    const p = g.player;
    ready(g, p);
    const ark = arkOf(g, p);
    const rival = rivalOf(g);
    const foes = ['striker', 'guardian', 'breaker', 'dreadnought'].map((t) => g.spawnUnit(t as never, rival.id, ark.node, { x: ark.x + 90, y: ark.y }));
    vi.spyOn(g.rng, 'chance').mockReturnValueOnce(heads);
    return { g, p, ark, foes };
  }

  it('heads: once the coin lands, every enemy warship at the Ark\'s world burns, but not a capital ship', () => {
    const { g, p, ark, foes } = staged(true);
    expect(burnable(g, p, ark.node).length).toBe(3);
    expect(g.cmdPower(p.id)).toBe(true);
    // In the air: nothing yet, and nothing more can be cast.
    expect(foes.every((u) => !u.dead)).toBe(true);
    expect(g.checkPower(p.id)).toBe('The coin is in the air');
    run(g, WAGER_TIME + 0.1);
    expect(foes.slice(0, 3).every((u) => u.dead)).toBe(true);
    expect(foes[3].dead).toBe(false);
    expect(ark.dead).toBe(false);
    expect(g.notes.some((n) => /^Fate's Wager: heads\. 3 enemy warships turned to ash at /.test(n.text))).toBe(true);
  });

  it('tails: the Ark burns', () => {
    const { g, p, ark, foes } = staged(false);
    expect(g.cmdPower(p.id)).toBe(true);
    run(g, WAGER_TIME + 0.1);
    expect(ark.dead).toBe(true);
    expect(p.ark).toBe(-1);
    expect(foes[3].dead).toBe(false);
    expect(g.notes.some((n) => /^Fate's Wager: tails\. Your Ark burns at /.test(n.text))).toBe(true);
  });

  it('a coin in the air is the same coin after a save, and lands the same', () => {
    const { g, p } = staged(true);
    g.cmdPower(p.id);
    const again = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(again.player.wager).toEqual(p.wager);
    for (let i = 0; i < 80; i++) {
      g.step();
      again.step();
    }
    g.fx.length = 0;
    again.fx.length = 0;
    expect('wager' in again.player).toBe(false);
    expect(JSON.stringify(again.serialize())).toBe(JSON.stringify(g.serialize()));
  });
});

describe('powers and the rest of the game', () => {
  it('a Daily keeps the order, and plays it again to the tick', () => {
    const day = '2026-10-19';
    const g = Game.create(dailyConfig(day, 'wayfarer'));
    const p = g.player;
    run(g, POWER_FIRST + 1);
    g.exploreAll(p);
    const to = wayTargets(g, p, arkOf(g, p))[0];
    expect(g.cmdPower(p.id, to)).toBe(true);
    run(g, 20);
    expect(g.orders!.some((o) => o[1] === 'cmdPower')).toBe(true);
    const again = replay(dailyConfig(day, 'wayfarer'), JSON.parse(JSON.stringify(g.orders)), g.tick);
    expect(again.error).toBeNull();
    expect(snapshot(again.game)).toBe(snapshot(g));
    expect(again.game.lanes.length).toBe(g.lanes.length);
  });

  it('a run saved before 1.27 loads with its power ready, and the Choir\'s Ark no longer casts Conversion by itself', () => {
    const g = as('choir');
    const data = JSON.parse(JSON.stringify(g.serialize()));
    for (const f of data.factions) delete f.powerCd;
    data.factions[g.playerId].arkAbil = ['conversion'];
    for (const u of data.units) if (u.type === 'ark' && u.owner === g.playerId) u.abil = [{ id: 'conversion', cd: 4 }, { id: 'emp', cd: 0 }];
    const again = Game.load(data);
    expect(again.player.powerCd).toBe(0);
    expect(again.player.arkAbil).toEqual([]);
    expect(arkOf(again, again.player).abil.map((a) => a.id)).toEqual(['emp']);
  });

  it('a rival house casts its power when it would do what it is for', () => {
    const g = mk({ heir: 'vael', aiHeirs: ['concord', 'wayfarer', 'lyceum'] });
    const concord = g.empires().find((f) => f.heir === 'concord')!;
    concord.powerCd = 0;
    const dark = dawnWorlds(g, concord, arkOf(g, concord)).length;
    expect(dark).toBeGreaterThan(0);
    const worlds = g.worldsOf(concord.id).length;
    run(g, 15);
    expect(concord.powerCd).toBeGreaterThan(0);
    expect(g.worldsOf(concord.id).length).toBeGreaterThanOrEqual(worlds + dark);
  });
});
