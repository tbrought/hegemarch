/**
 * The music: that the tunes are written right (every note where the harmony wants it), and that the
 * tracks of a mood come round in turn. Nothing here makes a sound: the sequencer is played into a list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawTrack, Music, TRACKS, trackSeconds, type Mood, type Track } from '../src/audio/Music';

const MOODS: Mood[] = ['title', 'night', 'war', 'cradle'];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const pc = (n: number) => ((n % 12) + 12) % 12;
const say = (n: number) => NAMES[pc(n)] + (Math.floor(n / 12) - 1);
const of = (mood: Mood) => TRACKS.filter((t) => t.mood === mood);

interface Note {
  at: number;
  len: number;
  n: number;
  chord: number[];
  where: string;
}

/** Every note of a part that sounds: where it starts, how many steps it lasts, and the chord under it. */
function notes(t: Track, id: string): Note[] {
  const p = t.parts[id];
  const out: Note[] = [];
  p.lead.forEach((n, i) => {
    if (!n) return;
    let len = 1;
    while (i + len < p.lead.length && p.lead[i + len] === 0) len++;
    const bar = Math.floor(i / t.steps);
    out.push({ at: i, len, n, chord: p.chords[bar], where: `${t.name} ${id} bar ${bar + 1} step ${(i % t.steps) + 1}: ${say(n)}` });
  });
  return out;
}

const tones = (chord: number[]) => chord.slice(1).map((i) => pc(chord[0] + i));
const each = (f: (t: Track, id: string, list: Note[]) => void) => {
  for (const t of TRACKS) for (const id of Object.keys(t.parts)) f(t, id, notes(t, id));
};

