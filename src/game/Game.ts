import { ABILITY_BY_ID, LEARNABLE_ABILITIES } from './data/abilities';
import { AMBITIONS } from './data/ambitions';
import { BLUEPRINT_IDS, CARDS, CARD_BY_ID, LEGENDARY_BY, RARITY_LUCK, RARITY_WEIGHT, type CardDef } from './data/cards';
import { ERAS, LAST_CRADLE_ERA, SPACE, UPGRADE_MAX, UPGRADE_SPREAD } from './data/eras';
import { GOAL_BY_ID, GOAL_REWARD } from './data/goals';
import { EVENT_BY_ID, ANOMALY_EVENTS, OFFER_EVENTS } from './data/events';
import { CRISIS_COLOR, GUARDIAN_COLOR, HEIRS, HEIR_BY_ID, PIRATE_COLOR } from './data/heirs';
import { boonCost, ECON, PLANETS, ROLE_ORDER } from './data/worlds';
import { RELICS, RELIC_BY_ID } from './data/relics';
import { TRAITS, TRAIT_BY_ID } from './data/traits';
import { ABILITY_LEVELS, DMG_TABLE, DREADNOUGHT_CAP, LEVEL_XP, MAX_LEVEL, UNITS } from './data/units';
import { ASCENSION_BOONS, OPTIONAL_VICTORIES } from './data/victories';
import {
  AI_INCOME, CRISIS_AWAKEN, CRISIS_OFFSET, JUMP_CHARGE, PHASE_SPEED, PIRATE_FIRST_RAID, HOLD_FIELD, QUEUE_MAX, SAVE_VERSION, TICK,
} from './constants';
import { computePaths, EMPIRES_BY_SIZE, generateCradle, generateMap, type SystemInfo } from './mapgen';
import { baseMods, mul } from './mods';
import { RNG } from './rng';
import type {
  AIState, CrisisState, DmgType, Faction, FactionKind, Fx, GameConfig, GNode, Lane, Mods, Note, Outcome, PirateState,
  Projectile, Prompt, Rarity, Unit, UnitMod, UnitType, VictoryId, WeaponDef, WorldRole,
} from './types';
import { clamp, dist, TAU } from './util';
import { economyTick, recomputeHangar } from './systems/economy';
import { productionTick } from './systems/production';
import { movementTick } from './systems/movement';
import { combatTick, projectileTick } from './systems/combat';
import { statusTick } from './systems/status';
import { abilitiesTick } from './systems/abilities';
import { visibilityTick } from './systems/visibility';
import { eventsTick } from './systems/events';
import { piratesTick } from './systems/pirates';
import { crisisTick } from './systems/crisis';
import { victoryTick } from './systems/victory';
import { aiTick, makeAIState } from './ai/ai';

/** The Boons the First Night offers first (as many as the house may choose from), see `generateOffer`. */
const FIRST_OFFER = ['emberTithe', 'strikerWings', 'kindlingRites', 'hardHulls', 'stargazers'];

const EMPTY_UM: UnitMod = {};

export interface SaveData {
  v: number;
  config: GameConfig;
  rng: number[];
  time: number;
  tick: number;
  nextId: number;
  nodes: GNode[];
  lanes: Lane[];
  systems: SystemInfo[];
  factions: Omit<Faction, 'mods'>[];
  units: Unit[];
  projectiles: Projectile[];
  victories: VictoryId[];
  ambition: string;
  traits: string[];
  playerId: number;
  pirateId: number;
  guardianId: number;
  crisisId: number;
  pirates: PirateState;
  crisis: CrisisState | null;
  prompts: Prompt[];
  notes: Note[];
  outcome: Outcome | null;
  nextGalactic: number;
  eventDeck: string[];
  offerDeck: string[];
  relicTotal: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  noteId: number;
  promptId: number;
  ui: Record<string, number>;
  ascended?: boolean;
}

/** A reason a command cannot be carried out, or null when it can. */
export type QueueCheck = string | null;

/** The most choices a Boon draft can offer. */
export const MAX_DRAFT = 5;

export class Game {
  config!: GameConfig;
  rng!: RNG;
  time = 0;
  tick = 0;
  nextId = 1;
  nodes: GNode[] = [];
  lanes: Lane[] = [];
  systems: SystemInfo[] = [];
  factions: Faction[] = [];
  unitList: Unit[] = [];
  units = new Map<number, Unit>();
  projectiles: Projectile[] = [];
  victories: VictoryId[] = [];
  ambition = '';
  traits: string[] = [];
  playerId = 0;
  pirateId = -1;
  guardianId = -1;
  crisisId = -1;
  pirates!: PirateState;
  crisis: CrisisState | null = null;
  prompts: Prompt[] = [];
  notes: Note[] = [];
  fx: Fx[] = [];
  outcome: Outcome | null = null;
  nextGalactic = 360;
  eventDeck: string[] = [];
  offerDeck: string[] = [];
  relicTotal = 0;
  bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  noteId = 1;
  promptId = 1;
  /** Client-side state saved with the run (tutorial step, revealed HUD parts). Never read by the simulation. */
  ui: Record<string, number> = {};

  // ---- derived / transient ----
  pathDist!: Float64Array;
  pathNext!: Int32Array;
  pathHops!: Int32Array;
  buckets: Unit[][] = [];
  deferred: (() => void)[] = [];
  fxEnabled = true;
  worldCount = 0;
  /** Set once the client has shown the end of the run. */
  outcomeHandled = false;
  /** Ages, among the stars: how many houses have not arrived yet (see `asleep`). */
  private sleepers = 0;
  /** Ages, cradle stage: the player's Ark has left for the stars. The game stands still; the client takes the run on. */
  ascended = false;

  /** An Ages run still on its cradle world: the houses climb through the ages, and the rules of the ages hold. */
  get cradle(): boolean {
    return this.config.mode === 'ages' && this.config.stage !== 'stars';
  }

  // =====================================================================
  // Construction
  // =====================================================================

