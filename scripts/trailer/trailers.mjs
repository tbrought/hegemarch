// The trailers (make.mjs makes them): shots of the game's own sectors, played by its own houses, the
// game's own pictures (its modes, its houses), words over them, and the game's own music.
// The moments are where `make.mjs scan` found them: the seed, the tick, the world. Every sector is medium,
// Hard, the houses all the game's AI; `ages: true`, an Ages run on its cradle world.
//
// How they are put together:
// - Each opens on a tune of the Ages, and a more spirited one comes in when the story reaches the stars.
//   The first plays to the end of a part and comes home to its first chord, left to ring (as the game ends
//   a track); an Ark's leap is heard; the second comes in on its first beat. The last comes home under the
//   name at the end.
// - Every shot is a whole number of bars of the tune under it: the cuts fall on the bar.
// - Every line is broken by hand (make.mjs measures each before a frame is made: none too wide, no word
//   left on its own). Words come letter by letter, then stay a while.
// - What is behind words, darkened, is not heard: only the shots of fighting are.
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
const GOLD = '#ffd23f';

// A bar of each tune (eight steps of an eighth note), and a part of it (eight bars).
const bar = (bpm) => (60 / bpm / 2) * 8;
const FIRST_FIRES = bar(88);
const LONG_ROAD = bar(72);
const HEGEMARCH = bar(112);
const TO_ARMS = bar(132);
const LAST_STAND = bar(126);

/** The logo at the end, with what the game is and where it is; a question over it, if any. */
const logo = (dur, question) => ({
  blank: true, stars: true, dur, dither: 0.6,
  text: [
    ...(question ? [{ at: 0.2, until: dur, style: 'lore', lines: [question], y: 0.12 }] : []),
    { at: question ? 0.7 : 0.2, until: dur, style: 'logo', lines: ['CLASSIC · AGES · DAILY', 'PLAY FREE IN YOUR BROWSER · HEGEMARCH.COM'] },
  ],
});
/**
 * A line of the story at the foot of a shot, told as the game tells a decision's: a scan line sweeps down
 * it, and each line catches, ember then gold, then its own colours ({gold}, [teal], [!red]); then it stays.
 */
const say = (dur, lines, at = 0.6) => ({ at, until: dur - 0.15, style: 'lore', lines, y: 0.8 });

// ------------------------------------------------------------------------------------------------
// The shots the trailers share
// ------------------------------------------------------------------------------------------------

/** The cradle: one world, its tribes, the ages, and the world they outgrew. Each two bars of `b`. */
const cradle = (b, words) => [
  { sector: CRADLE, from: 0, dur: b * 2, speed: 2, dither: 1.2, cam: [{ t: 0, zoom: 'fit', fit: 1 }, { t: 1, zoom: 'fit', fit: 1.12 }],
    text: [say(b * 2, words[0], 1.0)] },
  { sector: CRADLE, from: sec(20), dur: b * 2, speed: 3, dither: 0.6, cam: [{ t: 0, node: 10, zoom: 'fit', fit: 2.2 }, { t: 1, node: 10, zoom: 'fit', fit: 2.5 }],
    text: [say(b * 2, words[1])] },
  { blank: true, stars: true, dur: b * 2, dither: 0.6,
    panels: [{ at: 0.2, until: b * 2 - 0.1, kind: 'art', art: 'ages', x: 60, y: 54, w: 360, h: 96, scale: 3 }],
    text: [
      { at: 0.6, until: b * 2 - 0.15, style: 'lore', lines: words[2], y: 0.72 },
      { at: 2.0, until: b * 2 - 0.15, style: 'caption', lines: ['STONE · BRONZE · IRON · POWDER · MACHINE · SPACE'], y: 0.9, type: true, cps: 22 },
    ] },
  { sector: CRADLE, from: min(14.5), dur: b * 2, speed: 4, dither: 0.6, cam: [{ t: 0, zoom: 'fit', fit: 1.15 }, { t: 1, zoom: 'fit', fit: 1.3 }],
    text: [say(b * 2, words[3])] },
];
/** An Ark leaves its cradle: its lands go dark. The tune of the cradle rings home under it; the leap is heard. */
const launch = (dur, words) => ({
  sector: CRADLE, from: min(21.62), dur, speed: 1.5, dither: 0.5, sounds: false, cam: [{ t: 0, node: 0, zoom: 'fit', fit: 1.5 }, { t: 1, node: 0, zoom: 'fit', fit: 1.2 }],
  text: [{ at: 0.3, until: dur - 0.1, style: 'lore', lines: words, y: 0.8 }],
});
const darkSector = (dur, words) => ({
  sector: S(90), from: 0, dur, speed: 0.5, dither: 0.5, sounds: false, cam: [{ t: 0, zoom: 'fit', fit: 0.95 }, { t: 1, zoom: 'fit', fit: 1.1 }],
  text: [say(dur, words, 0.4)],
});
/** Two worlds kindled, one after the other, each in its house's color. */
const kindles = (dur, words) =>
  [[29.0, 34, true], [30.25, 41, false]].map(([at, node, first]) => ({
    sector: S(90), from: sec(at), dur: dur / 2, speed: 1, dither: first ? 0.5 : 0, loud: 1.2, duck: 0.75, cam: [{ t: 0, node, zoom: 0.5 }, { t: 1, node, zoom: 0.56 }],
    text: [{ at: first ? 0.3 : 0, until: dur / 2 - (first ? 0 : 0.15), style: 'lore', lines: words, y: 0.8, held: !first }],
  }));
