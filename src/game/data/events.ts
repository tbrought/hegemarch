import type { Faction, Unit } from '../types';
import type { Game } from '../Game';
import { UNITS } from './units';

export interface EventCtx {
  node: number;
  unit: number;
}

export interface EventChoice {
  label: string;
  hint: string;
  /** What the choice affects, as picture ids (ui/subjects.ts), when its hint would show it wrong. */
  icons?: string[];
  /** The hint as it stands for this house at this place, when it depends on them (which ship is taken). */
  hintFor?: (g: Game, f: Faction, ctx: EventCtx) => string | null;
  cond?: (g: Game, f: Faction, ctx: EventCtx) => boolean;
  /** Why the choice cannot be made, when `cond` says no for another reason than its price. */
  why?: (g: Game, f: Faction, ctx: EventCtx) => string | null;
  run: (g: Game, f: Faction, ctx: EventCtx) => string;
  /** AI never picks options with this flag unless nothing else is available. */
  passive?: boolean;
}

export interface EventDef {
  id: string;
  title: string;
  /** Its story. A phrase of it in {braces} is picked out in gold, on a slow ripple, as the story comes in. */
  text: string;
  kind: 'anomaly' | 'offer';
  choices: EventChoice[];
}

const leave = (text = 'You leave it undisturbed.'): EventChoice => ({ label: 'Move on', hint: 'Nothing happens.', passive: true, run: () => text });
const afford = (n: number) => (_g: Game, f: Faction) => f.embers >= n;
/** Has the house charted the whole sector? */
const charted = (g: Game, f: Faction) => g.nodes.every((_, i) => !!f.explored[i]);

/**
 * The ship an offering takes: the one that found the place, unless that is the Ark, which is never
 * offered; then the least costly of the house's other ships that are there. Null when there is none.
 * (The one that "found" a place is the first of a fleet to be counted there. When that was the Ark, the
 * offering could not be made at all, with six other ships standing by.)
 */
/** Was the place found by an Ark (which still flies)? */
const byArk = (g: Game, ctx: EventCtx) => {
  const u = g.units.get(ctx.unit);
  return !!u && !u.dead && u.type === 'ark';
};

export function offering(g: Game, f: Faction, ctx: EventCtx): Unit | null {
  const fit = (u: Unit | undefined): u is Unit => !!u && !u.dead && u.owner === f.id && u.type !== 'ark' && u.type !== 'fighter' && u.type !== 'starfall' && !UNITS[u.type].isStatic;
  const finder = g.units.get(ctx.unit);
  if (fit(finder)) return finder;
  let best: Unit | null = null;
  for (const u of g.unitList) {
    if (!fit(u) || u.node !== ctx.node || u.lane) continue;
    if (!best || UNITS[u.type].cost < UNITS[best.type].cost || (UNITS[u.type].cost === UNITS[best.type].cost && u.id < best.id)) best = u;
  }
  return best;
}

