/**
 * Decisions: an event (an anomaly a ship has reached, a visitor at the Hearth) with its choices and its
 * outcome, and the ability a ship learns when it has risen a level.
 */

import { ABILITY_BY_ID } from '../../game/data/abilities';
import { EVENT_BY_ID } from '../../game/data/events';
import { UNITS } from '../../game/data/units';
import { text, textCenter, wrap } from '../../render/font';
import { PAL } from '../../render/palette';
import { box, rect, type Ctx } from '../../render/pixel';
import { drawRich, richLines } from '../../render/rich';
import { termsIn } from '../glossary';
import { drawSubjects, subjectsIn, subjectsSize, type Look } from '../subjects';
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
  const textLines = wrap(ev.text, inner, 'main');
  const ctx = { node: p.node, unit: p.unit };
  const done = modals.result && modals.result.promptId === promptId;
  const resultLines = done ? wrap(modals.result!.text, inner, 'main') : [];
  // (A hint that depends on the house and the place, such as which ship an offering takes.)
  const hints = ev.choices.map((c) => c.hintFor?.(modals.g, f, ctx) ?? c.hint);
  // What each choice touches, as pictures at the right of its row.
  const subs = ev.choices.map((c) => c.icons ?? subjectsIn(c.hint));
  const look: Look = { color: f.color, scale: 2, turn: true };
  const subSize = subs.map((s) => subjectsSize(s, look));
  const subW = subSize.map((z) => (z.w ? z.w + 8 : 0));
  // A row is at least as tall as its pictures (a turning Dreadnought needs room).
  const choiceH = ev.choices.map((_c, i) => Math.max(14 + richLines(hints[i], inner - 8 - subW[i]) * 10, subSize[i].h + 6));
  const h = 30 + textLines.length * 10 + 6 + (done ? resultLines.length * 10 + 26 : choiceH.reduce((a, b) => a + b + 3, 0)) + 4;
  const { x, y } = modals.frame(g, w, h, ev.title.toUpperCase(), PAL.violet);
  const where = p.node >= 0 ? modals.g.nodes[p.node].name.toUpperCase() : '';
  textCenter(g, ev.kind === 'anomaly' ? `ANOMALY AT ${where}` : 'A VISITOR AT YOUR HEARTH', x + w / 2, y + 16, PAL.dusk, 'tiny');
  let ly = y + 26;
  for (const l of textLines) {
    text(g, l, x + 8, ly, PAL.mist);
    ly += 10;
  }
  const storyTerms = termsIn(ev.text);
  if (storyTerms.length) modals.ui.hint('ev-story', x + 8, y + 25, inner, ly - y - 25, { terms: storyTerms });
  ly += 6;
  if (done) {
    rect(g, x + 8, ly - 3, inner, 1, PAL.indigo);
    for (const l of resultLines) {
      text(g, l, x + 8, ly + 2, PAL.gold);
      ly += 10;
    }
    modals.ui.button(g, 'ev-ok', x + w / 2 - 34, ly + 8, 68, 13, 'CONTINUE', () => modals.close(), { primary: true });
    return;
  }
  ev.choices.forEach((c, i) => {
    const ok = !c.cond || c.cond(modals.g, f, ctx);
    const hh = choiceH[i];
    const id = 'choice-' + i;
    const hot = modals.ui.isHot(id) && ok;
    box(g, x + 8, ly, inner, hh, hot ? PAL.indigo : PAL.night, ok ? (hot ? PAL.bone : PAL.slate) : PAL.indigo);
    text(g, `${i + 1}. ${c.label}`, x + 12, ly + 3, ok ? PAL.bone : PAL.slate);
    const dim = PAL.indigo;
    drawRich(g, hints[i], x + 12, ly + 13, inner - 8 - subW[i], ok ? { body: PAL.dusk } : { body: dim, gain: dim, loss: dim, kw: dim });
    if (subs[i].length) {
      // Alive while it can be chosen (livelier under the pointer); dim and still when it cannot.
      g.globalAlpha = ok ? 1 : 0.3;
      drawSubjects(g, subs[i], x + 8 + inner - 6, ly + 3, hh - 6, ok ? { ...look, t: modals.ui.time, lively: hot } : look, 'right');
      g.globalAlpha = 1;
    }
    modals.ui.add({ id, x: x + 8, y: ly, w: inner, h: hh, onClick: () => resolve(modals, promptId, i), disabled: !ok, tip: ok ? undefined : (c.why?.(modals.g, f, ctx) ?? 'You cannot afford this right now.'), terms: termsIn(c.hint) });
    ly += hh + 3;
  });
  modals.closeButton(g, x, y, w);
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
