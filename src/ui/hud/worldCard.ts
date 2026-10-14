/**
 * The card of a place: a world of the player's (its role, what it earns, what it builds, the Hearth's
 * projects), a rival's world, a dark one, a star, an anomaly, a vault, the Corsairs' base, the Maw.
 */

import { FIELD_GUARD, HOLD_FIELD } from '../../game/constants';
import { ERAS, LAST_CRADLE_ERA, LINE_SHORT, SPACE } from '../../game/data/eras';
import { RELIC_BY_ID } from '../../game/data/relics';
import { fights, UNITS } from '../../game/data/units';
import { ASCENSION_BOONS, GATE_CHARGE } from '../../game/data/victories';
import { burning, STARFALL_BUILD, STARFALL_FUSE, STARFALL_STEP } from '../../game/starfall';
import { ECON, PLANETS, ROLE_ORDER, ROLES } from '../../game/data/worlds';
import type { GNode, UnitType } from '../../game/types';
import { roman } from '../../game/util';
import { fit, IC, text, textWidth } from '../../render/font';
import { PAL } from '../../render/palette';
import { bar, box, rect } from '../../render/pixel';
import { fmtTime } from '../../render/Renderer';
import { icon, shipSprite } from '../../render/sprites';
import { fmt, fmtRate, pct } from '../format';
import { gloss, GLOSS_BY_ID, termsIn } from '../glossary';
import { BUILD_LABELS } from '../keys';
import type { TipOpts } from '../Ui';
import { unitDesc } from '../vocab';
import { gap, header, line, para, type CardRow } from './rows';
import { advanceTip } from './destinies';
import type { Hud } from '../Hud';
import { WHY } from '../../game/commands/checks';
import { isHearth } from '../../game/worldStats';

/** What a world that suits its role gets: a Forge builds cheaper, the other roles do more. */
export const FIT_TEXT = (role: string) => (role === 'forge' ? `its ships cost [${Math.round(ECON.forgeFitDiscount * 100)}% less]` : `[+${Math.round(ECON.affinity * 100)}%] at it`);

/** A project of the Hearth (or a Starbase at any world), as a button of the world's card: see `Hud.drawProject`. */
export interface Project {
  id: string;
  label: string;
  /** What it adds, after its name: "+5". */
  plus?: string;
  cost: number;
  icon: string;
  accent: string;
  act: () => void;
  tip: string;
  dis?: string | null;
  /** It is needed now (the hangar nearly full, the Ark lost): it blinks once it can be had. */
  calls?: boolean;
  /** What it still waits for, shown in place of its price. */
  progress?: { have: number; need: number };
  /** Words in place of its price (all of it is built: "10/10"). */
  right?: string;
  /** A spark runs round it once it can be raised. */
  spark?: boolean;
}

/** What a Bastion's field does, for the tips of the cards. */
export const FIELD_TIP = `A Bastion's field covers its own world and every place one jump from it, at every level: enemy ships there take ` +
    `${HOLD_FIELD}s longer to jump away. A Bastion also protects the other worlds of its house one jump from it: they take ` +
    `${Math.round(FIELD_GUARD[1] * 100)}% less damage while it stands, ${Math.round(FIELD_GUARD[2] * 100)}% at level II, ` +
    `${Math.round(FIELD_GUARD[3] * 100)}% at level III. Two Bastions next to one world do not add up (the stronger counts), but both must fall ` +
    `before the protection is gone.`;

/** What a world's size means, for tooltips. */
function sizeTip(n: GNode): string {
  const name = { S: 'Small', M: 'Medium', L: 'Large' }[n.size] ?? n.size;
  return `${name} world: at level I it earns ${ECON.embers[n.size]} Embers a second (small 0.4, medium 0.6, large 0.8). Bigger worlds also have more hull.`;
}

/** Tooltip for a world's size and role line. */
function roleTip(hud: Hud, n: GNode): TipOpts {
  const aff = hud.g.affinityOf(n);
  const T = PLANETS[n.ptype ?? 'barren'];
  const parts = [sizeTip(n)];
  if (aff) parts.push(`${T.name} worlds suit the ${ROLES[aff].name} role${n.role === aff ? ', and this one is doing it' : ''}: ${FIT_TEXT(aff)}.`);
  return { tip: parts.join(' '), terms: gloss(...(n.role ? [n.role] : []), 'natural') };
}

