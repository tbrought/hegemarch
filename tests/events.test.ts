/** Events and threats: anomalies and visitors, the Corsairs, the Maw and the Hollow. */
import { describe, expect, it } from 'vitest';
import { EVENT_BY_ID, EVENTS, offering } from '../src/game/data/events';
import { TRAITS } from '../src/game/data/traits';
import { darkWorld, mk, run } from './helpers';

describe('events and threats', () => {
  it('resolves every event choice without errors', () => {
    for (const ev of EVENTS) {
      ev.choices.forEach((choice, idx) => {
        const g = mk({ seed: 10 + idx });
        const p = g.player;
        p.embers = 5000;
        const ship = g.spawnUnit('guardian', p.id, p.capital);
        const ctx = { node: p.capital, unit: ship.id };
        if (choice.cond && !choice.cond(g, p, ctx)) return;
        const text = choice.run(g, p, ctx);
        expect(typeof text).toBe('string');
        run(g, 1);
      });
    }
  });

  it('rolls two omens and applies every omen cleanly', () => {
    const g = mk();
    expect(g.traits.length).toBe(2);
    expect(new Set(g.traits).size).toBe(2);
    for (const t of TRAITS) {
      const h = mk({ seed: 77 });
      const costBefore = h.boonCostOf(h.player);
      h.traits = [t.id];
      t.apply?.(h);
      for (const f of h.factions) h.recomputeMods(f);
      if (t.id === 'discovery') expect(h.boonCostOf(h.player)).toBeLessThan(costBefore);
      run(h, 3);
      expect(Number.isFinite(h.player.embers)).toBe(true);
    }
  });

  it('player prompts resolve through the command API', () => {
    const g = mk();
    g.prompts.push({ id: 999, event: 'comet', node: g.player.capital, unit: -1 });
    const e0 = g.player.embers;
    const said = g.cmdResolvePrompt(999, 0)!;
    expect(said).toBeTruthy();
    expect(g.player.embers).toBe(e0 + 250);
    expect(g.cmdResolvePrompt(999, 0)).toBeNull();
    // What was chosen and what came of it stays in the log, once: the dialog is gone at a click.
    const lines = g.notes.filter((n) => n.kind === 'event' && n.text.endsWith(said));
    expect(lines.length).toBe(1);
    expect(lines[0].text).toMatch(/^.+: .+\. /);
    expect(lines[0].node).toBe(g.player.capital);
  });

  it('launches pirate raids at houses and asks to pause for the first one', () => {
    const g = mk();
    g.pirates.nextRaid = 1;
    run(g, 2);
    expect(g.pirates.raids.length).toBe(1);
    const raid = g.pirates.raids[0];
    expect(g.factions[raid.victim].kind).toBe('empire');
    expect(raid.units.length).toBeGreaterThan(0);
  });

  it('spawns a feeble tutorial raider', () => {
    const g = mk();
    const w = darkWorld(g);
    g.kindleWorld(w, 0);
    const r = g.spawnTutorialRaider(w.id)!;
    expect(r.owner).toBe(g.pirateId);
    expect(g.dmgMulOf(r, 'rapid')).toBeLessThan(0.5);
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

describe("the Whispering Rift takes a ship that can be offered", () => {
  const offer = EVENT_BY_ID.rift.choices[0];

  /** The rift, found by `finder` (the Ark, by default), with the other ships named standing by. */
  function rift(others: ('scout' | 'striker')[], finder: 'ark' | 'striker' = 'ark') {
    const g = mk();
    const p = g.player;
    const n = g.nodes.find((x) => x.kind === 'anomaly')!;
    for (const u of [...g.buckets[n.id]]) g.killUnit(u, -1);
    const ark = g.units.get(p.ark)!;
    ark.node = n.id;
    ark.lane = null;
    ark.path = [];
    const found = finder === 'ark' ? ark : g.spawnUnit('striker', p.id, n.id);
    const by = others.map((t) => g.spawnUnit(t, p.id, n.id));
    const prompt = { id: g.promptId++, event: 'rift', node: n.id, unit: found.id };
    g.prompts.push(prompt);
    const ctx = { node: n.id, unit: found.id };
    return { g, p, ark, found, by, prompt, ctx };
  }

  it('found by the Ark with other ships there, it takes the least of those, and the card names it', () => {
    const { g, p, ark, by, prompt, ctx } = rift(['striker', 'scout']);
    expect(offer.cond!(g, p, ctx)).toBe(true);
    expect(offering(g, p, ctx)).toBe(by[1]);
    const hint = offer.hintFor!(g, p, ctx)!;
    expect(hint).toContain('Lose a Scout');
    expect(hint).toContain('an Ark is never offered');
    const cards = p.cards.length;
    const said = g.cmdResolvePrompt(prompt.id, 0)!;
    expect(said).toContain('The Scout vanishes');
    expect(by[1].dead).toBe(true);
    expect([ark.dead, by[0].dead]).toEqual([false, false]);
    expect(p.cards.length).toBe(cards + 1);
  });

  it('with only the Ark there it cannot be made, says why, and can be made once a ship is sent', () => {
    const { g, p, ark, prompt, ctx } = rift([]);
    expect(offer.cond!(g, p, ctx)).toBe(false);
    expect(offer.why!(g, p, ctx)).toMatch(/^Your Ark is never offered, and no other ship of yours is here/);
    expect(offer.hintFor!(g, p, ctx)).toBeNull();
    expect(g.cmdResolvePrompt(prompt.id, 0)).toBeNull();
    expect(ark.dead).toBe(false);
    // The decision waits; a ship arrives; now the rift has its offering.
    const scout = g.spawnUnit('scout', p.id, ctx.node);
    expect(offer.cond!(g, p, ctx)).toBe(true);
    expect(g.cmdResolvePrompt(prompt.id, 0)).toContain('The Scout vanishes');
    expect(scout.dead).toBe(true);
    // (A ship still on its way there is not there.)
    const far = rift([]);
    const coming = far.g.spawnUnit('scout', far.p.id, far.p.capital);
    far.g.cmdMove(far.p.id, [coming.id], far.ctx.node);
    expect(offer.cond!(far.g, far.p, far.ctx)).toBe(false);
  });

  it('found by an ordinary ship, it takes that ship, as it always did', () => {
    const { g, p, found, by, prompt, ctx } = rift(['scout'], 'striker');
    expect(offer.hintFor!(g, p, ctx)).toContain('Lose the Striker that found it');
    expect(g.cmdResolvePrompt(prompt.id, 0)).toContain('The Striker vanishes');
    expect([found.dead, by[0].dead]).toEqual([true, false]);
  });

  it('if the ship that found it is gone, another ship there can be offered in its place', () => {
    const { g, p, found, by, prompt, ctx } = rift(['scout'], 'striker');
    g.killUnit(found, -1);
    expect(offer.hintFor!(g, p, ctx)).toContain('the ship that found it is gone');
    expect(g.cmdResolvePrompt(prompt.id, 0)).toContain('The Scout vanishes');
    expect(by[0].dead).toBe(true);
  });

  it('an anomaly waits for the rest of a fleet on the last starlane to it, so the offering is there when the decision opens', () => {
    const g = mk();
    const p = g.player;
    const n = g.nodes.find((x) => x.kind === 'anomaly')!;
    const from = g.nodes.find((x) => g.hops(x.id, n.id) === 1)!;
    for (const x of [n, from]) for (const u of [...g.buckets[x.id]]) g.killUnit(u, -1);
    n.anomaly = 'rift';
    // A Scout is on the starlane to the rift; the Ark is there already.
    const scout = g.spawnUnit('scout', p.id, from.id);
    g.cmdMove(p.id, [scout.id], n.id);
    for (let i = 0; i < 400 && !scout.lane; i++) g.step();
    expect(scout.lane?.to).toBe(n.id);
    const ark = g.units.get(p.ark)!;
    ark.node = n.id;
    ark.lane = null;
    ark.path = [];
    ark.order = 'idle';
    ark.arrivedAt = g.time;
    let early = 0;
    for (let i = 0; i < 2000 && scout.lane; i++) {
      g.step();
      if (scout.lane && g.prompts.length) early++;
    }
    expect(early).toBe(0);
    run(g, 2);
    const prompt = g.prompts.find((x) => x.event === 'rift')!;
    expect(prompt).toBeTruthy();
    expect(offer.cond!(g, p, { node: prompt.node, unit: prompt.unit })).toBe(true);
    // (Alone, a ship is not kept waiting.)
    const lone = mk();
    const m = lone.nodes.find((x) => x.kind === 'anomaly')!;
    for (const u of [...lone.buckets[m.id]]) lone.killUnit(u, -1);
    m.anomaly = 'rift';
    const s2 = lone.spawnUnit('scout', lone.playerId, m.id);
    s2.order = 'idle';
    run(lone, 1.5);
    expect(lone.prompts.some((x) => x.event === 'rift')).toBe(true);
  });

  it("a choice that is greyed for another reason than its price says the reason", () => {
    const g = mk();
    const p = g.player;
    const captain = Object.values(EVENT_BY_ID).flatMap((e) => e.choices).find((c) => c.label === 'Recruit their captain')!;
    const ctx = { node: p.capital, unit: 0 };
    p.embers = 500;
    expect(captain.cond!(g, p, ctx)).toBe(true);
    expect(captain.why!(g, p, ctx)).toBeNull();
    g.killUnit(g.units.get(p.ark)!, -1);
    g.flushDeferred();
    run(g, 1);
    expect(captain.cond!(g, p, ctx)).toBe(false);
    expect(captain.why!(g, p, ctx)).toMatch(/^Your Ark is lost/);
  });
});

describe('the Merchant Guild (a playtest of 1.23)', () => {
  const merchant = EVENT_BY_ID.merchant;
  const ctx = { node: -1, unit: -1 };
  it('its Rare Boon is never Star Charts, the maps it sells as the other choice', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = mk({ seed });
      const f = g.player;
      f.embers = 5000;
      merchant.choices[0].run(g, f, ctx);
      expect(f.cards, `seed ${seed}`).not.toContain('starCharts');
      expect(f.cards.length, `seed ${seed}`).toBe(1);
    }
  });

  it('its maps are not sold to a house that has charted the whole sector, and it says why', () => {
    const g = mk();
    const f = g.player;
    f.embers = 5000;
    const maps = merchant.choices[1];
    expect(maps.cond!(g, f, ctx)).toBe(true);
    g.exploreAll(f);
    expect(maps.cond!(g, f, ctx)).toBe(false);
    expect(maps.why!(g, f, ctx)).toBe('Your house has charted the whole sector already.');
    // (Too poor, and not charted: the usual words.)
    const h = mk();
    h.player.embers = 0;
    expect(maps.cond!(h, h.player, ctx)).toBe(false);
    expect(maps.why!(h, h.player, ctx)).toBeNull();
  });
});
