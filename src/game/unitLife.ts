/**
 * A ship's life: how it comes into the game, what a hit does to it, how it changes sides, everything
 * that follows from its death (Embers for the kill, the zeal of the Choir, an Ark or a Gate or the
 * Corsairs' Stronghold lost), and the levels and abilities of the ships that have them.
 */

import { CONVERT_MEND, LEARNABLE_ABILITIES } from './data/abilities';
import { HEIR_BY_ID, ZEAL_MAX, ZEAL_TIME } from './data/heirs';
import { ABILITY_LEVELS, DMG_TABLE, LEVEL_XP, MAX_LEVEL, UNITS } from './data/units';
import { mul } from './mods';
import { recomputeHangar } from './systems/economy';
import type { DmgType, Unit, UnitType } from './types';
import { dist, TAU } from './util';
import type { Game } from './Game';

export function spawnUnit(g: Game, type: UnitType,
    owner: number,
    nodeId: number,
    opts: { x?: number; y?: number; hpFrac?: number; parent?: number; temp?: number } = {},
  ): Unit {
  if (type === 'starbase') g.fieldEpoch++;
  const def = UNITS[type];
  const n = g.nodes[nodeId];
  let { x, y } = opts;
  if (x === undefined || y === undefined) {
    const a = g.rng.float(0, TAU);
    const r = n.r + 70 + g.rng.float(0, 150);
    x = n.x + Math.cos(a) * r;
    y = n.y + Math.sin(a) * r;
  }
  const f = g.factions[owner];
  const ang = g.rng.float(0, TAU);
  const u: Unit = {
    id: g.nextId++, type, owner, x, y, px: x, py: y, vx: 0, vy: 0, a: ang, pa: ang,
    hp: 1, maxHp: 1, sh: 0, maxSh: 0, node: nodeId, lane: null, path: [], charge: -1, dest: -1,
    ax: x, ay: y, order: 'idle', orderTarget: -1, target: 0, retarget: 0,
    wcd: def.weapons.map((w) => g.rng.float(0, w.cooldown)), lastHit: 999, lastHitBy: -1,
    xp: 0, level: 1, abil: [], pendingAbil: [], buffs: [], parent: opts.parent ?? 0,
    fighters: (def.fighters ?? 0) + (def.fighters ? f.mods.fighters : 0), launched: 0, fighterTimer: 0,
    kindle: 0, ox: NaN, oy: NaN, dead: false, born: g.time, stun: 0, snare: 0, wellTime: 0, arrivedAt: -99,
    temp: opts.temp ?? 0, era: f.era,
  };
  if (type === 'ark') {
    u.level = f.arkLevel;
    u.xp = f.arkXp;
    const heir = HEIR_BY_ID[f.heir];
    const abil = f.arkAbil.length ? f.arkAbil : [heir?.signature ?? 'barrage'];
    u.abil = abil.map((id) => ({ id, cd: 4 }));
    f.ark = u.id;
    g.oweAbilities(u);
  } else if (type === 'dreadnought') {
    const pool = LEARNABLE_ABILITIES.filter((a) => a.id !== HEIR_BY_ID[f.heir]?.signature);
    u.abil = [{ id: g.rng.pick(pool).id, cd: 4 }];
  } else if (type === 'leviathan') {
    u.abil = [{ id: 'barrage', cd: 8 }];
  }
  g.refreshUnitStats(u, true, opts.hpFrac ?? 1);
  g.unitList.push(u);
  g.units.set(u.id, u);
  if (u.node >= 0) g.buckets[u.node].push(u);
  return u;
}

export function damageUnitRaw(g: Game, u: Unit, amount: number, byFaction: number) {
  if (u.dead) return;
  const absorbed = Math.min(u.sh, amount);
  u.sh -= absorbed;
  u.hp -= amount - absorbed;
  u.lastHit = 0;
  if (byFaction >= 0) u.lastHitBy = byFaction;
  if (u.hp <= 0) g.killUnit(u, byFaction);
}

