/**
 * Worlds changing hands: a world is kindled, a world is hit and falls (to be taken, to swear fealty, or
 * to go dark), a Hearth falls and its house with it, and a house is crowned.
 */

import { DMG_TABLE, UNITS } from './data/units';
import { ECON } from './data/worlds';
import type { DmgType, GNode, VictoryId } from './types';
import type { Game } from './Game';
import { isHearth, recomputeHangar } from './worldStats';
import { possessive } from './util';
import { WORLD_FALLING } from './constants';

/** Damage to a world. `spare`: it can crack the world but not take it (a Martyr blast): its hull stops at 1. */
export function damagePlanet(g: Game, n: GNode, amount: number, type: DmgType, byFaction: number, spare = false) {
  if (n.owner < 0 || n.kind !== 'planet' || g.asleep(n.owner)) return;
  let dmg = amount * DMG_TABLE[type].planet;
  if (dmg <= 0) return;
  // A world a Bastion protects takes less (`FIELD_GUARD`), for as long as that Bastion stands.
  dmg *= 1 - g.guardOf(n);
  const owner = g.factions[n.owner];
  // (A new siege: the world may be told to be falling again.)
  if (n.lastHit > 25) delete n.falling;
  if (n.lastHit > 25 && byFaction >= 0) {
    const who = g.factions[byFaction];
    const hearth = isHearth(n);
    g.notify(n.owner, `${hearth ? 'Your Hearth, ' : ''}${n.name} is under attack${who ? ' by ' + who.name : ''}!`, 'alert', n.id, hearth);
  }
  const absorbed = Math.min(n.sh, dmg);
  // The moment a world's shields give way is shown on the map: from here on its hull takes the hits.
  // (Shields that are being shot at never recharge far, so this is said once a siege, not once a hit.)
  if (g.fxEnabled && n.maxSh > 0 && n.sh >= n.maxSh * 0.1 && n.sh - absorbed <= 0) g.fx.push({ k: 'text', x: n.x, y: n.y - n.r - 26, text: 'SHIELDS DOWN', color: '#3fa7ff', node: n.id });
  n.sh -= absorbed;
  dmg -= absorbed;
  n.hp -= dmg;
  n.lastHit = 0;
  n.lastHitBy = byFaction;
  if (byFaction >= 0) g.factions[byFaction].stats.damageDealt += absorbed + dmg;
  // Militia Reserve
  if ((owner.mods.flags.militia ?? 0) > 0 && n.militiaCd <= 0) {
    n.militiaCd = 90;
    for (let i = 0; i < 2; i++) g.spawnUnit('striker', owner.id, n.id);
    g.notify(owner.id, `Militia muster to defend ${n.name}.`, 'good', n.id);
  }
  // Last stand at the Hearth
  if (isHearth(n) && !n.lastStand && n.hp < n.maxHp * 0.3) {
    n.lastStand = true;
    const k = owner.id === g.playerId && !g.config.autoplay ? 1 + (g.config.perks?.secondBreath ?? 0) : 1;
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < 3; i++) g.spawnUnit('striker', owner.id, n.id);
      for (let i = 0; i < 2; i++) g.spawnUnit('guardian', owner.id, n.id);
    }
    g.notify(owner.id, `LAST STAND! The defenders of ${n.name} rise to arms.`, 'alert', n.id, false, { title: 'LAST STAND', sub: `The defenders of ${n.name} rise to arms.`, tone: 'red' });
  }
  if (n.hp <= 0 && spare) n.hp = 1;
  if (n.hp <= 0) {
    n.hp = 0;
    g.planetDefeated(n, byFaction);
    return;
  }
  // A world of the player's near the end of its hull is told, once a siege, with where it is (1.23.6). The
  // player was told only when the siege began, and a playtester lost a Bastion without seeing it go. Not
  // the Hearth, whose Last Stand says it.
  if (n.owner === g.playerId && !g.config.autoplay && !isHearth(n) && !n.falling && n.hp < n.maxHp * WORLD_FALLING) {
    n.falling = 1;
    const who = byFaction >= 0 ? g.factions[byFaction] : null;
    g.notify(n.owner, `${n.name} is falling: ${Math.max(1, Math.round((n.hp / n.maxHp) * 100))}% hull left${who && who.kind === 'empire' ? `, against ${who.name}` : ''}!`, 'alert', n.id);
  }
}

