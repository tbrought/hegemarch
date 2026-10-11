import type { Session } from '../app/Session';
import { ERAS, LAST_CRADLE_ERA } from '../game/data/eras';
import { UNITS } from '../game/data/units';
import type { Unit, UnitType, WorldRole } from '../game/types';
import { PAL } from '../render/palette';

/**
 * Player commands with feedback (sound, markers, a short reason when something can't be done).
 * Every order the player can give goes through here, and none is taken while the game stands still.
 */
export class Actions {
  constructor(private s: Session) {}

  private get g() {
    return this.s.game;
  }

  private get pid() {
    return this.s.game.playerId;
  }

  fail(reason: string) {
    this.s.sfx.play('error', 0.5);
    this.s.showToast(reason, PAL.red, 2.5);
  }

  /**
   * May an order be given right now? Not while the game stands still (see `Session.mode`). Every order
   * below asks first; a refusal says why, and makes whatever stops the game flash.
   */
  private ready(): boolean {
    const mode = this.s.mode;
    if (mode === 'play') return true;
    if (mode === 'look') {
      this.s.sfx.play('error', 0.4);
      this.s.showToast(this.s.tipHold ? 'The game waits while you read: OK or Space to go on.' : 'The game is paused: press Space, then give your orders.', PAL.ember, 2.5);
      this.s.refusedAt = performance.now() / 1000;
    }
    return false;
  }

