import type { ArmorClass, DmgType, UnitDef, UnitType, WeaponDef } from '../types';

/**
 * Damage multiplier by weapon type vs armor class.
 * The core triangle: rapid (Strikers) beats heavy (Breakers), siege (Breakers) beats medium (Guardians),
 * flak (Guardians) beats light (Strikers).
 */
export const DMG_TABLE: Record<DmgType, Record<ArmorClass, number>> = {
  rapid: { strike: 1.1, light: 1.0, medium: 0.75, heavy: 1.35, structure: 0.5, planet: 0.3 },
  flak: { strike: 1.2, light: 1.4, medium: 0.9, heavy: 0.75, structure: 0.5, planet: 0.25 },
  siege: { strike: 0.1, light: 0.55, medium: 1.4, heavy: 0.9, structure: 1.5, planet: 2.0 },
  lance: { strike: 0.1, light: 0.4, medium: 1.1, heavy: 1.7, structure: 1.4, planet: 0.5 },
  fighter: { strike: 0.8, light: 0.8, medium: 1.2, heavy: 1.3, structure: 1.0, planet: 0.4 },
  energy: { strike: 0.6, light: 1.0, medium: 1.0, heavy: 1.0, structure: 0.9, planet: 0.5 },
};

const W = {
  rapid: { name: 'Rapid Cannons', type: 'rapid', damage: 8, cooldown: 0.6, range: 300, proj: 'bolt', speed: 820 },
  flak: { name: 'Flak Battery', type: 'flak', damage: 6, cooldown: 0.9, range: 340, proj: 'bolt', speed: 900, count: 3 },
  shell: { name: 'Breaker Shells', type: 'siege', damage: 70, cooldown: 3.4, range: 560, proj: 'shell', speed: 380 },
  lance: { name: 'Ember Lance', type: 'lance', damage: 85, cooldown: 3.0, range: 650, proj: 'lance', speed: 2000 },
  pd: { name: 'Point Defense', type: 'flak', damage: 5, cooldown: 0.5, range: 260, proj: 'bolt', speed: 1000 },
  strike: { name: 'Strike Guns', type: 'fighter', damage: 5, cooldown: 0.5, range: 110, proj: 'bolt', speed: 800 },
  beam: { name: 'Heavy Beam', type: 'energy', damage: 38, cooldown: 1.0, range: 520, proj: 'beam' },
  missiles: { name: 'Missile Pods', type: 'rapid', damage: 12, cooldown: 3.0, range: 620, proj: 'missile', speed: 360, count: 4 },
  pulse: { name: 'Pulse Gun', type: 'energy', damage: 4, cooldown: 1.0, range: 260, proj: 'beam' },
  swarm: { name: 'Spore Cannons', type: 'rapid', damage: 10, cooldown: 0.5, range: 260, proj: 'bolt', speed: 800 },
} satisfies Record<string, WeaponDef>;

const CORE_PREFS = {
  striker: ['heavy', 'light', 'strike', 'medium', 'structure'] as ArmorClass[],
  guardian: ['light', 'strike', 'medium', 'heavy', 'structure'] as ArmorClass[],
  breaker: ['medium', 'structure', 'heavy', 'light'] as ArmorClass[],
  capital: ['heavy', 'medium', 'structure', 'light', 'strike'] as ArmorClass[],
  all: ['heavy', 'medium', 'light', 'strike', 'structure'] as ArmorClass[],
};

