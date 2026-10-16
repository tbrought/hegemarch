export const TICK = 0.05;
/** Starlane travel speed (world units per second). */
export const PHASE_SPEED = 480;
/** Seconds a ship spools its drive before jumping onto a starlane. */
export const JUMP_CHARGE = 3.5;
/**
 * An anti-warp field: seconds longer an enemy ship takes to jump away from a Bastion, a Hearth, or a
 * world with a Starbase.
 */
export const HOLD_FIELD = 6;
/**
 * What a ship is worth in a fight (`Game.unitPower`, the fleet strength of the results' graphs): its
 * type's power, times its health (a ship with no hull or shields left still counts `POWER_WRECK`),
 * times one plus `POWER_BOON` of its house's damage and hull bonuses, times `LEVEL_STEP` more for
 * every level above the first. The results spell these out, so they are named here.
 */
export const POWER_WRECK = 0.35;
export const POWER_BOON = 0.5;
/** What each level above the first adds to a ship that has levels (an Ark, a Dreadnought). */
export const LEVEL_STEP = 0.08;
/**
 * A Bastion's field reaches every place one jump from it (`Game.fieldReaches`), and it protects the
 * worlds of its house among them: they take this much less damage while it stands, by the Bastion's
 * level (index 1 to 3). The reach is the same at every level; a level makes the Bastion stronger, not
 * wider. It is what a Bastion is built for: the Hearth next to it is slow to crack until the Bastion is
 * taken, so "ignore every world and go for the Hearth" has an answer, and the answer takes nothing from
 * a fleet that flies where it likes. (Protection does not add up: of two Bastions next to a world the
 * stronger counts; but both must fall before it is gone.)
 */
export const FIELD_GUARD = [0, 0.2, 0.3, 0.4];
/** A ship that was hit this many seconds ago or less is under fire... */
export const UNDER_FIRE = 2;
/** ...and its drive spools at this share of its speed: running from a fight costs time. */
export const FIRE_SPOOL = 0.5;
export const RELIC_CLAIM_TIME = 45;
export const DERELICT_CLAIM_TIME = 15;
export const QUEUE_MAX = 5;
export const SAVE_VERSION = 4;

export const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Hard', 'Brutal'];
/** AI income multiplier per difficulty. */
export const AI_INCOME = [0.75, 1.0, 1.2, 1.4];
/** Embers and Guardians a rival house starts with beyond its house's own, and hull on all its ships, per difficulty (ui/difficulty.ts says them). */
export const AI_START_EMBERS = [0, 0, 100, 200];
export const AI_START_GUARDIANS = [0, 0, 0, 1];
export const AI_HULL = [0, 0, 0, 0.1];
/** A world of the player's below this share of its hull is told to be falling, once a siege (conquest.ts). */
export const WORLD_FALLING = 0.3;
/** Seconds before the AI launches its first attack, per difficulty. */
export const AI_FIRST_ATTACK = [960, 720, 630, 540];
/** Warlord houses rush this early on Hard and Brutal (0 = never rush). */
export const AI_RUSH = [0, 0, 420, 330];
/** Seconds between AI planning passes, per difficulty. */
export const AI_THINK = [3.0, 2.0, 1.5, 1.0];
/** Army strength ratio the AI wants before attacking, per difficulty. */
export const AI_ATTACK_RATIO = [1.8, 1.4, 1.2, 1.0];
/** Pirate raid strength multiplier per difficulty. */
export const PIRATE_MUL = [0.65, 1.0, 1.25, 1.5];
/** Time of the first pirate raid, per difficulty (plus up to a minute). */
export const PIRATE_FIRST_RAID = [720, 600, 540, 480];
/** The Maw opens at this time plus up to three minutes, offset per difficulty. */
export const CRISIS_AWAKEN = 1080;
export const CRISIS_OFFSET = [180, 0, -90, -180];
/** Legacy reward multiplier per difficulty. */
export const LEGACY_MUL = [0.6, 1.0, 1.4, 1.8];