  static create(config: GameConfig): Game {
    const g = new Game();
    g.config = config;
    g.rng = new RNG(config.seed);
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
    const cradle = g.cradle;
    if (cradle) {
      // The cradle has one Destiny (put out every rival Hearth) and no omens; those belong to the stars.
      g.victories = ['conquest'];
      g.ambition = '';
      g.traits = [];
    }
    const nEmp = config.houses ?? EMPIRES_BY_SIZE[config.size];
    const map = cradle ? generateCradle(rng.fork(), { houses: nEmp }) : generateMap(rng.fork(), { size: config.size, empires: nEmp, crisis: g.victories.includes('crisis') });
    g.nodes = map.nodes;
    g.lanes = map.lanes;
    g.systems = map.systems;
    g.bounds = { minX: map.minX, minY: map.minY, maxX: map.maxX, maxY: map.maxY };
    g.derive();

    // ---- Houses ----
    const others = config.aiHeirs ?? rng.shuffle(HEIRS.filter((h) => h.id !== config.heir).map((h) => h.id));
    const homes = rng.shuffle([...map.homes]);
    for (let i = 0; i < nEmp; i++) {
      const heirId = i === 0 ? config.heir : others[(i - 1) % others.length];
      const heir = HEIR_BY_ID[heirId] ?? HEIRS[0];
      const f = g.makeFaction(i, 'empire', heir.name, heir.color, heir.id);
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
    g.factions.push(g.makeFaction(g.pirateId, 'pirate', 'Blackstar Corsairs', PIRATE_COLOR, ''));
    g.guardianId = g.factions.length;
    g.factions.push(g.makeFaction(g.guardianId, 'guardian', cradle ? 'Beasts of the Wild' : 'Ancient Sentinels', GUARDIAN_COLOR, ''));
    if (cradle) g.factions[g.guardianId].era = 0;
    g.crisisId = g.factions.length;
    const crisisF = g.makeFaction(g.crisisId, 'crisis', 'The Hollow', CRISIS_COLOR, '');
    crisisF.alive = g.victories.includes('crisis');
    g.factions.push(crisisF);

    // ---- Hearths ----
    for (let i = 0; i < nEmp; i++) g.setupHearth(g.factions[i], homes[i]);
    for (const f of g.factions) g.recomputeMods(f);
    for (const n of g.nodes) {
      if (n.kind === 'planet') {
        g.refreshWorld(n);
        n.hp = n.maxHp;
        n.sh = n.maxSh;
      }
    }

    // ---- Starting Embers and fleets ----
    const perks = config.perks ?? {};
    for (let i = 0; i < nEmp; i++) {
      const f = g.factions[i];
      const heir = HEIR_BY_ID[f.heir];
      f.embers = ECON.startEmbers;
      f.rerolls = 1 + (heir.id === 'ashen' ? 2 : 0);
      let extraGuardians = 0;
      if (f.isPlayer || (config.autoplay && i === 0)) {
        f.embers += 100 * (perks.oldCoin ?? 0);
        f.lore += 40 * (perks.loreSeed ?? 0);
        f.rerolls += perks.archivist ?? 0;
        extraGuardians = perks.escort ?? 0;
      } else {
        const d = config.difficulty;
        if (d >= 2) f.embers += 100;
        if (d >= 3) {
          f.embers += 100;
          extraGuardians = 1;
        }
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

    // ---- Neutral content ----
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
          g.spawnUnit(type, g.guardianId, n.id, { x: n.x + Math.cos(a) * (n.r + 110), y: n.y + Math.sin(a) * (n.r + 110) });
        }
      }
      if (n.kind === 'relic') {
        n.relic = relicIds[relicIdx++ % relicIds.length];
        g.spawnUnit('monolith', g.guardianId, n.id, { x: n.x, y: n.y });
        const sentinels = config.size === 'large' ? 5 : 4;
        for (let k = 0; k < sentinels; k++) {
          const a = (k / sentinels) * TAU;
          g.spawnUnit('sentinel', g.guardianId, n.id, { x: n.x + Math.cos(a) * 170, y: n.y + Math.sin(a) * 170 });
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
    g.relicTotal = map.relicSites.length;

    // ---- Corsairs ----
    if (map.pirateBase < 0) {
      g.pirates = { base: -1, stronghold: -1, alive: false, raidCount: 0, raids: [], marked: -1, nextRaid: 1e12 };
    } else {
      const pb = g.nodes[map.pirateBase];
      const sh = g.spawnUnit('stronghold', g.pirateId, pb.id, { x: pb.x, y: pb.y });
      for (let k = 0; k < 3; k++) g.spawnUnit('raider', g.pirateId, pb.id);
      for (let k = 0; k < 2; k++) g.spawnUnit('marauder', g.pirateId, pb.id);
      g.pirates = {
        base: pb.id, stronghold: sh.id, alive: true, raidCount: 0, raids: [], marked: -1,
        nextRaid: PIRATE_FIRST_RAID[config.difficulty] + rng.float(0, 60),
      };
    }

    // ---- The Hollow ----
    if (g.victories.includes('crisis') && map.rift >= 0) {
      const awaken = CRISIS_AWAKEN + rng.float(0, 180) + CRISIS_OFFSET[config.difficulty];
      g.crisis = { node: map.rift, heart: -1, awakenAt: awaken, awake: false, dead: false, nextWave: 0, waves: 0, warned: false };
    }

    g.nextGalactic = 360 + rng.float(0, 60);
    for (const t of g.traits) TRAIT_BY_ID[t]?.apply?.(g);
    visibilityTick(g);
    return g;
  }

  static load(data: SaveData): Game {
    if (data.v !== SAVE_VERSION) throw new Error('Incompatible save version');
    const g = new Game();
    g.config = data.config;
    g.rng = new RNG(data.rng);
    g.time = data.time;
    g.tick = data.tick;
    g.nextId = data.nextId;
    g.nodes = data.nodes;
    g.lanes = data.lanes;
    g.systems = data.systems;
    g.factions = data.factions.map((f) => ({ ...f, mods: baseMods() }) as Faction);
    // Saves from earlier builds lack newer fields: give them their starting values.
    for (const f of g.factions) {
      f.bays ??= 0;
      f.era ??= SPACE;
      f.advance ??= null;
      f.launchedAt ??= -1;
      // (A Boon that no longer exists is dropped, so that a run saved by an earlier build still loads.)
      f.cards = f.cards.filter((id) => CARD_BY_ID[id]);
      f.asleepUntil ??= 0;
      f.graceUntil ??= 0;
      if (f.ai) {
        f.ai.grudge ??= -1;
        f.ai.grudgeAt ??= -999;
      }
    }
    g.unitList = data.units;
    for (const u of g.unitList) {
      // JSON turns NaN ("no target point") into null; restore it.
      if (u.ox === null) u.ox = NaN;
      if (u.oy === null) u.oy = NaN;
      u.era ??= SPACE;
      g.units.set(u.id, u);
    }
    g.projectiles = data.projectiles;
    g.victories = data.victories;
    g.ambition = data.ambition;
    g.traits = data.traits ?? [];
    g.playerId = data.playerId;
    g.pirateId = data.pirateId;
    g.guardianId = data.guardianId;
    g.crisisId = data.crisisId;
    g.pirates = data.pirates;
    g.crisis = data.crisis;
    g.prompts = data.prompts;
    g.notes = data.notes;
    g.outcome = data.outcome;
    g.nextGalactic = data.nextGalactic;
    g.eventDeck = data.eventDeck;
    g.offerDeck = data.offerDeck;
    g.relicTotal = data.relicTotal;
    g.bounds = data.bounds;
    g.noteId = data.noteId;
    g.promptId = data.promptId;
    g.ui = data.ui ?? {};
    g.ascended = data.ascended ?? false;
    g.countSleepers();
    g.derive();
    for (const f of g.factions) g.recomputeMods(f);
    // Hangar use is recounted every half second in play; keep the saved count so a loaded game
    // continues exactly like the one that was saved.
    data.factions.forEach((sf, i) => {
      g.factions[i].hangarUsed = sf.hangarUsed;
      g.factions[i].hangarCap = sf.hangarCap;
    });
    g.rebuildBuckets();
    return g;
  }

  serialize(): SaveData {
    return {
      v: SAVE_VERSION,
      config: this.config,
      rng: this.rng.state(),
      time: this.time,
      tick: this.tick,
      nextId: this.nextId,
      nodes: this.nodes,
      lanes: this.lanes,
      systems: this.systems,
      factions: this.factions.map(({ mods: _m, ...rest }) => rest),
      units: this.unitList.filter((u) => !u.dead),
      projectiles: this.projectiles,
      victories: this.victories,
      ambition: this.ambition,
      traits: this.traits,
      playerId: this.playerId,
      pirateId: this.pirateId,
      guardianId: this.guardianId,
      crisisId: this.crisisId,
      pirates: this.pirates,
      crisis: this.crisis,
      prompts: this.prompts,
      notes: this.notes.slice(-30),
      outcome: this.outcome,
      nextGalactic: this.nextGalactic,
      eventDeck: this.eventDeck,
      offerDeck: this.offerDeck,
      relicTotal: this.relicTotal,
      bounds: this.bounds,
      noteId: this.noteId,
      promptId: this.promptId,
      ui: this.ui,
      ascended: this.ascended || undefined,
    };
  }

  private derive() {
    const p = computePaths(this.nodes, this.lanes);
    this.pathDist = p.dist;
    this.pathNext = p.next;
    this.pathHops = p.hops;
    this.buckets = this.nodes.map(() => []);
    this.worldCount = this.nodes.filter((n) => n.kind === 'planet').length;
  }

  private makeFaction(id: number, kind: FactionKind, name: string, color: string, heir: string): Faction {
    const N = this.nodes.length;
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
      ai: null, ark: -1, arkLevel: 1, arkXp: 0, arkAbil: [], incomeMul: 1, holdTimer: 0, treasuryTimer: 0, relicTimer: 0, gate: null,
      boomT: 0, echoT: 0, interestT: 0, stormT: 0, bpPity: 0, eliminatedAt: -1, warned: {}, score: 0,
      era: SPACE, advance: null, launchedAt: -1, asleepUntil: 0, graceUntil: 0,
    };
  }

  private setupHearth(f: Faction, nodeId: number) {
    const n = this.nodes[nodeId];
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

  private drawAnomaly(): string {
    if (this.eventDeck.length === 0) this.eventDeck = this.rng.shuffle([...ANOMALY_EVENTS]);
    return this.eventDeck.pop()!;
  }

  drawOffer(): string {
    if (this.offerDeck.length === 0) this.offerDeck = this.rng.shuffle([...OFFER_EVENTS]);
    return this.offerDeck.pop()!;
  }

  // =====================================================================
  // Queries
  // =====================================================================

  get player(): Faction {
    return this.factions[this.playerId];
  }

  empires(): Faction[] {
    return this.factions.filter((f) => f.kind === 'empire');
  }

  aliveEmpires(): Faction[] {
    return this.factions.filter((f) => f.kind === 'empire' && f.alive);
  }

  hostile(a: number, b: number): boolean {
    if (a === b || a < 0 || b < 0) return false;
    // (Ages: a house that has not arrived among the stars yet fights no one, and no one fights it.)
    return this.sleepers === 0 || (!this.asleep(a) && !this.asleep(b));
  }

  /** Ages, among the stars: has this house not arrived from the cradle yet? */
  asleep(fid: number): boolean {
    return this.sleepers > 0 && this.time < this.factions[fid].asleepUntil;
  }

  /** Count the houses still on their way (after setting `asleepUntil`, or loading). */
  countSleepers() {
    this.sleepers = this.factions.filter((f) => f.asleepUntil > 0).length;
  }

  /** A house arrives among the stars. */
  private wake(f: Faction) {
    f.asleepUntil = 0;
    this.countSleepers();
    if (!f.alive) return;
    if (!f.isPlayer) {
      for (const u of this.unitsOf(f.id)) if (UNITS[u.type].role === 'scout') u.order = 'explore';
      this.notify(-1, `The Ark of ${f.name} has reached the stars.`, 'alert', this.player.explored[f.capital] ? f.capital : undefined);
    }
  }

  worldsOf(fid: number): GNode[] {
    return this.nodes.filter((n) => n.kind === 'planet' && n.owner === fid);
  }

  unitsOf(fid: number): Unit[] {
    return this.unitList.filter((u) => !u.dead && u.owner === fid);
  }

  pathLen(a: number, b: number): number {
    return this.pathDist[a * this.nodes.length + b];
  }

  hops(a: number, b: number): number {
    return this.pathHops[a * this.nodes.length + b];
  }

  /**
   * Is this a place with nothing left in it: an anomaly that has been looked into, a vault whose relic
   * is gone, the Corsair base once it is destroyed, the Maw once the Hollow are purged? (The map writes
   * the name of such a place in grey.)
   */
  siteSpent(n: GNode): boolean {
    if (n.kind === 'anomaly') return !n.anomaly;
    if (n.kind === 'relic') return !n.relic;
    if (n.kind === 'pirate') return !this.pirates.alive;
    if (n.kind === 'rift') return !!this.crisis?.dead;
    return false;
  }

  /** Has this house seen that place to be guarded (by anything that would fire on its ships)? */
  seenGuarded(f: Faction, nodeId: number): boolean {
    return !!f.explored[nodeId] && this.hostilePowerAt(nodeId, f.id) > 1;
  }

  /**
   * A way from `from` to `to` on which nothing is guarded as far as the house has seen (the last
   * stop itself may be anything: it is the place to find out about). Empty if there is none.
   */
  safeWay(f: Faction, from: number, to: number): number[] {
    const way = this.pathAvoiding(from, to, (id) => (this.seenGuarded(f, id) ? 1e7 : 0));
    return way.length && !way.slice(0, -1).some((id) => this.seenGuarded(f, id)) ? way : [];
  }

  /** How many places the house has not charted and a Scout could reach safely from its Hearth. */
  chartable(fid: number): number {
    const f = this.factions[fid];
    if (!f || f.capital < 0) return 0;
    let n = 0;
    for (const node of this.nodes) if (!f.explored[node.id] && this.safeWay(f, f.capital, node.id).length) n++;
    return n;
  }

  /** How long a way is: the jumps from `from` through `way`, each with its spool (as `pathLen` counts them). */
  wayLen(from: number, way: number[]): number {
    let d = 0;
    let at = from;
    for (const to of way) {
      d += this.pathLen(at, to);
      at = to;
    }
    return d;
  }

  /**
   * The way from `a` to `b` (the places to jump to, in order) that keeps clear of trouble: every place
   * on the way counts as `extra(place)` further than it is, so the way goes round a place with a high
   * cost when there is another way, and through it when there is none. The ends themselves are free.
   */
  pathAvoiding(a: number, b: number, extra: (nodeId: number) => number): number[] {
    const N = this.nodes.length;
    if (a === b || a < 0 || b < 0) return [];
    const pen = new Float64Array(N);
    let any = false;
    for (let i = 0; i < N; i++) {
      if (i === a || i === b) continue;
      pen[i] = Math.max(0, extra(i));
      if (pen[i] > 0) any = true;
    }
    if (!any) return this.pathTo(a, b);
    const far = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    far[a] = 0;
    for (let it = 0; it < N; it++) {
      let cur = -1;
      let best = Infinity;
      for (let i = 0; i < N; i++) {
        if (!done[i] && far[i] < best) {
          best = far[i];
          cur = i;
        }
      }
      if (cur < 0 || cur === b) break;
      done[cur] = 1;
      for (const l of this.lanes) {
        const o = l.a === cur ? l.b : l.b === cur ? l.a : -1;
        if (o < 0 || done[o]) continue;
        // (A jump costs its length and its spool, as in the sector's own table of ways.)
        const d = best + l.len + 900 + pen[o];
        if (d < far[o]) {
          far[o] = d;
          prev[o] = cur;
        }
      }
    }
    if (!isFinite(far[b])) return [];
    const out: number[] = [];
    for (let cur = b; cur !== a && cur >= 0; cur = prev[cur]) out.push(cur);
    return out.reverse();
  }

  pathTo(a: number, b: number): number[] {
    const out: number[] = [];
    const N = this.nodes.length;
    let cur = a;
    let guard = 0;
    while (cur !== b && guard++ < N + 2) {
      const nx = this.pathNext[cur * N + b];
      if (nx < 0) return [];
      out.push(nx);
      cur = nx;
    }
    return out;
  }

  /** Lore needed for this house's next Boon. */
  boonCostOf(f: Faction): number {
    return Math.round(boonCost(f.boons) * (this.traits.includes('discovery') ? 0.85 : 1));
  }

  hasCard(f: Faction, id: string): boolean {
    return f.cards.includes(id);
  }

  // ---- worlds ----

  affinityOf(n: GNode): WorldRole | null {
    return n.ptype ? PLANETS[n.ptype].affinity : null;
  }

  /** Whether a world currently benefits from a role. The Hearth has every role. */
  hasRole(n: GNode, role: WorldRole): boolean {
    if (n.kind !== 'planet' || n.owner < 0) return false;
    if (n.capitalOf >= 0) return true;
    return n.role === role && n.retool <= 0;
  }

  /** Bonus multiplier for a role's main effect at this world (affinity + boons). */
  roleBonus(n: GNode, role: WorldRole): number {
    const m = n.owner >= 0 ? this.factions[n.owner].mods : null;
    return 1 + (this.affinityOf(n) === role && n.capitalOf < 0 ? ECON.affinity : 0) + (m ? m.role[role] : 0);
  }

  levelMulOf(n: GNode): number {
    return ECON.levelMul[clamp(n.level, 1, 3)];
  }

  worldEmbers(n: GNode): number {
    if (n.kind !== 'planet' || n.owner < 0) return 0;
    const f = this.factions[n.owner];
    if (f.kind !== 'empire') return 0;
    let e: number;
    if (n.capitalOf >= 0) e = (ECON.hearthEmbers * this.levelMulOf(n)) / ECON.levelMul[2];
    else {
      e = ECON.embers[n.size] * this.levelMulOf(n);
      if (this.hasRole(n, 'mine')) e *= 1 + ECON.mineBonus * this.roleBonus(n, 'mine');
    }
    if (n.lastHit < 5) e *= 0.5;
    return e * n.glow;
  }

  worldLore(n: GNode): number {
    if (n.kind !== 'planet' || n.owner < 0) return 0;
    const f = this.factions[n.owner];
    if (f.kind !== 'empire') return 0;
    let l = ECON.worldLore;
    if (n.capitalOf >= 0) l += (ECON.hearthLore * this.levelMulOf(n)) / ECON.levelMul[2];
    else if (this.hasRole(n, 'observatory')) l += ECON.observatoryLore * this.levelMulOf(n) * this.roleBonus(n, 'observatory');
    return l * n.glow;
  }

  /** Ship build speed multiplier of a Forge (or the Hearth). 0 if it cannot build. */
  forgeMul(n: GNode): number {
    if (!this.hasRole(n, 'forge')) return 0;
    return (1 + ECON.forgeBuildPerLevel * (n.level - 1)) * (n.capitalOf >= 0 ? 1 : this.roleBonus(n, 'forge'));
  }

  isForge(n: GNode): boolean {
    return n.kind === 'planet' && n.owner >= 0 && (n.capitalOf >= 0 || n.role === 'forge');
  }

  /** How far a Hearth's walls have risen (0.45 at the start, 1 after 12 minutes). Other worlds: 1. */
  wallsOf(n: GNode): number {
    if (n.capitalOf < 0) return 1;
    // By the whole second: a Hearth's walls are rebuilt once a second (economyTick), and a game saved
    // between two seconds must come back with the walls it had. (Loading rebuilds every world, so with
    // the time to the tick a loaded Hearth stood a hair taller than the one that was saved.)
    const seconds = Math.floor(this.tick * TICK + 1e-6);
    return Math.min(1, ECON.wallsStart + (1 - ECON.wallsStart) * (seconds / ECON.wallsTime));
  }

  worldGun(n: GNode): { dmg: number; cd: number; range: number } | null {
    if (n.kind !== 'planet' || n.owner < 0) return null;
    const f = this.factions[n.owner];
    if (f.kind !== 'empire') return null;
    const m = f.mods;
    const cap = n.capitalOf >= 0;
    let dmg = 0;
    if (cap) dmg = (100 + 20 * (n.level - 2)) * this.wallsOf(n);
    else if (this.hasRole(n, 'bastion')) dmg = (30 + 14 * (n.level - 1)) * this.roleBonus(n, 'bastion');
    else if ((m.flags.allGuns ?? 0) > 0) dmg = 12 + 6 * (n.level - 1);
    if (dmg <= 0) return null;
    dmg *= mul(m.worldGun + (cap ? m.hearthGun : 0)) * ERAS[f.era].power;
    return { dmg, cd: 1.0, range: n.well * 0.95 };
  }

  refreshWorld(n: GNode) {
    if (n.kind !== 'planet' || !n.ptype) return;
    const m = n.owner >= 0 && this.factions[n.owner].kind === 'empire' ? this.factions[n.owner].mods : null;
    const cap = n.capitalOf >= 0;
    let base = cap ? ECON.hearthHp * (1 + ECON.hpPerLevel * (n.level - 2)) * this.wallsOf(n) : ECON.hp[n.size] * (1 + ECON.hpPerLevel * (n.level - 1));
    if (!cap && n.owner >= 0 && n.role === 'bastion') base *= 1 + ECON.bastionHp * this.roleBonus(n, 'bastion');
    // (Walls are as strong as the age of the house that holds them.)
    if (m) base *= mul(m.worldHp + (cap ? m.hearthHp : 0), 0.3) * ERAS[this.factions[n.owner].era].power;
    const newMax = Math.round(base);
    if (newMax !== n.maxHp) {
      const frac = n.maxHp > 0 ? n.hp / n.maxHp : 1;
      n.maxHp = newMax;
      n.hp = clamp(frac * newMax, 0, newMax);
    }
    n.maxSh = Math.round(newMax * (cap ? 0.35 : ECON.shieldFrac));
    n.sh = Math.min(n.sh, n.maxSh);
  }

  setLevel(n: GNode, level: number) {
    n.level = clamp(level, 1, 3);
    this.refreshWorld(n);
    if (n.owner >= 0) recomputeHangar(this, this.factions[n.owner]);
  }

  /** Hangar space: a base, plus some for every world (more for higher levels). */
  hangarCapOf(f: Faction): number {
    let space = ECON.hangarBase + f.mods.hangar + ECON.bayHangar * (f.bays ?? 0);
    for (const n of this.nodes) if (n.owner === f.id && n.kind === 'planet') space += ECON.hangarPerWorld + (n.level - 1);
    return Math.floor(space * mul(f.mods.hangarMul, 0.3));
  }

  /** Embers to kindle the next dark world. */
  kindleCost(f: Faction): number {
    let owned = 0;
    for (const n of this.nodes) if (n.owner === f.id && n.kind === 'planet') owned++;
    for (const u of this.unitList) if (!u.dead && u.owner === f.id && u.type === 'seed' && u.order === 'kindle') owned++;
    return Math.round((ECON.kindleBase + ECON.kindleStep * owned) * mul(f.mods.kindleCost, 0.2));
  }

  upgradeCost(f: Faction, n: GNode): number | null {
    if (n.level >= 3) return null;
    return Math.round(ECON.upgradeCost[n.level + 1] * ECON.sizeCost[n.size] * mul(f.mods.upgradeCost, 0.2));
  }

  // ---- unit derived stats ----

  umod(u: Unit): UnitMod {
    return this.factions[u.owner].mods.unit[u.type] ?? EMPTY_UM;
  }

  levelMul(u: Unit): number {
    return 1 + 0.08 * (u.level - 1);
  }

  refreshUnitStats(u: Unit, fresh = false, hpFrac = 1) {
    const def = UNITS[u.type];
    const m = this.factions[u.owner].mods;
    const um = m.unit[u.type] ?? EMPTY_UM;
    const age = ERAS[u.era].power;
    const maxHp = def.hull * mul(m.hull + (um.hull ?? 0), 0.2) * this.levelMul(u) * age;
    const maxSh = def.shield * mul(m.shield, 0) * age;
    if (fresh) {
      u.hp = maxHp * hpFrac;
      u.sh = maxSh;
    } else {
      if (maxHp !== u.maxHp) {
        const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
        u.hp = frac * maxHp;
      }
      u.sh = Math.min(u.sh, maxSh);
    }
    u.maxHp = maxHp;
    u.maxSh = maxSh;
  }

  armorOf(u: Unit): number {
    return clamp(UNITS[u.type].armor + this.factions[u.owner].mods.armor, 0, 0.75);
  }

  hasBuff(u: Unit, id: string): boolean {
    for (const b of u.buffs) if (b.id === id) return true;
    return false;
  }

  /** True when an enemy house's Gravity Anchors hold this world. */
  private anchoredAt(u: Unit): boolean {
    if (u.node < 0) return false;
    const n = this.nodes[u.node];
    return n.owner >= 0 && this.hostile(n.owner, u.owner) && (this.factions[n.owner].mods.flags.anchors ?? 0) > 0;
  }

  /**
   * Does this world keep an anti-warp field up? A Bastion does, a Hearth does (it does every role), and
   * so does any world with a Starbase. It is how a house makes raiders stand and fight: without one,
   * any fleet can jump away from any fight in a few seconds, and wars turn into chases.
   */
  fieldAt(n: GNode): boolean {
    if (n.kind !== 'planet' || n.owner < 0 || this.factions[n.owner].kind !== 'empire') return false;
    if (this.hasRole(n, 'bastion')) return true;
    for (const u of this.buckets[n.id]) if (u.type === 'starbase' && u.owner === n.owner && !u.dead) return true;
    return false;
  }

  /**
   * How many seconds longer a ship takes to jump away from where it is, because the house that holds
   * the world keeps it there: an anti-warp field (`fieldAt`), and the Gravity Anchors Boon at any of
   * that house's worlds.
   */
  holdAt(u: Unit): number {
    if (u.node < 0) return 0;
    const n = this.nodes[u.node];
    if (n.owner < 0 || !this.hostile(n.owner, u.owner)) return 0;
    return (this.fieldAt(n) ? HOLD_FIELD : 0) + (this.anchoredAt(u) ? 4 : 0);
  }

  speedOf(u: Unit): number {
    const def = UNITS[u.type];
    const m = this.factions[u.owner].mods;
    let s = def.speed * mul(m.speed + (this.umod(u).speed ?? 0), 0.3);
    if (u.snare > 0) s *= 0.6;
    if (this.anchoredAt(u)) s *= 0.7;
    return s;
  }

  jumpChargeOf(u: Unit): number {
    const m = this.factions[u.owner].mods;
    return JUMP_CHARGE * mul(m.jumpCharge, 0.2) + this.holdAt(u);
  }

  laneSpeedOf(u: Unit): number {
    return PHASE_SPEED * mul(this.factions[u.owner].mods.laneSpeed, 0.3) * ERAS[u.era].laneSpeed;
  }

  rangeOf(u: Unit, w: WeaponDef): number {
    const m = this.factions[u.owner].mods;
    return w.range * mul(m.range + (this.umod(u).range ?? 0), 0.3);
  }

  maxRangeOf(u: Unit): number {
    let r = 0;
    for (const w of UNITS[u.type].weapons) r = Math.max(r, this.rangeOf(u, w));
    return r;
  }

  rofOf(u: Unit): number {
    let r = mul(this.factions[u.owner].mods.rof, 0.3);
    if (this.hasBuff(u, 'overdrive')) r *= 1.7;
    return r;
  }

  dmgMulOf(u: Unit, type: DmgType): number {
    const f = this.factions[u.owner];
    const m = f.mods;
    let bonus = m.dmg + m.dmgT[type] + (this.umod(u).dmg ?? 0);
    if (this.hasBuff(u, 'rally')) bonus += 0.25;
    const ps = m.flags.phaseStrike ?? 0;
    if (ps > 0 && this.time - u.arrivedAt < 12) bonus += ps;
    const hm = m.flags.hivemind ?? 0;
    if (hm > 0 && u.node >= 0) {
      let allies = 0;
      for (const o of this.buckets[u.node]) if (o.owner === u.owner && o !== u && UNITS[o.type].role !== 'fighter') allies++;
      bonus += Math.min(0.4, allies * hm);
    }
    let k = mul(bonus, 0.1) * this.levelMul(u) * ERAS[u.era].power;
    if (this.hasBuff(u, 'feeble')) k *= 0.25;
    return k;
  }

  unitPower(u: Unit): number {
    const def = UNITS[u.type];
    const frac = (u.hp + u.sh) / Math.max(1, u.maxHp + u.maxSh);
    const m = this.factions[u.owner].mods;
    return def.power * (0.35 + 0.65 * frac) * (1 + (m.dmg + m.hull) * 0.5) * this.levelMul(u) * ERAS[u.era].power;
  }

  /** Combat power of a faction's units at a node. */
  powerAt(nodeId: number, fid: number): number {
    let p = 0;
    for (const u of this.buckets[nodeId]) if (u.owner === fid) p += this.unitPower(u);
    return p;
  }

  hostilePowerAt(nodeId: number, fid: number): number {
    let p = 0;
    for (const u of this.buckets[nodeId]) if (this.hostile(u.owner, fid)) p += this.unitPower(u);
    const n = this.nodes[nodeId];
    if (n.owner >= 0 && this.hostile(n.owner, fid)) {
      const gun = this.worldGun(n);
      if (gun) p += gun.dmg / 6;
    }
    return p;
  }

  /**
   * AI houses do not bombard a rival's worlds before their own first attack, so they never start a war by
   * accident, unless that rival attacked them first. This is AI behaviour only: players can strike any time.
   */
  holdsFire(attacker: number, worldOwner: number): boolean {
    const a = this.factions[attacker];
    if (!a || !a.ai || worldOwner < 0 || this.factions[worldOwner].kind !== 'empire') return false;
    if (a.ai.grudge === worldOwner) return false;
    return this.time < a.ai.firstAttackAt;
  }

  hasHostiles(nodeId: number, fid: number): boolean {
    for (const u of this.buckets[nodeId]) if (this.hostile(u.owner, fid) && UNITS[u.type].role !== 'fighter') return true;
    return false;
  }

  score(f: Faction): number {
    let fleet = 0;
    for (const u of this.unitList) if (!u.dead && u.owner === f.id) fleet += UNITS[u.type].power;
    return this.worldsOf(f.id).length * 10 + fleet + f.boons * 6 + f.relics.length * 15;
  }

  // =====================================================================
  // Modifiers
  // =====================================================================

  recomputeMods(f: Faction) {
    f.mods = this.computeMods(f);
    for (const u of this.unitList) if (u.owner === f.id && !u.dead) this.refreshUnitStats(u);
    for (const n of this.nodes) if (n.owner === f.id) this.refreshWorld(n);
    recomputeHangar(this, f);
  }

  /** The modifiers a house has, plus any `extraCards` (for previews). Changes nothing. */
  computeMods(f: Faction, extraCards: string[] = []): Mods {
    const m: Mods = baseMods();
    for (const s of this.modSources(f, extraCards)) s.apply(m);
    return m;
  }

  /** Where a house's modifiers come from: house, omens, Hall of Heirs or difficulty, Boons, relics. */
  modSources(f: Faction, extraCards: string[] = []): { label: string; apply: (m: Mods) => void }[] {
    const out: { label: string; apply: (m: Mods) => void }[] = [];
    if (f.kind === 'empire') {
      const heir = HEIR_BY_ID[f.heir];
      if (heir) out.push({ label: heir.name, apply: heir.mods });
      for (const t of this.traits) {
        const tr = TRAIT_BY_ID[t];
        if (tr?.mods) out.push({ label: `Omen: ${tr.name}`, apply: tr.mods });
      }
      if (f.id === this.playerId && !this.config.autoplay) {
        const perks = this.config.perks ?? {};
        out.push({
          label: 'Hall of Heirs',
          apply: (m) => {
            m.hearthHp += 0.25 * (perks.bastion ?? 0);
            m.luck += perks.luck ?? 0;
          },
        });
      } else if (this.config.difficulty >= 3) {
        out.push({ label: 'Difficulty', apply: (m) => (m.hull += 0.1) });
      }
    } else if (f.kind === 'pirate' || f.kind === 'crisis') {
      const d = this.config.difficulty - 1;
      out.push({
        label: 'Difficulty',
        apply: (m) => {
          m.hull += d * 0.12;
          m.dmg += d * 0.1;
        },
      });
    }
    for (const id of [...f.cards, ...extraCards]) {
      const c = CARD_BY_ID[id];
      if (c?.mods) out.push({ label: c.name, apply: c.mods });
    }
    for (const id of f.relics) {
      const r = RELIC_BY_ID[id];
      if (r) out.push({ label: r.name, apply: r.mods });
    }
    return out;
  }

  // =====================================================================
  // Entities
  // =====================================================================

  spawnUnit(
    type: UnitType,
    owner: number,
    nodeId: number,
    opts: { x?: number; y?: number; hpFrac?: number; parent?: number; temp?: number } = {},
  ): Unit {
    const def = UNITS[type];
    const n = this.nodes[nodeId];
    let { x, y } = opts;
    if (x === undefined || y === undefined) {
      const a = this.rng.float(0, TAU);
      const r = n.r + 70 + this.rng.float(0, 150);
      x = n.x + Math.cos(a) * r;
      y = n.y + Math.sin(a) * r;
    }
    const f = this.factions[owner];
    const ang = this.rng.float(0, TAU);
    const u: Unit = {
      id: this.nextId++, type, owner, x, y, px: x, py: y, vx: 0, vy: 0, a: ang, pa: ang,
      hp: 1, maxHp: 1, sh: 0, maxSh: 0, node: nodeId, lane: null, path: [], charge: -1, dest: -1,
      ax: x, ay: y, order: 'idle', orderTarget: -1, target: 0, retarget: 0,
      wcd: def.weapons.map((w) => this.rng.float(0, w.cooldown)), lastHit: 999, lastHitBy: -1,
      xp: 0, level: 1, abil: [], pendingAbil: [], buffs: [], parent: opts.parent ?? 0,
      fighters: (def.fighters ?? 0) + (def.fighters ? f.mods.fighters : 0), launched: 0, fighterTimer: 0,
      kindle: 0, ox: NaN, oy: NaN, dead: false, born: this.time, stun: 0, snare: 0, wellTime: 0, arrivedAt: -99,
      temp: opts.temp ?? 0, era: f.era,
    };
    if (type === 'ark') {
      u.level = f.arkLevel;
      u.xp = f.arkXp;
      const heir = HEIR_BY_ID[f.heir];
      const abil = f.arkAbil.length ? f.arkAbil : [heir?.signature ?? 'barrage'];
      u.abil = abil.map((id) => ({ id, cd: 4 }));
      f.ark = u.id;
      this.oweAbilities(u);
    } else if (type === 'dreadnought') {
      const pool = LEARNABLE_ABILITIES.filter((a) => a.id !== HEIR_BY_ID[f.heir]?.signature);
      u.abil = [{ id: this.rng.pick(pool).id, cd: 4 }];
    } else if (type === 'leviathan') {
      u.abil = [{ id: 'barrage', cd: 8 }];
    }
    this.refreshUnitStats(u, true, opts.hpFrac ?? 1);
    this.unitList.push(u);
    this.units.set(u.id, u);
    if (u.node >= 0) this.buckets[u.node].push(u);
    return u;
  }

  damageUnitRaw(u: Unit, amount: number, byFaction: number) {
    if (u.dead) return;
    const absorbed = Math.min(u.sh, amount);
    u.sh -= absorbed;
    u.hp -= amount - absorbed;
    u.lastHit = 0;
    if (byFaction >= 0) u.lastHitBy = byFaction;
    if (u.hp <= 0) this.killUnit(u, byFaction);
  }

  /** Apply weapon damage to a unit, with type multipliers, shields, armor and on-hit effects. */
  damageUnit(t: Unit, amount: number, type: DmgType, byFaction: number, src: Unit | null) {
    if (t.dead || this.asleep(t.owner)) return;
    const def = UNITS[t.type];
    let dmg = amount * DMG_TABLE[type][def.armorClass];
    if (this.hasBuff(t, 'aegis')) dmg *= 0.7;
    if (this.hasBuff(t, 'barrier')) dmg *= 0.1;
    if (dmg <= 0) return;
    let absorbed = 0;
    if (t.sh > 0) {
      absorbed = Math.min(t.sh, dmg);
      t.sh -= absorbed;
      dmg -= absorbed;
      const refl = this.factions[t.owner].mods.flags.reflect ?? 0;
      if (refl > 0 && src && !src.dead && absorbed > 0) {
        const s = src;
        const amt = absorbed * refl;
        this.deferred.push(() => this.damageUnitRaw(s, amt, t.owner));
      }
    }
    const hull = dmg * (1 - this.armorOf(t));
    t.hp -= hull;
    t.lastHit = 0;
    t.lastHitBy = byFaction;
    const dealt = absorbed + hull;
    if (byFaction >= 0) this.factions[byFaction].stats.damageDealt += dealt;
    if (src && !src.dead) {
      const sm = this.factions[src.owner].mods;
      const siphon = sm.flags.siphon ?? 0;
      if (siphon > 0) src.hp = Math.min(src.maxHp, src.hp + dealt * siphon);
      if (UNITS[src.type].role === 'capital' && src.owner !== this.crisisId) this.addXp(src, dealt * 0.02);
    }
    if (this.fxEnabled && (absorbed > 0 || hull > 0)) {
      const ang = src ? Math.atan2(src.y - t.y, src.x - t.x) : 0;
      this.fx.push({ k: 'hit', x: t.x, y: t.y, shield: absorbed > 0 && t.sh > 0, r: def.radius, ang, node: t.node, color: this.factions[t.owner].color });
    }
    if (t.hp <= 0) this.killUnit(t, byFaction, src);
  }

  damagePlanet(n: GNode, amount: number, type: DmgType, byFaction: number) {
    if (n.owner < 0 || n.kind !== 'planet' || this.asleep(n.owner)) return;
    let dmg = amount * DMG_TABLE[type].planet;
    if (dmg <= 0) return;
    const owner = this.factions[n.owner];
    if (n.lastHit > 25 && byFaction >= 0) {
      const who = this.factions[byFaction];
      const hearth = n.capitalOf >= 0;
      this.notify(n.owner, `${hearth ? 'Your Hearth, ' : ''}${n.name} is under attack${who ? ' by ' + who.name : ''}!`, 'alert', n.id, hearth);
    }
    const absorbed = Math.min(n.sh, dmg);
    // The moment a world's shields give way is shown on the map: from here on its hull takes the hits.
    // (Shields that are being shot at never recharge far, so this is said once a siege, not once a hit.)
    if (this.fxEnabled && n.maxSh > 0 && n.sh >= n.maxSh * 0.1 && n.sh - absorbed <= 0) this.fx.push({ k: 'text', x: n.x, y: n.y - n.r - 26, text: 'SHIELDS DOWN', color: '#3fa7ff', node: n.id });
    n.sh -= absorbed;
    dmg -= absorbed;
    n.hp -= dmg;
    n.lastHit = 0;
    n.lastHitBy = byFaction;
    if (byFaction >= 0) this.factions[byFaction].stats.damageDealt += absorbed + dmg;
    // Militia Reserve
    if ((owner.mods.flags.militia ?? 0) > 0 && n.militiaCd <= 0) {
      n.militiaCd = 90;
      for (let i = 0; i < 2; i++) this.spawnUnit('striker', owner.id, n.id);
      this.notify(owner.id, `Militia muster to defend ${n.name}.`, 'good', n.id);
    }
    // Last stand at the Hearth
    if (n.capitalOf >= 0 && !n.lastStand && n.hp < n.maxHp * 0.3) {
      n.lastStand = true;
      const k = owner.id === this.playerId && !this.config.autoplay ? 1 + (this.config.perks?.secondBreath ?? 0) : 1;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < 3; i++) this.spawnUnit('striker', owner.id, n.id);
        for (let i = 0; i < 2; i++) this.spawnUnit('guardian', owner.id, n.id);
      }
      this.notify(owner.id, `LAST STAND! The defenders of ${n.name} rise to arms.`, 'alert', n.id);
    }
    if (n.hp <= 0) {
      n.hp = 0;
      this.planetDefeated(n, byFaction);
    }
  }

  /**
   * The log's line for ships the player has lost at one place: "Lost at Kessel to Ancient Sentinels:
   * 2 Strikers, 1 Scout." Ships lost there within the next 20 seconds are added to the same line, so a
   * battle is one line that counts, not one line a ship.
   */
  private noteLoss(u: Unit, byFaction: number) {
    if (this.config.autoplay) return;
    const node = u.node >= 0 ? u.node : u.lane ? u.lane.to : -1;
    let note = this.notes.find((n) => n.loss && n.loss.node === node && this.time - n.loss.at < 20);
    if (!note) {
      note = { id: this.noteId++, t: this.time, text: '', kind: 'bad', node: node >= 0 ? node : undefined, loss: { node, counts: {}, by: -1, at: this.time } };
      this.notes.push(note);
      if (this.notes.length > 60) this.notes.splice(0, this.notes.length - 60);
    }
    const L = note.loss!;
    L.counts[u.type] = (L.counts[u.type] ?? 0) + 1;
    L.at = this.time;
    if (byFaction >= 0 && byFaction !== u.owner) L.by = byFaction;
    const list = Object.entries(L.counts)
      .map(([t, c]) => `${c} ${UNITS[t as UnitType].name}${c > 1 ? 's' : ''}`)
      .join(', ');
    const where = node < 0 ? 'in flight' : u.node >= 0 ? `at ${this.nodes[node].name}` : `on the way to ${this.nodes[node].name}`;
    note.text = `Lost ${where}${L.by >= 0 ? ` to ${this.factions[L.by].name}` : ''}: ${list}.`;
  }

  killUnit(u: Unit, byFaction: number, src: Unit | null = null) {
    if (u.dead) return;
    u.dead = true;
    u.hp = 0;
    const def = UNITS[u.type];
    const owner = this.factions[u.owner];
    if (this.fxEnabled) this.fx.push({ k: 'boom', x: u.x, y: u.y, size: def.radius, color: owner.color, node: u.node });
    const isShip = def.role !== 'fighter' && !u.temp;
    if (isShip) owner.stats.shipsLost++;
    if (u.type === 'seed' && owner.isPlayer) {
      // Never let a kindling fail silently.
      const t = u.order === 'kindle' ? this.nodeAt(u.orderTarget) : null;
      this.notify(owner.id, `Your seed ship was destroyed${t ? ` on its way to ${t.name}` : ''}. Clear the way, then kindle again.`, 'bad', u.node >= 0 ? u.node : undefined);
    }
    // No ship of the player's is ever lost silently. (The seed ship, the Ark and the Gate have words of their own.)
    if (owner.isPlayer && isShip && u.type !== 'seed' && u.type !== 'ark' && u.type !== 'gate') this.noteLoss(u, byFaction);
    if (byFaction >= 0 && byFaction !== u.owner && isShip) {
      const killer = this.factions[byFaction];
      killer.stats.kills++;
      const km = killer.mods;
      const value = def.cost || 40;
      if ((km.flags.salvage ?? 0) > 0) this.addEmbers(killer, value * km.flags.salvage);
      if ((km.flags.bounty ?? 0) > 0) this.addEmbers(killer, value * km.flags.bounty);
      if ((km.flags.reverse ?? 0) > 0) this.addLore(killer, km.flags.reverse);
      if (u.node >= 0) {
        for (const o of this.buckets[u.node]) {
          if (o.owner === byFaction && !o.dead && UNITS[o.type].role === 'capital') this.addXp(o, def.xpValue);
        }
      }
    }
    void src;
    // Martyr Cores
    const martyr = owner.mods.flags.martyr ?? 0;
    if (martyr > 0 && u.node >= 0 && isShip) {
      const nodeId = u.node;
      const x = u.x;
      const y = u.y;
      const amt = u.maxHp * martyr;
      const rad = def.radius + 160;
      const oid = u.owner;
      this.deferred.push(() => {
        if (this.fxEnabled) this.fx.push({ k: 'ring', x, y, r: rad, color: owner.color, node: nodeId });
        for (const o of [...this.buckets[nodeId]]) {
          if (!o.dead && this.hostile(o.owner, oid) && dist(o.x, o.y, x, y) < rad) this.damageUnit(o, amt, 'energy', oid, null);
        }
      });
    }
    // Eternal Fleet
    const eternal = owner.mods.flags.eternal ?? 0;
    if (eternal > 0 && isShip && ['combat', 'siege', 'carrier'].includes(def.role) && owner.alive && owner.capital >= 0 && this.rng.chance(eternal)) {
      const t = u.type;
      const oid = u.owner;
      this.deferred.push(() => {
        if (this.factions[oid].alive && this.factions[oid].capital >= 0) this.spawnUnit(t, oid, this.factions[oid].capital);
      });
    }
    if (def.fighters) {
      for (const o of this.unitList) if (o.parent === u.id && !o.dead) this.killUnit(o, -1);
    }
    if (u.type === 'fighter' && u.parent > 0) {
      const p = this.units.get(u.parent);
      if (p) p.launched = Math.max(0, p.launched - 1);
    }
    if (u.type === 'ark' && owner.ark === u.id) {
      owner.ark = -1;
      owner.arkLevel = u.level;
      owner.arkXp = u.xp;
      owner.arkAbil = u.abil.map((a) => a.id);
      owner.stats.arkLost = true;
      this.notify(owner.id, `Your Ark, the ${HEIR_BY_ID[owner.heir]?.arkName ?? ''}, has been destroyed! Rebuild it at your Hearth.`, 'bad', u.node >= 0 ? u.node : undefined);
    }
    if (u.type === 'gate' && owner.gate && owner.gate.unit === u.id) {
      owner.gate = null;
      this.notify(-1, `${owner.name}'s Starfire Gate has been destroyed!`, owner.isPlayer ? 'bad' : 'good', u.node);
    }
    if (u.type === 'stronghold' && this.pirates.alive && u.id === this.pirates.stronghold) {
      this.pirates.alive = false;
      if (byFaction >= 0 && this.factions[byFaction].kind === 'empire') {
        const k = this.factions[byFaction];
        k.stats.strongholdDestroyed = true;
        this.addEmbers(k, 600);
        this.grantDraft(k, 1);
        this.notify(-1, `${k.name} destroyed the Corsair Stronghold! The raids are over.`, k.isPlayer ? 'good' : 'info', u.node);
        if (k.isPlayer) this.notify(k.id, 'Plunder recovered: +600 Embers and a free Boon.', 'good');
      }
      for (const o of this.unitList) if (o.owner === this.pirateId && !o.dead && o !== u) this.deferred.push(() => this.killUnit(o, -1));
    }
    if (u.type === 'heart' && this.crisis && u.id === this.crisis.heart) {
      this.crisis.dead = true;
      const k = byFaction >= 0 ? this.factions[byFaction] : null;
      this.notify(-1, `The Rift Heart has been destroyed${k ? ` by ${k.name}` : ''}! The Hollow wither away.`, 'event', u.node);
      for (const o of this.unitList) if (o.owner === this.crisisId && !o.dead && o !== u) this.deferred.push(() => this.killUnit(o, -1));
      this.factions[this.crisisId].alive = false;
      if (k && k.kind === 'empire' && this.victories.includes('crisis')) this.declareWinner(k.id, 'crisis', `${k.name} purged the Hollow from the sector.`);
    }
  }

  addXp(u: Unit, amount: number) {
    const m = this.factions[u.owner].mods;
    u.xp += amount * mul(m.xp);
    this.applyLevelFromXp(u);
  }

  applyLevelFromXp(u: Unit) {
    if (UNITS[u.type].role !== 'capital') return;
    while (u.level < MAX_LEVEL && u.xp >= LEVEL_XP[u.level]) {
      u.level++;
      this.onLevelUp(u);
    }
  }

  grantLevels(u: Unit, n: number) {
    for (let i = 0; i < n && u.level < MAX_LEVEL; i++) {
      u.xp = Math.max(u.xp, LEVEL_XP[u.level]);
      u.level++;
      this.onLevelUp(u);
    }
  }

  private onLevelUp(u: Unit) {
    this.refreshUnitStats(u);
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15);
    const f = this.factions[u.owner];
    if (u.type === 'ark') f.arkLevel = u.level;
    if (this.fxEnabled && u.node >= 0) this.fx.push({ k: 'text', x: u.x, y: u.y - 40, text: `LEVEL ${u.level}`, color: '#ffd23f', node: u.node });
    if (ABILITY_LEVELS.includes(u.level)) this.offerAbility(u);
  }

