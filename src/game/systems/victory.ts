import type { Game } from '../Game';
import {
  DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget,
} from '../data/victories';
import type { Faction, VictoryId } from '../types';
import { possessive } from '../util';

/** Runs once per simulated second. */
export function victoryTick(g: Game) {
  if (g.outcome) return;
  if (g.cradle) return cradleTick(g);
  if (g.config.seats) return togetherTick(g);
  const emp = g.aliveEmpires();
  const has = (v: VictoryId) => g.victories.includes(v);

  if (has('conquest') && emp.length === 1) {
    g.declareWinner(emp[0].id, 'conquest', `${emp[0].name} put out every rival Hearth.`);
    return;
  }
  if (emp.length === 0) {
    g.declareWinner(-1, 'defeat', 'Every Hearth has gone dark.');
    return;
  }

  const relicNeed = relicsRequired(g.relicTotal);
  const hoardNeed = treasuryTarget(g.config.size);
  for (const f of emp) {
    if (has('domination')) {
      const owned = g.worldsOf(f.id).length;
      if (owned / g.worldCount >= DOMINATION_SHARE) {
        f.holdTimer += 1;
        warnOnce(g, f, 'dom', `${f.name} holds ${Math.round(DOMINATION_SHARE * 100)}% of all worlds! In ${DOMINATION_HOLD}s they are crowned ` +
            `Hegemarch unless their hold is broken.`);
        if (f.holdTimer >= DOMINATION_HOLD) return win(g, f, 'domination', `${f.name} rules the sector.`);
      } else {
        f.holdTimer = 0;
        delete f.warned.dom;
      }
    }
    if (has('ascension') && f.gate) {
      const gu = g.units.get(f.gate.unit);
      if (!gu || gu.dead) {
        f.gate = null;
      } else {
        f.gate.charge += 1;
        if (f.gate.charge >= GATE_CHARGE / 2) warnOnce(g, f, 'gate50', `${possessive(f.name)} Starfire Gate is half charged! When it is full, they will be ` +
            `crowned Hegemarch.`);
        if (f.gate.charge >= GATE_CHARGE) return win(g, f, 'ascension', `${f.name} passed through the Starfire Gate.`);
      }
    }
    if (has('relics')) {
      if (f.relics.length >= relicNeed) {
        f.relicTimer += 1;
        warnOnce(g, f, 'relic', `${f.name} holds ${f.relics.length} relics! In ${RELIC_HOLD}s they are crowned Hegemarch unless their Hearth falls.`);
        if (f.relicTimer >= RELIC_HOLD) return win(g, f, 'relics', `${f.name} united the ancient relics.`);
      } else {
        f.relicTimer = 0;
        delete f.warned.relic;
      }
    }
    if (has('treasury')) {
      if (!f.isPlayer && f.embers >= hoardNeed * 0.7) {
        warnOnce(g, f, 'gold70', `${possessive(f.name)} hoard has reached ${Math.floor(f.embers).toLocaleString('en-US')} Embers. Take their worlds to seize it!`);
      } else if (f.embers < hoardNeed * 0.5) delete f.warned.gold70;
      if (f.embers >= hoardNeed) {
        f.treasuryTimer += 1;
        warnOnce(g, f, 'gold', `${f.name} has hoarded ${hoardNeed.toLocaleString('en-US')} Embers! In ${TREASURY_HOLD}s they buy the crown of Hegemarch.`);
        if (f.treasuryTimer >= TREASURY_HOLD) return win(g, f, 'treasury', `${f.name} bought the sector outright.`);
      } else {
        f.treasuryTimer = 0;
        delete f.warned.gold;
      }
    }
  }
}

/**
 * The cradle of an Ages run. A house whose Ark has left is not beaten, only gone ahead, so the cradle is
 * won outright only by putting out every rival Hearth before any Ark rises. Otherwise the run goes on
 * among the stars.
 */
