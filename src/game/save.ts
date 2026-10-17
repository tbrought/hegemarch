/**
 * Saving and loading. A saved game is the whole state as plain data (`SaveData`); what can be worked
 * out again (the table of ways, the lists of ships at each place, each house's modifiers) is left out
 * and rebuilt on loading. A loaded game goes on exactly as the saved one would have: the fuzzer and the
 * golden traces check that to the byte.
 */

import { SAVE_VERSION } from './constants';
import { CARD_BY_ID } from './data/cards';
import { SPACE } from './data/eras';
import { heirIdNow, HEIR_BY_ID } from './data/heirs';
import type { Game, HistorySample, Order } from './Game';
import type { SystemInfo } from './mapgen';
import { baseMods } from './mods';
import { RNG } from './rng';
import type { CrisisState, Faction, GameConfig, GNode, Lane, Note, Outcome, PirateState, Projectile, Prompt, Unit, VictoryId } from './types';

export interface SaveData {
  v: number;
  config: GameConfig;
  rng: number[];
  time: number;
  tick: number;
  nextId: number;
  nodes: GNode[];
  lanes: Lane[];
  systems: SystemInfo[];
  factions: Omit<Faction, 'mods'>[];
  units: Unit[];
  projectiles: Projectile[];
  victories: VictoryId[];
  ambition: string;
  traits: string[];
  playerId: number;
  pirateId: number;
  guardianId: number;
  crisisId: number;
  pirates: PirateState;
  crisis: CrisisState | null;
  prompts: Prompt[];
  notes: Note[];
  outcome: Outcome | null;
  nextGalactic: number;
  eventDeck: string[];
  offerDeck: string[];
  relicTotal: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  noteId: number;
  promptId: number;
  ui: Record<string, number>;
  ascended?: boolean;
  history?: HistorySample[];
  /** A Daily run's orders (`Game.orders`). */
  orders?: Order[];
}

export function serialize(g: Game): SaveData {
  return {
    v: SAVE_VERSION,
    config: g.config,
    rng: g.rng.state(),
    time: g.time,
    tick: g.tick,
    nextId: g.nextId,
    nodes: g.nodes,
    lanes: g.lanes,
    systems: g.systems,
    factions: g.factions.map(({ mods: _m, ...rest }) => rest),
    units: g.unitList.filter((u) => !u.dead),
    projectiles: g.projectiles,
    victories: g.victories,
    ambition: g.ambition,
    traits: g.traits,
    playerId: g.playerId,
    pirateId: g.pirateId,
    guardianId: g.guardianId,
    crisisId: g.crisisId,
    pirates: g.pirates,
    crisis: g.crisis,
    prompts: g.prompts,
    notes: g.notes.slice(-30),
    outcome: g.outcome,
    nextGalactic: g.nextGalactic,
    eventDeck: g.eventDeck,
    offerDeck: g.offerDeck,
    relicTotal: g.relicTotal,
    bounds: g.bounds,
    noteId: g.noteId,
    promptId: g.promptId,
    ui: g.ui,
    ascended: g.ascended || undefined,
    history: g.history,
    orders: g.orders,
  };
}

/**
 * Fill a fresh game from a save. Saves of earlier builds lack newer fields, which get their starting
 * values; a house or a Boon that has been renamed or dropped since is brought up to date.
 */
export function loadGame(g: Game, data: SaveData): void {
  if (data.v !== SAVE_VERSION) throw new Error('Incompatible save version');
  // (A house renamed or replaced since the run was saved goes by what it is now: data/heirs.ts.)
  g.config = { ...data.config, heir: heirIdNow(data.config.heir) };
  if (g.config.aiHeirs) g.config.aiHeirs = g.config.aiHeirs.map(heirIdNow);
  g.rng = new RNG(data.rng);
  g.time = data.time;
  g.tick = data.tick;
  g.nextId = data.nextId;
  g.nodes = data.nodes;
  g.lanes = data.lanes;
  g.systems = data.systems;
  g.factions = data.factions.map((f) => ({ ...f, mods: baseMods() }) as Faction);
  // Saves from earlier builds lack newer fields: give them their starting values.
  for (const f of g.factions) {
    if (heirIdNow(f.heir) !== f.heir) {
      f.heir = heirIdNow(f.heir);
      f.name = HEIR_BY_ID[f.heir].name;
    }
    f.bays ??= 0;
    f.era ??= SPACE;
    f.advance ??= null;
    f.launchedAt ??= -1;
    // (A Boon that no longer exists is dropped, so that a run saved by an earlier build still loads.)
    f.cards = f.cards.filter((id) => CARD_BY_ID[id]);
    f.asleepUntil ??= 0;
    f.graceUntil ??= 0;
    if (f.ai) {
      f.ai.grudge ??= -1;
      f.ai.grudgeAt ??= -999;
    }
  }
  g.unitList = data.units;
  for (const u of g.unitList) {
    // JSON turns NaN ("no target point") into null; restore it.
    if (u.ox === null) u.ox = NaN;
    if (u.oy === null) u.oy = NaN;
    u.era ??= SPACE;
    g.units.set(u.id, u);
  }
  g.projectiles = data.projectiles;
  g.victories = data.victories;
  g.ambition = data.ambition;
  g.traits = data.traits ?? [];
  g.playerId = data.playerId;
  g.pirateId = data.pirateId;
  g.guardianId = data.guardianId;
  g.crisisId = data.crisisId;
  g.pirates = data.pirates;
  g.crisis = data.crisis;
  g.prompts = data.prompts;
  g.notes = data.notes;
  g.outcome = data.outcome;
  g.nextGalactic = data.nextGalactic;
  g.eventDeck = data.eventDeck;
  g.offerDeck = data.offerDeck;
  g.relicTotal = data.relicTotal;
  g.bounds = data.bounds;
  g.noteId = data.noteId;
  g.promptId = data.promptId;
  g.ui = data.ui ?? {};
  g.ascended = data.ascended ?? false;
  g.history = data.history ?? [];
  g.orders = data.orders;
  g.countSleepers();
  g.derive();
  for (const f of g.factions) g.recomputeMods(f);
  // Hangar use is recounted every half second in play; keep the saved count so a loaded game
  // continues exactly like the one that was saved.
  data.factions.forEach((sf, i) => {
    g.factions[i].hangarUsed = sf.hangarUsed;
    g.factions[i].hangarCap = sf.hangarCap;
  });
  g.rebuildBuckets();
}
