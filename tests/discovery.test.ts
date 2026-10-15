/** Boons a player discovers (lock and key): the deck a new player starts with, the moments that open the rest, and the Boon the next choice owes. */
import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { BOON_KEYS, KEY_IDS, KEY_OF } from '../src/game/data/boonKeys';
import { CARD_BY_ID, CARDS } from '../src/game/data/cards';
import { discoveryConfig, loadProfile } from '../src/meta/profile';
import type { Herald } from '../src/game/types';
import { mk, run } from './helpers';

/** A new player's run: no key found yet, nobody giving orders but the test. */
function fresh(found: string[] = []): Game {
  const g = mk({ boonKeys: found });
  for (const f of g.factions) f.ai = null;
  return g;
}
const dealable = CARDS.filter((c) => !c.hidden && !c.cradle);
const heralds = (g: Game): Herald[] => g.notes.filter((n) => n.herald).map((n) => n.herald!);
const pool = (g: Game, fid = g.playerId) => g.cardPool(g.factions[fid]).map((c) => c.id);

describe('the deck a new player starts with', () => {
  it('every Boon of a classic run is in the starting deck or opened by exactly one key', () => {
    const keyed = BOON_KEYS.flatMap((k) => k.cards);
    expect(new Set(keyed).size).toBe(keyed.length);
    for (const id of keyed) expect(dealable.some((c) => c.id === id), id).toBe(true);
    const starter = dealable.filter((c) => !KEY_OF[c.id]);
    expect(starter.length).toBe(21);
    expect(Object.fromEntries(BOON_KEYS.map((k) => [k.id, k.cards.length]))).toEqual({ battle: 21, kill: 4, ark: 3, hangar: 2, attacked: 7, guardian: 1, breaker: 1, observatory: 1, corsairs: 1 });
    expect(starter.length + keyed.length).toBe(dealable.length);
    // (The First Night's hand-picked first offer is all in the starting deck.)
    for (const id of ['emberTithe', 'strikerWings', 'kindlingRites', 'hardHulls', 'stargazers']) expect(KEY_OF[id]).toBeUndefined();
  });

  it('a new player is dealt only the starting deck; a player with every key, or a run that names none, everything; a rival always everything', () => {
    const g = fresh();
    const mine = pool(g);
    expect(mine.length).toBeGreaterThan(10);
    for (const id of mine) expect(KEY_OF[id], id).toBeUndefined();
    const all = pool(mk());
    expect(pool(mk({ boonKeys: [...KEY_IDS] }))).toEqual(all);
    expect(pool(g, g.factions[1].id)).toEqual(pool(mk(), 1));
    // (Its offers come from it too.)
    g.player.pendingDrafts = 6;
    for (let i = 0; i < 6; i++) {
      const offer = g.ensureOffer(g.player)!;
      for (const id of offer) expect(KEY_OF[id], id).toBeUndefined();
      expect(g.cmdChooseCard(g.playerId, offer[0])).toBe(true);
    }
  });
});

describe('a key turns at its moment, in the run, and opens its Boons', () => {
  /** A run past its first two seconds (keys that hold from the start have opened quietly). */
  const begun = (found: string[] = []) => {
    const g = fresh(found);
    run(g, 2.5);
    return g;
  };
  const turned = (g: Game, key: string) => !!g.ui['key:' + key];

  it('your first battle', () => {
    const g = begun();
    g.player.stats.damageDealt += 50;
    run(g, 1.1);
    expect(turned(g, 'battle')).toBe(true);
    expect(pool(g)).toContain('deflectors');
    expect(heralds(g)).toContainEqual({ title: 'NEW BOONS DISCOVERED', sub: 'For your battles: Deflector Tuning, Long Sights and 19 more.', tone: 'gold' });
    expect(g.notes.some((n) => /New Boons discovered \(for your battles\).*The next Boon choice to be dealt holds one of them/.test(n.text))).toBe(true);
  });

  it('your first enemy ship destroyed; your Ark rising a level; your Observatory', () => {
    const g = begun();
    g.player.stats.kills = 1;
    g.player.arkLevel = 2;
    const w = g.worldsOf(g.playerId)[0];
    w.role = 'observatory';
    run(g, 1.1);
    for (const k of ['kill', 'ark', 'observatory']) expect(turned(g, k), k).toBe(true);
    expect(pool(g)).toEqual(expect.arrayContaining(['salvage', 'arkAscendant', 'greatLenses']));
  });

  it('one of your worlds attacked', () => {
    const g = begun();
    const home = g.nodes[g.player.capital];
    g.damagePlanet(home, 10, 'siege', g.factions[1].id);
    run(g, 1.1);
    expect(turned(g, 'attacked')).toBe(true);
    expect(heralds(g).at(-1)?.sub).toBe(`For when your worlds are attacked: ${CARD_BY_ID.bulwark.name}, ${CARD_BY_ID.batteries.name} and 5 more.`);
    expect(pool(g)).toEqual(expect.arrayContaining(['bulwark', 'militia', 'fortressHearth']));
  });

  it('your hangar nearly full; your first Breaker; the Corsairs met', () => {
    const g = begun();
    const p = g.player;
    for (let i = 0; i < 80 && p.hangarUsed < p.hangarCap * 0.8; i++) {
      g.spawnUnit('striker', p.id, p.capital);
      run(g, 0.05);
    }
    g.spawnUnit('breaker', p.id, p.capital);
    const corsair = g.factions.find((f) => f.kind === 'pirate')!;
    g.spawnUnit('striker', corsair.id, p.capital);
    run(g, 1.1);
    for (const k of ['hangar', 'breaker', 'corsairs']) expect(turned(g, k), k).toBe(true);
  });

  it('a key that holds from the start opens quietly: no herald, no Boon owed', () => {
    const g = fresh();
    expect(g.unitList.some((u) => u.owner === g.playerId && u.type === 'guardian')).toBe(true);
    run(g, 2.5);
    expect(turned(g, 'guardian')).toBe(true);
    expect(g.ui['fresh:guardian']).toBeUndefined();
    expect(heralds(g)).toEqual([]);
    expect(pool(g)).toContain('guardianDoctrine');
  });

  it('nothing turns for a player who has the key already, for a rival, in a run that names no keys, or on the cradle', () => {
    const had = begun(['battle']);
    had.player.stats.damageDealt += 50;
    run(had, 1.1);
    expect(had.ui['key:battle']).toBeUndefined();
    expect(heralds(had)).toEqual([]);
    const none = mk();
    for (const f of none.factions) f.ai = null;
    none.player.stats.damageDealt += 50;
    run(none, 3);
    expect(KEY_IDS.some((k) => none.ui['key:' + k])).toBe(false);
    const cradle = Game.create({ seed: 4242, size: 'small', difficulty: 1, heir: 'concord', perks: {}, unlockLegendary: true, unlockPacts: true, mode: 'ages', stage: 'cradle', boonKeys: [] });
    cradle.player.stats.damageDealt += 50;
    run(cradle, 3);
    expect(KEY_IDS.some((k) => cradle.ui['key:' + k])).toBe(false);
  });
});

