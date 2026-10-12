/**
 * How near each house is to each Destiny: the chips at the top right of a run among the stars (how far,
 * how long on a clock), and on the cradle of an Ages run the ages in their place, with the step to the next.
 */

import { ERAS, LAST_CRADLE_ERA, SPACE } from '../../game/data/eras';
import { ASCENSION_BOONS, DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget, VICTORIES } from '../../game/data/victories';
import type { Faction, VictoryId } from '../../game/types';
import { IC, text, textWidth } from '../../render/font';
import { PAL, shade } from '../../render/palette';
import { bar, box, frame, rect } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { icon } from '../../render/sprites';
import { fmt, pct } from '../format';
import { termsIn } from '../glossary';
import type { Hud } from '../Hud';

export function destinyProgress(hud: Hud, f: Faction, v: VictoryId): { frac: number; label: string } {
  const g = hud.g;
  switch (v) {
    case 'conquest': {
      const rivals = g.empires().filter((e) => e.id !== f.id);
      const out = rivals.filter((e) => !e.alive).length;
      return { frac: out / Math.max(1, rivals.length), label: `${out}/${rivals.length} Hearths out` };
    }
    case 'domination': {
      const need = Math.ceil(g.worldCount * DOMINATION_SHARE);
      const have = g.worldsOf(f.id).length;
      return { frac: have / need, label: f.holdTimer > 0 ? `Holding ${Math.floor(f.holdTimer)}s` : `${have}/${need} worlds` };
    }
    case 'ascension':
      if (f.gate) return { frac: f.gate.charge / GATE_CHARGE, label: `Gate ${pct(f.gate.charge / GATE_CHARGE)}` };
      return { frac: f.boons / ASCENSION_BOONS, label: `${f.boons}/${ASCENSION_BOONS} Boons` };
    case 'relics': {
      const need = relicsRequired(g.relicTotal);
      return { frac: f.relics.length / need, label: f.relicTimer > 0 ? `Holding ${Math.floor(f.relicTimer)}s` : `${f.relics.length}/${need} relics` };
    }
    case 'treasury': {
      const need = treasuryTarget(g.config.size);
      return { frac: f.embers / need, label: f.treasuryTimer > 0 ? `Holding ${Math.floor(f.treasuryTimer)}s` : `${fmt(f.embers)}/${fmt(need)}` };
    }
    case 'crisis': {
      const c = g.crisis;
      if (!c) return { frac: 0, label: '—' };
      if (c.dead) return { frac: 1, label: 'Purged' };
      if (!c.awake) return { frac: 0, label: `Maw opens ~${fmtTime(Math.max(0, c.awakenAt))}` };
      const h = g.units.get(c.heart);
      // (While the void barrier holds, the Heart cannot really be hurt: say how long that is.)
      const barrier = h?.buffs.find((b) => b.id === 'barrier');
      if (h && barrier) return { frac: 1 - h.hp / h.maxHp, label: `Barrier ${fmtTime(Math.ceil(barrier.t))}` };
      return { frac: h ? 1 - h.hp / h.maxHp : 0, label: h ? `Heart ${pct(h.hp / h.maxHp)}` : '—' };
    }
  }
}

/**
 * What a Destiny's chip says: how far the player has got against what it takes ("14/22"), or, once
 * the Destiny is on the clock, the time left on it ("1:42"). (It said a bare percentage, and the
 * target and the time had to be read from its tooltip and remembered.)
 */
