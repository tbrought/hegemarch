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
/** A word or two, large, at the foot of a shot (a beat of a montage): it comes as a story's line does. */
const word = (dur, text, from = 0.3) => [{ at: from, until: dur - 0.12, style: 'big', lines: [text], y: 0.8 }];
/** Words in the middle of the night, between shots. */
const card = (dur, lines, look = {}) => ({ blank: true, stars: true, dur, dither: 0.5, ...look,
  text: [{ at: 0.3, until: dur - 0.1, style: 'lore', lines, y: 0.5 }] });

/** The cradle, all of it, and the camera drawing in to one land of it as a tribe lights its first fire there. */
const firstFire = (dur, lines, look) => ({ sector: CRADLE, from: sec(20), dur, speed: 1.3, loud: 0.5, ...look,
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
/**
 * An Ark leaves the cradle: built at the Lyceum's capital, lit, and gone up into the night (the studio draws it:
 * the game shows none), as the house's lands go dark behind it, at the moment the game launches it.
 */
const launch = (dur, lines, look, big) => {
  const at = scan('ages-12').moments.find((m) => m.kind === 'launch').tick;
  const LIFT = Math.min(2.4, dur * 0.48);
  return { sector: CRADLE, from: at - sec(LIFT), dur, speed: 1, sounds: false, ...look,
    cam: [{ t: 0, node: 0, zoom: 'fit', fit: 2.3, dy: 8 }, { t: 1, node: 0, zoom: 'fit', fit: 1.9, dy: 8 }],
    ark: { node: 0, color: '#b05cff', lift: LIFT }, text: big ? word(dur, big) : words(dur, lines) };
};
/** The sector before anyone has lit it. */
const darkSector = (dur, lines, look) => ({ sector: S(90), from: 0, dur, speed: 0.4, dither: 1.2, sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.2 }, { t: 1, zoom: 'fit', fit: 1.38 }], text: words(dur, lines, 0.8) });
/**
 * A world kindled: the ring of the Concord's gold closes round a dark world, and it lights (the light
 * spreads over it from the moment of its kindling, for 0.8 s); then the camera draws back from it.
 */