export const EVENTS: EventDef[] = [
  {
    id: 'derelict', kind: 'anomaly', title: 'Derelict Dreadnought',
    text: 'A gutted {capital ship} from before the dark drifts here in silence. Its reactor is {still faintly warm}.',
    choices: [
      { label: 'Strip it for parts', hint: '[+220 Embers].', run: (g, f) => (g.addEmbers(f, 220), 'Your crews haul away tons of armor plate.') },
      {
        label: 'Restore the reactor', hint: '[!Costs 150 Embers]. 65%: [a damaged Dreadnought joins you]. 35%: [!the reactor breaches].',
        cond: afford(150),
        run: (g, f, ctx) => {
          g.addEmbers(f, -150);
          if (g.rng.chance(0.65)) {
            const d = g.spawnUnit('dreadnought', f.id, ctx.node, { hpFrac: 0.5 });
            g.applyLevelFromXp(d);
            return 'The old reactor roars back to life. The Dreadnought flies your colors now.';
          }
          const u = g.units.get(ctx.unit);
          if (u) g.damageUnitRaw(u, 800, -1);
          g.addEmbers(f, 50);
          return 'The reactor breaches in a blinding flash! Your ship is scorched, but you recover some scrap.';
        },
      },
      leave(),
    ],
  },
  {
    id: 'archive', kind: 'anomaly', title: 'Ancient Archive',
    text: 'Crystal vaults hum beneath a frozen moon, still keeping {the knowledge of the old age}.',
    choices: [
      { label: 'Read the archive', hint: 'Gain [a free Boon].', run: (g, f) => (g.grantDraft(f, 1), 'Forgotten designs flood your records. A Boon awaits.') },
      { label: 'Sell the archive', hint: '[+300 Embers].', run: (g, f) => (g.addEmbers(f, 300), 'Data brokers pay well for the archive’s secrets.') },
    ],
  },
  {
    id: 'beacon', kind: 'anomaly', title: 'Distress Beacon',
    text: 'A looping distress call echoes from a battered transport. It could be survivors… {or bait}.',
    choices: [
      {
        label: 'Answer the call', hint: '60%: survivors join you ([+180 Embers, +40 Lore]). 40%: [!a Corsair ambush].',
        run: (g, f, ctx) => {
          if (g.rng.chance(0.6)) {
            g.addEmbers(f, 180);
            g.addLore(f, 40);
            return 'Grateful survivors join your house and share what little they carried.';
          }
          for (let i = 0; i < 3; i++) g.spawnUnit('raider', g.pirateId, ctx.node);
          return 'It was a trap! Corsair raiders burst from the wreckage.';
        },
      },
      leave('You leave the beacon to its endless song.'),
    ],
  },
  {
    id: 'rift', kind: 'anomaly', title: 'Whispering Rift',
    text: 'A wound in space {murmurs promises} in your crew’s dreams. It asks for an offering.',
    choices: [
      {
        label: 'Offer the ship', hint: '[!Lose the ship that found it]. Gain [a random Epic Boon].',
        // (The card names the ship: the player should know what the rift will take.)
        hintFor: (g, f, ctx) => {
          const u = offering(g, f, ctx);
          if (!u) return null;
          const name = UNITS[u.type].name;
          if (u.id === ctx.unit) return `[!Lose the ${name} that found it]. Gain [a random Epic Boon].`;
          return `[!Lose a ${name}] (${byArk(g, ctx) ? 'your Ark found it, and an Ark is never offered' : 'the ship that found it is gone'}). Gain [a random Epic Boon].`;
        },
        cond: (g, f, ctx) => !!offering(g, f, ctx),
        why: (g, _f, ctx) => `${byArk(g, ctx) ? 'Your Ark is never offered' : 'The ship that found it is gone'}, and no other ship of yours is here. Close this, send a ship here and choose then: the rift will wait behind the ! at the edge of the screen.`,
        run: (g, f, ctx) => {
          const u = offering(g, f, ctx);
          if (!u) return 'The rift falls silent.';
          const name = UNITS[u.type].name;
          g.killUnit(u, -1);
          const c = g.grantRandomCard(f, ['epic']);
          return c ? `The ${name} vanishes into the dark. In its place: ${c.name}.` : `The ${name} vanishes. The rift falls silent.`;
        },
      },
      { label: 'Seal the rift', hint: '[+120 Lore].', run: (g, f) => (g.addLore(f, 120), 'Your scholars study the rift as it closes.') },
    ],
  },
  {
    id: 'comet', kind: 'anomaly', title: 'Ember Comet',
    text: 'A rogue comet streaks past, its core {glowing with ember-ore} and its tail full of strange ice.',
    choices: [
      { label: 'Mine the core', hint: '[+250 Embers].', run: (g, f) => (g.addEmbers(f, 250), 'Mining drones crack the core open.') },
      { label: 'Study the tail', hint: '[+110 Lore].', run: (g, f) => (g.addLore(f, 110), 'The ice holds traces of the first stars.') },
    ],
  },
  {
    id: 'cache', kind: 'anomaly', title: 'Smuggler’s Cache',
    text: 'A hidden hoard of Corsair loot, sealed with {the Blackstar sigil}.',
    choices: [
      {
        label: 'Take everything', hint: '[+360 Embers]. 35%: [!the Corsairs come for you next].',
        run: (g, f) => {
          g.addEmbers(f, 360);
          if (g.rng.chance(0.35)) {
            g.markForRaid(f);
            return 'You seize the loot, but a hidden transmitter fires. The Corsairs know who took it.';
          }
          return 'You seize the loot without a trace.';
        },
      },
      {
        label: 'Report it to the guilds', hint: '[+1 reroll] and [+100 Embers].',
        run: (g, f) => {
          f.rerolls += 1;
          g.addEmbers(f, 100);
          return 'The merchant guilds reward your honesty with coin and favors.';
        },
      },
    ],
  },
  {
    id: 'sentinels', kind: 'anomaly', title: 'Dormant Sentinels',
    text: 'Ancient war machines orbit in silence, waiting for a command code that may still live {in your bloodline}.',
    choices: [
      {
        label: 'Try to wake them', hint: '50%: [3 Guardians join you]. 50%: [!2 hostile Sentinels wake up].',
        run: (g, f, ctx) => {
          if (g.rng.chance(0.5)) {
            for (let i = 0; i < 3; i++) g.spawnUnit('guardian', f.id, ctx.node);
            return 'The machines know your blood. Three warships pledge themselves to you.';
          }
          for (let i = 0; i < 2; i++) g.spawnUnit('sentinel', g.guardianId, ctx.node);
          return 'The sentinels wake hostile, guns blazing!';
        },
      },
      { label: 'Leave quietly', hint: '[+60 Lore].', run: (g, f) => (g.addLore(f, 60), 'You record what you can and withdraw.') },
    ],
  },
  {
    id: 'bloom', kind: 'anomaly', title: 'Psionic Bloom',
    text: 'A vast glowing creature drifts here. Its light seems to {hum with thought}.',
    choices: [
      { label: 'Study the bloom', hint: '[+150 Lore].', run: (g, f) => (g.addLore(f, 150), 'Your scholars return with pages of revelations.') },
      {
        label: 'Tend it', hint: 'Gain [a random Common Boon].',
        run: (g, f) => {
          const c = g.grantRandomCard(f, ['common']);
          return c ? `The bloom’s spores inspire ${c.name}.` : 'The bloom withers.';
        },
      },
    ],
  },
  {
    id: 'lostSeed', kind: 'anomaly', title: 'Lost Seed Ship',
    text: 'A seed ship from the age before the dark, its spark {still sleeping} in the hold.',
    choices: [
      { label: 'Claim the seed ship', hint: 'Gain [a free Seed Ship] here. Use it to kindle a dark world.', icons: ['seed'], run: (g, f, ctx) => (g.spawnUnit('seed', f.id, ctx.node), 'The old spark wakes to a new banner.') },
      { label: 'Scrap it', hint: '[+200 Embers].', run: (g, f) => (g.addEmbers(f, 200), 'You salvage the hull and its fuel.') },
    ],
  },
  {
    id: 'forge', kind: 'anomaly', title: 'Stellar Forge',
    text: 'An ancient shipyard built into the corona of a dying star. {Its fires could be lit again}.',
    choices: [
      {
        label: 'Light the forge', hint: '[!Costs 200 Embers]. All ships permanently gain [8% hull].',
        cond: afford(200),
        run: (g, f) => {
          g.addEmbers(f, -200);
          g.addCard(f, 'forgeBlessing');
          return 'Starfire tempers your fleet’s hulls. (+8% hull)';
        },
      },
      { label: 'Salvage the forge', hint: '[+200 Embers].', run: (g, f) => (g.addEmbers(f, 200), 'You strip the ancient forge for parts.') },
    ],
  },
  {
    id: 'lens', kind: 'anomaly', title: 'Gravitational Lens',
    text: 'Space itself bends here, focusing {the light of every star} in the sector.',
    choices: [
      { label: 'Map the sector', hint: 'Chart [the whole sector].', run: (g, f) => (g.exploreAll(f), 'Every star in the sector is laid bare to your cartographers.') },
      { label: 'Tune your drives', hint: 'Ride starlanes [15% faster] for the rest of the run.', run: (g, f) => (g.addCard(f, 'lensCalibration'), 'Your navigators tune the drives to the lens. (+15% starlane speed)') },
    ],
  },
  {
    id: 'mercs', kind: 'anomaly', title: 'Mercenary Outpost',
    text: 'A free company of void mercenaries {sells its guns} to any house with Embers.',
    choices: [
      {
        label: 'Hire the company', hint: '[!Costs 250 Embers]. Gain [3 Guardians and 2 Strikers].',
        cond: afford(250),
        run: (g, f, ctx) => {
          g.addEmbers(f, -250);
          for (let i = 0; i < 3; i++) g.spawnUnit('guardian', f.id, ctx.node);
          for (let i = 0; i < 2; i++) g.spawnUnit('striker', f.id, ctx.node);
          return 'The company signs on under your banner.';
        },
      },
      {
        label: 'Recruit their captain', hint: '[!Costs 150 Embers]. Your Ark gains [a level].',
        cond: (g, f) => f.embers >= 150 && g.units.has(f.ark),
        why: (g, f) => (g.units.has(f.ark) ? null : 'Your Ark is lost: there is no bridge for a captain to join. Rebuild it at your Hearth first.'),
        run: (g, f) => {
          g.addEmbers(f, -150);
          const ark = g.units.get(f.ark);
          if (ark) g.grantLevels(ark, 1);
          return 'A legendary captain joins the Ark’s bridge.';
        },
      },
      leave(),
    ],
  },
  {
    id: 'choir', kind: 'anomaly', title: 'The Whispering Choir',
    text: 'Thousands of voices sing from nowhere. Those who listen learn {things no one should know}.',
    choices: [
      {
        label: 'Listen', hint: 'Gain [a random Rare Boon], and [!a random Pact].',
        run: (g, f) => {
          const a = g.grantRandomCard(f, ['rare'], (c) => !c.pact && c.cat !== 'blueprint');
          const b = g.grantRandomCard(f, ['rare', 'epic'], (c) => !!c.pact, true);
          return `The choir teaches you ${a ? a.name : 'nothing'}${b ? `… and binds you to ${b.name}` : ''}.`;
        },
      },
      { label: 'Silence it', hint: '[+50 Lore].', run: (g, f) => (g.addLore(f, 50), 'The voices fall silent.') },
    ],
  },
  {
    id: 'graveyard', kind: 'anomaly', title: 'Graveyard of Fleets',
    text: 'Thousands of wrecks from {the war that brought the dark} hang here, cold and still.',
    choices: [
      { label: 'Scavenge', hint: '[+260 Embers].', run: (g, f) => (g.addEmbers(f, 260), 'Your salvage teams fill their holds.') },
      { label: 'Recover the black boxes', hint: '[+160 Lore].', run: (g, f) => (g.addLore(f, 160), 'The last logs of a hundred captains reveal forgotten tactics.') },
    ],
  },
  // --------------- Galactic offers (prompted at random intervals) ---------------
  {
    id: 'pilgrims', kind: 'offer', title: 'Pilgrim Convoy',
    text: 'A convoy of pilgrims {follows the light of your house} and asks for a place to rest.',
    choices: [
      {
        label: 'Welcome them', hint: '[!Costs 80 Embers]. All your worlds [glow at full strength] right away.',
        cond: afford(80),
        run: (g, f) => {
          g.addEmbers(f, -80);
          for (const n of g.worldsOf(f.id)) n.glow = 1;
          return 'The pilgrims spread out across your worlds and tend their fires.';
        },
      },
      { label: 'Send them on', hint: '[+60 Lore] (their star charts).', icons: ['lore'], run: (g, f) => (g.addLore(f, 60), 'You copy their star charts and send them on.') },
    ],
  },
  {
    id: 'merchant', kind: 'offer', title: 'Merchant Guild',
    text: 'A guild barge hails you, offering {rare goods} to a promising house.',
    choices: [
      {
        label: 'Buy a Rare Boon', hint: '[!Costs 240 Embers]. Gain [a random Rare Boon].',
        cond: afford(240),
        run: (g, f) => {
          g.addEmbers(f, -240);
          // (Never Star Charts: the guild sells its maps as the other choice. Until 1.23.6 the one could be the other.)
          const c = g.grantRandomCard(f, ['rare'], (cd) => !cd.pact && cd.id !== 'starCharts');
          return c ? `You acquire ${c.name}.` : 'The guild had nothing worth buying after all.';
        },
      },
      {
        label: 'Buy their star maps', hint: '[!Costs 100 Embers]. Chart [the whole sector].',
        cond: (g, f) => afford(100)(g, f) && !charted(g, f),
        why: (g, f) => (charted(g, f) ? 'Your house has charted the whole sector already.' : null),
        run: (g, f) => (g.addEmbers(f, -100), g.exploreAll(f), 'The guild’s maps reveal every star in the sector.'),
      },
      leave('The barge departs.'),
    ],
  },
  {
    id: 'mercenary', kind: 'offer', title: 'Mercenary Offer',
    text: 'A wing of Strikers {between contracts} offers its services.',
    choices: [
      {
        label: 'Hire them', hint: '[!Costs 160 Embers]. [4 Strikers] arrive at your Hearth.',
        cond: afford(160),
        run: (g, f) => {
          g.addEmbers(f, -160);
          for (let i = 0; i < 4; i++) g.spawnUnit('striker', f.id, f.capital);
          return 'The wing arrives over your Hearth.';
        },
      },
      leave('The mercenaries look for another patron.'),
    ],
  },
  {
    id: 'scholars', kind: 'offer', title: 'Wandering Scholars',
    text: 'A college of {exiled scholars} seeks a patron for its studies.',
    choices: [
      {
        label: 'Become their patron', hint: '[!Costs 100 Embers]. [+200 Lore].',
        cond: afford(100),
        run: (g, f) => {
          g.addEmbers(f, -100);
          g.addLore(f, 200);
          return 'The scholars’ work speeds your studies.';
        },
      },
      leave('The scholars move on.'),
    ],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;
export const ANOMALY_EVENTS = EVENTS.filter((e) => e.kind === 'anomaly').map((e) => e.id);
export const OFFER_EVENTS = EVENTS.filter((e) => e.kind === 'offer').map((e) => e.id);
