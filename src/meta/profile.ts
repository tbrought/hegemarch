import type { Records } from './records';
import type { SaveData } from '../game/Game';
import type { Difficulty, MapSize } from '../game/types';
import { heirIdNow } from '../game/data/heirs';
import { KEY_IDS } from '../game/data/boonKeys';

export interface RunRecord {
  date: string;
  heir: string;
  size: MapSize;
  difficulty: Difficulty;
  won: boolean;
  victory: string;
  time: number;
  legacy: number;
  seed: number;
  daily: boolean;
}

export interface Settings {
  /** Sound off: nothing is heard, whatever the volumes below say (the sound button on every menu screen). */
  muted: boolean;
  master: number;
  sfx: number;
  music: number;
  edgePan: boolean;
  /** One-line cards that explain things the first time they happen. */
  tips: boolean;
  /** Pause automatically when the game needs a decision. */
  autoPause: boolean;
  /** Scanline filter over the screen. */
  crt: boolean;
  /** How big the game's pixels are. */
  pixelSize: 'small' | 'auto' | 'large';
  /** Explain game terms (Kindle, Hangar…) in boxes beside tooltips. */
  explainTerms: boolean;
}

export interface Profile {
  v: 1;
  legacy: number;
  totalLegacy: number;
  heirs: string[];
  perks: Record<string, number>;
  unlockPacts: boolean;
  unlockLegendary: boolean;
  /** Highest difficulty index the player may select. */
  maxDifficulty: number;
  runs: number;
  wins: number;
  bestTime: number | null;
  history: RunRecord[];
  settings: Settings;
  /** Has finished (or skipped) the guided First Night. */
  tutorialDone: boolean;
  /** "Firsts" tip cards already shown. */
  seenTips: string[];
  lastDaily: string | null;
  winsByHeir: Record<string, number>;
  /** Has opened the setup of an Ages run (until then the title screen marks that mode as new). */
  agesSeen: boolean;
  /** First goals this player has reached, ever (game/data/goals.ts). */
  goalsDone: string[];
  /**
   * The Boon keys this player has found, ever (game/data/boonKeys.ts): the Boons of a key join their deck
   * the first time they meet what it is for, and stay. A profile from before 1.23 that has played has
   * them all: its player has met those things already.
   */
  boonKeys: string[];
  /** The house, sector and difficulty last chosen for a run: the setup opens on them. */
  lastSetup?: { heir: string; size: MapSize; difficulty: Difficulty };
  /** The player's records, by kind of run (meta/records.ts: "classic:medium:1"). */
  records: Record<string, Records>;
  /** The letters the player last posted a run to the Daily board under (meta/board.ts): three to five. */
  boardName?: string;
}

const KEY = 'hegemarch.profile.v1';
const RUN_KEY = 'hegemarch.run.v1';

export function defaultSettings(): Settings {
  return { muted: false, master: 0.7, sfx: 0.8, music: 0.5, edgePan: false, tips: true, autoPause: true, crt: false, pixelSize: 'auto', explainTerms: true };
}

export function defaultProfile(): Profile {
  return {
    v: 1,
    legacy: 0,
    totalLegacy: 0,
    heirs: ['concord', 'vael', 'wayfarer'],
    perks: {},
    unlockPacts: false,
    unlockLegendary: false,
    maxDifficulty: 1,
    runs: 0,
    wins: 0,
    bestTime: null,
    records: {},
    history: [],
    settings: defaultSettings(),
    tutorialDone: false,
    seenTips: [],
    lastDaily: null,
    winsByHeir: {},
    agesSeen: false,
    goalsDone: [],
    boonKeys: [],
  };
}

/** What a run is told of the Boons the player has discovered: nothing once they have found every key (every Boon is dealt). */
export function discoveryConfig(p: Profile): { boonKeys?: string[] } {
  return KEY_IDS.every((k) => p.boonKeys.includes(k)) ? {} : { boonKeys: KEY_IDS.filter((k) => p.boonKeys.includes(k)) };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw) as Partial<Profile>;
    const d = defaultProfile();
    // Houses renamed or replaced since the profile was saved go by what they are now (data/heirs.ts):
    // what a player unlocked, won with and played stays theirs.
    if (p.heirs) p.heirs = [...new Set(p.heirs.map(heirIdNow))];
    if (p.winsByHeir) {
      const wins: Record<string, number> = {};
      for (const [id, n] of Object.entries(p.winsByHeir)) wins[heirIdNow(id)] = (wins[heirIdNow(id)] ?? 0) + n;
      p.winsByHeir = wins;
    }
    if (p.history) p.history = p.history.map((r) => ({ ...r, heir: heirIdNow(r.heir) }));
    return {
      ...d,
      ...p,
      settings: { ...d.settings, ...(p.settings ?? {}) },
      perks: { ...(p.perks ?? {}) },
      seenTips: [...(p.seenTips ?? [])],
      goalsDone: [...(p.goalsDone ?? [])],
      boonKeys: p.boonKeys ? [...p.boonKeys] : p.runs || p.tutorialDone ? [...KEY_IDS] : [],
    } as Profile;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    storage()?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export function saveRun(data: SaveData): boolean {
  try {
    storage()?.setItem(RUN_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadRun(): SaveData | null {
  try {
    const raw = storage()?.getItem(RUN_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function hasRun(): boolean {
  try {
    return !!storage()?.getItem(RUN_KEY);
  } catch {
    return false;
  }
}

export function clearRun() {
  try {
    storage()?.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function todayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
