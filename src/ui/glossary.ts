/**
 * The glossary: short explanations of game terms, shown beside Boon cards, event choices and
 * tooltips on the canvas, and on hover in the menus.
 */
import { ABILITIES } from '../game/data/abilities';
import { parseRich, plainText } from '../render/rich';

export interface GlossEntry {
  id: string;
  name: string;
  /** One to three short sentences (effect markup allowed). */
  text: string;
  /** Finds mentions in text (whole words, any case). */
  re: RegExp;
  /** Everyday words (Embers, Lore, hull…): only explained when nothing rarer is mentioned. */
  basic?: boolean;
}

const term = (id: string, name: string, pattern: string, text: string, basic = false): GlossEntry => ({
  id,
  name,
  text,
  re: new RegExp(`\\b(?:${pattern})\\b`, 'gi'),
  basic,
});

export const GLOSSARY: GlossEntry[] = [
  // Economy
  term('embers', 'Embers', 'embers?', 'Your only currency. Every world you hold earns Embers each second.', true),
  term('lore', 'Lore', 'lore', 'Fills by itself, faster with Observatories. Each time it fills, you choose a Boon.', true),
  term('boon', 'Boon', 'boons?', 'An upgrade that lasts for the whole run. You choose one each time your Lore fills.', true),
  term('reroll', 'Reroll', 'rerolls?', 'Swap the Boons on offer for a new set.'),
  term('blueprint', 'Blueprint', 'blueprints?', 'A Boon that lets your Forges build a new kind of ship.'),
  term('pact', 'Pact', 'pacts?', 'A double-edged Boon: a big gain that comes with a real cost.'),
  // Worlds
  term('kindle', 'Kindle', 'kindl(?:e|es|ed|ing)', 'Light a dark world and make it yours: a seed ship flies there and kindles it in 20 s, once no enemies are present. Each world you hold makes the next one cost more.'),
  term('seed', 'Seed Ship', 'seed ships?', 'Carries the spark that kindles a dark world. It launches from your nearest world.'),
  term('dark', 'Dark world', 'dark worlds?', 'A world that no house holds. Kindle it to make it yours. Some are guarded.'),
  term('glow', 'Glow', 'glow(?:s|ing)?', 'A new or captured world starts at 25% output and reaches full strength over 90 s.'),
  term('house', 'House', 'houses?', 'One of the powers of the sector. You lead one, and each rival leads another. Every house has its own strengths and its own Ark.', true),
  term('hearth', 'Hearth', 'hearths?', 'A house’s home world. It does every role at once. If yours falls, your house goes dark and the run is lost.'),
  term('walls', 'Hearth walls', 'walls', 'Every Hearth’s hull, shields and guns start at 45% and reach full strength at 12:00, so an early rush can work.'),
  term('role', 'Role', 'roles?', 'What a world does: Mine, Forge, Observatory or Bastion. A newly kindled world starts as a Mine, and the first role you give it costs no time. Changing it later takes 20 s.'),
  term('natural', 'Natural fit', 'natural fit|good as an?', 'Each kind of planet suits one role. A world doing its natural role gets [+25%] at it.'),
  term('retool', 'Retooling', 'retool(?:s|ing|ed)?', 'A world changing its role works at neither job for 20 s. The first role given to a newly kindled world costs no time.'),
  term('mine', 'Mine', 'mines?', 'A world role: the world makes [75% more Embers].'),
  term('forge', 'Forge', 'forges?', 'A world role: builds ships. Higher levels build faster.'),
  term('observatory', 'Observatory', 'observator(?:y|ies)', 'A world role: makes [Lore] and sees one starlane further.'),
  term('bastion', 'Bastion', 'bastions?', 'A world role: orbital guns, [+50% hull and shields], repairs for your ships there, and an anti-warp field.'),
  term('level', 'World level', 'world levels?|world upgrades?|levels? (?:I|II|III)|up to III|rises one level', 'Worlds rise from level I to III. Each level adds output, hull and hangar room.'),
  term('hangar', 'Hangar', 'hangars?', 'Room for your fleet. Every world adds room, more at higher levels. When it is full you cannot build ships.'),
  term('bay', 'Hangar Bay', 'hangar bays?', 'Built at your Hearth: [+5 hangar room] each. Every bay costs more than the last.'),
  term('rally', 'Rally point', 'rally(?: point)?', 'New ships built at a world fly straight to its rally point. Select your world, then right-click another to set it.'),
  term('fealty', 'Fealty', 'fealty|swear to you', 'When a house’s Hearth falls, its other worlds swear to the house that took it.'),
  term('underFire', 'Under fire', 'under fire', 'A world that was hit in the last few seconds earns half its Embers.'),
  // Ships and combat
  term('striker', 'Striker', 'strikers?', 'A fast, cheap gunship. Beats Breakers; Guardians shred it.'),
  term('guardian', 'Guardian', 'guardians?', 'A sturdy escort with flak. Beats Strikers and Fighters; Breakers outgun it.'),
  term('breaker', 'Breaker', 'breakers?', 'A siege ship. Cracks Guardians and is the best way to take a world; Strikers run it down.'),
  term('scout', 'Scout', 'scouts?', 'A fast explorer. Select it and press EXPLORE (E), and it charts the dark by itself. It sees the places next door, so it charts a guarded place from outside and keeps out of it. It never fights worlds.'),
  term('carrier', 'Carrier', 'carriers?', 'Launches a wing of Fighters; lost Fighters are rebuilt. Needs its Blueprint.'),
  term('fighter', 'Fighter', 'fighters?', 'Small craft launched by Carriers. Strong against big hulls, weak to flak.'),
  term('lancer', 'Lancer', 'lancers?', 'A long-range lance that kills big ships. Needs its Blueprint.'),
  term('dreadnought', 'Dreadnought', 'dreadnoughts?', 'A capital ship that levels up in battle and learns abilities. Up to 2. Needs its Blueprint.'),
  term('starbase', 'Starbase', 'starbases?', 'An orbital fortress, one per world. It guards the world, repairs your ships there and keeps an anti-warp field up. Needs its Blueprint.'),
  term('ark', 'Ark', 'ark', 'Your house’s great ship. It levels up in battle and learns a new ability at levels 3, 5 and 7.'),
  term('ability', 'Ability', 'abilit(?:y|ies)', 'A power your Ark or a Dreadnought uses by itself in battle.'),
  term('experience', 'Experience', 'experience', 'Your Ark and Dreadnoughts earn it by fighting. Enough of it raises their level.'),
  term('hull', 'Hull', 'hulls?', 'Health. A ship at zero hull is destroyed; a world at zero is captured.', true),
  term('shields', 'Shields', 'shields?', 'Take damage before the hull, and recharge when out of combat.', true),
  term('armor', 'Armor', 'armou?r', 'Cuts the damage that gets through to the hull.'),
  term('starlane', 'Starlane', 'starlanes?|jumps?', 'The routes between stars and worlds. Ships jump onto a starlane to travel.'),
  term('field', 'Anti-warp field', 'anti-warp fields?', 'Kept up by a Bastion, a Hearth and any world with a Starbase. Enemy ships there take [6 s longer] to jump away, so raiders must stand and fight.'),
  term('spool', 'Spool', 'spool(?:s|ing)?', 'Ships charge their drives for a few seconds before they jump onto a starlane. Under fire it takes twice as long.'),
  // The sector
  term('relic', 'Relic', 'relics?', 'An ancient treasure dug out of a guarded vault. Each relic gives its holder a bonus.'),
  term('omen', 'Omen', 'omens?', 'Two conditions that change the whole sector, for every house, this run only.'),
  term('anomaly', 'Anomaly', 'anomal(?:y|ies)', 'A strange site (a violet swirl). Send a ship there to look, then choose what to do. Ships passing through fly on.'),
  term('sentinel', 'Sentinels', 'sentinels?|guarded', 'Old defenders that guard some dark worlds and vaults. Defeat them first.'),
  term('corsairs', 'Corsairs', 'corsairs?', 'The Blackstar Corsairs raid every house. Destroy their Stronghold to end the raids.'),
  term('stronghold', 'Stronghold', 'stronghold', 'The Corsairs’ fortress. Destroying it ends their raids and wins a Boon.'),
  term('hollow', 'The Hollow', 'hollow', 'A ravenous swarm that pours out of the Maw and attacks every house.'),
  term('maw', 'The Maw', 'maw', 'The rift the Hollow come from. It opens partway through the run.'),
  term('riftHeart', 'Rift Heart', 'rift heart', 'The core of the Maw. A void barrier shields it for its first 4 minutes. Destroy it to purge the Hollow.'),
  // Winning
  term('hegemarch', 'Hegemarch', 'hegemarchs?', 'The sovereign of the sector. Fulfil any one of your Destinies to be crowned.'),
  term('destiny', 'Destiny', 'destin(?:y|ies)', 'A way to win. Every run offers Conquest and two others; fulfilling any one wins the run.'),
  term('conquest', 'Conquest', 'conquest', 'A Destiny: take the Hearth of every rival house.'),
  term('dominion', 'Dominion', 'dominion', 'A Destiny: hold 60% of all worlds for 150 s.'),
  term('ascension', 'Ascension', 'ascension', 'A Destiny: earn 15 Boons from Lore, then raise the Starfire Gate and protect it for 4 minutes.'),
  term('relicHunt', 'Relic Hunt', 'relic hunt', 'A Destiny: hold most of the sector’s relics for 3 minutes.'),
  term('hoard', 'Ember Hoard', 'ember hoard', 'A Destiny: bank a great hoard of Embers (16,000 to 32,000, by sector size) and keep it for 90 s.'),
  term('purge', 'Purge the Void', 'purge the void', 'A Destiny: destroy the Rift Heart inside the Maw. The house that lands the killing blow wins, whoever did the rest.'),
  term('gate', 'Starfire Gate', 'starfire gate', 'Raised at your Hearth once you have earned 15 Boons. If it survives 4 minutes of charging, you win.'),
  term('lastStand', 'Last Stand', 'last stand', 'The first time a Hearth drops below 30% hull, Strikers and Guardians rise to defend it.'),
  // Between runs
  term('legacy', 'Legacy', 'legacy', 'Earned by every run, won or lost. Spend it in the Hall of Heirs on houses, perks and unlocks.'),
  term('ambition', 'Ambition', 'ambitions?', 'An extra goal for this run. Complete it for bonus Legacy.'),
  // Ark and Dreadnought abilities
  ...ABILITIES.map((a) => term('ab-' + a.id, a.name, a.name.replace(/ /g, '\\s+'), a.desc)),
];

