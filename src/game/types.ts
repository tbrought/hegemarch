/** Weapon families. The core triangle is rapid (Strikers) > siege (Breakers) > flak (Guardians) > rapid. */
export type DmgType = 'rapid' | 'flak' | 'siege' | 'lance' | 'fighter' | 'energy';
export type ArmorClass = 'strike' | 'light' | 'medium' | 'heavy' | 'structure' | 'planet';
export type UnitType =
  | 'scout'
  | 'seed'
  | 'striker'
  | 'guardian'
  | 'breaker'
  | 'carrier'
  | 'lancer'
  | 'dreadnought'
  | 'ark'
  | 'fighter'
  | 'starbase'
  | 'gate'
  | 'raider'
  | 'marauder'
  | 'stronghold'
  | 'militia'
  | 'sentinel'
  | 'monolith'
  | 'drone'
  | 'reaper'
  | 'leviathan'
  | 'heart';
export type UnitRole = 'scout' | 'seed' | 'combat' | 'siege' | 'carrier' | 'capital' | 'defense' | 'fighter' | 'boss';
export type ProjKind = 'beam' | 'bolt' | 'lance' | 'shell' | 'missile';
export type PlanetType = 'terran' | 'ocean' | 'desert' | 'ice' | 'volcanic' | 'gas' | 'barren' | 'asteroid';
export type WorldSize = 'S' | 'M' | 'L';
export type WorldRole = 'forge' | 'mine' | 'observatory' | 'bastion';
export type NodeKind = 'star' | 'planet' | 'anomaly' | 'relic' | 'pirate' | 'rift';
export type FactionKind = 'empire' | 'pirate' | 'guardian' | 'crisis';
export type VictoryId = 'conquest' | 'domination' | 'ascension' | 'relics' | 'treasury' | 'crisis';
export type MapSize = 'small' | 'medium' | 'large';
export type Difficulty = 0 | 1 | 2 | 3;
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface WeaponDef {
  name: string;
  type: DmgType;
  damage: number;
  cooldown: number;
  range: number;
  proj: ProjKind;
  speed?: number;
  count?: number;
}

export interface UnitDef {
  id: UnitType;
  name: string;
  role: UnitRole;
  armorClass: ArmorClass;
  hull: number;
  shield: number;
  armor: number;
  shieldRegen: number;
  speed: number;
  turn: number;
  radius: number;
  /** Price in Embers. */
  cost: number;
  buildTime: number;
  /** Hangar space this ship takes. */
  hangar: number;
  weapons: WeaponDef[];
  fighters?: number;
  power: number;
  /** Appears in a Forge's build menu (core ships, or once its Blueprint is drafted). */
  buildable: boolean;
  /** Boon id that unlocks this ship (core ships have none). */
  blueprint?: string;
  isStatic?: boolean;
  xpValue: number;
  desc: string;
  /** One line for build buttons. */
  short: string;
  /** Preferred target classes, most preferred first. */
  prefers: ArmorClass[];
  /** How much this unit wants to shoot an enemy world (1 = as much as its favourite ship class). Default 0.2. */
  planetWeight?: number;
}

export interface UnitBuff {
  id: string;
  t: number;
  v: number;
}

export interface AbilitySlot {
  id: string;
  cd: number;
}

export interface Lane {
  a: number;
  b: number;
  len: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  a: number;
  pa: number;
  hp: number;
  maxHp: number;
  sh: number;
  maxSh: number;
  node: number;
  /** In-transit lane info (null while in a gravity well). */
  lane: null | { from: number; to: number; t: number; dur: number; sx: number; sy: number; ex: number; ey: number };
  path: number[];
  /** Remaining jump charge time. -1 when not charging. */
  charge: number;
  dest: number;
  ax: number;
  ay: number;
  order: 'idle' | 'move' | 'attack' | 'kindle' | 'explore' | 'retreat';
  orderTarget: number;
  target: number;
  retarget: number;
  wcd: number[];
  lastHit: number;
  lastHitBy: number;
  xp: number;
  level: number;
  abil: AbilitySlot[];
  pendingAbil: string[][];
  buffs: UnitBuff[];
  parent: number;
  /** Carrier: fighters docked in the hangar. */
  fighters: number;
  /** Carrier: fighters currently launched. */
  launched: number;
  fighterTimer: number;
  /** Seed ship: kindling progress at its target. */
  kindle: number;
  /** Explicit in-well destination point for the current order (NaN if none). */
  ox: number;
  oy: number;
  dead: boolean;
  born: number;
  stun: number;
  snare: number;
  wellTime: number;
  /** Arrived from a lane jump recently (Phase Strike boon). */
  arrivedAt: number;
  temp: number;
  /** The age this unit is of (data/eras.ts). Always the Space Age outside an Ages run's cradle. */
  era: number;
  /** Ages: seconds until this unit is upgraded to its house's new age (the change spreads from the Hearth). */
  rearm?: number;
  /** It came over from another house (Conversion): it takes no room in the hangar of the house it joined. */
  guest?: boolean;
}

