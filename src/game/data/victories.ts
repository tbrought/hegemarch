import type { MapSize, VictoryId } from '../types';

/** Destinies: the ways a run can be won. Every run offers Conquest plus two others. */
export interface VictoryDef {
  id: VictoryId;
  name: string;
  /** One short line for the HUD. */
  short: string;
  desc: string;
}

export const VICTORIES: Record<VictoryId, VictoryDef> = {
  conquest: { id: 'conquest', name: 'Conquest', short: 'Put out every rival Hearth.', desc: 'Capture the Hearth of every rival house. A house whose Hearth goes dark is out of the game.' },
  domination: { id: 'domination', name: 'Dominion', short: 'Hold 60% of all worlds.', desc: 'Hold 60% of all worlds in the sector for two and a half minutes.' },
  ascension: { id: 'ascension', name: 'Ascension', short: 'Earn 15 Boons, then raise the Starfire Gate.', desc: 'Earn 15 Boons from Lore, then build the Starfire Gate at your Hearth and protect it while it charges for 4 minutes.' },
  relics: { id: 'relics', name: 'Relic Hunt', short: 'Hold most of the relics.', desc: 'Hold most of the relics hidden in the sector for 3 minutes. Relics are dug out of guarded vaults, and taken from a house when its Hearth falls.' },
  treasury: { id: 'treasury', name: 'Ember Hoard', short: 'Bank a vast hoard of Embers.', desc: 'Keep a vast hoard of Embers for 90 seconds. Taking a rival’s worlds seizes part of its hoard.' },
  crisis: { id: 'crisis', name: 'Purge the Void', short: 'Destroy the Rift Heart.', desc: 'The Hollow will tear open the Maw. Destroy the Rift Heart inside it.' },
};

export const OPTIONAL_VICTORIES: VictoryId[] = ['domination', 'ascension', 'relics', 'treasury', 'crisis'];

export const DOMINATION_SHARE = 0.6;
export const DOMINATION_HOLD = 150;
export const TREASURY_HOLD = 90;
export const GATE_CHARGE = 240;
export const ASCENSION_BOONS = 15;
export const RELIC_HOLD = 180;

export function treasuryTarget(size: MapSize): number {
  return size === 'small' ? 16000 : size === 'medium' ? 24000 : 32000;
}

export function relicsRequired(total: number): number {
  return Math.min(total, Math.max(3, Math.round(total * 0.7)));
}