export const GLOSS_BY_ID = Object.fromEntries(GLOSSARY.map((e) => [e.id, e])) as Record<string, GlossEntry>;

/** Glossary entries by id (unknown ids are skipped). */
export const gloss = (...ids: string[]): GlossEntry[] => ids.map((id) => GLOSS_BY_ID[id]).filter(Boolean);

interface Hit {
  entry: GlossEntry;
  start: number;
  end: number;
}

/** Every mention of a glossary term, without the ones inside a longer term ("Relic" in "Relic Hunt"). */
function mentions(plain: string): Hit[] {
  const hits: Hit[] = [];
  for (const entry of GLOSSARY) {
    for (const m of plain.matchAll(entry.re)) hits.push({ entry, start: m.index, end: m.index + m[0].length });
  }
  return hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
}

/**
 * The terms a text mentions, rarer ones first, in order of appearance. Everyday terms only show up
 * when nothing rarer is mentioned. `exclude` drops a term that a text is about (a tooltip titled
 * "Mine" needs no box explaining Mine).
 */
export function termsIn(text: string, o: { max?: number; exclude?: string; basic?: boolean } = {}): GlossEntry[] {
  const max = o.max ?? 3;
  const seen = new Set<string>();
  const found: GlossEntry[] = [];
  for (const h of mentions(plainText(text)).sort((a, b) => a.start - b.start)) {
    if (seen.has(h.entry.id)) continue;
    seen.add(h.entry.id);
    if (o.exclude && new RegExp(`^(?:${h.entry.re.source})$`, 'i').test(o.exclude.trim())) continue;
    found.push(h.entry);
  }
  const rare = found.filter((e) => !e.basic);
  return (rare.length && !o.basic ? rare : found).slice(0, max);
}