export function chipText(hud: Hud, f: Faction, v: VictoryId): { text: string; clock: boolean } {
  const g = hud.g;
  const left = (s: number) => ({ text: fmtTime(Math.max(0, s)), clock: true });
  switch (v) {
    case 'conquest': {
      const rivals = g.empires().filter((e) => e.id !== f.id);
      return { text: `${rivals.filter((e) => !e.alive).length}/${rivals.length}`, clock: false };
    }
    case 'domination':
      if (f.holdTimer > 0) return left(DOMINATION_HOLD - f.holdTimer);
      return { text: `${g.worldsOf(f.id).length}/${Math.ceil(g.worldCount * DOMINATION_SHARE)}`, clock: false };
    case 'ascension':
      if (f.gate) return left(GATE_CHARGE - f.gate.charge);
      return { text: `${f.boons}/${ASCENSION_BOONS}`, clock: false };
    case 'relics':
      if (f.relicTimer > 0) return left(RELIC_HOLD - f.relicTimer);
      return { text: `${f.relics.length}/${relicsRequired(g.relicTotal)}`, clock: false };
    case 'treasury':
      if (f.treasuryTimer > 0) return left(TREASURY_HOLD - f.treasuryTimer);
      return { text: pct(f.embers / treasuryTarget(g.config.size)), clock: false };
    case 'crisis': {
      const c = g.crisis;
      if (!c || !c.awake) return { text: '—', clock: false };
      if (c.dead) return { text: 'DONE', clock: false };
      const h = g.units.get(c.heart);
      const barrier = h?.buffs.find((b) => b.id === 'barrier');
      if (barrier) return left(Math.ceil(barrier.t));
      return { text: h ? pct(1 - h.hp / h.maxHp) : '—', clock: false };
    }
  }
  return { text: '', clock: false };
}

export function drawDestinies(hud: Hud) {
  const g = hud.s.screen.g;
  const vs = hud.g.victories;
  const y = 16;
  const p = hud.g.player;
  // (A chip is as wide as what it says: "14/22", or the time left once its Destiny is on the clock.)
  const chips = vs.map((v) => ({ v, pr: destinyProgress(hud, p, v), ...chipText(hud, p, v) }));
  const widths = chips.map((c) => Math.max(22, 12 + textWidth(c.text, 'tiny')));
  let x = hud.W - 3 - widths.reduce((a, w) => a + w + 2, 0) + 2;
  chips.forEach(({ v, pr, text: label, clock }, i) => {
    const cw = widths[i];
    const id = 'dest-' + v;
    const hot = hud.ui.isHot(id);
    box(g, x, y, cw, 12, PAL.night, hot ? PAL.dusk : clock ? PAL.gold : PAL.indigo);
    icon(g, v, x + 2, y + 2);
    const k = Math.max(0, Math.min(1, pr.frac));
    const bw = cw - 11;
    rect(g, x + 9, y + 8, bw, 2, PAL.indigo);
    if (k > 0) rect(g, x + 9, y + 8, Math.max(1, Math.round(bw * k)), 2, k >= 1 ? PAL.teal : PAL.gold);
    text(g, label, x + 9, y + 2, clock ? PAL.gold : PAL.mist, 'tiny');
    hud.ui.hit(id, x, y, cw, 12, () => hud.modals.open({ kind: 'status' }), () => `${VICTORIES[v].name}: ${VICTORIES[v].short} (${pr.label}). Click for details.`, undefined, {
      terms: termsIn(VICTORIES[v].desc, { exclude: VICTORIES[v].name, max: 2 }),
    });
    x += cw + 2;
  });
}

/** What the step to the next age takes and brings (for its buttons). */
export function advanceTip(hud: Hud): string {
  const p = hud.g.player;
  const era = ERAS[p.era];
  const why = hud.g.checkAdvance(p.id);
  const needs = `It takes [${era.lore} Lore] (you have ${Math.floor(p.lore)}), [${era.cost} Embers] and ${era.time} seconds at your Hearth. The work stops while the Hearth is under attack.`;
  const no = why ? ` [!${why}.]` : '';
  if (p.era >= LAST_CRADLE_ERA) return `Build your Ark. When it is done it leaves for the stars with your house, and the run goes on there. ${needs}${no} (A)`;
  return `Begin the ${ERAS[p.era + 1].name}. ${ERAS[p.era + 1].brings} ${needs}${no} (A)`;
}

