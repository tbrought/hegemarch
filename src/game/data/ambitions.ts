import type { Faction } from '../types';
import type { Game } from '../Game';

export interface AmbitionDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  check: (g: Game, f: Faction, won: boolean) => boolean;
}

export const AMBITIONS: AmbitionDef[] = [
  { id: 'ironWill', name: 'Iron Will', desc: 'Win without your Ark ever being destroyed.', reward: 40, check: (_g, f, won) => won && !f.stats.arkLost },
  { id: 'expansionist', name: 'Bright Realm', desc: 'Hold 10 worlds at once.', reward: 35, check: (_g, f) => f.stats.maxWorlds >= 10 },
  { id: 'corsairsBane', name: 'Corsair’s Bane', desc: 'Destroy the Corsair Stronghold.', reward: 35, check: (_g, f) => f.stats.strongholdDestroyed },
  { id: 'swift', name: 'Swift Ascent', desc: 'Win before 40:00.', reward: 45, check: (g, _f, won) => won && g.time < 2400 },
  { id: 'collector', name: 'Collector', desc: 'Hold 2 relics at once.', reward: 35, check: (_g, f) => f.stats.maxRelics >= 2 },
  { id: 'scholar', name: 'Scholar-Heir', desc: 'Earn 9 Boons from Lore.', reward: 35, check: (_g, f) => f.boons >= 9 },
  { id: 'warmonger', name: 'Warmonger', desc: 'Destroy 120 enemy ships.', reward: 40, check: (_g, f) => f.stats.kills >= 120 },
  { id: 'explorer', name: 'Seeker of Mysteries', desc: 'Resolve 5 anomalies.', reward: 30, check: (_g, f) => f.stats.eventsResolved >= 5 },
];

export const AMBITION_BY_ID = Object.fromEntries(AMBITIONS.map((a) => [a.id, a])) as Record<string, AmbitionDef>;