export function nodeRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const p = game.player;
  const visible = hud.s.visible(n.id);
  const owner = visible ? n.owner : p.seenOwner[n.id];
  const rows: CardRow[] = [];
  const innerW = Math.min(216, Math.max(176, hud.W - 150)) - 8;
  if (n.kind !== 'planet') return siteRows(hud, n, innerW);
  const T = PLANETS[n.ptype ?? 'barren'];
  const aff = game.affinityOf(n);
  if (owner === p.id) return ownWorldRows(hud, n, innerW);
  if (owner >= 0) {
    const f = game.factions[owner];
    rows.push(header(hud, n.name.toUpperCase(), f.color, n, isHearth(n) ? 'HEARTH' : `LEVEL ${roman(n.level)}`, f.color,
      isHearth(n) ? { terms: gloss('hearth', 'fealty') } : { tip: `Level ${roman(n.level)} of III.`, terms: gloss('level') }));
    rows.push(line(hud, `${game.shortName(f).toUpperCase()} · ${n.size} WORLD${n.role ? ' · ' + n.role.toUpperCase() : ''}`, PAL.dusk, 'tiny', roleTip(hud, n)));
    if (visible) rows.push(hpRow(hud, n));
    const walls = isHearth(n) && f.kind === 'empire' ? game.wallsOf(n) : 1;
    if (walls < 1) rows.push(line(hud, `WALLS ${pct(walls)}: WEAKER NOW, FULL AT ${fmtTime(ECON.wallsTime)}`, PAL.ember, 'tiny', { terms: gloss('walls') }));
    rows.push(...starfallRows(hud, n));
    if (visible && game.fieldAt(n)) rows.push(line(hud, `ANTI-WARP FIELD: YOUR SHIPS JUMP AWAY ${HOLD_FIELD}S SLOWER`, PAL.violet, 'tiny', { terms: gloss('field') }));
    if (visible) rows.push(...fieldRows(hud, n));
    // (Ages: a house still on its way from the cradle holds its Hearth, and nothing can touch it until it arrives.)
    const away = game.asleep(f.id);
    if (away) rows.push(line(hud, `ITS ARK HAS NOT ARRIVED: ${fmtTime(f.asleepUntil - game.time)} TO GO`, PAL.ember, 'tiny', { tip: `The ${f.name} are still on their way ` +
        `from the cradle. Until their Ark arrives nothing here can be hurt, and nothing here will fight.` }));
    const why = away
      ? 'Nothing can touch this Hearth until its house arrives.'
      : f.kind === 'empire'
        ? isHearth(n)
          ? 'Take this Hearth and the whole house falls: its worlds swear to you. Bring Breakers.'
          : 'Breakers take worlds fastest. Clear its defenders first.'
        : '';
    if (why) rows.push(para(hud, why, PAL.mist, innerW, { terms: termsIn(why) }));
    return rows;
  }
  // A dark world.
  rows.push(header(hud, n.name.toUpperCase(), PAL.mist, n, 'DARK', PAL.slate, { terms: gloss('dark', 'kindle') }));
  rows.push(line(hud, `${n.size} ${T.name.toUpperCase()} WORLD · GOOD AS A ${(aff ?? 'mine').toUpperCase()}`, PAL.dusk, 'tiny', {
    tip: `${sizeTip(n)} ${T.name} worlds suit the ${ROLES[aff ?? 'mine'].name} role: ${FIT_TEXT(aff ?? 'mine')} once it is yours.`,
    terms: gloss(aff ?? 'mine', 'natural'),
  }));
  // (A dark world one jump from a Bastion is held like any other place there.)
  if (visible) rows.push(...fieldRows(hud, n));
  const guards = visible ? game.buckets[n.id].filter((u) => !u.dead && u.owner !== p.id && game.factions[u.owner].kind !== 'empire' && u.type !== 'fighter') : [];
  const seed = game.seedFor(p.id, n.id);
  if (guards.length) {
    if (game.cradle) {
      rows.push(line(hud, `HELD BY ${guards.length} ${guards.length === 1 ? 'BEAST' : 'BEASTS'}: DRIVE THEM OFF FIRST`, PAL.red, 'tiny', {
        tip: `Beasts hold ${n.name}. Send your units to kill them; you cannot kindle it while they are here.`,
      }));
    } else {
      rows.push(line(hud, `GUARDED BY ${guards.length} ${guards.length === 1 ? 'SHIP' : 'SHIPS'}: CLEAR THEM FIRST`, PAL.red, 'tiny', {
        tip: `Old defenders guard ${n.name}. Send warships to destroy them; you cannot kindle it while they are here.`,
        terms: gloss('sentinel'),
      }));
    }
  }
  // Warships of another house hold it too: no seed ship kindles while they are here.
  const held = visible ? game.buckets[n.id].filter((u) => !u.dead && u.owner !== p.id && game.factions[u.owner].kind === 'empire' && game.hostile(u.owner, p.id) && fights(u.type)) : [];
  if (held.length) {
    const f = game.factions[held[0].owner];
    rows.push(line(hud, `HELD BY ${held.length} ${held.length === 1 ? 'WARSHIP' : 'WARSHIPS'} OF ${game.shortName(f).toUpperCase()}`, PAL.red, 'tiny', {
      tip: `Warships of ${f.name} are at ${n.name}. No seed ship can kindle it while they are here: drive them off, or wait until they leave.`,
      terms: gloss('kindle'),
    }));
  }
  if (seed) {
    // (At the world and not at work: something that fights is in its way.)
    const here = seed.node === n.id && !seed.lane && !seed.path.length;
    rows.push(line(hud, here && seed.kindle > 0 ? `KINDLING… ${pct(seed.kindle / ECON.kindleTime)}` : here && seed.kindle < 0 ? 'YOUR SEED SHIP WAITS HERE' : 'A SEED SHIP IS ON ITS WAY', PAL.gold, 'tiny', { terms: gloss('seed', 'kindle', 'glow') }));
  }
  // Another house's seed ship at work here: the first to finish has the world.
  if (visible) {
    for (const u of game.buckets[n.id]) {
      if (u.dead || u.type !== 'seed' || u.owner === p.id || u.order !== 'kindle' || u.orderTarget !== n.id) continue;
      const f = game.factions[u.owner];
      rows.push(line(hud, u.kindle > 0 ? `BEING KINDLED BY ${game.shortName(f).toUpperCase()}: ${pct(u.kindle / ECON.kindleTime)}` : `A SEED SHIP OF ${game.shortName(f).toUpperCase()} WAITS HERE`, f.color, 'tiny', {
        tip: `A seed ship of ${f.name} is kindling ${n.name}. The first seed ship to finish has the world; the other is called off, and its next KINDLE is free. ` +
            `Only warships stop a kindling: a seed ship or a Scout stops nothing.`,
        terms: gloss('seed', 'kindle'),
      }));
    }
  }
  if (!seed) {
    const why = game.checkKindle(p.id, n.id);
    const cost = game.kindleCost(p);
    // A seed ship whose mission was called off does the next kindling, at no cost.
    const waiting = game.idleSeed(p.id);
    rows.push(gap(2));
    rows.push({
      h: 15,
      draw: (x, y, w) => {
        hud.ui.button(hud.s.screen.g, 'kindle', x, y, Math.min(110, w), 13, 'KINDLE', () => hud.actions.kindle(n.id), {
          primary: !why, disabled: !!why, icon: 'kindle', right: waiting ? 'FREE' : `${IC.ember}${cost}`,
          tip: why
            ? `Can't kindle: ${why}.`
            : waiting
              ? `Your waiting seed ship goes to ${n.name}, kindles it and is used up. It is already paid for, so this costs nothing. (K)`
              : `Pay ${cost} Embers for a seed ship: it goes to ${n.name}, kindles it and is used up. If it is destroyed on the way, the Embers are lost. (K)`,
        });
        if (why && why !== WHY.embers) text(hud.s.screen.g, fit(why.toUpperCase(), w - 116, 'tiny'), x + 116, y + 4, PAL.slate, 'tiny');
      },
    });
  }
  return rows;
}

