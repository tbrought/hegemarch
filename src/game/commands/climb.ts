/**
 * Commands of an Ages run on its cradle: the step to the next age, and at the last, the Ark that
 * leaves for the stars.
 */

import { darken } from '../conquest';
import { ERAS, LAST_CRADLE_ERA, SPACE, UPGRADE_MAX, UPGRADE_SPREAD } from '../data/eras';
import type { Faction, QueueCheck } from '../types';
import type { Game } from '../Game';
import { cannotPay, WHY } from './checks';
import { dhypot } from '../dmath';

/** Why this house cannot take the step to the next age (or, from the last one, build its Ark), or null if it can. */
export function checkAdvance(g: Game, fid: number): QueueCheck {
  const f = g.factions[fid];
  if (!g.cradle || !f || f.kind !== 'empire' || !f.alive) return 'Only on the cradle';
  if (f.capital < 0) return 'No Hearth';
  if (f.advance) return f.era === LAST_CRADLE_ERA ? 'The Ark is rising' : 'Already under way';
  const era = ERAS[f.era];
  if (f.lore < era.lore - 1e-6) return 'Not enough Lore';
  if (cannotPay(f, era.cost)) return WHY.embers;
  return null;
}

/**
 * Take the step to the next age: it spends the Lore gathered in this one and Embers, and takes time at the
 * Hearth (which stands still while the Hearth is under attack). From the last age of the cradle the step is the Ark.
 */
export function cmdAdvance(g: Game, fid: number): boolean {
  if (g.checkAdvance(fid)) return false;
  const f = g.factions[fid];
  const era = ERAS[f.era];
  f.lore -= era.lore;
  f.embers -= era.cost;
  f.advance = { t: 0, total: era.time, lore: era.lore, cost: era.cost };
  if (f.era === LAST_CRADLE_ERA) {
    g.notify(-1, f.isPlayer ? 'Your Ark is rising at your Hearth. Guard it: the work stops while the Hearth is under attack.' : `${f.name} has begun building its Ark!`, f.isPlayer ? 'good' : 'alert', f.capital, false,
      f.isPlayer ? undefined : { title: 'AN ARK IS RISING', sub: `${g.shortName(f)} is building one at its Hearth.`, tone: 'house', fid: f.id });
  }
  return true;
}

/** Call the step off: the Lore and the Embers come back. */
export function cmdCancelAdvance(g: Game, fid: number): boolean {
  const f = g.factions[fid];
  if (!f?.advance) return false;
  f.lore += f.advance.lore;
  f.embers += f.advance.cost;
  f.advance = null;
  return true;
}

/** The step is done: a new age begins, or (from the last age of the cradle) the Ark leaves for the stars. */
export function completeAdvance(g: Game, f: Faction) {
  f.advance = null;
  if (f.era >= LAST_CRADLE_ERA) {
    launchArk(g, f);
    return;
  }
  f.era++;
  const era = ERAS[f.era];
  // Walls and guns are as strong as the age: refresh them.
  g.recomputeMods(f);
  // So is every unit the house has, wherever it stands. The change spreads outward from the Hearth:
  // each unit is upgraded when it reaches the unit (see `agesTick`), the nearest first.
  const home = f.capital >= 0 ? g.nodes[f.capital] : null;
  let reach = 0;
  for (const u of g.unitList) {
    if (u.dead || u.owner !== f.id || u.era >= f.era) continue;
    const far = home ? dhypot(u.x - home.x, u.y - home.y) : 0;
    u.rearm = Math.min(UPGRADE_MAX, far / UPGRADE_SPREAD);
    reach = Math.max(reach, Math.min(UPGRADE_MAX * UPGRADE_SPREAD, far));
  }
  if (g.fxEnabled && home && reach > 0) g.fx.push({ k: 'wave', x: home.x, y: home.y, r: reach, dur: reach / UPGRADE_SPREAD, color: f.color, node: home.id });
  f.pendingDrafts++;
  if (g.fxEnabled && f.capital >= 0) g.fx.push({ k: 'capture', node: f.capital, color: f.color });
  if (f.isPlayer) {
    g.notify(f.id, `The ${era.name} begins! All your units are upgraded. ${era.brings} A Boon of the new age awaits. (B)`, 'good', f.capital, true,
      { title: `THE ${era.name.toUpperCase()}`, sub: 'All your units are upgraded. A Boon of the new age awaits.', tone: 'gold' });
  }
  else g.notify(-1, `${f.name} has entered the ${era.name}.`, 'info', g.player.explored[f.capital] ? f.capital : undefined);
}

/** A house's Ark leaves the cradle. The player's: the run goes on among the stars. A rival's: it is gone ahead. */
function launchArk(g: Game, f: Faction) {
  f.launchedAt = g.time;
  f.era = SPACE;
  if (f.isPlayer) {
    g.ascended = true;
    return;
  }
  // Its people go with it: its lands fall dark, open to whoever kindles them next.
  const lands = g.worldsOf(f.id).length;
  f.alive = false;
  for (const n of g.nodes) {
    if (n.capitalOf === f.id) n.capitalOf = -1;
    if (n.owner === f.id) darken(g, n);
  }
  for (const u of g.unitList) if (u.owner === f.id && !u.dead) g.deferred.push(() => g.removeUnit(u));
  f.capital = -1;
  g.notify(-1, `The Ark of ${f.name} has left for the stars. Its ${lands} lands lie dark: kindle them, and hurry after it.`, 'alert', undefined, true,
    { title: 'AN ARK HAS LEFT', sub: `${g.shortName(f)} is gone to the stars. Its lands lie dark.`, tone: 'house', fid: f.id });
}
