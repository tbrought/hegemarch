// The trailers (make.mjs makes them), made as a studio makes a trailer, out of the game's own things:
// its sectors played by its own houses, its pictures, its tunes and its sounds.
//
// - Each shot is long enough to see what it is, and its words long enough to read: a shot with words is
//   three and a half seconds at the least (most are four to six), and its words are up for nearly all of it. No shot is used twice in
//   a trailer, and the fighting is the houses' own, in their own colors (house against house, in five
//   sectors), not the Hollow's at the end of a run.
// - The music is built: a tune of the game's, arranged bar by bar (its bass and drums alone, then its
//   arpeggio, its melody at the head of a phrase), each run of bars a little louder, to the full tune.
//   Where the story moves from the cradle to the stars, the first tune comes home and its last chord
//   rings while the next one begins under it, softly. Nothing is heard that the game does not make
//   itself; the flame of the name kindles with the sound a world makes when it is kindled.
// - The words come as the game's decisions tell a story: a scan line, each line catching ember then gold,
//   then its own colors ({gold}, [teal], [!red]).
// - The picture is framed: black bars for the story, a vignette in dither, the night under the words.
//   What stays to a cut dissolves into the next shot, words and all.
// - Every shot is a whole number of bars of its tune (the cuts fall on the bar); every line is broken by
//   hand, and measured (make.mjs lints them before a frame is made).
// The moments are where `make.mjs scan` found them: the seed, the tick, the world, and who was fighting
// there. Every sector is medium, Hard, the houses all the game's AI; CRADLE is an Ages run on its cradle.
import fs from 'node:fs';

const scans = {};
const scan = (name) => (scans[name] ??= JSON.parse(fs.readFileSync(`promo/trailers/scan-${name}.json`, 'utf8')));
const S = (seed, extra = {}) => ({ seed, size: 'medium', heir: 'concord', difficulty: 2, ...extra });
const CRADLE = S(12, { ages: true });
const sec = (s) => Math.round(s * 20);
const min = (m) => Math.round(m * 60 * 20);
const sum = (shots) => shots.reduce((s, x) => s + x.dur, 0);
const at = (shots, i) => sum(shots.slice(0, i));

// A bar of each tune: eight steps of an eighth note. (A part of a tune is eight bars.)
const bar = (bpm) => (60 / bpm / 2) * 8;
const FF = bar(88); // First Fires: the cradle, A minor
const LR = bar(72); // Long Road: the cradle, D dorian
const HG = bar(112); // Hegemarch: the theme, A minor
const TA = bar(132); // To Arms: war, D minor
const ET = bar(96); // The Empty Throne: E minor
const BK = bar(140); // Breakers: war, E minor

// ------------------------------------------------------------------------------------------------
// The shots. Each takes its length, its words (or none) and a look ({ bars, vignette } and the like).
// ------------------------------------------------------------------------------------------------

/**
 * A line of the story at the foot of a shot, told as the game tells a decision's: a scan line sweeps down
 * it, and each line catches, ember then gold, then its own colours; then it stays.
 */
const say = (dur, lines, from = 0.5) => ({ at: from, until: dur - 0.15, style: 'lore', lines, y: 0.8 });
const words = (dur, lines, from) => (lines ? [say(dur, lines, from)] : []);
/** Words in the middle of the night, between shots. */
const card = (dur, lines, look = {}) => ({ blank: true, stars: true, dur, dither: 0.5, ...look,
  text: [{ at: 0.3, until: dur - 0.1, style: 'lore', lines, y: 0.5 }] });

/** The cradle, all of it, and the camera drawing in to one land of it as a tribe lights its first fire there. */
const firstFire = (dur, lines, look) => ({ sector: CRADLE, from: sec(20), dur, speed: 1.3, dither: 1.4, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, node: 10, zoom: 'fit', fit: 2.4 }], text: words(dur, lines, 0.8) });
/** The climb of the ages, as the title screen draws it, on the night; the ages' names under it. */
const climb = (dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.6, ...look,
  panels: [{ at: 0.2, until: dur + 1, kind: 'art', art: 'ages', x: 60, y: 46, w: 360, h: 96, scale: 3, bare: true }],
  text: [
    { at: 0.5, until: dur - 0.15, style: 'lore', lines, y: 0.66 },
    { at: 1.4, until: dur - 0.15, style: 'caption', lines: ['STONE · BRONZE · IRON · POWDER · MACHINE · SPACE'], y: 0.84, type: true, cps: 30 },
  ] });