function hpRow(hud: Hud, n: GNode): CardRow {
  const g = hud.s.screen.g;
  return {
    h: 8,
    draw: (x, y, w) => {
      // (On the cradle a land has walls, and the longer word needs more room before the bar.)
      const cradle = hud.g.cradle;
      const label = cradle ? 'WALLS' : 'HULL';
      const off = cradle ? textWidth(label, 'tiny') + 4 : 18;
      text(g, label, x, y, PAL.dusk, 'tiny');
      const bw = Math.min(90, w - off - 2);
      bar(g, x + off, y + 1, bw, 2, n.hp / Math.max(1, n.maxHp), PAL.teal, PAL.indigo);
      if (n.maxSh > 0) bar(g, x + off, y + 4, bw, 1, n.sh / n.maxSh, PAL.sky, PAL.night, undefined, 0);
      hud.ui.hint('card-hp', x - 1, y - 1, bw + off + 2, 8, {
        tip: cradle
          ? (`Walls ${fmt(n.hp)} / ${fmt(n.maxHp)} (green)${n.maxSh > 0 ? ` · shields ${fmt(n.sh)} / ${fmt(n.maxSh)} (blue)` : ''}. Shields soak up ` +
              `damage first. When the walls are down the land falls to whoever is attacking it.`)
          : (`Hull ${fmt(n.hp)} / ${fmt(n.maxHp)} (green)${n.maxSh > 0 ? ` · shields ${fmt(n.sh)} / ${fmt(n.maxSh)} (blue)` : ''}. Shields soak up ` +
              `damage first. At zero hull the world falls to whoever is attacking it.`),
      });
    },
  };
}

function ownWorldRows(hud: Hud, n: GNode, innerW: number): CardRow[] {
  return [
    ...titleRows(hud, n),
    ...starfallRows(hud, n),
    yieldRow(hud, n),
    hpRow(hud, n),
    gap(2),
    rolesRow(hud, n),
    ...buildRows(hud, n),
    ...queueRows(hud, n),
    ...advanceRows(hud, n),
    ...projectRows(hud, projects(hud, n), innerW),
    ...rallyRows(hud, n),
  ];
}

/** Its name and level, what it is (a Hearth, a role and how it suits it), a Hearth's walls while they rise, its fields. */
function titleRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const p = game.player;
  const hearth = n.capitalOf === p.id;
  const rows: CardRow[] = [];
  rows.push(header(hud, n.name.toUpperCase(), p.color, n, hearth ? `HEARTH · ${roman(n.level)}` : `LEVEL ${roman(n.level)}`, PAL.gold,
    hearth ? { tip: `Your Hearth, level ${roman(n.level)}.`, terms: gloss('hearth', 'lastStand') } : { tip: `Level ${roman(n.level)} of III.`, terms: gloss('level') }));
  const aff = game.affinityOf(n);
  let info = hearth ? 'YOUR HEARTH: IT DOES EVERY ROLE' : (`${n.size} WORLD · ${(n.role ?? 'mine').toUpperCase()}` +
      `${aff && n.role === aff ? ' (A NATURAL FIT)' : aff ? ` · GOOD AS A ${aff.toUpperCase()}` : ''}`);
  if (n.retool > 0) info = `RETOOLING AS A ${(n.role ?? '').toUpperCase()}… ${Math.ceil(n.retool)}S`;
  rows.push(line(hud, info, n.retool > 0 ? PAL.ember : PAL.dusk, 'tiny', n.retool > 0 ? { terms: gloss('retool') } : hearth ? { terms: gloss('hearth') } : roleTip(hud, n)));
  const walls = hearth ? game.wallsOf(n) : 1;
  if (walls < 1) rows.push(line(hud, `WALLS ${pct(walls)} · FULL STRENGTH AT ${fmtTime(ECON.wallsTime)}`, PAL.ember, 'tiny', { terms: gloss('walls') }));
  if (game.fieldAt(n)) rows.push(line(hud, `ANTI-WARP FIELD: ENEMIES JUMP AWAY ${HOLD_FIELD}S SLOWER`, PAL.violet, 'tiny', { terms: gloss('field') }));
  rows.push(...fieldRows(hud, n));
  return rows;
}

/** What it earns a second, in Embers and Lore; and that it is still kindling, or under fire. */
function yieldRow(hud: Hud, n: GNode): CardRow {
  const game = hud.g;
  const p = game.player;
  const gx = hud.s.screen.g;
  return {
    h: 10,
    draw: (x, y) => {
      const em = fmtRate(game.worldEmbers(n) * (1 + p.mods.embers) * p.incomeMul);
      const lo = fmtRate(game.worldLore(n) * (1 + p.mods.lore) * p.incomeMul);
      icon(gx, 'ember', x, y);
      let tx = text(gx, `${em}/s`, x + 7, y, PAL.gold) + 6;
      hud.ui.hint('card-embers', x - 1, y - 1, tx - x - 4, 10, { tip: `${n.name} earns ${em} Embers a second, with all your bonuses. Size, level, ` +
          `role and glow set it.` });
      const lx = tx;
      icon(gx, 'lore', tx, y);
      tx = text(gx, `${lo}/s`, tx + 7, y, PAL.violet) + 6;
      hud.ui.hint('card-lore', lx - 1, y - 1, tx - lx - 4, 10, { tip: `${n.name} makes ${lo} Lore a second. Observatories make the most.`, terms: gloss('lore') });
      if (n.glow < 1) {
        const ex = text(gx, `GLOW ${pct(n.glow)}`, tx, y + 1, PAL.ember, 'tiny');
        hud.ui.hint('card-glow', tx - 1, y - 1, ex - tx + 2, 9, { terms: gloss('glow') });
      } else if (n.lastHit < 5) {
        const ex = text(gx, 'UNDER FIRE', tx, y + 1, PAL.red, 'tiny');
        hud.ui.hint('card-fire', tx - 1, y - 1, ex - tx + 2, 9, { terms: gloss('underFire') });
      }
    },
  };
}

