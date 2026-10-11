import type { Game } from '../Game';
import { AI_ATTACK_RATIO, AI_FIRST_ATTACK, AI_RUSH, AI_THINK } from '../constants';
import { CARD_BY_ID, type CardCat } from '../data/cards';
import { ERAS, LAST_CRADLE_ERA } from '../data/eras';
import { isWarship, UNITS } from '../data/units';
import { ASCENSION_BOONS, relicsRequired, treasuryTarget } from '../data/victories';
import type { AIState, Faction, GNode, Rarity, Unit, UnitType, WorldRole, WorldSize } from '../types';

type Personality = AIState['personality'];

const CAT_W: Record<Personality, Record<CardCat, number>> = {
  warlord: { war: 2.2, wealth: 1, growth: 0.9, lore: 0.9, ward: 0.6, blueprint: 1.8, pact: 1.2 },
  expansionist: { war: 1, wealth: 1.6, growth: 2.1, lore: 1.1, ward: 0.8, blueprint: 1.4, pact: 0.8 },
  turtle: { war: 1.1, wealth: 1.3, growth: 0.9, lore: 1.1, ward: 2.4, blueprint: 1.5, pact: 0.5 },
  opportunist: { war: 1.4, wealth: 1.5, growth: 1.2, lore: 1.6, ward: 0.9, blueprint: 1.6, pact: 1 },
};
const RAR_W: Record<Rarity, number> = { common: 1, rare: 1.3, epic: 1.7, legendary: 2.2 };

const COMP: Record<Personality, Partial<Record<UnitType, number>>> = {
  warlord: { striker: 3, guardian: 3, breaker: 2.2, lancer: 2.5, carrier: 1.4, dreadnought: 1.2 },
  expansionist: { striker: 3, guardian: 3, breaker: 1.8, lancer: 1.8, carrier: 1.2, dreadnought: 0.8 },
  turtle: { striker: 2, guardian: 3.5, breaker: 1.4, lancer: 2.6, carrier: 1.8, dreadnought: 1.2 },
  opportunist: { striker: 2.6, guardian: 3, breaker: 1.8, lancer: 2, carrier: 2.2, dreadnought: 1 },
};

const SIZE_VALUE: Record<WorldSize, number> = { S: 1, M: 1.5, L: 2 };

interface Ctx {
  worlds: GNode[];
  forges: GNode[];
  military: Unit[];
  scouts: Unit[];
  seeds: Unit[];
  armyPower: number;
  threats: { node: number; power: number }[];
  minutes: number;
  frontier: GNode[];
  staging: number;
  breakers: number;
}

export function makeAIState(g: Game, _f: Faction, personalities: Personality[]): AIState {
  const d = g.config.difficulty;
  const personality = g.rng.pick(personalities.length ? personalities : (['opportunist'] as Personality[]));
  // Warlords rush on Hard and Brutal.
  const first = personality === 'warlord' && AI_RUSH[d] > 0 ? AI_RUSH[d] : AI_FIRST_ATTACK[d];
  return {
    personality,
    nextThink: g.rng.float(0.5, 2.5),
    mode: 'build',
    target: -1,
    rally: -1,
    modeSince: 0,
    lastAttack: -999,
    attackCount: 0,
    firstAttackAt: first * g.rng.float(0.95, 1.15),
    hoard: false,
    seen: { light: 0, medium: 0, heavy: 0 },
    grudge: -1,
    grudgeAt: -999,
  };
}

export function aiTick(g: Game, f: Faction, dt: number) {
  const ai = f.ai!;
  ai.nextThink -= dt;
  if (ai.nextThink > 0) return;
  ai.nextThink = AI_THINK[g.config.difficulty] * g.rng.float(0.85, 1.15);

  let guard = 0;
  while (f.pendingDrafts > 0 && guard++ < 6) if (!aiDraft(g, f)) break;
  if (g.cradle) g.cmdAdvance(f.id);
  else if (f.ark < 0 || !g.units.has(f.ark)) g.cmdRebuildArk(f.id);

  const ctx = analyze(g, f);
  observeEnemies(g, f, ctx);
  noteGrudges(g, f, ctx);
  economy(g, f, ctx);
  military(g, f, ctx);
  scouting(g, f, ctx);
}

