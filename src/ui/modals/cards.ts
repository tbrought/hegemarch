/**
 * The cards a run shows once: the Destinies and the end of the First Night, the omens at the start of
 * a run among the stars, the cradle at the start of an Ages run, and the Ark's leaving it.
 */

import { describePassage } from '../../game/ages';
import { AMBITION_BY_ID } from '../../game/data/ambitions';
import { ERAS, LAST_CRADLE_ERA } from '../../game/data/eras';
import { TRAIT_BY_ID } from '../../game/data/traits';
import { VICTORIES } from '../../game/data/victories';
import { fit, setVocabulary, text, textCenter, textWidth, wrap } from '../../render/font';
import { PAL } from '../../render/palette';
import { box, line, rect, ring, type Ctx } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { drawRich, richLines } from '../../render/rich';
import { icon } from '../../render/sprites';
import { fmt } from '../format';
import { gloss, termsIn } from '../glossary';
import { starWindow } from '../subjects';
import type { Modals } from '../Modals';
import { OMENS, omensPlan } from './omensPlan';
import { sparkle, sparkles } from './pixelFx';

/**
 * The Destinies of the run. They are a list, each on its own line with OR between them, and the
 * heading says that none has to be picked. (As three cards side by side, like the Boons on offer,
 * they were taken for a choice of one.)
 */
export function destinies(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const vs = modals.g.victories;
  const w = Math.min(W - 12, 300);
  const inner = w - 44;
  const rows = vs.map((v) => wrap(VICTORIES[v].desc, inner, 'main').slice(0, 5));
  const rowH = (i: number) => 13 + rows[i].length * 10;
  const h = 31 + rows.reduce((a, _r, i) => a + rowH(i), 0) + (vs.length - 1) * 9 + 21;
  const { x, y } = modals.frame(g, w, h, 'HOW THIS RUN CAN BE WON');
  textCenter(g, 'You do not choose one. Reach any one of these and the crown is yours.', x + w / 2, y + 16, PAL.dusk, 'tiny');
  let ly = y + 28;
  vs.forEach((v, i) => {
    const d = VICTORIES[v];
    if (i) {
      rect(g, x + 10, ly + 2, w - 20, 1, PAL.indigo);
      const ow = textWidth('OR', 'tiny') + 8;
      rect(g, Math.round(x + w / 2 - ow / 2), ly, ow, 6, PAL.night);
      textCenter(g, 'OR', x + w / 2, ly, PAL.dusk, 'tiny');
      ly += 9;
    }
    // Big icon (2x)
    const tmp = document.createElement('canvas');
    tmp.width = 5;
    tmp.height = 7;
    const tg = tmp.getContext('2d')!;
    icon(tg, v, 0, 0);
    g.drawImage(tmp, x + 12, ly + 1, 10, 14);
    text(g, d.name.toUpperCase(), x + 32, ly, PAL.gold);
    rows[i].forEach((l, k) => text(g, l, x + 32, ly + 11 + k * 10, PAL.mist));
    modals.ui.add({ id: 'dest-card-' + i, x: x + 6, y: ly - 2, w: w - 12, h: rowH(i), terms: termsIn(d.desc, { exclude: d.name, max: 4 }), termsBeside: true });
    ly += rowH(i);
  });
  const label = modals.hud.tutorial.busy() ? 'BEGIN' : 'OK';
  modals.ui.button(g, 'dest-begin', x + w / 2 - 34, y + h - 17, 68, 13, label, () => modals.close(), { primary: true, pulse: true });
}

