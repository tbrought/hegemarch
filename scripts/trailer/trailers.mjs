// The trailers (make.mjs makes them): shots of the game's own sectors, played by its own houses, the
// game's own pictures (its modes, its houses, its Destinies), words over them, and the game's own music.
// The moments are where `make.mjs scan` found them: the seed, the tick, the world. Every sector is medium,
// Hard, the houses all the game's AI; `ages: true`, an Ages run on its cradle world.
//
// Each opens on the music of the Ages (the cradle's), and a more spirited tune comes in later. Shots last
// two bars of their music or so (five to seven seconds), and a line of words stays a while once it is in.
import fs from 'node:fs';

const scans = {};
const scan = (name) => (scans[name] ??= JSON.parse(fs.readFileSync(`promo/trailers/scan-${name}.json`, 'utf8')));
const S = (seed, extra = {}) => ({ seed, size: 'medium', heir: 'concord', difficulty: 2, ...extra });
const CRADLE = S(12, { ages: true });
const sec = (s) => Math.round(s * 20);
const min = (m) => Math.round(m * 60 * 20);
/** The middle of some worlds, and a zoom that holds them all with room round them (at the game's 480x270). */
function framed(name, ids, room = 1.6) {
  const n = ids.map((i) => scan(name).nodes[i]);
  const xs = n.map((p) => p.x);
  const ys = n.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, zoom: Math.min(480 / (w * room + 260), 270 / (h * room + 260)) };
}
const LOGO = (lines = ['CLASSIC · AGES · DAILY', 'PLAY FREE IN YOUR BROWSER · HEGEMARCH.COM']) => ({ style: 'logo', lines });

// The length of a bar of each tune (eight steps of an eighth note): the cuts fall on them.
const bar = (bpm) => (60 / bpm / 2) * 8;
const FIRST_FIRES = bar(88);
const LONG_ROAD = bar(72);
const TO_ARMS = bar(132);
const LAST_STAND = bar(126);

const ALL = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
void framed;