/**
 * Terms worth explaining in a tooltip's own words: rarer terms only (everyday words like Embers
 * would show up everywhere), in order of appearance. Terms in the title, or the subject a tip
 * opens with ("Hangar: room for your ships…"), explain themselves and are left out.
 */
export function autoTerms(text: string, o: { title?: string; skip?: Set<string>; max?: number } = {}): GlossEntry[] {
  const plain = plainText(text);
  const skip = new Set(o.skip ?? []);
  if (o.title) for (const h of mentions(plainText(o.title))) skip.add(h.entry.id);
  const subject = /^([^:.!?]{1,28}):/.exec(plain);
  if (subject) for (const h of mentions(subject[1])) skip.add(h.entry.id);
  const out: GlossEntry[] = [];
  for (const h of mentions(plain).sort((a, b) => a.start - b.start)) {
    if (h.entry.basic || skip.has(h.entry.id) || out.includes(h.entry)) continue;
    out.push(h.entry);
    if (out.length >= (o.max ?? 2)) break;
  }
  return out;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Wrap glossary terms in a plain string as hoverable spans. */
function glossSpans(s: string): string {
  const hits = mentions(s).sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const h of hits) {
    if (h.start < at) continue;
    out += esc(s.slice(at, h.start)) + `<span class="gl" data-gl="${h.entry.id}">${esc(s.slice(h.start, h.end))}</span>`;
    at = h.end;
  }
  return out + esc(s.slice(at));
}

/** Effect text as HTML for the menus: colors like the game, and every glossary term hoverable. */
export function glossHtml(s: string): string {
  return parseRich(s)
    .map((r) => (r.style === 'body' ? glossSpans(r.text) : `<span class="rt-${r.style}">${glossSpans(r.text)}</span>`))
    .join('');
}