export function nightDone(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const w = Math.min(W - 16, 290);
  const inner = w - 20;
  const paras: [string, string][] = [
    ['That was the whole guide. You can kindle worlds, build ships, choose Boons, fight off raiders and send out Scouts.', PAL.mist],
    ['Go back to the menu to start a run of your own, or keep playing this one. It is saved either way: CONTINUE on the menu picks it up.', PAL.mist],
    ['A small box on the right names a goal to try next: roles, levels, a fleet, your first capture. Tips still pop up the first time something ' +
        'new happens, and the game waits while you read them.', PAL.dusk],
  ];
  const blocks = paras.map(([t, c]) => ({ lines: wrap(t, inner, 'main'), c }));
  const h = 22 + blocks.reduce((a, b) => a + b.lines.length * 10 + 5, 0) + 20;
  const { x, y } = modals.frame(g, w, h, 'THE FIRST NIGHT IS COMPLETE');
  let ly = y + 18;
  for (const b of blocks) {
    for (const l of b.lines) {
      text(g, l, x + 10, ly, b.c);
      ly += 10;
    }
    ly += 5;
  }
  const bw = Math.min(90, (w - 30) / 2);
  modals.ui.button(g, 'nd-menu', x + w / 2 - bw - 3, y + h - 17, bw, 13, 'MAIN MENU', () => modals.s.hooks.quit(true), {
    primary: true, pulse: true, tip: 'Back to the title screen to start a new run. This one is saved: CONTINUE picks it up.',
  });
  modals.ui.button(g, 'nd-keep', x + w / 2 + 3, y + h - 17, bw, 13, 'KEEP PLAYING', () => modals.close(), {
    tip: 'Play this run on: it is a whole game, and every Destiny is still open.',
  });
}

export function cradleCard(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const w = Math.min(W - 8, 340);
  const inner = w - 30;
  const p = modals.g.player;
  const points: [string, string, string][] = [
    ['lore', 'CLIMB', `Your Lore is saved for the next age. When the bar at the top is full, press ADVANCE (or A): the ${ERAS[1].name} begins.`],
    ['boon', 'EVERY AGE', 'A new age brings stronger units, new things to build, and one Boon to choose. You keep those Boons for the whole run.'],
    ['ascension', 'THE ARK', `After the ${ERAS[LAST_CRADLE_ERA].name} you build your Ark. It carries your house to the stars, and there the crown is decided.`],
    ['conquest', 'YOUR RIVALS', 'They climb too. An Ark that leaves before yours is ahead of you out there. A Hearth you put out here never ' +
        'troubles you again.'],
  ];
  const blocks = points.map(([, , t]) => wrap(t, inner, 'main'));
  // (On the smallest screens the opening line makes way for the four points.)
  const room = modals.hud.H - 8;
  let lead = wrap(`Every house begins here, as a tribe of the Stone Age, all on one planet. You lead the ${p.name}.`, w - 20, 'main');
  const size = () => 20 + (lead.length ? lead.length * 10 + 6 : 0) + blocks.reduce((a, b) => a + 12 + b.length * 10 + 4, 0) + 20;
  if (size() > room) lead = [];
  const h = size();
  const { x, y } = modals.frame(g, w, h, 'THE CRADLE', PAL.gold);
  let ly = y + 17;
  for (const l of lead) {
    text(g, l, x + 10, ly, PAL.bone);
    ly += 10;
  }
  if (lead.length) ly += 6;
  points.forEach(([ic, title], i) => {
    icon(g, ic, x + 10, ly + 1);
    text(g, title, x + 21, ly + 1, PAL.gold, 'tiny');
    ly += 10;
    for (const l of blocks[i]) {
      text(g, l, x + 21, ly, PAL.mist);
      ly += 10;
    }
    ly += 6;
  });
  modals.ui.button(g, 'cradle-begin', x + w / 2 - 34, y + h - 17, 68, 13, 'BEGIN', () => modals.close(), { primary: true });
}