/** The cradle late in its ages, every land lit: the camera draws back until it is small in the dark. */
const cradleLate = (dur, lines, look) => ({ sector: CRADLE, from: min(14.5), dur, speed: 4, dither: 0.6, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.3 }, { t: 1, zoom: 'fit', fit: 0.62 }], text: words(dur, lines) });
/** An Ark leaves the cradle: its lands go dark. */
const launch = (dur, lines, look) => ({ sector: CRADLE, from: min(21.62), dur, speed: 1.5, dither: 0.6, sounds: false, ...look,
  cam: [{ t: 0, node: 0, zoom: 'fit', fit: 1.5 }, { t: 1, node: 0, zoom: 'fit', fit: 1.2 }], text: words(dur, lines) });
/** The sector before anyone has lit it. */
const darkSector = (dur, lines, look) => ({ sector: S(90), from: 0, dur, speed: 0.4, dither: 1.2, sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.2 }, { t: 1, zoom: 'fit', fit: 1.38 }], text: words(dur, lines, 0.8) });
/**
 * A world kindled: the ring of the Concord's gold closes round a dark world, and it lights (the light
 * spreads over it from the moment of its kindling, for 0.8 s); then the camera draws back from it.
 */
const kindle = (dur, lines, look) => ({ sector: S(90), from: 603 - sec(0.9), dur, speed: 1, dither: 0.5, loud: 1.2, duck: 0.9, ...look,
  cam: [{ t: 0, node: 34, zoom: 0.5 }, { t: 2.2 / dur, node: 34, zoom: 0.5 }, { t: 1, node: 34, zoom: 0.24 }], text: words(dur, lines) });
/**
 * The houses at war, in their own colors (the scan's battles with two houses or more there, and neither the
 * Hollow nor raiders): the camera on the world they fight over, a second before the fighting is fiercest.
 */
const BATTLES = {
  goldOrange: [23, 23.47, 34, -40, 0], // the Concord and the Ashen Remnant, their fleets met beside a world
  redGoldViolet: [90, 18.12, 26, -20, 20], // the Vael, the Concord and the Lyceum, three fleets at one world
  tealViolet: [11, 30.12, 34, 0, 0], // the Wayfarers' hearth, the Lyceum and the Concord at it
  violetBlue: [47, 27.55, 45, 30, 0], // the Lyceum's swarm on the Choir
  tealBlue: [8, 34.22, 30, -30, 0], // the Wayfarers and the Choir
};
const battle = (which, dur, lines, look) => {
  const [seed, m, node, dx, dy] = BATTLES[which];
  // (With words at its foot, the fighting is lifted above them.)
  const up = dy + (lines ? -30 : 0);
  return { sector: S(seed), from: min(m) - 20, dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam: [{ t: 0, node, zoom: 0.3, dx, dy: up }, { t: 1, node, zoom: 0.34, dx, dy: up }], text: words(dur, lines) };
};
/** A house's hearth ringed by another's ships, and its fall (a little past the middle of the shot). */
const HEARTHS = { violetOnBlue: [47, 24], tealRing: [11, 42] };
const hearthFalls = (which, dur, lines, look) => {
  const [seed, node] = HEARTHS[which];
  const fall = scan(String(seed)).moments.find((m) => m.kind === 'hearth' && m.node === node).tick;
  return { sector: S(seed), from: fall - sec(dur * 0.55), dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam: [{ t: 0, node, zoom: 0.3, dy: lines ? -30 : 0 }, { t: 1, node, zoom: 0.35, dy: lines ? -30 : 0 }], text: words(dur, lines) };
};
/** A star erupts in a battle (a second and a little before the cut), and the camera draws back from it. */
const starfall = (dur, lines, look) => ({ sector: S(23), from: sec(2844.1 - (dur - 1.15)), dur, speed: 1, dither: 0.4, duck: 0.88, ...look,
  cam: [{ t: 0, node: 24, zoom: 0.22 }, { t: (dur - 1.2) / dur, node: 24, zoom: 0.22 }, { t: 1, node: 24, zoom: 0.16 }], text: words(dur, lines) });
