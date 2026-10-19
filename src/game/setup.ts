/**
 * A new game: the sector, the houses and their Hearths, their first fleets, and what waits in the dark
 * (guardians, relics, anomalies, the Corsairs, the Hollow). Everything here is drawn from the game's
 * own random numbers in a fixed order, so that a seed always makes the same sector.
 */

import { makeAIState } from './ai/ai';
import { AI_INCOME, AI_START_EMBERS, AI_START_GUARDIANS, CRISIS_AWAKEN, CRISIS_OFFSET, PIRATE_FIRST_RAID } from './constants';
import { AMBITIONS } from './data/ambitions';
import { SPACE } from './data/eras';
import { POWER_FIRST } from './data/abilities';
import { ANOMALY_EVENTS, OFFER_EVENTS } from './data/events';
import { CRISIS_COLOR, GUARDIAN_COLOR, HEIRS, HEIR_BY_ID, PIRATE_COLOR } from './data/heirs';
import { RELICS } from './data/relics';
import { TRAITS, TRAIT_BY_ID } from './data/traits';
import { OPTIONAL_VICTORIES } from './data/victories';
import { ECON } from './data/worlds';
import type { Game } from './Game';
import { EMPIRES_BY_SIZE, generateCradle, generateMap, type MapGenResult } from './mapgen';
import { baseMods } from './mods';
import { RNG } from './rng';
import { visibilityTick } from './systems/visibility';
import type { Faction, FactionKind, GameConfig, UnitType } from './types';
import { TAU } from './util';
import { dcos, dsin } from './dmath';

/**
 * Fill a new game: its Destinies and omens, its sector, the houses and what they start with, and what
 * waits in the dark. The steps come in this order and no other: each draws from the game's random
 * numbers, and a seed must always make the same sector.
 */
export function setupGame(g: Game, config: GameConfig): void {
  g.config = config;
  g.rng = new RNG(config.seed);
  chooseDestinies(g);
  const nEmp = config.houses ?? EMPIRES_BY_SIZE[config.size];
  const map = layOutSector(g, nEmp);
  const homes = seatHouses(g, nEmp, map.homes);
  lightHearths(g, nEmp, homes);
  firstFleets(g, nEmp);
  fillTheDark(g, map.relicSites.length);
  placeCorsairs(g, map.pirateBase);
  placeTheHollow(g, map.rift);
  g.nextGalactic = 360 + g.rng.float(0, 60);
  for (const t of g.traits) TRAIT_BY_ID[t]?.apply?.(g);
  visibilityTick(g);
}

/** The Destinies of the run, its ambition and its omens. (The cradle of an Ages run has one Destiny and no omens.) */
function chooseDestinies(g: Game): void {
  const config = g.config;
  const rng = g.rng;
  const optional = rng.shuffle([...OPTIONAL_VICTORIES]);
  g.victories = config.forcedVictories ? [...config.forcedVictories] : ['conquest', optional[0], optional[1]];
  if (!g.victories.includes('conquest')) g.victories.unshift('conquest');
  g.ambition = rng.pick(AMBITIONS).id;
  const traitPool = rng.shuffle(TRAITS.filter((t) => !t.requires || t.requires(g.victories)).map((t) => t.id));
  g.traits = [
    traitPool[0],
    traitPool.find((t, i) => i > 0 && !(t === 'turbulence' && traitPool[0] === 'currents') && !(t === 'currents' && traitPool[0] === 'turbulence'))!,
  ];
  if (g.cradle) {
    // The cradle has one Destiny (put out every rival Hearth) and no omens; those belong to the stars.
    g.victories = ['conquest'];
    g.ambition = '';
    g.traits = [];
  }
}

/** The sector itself (or the cradle world of an Ages run), and the table of ways through it. */
function layOutSector(g: Game, nEmp: number): MapGenResult {
  const config = g.config;
  const rng = g.rng;
  const cradle = g.cradle;
  const map = cradle ? generateCradle(rng.fork(), { houses: nEmp }) : generateMap(rng.fork(), { size: config.size, empires: nEmp, crisis: g.victories.includes('crisis') });
  g.nodes = map.nodes;
  g.lanes = map.lanes;
  g.systems = map.systems;
  g.bounds = { minX: map.minX, minY: map.minY, maxX: map.maxX, maxY: map.maxY };
  g.derive();
  return map;
}

/**
 * The houses, the player first, each at a Hearth drawn by lot; then the Corsairs, the guardians of the
 * dark and the Hollow. Returns the Hearths, in the order of the houses.
 */