const siege = (dur, words) => ({
  sector: S(90), from: min(58.72), dur, speed: 1, dither: 0.4, loud: 1.4, duck: 0.7, cam: [{ t: 0, node: 46, zoom: 0.28 }, { t: 1, node: 46, zoom: 0.34 }],
  text: words ? [say(dur, words, 0.5)] : [],
});
const starfall = (dur, words) => ({
  sector: S(23), from: sec(2841), dur, speed: 1, dither: 0.4, duck: 0.7, cam: [{ t: 0, node: 24, zoom: 0.22 }, { t: 0.55, node: 24, zoom: 0.22 }, { t: 1, node: 24, zoom: 0.16 }],
  text: words ? [say(dur, words, 1.6)] : [],
});
const hearthFalls = (dur, words, big = false) => {
  const f = framed('90', [40, 41, 42, 43, 44], 1.05);
  return {
    sector: S(90), from: sec(901.5), dur, speed: 1, dither: 0.4, loud: 1.3, duck: 0.75, cam: [{ t: 0, ...f }, { t: 1, ...f, zoom: f.zoom * 1.12 }],
    text: words ? [big ? { at: 1.4, until: dur - 0.15, style: 'big', lines: words, y: 0.5 } : say(dur, words, 1.4)] : [],
  };
};
const ALL = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];
/** The six houses' banners, coming one after another, with their names. */
const sixBanners = (dur, words, stagger = 0.45) => ({
  blank: true, stars: true, dur, dither: 0.5,
  panels: [{ at: 0.6, until: dur - 0.1, kind: 'banners', heirs: ALL, cols: 2, x: 40, y: 46, w: 400, h: 196, scale: 2, stagger }],
  text: [{ at: 0.2, until: dur - 0.1, style: 'lore', lines: words, y: 0.09 }],
});
/** Each house: its name in its color, its title, and two lines of what it is. */
const HOUSES = {
  concord: ['SOLAR CONCORD', 'KEEPERS OF THE GOLDEN HEARTH', ['PATIENT STEWARDS', 'WHO REMEMBER THE OLD LIGHT.'], '#ffd23f'],
  vael: ['VAEL IMPERIUM', 'THE BLOOD-SWORN HOUSE', ['A MARTIAL HOUSE:', 'THE DARK IS WON IN FIRE.'], '#e0402f'],
  wayfarer: ['WAYFARER CLANS', 'THE WANDERING HOUSE', ['NOMAD FLEETS,', 'FAST ON THE STARLANES.'], '#2fd5a6'],
  lyceum: ['LYCEUM COLLECTIVE', 'THE HIVE-MINDED HOUSE', ['SCHOLARS OF ONE MIND,', 'QUICK TO LEARN AND TO SWARM.'], '#b05cff'],
  choir: ['CHOIR OF THE FIRST FLAME', 'THE FAITHFUL HOUSE', ['ZEALOTS OF A FLAME', 'THAT NEVER WENT OUT.'], '#3fa7ff'],
  ashen: ['ASHEN REMNANT', 'THE LAST OF THE OLD LIGHT', ['SURVIVORS OF THE FIRE', 'THAT ENDED THE OLD AGE.'], '#ff8a1f'],
};
/** Two houses, one over the other: name, banner, and what it is. */
const pair = (dur, a, b) => {
  const rows = [[a, 0, 44], [b, 1.2, 164]];
  return {
    blank: true, stars: true, dur, dither: 0.5,
    panels: rows.map(([id, at, y]) => ({ at: 0.3 + at, until: dur - 0.1, kind: 'banners', heirs: [id], names: false, x: 90, y, w: 300, h: 48, scale: 2 })),
    text: rows.flatMap(([id, at, y]) => {
      const [name, title, lines, color] = HOUSES[id];
      return [
        { at: 0.3 + at, until: dur - 0.1, style: 'lore', lines: [name], y: (y - 13) / 270, color, type: false },
        { at: 0.6 + at, until: dur - 0.1, style: 'caption', lines: [title], y: (y + 48 + 10) / 270, color: '#fff4e0' },
        { at: 0.9 + at, until: dur - 0.1, style: 'caption', lines, y: (y + 48 + 31) / 270 },
      ];
    }),
  };
};

