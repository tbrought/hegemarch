/**
 * The card of ships: a fleet of the player's (what is in it, what it is doing, when it will jump, its
 * orders), and what can be seen of someone else's.
 */

import { FIRE_SPOOL, HOLD_FIELD, JUMP_CHARGE, UNDER_FIRE } from '../../game/constants';
import { powerOf } from '../../game/commands/power';
import { ABILITY_BY_ID } from '../../game/data/abilities';
import { UNITS } from '../../game/data/units';
import { burning, STARFALL_FUSE } from '../../game/starfall';
import type { Unit, UnitType } from '../../game/types';
import { text, textWidth } from '../../render/font';
import { PAL } from '../../render/palette';
import { fmtTime } from '../../render/Renderer';
import { bar, box } from '../../render/pixel';
import { icon, shipSprite } from '../../render/sprites';
import { fmt } from '../format';
import { gloss, GLOSS_BY_ID, termsIn } from '../glossary';
import { unitCount, unitDesc, unitName } from '../vocab';
import { gap, header, line, para, type CardRow } from './rows';
import type { Hud } from '../Hud';
import { POWER_KEY } from './power';

/** How long a drive charges with nothing holding it, for the words of a tip. */
export const JUMP_CHARGE_TEXT = `${JUMP_CHARGE} s`;

/**
 * Ships of ours that are charging their drives to jump on: how far the slowest has got (0 to 1), how
 * many seconds it still needs, and what is holding it back. Null when none is charging.
 */
export function jumpWait(hud: Hud, units: Unit[]): { done: number; left: number; held: boolean; fire: boolean; snared: boolean } | null {
  const game = hud.g;
  let done = 1;
  let left = 0;
  let held = false;
  let fire = false;
  let snared = false;
  let any = false;
  for (const u of units) {
    if (u.dead || u.lane || u.node < 0 || !u.path.length || u.charge < 0) continue;
    any = true;
    const total = Math.max(0.1, game.jumpChargeOf(u));
    const under = u.lastHit < UNDER_FIRE;
    done = Math.min(done, Math.max(0, 1 - u.charge / total));
    left = Math.max(left, Math.max(0, u.snare) + u.charge / (under ? FIRE_SPOOL : 1));
    held ||= game.holdAt(u) > 0;
    fire ||= under;
    snared ||= u.snare > 0;
  }
  return any ? { done, left, held, fire, snared } : null;
}

export function jumpWaitText(w: { left: number; held: boolean; fire: boolean; snared: boolean }): string {
  const why = [w.snared ? 'snared' : '', w.held ? 'held by an anti-warp field' : '', w.fire ? 'under fire' : ''].filter(Boolean);
  return `Jumping in ${Math.ceil(w.left)} s${why.length ? `: ${why.join(', ')}` : ''}`;
}