const defs: UnitDef[] = [
  // ---------------- Core ships ----------------
  {
    id: 'striker', name: 'Striker', role: 'combat', armorClass: 'light',
    hull: 380, shield: 120, armor: 0, shieldRegen: 6, speed: 120, turn: 3.2, radius: 11,
    cost: 70, buildTime: 12, hangar: 1, weapons: [W.rapid], power: 1.6, buildable: true, xpValue: 15,
    prefers: CORE_PREFS.striker, short: 'Fast and cheap. Beats Breakers.',
    desc: 'A quick gunship with rapid cannons. Hunts down Breakers and other big, slow hulls, but Guardians shred it.',
  },
  {
    id: 'guardian', name: 'Guardian', role: 'combat', armorClass: 'medium',
    hull: 900, shield: 360, armor: 0.1, shieldRegen: 14, speed: 82, turn: 2.2, radius: 13,
    cost: 125, buildTime: 18, hangar: 2, weapons: [W.flak], power: 3.3, buildable: true, xpValue: 25,
    prefers: CORE_PREFS.guardian, short: 'Sturdy escort. Beats Strikers.',
    desc: 'A sturdy escort whose flak bursts tear through Strikers and fighters. Breakers outgun it.',
  },
  {
    id: 'breaker', name: 'Breaker', role: 'siege', armorClass: 'heavy',
    hull: 1100, shield: 260, armor: 0.15, shieldRegen: 9, speed: 64, turn: 1.8, radius: 15,
    cost: 160, buildTime: 22, hangar: 2, weapons: [W.shell], power: 3.6, buildable: true, xpValue: 28,
    prefers: CORE_PREFS.breaker, planetWeight: 0.8, short: 'Siege ship. Beats Guardians and worlds.',
    desc: 'Lobs heavy shells from long range. Cracks Guardians and is the only good way to take a world, but Strikers run it down.',
  },
  {
    id: 'scout', name: 'Scout', role: 'scout', armorClass: 'light',
    hull: 220, shield: 80, armor: 0, shieldRegen: 4, speed: 150, turn: 3.5, radius: 8,
    cost: 40, buildTime: 9, hangar: 1, weapons: [W.pulse], power: 0.4, buildable: true, xpValue: 10,
    prefers: CORE_PREFS.all, planetWeight: 0, short: 'Charts the dark when you tell it to EXPLORE.',
    desc: 'A fast, fragile explorer. Select it and press EXPLORE, and it charts the dark world after world by itself.',
  },
  {
    id: 'seed', name: 'Seed Ship', role: 'seed', armorClass: 'light',
    hull: 500, shield: 200, armor: 0, shieldRegen: 5, speed: 75, turn: 2, radius: 9,
    cost: 0, buildTime: 10, hangar: 0, weapons: [], power: 0, buildable: false, xpValue: 12,
    prefers: [], short: 'Kindles a dark world.',
    desc: 'Carries a spark of your Hearth to a dark world and kindles it.',
  },
  // ---------------- Blueprint ships ----------------
  {
    id: 'carrier', name: 'Carrier', role: 'carrier', armorClass: 'heavy',
    hull: 2000, shield: 700, armor: 0.2, shieldRegen: 22, speed: 58, turn: 1.2, radius: 18,
    cost: 320, buildTime: 32, hangar: 4, weapons: [W.pd], fighters: 6, power: 8, buildable: true, blueprint: 'bpCarrier', xpValue: 60,
    prefers: ['strike', 'light', 'medium', 'heavy'], short: 'Launches fighters. Lost fighters are rebuilt.',
    desc: 'Launches a wing of fighters that hit heavy and medium hulls hard. Lost fighters are rebuilt in the hangar.',
  },
  {
    id: 'lancer', name: 'Lancer', role: 'combat', armorClass: 'medium',
    hull: 750, shield: 250, armor: 0.05, shieldRegen: 10, speed: 72, turn: 2, radius: 14,
    cost: 180, buildTime: 22, hangar: 2, weapons: [W.lance], power: 3.4, buildable: true, blueprint: 'bpLancer', xpValue: 28,
    prefers: ['heavy', 'structure', 'medium', 'light'], planetWeight: 0.3, short: 'Long-range lance. Kills big ships.',
    desc: 'Fires an ember lance from very long range. Devastating against heavy hulls and structures, poor against small craft.',
  },
  {
    id: 'dreadnought', name: 'Dreadnought', role: 'capital', armorClass: 'heavy',
    hull: 6000, shield: 2000, armor: 0.25, shieldRegen: 40, speed: 46, turn: 0.8, radius: 24,
    cost: 850, buildTime: 60, hangar: 6, weapons: [W.beam, W.missiles], power: 16.7, buildable: true, blueprint: 'bpDread', xpValue: 200,
    prefers: CORE_PREFS.capital, planetWeight: 0.3, short: 'Capital ship. Levels up. Max 2.',
    desc: 'A capital warship that gains experience, levels up and learns abilities. You may field two.',
  },
  {
    id: 'starbase', name: 'Starbase', role: 'defense', armorClass: 'structure',
    hull: 12000, shield: 4000, armor: 0.4, shieldRegen: 80, speed: 0, turn: 0.5, radius: 30,
    cost: 700, buildTime: 50, hangar: 0, weapons: [{ ...W.beam, damage: 50, range: 560 }, { ...W.flak, damage: 8, cooldown: 0.8, range: 400 }],
    power: 28, buildable: false, blueprint: 'bpStarbase', isStatic: true, xpValue: 250,
    prefers: CORE_PREFS.all, short: 'Orbital fortress. One per world.',
    desc: 'A huge orbital fortress that guards one world and repairs your ships there.',
  },
  // ---------------- Special ----------------
  {
    id: 'ark', name: 'Ark', role: 'capital', armorClass: 'heavy',
    hull: 8000, shield: 2800, armor: 0.3, shieldRegen: 60, speed: 52, turn: 0.9, radius: 26,
    cost: 600, buildTime: 50, hangar: 0, weapons: [W.beam, W.missiles], power: 17.5, buildable: false, xpValue: 300,
    prefers: CORE_PREFS.capital, planetWeight: 0.3, short: 'Your house’s great ship.',
    desc: 'Your house’s great ship. It levels up through battle and learns abilities. If it falls, rebuild it at your Hearth.',
  },
  {
    id: 'fighter', name: 'Fighter', role: 'fighter', armorClass: 'strike',
    hull: 120, shield: 0, armor: 0, shieldRegen: 0, speed: 200, turn: 5, radius: 4,
    cost: 0, buildTime: 0, hangar: 0, weapons: [W.strike], power: 0.3, buildable: false, xpValue: 3,
    prefers: ['heavy', 'medium', 'structure', 'light', 'strike'], short: '', desc: 'A carrier-launched fighter.',
  },
  {
    id: 'gate', name: 'Starfire Gate', role: 'defense', armorClass: 'structure',
    hull: 14000, shield: 5000, armor: 0.35, shieldRegen: 40, speed: 0, turn: 0.2, radius: 40,
    cost: 3000, buildTime: 60, hangar: 0, weapons: [], power: 0, buildable: false, isStatic: true, xpValue: 400,
    prefers: [], short: '', desc: 'A gate of living starfire. Once fully charged it carries its builders beyond the dark.',
  },
  // ---------------- Corsairs ----------------
  {
    id: 'raider', name: 'Corsair Raider', role: 'combat', armorClass: 'light',
    hull: 420, shield: 120, armor: 0, shieldRegen: 6, speed: 120, turn: 3, radius: 11,
    cost: 60, buildTime: 0, hangar: 0, weapons: [{ ...W.rapid, damage: 9 }], power: 1.8, buildable: false, xpValue: 18,
    prefers: ['light', 'strike', 'heavy', 'medium', 'structure'], short: '', desc: 'A Corsair raider.',
  },
  {
    id: 'marauder', name: 'Corsair Marauder', role: 'combat', armorClass: 'medium',
    hull: 1200, shield: 400, armor: 0.1, shieldRegen: 12, speed: 80, turn: 2, radius: 14,
    cost: 130, buildTime: 0, hangar: 0, weapons: [{ ...W.beam, damage: 24, cooldown: 1.1, range: 420 }], power: 3.9, buildable: false, xpValue: 30,
    prefers: ['medium', 'light', 'heavy', 'structure'], short: '', desc: 'A heavily armed Corsair warship.',
  },
  {
    id: 'stronghold', name: 'Corsair Stronghold', role: 'boss', armorClass: 'structure',
    hull: 30000, shield: 8000, armor: 0.4, shieldRegen: 60, speed: 0, turn: 0.4, radius: 46,
    cost: 0, buildTime: 0, hangar: 0, isStatic: true,
    weapons: [{ ...W.rapid, damage: 20, cooldown: 0.5, range: 540 }, { ...W.beam, damage: 60, cooldown: 1.5, range: 650 }],
    power: 30, buildable: false, xpValue: 600, prefers: CORE_PREFS.all, short: '',
    desc: 'The fortified heart of the Blackstar Corsairs. Destroy it to end the raids.',
  },
  // ---------------- Ancient guardians ----------------
  {
    id: 'militia', name: 'Militia Gunship', role: 'combat', armorClass: 'medium',
    hull: 900, shield: 300, armor: 0.1, shieldRegen: 8, speed: 0, turn: 2, radius: 12, isStatic: true,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.rapid, damage: 10, range: 360 }], power: 2.9, buildable: false, xpValue: 20,
    prefers: ['light', 'medium', 'heavy', 'strike'], short: '', desc: 'The old militia of a dark world.',
  },
  {
    id: 'sentinel', name: 'Ancient Sentinel', role: 'combat', armorClass: 'medium',
    hull: 1600, shield: 700, armor: 0.15, shieldRegen: 15, speed: 0, turn: 1.5, radius: 15, isStatic: true,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.beam, damage: 26, cooldown: 1.1, range: 470 }], power: 4.9, buildable: false, xpValue: 40,
    prefers: ['medium', 'heavy', 'light', 'strike'], short: '', desc: 'A war machine from before the dark, still obeying its last command.',
  },
  {
    id: 'monolith', name: 'Warden Monolith', role: 'boss', armorClass: 'structure',
    hull: 16000, shield: 6000, armor: 0.3, shieldRegen: 30, speed: 0, turn: 0.5, radius: 30, isStatic: true,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.lance, damage: 95, cooldown: 2.6, range: 620 }, W.pd],
    power: 22, buildable: false, xpValue: 300, prefers: ['heavy', 'medium', 'light', 'strike'], short: '',
    desc: 'The warden of a relic vault.',
  },
  // ---------------- The Hollow ----------------
  {
    id: 'drone', name: 'Hollow Drone', role: 'combat', armorClass: 'light',
    hull: 520, shield: 0, armor: 0.05, shieldRegen: 0, speed: 125, turn: 3.5, radius: 9,
    cost: 0, buildTime: 0, hangar: 0, weapons: [W.swarm], power: 2.1, buildable: false, xpValue: 15,
    prefers: ['light', 'strike', 'medium', 'heavy', 'structure'], short: '', desc: 'A ravenous Hollow drone.',
  },
  {
    id: 'reaper', name: 'Hollow Reaper', role: 'combat', armorClass: 'heavy',
    hull: 2600, shield: 0, armor: 0.2, shieldRegen: 0, speed: 64, turn: 1.4, radius: 16,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.beam, damage: 34, range: 460 }], power: 6.6, buildable: false, xpValue: 60,
    prefers: ['medium', 'heavy', 'light', 'structure'], planetWeight: 0.45, short: '', desc: 'A Hollow warform that devours worlds.',
  },
  {
    id: 'leviathan', name: 'Hollow Leviathan', role: 'capital', armorClass: 'heavy',
    hull: 11000, shield: 0, armor: 0.35, shieldRegen: 0, speed: 40, turn: 0.6, radius: 30,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.lance, damage: 120 }, { ...W.shell, damage: 70 }],
    power: 20, buildable: false, xpValue: 250, prefers: ['heavy', 'structure', 'medium', 'light'], planetWeight: 0.6, short: '',
    desc: 'A colossal Hollow beast.',
  },
  {
    id: 'heart', name: 'The Rift Heart', role: 'boss', armorClass: 'structure',
    hull: 160000, shield: 0, armor: 0.4, shieldRegen: 0, speed: 0, turn: 0.2, radius: 70, isStatic: true,
    cost: 0, buildTime: 0, hangar: 0, weapons: [{ ...W.beam, damage: 80, range: 720 }, { ...W.swarm, damage: 22, cooldown: 0.3, range: 600 }],
    power: 120, buildable: false, xpValue: 1500, prefers: CORE_PREFS.all, short: '',
    desc: 'The pulsing core of the Hollow. Destroy it to purge the void.',
  },
];

export const UNITS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<UnitType, UnitDef>;

/** Ships a Forge can build, in display order (blueprint ships only once drafted). */
export const BUILD_ORDER: UnitType[] = ['striker', 'guardian', 'breaker', 'lancer', 'carrier', 'dreadnought', 'scout'];
export const CORE_SHIPS: UnitType[] = ['striker', 'guardian', 'breaker'];

export const DREADNOUGHT_CAP = 2;

/** XP thresholds for capital ship levels 1..8. */
export const LEVEL_XP = [0, 200, 550, 1100, 1850, 2850, 4150, 5800];
export const MAX_LEVEL = LEVEL_XP.length;
/** Levels at which a capital ship learns a new ability. */
export const ABILITY_LEVELS = [3, 5, 7];

/** Warships (things that fight and can be ordered around). */
export function isWarship(t: UnitType): boolean {
  const d = UNITS[t];
  return (d.role === 'combat' || d.role === 'siege' || d.role === 'carrier' || d.role === 'capital') && !d.isStatic;
}