export function ascendCard(modals: Modals, g: Ctx) {
  // (This card speaks of what lies ahead, in the words of the stars.)
  setVocabulary(null);
  const W = modals.hud.W;
  const w = Math.min(W - 16, 330);
  const pass = describePassage(modals.g);
  const lead = wrap(`After ${fmtTime(pass.cradleTime)} on the cradle, your Ark leaves for the stars. The crown of Hegemarch is decided out there.`, w - 20, 'main');
  const carry = wrap(
    `${pass.boons} ${pass.boons === 1 ? 'Boon' : 'Boons'} of your ages, ${fmt(pass.embers)} Embers` +
        `${pass.ships ? `, and ${pass.ships} more ${pass.ships === 1 ? 'ship' : 'ships'} for the ${pass.lands} lands you held` : ''}. Your Lore ` +
        `makes Boons again.`,
    w - 31, 'main');
  const rows = pass.rivals.map((r) => ({
    r,
    line:
      r.fate === 'ahead' ? `left ${fmtTime(r.seconds)} before you: it is ahead` : r.fate === 'fallen' ? 'its Hearth is dark: it will not follow' : (`still in the ` +
          `${ERAS[Math.min(r.era, LAST_CRADLE_ERA)].name}: it follows in about ${Math.max(1, Math.round(r.seconds / 60))} min`),
  }));
  const h = 20 + lead.length * 10 + 8 + 10 + carry.length * 10 + 8 + 10 + rows.length * 11 + 24;
  const { x, y } = modals.frame(g, w, h, 'YOUR ARK RISES', PAL.gold);
  let ly = y + 17;
  for (const l of lead) {
    text(g, l, x + 10, ly, PAL.bone);
    ly += 10;
  }
  ly += 8;
  icon(g, 'boon', x + 10, ly);
  text(g, 'YOU TAKE WITH YOU', x + 21, ly + 1, PAL.gold, 'tiny');
  ly += 10;
  for (const l of carry) {
    text(g, l, x + 21, ly, PAL.mist);
    ly += 10;
  }
  ly += 8;
  icon(g, 'conquest', x + 10, ly);
  text(g, 'YOUR RIVALS', x + 21, ly + 1, PAL.gold, 'tiny');
  ly += 10;
  for (const { r, line } of rows) {
    rect(g, x + 21, ly + 1, 5, 5, r.fate === 'fallen' ? PAL.slate : r.color);
    const ex = text(g, r.name, x + 30, ly, r.fate === 'fallen' ? PAL.slate : r.color);
    text(g, fit(line, x + w - 10 - ex - 6, 'tiny'), ex + 6, ly + 1, r.fate === 'ahead' ? PAL.ember : PAL.dusk, 'tiny');
    ly += 11;
  }
  modals.ui.button(g, 'ascend-go', x + w / 2 - 46, y + h - 18, 92, 14, 'TO THE STARS', () => modals.s.hooks.ascend?.(), { primary: true, pulse: true });
}

/** The window of the sector's sky above the omens: its height. */
const SKY = 34;

/** A click or a key while the omens come in: all of them are there at once. */
export function skipOmens(modals: Modals) {
  modals.omAt = modals.ui.time - 60;
}

/**
 * The omens over the sector at the start of a run, and the player's Ambition, last. Above them a window
 * of the sector's sky: a star lights for each omen in turn, joined to the last by a line, as its omen
 * fades up below; the Ambition's star lights last, in gold, with a flash. A click or a key brings all
 * of it at once; what it says is explained (pointed at) once it is there. On a screen too small for
 * the sky, the omens come in the same way without it.
 */