function cradleTick(g: Game) {
  const here = g.aliveEmpires();
  const gone = g.empires().some((f) => f.launchedAt >= 0);
  if (here.length === 0) g.declareWinner(-1, 'defeat', gone ? 'Every house has left the cradle.' : 'Every Hearth has gone dark.');
  else if (here.length === 1 && !gone) g.declareWinner(here[0].id, 'conquest', `${here[0].name} put out every rival Hearth before a single Ark could rise.`);
}

function win(g: Game, f: Faction, v: VictoryId, reason: string) {
  g.declareWinner(f.id, v, reason);
}

/**
 * A game played together (1.28): the Destinies are a team's. Its houses' worlds, relics and Embers count
 * together, a Starfire Gate or the Hollow's killing blow by any of them is the team's, and the conquest is
 * of every Hearth outside it. A team of one is a house alone, as in a game alone. The counters live on the
 * team's first house that stands (its `holdTimer`, `relicTimer`, `treasuryTimer` and warnings).
 */
function togetherTick(g: Game) {
  const emp = g.aliveEmpires();
  const has = (v: VictoryId) => g.victories.includes(v);
  const teams = new Map<number, Faction[]>();
  for (const f of emp) {
    const t = g.teamOf(f.id);
    if (!teams.has(t)) teams.set(t, []);
    teams.get(t)!.push(f);
  }
  const named = (fs: Faction[]) => (fs.length === 1 ? fs[0].name : `${fs.map((f) => g.shortName(f)).join(' and ')}`);
  if (has('conquest') && teams.size === 1 && emp.length) {
    const fs = [...teams.values()][0];
    g.declareWinner(fs[0].id, 'conquest', `${named(fs)} put out every rival Hearth.`);
    return;
  }
  if (emp.length === 0) {
    g.declareWinner(-1, 'defeat', 'Every Hearth has gone dark.');
    return;
  }
  const relicNeed = relicsRequired(g.relicTotal);
  const hoardNeed = treasuryTarget(g.config.size);
  for (const fs of teams.values()) {
    const lead = fs[0];
    // (A team's hoard must be bigger the more houses share it: half as much again for each beyond the first.)
    const need = Math.round(hoardNeed * (1 + 0.5 * (fs.length - 1)));
    if (has('domination')) {
      const owned = fs.reduce((s, f) => s + g.worldsOf(f.id).length, 0);
      if (owned / g.worldCount >= DOMINATION_SHARE) {
        lead.holdTimer += 1;
        warnOnce(g, lead, 'dom', `${named(fs)} ${fs.length > 1 ? 'hold' : 'holds'} ${Math.round(DOMINATION_SHARE * 100)}% of all worlds! In ${DOMINATION_HOLD}s they are crowned ` +
            `Hegemarch unless their hold is broken.`);
        if (lead.holdTimer >= DOMINATION_HOLD) return win(g, lead, 'domination', `${named(fs)} ${fs.length > 1 ? 'rule' : 'rules'} the sector.`);
      } else {
        lead.holdTimer = 0;
        delete lead.warned.dom;
      }
    }
    if (has('ascension')) {
      for (const f of fs) {
        if (!f.gate) continue;
        const gu = g.units.get(f.gate.unit);
        if (!gu || gu.dead) {
          f.gate = null;
          continue;
        }
        f.gate.charge += 1;
        if (f.gate.charge >= GATE_CHARGE / 2) warnOnce(g, f, 'gate50', `${possessive(f.name)} Starfire Gate is half charged! When it is full, they will be crowned Hegemarch.`);
        if (f.gate.charge >= GATE_CHARGE) return win(g, f, 'ascension', `${f.name} passed through the Starfire Gate.`);
      }
    }
    if (has('relics')) {
      const held = fs.reduce((s, f) => s + f.relics.length, 0);
      if (held >= relicNeed) {
        lead.relicTimer += 1;
        warnOnce(g, lead, 'relic', `${named(fs)} ${fs.length > 1 ? 'hold' : 'holds'} ${held} relics! In ${RELIC_HOLD}s they are crowned Hegemarch unless a Hearth of theirs falls.`);
        if (lead.relicTimer >= RELIC_HOLD) return win(g, lead, 'relics', `${named(fs)} united the ancient relics.`);
      } else {
        lead.relicTimer = 0;
        delete lead.warned.relic;
      }
    }
    if (has('treasury')) {
      const embers = fs.reduce((s, f) => s + f.embers, 0);
      if (!g.ours(lead.id) && embers >= need * 0.7) {
        warnOnce(g, lead, 'gold70', `${possessive(named(fs))} hoard has reached ${Math.floor(embers).toLocaleString('en-US')} Embers. Take their worlds to seize it!`);
      } else if (embers < need * 0.5) delete lead.warned.gold70;
      if (embers >= need) {
        lead.treasuryTimer += 1;
        warnOnce(g, lead, 'gold', `${named(fs)} ${fs.length > 1 ? 'have' : 'has'} hoarded ${need.toLocaleString('en-US')} Embers! In ${TREASURY_HOLD}s they buy the crown of Hegemarch.`);
        if (lead.treasuryTimer >= TREASURY_HOLD) return win(g, lead, 'treasury', `${named(fs)} bought the sector outright.`);
      } else {
        lead.treasuryTimer = 0;
        delete lead.warned.gold;
      }
    }
  }
  // Versus with a time limit: when it is up, the team furthest toward a Destiny is crowned.
  const limit = g.config.timeLimit;
  if (limit && g.time >= limit * 60) {
    let best: Faction[] | null = null;
    let bestP = -1;
    for (const fs of teams.values()) {
      const p = progressOf(g, fs, relicNeed, hoardNeed);
      if (p > bestP + 1e-9) {
        best = fs;
        bestP = p;
      }
    }
    if (best) g.declareWinner(best[0].id, 'conquest', `Time was called, and ${named(best)} stood furthest toward a Destiny.`);
  }
}