// ------------------------------------------------------------------------------------------------
// 1. The climb: the story, from the first fire on one world to the crown among the stars.
// ------------------------------------------------------------------------------------------------
const climbCradle = [
  { sector: CRADLE, from: 0, dur: FIRST_FIRES * 2, speed: 2, dither: 1.2, cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, zoom: 'fit', fit: 1.12 }],
    text: [{ at: 1.2, until: FIRST_FIRES * 2 - 0.2, style: 'lore', lines: ['BEFORE THE STARS,', 'THERE WAS ONE WORLD.'], y: 0.8, cps: 24 }] },
  { sector: CRADLE, from: sec(20), dur: FIRST_FIRES * 2, speed: 3, dither: 0.6, cam: [{ t: 0, node: 10, zoom: 'fit', fit: 2.2 }, { t: 1, node: 10, zoom: 'fit', fit: 2.5 }],
    text: [{ at: 0.6, until: FIRST_FIRES * 2 - 0.2, style: 'lore', lines: ['TRIBES LIT ITS', 'FIRST FIRES.'], y: 0.8, cps: 24 }] },
  { blank: true, stars: true, dur: FIRST_FIRES * 2, dither: 0.6,
    panels: [{ at: 0.2, until: FIRST_FIRES * 2 - 0.1, kind: 'art', art: 'ages', x: 60, y: 54, w: 360, h: 96, scale: 3 }],
    text: [
      { at: 0.8, until: FIRST_FIRES * 2 - 0.2, style: 'lore', lines: ['AGE BY AGE, THEY CLIMBED.'], y: 0.74, cps: 24 },
      { at: 2.4, until: FIRST_FIRES * 2 - 0.2, style: 'caption', lines: ['STONE · BRONZE · IRON · POWDER · MACHINE · SPACE'], y: 0.88, type: true, cps: 24 },
    ] },
  { sector: CRADLE, from: min(14.5), dur: FIRST_FIRES * 2, speed: 4, dither: 0.6, cam: [{ t: 0, zoom: 'fit', fit: 1.15 }, { t: 1, zoom: 'fit', fit: 1.3 }],
    text: [{ at: 0.6, until: FIRST_FIRES * 2 - 0.2, style: 'lore', lines: ['UNTIL ONE WORLD', 'WAS NOT ENOUGH.'], y: 0.8, cps: 24 }] },
  { sector: CRADLE, from: min(21.62), dur: FIRST_FIRES * 2, speed: 1.5, dither: 0.6, cam: [{ t: 0, node: 0, zoom: 'fit', fit: 1.5 }, { t: 1, node: 0, zoom: 'fit', fit: 1.25 }],
    text: [{ at: 0.6, until: FIRST_FIRES * 2 - 0.1, style: 'lore', lines: ['THEY BUILT ARKS,', 'AND LEFT FOR THE STARS.'], y: 0.8, cps: 24 }], out: 0.5 },
];
const climbStars = [
  { sector: S(90), from: 0, dur: TO_ARMS * 3, speed: 0.5, dither: 0.5, cam: [{ t: 0, zoom: 'fit', fit: 0.95 }, { t: 1, zoom: 'fit', fit: 1.1 }],
    text: [{ at: 0.5, until: TO_ARMS * 3 - 0.2, style: 'lore', lines: ['THE LAST HEGEMARCH', 'HAD FALLEN THERE.'], y: 0.8, cps: 24 }] },
  ...[[29.0, 34, true, 0], [30.25, 41, false, 1]].map(([at, node, first, i]) => ({
    sector: S(90), from: sec(at), dur: (TO_ARMS * 3) / 2, speed: 1, dither: i ? 0 : 0.5, loud: 1.6, duck: 0.65, cam: [{ t: 0, node, zoom: 0.5 }, { t: 1, node, zoom: 0.56 }],
    text: [{ at: 0, until: (TO_ARMS * 3) / 2, style: 'lore', lines: ['LIGHT THE DARK,', 'WORLD BY WORLD.'], y: 0.8, type: first, cps: 24 }],
  })),
  { sector: S(90), from: min(58.72), dur: TO_ARMS * 3, speed: 1, dither: 0.4, loud: 2.4, duck: 0.55, cam: [{ t: 0, node: 46, zoom: 0.28 }, { t: 1, node: 46, zoom: 0.34 }],
    text: [{ at: 0.5, until: TO_ARMS * 3 - 0.2, style: 'lore', lines: ['EVERY HOUSE', 'WANTS THE CROWN.'], y: 0.8, cps: 24 }] },
  { sector: S(23), from: sec(2841), dur: TO_ARMS * 3, speed: 1, dither: 0.4, duck: 0.65, cam: [{ t: 0, node: 24, zoom: 0.22 }, { t: 0.55, node: 24, zoom: 0.22 }, { t: 1, node: 24, zoom: 0.16 }],
    text: [{ at: 1.6, until: TO_ARMS * 3 - 0.2, style: 'lore', lines: ['STARS WILL FALL.', 'HOUSES WILL FALL.'], y: 0.8, cps: 24 }] },
];
const climbStart = climbCradle.reduce((s, x) => s + x.dur, 0);
const climbLogoAt = climbStart + climbStars.reduce((s, x) => s + x.dur, 0);

