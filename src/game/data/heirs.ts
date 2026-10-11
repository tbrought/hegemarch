import { addU } from '../mods';
import type { AIState, Mods } from '../types';

export interface HeirDef {
  id: string;
  name: string;
  /** What the house is called where there is no room for its name (a button, a table, one line of a panel). */
  short?: string;
  title: string;
  color: string;
  desc: string;
  bonuses: string[];
  mods: (m: Mods) => void;
  arkName: string;
  signature: string;
  hearth: string;
  start: { scouts: number; strikers: number; guardians: number; breakers: number; epicCard: boolean };
  cost: number;
  personalities: AIState['personality'][];
}

/**
 * Zeal (the Choir of the First Flame): what each ship lost adds to the damage of the rest of its house
 * at that world, how many losses count at once, and for how long after the last of them.
 */
export const ZEAL_STEP = 0.05;
export const ZEAL_MAX = 5;
export const ZEAL_TIME = 10;

/** Ember-16 palette. */
export const PAL = {
  void: '#0b0a1a',
  night: '#1b1838',
  indigo: '#2f2a5c',
  slate: '#4b4f8a',
  dusk: '#7f86c4',
  mist: '#c8cbe6',
  bone: '#fff4e0',
  gold: '#ffd23f',
  ember: '#ff8a1f',
  red: '#e0402f',
  wine: '#8c1d40',
  sea: '#1f8a70',
  teal: '#2fd5a6',
  sky: '#3fa7ff',
  violet: '#b05cff',
  pink: '#ff6fb5',
} as const;

