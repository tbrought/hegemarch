/**
 * Decisions: an event (an anomaly a ship has reached, a visitor at the Hearth) with its choices and its
 * outcome, and the ability a ship learns when it has risen a level.
 */

import { ABILITY_BY_ID } from '../../game/data/abilities';
import { EVENT_BY_ID } from '../../game/data/events';
import { UNITS } from '../../game/data/units';
import { text, textCenter } from '../../render/font';
import { PAL } from '../../render/palette';
import { box, rect, type Ctx } from '../../render/pixel';
import { drawRich, richLines } from '../../render/rich';
import { termsIn } from '../glossary';
import { drawSubjects, starWindow, subjectsIn, subjectsSize, type Look } from '../subjects';
import { drawStory, storyEnd, wordCount } from './storyText';
import type { Modals } from '../Modals';

export function resolve(modals: Modals, promptId: number, choice: number) {
  const r = modals.g.cmdResolvePrompt(promptId, choice);
  if (r === null) {
    modals.s.sfx.play('error', 0.5);
    return;
  }
  modals.result = { promptId, text: r };
  modals.s.sfx.play('good', 0.5);
  modals.afterChoice();
}

/** Seconds the dialog takes to open from its middle. */
const OPEN = 0.16;
/** The picture under the title: the height of its window. */
const PIC = 34;
/** Seconds between one choice sliding in and the next. */
const CHOICE_GAP = 0.1;

/** A click or a key while a decision is coming in: all of it is there at once. */
export function skipEvent(modals: Modals) {
  modals.evAt = modals.ui.time - 60;
}

/**
 * A decision, as a page of a storybook: the dialog opens from its middle; under the title a picture
 * of what it is about, alive in a window of deep space; the story comes in word by word, each word
 * fading up out of the dark (`storyText.ts`), a phrase of it in gold on a slow ripple; then the
 * choices slide in from the left one after another. The outcome comes in the same way. A click, a
 * number, Space or Enter while it comes brings all of it, and answers nothing unseen.
 */
