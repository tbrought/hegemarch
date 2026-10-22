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
const bar = (bpm, steps = 8) => (60 / bpm / 2) * steps;
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
// (Scanned again for 1.27, whose rival Concord casts Dawn and whose fights keep to their worlds' wells: every
// sector after its first minute and a half played out otherwise.)
const BATTLES = {
  goldOrange: [23, 27.67, 2, -30, 0], // the Concord and the Ashen Remnant at Wezen III, a world the Concord's Dawn lit
  goldRedOrange: [90, 30.58, 7, -20, 20], // the Concord, the Vael and the Ashen, three fleets at Lyra II
  tealGold: [11, 24.83, 34, 0, 0], // the Wayfarers at the Concord's Hearth
  goldViolet: [47, 15.58, 25, 30, 0], // the Concord and the Lyceum at Achernar IV
  tealBlue: [8, 45.17, 15, -30, 0], // the Wayfarers and the Choir at Nova Ardent I
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
const HEARTHS = { goldOnViolet: [47, 31], tealRing: [11, 42] };
const hearthFalls = (which, dur, lines, look) => {
  const [seed, node] = HEARTHS[which];
  const fall = scan(String(seed)).moments.find((m) => m.kind === 'hearth' && m.node === node).tick;
  return { sector: S(seed), from: fall - sec(dur * 0.55), dur, speed: 1, dither: 0.4, loud: 1.1, duck: 0.88, ...look,
    cam: [{ t: 0, node, zoom: 0.3, dy: lines ? -30 : 0 }, { t: 1, node, zoom: 0.35, dy: lines ? -30 : 0 }], text: words(dur, lines) };
};
/**
 * The star that erupts: Xanth, in seed 8, at 1930.85 s, over a fight of the Concord and the Wayfarers in its system
 * (scan-8.json: its first nova). Armed two minutes before.
 */
const NOVA = { seed: 8, node: 23, at: 1930.85 };
/** A star erupts in a battle (a second and a little before the cut), and the camera draws back from it. */
const starfall = (dur, lines, look) => ({ sector: S(NOVA.seed), from: sec(NOVA.at - (dur - 1.15)), dur, speed: 1, dither: 0.4, duck: 0.88, ...look,
  cam: [{ t: 0, node: NOVA.node, zoom: 0.22 }, { t: (dur - 1.2) / dur, node: NOVA.node, zoom: 0.22 }, { t: 1, node: NOVA.node, zoom: 0.16 }], text: words(dur, lines) });
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
  { ...battle('goldRedOrange', 3.2, null, cinema, { punch: true }), fadeIn: 0.4 },
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
  ...montage(BK, ['goldOrange', 'tealBlue', 'goldViolet', 'tealGold']),
  { ...hearthFalls('goldOnViolet', BK * 2, ['TAKE', '{THE CROWN}.'], cinema), hard: true },
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
  ...montage(BK, ['goldOrange', 'tealBlue', 'goldViolet', 'tealGold']),
  { ...starfall(BK * 2, null, cinema), hard: true },
  { ...battle('goldRedOrange', BK * 2, null, cinema, { punch: true }), hard: true },
  { ...withWord(hearthFalls('goldOnViolet', BK * 2, ['.'], cinema), 'ONE {CROWN}.'), hard: true },
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
  { ...battle('goldRedOrange', TA * 2, null, cinema, { punch: true }), hard: true },
  { ...hearthFalls('goldOnViolet', TA * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema), hard: true },
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
  ...montage(LS, ['tealBlue', 'goldViolet']),
  { ...starfall(LS * 2, null, cinema), hard: true },
  ...montage(LS, ['tealGold', 'goldRedOrange']),
  { ...hearthFalls('goldOnViolet', LS * 2, ['ONLY ONE', 'WILL BE {CROWNED}.'], cinema), hard: true },
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
  const [seed, node] = HEARTHS.goldOnViolet;
  const fall = scan(String(seed)).moments.find((m) => m.kind === 'hearth' && m.node === node).tick;
  return up({ sector: S(seed), from: fall - sec(dur * 0.55), dur, speed: 1, loud: 1,
    cam: [{ t: 0, node, zoom: 0.34, dy: 30 }, { t: 1, node, zoom: 0.4, dy: 30 }] }, lines);
};
/** The star (`NOVA`) erupting `at` seconds into the shot. */
const pErupt = (dur, lines, at = 0.8) => up({ sector: S(NOVA.seed), from: sec(NOVA.at - at), dur, speed: 1,
  cam: [{ t: 0, node: NOVA.node, zoom: 0.3, dy: 30 }, { t: 0.45, node: NOVA.node, zoom: 0.26, dy: 30 }, { t: 1, node: NOVA.node, zoom: 0.17, dy: 30 }] }, lines);
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
const pWar = (dur, lines) => up({ sector: S(3, { ages: true }), from: min(16.33) - 20, dur, speed: 1, loud: 1,
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
  // (The run's own first two cards, then an Epic: the deal builds up to the card the view comes to rest on. The
  // run dealt a common last, and the shot ended on it while the rare one waited.)
  { blank: true, stars: true, dur: HG * 2, vignette: 0.3, draft: { ...DRAFT_RUN, hover: [2, 2.25], pan: 'deal', zoom: 2, deal: ['stargazers', 'reverse', 'bpDread'] },
    text: [{ at: 0.25, until: HG * 2 - 0.15, style: 'lore', lines: ['NEW {BOONS}', 'EVERY RUN'], y: 0.12 }] },
  pBanners(HG * 2, ['SIX {HOUSES}']),
  { ...pBattle('goldRedOrange', HG * 2, ['[!WAR]']), hard: true },
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
  { ...pBattle('tealGold', FF * 2, ['THE {CROWN}']), hard: true },
  pEnd(5, FREE),
];
// 3. The Daily throne: one sector a day, the same for everyone; the fastest crown takes the throne.
// (Short, one idea a shot: 4 bars of The Empty Throne and the end card, 15 s. It was 35 s, and said each thing twice.)
const sc = [
  pPicture('daily', ET, ['EVERY {DAY}', 'ONE SECTOR']),
  // (Not "the same rivals": a Daily's rivals are drawn from the houses the player did not choose.)
  pKindle(ET, ['THE SAME', 'FOR {EVERYONE}']),
  { ...pHearth(ET, ['FASTEST', '{CROWN}']), hard: true },
  pNight(ET, ["TODAY'S", '{HEGEMARCH}']),
  pEnd(5, ['DAILY RUN · FREE', 'HEGEMARCH.COM']),
];
// 4. The Starfall, shown whole: too many ships to fight, a Starfall armed at their star, its fuse, and the eruption
// seen at three places at once: the star, the Corsairs' Stronghold and its horde, a world scorched. Nova Ardent in
// seed 8 led by the Choir, at 69.8 minutes: 161 ships and 7 worlds (scan-8-choir.json; its Starfall the Choir's, armed
// two minutes before). (It was Xanth in seed 8, whose eruption took no ship: the fleets had left the system.)
const BLAST = { sector: S(8, { heir: 'choir' }), star: 11, haven: 20, world: 14, at: scan('8-choir').moments.find((m) => m.kind === 'nova' && m.node === 11).tick };
const ARMED = BLAST.at - sec(120);
const blast = (from, dur, node, zoom, lines, more = {}) =>
  up({ sector: BLAST.sector, from, dur, speed: 1, ...more, cam: [{ t: 0, node, zoom, dy: 30 }, { t: 1, node, zoom: zoom * 1.06, dy: 30 }] }, lines);
const sd = [
  blast(ARMED - sec(12), TA * 1.5, BLAST.haven, 0.26, ['TOO MANY', 'TO [!FIGHT]?']),
  { ...blast(ARMED - sec(1), TA * 1.5, BLAST.star, 0.36, ['ARM A', '{STARFALL}']), dip: true },
  { ...up({ sector: BLAST.sector, from: ARMED + sec(1.8), dur: TA * 1.5, speed: [20, 60],
    cam: [{ t: 0, node: BLAST.star, zoom: 0.34, dy: 30 }, { t: 1, node: BLAST.star, zoom: 0.2, dy: 30 }] }, ['TWO', 'MINUTES...']), hard: true },
  { ...blast(BLAST.at - sec(0.6), TA, BLAST.star, 0.26, null, { loud: 1.1 }), hard: true },
  { ...blast(BLAST.at - sec(1.0), TA * 1.5, BLAST.haven, 0.3, ['NO', 'SURVIVORS'], { loud: 1.1 }), hard: true },
  // (No words of ours: the game's own SCORCHED stands over the world.)
  { ...blast(BLAST.at - sec(0.2), TA, BLAST.world, 0.42, null, { labels: true }), hard: true },
  pEnd(5, FREE),
];
void PW;
Object.assign(TRAILERS, {
  'short-pitch': short(sa, [bed('Hegemarch', sa, 0, [{ bars: 2, voices: 'b', vol: 0.5 }, { bars: 2, voices: 'ab', vol: 0.6 }, { bars: 12, voices: 'abd', vol: 0.75 }])]),
  'short-ages': short(sb, [bed('First Fires', sb, 0, [{ bars: 4, voices: 'bh', vol: 0.5 }, { bars: 4, voices: 'abh', vol: 0.6 }, { bars: 8, voices: 'abd', vol: 0.72 }])]),
  'short-daily': short(sc, [bed('The Empty Throne', sc, 0, [{ bars: 1, voices: 'b', vol: 0.58 }, { bars: 3, voices: 'abd', vol: 0.72 }])]),
  'short-starfall': short(sd, [bed('To Arms', sd, 0, [{ bars: 2, voices: 'bd', vol: 0.62 }, { bars: 6, voices: 'abd', vol: 0.76 }])]),
});

// ------------------------------------------------------------------------------------------------
// 5. Narrated: the Epic, told over by the one who made the game (promo/trailers/narrated.html has the words, line
//    by line against its shots). The Epic's story, the cradle and then the stars, each shot as long as what is said
//    over it. A keyword or two in place of the story's lines: the voice tells the story, and no one reads one
//    sentence while hearing another. Its tunes are beds (no melody: the voice is the melody) and its sound is
//    quieter (-20 LUFS, as the Shorts': the voice goes on top). Its Starfall is the Starfall Short's: the horde at
//    Blackstar Haven, the star erupting, the horde gone.
// ------------------------------------------------------------------------------------------------
/**
 * Nova Ardent's system, wide: on `node` from `from`, drawn in a little. (The blast and the horde's end at half the
 * fighting's loudness: at full they stood 6 dB over the rest of the war, and over the voice.)
 */
const wideBlast = (from, dur, node, zoom, loud = 1.1) => ({ sector: BLAST.sector, from, dur, speed: 1, loud, duck: 0.88, ...cinema,
  cam: [{ t: 0, node, zoom }, { t: 1, node, zoom: zoom * 1.06 }], text: [] });
const nv = [
  { ...dawn(FF * 2, null, cinema), fadeIn: 1.2 },
  { ...firstFire(FF * 3, null, cinema), dip: true },
  { ...cradleRise(FF * 3, ['{AGES} MODE'], cinema), dip: true },
  { ...climb(FF * 3, ['SIX {AGES}'], cinema), dip: true },
  { ...cradleWar(FF * 3, null, cinema), dip: true },
  { ...launch(FF * 2, null, cinema), dip: true },
  // (The cradle's last chord rings under the dark, and To Arms begins with the light.)
  { ...darkSector(BRIDGE, null, cinema), dip: true },
  { ...kindle(TA * 5, null, cinema), dip: true },
  sixBanners(TA * 5, ['SIX {HOUSES}'], cinema),
  boonDraft(TA * 6, cinema),
  battle('goldOrange', TA * 3, null, cinema, { punch: true }),
  { ...wideBlast(ARMED - sec(12), TA * 3, BLAST.haven, 0.3), hard: true },
  // (The star erupts as "explodes" is said, two seconds in; the horde dies a second into the next.)
  { ...wideBlast(BLAST.at - sec(2.2), TA * 2, BLAST.star, 0.24, 0.55), hard: true },
  { ...wideBlast(BLAST.at - sec(0.9), TA * 2, BLAST.haven, 0.3, 0.55), hard: true },
  { ...hearthFalls('goldOnViolet', TA * 5, null, cinema), hard: true },
  picture('daily', TA * 5, ['THE {DAILY} RUN'], cinema),
  // (The Wayfarers at the Concord's Hearth: the fullest of the battles, its swarm above the words.)
  battle('tealGold', TA * 4, ['MADE IN {CODE}'], cinema, { punch: true }),
  // (Long enough for the last line to be said under the name.)
  logo(7, ['FROM THE STONE AGE TO THE STARS', PLAY], null, cinema),
];
Object.assign(TRAILERS, {
  narrated: { ...trailer(nv, [
    tune('First Fires', nv, 0, 6, { fromBar: 0, ring: BRIDGE,
      arrangement: [{ bars: 4, voices: 'bh', vol: 0.5 }, { bars: 4, voices: 'abh', vol: 0.58 }, { bars: 8, voices: 'abd', vol: 0.68 }] }),
    tune('To Arms', nv, 7, last(nv), { fromBar: 4, ring: RING,
      arrangement: [{ bars: 4, voices: 'bd', vol: 0.62 }, { bars: 12, voices: 'abd', vol: 0.7 }, { bars: 24, voices: 'abd', vol: 0.76 }] }),
  ], at(nv, last(nv))), lufs: -20, sfxVol: 0.8 },
});

// ------------------------------------------------------------------------------------------------
// The Six Houses: a lore series of Shorts, a house a week, to be narrated over (promo/houses/scripts.html).
// Each the same shape: its Ark casting its House Power (1.27), slowed, with no words; its name; where it comes
// from; how it plays; its power, named; its motto; and next week's house. Every shot is of a sector that house
// leads, its Ark among the others' (scan-<seed>-<house>.json: HEIR=<house> node scripts/trailer/make.mjs scan
// <seed>). (Until 1.27 each opened on its Ark's "signature" ability, which any Ark could learn: the sectors were
// chosen again for their powers. The Lyceum's is the one of thirty where its Ark read the most rivals in the
// biggest fights; the Remnant's, where its coin came up heads with the most around it.)
// ------------------------------------------------------------------------------------------------
const SL = (60 / 84 / 2) * 6; // Starlanes: in three, A minor
const CR = bar(104); // The Crowning: C major
const EM = bar(80); // Embers: F major
const HOUSE_SEED = { vael: 90, wayfarer: 14, concord: 23, lyceum: 14, choir: 8, ashen: 15 };
const POWER = { vael: 'callarms', wayfarer: 'wayfinder', concord: 'dawn', lyceum: 'mindtheft', choir: 'conversion', ashen: 'wager' };
{
  // (Checked against the game: each house's power as data/heirs.ts gives it.)
  const game = fs.readFileSync('src/game/data/heirs.ts', 'utf8');
  for (const [id, power] of Object.entries(POWER)) {
    const said = game.match(new RegExp(`id: '${id}',[\\s\\S]*?power: '([^']*)'`))?.[1];
    if (said !== power) throw new Error(`${id}: the Short casts ${power}, the game ${said}`);
  }
}
const hsec = (id) => S(HOUSE_SEED[id], { heir: id });
const hscan = (id) => scan(`${HOUSE_SEED[id]}-${id}`);
const hue = (id) => HOUSES[id][3];
/** The house's moment of a kind nearest `m` minutes (a battle: one it fights in, at `node`; a Wager, one that came up heads). */
const near = (id, kind, m, node) => {
  const mine = (x) => (kind === 'battle' ? x.sides?.includes(0) && !x.sides.includes(-1) : x.who === 0) && (kind !== 'ability' || (x.ark && x.ability === POWER[id] && x.heads !== false));
  const list = hscan(id).moments.filter((x) => x.kind === kind && mine(x) && (node === undefined || x.node === node));
  if (!list.length) throw new Error(`${id}: no ${kind}${node === undefined ? '' : ` at ${node}`}`);
  return list.sort((a, b) => Math.abs(a.tick - min(m)) - Math.abs(b.tick - min(m)))[0];
};
/**
 * A keyword or two at the top, its {phrases} in the house's colour. A card that weighs a gain against a cost marks
 * them as the game does, [a gain] in teal and [!a cost] in red, not in the house's colour: Vael's is that red, and
 * its gain read as a second cost.
 */
const hup = (id, shot, lines) => ({ ...shot, bars: 0, vignette: 0.35, text: lines ? [{ at: 0.25, until: shot.dur - 0.12, style: 'lore', lines, y: 0.22, accent: hue(id) }] : [] });
/**
 * Its Ark casting its House Power at about `m` minutes: slowed as it does, then coming up to speed. The camera on
 * the Ark (`dy` pixels under the middle: less, where its fleet is below it and would fall under YouTube's
 * buttons); for a power that reaches far (Dawn's worlds, a Wayfinder's starlane), on all that it reached; for a
 * Call to Arms, far enough out to see the Forges' light run in to the Ark. `after` seconds after the cast to
 * begin, for a power that lands later than it is cast (a Wager's coin, in the air for 1.6 seconds).
 */
const hCast = (id, m, dur, lines, slow = 0.4, dy = 30, after = 0) => {
  const c = near(id, 'ability', m);
  const wide = c.span && (POWER[id] === 'dawn' || POWER[id] === 'wayfinder');
  const z = wide ? Math.max(0.02, Math.min(0.4, 105 / Math.max(1, c.span.r))) : POWER[id] === 'callarms' ? 0.12 : 0.6;
  const at = wide ? { x: c.span.x, y: c.span.y } : { x: c.x, y: c.y };
  return hup(id, { sector: hsec(id), from: c.tick - Math.round(0.9 * slow * 20) + Math.round(after * 20), dur, speed: [slow, Math.min(1, slow * 2.5)], loud: 1, duck: 0.9,
    cam: [{ t: 0, ...at, zoom: z, dy }, { t: 1, ...at, zoom: z * 0.8, dy }] }, lines);
};
/** Its biggest fleet out on the starlanes at about `m` minutes, followed. */
const hVoyage = (id, m, dur, lines, speed = 1.5) => hup(id, { sector: hsec(id), from: near(id, 'voyage', m).tick, dur, speed, loud: 0.6,
  cam: [{ t: 0, follow: 0, zoom: 0.36, dy: 30 }, { t: 1, follow: 0, zoom: 0.3, dy: 30 }] }, lines);
/** A battle it fights at `node`, at about `m` minutes. */
const hBattle = (id, m, node, dur, lines, zoom = 0.34) => hup(id, { sector: hsec(id), from: near(id, 'battle', m, node).tick - sec(1), dur, speed: 1, loud: 1, duck: 0.9,
  cam: [{ t: 0, node, zoom, dy: 30 }, { t: 1, node, zoom: zoom * 1.12, dy: 30 }] }, lines);
/** The house's realm from above, its colour spreading over the first minutes. */
const hRealm = (id, dur, lines) => hup(id, { sector: hsec(id), from: sec(10), dur, speed: [12, 60], sounds: false,
  cam: [{ t: 0, zoom: 'fit', fit: 1.6 }, { t: 1, zoom: 'fit', fit: 1.75 }] }, lines);
/**
 * Each house's description, whole, as the game gives it on the choice of house (data/heirs.ts): broken for an
 * upright card, its phrase in the house's colour. Checked against the game's own words below, so that the card
 * always says what the game does.
 */
const DESC = {
  vael: ['A MARTIAL HOUSE', 'THAT BELIEVES', '{THE DARK IS WON}', '{IN FIRE}.', 'THEIR WARSHIPS', 'HIT HARDER AND', 'COST LESS.'],
  wayfarer: ['NOMAD FLEETS', 'WHO {NEVER}', '{STOPPED MOVING}.', 'FAST ON THE', 'STARLANES AND', 'QUICK TO', 'KINDLE.'],
  concord: ['PATIENT', 'STEWARDS WHO', 'REMEMBER', '{THE OLD LIGHT}.', 'STEADY, STURDY', 'AND RICH.'],
  lyceum: ['SCHOLARS JOINED', 'IN {ONE MIND}.', 'QUICK TO LEARN', 'AND QUICK TO', 'SWARM, BUT', 'THEIR HULLS', 'ARE THIN.'],
  choir: ['ZEALOTS OF', '{A FLAME THAT}', '{NEVER WENT OUT}.', 'THEY CONVERT', 'WHAT OTHERS', 'DESTROY, AND', 'THEY NEVER RUN.'],
  ashen: ['SURVIVORS WHO', 'WALKED OUT OF', '{THE FIRE} THAT', 'ENDED THE', 'OLD AGE.', 'THEY GAMBLE', 'EVERYTHING', 'ON FATE.'],
};
{
  const game = fs.readFileSync('src/game/data/heirs.ts', 'utf8');
  for (const [id, lines] of Object.entries(DESC)) {
    const said = game.match(new RegExp(`id: '${id}',[\\s\\S]*?desc: '([^']*)'`))?.[1];
    const card = lines.join(' ').replace(/[{}]/g, '');
    if (said?.toUpperCase() !== card) throw new Error(`${id}: the card says "${card}", the game "${said}"`);
  }
}
/**
 * Its name in its colour, its title and its banner; then what it is, in the game's words, typed out letter by
 * letter, its phrase rippling in the house's colour once it is there.
 */
const hName = (id, dur) => {
  const [name, title, , color] = HOUSES[id];
  // (Upright, a long name goes on two lines.)
  const names = id === 'choir' ? ['CHOIR OF THE', 'FIRST FLAME'] : name.length > 15 ? name.split(' ') : [name];
  const two = names.length > 1;
  const desc = DESC[id];
  const top = two ? 166 : 158;
  const tall = desc.length * 16 + (desc.length - 1) * 10;
  return { blank: true, stars: true, dur, vignette: 0.3,
    panels: [{ at: 0.6, until: dur + 1, kind: 'banners', heirs: [id], names: false, x: 20, y: two ? 100 : 92, w: 230, h: 48, scale: 2 }],
    text: [
      { at: 0.2, until: dur - 0.1, style: 'lore', lines: names, y: 0.1, color, type: false },
      { at: 0.45, until: dur - 0.1, style: 'caption', lines: [title], y: two ? 0.178 : 0.155, color: '#fff4e0' },
      { at: 1.1, until: dur - 0.1, style: 'lore', lines: desc, y: (top + tall / 2) / 480, accent: color, type: true, cps: 26 },
    ] };
};
/** The real draft of the house's run, its cards dealt and panned as they come, one taken. */
const hDraft = (id, dur, lines, hover, zoom = 1.6) => ({ blank: true, stars: true, dur, vignette: 0.3,
  draft: { sector: hsec(id), tick: min(8), hover, pan: 'deal', zoom },
  text: [{ at: 0.25, until: dur - 0.15, style: 'lore', lines, y: 0.12, accent: hue(id) }] });
/** Its motto, large, on the night. */
const hMotto = (id, dur, lines) => ({ blank: true, stars: true, dur, vignette: 0.3, text: [{ at: 0.3, until: dur - 0.12, style: 'big', lines, y: 0.4, accent: hue(id) }] });
/** The name, as its flame kindles: lead this house, free; and next week's house (its banner), or the question the series ends on. */
const LEAD = { vael: 'VAEL', wayfarer: 'WAYFARERS', concord: 'CONCORD', lyceum: 'LYCEUM', choir: 'CHOIR', ashen: 'REMNANT' };
const hEnd = (id, next) => ({ blank: true, stars: true, dur: 5, vignette: 0.4,
  panels: next ? [{ at: 1.7, until: 6, kind: 'banners', heirs: [next], x: 45, y: 316, w: 180, h: 36, scale: 1 }] : [],
  text: [
    { at: 0.1, until: 5, style: 'logo', lines: [`LEAD THE {${LEAD[id]}}`, 'FREE AT HEGEMARCH.COM'], y: 0.42, accent: hue(id) },
    next ? { at: 1.5, until: 5, style: 'caption', lines: ['NEXT WEEK'], y: 0.635 } : { at: 1.5, until: 5, style: 'lore', lines: ['WHICH HOUSE', 'ARE YOU?'], y: 0.69 },
  ] });

// 1. The Vael Imperium: To Arms.
const hv = [
  hCast('vael', 12.25, TA * 3, null),
  hName('vael', TA * 4),
  hVoyage('vael', 42.17, TA * 3, ['SWORN TO {WAR}']),
  hBattle('vael', 53.0, 26, TA * 2, ['+15% {DAMAGE}']),
  { ...hBattle('vael', 59.5, 34, TA * 2, ['[CHEAPER] SHIPS', '[!LESS LORE]'], 0.3), hard: true },
  hCast('vael', 46.73, TA * 3, ['THE {TYRANT}', 'CALL TO ARMS'], 0.6),
  hMotto('vael', TA * 3, ['THE DARK', 'IS WON', 'IN {FIRE}']),
  hEnd('vael', 'wayfarer'),
];
// 2. The Wayfarer Clans: Starlanes, in three.
const hw = [
  hCast('wayfarer', 24.41, SL * 2, null),
  hName('wayfarer', SL * 3.5),
  hVoyage('wayfarer', 22.5, SL * 2, ['NOMAD', '{FLEETS}']),
  hVoyage('wayfarer', 26.5, SL * 2, ['STARLANES', '{30%} FASTER'], 2.5),
  hRealm('wayfarer', SL * 2, ['KINDLING', '{35%} CHEAPER']),
  hCast('wayfarer', 16.44, SL * 2.5, ['THE {WANDERER}', 'WAYFINDER'], 0.6),
  hMotto('wayfarer', SL * 2, ['NEVER', '{STILL}']),
  hEnd('wayfarer', 'concord'),
];
// 3. The Solar Concord: The Crowning.
const hc = [
  hCast('concord', 2.07, CR * 2, null),
  hName('concord', CR * 3),
  hVoyage('concord', 57.25, CR * 2, ['KEEPERS OF', 'THE OLD {LIGHT}']),
  hRealm('concord', CR * 2, ['+10% {EMBERS}']),
  { ...hBattle('concord', 27.67, 2, CR * 2, ['{STURDIER} WORLDS'], 0.3), dip: true },
  hCast('concord', 7.51, CR * 3, ['THE {SOVEREIGN}', 'BRINGS DAWN'], 0.6),
  hMotto('concord', CR * 2, ['WE KEEP', 'THE {LIGHT}']),
  hEnd('concord', 'lyceum'),
];
// 4. The Lyceum Collective: Breakers.
const hl = [
  hCast('lyceum', 26.61, BK * 3, null),
  hName('lyceum', BK * 5),
  hVoyage('lyceum', 48.08, BK * 2, ['ONE {MIND}']),
  hBattle('lyceum', 49.42, 38, BK * 2, ['+25% {LORE}', 'MORE BOONS']),
  { ...hBattle('lyceum', 38.92, 6, BK * 2, ['CHEAP', '{STRIKERS}'], 0.3), hard: true },
  hCast('lyceum', 12.68, BK * 3, ['THE {OVERMIND}', 'MIND THEFT'], 0.6),
  hMotto('lyceum', BK * 3, ['MANY MINDS', 'ONE {SWARM}']),
  hEnd('lyceum', 'choir'),
];
// 5. The Choir of the First Flame: Embers.
const hf = [
  hCast('choir', 31.85, EM * 1.5, null),
  hName('choir', EM * 2.5),
  hVoyage('choir', 58.0, EM * 1.5, ['THE FIRST', '{FLAME}']),
  hBattle('choir', 55.75, 0, EM * 1.5, ['EVERY LOSS', 'FEEDS {ZEAL}']),
  { ...hBattle('choir', 53.42, 24, EM * 1.5, ['THEY NEVER {RUN}'], 0.3), hard: true },
  hCast('choir', 46.89, EM * 1.5, ['THE {CANTOR}', 'CONVERSION'], 0.6),
  hMotto('choir', EM * 2, ['WHAT', 'OTHERS', 'DESTROY,', 'WE {CONVERT}']),
  hEnd('choir', 'ashen'),
];
// 6. The Ashen Remnant: Last Stand; its draft of four.
const ha = [
  // (Its coin already in the air: the opener is short, and what it is for is the fleet that burns.)
  hCast('ashen', 33.04, LS * 2, null, 0.4, 30, 0.9),
  hName('ashen', LS * 4),
  hVoyage('ashen', 32.58, LS * 2, ['OUT OF', 'THE {FIRE}']),
  hDraft('ashen', LS * 4, ['{FOUR} BOONS', 'TO CHOOSE'], [3, LS * 4 * 0.72]),
  { ...hBattle('ashen', 29.92, 14, LS * 2, ['[+2 REROLLS]', '[!FEWER EMBERS]'], 0.3), dip: true },
  hCast('ashen', 21.71, LS * 3, ['{EMBER THRONE}', 'FATE\'S WAGER'], 0.6),
  hMotto('ashen', LS * 3, ['FATE', 'FAVOURS', 'THE {BURNED}']),
  hEnd('ashen', null),
];
const war = (vol) => [{ bars: 2, voices: 'bd', vol: vol - 0.16 }, { bars: 6, voices: 'abd', vol: vol - 0.08 }, { bars: 12, voices: 'abd', vol }];
Object.assign(TRAILERS, {
  'house-vael': short(hv, [bed('To Arms', hv, 0, war(0.76))]),
  'house-wayfarer': short(hw, [bed('Starlanes', hw, 0, [{ bars: 4, voices: 'b', vol: 0.55 }, { bars: 12, voices: 'ab', vol: 0.7 }])]),
  'house-concord': short(hc, [bed('The Crowning', hc, 0, [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 6, voices: 'ab', vol: 0.62 }, { bars: 8, voices: 'abd', vol: 0.72 }])]),
  'house-lyceum': short(hl, [bed('Breakers', hl, 0, war(0.76))]),
  'house-choir': short(hf, [bed('Embers', hf, 0, [{ bars: 2, voices: 'b', vol: 0.55 }, { bars: 4, voices: 'ab', vol: 0.62 }, { bars: 6, voices: 'abh', vol: 0.7 }])]),
  'house-ashen': short(ha, [bed('Last Stand', ha, 0, war(0.76))]),
});

