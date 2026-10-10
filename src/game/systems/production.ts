import type { Game } from '../Game';
import { UNITS } from '../data/units';
import { HEIR_BY_ID } from '../data/heirs';
import { mul } from '../mods';
import type { UnitType } from '../types';
import { roman, TAU } from '../util';

/** Seconds an older unit must rest in one of its house's lands to be re-armed for the house's age. */
export const REARM_TIME = 20;

/** Ages, on the cradle: houses take their steps through the ages, and older units at home are re-armed. */
function agesTick(g: Game, dt: number) {
  for (const f of g.factions) {
    if (f.kind !== 'empire' || !f.alive || !f.advance || f.capital < 0) continue;
    // The work stands still while the Hearth is under attack.
    if (g.nodes[f.capital].lastHit < 5) continue;
    f.advance.t += dt;
    if (f.advance.t >= f.advance.total) g.completeAdvance(f);
  }
  if (g.tick % 20 !== 7) return;
  for (const u of g.unitList) {
    if (u.dead || u.node < 0) continue;
    const f = g.factions[u.owner];
    if (f.kind !== 'empire' || u.era >= f.era) continue;
    if (g.nodes[u.node].owner !== u.owner || u.lastHit < 10) {
      u.rearm = 0;
      continue;
    }
    u.rearm = (u.rearm ?? 0) + 1;
    if (u.rearm < REARM_TIME) continue;
    u.era = f.era;
    u.rearm = 0;
    g.refreshUnitStats(u);
    if (g.fxEnabled) g.fx.push({ k: 'ring', x: u.x, y: u.y, r: UNITS[u.type].radius * 2.5, color: f.color, node: u.node });
  }
}

export function productionTick(g: Game, dt: number) {
  if (g.cradle) agesTick(g, dt);
  for (const n of g.nodes) {
    if (n.owner < 0 || n.kind !== 'planet') continue;
    const f = g.factions[n.owner];
    if (f.kind !== 'empire') continue;
    const m = f.mods;

    if (n.shipQ.length) {
      const it = n.shipQ[0];
      const forge = g.forgeMul(n);
      if (forge > 0) {
        const type = it.id as UnitType;
        it.t += dt * mul(m.build, 0.2) * forge * mul(m.unit[type]?.build ?? 0, 0.2);
        if (it.t >= it.total) {
          n.shipQ.shift();
          const u = g.spawnUnit(type, f.id, n.id);
          f.stats.shipsBuilt++;
          if (g.fxEnabled) g.fx.push({ k: 'ring', x: u.x, y: u.y, r: UNITS[type].radius * 2.5, color: f.color, node: n.id });
          if (it.kind === 'ark') {
            g.notify(f.id, `Your Ark, the ${HEIR_BY_ID[f.heir]?.arkName ?? ''}, has been rebuilt!`, 'good', n.id);
          } else if (type === 'scout' && !f.isPlayer) {
            // Rival scouts go exploring; the player's follow the rally point like any other ship.
            u.order = 'explore';
          } else if (n.rally >= 0 && n.rally !== n.id) {
            g.cmdMove(f.id, [u.id], n.rally);
          }
        }
      }
    }

    if (n.buildQ.length) {
      const it = n.buildQ[0];
      const speed = it.kind === 'upgrade' ? mul(m.flags.upgradeSpeed ?? 0, 0.2) : mul(m.build, 0.2);
      it.t += dt * speed;
      if (it.t >= it.total) {
        n.buildQ.shift();
        if (it.kind === 'upgrade') {
          g.setLevel(n, n.level + 1);
          g.notify(f.id, `${n.name} rose to level ${roman(n.level)}.`, 'info', n.id);
          if (g.fxEnabled) g.fx.push({ k: 'ring', x: n.x, y: n.y, r: n.r + 40, color: f.color, node: n.id });
        } else if (it.kind === 'starbase') {
          const a = (n.seed % 628) / 100;
          const rad = n.r + 240;
          const u = g.spawnUnit('starbase', f.id, n.id, { x: n.x + Math.cos(a) * rad, y: n.y + Math.sin(a) * rad });
          u.a = a;
          g.notify(f.id, `A Starbase now guards ${n.name}.`, 'info', n.id);
        } else if (it.kind === 'gate') {
          const a = ((n.seed % 360) / 360) * TAU;
          const rad = n.r + 280;
          const u = g.spawnUnit('gate', f.id, n.id, { x: n.x + Math.cos(a) * rad, y: n.y + Math.sin(a) * rad });
          f.gate = { node: n.id, charge: 0, unit: u.id };
          g.notify(-1, `${f.name}'s Starfire Gate at ${n.name} stands complete and is charging!`, f.isPlayer ? 'good' : 'alert', n.id);
        }
      }
    }
  }
}
