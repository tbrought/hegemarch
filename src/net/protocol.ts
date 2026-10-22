/**
 * A game played together (1.28, docs/MULTIPLAYER.md): what the screens and their room say to one another.
 *
 * Lockstep with a clock that the room keeps. Every screen runs the whole game; only orders travel. The room
 * lets the game run to a tick (`to`), a turn's worth further every tenth of a second, and stamps each order
 * it is sent with the tick it is to be carried out after: the tick the game may run to when the order comes
 * in. No screen has run past that tick yet, so every screen carries the order out at the same moment of the
 * same game. This file is shared by the game (net/Lockstep.ts), the room (net/RoomCore.ts) and its hosts (the
 * Worker's Durable Object, worker/src/room.ts, and the dev server's, scripts/lib/roomhost.ts): plain data and
 * plain functions, nothing of the browser and nothing of the game's own code.
 */

import type { Difficulty, GameConfig, MapSize } from '../game/types';

/** The version of what is said here: a room and a screen of different versions do not play together. */
export const NET_VERSION = 1;

/** Milliseconds between two turns of the room's clock. */
export const TURN_MS = 100;
/** Ticks a turn lets the game run at each speed (the game's tick is a twentieth of a second). */
export const ticksPerTurn = (speed: number) => Math.max(1, Math.round(speed * 2));
/** The speeds a game together may be played at. */
export const NET_SPEEDS = [1, 2, 3];

/** How many seats each size of sector has (its houses: mapgen.ts EMPIRES_BY_SIZE). */
export const SEATS_BY_SIZE: Record<MapSize, number> = { small: 3, medium: 4, large: 6 };
/** At most this many players in a room (the rest of its seats are the AI's). */
export const MAX_PLAYERS = 4;
/** A player who has lost their connection for this long has their house led by the AI (they can come back). */
export const AWAY_MS = 60_000;
/** Versus: pauses each player has in a game, and how long one lasts before anyone may resume. */
export const VERSUS_PAUSES = 3;
export const PAUSE_MS = 60_000;
/** A resume is counted in (3, 2, 1) so that no one is caught looking away. */
export const COUNT_IN_MS = 3000;
/** The room waits for a screen that has fallen this many ticks behind (and is not hidden): the game slows to it. */
export const MAX_LAG_TICKS = 60;
/** A screen reports where it is (and every second of game time, what its game is: a hash) at least this often. */
export const REPORT_MS = 1000;
/** Ticks between two hashes of the game (every second of game time). */
export const HASH_EVERY = 20;

/**
 * The orders a house can give (Game.ts `ORDER_NAMES`, kept equal by a test): the room passes on nothing else.
 * Kept here so that the room does not carry the game's code.
 */
export const NET_ORDERS = [
  'cmdChooseCard', 'cmdReroll', 'cmdSkipDraft', 'cmdGoal', 'cmdChooseAbility', 'cmdResolvePrompt', 'dismissPrompt', 'ensureOffer',
  'cmdMove', 'cmdAttack', 'cmdKindle', 'cmdSendSeed', 'cmdStop', 'cmdRetreat', 'cmdExplore', 'cmdSetRally', 'cmdArm', 'cmdQueueShip',
  'cmdUpgrade', 'cmdSetRole', 'cmdQueueStarbase', 'cmdQueueGate', 'cmdQueueStarfall', 'cmdBuyBay', 'cmdRebuildArk', 'cmdCancel',
  'cmdAdvance', 'cmdCancelAdvance', 'cmdPower', 'cmdGift', 'cmdSurrender',
] as const;

/**
 * What each order's arguments are (in order): `n` a number, `s` a short text, `a` a list of whole numbers, `b`
 * a yes or no, `x` nothing (a function the game cannot be sent: a way round danger); `?` that it may be left
 * out (null). The room takes an order only in this shape, so a game is never given one it cannot read.
 */