describe('the tunes are written right', () => {
  it('every mood has more than one track, and a quiet night, the mood heard most, has four', () => {
    for (const m of MOODS) expect(of(m).length, m).toBeGreaterThanOrEqual(2);
    expect(of('night').length).toBeGreaterThanOrEqual(4);
    expect(new Set(TRACKS.map((t) => t.name)).size).toBe(TRACKS.length);
  });

  it('a track is a form of parts that exist, and lasts long enough not to wear thin', () => {
    for (const t of TRACKS) {
      for (const [id, voices] of t.form) {
        expect(t.parts[id], `${t.name}: part ${id}`).toBeTruthy();
        expect(voices, `${t.name}: voices`).toMatch(/^[leabdh]+$/);
        // (An echo is the echo of a lead.)
        if (voices.includes('e')) expect(voices, `${t.name}: echo without lead`).toContain('l');
      }
      // Every part is heard, and the tune itself (it may wait for the second pass, never for the last).
      for (const id of Object.keys(t.parts)) expect(t.form.some(([f, v]) => f === id && v.includes('l')), `${t.name}: part ${id} is never played with its tune`).toBe(true);
      const s = trackSeconds(t);
      expect(s, `${t.name} lasts ${s.toFixed(0)} s`).toBeGreaterThan(75);
      expect(s, `${t.name} lasts ${s.toFixed(0)} s`).toBeLessThan(180);
    }
  });

  it('a part has a note, a hold or a rest for every step of every bar, and opens on a note or a rest', () => {
    for (const t of TRACKS) {
      for (const [id, p] of Object.entries(t.parts)) {
        expect(p.lead.length, `${t.name} ${id}`).toBe(p.chords.length * t.steps);
        expect(p.lead[0], `${t.name} ${id} opens with a hold`).not.toBe(0);
        for (const c of p.chords) expect(c.length).toBe(4);
        expect(t.arp.every((i) => i >= 1 && i <= 3)).toBe(true);
      }
    }
  });

  it('a melody stays where a pulse wave sings, moves by an octave at most, and holds no note over a bar line', () => {
    each((t, id, list) => {
      list.forEach((x, i) => {
        expect(x.n, x.where).toBeGreaterThanOrEqual(67);
        expect(x.n, x.where).toBeLessThanOrEqual(86);
        expect(x.len, `${x.where} is held over the bar line`).toBeLessThanOrEqual(t.steps - (x.at % t.steps));
        if (i > 0) expect(Math.abs(x.n - list[i - 1].n), `${x.where} leaps from ${say(list[i - 1].n)}`).toBeLessThanOrEqual(12);
      });
      expect(list.length, `${t.name} ${id}`).toBeGreaterThan(6);
    });
  });

  it('every note is in the key of its tune, or in the chord under it', () => {
    each((t, _id, list) => {
      for (const x of list) expect(t.scale.includes(pc(x.n)) || tones(x.chord).includes(pc(x.n)), `${x.where} is outside the key and the chord`).toBe(true);
    });
    // (And every chord is made of notes of the key, but for the leading note of a fifth.)
    for (const t of TRACKS) {
      for (const p of Object.values(t.parts)) {
        for (const c of p.chords) expect(tones(c).filter((x) => !t.scale.includes(x)).length, `${t.name}: chord on ${say(c[0])}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('no long note grinds against the chord: none sits a semitone above a note of it', () => {
    each((_t, _id, list) => {
      for (const x of list) {
        if (x.len < 3) continue;
        const ct = tones(x.chord);
        if (ct.includes(pc(x.n))) continue;
        expect(ct.includes(pc(x.n - 1)), `${x.where}, held ${x.len} steps, grinds against the chord on ${say(x.chord[0])}`).toBe(false);
      }
    });
  });

  it('a bar leans on its chord: the first note of a bar that is held is a note of the chord, or its second, fourth, sixth or seventh', () => {
    // (Which leaves out only the notes that fight it. The melodies were written to the chords; this keeps them so.)
    each((t, _id, list) => {
      for (const x of list) {
        if (x.at % t.steps !== 0 || x.len < 2) continue;
        const rel = pc(x.n - x.chord[0]);
        const minor = x.chord[2] === 3;
        const fine = [0, 2, 5, 7, 9, 10, minor ? 3 : 4, ...(minor ? [] : [11])];
        expect(fine.includes(rel), `${x.where} opens the bar against the chord on ${say(x.chord[0])}`).toBe(true);
      }
    });
  });

  it('a part ends on the way home: its last bar is the fifth of the key, or the home chord itself', () => {
    for (const t of TRACKS) {
      const home = t.parts[t.form[0][0]].chords[0][0];
      for (const [id, p] of Object.entries(t.parts)) {
        const last = pc(p.chords[p.chords.length - 1][0] - home);
        // (The fifth, the home chord, or the chords a step under and a third under it, which lead to it as well.)
        expect([7, 0, 10, 5].includes(last), `${t.name} ${id} ends on ${say(p.chords[p.chords.length - 1][0])}`).toBe(true);
      }
    }
  });
});

describe('the tracks of a mood come round in turn', () => {
  const rnd = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  it('every track once in each round, in a new order, and never the same one twice running', () => {
    for (const m of MOODS) {
      const pool = of(m);
      const bag: Track[] = [];
      const r = rnd(7);
      const got: string[] = [];
      for (let i = 0; i < pool.length * 12; i++) got.push(drawTrack(pool, bag, got[got.length - 1], r).name);
      for (let i = 1; i < got.length; i++) expect(got[i], `${m}: ${got[i]} twice running`).not.toBe(got[i - 1]);
      for (let i = 0; i < got.length; i += pool.length) expect(new Set(got.slice(i, i + pool.length)).size).toBe(pool.length);
      if (pool.length > 2) expect(new Set(Array.from({ length: 12 }, (_, k) => got.slice(k * pool.length, (k + 1) * pool.length).join())).size).toBeGreaterThan(1);
    }
  });
});

interface Tone {
  w: string;
  f: number;
  t: number;
  dur: number;
  vol: number;
}

/** A sequencer that plays into a list, on a clock the test turns. */
function rig(seed = 3) {
  const played: Tone[] = [];
  let drums = 0;
  /** What the music's own volume was told to do: [level, at]. */
  const levels: [number, number][] = [];
  const ctx = {
    currentTime: 0, state: 'running',
    createGain: () => ({ gain: { value: 0, setTargetAtTime: (v: number, t: number) => void levels.push([v, t]), cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
  };
  /** Notes asked for after their moment had passed (each would begin in the middle of its sound: a click). */
  let late = 0;
  const sfx = {
    ctx,
    musicGain: {},
    tone: (_d: unknown, w: string, f: number, _f1: number, t: number, dur: number, vol: number) => {
      if (t < ctx.currentTime - 1e-9) late++;
      played.push({ w, f, t, dur, vol });
    },
    noiseBurst: () => void drums++,
  };
  let s = seed;
  const music = new Music(sfx as never, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296));
  const inner = music as unknown as { pump(): void; seg: number; step: number };
  const heard: string[] = [];
  const run = (seconds: number) => {
    const end = ctx.currentTime + seconds;
    while (ctx.currentTime < end) {
      inner.pump();
      if (music.title && heard[heard.length - 1] !== music.title) heard.push(music.title);
      ctx.currentTime += 0.05;
    }
  };
  /** The silences: stretches in which nothing sounds, longest first. */
  const silences = () => {
    const sorted = [...played].sort((a, b) => a.t - b.t);
    const out: number[] = [];
    let end = sorted[0]?.t ?? 0;
    for (const x of sorted) {
      if (x.t > end) out.push(x.t - end);
      end = Math.max(end, x.t + x.dur);
    }
    return out.sort((a, b) => b - a);
  };
  return { music, inner, played, heard, run, silences, ctx, levels, drums: () => drums, late: () => late };
}

/** The steps of a track's part, and how long one lasts. */
const stepOf = (t: Track) => 60 / t.bpm / 2;
const byName = (name: string | null) => TRACKS.find((t) => t.name === name)!;

describe('played through', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('a session opens on the title screen with the theme the game is known by, and the other follows it', () => {
    const r = rig();
    r.music.play('title');
    expect(r.music.title).toBe('Hegemarch');
    r.run(trackSeconds(of('title')[0]) + 12);
    expect(r.heard.slice(0, 2)).toEqual(['Hegemarch', 'The Empty Throne']);
  });

  it('half an hour of quiet night: every track of the night, none twice running, each note in tune, a breath between tracks', () => {
    const r = rig();
    r.music.play('night');
    r.run(30 * 60);
    expect(new Set(r.heard).size).toBe(of('night').length);
    for (let i = 1; i < r.heard.length; i++) expect(r.heard[i]).not.toBe(r.heard[i - 1]);
    expect(r.heard.length).toBeGreaterThanOrEqual(10);
    for (const x of r.played) {
      const n = 69 + 12 * Math.log2(x.f / 440);
      expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-6);
      expect(x.dur).toBeGreaterThan(0);
    }
    // Between two tracks the night is silent for a few seconds, and never for long.
    const quiet = r.silences();
    expect(quiet[0]).toBeLessThan(8);
    expect(quiet.filter((q) => q > 2.5).length).toBeGreaterThanOrEqual(r.heard.length - 2);
    // (No more voices at once than an old sound chip had to give, and a few to spare for the echo.)
    const marks = r.played.flatMap((x) => [[x.t, 1], [x.t + x.dur, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0;
    let most = 0;
    for (const [, d] of marks) most = Math.max(most, (now += d));
    expect(most).toBeLessThanOrEqual(8);
  });

  it('now and then (as a run plays it by default): a minute or two of quiet after each calm track', () => {
    const r = rig();
    r.music.pace = 'sometimes';
    r.music.play('night');
    r.run(40 * 60);
    expect(new Set(r.heard).size).toBe(of('night').length);
    expect(r.heard.length).toBeGreaterThanOrEqual(6);
    const quiet = r.silences();
    expect(quiet.filter((q) => q > 55).length).toBeGreaterThanOrEqual(r.heard.length - 2);
    expect(quiet[0]).toBeLessThan(125);
  });

  it('now and then: a battle in the quiet has its music at once, and the quiet goes on after it, to the end it had', () => {
    const r = rig();
    r.music.pace = 'sometimes';
    r.music.play('night');
    r.run(trackSeconds(byName(r.music.title)) + 12);
    const quietEnds = (r.inner as unknown as { quietUntil: number }).quietUntil;
    expect(quietEnds - r.ctx.currentTime).toBeGreaterThan(45);
    const calm = r.played.length;
    r.music.play('war');
    r.run(1);
    expect(r.played.length).toBeGreaterThan(calm);
    // The fighting is over: the battle's music comes home, and nothing of the night comes until its quiet is over...
    r.music.settle('night');
    r.run(20);
    expect(r.music.playing).toBe('night');
    expect(r.played.filter((x) => x.t > r.ctx.currentTime - 10).length).toBe(0);
    // ...and then it does, when that quiet was to end.
    r.run(quietEnds - r.ctx.currentTime + 2);
    const after = r.played.filter((x) => x.t >= quietEnds - 0.01);
    expect(after.length).toBeGreaterThan(5);
    expect(Math.min(...after.map((x) => x.t))).toBeLessThan(quietEnds + 0.5);
  });

  it('a battle that is over plays to the end of its phrase and comes home: it never stops in the middle of a bar', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = rig(seed);
      r.music.play('night');
      r.run(30);
      r.music.play('war');
      const war = byName(r.music.title);
      // (Some way into the battle, at no bar in particular.)
      r.run(9 + seed * 1.37);
      const asked = r.ctx.currentTime;
      r.music.settle('night');
      expect(r.music.playing, 'the battle music plays on while it comes home').toBe('war');
      r.run(12);
      expect(r.music.playing).toBe('night');
      // Its last bar is the end of a phrase: four bars of its tune, counted from the start of its part.
      const step = stepOf(war);
      const phrase = 4 * war.steps * step;
      const home = r.played.filter((x) => x.w === 'tri' && x.dur >= 1.6 - 1e-9 && x.t > asked - 0.01);
      expect(home.length, `seed ${seed}: the battle's tune rings its home chord`).toBeGreaterThan(0);
      const at = home[0].t;
      expect(at - asked, `seed ${seed}: it comes home within a phrase`).toBeLessThanOrEqual(phrase + 0.31);
      // (The home chord falls on a bar line that ends a phrase: a whole number of four-bar phrases since the battle began.)
      const battleBegan = Math.min(...r.played.filter((x) => x.t > 30.2 && x.t < 31).map((x) => x.t));
      const phrases = (at - battleBegan) / phrase;
      expect(Math.abs(phrases - Math.round(phrases)), `seed ${seed}: ${phrases.toFixed(3)} phrases`).toBeLessThan(0.01);
      // Nothing of the battle's tune after its home chord but the chord itself; the night comes in after it rings.
      const after = r.played.filter((x) => x.t > at + 0.01);
      const ring = Math.max(1.6, step * 6);
      expect(after.filter((x) => x.t < at + ring).every((x) => x.t <= at + 2 * step + 1e-9), `seed ${seed}: the battle stops at its chord`).toBe(true);
      expect(Math.min(...after.filter((x) => x.t > at + 2 * step + 1e-9).map((x) => x.t)), `seed ${seed}: the night after the ring`).toBeGreaterThanOrEqual(at + ring);
      expect(r.late(), `seed ${seed}: late notes`).toBe(0);
    }
  });

  it('a battle that flares up again as its music is coming home goes on with it: nothing is cut', () => {
    const r = rig();
    r.music.play('war');
    const war = r.music.title;
    r.run(10);
    r.music.settle('night');
    r.run(0.5);
    r.music.play('war');
    r.run(20);
    expect(r.music.playing).toBe('war');
    expect(r.music.title).toBe(war);
    // (No silence in it longer than a battle's own breath.)
    expect(r.silences()[0] ?? 0).toBeLessThan(1.5);
    // And asked again and again as the fighting dies down (every frame), it ends once.
    for (let i = 0; i < 40; i++) {
      r.music.settle('night');
      r.run(0.05);
    }
    r.run(10);
    expect(r.music.playing).toBe('night');
  });

  it('a battle that is over gives the night back where it was, after a breath', () => {
    const r = rig();
    r.music.play('night');
    const track = r.music.title;
    r.run(40);
    const seg = r.inner.seg;
    r.music.play('war');
    r.run(15);
    r.music.settle('night');
    r.run(12);
    expect(r.music.playing).toBe('night');
    expect(r.music.title).toBe(track);
    // (Within a phrase of the battle's tune, its ring and a breath: no long silence.)
    const sorted = [...r.played].sort((a, b) => a.t - b.t);
    expect(r.silences()[0]).toBeLessThan(4);
    expect(sorted.length).toBeGreaterThan(0);
    expect(r.inner.seg).toBeGreaterThanOrEqual(seg);
  });

  it('with the music only for battles, a battle that is over ends on its home chord and leaves the quiet', () => {
    const r = rig();
    r.music.play('war');
    r.run(10);
    r.music.settle(null);
    r.run(10);
    expect(r.music.playing).toBeNull();
    const n = r.played.length;
    r.run(60);
    expect(r.played.length).toBe(n);
    expect(r.played.some((x) => x.w === 'tri' && x.dur >= 1.6 - 1e-9)).toBe(true);
  });

  it('a new run does not open in the quiet the last one ended in', () => {
    const r = rig();
    r.music.pace = 'sometimes';
    r.music.play('night');
    r.run(trackSeconds(byName(r.music.title)) + 10);
    // The run ends in the quiet; the results and the title screen; then a new run.
    r.music.play(null);
    r.music.play('title');
    r.run(5);
    r.music.forget();
    r.music.play('night');
    const began = r.ctx.currentTime;
    r.run(3);
    expect(r.played.filter((x) => x.t > began).length).toBeGreaterThan(3);
  });

  it('set to play often in the middle of a long quiet, the music comes back within seconds', () => {
    const r = rig();
    r.music.pace = 'sometimes';
    r.music.play('night');
    r.run(trackSeconds(byName(r.music.title)) + 10);
    const set = r.ctx.currentTime;
    r.music.pace = 'often';
    r.run(5);
    expect(r.played.filter((x) => x.t > set).length).toBeGreaterThan(3);
  });

  it('an hour of everything a run asks of it, in any order: it never stalls, never plays a note late, and every note is in tune', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const pace of ['often', 'sometimes'] as const) {
      const r = rig(5);
      r.music.pace = pace;
      r.music.play('night');
      let calm: Mood = 'night';
      const inner = r.inner as unknown as { pump(): void };
      for (let k = 0; k < 600; k++) {
        const roll = rnd();
        if (roll < 0.25) r.music.play('war');
        else if (roll < 0.5) r.music.settle(calm);
        else if (roll < 0.55) r.music.skip();
        else if (roll < 0.58) r.music.duck(2.2);
        else if (roll < 0.6) r.music.playTrack(TRACKS[Math.floor(rnd() * TRACKS.length)].name);
        else if (roll < 0.62) calm = calm === 'night' ? 'cradle' : 'night';
        else if (roll < 0.64) {
          // A frame that takes long: the clock runs on with no one there to schedule.
          r.ctx.currentTime += 0.2 + rnd() * 1.5;
        } else if (roll < 0.66) {
          // The page hidden: the sound sleeps, and its clock with it.
          r.ctx.state = 'suspended';
          for (let i = 0; i < 20; i++) inner.pump();
          r.ctx.state = 'running';
        }
        r.run(rnd() * 12);
        // (Whatever was asked, a mood that wants music has it, or is in a quiet it was told of.)
        if (r.music.playing && r.music.playing !== 'crown') expect(r.music.title, `step ${k}`).not.toBeNull();
      }
      // Then the calm music, left alone for a while: it plays (no quiet lasts longer than the setting's).
      r.music.settle(calm);
      r.run(20);
      r.music.play(calm);
      const from = r.ctx.currentTime;
      r.run(10 * 60);
      const quiet = r.silences();
      expect(quiet[0], pace).toBeLessThan(pace === 'often' ? 10 : 125);
      expect(r.played.filter((x) => x.t > from).length).toBeGreaterThan(500);
      expect(r.late(), pace).toBe(0);
      for (const x of r.played) {
        const n = 69 + 12 * Math.log2(x.f / 440);
        expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-6);
      }
    }
  });

  it('a melody is one voice: no note of it starts before the last has ended', () => {
    for (const t of TRACKS) {
      const r = rig();
      r.music.play(t.mood);
      for (let i = 0; i < 12 && r.music.title !== t.name; i++) r.music.skip();
      expect(r.music.title).toBe(t.name);
      r.played.length = 0;
      r.run(trackSeconds(t) - 1);
      const lead = r.played.filter((x) => x.w === t.leadWave && Math.abs(x.vol - t.leadVol) < 1e-9).sort((a, b) => a.t - b.t);
      expect(lead.length, t.name).toBeGreaterThan(20);
      for (let i = 1; i < lead.length; i++) expect(lead[i].t, `${t.name}: note ${i}`).toBeGreaterThanOrEqual(lead[i - 1].t + lead[i - 1].dur - 1e-9);
      // Its drums play if it has any (a quiet night has none, or the lightest).
      if (t.form.some(([, v]) => v.includes('d'))) expect(r.drums(), t.name).toBeGreaterThan(50);
    }
  });

  it('a battle does not wait: its tracks follow one another with no breath', () => {
    const r = rig();
    r.music.play('war');
    r.run(8 * 60);
    expect(new Set(r.heard).size).toBe(of('war').length);
    for (let i = 1; i < r.heard.length; i++) expect(r.heard[i]).not.toBe(r.heard[i - 1]);
    expect(r.silences()[0] ?? 0).toBeLessThan(1.5);
  });

  it('the cradle of an Ages run has its own tracks', () => {
    const r = rig();
    r.music.play('cradle');
    r.run(6 * 60);
    expect(new Set(r.heard)).toEqual(new Set(of('cradle').map((t) => t.name)));
  });

  it('a battle interrupts the night; afterwards the night picks its track up at the part it had reached', () => {
    const r = rig();
    r.music.play('night');
    const track = r.music.title!;
    const first = TRACKS.find((t) => t.name === track)!;
    const partSeconds = (first.parts[first.form[0][0]].chords.length * first.steps * 60) / first.bpm / 2;
    r.run(partSeconds * 2 + 5);
    expect(r.inner.seg).toBe(2);
    r.music.play('war');
    expect(r.music.playing).toBe('war');
    const battle = r.music.title;
    r.run(20);
    r.music.play('night');
    expect(r.music.title).toBe(track);
    expect(r.inner.seg).toBe(2);
    expect(r.inner.step).toBe(0);
    // The next battle goes on with the battle music it had, too.
    r.run(10);
    r.music.play('war');
    expect(r.music.title).toBe(battle);
  });

  it('a track picked from the list plays from where its tune comes in, and its mood goes on from it', () => {
    for (const t of TRACKS) {
      const r = rig();
      r.music.play('title');
      r.run(5);
      r.music.playTrack(t.name);
      expect(r.music.title).toBe(t.name);
      expect(r.music.playing).toBe(t.mood);
      expect(t.form[r.inner.seg][1], t.name).toContain('l');
      r.played.length = 0;
      r.run(12);
      // (The tune is heard within seconds, not after a pass of bass alone.)
      expect(r.played.some((x) => x.w === t.leadWave && Math.abs(x.vol - t.leadVol) < 1e-9), t.name).toBe(true);
      r.run(trackSeconds(t) + 15);
      // (A crowning has one tune, and comes round to it again; every other mood moves on to another.)
      if (of(t.mood).length > 1) expect(r.heard[r.heard.length - 1]).not.toBe(t.name);
      expect(TRACKS.find((x) => x.name === r.music.title)!.mood).toBe(t.mood);
    }
    const r = rig();
    r.music.playTrack('no such track');
    expect(r.music.playing).toBeNull();
  });

  it("asked to wait, it is silent first: the fanfare of a run's end is heard alone", () => {
    const r = rig();
    r.music.play('night');
    r.run(20);
    // The run ends: the music stops...
    r.music.play(null);
    const ended = r.ctx.currentTime;
    r.run(1);
    const still = r.played.filter((x) => x.t > ended + 0.3).length;
    expect(still).toBe(0);
    // ...and the music of the results waits for the fanfare, however soon it is asked for.
    r.music.play('title', 1.6);
    r.run(6);
    const after = r.played.filter((x) => x.t > ended + 0.3);
    expect(after.length).toBeGreaterThan(10);
    expect(Math.min(...after.map((x) => x.t))).toBeGreaterThanOrEqual(ended + 1 + 1.6 - 1e-6);
    expect(r.music.playing).toBe('title');
  });

  it('it steps back for something said over it, and comes forward again', () => {
    const r = rig();
    r.music.duck(2);
    expect(r.levels.length).toBe(0);
    r.music.play('cradle');
    r.run(5);
    r.levels.length = 0;
    const at = r.ctx.currentTime;
    r.music.duck(2.2);
    expect(r.levels.map(([v, t]) => [v, Math.round((t - at) * 10) / 10])).toEqual([[0.2, 0], [1, 2.2]]);
    // (It plays on underneath: the track is where it was.)
    const title = r.music.title;
    r.run(3);
    expect(r.music.title).toBe(title);
    expect(r.music.playing).toBe('cradle');
  });

  it('asked for the mood it is in, it plays on; asked for none, it stops', () => {
    const r = rig();
    r.music.play('night');
    r.run(10);
    const track = r.music.title;
    const seg = r.inner.seg;
    const step = r.inner.step;
    r.music.play('night');
    expect([r.music.title, r.inner.seg, r.inner.step]).toEqual([track, seg, step]);
    r.music.play(null);
    expect(r.music.playing).toBeNull();
    const n = r.played.length;
    r.run(30);
    expect(r.played.length).toBe(n);
  });
});