function aiDraft(g: Game, f: Faction): boolean {
  const offer = g.ensureOffer(f);
  if (!offer || offer.length === 0) {
    f.pendingDrafts = 0;
    return false;
  }
  const p = f.ai!.personality;
  let best = offer[0];
  let bs = -1;
  for (const id of offer) {
    const c = CARD_BY_ID[id];
    const s = CAT_W[p][c.cat] * RAR_W[c.rarity] * g.rng.float(0.7, 1.3);
    if (s > bs) {
      bs = s;
      best = id;
    }
  }
  return g.cmdChooseCard(f.id, best);
}

function isMilitary(u: Unit): boolean {
  return isWarship(u.type) && !u.temp;
}

function analyze(g: Game, f: Faction): Ctx {
  const worlds = g.worldsOf(f.id);
  const units = g.unitsOf(f.id);
  const military = units.filter(isMilitary);
  const threats: { node: number; power: number }[] = [];
  // Early warning: rival warships we can see heading for one of our worlds count as a threat already.
  const incoming = new Map<number, number>();
  for (const u of g.unitList) {
    if (u.dead || u.dest < 0 || !isWarship(u.type) || g.factions[u.owner].kind !== 'empire' || !g.hostile(u.owner, f.id)) continue;
    const at = u.node >= 0 ? u.node : u.lane ? u.lane.to : -1;
    if (at < 0 || at === u.dest || !f.visible[at]) continue;
    if (g.nodes[u.dest].owner !== f.id) continue;
    incoming.set(u.dest, (incoming.get(u.dest) ?? 0) + g.unitPower(u));
  }
  for (const p of worlds) {
    const hp = g.hostilePowerAt(p.id, f.id) + (incoming.get(p.id) ?? 0);
    if (hp > 0.5) threats.push({ node: p.id, power: hp });
  }
  const frontier = worlds.filter((p) => {
    for (const n of g.nodes) {
      if (n.kind !== 'planet' || n.owner === f.id) continue;
      if (n.owner >= 0 && g.hops(p.id, n.id) <= 2) return true;
    }
    return false;
  });
  let armyPower = 0;
  let breakers = 0;
  for (const u of military) {
    armyPower += g.unitPower(u);
    if (u.type === 'breaker') breakers++;
  }
  return {
    worlds,
    forges: worlds.filter((p) => g.isForge(p) && p.retool <= 0),
    military,
    scouts: units.filter((u) => u.type === 'scout'),
    seeds: units.filter((u) => u.type === 'seed'),
    armyPower,
    threats,
    minutes: g.time / 60,
    frontier,
    staging: stagingNode(g, f, worlds),
    breakers,
  };
}

/** Remember what kinds of hulls enemies field near us, to build the right counters. */
function observeEnemies(g: Game, f: Faction, ctx: Ctx) {
  const seen = f.ai!.seen;
  seen.light *= 0.95;
  seen.medium *= 0.95;
  seen.heavy *= 0.95;
  const near = new Set<number>();
  for (const w of ctx.worlds) {
    near.add(w.id);
    for (const nb of g.nodes[w.id].lanes) near.add(nb);
  }
  for (const u of ctx.military) if (u.node >= 0) near.add(u.node);
  for (const nid of near) {
    if (!f.visible[nid]) continue;
    for (const u of g.buckets[nid]) {
      if (!g.hostile(u.owner, f.id) || !isWarship(u.type)) continue;
      const k = g.factions[u.owner].kind;
      if (k === 'guardian') continue;
      const ac = UNITS[u.type].armorClass;
      const w = UNITS[u.type].power * 0.05;
      if (ac === 'light') seen.light += w;
      else if (ac === 'medium') seen.medium += w;
      else if (ac === 'heavy') seen.heavy += w;
    }
  }
}

/** A house that attacks our worlds becomes the one we answer first, and our gloves come off. */
function noteGrudges(g: Game, f: Faction, ctx: Ctx) {
  const ai = f.ai!;
  for (const w of ctx.worlds) {
    if (w.lastHit > 3 || w.lastHitBy < 0 || w.lastHitBy === f.id) continue;
    const by = g.factions[w.lastHitBy];
    if (by.kind !== 'empire' || !by.alive) continue;
    ai.grudge = by.id;
    ai.grudgeAt = g.time;
    ai.firstAttackAt = Math.min(ai.firstAttackAt, g.time + 20);
  }
  if (ai.grudge >= 0 && !g.factions[ai.grudge].alive) ai.grudge = -1;
}