const ALL = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
/**
 * The six houses' banners, coming one after another, with their names: two by three, each column wide enough
 * for the longest name (CHOIR OF THE FIRST FLAME), each row tall enough that its names are clear of the next.
 */
const sixBanners = (dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.6, ...look,
  panels: [{ at: 0.7, until: dur + 1, kind: 'banners', heirs: ALL, cols: 2, x: 40, y: 46, w: 400, h: 200, scale: 2, stagger: 0.4 }],
  text: [{ at: 0.2, until: dur - 0.1, style: 'lore', lines, y: 0.11 }] });
/** One of the game's pictures, large, on the night. */
const picture = (kind, dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.4, ...look,
  panels: [{ at: 0.1, until: dur + 1, kind: 'art', art: kind, x: 90, y: 36, w: 300, h: 150, scale: 3, bare: true }],
  text: [{ at: 0.5, until: dur - 0.15, style: 'lore', lines, y: 0.8 }] });

/** The name, as its flame kindles; what is under it; a question over it, if any. */
const logo = (dur, lines, question, look = {}) => ({ blank: true, stars: true, dur, dither: 0.4, vignette: 0.5, ...look,
  text: [
    ...(question ? [{ at: 1.4, until: dur, style: 'lore', lines: [question], y: 0.15 }] : []),
    { at: 0.1, until: dur, style: 'logo', lines },
  ] });
const PLAY = 'PLAY FREE IN YOUR BROWSER · HEGEMARCH.COM';
const MODES = 'CLASSIC · AGES · DAILY';


/** Each house: its name in its colour, its title, and a line of what it is (from its own). */
const HOUSES = {
  concord: ['SOLAR CONCORD', 'KEEPERS OF THE GOLDEN HEARTH', 'STEADY, STURDY AND RICH.', '#ffd23f'],
  vael: ['VAEL IMPERIUM', 'THE BLOOD-SWORN HOUSE', 'THE DARK IS WON IN FIRE.', '#e0402f'],
  wayfarer: ['WAYFARER CLANS', 'THE WANDERING HOUSE', 'FAST ON THE STARLANES.', '#2fd5a6'],
  lyceum: ['LYCEUM COLLECTIVE', 'THE HIVE-MINDED HOUSE', 'QUICK TO LEARN, QUICK TO SWARM.', '#b05cff'],
  choir: ['CHOIR OF THE FIRST FLAME', 'THE FAITHFUL HOUSE', 'THEY NEVER RUN.', '#3fa7ff'],
  ashen: ['ASHEN REMNANT', 'THE LAST OF THE OLD LIGHT', 'THEY GAMBLE ALL ON FATE.', '#ff8a1f'],
};
/** Two houses, one over the other: each its name in its colour, its banner, its title and what it is (inside the black bars). */
const pair = (dur, a, b, look) => {
  const rows = [[a, 0, 50], [b, 0.8, 162]];
  return { blank: true, stars: true, dur, dither: 0.5, ...look,
    panels: rows.map(([id, at, y]) => ({ at: 0.3 + at, until: dur + 1, kind: 'banners', heirs: [id], names: false, x: 90, y, w: 300, h: 48, scale: 2 })),
    text: rows.flatMap(([id, at, y]) => {
      const [name, title, line, color] = HOUSES[id];
      return [
        { at: 0.3 + at, until: dur + 1, style: 'lore', lines: [name], y: (y - 12) / 270, color, type: false },
        { at: 0.6 + at, until: dur + 1, style: 'caption', lines: [title], y: (y + 57) / 270, color: '#fff4e0' },
        { at: 0.8 + at, until: dur + 1, style: 'caption', lines: [line], y: (y + 68) / 270 },
      ];
    }) };
};