export interface QueueItem {
  kind: 'ship' | 'ark' | 'upgrade' | 'starbase' | 'gate';
  id: string;
  t: number;
  total: number;
  cost: number;
  target?: number;
}

export interface GNode {
  /** Kindled, and not yet given a role by its house: the first role it is given costs no time. */
  fresh?: boolean;
  id: number;
  name: string;
  kind: NodeKind;
  ptype: PlanetType | null;
  size: WorldSize;
  system: number;
  x: number;
  y: number;
  r: number;
  well: number;
  lanes: number[];
  seed: number;
  starColor: string;
  owner: number;
  /** Faction whose Hearth this is (-1 if none). */
  capitalOf: number;
  /** World level I–III. */
  level: number;
  role: WorldRole | null;
  /** Seconds left while the world switches roles (its role does nothing meanwhile). */
  retool: number;
  /** Output ramp after kindling or capture (0.25 → 1). */
  glow: number;
  hp: number;
  maxHp: number;
  sh: number;
  maxSh: number;
  shipQ: QueueItem[];
  buildQ: QueueItem[];
  gunCd: number;
  lastHit: number;
  lastHitBy: number;
  anomaly: string | null;
  relic: string | null;
  /** Something claimable by keeping ships here (relic / derelict). */
  claim: null | { what: 'relic' | 'derelict'; f: number; t: number };
  lastStand: boolean;
  militiaCd: number;
  hazard: null | { warn: number; t: number; dps: number };
  tag: string;
  /** Rally destination for newly built ships (-1 = none). */
  rally: number;
}

export interface Projectile {
  id: number;
  owner: number;
  src: number;
  x: number;
  y: number;
  px: number;
  py: number;
  tgt: number;
  tx: number;
  ty: number;
  speed: number;
  dmg: number;
  type: DmgType;
  kind: ProjKind;
  node: number;
  life: number;
  wob: number;
}

export interface FactionStats {
  shipsBuilt: number;
  shipsLost: number;
  kills: number;
  worldsKindled: number;
  worldsCaptured: number;
  worldsLost: number;
  maxWorlds: number;
  damageDealt: number;
  embersEarned: number;
  rivalsEliminated: number;
  strongholdDestroyed: boolean;
  arkLost: boolean;
  maxRelics: number;
  eventsResolved: number;
}

export interface AIState {
  personality: 'warlord' | 'expansionist' | 'turtle' | 'opportunist';
  nextThink: number;
  mode: 'build' | 'rally' | 'attack';
  target: number;
  rally: number;
  modeSince: number;
  lastAttack: number;
  attackCount: number;
  firstAttackAt: number;
  hoard: boolean;
  /** Recently seen hostile hulls by class, for counter-building. */
  seen: { light: number; medium: number; heavy: number };
  /** The house that last attacked our worlds (-1 = none): we answer it first. */
  grudge: number;
  grudgeAt: number;
  /** The siege under way: the world, when it was last looked at, and how much hull and shield it had then. */
  siege?: { node: number; at: number; left: number };
}

export interface Mods {
  dmg: number;
  dmgT: Record<DmgType, number>;
  hull: number;
  shield: number;
  shieldRegen: number;
  armor: number;
  rof: number;
  range: number;
  speed: number;
  laneSpeed: number;
  jumpCharge: number;
  build: number;
  shipCost: number;
  upgradeCost: number;
  embers: number;
  lore: number;
  kindleCost: number;
  kindleSpeed: number;
  glowRate: number;
  worldHp: number;
  worldGun: number;
  hearthHp: number;
  hearthGun: number;
  hangar: number;
  hangarMul: number;
  xp: number;
  fighters: number;
  draft: number;
  luck: number;
  role: Record<WorldRole, number>;
  unit: Partial<Record<UnitType, UnitMod>>;
  flags: Record<string, number>;
}

export interface UnitMod {
  dmg?: number;
  hull?: number;
  cost?: number;
  range?: number;
  build?: number;
  speed?: number;
}