  /**
   * A capital ship may learn an ability: the player is given a choice of three (it waits in
   * `pendingAbil` until it is made), a rival house takes one at once. False if there is none left to learn.
   */
  private offerAbility(u: Unit): boolean {
    const f = this.factions[u.owner];
    const owned = new Set(u.abil.map((a) => a.id));
    const pool = this.rng.shuffle(LEARNABLE_ABILITIES.filter((a) => !owned.has(a.id)).map((a) => a.id));
    const choices = pool.slice(0, 3);
    if (choices.length === 0) return false;
    if (f.isPlayer) {
      u.pendingAbil.push(choices);
      this.notify(f.id, `Your ${UNITS[u.type].name} reached level ${u.level}. Choose a new ability!`, 'good', u.node >= 0 ? u.node : undefined);
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
  private oweAbilities(u: Unit) {
    const due = 1 + ABILITY_LEVELS.filter((l) => l <= u.level).length;
    for (let i = 0; i < 4 && u.abil.length + u.pendingAbil.length < due; i++) if (!this.offerAbility(u)) break;
  }

  /** A seed ship finished its work: the world joins the house. */
  kindleWorld(n: GNode, fid: number) {
    const f = this.factions[fid];
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
    this.refreshWorld(n);
    n.hp = n.maxHp * 0.6;
    n.sh = n.maxSh * 0.5;
    f.stats.worldsKindled++;
    f.explored[n.id] = 1;
    recomputeHangar(this, f);
    if (this.fxEnabled) this.fx.push({ k: 'capture', node: n.id, color: f.color });
    this.notify(fid, `${n.name} is kindled! It will glow brighter over the next minute and a half.`, 'good', n.id);
  }

  planetDefeated(n: GNode, byFaction: number) {
    const prev = n.owner;
    const prevF = this.factions[prev];
    const att = byFaction >= 0 ? this.factions[byFaction] : null;
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
      this.notify(prev, `Corsairs plundered ${n.name}, stealing ${stolen} Embers!`, 'bad', n.id);
      for (const r of this.pirates.raids) if (r.target === n.id) r.phase = 'return';
      return;
    }
    if (att.kind === 'crisis') {
      if (n.capitalOf >= 0) this.eliminate(n.capitalOf, byFaction);
      this.darken(n);
      n.hp = n.maxHp * 0.3;
      this.destroyDefenses(n, prev);
      prevF.stats.worldsLost++;
      this.notify(prev, `${n.name} has been devoured by the Hollow!`, 'bad', n.id);
      if (this.fxEnabled) this.fx.push({ k: 'capture', node: n.id, color: att.color });
      return;
    }
    // A rival house takes the world.
    const wasHearth = n.capitalOf >= 0;
    const scorched = prevF.mods.flags.scorched ?? 0;
    if (scorched > 0) {
      for (const u of [...this.buckets[n.id]]) if (!u.dead && this.hostile(u.owner, prev)) this.damageUnitRaw(u, scorched, prev);
    }
    this.destroyDefenses(n, prev);
    this.refundQueues(n);
    n.owner = byFaction;
    n.capitalOf = -1;
    n.level = Math.max(1, n.level - 1);
    if (!n.role) n.role = 'forge';
    n.retool = 0;
    n.glow = ECON.glowStart;
    n.lastStand = true;
    this.refreshWorld(n);
    n.hp = n.maxHp * 0.3;
    n.sh = 0;
    att.stats.worldsCaptured++;
    prevF.stats.worldsLost++;
    // War spoils: a share of the loser's hoard (half of it when their Hearth falls).
    const spoils = Math.floor(wasHearth ? Math.min(6000, prevF.embers * 0.5) : Math.min(2000, prevF.embers * 0.15));
    if (spoils > 0) {
      prevF.embers -= spoils;
      att.embers += spoils;
      this.notify(byFaction, `War spoils: ${spoils} Embers seized from ${prevF.name}.`, 'good', n.id);
    }
    if (this.fxEnabled) this.fx.push({ k: 'capture', node: n.id, color: att.color });
    this.notify(byFaction, `${n.name} captured!`, 'good', n.id);
    this.notify(prev, `${n.name} has fallen to ${att.name}!`, 'bad', n.id);
    recomputeHangar(this, att);
    recomputeHangar(this, prevF);
    if (wasHearth) this.eliminate(prev, byFaction);
  }

  /** Return a world to the dark. */
  private darken(n: GNode) {
    n.owner = -1;
    n.capitalOf = -1;
    n.level = 1;
    n.role = null;
    n.retool = 0;
    n.glow = 1;
    n.shipQ = [];
    n.buildQ = [];
    n.rally = -1;
    this.refreshWorld(n);
  }

  private destroyDefenses(n: GNode, owner: number) {
    for (const u of [...this.buckets[n.id]]) {
      if (u.owner === owner && UNITS[u.type].isStatic && !u.dead) this.killUnit(u, -1);
    }
  }

  /** Clear a world's queues, paying back their cost to the owner (if it still stands). */
  private refundQueues(n: GNode) {
    const f = n.owner >= 0 ? this.factions[n.owner] : null;
    if (f && f.alive) for (const q of [...n.shipQ, ...n.buildQ]) f.embers += q.cost;
    n.shipQ = [];
    n.buildQ = [];
  }

  eliminate(fid: number, byFaction: number) {
    const f = this.factions[fid];
    if (!f.alive) return;
    f.alive = false;
    f.eliminatedAt = this.time;
    const by = byFaction >= 0 ? this.factions[byFaction] : null;
    // A house that takes a Hearth inherits the fallen house's worlds; otherwise they go dark.
    const heir = by && by.kind === 'empire' && by.alive ? by : null;
    let sworn = 0;
    for (const n of this.nodes) {
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
        this.refreshWorld(n);
        n.hp = Math.max(n.hp, n.maxHp * 0.3);
        if (this.fxEnabled) this.fx.push({ k: 'capture', node: n.id, color: heir.color });
        sworn++;
      } else this.darken(n);
    }
    if (heir) {
      recomputeHangar(this, heir);
      if (sworn) this.notify(-1, heir.isPlayer ? `The worlds of ${f.name} swear fealty to you: +${sworn} worlds.` : `The worlds of ${f.name} now answer to ${heir.name}.`, heir.isPlayer ? 'good' : 'alert');
    }
    for (const u of this.unitList) if (u.owner === fid && !u.dead) this.deferred.push(() => this.killUnit(u, -1));
    if (by && by.kind === 'empire' && f.relics.length) {
      by.relics.push(...f.relics);
      this.notify(by.id, `Seized ${f.relics.length} relic(s) from the fallen ${f.name}.`, 'good');
      this.recomputeMods(by);
    }
    f.relics = [];
    if (by && by.kind === 'empire') {
      by.stats.rivalsEliminated++;
      // Spoils of a fallen Hearth: a free Boon.
      by.pendingDrafts++;
      if (by.isPlayer) this.notify(by.id, `Spoils of ${f.name}'s Hearth: a free Boon! (B)`, 'good');
    }
    f.capital = -1;
    if (f.isPlayer) {
      this.declareWinner(-1, 'defeat', by ? `Your Hearth went dark, taken by ${by.name}.` : 'Your Hearth went dark.');
    } else {
      this.notify(-1, `The Hearth of ${f.name} has gone dark${by ? `, taken by ${by.name}` : ''}!`, by?.isPlayer ? 'good' : 'event');
    }
  }

