// The trailers (make.mjs makes them), made as a studio makes a trailer, out of the game's own things:
// its sectors played by its own houses, its pictures, its tunes and its sounds.
//
// - The music is built: a tune of the game's, arranged bar by bar (its bass and drums alone, then its
//   arpeggio, its melody coming in at the head of a phrase), then a bar of silence with a riser under it
//   (or a last chord ringing), a hit on the drop, and the next tune at full strength; its last chord rings
//   under the name, where the flame kindles.
// - The words are few, and come as the game's decisions tell a story: a scan line, each line catching
//   ember then gold, then its own colours ({gold}, [teal], [!red]). A shot of fighting is left to itself.
// - The picture is framed: black bars for the story, a vignette in dither, the night under the words.
// - Every shot is a whole number of bars of its tune (the cuts fall on the bar); every line is broken by
//   hand, and measured (make.mjs lints them before a frame is made).
// The moments are where `make.mjs scan` found them: the seed, the tick, the world. Every sector is medium,
// Hard, the houses all the game's AI; CRADLE is an Ages run on its cradle world.
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
const say = (dur, lines, from = 0.6) => ({ at: from, until: dur - 0.15, style: 'lore', lines, y: 0.8 });
const words = (dur, lines, from) => (lines ? [say(dur, lines, from)] : []);
/** Words in the middle of the night, between shots (none: a beat of night). */
const card = (dur, lines, look = {}) => ({ blank: true, stars: true, dur, dither: 0.5, ...look,
  text: lines.length ? [{ at: 0.3, until: dur - 0.1, style: 'lore', lines, y: 0.5 }] : [] });

/** The cradle, all of it, and the camera drawing in to one land of it as a tribe lights its first fire there. */
const firstFire = (dur, lines, look, from = 0.8) => ({ sector: CRADLE, from: sec(20), dur, speed: 1.3, dither: 1.4, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, node: 10, zoom: 'fit', fit: 2.4 }], text: words(dur, lines, from) });
/** The climb of the ages, as the title screen draws it, on the night; the ages' names under it. */
const climb = (dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.6, ...look,
  panels: [{ at: 0.2, until: dur + 1, kind: 'art', art: 'ages', x: 60, y: 46, w: 360, h: 96, scale: 3, bare: true }],
  text: [
    { at: 0.5, until: dur - 0.15, style: 'lore', lines, y: 0.66 },
    { at: Math.min(1.4, dur - 2.2), until: dur - 0.15, style: 'caption', lines: ['STONE · BRONZE · IRON · POWDER · MACHINE · SPACE'], y: 0.84, type: true, cps: 30 },
  ] });
/** The cradle late in its ages, every land lit. */
const cradleLate = (dur, lines, look) => ({ sector: CRADLE, from: min(14.5), dur, speed: 4, dither: 0.6, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.15 }, { t: 1, zoom: 'fit', fit: 1.3 }], text: words(dur, lines, 0.4) });
/** An Ark leaves the cradle (its leap is at 0.4 s): its lands go dark. */
const launch = (dur, lines, look) => ({ sector: CRADLE, from: min(21.62), dur, speed: 1.5, dither: 0.6, sounds: false, ...look,
  cam: [{ t: 0, node: 0, zoom: 'fit', fit: 1.5 }, { t: 1, node: 0, zoom: 'fit', fit: 1.2 }], text: words(dur, lines, 0.5) });
/** The sector before anyone has lit it. */
const darkSector = (dur, lines, look) => ({ sector: S(90), from: 0, dur, speed: 0.4, dither: 1.2, sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.2 }, { t: 1, zoom: 'fit', fit: 1.38 }], text: words(dur, lines, 0.8) });
/**
 * Worlds kindled, one a shot, cut on the bar: the ring of each house's colour closes round a dark world,
 * and it lights (the light spreads over it from the moment of its kindling, for 0.8 s). The words stay
 * over every cut. Seed 90's first kindlings: the Concord's (gold), the Vael's (red), the Lyceum's
 * (violet), the Ashen's (orange).
 */
