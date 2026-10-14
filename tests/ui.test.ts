/** The UI toolkit: what a click reaches. */
import { describe, expect, it } from 'vitest';
import { LUMP, LUMP_FLASH, rollEmbers, type EmberCount } from '../src/ui/hud/emberCount';
import { BEAM, BEAT, LAND_GAP, planDeal, tierOf } from '../src/ui/modals/reveal';
import { storyEnd, WORD_FADE, wordIn, WORDS_PER_SECOND } from '../src/ui/modals/storyText';
import { LEVEL_UP, levelUpEnd } from '../src/ui/modals/event';
import { OMENS, omensPlan } from '../src/ui/modals/omensPlan';
import { CHEER, sparkAt } from '../src/ui/Goals';
import { EVENTS } from '../src/game/data/events';
import { Ui } from '../src/ui/Ui';

describe('a dialog that has just opened by itself takes no click', () => {
  /** One frame: something of the HUD, then (held or not) a dialog over part of it. */
  function scene() {
    const ui = new Ui();
    const got: string[] = [];
    const frame = (hold: boolean, dialog = true) => {
      ui.begin(1 / 60);
      ui.add({ id: 'hud', x: 0, y: 0, w: 200, h: 100, onClick: () => got.push('hud'), onRight: () => got.push('hud-right') });
      if (!dialog) return;
      if (hold) ui.holdClicks();
      ui.add({ id: 'back', x: 0, y: 0, w: 100, h: 100, onClick: () => got.push('back') });
      ui.add({ id: 'choice', x: 10, y: 10, w: 30, h: 20, onClick: () => got.push('choice'), onRight: () => got.push('choice-right') });
    };
    const click = (x: number, y: number, button = 0) => [ui.pointerDown(x, y, button), ui.pointerUp(x, y, button)];
    return { ui, got, frame, click };
  }

  it('while it is held, a click on it goes nowhere, and not through to what lies under it', () => {
    const { ui, got, frame, click } = scene();
    frame(true);
    frame(true);
    expect(ui.holding()).toBe(true);
    // The UI takes the click (the map under the dialog must not get it), and nothing happens.
    expect(click(20, 20)).toEqual([true, true]);
    expect(click(20, 20, 2)).toEqual([true, true]);
    expect(click(80, 80)).toEqual([true, true]);
    expect(got).toEqual([]);
    // It does not light up under the pointer either.
    ui.pointerMove(20, 20);
    frame(true);
    expect(ui.isHot('choice')).toBe(false);
    // What is not under the dialog works as ever.
    expect(click(150, 50)).toEqual([true, true]);
    expect(got).toEqual(['hud']);
  });

  it('let go of, it takes clicks; and a button pressed before it opened and let go on it clicks nothing', () => {
    const { ui, got, frame, click } = scene();
    frame(false, false);
    frame(false, false);
    // Pressed on the HUD, and the dialog opens under the pointer before the button comes up.
    ui.pointerDown(20, 20, 0);
    frame(true);
    frame(true);
    expect(ui.pointerUp(20, 20, 0)).toBe(true);
    expect(got).toEqual([]);
    // The moment is over.
    frame(false);
    frame(false);
    expect(ui.holding()).toBe(false);
    ui.pointerMove(20, 20);
    frame(false);
    expect(ui.isHot('choice')).toBe(true);
    click(20, 20);
    click(20, 20, 2);
    expect(got).toEqual(['choice', 'choice-right']);
  });
});