/**
 * The bridge between the tunes: the first one's last chord rings all the way across it, and the next comes
 * in on its first beat as the chord dies away (no silence between them).
 */
const BRIDGE = () => 2.8;
/** A tune's place in a trailer: from `at`, its part, for `bars` bars, coming home at the end. */
const tune = (track, at, bpm, bars, part, ring) => ({ track, at, until: at + bar(bpm) * bars, part, close: true, ring });
const sum = (shots) => shots.reduce((s, x) => s + x.dur, 0);
const LEAP = (at) => [at, 'jump', 0.9, 0];

// ------------------------------------------------------------------------------------------------
// The Climb: the story, from one world in the Stone Age to the crown among the stars.
// ------------------------------------------------------------------------------------------------
const climbA = cradle(FIRST_FIRES, [
  ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'],
  ['TRIBES LIT ITS', '{FIRST FIRES}.'],
  ['AGE BY AGE, THEY [CLIMBED].'],
  ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'],
]);
const climbBridge = launch(BRIDGE(88), ['THEY LEFT IT', 'FOR THE {STARS}.']);
const climbB = [
  darkSector(TO_ARMS * 3, ['THE LAST {HEGEMARCH}', 'HAD [!FALLEN] THERE.']),
  ...kindles(TO_ARMS * 3, ['{LIGHT} THE DARK,', 'WORLD BY WORLD.']),
  siege(TO_ARMS * 3, ['EVERY HOUSE', 'WANTS THE {CROWN}.']),
  starfall(TO_ARMS * 3, ['STARS WILL [!FALL].', 'HOUSES WILL [!FALL].']),
  hearthFalls(TO_ARMS * 4, ['TAKE THE {CROWN}.'], true),
];

// ------------------------------------------------------------------------------------------------
// Six Arks: the climb, and the six houses that came of it.
// ------------------------------------------------------------------------------------------------
const arksA = cradle(FIRST_FIRES, [
  ['BEFORE THE STARS,', 'THERE WAS {ONE WORLD}.'],
  ['ITS TRIBES LIT', 'THE {FIRST FIRES}.'],
  ['AGE BY AGE, THEY [CLIMBED].'],
  ['UNTIL ONE WORLD', 'WAS [!NOT ENOUGH].'],
]);
const arksBridge = launch(BRIDGE(88), ['THEIR {ARKS} LEFT', 'FOR THE STARS.']);
const arksB = [
  darkSector(TO_ARMS * 2, ['THE LAST {HEGEMARCH}', 'HAD [!FALLEN] THERE.']),
  sixBanners(TO_ARMS * 4, ['SIX {HOUSES} ROSE.']),
  ...kindles(TO_ARMS * 2, ['{LIGHT} THE DARK,', 'WORLD BY WORLD.']),
  siege(TO_ARMS * 3, ['EVERY HOUSE', 'WANTS HIS {CROWN}.']),
  starfall(TO_ARMS * 3, ['STARS WILL [!FALL].', 'HOUSES WILL [!FALL].']),
  hearthFalls(TO_ARMS * 2, ['ONE WILL BE {CROWNED}.']),
];