  declareWinner(fid: number, victory: VictoryId | 'defeat', reason: string) {
    if (this.outcome) return;
    const playerWon = fid === this.playerId && !this.config.autoplay;
    this.outcome = { winner: fid, victory, time: this.time, playerWon, reason };
  }

  // =====================================================================
  // Helpers used by boons and events
  // =====================================================================

  addEmbers(f: Faction, n: number) {
    f.embers = Math.max(0, f.embers + n);
  }

  addLore(f: Faction, v: number) {
    f.lore += v;
  }

  grantDraft(f: Faction, n: number) {
    f.pendingDrafts += n;
    if (f.isPlayer) this.notify(f.id, 'A Boon awaits your choice! (B)', 'good');
  }

  exploreAll(f: Faction) {
    for (let i = 0; i < this.nodes.length; i++) f.explored[i] = 1;
  }

  markForRaid(f: Faction) {
    this.pirates.marked = f.id;
  }

  cardCount(f: Faction, id: string): number {
    let c = 0;
    for (const x of f.cards) if (x === id) c++;
    return c;
  }

  addCard(f: Faction, id: string) {
    const def = CARD_BY_ID[id];
    if (!def) return;
    f.cards.push(id);
    def.onPick?.(this, f);
    this.recomputeMods(f);
    if (def.cat === 'blueprint' && f.isPlayer) {
      const what = id === 'bpStarbase' ? 'Any of your worlds can now build a Starbase.' : 'Your Forges can now build it.';
      this.notify(f.id, `${def.name} learned. ${what}`, 'good');
    }
  }