/** How far a team stands toward its nearest Destiny, from 0 to 1 (a time limit's tiebreak). */
export function progressOf(g: Game, fs: Faction[], relicNeed: number, hoardNeed: number): number {
  const has = (v: VictoryId) => g.victories.includes(v);
  const rivals = g.empires().filter((f) => !fs.some((x) => g.allied(x.id, f.id)));
  let p = rivals.length ? rivals.filter((f) => !f.alive).length / rivals.length : 1;
  if (has('domination')) p = Math.max(p, fs.reduce((s, f) => s + g.worldsOf(f.id).length, 0) / g.worldCount / DOMINATION_SHARE);
  if (has('relics')) p = Math.max(p, fs.reduce((s, f) => s + f.relics.length, 0) / Math.max(1, relicNeed));
  if (has('treasury')) p = Math.max(p, fs.reduce((s, f) => s + f.embers, 0) / (hoardNeed * (1 + 0.5 * (fs.length - 1))));
  if (has('ascension')) for (const f of fs) if (f.gate) p = Math.max(p, f.gate.charge / GATE_CHARGE);
  return Math.min(1, p);
}

/** The countdowns of a rival's Destiny, as heralded (its hoard nearing the mark is only told). */
const COUNTDOWN: Record<string, string> = { dom: 'DOMINATION LOOMS', gate50: 'THE GATE IS HALF CHARGED', relic: 'THE RELICS GATHER', gold: 'THE HOARD IS FULL' };

function warnOnce(g: Game, f: Faction, key: string, text: string) {
  if (f.warned[key]) return;
  f.warned[key] = g.time;
  // (Good news for the house on this screen and its allies; a herald of alarm for everyone else's.)
  const title = g.ours(f.id) ? undefined : COUNTDOWN[key];
  g.notify(-1, text, g.ours(f.id) ? 'good' : 'alert', f.capital >= 0 ? f.capital : undefined, false,
    title ? { title, sub: `${g.shortName(f)} will be crowned unless you stop them.`, tone: 'house', fid: f.id } : undefined);
}
