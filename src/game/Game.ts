/**
 * The game: its whole state, and everything that can be asked of it or told to it.
 *
 * The simulation is deterministic. It moves in fixed ticks (`step`), draws every random number from
 * its own seeded generator (`rng`), and never touches the screen or the clock: the same seed and the
 * same commands give the same game, with or without anything drawing it, and a saved game goes on
 * exactly as the one that was saved.
 *
 * This file is the list. What is short is written here. Anything longer is a one-line method that
 * hands the game to the module that does the work, under a heading that names the module:
 *
 *   setup.ts, save.ts            a new game; saving and loading
 *   worldStats.ts, shipStats.ts  what a world yields and can do; what a ship can do
 *   pathing.ts, fields.ts        ways through the sector; anti-warp fields and what a Bastion protects
 *   modSources.ts, boons.ts      what a house has learned; the Boons it is offered
 *   unitLife.ts, conquest.ts     a ship built, hit, destroyed; a world taken, a house fallen, a winner named
 *   commands/                    what a house can order (the player's UI and the rival houses alike)
 *   systems/                     what happens by itself, every tick
 *   ai/, data/                   how rival houses decide; the tables of ships, worlds, Boons, events
 */
import * as boons from './boons';
import * as choices from './commands/choices';
import * as climb from './commands/climb';
import * as orders from './commands/orders';
import * as production from './commands/production';
import * as conquest from './conquest';
import { TICK } from './constants';
import type { CardDef } from './data/cards';
import { ANOMALY_EVENTS, OFFER_EVENTS } from './data/events';
import { houseShort } from './data/heirs';
import { isWarship, UNITS } from './data/units';
import { boonCost } from './data/worlds';
import * as fields from './fields';
import type { FieldReach, FieldState } from './fields';
import { computePaths, type SystemInfo } from './mapgen';
import * as modSources from './modSources';
import * as pathing from './pathing';
import { RNG } from './rng';
import * as save from './save';
import type { SaveData } from './save';
import { setupGame } from './setup';
import * as shipStats from './shipStats';
import * as starfall from './starfall';
import { aiTick } from './ai/ai';
import { abilitiesTick } from './systems/abilities';
import { combatTick, projectileTick } from './systems/combat';
import { crisisTick } from './systems/crisis';
import { economyTick } from './systems/economy';
import { eventsTick } from './systems/events';
import { movementTick } from './systems/movement';
import { piratesTick } from './systems/pirates';
import { productionTick } from './systems/production';
import { starfallTick } from './systems/starfall';
import { statusTick } from './systems/status';
import { victoryTick } from './systems/victory';
import { discoveryTick } from './systems/discovery';
import { visibilityTick } from './systems/visibility';
import type {
  AIState, CrisisState, DmgType, Faction, Fx, GameConfig, GNode, Herald, Lane, Mods, Note, Outcome, PirateState, Projectile, Prompt, QueueCheck,
  Rarity, Unit, UnitMod, UnitType, VictoryId, WeaponDef, WorldRole,
} from './types';
import * as unitLife from './unitLife';
import * as worldStats from './worldStats';

export type { SaveData } from './save';

/**
 * How the houses stood at one moment of the run, for the graphs of the results (`Game.history`):
 * for each house still in it, its Ember income per second (e), worlds (w), fleet strength (s: what its
 * warships are worth in battle, as the AI counts it) and Boons (b).
 */
export interface HistorySample {
  t: number;
  h: { f: number; e: number; w: number; s: number; b: number }[];
}

