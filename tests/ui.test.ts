/** The UI toolkit: what a click reaches. */
import { describe, expect, it } from 'vitest';
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
