import type { Game } from '../Game';
import { DMG_TABLE, UNITS } from '../data/units';
import type { DmgType, GNode, Projectile, Unit, WeaponDef } from '../types';
import { dist } from '../util';
import { targetPos } from './movement';

export function combatTick(g: Game, dt: number) {
  for (let nid = 0; nid < g.nodes.length; nid++) {
    const b = g.buckets[nid];
    if (b.length === 0) continue;
    const node = g.nodes[nid];
    let first = -2;
    let mixed = false;
    for (const u of b) {
      if (u.dead) continue;
      if (first === -2) first = u.owner;
      else if (u.owner !== first) {
        mixed = true;
        break;
      }
    }
    const planetOwned = node.kind === 'planet' && node.owner >= 0;
    const planetContested = planetOwned && first !== -2 && (mixed || g.hostile(first, node.owner));
    if (!mixed && !planetContested) {
      for (const u of b) {
        u.target = 0;
        if (UNITS[u.type].fighters) carrierRebuild(g, u, dt);
      }
      continue;
    }
    for (const u of b) {
      if (u.dead || u.lane) continue;
      const def = UNITS[u.type];
      if (def.fighters) carrierTick(g, u, b, dt);
      if (!def.weapons.length) continue;
      if (u.stun > 0) continue;
      u.retarget -= dt;
      if (u.retarget <= 0 || !validTarget(g, u)) {
        followAttackOrder(g, u);
        pickTarget(g, u, b, node);
        u.retarget = 0.7 + g.rng.next() * 0.5;
      }
      const rof = g.rofOf(u);
      if (u.target === 0) {
        for (let i = 0; i < u.wcd.length; i++) if (u.wcd[i] > 0) u.wcd[i] -= dt * rof;
        continue;
      }
      const tp = targetPos(g, u);
      if (!tp) {
        u.target = 0;
        continue;
      }
      const d = dist(u.x, u.y, tp.x, tp.y) - tp.r;
      for (let i = 0; i < def.weapons.length; i++) {
        if (u.wcd[i] > 0) u.wcd[i] -= dt * rof;
        if (u.wcd[i] > 0) continue;
        const w = def.weapons[i];
        if (d > g.rangeOf(u, w)) continue;
        fire(g, u, w, u.target, tp.x, tp.y);
        u.wcd[i] = w.cooldown * (0.92 + g.rng.next() * 0.16);
      }
    }
    if (planetOwned) planetGunTick(g, node, b, dt);
  }
}

function validTarget(g: Game, u: Unit): boolean {
  if (u.target > 0) {
    const t = g.units.get(u.target);
    return !!t && !t.dead && t.node === u.node && g.hostile(u.owner, t.owner);
  }
  if (u.target < 0) {
    const n = g.nodes[-u.target - 1];
    return !!n && n.id === u.node && n.owner >= 0 && g.hostile(u.owner, n.owner);
  }
  return false;
}

/** Units with an explicit attack order follow their target across lanes. */
function followAttackOrder(g: Game, u: Unit) {
  if (u.order !== 'attack' || u.orderTarget <= 0) return;
  const t = g.units.get(u.orderTarget);
  if (!t || t.dead) {
    u.order = 'idle';
    u.orderTarget = -1;
    return;
  }
  if (t.node >= 0 && t.node !== u.node && u.path.length === 0 && !u.lane) {
    const f = g.factions[u.owner];
    if (f.visible[t.node] || f.kind !== 'empire') g.cmdAttack(u.owner, [u.id], t.id);
  }
}

function pickTarget(g: Game, u: Unit, b: Unit[], node: GNode) {
  const def = UNITS[u.type];
  const range = g.maxRangeOf(u);
  const primary: DmgType = def.weapons[0].type;
  let best = 0;
  let bs = 0;
  for (const o of b) {
    if (o.dead || o.lane || !g.hostile(u.owner, o.owner) || g.slips(o)) continue;
    const od = UNITS[o.type];
    if (DMG_TABLE[primary][od.armorClass] <= 0.01) continue;
    const d = dist(u.x, u.y, o.x, o.y) - od.radius;
    if (def.isStatic && d > range) continue;
    const idx = def.prefers.indexOf(od.armorClass);
    const w = idx < 0 ? 0.12 : 1 / (1 + idx * 0.7);
    const df = 1 / (1 + Math.max(0, d - range) / 250);
    const hf = 1 + (1 - o.hp / Math.max(1, o.maxHp)) * 0.4;
    let s = w * df * hf;
    if (o.id === u.target) s *= 1.35;
    if (o.id === u.orderTarget) s *= 5;
    if (s > bs) {
      bs = s;
      best = o.id;
    }
  }
  // Ships only passing through a world (they have further jumps queued) do not stop to besiege it.
  if (node.kind === 'planet' && node.owner >= 0 && g.hostile(u.owner, node.owner) && u.path.length === 0 && def.planetWeight !== 0 && !g.holdsFire(u.owner, node.owner)) {
    const d = dist(u.x, u.y, node.x, node.y) - node.r;
    if (!(def.isStatic && d > range)) {
      const fk = g.factions[u.owner].kind;
      let w = def.planetWeight ?? 0.2;
      if (fk === 'crisis') w = Math.max(w, 0.45);
      const df = 1 / (1 + Math.max(0, d - range) / 250);
      let s = w * df;
      if (u.target === -(node.id + 1)) s *= 1.35;
      if (s > bs) {
        bs = s;
        best = -(node.id + 1);
      }
    }
  }
  u.target = best;
}