  cardPool(f: Faction, rarities?: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef[] {
    const isHumanPlayer = f.id === this.playerId && !this.config.autoplay;
    const legendaryOk = isHumanPlayer ? this.config.unlockLegendary : this.config.difficulty >= 2;
    const pactsOk = isHumanPlayer ? this.config.unlockPacts : true;
    return CARDS.filter(
      (c) =>
        !c.hidden &&
        (!c.when || c.when(this, f)) &&
        // (On the cradle a house is offered the Boons of its own age, and no others.)
        !!c.cradle === this.cradle &&
        (!this.cradle || c.age === f.era) &&
        this.cardCount(f, c.id) < c.max &&
        (!c.requires || f.cards.includes(c.requires)) &&
        // An extra choice is worthless once the draft is already as big as it gets.
        (c.id !== 'quantum' || 3 + f.mods.draft < MAX_DRAFT) &&
        (c.rarity !== 'legendary' || legendaryOk || (rarities && rarities.includes('legendary'))) &&
        (!c.pact || allowPacts || c.basePact || pactsOk) &&
        (!rarities || rarities.includes(c.rarity)) &&
        (!filter || filter(c)),
    );
  }

  grantRandomCard(f: Faction, rarities: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef | null {
    const pool = this.cardPool(f, rarities, filter, allowPacts);
    if (pool.length === 0) return null;
    const c = this.rng.pick(pool);
    this.addCard(f, c.id);
    if (f.isPlayer) this.notify(f.id, `Gained a Boon: ${c.name}.`, 'good');
    return c;
  }

  /** Choices per Boon draft: 3, plus bonuses, at most 5 (all must fit on the smallest screen). */
  draftSize(f: Faction): number {
    return clamp(3 + f.mods.draft, 2, MAX_DRAFT);
  }

  generateOffer(f: Faction): string[] {
    const pool = this.cardPool(f);
    const n = this.draftSize(f);
    // The First Night deals its first Boons by hand: plain ones, about things the player has just done
    // (earned Embers, built a Striker, kindled a world). Dealt at random, a first offer could be three
    // Boons about things a new player has not met yet. A reroll, and every later offer, is random.
    if (this.config.tutorial && f.isPlayer && !this.ui.tutBoon && f.cards.length === 0) {
      this.ui.tutBoon = 1;
      const first = FIRST_OFFER.filter((id) => pool.some((c) => c.id === id)).slice(0, n);
      if (first.length >= Math.min(3, n)) return first;
    }
    const luck = f.mods.luck;
    const out: string[] = [];
    let pactTaken = false;
    const avail = [...pool];
    while (out.length < n && avail.length) {
      const c = this.rng.weighted(avail, (cd) => {
        if (cd.pact && pactTaken) return 0;
        const w = RARITY_WEIGHT[cd.rarity] + RARITY_LUCK[cd.rarity] * luck;
        return Math.max(0.2, w) * (cd.pact ? 0.55 : 1) * (cd.cat === 'blueprint' ? 1.6 : 1);
      });
      if (!c) break;
      out.push(c.id);
      if (c.pact) pactTaken = true;
      avail.splice(avail.indexOf(c), 1);
    }
    // Blueprint pity: after four drafts without one, the next draft always shows a Blueprint.
    const hasBp = out.some((id) => CARD_BY_ID[id].cat === 'blueprint');
    if (!hasBp && f.bpPity >= 4) {
      const bps = BLUEPRINT_IDS.filter((id) => !f.cards.includes(id) && pool.some((c) => c.id === id));
      if (bps.length && out.length) {
        out[out.length - 1] = this.rng.pick(bps);
        f.bpPity = 0;
      }
    } else if (hasBp) f.bpPity = 0;
    else f.bpPity++;
    // Legendary Lineage: a run shows at least one Legendary (see `LEGENDARY_BY`). It takes the place of
    // a Common Boon if there is one, and never of a Blueprint.
    if (f.isPlayer && this.config.unlockLegendary && !this.cradle && out.length) {
      this.ui.offersDealt = (this.ui.offersDealt ?? 0) + 1;
      if (out.some((id) => CARD_BY_ID[id].rarity === 'legendary')) this.ui.legendarySeen = 1;
      else if (!this.ui.legendarySeen && this.ui.offersDealt >= LEGENDARY_BY) {
        const legends = pool.filter((c) => c.rarity === 'legendary');
        const spare = (id: string) => CARD_BY_ID[id].cat !== 'blueprint';
        let at = out.findIndex((id) => spare(id) && CARD_BY_ID[id].rarity === 'common');
        if (at < 0) at = out.findIndex(spare);
        if (legends.length && at >= 0) {
          out[at] = this.rng.pick(legends).id;
          this.ui.legendarySeen = 1;
        }
      }
    }
    return out;
  }

  /**
   * A first goal reached (data/goals.ts): its small reward is paid, once a run. Which goals a player
   * still has is the client's to know (they are reached once, ever); the game only checks that this
   * one is truly reached here.
   */
  cmdGoal(fid: number, id: string): boolean {
    const goal = GOAL_BY_ID[id];
    const f = this.factions[fid];
    if (!goal || !f || fid !== this.playerId || this.ui['goal:' + id] || !goal.done(this, f)) return false;
    this.ui['goal:' + id] = 1;
    this.addEmbers(f, GOAL_REWARD);
    this.notify(fid, `Goal reached: ${goal.label}. +${GOAL_REWARD} Embers.`, 'good');
    return true;
  }

  ensureOffer(f: Faction): string[] | null {
    if (f.pendingDrafts <= 0) return null;
    if (!f.draftOffer || f.draftOffer.length === 0) f.draftOffer = this.generateOffer(f);
    return f.draftOffer;
  }

  // =====================================================================
  // Commands (shared by the player's UI and the AI)
  // =====================================================================

  cmdChooseCard(fid: number, cardId: string): boolean {
    const f = this.factions[fid];
    const offer = this.ensureOffer(f);
    if (!offer || !offer.includes(cardId)) return false;
    f.pendingDrafts--;
    f.draftOffer = null;
    this.addCard(f, cardId);
    return true;
  }

  cmdReroll(fid: number): boolean {
    const f = this.factions[fid];
    if (f.pendingDrafts <= 0 || f.rerolls <= 0) return false;
    f.rerolls--;
    f.draftOffer = this.generateOffer(f);
    return true;
  }

  /** Embers paid for skipping a Boon. */
  skipValue(f: Faction): number {
    return 60 + 15 * f.boons;
  }

  cmdSkipDraft(fid: number): boolean {
    const f = this.factions[fid];
    if (f.pendingDrafts <= 0) return false;
    f.pendingDrafts--;
    f.draftOffer = null;
    this.addEmbers(f, this.skipValue(f));
    return true;
  }

  cmdChooseAbility(fid: number, unitId: number, abilityId: string): boolean {
    const u = this.units.get(unitId);
    if (!u || u.owner !== fid || !u.pendingAbil.length) return false;
    const choices = u.pendingAbil[0];
    if (!choices.includes(abilityId) || !ABILITY_BY_ID[abilityId]) return false;
    u.pendingAbil.shift();
    u.abil.push({ id: abilityId, cd: 2 });
    if (u.type === 'ark') this.factions[fid].arkAbil = u.abil.map((a) => a.id);
    return true;
  }

  cmdResolvePrompt(promptId: number, choice: number): string | null {
    const p = this.prompts.find((x) => x.id === promptId);
    if (!p || p.result !== undefined) return null;
    const ev = EVENT_BY_ID[p.event];
    const f = this.player;
    const c = ev?.choices[choice];
    if (!ev || !c) return null;
    const ctx = { node: p.node, unit: p.unit };
    if (c.cond && !c.cond(this, f, ctx)) return null;
    p.result = c.run(this, f, ctx);
    f.stats.eventsResolved++;
    return p.result;
  }

  dismissPrompt(promptId: number) {
    this.prompts = this.prompts.filter((p) => p.id !== promptId);
  }

  // ---- Movement orders ----

  private orderPath(u: Unit, dest: number, avoid?: (nodeId: number) => number) {
    const start = u.lane ? u.lane.to : u.node;
    if (start < 0) return;
    u.dest = dest;
    if (start === dest) {
      u.path = [];
      if (!u.lane) u.charge = -1;
    } else {
      const round = avoid ? this.pathAvoiding(start, dest, avoid) : [];
      u.path = round.length ? round : this.pathTo(start, dest);
      if (!u.lane) u.charge = -1;
    }
  }

  /** A world by id, or null when the id is not a world (commands never trust their input). */
  nodeAt(id: number): GNode | null {
    return Number.isInteger(id) && id >= 0 && id < this.nodes.length ? this.nodes[id] : null;
  }

  /** `avoid`: places the ships would rather not pass through, each counted as that much further (see `pathAvoiding`). */
  cmdMove(fid: number, ids: number[], dest: number, x?: number, y?: number, avoid?: (nodeId: number) => number) {
    const n = this.nodeAt(dest);
    if (!n) return;
    const units = ids.map((id) => this.units.get(id)).filter((u): u is Unit => !!u && !u.dead && u.owner === fid && !UNITS[u.type].isStatic);
    if (units.length === 0) return;
    const offs = formation(units.length, 34);
    // Bigger ships in the middle of the formation.
    units.sort((a, b) => UNITS[b.type].radius - UNITS[a.type].radius);
    units.forEach((u, i) => {
      if (u.type === 'fighter') return;
      u.order = 'move';
      u.orderTarget = -1;
      u.target = 0;
      u.kindle = 0;
      if (x !== undefined && y !== undefined) {
        let px = x + offs[i][0];
        let py = y + offs[i][1];
        const d = dist(px, py, n.x, n.y);
        const minR = n.r + 40;
        if (d < minR) {
          const a = Math.atan2(py - n.y, px - n.x);
          px = n.x + Math.cos(a) * minR;
          py = n.y + Math.sin(a) * minR;
        }
        u.ox = px;
        u.oy = py;
      } else {
        u.ox = NaN;
        u.oy = NaN;
      }
      this.orderPath(u, dest, avoid);
      if (u.node === dest && !u.lane) {
        u.order = 'idle';
        if (!isNaN(u.ox)) {
          u.ax = u.ox;
          u.ay = u.oy;
        }
      }
    });
  }

  cmdAttack(fid: number, ids: number[], targetId: number) {
    const t = this.units.get(targetId);
    if (!t || t.dead || !this.hostile(fid, t.owner)) return;
    const dest = t.node >= 0 ? t.node : t.lane ? t.lane.to : -1;
    if (dest < 0) return;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.dead || u.owner !== fid || UNITS[u.type].isStatic || u.type === 'fighter') continue;
      if (!UNITS[u.type].weapons.length && !UNITS[u.type].fighters) continue;
      u.order = 'attack';
      u.orderTarget = targetId;
      u.target = targetId;
      u.retarget = 3;
      u.ox = NaN;
      u.oy = NaN;
      this.orderPath(u, dest);
    }
  }

