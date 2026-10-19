import type { Game } from '../Game';
import { FIRE_SPOOL, UNDER_FIRE } from '../constants';
import { ECON } from '../data/worlds';
import { fights, fixed, UNITS } from '../data/units';
import { mul } from '../mods';
import { burning } from '../starfall';
import type { Unit, UnitDef } from '../types';
import { clamp, dist, turnToward } from '../util';
import { datan2, dcos, dhypot, dsin } from '../dmath';

/** Deterministic per-unit pseudo random in [0,1). */
function uhash(id: number, salt: number): number {
  let h = (id * 374761393 + salt * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function targetPos(g: Game, u: Unit): { x: number; y: number; r: number } | null {
  if (u.target > 0) {
    const t = g.units.get(u.target);
    if (!t || t.dead || t.node !== u.node) return null;
    return { x: t.x, y: t.y, r: UNITS[t.type].radius };
  }
  if (u.target < 0) {
    const n = g.nodes[-u.target - 1];
    if (!n || n.id !== u.node) return null;
    return { x: n.x, y: n.y, r: n.r };
  }
  return null;
}

export function movementTick(g: Game, dt: number) {
  for (const u of g.unitList) {
    if (u.dead) continue;
    const def = UNITS[u.type];
    if (u.lane) {
      transit(g, u, dt);
      continue;
    }
    if (fixed(u)) {
      const tp = targetPos(g, u);
      if (tp) u.a = turnToward(u.a, datan2(tp.y - u.y, tp.x - u.x), def.turn * dt);
      else u.a += dt * 0.05;
      continue;
    }
    if (u.stun > 0) {
      u.vx *= 0.92;
      u.vy *= 0.92;
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      continue;
    }
    if (u.type === 'fighter') {
      fighterMove(g, u, def, dt);
      continue;
    }
    u.wellTime += dt;
    if (u.order === 'explore' && u.path.length > 0) {
      const f = g.factions[u.owner];
      // A Scout sees the places next door. Once the place it is bound for is in sight, it is
      // charted: the Scout does not fly in, it picks the next one. And it looks before the leap:
      // if the next place on its way is guarded now, it thinks again (even with its drive spooling).
      if (f.explored[u.dest] || (!f.ai && g.seenGuarded(f, u.path[0]))) {
        u.path = [];
        u.dest = -1;
        u.charge = -1;
      }
    }
    if (u.order === 'explore' && u.path.length === 0 && u.charge < 0) pickExploreTarget(g, u);
    if (u.path.length > 0) {
      // (Nothing flies into a burning star by itself: a ship waits where it is until the fire is out,
      // and goes on then. Only a house's own order sends it through.)
      if (!u.fire && burning(g.nodes[u.path[0]])) u.charge = -1;
      else if (u.charge < 0) u.charge = g.jumpChargeOf(u);
      else if (u.snare <= 0) {
        // (Under fire the drive spools at half speed: running from a fight costs time.)
        u.charge -= dt * (u.lastHit < UNDER_FIRE ? FIRE_SPOOL : 1);
        if (u.charge <= 0) {
          startJump(g, u);
          continue;
        }
      }
    }
    if (u.type === 'seed' && u.order === 'kindle') kindleStep(g, u, dt);
    steer(g, u, def, dt);
  }
  separation(g);
}

function startJump(g: Game, u: Unit) {
  const to = u.path.shift()!;
  const from = u.node;
  const fromN = g.nodes[from];
  const toN = g.nodes[to];
  const back = datan2(fromN.y - toN.y, fromN.x - toN.x);
  const ea = back + (uhash(u.id, 1) - 0.5) * 0.8;
  const er = toN.well * (0.6 + uhash(u.id, 2) * 0.2);
  const ex = toN.x + dcos(ea) * er;
  const ey = toN.y + dsin(ea) * er;
  const len = dist(u.x, u.y, ex, ey);
  const dur = Math.max(1, len / g.laneSpeedOf(u));
  if (g.fxEnabled && !g.cradle) g.fx.push({ k: 'jumpOut', x: u.x, y: u.y, a: datan2(ey - u.y, ex - u.x), node: from, color: g.factions[u.owner].color });
  u.lane = { from, to, t: 0, dur, sx: u.x, sy: u.y, ex, ey };
  u.node = -1;
  u.charge = -1;
  u.target = 0;
  u.kindle = 0;
  u.a = datan2(ey - u.y, ex - u.x);
  const jd = g.factions[u.owner].mods.flags.jumpDamage ?? 0;
  if (jd > 0) {
    u.hp -= u.maxHp * jd;
    if (u.hp <= 1) u.hp = 1;
  }
  // Recall fighters
  if (u.launched > 0) {
    for (const o of g.unitList) {
      if (o.parent === u.id && !o.dead) {
        o.dead = true;
        u.fighters++;
      }
    }
    u.launched = 0;
  }
}

function transit(g: Game, u: Unit, dt: number) {
  const L = u.lane!;
  L.t += dt / L.dur;
  const t = Math.min(1, L.t);
  const k = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  u.x = L.sx + (L.ex - L.sx) * k;
  u.y = L.sy + (L.ey - L.sy) * k;
  u.a = datan2(L.ey - L.sy, L.ex - L.sx);
  if (L.t >= 1) arrive(g, u);
}

function arrive(g: Game, u: Unit) {
  const L = u.lane!;
  const n = g.nodes[L.to];
  u.node = L.to;
  u.lane = null;
  u.x = L.ex;
  u.y = L.ey;
  const a = datan2(L.ey - L.sy, L.ex - L.sx);
  const s = g.speedOf(u);
  u.vx = dcos(a) * s * 0.6;
  u.vy = dsin(a) * s * 0.6;
  u.arrivedAt = g.time;
  u.wellTime = 0;
  g.buckets[u.node].push(u);
  if (g.fxEnabled && !g.cradle) g.fx.push({ k: 'jumpIn', x: u.x, y: u.y, a, node: u.node, color: g.factions[u.owner].color });
  if (u.path.length === 0) {
    // An explicit point only counts at the world it was given for (not after a stop or a new order).
    if (!isNaN(u.ox) && dhypot(u.ox - n.x, u.oy - n.y) < n.r + 900) {
      u.ax = u.ox;
      u.ay = u.oy;
    } else {
      const j = (uhash(u.id, 3) - 0.5) * 90;
      const j2 = (uhash(u.id, 4) - 0.5) * 90;
      u.ax = n.x + (L.ex - n.x) * 0.55 + j;
      u.ay = n.y + (L.ey - n.y) * 0.55 + j2;
    }
    if (u.order === 'move' || u.order === 'retreat') u.order = 'idle';
    // (Only where it was set: a field written to every ship that arrives would give the ships of one game many shapes,
    // and every loop over them would be slower for it. And deleted, not set to undefined: see `ownStarfall` in ai.ts.)
    if (u.fire) delete u.fire;
  } else {
    u.ax = u.x;
    u.ay = u.y;
  }
}

function canChase(u: Unit, def: UnitDef): boolean {
  if (u.path.length > 0) return false;
  if (def.role === 'seed' || def.role === 'scout') return false;
  return u.order === 'idle' || u.order === 'attack';
}

function prefRange(g: Game, u: Unit, def: UnitDef): number {
  if (def.role === 'carrier') return 420;
  return g.maxRangeOf(u) * 0.75;
}

function steer(g: Game, u: Unit, def: UnitDef, dt: number) {
  const spd = g.speedOf(u);
  let dvx = 0;
  let dvy = 0;
  let faceA: number | null = null;
  const tp = targetPos(g, u);
  if (u.path.length > 0) {
    const nx = g.nodes[u.path[0]];
    faceA = datan2(nx.y - u.y, nx.x - u.x);
  } else if (tp && canChase(u, def)) {
    const dx = tp.x - u.x;
    const dy = tp.y - u.y;
    const d = dhypot(dx, dy) || 1;
    const pref = prefRange(g, u, def) + tp.r;
    if (d > pref) {
      dvx = (dx / d) * spd;
      dvy = (dy / d) * spd;
    } else {
      const s = u.id % 2 ? 1 : -1;
      const radial = clamp((d - pref * 0.8) / pref, -1, 1) * spd * 0.6;
      dvx = (-dy / d) * s * spd * 0.42 + (dx / d) * radial;
      dvy = (dx / d) * s * spd * 0.42 + (dy / d) * radial;
    }
    // A fight stays in its world's well: two lone ships that circled each other the same way slid off together
    // across the void for good (the fuzzer found a pair 4000 out, 1.27). Past half again the well, a ship is
    // drawn back toward the world, the farther the harder.
    if (u.node >= 0) {
      const n = g.nodes[u.node];
      const ox = n.x - u.x;
      const oy = n.y - u.y;
      const od = dhypot(ox, oy) || 1;
      const out = od - n.well * 1.5;
      if (out > 0) {
        const k = Math.min(1, out / n.well) * spd;
        dvx += (ox / od) * k;
        dvy += (oy / od) * k;
      }
    }
    faceA = datan2(dy, dx);
  } else {
    const dx = u.ax - u.x;
    const dy = u.ay - u.y;
    const d = dhypot(dx, dy);
    if (d > 6) {
      const s = Math.min(spd, d * 1.1);
      dvx = (dx / d) * s;
      dvy = (dy / d) * s;
    }
    if (tp) faceA = datan2(tp.y - u.y, tp.x - u.x);
  }
  const accel = spd * (def.radius < 12 ? 2.2 : 1.3) * dt;
  let ax = dvx - u.vx;
  let ay = dvy - u.vy;
  const al = dhypot(ax, ay);
  if (al > accel) {
    ax *= accel / al;
    ay *= accel / al;
  }
  u.vx += ax;
  u.vy += ay;
  u.x += u.vx * dt;
  u.y += u.vy * dt;
  const sp = dhypot(u.vx, u.vy);
  const want = sp > spd * 0.3 ? datan2(u.vy, u.vx) : (faceA ?? u.a);
  u.a = turnToward(u.a, want, def.turn * dt);
}

function fighterMove(g: Game, u: Unit, def: UnitDef, dt: number) {
  const parent = u.parent > 0 ? g.units.get(u.parent) : undefined;
  if (u.parent > 0 && (!parent || parent.dead || parent.lane || parent.node !== u.node)) {
    // Carrier left or died: fighters return to the hangar instantly (or are lost).
    u.dead = true;
    if (parent && !parent.dead) {
      parent.fighters++;
      parent.launched = Math.max(0, parent.launched - 1);
    }
    return;
  }
  const spd = g.speedOf(u);
  const tp = targetPos(g, u);
  let tx: number;
  let ty: number;
  if (tp) {
    // Strafing runs: aim at a point that circles the target.
    const ang = g.time * 1.6 + (u.id % 7);
    tx = tp.x + dcos(ang) * (tp.r + 45);
    ty = tp.y + dsin(ang) * (tp.r + 45);
  } else if (parent) {
    tx = parent.x;
    ty = parent.y;
    if (dist(u.x, u.y, tx, ty) < UNITS[parent.type].radius + 8) {
      u.dead = true;
      parent.fighters++;
      parent.launched = Math.max(0, parent.launched - 1);
      return;
    }
  } else {
    tx = u.ax;
    ty = u.ay;
  }
  const dx = tx - u.x;
  const dy = ty - u.y;
  const want = datan2(dy, dx);
  u.a = turnToward(u.a, want, def.turn * dt);
  u.vx = dcos(u.a) * spd;
  u.vy = dsin(u.a) * spd;
  u.x += u.vx * dt;
  u.y += u.vy * dt;
}

function separation(g: Game) {
  for (let nid = 0; nid < g.buckets.length; nid++) {
    const b = g.buckets[nid];
    const n = b.length;
    if (n < 2) continue;
    if (n > 90 && (g.tick + nid) % 2 === 1) continue;
    for (let i = 0; i < n; i++) {
      const a = b[i];
      if (a.dead || a.lane || a.type === 'fighter') continue;
      const ra = UNITS[a.type].radius;
      const sa = !!UNITS[a.type].isStatic;
      for (let j = i + 1; j < n; j++) {
        const c = b[j];
        if (c.dead || c.lane || c.type === 'fighter') continue;
        const sc = !!UNITS[c.type].isStatic;
        if (sa && sc) continue;
        const rr = (ra + UNITS[c.type].radius) * 1.1 + 4;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (rr - d) * 0.5;
        const ux = d2 > 0 ? dx / d : 1;
        const uy = d2 > 0 ? dy / d : 0;
        if (sa) {
          c.x += ux * push * 2;
          c.y += uy * push * 2;
        } else if (sc) {
          a.x -= ux * push * 2;
          a.y -= uy * push * 2;
        } else {
          a.x -= ux * push;
          a.y -= uy * push;
          c.x += ux * push;
          c.y += uy * push;
        }
      }
    }
    // Keep ships out of planet/star bodies.
    const node = g.nodes[nid];
    for (const u of b) {
      if (u.dead || u.lane || fixed(u)) continue;
      const minR = node.r + UNITS[u.type].radius + 6;
      const dx = u.x - node.x;
      const dy = u.y - node.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minR * minR) {
        const d = Math.sqrt(d2) || 1;
        u.x = node.x + (dx / d) * minR;
        u.y = node.y + (dy / d) * minR;
      }
    }
  }
}

function kindleStep(g: Game, u: Unit, dt: number) {
  const tid = u.orderTarget;
  if (u.node !== tid || u.path.length) return;
  const n = g.nodes[tid];
  if (n.owner !== -1 || n.kind !== 'planet') {
    u.order = 'idle';
    u.kindle = 0;
    // (Two houses' seed ships at one dark world both kindle it, and the first to finish has it.)
    const first = n.owner >= 0 && n.owner !== u.owner ? g.factions[n.owner] : null;
    if (first) g.notify(u.owner, `${first.name} kindled ${n.name} first. Your seed ship waits there: its next KINDLE is free.`, 'bad', tid);
    else g.notify(u.owner, `Kindling ${n.name} stopped: the world is no longer dark.`, 'info', tid);
    return;
  }
  const a = datan2(u.y - n.y, u.x - n.x);
  u.ax = n.x + dcos(a) * (n.r + 70);
  u.ay = n.y + dsin(a) * (n.r + 70);
  // Only what fights stops a kindling (`kindleBarred`): not another house's seed ship, nor its Scout.
  if (g.kindleBarred(tid, u.owner)) {
    if (u.kindle >= 0 && u.wellTime > 2) {
      u.kindle = -1;
      const by = g.buckets[tid].find((o) => !o.dead && g.hostile(o.owner, u.owner) && fights(o.type));
      const house = by && g.factions[by.owner].kind === 'empire' ? g.factions[by.owner] : null;
      g.notify(u.owner, `Your seed ship waits at ${n.name}: ${house ? `the warships of ${house.name} there must be driven off first` : 'its defenders must be cleared first'}.`, 'info', tid);
    }
    return;
  }
  if (u.kindle < 0) u.kindle = 0;
  if (dist(u.x, u.y, n.x, n.y) > n.r + 160) return;
  const f = g.factions[u.owner];
  u.kindle += dt * mul(f.mods.kindleSpeed);
  if (u.kindle >= ECON.kindleTime) {
    u.dead = true;
    u.hp = 0;
    g.kindleWorld(n, u.owner);
  }
}

/**
 * Where an exploring Scout goes next: the nearest uncharted place it can reach without passing through
 * a place seen to be guarded. When there is none, it has done what can be done safely: it says how
 * much is left behind guards, and goes home. (Sending it further is the player's call, by hand.)
 *
 * A rival house makes that call for itself: its Scouts go round a guarded place where they can and
 * through it where they must, and some are lost. A rival that only knew the sector up to the first
 * guard found fewer targets, and its wars dragged.
 */
function pickExploreTarget(g: Game, u: Unit) {
  const f = g.factions[u.owner];
  const from = u.node;
  let best = -1;
  let bd = Infinity;
  let bestWay: number[] = [];
  for (const n of g.nodes) {
    if (f.explored[n.id] || n.id === from) continue;
    if (!isFinite(g.pathLen(from, n.id))) continue;
    // (A rival's Scout goes round a guarded place where it can, and through it where it must.)
    const way = f.ai ? g.pathAvoiding(from, n.id, (id) => (g.seenGuarded(f, id) ? 1e7 : 0)) : g.safeWay(f, from, n.id);
    if (!way.length) continue;
    let d = g.wayLen(from, way);
    for (const o of g.unitList) if (o !== u && !o.dead && o.owner === u.owner && o.order === 'explore' && o.dest === n.id) d += 6000;
    if (d < bd) {
      bd = d;
      best = n.id;
      bestWay = way;
    }
  }
  if (best < 0) {
    u.order = 'idle';
    const left = f.explored.filter((e) => !e).length;
    if (left === 0) {
      if (!f.warned.scouted) {
        f.warned.scouted = g.time;
        g.notify(u.owner, 'Scouting complete: the whole sector has been charted. Your Scouts are coming home.', 'info');
      }
    } else if (g.time - (f.warned.scoutedSafe ?? -999) > 30) {
      // (Said again when the player sends Scouts out once more and there is still no safe way on.)
      f.warned.scoutedSafe = g.time;
      g.notify(u.owner, `Scouting done as far as it is safe: ${left} place${left === 1 ? ' lies' : 's lie'} beyond guarded passages. Clear the ` +
          `way, or send a Scout there yourself. Your Scouts are coming home.`, 'info');
    }
    // The Scout goes home. It does not wait where its last look took it.
    if (g.nodes[from].owner !== u.owner) {
      let home = -1;
      let hd = Infinity;
      for (const n of g.nodes) {
        if (n.kind !== 'planet' || n.owner !== u.owner) continue;
        const d = g.pathLen(from, n.id);
        if (d < hd) {
          hd = d;
          home = n.id;
        }
      }
      if (home >= 0) {
        const way = g.pathAvoiding(from, home, (id) => (g.hostilePowerAt(id, f.id) > 1 ? 40000 : 0));
        u.dest = home;
        u.path = way.length ? way : g.pathTo(from, home);
      }
    }
    return;
  }
  u.dest = best;
  u.path = bestWay;
}
