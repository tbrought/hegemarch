export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  cd: number;
  range: number;
  color: string;
  /** Boss-only abilities are never offered to player or AI capital ships. */
  boss?: boolean;
  /**
   * A House Power (1.27): the mark of one house (`HeirDef.power`). Its Ark casts it when the house orders it
   * (`cmdPower`: D, then D again), never by itself; no other ship ever learns it. `cd` is how long it takes
   * to come back, for the house: an Ark rebuilt does not bring it back sooner.
   */
  power?: boolean;
  /** A power cast at a place the player chooses (Wayfinder): its aim waits for a click on a world. */
  aim?: 'world';
  /**
   * What rises over the ship as it casts, in its house's colour (1.26): its name, or what it did ("{n}" is
   * how many it touched). None for the Hollow's own, which it casts every few seconds.
   */
  says?: string;
  /** What it leaves on the ships it touched for as long as it lasts, drawn on them that long (render/abilityLooks.ts). */
  leaves?: 'aegis' | 'heal' | 'overdrive' | 'rally' | 'snare';
}

/** The words over a ship that cast `def`, having touched `n`. */
export const castWords = (def: AbilityDef, n: number): string | undefined => def.says?.replace('{n}', String(n));

/**
 * Conversion: how much hull an Ark turns in one casting (hull as built, before any bonus), at level 1
 * and for each level above it. 1000 is two Strikers, or a Guardian; a Breaker from level 2. The
 * weakest go over first, so a ship that goes over is patched up to `CONVERT_MEND` of its hull: a house
 * that gained only wrecks gained nothing (as an AI house the Choir turned 32 ships a game, and lost).
 */
export const CONVERT_HULL = 1000;
export const CONVERT_HULL_PER_LEVEL = 150;
export const CONVERT_MEND = 0.5;

/** Seconds into a run when a house's power is first ready: the opening is the opening, for every house. */
export const POWER_FIRST = 90;
/** Call to Arms: the ships each world that builds sends, how many such worlds (the nearest to the Ark), and how long the levy serves. */
export const LEVY_SHIPS = ['striker', 'guardian', 'breaker'] as const;
export const LEVY_WORLDS = 5;
export const LEVY_TIME = 120;
/**
 * Wayfinder: how far a new starlane may reach (about one starlane between two systems; a lane inside a
 * system is a sixth of it), and the room it must keep from any place it passes on the way.
 */
export const WAYFINDER_REACH = 9000;
/** Fate's Wager: seconds the coin is in the air before it lands. */
export const WAGER_TIME = 1.6;

export const ABILITIES: AbilityDef[] = [
  { id: 'aegis', name: 'Aegis Field', desc: 'Nearby allies take [30% less damage] and recharge shields [twice as fast] for 8s.', cd: 28, range: 480, color: '#ffd23f', says: 'SHIELDED {n}', leaves: 'aegis' },
  { id: 'barrage', name: 'Missile Barrage', desc: 'Fires [12 homing missiles] at enemies in range (50 damage each).', cd: 16, range: 720, color: '#ff8a1f', says: 'MISSILE BARRAGE' },
  { id: 'nanite', name: 'Nanite Cloud', desc: 'Repairs nearby allies by [18% of their hull] over 6s.', cd: 24, range: 520, color: '#2fd5a6', says: 'MENDING {n}', leaves: 'heal' },
  { id: 'strikewing', name: 'Strike Wing', desc: 'Launches [6 Fighters] for 25s.', cd: 32, range: 600, color: '#b05cff', says: '{n} FIGHTERS' },
  { id: 'emp', name: 'EMP Burst', desc: 'Drains [900 shields] from enemies in range and [stuns small craft] for 3s.', cd: 26, range: 420, color: '#3fa7ff', says: 'DRAINED {n}' },
  { id: 'conversion', name: 'Conversion', desc: 'The weakest enemy ships in range [join your house]: 1000 hull of them, more as the Ark rises. They are patched up to half their hull and take [no room in your hangar]. Never an Ark, a Dreadnought, a Carrier or the Hollow.', cd: 36, range: 520, color: '#3fa7ff', power: true, says: 'CONVERTED {n}' },
  { id: 'phaselance', name: 'Ember Lance', desc: 'Fires a [900-damage lance] at the biggest enemy in range.', cd: 18, range: 780, color: '#ff8a1f', says: 'EMBER LANCE' },
  { id: 'overdrive', name: 'Overdrive', desc: 'Fires [70% faster] for 8s.', cd: 22, range: 600, color: '#ff6fb5', says: 'OVERDRIVE', leaves: 'overdrive' },
  { id: 'rally', name: 'Rally Cry', desc: 'Allies at this world deal [25% more damage] for 10s.', cd: 30, range: 9999, color: '#ffd23f', says: 'RALLIED {n}', leaves: 'rally' },
  { id: 'snare', name: 'Gravity Snare', desc: 'Every enemy ship at this world is [slowed by 40%] and [cannot jump] for 15s. Held ships are ringed in violet.', cd: 30, range: 9999, color: '#b05cff', says: 'SNARED {n}', leaves: 'snare' },
  { id: 'voidpulse', name: 'Void Pulse', desc: 'Every enemy in range takes [120 damage].', cd: 6, range: 650, color: '#ff6fb5', boss: true },
  { id: 'repairdrones', name: 'Repair Drones', desc: 'Restores [25% of its own hull] over 6s.', cd: 30, range: 0, color: '#2fd5a6', says: 'REPAIR DRONES', leaves: 'heal' },
  // The House Powers (1.27), one a house, each in its house's colour: cast by the house's order, never by itself.
  { id: 'dawn', name: 'Dawn', desc: 'Every dark world [one starlane from the Ark] is kindled at once, in your colour. Not one that a guard or a warship holds.', cd: 240, range: 9999, color: '#ffd23f', power: true, says: 'DAWN · {n} KINDLED' },
  { id: 'callarms', name: 'Call to Arms', desc: `The ${LEVY_WORLDS} Forges nearest the Ark (your Hearth is one) each send it [a Striker, a Guardian and a Breaker] at once. They serve for [${LEVY_TIME / 60} minutes] and take no room in your hangar.`, cd: 240, range: 9999, color: '#e0402f', power: true, says: 'CALL TO ARMS · {n}' },
  { id: 'wayfinder', name: 'Wayfinder', desc: 'Cuts [a new starlane] from the Ark\'s world to a world within reach (about one starlane between systems). It stays for the rest of the run, and [any house] can use it.', cd: 300, range: WAYFINDER_REACH, color: '#2fd5a6', power: true, aim: 'world', says: 'WAYFINDER' },
  { id: 'mindtheft', name: 'Mind Theft', desc: 'The Ark reads a rival Ark at its world and learns [one of its Boons], the rarest it can, for the rest of the run. The rival keeps it too.', cd: 300, range: 9999, color: '#b05cff', power: true, says: 'MIND THEFT' },
  { id: 'wager', name: 'Fate\'s Wager', desc: 'A coin is thrown over the Ark\'s world. Heads: [every enemy warship there turns to ash] (never an Ark, a Dreadnought or the Hollow). Tails: [your Ark burns].', cd: 180, range: 9999, color: '#ff8a1f', power: true, says: 'FATE\'S WAGER' },
];

/** What a ship that rises a level may learn (and a Dreadnought is built with): none of a house's powers. */
export const LEARNABLE_ABILITIES = ABILITIES.filter((a) => !a.boss && !a.power);
/** The House Powers. */
export const POWERS = ABILITIES.filter((a) => a.power);

export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a])) as Record<string, AbilityDef>;