  /** Why the house cannot kindle this world right now (null = it can). */
  checkKindle(fid: number, nodeId: number): QueueCheck {
    const f = this.factions[fid];
    const n = this.nodes[nodeId];
    if (!n || n.kind !== 'planet') return 'Only worlds can be kindled';
    if (n.owner >= 0) return n.owner === fid ? 'Already yours' : 'Owned by another house';
    if (!f.explored[nodeId]) return 'Not yet charted';
    if (this.seedFor(fid, nodeId)) return 'A seed ship is on its way';
    if (this.kindleSource(fid, nodeId) < 0 && !this.idleSeed(fid)) return 'No world can reach it';
    if (!this.idleSeed(fid) && f.embers < this.kindleCost(f) - 1e-6) return 'Not enough Embers';
    return null;
  }

  /** The seed ship already heading for (or kindling) a world. */
  seedFor(fid: number, nodeId: number): Unit | null {
    for (const u of this.unitList) if (!u.dead && u.owner === fid && u.type === 'seed' && u.order === 'kindle' && u.orderTarget === nodeId) return u;
    return null;
  }

  /** A seed ship with no world to kindle (its mission was called off): the next KINDLE uses it, for free. */
  idleSeed(fid: number): Unit | null {
    for (const u of this.unitList) if (!u.dead && u.owner === fid && u.type === 'seed' && u.order !== 'kindle') return u;
    return null;
  }