/** Apply weapon damage to a unit, with type multipliers, shields, armor and on-hit effects. */
export function damageUnit(g: Game, t: Unit, amount: number, type: DmgType, byFaction: number, src: Unit | null) {
  if (t.dead || g.asleep(t.owner)) return;
  const def = UNITS[t.type];
  let dmg = amount * DMG_TABLE[type][def.armorClass];
  if (g.hasBuff(t, 'aegis')) dmg *= 0.7;
  if (g.hasBuff(t, 'barrier')) dmg *= 0.1;
  if (dmg <= 0) return;
  let absorbed = 0;
  if (t.sh > 0) {
    absorbed = Math.min(t.sh, dmg);
    t.sh -= absorbed;
    dmg -= absorbed;
    const refl = g.factions[t.owner].mods.flags.reflect ?? 0;
    if (refl > 0 && src && !src.dead && absorbed > 0) {
      const s = src;
      const amt = absorbed * refl;
      g.deferred.push(() => g.damageUnitRaw(s, amt, t.owner));
    }
  }
  const hull = dmg * (1 - g.armorOf(t));
  t.hp -= hull;
  t.lastHit = 0;
  t.lastHitBy = byFaction;
  const dealt = absorbed + hull;
  if (byFaction >= 0) g.factions[byFaction].stats.damageDealt += dealt;
  if (src && !src.dead) {
    const sm = g.factions[src.owner].mods;
    const siphon = sm.flags.siphon ?? 0;
    if (siphon > 0) src.hp = Math.min(src.maxHp, src.hp + dealt * siphon);
    if (UNITS[src.type].role === 'capital' && src.owner !== g.crisisId) g.addXp(src, dealt * 0.02);
  }
  if (g.fxEnabled && (absorbed > 0 || hull > 0)) {
    const ang = src ? Math.atan2(src.y - t.y, src.x - t.x) : 0;
    g.fx.push({ k: 'hit', x: t.x, y: t.y, shield: absorbed > 0 && t.sh > 0, r: def.radius, ang, node: t.node, color: g.factions[t.owner].color });
  }
  if (t.hp <= 0) g.killUnit(t, byFaction, src);
}

/**
 * The log's line for ships the player has lost at one place: "Lost at Kessel to Ancient Sentinels:
 * 2 Strikers, 1 Scout." Ships lost there within the next 20 seconds are added to the same line, so a
 * battle is one line that counts, not one line a ship.
 */
function noteLoss(g: Game, u: Unit, byFaction: number) {
  if (g.config.autoplay) return;
  const node = u.node >= 0 ? u.node : u.lane ? u.lane.to : -1;
  let note = g.notes.find((n) => n.loss && n.loss.node === node && g.time - n.loss.at < 20);
  if (!note) {
    note = { id: g.noteId++, t: g.time, text: '', kind: 'bad', node: node >= 0 ? node : undefined, loss: { node, counts: {}, by: -1, at: g.time } };
    g.notes.push(note);
    if (g.notes.length > 60) g.notes.splice(0, g.notes.length - 60);
  }
  const L = note.loss!;
  L.counts[u.type] = (L.counts[u.type] ?? 0) + 1;
  L.at = g.time;
  if (byFaction >= 0 && byFaction !== u.owner) L.by = byFaction;
  const list = Object.entries(L.counts)
    .map(([t, c]) => `${c} ${UNITS[t as UnitType].name}${c > 1 ? 's' : ''}`)
    .join(', ');
  const where = node < 0 ? 'in flight' : u.node >= 0 ? `at ${g.nodes[node].name}` : `on the way to ${g.nodes[node].name}`;
  note.text = `Lost ${where}${L.by >= 0 ? ` to ${g.factions[L.by].name}` : ''}: ${list}.`;
}