/** The four roles (not at a Hearth, which does them all) and the button that raises the world a level. */
function rolesRow(hud: Hud, n: GNode): CardRow {
  const game = hud.g;
  const p = game.player;
  const gx = hud.s.screen.g;
  const hearth = n.capitalOf === p.id;
  const aff = game.affinityOf(n);
  return {
    h: 14,
    draw: (x, y, w) => {
      let bx = x;
      if (!hearth) {
        for (const r of ROLE_ORDER) {
          const isAff = aff === r;
          // (A Bastion is chosen for where it stands: the tip says what it would reach and protect
          // here, and while the pointer is on the button the map shows it.)
          const here = r === 'bastion' && n.role !== r && !game.cradle ? ` ${bastionHere(hud, n)}` : '';
          if (here && hud.ui.isHot('role-' + r)) hud.s.view.fieldPreview = n.id;
          hud.ui.iconButton(gx, 'role-' + r, bx, y, 12, r, () => hud.actions.role(n.id, r), {
            selected: n.role === r,
            tipTitle: n.role === r ? `${ROLES[r].name} (current role)` : ROLES[r].name,
            tip: `${ROLES[r].desc}${here}${isAff ? ` This world is a natural fit: ${FIT_TEXT(r)}.` : ''}` +
                `${n.role === r ? '' : n.fresh ? ' The first role you give a new world costs no time.' : ` Switching takes ${ECON.retoolTime}s, and the world works at neither role meanwhile.`}`,
          });
          if (isAff) {
            gx.fillStyle = PAL.gold;
            gx.fillRect(bx + 10, y - 1, 2, 2);
          }
          bx += 14;
        }
        bx += 2;
      }
      const cost = game.upgradeCost(p, n);
      const rising = n.buildQ.some((q) => q.kind === 'upgrade');
      if (cost !== null && !rising) {
        const why = game.checkUpgrade(p.id, n.id);
        const label = `RAISE TO ${roman(n.level + 1)}`;
        hud.ui.button(gx, 'upgrade', bx, y, Math.min(w - (bx - x), 104), 12, label, () => hud.actions.upgrade(n.id), {
          disabled: !!why && why !== WHY.embers ? true : !!why, right: `${IC.ember}${cost}`, font: 'tiny',
          tip: `Raise ${n.name} to level ${roman(n.level + 1)}: +50% output, more hull and more hangar room.` +
              `${game.isBastion(n) ? ` As a Bastion it then protects your worlds one jump away by ${pct(FIELD_GUARD[Math.min(3, n.level + 1)])}, up from ${pct(FIELD_GUARD[n.level])}.` : ''}` +
              `${why ? ` (${why})` : ''}`,
        });
      } else if (rising) {
        const q = n.buildQ.find((it) => it.kind === 'upgrade')!;
        text(gx, `RISING TO ${roman(n.level + 1)}`, bx, y + 3, PAL.teal, 'tiny');
        bar(gx, bx, y + 10, 60, 2, q.t / q.total, PAL.teal, PAL.indigo);
      } else text(gx, 'LEVEL III (MAX)', bx, y + 3, PAL.dusk, 'tiny');
    },
  };
}

/** What a Forge builds, a button for each ship (with its key and its price); at any other world, that only Forges build. */
function buildRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const p = game.player;
  const gx = hud.s.screen.g;
  const hearth = n.capitalOf === p.id;
  const rows: CardRow[] = [];
  if (game.isForge(n)) {
    const types = game.shipTypesFor(p);
    rows.push(gap(2));
    rows.push({
      h: 18,
      draw: (x, y, w) => {
        const bw = Math.max(26, Math.min(34, Math.floor((w + 2) / types.length) - 2));
        let bx = x;
        types.forEach((t, k) => {
          const why = game.checkShip(p.id, n.id, t);
          const cost = game.shipCost(p, t, n);
          const id = 'build-' + t;
          const hot = hud.ui.isHot(id);
          const blocked = !!why && why !== WHY.embers && why !== WHY.hangar && why !== WHY.queue;
          box(gx, bx, y, bw, 17, hot && !blocked ? PAL.indigo : PAL.night, hot ? PAL.dusk : why ? PAL.indigo : PAL.slate);
          // (Its key, in the corner: Q W E R T Y, in the order of the buttons. See ui/keys.ts.)
          const key = BUILD_LABELS[k];
          if (key) text(gx, key, bx + 2, y + 2, hot ? PAL.mist : PAL.dusk, 'tiny');
          const spr = shipSprite(t, why ? PAL.slate : p.color, 0);
          gx.drawImage(spr, bx + 2 + Math.max(0, Math.floor((9 - spr.width) / 2)), y + 10 - (spr.height >> 1));
          text(gx, String(cost), bx + 12, y + 8, why === WHY.embers ? PAL.red : why ? PAL.slate : PAL.gold, 'tiny');
          const def = UNITS[t];
          hud.ui.add({
            id, x: bx, y, w: bw, h: 17, onClick: () => hud.actions.build(n.id, t), disabled: blocked,
            tipTitle: `${def.name} · ${cost} Embers · ${def.hangar} hangar${key ? ` · key ${key}` : ''}`,
            tip: `${game.cradle ? `${unitDesc(t, p.era)} ${LINE_SHORT[t] ?? ''}` : (GLOSS_BY_ID[t]?.text ?? def.short)}` +
                `${why ? ` [!${why}.]` : ' Shift-click: queue five.'}`,
          });
          bx += bw + 2;
        });
      },
    });
    if (p.hangarUsed >= p.hangarCap) rows.push(line(hud, 'HANGAR FULL: HOLD MORE WORLDS OR RAISE THEIR LEVEL', PAL.red, 'tiny', { terms: gloss('hangar', 'bay', 'level') }));
  } else if (!hearth) {
    rows.push(line(hud, 'ONLY FORGES BUILD SHIPS', PAL.slate, 'tiny', { tip: 'Make this world a Forge (the second role button) to build ships ' +
        'here. Your Hearth always can.', terms: gloss('forge') }));
  }
  return rows;
}

