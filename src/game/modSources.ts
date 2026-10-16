/**
 * Where a house's modifiers come from (its house, the run's omens, the Hall of Heirs or the difficulty,
 * its Boons and relics), and working them out again when one of those changes.
 */

import { PERK_EMBERS, PERK_HEARTH, PERK_HULL, PERK_LORE, PERK_WALLS } from '../meta/perks';
import { AI_HULL } from './constants';
import { CARD_BY_ID } from './data/cards';
import { HEIR_BY_ID } from './data/heirs';
import { RELIC_BY_ID } from './data/relics';
import { TRAIT_BY_ID } from './data/traits';
import { baseMods } from './mods';
import { recomputeHangar } from './worldStats';
import type { Faction, Mods } from './types';
import type { Game } from './Game';

export function recomputeMods(g: Game, f: Faction) {
  f.mods = g.computeMods(f);
  for (const u of g.unitList) if (u.owner === f.id && !u.dead) g.refreshUnitStats(u);
  for (const n of g.nodes) if (n.owner === f.id) g.refreshWorld(n);
  recomputeHangar(g, f);
}

/** The modifiers a house has, plus any `extraCards` (for previews). Changes nothing. */
export function computeMods(g: Game, f: Faction, extraCards: string[] = []): Mods {
  const m: Mods = baseMods();
  for (const s of g.modSources(f, extraCards)) s.apply(m);
  return m;
}

/** Where a house's modifiers come from: house, omens, Hall of Heirs or difficulty, Boons, relics. */
export function modSources(g: Game, f: Faction, extraCards: string[] = []): { label: string; apply: (m: Mods) => void }[] {
  const out: { label: string; apply: (m: Mods) => void }[] = [];
  if (f.kind === 'empire') {
    const heir = HEIR_BY_ID[f.heir];
    if (heir) out.push({ label: heir.name, apply: heir.mods });
    for (const t of g.traits) {
      const tr = TRAIT_BY_ID[t];
      if (tr?.mods) out.push({ label: `Omen: ${tr.name}`, apply: tr.mods });
    }
    if (f.id === g.playerId && !g.config.autoplay) {
      const perks = g.config.perks ?? {};
      out.push({
        label: 'Hall of Heirs',
        // (What the perks give for the whole run: starting Embers and Lore were spent in the first
        // minute, and a playtester did not find them worth the Legacy. See meta/legacy.ts.)
        apply: (m) => {
          m.embers += PERK_EMBERS * (perks.oldCoin ?? 0);
          m.lore += PERK_LORE * (perks.loreSeed ?? 0);
          m.hull += PERK_HULL * (perks.escort ?? 0);
          m.worldHp += PERK_WALLS * (perks.bastion ?? 0);
          m.hearthHp += (PERK_HEARTH - PERK_WALLS) * (perks.bastion ?? 0);
          m.luck += perks.luck ?? 0;
        },
      });
    } else if (AI_HULL[g.config.difficulty]) {
      out.push({ label: 'Difficulty', apply: (m) => (m.hull += AI_HULL[g.config.difficulty]) });
    }
  } else if (f.kind === 'pirate' || f.kind === 'crisis') {
    const d = g.config.difficulty - 1;
    out.push({
      label: 'Difficulty',
      apply: (m) => {
        m.hull += d * 0.12;
        m.dmg += d * 0.1;
      },
    });
  }
  for (const id of [...f.cards, ...extraCards]) {
    const c = CARD_BY_ID[id];
    if (c?.mods) out.push({ label: c.name, apply: c.mods });
  }
  for (const id of f.relics) {
    const r = RELIC_BY_ID[id];
    if (r) out.push({ label: r.name, apply: r.mods });
  }
  return out;
}
