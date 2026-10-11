import type { Game } from '../Game';
import { ABILITY_BY_ID, CONVERT_HULL, CONVERT_HULL_PER_LEVEL, type AbilityDef } from '../data/abilities';
import { UNITS } from '../data/units';
import type { Unit } from '../types';
import { dist } from '../util';
import { spawnProjectile } from './combat';

export function addBuff(u: Unit, id: string, t: number, v = 0) {
  for (const b of u.buffs) {
    if (b.id === id) {
      b.t = Math.max(b.t, t);
      b.v = Math.max(b.v, v);
      return;
    }
  }
  u.buffs.push({ id, t, v });
}

function enemiesInRange(g: Game, u: Unit, range: number): Unit[] {
  const out: Unit[] = [];
  for (const o of g.buckets[u.node]) {
    if (o.dead || o.lane || !g.hostile(u.owner, o.owner)) continue;
    if (dist(u.x, u.y, o.x, o.y) <= range + UNITS[o.type].radius) out.push(o);
  }
  return out;
}

function alliesInRange(g: Game, u: Unit, range: number): Unit[] {
  const out: Unit[] = [];
  for (const o of g.buckets[u.node]) {
    if (o.dead || o.lane || o.owner !== u.owner || o.type === 'fighter') continue;
    if (dist(u.x, u.y, o.x, o.y) <= range) out.push(o);
  }
  return out;
}

/**
 * Can this ship be talked round (Conversion)? A warship or a Scout of a house or of the Corsairs. Not a
 * capital ship, not a Carrier (its Fighters are its own), not a seed ship (a world is not won that
 * way), nothing that stands still, nothing of the Hollow, which hears no one.
 */
export function convertible(g: Game, u: Unit): boolean {
  const def = UNITS[u.type];
  const kind = g.factions[u.owner].kind;
  return !u.dead && !u.temp && !def.isStatic && (def.role === 'combat' || def.role === 'siege' || def.role === 'scout') && (kind === 'empire' || kind === 'pirate');
}

export function abilitiesTick(g: Game, dt: number) {
  for (const u of g.unitList) {
    if (u.dead || u.lane || u.node < 0 || u.abil.length === 0) continue;
    for (const a of u.abil) {
      if (a.cd > 0) {
        a.cd -= dt;
        continue;
      }
      if (u.stun > 0) continue;
      const def = ABILITY_BY_ID[a.id];
      if (!def) continue;
      if (tryCast(g, u, def)) {
        a.cd = def.cd;
        if (g.fxEnabled) g.fx.push({ k: 'ability', x: u.x, y: u.y, r: Math.min(def.range, 700), color: def.color, node: u.node, id: def.id });
      } else a.cd = 0.5;
    }
  }
}

function tryCast(g: Game, u: Unit, def: AbilityDef): boolean {
  const anyEnemy = g.buckets[u.node].some((o) => !o.dead && g.hostile(u.owner, o.owner));
  switch (def.id) {
    case 'aegis': {
      if (!anyEnemy) return false;
      for (const a of alliesInRange(g, u, def.range)) addBuff(a, 'aegis', 8);
      return true;
    }
    case 'barrage': {
      const es = enemiesInRange(g, u, def.range);
      if (es.length === 0) return false;
      const dmg = 50 * g.dmgMulOf(u, 'rapid');
      for (let i = 0; i < 12; i++) {
        const t = es[i % es.length];
        spawnProjectile(g, u.owner, u.id, u.x, u.y, u.node, t.id, t.x, t.y, 400, dmg, 'rapid', 'missile');
      }
      return true;
    }
    case 'nanite': {
      const hurt = alliesInRange(g, u, def.range).filter((a) => a.hp < a.maxHp * 0.75);
      if (hurt.length === 0) return false;
      for (const a of alliesInRange(g, u, def.range)) addBuff(a, 'heal', 6, (a.maxHp * 0.18) / 6);
      return true;
    }
    case 'strikewing': {
      if (!anyEnemy) return false;
      for (let i = 0; i < 6; i++) {
        const f = g.spawnUnit('fighter', u.owner, u.node, { x: u.x, y: u.y, temp: 25 });
        f.ax = u.x;
        f.ay = u.y;
        f.a = u.a + (i - 2.5) * 0.4;
      }
      return true;
    }
    case 'emp': {
      const es = enemiesInRange(g, u, def.range);
      if (es.length === 0) return false;
      let shields = 0;
      let light = 0;
      for (const e of es) {
        shields += e.sh;
        const ac = UNITS[e.type].armorClass;
        if (ac === 'light' || ac === 'strike') light++;
      }
      if (shields < 500 && light === 0) return false;
      for (const e of es) {
        e.sh = Math.max(0, e.sh - 900);
        const ac = UNITS[e.type].armorClass;
        if (ac === 'light' || ac === 'strike') e.stun = Math.max(e.stun, 3);
      }
      return true;
    }
    case 'conversion': {
      // The weakest first, as many as the Ark can turn: those nearest to breaking are the first to listen.
      let left = CONVERT_HULL + CONVERT_HULL_PER_LEVEL * (u.level - 1);
      const es = enemiesInRange(g, u, def.range)
        .filter((e) => convertible(g, e) && UNITS[e.type].hull <= left)
        .sort((a, b) => a.hp - b.hp || a.id - b.id);
      const turned: Unit[] = [];
      for (const e of es) {
        if (UNITS[e.type].hull > left) continue;
        left -= UNITS[e.type].hull;
        turned.push(e);
      }
      if (turned.length === 0) return false;
      g.convertUnits(turned, u.owner, u);
      return true;
    }
    case 'phaselance': {
      const es = enemiesInRange(g, u, def.range).filter((e) => UNITS[e.type].role !== 'fighter');
      if (es.length === 0) return false;
      let best = es[0];
      for (const e of es) if (e.maxHp > best.maxHp) best = e;
      spawnProjectile(g, u.owner, u.id, u.x, u.y, u.node, best.id, best.x, best.y, 2400, 900 * g.dmgMulOf(u, 'lance'), 'lance', 'lance');
      return true;
    }
    case 'overdrive': {
      if (u.target === 0) return false;
      addBuff(u, 'overdrive', 8);
      return true;
    }
    case 'rally': {
      if (!anyEnemy) return false;
      const allies = g.buckets[u.node].filter((o) => o.owner === u.owner && !o.dead && o.type !== 'fighter');
      if (allies.length < 3) return false;
      for (const a of allies) addBuff(a, 'rally', 10);
      return true;
    }
    case 'snare': {
      const es = enemiesInRange(g, u, def.range).filter((e) => !UNITS[e.type].isStatic && e.type !== 'fighter');
      if (es.length === 0) return false;
      for (const e of es) e.snare = Math.max(e.snare, 15);
      // (Said over the Ark, so that the player sees it took hold and on how many.)
      if (g.fxEnabled) g.fx.push({ k: 'text', x: u.x, y: u.y - 24, text: `SNARED ${es.length}`, color: def.color, node: u.node });
      return true;
    }
    case 'voidpulse': {
      const es = enemiesInRange(g, u, def.range);
      if (es.length === 0) return false;
      const dmg = 120 * g.dmgMulOf(u, 'energy');
      for (const e of es) g.damageUnit(e, dmg, 'energy', u.owner, u);
      return true;
    }
    case 'repairdrones': {
      if (u.hp > u.maxHp * 0.6) return false;
      addBuff(u, 'heal', 6, (u.maxHp * 0.25) / 6);
      return true;
    }
  }
  return false;
}
