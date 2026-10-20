/**
 * A tiny chiptune sequencer: two pulse voices, a triangle bass and noise percussion, scheduled ahead
 * on the Web Audio clock. Tunes are written as chord progressions plus a hand-written melody.
 *
 * Music is asked for by mood (the title screen, a quiet night, a battle, the cradle of an Ages run),
 * and every mood has several tracks. A track is a few parts played in an order, its form, with voices
 * coming and going from one pass to the next, so it lasts a minute and a half to two and a half, not
 * the fifteen seconds of one part. When a track is over it comes home to its first chord, there is a
 * breath, and another track of the mood begins: every track once, in a new order each time round.
 * A mood that is interrupted (a battle in a quiet night) picks its track up again afterwards, at the
 * part it had reached.
 */
import type { Sfx } from './Sfx';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export type Mood = 'title' | 'night' | 'war' | 'cradle' | 'crown';
/** (A mood was one song once.) */
export type SongId = Mood;
/**
 * How often the calm music of a run plays (Settings): track after track with a breath between them;
 * a track now and then, with a minute or two of quiet after each; or only in battle. (A player found the
 * calm music, track after track, tiring.) Battle music starts at once whatever this says.
 */
export type MusicPace = 'often' | 'sometimes' | 'battles';
/** The ways, as Settings names them (on the title screen and in a run), and what each means. */
export const PACES: [MusicPace, string, string][] = [
  ['often', 'OFTEN', 'Calm music track after track, with a breath between them. Battle music when you fight.'],
  ['sometimes', 'NOW AND THEN', 'A calm track now and then, with a minute or two of quiet after each. Battle music when you fight.'],
  ['battles', 'BATTLES ONLY', 'No calm music in a run: only battle music, when you fight.'],
];

type Wave = 'p12' | 'p25' | 'p50' | 'tri';

export interface Part {
  /** One chord (MIDI root + three intervals) per bar. */
  chords: number[][];
  /** Melody: one entry per step across the whole part; null = rest, 0 = hold. */
  lead: (number | null)[];
}

export interface Track {
  name: string;
  mood: Mood;
  bpm: number;
  /** Steps (eighth notes) per bar: 8, or 6 for a tune in three. */
  steps: 6 | 8;
  /** The pitch classes the tune is written in (0 = C). A note outside them belongs to the chord under it. */
  scale: number[];
  parts: Record<string, Part>;
  /**
   * The parts in the order they are played, each with the voices of that pass:
   * l lead, e its echo, a arpeggio, b bass, d drums, h the light half of the drums alone.
   */
  form: [part: string, voices: string][];
  leadWave: Wave;
  leadVol: number;
  arpVol: number;
  bassVol: number;
  /** Arpeggio pattern (indices into the chord, one per step). */
  arp: number[];
  /** root5: root on the beat, fifth off it. pulse: the root on every step. long: one note a bar. octave: root low, root high. */
  bass: 'root5' | 'pulse' | 'long' | 'octave';
  kit: 'kit' | 'march' | 'tribal' | 'none';
}

/** Parse a melody line like "A4 . C5 - E5" (".", rest; "-", hold). */
function mel(src: string): (number | null)[] {
  const names: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return src
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (tok === '.') return null;
      if (tok === '-') return 0;
      const m = /^([A-G])(#|b)?(\d)$/.exec(tok);
      if (!m) throw new Error(`Music: "${tok}" is not a note`);
      return 12 * (parseInt(m[3], 10) + 1) + names[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    });
}