export function omens(modals: Modals, g: Ctx) {
  const W = modals.hud.W;
  const w = Math.min(W - 16, 300);
  const inner = w - 16;
  const traits = modals.g.traits.map((t) => TRAIT_BY_ID[t]).filter(Boolean);
  const amb = AMBITION_BY_ID[modals.g.ambition];
  const blocks = traits.map((t) => richLines(t.desc, inner - 8));
  const ambLines = amb ? wrap(`${amb.desc} (+${amb.reward} Legacy)`, inner - 8, 'main') : [];
  const body = 30 + blocks.reduce((a, b) => a + 16 + b * 10, 0) + (amb ? 22 + ambLines.length * 10 : 0) + 22;
  const sky = body + SKY + 4 <= modals.hud.H - 8 ? SKY + 4 : 0;
  const h = body + sky;
  const m = modals.s.modal;
  if (modals.omFor !== m) {
    modals.omFor = m;
    modals.omAt = modals.ui.time;
    modals.omPrev = -1;
  }
  const t = modals.ui.time - modals.omAt;
  const plan = omensPlan(traits.length, !!amb);
  const done = t >= plan.end;
  modals.omDone = done;
  // A note as each star lights; a sting for the Ambition. (None once skipped.)
  const cue = (k: number, id: 'deal' | 'rare', vol: number) => {
    if (modals.omPrev < k && !done) {
      modals.omPrev = k;
      modals.s.sfx.play(id, vol);
    }
  };
  const { x, y } = modals.frame(g, w, h, 'OMENS OVER THE SECTOR', PAL.violet);
  textCenter(g, 'Every run, the sector is a little different.', x + w / 2, y + 16, PAL.dusk, 'tiny');
  let ly = y + 26;
  const when = [...plan.at, ...(amb ? [plan.ambAt] : [])];
  when.forEach((at, i) => {
    if (t >= at) cue(i, amb && i === when.length - 1 ? 'rare' : 'deal', amb && i === when.length - 1 ? 0.5 : 0.4);
  });
  if (sky) {
    // The sky: stars light one by one, joined into a figure; the Ambition's last, in gold.
    const wx = x + 8;
    starWindow(g, wx, ly, inner, SKY, 7, modals.ui.time, true);
    g.save();
    g.beginPath();
    g.rect(wx + 1, ly + 1, inner - 2, SKY - 2);
    g.clip();
    const n = traits.length;
    const span = amb ? 0.58 : 0.72;
    const stars = traits.map((_, i) => ({ x: Math.round(wx + inner * (n > 1 ? 0.14 + (span * i) / (n - 1) : 0.3)), y: ly + (i % 2 ? 24 : 11) }));
    if (amb) stars.push({ x: Math.round(wx + inner * 0.86), y: ly + 16 });
    stars.forEach((p, i) => {
      const age = t - when[i];
      const gold = !!amb && i === stars.length - 1;
      const col = gold ? PAL.gold : PAL.violet;
      if (i > 0 && age >= 0) {
        const q = stars[i - 1];
        const k = Math.min(1, age / OMENS.LINE);
        line(g, q.x, q.y, Math.round(q.x + (p.x - q.x) * k), Math.round(q.y + (p.y - q.y) * k), gold ? PAL.gold : PAL.indigo, 2);
      }
      if (age < 0) return;
      if (age < OMENS.LIGHT) ring(g, p.x, p.y, Math.max(2, Math.round(12 * (1 - age / OMENS.LIGHT))), col, 1);
      else if (gold && age < OMENS.LIGHT + 0.06) rect(g, wx + 1, ly + 1, inner - 2, SKY - 2, PAL.gold);
      else sparkle(g, p.x, p.y, age < OMENS.LIGHT + 0.2 ? 3 : 1 + (Math.floor(modals.ui.time * 2 + i) % 2), col);
    });
    g.restore();
    box(g, wx, ly, inner, SKY, null, PAL.violet);
    ly += sky;
  }
  const a0 = g.globalAlpha;
  traits.forEach((tr, i) => {
    const top = ly;
    const age = t - plan.at[i];
    if (age >= 0) {
      g.globalAlpha = a0 * Math.min(1, age / OMENS.FADE);
      icon(g, 'star', x + 8, top);
      text(g, tr.name.toUpperCase(), x + 16, top, PAL.violet);
      drawRich(g, tr.desc, x + 16, top + 11, inner - 8);
      g.globalAlpha = a0;
    }
    ly += 16 + blocks[i] * 10;
    if (done) modals.ui.hint('om-' + tr.id, x + 8, top, inner, ly - top - 8, { terms: [...gloss('omen'), ...termsIn(tr.desc, { max: 2 })] });
  });
  if (amb) {
    const age = t - plan.ambAt;
    const head = `YOUR AMBITION: ${amb.name.toUpperCase()}`;
    rect(g, x + 8, ly, inner, 1, age >= 0 ? PAL.gold : PAL.indigo);
    ly += 5;
    if (age >= 0) {
      g.globalAlpha = a0 * Math.min(1, age / OMENS.FADE);
      text(g, head, x + 8, ly, PAL.gold);
      ambLines.forEach((l, k) => text(g, l, x + 16, ly + 11 + k * 10, PAL.mist));
      g.globalAlpha = a0;
      if (age < 0.8) sparkles(g, x + 6, ly - 2, textWidth(head) + 4, 10, age - 0.1, 2, PAL.gold);
    }
    if (done) modals.ui.hint('om-amb', x + 8, ly - 1, inner, 11 + ambLines.length * 10, { terms: [...termsIn(amb.desc, { max: 2 }), ...gloss('ambition', 'legacy')] });
  }
  modals.ui.button(g, 'omens-begin', x + w / 2 - 34, y + h - 17, 68, 13, 'BEGIN', () => modals.close(), { primary: true });
  // (While they come in, a click anywhere on the card brings all of it; BEGIN takes the next.)
  if (!done) modals.ui.add({ id: 'om-skip', x, y, w, h, onClick: () => skipOmens(modals) });
}