// ------------------------------------------------------------------------------------------------
// Multiplayer (1.28), a Short: two friends, one alliance, and then rivals. Seed 47 played as a co-op game
// (scan-47-coop.json: the Concord and the Wayfarers allied against the Vael and the Lyceum; the allies' houses played
// by the AI as a player's is who has left): the three houses' fight at Achernar II; their siege of the Vael's Hearth,
// Vaelor; the Wayfarers' ping at the Lyceum's Hearth, Lycea, and their fleet coming in to it; Lycea
// falling, and the game won together. Then the same two houses as rivals, in versus (scan-3-versus.json): the
// Wayfarers at the Concord's Hearth. Gold and teal, as the title screen's card has its allies.
// ------------------------------------------------------------------------------------------------
const COOP = scan('47-coop').sector;
const VERSUS = scan('3-versus').sector;
const coopAt = (kind, node) => scan('47-coop').moments.find((m) => m.kind === kind && m.node === node).tick;
const VAELOR = 24;
const LYCEA = 31;
const ACHERNAR = 27;
/** A shot of a multiplayer game: `sector` from `from`, on `node` (`dx` pixels right of the middle), the camera drawn in a little. */
const mp = (sector, from, dur, node, zoom, lines, more = {}, dx = 0) =>
  up({ sector, from, dur, speed: 1, loud: 1, duck: 0.9, ...more, cam: [{ t: 0, node, zoom, dx, dy: 30 }, { t: 1, node, zoom: zoom * 1.1, dx, dy: 30 }] }, lines);