/** What is being built here, in order: a click takes one out and gives its Embers back. */
function queueRows(hud: Hud, n: GNode): CardRow[] {
  const p = hud.g.player;
  const gx = hud.s.screen.g;
  const rows: CardRow[] = [];
  const queue = [...n.shipQ.map((q, i) => ({ q, i, kind: 'ship' as const })), ...n.buildQ.map((q, i) => ({ q, i, kind: 'build' as const }))].filter((e) => e.q.kind !== 'upgrade');
  if (queue.length) {
    rows.push({
      h: 12,
      draw: (x, y) => {
        let bx = x;
        for (const e of queue) {
          const t = (e.q.kind === 'gate' ? 'gate' : e.q.kind === 'ark' ? 'ark' : e.q.id) as UnitType;
          const id = `q-${e.kind}-${e.i}`;
          box(gx, bx, y, 14, 11, hud.ui.isHot(id) ? PAL.wine : PAL.night, PAL.indigo);
          const spr = shipSprite(t, p.color, 0);
          if (spr.width <= 12) gx.drawImage(spr, bx + 7 - (spr.width >> 1), y + 5 - (spr.height >> 1));
          else icon(gx, t === 'gate' ? 'ascension' : t === 'starfall' ? 'starfall' : 'forge', bx + 4, y + 2);
          const first = (e.kind === 'ship' && e.i === 0) || (e.kind === 'build' && e.i === 0);
          if (first) rect(gx, bx + 1, y + 9, Math.max(1, Math.round(12 * (e.q.t / e.q.total))), 1, PAL.teal);
          hud.ui.add({ id, x: bx, y, w: 14, h: 11, onClick: () => hud.actions.cancel(n.id, e.kind, e.i), tip: `${UNITS[t]?.name ?? t}: click to cancel and get ${e.q.cost} Embers back.` });
          bx += 16;
        }
      },
    });
  }
  return rows;
}

/**
 * The projects on offer here: a Starbase at any world; at the Hearth a Hangar Bay, the next age, the
 * Ark again, the Starfire Gate.
 */
function projects(hud: Hud, n: GNode): Project[] {
  const game = hud.g;
  const p = game.player;
  const hearth = n.capitalOf === p.id;
  const extras: Project[] = [];
  if (game.hasCard(p, 'bpStarbase') && game.starbaseAt(n) === 0) {
    const why = game.checkStarbase(p.id, n.id);
    extras.push({ id: 'starbase', label: 'STARBASE', cost: game.shipCost(p, 'starbase'), icon: 'bastion', accent: PAL.sky, act: () => hud.actions.starbase(n.id), tip: `Build a Starbase to guard ${n.name}. It also repairs your ships here.`, dis: why });
  }
  // The Hangar Bay is always on the Hearth's card, from the first second to the last bay. (It used to
  // appear at seven tenths of the hangar and go when all were built: a button that comes and goes by
  // rules nobody was told is bad to use, and a player should know from the start where more room for
  // ships comes from.)
  if (hearth) {
    const bays = p.bays ?? 0;
    const all = bays >= ECON.bayMax;
    extras.push({
      id: 'bay', label: 'HANGAR BAY', plus: all ? undefined : `+${ECON.bayHangar}`, cost: game.bayCost(p), right: all ? `${bays}/${ECON.bayMax}` : undefined, icon: 'hangar', accent: PAL.teal, act: () => hud.actions.bay(),
      tip: `Build a Hangar Bay at your Hearth: room for ${ECON.bayHangar} more hangar space. Each bay costs more than the last. You have built ` +
          `${bays} of ${ECON.bayMax}.`, dis: all ? 'Every bay is built' : game.checkBay(p.id),
      // (It asks to be seen when it is needed: the hangar nearly full.)
      calls: p.hangarUsed >= p.hangarCap * 0.9,
    });
  }
  if (hearth && game.cradle && p.era < SPACE && !p.advance) {
    const last = p.era >= LAST_CRADLE_ERA;
    extras.push({ id: 'advance-card', label: last ? 'BUILD THE ARK' : `TO THE ${ERAS[p.era + 1].short} AGE`, cost: ERAS[p.era].cost, icon: 'up', accent: PAL.teal, act: () => hud.actions.advance(), tip: advanceTip(hud), dis: game.checkAdvance(p.id) });
  }
  if (hearth && !game.cradle && game.checkArk(p.id) !== WHY.arkFlies) {
    extras.push({ id: 'ark', label: 'REBUILD ARK', cost: game.shipCost(p, 'ark'), icon: 'hearth', accent: PAL.gold, act: () => hud.actions.ark(), tip: 'Rebuild your Ark. It keeps its levels and abilities.', dis: game.checkArk(p.id), calls: true });
  }
  // The Starfall is on the Hearth's card from the moment its Blueprint is drafted, whatever else is so.
  if (hearth && !game.cradle && game.hasCard(p, 'bpStarfall')) {
    const own = game.starfallOf(p.id);
    extras.push({
      id: 'starfall', label: 'STARFALL', cost: game.starfallCost(p), icon: 'starfall', accent: PAL.ember, act: () => hud.actions.starfall(),
      tip: `Build a Starfall (${STARFALL_BUILD} seconds). Fly it to any star and arm it there: ${STARFALL_FUSE / 60} minutes later the star erupts, unless the ` +
          `Starfall is destroyed first. Every ship in that system is destroyed, yours too, and every world there is scorched: no shields, a level ` +
          `lost, the Glow of a new world. No world changes hands. You have one at a time, and each costs ${STARFALL_STEP} Embers more than the last.` +
          `${own ? ` Yours is ${own.fuse !== undefined ? 'armed' : 'waiting'} at ${game.nodes[own.node >= 0 ? own.node : own.lane!.to].name}.` : ''}`,
      dis: game.checkStarfall(p.id),
    });
  }
  if (hearth && game.victories.includes('ascension') && !p.gate) {
    const why = game.checkGate(p.id, n.id);
    const short = p.boons < ASCENSION_BOONS;
    extras.push({
      id: 'gate', label: 'STARFIRE GATE', cost: game.shipCost(p, 'gate'), icon: 'ascension', accent: PAL.pink, act: () => hud.actions.gate(n.id),
      tip: `Raise the Starfire Gate. Protect it for ${GATE_CHARGE / 60} minutes to win by Ascension.` +
          `${short ? ` You have ${p.boons} of the ${ASCENSION_BOONS} Boons it takes.` : ''}`, dis: why,
      // (Until it can be raised it counts the Boons it waits for; then a spark runs round it.)
      progress: short ? { have: p.boons, need: ASCENSION_BOONS } : undefined, spark: true,
    });
  }
  return extras;
}