// ------------------------------------------------------------------------------------------------
// Six Houses Rise: where they came from, and each of them, two by two.
// ------------------------------------------------------------------------------------------------
const riseA = [
  darkSector(FIRST_FIRES * 2, ['THE LAST {HEGEMARCH}', 'IS [!DEAD].']),
  ...cradle(FIRST_FIRES, [[], ['EACH HOUSE BEGAN', 'ON {A SINGLE WORLD},'], ['AND [CLIMBED], AGE BY AGE,'], []]).slice(1, 3),
  launch(FIRST_FIRES * 2, ['TO THE {STARS}.']),
];
const riseBridge = { blank: true, stars: true, dur: BRIDGE(88), dither: 0.5, text: [{ at: 0.3, until: BRIDGE(88) - 0.1, style: 'lore', lines: ['NOW {SIX HOUSES}', 'WANT HIS CROWN.'], y: 0.5 }] };
const riseB = [
  pair(LAST_STAND * 4, 'concord', 'vael'),
  pair(LAST_STAND * 4, 'wayfarer', 'lyceum'),
  pair(LAST_STAND * 4, 'choir', 'ashen'),
  siege(LAST_STAND * 2, ['ONLY {ONE}', 'WILL BE CROWNED.']),
  hearthFalls(LAST_STAND * 2),
];

// ------------------------------------------------------------------------------------------------
// The Last Hegemarch: the sector as it is, the houses in it, where they came from, and what they want.
// ------------------------------------------------------------------------------------------------
const fallA = [
  { ...darkSector(LONG_ROAD * 2, ['THE LAST {HEGEMARCH} FELL,', 'AND THE SECTOR WENT [!DARK].']), dither: 1.2 },
  sixBanners(LONG_ROAD * 2, ['SIX {HOUSES} REMAIN.'], 0.5),
  { ...cradle(LONG_ROAD, [['EACH ONE BEGAN', 'ON {A SINGLE WORLD},']])[0], dither: 0.6 },
  ...cradle(LONG_ROAD, [[], [], ['AND [CLIMBED], AGE BY AGE,'], []]).slice(2, 3),
];
const fallBridge = launch(BRIDGE(72), ['TO THE {STARS}.']);
const fallB = [
  ...kindles(HEGEMARCH * 2, ['NOW THEY {LIGHT} THE DARK,', 'WORLD BY WORLD,']),
  siege(HEGEMARCH * 3, ['AND EVERY ONE', 'WANTS HIS {CROWN}.']),
  starfall(HEGEMARCH * 3, ['STARS WILL [!FALL].', 'HOUSES WILL [!FALL].']),
];

// ------------------------------------------------------------------------------------------------

/** A trailer: its first tune under the first part, home and ringing under the bridge; the second after. */
function trailer({ a, bridge, b, first, second, end, question, sfxVol = 1.2 }) {
  const t1 = sum(a);
  const t2 = t1 + bridge.dur;
  const t3 = t2 + sum(b);
  return {
    // (The first tune's chord rings across the bridge; the last one's, under the name, to the end.)
    music: [tune(first[0], 0, first[1], first[2], first[3], bridge.dur), tune(second[0], t2, second[1], second[2], second[3], end - 0.2)],
    sounds: [LEAP(t1 + 0.35)],
    sfxVol,
    shots: [...a, bridge, ...b, logo(end, question)],
    check: [t1, first[0], t3 - t2, second[0]],
  };
}

export const TRAILERS = {
  climb: trailer({ a: climbA, bridge: climbBridge, b: climbB, first: ['First Fires', 88, 8, 0], second: ['To Arms', 132, 16, 0], end: 4.5 }),
  arks: trailer({ a: arksA, bridge: arksBridge, b: arksB, first: ['First Fires', 88, 8, 1], second: ['To Arms', 132, 16, 0], end: 5, question: 'WHICH {HOUSE} WILL YOU LEAD?' }),
  rise: trailer({ a: riseA, bridge: riseBridge, b: riseB, first: ['First Fires', 88, 8, 0], second: ['Last Stand', 126, 16, 0], end: 5, question: 'WHICH WILL {YOU} LEAD?' }),
  fall: trailer({ a: fallA, bridge: fallBridge, b: fallB, first: ['Long Road', 72, 8, 1], second: ['Hegemarch', 112, 8, 0], end: 5, question: 'WHICH {HOUSE} WILL YOU LEAD?' }),
};

// (Each tune's bars match its shots: a part of the trailer is a whole number of parts of its tune.)
for (const [name, t] of Object.entries(TRAILERS)) {
  const [aDur, aTrack, bDur, bTrack] = t.check;
  const [m1, m2] = t.music;
  if (Math.abs(m1.until - aDur) > 0.01) throw new Error(`${name}: ${aTrack} lasts ${(m1.until - m1.at).toFixed(2)} s, its shots ${aDur.toFixed(2)} s`);
  if (Math.abs(m2.until - m2.at - bDur) > 0.01) throw new Error(`${name}: ${bTrack} lasts ${(m2.until - m2.at).toFixed(2)} s, its shots ${bDur.toFixed(2)} s`);
}