  /** The owned world closest to a target, where a new seed ship would launch from. */
  kindleSource(fid: number, nodeId: number): number {
    let best = -1;
    let bd = Infinity;
    for (const p of this.nodes) {
      if (p.owner !== fid || p.kind !== 'planet') continue;
      const d = this.pathLen(p.id, nodeId);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return isFinite(bd) ? best : -1;
  }

  /** Kindle a dark world: an idle seed ship is sent, or a new one launches from the nearest world. */
  cmdKindle(fid: number, nodeId: number): boolean {
    if (this.checkKindle(fid, nodeId)) return false;
    const f = this.factions[fid];
    let seed = this.idleSeed(fid);
    if (!seed) {
      const src = this.kindleSource(fid, nodeId);
      if (src < 0) return false;
      const cost = this.kindleCost(f);
      f.embers -= cost;
      seed = this.spawnUnit('seed', fid, src);
      seed.temp = 0;
      if (this.fxEnabled) this.fx.push({ k: 'ring', x: seed.x, y: seed.y, r: 30, color: f.color, node: src });
    }
    return this.cmdSendSeed(fid, seed.id, nodeId);
  }

  /** Order a particular seed ship to kindle a world. */
  cmdSendSeed(fid: number, seedId: number, nodeId: number): boolean {
    const u = this.units.get(seedId);
    const n = this.nodeAt(nodeId);
    if (!u || u.dead || u.owner !== fid || u.type !== 'seed') return false;
    if (!n || n.kind !== 'planet' || n.owner >= 0) return false;
    u.order = 'kindle';
    u.orderTarget = nodeId;
    u.kindle = 0;
    u.ox = NaN;
    u.oy = NaN;
    this.orderPath(u, nodeId);
    return true;
  }

  cmdStop(fid: number, ids: number[]) {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.dead || u.owner !== fid) continue;
      if (u.lane) {
        u.path = [];
        u.dest = u.lane.to;
      } else {
        u.path = [];
        u.charge = -1;
        u.dest = u.node;
        u.ax = u.x;
        u.ay = u.y;
      }
      u.order = 'idle';
      u.orderTarget = -1;
      u.ox = NaN;
      u.oy = NaN;
    }
  }

  nearestOwnedWorld(fid: number, from: number): number {
    let best = -1;
    let bd = Infinity;
    for (const n of this.nodes) {
      if (n.kind !== 'planet' || n.owner !== fid) continue;
      const d = this.pathLen(from, n.id);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  cmdRetreat(fid: number, ids: number[]) {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.dead || u.owner !== fid || UNITS[u.type].isStatic) continue;
      const from = u.lane ? u.lane.to : u.node;
      const dest = this.nearestOwnedWorld(fid, from);
      if (dest < 0) continue;
      u.order = 'retreat';
      u.target = 0;
      u.ox = NaN;
      u.oy = NaN;
      this.orderPath(u, dest);
    }
  }

  /** Whether any world is still uncharted for this house (so EXPLORE has somewhere to go). */
  hasUncharted(f: Faction): boolean {
    return f.explored.some((e) => !e);
  }

  /** Scouts chart the dark by themselves, world after world (other ships ignore the order). */
  cmdExplore(fid: number, ids: number[]) {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.dead || u.owner !== fid || UNITS[u.type].role !== 'scout') continue;
      u.order = 'explore';
      u.dest = -1;
      u.path = [];
      u.ox = NaN;
      u.oy = NaN;
    }
  }

  // ---- Production ----

  shipCost(f: Faction, type: UnitType): number {
    const m = f.mods;
    const um = m.unit[type]?.cost ?? 0;
    const k = type === 'gate' || type === 'ark' ? mul(um, 0.2) : mul(m.shipCost + um, 0.2);
    return Math.round(UNITS[type].cost * k);
  }

  dreadnoughtCount(fid: number): number {
    let c = 0;
    for (const u of this.unitList) if (!u.dead && u.owner === fid && u.type === 'dreadnought') c++;
    for (const n of this.nodes) for (const q of n.shipQ) if (n.owner === fid && q.id === 'dreadnought') c++;
    return c;
  }

  /** Ships this house can build at a Forge right now (core ships plus drafted blueprints). */
  shipTypesFor(f: Faction): UnitType[] {
    if (this.cradle) return [...ERAS[f.era].roster];
    const out: UnitType[] = ['striker', 'guardian', 'breaker'];
    if (this.hasCard(f, 'bpLancer')) out.push('lancer');
    if (this.hasCard(f, 'bpCarrier')) out.push('carrier');
    if (this.hasCard(f, 'bpDread')) out.push('dreadnought');
    out.push('scout');
    return out;
  }

  checkShip(fid: number, nodeId: number, type: UnitType): QueueCheck {
    const f = this.factions[fid];
    const n = this.nodeAt(nodeId);
    const def = UNITS[type];
    if (!def || !def.buildable) return 'Cannot be built';
    if (!f || !n || n.owner !== fid) return 'Not your world';
    if (!this.isForge(n)) return this.cradle ? 'Only Forges build units' : 'Only Forges build ships';
    if (this.cradle && !ERAS[f.era].roster.includes(type)) return 'Not in this age';
    if (n.retool > 0) return 'Retooling';
    if (def.blueprint && !this.hasCard(f, def.blueprint)) return 'Needs its Blueprint Boon';
    if (type === 'dreadnought' && this.dreadnoughtCount(fid) >= DREADNOUGHT_CAP) return `Limit ${DREADNOUGHT_CAP} Dreadnoughts`;
    if (n.shipQ.length >= QUEUE_MAX) return 'Queue full';
    if (f.hangarUsed + def.hangar > f.hangarCap) return 'Hangar full';
    if (f.embers < this.shipCost(f, type) - 1e-6) return 'Not enough Embers';
    return null;
  }

  cmdQueueShip(fid: number, nodeId: number, type: UnitType): boolean {
    if (this.checkShip(fid, nodeId, type)) return false;
    const f = this.factions[fid];
    const cost = this.shipCost(f, type);
    f.embers -= cost;
    this.nodes[nodeId].shipQ.push({ kind: 'ship', id: type, t: 0, total: UNITS[type].buildTime, cost });
    f.hangarUsed += UNITS[type].hangar;
    return true;
  }

  checkUpgrade(fid: number, nodeId: number): QueueCheck {
    const f = this.factions[fid];
    const n = this.nodeAt(nodeId);
    if (!f || !n || n.owner !== fid) return 'Not your world';
    if (n.level >= 3) return 'Already level III';
    if (n.level >= ERAS[f.era].maxLevel) return 'Needs a later age';
    if (n.buildQ.some((q) => q.kind === 'upgrade')) return 'Already rising';
    if (n.buildQ.length >= QUEUE_MAX) return 'Queue full';
    if (f.embers < (this.upgradeCost(f, n) ?? Infinity) - 1e-6) return 'Not enough Embers';
    return null;
  }

  cmdUpgrade(fid: number, nodeId: number): boolean {
    if (this.checkUpgrade(fid, nodeId)) return false;
    const f = this.factions[fid];
    const n = this.nodes[nodeId];
    const cost = this.upgradeCost(f, n)!;
    f.embers -= cost;
    n.buildQ.push({ kind: 'upgrade', id: 'level', t: 0, total: ECON.upgradeTime[n.level + 1], cost });
    if (fid === this.playerId) this.ui.raised = 1;
    return true;
  }

  checkRole(fid: number, nodeId: number, role: WorldRole): QueueCheck {
    const n = this.nodeAt(nodeId);
    if (!n || n.owner !== fid) return 'Not your world';
    if (!ROLE_ORDER.includes(role)) return 'Not a role';
    if (n.capitalOf >= 0) return 'Your Hearth already does everything';
    if (!ERAS[this.factions[fid].era].roles.includes(role)) return 'Needs a later age';
    if (n.role === role) return 'Already its role';
    return null;
  }

  /** Give a world a new role. Switching takes a short retool during which the role does nothing. */
  cmdSetRole(fid: number, nodeId: number, role: WorldRole): boolean {
    if (this.checkRole(fid, nodeId, role)) return false;
    const n = this.nodes[nodeId];
    const f = this.factions[fid];
    if (n.role === 'forge' && n.shipQ.length) {
      for (const q of n.shipQ) {
        f.embers += q.cost;
        if (q.kind === 'ship') f.hangarUsed -= UNITS[q.id as UnitType].hangar;
      }
      n.shipQ = [];
    }
    // (A newly kindled world starts as a Mine. The first role its house gives it costs no time: putting a
    // world to the role it is good at should not be a twenty-second penalty.)
    n.retool = n.role && !n.fresh ? ECON.retoolTime : 0;
    n.fresh = undefined;
    n.role = role;
    this.refreshWorld(n);
    if (fid === this.playerId) this.ui.roleSet = 1;
    return true;
  }

  starbaseAt(n: GNode): number {
    let c = 0;
    for (const u of this.buckets[n.id]) if (u.type === 'starbase' && u.owner === n.owner && !u.dead) c++;
    for (const q of n.buildQ) if (q.kind === 'starbase') c++;
    return c;
  }

  checkStarbase(fid: number, nodeId: number): QueueCheck {
    const f = this.factions[fid];
    const n = this.nodeAt(nodeId);
    if (!f || !n || n.owner !== fid) return 'Not your world';
    if (!this.hasCard(f, 'bpStarbase')) return 'Needs its Blueprint Boon';
    if (this.starbaseAt(n) >= 1) return 'One Starbase per world';
    if (n.buildQ.length >= QUEUE_MAX) return 'Queue full';
    if (f.embers < this.shipCost(f, 'starbase') - 1e-6) return 'Not enough Embers';
    return null;
  }

  cmdQueueStarbase(fid: number, nodeId: number): boolean {
    if (this.checkStarbase(fid, nodeId)) return false;
    const f = this.factions[fid];
    const cost = this.shipCost(f, 'starbase');
    f.embers -= cost;
    this.nodes[nodeId].buildQ.push({ kind: 'starbase', id: 'starbase', t: 0, total: UNITS.starbase.buildTime, cost });
    return true;
  }

  checkGate(fid: number, nodeId: number): QueueCheck {
    const f = this.factions[fid];
    const n = this.nodeAt(nodeId);
    if (!this.victories.includes('ascension')) return 'Ascension is not a Destiny this run';
    if (!f || !n || n.owner !== fid || n.capitalOf !== fid) return 'Raise it at your Hearth';
    if (f.boons < ASCENSION_BOONS) return `Needs ${ASCENSION_BOONS} Boons from Lore`;
    if (f.gate) return 'Gate already raised';
    if (this.nodes.some((x) => x.owner === fid && x.buildQ.some((q) => q.kind === 'gate'))) return 'Gate already rising';
    if (f.embers < this.shipCost(f, 'gate') - 1e-6) return 'Not enough Embers';
    return null;
  }

  cmdQueueGate(fid: number, nodeId: number): boolean {
    if (this.checkGate(fid, nodeId)) return false;
    const f = this.factions[fid];
    const cost = this.shipCost(f, 'gate');
    f.embers -= cost;
    this.nodes[nodeId].buildQ.push({ kind: 'gate', id: 'gate', t: 0, total: UNITS.gate.buildTime, cost });
    this.notify(-1, `${f.name} has begun raising a Starfire Gate at ${this.nodes[nodeId].name}!`, f.isPlayer ? 'good' : 'alert', nodeId);
    return true;
  }

  bayCost(f: Faction): number {
    return ECON.bayCost + ECON.bayCostStep * (f.bays ?? 0);
  }

  checkBay(fid: number): QueueCheck {
    const f = this.factions[fid];
    if (f.capital < 0) return 'No Hearth';
    if ((f.bays ?? 0) >= ECON.bayMax) return 'No room for more bays';
    if (f.embers < this.bayCost(f) - 1e-6) return 'Not enough Embers';
    return null;
  }

  /** Build a Hangar Bay at the Hearth: more room for ships, at a rising price. */
  cmdBuyBay(fid: number): boolean {
    if (this.checkBay(fid)) return false;
    const f = this.factions[fid];
    f.embers -= this.bayCost(f);
    f.bays = (f.bays ?? 0) + 1;
    recomputeHangar(this, f);
    return true;
  }

  checkArk(fid: number): QueueCheck {
    const f = this.factions[fid];
    if (this.cradle) return 'The Ark belongs to the Space Age';
    if (f.ark >= 0 && this.units.has(f.ark)) return 'Your Ark still flies';
    if (f.capital < 0) return 'No Hearth';
    const n = this.nodes[f.capital];
    if (n.shipQ.some((q) => q.kind === 'ark')) return 'Already rebuilding';
    if (n.shipQ.length >= QUEUE_MAX) return 'Queue full';
    if (f.embers < this.shipCost(f, 'ark') - 1e-6) return 'Not enough Embers';
    return null;
  }

  cmdRebuildArk(fid: number): boolean {
    if (this.checkArk(fid)) return false;
    const f = this.factions[fid];
    const cost = this.shipCost(f, 'ark');
    f.embers -= cost;
    this.nodes[f.capital].shipQ.push({ kind: 'ark', id: 'ark', t: 0, total: UNITS.ark.buildTime, cost });
    return true;
  }

  // ---- Ages: the climb (cradle stage) ----

  /** Why this house cannot take the step to the next age (or, from the last one, build its Ark), or null if it can. */
  checkAdvance(fid: number): QueueCheck {
    const f = this.factions[fid];
    if (!this.cradle || !f || f.kind !== 'empire' || !f.alive) return 'Only on the cradle';
    if (f.capital < 0) return 'No Hearth';
    if (f.advance) return f.era === LAST_CRADLE_ERA ? 'The Ark is rising' : 'Already under way';
    const era = ERAS[f.era];
    if (f.lore < era.lore - 1e-6) return 'Not enough Lore';
    if (f.embers < era.cost - 1e-6) return 'Not enough Embers';
    return null;
  }

  /**
   * Take the step to the next age: it spends the Lore gathered in this one and Embers, and takes time at the
   * Hearth (which stands still while the Hearth is under attack). From the last age of the cradle the step is the Ark.
   */
  cmdAdvance(fid: number): boolean {
    if (this.checkAdvance(fid)) return false;
    const f = this.factions[fid];
    const era = ERAS[f.era];
    f.lore -= era.lore;
    f.embers -= era.cost;
    f.advance = { t: 0, total: era.time, lore: era.lore, cost: era.cost };
    if (f.era === LAST_CRADLE_ERA) {
      this.notify(-1, f.isPlayer ? 'Your Ark is rising at your Hearth. Guard it: the work stops while the Hearth is under attack.' : `${f.name} has begun building its Ark!`, f.isPlayer ? 'good' : 'alert', f.capital);
    }
    return true;
  }

  /** Call the step off: the Lore and the Embers come back. */
  cmdCancelAdvance(fid: number): boolean {
    const f = this.factions[fid];
    if (!f?.advance) return false;
    f.lore += f.advance.lore;
    f.embers += f.advance.cost;
    f.advance = null;
    return true;
  }

  /** The step is done: a new age begins, or (from the last age of the cradle) the Ark leaves for the stars. */
  completeAdvance(f: Faction) {
    f.advance = null;
    if (f.era >= LAST_CRADLE_ERA) {
      this.launchArk(f);
      return;
    }
    f.era++;
    const era = ERAS[f.era];
    // Walls and guns are as strong as the age: refresh them.
    this.recomputeMods(f);
    // So is every unit the house has, wherever it stands. The change spreads outward from the Hearth:
    // each unit is upgraded when it reaches the unit (see `agesTick`), the nearest first.
    const home = f.capital >= 0 ? this.nodes[f.capital] : null;
    let reach = 0;
    for (const u of this.unitList) {
      if (u.dead || u.owner !== f.id || u.era >= f.era) continue;
      const far = home ? Math.hypot(u.x - home.x, u.y - home.y) : 0;
      u.rearm = Math.min(UPGRADE_MAX, far / UPGRADE_SPREAD);
      reach = Math.max(reach, Math.min(UPGRADE_MAX * UPGRADE_SPREAD, far));
    }
    if (this.fxEnabled && home && reach > 0) this.fx.push({ k: 'wave', x: home.x, y: home.y, r: reach, dur: reach / UPGRADE_SPREAD, color: f.color, node: home.id });
    f.pendingDrafts++;
    if (this.fxEnabled && f.capital >= 0) this.fx.push({ k: 'capture', node: f.capital, color: f.color });
    if (f.isPlayer) this.notify(f.id, `The ${era.name} begins! All your units are upgraded. ${era.brings} A Boon of the new age awaits. (B)`, 'good', f.capital, true);
    else this.notify(-1, `${f.name} has entered the ${era.name}.`, 'info', this.player.explored[f.capital] ? f.capital : undefined);
  }

  /** A house's Ark leaves the cradle. The player's: the run goes on among the stars. A rival's: it is gone ahead. */
  private launchArk(f: Faction) {
    f.launchedAt = this.time;
    f.era = SPACE;
    if (f.isPlayer) {
      this.ascended = true;
      return;
    }
    // Its people go with it: its lands fall dark, open to whoever kindles them next.
    const lands = this.worldsOf(f.id).length;
    f.alive = false;
    for (const n of this.nodes) {
      if (n.capitalOf === f.id) n.capitalOf = -1;
      if (n.owner === f.id) this.darken(n);
    }
    for (const u of this.unitList) if (u.owner === f.id && !u.dead) this.deferred.push(() => this.removeUnit(u));
    f.capital = -1;
    this.notify(-1, `The Ark of ${f.name} has left for the stars. Its ${lands} lands lie dark: kindle them, and hurry after it.`, 'alert', undefined, true);
  }

  /** Take a unit off the map without a fight (no wreck, no spoils). */
  private removeUnit(u: Unit) {
    if (u.dead) return;
    u.dead = true;
    this.units.delete(u.id);
  }

  cmdCancel(fid: number, nodeId: number, queue: 'ship' | 'build', index: number): boolean {
    const n = this.nodeAt(nodeId);
    if (!n || n.owner !== fid) return false;
    const q = queue === 'ship' ? n.shipQ : n.buildQ;
    const it = q[index];
    if (!it) return false;
    q.splice(index, 1);
    const f = this.factions[fid];
    this.addEmbers(f, it.cost);
    if (it.kind === 'ship') f.hangarUsed -= UNITS[it.id as UnitType].hangar;
    return true;
  }

  cmdSetRally(fid: number, nodeId: number, target: number): boolean {
    const n = this.nodeAt(nodeId);
    if (!n || n.owner !== fid || !this.nodeAt(target)) return false;
    n.rally = target === nodeId ? -1 : target;
    return true;
  }

  /** A deliberately weak Corsair raider for the First Night tutorial. */
  spawnTutorialRaider(targetNode: number): Unit | null {
    const t = this.nodes[targetNode];
    const from = t.lanes.find((l) => this.nodes[l].owner < 0 && !this.hasHostiles(l, this.pirateId)) ?? t.lanes[0];
    if (from === undefined) return null;
    const u = this.spawnUnit('raider', this.pirateId, from, { hpFrac: 0.6 });
    u.buffs.push({ id: 'feeble', t: 1e9, v: 0 });
    this.cmdMove(this.pirateId, [u.id], targetNode);
    return u;
  }

  // =====================================================================
  // Notifications
  // =====================================================================

  /** fid = -1 broadcasts to the player. `pause` asks the client to pause (if auto-pause is on). */
  notify(fid: number, text: string, kind: Note['kind'], node?: number, pause = false) {
    if (fid !== -1 && fid !== this.playerId) return;
    if (this.config.autoplay) return;
    this.notes.push({ id: this.noteId++, t: this.time, text, kind, node, pause: pause || undefined });
    if (this.notes.length > 60) this.notes.splice(0, this.notes.length - 60);
  }

  // =====================================================================
  // Simulation step
  // =====================================================================

  rebuildBuckets() {
    for (const b of this.buckets) b.length = 0;
    for (const u of this.unitList) if (!u.dead && u.node >= 0) this.buckets[u.node].push(u);
  }

  step() {
    if (this.outcome || this.ascended) return;
    const dt = TICK;
    this.time += dt;
    this.tick++;
    for (const u of this.unitList) {
      u.px = u.x;
      u.py = u.y;
      u.pa = u.a;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }
    this.rebuildBuckets();
    if (this.tick % 10 === 0) visibilityTick(this);
    economyTick(this, dt);
    productionTick(this, dt);
    abilitiesTick(this, dt);
    combatTick(this, dt);
    projectileTick(this, dt);
    movementTick(this, dt);
    statusTick(this, dt);
    // (Corsairs, the Hollow and the anomalies belong to the stars, not to the cradle.)
    if (!this.cradle) {
      piratesTick(this, dt);
      crisisTick(this, dt);
      eventsTick(this, dt);
    }
    if (this.sleepers > 0 && this.tick % 20 === 0) for (const f of this.factions) if (f.asleepUntil > 0 && this.time >= f.asleepUntil) this.wake(f);
    for (const f of this.factions) if (f.ai && f.alive && !this.asleep(f.id)) aiTick(this, f, dt);
    if (this.tick % 20 === 0) victoryTick(this);
    this.flushDeferred();
    if (this.tick % 20 === 0 || this.unitList.length > 4000) this.cleanup();
  }

  flushDeferred() {
    let guard = 0;
    while (this.deferred.length && guard++ < 10) {
      const list = this.deferred;
      this.deferred = [];
      for (const fn of list) fn();
    }
  }

  private cleanup() {
    if (this.unitList.some((u) => u.dead)) {
      this.unitList = this.unitList.filter((u) => {
        if (u.dead) this.units.delete(u.id);
        return !u.dead;
      });
    }
  }
}

/** Ring formation offsets (first slot at the center). */
export function formation(n: number, spacing: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let ring = 1;
  while (out.length < n) {
    const count = ring * 6;
    for (let i = 0; i < count && out.length < n; i++) {
      const a = (i / count) * TAU + ring * 0.4;
      out.push([Math.cos(a) * spacing * ring, Math.sin(a) * spacing * ring]);
    }
    ring++;
  }
  return out;
}

export type { AIState };