export function event(modals: Modals, g: Ctx, promptId: number) {
  const p = modals.g.prompts.find((x) => x.id === promptId);
  const ev = p ? EVENT_BY_ID[p.event] : null;
  if (!p || !ev) {
    modals.s.modal = null;
    return;
  }
  const w = Math.min(modals.hud.W - 16, 300);
  const inner = w - 16;
  const f = modals.g.player;
  const storyH = richLines(ev.text, inner) * 10;
  const ctx = { node: p.node, unit: p.unit };
  const done = modals.result && modals.result.promptId === promptId;
  const resultH = done ? richLines(modals.result!.text, inner) * 10 : 0;
  // (A hint that depends on the house and the place, such as which ship an offering takes.)
  const hints = ev.choices.map((c) => c.hintFor?.(modals.g, f, ctx) ?? c.hint);
  // What each choice touches, as pictures at the right of its row.
  const subs = ev.choices.map((c) => c.icons ?? subjectsIn(c.hint));
  const look: Look = { color: f.color, scale: 2, turn: true };
  const subSize = subs.map((s) => subjectsSize(s, look));
  const subW = subSize.map((z) => (z.w ? z.w + 8 : 0));
  // A row is at least as tall as its pictures (a turning Dreadnought needs room).
  const choiceH = ev.choices.map((_c, i) => Math.max(14 + richLines(hints[i], inner - 8 - subW[i]) * 10, subSize[i].h + 6));
  const h = 30 + PIC + 4 + storyH + 6 + (done ? resultH + 26 : choiceH.reduce((a, b) => a + b + 3, 0)) + 4;
  // The moment this decision (or its outcome) began to come in.
  const key = `${promptId}:${done ? 1 : 0}`;
  if (modals.evKey !== key) {
    modals.evKey = key;
    modals.evAt = modals.ui.time;
    modals.evPrev = -1;
  }
  const t = modals.ui.time - modals.evAt;
  const open = done ? 0 : OPEN;
  const W = modals.hud.W;
  const H = modals.hud.H;
  g.save();
  if (t < open) {
    // Opening from its middle, top and bottom, in steps.
    const ch = Math.max(4, Math.round((Math.min(h, H - 8) + 4) * (Math.ceil((t / open) * 4) / 4)));
    g.beginPath();
    g.rect(0, Math.round(H / 2 - ch / 2), W, ch);
    g.clip();
  }
  const { x, y } = modals.frame(g, w, h, ev.title.toUpperCase(), PAL.violet);
  const where = p.node >= 0 ? modals.g.nodes[p.node].name.toUpperCase() : '';
  textCenter(g, ev.kind === 'anomaly' ? `ANOMALY AT ${where}` : 'A VISITOR AT YOUR HEARTH', x + w / 2, y + 16, PAL.dusk, 'tiny');
  let ly = y + 26;
  // The picture: what the decision is about (what its choices touch), alive in a window of deep space.
  const seen = [...new Set(subs.flat())].slice(0, 3);
  starWindow(g, x + 8, ly, inner, PIC, promptId * 31, modals.ui.time, true);
  if (seen.length) drawSubjects(g, seen, x + 8 + inner / 2, ly, PIC, { ...look, t: modals.ui.time, lively: true }, 'center');
  box(g, x + 8, ly, inner, PIC, null, PAL.violet);
  ly += PIC + 4;
  // The story, word by word.
  const words = wordCount(ev.text, inner);
  const storyAt = done ? Infinity : t - open;
  const story = drawStory(g, ev.text, x + 8, ly, inner, storyAt, modals.ui.time, { body: PAL.mist });
  const storyTerms = termsIn(ev.text);
  if (storyTerms.length) modals.ui.hint('ev-story', x + 8, ly - 1, inner, story.y - ly + 1, { terms: storyTerms });
  ly = story.y + 6;
  if (!done) storySounds(modals, story.shown);
  if (done) {
    // The outcome, the same way, in gold; then CONTINUE.
    rect(g, x + 8, ly - 3, inner, 1, PAL.indigo);
    const out = drawStory(g, modals.result!.text, x + 8, ly + 2, inner, t, modals.ui.time, { body: PAL.gold });
    storySounds(modals, out.shown);
    modals.evDone = t >= storyEnd(wordCount(modals.result!.text, inner), 0);
    if (modals.evDone) modals.ui.button(g, 'ev-ok', x + w / 2 - 34, out.y + 6, 68, 13, 'CONTINUE', () => modals.close(), { primary: true });
    else modals.ui.add({ id: 'ev-skip', x, y, w, h, onClick: () => skipEvent(modals) });
    g.restore();
    return;
  }
  // The choices: once the story is all there, sliding in from the left one after another.
  const cFrom = storyEnd(words, open) + 0.08;
  ev.choices.forEach((c, i) => {
    const age = t - (cFrom + i * CHOICE_GAP);
    if (age < 0) return;
    const ok = !c.cond || c.cond(modals.g, f, ctx);
    const hh = choiceH[i];
    const id = 'choice-' + i;
    const hot = modals.ui.isHot(id) && ok;
    const cx = x + 8 + (age < 0.12 ? [-24, -12, -4][Math.floor(age / 0.04)] : 0);
    box(g, cx, ly, inner, hh, hot ? PAL.indigo : PAL.night, ok ? (hot ? PAL.bone : PAL.slate) : PAL.indigo);
    text(g, `${i + 1}. ${c.label}`, cx + 4, ly + 3, ok ? PAL.bone : PAL.slate);
    const dim = PAL.indigo;
    drawRich(g, hints[i], cx + 4, ly + 13, inner - 8 - subW[i], ok ? { body: PAL.dusk } : { body: dim, gain: dim, loss: dim, kw: dim });
    if (subs[i].length) {
      // Alive while it can be chosen (livelier under the pointer); dim and still when it cannot.
      g.globalAlpha = ok ? 1 : 0.3;
      drawSubjects(g, subs[i], cx + inner - 6, ly + 3, hh - 6, ok ? { ...look, t: modals.ui.time, lively: hot } : look, 'right');
      g.globalAlpha = 1;
    }
    if (modals.evDone) modals.ui.add({ id, x: x + 8, y: ly, w: inner, h: hh, onClick: () => resolve(modals, promptId, i), disabled: !ok, tip: ok ? undefined : (c.why?.(modals.g, f, ctx) ?? 'You cannot afford this right now.'), terms: termsIn(c.hint) });
    ly += hh + 3;
  });
  modals.evDone = t >= cFrom + (ev.choices.length - 1) * CHOICE_GAP + 0.15;
  // (While it comes in, a click anywhere on it brings all of it.)
  if (!modals.evDone) modals.ui.add({ id: 'ev-skip', x, y, w, h, onClick: () => skipEvent(modals) });
  modals.closeButton(g, x, y, w);
  g.restore();
}

