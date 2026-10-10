import { UNITS } from './data/units';
import { baseMods } from './mods';
import type { DmgType, Mods, UnitMod, UnitType, WorldRole } from './types';

/**
 * Readable summaries of a house's modifiers: the totals panel on the Boons screen and the
 * "before → after" lines on Boon cards both come from here.
 */

type Fmt = 'pct' | 'num' | 'pps' | 'on';

interface StatDef {
  key: string;
  label: string;
  get: (m: Mods) => number;
  fmt?: Fmt;
  /** Lower is better (costs, spool time, drawbacks). */
  lower?: boolean;
}

export interface StatLine {
  key: string;
  label: string;
  value: number;
  /** Formatted value, e.g. "+25%". */
  text: string;
  /** True when the value helps the house. */
  good: boolean;
}

export interface StatDelta {
  key: string;
  label: string;
  from: string;
  to: string;
  /** True when the change helps the house. */
  good: boolean;
  /**
   * A whole new mechanic (an on/off flag, or a special effect the house did not have yet). The Boon's
   * own text already says what it does, so cards leave these out.
   */
  novel: boolean;
}

const flagOf = (name: string) => {
  const get = (m: Mods) => m.flags[name] ?? 0;
  FLAG_GETTERS.add(get);
  return get;
};
const FLAG_GETTERS = new Set<(m: Mods) => number>();

const STATS: StatDef[] = [
  { key: 'dmg', label: 'Damage', get: (m) => m.dmg },
  { key: 'rof', label: 'Fire rate', get: (m) => m.rof },
  { key: 'hull', label: 'Ship hull', get: (m) => m.hull },
  { key: 'shield', label: 'Shields', get: (m) => m.shield },
  { key: 'shieldRegen', label: 'Shield recharge', get: (m) => m.shieldRegen },
  { key: 'armor', label: 'Armor', get: (m) => m.armor },
  { key: 'range', label: 'Weapon range', get: (m) => m.range },
  { key: 'speed', label: 'Ship speed', get: (m) => m.speed },
  { key: 'laneSpeed', label: 'Starlane speed', get: (m) => m.laneSpeed },
  { key: 'jumpCharge', label: 'Spool time', get: (m) => m.jumpCharge, lower: true },
  { key: 'build', label: 'Build speed', get: (m) => m.build },
  { key: 'shipCost', label: 'Ship cost', get: (m) => m.shipCost, lower: true },
  { key: 'embers', label: 'Embers', get: (m) => m.embers },
  { key: 'lore', label: 'Lore', get: (m) => m.lore },
  { key: 'kindleCost', label: 'Kindle cost', get: (m) => m.kindleCost, lower: true },
  { key: 'kindleSpeed', label: 'Kindle speed', get: (m) => m.kindleSpeed },
  { key: 'glowRate', label: 'Glow speed', get: (m) => m.glowRate },
  { key: 'upgradeCost', label: 'Upgrade cost', get: (m) => m.upgradeCost, lower: true },
  { key: 'upgradeSpeed', label: 'Upgrade speed', get: flagOf('upgradeSpeed') },
  { key: 'worldHp', label: 'World hull', get: (m) => m.worldHp },
  { key: 'worldGun', label: 'World guns', get: (m) => m.worldGun },
  { key: 'allGuns', label: 'Guns on every world', get: flagOf('allGuns'), fmt: 'on' },
  { key: 'hearthHp', label: 'Hearth hull', get: (m) => m.hearthHp },
  { key: 'hearthGun', label: 'Hearth guns', get: (m) => m.hearthGun },
  { key: 'hangar', label: 'Hangar space', get: (m) => m.hangar, fmt: 'num' },
  { key: 'hangarMul', label: 'Hangar size', get: (m) => m.hangarMul },
  { key: 'xp', label: 'Experience', get: (m) => m.xp },
  { key: 'fighters', label: 'Fighters per Carrier', get: (m) => m.fighters, fmt: 'num' },
  { key: 'draft', label: 'Boon options', get: (m) => m.draft, fmt: 'num' },
  { key: 'salvage', label: 'Salvage from kills', get: flagOf('salvage') },
  { key: 'bounty', label: 'Kill bounty', get: flagOf('bounty') },
  { key: 'interest', label: 'Interest', get: flagOf('interest') },
  { key: 'reverse', label: 'Lore per kill', get: flagOf('reverse'), fmt: 'num' },
  { key: 'fieldRepair', label: 'Field repairs', get: flagOf('fieldRepair'), fmt: 'pps' },
  { key: 'nanite', label: 'Nanite repairs', get: flagOf('nanite'), fmt: 'pps' },
  { key: 'siphon', label: 'Siphon', get: flagOf('siphon') },
  { key: 'reflect', label: 'Shield reflect', get: flagOf('reflect') },
  { key: 'martyr', label: 'Death blast', get: flagOf('martyr') },
  { key: 'hivemind', label: 'Hivemind (per ship)', get: flagOf('hivemind') },
  { key: 'phaseStrike', label: 'Lane strike', get: flagOf('phaseStrike') },
  { key: 'eternal', label: 'Rebirth chance', get: flagOf('eternal') },
  { key: 'militia', label: 'Militia', get: flagOf('militia'), fmt: 'on' },
  { key: 'anchors', label: 'Gravity anchors', get: flagOf('anchors'), fmt: 'on' },
  { key: 'echo', label: 'Echo fleet', get: flagOf('echo'), fmt: 'on' },
  { key: 'storm', label: 'Storm caller', get: flagOf('storm'), fmt: 'on' },
  { key: 'scorched', label: 'Scorched earth', get: flagOf('scorched'), fmt: 'num' },
  { key: 'jumpDamage', label: 'Hull lost per jump', get: flagOf('jumpDamage'), lower: true },
  { key: 'bounty3', label: 'Corsairs target you', get: flagOf('bounty3'), fmt: 'on', lower: true },
];