const LYCEA_FALLS = coopAt('hearth', LYCEA);
const sm = [
  // (The Lyceum's fleet of 38 comes at Achernar II, and the allies meet it together: the biggest fight of the scans.)
  mp(COOP, min(23.9), TA * 2, ACHERNAR, 0.3, ['{MULTIPLAYER}', 'IS HERE']),
  // (Vaelor ringed by both allies' ships, a few seconds before it falls.)
  { ...mp(COOP, coopAt('hearth', VAELOR) - sec(8), TA * 1.5, VAELOR, 0.36, ['BRING A', '{FRIEND}']), hard: true },
  // (The Concord at Lycea, alone; the Wayfarers' player pings it, just above the world (teal among the Concord's
  // gold, where it reads), and their fleet of 12 comes in to it.)
  { ...mp(COOP, min(28.27), TA * 1.5, LYCEA, 0.3, ['PING THE', '{TARGET}'], { speed: 2, pings: [{ at: 0.25, node: LYCEA, who: 1, from: 'ALEX', off: [0, -200] }] }), hard: true },
  // (Lycea falls, and with it the last rival Hearth: the game is won, by both.)
  { ...mp(COOP, LYCEA_FALLS - sec(1.9), TA * 1.5, LYCEA, 0.32, ['WIN', '{TOGETHER}']), hard: true },
  // (Versus: the Wayfarers' swarm at the Concord's Hearth, the world to the left and the swarm in the picture.)
  { ...mp(VERSUS, min(19.3), TA * 1.5, 13, 0.3, ['OR [!FIGHT]', 'EACH OTHER'], {}, -55), hard: true },
  { blank: true, stars: true, dur: 5, vignette: 0.4,
    panels: [{ at: 1.5, until: 6, kind: 'art', art: 'together', x: 15, y: 290, w: 240, h: 84, scale: 3, bare: true }],
    text: [{ at: 0.1, until: 5, style: 'logo', lines: ['{MULTIPLAYER} · FREE', 'HEGEMARCH.COM'], y: 0.42 }] },
];
Object.assign(TRAILERS, {
  'short-multiplayer': short(sm, [bed('To Arms', sm, 0, [{ bars: 2, voices: 'bd', vol: 0.62 }, { bars: 6, voices: 'abd', vol: 0.76 }])]),
});

