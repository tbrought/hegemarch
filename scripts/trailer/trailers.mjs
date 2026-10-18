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
/** The cradle late in its ages, every land lit. */
const cradleLate = (dur, lines, look) => ({ sector: CRADLE, from: min(14.5), dur, speed: 4, dither: 0.6, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.15 }, { t: 1, zoom: 'fit', fit: 1.3 }], text: words(dur, lines) });
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
  return { sector: S(seed), from: min(m) - 20, dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam: [{ t: 0, node, zoom: 0.3, dx, dy }, { t: 1, node, zoom: 0.34, dx, dy }], text: words(dur, lines) };
};
/** A house's hearth ringed by another's ships, and its fall (a little past the middle of the shot). */
const HEARTHS = { violetOnBlue: [47, 24], tealRing: [11, 42] };
const hearthFalls = (which, dur, lines, look) => {
  const [seed, node] = HEARTHS[which];
  const fall = scan(String(seed)).moments.find((m) => m.kind === 'hearth' && m.node === node).tick;
  return { sector: S(seed), from: fall - sec(dur * 0.55), dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam: [{ t: 0, node, zoom: 0.3 }, { t: 1, node, zoom: 0.35 }], text: words(dur, lines) };
};
/** A star erupts in a battle (a second and a little before the cut), and the camera draws back from it. */
const starfall = (dur, lines, look) => ({ sector: S(23), from: sec(2844.1 - (dur - 1.15)), dur, speed: 1, dither: 0.4, duck: 0.88, ...look,
  cam: [{ t: 0, node: 24, zoom: 0.22 }, { t: (dur - 1.2) / dur, node: 24, zoom: 0.22 }, { t: 1, node: 24, zoom: 0.16 }], text: words(dur, lines) });
const ALL = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
/** The six houses' banners, coming one after another, with their names. */
const sixBanners = (dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.6, ...look,
  panels: [{ at: 0.7, until: dur + 1, kind: 'banners', heirs: ALL, cols: 2, x: 40, y: 56, w: 400, h: 176, scale: 2, stagger: 0.45 }],
  text: [{ at: 0.2, until: dur - 0.1, style: 'lore', lines, y: 0.15 }] });
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

/** A trailer: its shots, its music (its tunes, arranged), and the flame of the name. */
const trailer = (shots, music, logoAt) => ({ shots, music, sounds: [[logoAt + 0.1, 'kindle', 0.8, 0]], sfxVol: 1.1 });

