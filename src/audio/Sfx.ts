/**
 * Chiptune sound effects: pulse waves (12.5% / 25% / 50% duty), a triangle and noise, the voices of
 * an old cartridge. Everything is synthesized; there are no audio files.
 */
import type { Settings } from '../meta/profile';

export type SoundId =
  | 'ui' | 'select' | 'order' | 'error' | 'laser' | 'bolt' | 'flak' | 'shell' | 'lance' | 'missile' | 'boom' | 'bigboom'
  | 'jump' | 'kindle' | 'capture' | 'alert' | 'good' | 'boon' | 'victory' | 'defeat' | 'ability' | 'build' | 'tick' | 'armed' | 'nova'
  | 'deal' | 'rare' | 'epic' | 'legendary' | 'pact' | 'levelup'
  // An ability cast, each its own (1.26: audio/battleSounds.ts CAST_SOUND); 'ability' is the Hollow's pulse.
  | 'cast-aegis' | 'cast-barrage' | 'cast-nanite' | 'cast-strikewing' | 'cast-emp' | 'cast-conversion' | 'cast-lance'
  | 'cast-overdrive' | 'cast-rally' | 'cast-snare' | 'cast-repair';

type Wave = 'p12' | 'p25' | 'p50' | 'tri';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Seconds ahead of the clock a sound is set to begin. The page sees the audio clock move a block at a time
 * (512 samples, 10.7 ms, on Windows), and the block after it may already be in hand: a sound set to begin
 * inside it began late, from the middle of its rise, all at once: a click. (Until 1.25.1 it was 5 ms.)
 */