/**
 * Ships change sides, there and then (Conversion, the Ark ability of the Choir of the First Flame).
 * A ship that goes over forgets its orders, takes a moment to find its feet, and is from then on a
 * ship of its new house like any other, whatever its kind: a house can come by ships it has no
 * Blueprint for this way. It is patched up, and takes no room in its new house's hangar (`guest`). Shots in flight between it and its new friends are lost. And as no ship of
 * the player's is lost silently, none goes over silently.
 */
export function convertUnits(g: Game, list: Unit[], to: number, by: Unit | null) {
  const gainer = g.factions[to];
  const from = new Map<number, Unit[]>();
  const ids = new Set<number>();
  for (const u of list) {
    if (u.dead || u.owner === to) continue;
    let l = from.get(u.owner);
    if (!l) from.set(u.owner, (l = []));
    l.push(u);
    ids.add(u.id);
    u.owner = to;
    u.order = 'idle';
    u.orderTarget = -1;
    u.dest = -1;
    u.path = [];
    u.charge = -1;
    u.target = 0;
    u.retarget = 0;
    u.ox = NaN;
    u.oy = NaN;
    u.ax = u.x;
    u.ay = u.y;
    u.buffs = [];
    u.snare = 0;
    u.stun = Math.max(u.stun, 1.5);
    u.lastHitBy = -1;
    u.parent = 0;
    u.guest = true;
    delete u.rearm;
    g.refreshUnitStats(u);
    // (Patched up, and under its new house's shields: the weakest go over first, and a wreck is no gain.)
    u.hp = Math.max(u.hp, u.maxHp * CONVERT_MEND);
    u.sh = u.maxSh;
    if (by) g.addXp(by, UNITS[u.type].xpValue);
    if (g.fxEnabled) g.fx.push({ k: 'upgrade', x: u.x, y: u.y, r: UNITS[u.type].radius + 8, color: gainer.color, node: u.node });
  }
  if (ids.size === 0) return;
  for (let i = g.projectiles.length - 1; i >= 0; i--) {
    const p = g.projectiles[i];
    if (ids.has(p.src) || (ids.has(p.tgt) && !g.hostile(p.owner, to))) g.projectiles.splice(i, 1);
  }
  // (A Corsair that goes over is no longer part of its raid.)
  for (const r of g.pirates.raids) r.units = r.units.filter((id) => !ids.has(id));
  recomputeHangar(g, gainer);
  const node = by ? by.node : list[0].node;
  const place = node >= 0 ? g.nodes[node].name : 'the dark';
  const say = (l: Unit[]) => {
    const counts: Record<string, number> = {};
    for (const u of l) counts[u.type] = (counts[u.type] ?? 0) + 1;
    return Object.entries(counts)
      .map(([t, c]) => `${c} ${UNITS[t as UnitType].name}${c > 1 ? 's' : ''}`)
      .join(', ');
  };
  const all: Unit[] = [];
  for (const [was, l] of from) {
    const loser = g.factions[was];
    loser.stats.shipsLost += l.length;
    recomputeHangar(g, loser);
    all.push(...l);
    if (loser.isPlayer) g.notify(was, `Gone over to ${gainer.name} at ${place}: ${say(l)}.`, 'bad', node >= 0 ? node : undefined);
  }
  if (gainer.isPlayer) g.notify(to, `Converted at ${place}: ${say(all)}. They are yours now.`, 'good', node >= 0 ? node : undefined);
  if (by && g.fxEnabled) g.fx.push({ k: 'text', x: by.x, y: by.y - 24, text: `CONVERTED ${ids.size}`, color: gainer.color, node: by.node });
}

/**
 * A ship is destroyed. What that sets off, in this order: the loss is counted and told, the house that
 * did it is paid, the Boons that answer a death take effect (zeal, a martyr's blast, the fleet that
 * returns), its fighters go with it, and if it was the last of its kind (an Ark, a Gate, the Corsairs'
 * Stronghold, the Rift Heart) that has consequences of its own.
 */
