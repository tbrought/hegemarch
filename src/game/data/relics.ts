import { addU } from '../mods';
import type { Mods } from '../types';

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  mods: (m: Mods) => void;
}

export const RELICS: RelicDef[] = [
  { id: 'emberCrown', name: 'The Ember Crown', desc: '[+15% Embers].', mods: (m) => (m.embers += 0.15) },
  { id: 'aeonShard', name: 'Shard of Aeons', desc: '[+30% Lore].', mods: (m) => (m.lore += 0.3) },
  {
    id: 'voidCompass', name: 'Void Compass', desc: 'Ride starlanes [30% faster] and spool [30% sooner].',
    mods: (m) => {
      m.laneSpeed += 0.3;
      m.jumpCharge -= 0.3;
    },
  },
  {
    id: 'ashkara', name: 'Heart of Ashkara', desc: 'Your Ark gains [50% hull and damage].',
    mods: (m) => {
      addU(m, 'ark', 'hull', 0.5);
      addU(m, 'ark', 'dmg', 0.5);
    },
  },
  {
    id: 'lantern', name: 'Lantern of the First Fleet', desc: 'All ships gain [10% damage] and [10% hull].',
    mods: (m) => {
      m.dmg += 0.1;
      m.hull += 0.1;
    },
  },
  {
    id: 'tides', name: 'Mirror of Tides', desc: '[+30% shields], and shields recharge [50% faster].',
    mods: (m) => {
      m.shield += 0.3;
      m.shieldRegen += 0.5;
    },
  },
  {
    id: 'genesis', name: 'Seed of Genesis', desc: 'Worlds glow [twice as fast], and kindling costs [20% less].',
    mods: (m) => {
      m.glowRate += 1;
      m.kindleCost -= 0.2;
    },
  },
  { id: 'codex', name: 'Codex Infinitum', desc: 'Boon choices offer [one more option] (up to 5).', mods: (m) => (m.draft += 1) },
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<string, RelicDef>;