// ------------------------------------------------------------------------------------------------
// 1. First Light: the story, from a tribe's first fire to the crown among the stars.
// ------------------------------------------------------------------------------------------------
const cinema = { bars: 20, vignette: 0.5 };
const fl = [
  firstFire(FF * 2, ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'], cinema),
  climb(FF * 2, ['AGE BY AGE,', 'ITS PEOPLE [CLIMBED].'], cinema),
  cradleLate(FF * 2, ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'], cinema),
  launch(4.4, ['THEY LEFT IT', 'FOR THE {STARS}.'], cinema),
  darkSector(HG * 2, ['BUT THE STARS', 'WERE [!DARK].'], cinema),
  kindle(HG * 2, ['{LIGHT} THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  battle('goldOrange', HG * 2, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema),
  battle('redGoldViolet', HG * 2, null, cinema),
  starfall(HG * 2, null, cinema),
  hearthFalls('violetOnBlue', HG * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  logo(5.2, ['FROM THE STONE AGE TO THE STARS', PLAY], null, cinema),
];
const flLeap = at(fl, 3);
const flStars = at(fl, 4);
const flLogo = at(fl, 10);

// ------------------------------------------------------------------------------------------------
// 2. The Fall: the sector as it is, the six houses in it, where they began, and the war for the crown.
// ------------------------------------------------------------------------------------------------
const tf = [
  darkSector(LR * 2, ['THE LAST {HEGEMARCH} FELL,', 'AND THE STARS WENT [!DARK].'], cinema),
  sixBanners(LR * 2, ['SIX {HOUSES} REMAIN.'], cinema),
  climb(LR * 2, ['EACH ONE [CLIMBED]', 'FROM A SINGLE WORLD,'], cinema),
  launch(4, ['TO THE {STARS}.'], cinema),
  kindle(TA * 3, ['NOW THEY {LIGHT} THE DARK,', 'WORLD BY WORLD.'], cinema),
  battle('tealViolet', TA * 3, ['AND EVERY ONE', 'WANTS {THE CROWN}.'], cinema),
  starfall(TA * 3, ['STARS WILL [!FALL].'], cinema),
  hearthFalls('tealRing', TA * 3, ['HOUSES WILL [!FALL].', 'ONE WILL BE {CROWNED}.'], cinema),
  logo(5.2, [MODES, PLAY], 'WHICH {HOUSE} WILL YOU LEAD?', cinema),
];
const tfLeap = at(tf, 3);
const tfStars = at(tf, 4);
const tfLogo = at(tf, 8);

// ------------------------------------------------------------------------------------------------
// 3. Six Houses: the crown unclaimed, each house in its turn, and all of them at war for it.
// ------------------------------------------------------------------------------------------------
/** Each house: its name in its colour, its title, a line of what it is (from its own), and where it lives. */
const HOUSES = {
  concord: ['SOLAR CONCORD', 'KEEPERS OF THE GOLDEN HEARTH', 'STEADY, STURDY AND RICH.', '#ffd23f', ['90', 33]],
  vael: ['VAEL IMPERIUM', 'THE BLOOD-SWORN HOUSE', 'THE DARK IS WON IN FIRE.', '#e0402f', ['90', 46]],
  wayfarer: ['WAYFARER CLANS', 'THE WANDERING HOUSE', 'FAST ON THE STARLANES.', '#2fd5a6', ['11', 49]],
  lyceum: ['LYCEUM COLLECTIVE', 'THE HIVE-MINDED HOUSE', 'QUICK TO LEARN, QUICK TO SWARM.', '#b05cff', ['90', 26]],
  choir: ['CHOIR OF THE FIRST FLAME', 'THE FAITHFUL HOUSE', 'THEY NEVER RUN.', '#3fa7ff', ['23', 50]],
  ashen: ['ASHEN REMNANT', 'THE LAST OF THE OLD LIGHT', 'THEY GAMBLE ALL ON FATE.', '#ff8a1f', ['90', 40]],
};
const house = (id) => {
  const [name, title, line, color, [seed, node]] = HOUSES[id];
  const dur = ET * 2;
  return {
    sector: S(Number(seed)), from: min(10), dur, speed: 1.2, dim: 0.5, dither: 0.5, vignette: 0.6, sounds: false,
    cam: [{ t: 0, node, zoom: 0.13, dx: 30 }, { t: 1, node, zoom: 0.15, dx: -30 }],
    // (Each house stays to the cut, and the next comes in over it.)
    panels: [{ at: 0.3, until: dur + 1, kind: 'banners', heirs: [id], names: false, x: 30, y: 84, w: 420, h: 72, scale: 3 }],
    text: [
      { at: 0.1, until: dur + 1, style: 'lore', lines: [name], y: 0.22, color, type: false },
      { at: 0.7, until: dur + 1, style: 'caption', lines: [title], y: 0.66, color: '#fff4e0' },
      { at: 1.0, until: dur + 1, style: 'caption', lines: [line], y: 0.73 },
    ],
  };
};
const sh = [
  darkSector(ET * 2, ['THE CROWN OF THE SECTOR', 'LIES {UNCLAIMED}.'], { vignette: 0.6 }),
  ...ALL.map(house),
  battle('redGoldViolet', ET * 2, ['SIX HOUSES.', 'ONE {CROWN}.'], { vignette: 0.5 }),
  logo(5.2, [MODES, PLAY], 'WHICH WILL {YOU} LEAD?'),
];
const shLogo = at(sh, 8);

// ------------------------------------------------------------------------------------------------
// 4. Light the Dark: what you do in it, in the build of one tune, to the war.
// ------------------------------------------------------------------------------------------------
const hype = { vignette: 0.45 };
const ld = [
  card(BK * 2, ['THE SECTOR IS [!DARK].'], { dither: 1 }),
  kindle(BK * 3, ['{KINDLE} ITS WORLDS.'], hype),
  battle('goldOrange', BK * 3, ['[COMMAND] YOUR FLEETS.'], hype),
  picture('boons', BK * 3, ['BEND FATE WITH {BOONS}.'], hype),
  climb(BK * 3, ['[CLIMB] THE AGES.'], hype),
  battle('tealBlue', BK * 2, null, hype),
  battle('tealViolet', BK * 2, null, hype),
  starfall(BK * 2, null, hype),
  hearthFalls('violetOnBlue', BK * 3, ['TAKE {THE CROWN}.'], hype),
  logo(BK * 3, [MODES, PLAY]),
];
const ldLogo = at(ld, 9);

export const TRAILERS = {
  'first-light': trailer(
    fl,
    [
      // The tribe's drums and the bass; the arpeggio; the melody at the head of its phrase; home, ringing, as the Ark leaves.
      { track: 'First Fires', at: 0, until: flLeap, part: 0, close: true, ring: 4.4,
        arrangement: [{ bars: 2, voices: 'bh', vol: 0.55 }, { bars: 2, voices: 'abh', vol: 0.68 }, { bars: 2, voices: 'abld', vol: 0.82 }] },
      // The theme comes in under the ringing chord, quietly, and grows to the war.
      { track: 'Hegemarch', at: flStars, until: flLogo, part: 0, close: true, ring: 5,
        arrangement: [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 2, voices: 'ab', vol: 0.7 }, { bars: 4, voices: 'abld', vol: 0.9 }, { bars: 4, voices: 'ablde' }] },
    ],
    flLogo,
  ),
  'the-fall': trailer(
    tf,
    [
      // The drone alone under the dark; the arpeggio under the houses; the melody as they climb; home, ringing, as an Ark leaves.
      { track: 'Long Road', at: 0, until: tfLeap, part: 0, close: true, ring: 4,
        arrangement: [{ bars: 2, voices: 'b', vol: 0.6 }, { bars: 2, voices: 'ab', vol: 0.72 }, { bars: 2, voices: 'abl', vol: 0.85 }] },
      { track: 'To Arms', at: tfStars, until: tfLogo, part: 0, close: true, ring: 5,
        arrangement: [{ bars: 3, voices: 'abd', vol: 0.75 }, { bars: 6, voices: 'abld', vol: 0.9 }, { bars: 3, voices: 'ablde' }] },
    ],
    tfLogo,
  ),
  'six-houses': trailer(
    sh,
    [{ track: 'The Empty Throne', at: 0, until: shLogo, part: 0, close: true, ring: 5,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.6 }, { bars: 2, voices: 'ab', vol: 0.7 }, { bars: 4, voices: 'abl', vol: 0.8 },
        { bars: 6, voices: 'abld', vol: 0.9 }, { bars: 2, voices: 'abled' }] }],
    shLogo,
  ),
  'light-the-dark': trailer(
    ld,
    [{ track: 'Breakers', at: 0, until: ldLogo, part: 1, close: true, ring: BK * 3 - 0.2,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 3, voices: 'bh', vol: 0.62 }, { bars: 3, voices: 'bd', vol: 0.7 },
        { bars: 3, voices: 'abd', vol: 0.78 }, { bars: 3, voices: 'abld', vol: 0.86 }, { bars: 9, voices: 'ablde' }] }],
    ldLogo,
  ),
};

// (Each tune's bars are its shots' bars, and its arrangement covers them all.)
for (const [name, t] of Object.entries(TRAILERS)) {
  for (const m of t.music) {
    const bpm = { 'First Fires': 88, 'Long Road': 72, Hegemarch: 112, 'To Arms': 132, 'The Empty Throne': 96, Breakers: 140 }[m.track];
    const bars = (m.until - m.at) / bar(bpm);
    if (Math.abs(bars - Math.round(bars)) > 0.01) throw new Error(`${name}: ${m.track} runs ${bars.toFixed(2)} bars`);
    const arranged = (m.arrangement ?? []).reduce((s, a) => s + a.bars, 0);
    if (m.arrangement && arranged !== Math.round(bars)) throw new Error(`${name}: ${m.track} is arranged for ${arranged} bars of ${Math.round(bars)}`);
  }
  // (Words are up long enough to read: a shot with words is three and a half seconds at the least.)
  for (const s of t.shots) if ((s.text ?? []).some((c) => c.style === 'lore') && s.dur < 3.4) throw new Error(`${name}: a shot of ${s.dur.toFixed(2)} s has words`);
}