const KINDLINGS = [[603, 34], [557, 48], [560, 27], [596, 43]];
const kindles = (which, each, lines, look) => which.map((k, i) => {
  const [tick, node] = KINDLINGS[k];
  const last = i === which.length - 1;
  return { sector: S(90), from: tick - sec(each * 0.38), dur: each, speed: 1, dither: i ? 0 : 0.3, loud: 1.2, duck: 0.9, ...look,
    cam: [{ t: 0, node, zoom: 0.46 }, { t: 1, node, zoom: 0.54 }],
    text: lines ? [{ at: i ? 0 : 0.3, until: last ? each - 0.15 : each + 1, style: 'lore', lines, y: 0.8, held: i > 0 }] : [] };
});
/** A fleet on its way to war, the camera riding with it. */
const fleet = (dur, lines, look) => ({ sector: S(90), from: min(58.3), dur, speed: 1, dither: 0.3, loud: 1, duck: 0.92, ...look,
  cam: [{ t: 0, follow: true, zoom: 0.3 }, { t: 1, follow: true, zoom: 0.25 }], text: words(dur, lines, 0.4) });
/** The great siege of seed 90. */
const siege = (dur, lines, look) => ({ sector: S(90), from: min(58.72) + sec(1.2), dur, speed: 1, dither: 0.3, loud: 1.3, duck: 0.85, ...look,
  cam: [{ t: 0, node: 46, zoom: 0.27 }, { t: 1, node: 46, zoom: 0.33 }], text: words(dur, lines, 0.5) });
/** A star erupts in a battle (a second and a little before the cut), and the camera draws back from it. */
const starfall = (dur, lines, look) => ({ sector: S(23), from: sec(2844.1 - (dur - 1.15)), dur, speed: 1, dither: 0.3, duck: 0.88, ...look,
  cam: [{ t: 0, node: 24, zoom: 0.22 }, { t: (dur - 1.2) / dur, node: 24, zoom: 0.22 }, { t: 1, node: 24, zoom: 0.16 }], text: words(dur, lines, 0.5) });
/** The fleet the camera rode with (`fleet`) comes in on world 48, its guns all firing at once. */
const charge = (dur, lines, look) => ({ sector: S(90), from: min(58.55) + sec(0.5), dur, speed: 1, dither: 0.3, loud: 1.2, duck: 0.88, ...look,
  cam: [{ t: 0, node: 48, zoom: 0.28 }, { t: 1, node: 48, zoom: 0.34 }], text: words(dur, lines, 0.5) });
/** The Lyceum's hearth (world 26) under a swarm, and its fall: the house is out (a little past the middle of the shot). */
const hearthFalls = (dur, lines, look) => ({ sector: S(90), from: scan('90').moments.find((m) => m.kind === 'fall' && m.who === 3).tick - sec(dur * 0.55),
  dur, speed: 1, dither: 0.3, loud: 1.2, duck: 0.88, ...look,
  cam: [{ t: 0, node: 26, zoom: 0.28 }, { t: 1, node: 26, zoom: 0.34 }], text: words(dur, lines, 0.5) });
const ALL = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
/** The six houses' banners, coming one after another, with their names. */
const sixBanners = (dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.6, ...look,
  panels: [{ at: 0.7, until: dur + 1, kind: 'banners', heirs: ALL, cols: 2, x: 40, y: 56, w: 400, h: 176, scale: 2, stagger: 0.45 }],
  text: [{ at: 0.2, until: dur - 0.1, style: 'lore', lines, y: 0.15 }] });
/** One of the game's pictures, large, on the night. */
const picture = (kind, dur, lines, look) => ({ blank: true, stars: true, dur, dither: 0.3, ...look,
  panels: [{ at: 0.1, until: dur + 1, kind: 'art', art: kind, x: 90, y: 36, w: 300, h: 150, scale: 3, bare: true }],
  text: lines ? [{ at: 0.4, until: dur - 0.15, style: 'lore', lines, y: 0.8 }] : [] });