/** The step to the next age, while the Hearth is at work on it. */
function advanceRows(hud: Hud, n: GNode): CardRow[] {
  const p = hud.g.player;
  const gx = hud.s.screen.g;
  const hearth = n.capitalOf === p.id;
  const rows: CardRow[] = [];
  if (hearth && p.advance) {
    const adv = p.advance;
    const last = p.era >= LAST_CRADLE_ERA;
    rows.push(gap(2));
    rows.push({
      h: 12,
      draw: (x, y, w) => {
        const held = n.lastHit < 5;
        text(gx, held ? 'THE WORK STANDS STILL: UNDER ATTACK' : last ? 'YOUR ARK IS RISING' : `THE ${ERAS[p.era + 1].short} AGE IS COMING`, x, y, held ? PAL.red : PAL.teal, 'tiny');
        bar(gx, x, y + 8, Math.min(w, 120), 2, adv.t / adv.total, held ? PAL.red : PAL.teal, PAL.indigo);
      },
    });
  }
  return rows;
}

/** The projects as buttons, as wide as what they say, side by side; on a second line when the card is too narrow. */
function projectRows(hud: Hud, extras: Project[], innerW: number): CardRow[] {
  const rows: CardRow[] = [];
  if (extras.length) {
    // As wide as what they say, side by side, on a second line when the card is too narrow for them.
    const lines: Project[][] = [[]];
    let used = 0;
    for (const e of extras) {
      const bw = Math.min(innerW, projectWidth(e));
      if (used && used + bw > innerW) {
        lines.push([]);
        used = 0;
      }
      lines[lines.length - 1].push(e);
      used += bw + 2;
    }
    rows.push(gap(2));
    rows.push({
      h: lines.length * 14 - 1,
      draw: (x, y, w) => {
        lines.forEach((ln, i) => {
          let bx = x;
          for (const e of ln) {
            const bw = Math.min(w, projectWidth(e));
            drawProject(hud, e, bx, y + i * 14, bw);
            bx += bw + 2;
          }
        });
      },
    });
  }
  return rows;
}

/** Where the ships built here fly on to, and a button to clear it. */
function rallyRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const gx = hud.s.screen.g;
  const rows: CardRow[] = [];
  if (n.rally >= 0) {
    rows.push({
      h: 9,
      draw: (x, y) => {
        const ex = text(gx, `RALLY → ${game.nodes[n.rally].name.toUpperCase()}`, x, y + 1, PAL.sky, 'tiny');
        hud.ui.hint('card-rally', x - 1, y, ex - x + 2, 8, { tip: `Ships built here fly on to ${game.nodes[n.rally].name} by themselves.`, terms: gloss('rally') });
        hud.ui.button(gx, 'rally-clear', ex + 4, y - 1, 9, 9, '×', () => hud.actions.rally(n.id, n.id), { font: 'tiny', tip: 'Clear the rally point' });
      },
    });
  }
  return rows;
}

function projectRight(e: Project): string {
  return e.right ?? (e.progress ? `${IC.boon}${e.progress.have}/${e.progress.need}` : `${IC.ember}${e.cost}`);
}

function projectWidth(e: Project): number {
  return 11 + textWidth(e.label, 'tiny') + (e.plus ? 3 + textWidth(e.plus, 'tiny') : 0) + 6 + textWidth(projectRight(e), 'tiny') + 3;
}

/**
 * A project of the Hearth as a button: its picture, its name, its price. They were grey boxes of
 * small text, the dullest thing on the busiest card. Each has its colour (the Hangar Bay teal like the
 * hangar, the Starfire Gate the pink of Ascension), and each moves when it matters: the Hangar Bay
 * blinks its "+5" when the hangar is nearly full, the Ark asks to be rebuilt, and the Starfire Gate
 * counts the Boons it waits for and, once it can be raised, has a spark running round it.
 */