export function killUnit(g: Game, u: Unit, byFaction: number, _src: Unit | null = null) {
  if (u.dead) return;
  u.dead = true;
  u.hp = 0;
  if (u.type === 'starbase') g.fieldEpoch++;
  const def = UNITS[u.type];
  const owner = g.factions[u.owner];
  if (g.fxEnabled) g.fx.push({ k: 'boom', x: u.x, y: u.y, size: def.radius, color: owner.color, node: u.node });
  const isShip = def.role !== 'fighter' && !u.temp;
  if (isShip) owner.stats.shipsLost++;
  if (u.type === 'seed' && owner.isPlayer) {
    // Never let a kindling fail silently.
    const t = u.order === 'kindle' ? g.nodeAt(u.orderTarget) : null;
    g.notify(owner.id, `Your seed ship was destroyed${t ? ` on its way to ${t.name}` : ''}. Clear the way, then kindle again.`, 'bad', u.node >= 0 ? u.node : undefined);
  }
  // No ship of the player's is ever lost silently. (The seed ship, the Ark and the Gate have words of their own.)
  if (owner.isPlayer && isShip && u.type !== 'seed' && u.type !== 'ark' && u.type !== 'gate') noteLoss(g, u, byFaction);
  creditKill(g, u, byFaction, isShip);
  raiseZeal(g, u, isShip);
  martyrBlast(g, u, isShip);
  eternalReturn(g, u, isShip);
  if (def.fighters) {
    for (const o of g.unitList) if (o.parent === u.id && !o.dead) g.killUnit(o, -1);
  }
  if (u.type === 'fighter' && u.parent > 0) {
    const p = g.units.get(u.parent);
    if (p) p.launched = Math.max(0, p.launched - 1);
  }
  lastOfItsKind(g, u, byFaction);
}

/**
 * The house that destroyed a ship: a kill to its name, Embers or Lore if its Boons pay for kills, and
 * experience for its capital ships there.
 */
function creditKill(g: Game, u: Unit, byFaction: number, isShip: boolean) {
  const def = UNITS[u.type];
  if (byFaction >= 0 && byFaction !== u.owner && isShip) {
    const killer = g.factions[byFaction];
    killer.stats.kills++;
    const km = killer.mods;
    const value = def.cost || 40;
    if ((km.flags.salvage ?? 0) > 0) g.addEmbers(killer, value * km.flags.salvage);
    if ((km.flags.bounty ?? 0) > 0) g.addEmbers(killer, value * km.flags.bounty);
    if ((km.flags.reverse ?? 0) > 0) g.addLore(killer, km.flags.reverse);
    if (u.node >= 0) {
      for (const o of g.buckets[u.node]) {
        if (o.owner === byFaction && !o.dead && UNITS[o.type].role === 'capital') g.addXp(o, def.xpValue);
      }
    }
  }
}

/** Zeal (the Choir of the First Flame): a ship lost is a martyr to the rest of its house at that world. */
function raiseZeal(g: Game, u: Unit, isShip: boolean) {
  const owner = g.factions[u.owner];
  const zeal = owner.mods.flags.zeal ?? 0;
  if (zeal > 0 && isShip && u.node >= 0 && !u.lane) {
    let risen = 0;
    for (const o of g.buckets[u.node]) {
      if (o === u || o.dead || o.lane || o.owner !== u.owner || UNITS[o.type].role === 'fighter') continue;
      let b = o.buffs.find((x) => x.id === 'zeal');
      if (!b) o.buffs.push((b = { id: 'zeal', t: ZEAL_TIME, v: 0 }));
      if (b.v < ZEAL_MAX) risen = Math.max(risen, ++b.v);
      b.t = ZEAL_TIME;
    }
    // (Said where the ship died, each time the zeal rises: both sides can see what the loss has cost.)
    if (risen > 0 && g.fxEnabled) g.fx.push({ k: 'text', x: u.x, y: u.y - 14, text: `ZEAL +${Math.round(risen * zeal * 100)}%`, color: owner.color, node: u.node });
  }
}

