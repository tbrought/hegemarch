/**
 * The words of the cradle. On the cradle world of an Ages run the game is the same game seen small:
 * worlds are lands, ships are units, starlanes are paths, and a Striker is whatever the house's age
 * makes of it (a Hunter, a Chariot…). Rather than write every line of the game twice, the HUD passes
 * everything it draws through this vocabulary while the run is on the cradle (see `setVocabulary`).
 *
 * Lines written for the cradle itself can say what they mean directly; a word already changed is left
 * alone, so passing a text through twice does no harm.
 */
import { ERAS } from '../game/data/eras';
import { UNITS } from '../game/data/units';
import type { UnitType } from '../game/types';

/** The same thing, by its name among the stars and on the cradle (lower case; plurals listed apart). */
const WORDS: [string, string][] = [
  ['hangar bays', 'storehouses'],
  ['hangar bay', 'storehouse'],
  ['hangar space', 'supply'],
  ['hangar', 'supply'],
  // (A troop has health where a ship has a hull; a land or a Hearth has walls.)
  ['world hull and shields', 'land walls'],
  ['world hull', 'land walls'],
  ['hearth hull', 'hearth walls'],
  ['repair hulls', 'heal units'],
  ['hulls', 'units'],
  ['hull', 'health'],
  ['warships', 'units'],
  ['warship', 'unit'],
  ['ships', 'units'],
  ['ship', 'unit'],
  ['starlanes', 'paths'],
  ['starlane', 'path'],
  // (Kinds of land, by the kinds of world they stand in for.)
  ['garden worlds', 'green lands'],
  ['garden world', 'green land'],
  ['ocean worlds', 'coasts'],
  ['ocean world', 'coast'],
  ['desert worlds', 'dry lands'],
  ['desert world', 'dry land'],
  ['ice worlds', 'frozen lands'],
  ['ice world', 'frozen land'],
  ['volcanic worlds', 'fire lands'],
  ['volcanic world', 'fire land'],
  ['barren worlds', 'bare uplands'],
  ['barren world', 'bare upland'],
  ['s world', 'small land'],
  ['m world', 'broad land'],
  ['l world', 'great land'],
  ['worlds', 'lands'],
  ['world', 'land'],
  ['fleets', 'armies'],
  ['fleet', 'army'],
  ['sector', 'cradle'],
  ['an airless rock', 'a bare upland'],
  ['fly on', 'march on'],
  ['flies to', 'walks to'],
  ['flies out', 'walks out'],
];

/** The unit lines whose names change with the age. */
const LINES: UnitType[] = ['striker', 'guardian', 'breaker', 'scout', 'seed', 'militia'];

const cache = new Map<number, (s: string) => string>();

/** The vocabulary of a house in this age of the cradle. */
export function cradleVocabulary(era: number): (s: string) => string {
  let f = cache.get(era);
  if (f) return f;
  const map = new Map<string, string>(WORDS);
  /** Names of units: every word of them takes a capital ("Armored Car"). Other words follow the sentence. */
  const names = new Set<string>();
  for (const t of LINES) {
    const now = ERAS[era]?.units[t];
    if (!now) continue;
    const was = UNITS[t].name.toLowerCase();
    map.set(was, now.name.toLowerCase());
    map.set(was + 's', (now.plural ?? now.name + 's').toLowerCase());
    names.add(now.name.toLowerCase());
    names.add((now.plural ?? now.name + 's').toLowerCase());
  }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(?:${keys.join('|')})\\b`, 'gi');
  const done = new Map<string, string>();
  f = (s: string): string => {
    let out = done.get(s);
    if (out !== undefined) return out;
    out = s.replace(re, (m) => {
      const to = map.get(m.toLowerCase());
      if (!to) return m;
      // Keep the way it was written: SHOUTED, Capitalized or plain.
      if (m === m.toUpperCase() && m !== m.toLowerCase()) return to.toUpperCase();
      if (m[0] !== m[0].toLowerCase()) return names.has(to) ? to.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : to[0].toUpperCase() + to.slice(1);
      return to;
    });
    // (Texts with running numbers pass through every frame: do not remember them all.)
    if (done.size > 4000) done.clear();
    done.set(s, out);
    return out;
  };
  cache.set(era, f);
  return f;
}

/** What a unit of this type and of this age is called. */
export function unitName(type: UnitType, era: number): string {
  return ERAS[era]?.units[type]?.name ?? UNITS[type].name;
}

/** "3 Spearmen", "1 Hunter". */
export function unitCount(n: number, type: UnitType, era: number): string {
  const u = ERAS[era]?.units[type];
  const one = u?.name ?? UNITS[type].name;
  return `${n} ${n === 1 ? one : (u?.plural ?? one + 's')}`;
}

export function unitDesc(type: UnitType, era: number): string {
  return ERAS[era]?.units[type]?.desc ?? UNITS[type].desc;
}