function drawProject(hud: Hud, e: Project, x: number, y: number, w: number) {
  const g = hud.s.screen.g;
  const H = 12;
  const poor = e.dis === WHY.embers;
  const locked = !!e.dis && !poor;
  const ready = !e.dis;
  const hot = hud.ui.isHot(e.id) && !locked;
  const beat = Math.floor(hud.ui.time * 2.5) % 2 === 0;
  box(g, x, y, w, H, hot ? PAL.indigo : PAL.night, locked ? PAL.indigo : hot ? PAL.bone : poor ? PAL.slate : e.accent);
  // Its picture: in its own colours, lit up on the beat when the project calls or is ready to raise.
  const lit = (ready && (e.calls || e.spark) && beat) || hot;
  // (One that counts what it waits for is on its way, not merely shut: a shade brighter, its picture violet.)
  const dim = e.progress ? PAL.dusk : PAL.slate;
  icon(g, e.icon, x + 3, y + 3, locked ? (e.progress ? PAL.violet : PAL.slate) : lit ? PAL.bone : e.icon === 'hangar' ? e.accent : undefined, locked || lit || e.icon === 'hangar');
  let tx = text(g, e.label, x + 10, y + 3, locked ? dim : hot || ready ? PAL.bone : PAL.mist, 'tiny');
  if (e.plus) tx = text(g, e.plus, tx + 3, y + 3, locked ? PAL.slate : e.calls && ready && beat ? PAL.bone : e.accent, 'tiny');
  const right = projectRight(e);
  text(g, right, x + w - 3 - textWidth(right, 'tiny'), y + 3, e.progress ? PAL.violet : poor ? PAL.red : locked ? PAL.slate : PAL.gold, 'tiny');
  // Waiting for Boons: how far, along the foot of the button.
  if (e.progress) {
    rect(g, x + 1, y + H - 2, w - 2, 1, PAL.indigo);
    rect(g, x + 1, y + H - 2, Math.max(1, Math.round((w - 2) * Math.min(1, e.progress.have / e.progress.need))), 1, PAL.violet);
  }
  // Ready to raise: two sparks run round the frame, each with a tail that cools from white to ember.
  if (e.spark && ready) {
    const per = 2 * (w + H) - 4;
    const head = Math.floor(hud.ui.time * 44) % per;
    for (const start of [head, head + (per >> 1)]) {
      for (let k = 0; k < 9; k++) {
        let d = (((start - k) % per) + per) % per;
        let px = x;
        let py = y;
        if (d < w) px = x + d;
        else if ((d -= w - 1) < H) [px, py] = [x + w - 1, y + d];
        else if ((d -= H - 1) < w) [px, py] = [x + w - 1 - d, y + H - 1];
        else [px, py] = [x, y + H - 1 - (d - (w - 1))];
        rect(g, px, py, 1, 1, k < 2 ? PAL.bone : k < 6 ? PAL.gold : PAL.ember);
      }
    }
  } else if (e.calls && ready && beat) box(g, x - 1, y - 1, w + 2, H + 2, null, e.accent);
  hud.ui.add({ id: e.id, x, y, w, h: H, onClick: e.act, disabled: locked, tip: e.tip + (e.dis ? ` [!${e.dis}.]` : '') });
}

function siteRows(hud: Hud, n: GNode, innerW: number): CardRow[] {
  const game = hud.g;
  const rows: CardRow[] = [];
  switch (n.kind) {
    case 'star':
      rows.push(header(hud, n.name.toUpperCase(), PAL.gold, null, 'STAR', undefined, { terms: gloss('starlane') }));
      rows.push(para(hud, 'A star where starlanes meet. Fleets pass through here on their way between worlds.', PAL.mist, innerW, { terms: gloss('starlane', 'spool') }));
      if (burning(n)) {
        rows.push(line(hud, `BURNS FOR ${fmtTime(Math.ceil(n.hazard!.t))} MORE`, PAL.ember, 'tiny', { terms: gloss('starfall') }));
        rows.push(para(hud, 'A Starfall set this star alight. Ships that enter take heavy damage, so fleets wait in front of the fire until it is out. Order ' +
            'yours there twice to send them through.', PAL.mist, innerW));
      }
      break;
    case 'anomaly':
      rows.push(header(hud, n.name.toUpperCase(), PAL.violet, null, 'ANOMALY', undefined, { terms: gloss('anomaly') }));
      rows.push(para(hud, n.anomaly ? ('Something strange drifts here. Send a ship here to look inside, then choose what to do. Passing ships fly ' +
          'on.') : 'Already explored. Nothing more to find.', PAL.mist, innerW));
      break;
    case 'relic': {
      rows.push(header(hud, n.name.toUpperCase(), PAL.sky, null, 'RELIC VAULT', undefined, { terms: gloss('relic', 'relicHunt') }));
      if (n.relic) {
        const r = RELIC_BY_ID[n.relic];
        rows.push(line(hud, r.name.toUpperCase(), PAL.sky));
        rows.push(para(hud, `${r.desc} Defeat its guardians, then keep your ships here, alone, for 45 seconds to dig it out.`, PAL.mist, innerW, { terms: [...gloss('relic'), ...termsIn(r.desc, { max: 2 })] }));
      } else rows.push(para(hud, 'The vault is empty: its relic has been taken.', PAL.dusk, innerW));
      break;
    }
    case 'pirate':
      rows.push(header(hud, n.name.toUpperCase(), PAL.mist, null, 'CORSAIRS', undefined, { terms: gloss('corsairs', 'stronghold') }));
      rows.push(para(hud, game.pirates.alive ? 'The Blackstar Corsairs’ den. Destroy the Stronghold to end their raids for good (and win a Boon).' : 'The Stronghold lies in ruins. The raids are over.', PAL.mist, innerW));
      break;
    case 'rift': {
      rows.push(header(hud, n.name.toUpperCase(), PAL.pink, null, 'THE HOLLOW', undefined, { terms: gloss('hollow', 'maw', 'riftHeart') }));
      const c = game.crisis;
      const t = !c ? 'A scar in space.' : c.dead ? 'The Rift Heart is dead. The Maw is closing.' : c.awake ? 'The Hollow pour out of the Maw. Destroy the Rift Heart inside to purge them.' : `The Maw is quiet… for now. It will open around ${fmtTime(c.awakenAt)}.`;
      rows.push(para(hud, t, PAL.mist, innerW));
      break;
    }
  }
  if (n.claim?.what === 'derelict') rows.push(para(hud, 'A derelict Dreadnought drifts here. Hold this place alone for 15 seconds to claim it.', PAL.gold, innerW, { terms: gloss('dreadnought') }));
  rows.push(...starfallRows(hud, n));
  if (hud.s.visible(n.id)) rows.push(...fieldRows(hud, n));
  return rows;
}

/** A Starfall armed at this place's star: every card in that system says so, with what it will do here and how long is left. */
export function starfallRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const star = game.starOf(n);
  const d = star ? game.armedAt(star) : null;
  if (!star || !d) return [];
  const mine = d.owner === game.playerId;
  const what = n.kind === 'planet' && n.owner >= 0 ? 'THIS WORLD WILL BE SCORCHED' : 'EVERY SHIP HERE WILL BE DESTROYED';
  return [
    line(hud, `STARFALL${n.id === star.id ? '' : ` AT ${star.name.toUpperCase()}`}: ERUPTS IN ${fmtTime(Math.ceil(d.fuse!))}`, PAL.red, 'tiny', {
      tip: `${mine ? 'Your Starfall' : `A Starfall of ${game.factions[d.owner].name}`} is armed at ${star.name}. When the time runs out, every ship in this system is destroyed and ` +
          `every world in it is scorched (no shields, a level lost, the Glow of a new world), unless the Starfall is destroyed first.`,
      terms: gloss('starfall'),
    }),
    line(hud, what, PAL.ember, 'tiny'),
  ];
}