function seatHouses(g: Game, nEmp: number, mapHomes: number[]): number[] {
  const config = g.config;
  const rng = g.rng;
  const cradle = g.cradle;
  const others = config.aiHeirs ?? rng.shuffle(HEIRS.filter((h) => h.id !== config.heir).map((h) => h.id));
  const homes = rng.shuffle([...mapHomes]);
  for (let i = 0; i < nEmp; i++) {
    const heirId = i === 0 ? config.heir : others[(i - 1) % others.length];
    const heir = HEIR_BY_ID[heirId] ?? HEIRS[0];
    const f = makeFaction(g, i, 'empire', heir.name, heir.color, heir.id);
    f.isPlayer = i === 0 && !config.autoplay;
    if (cradle) f.era = 0;
    if (!f.isPlayer) {
      f.ai = makeAIState(g, f, heir.personalities);
      f.incomeMul = AI_INCOME[config.difficulty];
    }
    g.factions.push(f);
  }
  g.playerId = 0;
  if (g.victories.includes('treasury')) {
    const merchants = g.factions.filter((f) => f.ai && (f.ai.personality === 'expansionist' || f.ai.personality === 'opportunist'));
    if (merchants.length) rng.pick(merchants).ai!.hoard = true;
  }
  g.pirateId = g.factions.length;
  g.factions.push(makeFaction(g, g.pirateId, 'pirate', 'Blackstar Corsairs', PIRATE_COLOR, ''));
  g.guardianId = g.factions.length;
  g.factions.push(makeFaction(g, g.guardianId, 'guardian', cradle ? 'Beasts of the Wild' : 'Ancient Sentinels', GUARDIAN_COLOR, ''));
  if (cradle) g.factions[g.guardianId].era = 0;
  g.crisisId = g.factions.length;
  const crisisF = makeFaction(g, g.crisisId, 'crisis', 'The Hollow', CRISIS_COLOR, '');
  crisisF.alive = g.victories.includes('crisis');
  g.factions.push(crisisF);
  return homes;
}

/** Each house's Hearth, and every world at its full strength. */
function lightHearths(g: Game, nEmp: number, homes: number[]): void {
  for (let i = 0; i < nEmp; i++) setupHearth(g, g.factions[i], homes[i]);
  for (const f of g.factions) g.recomputeMods(f);
  for (const n of g.nodes) {
    if (n.kind === 'planet') {
      g.refreshWorld(n);
      n.hp = n.maxHp;
      n.sh = n.maxSh;
    }
  }
}

/** What each house starts with: its Embers, its first ships, its first Boon to choose. */
function firstFleets(g: Game, nEmp: number): void {
  const config = g.config;
  const cradle = g.cradle;
  const perks = config.perks ?? {};
  for (let i = 0; i < nEmp; i++) {
    const f = g.factions[i];
    const heir = HEIR_BY_ID[f.heir];
    f.embers = ECON.startEmbers;
    f.rerolls = 1 + (heir.id === 'ashen' ? 2 : 0);
    let extraGuardians = 0;
    if (f.isPlayer || (config.autoplay && i === 0)) {
      f.rerolls += perks.archivist ?? 0;
      extraGuardians = perks.escort ?? 0;
    } else {
      const d = config.difficulty;
      f.embers += AI_START_EMBERS[d];
      extraGuardians = AI_START_GUARDIANS[d];
    }
    const cap = f.capital;
    // On the cradle there is no Ark yet (it is the last thing a house builds there), and no siege units in the Stone Age.
    if (!cradle) g.spawnUnit('ark', f.id, cap);
    for (let k = 0; k < heir.start.guardians + extraGuardians; k++) g.spawnUnit('guardian', f.id, cap);
    for (let k = 0; k < heir.start.strikers; k++) g.spawnUnit('striker', f.id, cap);
    for (let k = 0; k < heir.start.breakers; k++) g.spawnUnit(cradle ? 'striker' : 'breaker', f.id, cap);
    // Rival scouts set out at once; the player's wait at the Hearth for an order (EXPLORE).
    for (let k = 0; k < heir.start.scouts; k++) {
      const sc = g.spawnUnit('scout', f.id, cap);
      if (!f.isPlayer) sc.order = 'explore';
    }
    f.pendingDrafts = 1; // The origin Boon
    if (heir.start.epicCard && config.stage !== 'stars') g.grantRandomCard(f, ['epic'], (c) => !c.pact && c.cat !== 'blueprint');
  }
}