const kindle = (dur, lines, look) => ({ sector: S(90), from: 603 - sec(0.9), dur, speed: 1, loud: 0.55, duck: 0.9, ...look,
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
const battle = (which, dur, lines, look, opts = {}) => {
  const [seed, m, node, dx, dy] = BATTLES[which];
  // (With words at its foot, the fighting is lifted above them.)
  const up = dy + (lines || opts.big ? -30 : 0);
  // (A punch: the camera drawn in fast over the first quarter of the shot, then slowly.)
  const cam = opts.punch
    ? [{ t: 0, node, zoom: 0.2, dx, dy: up }, { t: 0.25, node, zoom: 0.31, dx, dy: up }, { t: 1, node, zoom: 0.35, dx, dy: up }]
    : [{ t: 0, node, zoom: 0.3, dx, dy: up }, { t: 1, node, zoom: 0.34, dx, dy: up }];
  return { sector: S(seed), from: min(m) - 20, dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam, text: opts.big ? word(dur, opts.big) : words(dur, lines) };
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
/**
 * How one shot gives way to the next: in the cradle, and to and from a card or the night, a short dip through
 * black (smooth, the old shot to night and the new out of it); between two shots of the war, a cut. The first
 * comes out of the night slowly; the name goes back into it.
 */
function cuts(shots) {
  const bridge = shots.findIndex((x) => x.text?.[0]?.lines?.[1] === 'WERE [!DARK].');
  shots.forEach((x) => (x.dither = 0));
  shots[0].fadeIn ??= 2.5;
  for (let i = 1; i < shots.length; i++) {
    const end = i === shots.length - 1;
    if (shots[i].hard) continue;
    if (shots[i].dip || i <= bridge + 1 || end || shots[i].blank || shots[i - 1].blank) {
      shots[i - 1].fadeOut = end ? 0.5 : 0.3;
      shots[i].fadeIn = end ? 0.6 : 0.35;
    }
  }
  shots[shots.length - 1].fadeOut = 1.5;
  return shots;
}
const trailer = (shots, music, logoAt) => ({ shots: cuts(shots), music, sounds: [[logoAt + 0.1, 'kindle', 0.4, 0]], sfxVol: 1.1 });
const cinema = { bars: 20, vignette: 0.5 };
/** The end of each: the name as its flame kindles, the last chord dying away under it, and the night. */
const END = 5.5;
const RING = 3.5;
const endCard = () => logo(END, ['FROM THE STONE AGE TO THE STARS', PLAY], null, cinema);

// ------------------------------------------------------------------------------------------------
// The cradle: an Ages run's story, told before the stars.
// ------------------------------------------------------------------------------------------------

/** The opening: night, then the cradle world comes out of it, far off, as the drums begin; the words after. */
const dawn = (dur, lines, look) => ({ sector: CRADLE, from: 0, dur, speed: 1, sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 0.8 }, { t: 1, zoom: 'fit', fit: 1.02 }], text: words(dur, lines, dur > 6 ? 2.8 : 1.8) });
/** The tribes become houses: the cradle in the middle of its ages, all of it, its lands in their colors. */
const cradleMid = (dur, lines, look) => ({ sector: CRADLE, from: min(9.5), dur, speed: 3, dither: 0.6, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.05 }, { t: 1, zoom: 'fit', fit: 1.18 }], text: words(dur, lines) });
/** War on a cradle: the armies of the Machine age at a city (another cradle's: this one's wars are smaller). */
/** The cradle in time-lapse: its tribes' lands spreading and lighting, minutes in a few seconds. */
const cradleRise = (dur, lines, look, big) => ({ sector: CRADLE, from: sec(15), dur, speed: [10, 300], sounds: false, ...look,
  cam: [{ t: 0, zoom: 'fit', fit: 1.05 }, { t: 1, zoom: 'fit', fit: 1.14 }], text: big ? word(dur, big) : words(dur, lines) });
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
/** The bridge: the stars, dark, the cradle's chord dying away alone under them; the next tune begins with the light. */
const BRIDGE = 4.4;
/**
 * The game's own Boon draft (its HUD's dialog, dealt as in play: a Common, a Rare and an Epic Blueprint, in
 * seed 11 at eight minutes), the pointer coming to rest on the Epic, which rises.
 */
const DRAFT_RUN = { sector: S(11), tick: min(8) };
const boonDraft = (dur, look) => ({ blank: true, stars: true, dur, vignette: 0.4, ...look, draft: { ...DRAFT_RUN, hover: [2, dur * 0.62] }, text: [] });
const LS = bar(126); // Last Stand: a march, G minor
/** A shot with a word or two, large, in place of its own words. */
const withWord = (shot, text, from) => ({ ...shot, text: word(shot.dur, text, from) });
/** Another war on a cradle: the Machine age at a city of the Concord's, its walls ringed. */
const cradleWar2 = (dur, look) => ({ sector: S(21, { ages: true }), from: min(19.25) - 20, dur, speed: 1, loud: 1, duck: 0.9, ...look,
  cam: [{ t: 0, node: 21, zoom: 0.5 }, { t: 1, node: 21, zoom: 0.58 }], text: [] });
/** The war shots of a montage, one a bar, cut hard on the beat, each punched in. */
const montage = (len, which) => which.map((w) => ({ ...battle(w, len, null, cinema, { punch: true }), hard: true }));
/** Where a tune begins and ends, by the index of its first shot and of the shot after its last. */
const span = (shots, from, to) => ({ at: at(shots, from), until: at(shots, to) });
const tune = (track, shots, from, to, extra) => ({ track, ...span(shots, from, to), part: 0, close: true, ...extra });