export function fleetRows(hud: Hud, units: Unit[]): CardRow[] {
  const game = hud.g;
  const p = game.player;
  const rows: CardRow[] = [];
  const n0 = units[0].node;
  const allHere = units.every((u) => u.node === n0 && n0 >= 0);
  const dest = units.find((u) => u.lane || u.path.length)?.dest ?? -1;
  const where = allHere ? `AT ${game.nodes[n0].name.toUpperCase()}` : dest >= 0 ? `TO ${game.nodes[dest].name.toUpperCase()}` : '';
  if (units.length === 1) {
    const u = units[0];
    const def = UNITS[u.type];
    const desc = unitDesc(u.type, u.era);
    rows.push(header(hud, unitName(u.type, u.era).toUpperCase() + (u.level > 1 ? ` · LEVEL ${u.level}` : ''), PAL.bone, null, where, undefined, undefined, p.color));
    rows.push(para(hud, desc, PAL.mist, 200, { terms: termsIn(desc, { exclude: def.name }) }));
    // The Ark casts the house's power (1.27): its name and its key, in the house's colour.
    const power = u.type === 'ark' ? powerOf(p) : null;
    if (power) {
      // (In bone, not the house's colour: its tooltip is effect text, where red is a cost and teal a gain.)
      rows.push(line(hud, `HOUSE POWER: ${power.name.toUpperCase()} (${POWER_KEY})`, PAL.bone, 'tiny', {
        tip: `{${power.name}}: ${power.desc}\n[${POWER_KEY}] aims it, [${POWER_KEY}] again casts it.`,
        terms: gloss('power'),
      }));
    }
    if (u.abil.length) {
      rows.push(line(hud, 'ABILITIES: ' + u.abil.map((a) => ABILITY_BY_ID[a.id]?.name ?? a.id).join(', ').toUpperCase(), PAL.violet, 'tiny', {
        tip: u.abil.map((a) => `{${ABILITY_BY_ID[a.id]?.name ?? a.id}}: ${ABILITY_BY_ID[a.id]?.desc ?? ''}`).join('\n'),
        terms: gloss('ability'),
      }));
    }
  } else {
    rows.push(header(hud, `YOUR FLEET · ${units.length} SHIPS`, PAL.bone, null, where, undefined, undefined, p.color));
  }
  // (A ship charging its drive stands where it is, and a long charge looked like a ship that would not
  // go: the card says how long, and what holds it.)
  const wait = jumpWait(hud, units);
  if (wait) {
    rows.push(line(hud, jumpWaitText(wait).toUpperCase(), wait.held || wait.fire || wait.snared ? PAL.ember : PAL.sky, 'tiny', {
      tip: `A ship charges its drive before every jump (${JUMP_CHARGE_TEXT}). An enemy anti-warp field (a Bastion, a Hearth, a Starbase) adds ` +
          `${HOLD_FIELD} s; under fire the drive charges at half speed; a Gravity Snare stops it for a while.`,
    }));
  }
  rows.push(...fireRows(hud, units));
  // Composition: click a type to keep only those.
  const counts = new Map<UnitType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  rows.push(compositionRow(hud, counts));
  rows.push(fleetHullRow(hud, units));
  rows.push(line(hud, hud.s.view.orderMode ? 'CLICK A WORLD TO SEND THEM · ESC TO CANCEL' : 'RIGHT-CLICK A WORLD TO SEND THEM', hud.s.view.orderMode ? PAL.gold : PAL.dusk));
  rows.push(gap(1));
  rows.push(ordersRow(hud, units));
  return rows;
}

/**
 * The orders a fleet can be given by button: move, stop, retreat; explore, for its Scouts; and the
 * ability a ship has to learn.
 */
function ordersRow(hud: Hud, units: Unit[]): CardRow {
  const game = hud.g;
  const gx = hud.s.screen.g;
  const p = game.player;
  return {
    h: 13,
    draw: (x, y) => {
      let bx = x;
      const btn = (id: string, label: string, act: () => void, tip: string, o: { pulse?: boolean; selected?: boolean; disabled?: boolean; danger?: boolean } = {}) => {
        const bw = textWidth(label, 'tiny') + 10;
        hud.ui.button(gx, id, bx, y, bw, 12, label, act, { font: 'tiny', tip, ...o });
        bx += bw + 2;
      };
      btn('move', 'MOVE', () => (hud.s.view.orderMode = !hud.s.view.orderMode), 'Then click a world to send these ships there.', { selected: hud.s.view.orderMode });
      btn('stop', 'STOP', () => hud.actions.stop(), 'Stop where they are. (S)');
      btn('retreat', 'RETREAT', () => hud.actions.retreat(), 'Fall back to the nearest world you hold. (R)');
      const scouts = units.filter((u) => UNITS[u.type].role === 'scout');
      // Only while something is left to chart: a charted sector has nowhere to send them.
      if (scouts.length && game.hasUncharted(p)) {
        const many = scouts.length > 1;
        const out = scouts.every((u) => u.order === 'explore');
        const rest = scouts.length < units.length ? ' The other ships stay.' : '';
        const tip = out
          ? `Already exploring: ${many ? 'they chart' : 'it charts'} the dark by ${many ? 'themselves' : 'itself'}. (E)`
          : `Send the Scout${many ? 's' : ''} to chart the dark, world after world, by ${many ? 'themselves' : 'itself'}.${rest} (E)`;
        btn('explore', 'EXPLORE', () => hud.actions.explore(), tip, { pulse: !game.ui.scouted && !out, selected: out });
      }
      // A Starfall among them: ARM is on its card from the day it is built, and says why when it cannot be pressed.
      const device = units.find((u) => u.type === 'starfall');
      if (device) {
        const why = game.checkArm(p.id, device.id);
        btn('arm', device.fuse !== undefined ? 'ARMED' : 'ARM', () => hud.actions.arm(device.id),
          `Arm the Starfall at the star it is at. ${STARFALL_FUSE / 60} minutes later the star erupts: every ship in that system is destroyed, yours too, and ` +
              `every world there is scorched. Every house is told, and holds it against you. It cannot be called off.${why ? ` Can't arm: ${why}.` : ''}`,
          { disabled: !!why, danger: !why, pulse: !why });
      }
      const lv = units.find((u) => u.pendingAbil.length);
      if (lv) btn('learn', 'LEARN!', () => hud.modals.open({ kind: 'ability', unitId: lv.id }), 'Choose a new ability.', { pulse: true });
    },
  };
}

