import type { SaveData } from '../game/Game';
import type { Difficulty, MapSize } from '../game/types';

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
}

const KEY = 'hegemarch.profile.v1';
const RUN_KEY = 'hegemarch.run.v1';

export function defaultSettings(): Settings {
  return { master: 0.7, sfx: 0.8, music: 0.5, edgePan: false, tips: true, autoPause: true, crt: false, pixelSize: 'auto', explainTerms: true };
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
    history: [],
    settings: defaultSettings(),
    tutorialDone: false,
    seenTips: [],
    lastDaily: null,
    winsByHeir: {},
    agesSeen: false,
    goalsDone: [],
  };
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
    return {
      ...d,
      ...p,
      settings: { ...d.settings, ...(p.settings ?? {}) },
      perks: { ...(p.perks ?? {}) },
      seenTips: [...(p.seenTips ?? [])],
      goalsDone: [...(p.goalsDone ?? [])],
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