  kindle(nodeId: number): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkKindle(this.pid, nodeId);
    if (why) {
      this.fail(why);
      return false;
    }
    const waiting = !!this.g.idleSeed(this.pid);
    this.g.cmdKindle(this.pid, nodeId);
    const n = this.g.nodes[nodeId];
    this.s.marker(n.x, n.y, PAL.gold);
    this.s.sfx.play('order', 0.6);
    this.s.showToast(waiting ? `Your waiting seed ship sets out for ${n.name}.` : `A seed ship sets out for ${n.name}.`, PAL.gold, 3);
    return true;
  }

  /**
   * Run an order on the selected ships, and say so if it called off a seed ship's kindling (that
   * only happens when the order went to seed ships alone).
   */
  private ordered(units: Unit[], run: () => void) {
    const missions = units.filter((u) => this.s.onMission(u)).map((u) => ({ u, target: u.orderTarget }));
    run();
    const off = missions.find((m) => !m.u.dead && !(m.u.order === 'kindle' && m.u.orderTarget === m.target));
    if (!off) return;
    const world = this.g.nodeAt(off.target);
    const again = off.u.order === 'kindle';
    if (!again) this.s.showToast(`Kindling${world ? ' of ' + world.name : ''} is called off. The seed ship waits for orders: its next KINDLE is free.`, PAL.gold, 5);
  }

  /** Ages: take the step to the next age (from the last age of the cradle: build the Ark). */
  advance(): boolean {
    if (!this.ready()) return false;
    const p = this.g.player;
    const why = this.g.checkAdvance(this.pid);
    if (why) {
      this.fail(why === 'Not enough Lore' ? `Not enough Lore yet: ${Math.floor(p.lore)} of ${ERAS[p.era]?.lore ?? 0}.` : why);
      return false;
    }
    const last = p.era >= LAST_CRADLE_ERA;
    const era = ERAS[p.era];
    this.g.cmdAdvance(this.pid);
    this.s.sfx.play('boon', 0.5);
    if (!last) this.s.showToast(`The ${ERAS[p.era + 1].name} is coming: ${era.time} seconds of work at your Hearth.`, PAL.gold, 4);
    return true;
  }

  /** Queue a ship (Shift: five, or as many as fit). */
  build(nodeId: number, type: UnitType): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkShip(this.pid, nodeId, type);
    if (why) {
      this.fail(why);
      return false;
    }
    const count = this.s.shiftHeld ? 5 : 1;
    for (let i = 0; i < count && !this.g.checkShip(this.pid, nodeId, type); i++) this.g.cmdQueueShip(this.pid, nodeId, type);
    this.s.sfx.play('build', 0.5);
    return true;
  }

  /**
   * The player's next world that builds (a Forge, or the Hearth), the idle ones first: selected and
   * looked at. Tab; Shift+Tab goes back. Pressed again and again with a build key between, it queues
   * ships all over the house without the mouse. (A look, not an order: it works while paused too.)
   */
  nextForge(dir = 1): boolean {
    const sites = this.forges();
    if (!sites.length) {
      this.fail('You have no Forge yet');
      return false;
    }
    const idle = sites.filter((n) => n.shipQ.length === 0);
    const pool = idle.length ? idle : sites;
    const at = pool.findIndex((n) => n.id === this.s.view.selectedNode);
    const next = pool[at < 0 ? (dir > 0 ? 0 : pool.length - 1) : (at + dir + pool.length) % pool.length];
    this.s.selectNode(next.id);
    this.s.focusNode(next.id);
    this.s.sfx.play('select', 0.4);
    return true;
  }

  /** The player's worlds that build ships: every Forge, and the Hearth. */
  forges() {
    const g = this.g;
    return g.nodes.filter((n) => n.owner === this.pid && g.isForge(n));
  }

  upgrade(nodeId: number): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkUpgrade(this.pid, nodeId);
    if (why) {
      this.fail(why);
      return false;
    }
    this.g.cmdUpgrade(this.pid, nodeId);
    this.s.sfx.play('build', 0.5);
    return true;
  }

  role(nodeId: number, role: WorldRole): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkRole(this.pid, nodeId, role);
    if (why) {
      if (why !== 'Already its role') this.fail(why);
      return false;
    }
    this.g.cmdSetRole(this.pid, nodeId, role);
    this.s.sfx.play('select', 0.5);
    return true;
  }

  starbase(nodeId: number): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkStarbase(this.pid, nodeId);
    if (why) {
      this.fail(why);
      return false;
    }
    this.g.cmdQueueStarbase(this.pid, nodeId);
    this.s.sfx.play('build', 0.5);
    return true;
  }

  gate(nodeId: number): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkGate(this.pid, nodeId);
    if (why) {
      this.fail(why);
      return false;
    }
    this.g.cmdQueueGate(this.pid, nodeId);
    this.s.sfx.play('good', 0.6);
    return true;
  }

  ark(): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkArk(this.pid);
    if (why) {
      this.fail(why);
      return false;
    }
    this.g.cmdRebuildArk(this.pid);
    this.s.sfx.play('build', 0.5);
    return true;
  }

  bay(): boolean {
    if (!this.ready()) return false;
    const why = this.g.checkBay(this.pid);
    if (why) {
      this.fail(why);
      return false;
    }
    this.g.cmdBuyBay(this.pid);
    this.s.sfx.play('build', 0.5);
    this.s.showToast('A new Hangar Bay opens at your Hearth: +5 room for ships.', PAL.teal, 3);
    return true;
  }

  cancel(nodeId: number, queue: 'ship' | 'build', index: number) {
    if (!this.ready()) return;
    if (this.g.cmdCancel(this.pid, nodeId, queue, index)) this.s.sfx.play('ui', 0.4);
  }

  stop() {
    if (!this.ready()) return;
    const units = this.s.commandable();
    if (!units.length) return;
    this.ordered(units, () => this.g.cmdStop(this.pid, units.map((u) => u.id)));
    this.s.sfx.play('select', 0.4);
  }

  retreat() {
    if (!this.ready()) return;
    const units = this.s.commandable();
    if (!units.length) return;
    this.ordered(units, () => this.g.cmdRetreat(this.pid, units.map((u) => u.id)));
    this.s.sfx.play('order', 0.5);
    this.s.showToast('Falling back to the nearest world you hold.', PAL.mist, 2.5);
  }

  /**
   * EXPLORE (the button, or E): the selected Scouts set out to chart the dark by themselves, and any
   * other selected ships stay put. With no Scout selected, E picks the idle Scouts first (and shows
   * them); pressing it again sends them.
   */
  explore(): boolean {
    if (!this.ready()) return false;
    const g = this.g;
    const view = this.s.view;
    if (!g.hasUncharted(g.player)) {
      this.fail('The whole sector is charted: there is nothing left to explore.');
      return false;
    }
    const picked = this.s.ownSelected().filter((u) => UNITS[u.type].role === 'scout');
    if (picked.length && picked.every((u) => u.order === 'explore')) {
      // Already on their way: a second order would only send them off on a new route.
      this.s.sfx.play('select', 0.4);
      this.s.showToast(picked.length > 1 ? 'These Scouts are already out exploring.' : 'This Scout is already out exploring.', PAL.sky, 3);
      return false;
    }
    if (picked.length) {
      g.cmdExplore(this.pid, picked.map((u) => u.id));
      g.ui.scouted = 1;
      // They are on their own now: a click on a world must not call them back.
      for (const u of picked) view.selected.delete(u.id);
      view.orderMode = false;
      this.s.sfx.play('order', 0.6);
      this.s.showToast(picked.length > 1 ? `${picked.length} Scouts set out to chart the dark.` : 'Your Scout sets out to chart the dark.', PAL.sky, 3);
      return true;
    }
    const scouts = g.unitList.filter((u) => !u.dead && u.owner === this.pid && UNITS[u.type].role === 'scout');
    if (!scouts.length) {
      this.fail('You have no Scout left. Any Forge can build one.');
      return false;
    }
    const idle = scouts.filter((u) => u.order !== 'explore');
    if (!idle.length) {
      this.s.sfx.play('select', 0.4);
      this.s.showToast(scouts.length > 1 ? 'Your Scouts are already out exploring.' : 'Your Scout is already out exploring.', PAL.sky, 3);
      return false;
    }
    // Pick them (those at the selected world first) and look at them: E again sends them.
    const here = idle.filter((u) => u.node >= 0 && u.node === view.selectedNode);
    const pick = here.length ? here : idle;
    this.s.selectUnits(pick.map((u) => u.id), false, false);
    this.s.focusUnit(pick[0]);
    this.s.sfx.play('select', 0.5);
    this.s.showToast(`Scout selected. Press E again (or EXPLORE) to send ${pick.length > 1 ? 'them' : 'it'} out.`, PAL.sky, 4);
    return true;
  }

  /** Send the selected ships to a world. Seed ships kindle it if it is dark. */
  orderAt(nodeId: number, wx?: number, wy?: number): boolean {
    if (!this.ready()) return false;
    const g = this.g;
    const units = this.s.commandable().filter((u) => !UNITS[u.type].isStatic && u.type !== 'fighter');
    if (!units.length) return false;
    const n = g.nodes[nodeId];
    const from = units[0].lane ? units[0].lane.to : units[0].node;
    if (from >= 0 && !isFinite(g.pathLen(from, nodeId))) {
      this.fail('No starlane leads there');
      return false;
    }
    const seeds = units.filter((u) => u.type === 'seed');
    const rest = units.filter((u) => u.type !== 'seed');
    let kindled = false;
    this.ordered(units, () => {
      if (seeds.length && n.kind === 'planet' && n.owner === -1 && !g.seedFor(this.pid, nodeId)) {
        kindled = g.cmdSendSeed(this.pid, seeds[0].id, nodeId);
        if (seeds.length > 1) g.cmdMove(this.pid, seeds.slice(1).map((u) => u.id), nodeId);
      } else if (seeds.length && !seeds.every((u) => u.order === 'kindle' && u.orderTarget === nodeId)) g.cmdMove(this.pid, seeds.map((u) => u.id), nodeId);
      if (rest.length) g.cmdMove(this.pid, rest.map((u) => u.id), nodeId, wx, wy);
    });
    this.s.marker(wx ?? n.x, wy ?? n.y, kindled ? PAL.gold : PAL.teal);
    this.s.sfx.play('order', 0.6);
    return true;
  }

  attack(unitId: number): boolean {
    if (!this.ready()) return false;
    const t = this.g.units.get(unitId);
    if (!t || t.dead) return false;
    const ids = this.s.commandable().filter((u) => u.type !== 'seed').map((u) => u.id);
    if (!ids.length) return false;
    this.g.cmdAttack(this.pid, ids, unitId);
    this.s.marker(t.x, t.y, PAL.red);
    this.s.sfx.play('order', 0.6);
    return true;
  }

  rally(fromNode: number, toNode: number) {
    if (!this.ready()) return;
    if (this.g.cmdSetRally(this.pid, fromNode, toNode)) {
      const n = this.g.nodes[toNode];
      this.s.marker(n.x, n.y, PAL.sky);
      this.s.sfx.play('select', 0.5);
      this.s.showToast(toNode === fromNode ? 'Rally point cleared.' : `New ships from here will fly to ${n.name}.`, PAL.sky, 2.5);
    }
  }
}