export function fire(g: Game, u: Unit, w: WeaponDef, tgt: number, tx: number, ty: number) {
  const dmg = w.damage * g.dmgMulOf(u, w.type);
  if (w.proj === 'beam') {
    applyHit(g, tgt, dmg, w.type, u.owner, u);
    if (g.fxEnabled) {
      // Visual-only jitter: must never consume the simulation RNG.
      const jx = (Math.random() - 0.5) * 14;
      const jy = (Math.random() - 0.5) * 14;
      g.fx.push({ k: 'beam', x1: u.x, y1: u.y, x2: tx + jx, y2: ty + jy, color: g.factions[u.owner].color, w: Math.min(4, 0.8 + w.damage / 20), node: u.node });
    }
    return;
  }
  const count = w.count ?? 1;
  for (let k = 0; k < count; k++) {
    spawnProjectile(g, u.owner, u.id, u.x, u.y, u.node, tgt, tx, ty, w.speed ?? 800, dmg, w.type, w.proj);
  }
  if (g.fxEnabled && w.proj !== 'missile') g.fx.push({ k: 'shot', x: u.x, y: u.y, color: g.factions[u.owner].color, node: u.node, kind: w.proj });
}

export function spawnProjectile(
  g: Game, owner: number, src: number, x: number, y: number, node: number, tgt: number, tx: number, ty: number,
  speed: number, dmg: number, type: DmgType, kind: Projectile['kind'],
) {
  g.projectiles.push({
    id: g.nextId++, owner, src, x, y, px: x, py: y, tgt, tx, ty, speed, dmg, type, kind, node,
    life: kind === 'missile' ? 5 : 3.2, wob: g.rng.float(-1, 1),
  });
}

export function applyHit(g: Game, tgt: number, dmg: number, type: DmgType, owner: number, src: Unit | null) {
  if (tgt > 0) {
    const t = g.units.get(tgt);
    if (t && !t.dead) g.damageUnit(t, dmg, type, owner, src && !src.dead ? src : null);
  } else if (tgt < 0) {
    const n = g.nodes[-tgt - 1];
    if (n && n.owner >= 0 && g.hostile(owner, n.owner)) g.damagePlanet(n, dmg, type, owner);
  }
}

export function projectileTick(g: Game, dt: number) {
  let alive = 0;
  const list = g.projectiles;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    let hitR = 6;
    let valid = false;
    if (p.tgt > 0) {
      const t = g.units.get(p.tgt);
      if (t && !t.dead && t.node === p.node) {
        p.tx = t.x;
        p.ty = t.y;
        hitR = UNITS[t.type].radius;
        valid = true;
      }
    } else if (p.tgt < 0) {
      const n = g.nodes[-p.tgt - 1];
      p.tx = n.x;
      p.ty = n.y;
      hitR = n.r;
      valid = true;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = p.speed * dt;
    p.life -= dt;
    if (d <= step + hitR * 0.6) {
      if (valid) {
        const src = p.src > 0 ? (g.units.get(p.src) ?? null) : null;
        applyHit(g, p.tgt, p.dmg, p.type, p.owner, src);
      }
      continue;
    }
    if (p.life <= 0) continue;
    let mx = (dx / d) * step;
    let my = (dy / d) * step;
    if (p.kind === 'missile' && d > 80) {
      const wob = Math.sin(p.life * 7 + p.wob * 3) * p.wob * 0.6;
      mx += (-dy / d) * step * wob;
      my += (dx / d) * step * wob;
    }
    p.x += mx;
    p.y += my;
    list[alive++] = p;
  }
  list.length = alive;
}

function planetGunTick(g: Game, node: GNode, b: Unit[], dt: number) {
  const gun = g.worldGun(node);
  if (!gun) return;
  node.gunCd -= dt;
  if (node.gunCd > 0) return;
  let best: Unit | null = null;
  let bd = Infinity;
  for (const o of b) {
    if (o.dead || o.lane || !g.hostile(node.owner, o.owner) || g.slips(o)) continue;
    const d = dist(node.x, node.y, o.x, o.y);
    if (d < gun.range && d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best) {
    node.gunCd = 0.25;
    return;
  }
  const a = Math.atan2(best.y - node.y, best.x - node.x);
  const sx = node.x + Math.cos(a) * node.r;
  const sy = node.y + Math.sin(a) * node.r;
  spawnProjectile(g, node.owner, 0, sx, sy, node.id, best.id, best.x, best.y, 1100, gun.dmg, 'energy', 'bolt');
  if (g.fxEnabled) g.fx.push({ k: 'shot', x: sx, y: sy, color: g.factions[node.owner].color, node: node.id, kind: 'bolt' });
  node.gunCd = gun.cd;
}

function carrierRebuild(g: Game, u: Unit, dt: number) {
  const cap = (UNITS[u.type].fighters ?? 0) + g.factions[u.owner].mods.fighters;
  if (u.fighters + u.launched < cap) {
    u.fighterTimer += dt;
    if (u.fighterTimer >= 6) {
      u.fighterTimer = 0;
      u.fighters++;
    }
  }
}

function carrierTick(g: Game, u: Unit, b: Unit[], dt: number) {
  carrierRebuild(g, u, dt);
  if (u.fighters <= 0 || u.path.length > 0 || u.stun > 0) return;
  if ((g.tick + u.id) % 8 !== 0) return;
  let enemies = false;
  for (const o of b) {
    if (!o.dead && g.hostile(u.owner, o.owner)) {
      enemies = true;
      break;
    }
  }
  if (!enemies) return;
  const f = g.spawnUnit('fighter', u.owner, u.node, { x: u.x, y: u.y, parent: u.id });
  f.a = u.a + (g.rng.next() - 0.5) * 2;
  u.fighters--;
  u.launched++;
}
