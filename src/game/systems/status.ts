import type { Game } from '../Game';
import { DERELICT_CLAIM_TIME, RELIC_CLAIM_TIME } from '../constants';
import { RELIC_BY_ID } from '../data/relics';
import { UNITS } from '../data/units';
import { mul } from '../mods';
import { ECON } from '../data/worlds';

export function statusTick(g: Game, dt: number) {
  for (const u of g.unitList) {
    if (u.dead) continue;
    u.lastHit += dt;
    if (u.stun > 0) u.stun -= dt;
    if (u.snare > 0) u.snare -= dt;
    if (u.temp > 0) {
      u.temp -= dt;
      if (u.temp <= 0) {
        u.dead = true;
        if (g.fxEnabled && u.node >= 0) g.fx.push({ k: 'ring', x: u.x, y: u.y, r: 14, color: g.factions[u.owner].color, node: u.node });
        continue;
      }
    }
    let aegis = false;
    if (u.buffs.length) {
      let w = 0;
      for (const b of u.buffs) {
        b.t -= dt;
        if (b.id === 'heal') u.hp = Math.min(u.maxHp, u.hp + b.v * dt);
        if (b.id === 'aegis') aegis = true;
        if (b.t > 0) u.buffs[w++] = b;
      }
      u.buffs.length = w;
    }
    const def = UNITS[u.type];
    const m = g.factions[u.owner].mods;
    if (u.sh < u.maxSh) {
      const rate = def.shieldRegen * mul(m.shieldRegen) * (u.lastHit > 4 ? 1 : 0.3) * (aegis ? 2 : 1);
      u.sh = Math.min(u.maxSh, u.sh + rate * dt);
    }
    if (u.hp < u.maxHp && !u.lane) {
      let r = (m.flags.nanite ?? 0) * u.maxHp;
      const n = u.node >= 0 ? g.nodes[u.node] : null;
      if (u.lastHit > 8) {
        r += (m.flags.fieldRepair ?? 0) * u.maxHp;
        if (n && n.owner === u.owner) r += 0.01 * u.maxHp;
      }
      if (n && n.owner === u.owner && g.hasRole(n, 'bastion')) r += ECON.bastionRepair * g.roleBonus(n, 'bastion') * u.maxHp;
      if (r > 0) u.hp = Math.min(u.maxHp, u.hp + r * dt);
    }
  }

  // Starbases repair allies in their well.
  for (const u of g.unitList) {
    if (u.dead || u.type !== 'starbase' || u.node < 0) continue;
    for (const o of g.buckets[u.node]) {
      if (o.owner === u.owner && !o.dead && o !== u && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.01 * dt);
    }
  }

  for (const n of g.nodes) {
    if (n.kind === 'planet') {
      n.lastHit += dt;
      if (n.owner < 0) {
        n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.01 * dt);
      } else {
        if (n.sh < n.maxSh) n.sh = Math.min(n.maxSh, n.sh + n.maxSh * (n.lastHit > 5 ? 0.02 : 0.004) * dt);
        if (n.lastHit > 10 && n.hp < n.maxHp) n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.008 * dt);
      }
    }
    if (n.hazard) {
      if (n.hazard.warn > 0) {
        n.hazard.warn -= dt;
      } else {
        n.hazard.t -= dt;
        for (const u of [...g.buckets[n.id]]) if (!u.dead) g.damageUnitRaw(u, n.hazard.dps * dt, -1);
        if (n.hazard.t <= 0) n.hazard = null;
      }
    }
  }

  claimsTick(g, dt);
}

function claimsTick(g: Game, dt: number) {
  for (const n of g.nodes) {
    const what: 'relic' | 'derelict' | null = n.relic ? 'relic' : n.claim?.what === 'derelict' ? 'derelict' : null;
    if (!what) continue;
    let claimant = -1;
    let contested = false;
    for (const u of g.buckets[n.id]) {
      if (u.dead || UNITS[u.type].role === 'fighter') continue;
      const f = g.factions[u.owner];
      if (f.kind === 'empire') {
        if (claimant === -1) claimant = u.owner;
        else if (claimant !== u.owner) contested = true;
      } else contested = true;
    }
    if (claimant < 0 || contested) {
      if (n.claim) {
        n.claim.f = -1;
        n.claim.t = 0;
      }
      continue;
    }
    if (!n.claim || n.claim.f !== claimant) n.claim = { what, f: claimant, t: 0 };
    n.claim.t += dt;
    const need = what === 'relic' ? RELIC_CLAIM_TIME : DERELICT_CLAIM_TIME;
    if (n.claim.t < need) continue;
    const f = g.factions[claimant];
    if (what === 'relic' && n.relic) {
      const r = RELIC_BY_ID[n.relic];
      f.relics.push(n.relic);
      n.relic = null;
      n.claim = null;
      g.recomputeMods(f);
      g.notify(-1, `${f.name} recovered ${r.name} from ${n.name}!`, f.isPlayer ? 'good' : 'event', n.id);
      if (g.fxEnabled) g.fx.push({ k: 'capture', node: n.id, color: f.color });
    } else {
      n.claim = null;
      const d = g.spawnUnit('dreadnought', f.id, n.id, { hpFrac: 0.4 });
      void d;
      g.notify(-1, `${f.name} has claimed the drifting derelict dreadnought at ${n.name}.`, f.isPlayer ? 'good' : 'event', n.id);
    }
  }
}