const ROLE_LABEL: Record<WorldRole, string> = { mine: 'Mine output', forge: 'Forge output', observatory: 'Observatory Lore', bastion: 'Bastion guns' };

const UNIT_STAT: Record<keyof UnitMod, { label: string; lower?: boolean }> = {
  dmg: { label: 'damage' },
  hull: { label: 'hull' },
  cost: { label: 'cost', lower: true },
  range: { label: 'range' },
  build: { label: 'build speed' },
  speed: { label: 'speed' },
};

const DMG_LABEL: Record<DmgType, string> = { rapid: 'Rapid-fire', flak: 'Flak', siege: 'Siege', lance: 'Lance', fighter: 'Fighter', energy: 'Energy' };

/** Every stat a set of modifiers can touch (fixed stats, then roles, then per-ship stats). */
function defsFor(...ms: Mods[]): StatDef[] {
  const out = [...STATS];
  for (const r of Object.keys(ROLE_LABEL) as WorldRole[]) out.push({ key: 'role.' + r, label: ROLE_LABEL[r], get: (m) => m.role[r] });
  for (const t of Object.keys(DMG_LABEL) as DmgType[]) out.push({ key: 'dmgT.' + t, label: `${DMG_LABEL[t]} damage`, get: (m) => m.dmgT[t] ?? 0 });
  const units = new Set<UnitType>();
  for (const m of ms) for (const t of Object.keys(m.unit) as UnitType[]) units.add(t);
  for (const t of units) {
    for (const k of Object.keys(UNIT_STAT) as (keyof UnitMod)[]) {
      const s = UNIT_STAT[k];
      out.push({ key: `unit.${t}.${k}`, label: `${UNITS[t]?.name ?? t} ${s.label}`, get: (m) => m.unit[t]?.[k] ?? 0, lower: s.lower });
    }
  }
  return out;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function format(v: number, fmt: Fmt = 'pct'): string {
  switch (fmt) {
    case 'on':
      return v > 0 ? 'On' : 'Off';
    case 'num': {
      const n = Math.round(v * 10) / 10;
      return (n > 0 ? '+' : '') + n;
    }
    case 'pps': {
      const n = Math.round(v * 1000) / 10;
      return `${n}%/s`;
    }
    default: {
      const n = Math.round(v * 100);
      return (n > 0 ? '+' : '') + n + '%';
    }
  }
}

/** Non-zero stats of a set of modifiers, in a stable order. */
export function modLines(m: Mods): StatLine[] {
  const out: StatLine[] = [];
  for (const d of defsFor(m)) {
    const v = round(d.get(m));
    if (Math.abs(v) < 1e-6) continue;
    out.push({ key: d.key, label: d.label, value: v, text: format(v, d.fmt), good: d.lower ? v < 0 : v > 0 });
  }
  return out;
}

/**
 * How much each source adds to one stat, for the totals tooltips. Sources with the same label
 * (a Boon taken twice) are added together and shown as "Name ×2".
 */
export function statSources(sources: { label: string; apply: (m: Mods) => void }[], key: string): { label: string; text: string; good: boolean }[] {
  const byLabel = new Map<string, { m: Mods; n: number }>();
  for (const s of sources) {
    let e = byLabel.get(s.label);
    if (!e) {
      e = { m: baseMods(), n: 0 };
      byLabel.set(s.label, e);
    }
    s.apply(e.m);
    e.n++;
  }
  const out: { label: string; text: string; good: boolean }[] = [];
  for (const [label, e] of byLabel) {
    const line = modLines(e.m).find((l) => l.key === key);
    if (line) out.push({ label: e.n > 1 ? `${label} ×${e.n}` : label, text: line.text, good: line.good });
  }
  return out;
}

/** What changes between two sets of modifiers (for Boon previews). */
export function modDelta(before: Mods, after: Mods): StatDelta[] {
  const out: StatDelta[] = [];
  for (const d of defsFor(before, after)) {
    const a = round(d.get(before));
    const b = round(d.get(after));
    if (Math.abs(a - b) < 1e-6) continue;
    const zero = d.fmt === 'on' ? 'Off' : d.fmt === 'pps' ? '0%/s' : '0';
    out.push({
      key: d.key,
      label: d.label,
      from: Math.abs(a) < 1e-6 ? zero : format(a, d.fmt),
      to: Math.abs(b) < 1e-6 ? zero : format(b, d.fmt),
      good: d.lower ? b < a : b > a,
      novel: d.fmt === 'on' || (FLAG_GETTERS.has(d.get) && Math.abs(a) < 1e-6),
    });
  }
  return out;
}