export interface Faction {
  id: number;
  name: string;
  heir: string;
  color: string;
  kind: FactionKind;
  isPlayer: boolean;
  alive: boolean;
  embers: number;
  /** Embers per second (last computed). */
  income: number;
  lore: number;
  loreRate: number;
  /** Boons earned from Lore so far. */
  boons: number;
  pendingDrafts: number;
  draftOffer: string[] | null;
  rerolls: number;
  cards: string[];
  relics: string[];
  mods: Mods;
  capital: number;
  explored: number[];
  visible: number[];
  seenOwner: number[];
  hangarUsed: number;
  hangarCap: number;
  /** Hangar Bays bought at the Hearth (+5 hangar each). */
  bays: number;
  stats: FactionStats;
  ai: AIState | null;
  ark: number;
  arkLevel: number;
  arkXp: number;
  arkAbil: string[];
  incomeMul: number;
  holdTimer: number;
  treasuryTimer: number;
  relicTimer: number;
  gate: null | { node: number; charge: number; unit: number };
  boomT: number;
  echoT: number;
  interestT: number;
  stormT: number;
  /** Boons drafted since the last Blueprint was offered. */
  bpPity: number;
  eliminatedAt: number;
  /** Warning keys already announced (rival victory progress etc.). */
  warned: Record<string, number>;
  score: number;
  /** The age this house has reached (data/eras.ts). Always the Space Age outside an Ages run's cradle. */
  era: number;
  /** Ages: the step to the next age (or, last of all, the Ark) being taken at the Hearth. */
  advance: null | { t: number; total: number; lore: number; cost: number };
  /** Ages: when this house's Ark left the cradle for the stars (-1 = it has not). */
  launchedAt: number;
  /**
   * Ages, among the stars: the game time at which this house arrives from the cradle (0 = it is here). Until
   * then it holds its Hearth and does nothing, and nothing can touch it.
   */
  asleepUntil: number;
  /** Ages, among the stars: until this time rival houses leave it alone, unless it strikes first. */
  graceUntil: number;
}

export interface Prompt {
  id: number;
  event: string;
  node: number;
  unit: number;
  /** Resolved outcome text once chosen. */
  result?: string;
}

export interface Note {
  id: number;
  t: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'alert' | 'event';
  node?: number;
  /** Ask the client to pause (when auto-pause is on). */
  pause?: boolean;
  /**
   * This line tallies the player's ships lost at one place (`node`, -1 in flight): how many of each
   * type, who destroyed the last of them (a faction id, -1 unknown), and when the last one fell. Ships
   * lost there soon after are added to the same line.
   */
  loss?: { node: number; counts: Record<string, number>; by: number; at: number };
}

export type Fx =
  | { k: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string; w: number; node: number }
  | { k: 'shot'; x: number; y: number; color: string; node: number; kind: ProjKind }
  | { k: 'hit'; x: number; y: number; shield: boolean; r: number; ang: number; node: number; color: string }
  | { k: 'boom'; x: number; y: number; size: number; color: string; node: number }
  | { k: 'jumpOut'; x: number; y: number; a: number; node: number; color: string }
  | { k: 'jumpIn'; x: number; y: number; a: number; node: number; color: string }
  | { k: 'capture'; node: number; color: string }
  | { k: 'ring'; x: number; y: number; r: number; color: string; node: number }
  /** Ages: a unit is upgraded to its house's new age. */
  | { k: 'upgrade'; x: number; y: number; r: number; color: string; node: number }
  /** Ages: the change of a new age spreads from a Hearth: a ring that grows to `r` in `dur` seconds. */
  | { k: 'wave'; x: number; y: number; r: number; dur: number; color: string; node: number }
  | { k: 'text'; x: number; y: number; text: string; color: string; node: number }
  | { k: 'ability'; x: number; y: number; r: number; color: string; node: number; id: string };

export interface GameConfig {
  seed: number;
  size: MapSize;
  difficulty: Difficulty;
  heir: string;
  perks: Record<string, number>;
  unlockLegendary: boolean;
  unlockPacts: boolean;
  autoplay?: boolean;
  daily?: boolean;
  /** Guided first run (the First Night). */
  tutorial?: boolean;
  forcedVictories?: VictoryId[];
  aiHeirs?: string[];
  /**
   * An Ages run: every house begins in the Stone Age on one cradle world (`stage: 'cradle'`), and the
   * run goes on among the stars once the player's Ark has left it (`stage: 'stars'`).
   */
  mode?: 'ages';
  stage?: 'cradle' | 'stars';
  /** Ages, among the stars: how many houses there are (those that left the cradle alive), whatever the sector's size. */
  houses?: number;
  /** Ages, among the stars: what the cradle left behind (`arrival`: the game time at which the player arrives). */
  ages?: { cradleTime: number; lands: number; arrival: number };
}

export interface Raid {
  id: number;
  target: number;
  victim: number;
  units: number[];
  phase: 'travel' | 'loot' | 'return';
  lootT: number;
  since: number;
}

export interface PirateState {
  base: number;
  stronghold: number;
  nextRaid: number;
  raidCount: number;
  alive: boolean;
  raids: Raid[];
  marked: number;
}

export interface CrisisState {
  node: number;
  heart: number;
  awakenAt: number;
  awake: boolean;
  dead: boolean;
  nextWave: number;
  waves: number;
  warned: boolean;
  /** The void barrier around the Rift Heart has fallen (said once). */
  barrierDown?: boolean;
}

export interface Outcome {
  winner: number;
  victory: VictoryId | 'defeat';
  time: number;
  playerWon: boolean;
  reason: string;
}
