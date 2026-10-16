/**
 * What each difficulty gives the rival houses (and the Corsairs and the Hollow), said plainly and worked
 * out from the very numbers the game plays by (game/constants.ts): on the setup screen, and in a run on
 * the Status screen (THIS RUN). Until 1.23.6 Brutal said only "Merciless.", and a playtester found that
 * its rivals cheated: they had more than he did, and nothing said so.
 */
import {
  AI_ATTACK_RATIO, AI_FIRST_ATTACK, AI_HULL, AI_INCOME, AI_RUSH, AI_START_EMBERS, AI_START_GUARDIANS, AI_THINK, CRISIS_OFFSET, LEGACY_MUL, PIRATE_MUL,
} from '../game/constants';

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** Normal, the difficulty the others are told against. */
const N = 1;

/** What the rival houses have on this difficulty that they do not on Normal, a phrase a thing ("earn 40% more Embers"). */
export function rivalEdge(d: number): string[] {
  const out: string[] = [];
  const inc = AI_INCOME[d] - AI_INCOME[N];
  if (inc) out.push(`earn ${pct(inc)} ${inc > 0 ? 'more' : 'fewer'} Embers`);
  const start = [AI_START_EMBERS[d] ? `${AI_START_EMBERS[d]} Embers` : '', AI_START_GUARDIANS[d] ? (AI_START_GUARDIANS[d] === 1 ? 'a Guardian' : `${AI_START_GUARDIANS[d]} Guardians`) : ''].filter(Boolean);
  if (start.length) out.push(`start with ${start.join(' and ')} more`);
  if (AI_HULL[d]) out.push(`have ${pct(AI_HULL[d])} more hull on every ship`);
  if (d >= 2) out.push('can be dealt Legendary Boons');
  const think = AI_THINK[N] / AI_THINK[d];
  if (think !== 1) out.push(think === 2 ? 'make plans twice as often' : `make plans ${pct(think - 1)} ${think > 1 ? 'more' : 'less'} often`);
  // When they attack, and how strong they wait to be: one phrase.
  const rush = AI_RUSH[d] ? `, a warlord house from ${clock(AI_RUSH[d])}` : '';
  const when = AI_FIRST_ATTACK[d] !== AI_FIRST_ATTACK[N]
    ? `${AI_FIRST_ATTACK[d] < AI_FIRST_ATTACK[N] ? 'sooner' : 'later'} (from ${clock(AI_FIRST_ATTACK[d])}${rush}; on Normal from ${clock(AI_FIRST_ATTACK[N])})`
    : '';
  const ratio = AI_ATTACK_RATIO[d] - 1;
  const strong = AI_ATTACK_RATIO[d] !== AI_ATTACK_RATIO[N]
    ? ratio <= 0 ? 'as soon as they are as strong as you' : `only once they are ${pct(ratio)} stronger than you (on Normal ${pct(AI_ATTACK_RATIO[N] - 1)})`
    : '';
  if (when || strong) out.push(`attack ${[when, strong].filter(Boolean).join(' and ')}`);
  return out;
}

/** What else the difficulty changes: the Corsairs, the Maw, and the Legacy the run pays. */
export function worldEdge(d: number): string[] {
  const out: string[] = [];
  const raid = PIRATE_MUL[d] - PIRATE_MUL[N];
  if (raid) out.push(`Corsair raids are ${pct(raid)} ${raid > 0 ? 'bigger' : 'smaller'}`);
  const maw = CRISIS_OFFSET[d] - CRISIS_OFFSET[N];
  if (maw) out.push(`the Maw opens ${Math.abs(maw) / 60} minute${Math.abs(maw) === 60 ? '' : 's'} ${maw < 0 ? 'sooner' : 'later'}`);
  if (LEGACY_MUL[d] !== 1) out.push(`a run pays ×${LEGACY_MUL[d]} Legacy`);
  return out;
}

/** "a, b and c". */
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** All of it, in sentences: the setup screen's tip on a difficulty, and THIS RUN on the Status screen. */
export function difficultyText(d: number): string {
  const rivals = rivalEdge(d);
  const world = worldEdge(d);
  const head = rivals.length ? `Rival houses ${list(rivals)}.` : 'A fair fight: the rival houses get no bonus.';
  return world.length ? `${head} ${cap(list(world))}.` : head;
}

/** In a line, for under the difficulty buttons: the rivals' Embers, their start and their hull, and when they attack. */
export function difficultySummary(d: number): string {
  const parts: string[] = [];
  const inc = AI_INCOME[d] - AI_INCOME[N];
  if (inc) parts.push(`earn ${pct(inc)} ${inc > 0 ? 'more' : 'less'}`);
  if (AI_START_EMBERS[d] || AI_START_GUARDIANS[d]) parts.push('start richer');
  if (AI_HULL[d]) parts.push(`have ${pct(AI_HULL[d])} more hull`);
  if (AI_FIRST_ATTACK[d] !== AI_FIRST_ATTACK[N]) parts.push(`attack ${AI_FIRST_ATTACK[d] < AI_FIRST_ATTACK[N] ? 'sooner' : 'later'}`);
  const legacy = LEGACY_MUL[d] !== 1 ? ` Legacy ×${LEGACY_MUL[d]}.` : '';
  return parts.length ? `Rivals ${list(parts)}.${legacy}` : `A fair fight: rivals have no bonus.${legacy}`;
}