/** A seed ship finished its work: the world joins the house. */
export function kindleWorld(g: Game, n: GNode, fid: number) {
  const f = g.factions[fid];
  n.owner = fid;
  n.capitalOf = -1;
  n.level = 1;
  n.role = 'mine';
  n.retool = 0;
  n.fresh = true;
  n.glow = ECON.glowStart;
  n.lastStand = true;
  n.shipQ = [];
  n.buildQ = [];
  g.refreshWorld(n);
  n.hp = n.maxHp * 0.6;
  n.sh = n.maxSh * 0.5;
  f.stats.worldsKindled++;
  f.explored[n.id] = 1;
  recomputeHangar(g, f);
  if (g.fxEnabled) g.fx.push({ k: 'capture', node: n.id, color: f.color });
  g.notify(fid, `${n.name} is kindled! It will glow brighter over the next minute and a half.`, 'good', n.id);
}

export function planetDefeated(g: Game, n: GNode, byFaction: number) {
  const prev = n.owner;
  const prevF = g.factions[prev];
  const att = byFaction >= 0 ? g.factions[byFaction] : null;
  if (!att || att.kind === 'guardian') {
    n.hp = 1;
    return;
  }
  if (att.kind === 'pirate') {
    // Corsairs plunder rather than conquer.
    n.hp = n.maxHp * 0.2;
    const stolen = Math.min(500, Math.floor(prevF.embers * 0.15));
    prevF.embers -= stolen;
    n.glow = Math.max(ECON.glowStart, n.glow * 0.5);
    g.notify(prev, `Corsairs plundered ${n.name}, stealing ${stolen} Embers!`, 'bad', n.id);
    for (const r of g.pirates.raids) if (r.target === n.id) r.phase = 'return';
    return;
  }
  if (att.kind === 'crisis') {
    if (isHearth(n)) g.eliminate(n.capitalOf, byFaction);
    darken(g, n);
    n.hp = n.maxHp * 0.3;
    destroyDefenses(g, n, prev);
    prevF.stats.worldsLost++;
    g.notify(prev, `${n.name} has been devoured by the Hollow!`, 'bad', n.id);
    if (g.fxEnabled) g.fx.push({ k: 'capture', node: n.id, color: att.color });
    return;
  }
  // A rival house takes the world.
  const wasHearth = isHearth(n);
  const scorched = prevF.mods.flags.scorched ?? 0;
  if (scorched > 0) {
    for (const u of [...g.buckets[n.id]]) if (!u.dead && g.hostile(u.owner, prev)) g.damageUnitRaw(u, scorched, prev);
  }
  destroyDefenses(g, n, prev);
  refundQueues(g, n);
  delete n.falling;
  n.owner = byFaction;
  n.capitalOf = -1;
  // A world that is taken is sacked: it loses a level, and starts again from a low Glow. Not by the
  // Choir of the First Flame, which converts it: the world goes on as it was, under a new house.
  const sacked = !(att.mods.flags.convert ?? 0);
  if (sacked) n.level = Math.max(1, n.level - 1);
  if (!n.role) n.role = 'forge';
  n.retool = 0;
  if (sacked) n.glow = ECON.glowStart;
  n.lastStand = true;
  g.refreshWorld(n);
  n.hp = n.maxHp * 0.3;
  n.sh = 0;
  att.stats.worldsCaptured++;
  prevF.stats.worldsLost++;
  // War spoils: a share of the loser's hoard (half of it when their Hearth falls).
  const spoils = Math.floor(wasHearth ? Math.min(6000, prevF.embers * 0.5) : Math.min(2000, prevF.embers * 0.15));
  if (spoils > 0) {
    prevF.embers -= spoils;
    att.embers += spoils;
    g.notify(byFaction, `War spoils: ${spoils} Embers seized from ${prevF.name}.`, 'good', n.id);
  }
  if (g.fxEnabled) g.fx.push({ k: 'capture', node: n.id, color: att.color });
  g.notify(byFaction, `${n.name} captured!`, 'good', n.id);
  g.notify(prev, `${n.name} has fallen to ${att.name}!`, 'bad', n.id);
  recomputeHangar(g, att);
  recomputeHangar(g, prevF);
  if (wasHearth) g.eliminate(prev, byFaction);
}