export const ORDER_ARGS: Record<(typeof NET_ORDERS)[number], string[]> = {
  cmdChooseCard: ['n', 's'], cmdReroll: ['n'], cmdSkipDraft: ['n'], cmdGoal: ['n', 's'], cmdChooseAbility: ['n', 'n', 's'],
  cmdResolvePrompt: ['n', 'n'], dismissPrompt: ['n'], ensureOffer: [],
  cmdMove: ['n', 'a', 'n', 'n?', 'n?', 'x?', 'b?', 'b?'], cmdAttack: ['n', 'a', 'n'], cmdKindle: ['n', 'n'], cmdSendSeed: ['n', 'n', 'n'],
  cmdStop: ['n', 'a'], cmdRetreat: ['n', 'a'], cmdExplore: ['n', 'a'], cmdSetRally: ['n', 'n', 'n'], cmdArm: ['n', 'n'], cmdQueueShip: ['n', 'n', 's'],
  cmdUpgrade: ['n', 'n'], cmdSetRole: ['n', 'n', 's'], cmdQueueStarbase: ['n', 'n'], cmdQueueGate: ['n', 'n'], cmdQueueStarfall: ['n'],
  cmdBuyBay: ['n'], cmdRebuildArk: ['n'], cmdCancel: ['n', 'n', 's', 'n'], cmdAdvance: ['n'], cmdCancelAdvance: ['n'], cmdPower: ['n', 'n?'],
  cmdGift: ['n', 'n', 'n'], cmdSurrender: ['n'],
};

/** Are these the arguments of this order, in its shape (`ORDER_ARGS`)? */
export function orderShape(name: string, args: unknown[]): boolean {
  const shape = (ORDER_ARGS as Record<string, string[]>)[name];
  if (!shape || args.length > shape.length) return false;
  return shape.every((k, i) => {
    const a = args[i];
    if (a === null || a === undefined) return k.endsWith('?') || k === 'x';
    switch (k[0]) {
      case 'n':
        return typeof a === 'number' && Number.isFinite(a);
      case 's':
        return typeof a === 'string' && a.length <= 40;
      case 'a':
        return Array.isArray(a) && a.length <= 2000 && a.every((x) => typeof x === 'number' && Number.isInteger(x));
      case 'b':
        return typeof a === 'boolean';
      default:
        return false;
    }
  });
}

/** The room's own word in the stream of orders: a house handed to the AI (`[house, 1]`) or back to its player (`[house, 0]`). */
export const HAND_OVER = '$ai';

/** An order as the room sends it: the tick it is carried out after, the seat that gave it, its name, its arguments. */
export type Stamped = [tick: number, seat: number, name: string, args: unknown[]];

/** What a player brings to a room from their profile: their name, their houses, and (for co-op) their Hall. */
export interface Bringing {
  name: string;
  heirs: string[];
  perks: Record<string, number>;
  legendary: boolean;
  pacts: boolean;
}

/** A seat in the lobby. */
export interface LobbySeat {
  /** Open for a player to take, a player's, the AI's, or closed (no house there: fewer houses in the sector). */
  kind: 'open' | 'player' | 'ai' | 'closed';
  /** The house ('' while a player has not chosen yet). */
  heir: string;
  team: number;
  /** A player's name. */
  name?: string;
  ready?: boolean;
  /** Versus, a private room: extra Embers (0.1, 0.2, 0.3), agreed openly. */
  handicap?: number;
  /** A player is connected. */
  online?: boolean;
  /** The AI leads this player's house (they have left, or been away too long). */
  ai?: boolean;
}

export interface RoomOptions {
  together: 'coop' | 'versus';
  size: MapSize;
  /** The AI houses' difficulty. */
  difficulty: Difficulty;
  speed: number;
  /** Versus: every player's Boons dealt from the same dice. */
  sameLuck: boolean;
  /** Versus: minutes, then the team furthest toward a Destiny wins (0: no limit). */
  timeLimit: number;
  /** Co-op: the AI houses are allies of one another. */
  unite: boolean;
}

export const DEFAULT_OPTIONS: RoomOptions = { together: 'coop', size: 'medium', difficulty: 1, speed: 1, sameLuck: true, timeLimit: 0, unite: false };