/** The top bar on the cradle: the Lore of the age, and the step to the next one. Returns the x after it. */
export function drawAge(hud: Hud, x: number): number {
  const g = hud.s.screen.g;
  const game = hud.g;
  const p = game.player;
  icon(g, 'lore', x, 3);
  x += 7;
  if (p.pendingDrafts > 0) {
    const label = p.pendingDrafts > 1 ? `BOON ×${p.pendingDrafts}` : 'BOON';
    hud.ui.button(g, 'boon', x, 1, textWidth(label, 'tiny') + 12, 11, label, () => hud.modals.open({ kind: 'draft' }), {
      primary: true, pulse: true, font: 'tiny', tip: 'A Boon is ready: every new age brings one. Choose one of a few upgrades for your house. (B)',
    });
    x += textWidth(label, 'tiny') + 15;
  }
  if (p.era >= SPACE) return x;
  const era = ERAS[p.era];
  const last = p.era >= LAST_CRADLE_ERA;
  if (p.advance) {
    // The step is under way.
    const k = p.advance.t / p.advance.total;
    const held = p.capital >= 0 && game.nodes[p.capital].lastHit < 5;
    const c = held ? PAL.red : PAL.teal;
    bar(g, x + 1, 5, 36, 3, k, c, PAL.indigo, PAL.indigo);
    const ex = text(g, `${last ? 'THE ARK' : ERAS[p.era + 1].short + ' AGE'} ${pct(k)}`, x + 41, 4, c, 'tiny');
    hud.ui.hit('age', x - 8, 0, ex - x + 10, 13, undefined, () =>
      held
        ? 'The work stands still while your Hearth is under attack. Drive the attackers off.'
        : `${last ? 'Your Ark' : `The ${ERAS[p.era + 1].name}`}: ${Math.ceil(p.advance!.total - p.advance!.t)} seconds to go. An attack on your Hearth stops the work.`);
    return ex + 6;
  }
  if (p.lore < era.lore) {
    bar(g, x + 1, 5, 36, 3, p.lore / era.lore, PAL.violet, PAL.indigo, PAL.indigo);
    const ex = text(g, era.short + ' AGE', x + 41, 4, PAL.dusk, 'tiny');
    hud.ui.hit('age', x - 8, 0, ex - x + 10, 13, undefined, () =>
      `${era.name}. Lore: ${Math.floor(p.lore)} / ${era.lore} (+${p.loreRate.toFixed(2)}/s). On the cradle your Lore is saved for the next age: when the bar is full, ${last ? 'you can build your Ark' : `you can begin the ${ERAS[p.era + 1].name}`}. Observatories make Lore faster.`);
    return ex + 6;
  }
  // The Lore of the age is gathered: the step is an order, never automatic.
  const why = game.checkAdvance(p.id);
  const label = last ? 'BUILD THE ARK' : `TO THE ${ERAS[p.era + 1].short} AGE`;
  const cost = `${IC.ember}${era.cost}`;
  const bw = textWidth(label, 'tiny') + textWidth(cost, 'tiny') + 16;
  hud.ui.button(g, 'advance', x, 1, bw, 11, label, () => hud.actions.advance(), {
    primary: !why, pulse: !why, disabled: !!why, right: cost, font: 'tiny', tip: advanceTip(hud),
  });
  return x + bw + 4;
}