const part = (chords: number[][], lead: string): Part => ({ chords, lead: mel(lead) });
const key = (root: number, steps: number[]) => steps.map((s) => (root + s) % 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

const Am = [57, 0, 3, 7];
const F = [53, 0, 4, 7];
const C = [48, 0, 4, 7];
const G = [55, 0, 4, 7];
const E = [52, 0, 4, 7];
const Em = [52, 0, 3, 7];
const Dm = [50, 0, 3, 7];
const D = [50, 0, 4, 7];
const Bb = [46, 0, 4, 7];
const B = [47, 0, 4, 7];
const Gm = [55, 0, 3, 7];
const A = [57, 0, 4, 7];
const Cm = [48, 0, 3, 7];
const Fm = [53, 0, 3, 7];
const Eb = [51, 0, 4, 7];
const Ab = [56, 0, 4, 7];

/** Every track. The first of a mood is the one a session opens with on the title screen. */
export const TRACKS: Track[] = [
  // ------------------------------------------------------------------ the title screen
  {
    name: 'Hegemarch', mood: 'title', bpm: 112, steps: 8, scale: key(9, MINOR),
    parts: {
      A: part([Am, F, C, G, Am, F, G, E], `
        A4 . C5 . E5 . D5 C5   A4 - - - G4 - . .
        A4 . C5 . G5 . E5 D5   B4 - - - - - . .
        E5 . G5 . C6 . B5 A5   G5 - - - D5 - . .
        E5 . D5 . C5 . B4 .    G#4 - - - - - B4 -`),
      // The same climb, a bar at a time, up through the relative major and home by way of the fifth.
      B: part([F, G, Em, Am, Dm, G, E, E], `
        C5 - - A4 C5 - F5 -    D5 - - B4 D5 - G5 -
        E5 - - B4 E5 - G5 -    A5 - - - E5 - C5 -
        D5 - - A4 D5 - F5 -    E5 - D5 - B4 - G4 -
        G#4 - B4 - E5 - - -    D5 - - - B4 - G#4 -`),
    },
    form: [['A', 'abld'], ['A', 'ablde'], ['B', 'abld'], ['A', 'ablde'], ['B', 'ablde'], ['A', 'abld']],
    leadWave: 'p25', leadVol: 0.22, arpVol: 0.07, bassVol: 0.3, arp: [1, 2, 3, 2, 1, 2, 3, 2], bass: 'root5', kit: 'kit',
  },
  {
    // Slower and statelier: the hall the last Hegemarch left.
    name: 'The Empty Throne', mood: 'title', bpm: 96, steps: 8, scale: key(4, MINOR),
    parts: {
      A: part([Em, C, G, D, Em, C, D, B], `
        B4 - E5 - - - F#5 G5   G5 - - - E5 - C5 -
        D5 - G5 - - - A5 B5    A5 - - - F#5 - D5 -
        B4 - E5 - - - F#5 G5   E5 - - - G5 - C6 -
        B5 - A5 - F#5 - D5 -   D#5 - - - F#5 - B4 -`),
      B: part([Am, Em, C, G, Am, Em, B, B], `
        E5 - - - C5 - A4 -     B4 - - - - - E5 -
        E5 - - - C5 - G4 -     B4 - - - - - D5 -
        C5 - E5 - A5 - - -     G5 - - - E5 - B4 -
        F#5 - - - D#5 - B4 -   D#5 - - - - - . .`),
    },
    form: [['A', 'abl'], ['A', 'abled'], ['B', 'abl'], ['A', 'abled'], ['B', 'abled'], ['A', 'abl']],
    leadWave: 'p50', leadVol: 0.17, arpVol: 0.06, bassVol: 0.28, arp: [1, 3, 2, 3, 1, 3, 2, 3], bass: 'octave', kit: 'march',
  },
  // ------------------------------------------------------------------ a quiet night
  {
    name: 'Night Watch', mood: 'night', bpm: 76, steps: 8, scale: key(2, MINOR),
    parts: {
      A: part([Dm, Bb, F, C, Dm, Gm, A, A], `
        . . . . . . . .        . . . . . . . .
        A4 - - - C5 - D5 -     E5 - - - - - . .
        . . . . . . . .        . . . . . . . .
        E5 - - - C#5 - - -     A4 - - - - - . .`),
      B: part([Gm, Dm, Bb, F, Gm, Dm, A, A], `
        . . . . . . . .        . . . . . . . .
        F5 - - - D5 - Bb4 -    C5 - - - - - . .
        . . . . . . . .        . . . . D5 - F5 -
        E5 - - - C#5 - - -     A4 - - - - - . .`),
    },
    form: [['A', 'ab'], ['A', 'abl'], ['B', 'abl'], ['A', 'able'], ['B', 'ab'], ['A', 'abl']],
    leadWave: 'p12', leadVol: 0.12, arpVol: 0.06, bassVol: 0.22, arp: [1, 2, 3, 2, 3, 2, 1, 2], bass: 'root5', kit: 'none',
  },
  {
    // The one in a major key: worlds lit, and nobody at the gates.
    name: 'Embers', mood: 'night', bpm: 80, steps: 8, scale: key(5, MAJOR),
    parts: {
      A: part([F, Dm, Bb, C, F, Am, Bb, C], `
        A4 - - - C5 - - -      D5 - - - - - A4 -
        Bb4 - - - D5 - F5 -    E5 - - - - - . .
        F5 - - - C5 - A4 -     C5 - - - E5 - - -
        D5 - - - Bb4 - - -     C5 - - - - - . .`),
      B: part([Dm, Bb, F, C, Dm, Bb, C, C], `
        . . . . F5 - E5 D5     D5 - - - - - Bb4 -
        . . . . A4 - C5 F5     E5 - - - - - G5 -
        F5 - - - D5 - A4 -     Bb4 - - - - - D5 -
        C5 - - - E5 - G5 -     G5 - - - - - . .`),
    },
    form: [['A', 'a'], ['A', 'abl'], ['B', 'abl'], ['A', 'able'], ['B', 'ableh'], ['A', 'abl']],
    leadWave: 'p50', leadVol: 0.11, arpVol: 0.06, bassVol: 0.22, arp: [1, 2, 3, 2, 1, 3, 2, 3], bass: 'long', kit: 'kit',
  },
  {
    // In three: a ship riding a starlane.
    name: 'Starlanes', mood: 'night', bpm: 84, steps: 6, scale: key(9, MINOR),
    parts: {
      A: part([Am, Am, F, F, C, C, G, G, Am, Am, F, F, Dm, Dm, E, E], `
        E5 - - - - -    C5 - - A4 - -    A4 - - - - C5    F5 - - - - -
        E5 - - - - -    G5 - - E5 - -    D5 - - - - B4    D5 - - - - -
        E5 - - A5 - -   G5 - - E5 - -    C5 - - F5 - -    A5 - - - - -
        A5 - - F5 - -   D5 - - - - F5    E5 - - - - -     G#4 - - B4 - -`),
      B: part([F, F, G, G, Em, Em, Am, Am, F, F, G, G, E, E, E, E], `
        . . . . . .     C5 - - A4 - -    . . . . . .      D5 - - B4 - -
        E5 - - - - -    G5 - - - - B4    C5 - - - - -     . . . . . .
        . . . . . .     A4 - - C5 - -    . . . . . .      B4 - - D5 - -
        E5 - - - - -    D5 - - B4 - -    G#4 - - - - -    . . . . . .`),
    },
    form: [['A', 'ab'], ['A', 'abl'], ['B', 'able'], ['A', 'able']],
    leadWave: 'p25', leadVol: 0.1, arpVol: 0.06, bassVol: 0.22, arp: [1, 2, 3, 1, 2, 3], bass: 'root5', kit: 'none',
  },
  {
    // The slowest and the darkest: what the Scouts have not charted yet.
    name: 'Deep Field', mood: 'night', bpm: 68, steps: 8, scale: key(0, MINOR),
    parts: {
      A: part([Cm, Ab, Eb, Bb, Cm, Fm, G, G], `
        . . . . G5 - - -       Eb5 - - - - - C5 -
        Bb4 - - - Eb5 - G5 -   F5 - - - - - D5 -
        . . . . Eb5 - G5 -     Ab5 - - - - - F5 -
        D5 - - - B4 - - -      G4 - - - - - . .`),
      B: part([Ab, Bb, Cm, Cm, Ab, Bb, G, G], `
        C5 - - - Eb5 - - -     D5 - - - F5 - - -
        G5 - - - - - Eb5 -     C5 - - - - - . .
        Ab5 - - - Eb5 - C5 -   Bb5 - - - F5 - D5 -
        B4 - - - D5 - G5 -     G5 - - - - - . .`),
    },
    form: [['A', 'ab'], ['A', 'able'], ['B', 'able'], ['A', 'abl'], ['B', 'ab']],
    leadWave: 'p12', leadVol: 0.11, arpVol: 0.055, bassVol: 0.24, arp: [1, 3, 2, 3, 1, 3, 2, 3], bass: 'long', kit: 'none',
  },
  // ------------------------------------------------------------------ a battle
  {
    name: 'To Arms', mood: 'war', bpm: 132, steps: 8, scale: key(2, MINOR),
    parts: {
      A: part([Dm, Dm, Bb, C, Dm, Dm, Bb, A], `
        D5 . D5 . F5 . E5 D5   C5 - A4 - - - . .
        D5 . D5 . F5 . G5 A5   G5 - E5 - - - . .
        A5 . A5 . G5 . F5 E5   F5 - D5 - - - . .
        Bb4 . C5 . D5 . E5 F5  E5 - C#5 - - - . .`),
      B: part([Gm, Gm, Dm, Dm, Bb, C, A, A], `
        G5 . G5 . Bb5 . A5 G5  D5 - Bb4 - - - . .
        F5 . F5 . A5 . G5 F5   D5 - A4 - - - . .
        D5 . F5 . Bb5 . A5 F5  E5 . G5 . C6 . Bb5 G5
        A5 - - - E5 - C#5 -    E5 - C#5 - A4 - . .`),
    },
    form: [['A', 'abld'], ['A', 'ablde'], ['B', 'abld'], ['A', 'ablde'], ['B', 'ablde'], ['A', 'abld']],
    leadWave: 'p50', leadVol: 0.12, arpVol: 0.07, bassVol: 0.3, arp: [1, 3, 2, 3, 1, 3, 2, 3], bass: 'root5', kit: 'kit',
  },
  {
    // The fastest: a bass that does not let go, and the tune held back for the first pass.
    name: 'Breakers', mood: 'war', bpm: 140, steps: 8, scale: key(4, MINOR),
    parts: {
      A: part([Em, Em, C, D, Em, Em, C, B], `
        E5 - B4 E5 - G5 F#5 E5   B4 - - - . . B4 D5
        E5 - C5 E5 - G5 E5 C5    D5 - - - F#5 - A5 -
        G5 - E5 G5 - B5 A5 G5    E5 - - - . . E5 G5
        C6 - B5 - G5 - E5 -      D#5 - F#5 - B5 - - -`),
      B: part([Am, Am, Em, Em, Am, C, B, B], `
        A5 . A5 . C6 . B5 A5     E5 - C5 - - - . .
        G5 . G5 . B5 . A5 G5     E5 - B4 - - - . .
        C5 . E5 . A5 . G5 E5     G5 . E5 . C5 . E5 G5
        F#5 - - - D#5 - B4 -     B4 - D#5 - F#5 - B5 -`),
    },
    form: [['A', 'abd'], ['A', 'abld'], ['B', 'abld'], ['A', 'ablde'], ['B', 'ablde'], ['A', 'abld']],
    leadWave: 'p25', leadVol: 0.12, arpVol: 0.06, bassVol: 0.26, arp: [1, 2, 3, 2, 1, 2, 3, 2], bass: 'pulse', kit: 'kit',
  },
  {
    // A march: the Hearth is under siege and the line holds.
    name: 'Last Stand', mood: 'war', bpm: 126, steps: 8, scale: key(7, MINOR),
    parts: {
      A: part([Gm, Gm, Eb, F, Gm, Gm, Cm, D], `
        G5 - - D5 G5 - Bb5 -     A5 - G5 - D5 - - -
        Eb5 - - Bb4 Eb5 - G5 -   F5 - - - A5 - C6 -
        Bb5 - - G5 Bb5 - D6 -    C6 - Bb5 - G5 - - -
        Eb5 - G5 - C6 - Bb5 -    A5 - - - F#5 - D5 -`),
      B: part([Eb, F, Gm, Gm, Eb, F, D, D], `
        G5 . G5 . Bb5 . G5 .     A5 . A5 . C6 . A5 .
        Bb5 - - - D6 - - -       Bb5 - G5 - D5 - . .
        Eb5 . G5 . Bb5 . G5 .    F5 . A5 . C6 . A5 .
        D6 - - - A5 - F#5 -      D5 - F#5 - A5 - D6 -`),
    },
    form: [['A', 'abld'], ['A', 'ablde'], ['B', 'abld'], ['A', 'ablde'], ['B', 'abld'], ['A', 'ablde']],
    leadWave: 'p50', leadVol: 0.12, arpVol: 0.06, bassVol: 0.3, arp: [1, 3, 2, 3, 1, 3, 2, 3], bass: 'octave', kit: 'march',
  },
  // ------------------------------------------------------------------ the cradle of an Ages run
  {
    // Five notes, a flute and hand drums: a tribe round its first fire.
    name: 'First Fires', mood: 'cradle', bpm: 88, steps: 8, scale: key(9, MINOR),
    parts: {
      A: part([Am, Am, C, G, Am, Am, G, Em], `
        A4 - C5 - D5 - E5 -    E5 - - - D5 C5 A4 -
        C5 - E5 - G5 - E5 -    D5 - - - - - . .
        A4 - C5 - D5 - E5 -    G5 - - - E5 D5 C5 -
        D5 - - - G5 - D5 -     E5 - - - - - . .`),
      B: part([C, G, Am, Am, C, G, Em, Em], `
        E5 - G5 - - - E5 -     D5 - - - G4 - - -
        A4 - C5 - E5 - - -     . . . . E5 - D5 C5
        C5 - E5 - G5 - A5 -    G5 - - - D5 - - -
        E5 - - - G5 - E5 -     B4 - - - - - . .`),
    },
    form: [['A', 'bd'], ['A', 'abld'], ['B', 'abld'], ['A', 'ablde'], ['B', 'ablh'], ['A', 'abld']],
    leadWave: 'tri', leadVol: 0.3, arpVol: 0.05, bassVol: 0.24, arp: [1, 3, 2, 3, 1, 3, 2, 3], bass: 'root5', kit: 'tribal',
  },
  {
    // Slower, over a drone: the long road from one age to the next.
    name: 'Long Road', mood: 'cradle', bpm: 72, steps: 8, scale: key(2, DORIAN),
    parts: {
      A: part([Dm, C, Dm, G, Dm, C, Am, Dm], `
        D5 - - - F5 - A5 -     G5 - - - E5 - - -
        F5 - - - D5 - A4 -     B4 - - - D5 - - -
        D5 - - - F5 - A5 -     C6 - - - G5 - E5 -
        A5 - - - E5 - C5 -     D5 - - - - - . .`),
      B: part([F, C, Dm, Dm, F, G, Am, Am], `
        . . . . A5 - F5 -      E5 - - - - - G5 -
        F5 - - - D5 - - -      . . . . . . . .
        . . . . C5 - F5 -      D5 - - - - - B4 -
        C5 - - - E5 - - -      A4 - - - - - . .`),
    },
    form: [['A', 'ab'], ['A', 'abl'], ['B', 'ablh'], ['A', 'able'], ['B', 'abl']],
    leadWave: 'tri', leadVol: 0.3, arpVol: 0.05, bassVol: 0.24, arp: [1, 2, 3, 2, 3, 2, 1, 2], bass: 'long', kit: 'tribal',
  },
  // ------------------------------------------------------------------ a crowning (the end of a run that was won)
  {
    // In the major, the key of the fanfare it follows, at a walk: a tune that climbs to its home note
    // and stays there. It plays from its first bar every time, while the house is crowned and its run is told.
    name: 'The Crowning', mood: 'crown', bpm: 104, steps: 8, scale: key(0, MAJOR),
    parts: {
      A: part([C, F, G, C, Am, F, G, C], `
        G4 . C5 . E5 . G5 -    A5 - - - F5 - C5 -
        B4 . D5 . G5 . B5 -    C6 - - - G5 - E5 -
        A4 . C5 . E5 . A5 -    A5 - G5 - F5 - C5 -
        D5 . G5 . B5 - D6 -    C6 - - - - - . .`),
      // The answer comes down where the call went up, and climbs home again.
      B: part([F, C, G, Am, F, C, G, C], `
        A5 - F5 - C5 - F5 -    G5 - E5 - C5 - E5 -
        B5 - G5 - D5 - G5 -    C6 - A5 - E5 - - -
        F5 . A5 . C6 - A5 -    E5 . G5 . C6 - G5 -
        D6 - B5 - G5 - B5 -    C6 - - - - - . .`),
    },
    form: [['A', 'abl'], ['A', 'ablde'], ['B', 'ablde'], ['A', 'ablde'], ['B', 'able'], ['A', 'ablde']],
    leadWave: 'p25', leadVol: 0.2, arpVol: 0.07, bassVol: 0.3, arp: [1, 2, 3, 2, 1, 2, 3, 2], bass: 'octave', kit: 'march',
  },
];

/** How long one pass through a track's form lasts, in seconds. */
export function trackSeconds(t: Track): number {
  const stepDur = 60 / t.bpm / 2;
  return t.form.reduce((a, [id]) => a + t.parts[id].chords.length * t.steps * stepDur, 0);
}

/**
 * The next track of a mood: every track once, in a new order each time round, and never the same one
 * twice running. `bag` holds what is left of the round and is refilled when it is empty.
 */
export function drawTrack(pool: Track[], bag: Track[], last: string | undefined, rnd: () => number): Track {
  if (bag.length === 0) {
    bag.push(...pool);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // (The round must not open with the track that closed the last one.)
    if (bag.length > 1 && bag[bag.length - 1].name === last) bag.unshift(bag.pop()!);
  }
  return bag.pop()!;
}

export class Music {
  private mood: Mood | null = null;
  private track: Track | null = null;
  /** Where the track is: which entry of its form, and which step of that part. */
  private seg = 0;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bus: GainNode | null = null;
  /** Audio time before which a new tune may not start (the old one is still fading). */
  private startAt = 0;
  /** What is left of each mood's round of tracks, and the track each mood played last. */
  private bags: Partial<Record<Mood, Track[]>> = {};
  private last: Partial<Record<Mood, string>> = {};
  /** The track a mood was in the middle of when another mood took over, and the part it had reached. */
  private held: Partial<Record<Mood, { track: Track; seg: number; quiet: number }>> = {};
  /** Audio time until which the quiet after the last track lasts. */
  private quietUntil = 0;
  /**
   * The quiet after a calm track of a run (night, cradle): a breath ('often', as on the website and in the
   * films) or a minute or two ('sometimes'). (With 'battles' the run plays no calm music at all: app/sound.ts.)
   */
  pace: MusicPace = 'often';

  constructor(
    private sfx: Sfx,
    private rnd: () => number = Math.random,
  ) {
    // (A session opens with the theme the game is known by; after it, the round is drawn like any other.)
    this.bags.title = TRACKS.filter((t) => t.mood === 'title').reverse();
  }

  get playing(): Mood | null {
    return this.mood;
  }

  /** The name of the track that is playing, or about to. */
  get title(): string | null {
    return this.track?.name ?? null;
  }

  /**
   * `wait`: seconds of silence first. (The fanfare of a crowning, or of a fall, is heard alone: the
   * music of the results does not come in under it.)
   */
  play(mood: Mood | null, wait = 0) {
    if (mood === this.mood) return;
    this.hold();
    this.mood = mood;
    this.cut();
    const c = this.sfx.ctx;
    const was = mood ? this.held[mood] : undefined;
    // (A mood that was in the quiet after one of its tracks has the rest of that quiet first: a battle
    // in the middle of it does not bring the night's music straight back after it.)
    wait = Math.max(wait, was?.quiet ?? 0);
    if (c && wait > 0) this.startAt = Math.max(this.startAt, c.currentTime + wait);
    this.track = was ? was.track : mood ? this.draw(mood) : null;
    this.seg = was ? was.seg : 0;
    this.step = 0;
    if (mood) this.ensureTimer();
  }

  /**
   * Play this track, whatever the mood (the list of tracks under Settings); its mood goes on from it.
   * It starts where its tune comes in: someone who picks a track from a list wants to hear the track,
   * not the bars of bass that lead up to it.
   */
  playTrack(name: string) {
    const t = TRACKS.find((x) => x.name === name);
    if (!t) return;
    if (this.mood !== t.mood) this.hold();
    this.mood = t.mood;
    this.cut();
    this.track = t;
    this.last[t.mood] = t.name;
    // (It has had its turn in this round of its mood: the round does not bring it straight back.)
    const bag = this.bags[t.mood];
    if (bag?.includes(t)) bag.splice(bag.indexOf(t), 1);
    this.seg = Math.max(0, t.form.findIndex(([, voices]) => voices.includes('l')));
    this.step = 0;
    this.ensureTimer();
  }

  /**
   * The music steps back for a few seconds and comes forward again: something is being said over it
   * (the fanfare of an Ark that leaves its cradle), and it plays on underneath.
   */
  duck(seconds: number, level = 0.2) {
    const c = this.sfx.ctx;
    if (!this.bus || !c) return;
    const g = this.bus.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setTargetAtTime(level, c.currentTime, 0.05);
    g.setTargetAtTime(1, c.currentTime + seconds, 0.3);
  }

  /**
   * Keep the place of the mood that is playing, for when it comes back. (A crowning is not picked up where
   * it was left: it is played from its first bar every time.)
   */
  private hold() {
    if (!this.mood || !this.track || this.mood === 'crown') return;
    const now = this.sfx.ctx?.currentTime ?? 0;
    this.held[this.mood] = { track: this.track, seg: this.seg, quiet: Math.max(0, this.quietUntil - now) };
  }

  /** On to the next track of the mood, now. */
  skip() {
    if (!this.mood) return;
    this.cut();
    this.track = this.draw(this.mood);
    this.seg = 0;
    this.step = 0;
  }

  /** Two tunes in different keys and tempos must not overlap: what plays fades fast, and the next starts after it. */
  private cut() {
    const c = this.sfx.ctx;
    if (!this.bus || !c) return;
    const old = this.bus;
    old.gain.setTargetAtTime(0, c.currentTime, 0.08);
    setTimeout(() => old.disconnect(), 1500);
    this.bus = null;
    this.startAt = c.currentTime + 0.4;
    this.quietUntil = 0;
  }

  private draw(mood: Mood): Track {
    const t = drawTrack(TRACKS.filter((x) => x.mood === mood), (this.bags[mood] ??= []), this.last[mood], this.rnd);
    this.last[mood] = t.name;
    return t;
  }

  private ensureTimer() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.pump(), 50);
  }

  /** Schedule notes up to 0.25s ahead. */
  private pump() {
    const c = this.sfx.ctx;
    if (!c || !this.track || !this.sfx.musicGain || c.state !== 'running') return;
    if (!this.bus) {
      this.bus = c.createGain();
      this.bus.gain.value = 0;
      this.bus.gain.setTargetAtTime(1, c.currentTime, 0.4);
      this.bus.connect(this.sfx.musicGain);
      this.nextTime = Math.max(c.currentTime + 0.1, this.startAt);
    }
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    // A tune that has fallen behind (a frame that took long) skips the notes it is late for. Played late,
    // a note began at once and at full strength, in the middle of its sound: a click (until 1.25.1).
    for (let n = 0; this.nextTime < c.currentTime + 0.03 && n < 64; n++) this.advance(false);
    while (this.nextTime < c.currentTime + 0.3) this.advance(true);
  }

  /** One step of the tune: its notes scheduled (`play`) or passed over, and on to the next step, part or track. */
  private advance(play: boolean) {
    const tr: Track = this.track!;
    const [id, voices] = tr.form[this.seg];
    const p = tr.parts[id];
    const stepDur = 60 / tr.bpm / 2;
    if (play) this.schedule(tr, p, voices, this.step, this.nextTime, stepDur);
    this.nextTime += stepDur;
    if (++this.step < p.chords.length * tr.steps) return;
    this.step = 0;
    if (++this.seg < tr.form.length) return;
    // The track is over: it comes home, there is a breath, and another track of the mood begins.
    this.seg = 0;
    this.nextTime += play ? this.close(tr, this.nextTime, stepDur) : stepDur * 2;
    this.quietUntil = this.nextTime;
    this.track = this.draw(tr.mood);
  }

  /**
   * The last bar of a track has been played. Its parts end on the way home, so it comes home: the first
   * chord of the tune, left to ring. Returns how long to wait for the next track (a battle does not wait).
   */
  private close(tr: Track, t: number, dur: number): number {
    if (tr.mood === 'war') return dur * 2;
    const bus = this.bus!;
    const chord = tr.parts[tr.form[0][0]].chords[0];
    const root = chord[0];
    const ring = Math.max(1.6, dur * 6);
    this.sfx.tone(bus, 'tri', midi(root - 12), midi(root - 12), t, ring, tr.bassVol);
    for (let i = 1; i <= 3; i++) {
      const n = midi(root + 12 + chord[i]);
      this.sfx.tone(bus, 'p12', n, n, t + (i - 1) * dur * 0.5, ring - (i - 1) * dur * 0.5, tr.arpVol);
    }
    this.sfx.tone(bus, tr.leadWave, midi(root + 24), midi(root + 24), t, ring, tr.leadVol * 0.8, 0.01);
    if (tr.mood === 'title') return ring + 1;
    const calm = tr.mood === 'night' || tr.mood === 'cradle';
    return ring + (calm && this.pace !== 'often' ? 60 + this.rnd() * 60 : 3 + this.rnd() * 4);
  }

  private schedule(tr: Track, p: Part, voices: string, step: number, t: number, dur: number) {
    const bus = this.bus!;
    const bar = Math.floor(step / tr.steps);
    const inBar = step % tr.steps;
    const chord = p.chords[bar];
    const root = chord[0];
    // A beat is two steps, or three in a tune in three; the bar leans on its first beat (and, in four, its third).
    const beat = tr.steps === 8 ? 2 : 3;
    const onBeat = inBar % beat === 0;
    const strong = inBar % (tr.steps === 8 ? 4 : 6) === 0;
    // Arpeggio (pulse 12.5%)
    if (voices.includes('a')) {
      const ai = tr.arp[inBar % tr.arp.length];
      this.sfx.tone(bus, 'p12', midi(root + 12 + chord[ai]), midi(root + 12 + chord[ai]), t, dur * 0.9, tr.arpVol);
    }
    // Bass (triangle)
    if (voices.includes('b')) {
      const low = root - 12;
      if (tr.bass === 'long') {
        if (inBar === 0) this.sfx.tone(bus, 'tri', midi(low), midi(low), t, dur * tr.steps * 0.98, tr.bassVol);
      } else if (tr.bass === 'pulse') {
        this.sfx.tone(bus, 'tri', midi(low), midi(low), t, dur * 0.85, tr.bassVol * (strong ? 1 : 0.8));
      } else if (onBeat) {
        const n = strong ? low : tr.bass === 'octave' ? low + 12 : low + 7;
        this.sfx.tone(bus, 'tri', midi(n), midi(n), t, dur * (beat - 0.2), tr.bassVol);
      }
    }
    // Lead with holds, and its echo a step behind.
    const note = voices.includes('l') ? p.lead[step] : null;
    if (note) {
      let len = 1;
      while (step + len < p.lead.length && p.lead[step + len] === 0 && len < 16) len++;
      this.sfx.tone(bus, tr.leadWave, midi(note), midi(note), t, dur * len * 0.95, tr.leadVol, 0.01);
      if (voices.includes('e')) this.sfx.tone(bus, 'p12', midi(note), midi(note), t + dur, dur * len * 0.9, tr.leadVol * 0.33, 0.01);
    }
    // Percussion on the noise channel.
    const full = voices.includes('d');
    if (!full && !voices.includes('h')) return;
    if (tr.kit === 'kit') {
      if (full && strong) this.sfx.noiseBurst(bus, t, 0.09, 0.22, 0.35, { type: 'lowpass', f: 400 });
      if (full && onBeat && !strong) this.sfx.noiseBurst(bus, t, 0.07, 0.16, 1.4, { type: 'bandpass', f: 2000 });
      if (tr.steps === 8 ? inBar % 2 === 1 : inBar % 3 === 2) this.sfx.noiseBurst(bus, t, 0.03, 0.06, 3, { type: 'highpass', f: 6000 });
    } else if (tr.kit === 'march') {
      if (full && strong) this.sfx.noiseBurst(bus, t, 0.1, 0.22, 0.35, { type: 'lowpass', f: 400 });
      if (full && onBeat && !strong) this.sfx.noiseBurst(bus, t, 0.08, 0.15, 1.4, { type: 'bandpass', f: 1800 });
      // (The roll that carries the bar into the next.)
      if (inBar >= tr.steps - 2) this.sfx.noiseBurst(bus, t, 0.04, 0.07, 1.6, { type: 'bandpass', f: 2200 });
    } else if (tr.kit === 'tribal') {
      // Three, three and two: a low drum, and a shaker in the gaps.
      if (full && (inBar === 0 || inBar === 3 || inBar === 6)) this.sfx.noiseBurst(bus, t, 0.14, inBar === 0 ? 0.24 : 0.17, 0.28, { type: 'lowpass', f: 320 });
      if (inBar === 2 || inBar === 5 || inBar === 7) this.sfx.noiseBurst(bus, t, 0.03, 0.05, 3, { type: 'highpass', f: 5000 });
    }
  }
}