describe('the Ember count in the top bar (a playtest of 1.17)', () => {
  /** The count over some seconds of play: an income, at a game speed, drawn at a frame rate. How often it changed colour, and how long it was white. */
  function watch(income: number, speed: number, fps: number, seconds: number, lumpAt = -1, lump = 0) {
    const st: EmberCount = { embersShown: -1, lastEmbers: -1, emberFlash: 0 };
    let embers = 1000;
    let acc = 0;
    let changes = 0;
    let white = 0;
    let was = false;
    const dt = 1 / fps;
    for (let f = 0; f < seconds * fps; f++) {
      // (The game adds its income twenty times a second of its own time, as `App` steps it.)
      acc += dt * speed;
      while (acc >= 0.05) {
        acc -= 0.05;
        embers += income * 0.05;
      }
      if (f === Math.round(lumpAt * fps)) embers += lump;
      rollEmbers(st, embers, dt);
      const now = st.emberFlash > 0;
      if (now !== was) changes++;
      if (now) white += dt;
      was = now;
    }
    return { changes, white, shown: st.embersShown, embers };
  }

  it('an income never turns it white, however large, at any speed or frame rate: it used to flicker between 39 and 53 Embers a second', () => {
    for (const fps of [30, 60, 144]) {
      for (const speed of [0.5, 1, 2, 3]) {
        for (const income of [5, 22, 39, 45, 53, 80, 200]) {
          const w = watch(income, speed, fps, 12);
          expect(w.changes).toBe(0);
          expect(w.white).toBe(0);
          // (It still rolls, a little behind the real figure.)
          expect(w.embers - w.shown).toBeLessThan(income * speed * 0.2 + 1);
        }
      }
    }
  });

  it('a lump of Embers turns it white once, for half a second, whatever the income', () => {
    for (const income of [0, 45, 120]) {
      const w = watch(income, 1, 60, 6, 2, 400);
      expect(w.changes).toBe(2);
      expect(w.white).toBeGreaterThan(LUMP_FLASH - 0.05);
      expect(w.white).toBeLessThan(LUMP_FLASH + 0.05);
    }
    // Spending is not a gain: the count stays gold. And a gain below a lump is no lump.
    expect(watch(10, 1, 60, 6, 2, -400).white).toBe(0);
    expect(watch(10, 1, 60, 6, 2, LUMP - 2).white).toBe(0);
  });

  it('says what came in or went out, for the figure that pops up under it', () => {
    const st: EmberCount = { embersShown: -1, lastEmbers: -1, emberFlash: 0 };
    expect(rollEmbers(st, 500, 0.016)).toBe(0);
    expect(rollEmbers(st, 750, 0.016)).toBe(250);
    expect(rollEmbers(st, 630, 0.016)).toBe(-120);
    expect(rollEmbers(st, 640, 0.016)).toBe(0);
  });
});

describe('a Boon draft is dealt, and its cards beamed in one by one', () => {
  it("a card's tier is its rarity, a Pact counting as a Rare", () => {
    expect(tierOf({ rarity: 'common' })).toBe(0);
    expect(tierOf({ rarity: 'rare' })).toBe(1);
    expect(tierOf({ rarity: 'common', pact: true })).toBe(1);
    expect(tierOf({ rarity: 'epic' })).toBe(2);
    expect(tierOf({ rarity: 'legendary' })).toBe(3);
  });

  it('the places appear in order; the cards come the commonest first and the rarest last, a Legendary after the longest beat', () => {
    const d = planDeal([3, 0, 2]);
    expect(d.cards.map((c) => c.landAt)).toEqual([0, LAND_GAP, 2 * LAND_GAP]);
    expect(d.cards[1].beamAt).toBeLessThan(d.cards[2].beamAt);
    expect(d.cards[2].beamAt).toBeLessThan(d.cards[0].beamAt);
    for (const c of d.cards) expect(c.shownAt - c.beamAt).toBeCloseTo(BEAM, 9);
    expect(d.cards[0].beamAt - d.cards[2].shownAt).toBeCloseTo(BEAT[3], 9);
    expect(d.doneAt).toBeCloseTo(d.cards[0].shownAt, 9);
    // (Places first, then the motes of the rarer ones while they wait.)
    expect(d.tellFrom).toBeGreaterThan(d.cards[2].landAt);
    expect(d.tellFrom).toBeLessThan(d.cards[1].beamAt);
  });

  it('is quick: about a second and a half for three Commons, under two and a half seconds with a Legendary', () => {
    expect(planDeal([0, 0, 0]).doneAt).toBeLessThan(1.7);
    expect(planDeal([1, 3, 0]).doneAt).toBeLessThan(2.5);
    // (Ties go left to right.)
    const d = planDeal([1, 1, 1]);
    expect(d.cards[0].beamAt).toBeLessThan(d.cards[1].beamAt);
    expect(d.cards[1].beamAt).toBeLessThan(d.cards[2].beamAt);
  });
});