// ------------------------------------------------------------------------------------------------
// Clips for a post (made into GIFs): no words, no music. The sector from above, its houses' colours spreading
// from the first kindlings to the middle of its war: about 24 minutes of seed 90 in eight seconds.
// ------------------------------------------------------------------------------------------------
Object.assign(TRAILERS, {
  'clip-sector': trailer([{ sector: S(90), from: sec(10), dur: 8, speed: [40, 500], sounds: false,
    cam: [{ t: 0, zoom: 'fit', fit: 1.02 }, { t: 1, zoom: 'fit', fit: 1.1 }] }], [], 0),
  // (A battle up close, for a post about the art being drawn by code: the Concord, the Vael and the Ashen at Lyra II.)
  'clip-battle': trailer([{ ...battle('goldRedOrange', 7, null), sounds: false,
    cam: [{ t: 0, node: 7, zoom: 0.31, dx: 10, dy: -70 }, { t: 1, node: 7, zoom: 0.37, dx: 10, dy: -80 }] }], [], 0),
  // (A star erupting, for a post's GIF: the Starfall's last seconds over a fight, the blast, and the camera drawn back
  // from the fire.)
  'clip-starfall': trailer([{ sector: S(NOVA.seed), from: sec(NOVA.at - 2.4), dur: 6.5, speed: 1, dither: 0.4, sounds: false,
    cam: [{ t: 0, node: NOVA.node, zoom: 0.34, dy: 28 }, { t: 0.36, node: NOVA.node, zoom: 0.34, dy: 28 }, { t: 1, node: NOVA.node, zoom: 0.24, dy: 28 }] }], [], 0),
});

