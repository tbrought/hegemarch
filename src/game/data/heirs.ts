import { addU } from '../mods';
import type { AIState, Mods } from '../types';

export interface HeirDef {
  id: string;
  name: string;
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
    id: 'nyx',
    name: 'Nyx Collective',
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
    hearth: 'Nyxara',
    start: { scouts: 1, strikers: 3, guardians: 0, breakers: 0, epicCard: false },
    cost: 120,
    personalities: ['opportunist', 'expansionist'],
  },
  {
    id: 'ironclad',
    name: 'Ironclad Dominion',
    title: 'The Unbroken House',
    color: PAL.sky,
    desc: 'Fortress-builders who turn every world into a citadel. Slow, stubborn and very hard to kill.',
    bonuses: ['[+40% world hull and shields]', 'Bastion guns deal [50% more damage]', '[+12% ship hull]', 'Ships move [!12% slower]', 'Ark: {EMP Burst}'],
    mods: (m) => {
      m.worldHp += 0.4;
      m.role.bastion += 0.5;
      m.hull += 0.12;
      m.speed -= 0.12;
    },
    arkName: 'Bastion',
    signature: 'emp',
    hearth: 'Ferrum',
    start: { scouts: 1, strikers: 0, guardians: 2, breakers: 1, epicCard: false },
    cost: 160,
    personalities: ['turtle'],
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

export const PIRATE_COLOR = PAL.mist;
export const GUARDIAN_COLOR = PAL.dusk;
export const CRISIS_COLOR = PAL.pink;
export const NEUTRAL_COLOR = PAL.slate;