/** The sound of a story coming in: a soft tick every third word. */
function storySounds(modals: Modals, shown: number) {
  const prev = modals.evPrev;
  modals.evPrev = shown;
  if (shown < 0 || shown <= prev) return;
  if (Math.floor(shown / 3) !== Math.floor(prev / 3)) modals.s.sfx.play('tick', 0.2);
}

export function ability(modals: Modals, g: Ctx, unitId: number) {
  const u = modals.g.units.get(unitId);
  if (!u || u.dead || !u.pendingAbil.length) {
    modals.s.modal = null;
    return;
  }
  const choices = u.pendingAbil[0];
  const w = Math.min(modals.hud.W - 16, 260);
  const inner = w - 16;
  const color = modals.g.player.color;
  // Who each ability acts on: allies, enemies, or (when its text names nobody) the ship itself.
  const subs = choices.map((id) => {
    const s = subjectsIn(ABILITY_BY_ID[id].desc).filter((k) => k !== 'world');
    return s.length ? s : [u.type as string];
  });
  const look: Look = { color, scale: 2, turn: true };
  const subSize = subs.map((s) => subjectsSize(s, look));
  const subW = subSize.map((z) => z.w + 8);
  const hs = choices.map((id, i) => Math.max(14 + richLines(ABILITY_BY_ID[id].desc, inner - 8 - subW[i]) * 10, subSize[i].h + 6));
  const h = 30 + hs.reduce((a, b) => a + b + 3, 0) + 4;
  const { x, y } = modals.frame(g, w, h, `${UNITS[u.type].name.toUpperCase()} · LEVEL ${u.level}`);
  textCenter(g, 'Choose a new ability. It triggers by itself in battle.', x + w / 2, y + 16, PAL.dusk, 'tiny');
  let ly = y + 26;
  choices.forEach((id, i) => {
    const a = ABILITY_BY_ID[id];
    const hid = 'ab-' + i;
    const hot = modals.ui.isHot(hid);
    box(g, x + 8, ly, inner, hs[i], hot ? PAL.indigo : PAL.night, hot ? PAL.bone : PAL.slate);
    text(g, a.name, x + 12, ly + 3, a.color);
    drawRich(g, a.desc, x + 12, ly + 13, inner - 8 - subW[i]);
    drawSubjects(g, subs[i], x + 8 + inner - 6, ly + 3, hs[i] - 6, { ...look, t: modals.ui.time, lively: hot }, 'right');
    modals.ui.add({
      id: hid, x: x + 8, y: ly, w: inner, h: hs[i], terms: termsIn(a.desc, { exclude: a.name }),
      onClick: () => {
        if (modals.g.cmdChooseAbility(modals.g.playerId, u.id, id)) {
          modals.s.sfx.play('ability', 0.6);
          if (!u.pendingAbil.length) modals.s.modal = null;
          else modals.afterChoice();
        }
      },
    });
    ly += hs[i] + 3;
  });
}