/** A trailer: its shots, its music (its tunes, arranged), and the flame of the name. */
const trailer = (shots, music, logoAt) => ({ shots, music, sounds: [[logoAt + 0.1, 'kindle', 0.8, 0]], sfxVol: 1.1 });
const cinema = { bars: 20, vignette: 0.5 };
/** The end of each: the name as its flame kindles, the last chord dying away under it, and the night. */
const END = 5.5;
const RING = 3.5;
const endCard = () => logo(END, ['FROM THE STONE AGE TO THE STARS', PLAY], null, { ...cinema, out: 1.2 });

// ------------------------------------------------------------------------------------------------
// The cradle: an Ages run's story, told before the stars.
// ------------------------------------------------------------------------------------------------

/** The opening: night, then the cradle world comes out of it, far off, as the drums begin; the words after. */
const dawn = (dur, lines, look) => ({ sector: CRADLE, from: 0, dur, speed: 1, dither: 2.6, sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 0.8 }, { t: 1, zoom: 'fit', fit: 1.02 }], text: words(dur, lines, dur > 6 ? 2.8 : 1.8) });
/** The tribes become houses: the cradle in the middle of its ages, all of it, its lands in their colors. */
const cradleMid = (dur, lines, look) => ({ sector: CRADLE, from: min(9.5), dur, speed: 3, dither: 0.6, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.05 }, { t: 1, zoom: 'fit', fit: 1.18 }], text: words(dur, lines) });
/** War on a cradle: the armies of the Machine age at a city (another cradle's: this one's wars are smaller). */
const cradleWar = (dur, lines, look) => ({ sector: S(3, { ages: true }), from: min(17.5) - 20, dur, speed: 1, dither: 0.5, loud: 1, duck: 0.9, ...look,
  cam: [{ t: 0, node: 1, zoom: 0.55, dy: lines ? -30 : 0 }, { t: 1, node: 1, zoom: 0.62, dy: lines ? -30 : 0 }], text: words(dur, lines) });

/**
 * The cradle, told the same in each: First Fires from its first bar (its home chord), the drums and the bass
 * alone, then its arpeggio, then its melody from the head of its second part; home at the end of that part,
 * and its chord dies away under the dark of the stars, as the next tune begins.
 */