function stagingNode(g: Game, f: Faction, worlds: GNode[]): number {
  let best = f.capital;
  let bd = Infinity;
  for (const p of worlds) {
    for (const n of g.nodes) {
      if (n.kind !== 'planet' || n.owner < 0 || n.owner === f.id || !f.explored[n.id]) continue;
      if (g.factions[n.owner].kind !== 'empire') continue;
      const d = g.pathLen(p.id, n.id);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
  }
  return best;
}

function reserve(ctx: Ctx): number {
  return Math.min(300, 60 + ctx.minutes * 8);
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

function economy(g: Game, f: Faction, ctx: Ctx) {
  const ai = f.ai!;
  const hoarding = ai.hoard && g.victories.includes('treasury') && f.embers > treasuryTarget(g.config.size) * 0.35;
  const threatened = ctx.threats.length > 0;
  // On the cradle: once the Lore for the next age is gathered, save the Embers for it.
  const saving = g.cradle && !f.advance && f.lore >= ERAS[f.era].lore && f.embers < ERAS[f.era].cost;

  if (!saving) kindle(g, f, ctx);
  roles(g, f, ctx);

  if (g.victories.includes('ascension') && f.boons >= ASCENSION_BOONS && !f.gate && f.capital >= 0) g.cmdQueueGate(f.id, f.capital);

  // Keep a standing fleet that grows with time (the Ark is not counted), invest the rest.
  const ark = g.units.get(f.ark);
  const fleet = ctx.armyPower - (ark ? g.unitPower(ark) : 0);
  // (Strength is counted in the units of the house's own age.)
  const desired = (8 + ctx.minutes * (ai.personality === 'warlord' ? 3 : ai.personality === 'turtle' ? 2.1 : 2.5)) * ERAS[f.era].power;
  if (saving ? threatened && fleet < desired * 0.5 : threatened || fleet < desired) buildShips(g, f, ctx, 3);
  if (!hoarding && !saving) upgrades(g, f, ctx);
  if (saving) return;
  if ((!hoarding && f.embers > 350 + ctx.minutes * 15) || threatened) buildShips(g, f, ctx, 2);
}

function kindleValue(g: Game, n: GNode): number {
  const aff = g.affinityOf(n);
  return SIZE_VALUE[n.size] * 2 + (aff === 'mine' ? 0.6 : 0.3);
}

function kindle(g: Game, f: Faction, ctx: Ctx) {
  const ai = f.ai!;
  if (ctx.worlds.length === 0) return;
  const targets: { n: GNode; s: number }[] = [];
  for (const n of g.nodes) {
    if (n.kind !== 'planet' || n.owner !== -1 || !f.explored[n.id]) continue;
    if (g.hasHostiles(n.id, f.id)) continue;
    let minHops = Infinity;
    let minLen = Infinity;
    for (const o of ctx.worlds) {
      minHops = Math.min(minHops, g.hops(o.id, n.id));
      minLen = Math.min(minLen, g.pathLen(o.id, n.id));
    }
    if (minHops > 3) continue;
    targets.push({ n, s: kindleValue(g, n) / (1 + minLen / 4000) });
  }
  targets.sort((a, b) => b.s - a.s);
  const claimed = new Set<number>();
  for (const u of ctx.seeds) if (u.order === 'kindle') claimed.add(u.orderTarget);
  let want = (ai.personality === 'expansionist' ? 3 : 2) + (ctx.worlds.length < 4 ? 1 : 0);
  if (ctx.threats.length) want = 1;
  const keep = ctx.minutes < 4 ? 0 : reserve(ctx) * 0.5;
  for (const t of targets) {
    if (claimed.size >= want) break;
    if (claimed.has(t.n.id)) continue;
    if (f.embers - g.kindleCost(f) < keep) break;
    if (g.cmdKindle(f.id, t.n.id)) claimed.add(t.n.id);
    else break;
  }
}

function roles(g: Game, f: Faction, ctx: Ctx) {
  const p = f.ai!.personality;
  const plain = ctx.worlds.filter((w) => w.capitalOf < 0);
  const count = (r: WorldRole) => plain.filter((w) => w.role === r).length;
  const n = ctx.worlds.length;
  const want: [WorldRole, number][] = [
    ['forge', n >= 4 ? 1 + Math.floor((n - 4) / 5) : 0],
    ['observatory', Math.floor(n / 4) + (p === 'opportunist' && n >= 3 ? 1 : 0)],
    ['bastion', p === 'turtle' ? Math.floor(n / 4) : n >= 7 ? 1 : 0],
  ];
  const frontier = new Set(ctx.frontier.map((w) => w.id));
  for (const [role, k] of want) {
    if (count(role) >= k) continue;
    const cands = plain.filter((w) => w.role === 'mine' && w.retool <= 0 && w.glow >= 0.5);
    if (cands.length === 0) continue;
    const score = (w: GNode) => {
      let s = SIZE_VALUE[w.size] + (g.affinityOf(w) === role ? 1.5 : 0) - (g.affinityOf(w) === 'mine' ? 1 : 0);
      if (role !== 'observatory' && frontier.has(w.id)) s += 1.2;
      if (role === 'observatory' && frontier.has(w.id)) s -= 1;
      return s;
    };
    cands.sort((a, b) => score(b) - score(a));
    g.cmdSetRole(f.id, cands[0].id, role);
    return; // one change per think
  }
}

function upgrades(g: Game, f: Faction, ctx: Ctx) {
  const keep = reserve(ctx);
  const cap = f.capital >= 0 ? g.nodes[f.capital] : null;
  const tryUp = (n: GNode | null | undefined, extra = 0) => {
    if (!n) return false;
    const cost = g.upgradeCost(f, n);
    if (cost === null || f.embers - cost < keep + extra) return false;
    return g.cmdUpgrade(f.id, n.id);
  };
  if (cap && ctx.minutes > 6) tryUp(cap);
  const order = [...ctx.worlds]
    .filter((w) => w.capitalOf < 0 && w.level < 3 && w.glow > 0.7)
    .sort((a, b) => SIZE_VALUE[b.size] + (b.role === 'mine' ? 1 : 0) - (SIZE_VALUE[a.size] + (a.role === 'mine' ? 1 : 0)));
  for (const w of order.slice(0, 2)) tryUp(w, 120);

  // Starbases (from the Blueprint)
  if (g.hasCard(f, 'bpStarbase') && cap) {
    const p = f.ai!.personality;
    const sites = p === 'turtle' ? [cap, ...ctx.frontier] : ctx.minutes > 20 ? [cap] : [];
    for (const s of sites.slice(0, 3)) {
      if (g.starbaseAt(s) === 0 && f.embers - g.shipCost(f, 'starbase') > keep) g.cmdQueueStarbase(f.id, s.id);
    }
  }
  // At the hangar cap with Embers to spare: build Hangar Bays, then raise every world.
  if (f.hangarUsed >= f.hangarCap - 2 && f.embers - g.bayCost(f) > keep + 400) g.cmdBuyBay(f.id);
  if (f.embers > 2500) for (const w of ctx.worlds) tryUp(w, 600);
}

function buildShips(g: Game, f: Faction, ctx: Ctx, max: number) {
  if (ctx.forges.length === 0) return;
  const ai = f.ai!;
  const W: Partial<Record<UnitType, number>> = { ...COMP[ai.personality] };
  // Counter what we have seen.
  const s = ai.seen;
  const total = s.light + s.medium + s.heavy;
  if (total > 0.5) {
    W.guardian = (W.guardian ?? 1) * (1 + (2 * s.light) / total);
    W.breaker = (W.breaker ?? 1) * (1 + (2 * s.medium) / total);
    W.striker = (W.striker ?? 1) * (1 + (2 * s.heavy) / total);
    W.lancer = (W.lancer ?? 1) * (1 + (1.5 * s.heavy) / total);
  }
  const armyCount = Math.max(1, ctx.military.length);
  if (ctx.breakers < 2 + ai.attackCount && ctx.minutes > 5) W.breaker = (W.breaker ?? 1) * 2;
  if (ctx.breakers / armyCount > 0.35) W.breaker = (W.breaker ?? 1) * 0.25;
  const types = Object.keys(W) as UnitType[];
  let built = 0;
  for (let i = 0; i < max * 3 && built < max; i++) {
    const forge = [...ctx.forges].sort((a, b) => a.shipQ.length - b.shipQ.length)[0];
    if (forge.shipQ.length >= 3) break;
    // Pick by doctrine among ships we could field, then save up for it rather than settling for something cheaper.
    const type = g.rng.weighted(types, (t) => {
      const why = g.checkShip(f.id, forge.id, t);
      return why && why !== 'Not enough Embers' ? 0 : (W[t] ?? 0);
    });
    if (!type) break;
    if (g.cmdQueueShip(f.id, forge.id, type)) built++;
    else break;
  }
}

// ---------------------------------------------------------------------------
// Military
// ---------------------------------------------------------------------------

/** How many jumps a rival's free ships will go to hold a drifting derelict. */
const DERELICT_REACH = 5;

/**
 * Send ships to a place (those not there or on their way already). A few ships (`careful`: new ships,
 * stragglers, defenders) go round places held by more than they could take on, where there is another
 * way: sent through an enemy fleet sitting on a star, they were picked off one by one as they came.
 * (`DANGER`: how much further such a place counts, about the length of forty jumps.) The army itself
 * takes the straight way, as it always did: sent round, its attacks took so long that they were called
 * off with nothing done, and AI-only games dragged on.
 */
function sendIfNeeded(g: Game, f: Faction, units: Unit[], node: number, careful = true) {
  const going: Unit[] = [];
  for (const u of units) {
    if (u.node === node && !u.lane && u.path.length === 0) continue;
    if (u.dest === node && (u.lane || u.path.length > 0)) continue;
    going.push(u);
  }
  if (!going.length) return;
  if (!careful) {
    g.cmdMove(f.id, going.map((u) => u.id), node);
    return;
  }
  const strength = power(g, going);
  g.cmdMove(f.id, going.map((u) => u.id), node, undefined, undefined, (id) => (g.hostilePowerAt(id, f.id) > strength * 0.6 ? DANGER : 0));
}

const DANGER = 40000;

/**
 * Where ships gather that are too few to win at `node` (the house's Hearth under attack): one of the
 * house's places a jump or two away with no enemy at it, the nearest first. -1 if there is none.
 */
function gatherPoint(g: Game, f: Faction, node: number): number {
  let best = -1;
  let bd = Infinity;
  for (const n of g.nodes) {
    if (n.id === node || g.hostilePowerAt(n.id, f.id) > 0) continue;
    const hops = g.hops(n.id, node);
    if (hops < 1 || hops > 2) continue;
    // (A world of the house's own is better: its guns and walls are on the house's side.)
    const d = g.pathLen(n.id, node) + (n.owner === f.id ? 0 : 2000);
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

function power(g: Game, units: Unit[]): number {
  let p = 0;
  for (const u of units) p += g.unitPower(u);
  return p;
}

function targetValid(g: Game, f: Faction, nodeId: number): boolean {
  if (nodeId < 0) return false;
  const n = g.nodes[nodeId];
  if (n.kind === 'planet') {
    if (n.owner === f.id) return false;
    if (n.owner >= 0) return g.factions[n.owner].kind === 'empire' && g.hostile(n.owner, f.id);
    return g.hasHostiles(n.id, f.id);
  }
  if (n.kind === 'relic') return !!n.relic;
  if (n.kind === 'pirate') return g.pirates.alive;
  if (n.kind === 'rift') return !!g.crisis && g.crisis.awake && !g.crisis.dead;
  if (n.claim?.what === 'derelict') return true;
  return false;
}

function rivalThreat(g: Game, owner: number): number {
  const r = g.factions[owner];
  if (!r || r.kind !== 'empire') return 1;
  if (r.gate || r.holdTimer > 0 || r.treasuryTimer > 0 || r.relicTimer > 0) return 3;
  // (Ages: a house building its Ark is about to get away. Its rivals would rather it did not.)
  if (r.advance && r.era >= LAST_CRADLE_ERA) return 2;
  if (g.victories.includes('treasury') && r.embers > treasuryTarget(g.config.size) * 0.7) return 2.5;
  if (g.victories.includes('relics') && r.relics.length >= relicsRequired(g.relicTotal) - 1) return 2.5;
  return 1;
}

function chooseTarget(g: Game, f: Faction, armyPower: number, from: number): { node: number; score: number } | null {
  const d = g.config.difficulty;
  const p = f.ai!.personality;
  // Bolder as the run drags on, so late games resolve.
  const late = g.time > 1800 ? Math.max(0.7, 1 - (g.time - 1800) / 3000) : 1;
  const ratio = AI_ATTACK_RATIO[d] * (p === 'warlord' ? 0.85 : p === 'turtle' ? 1.3 : 1) * late;
  let best: { node: number; score: number } | null = null;
  for (const n of g.nodes) {
    if (!f.explored[n.id]) continue;
    let value = 0;
    let def = g.hostilePowerAt(n.id, f.id);
    if (n.kind === 'planet' && n.owner >= 0 && n.owner !== f.id) {
      const owner = g.factions[n.owner];
      if (owner.kind !== 'empire' || !g.hostile(n.owner, f.id)) continue;
      // (Ages: a house newly arrived among the stars is left alone for a while, unless it struck first.)
      if (g.time < owner.graceUntil && f.ai!.grudge !== n.owner) continue;
      value = 10 + SIZE_VALUE[n.size] * 3 + n.level * 2 + (n.capitalOf >= 0 ? 25 : 0);
      value *= rivalThreat(g, n.owner);
      if (n.owner === f.ai!.grudge && g.time - f.ai!.grudgeAt < 600) value *= 2.5;
      if (g.factions[n.owner].gate?.node === n.id) value *= 3;
      if (g.factions[n.owner].isPlayer) value *= 1 + 0.12 * d;
      def += n.hp / (n.capitalOf >= 0 ? 900 : 1600);
    } else if (n.kind === 'planet' && n.owner === -1 && g.hasHostiles(n.id, f.id)) {
      value = 6 + SIZE_VALUE[n.size] * 3;
    } else if (n.kind === 'relic' && n.relic) {
      value = g.victories.includes('relics') ? 30 : 13;
    } else if (n.kind === 'pirate' && g.pirates.alive) {
      value = 18;
    } else if (n.kind === 'rift' && g.crisis && g.crisis.awake && !g.crisis.dead) {
      value = g.victories.includes('crisis') ? 45 : 14;
    } else if (n.claim?.what === 'derelict') {
      value = 16;
    } else continue;
    if (armyPower < def * ratio) continue;
    const dist = g.pathLen(from, n.id);
    if (!isFinite(dist)) continue;
    const score = value / (1 + def / Math.max(1, armyPower)) / (1 + dist / 9000);
    if (!best || score > best.score) best = { node: n.id, score };
  }
  return best;
}

function rallyFor(g: Game, f: Faction, target: number): number {
  let best = f.capital;
  let bd = Infinity;
  for (const p of g.worldsOf(f.id)) {
    const d = g.pathLen(p.id, target);
    if (d < bd) {
      bd = d;
      best = p.id;
    }
  }
  return best;
}

function military(g: Game, f: Faction, ctx: Ctx) {
  const ai = f.ai!;
  const all = ctx.military;
  if (all.length === 0) {
    ai.mode = 'build';
    return;
  }

  // ---- Defense ----
  const assigned = new Set<number>();
  const threats = [...ctx.threats].sort(
    (a, b) => (g.nodes[b.node].capitalOf === f.id ? 1 : 0) - (g.nodes[a.node].capitalOf === f.id ? 1 : 0) || b.power - a.power,
  );
  for (const th of threats) {
    // Ships already there, or on their way, are on this job, as many as it takes (half again the enemy's
    // strength, those on the spot first): nothing below may send them elsewhere. (Left out, they were
    // sent on to the army's business and back again, changing course every few seconds and never
    // leaving: the loop a playtester saw while he took a rival's Hearth. All of them kept, a whole army
    // resting at a world that one enemy ship was heading for stayed there for good.)
    let kept = 0;
    const onJob = all.filter((u) => !assigned.has(u.id) && (u.node === th.node || u.dest === th.node)).sort((x, y) => (x.node === th.node ? 0 : 1) - (y.node === th.node ? 0 : 1));
    for (const u of onJob) {
      if (kept >= th.power * 1.5) break;
      assigned.add(u.id);
      kept += g.unitPower(u);
    }
    const already = g.powerAt(th.node, f.id);
    const need = th.power * 1.3 - already;
    if (need <= 0) continue;
    // (Ships within four jumps answer a threat to a world. For the Hearth every ship does, from anywhere:
    // a fleet used to go on besieging a far world while its own Hearth fell.)
    const reach = g.nodes[th.node].capitalOf === f.id ? Infinity : 4;
    const cands = all
      .filter((u) => !assigned.has(u.id) && u.node !== th.node && u.dest !== th.node)
      .map((u) => ({ u, d: g.pathLen(u.node >= 0 ? u.node : u.lane!.to, th.node) }))
      .filter((c) => isFinite(c.d) && g.hops(c.u.node >= 0 ? c.u.node : c.u.lane!.to, th.node) <= reach)
      .sort((a, b) => a.d - b.d);
    const send: Unit[] = [];
    let sum = 0;
    for (const c of cands) {
      if (sum >= need) break;
      send.push(c.u);
      sum += g.unitPower(c.u);
    }
    const isHearth = g.nodes[th.node].capitalOf === f.id;
    if (send.length && sum + already >= th.power * 0.8) {
      sendIfNeeded(g, f, send, th.node);
      for (const u of send) assigned.add(u.id);
    } else if (send.length && isHearth) {
      // Too few to win at the Hearth: they gather a jump or two short of the fight, and go in together
      // once they are enough (counted again at every thought). They used to fly in as they came, and
      // an enemy fleet sitting there picked them off one by one.
      const at = gatherPoint(g, f, th.node);
      if (at >= 0) sendIfNeeded(g, f, send, at);
      for (const u of send) assigned.add(u.id);
    }
    if (isHearth && send.length && ai.mode !== 'build') ai.mode = 'build';
  }

  // ---- A drifting derelict is worth a detour ----
  // A derelict Dreadnought goes to the house that holds its place alone for a few seconds. As a target
  // for the whole army it almost never won out, so derelicts sat unclaimed for minutes, even at a
  // house's own home star. Now two ships that are near and free go and hold it. If someone else is
  // there, it is a fight, and that is the army's business as before.
  for (const n of g.nodes) {
    if (n.claim?.what !== 'derelict' || !f.explored[n.id] || g.hostilePowerAt(n.id, f.id) > 0) continue;
    const holding = all.filter((u) => !assigned.has(u.id) && (u.node === n.id || u.dest === n.id));
    if (holding.length) {
      for (const u of holding) assigned.add(u.id);
      continue;
    }
    const free = all
      .filter((u) => !assigned.has(u.id) && u.type !== 'ark' && !u.lane && u.node >= 0 && u.lastHit > 6 && g.hops(u.node, n.id) <= DERELICT_REACH)
      .sort((x, y) => g.pathLen(x.node, n.id) - g.pathLen(y.node, n.id))
      .slice(0, 2);
    if (!free.length) continue;
    g.cmdMove(f.id, free.map((u) => u.id), n.id);
    for (const u of free) assigned.add(u.id);
  }

  const army = all.filter((u) => !assigned.has(u.id));
  const armyPower = power(g, army);
  const age = ERAS[f.era].power;
  const minArmy = (12 + ctx.minutes * 1.5) * age;

  switch (ai.mode) {
    case 'build': {
      const idle = army.filter((u) => u.node !== ctx.staging && !u.lane && u.path.length === 0 && u.order === 'idle' && u.lastHit > 6);
      // (Not to a staging world that an enemy is sitting on: new ships would fly into it one at a time.)
      if (idle.length && ctx.staging >= 0 && g.hostilePowerAt(ctx.staging, f.id) === 0) sendIfNeeded(g, f, idle, ctx.staging);
      // Before the first big attack, still clear guarded dark worlds nearby.
      const canAttack = g.time >= ai.firstAttackAt && g.time - ai.lastAttack > 45 && armyPower >= minArmy;
      const canClear = g.time < ai.firstAttackAt && g.time > 240 && g.time - ai.lastAttack > 60 && armyPower >= 8 * age;
      if (canAttack || canClear) {
        const t = chooseTarget(g, f, armyPower, ctx.staging >= 0 ? ctx.staging : f.capital);
        const ok = t && (canAttack || fairTarget(g, f, t.node));
        if (t && ok) {
          ai.target = t.node;
          ai.rally = rallyFor(g, f, t.node);
          ai.mode = 'rally';
          ai.modeSince = g.time;
          sendIfNeeded(g, f, army, ai.rally, false);
        }
      }
      break;
    }
    case 'rally': {
      if (!targetValid(g, f, ai.target) || !fairTarget(g, f, ai.target)) {
        ai.mode = 'build';
        break;
      }
      const at = army.filter((u) => u.node === ai.rally);
      sendIfNeeded(g, f, army.filter((u) => u.node !== ai.rally), ai.rally);
      if (power(g, at) >= armyPower * 0.75 || g.time - ai.modeSince > 60) {
        ai.mode = 'attack';
        ai.modeSince = g.time;
        if (!isNeutralTarget(g, ai.target)) ai.attackCount++;
        sendIfNeeded(g, f, army, ai.target, false);
      }
      break;
    }
    case 'attack': {
      const tn = ai.target;
      if (!targetValid(g, f, tn)) {
        const next = armyPower > minArmy * 0.7 ? chooseTarget(g, f, armyPower, tn) : null;
        if (next && g.hops(tn, next.node) <= 2 && fairTarget(g, f, next.node)) {
          ai.target = next.node;
          ai.modeSince = g.time;
          sendIfNeeded(g, f, army, next.node, false);
        } else {
          ai.mode = 'build';
          ai.lastAttack = g.time;
        }
        break;
      }
      // Before its first attack the AI only clears neutral ground (or answers a grudge): no accidental wars.
      if (!fairTarget(g, f, tn)) {
        ai.mode = 'build';
        ai.lastAttack = g.time;
        break;
      }
      const ours = g.powerAt(tn, f.id);
      const theirs = g.hostilePowerAt(tn, f.id);
      const arrived = army.filter((u) => u.node === tn).length;
      if (arrived > army.length * 0.5 && ours > 0 && theirs > ours * 1.8) {
        g.cmdRetreat(f.id, army.map((u) => u.id));
        ai.mode = 'build';
        ai.lastAttack = g.time;
        break;
      }
      // A siege that is getting nowhere is called off. (A fleet without the guns for it would sit at a world
      // for minutes, doing nothing a player could see.) Every 50 seconds the world must have lost some of
      // its hull and shields, or there must be a battle on.
      const tnode = g.nodes[tn];
      if (arrived > army.length * 0.5 && tnode.kind === 'planet' && tnode.owner >= 0) {
        const left = tnode.hp + tnode.sh;
        if (!ai.siege || ai.siege.node !== tn) ai.siege = { node: tn, at: g.time, left };
        else if (g.time - ai.siege.at > 50) {
          if (left > ai.siege.left * 0.97 && theirs < ours * 0.4) {
            g.cmdRetreat(f.id, army.map((u) => u.id));
            ai.mode = 'build';
            ai.lastAttack = g.time;
            ai.siege = undefined;
            break;
          }
          ai.siege = { node: tn, at: g.time, left };
        }
      }
      const stragglers = army.filter((u) => u.node !== tn && u.dest !== tn && !u.lane && u.path.length === 0);
      if (stragglers.length) sendIfNeeded(g, f, stragglers, tn);
      if (g.time - ai.modeSince > 360) {
        g.cmdRetreat(f.id, army.map((u) => u.id));
        ai.mode = 'build';
        ai.lastAttack = g.time;
      }
      break;
    }
  }
}

/** May this AI go after a target right now? Rivals only after its first attack time, or if they struck first. */
function fairTarget(g: Game, f: Faction, nodeId: number): boolean {
  const ai = f.ai!;
  if (g.time >= ai.firstAttackAt || isNeutralTarget(g, nodeId)) return true;
  const n = g.nodes[nodeId];
  return n.owner >= 0 && n.owner === ai.grudge;
}

/** Dark worlds held by old guardians, derelicts and the like: fair game at any time. */
function isNeutralTarget(g: Game, nodeId: number): boolean {
  const n = g.nodes[nodeId];
  if (n.kind === 'planet') return n.owner === -1;
  return n.claim?.what === 'derelict';
}

function scouting(g: Game, f: Faction, ctx: Ctx) {
  const unexplored = f.explored.some((e) => !e);
  if (!unexplored) return;
  for (const s of ctx.scouts) if (s.order !== 'explore') g.cmdExplore(f.id, [s.id]);
  if (ctx.scouts.length === 0 && ctx.minutes < 14 && f.capital >= 0 && f.embers > 150) {
    const queued = g.nodes[f.capital].shipQ.some((q) => q.id === 'scout');
    if (!queued) g.cmdQueueShip(f.id, f.capital, 'scout');
  }
}