// ------------------------------------------------------------------------------------------------
// 1. Cold open: the middle of a war, heard and not scored; then night, and the story told to you, as a
//    player is told what to do; then the war again, cut on the beat of Breakers.
// ------------------------------------------------------------------------------------------------
const a = [
  { ...battle('redGoldViolet', 3.2, null, cinema, { punch: true }), fadeIn: 0.4 },
  { ...starfall(2.8, null, cinema), hard: true },
  { ...firstFire(FF * 2, ['EVERY EMPIRE BEGINS', 'WITH {A SINGLE FIRE}.'], cinema), dip: true },
  cradleRise(FF * 2, ['[GROW] YOUR TRIBE.'], cinema),
  climb(FF * 2, ['[CLIMB] THE AGES.'], cinema),
  cradleWar(FF * 2, ['[!CONQUER] THE CRADLE.'], cinema),
  cradleLate(FF * 2, ['[!OUTGROW] YOUR WORLD.'], cinema),
  launch(FF * 2, ['AND TAKE', 'TO {THE STARS}.'], cinema),
  { ...darkSector(BRIDGE, ['THE SECTOR', 'IS [!DARK].'], cinema), dip: true },
  { ...kindle(BK * 2, ['{LIGHT} IT,', 'WORLD BY WORLD.'], cinema), dip: true },
  sixBanners(BK * 2, ['SIX {HOUSES} RISE.'], cinema),
  picture('boons', BK * 2, ['BEND FATE', 'WITH {BOONS}.'], cinema),
  ...montage(BK, ['goldOrange', 'tealBlue', 'violetBlue', 'tealViolet']),
  { ...hearthFalls('violetOnBlue', BK * 2, ['TAKE', '{THE CROWN}.'], cinema), hard: true },
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 2. Montage: one tune, Breakers, from its first bar; a word or two a shot, the war cut on the beat.
// ------------------------------------------------------------------------------------------------
const b = [
  { ...withWord(dawn(BK * 2, null, cinema), 'ONE {WORLD}.', 1.0), fadeIn: 1.2 },
  climb(BK * 2, ['SIX {AGES}.'], cinema),
  withWord(cradleWar(BK * 2, ['.'], cinema), '[!WAR].'),
  launch(BK * 2, null, cinema, 'ONE {ARK}.'),
  withWord(kindle(BK * 2, null, cinema), '{LIGHT} THE DARK.'),
  sixBanners(BK * 2, ['SIX {HOUSES}.'], cinema),
  picture('boons', BK * 2, ['BEND {FATE}.'], cinema),
  ...montage(BK, ['goldOrange', 'tealBlue', 'violetBlue', 'tealViolet']),
  { ...starfall(BK * 2, null, cinema), hard: true },
  { ...battle('redGoldViolet', BK * 2, null, cinema, { punch: true }), hard: true },
  { ...withWord(hearthFalls('violetOnBlue', BK * 2, ['.'], cinema), 'ONE {CROWN}.'), hard: true },
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 3. Epic: the story, driven: First Fires with its drums from the first bar, the cradle in time-lapse and
//    at war; To Arms for the stars, its battles punched in and cut on the beat.
// ------------------------------------------------------------------------------------------------
const c = [
  { ...dawn(FF * 2, ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'], cinema), fadeIn: 1.6 },
  firstFire(FF * 2, ['ITS TRIBES LIT', 'THEIR {FIRST FIRES}.'], cinema),
  cradleRise(FF * 2, ['THEY SPREAD', 'ACROSS IT,'], cinema),
  climb(FF * 2, ['AND [CLIMBED],', 'AGE BY AGE.'], cinema),
  cradleWar(FF * 2, ['HOUSES WENT', 'TO [!WAR] FOR IT,'], cinema),
  cradleWar2(FF * 2, cinema),
  cradleLate(FF * 2, ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'], cinema),
  launch(FF * 2, ['THEY BUILT {ARKS},', 'AND LEFT FOR THE STARS.'], cinema),
  darkSector(BRIDGE, ['BUT THE STARS', 'WERE [!DARK].'], cinema),
  kindle(TA * 2, ['{LIGHT} THEM AGAIN,', 'WORLD BY WORLD.'], cinema),
  sixBanners(TA * 2, ['SIX {HOUSES} RISE.'], cinema),
  boonDraft(TA * 3, cinema),
  battle('goldOrange', TA * 2, ['EVERY HOUSE', 'WANTS {THE CROWN}.'], cinema, { punch: true }),
  ...montage(TA, ['tealBlue']),
  { ...starfall(TA * 2, null, cinema), hard: true },
  { ...battle('redGoldViolet', TA * 2, null, cinema, { punch: true }), hard: true },
  { ...hearthFalls('violetOnBlue', TA * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema), hard: true },
  endCard(),
];

// ------------------------------------------------------------------------------------------------
// 4. Rivals: the six houses, two by two, to the march of Last Stand, and the war between them.
// ------------------------------------------------------------------------------------------------
const d = [
  { ...darkSector(LS * 2, ['THE CROWN OF THE SECTOR', 'LIES {UNCLAIMED}.'], cinema), fadeIn: 1.2 },
  sixBanners(LS * 2, ['SIX {HOUSES} WANT IT.'], cinema),
  pair(LS * 2, 'concord', 'vael', cinema),
  pair(LS * 2, 'wayfarer', 'lyceum', cinema),
  pair(LS * 2, 'choir', 'ashen', cinema),
  kindle(LS * 2, ['THEY {LIGHT} THE DARK,'], cinema),
  picture('boons', LS * 2, ['BEND FATE', 'WITH {BOONS},'], cinema),
  battle('goldOrange', LS * 2, ['AND GO', 'TO [!WAR].'], cinema, { punch: true }),
  ...montage(LS, ['tealBlue', 'violetBlue']),
  { ...starfall(LS * 2, null, cinema), hard: true },
  ...montage(LS, ['tealViolet', 'redGoldViolet']),
  { ...hearthFalls('violetOnBlue', LS * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema), hard: true },
  endCard(),
];

const last = (shots) => shots.length - 1;
export const TRAILERS = {
  'cold-open': trailer(a, [
    // (The cold open is the war's own sound alone; First Fires from the fifth bar of a part, its drums with it.)
    tune('First Fires', a, 2, 8, { fromBar: 4, ring: BRIDGE,
      arrangement: [{ bars: 2, voices: 'bd', vol: 0.6 }, { bars: 2, voices: 'abd', vol: 0.7 }, { bars: 8, voices: 'abld', vol: 0.88 }] }),
    tune('Breakers', a, 9, last(a), { fromBar: 4, ring: RING,
      arrangement: [{ bars: 2, voices: 'bd', vol: 0.7 }, { bars: 2, voices: 'abd', vol: 0.8 }, { bars: 8, voices: 'ablde' }] }),
  ], at(a, last(a))),
  montage: trailer(b, [
    tune('Breakers', b, 0, last(b), { fromBar: 0, ring: RING,
      arrangement: [{ bars: 2, voices: 'bh', vol: 0.5 }, { bars: 2, voices: 'bd', vol: 0.6 }, { bars: 4, voices: 'abd', vol: 0.75 }, { bars: 8, voices: 'abld', vol: 0.9 }, { bars: 8, voices: 'ablde' }] }),
  ], at(b, last(b))),
  epic: trailer(c, [
    tune('First Fires', c, 0, 8, { fromBar: 0, ring: BRIDGE,
      arrangement: [{ bars: 2, voices: 'bd', vol: 0.55 }, { bars: 2, voices: 'bd', vol: 0.62 }, { bars: 4, voices: 'abd', vol: 0.72 }, { bars: 8, voices: 'abld', vol: 0.88 }] }),
    tune('To Arms', c, 9, last(c), { fromBar: 4, ring: RING,
      arrangement: [{ bars: 2, voices: 'bd', vol: 0.7 }, { bars: 2, voices: 'abd', vol: 0.78 }, { bars: 8, voices: 'abld', vol: 0.9 }, { bars: 4, voices: 'ablde' }] }),
  ], at(c, last(c))),
  rivals: trailer(d, [
    tune('Last Stand', d, 0, last(d), { fromBar: 0, ring: RING,
      arrangement: [{ bars: 2, voices: 'bd', vol: 0.55 }, { bars: 2, voices: 'bd', vol: 0.62 }, { bars: 4, voices: 'abd', vol: 0.72 }, { bars: 8, voices: 'abld', vol: 0.88 }, { bars: 8, voices: 'ablde' }] }),
  ], at(d, last(d))),
};

// ------------------------------------------------------------------------------------------------
// Shorts: upright (270x480, made 1080x1920), to be narrated over. Their tunes are beds (no melody: the voice
// is the melody), their sound quieter (-20 LUFS: the voice goes on top), their words a keyword or two in the
// upper third (YouTube's own words and buttons cover the foot of a Short and its right-hand side).
// ------------------------------------------------------------------------------------------------
const PW = 270;
/** A keyword or two at the top of an upright shot, over a band of night that comes in with it. */
const cap = (dur, lines, y = 0.22) => (lines ? [{ at: 0.25, until: dur - 0.12, style: 'lore', lines, y }] : []);
const up = (shot, lines) => ({ ...shot, text: cap(shot.dur, lines), bars: 0, vignette: 0.35 });
/** Upright shots: the same moments as the trailers', framed for a narrow picture. */
const pBattle = (which, dur, lines, punch = true) => {
  const [seed, m, node, dx] = BATTLES[which];
  const cam = punch
    ? [{ t: 0, node, zoom: 0.24, dx: dx * 0.5, dy: 30 }, { t: 0.25, node, zoom: 0.34, dx: dx * 0.5, dy: 30 }, { t: 1, node, zoom: 0.38, dx: dx * 0.5, dy: 30 }]
    : [{ t: 0, node, zoom: 0.32, dx: dx * 0.5, dy: 30 }, { t: 1, node, zoom: 0.36, dx: dx * 0.5, dy: 30 }];
  return up({ sector: S(seed), from: min(m) - 20, dur, speed: 1, loud: 1, duck: 0.9, cam }, lines);
};
const pDark = (dur, lines) => up({ sector: S(90), from: 0, dur, speed: 0.4, sounds: false,
  cam: [{ t: 0, node: 33, zoom: 0.16, dy: 20 }, { t: 1, node: 33, zoom: 0.19, dy: 20 }] }, lines);
const pKindle = (dur, lines) => up({ sector: S(90), from: 603 - sec(0.9), dur, speed: 1, loud: 0.5,
  cam: [{ t: 0, node: 34, zoom: 0.6, dy: 20 }, { t: 2.2 / dur, node: 34, zoom: 0.6, dy: 20 }, { t: 1, node: 34, zoom: 0.26, dy: 20 }] }, lines);
const pHearth = (dur, lines) => {
  const fall = scan('47').moments.find((m) => m.kind === 'hearth' && m.node === 24).tick;
  return up({ sector: S(47), from: fall - sec(dur * 0.55), dur, speed: 1, loud: 1,
    cam: [{ t: 0, node: 24, zoom: 0.34, dy: 30 }, { t: 1, node: 24, zoom: 0.4, dy: 30 }] }, lines);
};
/** The star of seed 23 at 2844.1 s: erupting `at` seconds into the shot. */
const NOVA = 2844.1;
const pErupt = (dur, lines, at = 0.8) => up({ sector: S(23), from: sec(NOVA - at), dur, speed: 1,
  cam: [{ t: 0, node: 24, zoom: 0.3, dy: 30 }, { t: 0.45, node: 24, zoom: 0.26, dy: 30 }, { t: 1, node: 24, zoom: 0.17, dy: 30 }] }, lines);
const pPicture = (kind, dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.3,
  panels: [{ at: 0.1, until: dur + 1, kind: 'art', art: kind, x: 15, y: 170, w: 240, h: 120, scale: 3, bare: true }], text: cap(dur, lines) });
const pBanners = (dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.3,
  panels: [{ at: 0.6, until: dur + 1, kind: 'banners', heirs: ALL, cols: 1, x: 20, y: 150, w: 230, h: 236, scale: 1, stagger: 0.3 }], text: cap(dur, lines, 0.2) });
const pClimb = (dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.3,
  panels: [{ at: 0.2, until: dur + 1, kind: 'art', art: 'ages', x: 15, y: 190, w: 240, h: 64, scale: 2, bare: true }],
  text: [...cap(dur, lines), { at: 1.2, until: dur - 0.12, style: 'caption', lines: ['STONE · BRONZE · IRON', 'POWDER · MACHINE · SPACE'], y: 0.62, type: true, cps: 30 }] });
const pDawn = (dur, lines) => up({ sector: CRADLE, from: 0, dur, speed: 1, sounds: false,
  cam: [{ t: 0, zoom: 'fit', fit: 1.5 }, { t: 1, zoom: 'fit', fit: 1.9 }] }, lines);
const pFirstFire = (dur, lines) => up({ sector: CRADLE, from: sec(20), dur, speed: 1.3, loud: 0.5,
  cam: [{ t: 0, node: 10, zoom: 'fit', fit: 2.2 }, { t: 1, node: 10, zoom: 'fit', fit: 3.4 }] }, lines);
const pRise = (dur, lines) => up({ sector: CRADLE, from: sec(15), dur, speed: [10, 300], sounds: false,
  cam: [{ t: 0, zoom: 'fit', fit: 1.7 }, { t: 1, zoom: 'fit', fit: 1.85 }] }, lines);
const pWar = (dur, lines) => up({ sector: S(3, { ages: true }), from: min(17.5) - 20, dur, speed: 1, loud: 1,
  cam: [{ t: 0, node: 1, zoom: 0.46, dy: 30 }, { t: 1, node: 1, zoom: 0.52, dy: 30 }] }, lines);
const pLaunch = (dur, lines) => {
  const at = scan('ages-12').moments.find((m) => m.kind === 'launch').tick;
  const lift = Math.min(2.4, dur * 0.45);
  return up({ sector: CRADLE, from: at - sec(lift), dur, speed: 1, sounds: false, ark: { node: 0, color: '#b05cff', lift },
    cam: [{ t: 0, node: 0, zoom: 'fit', fit: 3.2, dy: 60 }, { t: 1, node: 0, zoom: 'fit', fit: 2.8, dy: 60 }] }, lines);
};
const pNight = (dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.3, text: [{ at: 0.3, until: dur - 0.12, style: 'big', lines, y: 0.4 }] });
const pEnd = (dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.4, text: [{ at: 0.1, until: dur, style: 'logo', lines, y: 0.42 }] });
const FREE = ['PLAY FREE IN YOUR BROWSER', 'HEGEMARCH.COM'];
/** A Short: its shots (dips to and from the night, cuts between shots of the war), its bed, its flame. */
const short = (shots, music) => {
  const s = cuts(shots);
  s[0].fadeIn = 0.6;
  return { format: 'portrait', lufs: -20, shots: s, music, sounds: [[at(s, s.length - 1) + 0.1, 'kindle', 0.4, 0]], sfxVol: 0.8 };
};
const bed = (track, shots, fromBar, arrangement) => ({ track, at: 0, until: at(shots, shots.length - 1), part: 0, fromBar, close: true, ring: RING, arrangement });