export const HEIRS: HeirDef[] = [
  {
    id: 'concord',
    name: 'Solar Concord',
    title: 'Keepers of the Golden Hearth',
    color: PAL.gold,
    desc: 'Patient stewards who remember the old light. Steady, sturdy and rich.',
    bonuses: ['[+10% Embers]', '[+15% world hull and shields]', '[+10% ship shields]', 'Ark: {Aegis Field}'],
    mods: (m) => {
      m.embers += 0.1;
      m.worldHp += 0.15;
      m.shield += 0.1;
    },
    arkName: 'Sovereign',
    signature: 'aegis',
    hearth: 'Aurelia',
    start: { scouts: 1, strikers: 1, guardians: 2, breakers: 0, epicCard: false },
    cost: 0,
    personalities: ['opportunist', 'expansionist'],
  },
  {
    id: 'vael',
    name: 'Vael Imperium',
    title: 'The Blood-Sworn House',
    color: PAL.red,
    desc: 'A martial house that believes the dark is won in fire. Their warships hit harder and cost less.',
    bonuses: ['[+15% weapon damage]', 'Ships cost [10% less]', '[!15% less Lore]', 'Ark: {Missile Barrage}'],
    mods: (m) => {
      m.dmg += 0.15;
      m.shipCost -= 0.1;
      m.lore -= 0.15;
    },
    arkName: 'Tyrant',
    signature: 'barrage',
    hearth: 'Vaelor',
    start: { scouts: 1, strikers: 2, guardians: 1, breakers: 1, epicCard: false },
    cost: 0,
    personalities: ['warlord'],
  },
  {
    id: 'wayfarer',
    name: 'Wayfarer Clans',
    title: 'The Wandering House',
    color: PAL.teal,
    desc: 'Nomad fleets who never stopped moving. Fast on the starlanes and quick to kindle.',
    bonuses: ['Ride starlanes [30% faster]', 'Ships move [15% faster]', 'Kindling costs [35% less]', '[An extra Scout]', 'Ark: {Nanite Cloud}'],
    mods: (m) => {
      m.laneSpeed += 0.3;
      m.speed += 0.15;
      m.kindleCost -= 0.35;
    },
    arkName: 'Wanderer',
    signature: 'nanite',
    hearth: 'Driftholm',
    start: { scouts: 2, strikers: 1, guardians: 1, breakers: 0, epicCard: false },
    cost: 0,
    personalities: ['expansionist', 'opportunist'],
  },
  {
    id: 'lyceum',
    name: 'Lyceum Collective',
    title: 'The Hive-Minded House',
    color: PAL.violet,
    desc: 'Scholars joined in one mind. Quick to learn and quick to swarm, but their hulls are thin.',
    bonuses: ['[+25% Lore]', 'Strikers cost [25% less]', 'Carriers launch [2 more Fighters]', '[!10% less ship hull]', 'Ark: {Strike Wing}'],
    mods: (m) => {
      m.lore += 0.25;
      addU(m, 'striker', 'cost', -0.25);
      m.fighters += 2;
      m.hull -= 0.1;
    },
    arkName: 'Overmind',
    signature: 'strikewing',
    hearth: 'Lycea',
    start: { scouts: 1, strikers: 3, guardians: 0, breakers: 0, epicCard: false },
    cost: 120,
    personalities: ['opportunist', 'expansionist'],
  },
  {
    // The one house that does not name itself like a state. What it can convert it does not destroy:
    // its Ark turns ships (the ability `conversion`), a world it takes is not sacked (`flags.convert`),
    // and every ship it loses is a martyr to the rest (`flags.zeal`). It does not run (`jumpCharge`).
    id: 'choir',
    name: 'Choir of the First Flame',
    short: 'The Choir',
    title: 'The Faithful House',
    color: PAL.sky,
    desc: 'Zealots of a flame that never went out. They convert what others destroy, and they never run.',
    bonuses: ['Captured worlds [keep their level and Glow]', '{Zeal}: [+5% damage] at a world for each ship lost there (up to 25%)', '[!Drives take 25% longer to charge]', 'Ark: {Conversion}'],
    mods: (m) => {
      m.flags.convert = 1;
      m.flags.zeal = ZEAL_STEP;
      m.jumpCharge += 0.25;
    },
    arkName: 'Cantor',
    signature: 'conversion',
    hearth: 'Canticle',
    start: { scouts: 1, strikers: 1, guardians: 1, breakers: 1, epicCard: false },
    cost: 160,
    personalities: ['opportunist', 'warlord'],
  },
  {
    id: 'ashen',
    name: 'Ashen Remnant',
    title: 'The Last of the Old Light',
    color: PAL.ember,
    desc: 'Survivors who walked out of the fire that ended the old age. They gamble everything on fate.',
    bonuses: ['Boon choices offer [one more option]', '[+2 rerolls]', 'Start with [a random Epic Boon]', '[!15% fewer Embers]', 'Ark: {Ember Lance}'],
    mods: (m) => {
      m.draft += 1;
      m.embers -= 0.15;
    },
    arkName: 'Ember Throne',
    signature: 'phaselance',
    hearth: 'Cinder',
    start: { scouts: 1, strikers: 1, guardians: 1, breakers: 1, epicCard: true },
    cost: 250,
    personalities: ['warlord', 'opportunist'],
  },
];

export const HEIR_BY_ID = Object.fromEntries(HEIRS.map((h) => [h.id, h])) as Record<string, HeirDef>;

/**
 * Houses that were renamed or replaced, by the id they had: a profile or a run saved before the change
 * names them so. (The Nyx Collective became the Lyceum Collective; the Choir of the First Flame took
 * the place of the Ironclad Dominion, and with it the Legacy a player had paid for that house.)
 */
const FORMER: Record<string, string> = { nyx: 'lyceum', ironclad: 'choir' };

/** The id a house has now, for an id read from a save or a profile. */
export function heirIdNow(id: string): string {
  return FORMER[id] ?? id;
}

/** A house's name where room is short: "The Choir" for the Choir of the First Flame, the name itself for the others. */
export function houseShort(heir: string, name: string): string {
  return HEIR_BY_ID[heir]?.short ?? name;
}

export const PIRATE_COLOR = PAL.mist;
export const GUARDIAN_COLOR = PAL.dusk;
export const CRISIS_COLOR = PAL.pink;
export const NEUTRAL_COLOR = PAL.slate;