// ------------------------------------------------------------------------------------------------
// 2. Ways to play: the three runs, the houses, the Boons, the Destinies, and the First Night.
// ------------------------------------------------------------------------------------------------
const W2 = LONG_ROAD * 2;
/** A way to play: its picture of the title screen at the left, its words at the right, over a sector of its own, darkened. */
const mode = (art, sector, from, name, lines) => ({
  sector, from, dur: W2, speed: 2, dim: 0.6, dither: 0.6, cam: [{ t: 0, zoom: 'fit', fit: 1.05 }, { t: 1, zoom: 'fit', fit: 1.15 }],
  panels: [{ at: 0.3, until: W2 - 0.1, kind: 'art', art, x: 28, y: 60, w: 192, h: 150, scale: 3 }],
  text: [
    { at: 0.6, until: W2 - 0.1, style: 'lore', lines: [name], x: 0.73, y: 0.33, color: '#ffd23f', type: false },
    { at: 1.0, until: W2 - 0.1, style: 'caption', lines, x: 0.73, y: 0.6, wrap: 26, type: true, cps: 45 },
  ],
});
const up = (lines) => lines.map((x) => x.toUpperCase());
const ways = [
  { sector: S(5), from: 0, dur: W2, speed: [15, 45], dim: 0.45, dither: 1.2, cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, zoom: 'fit', fit: 1.1 }],
    text: [
      { at: 0.8, until: W2 - 0.1, style: 'title', lines: ['HEGEMARCH'], y: 0.42, type: true, cps: 10 },
      { at: 2.4, until: W2 - 0.1, style: 'caption', lines: ['A SPACE STRATEGY ROGUELITE, IN 8 BITS.'], y: 0.58 },
    ] },
  mode('sector', S(8), min(30), 'CLASSIC RUN', up(['A new sector every run: new rivals, new Boons, new Destinies.', '25 to 70 minutes.'])),
  mode('ages', CRADLE, min(8), 'AGES RUN', up(['Begin as a tribe in the Stone Age. Climb six ages, build your Ark, and carry what you won to the stars.', '50 to 110 minutes.'])),
  mode('daily', S(23), min(25), 'DAILY RUN', up(['One sector for every player each day, by the same rules.', 'The fastest crowns go on the board.'])),
  { blank: true, stars: true, dur: W2, dither: 0.6,
    text: [
      { at: 0.3, until: W2 - 0.1, style: 'lore', lines: ['SIX HOUSES'], y: 0.09, color: '#ffd23f', type: false },
      { at: 1.4, until: W2 - 0.1, style: 'caption', lines: ['EACH WITH ITS OWN STRENGTHS, AND ITS OWN ARK.'], y: 0.95 },
    ],
    panels: [{ at: 0.6, until: W2 - 0.1, kind: 'banners', heirs: ALL, cols: 2, x: 40, y: 40, w: 400, h: 196, scale: 2 }] },
  mode('boons', S(90), min(20), '99 BOONS', up(['Lore fills as you play. Choose one Boon of three, and bend the run your way.', 'Rare, Epic, Legendary, and Pacts that come at a price.'])),
  { blank: true, stars: true, dur: W2, dither: 0.6,
    text: [
      { at: 0.3, until: W2 - 0.1, style: 'lore', lines: ['SIX DESTINIES'], y: 0.09, color: '#ffd23f', type: false },
      { at: 1.4, until: W2 - 0.1, style: 'caption', lines: ['REACH ANY ONE OF THEM, AND THE CROWN IS YOURS.'], y: 0.95 },
    ],
    panels: [{ at: 0.6, until: W2 - 0.1, kind: 'icons', icons: ['conquest', 'domination', 'ascension', 'relics', 'treasury', 'crisis'], cols: 3, x: 60, y: 42, w: 360, h: 194, scale: 6 }] },
  mode('kindle', S(11), min(3), 'THE FIRST NIGHT', up(['New to it? Your first run shows you how, one step at a time.'])),
];