// 1. What is Hegemarch? The game in forty seconds.
const sa = [
  pBattle('goldOrange', HG * 2, ['HEGEMARCH']),
  pDark(HG * 2, ['THE SECTOR', 'IS [!DARK]']),
  pKindle(HG * 2, ['{LIGHT} IT', 'AGAIN']),
  { blank: true, stars: true, dur: HG * 4, vignette: 0.3, draft: { ...DRAFT_RUN, hover: [2, HG * 2.9], pan: [HG * 1.2, HG * 3.1], zoom: 2 },
    text: [{ at: 0.25, until: HG * 4 - 0.15, style: 'lore', lines: ['NEW {BOONS}', 'EVERY RUN'], y: 0.12 }] },
  pBanners(HG * 2, ['SIX {HOUSES}']),
  { ...pErupt(HG * 2, ['STARS', '[!ERUPT]']), hard: true },
  { ...pHearth(HG * 2, ['ONE {CROWN}']), hard: true },
  pEnd(5, FREE),
];
// 2. From the Stone Age to the stars: an Ages run, from one world's first fire to the crown.
const sb = [
  pDawn(FF * 2, ['ONE {WORLD}']),
  pFirstFire(FF * 2, ['FIRST {FIRES}']),
  pRise(FF * 2, ['TRIBES', '[GROW]']),
  pClimb(FF * 2, ['SIX {AGES}']),
  pWar(FF * 2, ['[!WAR] FOR', 'THE CRADLE']),
  pLaunch(FF * 2, ['AN {ARK}']),
  pKindle(FF * 2, ['THE {STARS}']),
  { ...pBattle('tealViolet', FF * 2, ['THE {CROWN}']), hard: true },
  pEnd(5, FREE),
];
// 3. The Daily throne: one sector a day, the same for everyone; the fastest crown takes the throne.
const sc = [
  pPicture('daily', ET * 2, ['EVERY {DAY}']),
  pDark(ET * 2, ['ONE {SECTOR}']),
  pKindle(ET * 2, ['THE SAME', 'FOR ALL']),
  { ...pBattle('tealBlue', ET * 2, ['SAME', 'RIVALS']), dip: true },
  { ...pHearth(ET * 2, ['FASTEST', '{CROWN}']), hard: true },
  pNight(ET * 2, ['TAKES THE', '{THRONE}']),
  pEnd(5, ['DAILY RUN · FREE', 'HEGEMARCH.COM']),
];
// 4. The Starfall: a war going badly; a Starfall armed at a star; its two minutes; the star erupts.
const ARMED = NOVA - 120;
const sd = [
  pBattle('goldOrange', TA * 2, ['LOSING', 'THE WAR?']),
  { ...up({ sector: S(23), from: sec(ARMED - 0.6), dur: TA * 2, speed: 1, cam: [{ t: 0, node: 24, zoom: 0.36, dy: 75 }, { t: 1, node: 24, zoom: 0.4, dy: 75 }] },
    ['ARM A', '{STARFALL}']), dip: true },
  { ...up({ sector: S(23), from: sec(ARMED + 2), dur: TA * 4, speed: [4, 40], cam: [{ t: 0, node: 24, zoom: 0.4, dy: 75 }, { t: 1, node: 24, zoom: 0.3, dy: 75 }] },
    ['TWO', 'MINUTES...']), hard: true },
  { ...pErupt(TA * 2, null, 0.5), hard: true },
  { ...up({ sector: S(23), from: sec(NOVA + 3), dur: TA * 2, speed: 1, cam: [{ t: 0, node: 24, zoom: 0.17, dy: 30 }, { t: 1, node: 24, zoom: 0.12, dy: 30 }] },
    ['NO', 'SURVIVORS']), hard: true },
  { ...pHearth(TA * 2, ['TURN', 'THE WAR']), dip: true },
  { ...pBattle('redGoldViolet', TA * 2, null), hard: true },
  pEnd(5, FREE),
];
void PW;
Object.assign(TRAILERS, {
  'short-pitch': short(sa, [bed('Hegemarch', sa, 0, [{ bars: 2, voices: 'b', vol: 0.5 }, { bars: 2, voices: 'ab', vol: 0.6 }, { bars: 12, voices: 'abd', vol: 0.75 }])]),
  'short-ages': short(sb, [bed('First Fires', sb, 0, [{ bars: 4, voices: 'bh', vol: 0.5 }, { bars: 4, voices: 'abh', vol: 0.6 }, { bars: 8, voices: 'abd', vol: 0.72 }])]),
  'short-daily': short(sc, [bed('The Empty Throne', sc, 0, [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 2, voices: 'ab', vol: 0.62 }, { bars: 8, voices: 'abd', vol: 0.72 }])]),
  'short-starfall': short(sd, [bed('To Arms', sd, 0, [{ bars: 2, voices: 'bd', vol: 0.6 }, { bars: 6, voices: 'abd', vol: 0.68 }, { bars: 8, voices: 'abd', vol: 0.78 }])]),
});

// The music is checked as it is heard: each tune runs whole bars of its shots; it begins on its home chord; its
// melody comes in at the head of a part (bar 1 of 8, where its phrase begins); and it comes home only at the end
// of a phrase (bar 4 or 8).
const HOME_BARS = { 'First Fires': [0, 1, 4, 5], Hegemarch: [0, 4], 'The Empty Throne': [0, 4], 'To Arms': [0, 1, 4, 5], Breakers: [0, 1, 4, 5], 'Last Stand': [0, 1, 4, 5] };
for (const [name, t] of Object.entries(TRAILERS)) {
  for (const m of t.music) {
    const bpm = { 'First Fires': 88, 'Long Road': 72, Hegemarch: 112, 'To Arms': 132, 'The Empty Throne': 96, Breakers: 140, 'Last Stand': 126 }[m.track];
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