describe('the story of a decision comes in word by word (a page of a storybook)', () => {
  it('each word fades up out of the dark, settling a pixel as it does, and is whole after a third of a second', () => {
    expect(wordIn(-0.01).alpha).toBe(0);
    expect(wordIn(0).alpha).toBe(0);
    const half = wordIn(WORD_FADE / 2);
    expect(half.alpha).toBeGreaterThan(0.5);
    expect(half.alpha).toBeLessThan(1);
    expect(wordIn(0.05).dy).toBe(1);
    expect(wordIn(WORD_FADE).alpha).toBe(1);
    expect(wordIn(WORD_FADE).dy).toBe(0);
    // (Smooth: it only ever comes up.)
    let last = -1;
    for (let k = 0; k <= 40; k++) {
      const a = wordIn((k / 40) * WORD_FADE).alpha;
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });

  it('nine words a second: a story of twenty words is all there in a little over two seconds', () => {
    expect(WORDS_PER_SECOND).toBe(9);
    expect(storyEnd(20, 0)).toBeCloseTo(19 / 9 + WORD_FADE, 9);
    expect(storyEnd(20, 0)).toBeLessThan(2.6);
    expect(storyEnd(0, 0.16)).toBe(0.16);
  });

  it('every story picks out a phrase in gold (in braces), and no more than two', () => {
    for (const e of EVENTS) {
      const marked = e.text.match(/\{[^}]+\}/g) ?? [];
      expect(marked.length, e.id).toBeGreaterThanOrEqual(1);
      expect(marked.length, e.id).toBeLessThanOrEqual(2);
    }
  });
});

describe('a ship rising a level powers up before its abilities come in', () => {
  it('rings close on it, the window flashes, and the abilities fade up one after another: all there in about a second and a third', () => {
    expect(LEVEL_UP.FLASH).toBeLessThanOrEqual(LEVEL_UP.RINGS);
    expect(LEVEL_UP.ABILITIES).toBeGreaterThan(LEVEL_UP.FLASH);
    expect(levelUpEnd(3)).toBeCloseTo(LEVEL_UP.ABILITIES + 2 * LEVEL_UP.ABILITY_GAP + LEVEL_UP.ABILITY_FADE, 9);
    expect(levelUpEnd(3)).toBeLessThan(1.4);
    expect(levelUpEnd(1)).toBeLessThan(levelUpEnd(3));
  });
});

describe('the omens come in under their stars, the Ambition last', () => {
  it('a star for each omen in turn, the Ambition after them: all there in under two and a half seconds', () => {
    const p = omensPlan(2, true);
    expect(p.at).toEqual([OMENS.FIRST, OMENS.FIRST + OMENS.GAP]);
    expect(p.ambAt).toBeGreaterThan(p.at[1]);
    expect(p.end).toBeGreaterThan(p.ambAt);
    expect(p.end).toBeLessThan(2.5);
  });

  it('with no Ambition, or no omens at all (an Ages run arrives with them; a cradle has none), it ends when they do', () => {
    expect(omensPlan(2, false).end).toBeLessThan(omensPlan(2, true).end);
    expect(omensPlan(1, true).ambAt).toBeGreaterThan(omensPlan(1, true).at[0]);
    expect(omensPlan(0, false).end).toBe(0);
    expect(omensPlan(0, true).end).toBeGreaterThan(0);
  });
});

describe('a goal reached sends its Embers to the count', () => {
  it('they leave the goal, dip under the top bar, and land on the count', () => {
    const from = { x: 600, y: 45 };
    const to = { x: 5, y: 6 };
    expect(sparkAt(from, to, 0)).toEqual(from);
    expect(sparkAt(from, to, 1)).toEqual(to);
    expect(sparkAt(from, to, 0.5).y).toBeGreaterThan(from.y);
    // (Always on its way: never turning back.)
    let last = from;
    for (let k = 1; k <= 60; k++) {
      const p = sparkAt(from, to, k / 60);
      expect(p.x).toBeLessThanOrEqual(last.x);
      last = p;
    }
  });

  it('every spark has landed before the goal makes way for the next one', () => {
    expect(CHEER.FLY + (CHEER.SPARKS - 1) * CHEER.APART + CHEER.FLIGHT).toBeLessThan(CHEER.STAY);
    expect(CHEER.STRIKE).toBeLessThan(CHEER.FLY);
  });
});