/** Return a world to the dark. */
export function darken(g: Game, n: GNode) {
  delete n.falling;
  n.owner = -1;
  n.capitalOf = -1;
  n.level = 1;
  n.role = null;
  n.retool = 0;
  n.glow = 1;
  n.shipQ = [];
  n.buildQ = [];
  n.rally = -1;
  g.refreshWorld(n);
}

function destroyDefenses(g: Game, n: GNode, owner: number) {
  for (const u of [...g.buckets[n.id]]) {
    if (u.owner === owner && UNITS[u.type].isStatic && !u.dead) g.killUnit(u, -1);
  }
}

/** Clear a world's queues, paying back their cost to the owner (if it still stands). */
function refundQueues(g: Game, n: GNode) {
  const f = n.owner >= 0 ? g.factions[n.owner] : null;
  if (f && f.alive) for (const q of [...n.shipQ, ...n.buildQ]) f.embers += q.cost;
  n.shipQ = [];
  n.buildQ = [];
}

export function eliminate(g: Game, fid: number, byFaction: number) {
  const f = g.factions[fid];
  if (!f.alive) return;
  f.alive = false;
  f.eliminatedAt = g.time;
  const by = byFaction >= 0 ? g.factions[byFaction] : null;
  // A house that takes a Hearth inherits the fallen house's worlds; otherwise they go dark.
  const heir = by && by.kind === 'empire' && by.alive ? by : null;
  let sworn = 0;
  for (const n of g.nodes) {
    if (n.capitalOf === fid) n.capitalOf = -1;
    if (n.owner !== fid) continue;
    if (heir) {
      n.owner = heir.id;
      n.capitalOf = -1;
      n.shipQ = [];
      n.buildQ = [];
      n.retool = 0;
      n.glow = ECON.glowStart;
      n.lastStand = true;
      n.rally = -1;
      g.refreshWorld(n);
      n.hp = Math.max(n.hp, n.maxHp * 0.3);
      if (g.fxEnabled) g.fx.push({ k: 'capture', node: n.id, color: heir.color });
      sworn++;
    } else darken(g, n);
  }
  if (heir) {
    recomputeHangar(g, heir);
    if (sworn) g.notify(-1, heir.isPlayer ? `The worlds of ${f.name} swear fealty to you: +${sworn} worlds.` : `The worlds of ${f.name} now answer to ${heir.name}.`, heir.isPlayer ? 'good' : 'alert');
  }
  for (const u of g.unitList) if (u.owner === fid && !u.dead) g.deferred.push(() => g.killUnit(u, -1));
  if (by && by.kind === 'empire' && f.relics.length) {
    by.relics.push(...f.relics);
    g.notify(by.id, `Seized ${f.relics.length} relic(s) from the fallen ${f.name}.`, 'good');
    g.recomputeMods(by);
  }
  f.relics = [];
  if (by && by.kind === 'empire') {
    by.stats.rivalsEliminated++;
    // Spoils of a fallen Hearth: a free Boon.
    by.pendingDrafts++;
    if (by.isPlayer) g.notify(by.id, `Spoils of ${possessive(f.name)} Hearth: a free Boon! (B)`, 'good');
  }
  // (Where its Hearth stood is kept: the ending of the run goes there.)
  f.lostHearth = f.capital;
  f.capital = -1;
  if (f.isPlayer) {
    g.declareWinner(-1, 'defeat', by ? `Your Hearth went dark, taken by ${by.name}.` : 'Your Hearth went dark.');
  } else {
    g.notify(-1, `The Hearth of ${f.name} has gone dark${by ? `, taken by ${by.name}` : ''}!`, by?.isPlayer ? 'good' : 'event', undefined, false, {
      title: `${g.shortName(f).toUpperCase()} FALLS`, sub: `Its Hearth has gone dark${by ? `, taken by ${by.isPlayer ? 'you' : g.shortName(by)}` : ''}.`, tone: 'house', fid: f.id,
    });
  }
}

export function declareWinner(g: Game, fid: number, victory: VictoryId | 'defeat', reason: string) {
  if (g.outcome) return;
  const playerWon = fid === g.playerId && !g.config.autoplay;
  g.outcome = { winner: fid, victory, time: g.time, playerWon, reason };
  g.sampleHistory();
}