/**
 * What the Starfall means for these ships: one of them is armed; they are in a system that is about to
 * erupt; or they wait in front of a burning star for the fire to go out.
 */
function fireRows(hud: Hud, units: Unit[]): CardRow[] {
  const game = hud.g;
  const rows: CardRow[] = [];
  const own = units.find((u) => u.type === 'starfall' && u.fuse !== undefined);
  if (own) {
    rows.push(line(hud, `ARMED: ${game.nodes[own.node].name.toUpperCase()} ERUPTS IN ${fmtTime(Math.ceil(own.fuse!))}`, PAL.red, 'tiny', {
      tip: 'Keep the Starfall alive until the time runs out, and have your ships out of this system by then: the eruption takes them too.', terms: gloss('starfall'),
    }));
  }
  const inDanger = units.find((u) => u.type !== 'starfall' && u.node >= 0 && !!doomAt(hud, u.node));
  if (inDanger) {
    const d = doomAt(hud, inDanger.node)!;
    const star = game.nodes[d.node];
    rows.push(line(hud, `GET OUT: ${star.name.toUpperCase()} ERUPTS IN ${fmtTime(Math.ceil(d.fuse!))}`, PAL.red, 'tiny', {
      tip: `A Starfall is armed at ${star.name}. When the time runs out every ship in this system is destroyed. Destroy the Starfall, or send these ships ` +
          `to a place outside the system: a ship on a starlane at that moment is safe.`, terms: gloss('starfall'),
    }));
  }
  const waits = units.find((u) => !u.lane && u.node >= 0 && u.path.length > 0 && !u.fire && burning(game.nodes[u.path[0]]));
  if (waits) {
    const star = game.nodes[waits.path[0]];
    rows.push(line(hud, `WAITING: ${star.name.toUpperCase()} BURNS FOR ${fmtTime(Math.ceil(star.hazard!.t))}`, PAL.ember, 'tiny', {
      tip: `The way leads through ${star.name}, which a Starfall set alight. Ships there take heavy damage, so these wait until the fire is out and fly on ` +
          `then. Give them the same order again to send them through it now.`, terms: gloss('starfall'),
    }));
  }
  return rows;
}

/** The armed Starfall whose eruption would take a ship at this place, if there is one. */
function doomAt(hud: Hud, nodeId: number): Unit | null {
  const star = hud.g.starOf(hud.g.nodes[nodeId]);
  return star ? hud.g.armedAt(star) : null;
}