/** Martyr Cores: a ship that dies takes a share of its hull out of the enemies around it. */
function martyrBlast(g: Game, u: Unit, isShip: boolean) {
  const def = UNITS[u.type];
  const owner = g.factions[u.owner];
  const martyr = owner.mods.flags.martyr ?? 0;
  if (martyr > 0 && u.node >= 0 && isShip) {
    const nodeId = u.node;
    const x = u.x;
    const y = u.y;
    const amt = u.maxHp * martyr;
    const rad = def.radius + 160;
    const oid = u.owner;
    g.deferred.push(() => {
      if (g.fxEnabled) g.fx.push({ k: 'ring', x, y, r: rad, color: owner.color, node: nodeId });
      for (const o of [...g.buckets[nodeId]]) {
        if (!o.dead && g.hostile(o.owner, oid) && dist(o.x, o.y, x, y) < rad) g.damageUnit(o, amt, 'energy', oid, null);
      }
    });
  }
}

/** Eternal Fleet: a warship that dies may be back at its Hearth. (The one roll of the dice in a death.) */
function eternalReturn(g: Game, u: Unit, isShip: boolean) {
  const def = UNITS[u.type];
  const owner = g.factions[u.owner];
  const eternal = owner.mods.flags.eternal ?? 0;
  if (eternal > 0 && isShip && ['combat', 'siege', 'carrier'].includes(def.role) && owner.alive && owner.capital >= 0 && g.rng.chance(eternal)) {
    const t = u.type;
    const oid = u.owner;
    g.deferred.push(() => {
      if (g.factions[oid].alive && g.factions[oid].capital >= 0) g.spawnUnit(t, oid, g.factions[oid].capital);
    });
  }
}

/**
 * An Ark keeps what it had learned for the one built after it; a Gate is gone; the Stronghold ends the
 * raids; the Rift Heart ends the Hollow.
 */
function lastOfItsKind(g: Game, u: Unit, byFaction: number) {
  const owner = g.factions[u.owner];
  if (u.type === 'ark' && owner.ark === u.id) {
    owner.ark = -1;
    owner.arkLevel = u.level;
    owner.arkXp = u.xp;
    owner.arkAbil = u.abil.map((a) => a.id);
    owner.stats.arkLost = true;
    g.notify(owner.id, `Your Ark, the ${HEIR_BY_ID[owner.heir]?.arkName ?? ''}, has been destroyed! Rebuild it at your Hearth.`, 'bad', u.node >= 0 ? u.node : undefined);
  }
  if (u.type === 'gate' && owner.gate && owner.gate.unit === u.id) {
    owner.gate = null;
    g.notify(-1, `${owner.name}'s Starfire Gate has been destroyed!`, owner.isPlayer ? 'bad' : 'good', u.node);
  }
  if (u.type === 'stronghold' && g.pirates.alive && u.id === g.pirates.stronghold) {
    g.pirates.alive = false;
    if (byFaction >= 0 && g.factions[byFaction].kind === 'empire') {
      const k = g.factions[byFaction];
      k.stats.strongholdDestroyed = true;
      g.addEmbers(k, 600);
      g.grantDraft(k, 1);
      g.notify(-1, `${k.name} destroyed the Corsair Stronghold! The raids are over.`, k.isPlayer ? 'good' : 'info', u.node);
      if (k.isPlayer) g.notify(k.id, 'Plunder recovered: +600 Embers and a free Boon.', 'good');
    }
    for (const o of g.unitList) if (o.owner === g.pirateId && !o.dead && o !== u) g.deferred.push(() => g.killUnit(o, -1));
  }
  if (u.type === 'heart' && g.crisis && u.id === g.crisis.heart) {
    g.crisis.dead = true;
    const k = byFaction >= 0 ? g.factions[byFaction] : null;
    g.notify(-1, `The Rift Heart has been destroyed${k ? ` by ${k.name}` : ''}! The Hollow wither away.`, 'event', u.node);
    for (const o of g.unitList) if (o.owner === g.crisisId && !o.dead && o !== u) g.deferred.push(() => g.killUnit(o, -1));
    g.factions[g.crisisId].alive = false;
    if (k && k.kind === 'empire' && g.victories.includes('crisis')) g.declareWinner(k.id, 'crisis', `${k.name} purged the Hollow from the sector.`);
  }
}