// The music is checked as it is heard: each tune runs whole bars of its shots; it begins on its home chord; its
// melody comes in at the head of a part (bar 1 of 8, where its phrase begins); and it comes home only at the end
// of a phrase (bar 4 or 8).
const HOME_BARS = { 'First Fires': [0, 1, 4, 5], Hegemarch: [0, 4], 'The Empty Throne': [0, 4], 'To Arms': [0, 1, 4, 5], Breakers: [0, 1, 4, 5], 'Last Stand': [0, 1, 4, 5],
  Starlanes: [0, 1, 8, 9], 'The Crowning': [0, 3, 7], Embers: [0, 4] };
for (const [name, t] of Object.entries(TRAILERS)) {
  for (const m of t.music) {
    const bpm = { 'First Fires': 88, 'Long Road': 72, Hegemarch: 112, 'To Arms': 132, 'The Empty Throne': 96, Breakers: 140, 'Last Stand': 126, Starlanes: 84, 'The Crowning': 104, Embers: 80 }[m.track];
    const bars = (m.until - m.at) / bar(bpm, m.track === 'Starlanes' ? 6 : 8);
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
  // (Words are up long enough to read: a shot with words is three and a half seconds at the least; two and a half for
  // a Short's few words, four or fewer, which are read at a glance.)
  for (const s of t.shots) {
    const lore = (s.text ?? []).filter((x) => x.style === 'lore');
    const words = lore.reduce((n, x) => n + x.lines.join(' ').split(/\s+/).length, 0);
    if (lore.length && s.dur < (words <= 4 ? 2.4 : 3.4)) throw new Error(`${name}: a shot of ${s.dur.toFixed(2)} s has ${words} words`);
  }
}
