import { addU, flag } from '../mods';
import type { Faction, Mods, Rarity } from '../types';
import type { Game } from '../Game';

/** Boons. (Files and ids still say "card"; players only ever see "Boon".) */
export type CardCat = 'war' | 'wealth' | 'growth' | 'lore' | 'ward' | 'blueprint' | 'pact';

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  cat: CardCat;
  desc: string;
  max: number;
  /** Another boon that must be owned first (e.g. a blueprint). */
  requires?: string;
  pact?: boolean;
  /** Pacts that are in the pool without the Forbidden Archives unlock. */
  basePact?: boolean;
  /** Granted only by events, never offered in drafts. */
  hidden?: boolean;
  /**
   * Offered only on the cradle world of an Ages run (and nowhere else). These Boons speak of "units" and
   * "lands and worlds", because the house keeps them when it leaves for the stars.
   */
  cradle?: boolean;
  /** What the Boon affects, as picture ids (ui/subjects.ts), when its modifiers and text would show it wrong. */
  icons?: string[];
  mods?: (m: Mods) => void;
  onPick?: (g: Game, f: Faction) => void;
}

export const CARDS: CardDef[] = [
  // ---------------- Common ----------------
  { id: 'hotBarrels', name: 'Hot Barrels', rarity: 'common', cat: 'war', max: 3, desc: 'Your ships fire [10% faster].', mods: (m) => (m.rof += 0.1) },
  { id: 'hardHulls', name: 'Hardened Hulls', rarity: 'common', cat: 'war', max: 3, desc: '[+12% hull] on all ships.', mods: (m) => (m.hull += 0.12) },
  {
    id: 'deflectors', name: 'Deflector Tuning', rarity: 'common', cat: 'war', max: 3, desc: '[+15% shields], and shields recharge [30% faster].',
    mods: (m) => {
      m.shield += 0.15;
      m.shieldRegen += 0.3;
    },
  },
  {
    id: 'afterburners', name: 'Afterburners', rarity: 'common', cat: 'war', max: 2, desc: 'Ships move [15% faster] and ride starlanes [10% faster].',
    mods: (m) => {
      m.speed += 0.15;
      m.laneSpeed += 0.1;
    },
  },
  {
    id: 'strikerWings', name: 'Striker Wings', rarity: 'common', cat: 'war', max: 2, desc: 'Strikers deal [20% more damage] and cost [15% less].',
    mods: (m) => {
      addU(m, 'striker', 'dmg', 0.2);
      addU(m, 'striker', 'cost', -0.15);
    },
  },
  {
    id: 'guardianDoctrine', name: 'Guardian Doctrine', rarity: 'common', cat: 'war', max: 2, desc: 'Guardians gain [20% hull] and deal [15% more damage].',
    mods: (m) => {
      addU(m, 'guardian', 'hull', 0.2);
      addU(m, 'guardian', 'dmg', 0.15);
    },
  },
  {
    id: 'heavyPayloads', name: 'Heavy Payloads', rarity: 'common', cat: 'war', max: 2, desc: 'Breakers deal [30% more damage] and gain [15% hull].',
    mods: (m) => {
      addU(m, 'breaker', 'dmg', 0.3);
      addU(m, 'breaker', 'hull', 0.15);
    },
  },
  { id: 'emberTithe', name: 'Ember Tithe', rarity: 'common', cat: 'wealth', max: 3, desc: '[+15% Embers] from every world.', icons: ['embers'], mods: (m) => (m.embers += 0.15) },
  { id: 'deepShafts', name: 'Deep Shafts', rarity: 'common', cat: 'wealth', max: 2, desc: 'Mines dig deeper: their bonus Embers grow by [40%].', mods: (m) => (m.role.mine += 0.4) },
  { id: 'thriftyYards', name: 'Thrifty Yards', rarity: 'common', cat: 'wealth', max: 2, desc: 'Ships cost [10% less].', mods: (m) => (m.shipCost -= 0.1) },
  { id: 'salvage', name: 'Salvage Crews', rarity: 'common', cat: 'wealth', max: 2, desc: 'Gain Embers worth [25%] of every enemy ship you destroy.', mods: (m) => flag(m, 'salvage', 0.25) },
  {
    id: 'kindlingRites', name: 'Kindling Rites', rarity: 'common', cat: 'growth', max: 2, desc: 'Kindling costs [25% less] and takes [40% less time].',
    mods: (m) => {
      m.kindleCost -= 0.25;
      m.kindleSpeed += 0.4;
    },
  },
  { id: 'brightGlow', name: 'Bright Glow', rarity: 'common', cat: 'growth', max: 1, desc: 'New and captured worlds reach full glow [twice as fast].', mods: (m) => (m.glowRate += 1) },
  { id: 'wideHangars', name: 'Wide Hangars', rarity: 'common', cat: 'growth', max: 3, desc: '[+6 hangar space].', mods: (m) => (m.hangar += 6) },
  {
    id: 'masons', name: 'Masons’ Guild', rarity: 'common', cat: 'growth', max: 2, desc: 'World upgrades cost [25% less] and finish [40% faster].',
    mods: (m) => {
      m.upgradeCost -= 0.25;
      flag(m, 'upgradeSpeed', 0.4);
    },
  },
  { id: 'shipwrights', name: 'Shipwrights', rarity: 'common', cat: 'growth', max: 2, desc: 'Ships are built [20% faster].', mods: (m) => (m.build += 0.2) },
  { id: 'stargazers', name: 'Stargazers', rarity: 'common', cat: 'lore', max: 3, desc: '[+20% Lore].', mods: (m) => (m.lore += 0.2) },
  { id: 'bulwark', name: 'Bulwark', rarity: 'common', cat: 'ward', max: 3, desc: '[+25% hull and shields] on your worlds.', icons: ['world', 'shield'], mods: (m) => (m.worldHp += 0.25) },
  {
    id: 'batteries', name: 'Orbital Batteries', rarity: 'common', cat: 'ward', max: 2, desc: 'Every world gets [a small gun], and world guns deal [40% more damage].',
    mods: (m) => {
      m.worldGun += 0.4;
      flag(m, 'allGuns', 1);
    },
  },

  // ---------------- Rare ----------------
  { id: 'longSights', name: 'Long Sights', rarity: 'rare', cat: 'war', max: 2, desc: '[+12% weapon range].', mods: (m) => (m.range += 0.12) },
  { id: 'ablative', name: 'Ablative Armor', rarity: 'rare', cat: 'war', max: 2, desc: '[+8% armor]: hull damage is reduced further.', mods: (m) => (m.armor += 0.08) },
  {
    id: 'veterans', name: 'Veteran Crews', rarity: 'rare', cat: 'war', max: 1, desc: 'Your Ark and Dreadnoughts gain [60% more experience]. All ships deal [5% more damage].',
    mods: (m) => {
      m.xp += 0.6;
      m.dmg += 0.05;
    },
  },
  { id: 'fieldRepair', name: 'Field Repairs', rarity: 'rare', cat: 'war', max: 1, desc: 'Ships out of combat repair [2% hull per second], anywhere.', mods: (m) => flag(m, 'fieldRepair', 0.02) },
  {
    id: 'fighterBays', name: 'Fighter Bays', rarity: 'rare', cat: 'war', max: 2, requires: 'bpCarrier', desc: 'Carriers launch [2 more Fighters], and Fighters deal [20% more damage].',
    mods: (m) => {
      m.fighters += 2;
      addU(m, 'fighter', 'dmg', 0.2);
    },
  },
  {
    id: 'lanceCaps', name: 'Lance Capacitors', rarity: 'rare', cat: 'war', max: 2, requires: 'bpLancer', desc: 'Lancers deal [30% more damage] and reach [10% further].',
    mods: (m) => {
      addU(m, 'lancer', 'dmg', 0.3);
      addU(m, 'lancer', 'range', 0.1);
    },
  },
  { id: 'banking', name: 'Banking Clans', rarity: 'rare', cat: 'wealth', max: 1, desc: 'Every 30 seconds, earn [3% interest] on your banked Embers (up to 200).', mods: (m) => flag(m, 'interest', 0.03) },
  { id: 'greatLenses', name: 'Great Lenses', rarity: 'rare', cat: 'lore', max: 1, desc: 'Observatories make [50% more Lore].', mods: (m) => (m.role.observatory += 0.5) },
  {
    id: 'probability', name: 'Probability Engine', rarity: 'rare', cat: 'lore', max: 2, desc: 'Gain [3 rerolls] for future Boon choices.',
    onPick: (_g, f) => {
      f.rerolls += 3;
    },
  },
  { id: 'reverse', name: 'Reverse Engineering', rarity: 'rare', cat: 'lore', max: 1, desc: 'Gain [10 Lore] for every enemy ship you destroy.', mods: (m) => flag(m, 'reverse', 10) },
  {
    id: 'starCharts', name: 'Star Charts', rarity: 'rare', cat: 'lore', max: 1, desc: 'Chart [the whole sector] right now, and gain [60 Lore].',
    onPick: (g, f) => {
      g.exploreAll(f);
      g.addLore(f, 60);
    },
  },
  { id: 'militia', name: 'Militia Reserve', rarity: 'rare', cat: 'ward', max: 1, desc: 'When one of your worlds is attacked, [2 Strikers] muster to defend it (once every 90s per world).', mods: (m) => flag(m, 'militia', 1) },
  {
    id: 'fortressHearth', name: 'Fortress Hearth', rarity: 'rare', cat: 'ward', max: 1, desc: 'Your Hearth gains [100% hull] and its guns deal [double damage].',
    mods: (m) => {
      m.hearthHp += 1;
      m.hearthGun += 1;
    },
  },

  // ---------------- Blueprints ----------------
  { id: 'bpCarrier', name: 'Blueprint: Carrier', rarity: 'rare', cat: 'blueprint', max: 1, desc: 'Your Forges [can now build] Carriers: big ships that launch a wing of Fighters.' },
  { id: 'bpLancer', name: 'Blueprint: Lancer', rarity: 'rare', cat: 'blueprint', max: 1, desc: 'Your Forges [can now build] Lancers: long-range snipers that kill big ships.' },
  { id: 'bpStarbase', name: 'Blueprint: Starbase', rarity: 'rare', cat: 'blueprint', max: 1, desc: 'Any of your worlds [can now build] one Starbase: an orbital fortress that also repairs your ships.' },
  { id: 'bpDread', name: 'Blueprint: Dreadnought', rarity: 'epic', cat: 'blueprint', max: 1, desc: 'Your Forges [can now build] Dreadnoughts: capital ships that level up and learn abilities. Up to 2.' },

  // ---------------- Epic ----------------
  { id: 'nanites', name: 'Nanite Swarm', rarity: 'epic', cat: 'war', max: 1, desc: 'All ships repair [0.8% hull per second], even in battle.', mods: (m) => flag(m, 'nanite', 0.008) },
  { id: 'martyr', name: 'Martyr Cores', rarity: 'epic', cat: 'war', max: 1, desc: 'Destroyed ships explode, dealing [30% of their hull] to nearby enemies.', mods: (m) => flag(m, 'martyr', 0.3) },
  { id: 'reflect', name: 'Mirror Shields', rarity: 'epic', cat: 'war', max: 1, desc: 'Shields throw back [20% of the damage] they absorb.', mods: (m) => flag(m, 'reflect', 0.2) },
  { id: 'siphon', name: 'Siphon Hulls', rarity: 'epic', cat: 'war', max: 1, desc: 'Ships heal [8% of the damage] they deal.', mods: (m) => flag(m, 'siphon', 0.08) },
  { id: 'hivemind', name: 'Hivemind Link', rarity: 'epic', cat: 'war', max: 1, desc: 'Ships deal [4% more damage] for each friendly ship at the same world (up to 40%).', icons: ['fleet'], mods: (m) => flag(m, 'hivemind', 0.04) },
  { id: 'anchors', name: 'Gravity Anchors', rarity: 'epic', cat: 'ward', max: 1, desc: 'Enemy ships at your worlds move [30% slower] and take [4s longer] to spool.', mods: (m) => flag(m, 'anchors', 1) },
  { id: 'echo', name: 'Echo Fleet', rarity: 'epic', cat: 'war', max: 1, desc: 'Every 150 seconds, [two Guardians] arrive at your Hearth.', mods: (m) => flag(m, 'echo', 1) },
  { id: 'quantum', name: 'Quantum Archives', rarity: 'epic', cat: 'lore', max: 1, desc: 'Boon choices offer [one more option] (up to 5).', mods: (m) => (m.draft += 1) },
  {
    id: 'arkAscendant', name: 'Ark Ascendant', rarity: 'epic', cat: 'war', max: 1, desc: 'Your Ark gains [2 levels] at once and deals [25% more damage].',
    mods: (m) => addU(m, 'ark', 'dmg', 0.25),
    onPick: (g, f) => {
      const ark = g.units.get(f.ark);
      if (ark) g.grantLevels(ark, 2);
      else f.arkLevel = Math.min(8, f.arkLevel + 2);
    },
  },
  { id: 'laneStrike', name: 'Starlane Strike', rarity: 'epic', cat: 'war', max: 1, desc: 'Ships arriving off a starlane deal [50% more damage] for 12 seconds.', mods: (m) => flag(m, 'phaseStrike', 0.5) },
  { id: 'warEconomy', name: 'War Economy', rarity: 'epic', cat: 'wealth', max: 1, desc: 'Destroying enemy ships pays Embers worth [40%] of their cost.', mods: (m) => flag(m, 'bounty', 0.4) },
  {
    id: 'dreadDoctrine', name: 'Dreadnought Doctrine', rarity: 'epic', cat: 'war', max: 1, requires: 'bpDread', desc: 'Your Ark and Dreadnoughts gain [30% hull and damage]. Dreadnoughts cost [25% less].',
    mods: (m) => {
      for (const t of ['dreadnought', 'ark'] as const) {
        addU(m, t, 'hull', 0.3);
        addU(m, t, 'dmg', 0.3);
      }
      addU(m, 'dreadnought', 'cost', -0.25);
    },
  },

  // ---------------- Legendary ----------------
  {
    id: 'goldenAge', name: 'Golden Age', rarity: 'legendary', cat: 'wealth', max: 1, desc: '[+30% Embers and Lore].',
    mods: (m) => {
      m.embers += 0.3;
      m.lore += 0.3;
    },
  },
  {
    id: 'singularity', name: 'Singularity Core', rarity: 'legendary', cat: 'war', max: 1, desc: 'Ships deal [25% more damage] and fire [15% faster].',
    mods: (m) => {
      m.dmg += 0.25;
      m.rof += 0.15;
    },
  },
  { id: 'eternal', name: 'Eternal Fleet', rarity: 'legendary', cat: 'war', max: 1, desc: 'Destroyed warships have a [30% chance] to be reborn at your Hearth.', mods: (m) => flag(m, 'eternal', 0.3) },
  {
    id: 'worldforge', name: 'Worldforge', rarity: 'legendary', cat: 'growth', max: 1, desc: 'Every world you own [rises one level] (up to III), and worlds gain [25% hull].',
    mods: (m) => (m.worldHp += 0.25),
    onPick: (g, f) => {
      for (const n of g.worldsOf(f.id)) if (n.capitalOf < 0 && n.level < 3) g.setLevel(n, n.level + 1);
    },
  },
  { id: 'stormcaller', name: 'Storm Caller', rarity: 'legendary', cat: 'war', max: 1, desc: 'Every 15 seconds, lightning strikes [up to 3 enemy ships] in each of your battles (300 damage).', mods: (m) => flag(m, 'storm', 1) },

  // ---------------- Pacts (double-edged) ----------------
  {
    id: 'bloodPact', name: 'Blood Pact', rarity: 'rare', cat: 'pact', pact: true, basePact: true, max: 1, desc: 'Ships deal [35% more damage]. Ships [!lose 15% hull].',
    mods: (m) => {
      m.dmg += 0.35;
      m.hull -= 0.15;
    },
  },
  {
    id: 'gildedCage', name: 'Gilded Cage', rarity: 'rare', cat: 'pact', pact: true, basePact: true, max: 1, desc: '[+50% Embers]. Your hangar [!holds 25% fewer ships].', icons: ['embers', 'hangar'],
    mods: (m) => {
      m.embers += 0.5;
      m.hangarMul -= 0.25;
    },
  },
  {
    id: 'devilsBargain', name: 'Devil’s Bargain', rarity: 'rare', cat: 'pact', pact: true, basePact: true, max: 1,
    desc: 'Gain [1200 Embers] now. [!Earn 12% fewer Embers] for the rest of the run.',
    mods: (m) => (m.embers -= 0.12),
    onPick: (g, f) => g.addEmbers(f, 1200),
  },
  {
    id: 'forbiddenEngines', name: 'Forbidden Engines', rarity: 'rare', cat: 'pact', pact: true, max: 1, desc: 'Ride starlanes [60% faster]. Ships [!lose 4% hull with every jump].',
    mods: (m) => {
      m.laneSpeed += 0.6;
      flag(m, 'jumpDamage', 0.04);
    },
  },
  {
    id: 'martialLaw', name: 'Martial Law', rarity: 'rare', cat: 'pact', pact: true, max: 1, desc: 'Ships cost [25% less]. [!20% less Lore].',
    mods: (m) => {
      m.shipCost -= 0.25;
      m.lore -= 0.2;
    },
  },
  {
    id: 'glassCannon', name: 'Glass Cannon', rarity: 'epic', cat: 'pact', pact: true, max: 1, desc: '[+20% range] and [15% more damage]. Ships [!lose 35% shields].',
    mods: (m) => {
      m.range += 0.2;
      m.dmg += 0.15;
      m.shield -= 0.35;
    },
  },
  {
    id: 'voidWhispers', name: 'Void Whispers', rarity: 'epic', cat: 'pact', pact: true, max: 1, desc: '[+50% Lore]. The Corsairs are [!three times as likely] to raid you.',
    mods: (m) => {
      m.lore += 0.5;
      flag(m, 'bounty3', 1);
    },
  },
  {
    id: 'scorchedEarth', name: 'Scorched Earth', rarity: 'epic', cat: 'pact', pact: true, max: 1, desc: 'When you lose a world, every enemy ship there takes [1200 damage]. Your worlds [!lose 15% hull].',
    mods: (m) => {
      flag(m, 'scorched', 1200);
      m.worldHp -= 0.15;
    },
  },

  // ---------------- Event boons (never drafted) ----------------
  { id: 'forgeBlessing', name: 'Starfire Tempering', rarity: 'rare', cat: 'war', max: 3, hidden: true, desc: '[+8% hull] on all ships.', mods: (m) => (m.hull += 0.08) },
  { id: 'lensCalibration', name: 'Lens Calibration', rarity: 'rare', cat: 'growth', max: 3, hidden: true, desc: 'Ride starlanes [15% faster].', mods: (m) => (m.laneSpeed += 0.15) },

  // ---------------- Boons of the cradle (Ages runs: one with every new age) ----------------
  { id: 'firekeepers', name: 'Firekeepers', rarity: 'common', cat: 'wealth', max: 3, cradle: true, desc: '[+12% Embers].', icons: ['embers'], mods: (m) => (m.embers += 0.12) },
  { id: 'elders', name: 'Council of Elders', rarity: 'common', cat: 'lore', max: 3, cradle: true, desc: '[+15% Lore].', icons: ['lore'], mods: (m) => (m.lore += 0.15) },
  { id: 'huntingLodges', name: 'Hunting Lodges', rarity: 'common', cat: 'war', max: 2, cradle: true, desc: 'Your swift units deal [20% more damage].', icons: ['striker'], mods: (m) => addU(m, 'striker', 'dmg', 0.2) },
  { id: 'shieldWall', name: 'Shield Wall', rarity: 'common', cat: 'war', max: 2, cradle: true, desc: 'Your sturdy units gain [20% hull].', icons: ['guardian'], mods: (m) => addU(m, 'guardian', 'hull', 0.2) },
  { id: 'siegecraft', name: 'Siegecraft', rarity: 'common', cat: 'war', max: 2, cradle: true, desc: 'Your siege units deal [25% more damage].', icons: ['breaker'], mods: (m) => addU(m, 'breaker', 'dmg', 0.25) },
  { id: 'masterSmiths', name: 'Master Smiths', rarity: 'common', cat: 'war', max: 3, cradle: true, desc: 'Your units deal [8% more damage].', icons: ['fleet'], mods: (m) => (m.dmg += 0.08) },
  {
    id: 'roadBuilders', name: 'Road Builders', rarity: 'common', cat: 'growth', max: 2, cradle: true, desc: 'Units move [10% faster] and travel from place to place [20% faster].', icons: ['speed'],
    mods: (m) => {
      m.speed += 0.1;
      m.laneSpeed += 0.2;
    },
  },
  {
    id: 'wanderingKin', name: 'Wandering Kin', rarity: 'common', cat: 'growth', max: 2, cradle: true, desc: 'Kindling costs [25% less] and takes [40% less time].', icons: ['kindle'],
    mods: (m) => {
      m.kindleCost -= 0.25;
      m.kindleSpeed += 0.4;
    },
  },
  { id: 'granaries', name: 'Granaries', rarity: 'common', cat: 'growth', max: 2, cradle: true, desc: 'Room for [4 more] units.', icons: ['hangar'], mods: (m) => (m.hangar += 4) },
  { id: 'stonewrights', name: 'Stonewrights', rarity: 'common', cat: 'ward', max: 2, cradle: true, desc: 'Your lands and worlds are [25% tougher].', icons: ['world', 'shield'], mods: (m) => (m.worldHp += 0.25) },
  { id: 'drillYards', name: 'Drill Yards', rarity: 'rare', cat: 'war', max: 2, cradle: true, desc: 'Your units strike [10% faster].', icons: ['fleet'], mods: (m) => (m.rof += 0.1) },
  {
    id: 'bloodOath', name: 'Blood Oath', rarity: 'rare', cat: 'war', max: 1, cradle: true, desc: 'Your units deal [15% more damage]. They [!lose 8% hull].', icons: ['fleet'],
    mods: (m) => {
      m.dmg += 0.15;
      m.hull -= 0.08;
    },
  },
  {
    id: 'masterBuilders', name: 'Master Builders', rarity: 'rare', cat: 'growth', max: 2, cradle: true, desc: 'Raising a level costs [20% less], and Forges work [15% faster].', icons: ['forge'],
    mods: (m) => {
      m.upgradeCost -= 0.2;
      m.build += 0.15;
    },
  },
  { id: 'stoneCircles', name: 'Stone Circles', rarity: 'rare', cat: 'lore', max: 2, cradle: true, desc: 'Observatories make [30% more Lore].', icons: ['observatory'], mods: (m) => (m.role.observatory += 0.3) },
  { id: 'deepQuarries', name: 'Deep Quarries', rarity: 'rare', cat: 'wealth', max: 2, cradle: true, desc: 'Mines pay [30% more] of their bonus Embers.', icons: ['mine'], mods: (m) => (m.role.mine += 0.3) },
  {
    id: 'watchfires', name: 'Watchfires', rarity: 'rare', cat: 'ward', max: 1, cradle: true, desc: 'Every land and world you hold [fights back] with a small gun, and all their guns deal [20% more damage].', icons: ['world', 'target'],
    mods: (m) => {
      flag(m, 'allGuns', 1);
      m.worldGun += 0.2;
    },
  },
  {
    id: 'heralds', name: 'Heralds', rarity: 'rare', cat: 'lore', max: 1, cradle: true, desc: '[+2 rerolls], and your Boon choices are [luckier].', icons: ['boon'],
    mods: (m) => (m.luck += 1),
    onPick: (_g, f) => (f.rerolls += 2),
  },
  {
    id: 'oldLight', name: 'The Old Light', rarity: 'epic', cat: 'lore', max: 1, cradle: true, desc: '[+12% Embers and Lore].', icons: ['embers', 'lore'],
    mods: (m) => {
      m.embers += 0.12;
      m.lore += 0.12;
    },
  },
  {
    id: 'ironDiscipline', name: 'Iron Discipline', rarity: 'epic', cat: 'war', max: 1, cradle: true, desc: 'Your units gain [12% hull] and deal [10% more damage].', icons: ['fleet'],
    mods: (m) => {
      m.hull += 0.12;
      m.dmg += 0.1;
    },
  },
  {
    id: 'hearthguard', name: 'Hearthguard', rarity: 'epic', cat: 'ward', max: 1, cradle: true, desc: 'Your Hearth is [40% tougher] and its guns deal [40% more damage].', icons: ['hearth'],
    mods: (m) => {
      m.hearthHp += 0.4;
      m.hearthGun += 0.4;
    },
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<string, CardDef>;

export const BLUEPRINT_IDS = CARDS.filter((c) => c.cat === 'blueprint').map((c) => c.id);

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 62, rare: 27, epic: 9, legendary: 2.2 };
export const RARITY_LUCK: Record<Rarity, number> = { common: -4, rare: 3, epic: 1.6, legendary: 0.5 };
/** Ember-16 colors for each rarity. */
export const RARITY_COLOR: Record<Rarity, string> = { common: '#c8cbe6', rare: '#3fa7ff', epic: '#b05cff', legendary: '#ffd23f' };
export const PACT_COLOR = '#e0402f';

export const CAT_LABEL: Record<CardCat, string> = {
  war: 'War',
  wealth: 'Wealth',
  growth: 'Growth',
  lore: 'Lore',
  ward: 'Ward',
  blueprint: 'Blueprint',
  pact: 'Pact',
};
