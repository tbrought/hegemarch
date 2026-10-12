/**
 * What the checks of the commands share. A check (`checkShip`, `checkUpgrade`...) returns the reason a
 * command cannot be carried out, in the words the player reads, or null when it can.
 */
import type { Faction } from '../types';

/**
 * The reasons the game tells apart from the rest. The player's UI shows a price in red for want of
 * Embers and leaves the button alive; a full hangar or queue is something to wait for, not a mistake;
 * the Ark's button is not offered while the Ark flies; asking for the role a world has says nothing.
 * Rival houses wait when Embers are all that is missing, and give up on anything else. Every other
 * reason is only words. (These used to be compared as the sentences themselves, in nine places: a
 * reason reworded would have changed what a button does.)
 */
export const WHY = {
  embers: 'Not enough Embers',
  hangar: 'Hangar full',
  queue: 'Queue full',
  arkFlies: 'Your Ark still flies',
  sameRole: 'Already its role',
} as const;

/** Is the house short of what something costs? (Embers come in fractions: a price is met within a hair of it.) */
export function cannotPay(f: Faction, cost: number): boolean {
  return f.embers < cost - 1e-6;
}