/** What a Bastion would do at a world of the player's, for the tip of that role's button. */
function bastionHere(hud: Hud, n: GNode): string {
  const game = hud.g;
  const reach = game.neighbours(n.id);
  const wards = reach.filter((id) => game.nodes[id].kind === 'planet' && game.nodes[id].owner === n.owner);
  const names = wards.map((id) => (isHearth(game.nodes[id]) ? 'your Hearth' : game.nodes[id].name));
  const places = `${reach.length} ${reach.length === 1 ? 'place' : 'places'}`;
  return wards.length
    ? `Here its field would reach ${places} and protect ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}.`
    : `Here its field would reach ${places}, and protect nothing: no world of yours is one jump away.`;
}

/**
 * What a place's card says of the Bastions' fields: for a Bastion, how far its field reaches and
 * which worlds it protects (or, for one of the player's, that no world of theirs is next door to be
 * protected: the answer to "what does this Bastion do out here?"); for a world a Bastion protects, by
 * which and by how much; for any place a Bastion's field reaches from next door, that it is held.
 */
function fieldRows(hud: Hud, n: GNode): CardRow[] {
  const game = hud.g;
  const p = game.player;
  if (game.cradle) return [];
  const rows: CardRow[] = [];
  const name = (id: number) => game.nodes[id].name;
  const names = (ids: number[], last = 'and') => (ids.length > 1 ? `${ids.slice(0, -1).map(name).join(', ')} ${last} ${name(ids[ids.length - 1])}` : ids.map(name).join(''));
  const row = (t: string, tip: string) => rows.push(line(hud, t.toUpperCase(), PAL.violet, 'tiny', { tip: `${tip} ${FIELD_TIP}`, terms: gloss('field') }));
  /** The first of these that fits a card's line (the last, if none does). */
  const fits = (...texts: string[]) => texts.find((t) => t && t.length <= 46) ?? texts[texts.length - 1];
  const mine = n.owner === p.id;
  // A Bastion: where its field reaches, and what it protects.
  if (game.isBastion(n)) {
    const reach = game.neighbours(n.id);
    const wards = game.guardedBy(n);
    const guard = FIELD_GUARD[Math.max(1, Math.min(3, n.level))];
    const less = `${pct(guard)} less damage`;
    if (reach.length) {
      row(fits(reach.length === 1 ? `Field also reaches ${name(reach[0])}, one jump away` : '', `Field also reaches the ${reach.length} ` +
          `${reach.length === 1 ? 'place' : 'places'} one jump away`),
        `Its field holds ${names(reach)} as well as ${n.name}: every place one jump away.`);
    }
    if (wards.length) {
      row(fits(wards.length <= 2 ? `Protects ${names(wards)}: ${less}` : '', `Protects ${wards.length} ${wards.length === 1 ? 'world' : 'worlds'}: ${less}`),
        `${names(wards)} ${wards.length > 1 ? 'take' : 'takes'} ${less} while ${n.name} stands.` +
            `${mine ? (n.level < 3 ? ` Raise ${n.name} and that is ${pct(FIELD_GUARD[n.level + 1])}.` : '') : ` Take ${n.name} first (or see it retooled) and the protection is gone.`}`);
    } else if (mine) {
      row('No world of yours one jump away to protect', `${n.name} protects the worlds of yours one jump from it, and there is none. Its field ` +
          `still holds the places next to it.`);
    }
  }
  // A world a Bastion protects. (The word is "protected", not "walled": a Hearth's walls are another
  // thing, its strength in the first minutes.)
  const by = game.guardsOf(n);
  if (by.length) {
    const less = `${pct(game.guardOf(n))} less damage`;
    row(fits(by.length <= 2 ? `Protected by ${names(by)}: ${less}` : '', `Protected by ${by.length > 1 ? `${by.length} Bastions` : 'a Bastion'}: ${less}`), mine
      ? (`${n.name} takes ${less} while ${names(by, 'or')} stands${by.length > 1 ? ' (the stronger of them counts)' : ''}. Lose every Bastion next ` +
          `to it and the protection is gone.`)
      : (`${n.name} takes ${less} while ${names(by, 'or')} stands${by.length > 1 ? ' (the stronger of them counts)' : ''}. Take ` +
          `${by.length > 1 ? 'those Bastions' : 'that Bastion'} first (or see ${by.length > 1 ? 'them' : 'it'} retooled) and the protection is gone.`));
  }
  // A place a Bastion's field reaches from next door. (Not said of a world that keeps a field of the
  // same house up itself: its card has said "anti-warp field" already.)
  const from = game.fieldsFrom(n).filter((id) => !(game.fieldAt(n) && game.nodes[id].owner === n.owner));
  const ours = from.filter((id) => game.nodes[id].owner === p.id);
  const theirs = from.filter((id) => game.hostile(game.nodes[id].owner, p.id));
  const whose = (ids: number[]) => (ids.length === 1 ? name(ids[0]) : `${ids.length} Bastions`);
  if (ours.length) {
    row(fits(`Field from ${whose(ours)}: enemies jump ${HOLD_FIELD}s slower`, `In your field: enemies jump away ${HOLD_FIELD}s slower`),
      `${n.name} is one jump from ${names(ours)}, whose field reaches it: enemy ships here take ${HOLD_FIELD}s longer to jump away.`);
  }
  if (theirs.length) {
    row(fits(`Enemy field from ${whose(theirs)}: you jump ${HOLD_FIELD}s slower`, `In an enemy field: you jump away ${HOLD_FIELD}s slower`),
      `${n.name} is one jump from ${names(theirs)}, whose field reaches it: your ships here take ${HOLD_FIELD}s longer to jump away.`);
  }
  return rows;
}
