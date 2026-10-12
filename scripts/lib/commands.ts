/**
 * Random commands for a house: what the fuzzer (`scripts/fuzz.ts`) and the golden traces
 * (`scripts/golden.ts`) play a game with. Mostly sensible, sometimes nonsense, through the same
 * `g.cmd*` commands the player's UI and the rival houses use.
 */
import type { Game } from '../../src/game/Game';
import { ABILITIES } from '../../src/game/data/abilities';
import { CARDS } from '../../src/game/data/cards';
import { UNITS } from '../../src/game/data/units';
import { ROLE_ORDER } from '../../src/game/data/worlds';
import type { RNG } from '../../src/game/rng';
import type { UnitType } from '../../src/game/types';

const SHIP_TYPES = Object.keys(UNITS) as UnitType[];

/** One random command: mostly sensible, sometimes nonsense. */
export function randomCommand(g: Game, r: RNG, log: string[]) {
  const fid = r.chance(0.9) ? g.playerId : r.int(0, g.factions.length - 1);
  const f = g.factions[fid];
  const own = g.worldsOf(fid);
  const anyNode = () => (r.chance(0.08) ? r.pick([-1, g.nodes.length, 99999]) : r.int(0, g.nodes.length - 1));
  const ownNode = () => (own.length && r.chance(0.85) ? r.pick(own).id : anyNode());
  const units = g.unitList.filter((u) => !u.dead && u.owner === fid);
  const someUnits = () => {
    if (!units.length || r.chance(0.05)) return [r.int(-5, g.nextId + 5)];
    const n = r.int(1, Math.min(12, units.length));
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(r.pick(units).id);
    return out;
  };
  const k = r.int(0, g.cradle ? 23 : 20);
  let what = '';
  switch (k) {
    case 21:
    case 22:
      // Ages: take the step to the next age (given what it takes, some of the time, so that the whole climb is reached).
      what = 'advance';
      if (r.chance(0.6)) {
        f.lore += 400;
        f.embers += 400;
      }
      g.cmdAdvance(fid);
      break;
    case 23:
      what = 'cancel advance';
      if (r.chance(0.3)) g.cmdCancelAdvance(fid);
      break;
    case 0:
    case 1: {
      const n = anyNode();
      what = `kindle ${n}`;
      g.cmdKindle(fid, n);
      break;
    }
    case 2:
    case 3: {
      const n = ownNode();
      const t = r.chance(0.9) ? r.pick(['striker', 'guardian', 'breaker', 'scout', 'carrier', 'lancer', 'dreadnought'] as UnitType[]) : r.pick(SHIP_TYPES);
      what = `queue ${t} at ${n}`;
      g.cmdQueueShip(fid, n, t);
      break;
    }
    case 4: {
      const n = ownNode();
      what = `upgrade ${n}`;
      g.cmdUpgrade(fid, n);
      break;
    }
    case 5: {
      const n = ownNode();
      const role = r.pick(ROLE_ORDER);
      what = `role ${role} at ${n}`;
      g.cmdSetRole(fid, n, role);
      break;
    }
    case 6:
    case 7:
    case 8: {
      const ids = someUnits();
      const n = anyNode();
      what = `move ${ids.length} to ${n}`;
      if (r.chance(0.3) && n >= 0 && n < g.nodes.length) g.cmdMove(fid, ids, n, g.nodes[n].x + r.float(-300, 300), g.nodes[n].y + r.float(-300, 300));
      else g.cmdMove(fid, ids, n);
      break;
    }
    case 9: {
      const ids = someUnits();
      const target = r.chance(0.8) && g.unitList.length ? r.pick(g.unitList).id : r.int(-3, g.nextId + 3);
      what = `attack ${target}`;
      g.cmdAttack(fid, ids, target);
      break;
    }
    case 10:
      what = 'stop';
      g.cmdStop(fid, someUnits());
      break;
    case 11:
      what = 'retreat';
      g.cmdRetreat(fid, someUnits());
      break;
    case 12:
      what = 'explore';
      g.cmdExplore(fid, someUnits());
      break;
    case 13: {
      if (f.pendingDrafts > 0 || r.chance(0.2)) {
        const offer = g.ensureOffer(f);
        const id = offer && offer.length && r.chance(0.9) ? r.pick(offer) : r.pick(CARDS).id;
        what = `choose ${id}`;
        if (r.chance(0.15)) g.cmdReroll(fid);
        else if (r.chance(0.1)) g.cmdSkipDraft(fid);
        else g.cmdChooseCard(fid, id);
      }
      break;
    }
    case 14: {
      const p = g.prompts.find((x) => x.result === undefined);
      if (p) {
        const c = r.int(-1, 4);
        what = `resolve prompt ${p.id} with ${c}`;
        g.cmdResolvePrompt(p.id, c);
      }
      break;
    }
    case 15: {
      const u = units.find((x) => x.pendingAbil.length);
      if (u) {
        const id = r.chance(0.9) ? r.pick(u.pendingAbil[0]) : r.pick(ABILITIES).id;
        what = `ability ${id}`;
        g.cmdChooseAbility(fid, u.id, id);
      }
      break;
    }
    case 16:
      what = 'buy bay';
      g.cmdBuyBay(fid);
      break;
    case 17: {
      const n = ownNode();
      what = r.chance(0.5) ? `starbase ${n}` : `gate ${n}`;
      if (what.startsWith('starbase')) g.cmdQueueStarbase(fid, n);
      else g.cmdQueueGate(fid, n);
      break;
    }
    case 18:
      what = 'rebuild ark';
      g.cmdRebuildArk(fid);
      break;
    case 19: {
      const n = ownNode();
      what = `cancel at ${n}`;
      g.cmdCancel(fid, n, r.chance(0.5) ? 'ship' : 'build', r.int(-1, 4));
      break;
    }
    case 20: {
      const n = ownNode();
      const t = anyNode();
      what = `rally ${n} → ${t}`;
      g.cmdSetRally(fid, n, t);
      break;
    }
  }
  if (what) {
    log.push(what);
    if (log.length > 12) log.shift();
  }
}
