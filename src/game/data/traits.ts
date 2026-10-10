import type { Mods, VictoryId } from '../types';
import type { Game } from '../Game';

/** Omens (sector traits): two random global conditions rolled for every run. */
export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  /** Modifiers applied to every house. */
  mods?: (m: Mods) => void;
  /** One-time effect when the sector is generated. */
  apply?: (g: Game) => void;
  requires?: (victories: VictoryId[]) => boolean;
}

export const TRAITS: TraitDef[] = [
  { id: 'golden', name: 'Golden Era', desc: 'Trade flourishes: every house earns [20% more Embers].', mods: (m) => (m.embers += 0.2) },
  {
    id: 'ion', name: 'Ion Storms', desc: 'Charged clouds sap deflectors: all ships have [!25% weaker shields] that recharge [!25% slower].',
    mods: (m) => {
      m.shield -= 0.25;
      m.shieldRegen -= 0.25;
    },
  },
  {
    id: 'fertile', name: 'Warm Dark', desc: 'The dark is thin here: kindling costs [25% less] and new worlds glow [twice as fast].',
    mods: (m) => {
      m.kindleCost -= 0.25;
      m.glowRate += 1;
    },
  },
  { id: 'turbulence', name: 'Lane Turbulence', desc: 'Unstable starlanes: everyone rides them [!25% slower].', mods: (m) => (m.laneSpeed -= 0.25) },
  { id: 'currents', name: 'Lane Currents', desc: 'Swift starlanes: everyone rides them [30% faster].', mods: (m) => (m.laneSpeed += 0.3) },
  { id: 'forges', name: 'Age of Forges', desc: 'Ships are built [25% faster].', mods: (m) => (m.build += 0.25) },
  { id: 'discovery', name: 'Age of Discovery', desc: 'Boons need [15% less Lore].' },
  { id: 'rich', name: 'Rich Veins', desc: 'Every Mine digs up [30% more].', mods: (m) => (m.role.mine += 0.3) },
  {
    id: 'haven', name: 'Corsair Haven', desc: 'The Blackstar Corsairs are bold: their raids are [!50% stronger] and begin [!a minute sooner].',
    apply: (g) => (g.pirates.nextRaid -= 60),
  },
  {
    id: 'eclipse', name: 'Eclipse of the Old Sun', desc: 'The Hollow stir early: the Maw opens [!three minutes sooner].',
    requires: (v) => v.includes('crisis'),
    apply: (g) => {
      if (g.crisis) g.crisis.awakenAt = Math.max(720, g.crisis.awakenAt - 180);
    },
  },
  { id: 'bastions', name: 'Bastion Worlds', desc: 'Ancient fortifications: every world has [40% more hull and shields].', mods: (m) => (m.worldHp += 0.4) },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t])) as Record<string, TraitDef>;