const AHEAD = 0.03;

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  private waves = new Map<Wave, PeriodicWave>();
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<SoundId, number>();
  private voices = 0;
  /**
   * One panner for each place in the stereo field (in tenths), made when first wanted and kept: a sound
   * goes through the one for its place. (Until 1.25.1 every sound had a panner of its own, kept for three
   * seconds: in a big battle, hundreds of them, all at work.)
   */
  private panners = new Map<number, StereoPannerNode>();
  /**
   * Pitch factor for the sound effect being played (combat sounds wobble a little). It is set only
   * while play() runs: the music shares tone(), and a factor left over from a gunshot would put
   * every note after it out of tune.
   */
  private pitch = 1;
  private settings: Settings;
  /** Put to sleep because the page was hidden (see `hush`), not by the browser. */
  private hushed = false;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /**
   * Is sound coming out? In most browsers none may start before the first click or key on the page
   * (a visitor who came from a click on the same site is the exception: the click carries over).
   */
  get live(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * Make the sound engine, or wake it. Called when the page opens, where it plays at once if the
   * browser lets it, and at every click and key, the first of which starts it everywhere else.
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    // The last stage: a limiter that holds everything under full scale, however much plays at once and
    // however loud the settings (a speaker cannot play past it, and what goes past crackles).
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.master.connect(limiter);
    limiter.connect(c.destination);
    this.sfxGain = c.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = c.createGain();
    this.musicGain.connect(this.master);
    for (const [w, duty] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]] as [Wave, number][]) {
      const N = 32;
      const real = new Float32Array(N);
      const imag = new Float32Array(N);
      for (let k = 1; k < N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      this.waves.set(w, c.createPeriodicWave(real, imag));
    }
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    // An LFSR-style noise, closer to the 8-bit noise channel than white noise.
    let lfsr = 0x7fff;
    for (let i = 0; i < len; i++) {
      if (i % 3 === 0) {
        const bit = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (bit << 14);
      }
      d[i] = lfsr & 1 ? 0.8 : -0.8;
    }
    this.apply(this.settings);
  }

  /**
   * The page is hidden (another tab), or shown again. A hidden page does not draw, so the game stands
   * still there; its music played on over a game that had stopped. Now the sound stops with it, and
   * comes back where it was.
   */
  hush(hidden: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (hidden && c.state === 'running') {
      this.hushed = true;
      void c.suspend();
    } else if (!hidden && this.hushed) {
      this.hushed = false;
      void c.resume();
    }
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ctx || !this.master || !this.sfxGain || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master * 0.6, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.02);
    this.musicGain.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
  }

  wave(w: Wave): PeriodicWave | null {
    return this.waves.get(w) ?? null;
  }

  /** A tone with a pitch envelope. Returns nothing; nodes stop themselves. */
  tone(dest: AudioNode, w: Wave, f0: number, f1: number, t0: number, dur: number, vol: number, attack = 0.002) {
    const c = this.ctx!;
    f0 *= this.pitch;
    f1 *= this.pitch;
    const o = c.createOscillator();
    if (w === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(this.waves.get(w)!);
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    // (Silent from the moment it is made: see noiseBurst.)
    const gn = c.createGain();
    gn.gain.value = 0;
    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(vol, t0 + attack);
    gn.gain.setValueAtTime(vol, t0 + Math.max(attack, dur * 0.6));
    gn.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(gn);
    gn.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    this.voices++;
    o.onended = () => {
      this.voices--;
      gn.disconnect();
    };
  }

  noiseBurst(dest: AudioNode, t0: number, dur: number, vol: number, rate = 1, filter?: { type: BiquadFilterType; f: number }) {
    const c = this.ctx!;
    if (!this.noise) return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    // Silent from the moment it is made, and from silence in four thousandths of a second. A gain is made at
    // full strength, and only turned down at the sound's moment: the noise's first sample, a sample before
    // that, went through at full strength, a click; and a burst begun at full strength began with another.
    // A battle's bolts and flak, twenty a second each, made a crackle of them (a player heard it, 1.25.1).
    const gn = c.createGain();
    gn.gain.value = 0;
    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    gn.gain.exponentialRampToValueAtTime(0.001, t0 + Math.max(dur, 0.008));
    let node: AudioNode = s;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.f;
      s.connect(f);
      node = f;
    }
    node.connect(gn);
    gn.connect(dest);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
    this.voices++;
    s.onended = () => {
      this.voices--;
      gn.disconnect();
    };
  }

  /** One clear note (a MIDI number), for a thing that rings a scale: the worlds lighting at a crowning. */
  note(n: number, vol = 0.3, dur = 0.14) {
    const c = this.ctx;
    if (!c || !this.sfxGain || c.state !== 'running') return;
    const t = c.currentTime + AHEAD;
    this.tone(this.sfxGain, 'p25', midi(n), midi(n), t, dur, vol * 0.35);
    this.tone(this.sfxGain, 'tri', midi(n - 12), midi(n - 12), t, dur * 1.6, vol * 0.3);
  }

  play(id: SoundId, vol = 0.5, pan = 0) {
    const c = this.ctx;
    if (!c || !this.sfxGain || c.state !== 'running') return;
    const now = c.currentTime;
    const gap = id === 'laser' || id === 'bolt' || id === 'flak' ? 0.05 : id === 'boom' ? 0.04 : 0.02;
    if ((this.lastPlay.get(id) ?? -1) > now - gap) return;
    if (this.voices > 40 && !['ui', 'alert', 'kindle', 'victory', 'defeat', 'boon', 'error'].includes(id)) return;
    this.lastPlay.set(id, now);
    this.pitch = ['laser', 'bolt', 'flak', 'shell', 'lance', 'missile', 'boom', 'bigboom', 'jump'].includes(id) ? 0.94 + Math.random() * 0.12 : 1;
    let dest: AudioNode = this.sfxGain;
    const place = Math.round(Math.max(-1, Math.min(1, pan)) * 10);
    if (place !== 0 && c.createStereoPanner) {
      let p = this.panners.get(place);
      if (!p) {
        p = c.createStereoPanner();
        p.pan.value = place / 10;
        p.connect(this.sfxGain);
        this.panners.set(place, p);
      }
      dest = p;
    }
    const v = vol * 0.35;
    const t = now + AHEAD;
    try {
      this.effect(id, dest, t, v);
    } finally {
      this.pitch = 1;
    }
  }

  private effect(id: SoundId, dest: AudioNode, t: number, v: number) {
    switch (id) {
      case 'ui':
        this.tone(dest, 'p25', 880, 1320, t, 0.045, v * 0.8);
        break;
      case 'tick':
        this.tone(dest, 'p12', 1760, 1760, t, 0.02, v * 0.5);
        break;
      case 'select':
        this.tone(dest, 'tri', 660, 660, t, 0.04, v);
        this.tone(dest, 'tri', 990, 990, t + 0.04, 0.04, v);
        break;
      case 'order':
        this.tone(dest, 'p12', 523, 784, t, 0.06, v * 0.8);
        this.tone(dest, 'p12', 784, 1046, t + 0.06, 0.05, v * 0.6);
        break;
      case 'error':
        this.tone(dest, 'p50', 180, 160, t, 0.07, v * 0.7);
        this.tone(dest, 'p50', 150, 130, t + 0.09, 0.09, v * 0.7);
        break;
      case 'laser':
        this.tone(dest, 'p12', 1500, 500, t, 0.08, v * 0.45);
        break;
      case 'bolt':
        this.noiseBurst(dest, t, 0.03, v * 0.35, 2.5, { type: 'highpass', f: 3000 });
        this.tone(dest, 'p25', 900, 600, t, 0.025, v * 0.25);
        break;
      case 'flak':
        this.noiseBurst(dest, t, 0.05, v * 0.4, 1.6, { type: 'bandpass', f: 1800 });
        break;
      case 'shell':
        this.tone(dest, 'tri', 140, 45, t, 0.18, v * 0.9);
        this.noiseBurst(dest, t, 0.1, v * 0.35, 0.6, { type: 'lowpass', f: 900 });
        break;
      case 'lance':
        this.tone(dest, 'p25', 300, 1900, t, 0.12, v * 0.55);
        this.tone(dest, 'p12', 1900, 1200, t + 0.12, 0.08, v * 0.3);
        break;
      case 'missile':
        this.noiseBurst(dest, t, 0.16, v * 0.25, 1.2, { type: 'bandpass', f: 2500 });
        break;
      case 'boom':
        this.noiseBurst(dest, t, 0.3, v * 0.9, 0.5, { type: 'lowpass', f: 1400 });
        this.tone(dest, 'tri', 110, 35, t, 0.22, v * 0.8);
        break;
      case 'bigboom':
        this.noiseBurst(dest, t, 0.8, v * 1.1, 0.3, { type: 'lowpass', f: 900 });
        this.tone(dest, 'tri', 90, 25, t, 0.6, v);
        this.noiseBurst(dest, t + 0.12, 0.5, v * 0.5, 0.25, { type: 'lowpass', f: 500 });
        break;
      case 'armed':
        // A Starfall is armed: three falling notes over a low drone.
        for (let i = 0; i < 3; i++) this.tone(dest, 'p25', 440, 220, t + i * 0.24, 0.2, v * 0.45);
        this.tone(dest, 'tri', 55, 55, t, 0.8, v * 0.6);
        break;
      case 'nova':
        // A star erupts: a rising whine, then a long roar that falls away.
        this.tone(dest, 'p12', 200, 2400, t, 0.35, v * 0.3);
        this.noiseBurst(dest, t + 0.3, 1.8, v * 1.1, 0.2, { type: 'lowpass', f: 700 });
        this.tone(dest, 'tri', 120, 20, t + 0.3, 1.4, v);
        this.noiseBurst(dest, t + 0.7, 1.2, v * 0.5, 0.2, { type: 'lowpass', f: 300 });
        break;
      case 'jump':
        this.tone(dest, 'p50', 200, 1100, t, 0.22, v * 0.35);
        this.tone(dest, 'p12', 400, 2200, t + 0.03, 0.2, v * 0.2);
        break;
      case 'kindle': {
        // The kindle jingle: a bright rising arpeggio over a warm bass.
        const notes = [72, 76, 79, 84, 88];
        notes.forEach((n, i) => this.tone(dest, 'p25', midi(n), midi(n), t + i * 0.07, 0.12, v * 0.55));
        this.tone(dest, 'p12', midi(91), midi(91), t + 0.36, 0.3, v * 0.35);
        this.tone(dest, 'tri', midi(48), midi(48), t, 0.45, v * 0.8);
        this.tone(dest, 'tri', midi(55), midi(55), t + 0.2, 0.3, v * 0.6);
        break;
      }
      case 'capture': {
        const notes = [67, 71, 74, 79];
        notes.forEach((n, i) => this.tone(dest, 'p50', midi(n), midi(n), t + i * 0.08, 0.12, v * 0.45));
        this.tone(dest, 'tri', midi(43), midi(43), t, 0.4, v * 0.7);
        break;
      }
      case 'alert':
        for (let i = 0; i < 2; i++) {
          this.tone(dest, 'p50', 880, 880, t + i * 0.26, 0.12, v * 0.5);
          this.tone(dest, 'p50', 660, 660, t + i * 0.26 + 0.13, 0.12, v * 0.5);
        }
        break;
      case 'good':
        [76, 79, 84].forEach((n, i) => this.tone(dest, 'p25', midi(n), midi(n), t + i * 0.06, 0.09, v * 0.45));
        break;
      case 'boon':
        [79, 83, 86, 91, 95].forEach((n, i) => this.tone(dest, 'p12', midi(n), midi(n), t + i * 0.05, 0.1, v * 0.4));
        [79, 86, 91].forEach((n, i) => this.tone(dest, 'p12', midi(n), midi(n), t + 0.3 + i * 0.05, 0.08, v * 0.15));
        break;
      case 'ability':
        this.tone(dest, 'p25', 400, 1600, t, 0.15, v * 0.4);
        this.noiseBurst(dest, t, 0.2, v * 0.25, 1.5, { type: 'highpass', f: 2000 });
        break;
      // The abilities, each its own: what the eye sees in its shape, the ear hears in its sound.
      case 'cast-aegis':
        // A bright chord, rising into place: C, E, G, and the C over them.
        [72, 76, 79, 84].forEach((n, i) => this.tone(dest, 'p25', midi(n), midi(n), t + i * 0.035, 0.42 - i * 0.04, v * 0.22, 0.01));
        this.tone(dest, 'tri', midi(48), midi(48), t, 0.4, v * 0.35, 0.01);
        break;
      case 'cast-barrage':
        // Twelve launches, quick as they go.
        for (let i = 0; i < 12; i++) this.tone(dest, 'p12', 1300 - i * 25, 650, t + i * 0.028, 0.035, v * 0.26);
        this.noiseBurst(dest, t, 0.34, v * 0.18, 1.2, { type: 'bandpass', f: 2200 });
        break;
      case 'cast-nanite':
        // A trill that climbs: the cloud going out.
        for (let i = 0; i < 9; i++) this.tone(dest, 'p12', midi(81 + (i % 2) * 2 + Math.floor(i / 3)), midi(81 + (i % 2) * 2 + Math.floor(i / 3)), t + i * 0.032, 0.03, v * 0.2);
        break;
      case 'cast-strikewing':
        // Six blips, one for each Fighter, rising.
        for (let i = 0; i < 6; i++) this.tone(dest, 'p25', midi(67 + i * 2), midi(71 + i * 2), t + i * 0.055, 0.045, v * 0.28);
        break;
      case 'cast-emp':
        // A crackle, and a fall.
        this.noiseBurst(dest, t, 0.22, v * 0.35, 2.2, { type: 'bandpass', f: 3200 });
        this.tone(dest, 'p12', 1700, 260, t, 0.24, v * 0.3);
        break;
      case 'cast-conversion':
        // The Choir's chord: three voices that swell, F, A and C, the low F under them.
        [65, 69, 72].forEach((n, i) => this.tone(dest, 'p50', midi(n), midi(n), t + i * 0.04, 0.75, v * 0.14, 0.12));
        this.tone(dest, 'tri', midi(53), midi(53), t, 0.8, v * 0.3, 0.1);
        break;
      case 'cast-lance':
        // A charge that climbs, the shot, and the blow landing low.
        this.tone(dest, 'p25', 220, 1900, t, 0.11, v * 0.35);
        this.tone(dest, 'p12', 1900, 900, t + 0.11, 0.09, v * 0.3);
        this.tone(dest, 'tri', 110, 38, t + 0.12, 0.3, v * 0.7);
        this.noiseBurst(dest, t + 0.12, 0.2, v * 0.35, 0.5, { type: 'lowpass', f: 1200 });
        break;
      case 'cast-overdrive':
        // An engine winding up, and two quick shots.
        this.tone(dest, 'p25', 200, 900, t, 0.16, v * 0.3);
        this.tone(dest, 'p12', 1400, 1400, t + 0.17, 0.025, v * 0.25);
        this.tone(dest, 'p12', 1400, 1400, t + 0.21, 0.025, v * 0.25);
        break;
      case 'cast-rally':
        // A horn call: a fifth, up.
        this.tone(dest, 'p50', midi(60), midi(60), t, 0.12, v * 0.24, 0.01);
        this.tone(dest, 'p50', midi(67), midi(67), t + 0.12, 0.22, v * 0.24, 0.01);
        this.tone(dest, 'tri', midi(48), midi(48), t, 0.34, v * 0.3, 0.01);
        break;
      case 'cast-snare':
        // A pull, falling and slowing.
        this.tone(dest, 'tri', 520, 110, t, 0.45, v * 0.5);
        this.tone(dest, 'p12', 260, 140, t, 0.4, v * 0.16);
        break;
      case 'cast-repair':
        // The trill of mending, lower and shorter: a ship's own drones.
        for (let i = 0; i < 5; i++) this.tone(dest, 'p12', midi(74 + (i % 2) * 2), midi(74 + (i % 2) * 2), t + i * 0.035, 0.03, v * 0.18);
        break;
      case 'build':
        this.tone(dest, 'tri', midi(67), midi(67), t, 0.06, v * 0.5);
        this.tone(dest, 'tri', midi(74), midi(74), t + 0.06, 0.08, v * 0.5);
        break;
      // A Boon offer is dealt: a card's place appears, and each card once it is there, by its rarity.
      case 'deal':
        this.tone(dest, 'tri', midi(55), midi(55), t, 0.035, v * 0.7);
        this.noiseBurst(dest, t, 0.02, v * 0.15, 1, { type: 'highpass', f: 4000 });
        break;
      case 'rare':
        [79, 86].forEach((n, i) => this.tone(dest, 'p25', midi(n), midi(n), t + i * 0.06, 0.08, v * 0.4));
        break;
      case 'epic':
        [71, 74, 79, 83, 86].forEach((n, i) => this.tone(dest, 'p25', midi(n), midi(n), t + i * 0.045, 0.08, v * 0.4));
        this.tone(dest, 'p12', midi(98), midi(98), t + 0.24, 0.14, v * 0.18);
        this.tone(dest, 'tri', midi(47), midi(47), t, 0.3, v * 0.6);
        break;
      case 'legendary': {
        // An item found, as an old cartridge would have it: a run up, a held top note, a sparkle.
        [67, 71, 74, 79].forEach((n, i) => this.tone(dest, 'p50', midi(n), midi(n), t + i * 0.07, 0.09, v * 0.35));
        [83, 86].forEach((n, i) => this.tone(dest, 'p50', midi(n), midi(n), t + 0.3 + i * 0.09, 0.1, v * 0.35));
        this.tone(dest, 'p50', midi(91), midi(91), t + 0.5, 0.45, v * 0.3);
        [43, 50, 55].forEach((n, i) => this.tone(dest, 'tri', midi(n), midi(n), t + i * 0.18, 0.2, v * 0.6));
        [98, 103, 98, 103].forEach((n, i) => this.tone(dest, 'p12', midi(n), midi(n), t + 0.55 + i * 0.07, 0.05, v * 0.12));
        break;
      }
      case 'levelup':
        // A ship powers up: a whine rising as the rings close on it, and a chord as its window kindles (0.6 s in).
        this.tone(dest, 'p25', 220, 880, t, 0.55, v * 0.2);
        this.tone(dest, 'p12', 440, 1760, t + 0.1, 0.45, v * 0.1);
        [72, 76, 79, 84].forEach((n) => this.tone(dest, 'p25', midi(n), midi(n), t + 0.6, 0.3, v * 0.2));
        this.tone(dest, 'tri', midi(48), midi(48), t + 0.6, 0.4, v * 0.6);
        break;
      case 'pact':
        [55, 51, 46].forEach((n, i) => this.tone(dest, 'p50', midi(n), midi(n), t + i * 0.1, 0.12, v * 0.35));
        this.noiseBurst(dest, t, 0.35, v * 0.2, 0.5, { type: 'lowpass', f: 900 });
        break;
      case 'victory': {
        const mel: [number, number, number][] = [[72, 0, 0.15], [72, 0.16, 0.08], [72, 0.25, 0.08], [76, 0.34, 0.3], [79, 0.66, 0.15], [76, 0.82, 0.12], [84, 0.95, 0.6]];
        for (const [n, at, d] of mel) this.tone(dest, 'p25', midi(n), midi(n), t + at, d, v * 0.6);
        for (const [n, at, d] of [[48, 0, 0.3], [55, 0.34, 0.3], [60, 0.66, 0.25], [48, 0.95, 0.7]] as [number, number, number][]) this.tone(dest, 'tri', midi(n), midi(n), t + at, d, v * 0.8);
        break;
      }
      case 'defeat': {
        const mel: [number, number, number][] = [[67, 0, 0.3], [63, 0.32, 0.3], [60, 0.64, 0.3], [55, 0.96, 0.9]];
        for (const [n, at, d] of mel) this.tone(dest, 'p50', midi(n), midi(n) * 0.98, t + at, d, v * 0.45);
        this.tone(dest, 'tri', midi(36), midi(31), t, 1.8, v * 0.7);
        break;
      }
    }
  }
}
