/**
 * First goals: what a new player might try next, once the guided First Night is over. Each names one
 * thing to do, says in a line why it is worth doing, and pays a small reward the first time a player
 * ever does it. They are an offer, not a script: nothing waits for them, and they can be reached in
 * any order.
 *
 * The game knows when a goal is reached and pays for it (`Game.cmdGoal`); which goals a player still
 * has is kept with the player (the profile), so each is shown until it has been reached once, ever.
 */
import type { Game } from '../Game';
import type { Faction } from '../types';

export interface GoalDef {
  id: string;
  /** What to do: "Hold 4 worlds". */
  label: string;
  /** How, and why it is worth it. */
  why: string;
  done: (g: Game, f: Faction) => boolean;
}

/** Embers paid for a goal. */
export const GOAL_REWARD = 40;

export const GOALS: GoalDef[] = [
  {
    id: 'role', label: 'Give a world a role',
    why: 'Click a world you hold and pick MINE, FORGE, OBSERVATORY or BASTION. A world doing the role it is good at gets +25%, and the first role you give a new world costs no time.',
    done: (g) => !!g.ui.roleSet,
  },
  {
    id: 'worlds', label: 'Hold 4 worlds',
    why: 'Kindle dark worlds: each one earns Embers and adds hangar room. Every world you hold makes the next cost a little more.',
    done: (g, f) => g.worldsOf(f.id).length >= 4,
  },
  {
    id: 'level', label: 'Raise a world to the next level',
    why: 'Click a world you hold, then RAISE. A level means +50% output, more hull and more hangar room: the cheapest way to a bigger fleet.',
    done: (g) => !!g.ui.raised,
  },
  {
    id: 'fleet', label: 'Build 6 ships',
    why: 'Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers. A mixed fleet has an answer to everything.',
    done: (_g, f) => f.stats.shipsBuilt >= 6,
  },
  {
    id: 'boons', label: 'Earn 3 Boons',
    why: 'Lore fills by itself, faster with Observatories. Each time it is full you choose a Boon that lasts the whole run.',
    done: (_g, f) => f.boons >= 3,
  },
  {
    id: 'fight', label: 'Destroy 10 enemy ships',
    why: 'Click your fleet badge, then the place where the enemy is. Ships fight by themselves. At home, a Bastion and your Ark fight beside them.',
    done: (_g, f) => f.stats.kills >= 10,
  },
  {
    id: 'capture', label: 'Capture a rival world',
    why: 'Bring Breakers: they crack worlds. A world is yours when its hull reaches zero. A rival that keeps running can be made to stand by going for its worlds.',
    done: (_g, f) => f.stats.worldsCaptured >= 1,
  },
];

export const GOAL_BY_ID: Record<string, GoalDef> = Object.fromEntries(GOALS.map((x) => [x.id, x]));
