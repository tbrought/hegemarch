/**
 * Discovery (data/boonKeys.ts): once a second, whether the player has just met the moment of a key they
 * have not found yet. A key that turns opens its Boons for the rest of the run (and, kept by the client,
 * for every run after); the player is told across the screen, and the next Boon choice to be dealt holds
 * one of them (`fresh:` in `Game.ui`, see boons.ts). A key that holds from the very start (a house that
 * begins with Guardians) opens quietly. Not on the cradle of an Ages run: its Boons are the ages' own.
 */
import { CARD_BY_ID } from '../data/cards';
import { BOON_KEYS } from '../data/boonKeys';
import type { Game } from '../Game';

/** Before this game time a key opens quietly: it held from the start. */
const QUIET_UNTIL = 2;

export function discoveryTick(g: Game) {
  const before = g.config.boonKeys;
  if (!before || g.config.autoplay || g.cradle) return;
  const f = g.player;
  if (!f?.alive) return;
  for (const k of BOON_KEYS) {
    if (before.includes(k.id) || g.ui['key:' + k.id] || !k.met(g, f)) continue;
    g.ui['key:' + k.id] = 1;
    if (g.time < QUIET_UNTIL) continue;
    g.ui['fresh:' + k.id] = 1;
    const names = k.cards.map((id) => CARD_BY_ID[id].name);
    const some = names.length > 2 ? `${names[0]}, ${names[1]} and ${names.length - 2} more` : names.join(' and ');
    const listed = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    g.notify(f.id, `New Boons discovered (${k.forWhat.charAt(0).toLowerCase() + k.forWhat.slice(1)}): ${listed}. The next Boon choice to be dealt holds one of them.`, 'good',
      undefined, false, { title: names.length > 1 ? 'NEW BOONS DISCOVERED' : 'A NEW BOON DISCOVERED', sub: `${k.forWhat}: ${some}.`, tone: 'gold' });
  }
}