/** The hull and shields of the whole fleet, added up. */
function fleetHullRow(hud: Hud, units: Unit[]): CardRow {
  const game = hud.g;
  const gx = hud.s.screen.g;
  let hp = 0;
  let max = 0;
  let sh = 0;
  let shMax = 0;
  for (const u of units) {
    hp += u.hp;
    max += u.maxHp;
    sh += u.sh;
    shMax += u.maxSh;
  }
  return {
    h: 8,
    draw: (x, y, w) => {
      // ("HEALTH", as the cradle calls it, is a longer word than "HULL".)
      const off = game.cradle ? textWidth('HEALTH', 'tiny') + 4 : 18;
      text(gx, 'HULL', x, y, PAL.dusk, 'tiny');
      bar(gx, x + off, y + 1, Math.min(90, w - off - 2), 2, hp / Math.max(1, max), PAL.teal, PAL.indigo);
      if (shMax > 0) bar(gx, x + off, y + 4, Math.min(90, w - off - 2), 1, sh / shMax, PAL.sky, PAL.night, undefined, 0);
      hud.ui.hint('fleet-hp', x - 1, y - 1, Math.min(90, w - off - 2) + off + 2, 8, {
        tip: `Hull ${fmt(hp)} / ${fmt(max)} (green)${shMax > 0 ? ` · shields ${fmt(sh)} / ${fmt(shMax)} (blue)` : ''}. Shields soak up damage ` +
            `first and recharge out of battle. Bastions and Starbases repair hulls.`,
      });
    },
  };
}

/** What is in the fleet: a chip for each kind of ship, with how many. A click keeps only that kind selected. */
function compositionRow(hud: Hud, counts: Map<UnitType, number>): CardRow {
  const gx = hud.s.screen.g;
  const p = hud.g.player;
  return {
    h: 13,
    draw: (x, y, w) => {
      let bx = x;
      for (const [t, c] of counts) {
        const label = `×${c}`;
        // (The chip is as wide as its ship: a Dreadnought is wider than the rest, and used to get no picture at all.)
        const spr = shipSprite(t, p.color, 0);
        // (A Starfall is taller than the chip: its sign stands for it.)
        const tall = spr.height > 10;
        const iw = tall ? 12 : Math.max(12, spr.width + 2);
        const bw = iw + 1 + textWidth(label, 'tiny');
        if (bx + bw > x + w) break;
        const id = 'comp-' + t;
        box(gx, bx, y, bw, 12, hud.ui.isHot(id) ? PAL.indigo : PAL.night, PAL.indigo);
        if (tall) icon(gx, 'starfall', bx + 4, y + 4);
        else gx.drawImage(spr, bx + Math.round(iw / 2) - (spr.width >> 1), y + 6 - (spr.height >> 1));
        text(gx, label, bx + iw, y + 4, PAL.mist, 'tiny');
        hud.ui.add({ id, x: bx, y, w: bw, h: 12, onClick: () => hud.s.selectType(t), tipTitle: `${UNITS[t].name} ×${c}`, tip: `${GLOSS_BY_ID[t]?.text ?? UNITS[t].short} Click to select only these.` });
        bx += bw + 2;
      }
    },
  };
}

export function enemyRows(hud: Hud, units: Unit[]): CardRow[] {
  const game = hud.g;
  const f = game.factions[units[0].owner];
  const rows: CardRow[] = [];
  rows.push(header(hud, game.shortName(f).toUpperCase(), PAL.bone, null, `${units.length} ${units.length === 1 ? 'SHIP' : 'SHIPS'}`, undefined, undefined, f.color));
  rows.push(para(hud, fleetSummary(units) + '.', PAL.mist, 200));
  if (units.length === 1) rows.push(para(hud, unitDesc(units[0].type, units[0].era), PAL.dusk, 200, { terms: termsIn(unitDesc(units[0].type, units[0].era), { exclude: UNITS[units[0].type].name }) }));
  rows.push(line(hud, 'SELECT YOUR FLEET, THEN RIGHT-CLICK THEM TO ATTACK', PAL.dusk));
  return rows;
}

/** What is in a fleet, in words: "3 Strikers, 2 Guardians". */
export function fleetSummary(units: Unit[]): string {
  // (By type and by age: on the cradle a Warrior and a Spearman are the same line, an age apart.)
  const counts = new Map<string, number>();
  for (const u of units) counts.set(`${u.type}|${u.era}`, (counts.get(`${u.type}|${u.era}`) ?? 0) + 1);
  return [...counts.entries()].map(([k, c]) => unitCount(c, k.split('|')[0] as UnitType, Number(k.split('|')[1]))).join(', ') || 'no ships';
}