/** The race up the ages: every house and the age it has reached, in the corner where the Destinies sit among the stars. */
export function drawAges(hud: Hud) {
  const g = hud.s.screen.g;
  const game = hud.g;
  const houses = game.empires();
  const rowH = 8;
  const w = 34;
  const h = houses.length * rowH + 3;
  const x = hud.W - 3 - w;
  const y = 16;
  const hot = hud.ui.isHot('ages');
  box(g, x, y, w, h, PAL.night, hot ? PAL.dusk : PAL.indigo);
  const blink = Math.floor(hud.ui.time * 3) % 2 === 0;
  houses.forEach((f, i) => {
    const ry = y + 2 + i * rowH;
    const gone = f.launchedAt >= 0;
    const dead = !f.alive && !gone;
    rect(g, x + 3, ry + 1, 5, 5, dead ? PAL.slate : f.color);
    if (f.isPlayer) frame(g, x + 2, ry, 7, 7, PAL.bone);
    for (let k = 0; k < LAST_CRADLE_ERA + 1; k++) {
      // One pip per age reached after the Stone Age, and the last for the Ark.
      const reached = gone || f.era > k;
      const rising = !gone && !dead && !!f.advance && f.era === k && (f.isPlayer || k === LAST_CRADLE_ERA);
      const c = dead ? PAL.indigo : reached ? (gone ? PAL.gold : f.color) : rising && blink ? shade(f.color) : PAL.indigo;
      rect(g, x + 11 + k * 4, ry + 1, 3, 5, c);
    }
    if (dead) rect(g, x + 2, ry + 3, w - 5, 1, PAL.slate);
  });
  hud.ui.hit('ages', x, y, w, h, () => hud.modals.open({ kind: 'status' }), () =>
    'The climb: ' +
    houses
      .map((f) => `${f.isPlayer ? 'you' : hud.g.shortName(f)}: ${f.launchedAt >= 0 ? 'gone to the stars' : !f.alive ? 'Hearth dark' : ERAS[f.era].name + (f.advance && f.era >= LAST_CRADLE_ERA ? ', building its Ark' : '')}`)
      .join(' · ') +
    '. Click for details.');
}

/**
 * The houses that are on the clock for a Destiny right now, soonest first: holding 60% of the worlds,
 * holding the relics, holding the hoard, charging the Gate. Each is a countdown on screen, the
 * player's own and, more to the point, a rival's that has to be broken in time.
 */
export function destinyClocks(hud: Hud): { id: string; left: number; mine: boolean; text: string; tip: string; node: number }[] {
  const g = hud.g;
  const out: { id: string; left: number; mine: boolean; text: string; tip: string; node: number }[] = [];
  const has = (v: VictoryId) => g.victories.includes(v);
  for (const f of g.aliveEmpires()) {
    const mine = f.id === g.playerId;
    const add = (v: VictoryId, left: number, own: string, rival: string, node: number) => {
      const name = VICTORIES[v].name.toUpperCase();
      out.push({
        id: `clock-${f.id}-${v}`, left: Math.max(0, left), mine, node,
        text: mine ? `${name} · YOURS IN ${fmtTime(Math.max(0, left))}` : `${g.shortName(f).toUpperCase()} · ${name} IN ${fmtTime(Math.max(0, left))}`,
        tip: mine ? own : `${f.name} win by ${VICTORIES[v].name} when this runs out. ${rival}`,
      });
    };
    if (has('domination') && f.holdTimer > 0) add('domination', DOMINATION_HOLD - f.holdTimer, `You hold ${Math.round(DOMINATION_SHARE * 100)}% of all worlds. Keep them until this runs out and the crown is yours.`, 'Take worlds from them, or kindle more of your own, to break their hold.', f.capital);
    if (has('relics') && f.relicTimer > 0) add('relics', RELIC_HOLD - f.relicTimer, 'You hold most of the relics. Keep your Hearth until this runs out and the crown is yours.', 'Take their Hearth: its relics go to whoever takes it.', f.capital);
    if (has('treasury') && f.treasuryTimer > 0) add('treasury', TREASURY_HOLD - f.treasuryTimer, 'Your hoard is full. Keep it until this runs out and the crown is yours.', 'Take their worlds: each one seizes part of their hoard.', f.capital);
    if (has('ascension') && f.gate) add('ascension', GATE_CHARGE - f.gate.charge, 'Your Starfire Gate is charging. Protect it until this runs out and the crown is yours.', 'Destroy their Starfire Gate before it is charged.', f.gate.node);
  }
  return out.sort((a, b) => a.left - b.left);
}
