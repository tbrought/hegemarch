export const TICK = 0.05;
/** Starlane travel speed (world units per second). */
export const PHASE_SPEED = 480;
/** Seconds a ship spools its drive before jumping onto a starlane. */
export const JUMP_CHARGE = 3.5;
export const RELIC_CLAIM_TIME = 45;
export const DERELICT_CLAIM_TIME = 15;
export const QUEUE_MAX = 5;
export const SAVE_VERSION = 4;

export const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Hard', 'Brutal'];
/** AI income multiplier per difficulty. */
export const AI_INCOME = [0.75, 1.0, 1.2, 1.4];
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
