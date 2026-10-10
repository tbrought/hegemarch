/**
 * A tiny chiptune sequencer: two pulse voices, a triangle bass and noise percussion, scheduled ahead
 * on the Web Audio clock. Songs are written as chord progressions plus a hand-written melody.
 */
import type { Sfx } from './Sfx';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Song {
  bpm: number;
  /** Steps per bar (eighth notes). */
  steps: number;
  /** One chord (MIDI root + intervals) per bar. */
  chords: number[][];
  /** Melody: one entry per step across the whole song; null = rest, 0 = hold. */
  lead: (number | null)[];
  leadWave: 'p12' | 'p25' | 'p50';
  leadVol: number;
  arpVol: number;
  bassVol: number;
  drums: boolean;
  /** Arpeggio pattern (indices into the chord, one per step). */
  arp: number[];
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
      if (!m) return null;
      return 12 * (parseInt(m[3], 10) + 1) + names[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    });
}

const Am = [57, 0, 3, 7];
const F = [53, 0, 4, 7];
const C = [48, 0, 4, 7];
const G = [55, 0, 4, 7];
const E = [52, 0, 4, 7];
const Dm = [50, 0, 3, 7];
const Bb = [46, 0, 4, 7];
const Gm = [55, 0, 3, 7];
const A = [57, 0, 4, 7];

export const SONGS: Record<'title' | 'night' | 'war', Song> = {
  title: {
    bpm: 112,
    steps: 8,
    chords: [Am, F, C, G, Am, F, G, E],
    lead: mel(`
      A4 . C5 . E5 . D5 C5   A4 - - - G4 - . .
      A4 . C5 . G5 . E5 D5   B4 - - - - - . .
      E5 . G5 . C6 . B5 A5   G5 - - - D5 - . .
      E5 . D5 . C5 . B4 .    G#4 - - - - - B4 -`),
    leadWave: 'p25',
    leadVol: 0.22,
    arpVol: 0.07,
    bassVol: 0.3,
    drums: true,
    arp: [1, 2, 3, 2, 1, 2, 3, 2],
  },
  night: {
    bpm: 76,
    steps: 8,
    chords: [Dm, Bb, F, C, Dm, Gm, A, A],
    lead: mel(`
      . . . . . . . .   . . . . . . . .
      A4 - - - C5 - D5 -   E5 - - - - - . .
      . . . . . . . .   . . . . . . . .
      E5 - - - C#5 - - -   A4 - - - - - . .`),
    leadWave: 'p12',
    leadVol: 0.12,
    arpVol: 0.06,
    bassVol: 0.22,
    drums: false,
    arp: [1, 2, 3, 2, 3, 2, 1, 2],
  },
  war: {
    bpm: 132,
    steps: 8,
    chords: [Dm, Dm, Bb, C, Dm, Dm, Bb, A],
    lead: mel(`
      D5 . D5 . F5 . E5 D5   C5 - A4 - - - . .
      D5 . D5 . F5 . G5 A5   G5 - E5 - - - . .
      A5 . A5 . G5 . F5 E5   F5 - D5 - - - . .
      Bb4 . C5 . D5 . E5 F5   E5 - C#5 - - - . .`),
    leadWave: 'p50',
    leadVol: 0.12,
    arpVol: 0.07,
    bassVol: 0.3,
    drums: true,
    arp: [1, 3, 2, 3, 1, 3, 2, 3],
  },
};

export type SongId = keyof typeof SONGS;

export class Music {
  private song: SongId | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private bus: GainNode | null = null;
  /** Audio time before which a new song may not start (the old one is still fading). */
  private startAt = 0;

  constructor(private sfx: Sfx) {}

  get playing(): SongId | null {
    return this.song;
  }

  play(id: SongId | null) {
    if (id === this.song) return;
    this.song = id;
    this.step = 0;
    const c = this.sfx.ctx;
    if (this.bus && c) {
      // Two songs in different keys and tempos must not overlap: fade fast, start after.
      const old = this.bus;
      old.gain.setTargetAtTime(0, c.currentTime, 0.08);
      window.setTimeout(() => old.disconnect(), 1500);
      this.bus = null;
      this.startAt = c.currentTime + 0.4;
    }
    if (!id) return;
    this.ensureTimer();
  }

  private ensureTimer() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.pump(), 50);
  }

  /** Schedule notes up to 0.25s ahead. */
  private pump() {
    const c = this.sfx.ctx;
    if (!c || !this.song || !this.sfx.musicGain || c.state !== 'running') return;
    if (!this.bus) {
      this.bus = c.createGain();
      this.bus.gain.value = 0;
      this.bus.gain.setTargetAtTime(1, c.currentTime, 0.4);
      this.bus.connect(this.sfx.musicGain);
      this.nextTime = Math.max(c.currentTime + 0.1, this.startAt);
    }
    const s = SONGS[this.song];
    const stepDur = 60 / s.bpm / 2;
    const total = s.chords.length * s.steps;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.schedule(s, this.step % total, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private schedule(s: Song, step: number, t: number, dur: number) {
    const bus = this.bus!;
    const bar = Math.floor(step / s.steps);
    const inBar = step % s.steps;
    const chord = s.chords[bar];
    const root = chord[0];
    // Arpeggio (pulse 12.5%)
    const ai = s.arp[inBar % s.arp.length];
    this.sfx.tone(bus, 'p12', midi(root + 12 + chord[ai]), midi(root + 12 + chord[ai]), t, dur * 0.9, s.arpVol);
    // Bass (triangle): root on the beat, fifth on the off-beat.
    if (inBar % 2 === 0) {
      const n = inBar % 4 === 0 ? root - 12 : root - 12 + 7;
      this.sfx.tone(bus, 'tri', midi(n), midi(n), t, dur * 1.8, s.bassVol);
    }
    // Lead with holds.
    const note = s.lead[step % s.lead.length];
    if (note) {
      let len = 1;
      while (s.lead[(step + len) % s.lead.length] === 0 && len < 16) len++;
      this.sfx.tone(bus, s.leadWave, midi(note), midi(note), t, dur * len * 0.95, s.leadVol, 0.01);
    }
    // Percussion on the noise channel.
    if (s.drums) {
      if (inBar % 4 === 0) this.sfx.noiseBurst(bus, t, 0.09, 0.22, 0.35, { type: 'lowpass', f: 400 });
      if (inBar % 4 === 2) this.sfx.noiseBurst(bus, t, 0.07, 0.16, 1.4, { type: 'bandpass', f: 2000 });
      if (inBar % 2 === 1) this.sfx.noiseBurst(bus, t, 0.03, 0.06, 3, { type: 'highpass', f: 6000 });
    }
  }
}