/** What waits in the dark: the militia of unclaimed worlds, the vaults and their sentinels, the anomalies. */
function fillTheDark(g: Game, relics: number): void {
  const config = g.config;
  const rng = g.rng;
  g.eventDeck = rng.shuffle([...ANOMALY_EVENTS]);
  g.offerDeck = rng.shuffle([...OFFER_EVENTS]);
  const relicIds = rng.shuffle(RELICS.map((r) => r.id));
  let relicIdx = 0;
  for (const n of g.nodes) {
    if (n.tag.startsWith('militia:')) {
      const count = parseInt(n.tag.split(':')[1], 10) || 1;
      const strong = g.systems[n.system] && !g.systems[n.system].home;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + rng.float(0, 1);
        const type: UnitType = strong && k === 0 && rng.chance(0.45) ? 'sentinel' : 'militia';
        g.spawnUnit(type, g.guardianId, n.id, { x: n.x + dcos(a) * (n.r + 110), y: n.y + dsin(a) * (n.r + 110) });
      }
    }
    if (n.kind === 'relic') {
      n.relic = relicIds[relicIdx++ % relicIds.length];
      g.spawnUnit('monolith', g.guardianId, n.id, { x: n.x, y: n.y });
      const sentinels = config.size === 'large' ? 5 : 4;
      for (let k = 0; k < sentinels; k++) {
        const a = (k / sentinels) * TAU;
        g.spawnUnit('sentinel', g.guardianId, n.id, { x: n.x + dcos(a) * 170, y: n.y + dsin(a) * 170 });
      }
    }
    if (n.kind === 'anomaly') {
      n.anomaly = g.drawAnomaly();
      const home = g.systems[n.system]?.home;
      if (rng.chance(home ? 0.1 : 0.4)) {
        const k = home ? 1 : rng.int(1, 2);
        for (let i = 0; i < k; i++) g.spawnUnit('sentinel', g.guardianId, n.id, { x: n.x + rng.float(-150, 150), y: n.y + rng.float(-150, 150) });
      }
    }
  }
  g.relicTotal = relics;
}

/** The Corsairs at their base, and when they first raid. */
function placeCorsairs(g: Game, base: number): void {
  const config = g.config;
  const rng = g.rng;
  if (base < 0) {
    g.pirates = { base: -1, stronghold: -1, alive: false, raidCount: 0, raids: [], marked: -1, nextRaid: 1e12 };
  } else {
    const pb = g.nodes[base];
    const sh = g.spawnUnit('stronghold', g.pirateId, pb.id, { x: pb.x, y: pb.y });
    for (let k = 0; k < 3; k++) g.spawnUnit('raider', g.pirateId, pb.id);
    for (let k = 0; k < 2; k++) g.spawnUnit('marauder', g.pirateId, pb.id);
    g.pirates = {
      base: pb.id, stronghold: sh.id, alive: true, raidCount: 0, raids: [], marked: -1,
      nextRaid: PIRATE_FIRST_RAID[config.difficulty] + rng.float(0, 60),
    };
  }
}

/** The Hollow, asleep in the Maw until their hour, in a run where they are a Destiny. */
function placeTheHollow(g: Game, rift: number): void {
  const config = g.config;
  const rng = g.rng;
  if (g.victories.includes('crisis') && rift >= 0) {
    const awaken = CRISIS_AWAKEN + rng.float(0, 180) + CRISIS_OFFSET[config.difficulty];
    g.crisis = { node: rift, heart: -1, awakenAt: awaken, awake: false, dead: false, nextWave: 0, waves: 0, warned: false };
  }
}
function makeFaction(g: Game, id: number, kind: FactionKind, name: string, color: string, heir: string): Faction {
  const N = g.nodes.length;
  return {
    id, name, heir, color, kind, isPlayer: false, alive: true,
    embers: 0, income: 0, lore: 0, loreRate: 0, boons: 0,
    pendingDrafts: 0, draftOffer: null, rerolls: 1, cards: [], relics: [], mods: baseMods(), capital: -1,
    explored: new Array(N).fill(0), visible: new Array(N).fill(0), seenOwner: new Array(N).fill(-1),
    hangarUsed: 0, hangarCap: 0, bays: 0,
    stats: {
      shipsBuilt: 0, shipsLost: 0, kills: 0, worldsKindled: 0, worldsCaptured: 0, worldsLost: 0, maxWorlds: 0,
      damageDealt: 0, embersEarned: 0, rivalsEliminated: 0, strongholdDestroyed: false, arkLost: false, maxRelics: 0, eventsResolved: 0,
    },
    ai: null, ark: -1, arkLevel: 1, arkXp: 0, arkAbil: [], powerCd: POWER_FIRST, incomeMul: 1, holdTimer: 0, treasuryTimer: 0, relicTimer: 0, gate: null,
    boomT: 0, echoT: 0, interestT: 0, stormT: 0, bpPity: 0, eliminatedAt: -1, warned: {}, score: 0,
    era: SPACE, advance: null, launchedAt: -1, asleepUntil: 0, graceUntil: 0,
  };
}

function setupHearth(g: Game, f: Faction, nodeId: number) {
  const n = g.nodes[nodeId];
  const heir = HEIR_BY_ID[f.heir];
  n.owner = f.id;
  n.capitalOf = f.id;
  n.name = heir.hearth;
  n.r = Math.max(n.r, 82);
  n.well = Math.round(n.r + 400);
  n.size = 'L';
  n.level = 2;
  n.role = null;
  n.glow = 1;
  n.tag = 'home';
  f.capital = nodeId;
  f.explored[nodeId] = 1;
}