/** The name, as its flame kindles; what is under it; a question over it, if any. */
const logo = (dur, lines, question, look = {}) => ({ blank: true, stars: true, dur, dither: 0.3, vignette: 0.5, ...look,
  text: [
    ...(question ? [{ at: 1.4, until: dur, style: 'lore', lines: [question], y: 0.15 }] : []),
    { at: 0.1, until: dur, style: 'logo', lines },
  ] });
const PLAY = 'PLAY FREE IN YOUR BROWSER · HEGEMARCH.COM';
const MODES = 'CLASSIC · AGES · DAILY';

/** A trailer: its shots, its music (its tunes, arranged), and sounds at their moments. */
const trailer = (shots, music, sounds) => ({ shots, music, sounds, sfxVol: 1.1 });
/** A drop: a riser under the bar before it, cut at it, and a blast on it. */
const drop = (from, to) => [[from + 0.02, 'riser', 0.9, to - from - 0.04], [to, 'bigboom', 1, 0]];
/** The flame of the name kindles. */
const flame = (t) => [t + 0.1, 'kindle', 0.9, 0];


// ------------------------------------------------------------------------------------------------
// 1. First Light: the story, from a tribe's first fire to the crown among the stars.
// ------------------------------------------------------------------------------------------------
const cinema = { bars: 20, vignette: 0.5 };
const fl = [
  firstFire(FF * 2, ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'], cinema),
  climb(FF * 2, ['AGE BY AGE,', 'ITS PEOPLE [CLIMBED].'], cinema),
  cradleLate(FF, ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'], cinema),
  launch(FF * 2, ['THEY BUILT {ARKS},', 'AND LEFT FOR THE STARS.'], cinema),
  card(FF, ['BUT THE STARS', 'WERE [!DARK].'], cinema),
  ...kindles([0, 1], HG, ['{LIGHT} THE DARK,', 'WORLD BY WORLD.'], cinema),
  fleet(HG * 2, null, cinema),
  charge(HG * 2, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema),
  starfall(HG * 2, null, cinema),
  siege(HG * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema),
  logo(5.2, ['FROM THE STONE AGE TO THE STARS', PLAY], null, cinema),
];
const flDark = at(fl, 4);
const flDrop = at(fl, 5);
const flLogo = at(fl, 11);

// ------------------------------------------------------------------------------------------------
// 2. The Fall: the sector as it is, the six houses in it, where they began, and the war for the crown.
// ------------------------------------------------------------------------------------------------
const tf = [
  darkSector(LR * 2, ['THE LAST {HEGEMARCH} FELL,', 'AND THE STARS WENT [!DARK].'], cinema),
  sixBanners(LR * 2, ['SIX {HOUSES} REMAIN.'], cinema),
  firstFire(LR, ['EACH ONE BEGAN', 'ON {A SINGLE WORLD},'], { ...cinema, dither: 0.6 }, 0.3),
  climb(LR, ['AND [CLIMBED] TO THE STARS.'], cinema),
  launch(3, null, cinema),
  ...kindles([0, 1, 2, 3], TA, ['NOW THEY {LIGHT} THE DARK,', 'WORLD BY WORLD.'], cinema),
  charge(TA * 2, ['AND EVERY ONE', 'WANTS {THE CROWN}.'], cinema),
  starfall(TA * 2, ['STARS WILL [!FALL].'], cinema),
  hearthFalls(TA * 2, ['HOUSES WILL [!FALL].'], cinema),
  siege(TA * 2, ['ONE WILL BE {CROWNED}.'], cinema),
  logo(5.2, [MODES, PLAY], 'WHICH {HOUSE} WILL YOU LEAD?', cinema),
];
const tfLeap = at(tf, 4);
const tfDrop = at(tf, 5);
const tfLogo = at(tf, 13);

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
  siege(ET * 2, ['SIX HOUSES.', 'ONE {CROWN}.'], { vignette: 0.5 }),
  logo(5.2, [MODES, PLAY], 'WHICH WILL {YOU} LEAD?'),
];
const shWar = at(sh, 7);
const shLogo = at(sh, 8);

// ------------------------------------------------------------------------------------------------
// 4. Light the Dark: what you do in it, in the build of one tune, to a drop, and the war.
// ------------------------------------------------------------------------------------------------
const hype = { vignette: 0.45 };
const ld = [
  card(BK * 2, ['THE SECTOR IS [!DARK].'], { dither: 1 }),
  ...kindles([0, 2], BK, ['{KINDLE} ITS WORLDS.'], hype),
  fleet(BK * 2, ['[COMMAND] YOUR FLEETS.'], hype),
  picture('boons', BK * 2, ['BEND FATE WITH {BOONS}.'], hype),
  climb(BK * 3, ['[CLIMB] THE AGES.'], hype),
  card(BK, [], { dither: 0 }),
  charge(BK * 2, null, { ...hype, dither: 0 }),
  hearthFalls(BK * 2, null, hype),
  starfall(BK * 2, null, hype),
  siege(BK * 2, ['TAKE {THE CROWN}.'], hype),
  logo(BK * 3, [MODES, PLAY]),
];
const ldDark = at(ld, 6);
const ldDrop = at(ld, 7);
const ldLogo = at(ld, 11);

export const TRAILERS = {
  'first-light': trailer(
    fl,
    [
      // Bass and the tribe's drums; the arpeggio; the melody at the head of its phrase; a bar of nothing.
      { track: 'First Fires', at: 0, until: flDrop, part: 0, fade: 0.1,
        arrangement: [{ bars: 2, voices: 'bh', vol: 0.55 }, { bars: 2, voices: 'abh', vol: 0.68 }, { bars: 3, voices: 'abld', vol: 0.82 }, { bars: 1, voices: '' }] },
      { track: 'Hegemarch', at: flDrop, until: flLogo, part: 0, close: true, ring: 5,
        arrangement: [{ bars: 8, voices: 'abld' }, { bars: 2, voices: 'ablde' }] },
    ],
    [[at(fl, 3) + 0.4, 'jump', 0.8, 0], ...drop(flDark, flDrop), flame(flLogo)],
  ),
  'the-fall': trailer(
    tf,
    [
      // The drone alone under the dark; the arpeggio under the houses; the melody as they climb; home, ringing, as an Ark leaves.
      { track: 'Long Road', at: 0, until: tfLeap, part: 0, close: true, ring: 3,
        arrangement: [{ bars: 2, voices: 'b', vol: 0.6 }, { bars: 2, voices: 'ab', vol: 0.72 }, { bars: 2, voices: 'abl', vol: 0.85 }] },
      { track: 'To Arms', at: tfDrop, until: tfLogo, part: 0, close: true, ring: 5,
        arrangement: [{ bars: 8, voices: 'abld' }, { bars: 4, voices: 'ablde' }] },
    ],
    [[tfLeap + 0.4, 'jump', 0.8, 0], ...drop(tfLeap, tfDrop), flame(tfLogo)],
  ),
  'six-houses': trailer(
    sh,
    [{ track: 'The Empty Throne', at: 0, until: shLogo, part: 0, close: true, ring: 5,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.6 }, { bars: 2, voices: 'ab', vol: 0.7 }, { bars: 4, voices: 'abl', vol: 0.8 },
        { bars: 6, voices: 'abld', vol: 0.9 }, { bars: 2, voices: 'abled' }] }],
    [[shWar, 'bigboom', 0.8, 0], flame(shLogo)],
  ),
  'light-the-dark': trailer(
    ld,
    [{ track: 'Breakers', at: 0, until: ldLogo, part: 1, close: true, ring: BK * 3 - 0.2,
      arrangement: [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 2, voices: 'bh', vol: 0.62 }, { bars: 2, voices: 'bd', vol: 0.7 },
        { bars: 2, voices: 'abd', vol: 0.76 }, { bars: 3, voices: 'abld', vol: 0.84 }, { bars: 1, voices: '' }, { bars: 8, voices: 'ablde' }] }],
    [...drop(ldDark, ldDrop), flame(ldLogo)],
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
}