describe('the next Boon choice holds one of the Boons just discovered', () => {
  it('one of them, in the place of a Common; then it is owed no longer', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = mk({ seed, boonKeys: [] });
      for (const f of g.factions) f.ai = null;
      run(g, 2.5);
      const home = g.nodes[g.player.capital];
      g.damagePlanet(home, 10, 'siege', g.factions[1].id);
      run(g, 1.1);
      expect(g.ui['fresh:attacked']).toBe(1);
      g.player.pendingDrafts = 2;
      g.player.draftOffer = null;
      const offer = g.ensureOffer(g.player)!;
      expect(offer.filter((id) => KEY_OF[id] === 'attacked').length, `seed ${seed}: ${offer}`).toBeGreaterThanOrEqual(1);
      expect(g.ui['fresh:attacked']).toBeUndefined();
      // (A Boon is never in an offer twice.)
      expect(new Set(offer).size).toBe(offer.length);
    }
  });

  it('the odds of the next choice count it in', () => {
    const g = fresh();
    run(g, 2.5);
    g.player.stats.damageDealt += 50;
    run(g, 1.1);
    const before = g.offerOdds(g.player);
    expect(before.choices).toBe(3);
    // (The Blueprints of a first battle: one is likelier now than its weight alone would make it.)
    expect(before.blueprint).toBeGreaterThan(0.2);
  });

  it('what was found, and the Boon still owed, are kept in a save', () => {
    const g = fresh();
    run(g, 2.5);
    g.player.stats.kills = 1;
    run(g, 1.1);
    const h = Game.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(h.ui['key:kill']).toBe(1);
    expect(h.ui['fresh:kill']).toBe(1);
    expect(pool(h)).toEqual(pool(g));
  });
});

describe('the player keeps what they have found', () => {
  const store: Record<string, string> = {};
  const w = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete w.window;
    for (const k of Object.keys(store)) delete store[k];
  });
  const withProfile = (p: object) => {
    store['hegemarch.profile.v1'] = JSON.stringify(p);
    w.window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) } };
  };

  it('a profile from before discovery that has played has every key; a new one has none; one with keys keeps them', () => {
    withProfile({ v: 1, runs: 3 });
    expect(loadProfile().boonKeys).toEqual(KEY_IDS);
    withProfile({ v: 1, runs: 0, tutorialDone: true });
    expect(loadProfile().boonKeys).toEqual(KEY_IDS);
    withProfile({ v: 1, runs: 0 });
    expect(loadProfile().boonKeys).toEqual([]);
    withProfile({ v: 1, runs: 0, boonKeys: ['battle'] });
    expect(loadProfile().boonKeys).toEqual(['battle']);
  });

  it('a run is told the keys found, or nothing once all are found', () => {
    withProfile({ v: 1, runs: 0, boonKeys: ['kill', 'battle'] });
    expect(discoveryConfig(loadProfile())).toEqual({ boonKeys: ['battle', 'kill'] });
    withProfile({ v: 1, runs: 0, boonKeys: [...KEY_IDS] });
    expect(discoveryConfig(loadProfile())).toEqual({});
  });
});