const cradle = (short) =>
  short
    ? [
        dawn(FF * 2, ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'], cinema),
        firstFire(FF * 2, ['ITS TRIBES LIT', 'THEIR {FIRST FIRES}.'], cinema),
        climb(FF * 2, ['AGE BY AGE,', 'THEY [CLIMBED].'], cinema),
        cradleWar(FF * 2, ['AND THEY WENT', 'TO [!WAR].'], cinema),
        cradleLate(FF * 2, ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'], cinema),
        launch(FF * 2, ['THEY BUILT {ARKS},', 'AND LEFT FOR THE STARS.'], cinema),
      ]
    : [
        dawn(FF * 3, ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'], cinema),
        firstFire(FF * 2, ['ITS TRIBES LIT', 'THEIR {FIRST FIRES}.'], cinema),
        climb(FF * 3, ['AGE BY AGE,', 'THEY [CLIMBED].'], cinema),
        cradleMid(FF * 2, ['TRIBES BECAME', '{HOUSES},'], cinema),
        cradleWar(FF * 2, ['AND HOUSES WENT', 'TO [!WAR].'], cinema),
        cradleLate(FF * 2, ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'], cinema),
        launch(FF * 2, ['THEY BUILT {ARKS},', 'AND LEFT FOR THE STARS.'], cinema),
      ];
/** The bridge: the stars, dark; the cradle's chord dies away over it as the next tune begins under it, softly. */
const bridge = (dur) => darkSector(dur, ['BUT THE STARS', 'WERE [!DARK].'], cinema);
const firstFires = (short, until, ring) => ({ track: 'First Fires', at: 0, until, part: 0, fromBar: short ? 4 : 0, close: true, ring,
  arrangement: short
    ? [{ bars: 2, voices: 'bh', vol: 0.5 }, { bars: 2, voices: 'abh', vol: 0.62 }, { bars: 8, voices: 'ablh', vol: 0.85 }]
    : [{ bars: 3, voices: 'bh', vol: 0.5 }, { bars: 2, voices: 'abh', vol: 0.6 }, { bars: 3, voices: 'abh', vol: 0.7 }, { bars: 8, voices: 'ablh', vol: 0.85 }] });

// ------------------------------------------------------------------------------------------------
// 1. First Light: the cradle, then the theme of the game: a world lit, the six houses, the Boons, the
//    houses at war, a star erupting, a hearth falling.
// ------------------------------------------------------------------------------------------------
const a = [
  ...cradle(false),
  bridge(HG * 2),
  kindle(HG * 2, ['{LIGHT} THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  sixBanners(HG * 2, ['SIX {HOUSES} RISE.'], cinema),
  picture('boons', HG * 2, ['BEND FATE', 'WITH {BOONS}.'], cinema),
  battle('goldOrange', HG * 2, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema),
  battle('redGoldViolet', HG * 2, null, cinema),
  starfall(HG * 2, null, cinema),
  hearthFalls('violetOnBlue', HG * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 2. First Light, the houses: after the cradle, The Empty Throne, and the six houses, two by two.
// ------------------------------------------------------------------------------------------------
const b = [
  ...cradle(false),
  bridge(ET * 2),
  kindle(ET * 2, ['SIX {HOUSES} LIT THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  pair(ET * 2, 'concord', 'vael', cinema),
  pair(ET * 2, 'wayfarer', 'lyceum', cinema),
  pair(ET * 2, 'choir', 'ashen', cinema),
  picture('boons', ET * 2, ['BEND FATE', 'WITH {BOONS}.'], cinema),
  hearthFalls('violetOnBlue', ET * 4, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 3. First Light, to arms: after the cradle, To Arms, faster, with more of the war.
// ------------------------------------------------------------------------------------------------
const c = [
  ...cradle(false),
  bridge(TA * 2),
  kindle(TA * 2, ['{LIGHT} THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  sixBanners(TA * 3, ['SIX {HOUSES} RISE.'], cinema),
  picture('boons', TA * 2, ['BEND FATE', 'WITH {BOONS}.'], cinema),
  battle('tealViolet', TA * 3, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema),
  hearthFalls('violetOnBlue', TA * 4, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 4. First Light, short: the cradle told a little faster, and the stars in one part of the theme.
// ------------------------------------------------------------------------------------------------
const d = [
  ...cradle(true),
  bridge(HG * 2),
  kindle(HG * 2, ['{LIGHT} THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  sixBanners(HG * 2, ['SIX {HOUSES} RISE.'], cinema),
  picture('boons', HG * 2, ['BEND FATE', 'WITH {BOONS}.'], cinema),
  battle('goldOrange', HG * 2, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema),
  hearthFalls('violetOnBlue', HG * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  endCard(),
];

/** Where each act begins: the cradle's tune ends at the bridge, where the next begins; the name comes at the end. */
const acts = (shots) => {
  const i = shots.findIndex((x) => x.text?.[0]?.lines?.[1] === 'WERE [!DARK].');
  return { bridge: at(shots, i), ring: shots[i].dur, end: at(shots, shots.length - 1) };
};
const A = acts(a);
const B = acts(b);
const C = acts(c);
const D = acts(d);

export const TRAILERS = {
  'first-light': trailer(a, [
    firstFires(false, A.bridge, A.ring),
    // The theme from the fifth bar of a part (its home chord), its bass alone under the dying chord, then its
    // arpeggio; its melody from the head of the next part (the six houses); home at the end of a phrase of the
    // third, as a hearth falls.
    { track: 'Hegemarch', at: A.bridge, until: A.end, part: 0, fromBar: 4, close: true, ring: RING,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.45 }, { bars: 2, voices: 'ab', vol: 0.65 }, { bars: 8, voices: 'abld', vol: 0.86 }, { bars: 4, voices: 'ablde' }] },
  ], A.end),
  'first-light-houses': trailer(b, [
    firstFires(false, B.bridge, B.ring),
    // The Empty Throne, stately: its melody comes in with the houses, its drums with the war.
    { track: 'The Empty Throne', at: B.bridge, until: B.end, part: 0, fromBar: 4, close: true, ring: RING,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.45 }, { bars: 2, voices: 'ab', vol: 0.65 }, { bars: 8, voices: 'abl', vol: 0.85 }, { bars: 4, voices: 'abled' }] },
  ], B.end),
  'first-light-arms': trailer(c, [
    firstFires(false, C.bridge, C.ring),
    // To Arms: its bass under the dying chord, its drums with the first world lit, its melody from the head of a
    // part, its echo for the war.
    { track: 'To Arms', at: C.bridge, until: C.end, part: 0, fromBar: 4, close: true, ring: RING,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.5 }, { bars: 2, voices: 'bd', vol: 0.7 }, { bars: 8, voices: 'abld', vol: 0.85 }, { bars: 4, voices: 'ablde' }] },
  ], C.end),
  'first-light-short': trailer(d, [
    firstFires(true, D.bridge, D.ring),
    { track: 'Hegemarch', at: D.bridge, until: D.end, part: 0, fromBar: 4, close: true, ring: RING,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.45 }, { bars: 2, voices: 'ab', vol: 0.65 }, { bars: 6, voices: 'abld', vol: 0.86 }, { bars: 2, voices: 'ablde' }] },
  ], D.end),
};

// The music is checked as it is heard: each tune runs whole bars of its shots; it begins on its home chord; its
// melody comes in at the head of a part (bar 1 of 8, where its phrase begins); and it comes home only at the end
// of a phrase (bar 4 or 8).
const HOME_BARS = { 'First Fires': [0, 1, 4, 5], Hegemarch: [0, 4], 'The Empty Throne': [0, 4], 'To Arms': [0, 1, 4, 5] };
for (const [name, t] of Object.entries(TRAILERS)) {
  for (const m of t.music) {
    const bpm = { 'First Fires': 88, 'Long Road': 72, Hegemarch: 112, 'To Arms': 132, 'The Empty Throne': 96, Breakers: 140 }[m.track];
    const bars = (m.until - m.at) / bar(bpm);
    if (Math.abs(bars - Math.round(bars)) > 0.01) throw new Error(`${name}: ${m.track} runs ${bars.toFixed(2)} bars`);
    const arranged = (m.arrangement ?? []).reduce((s, x) => s + x.bars, 0);
    if (m.arrangement && arranged !== Math.round(bars)) throw new Error(`${name}: ${m.track} is arranged for ${arranged} bars of ${Math.round(bars)}`);
    const from = m.fromBar ?? 0;
    if (!HOME_BARS[m.track]?.includes(from)) throw new Error(`${name}: ${m.track} begins on bar ${from + 1}, not on its home chord`);
    if (m.close && (from + Math.round(bars)) % 4) throw new Error(`${name}: ${m.track} comes home in the middle of a phrase (bar ${(from + Math.round(bars)) % 8})`);
    let k = 0;
    let melody = false;
    for (const x of m.arrangement ?? []) {
      if (x.voices.includes('l') && !melody && (from + k) % 8) throw new Error(`${name}: ${m.track}'s melody comes in at bar ${((from + k) % 8) + 1} of a part`);
      melody ||= x.voices.includes('l');
      k += x.bars;
    }
  }
  // (Words are up long enough to read: a shot with words is three and a half seconds at the least.)
  for (const s of t.shots) if ((s.text ?? []).some((x) => x.style === 'lore') && s.dur < 3.4) throw new Error(`${name}: a shot of ${s.dur.toFixed(2)} s has words`);
}
