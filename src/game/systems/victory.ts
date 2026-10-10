import type { Game } from '../Game';
import {
  DOMINATION_HOLD, DOMINATION_SHARE, GATE_CHARGE, RELIC_HOLD, relicsRequired, TREASURY_HOLD, treasuryTarget,
} from '../data/victories';
import type { Faction, VictoryId } from '../types';

/** Runs once per simulated second. */
export function victoryTick(g: Game) {
  if (g.outcome) return;
  if (g.cradle) return cradleTick(g);
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
        warnOnce(g, f, 'dom', `${f.name} holds ${Math.round(DOMINATION_SHARE * 100)}% of all worlds! In ${DOMINATION_HOLD}s they are crowned Hegemarch unless their hold is broken.`);
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
        if (f.gate.charge >= GATE_CHARGE / 2) warnOnce(g, f, 'gate50', `${f.name}'s Starfire Gate is half charged! When it is full, they will be crowned Hegemarch.`);
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
        warnOnce(g, f, 'gold70', `${f.name}'s hoard has reached ${Math.floor(f.embers).toLocaleString('en-US')} Embers. Take their worlds to seize it!`);
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

function warnOnce(g: Game, f: Faction, key: string, text: string) {
  if (f.warned[key]) return;
  f.warned[key] = g.time;
  g.notify(-1, text, f.isPlayer ? 'good' : 'alert', f.capital >= 0 ? f.capital : undefined);
}
