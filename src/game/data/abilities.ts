export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  cd: number;
  range: number;
  color: string;
  /** Boss-only abilities are never offered to player or AI capital ships. */
  boss?: boolean;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'aegis', name: 'Aegis Field', desc: 'Nearby allies take [30% less damage] and recharge shields [twice as fast] for 8s.', cd: 28, range: 480, color: '#ffd23f' },
  { id: 'barrage', name: 'Missile Barrage', desc: 'Fires [12 homing missiles] at enemies in range (50 damage each).', cd: 16, range: 720, color: '#ff8a1f' },
  { id: 'nanite', name: 'Nanite Cloud', desc: 'Repairs nearby allies by [18% of their hull] over 6s.', cd: 24, range: 520, color: '#2fd5a6' },
  { id: 'strikewing', name: 'Strike Wing', desc: 'Launches [6 Fighters] for 25s.', cd: 32, range: 600, color: '#b05cff' },
  { id: 'emp', name: 'EMP Burst', desc: 'Drains [900 shields] from enemies in range and [stuns small craft] for 3s.', cd: 26, range: 420, color: '#3fa7ff' },
  { id: 'phaselance', name: 'Ember Lance', desc: 'Fires a [900-damage lance] at the biggest enemy in range.', cd: 18, range: 780, color: '#ff8a1f' },
  { id: 'overdrive', name: 'Overdrive', desc: 'Fires [70% faster] for 8s.', cd: 22, range: 600, color: '#ff6fb5' },
  { id: 'rally', name: 'Rally Cry', desc: 'Allies at this world deal [25% more damage] for 10s.', cd: 30, range: 9999, color: '#ffd23f' },
  { id: 'snare', name: 'Gravity Snare', desc: 'Enemies in range are [slowed by 40%] and [cannot jump] for 15s.', cd: 36, range: 600, color: '#b05cff' },
  { id: 'voidpulse', name: 'Void Pulse', desc: 'Every enemy in range takes [120 damage].', cd: 6, range: 650, color: '#ff6fb5', boss: true },
  { id: 'repairdrones', name: 'Repair Drones', desc: 'Restores [25% of its own hull] over 6s.', cd: 30, range: 0, color: '#2fd5a6' },
];

export const LEARNABLE_ABILITIES = ABILITIES.filter((a) => !a.boss);

export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a])) as Record<string, AbilityDef>;