export function addXp(g: Game, u: Unit, amount: number) {
  const m = g.factions[u.owner].mods;
  u.xp += amount * mul(m.xp);
  g.applyLevelFromXp(u);
}

export function applyLevelFromXp(g: Game, u: Unit) {
  if (UNITS[u.type].role !== 'capital') return;
  while (u.level < MAX_LEVEL && u.xp >= LEVEL_XP[u.level]) {
    u.level++;
    onLevelUp(g, u);
  }
}

export function grantLevels(g: Game, u: Unit, n: number) {
  for (let i = 0; i < n && u.level < MAX_LEVEL; i++) {
    u.xp = Math.max(u.xp, LEVEL_XP[u.level]);
    u.level++;
    onLevelUp(g, u);
  }
}

function onLevelUp(g: Game, u: Unit) {
  g.refreshUnitStats(u);
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15);
  const f = g.factions[u.owner];
  if (u.type === 'ark') f.arkLevel = u.level;
  if (g.fxEnabled && u.node >= 0) g.fx.push({ k: 'text', x: u.x, y: u.y - 40, text: `LEVEL ${u.level}`, color: '#ffd23f', node: u.node });
  if (ABILITY_LEVELS.includes(u.level)) offerAbility(g, u);
}

/**
 * A capital ship may learn an ability: the player is given a choice of three (it waits in
 * `pendingAbil` until it is made), a rival house takes one at once. False if there is none left to learn.
 */
function offerAbility(g: Game, u: Unit): boolean {
  const f = g.factions[u.owner];
  const owned = new Set(u.abil.map((a) => a.id));
  const pool = g.rng.shuffle(LEARNABLE_ABILITIES.filter((a) => !owned.has(a.id)).map((a) => a.id));
  const choices = pool.slice(0, 3);
  if (choices.length === 0) return false;
  if (f.isPlayer) {
    u.pendingAbil.push(choices);
    g.notify(f.id, `Your ${UNITS[u.type].name} reached level ${u.level}. Choose a new ability!`, 'good', u.node >= 0 ? u.node : undefined);
  } else {
    u.abil.push({ id: choices[0], cd: 3 });
    if (u.type === 'ark') f.arkAbil = u.abil.map((a) => a.id);
  }
  return true;
}

/**
 * An Ark that is rebuilt comes back at the level its house has reached. If it gained levels while
 * there was no Ark to gain them (a Boon taken with the Ark destroyed), the abilities of those levels
 * were never offered: they are now. An Ark knows its house's signature ability and one more for each
 * of the levels in `ABILITY_LEVELS` it has reached.
 */
export function oweAbilities(g: Game, u: Unit) {
  const due = 1 + ABILITY_LEVELS.filter((l) => l <= u.level).length;
  for (let i = 0; i < 4 && u.abil.length + u.pendingAbil.length < due; i++) if (!offerAbility(g, u)) break;
}

/** Take a unit off the map without a fight (no wreck, no spoils). */
export function removeUnit(g: Game, u: Unit) {
  if (u.dead) return;
  u.dead = true;
  g.units.delete(u.id);
}

/** A deliberately weak Corsair raider for the First Night tutorial. */
export function spawnTutorialRaider(g: Game, targetNode: number): Unit | null {
  const t = g.nodes[targetNode];
  const from = t.lanes.find((l) => g.nodes[l].owner < 0 && !g.hasHostiles(l, g.pirateId)) ?? t.lanes[0];
  if (from === undefined) return null;
  const u = g.spawnUnit('raider', g.pirateId, from, { hpFrac: 0.6 });
  u.buffs.push({ id: 'feeble', t: 1e9, v: 0 });
  g.cmdMove(g.pirateId, [u.id], targetNode);
  return u;
}