/** Seconds of game time between two samples of `Game.history`. */
export const HISTORY_EVERY = 30;

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
  /**
   * A Daily run's orders, kept as the player gives them, so that the board can play the run again and
   * read its result for itself (replay.ts): the tick each was given after, the order, its arguments. The
   * player's orders come between ticks (the rival houses give theirs within one). Not there otherwise.
   */
  orders?: Order[];
  /** Within a tick: an order given now is the simulation's own, not the player's. */
  stepping = false;
  /** Within an order being kept: one it gives in its turn is part of it. */
  ordering = 0;

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
  /** How the houses stood, every `HISTORY_EVERY` seconds and at the end (the results draw it). */
  history: HistorySample[] = [];

  /** An Ages run still on its cradle world: the houses climb through the ages, and the rules of the ages hold. */
  get cradle(): boolean {
    return this.config.mode === 'ages' && this.config.stage !== 'stars';
  }

  // =====================================================================
  // Construction
  // =====================================================================

  static create(config: GameConfig): Game {
    const g = new Game();
    setupGame(g, config);
    // (A Daily keeps its orders from the first: its board plays them again.)
    if (config.daily) g.orders = [];
    return g;
  }

  static load(data: SaveData): Game {
    const g = new Game();
    save.loadGame(g, data);
    return g;
  }

  // ---- Saving and loading (save.ts) ----
  serialize(): SaveData { return save.serialize(this); }

  /** Work out again what is not saved: the table of ways, a list of ships for each place. */
  derive() {
    const p = computePaths(this.nodes, this.lanes);
    this.pathDist = p.dist;
    this.pathNext = p.next;
    this.pathHops = p.hops;
    this.buckets = this.nodes.map(() => []);
    this.worldCount = this.nodes.filter((n) => n.kind === 'planet').length;
  }

  drawAnomaly(): string {
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

  // ---- Ways through the sector (pathing.ts) ----
  seenGuarded(f: Faction, nodeId: number): boolean { return pathing.seenGuarded(this, f, nodeId); }
  safeWay(f: Faction, from: number, to: number): number[] { return pathing.safeWay(this, f, from, to); }
  chartable(fid: number): number { return pathing.chartable(this, fid); }
  wayLen(from: number, way: number[]): number { return pathing.wayLen(this, from, way); }
  pathAvoiding(a: number, b: number, extra: (nodeId: number) => number): number[] { return pathing.pathAvoiding(this, a, b, extra); }
  pathTo(a: number, b: number): number[] { return pathing.pathTo(this, a, b); }
  dangerKnown(fid: number, id: number): boolean { return pathing.dangerKnown(this, fid, id); }

  /** Lore needed for this house's next Boon. */
  boonCostOf(f: Faction): number {
    return Math.round(boonCost(f.boons) * (this.traits.includes('discovery') ? 0.85 : 1));
  }

  hasCard(f: Faction, id: string): boolean {
    return f.cards.includes(id);
  }

  // ---- Worlds: roles, yields, walls, guns, prices (worldStats.ts) ----
  affinityOf(n: GNode): WorldRole | null { return worldStats.affinityOf(n); }
  hasRole(n: GNode, role: WorldRole): boolean { return worldStats.hasRole(n, role); }
  roleBonus(n: GNode, role: WorldRole): number { return worldStats.roleBonus(this, n, role); }
  forgeFit(n: GNode): boolean { return worldStats.forgeFit(this, n); }
  levelMulOf(n: GNode): number { return worldStats.levelMulOf(n); }
  worldEmbers(n: GNode): number { return worldStats.worldEmbers(this, n); }
  worldLore(n: GNode): number { return worldStats.worldLore(this, n); }
  forgeMul(n: GNode): number { return worldStats.forgeMul(this, n); }
  isForge(n: GNode): boolean { return worldStats.isForge(n); }
  wallsOf(n: GNode): number { return worldStats.wallsOf(this, n); }
  worldGun(n: GNode): { dmg: number; cd: number; range: number } | null { return worldStats.worldGun(this, n); }
  refreshWorld(n: GNode) { return worldStats.refreshWorld(this, n); }
  setLevel(n: GNode, level: number) { return worldStats.setLevel(this, n, level); }
  hangarCapOf(f: Faction): number { return worldStats.hangarCapOf(this, f); }
  kindleCost(f: Faction): number { return worldStats.kindleCost(this, f); }
  upgradeCost(f: Faction, n: GNode): number | null { return worldStats.upgradeCost(f, n); }

  // ---- Ships: speed, range, damage, strength (shipStats.ts) ----
  umod(u: Unit): UnitMod { return shipStats.umod(this, u); }
  levelMul(u: Unit): number { return shipStats.levelMul(u); }
  refreshUnitStats(u: Unit, fresh = false, hpFrac = 1) { return shipStats.refreshUnitStats(this, u, fresh, hpFrac); }
  armorOf(u: Unit): number { return shipStats.armorOf(this, u); }
  hasBuff(u: Unit, id: string): boolean { return shipStats.hasBuff(u, id); }
  holdAt(u: Unit): number { return shipStats.holdAt(this, u); }
  speedOf(u: Unit): number { return shipStats.speedOf(this, u); }
  jumpChargeOf(u: Unit): number { return shipStats.jumpChargeOf(this, u); }
  laneSpeedOf(u: Unit): number { return shipStats.laneSpeedOf(this, u); }
  rangeOf(u: Unit, w: WeaponDef): number { return shipStats.rangeOf(this, u, w); }
  maxRangeOf(u: Unit): number { return shipStats.maxRangeOf(this, u); }
  rofOf(u: Unit): number { return shipStats.rofOf(this, u); }
  dmgMulOf(u: Unit, type: DmgType): number { return shipStats.dmgMulOf(this, u, type); }
  unitPower(u: Unit): number { return shipStats.unitPower(this, u); }
  powerAt(nodeId: number, fid: number): number { return shipStats.powerAt(this, nodeId, fid); }
  hostilePowerAt(nodeId: number, fid: number): number { return shipStats.hostilePowerAt(this, nodeId, fid); }
  holdsFire(attacker: number, worldOwner: number): boolean { return shipStats.holdsFire(this, attacker, worldOwner); }
  hasHostiles(nodeId: number, fid: number): boolean { return shipStats.hasHostiles(this, nodeId, fid); }
  kindleBarred(nodeId: number, fid: number): boolean { return shipStats.kindleBarred(this, nodeId, fid); }

  // ---- Anti-warp fields and what a Bastion protects (fields.ts) ----
  fieldAt(n: GNode): boolean { return fields.fieldAt(this, n); }
  isBastion(n: GNode): boolean { return fields.isBastion(this, n); }
  fieldReaches(): FieldReach[] { return fields.fieldReaches(this); }
  fieldsFrom(n: GNode): number[] { return fields.fieldsFrom(this, n); }
  guardsOf(n: GNode): number[] { return fields.guardsOf(this, n); }
  guardOf(n: GNode): number { return fields.guardOf(this, n); }
  guardedBy(n: GNode): number[] { return fields.guardedBy(this, n); }
  fieldsOver(n: GNode): number[] { return fields.fieldsOver(this, n); }

  /** The fields as they stand this tick (worked out in fields.ts, forgotten at the end of every tick). */
  fieldCache: FieldState | null = null;
  /** Counts the Starbases built and lost (they make and unmake a field). */
  fieldEpoch = 0;

  // ---- The Starfall, and the stars it has set alight (starfall.ts) ----
  /** The burning stars (worked out in starfall.ts, forgotten at the end of every tick). */
  fireCache: number[] | null = null;
  fires(): number[] { return starfall.fires(this); }
  fireOnWay(a: number, b: number): GNode | null { return starfall.fireOnWay(this, a, b); }
  starOf(n: GNode): GNode | null { return starfall.starOf(this, n); }
  armedStarfalls(): Unit[] { return starfall.armed(this); }
  armedAt(n: GNode): Unit | null { return starfall.armedAt(this, n); }
  starfallOf(fid: number): Unit | null { return starfall.starfallOf(this, fid); }
  starfallCost(f: Faction): number { return starfall.starfallCost(this, f); }

  /** The places one starlane away (worked out once from the map, which does not change). */
  neighbours(id: number): number[] {
    if (!this.nextTo || this.nextToOf !== this.lanes) {
      this.nextTo = this.nodes.map(() => []);
      this.nextToOf = this.lanes;
      for (const l of this.lanes) {
        this.nextTo[l.a].push(l.b);
        this.nextTo[l.b].push(l.a);
      }
    }
    return this.nextTo[id] ?? [];
  }

  private nextTo: number[][] | null = null;
  private nextToOf: Lane[] | null = null;

  score(f: Faction): number {
    let fleet = 0;
    for (const u of this.unitList) if (!u.dead && u.owner === f.id) fleet += UNITS[u.type].power;
    return this.worldsOf(f.id).length * 10 + fleet + f.boons * 6 + f.relics.length * 15;
  }

  // =====================================================================
  // Modifiers
  // =====================================================================

  // ---- What a house has learned (modSources.ts) ----
  recomputeMods(f: Faction) { return modSources.recomputeMods(this, f); }
  computeMods(f: Faction, extraCards: string[] = []): Mods { return modSources.computeMods(this, f, extraCards); }
  modSources(f: Faction, extraCards: string[] = []): { label: string; apply: (m: Mods) => void }[] {
    return modSources.modSources(this, f, extraCards);
  }

  // =====================================================================
  // Entities
  // =====================================================================

  // ---- A ship's life: built, hit, turned, destroyed, raised a level (unitLife.ts) ----
  spawnUnit(type: UnitType, owner: number, nodeId: number, opts: { x?: number; y?: number; hpFrac?: number; parent?: number; temp?: number } = {}): Unit {
    return unitLife.spawnUnit(this, type, owner, nodeId, opts);
  }
  damageUnitRaw(u: Unit, amount: number, byFaction: number) { return unitLife.damageUnitRaw(this, u, amount, byFaction); }
  damageUnit(t: Unit, amount: number, type: DmgType, byFaction: number, src: Unit | null) { return unitLife.damageUnit(this, t, amount, type, byFaction, src); }
  convertUnits(list: Unit[], to: number, by: Unit | null) { return unitLife.convertUnits(this, list, to, by); }
  killUnit(u: Unit, byFaction: number, src: Unit | null = null) { return unitLife.killUnit(this, u, byFaction, src); }
  addXp(u: Unit, amount: number) { return unitLife.addXp(this, u, amount); }
  applyLevelFromXp(u: Unit) { return unitLife.applyLevelFromXp(this, u); }
  grantLevels(u: Unit, n: number) { return unitLife.grantLevels(this, u, n); }
  oweAbilities(u: Unit) { return unitLife.oweAbilities(this, u); }
  removeUnit(u: Unit) { return unitLife.removeUnit(this, u); }
  spawnTutorialRaider(targetNode: number): Unit | null { return unitLife.spawnTutorialRaider(this, targetNode); }

  // ---- Worlds change hands, houses fall, a winner is named (conquest.ts) ----
  damagePlanet(n: GNode, amount: number, type: DmgType, byFaction: number, spare = false) { return conquest.damagePlanet(this, n, amount, type, byFaction, spare); }
  kindleWorld(n: GNode, fid: number) { return conquest.kindleWorld(this, n, fid); }
  planetDefeated(n: GNode, byFaction: number) { return conquest.planetDefeated(this, n, byFaction); }
  eliminate(fid: number, byFaction: number) { return conquest.eliminate(this, fid, byFaction); }
  declareWinner(fid: number, victory: VictoryId | 'defeat', reason: string) { return conquest.declareWinner(this, fid, victory, reason); }

  /** A house's name where room is short ("The Choir" for the Choir of the First Flame). */
  shortName(f: Faction): string {
    return houseShort(f.heir, f.name);
  }

  /**
   * One sample of `history`. A house that is out of the game has one last sample with nothing in it,
   * where its line ends, and no more.
   */
  sampleHistory() {
    if (this.cradle) return;
    const last = this.history[this.history.length - 1];
    if (last && Math.abs(last.t - this.time) < 1) return;
    const h: HistorySample['h'] = [];
    for (const f of this.empires()) {
      if (!f.alive && !(last ? last.h.some((x) => x.f === f.id && x.w > 0) : false)) continue;
      let s = 0;
      if (f.alive) for (const u of this.unitList) if (!u.dead && u.owner === f.id && isWarship(u.type)) s += this.unitPower(u);
      const round = (x: number) => Math.round(x * 10) / 10;
      h.push({ f: f.id, e: f.alive ? round(f.income) : 0, w: f.alive ? this.worldsOf(f.id).length : 0, s: Math.round(s), b: f.boons });
    }
    this.history.push({ t: Math.round(this.time), h });
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

  // ---- Boons: the pool, an offer, the choice (boons.ts) ----
  cardCount(f: Faction, id: string): number { return boons.cardCount(f, id); }
  addCard(f: Faction, id: string) { return boons.addCard(this, f, id); }
  cardPool(f: Faction, rarities?: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef[] {
    return boons.cardPool(this, f, rarities, filter, allowPacts);
  }
  grantRandomCard(f: Faction, rarities: Rarity[], filter?: (c: CardDef) => boolean, allowPacts = false): CardDef | null {
    return boons.grantRandomCard(this, f, rarities, filter, allowPacts);
  }
  draftSize(f: Faction): number { return boons.draftSize(f); }
  generateOffer(f: Faction): string[] { return boons.generateOffer(this, f); }
  offerOdds(f: Faction): boons.OfferOdds { return boons.offerOdds(this, f); }
  ensureOffer(f: Faction): string[] | null { return boons.ensureOffer(this, f); }
  cmdChooseCard(fid: number, cardId: string): boolean { return boons.cmdChooseCard(this, fid, cardId); }
  cmdReroll(fid: number): boolean { return boons.cmdReroll(this, fid); }
  skipValue(f: Faction): number { return boons.skipValue(f); }
  cmdSkipDraft(fid: number): boolean { return boons.cmdSkipDraft(this, fid); }

  // ---- Commands: goals, abilities, decisions (commands/choices.ts) ----
  cmdGoal(fid: number, id: string): boolean { return choices.cmdGoal(this, fid, id); }
  cmdChooseAbility(fid: number, unitId: number, abilityId: string): boolean { return choices.cmdChooseAbility(this, fid, unitId, abilityId); }
  cmdResolvePrompt(promptId: number, choice: number): string | null { return choices.cmdResolvePrompt(this, promptId, choice); }
  dismissPrompt(promptId: number) { return choices.dismissPrompt(this, promptId); }

  // =====================================================================
  // Commands (shared by the player's UI and the AI)
  // =====================================================================

  /** A world by id, or null when the id is not a world (commands never trust their input). */
  nodeAt(id: number): GNode | null {
    return Number.isInteger(id) && id >= 0 && id < this.nodes.length ? this.nodes[id] : null;
  }

  // ---- Commands: orders to ships (commands/orders.ts) ----
  cmdMove(fid: number, ids: number[], dest: number, x?: number, y?: number, avoid?: (nodeId: number) => number, queue = false, through = false) {
    return orders.cmdMove(this, fid, ids, dest, x, y, avoid, queue, through);
  }
  cmdAttack(fid: number, ids: number[], targetId: number) { return orders.cmdAttack(this, fid, ids, targetId); }
  checkKindle(fid: number, nodeId: number): QueueCheck { return orders.checkKindle(this, fid, nodeId); }
  seedFor(fid: number, nodeId: number): Unit | null { return orders.seedFor(this, fid, nodeId); }
  idleSeed(fid: number): Unit | null { return orders.idleSeed(this, fid); }
  kindleSource(fid: number, nodeId: number): number { return orders.kindleSource(this, fid, nodeId); }
  cmdKindle(fid: number, nodeId: number): boolean { return orders.cmdKindle(this, fid, nodeId); }
  cmdSendSeed(fid: number, seedId: number, nodeId: number): boolean { return orders.cmdSendSeed(this, fid, seedId, nodeId); }
  cmdStop(fid: number, ids: number[]) { return orders.cmdStop(this, fid, ids); }
  nearestOwnedWorld(fid: number, from: number): number { return orders.nearestOwnedWorld(this, fid, from); }
  cmdRetreat(fid: number, ids: number[]) { return orders.cmdRetreat(this, fid, ids); }
  hasUncharted(f: Faction): boolean { return orders.hasUncharted(f); }
  cmdExplore(fid: number, ids: number[]) { return orders.cmdExplore(this, fid, ids); }
  cmdSetRally(fid: number, nodeId: number, target: number): boolean { return orders.cmdSetRally(this, fid, nodeId, target); }
  checkArm(fid: number, unitId: number): QueueCheck { return orders.checkArm(this, fid, unitId); }
  cmdArm(fid: number, unitId: number): boolean { return orders.cmdArm(this, fid, unitId); }

  // ---- Commands: building and raising (commands/production.ts) ----
  shipCost(f: Faction, type: UnitType, at?: GNode): number { return production.shipCost(this, f, type, at); }
  dreadnoughtCount(fid: number): number { return production.dreadnoughtCount(this, fid); }
  shipTypesFor(f: Faction): UnitType[] { return production.shipTypesFor(this, f); }
  checkShip(fid: number, nodeId: number, type: UnitType): QueueCheck { return production.checkShip(this, fid, nodeId, type); }
  cmdQueueShip(fid: number, nodeId: number, type: UnitType): boolean { return production.cmdQueueShip(this, fid, nodeId, type); }
  checkUpgrade(fid: number, nodeId: number): QueueCheck { return production.checkUpgrade(this, fid, nodeId); }
  cmdUpgrade(fid: number, nodeId: number): boolean { return production.cmdUpgrade(this, fid, nodeId); }
  checkRole(fid: number, nodeId: number, role: WorldRole): QueueCheck { return production.checkRole(this, fid, nodeId, role); }
  cmdSetRole(fid: number, nodeId: number, role: WorldRole): boolean { return production.cmdSetRole(this, fid, nodeId, role); }
  starbaseAt(n: GNode): number { return production.starbaseAt(this, n); }
  checkStarbase(fid: number, nodeId: number): QueueCheck { return production.checkStarbase(this, fid, nodeId); }
  cmdQueueStarbase(fid: number, nodeId: number): boolean { return production.cmdQueueStarbase(this, fid, nodeId); }
  checkGate(fid: number, nodeId: number): QueueCheck { return production.checkGate(this, fid, nodeId); }
  cmdQueueGate(fid: number, nodeId: number): boolean { return production.cmdQueueGate(this, fid, nodeId); }
  checkStarfall(fid: number): QueueCheck { return production.checkStarfall(this, fid); }
  cmdQueueStarfall(fid: number): boolean { return production.cmdQueueStarfall(this, fid); }
  bayCost(f: Faction): number { return production.bayCost(f); }
  checkBay(fid: number): QueueCheck { return production.checkBay(this, fid); }
  cmdBuyBay(fid: number): boolean { return production.cmdBuyBay(this, fid); }
  checkArk(fid: number): QueueCheck { return production.checkArk(this, fid); }
  cmdRebuildArk(fid: number): boolean { return production.cmdRebuildArk(this, fid); }
  cmdCancel(fid: number, nodeId: number, queue: 'ship' | 'build', index: number): boolean { return production.cmdCancel(this, fid, nodeId, queue, index); }

  // ---- Commands: the climb through the ages (commands/climb.ts) ----
  checkAdvance(fid: number): QueueCheck { return climb.checkAdvance(this, fid); }
  cmdAdvance(fid: number): boolean { return climb.cmdAdvance(this, fid); }
  cmdCancelAdvance(fid: number): boolean { return climb.cmdCancelAdvance(this, fid); }
  completeAdvance(f: Faction) { return climb.completeAdvance(this, f); }

  // =====================================================================
  // Notifications
  // =====================================================================

  /**
   * fid = -1 broadcasts to the player. `pause` asks the client to pause (if auto-pause is on). `herald`:
   * a big moment, announced across the screen as well.
   */
  notify(fid: number, text: string, kind: Note['kind'], node?: number, pause = false, herald?: Herald) {
    if (fid !== -1 && fid !== this.playerId) return;
    if (this.config.autoplay) return;
    const note: Note = { id: this.noteId++, t: this.time, text, kind, node, pause: pause || undefined };
    if (herald) note.herald = herald;
    this.notes.push(note);
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
    this.stepping = true;
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
    // (Corsairs, the Hollow, the anomalies and the Starfall belong to the stars, not to the cradle.)
    if (!this.cradle) {
      starfallTick(this, dt);
      piratesTick(this, dt);
      crisisTick(this, dt);
      eventsTick(this, dt);
    }
    if (this.sleepers > 0 && this.tick % 20 === 0) for (const f of this.factions) if (f.asleepUntil > 0 && this.time >= f.asleepUntil) this.wake(f);
    for (const f of this.factions) if (f.ai && f.alive && !this.asleep(f.id)) aiTick(this, f, dt);
    if (this.tick % 20 === 0) victoryTick(this);
    if (this.tick % 20 === 0) discoveryTick(this);
    // (The graphs start where the run does: at its first tick, once the houses' incomes are counted.)
    if (!this.history.length || this.tick % Math.round(HISTORY_EVERY / TICK) === 0) this.sampleHistory();
    this.flushDeferred();
    if (this.tick % 20 === 0 || this.unitList.length > 4000) this.cleanup();
    this.fieldCache = null;
    this.fireCache = null;
    this.stepping = false;
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

export type { AIState };

/** An order of the player's, as a Daily run keeps it: the tick it was given after, its name, its arguments (null for nothing). */
export type Order = [tick: number, name: string, args: unknown[]];

/** The orders a player gives: every command, an offer of Boons dealt, an outcome put away. */
export const ORDER_NAMES = [
  'cmdChooseCard', 'cmdReroll', 'cmdSkipDraft', 'cmdGoal', 'cmdChooseAbility', 'cmdResolvePrompt', 'dismissPrompt', 'ensureOffer',
  'cmdMove', 'cmdAttack', 'cmdKindle', 'cmdSendSeed', 'cmdStop', 'cmdRetreat', 'cmdExplore', 'cmdSetRally', 'cmdArm', 'cmdQueueShip',
  'cmdUpgrade', 'cmdSetRole', 'cmdQueueStarbase', 'cmdQueueGate', 'cmdQueueStarfall', 'cmdBuyBay', 'cmdRebuildArk', 'cmdCancel',
  'cmdAdvance', 'cmdCancelAdvance',
] as const;

/** An argument as it is kept: nothing and a function as null, a list as a copy. */
const keep = (a: unknown): unknown => (a === undefined || typeof a === 'function' ? null : Array.isArray(a) ? [...a] : a);
/** An argument as an order kept is given again (replay.ts): null as nothing. */
const kept = (a: unknown): unknown => (a === null || typeof a === 'function' ? undefined : a);

// Every order the player gives, kept when the run keeps them: given between ticks, not within another.
// (An offer only when one is dealt: the Boons screen asks for it every frame.) A kept order is carried out
// as it will be given again: a function among its arguments (a way round danger, the AI's) cannot be
// kept, and is left out of it now as it will be then.
for (const name of ORDER_NAMES) {
  const proto = Game.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const given = proto[name];
  proto[name] = function (this: Game, ...args: unknown[]) {
    if (!this.orders || this.stepping || this.ordering) return given.apply(this, args);
    const before = name === 'ensureOffer' ? (args[0] as Faction).draftOffer : null;
    this.ordering++;
    try {
      const out = given.apply(this, args.map(kept));
      if (name !== 'ensureOffer') this.orders.push([this.tick, name, args.map(keep)]);
      else {
        const f = args[0] as Faction;
        if (f.id === this.playerId && !before && f.draftOffer) this.orders.push([this.tick, name, [f.id]]);
      }
      return out;
    } finally {
      this.ordering--;
    }
  };
}