/** The six houses (data/heirs.ts, kept equal by a test): the room deals the AI's from them. */
export const HOUSE_IDS = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];

export interface LobbyState {
  code: string;
  phase: 'lobby' | 'playing' | 'over';
  options: RoomOptions;
  seats: LobbySeat[];
  /** The seat of the screen this is sent to (-1: none yet), and the room's owner's. */
  you: number;
  owner: number;
}

/** What a screen says to its room. */
export type ClientMsg =
  | { t: 'hello'; version: number; build: string; bring: Bringing; token?: string }
  | { t: 'sit'; seat: number }
  | { t: 'house'; heir: string }
  | { t: 'team'; team: number }
  | { t: 'ready'; on: boolean }
  | { t: 'options'; options: Partial<RoomOptions> }
  | { t: 'seat'; seat: number; kind?: 'open' | 'ai' | 'closed'; heir?: string; team?: number; handicap?: number }
  | { t: 'start' }
  | { t: 'order'; name: string; args: unknown[] }
  | { t: 'report'; tick: number; hash?: number; hidden: boolean; over?: boolean; rebuilt?: boolean }
  | { t: 'pause'; on: boolean }
  | { t: 'speed'; speed: number }
  | { t: 'chat'; text: string; team: boolean }
  | { t: 'ping'; x: number; y: number }
  | { t: 'again' }
  | { t: 'leave' };

/** A player's state, as every screen in a game is told it. */
export interface PeerState {
  seat: number;
  name: string;
  online: boolean;
  ai: boolean;
  /** How far behind the room's clock their game is, in ticks. */
  lag: number;
  hidden: boolean;
  /** Versus: pauses left. */
  pauses: number;
}

/** What a room says to a screen. */
export type RoomMsg =
  | { t: 'welcome'; token: string }
  | { t: 'lobby'; state: LobbyState }
  | { t: 'start'; config: GameConfig; you: number; log: Stamped[]; to: number; speed: number; paused: PauseState | null; rebuild?: boolean }
  | { t: 'turn'; to: number; o: Stamped[] }
  | { t: 'pause'; state: PauseState | null }
  | { t: 'speed'; speed: number }
  | { t: 'peers'; peers: PeerState[] }
  | { t: 'chat'; from: number; text: string; team: boolean }
  | { t: 'ping'; from: number; x: number; y: number }
  | { t: 'resync'; log: Stamped[]; to: number; why: string }
  | { t: 'ended'; why: string }
  | { t: 'error'; text: string };

/** The room's pause: who called it, when (ms on the room's clock, and as a game tick), and when a count-in ends it. */
export interface PauseState {
  by: number;
  since: number;
  /** Set: the game goes on at this moment of the room's clock (the count-in). */
  resumeAt?: number;
  /** Versus: from this moment anyone may resume. */
  openAt?: number;
}

/** An argument an order may have: a number, a string, a yes or no, nothing, or a list of whole numbers. */
export function plainArg(a: unknown): boolean {
  if (a === null || typeof a === 'boolean') return true;
  if (typeof a === 'string') return a.length <= 40;
  if (typeof a === 'number') return Number.isFinite(a);
  return Array.isArray(a) && a.length <= 2000 && a.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** An argument as it is sent: nothing and a function as null (as a Daily keeps its orders, replay.ts). */
export const keepArg = (a: unknown): unknown => (a === undefined || typeof a === 'function' ? null : Array.isArray(a) ? [...a] : a);
/** An argument as it is carried out: null as nothing. */
export const keptArg = (a: unknown): unknown => (a === null ? undefined : a);

/** A room's code: five letters and figures that cannot be taken for one another (no 0 and O, no 1 and I). */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;
export function isCode(s: string): boolean {
  return s.length === CODE_LEN && [...s].every((c) => CODE_CHARS.includes(c));
}
export function makeCode(random: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return s;
}

/** A player's name for a room: three to five letters, A to Z (as the board takes them). */
export function cleanName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
}