// ------------------------------------------------------------------------------------------------
// 3. Six houses: each in turn, in its own color, until all six want one crown.
// ------------------------------------------------------------------------------------------------
const H1 = FIRST_FIRES * 2;
/** Where each house holds its Hearth, ten minutes into a sector of the scans. */
const HOMES = { concord: [90, 33], vael: [90, 46], wayfarer: [11, 49], lyceum: [90, 26], choir: [23, 50], ashen: [90, 40] };
const TITLES = {
  concord: ['SOLAR CONCORD', 'KEEPERS OF THE GOLDEN HEARTH', 'Patient stewards who remember the old light. Steady, sturdy and rich.', '#ffd23f'],
  vael: ['VAEL IMPERIUM', 'THE BLOOD-SWORN HOUSE', 'A martial house that believes the dark is won in fire.', '#e0402f'],
  wayfarer: ['WAYFARER CLANS', 'THE WANDERING HOUSE', 'Nomad fleets who never stopped moving. Fast on the starlanes.', '#2fd5a6'],
  lyceum: ['LYCEUM COLLECTIVE', 'THE HIVE-MINDED HOUSE', 'Scholars joined in one mind. Quick to learn and quick to swarm.', '#b05cff'],
  choir: ['CHOIR OF THE FIRST FLAME', 'THE FAITHFUL HOUSE', 'Zealots of a flame that never went out. They never run.', '#3fa7ff'],
  ashen: ['ASHEN REMNANT', 'THE LAST OF THE OLD LIGHT', 'Survivors who walked out of the fire that ended the old age.', '#ff8a1f'],
};
const house = (id) => {
  const [seed, node] = HOMES[id];
  const [name, title, desc, color] = TITLES[id];
  return {
    sector: S(seed), from: min(10), dur: H1, speed: 1.5, dim: 0.5, dither: 0.5, cam: [{ t: 0, node, zoom: 0.13, dx: 30 }, { t: 1, node, zoom: 0.15, dx: -30 }],
    panels: [{ at: 0.2, until: H1 - 0.05, kind: 'banners', heirs: [id], names: false, x: 90, y: 112, w: 300, h: 48, scale: 2 }],
    text: [
      { at: 0.3, until: H1 - 0.05, style: 'lore', lines: [name], y: 0.22, color, type: false },
      { at: 0.6, until: H1 - 0.05, style: 'caption', lines: [title], y: 0.33, color: '#fff4e0' },
      { at: 0.8, until: H1 - 0.05, style: 'caption', lines: [desc.toUpperCase()], y: 0.76, wrap: 44, type: true, cps: 40 },
    ],
  };
};
const six = [
  { sector: S(90), from: 0, dur: FIRST_FIRES * 2, speed: [10, 40], dim: 0.3, dither: 1.2, cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, zoom: 'fit', fit: 1.1 }],
    text: [{ at: 1.0, until: FIRST_FIRES * 2 - 0.1, style: 'lore', lines: ['WHEN THE LAST HEGEMARCH FELL,', 'SIX HOUSES ENDURED.'], y: 0.8, wrap: 28, cps: 24 }] },
  ...ALL.map(house),
];
const sixStart = six.reduce((s, x) => s + x.dur, 0);
const sixEnd = [
  { sector: S(90), from: min(58.72), dur: LAST_STAND * 3, speed: 1, dither: 0.4, loud: 2.2, duck: 0.6, cam: [{ t: 0, node: 46, zoom: 0.26 }, { t: 1, node: 46, zoom: 0.33 }],
    text: [{ at: 0.4, until: LAST_STAND * 3 - 0.1, style: 'lore', lines: ['ONLY ONE', 'WILL BE CROWNED.'], y: 0.8, cps: 24 }] },
  { blank: true, stars: true, dur: LAST_STAND * 3, dither: 0.5,
    panels: [
      { at: 0.2, until: LAST_STAND * 3 - 0.1, kind: 'art', art: 'sector', x: 18, y: 66, w: 138, h: 120, scale: 2 },
      { at: 0.5, until: LAST_STAND * 3 - 0.1, kind: 'art', art: 'ages', x: 171, y: 66, w: 138, h: 120, scale: 2 },
      { at: 0.8, until: LAST_STAND * 3 - 0.1, kind: 'art', art: 'daily', x: 324, y: 66, w: 138, h: 120, scale: 2 },
    ],
    text: [
      { at: 0.2, until: LAST_STAND * 3 - 0.1, style: 'lore', lines: ['THREE WAYS TO PLAY'], y: 0.12, color: '#ffd23f', type: false },
      { at: 0.4, until: LAST_STAND * 3 - 0.1, style: 'caption', lines: ['CLASSIC RUN'], x: 87 / 480, y: 0.76 },
      { at: 0.7, until: LAST_STAND * 3 - 0.1, style: 'caption', lines: ['AGES RUN'], x: 240 / 480, y: 0.76 },
      { at: 1.0, until: LAST_STAND * 3 - 0.1, style: 'caption', lines: ['DAILY RUN'], x: 393 / 480, y: 0.76 },
    ] },
];
const sixLogoAt = sixStart + sixEnd.reduce((s, x) => s + x.dur, 0);

export const TRAILERS = {
  climb: {
    music: [
      { track: 'First Fires', at: 0, until: climbStart, part: 0, fade: 1.6 },
      { track: 'To Arms', at: climbStart, until: climbLogoAt + 7, part: 0, fade: 3 },
    ],
    sfxVol: 1.3,
    shots: [
      ...climbCradle,
      ...climbStars,
      { blank: true, stars: true, dur: 7, dither: 0.6,
        text: [{ at: 0.2, until: 2.6, style: 'big', lines: ['TAKE THE CROWN.'], y: 0.46, color: '#ffd23f', type: false }, { at: 2.6, until: 7, ...LOGO() }] },
    ],
  },
  ways: {
    music: [
      { track: 'Long Road', at: 0, until: W2 * 6 + 0.4, part: 0, fade: 1.2 },
      { track: 'The Crowning', at: W2 * 6, until: W2 * 9, part: 1, fade: 2.5 },
    ],
    sfxVol: 1,
    shots: [...ways, { blank: true, stars: true, dur: W2, dither: 0.6, text: [{ at: 0.2, until: W2, ...LOGO() }] }],
  },
  houses: {
    music: [
      { track: 'First Fires', at: 0, until: sixStart + 0.3, part: 1, fade: 1.2 },
      { track: 'Last Stand', at: sixStart, until: sixLogoAt + 6.5, part: 0, fade: 3 },
    ],
    sfxVol: 1.2,
    shots: [...six, ...sixEnd, { blank: true, stars: true, dur: 6.5, dither: 0.6,
      text: [{ at: 0.2, until: 6.5, style: 'lore', lines: ['WHICH WILL YOU LEAD?'], y: 0.12, color: '#ffd23f', type: false }, { at: 0.6, until: 6.5, ...LOGO() }] }],
  },
};
