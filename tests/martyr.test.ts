/** Martyr Cores (a playtest of 1.23): whom the blast hurts, what it does to a world, and how the player learns a rival has it. And the news, in colours that never pass a rival's news off as the player's own. */
import { describe, expect, it } from 'vitest';
import { addCard } from '../src/game/boons';
import { CARD_BY_ID } from '../src/game/data/cards';
import { HEIRS } from '../src/game/data/heirs';
import type { Game } from '../src/game/Game';
import { KIND_COLOR, newsAbout, newsColor, OTHERS } from '../src/ui/news';
import { possessive } from '../src/game/util';
import { mk } from './helpers';

/** A game in which nobody gives orders but the test. */
function quiet(opts: Parameters<typeof mk>[0] = {}): Game {
  const g = mk(opts);
  for (const f of g.factions) f.ai = null;
  return g;
}
/** A ship destroyed by another house, and what its death sets off. */
const destroy = (g: Game, u: ReturnType<Game['spawnUnit']>, by: number) => {
  g.killUnit(u, by);
  g.flushDeferred();
};

describe('Martyr Cores', () => {
  it('a blast hurts the enemy ships around it, never its own house', () => {
    const g = quiet();
    const p = g.player;
    const r = g.factions[1];
    addCard(g, p, 'martyr');
    const at = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0)!.id;
    const dying = g.spawnUnit('guardian', p.id, at);
    const mine = g.spawnUnit('striker', p.id, at);
    const theirs = g.spawnUnit('striker', r.id, at);
    for (const u of [mine, theirs]) {
      u.x = dying.x + 10;
      u.y = dying.y;
    }
    const [m0, t0] = [mine.hp + mine.sh, theirs.hp + theirs.sh];
    destroy(g, dying, r.id);
    expect(mine.hp + mine.sh).toBe(m0);
    expect(theirs.hp + theirs.sh).toBeLessThan(t0);
  });

  it('it hurts the enemy world it dies at, cracks it, and never takes it: ships must', () => {
    const g = quiet();
    const p = g.player;
    const r = g.factions[1];
    addCard(g, r, 'martyr');
    const home = g.nodes[p.capital];
    const before = home.hp + home.sh;
    const one = g.spawnUnit('dreadnought', r.id, home.id);
    destroy(g, one, p.id);
    expect(home.hp + home.sh).toBeLessThan(before);
    // A world at its last hull: the blasts crack it to 1, and it stays the player's.
    home.sh = 0;
    home.hp = 5;
    for (let i = 0; i < 4; i++) destroy(g, g.spawnUnit('dreadnought', r.id, home.id), p.id);
    expect(home.owner).toBe(p.id);
    expect(home.hp).toBe(1);
    // (Its own worlds are no target: a blast at the rival's Hearth leaves it whole.)
    const theirs = g.nodes[r.capital];
    const t0 = theirs.hp + theirs.sh;
    destroy(g, g.spawnUnit('dreadnought', r.id, theirs.id), p.id);
    expect(theirs.hp + theirs.sh).toBe(t0);
  });

  it('the first blast of a rival that reaches the player is told, once; a loss to one says so', () => {
    const g = quiet();
    const p = g.player;
    const r = g.factions[1];
    addCard(g, r, 'martyr');
    const at = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0)!.id;
    const told = () => g.notes.filter((n) => /explode when they are destroyed \(Martyr Cores\)/.test(n.text));
    for (let i = 0; i < 3; i++) {
      const victim = g.spawnUnit('striker', p.id, at);
      const dying = g.spawnUnit('dreadnought', r.id, at);
      victim.x = dying.x + 5;
      victim.y = dying.y;
      victim.hp = 1;
      victim.sh = 0;
      destroy(g, dying, p.id);
    }
    expect(told().length).toBe(1);
    expect(told()[0].text).toBe(`${possessive(g.shortName(r))} ships explode when they are destroyed (Martyr Cores), hurting your ships and worlds nearby.`);
    expect(g.notes.some((n) => n.loss && /to .* \(Martyr Cores\): 3 Strikers\./.test(n.text))).toBe(true);
  });

  it('a loss line says how many of its ships the blasts took, not all of them for one (1.23.3)', () => {
    const g = quiet();
    const p = g.player;
    const r = g.factions[1];
    addCard(g, r, 'martyr');
    const at = g.nodes.find((n) => n.kind === 'planet' && n.owner < 0)!.id;
    // Two Strikers shot down, then one taken by a blast, at the same place.
    for (let i = 0; i < 2; i++) destroy(g, g.spawnUnit('striker', p.id, at), r.id);
    const victim = g.spawnUnit('striker', p.id, at);
    const dying = g.spawnUnit('dreadnought', r.id, at);
    victim.x = dying.x + 5;
    victim.y = dying.y;
    victim.hp = 1;
    victim.sh = 0;
    destroy(g, dying, p.id);
    const line = g.notes.find((n) => n.loss && n.loss.node === at)!;
    expect(line.text).toMatch(/ \(1 by Martyr Cores\): 3 Strikers\.$/);
    // (A line from an older save, marked `true`, counts as one.)
    line.loss!.martyr = true as unknown as number;
    destroy(g, g.spawnUnit('striker', p.id, at), r.id);
    expect(line.text).toMatch(/ \(1 by Martyr Cores\): 4 Strikers\.$/);
  });

  it('the card says whom it hurts', () => {
    expect(CARD_BY_ID.martyr.desc).toBe('Destroyed ships explode, dealing [30% of their hull] to nearby enemy ships and to an enemy world they die at.');
  });
});

describe('the news, in colours that never pass a rival\'s news off as the player\'s own', () => {
  it('news about another house is in a colour no house wears; the colour of an event is no house\'s either', () => {
    const colours = HEIRS.map((h) => h.color);
    expect(colours).not.toContain(OTHERS);
    expect(colours).not.toContain(KIND_COLOR.event);
    // A player of the Lyceum Collective (violet): a rival's news is not in violet.
    const g = quiet({ heir: 'lyceum' });
    const r = g.factions.find((f) => f.kind === 'empire' && f.id !== g.playerId)!;
    const line = `${r.name} has claimed the drifting derelict dreadnought at Mizar.`;
    expect(newsAbout(g, line)).toBe(r.id);
    expect(newsColor(g, { text: line, kind: 'event' })).toBe(OTHERS);
    expect(newsColor(g, { text: `The Ark of ${r.name} has reached the stars.`, kind: 'alert' })).toBe(OTHERS);
    expect(newsColor(g, { text: `${g.shortName(r)} armed a Starfall at Electra!`, kind: 'alert' })).toBe(OTHERS);
    // The player's own news keeps its kind's colour, even when it names a rival.
    expect(newsColor(g, { text: `Your Hearth, Aurelia is under attack by ${r.name}!`, kind: 'alert' })).toBe(KIND_COLOR.alert);
    expect(newsColor(g, { text: `${g.player.name} has begun raising a Starfire Gate at Mizar I!`, kind: 'good' })).toBe(KIND_COLOR.good);
  });
});
