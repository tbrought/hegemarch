import type { UnitType, WorldRole } from '../types';

/**
 * The ages of an Ages run. A house starts in the Stone Age on the cradle world and climbs, age by
 * age, to the Space Age; what it can build, and how strong it is, depend on its age.
 *
 * The three lines of fighting units keep their triangle in every age (swift beats siege, siege beats
 * sturdy, sturdy beats swift): only their names, their looks and their strength change. A unit keeps
 * the age it was raised in.
 */
export interface EraDef {
  id: string;
  /** "Stone Age" */
  name: string;
  /** "STONE" */
  short: string;
  /** Strength of this age's units, walls and guns (hull, shields and damage) next to the Space Age's. */
  power: number;
  /** How fast its units travel the paths between lands, next to starlane speed. */
  laneSpeed: number;
  /** To leave this age: Lore to gather, Embers to pay, and seconds the step takes at the Hearth. */
  lore: number;
  cost: number;
  time: number;
  /** The highest level a land can reach. */
  maxLevel: number;
  /** What a Forge can raise. */
  roster: UnitType[];
  roles: WorldRole[];
  /** What the units are called (types not listed keep their Space Age names). */
  units: Partial<Record<UnitType, { name: string; plural?: string; desc: string }>>;
  /** One line for the card that announces the age. */
  brings: string;
}

/** What each line is, in words that hold in every age. */
export const LINE_SHORT: Partial<Record<UnitType, string>> = {
  striker: 'Swift. Runs down siege units.',
  guardian: 'Sturdy. Stops swift units.',
  breaker: 'Siege. Breaks sturdy units and walls.',
};

export const ERAS: EraDef[] = [
  {
    id: 'stone', name: 'Stone Age', short: 'STONE', power: 0.3, laneSpeed: 0.55, lore: 200, cost: 200, time: 30, maxLevel: 1,
    roster: ['striker', 'guardian', 'scout'], roles: ['mine', 'forge', 'observatory'],
    units: {
      striker: { name: 'Hunter', desc: 'A fast hunter with throwing spears.' },
      guardian: { name: 'Warrior', desc: 'A stout fighter with club and hide shield.' },
      breaker: { name: 'Hurler', desc: 'Hurls rocks at walls.' },
      scout: { name: 'Runner', desc: 'A fast, frail runner. Select it and press EXPLORE, and it charts land after land by itself.' },
      seed: { name: 'Firebearer', desc: 'Carries embers from your fires to kindle a new land.' },
      militia: { name: 'Beast', desc: 'A beast of the wilds, guarding its ground.' },
    },
    brings: 'Hunters and Warriors. No one can break a wall yet.',
  },
  {
    id: 'bronze', name: 'Bronze Age', short: 'BRONZE', power: 0.4, laneSpeed: 0.65, lore: 400, cost: 350, time: 35, maxLevel: 2,
    roster: ['striker', 'guardian', 'breaker', 'scout'], roles: ['mine', 'forge', 'observatory', 'bastion'],
    units: {
      striker: { name: 'Chariot', desc: 'A light war chariot.' },
      guardian: { name: 'Spearman', plural: 'Spearmen', desc: 'A line of bronze spears and tall shields.' },
      breaker: { name: 'Ram', desc: 'A covered battering ram: the first thing that can break a wall.' },
      scout: { name: 'Runner', desc: 'A fast, frail runner. Select it and press EXPLORE, and it charts land after land by itself.' },
      seed: { name: 'Firebearer', desc: 'Carries embers from your fires to kindle a new land.' },
      militia: { name: 'Beast', desc: 'A beast of the wilds, guarding its ground.' },
    },
    brings: 'Rams, the first siege units: lands can now be taken. Bastions, and lands of level II.',
  },
  {
    id: 'iron', name: 'Iron Age', short: 'IRON', power: 0.52, laneSpeed: 0.75, lore: 600, cost: 500, time: 40, maxLevel: 3,
    roster: ['striker', 'guardian', 'breaker', 'scout'], roles: ['mine', 'forge', 'observatory', 'bastion'],
    units: {
      striker: { name: 'Horseman', plural: 'Horsemen', desc: 'Fast cavalry with lance and javelin.' },
      guardian: { name: 'Legionary', plural: 'Legionaries', desc: 'Heavy infantry in iron.' },
      breaker: { name: 'Catapult', desc: 'Throws stones over walls from afar.' },
      scout: { name: 'Rider', desc: 'A fast, frail rider. Select it and press EXPLORE, and it charts land after land by itself.' },
      seed: { name: 'Firebearer', desc: 'Carries embers from your fires to kindle a new land.' },
      militia: { name: 'Beast', desc: 'A beast of the wilds, guarding its ground.' },
    },
    brings: 'Horsemen, Legionaries and Catapults. Lands of level III.',
  },
  {
    id: 'powder', name: 'Powder Age', short: 'POWDER', power: 0.68, laneSpeed: 0.85, lore: 850, cost: 700, time: 45, maxLevel: 3,
    roster: ['striker', 'guardian', 'breaker', 'scout'], roles: ['mine', 'forge', 'observatory', 'bastion'],
    units: {
      striker: { name: 'Dragoon', desc: 'A mounted gunner, quick to strike and gone.' },
      guardian: { name: 'Musketeer', desc: 'A firing line of muskets and pikes.' },
      breaker: { name: 'Cannon', desc: 'A great gun that batters walls to rubble.' },
      scout: { name: 'Rider', desc: 'A fast, frail rider. Select it and press EXPLORE, and it charts land after land by itself.' },
      seed: { name: 'Firebearer', desc: 'Carries embers from your fires to kindle a new land.' },
      militia: { name: 'Beast', desc: 'A beast of the wilds, guarding its ground.' },
    },
    brings: 'Dragoons, Musketeers and Cannon.',
  },
  {
    id: 'machine', name: 'Machine Age', short: 'MACHINE', power: 0.85, laneSpeed: 1, lore: 1100, cost: 1000, time: 150, maxLevel: 3,
    roster: ['striker', 'guardian', 'breaker', 'scout'], roles: ['mine', 'forge', 'observatory', 'bastion'],
    units: {
      striker: { name: 'Armored Car', desc: 'Fast wheels and a quick gun.' },
      guardian: { name: 'Tank', desc: 'Thick armor on tracks.' },
      breaker: { name: 'Howitzer', desc: 'Heavy artillery that levels whatever it can reach.' },
      scout: { name: 'Biplane', desc: 'A fast, frail flyer. Select it and press EXPLORE, and it charts land after land by itself.' },
      seed: { name: 'Firebearer', desc: 'Carries embers from your fires to kindle a new land.' },
      militia: { name: 'Beast', desc: 'A beast of the wilds, guarding its ground.' },
    },
    brings: 'Armored Cars, Tanks and Howitzers. The next step is the Ark.',
  },
  {
    id: 'space', name: 'Space Age', short: 'SPACE', power: 1, laneSpeed: 1, lore: 0, cost: 0, time: 0, maxLevel: 3,
    roster: [], roles: ['mine', 'forge', 'observatory', 'bastion'], units: {},
    brings: 'The Ark, and the stars.',
  },
];

/** The Space Age: the age of every house in a classic run, and of the stars stage of an Ages run. */
export const SPACE = ERAS.length - 1;
/** The last age of the cradle: its step is the Ark, and the Ark leaves for the stars. */
export const LAST_CRADLE_ERA = SPACE - 1;
