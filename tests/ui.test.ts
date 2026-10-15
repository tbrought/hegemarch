/** The UI toolkit: what a click reaches. */
import { describe, expect, it } from 'vitest';
import { LUMP, LUMP_FLASH, rollEmbers, type EmberCount } from '../src/ui/hud/emberCount';
import { BEAM, BEAT, LAND_GAP, planDeal, tierOf } from '../src/ui/modals/reveal';
import { LINE_GAP, LINE_GLOW, lineGlow, storyEnd } from '../src/ui/modals/storyText';
import { arcFrame, arcRound, sparkOut } from '../src/ui/modals/pixelFx';
import { BOON_FLASH } from '../src/ui/hud/touches';
import { PAL } from '../src/render/palette';
import type { Ctx } from '../src/render/pixel';
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

/** A canvas that only notes what is drawn on it: each rectangle and its colour. */
function noting() {
  const drawn: { x: number; y: number; w: number; h: number; c: string }[] = [];
  const g = { fillStyle: '', fillRect(x: number, y: number, w: number, h: number) { drawn.push({ x, y, w, h, c: this.fillStyle }); } };
  return { g: g as unknown as Ctx, drawn };
}

describe('a rarer thing kindles, as a world does when a seed ship reaches it (a playtest of 1.23: never a flash)', () => {
  it('the ring fills round a frame from the middle of its top, clockwise, and draws on the frame alone: nothing is ever filled', () => {
    const [x, y, w, h] = [10, 20, 40, 30];
    const onFrame = (px: number, py: number) => px === x || px === x + w - 1 || py === y || py === y + h - 1;
    for (const k of [0.1, 0.5, 0.9, 0.999]) {
      const { g, drawn } = noting();
      arcFrame(g, x, y, w, h, k, PAL.violet);
      expect(drawn.length).toBe(Math.floor(k * 2 * (w + h)));
      for (const d of drawn) {
        expect(d.w * d.h).toBe(1);
        expect(onFrame(d.x, d.y)).toBe(true);
      }
      // (It starts at the middle of the top and goes right.)
      expect(drawn[0]).toMatchObject({ x: x + w / 2, y });
    }
    // Never a pixel outside its frame, filling or closed, whatever its size (1.23.4: on a frame of odd
    // width, as the BOON button's is, a pixel stood out above and below its right-hand corners).
    for (const [fx, fy, fw, fh] of [[99, 0, 37, 13], [5, 5, 36, 13], [0, 0, 41, 29], [3, 1, 2, 2]]) {
      for (let k = 0.01; k <= 1.001; k += 0.01) {
        const { g, drawn } = noting();
        arcFrame(g, fx, fy, fw, fh, k, PAL.violet);
        for (const d of drawn) for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
          const [px, py] = [d.x + i, d.y + j];
          const inside = px >= fx && px < fx + fw && py >= fy && py < fy + fh;
          const edge = px === fx || px === fx + fw - 1 || py === fy || py === fy + fh - 1;
          expect(inside && edge, `${fw}x${fh} at ${k.toFixed(2)}: ${px},${py}`).toBe(true);
        }
      }
    }
    // Closed, it is the whole frame and nothing more, in the frame's colour, in four strokes (1.23.3: it was
    // some 900 a frame round a rarer card).
    for (const k of [1, 3]) {
      const { g, drawn } = noting();
      arcFrame(g, x, y, w, h, k, PAL.violet);
      expect(drawn.length).toBe(4);
      const px = new Set<string>();
      for (const d of drawn) for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) px.add(`${d.x + i},${d.y + j}`);
      expect(px.size).toBe(2 * (w + h) - 4);
      for (const p of px) expect(onFrame(...(p.split(',').map(Number) as [number, number]))).toBe(true);
      expect(new Set(drawn.map((d) => d.c))).toEqual(new Set([PAL.violet]));
    }
    const none = noting();
    arcFrame(none.g, x, y, w, h, 0, PAL.violet);
    arcRound(none.g, x, y, 6, -1, PAL.gold);
    expect(none.drawn.length).toBe(0);
  });

  it('as it closes, sparks fly out from the frame, outward, and are gone in under two thirds of a second', () => {
    const [x, y, w, h] = [100, 100, 60, 80];
    const at = (s: number) => {
      const { g, drawn } = noting();
      sparkOut(g, x, y, w, h, s, 30, PAL.gold, 1);
      return drawn;
    };
    expect(at(-0.01).length).toBe(0);
    expect(at(0).length).toBe(30);
    for (const d of at(0.3)) {
      expect(d.w * d.h).toBe(1);
      // (Outside the frame: they fly off it.)
      expect(d.x < x || d.x > x + w - 1 || d.y < y || d.y > y + h - 1).toBe(true);
    }
    expect(at(0.66).length).toBe(0);
  });

  it('the BOON button is kindled in violet, its ring dimming before it goes; the mark is over in under a second', () => {
    expect(BOON_FLASH.RING).toBeLessThan(BOON_FLASH.ALL - BOON_FLASH.DIM);
    expect(BOON_FLASH.ALL).toBeLessThan(1);
  });
});

describe('the story of a decision comes in under a scan line, as quick as the game is (a playtest of 1.23)', () => {
  it('a line every LINE_GAP: a story of three lines is all there in under a third of a second', () => {
    expect(storyEnd(3, 0)).toBeCloseTo(3 * LINE_GAP, 9);
    expect(storyEnd(3, 0)).toBeLessThan(1 / 3);
    expect(storyEnd(0, 0.16)).toBe(0.16);
    expect(storyEnd(2, 0.16)).toBeCloseTo(0.16 + 2 * LINE_GAP, 9);
  });

  it('each line glows as the scan line leaves it, ember then gold, then is its own colour; never white', () => {
    expect(lineGlow(0, PAL.mist)).toBe(PAL.ember);
    expect(lineGlow(LINE_GLOW * 0.75, PAL.mist)).toBe(PAL.gold);
    expect(lineGlow(LINE_GLOW, PAL.mist)).toBe(PAL.mist);
    for (let k = 0; k < 20; k++) expect(lineGlow((k / 20) * LINE_GLOW, PAL.mist)).not.toBe(PAL.bone);
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
  it('rings close on it, its window kindles, and the abilities fade up one after another: all there in about a second and a third', () => {
    expect(LEVEL_UP.KINDLE).toBeLessThanOrEqual(LEVEL_UP.RINGS);
    expect(LEVEL_UP.ABILITIES).toBeGreaterThan(LEVEL_UP.KINDLE);
    // (The ring has closed round the window by the time the abilities are all there.)
    expect(LEVEL_UP.KINDLE + LEVEL_UP.KINDLE_RING).toBeLessThanOrEqual(levelUpEnd(1) + 1e-9);
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