describe('in a run (app/sound.ts)', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('the Hearth under fire brings the battle music; when the fighting stops it comes home, and the night follows it', async () => {
    const { pickMusic } = await import('../src/app/sound');
    const r = rig();
    const app = { music: r.music, warHeat: 0, profile: { settings: { musicPace: 'often' } } };
    const hearth = { owner: 0, lastHit: 99 };
    const g = { outcome: null, player: { id: 0 }, tick: 0, cradle: false, nodes: [hearth], unitList: [] };
    /** Frames of the game, twenty a second (a tick each), with the music's clock. */
    const frames = (seconds: number) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.05) {
        g.tick++;
        pickMusic(app as never, g as never, 0.05);
        r.run(0.05);
      }
    };
    r.music.play('night');
    frames(10);
    const night = r.music.title;
    hearth.lastHit = 0;
    frames(15);
    expect(r.music.playing).toBe('war');
    // The fighting stops. The battle music lasts while the heat dies down (a minute at most), then to the end of its phrase.
    hearth.lastHit = 99;
    let ending = -1;
    for (let s = 0; s < 70 && r.music.playing === 'war'; s += 0.5) {
      frames(0.5);
      if (ending < 0 && app.warHeat <= 0.5) ending = r.ctx.currentTime;
    }
    expect(r.music.playing).toBe('night');
    expect(r.music.title).toBe(night);
    expect(r.ctx.currentTime - ending).toBeLessThan(8);
    expect(r.played.some((x) => x.w === 'tri' && x.dur >= 1.6 - 1e-9 && x.t > ending - 0.5)).toBe(true);
    // A battle that flares up again as its music is ending goes on with it.
    hearth.lastHit = 0;
    frames(15);
    hearth.lastHit = 99;
    while (app.warHeat > 0.5) frames(0.5);
    frames(1);
    expect(r.music.playing).toBe('war');
    hearth.lastHit = 0;
    frames(3);
    hearth.lastHit = 99;
    frames(10);
    expect(r.music.playing).toBe('war');
    expect(r.late()).toBe(0);
  });
});
