/**
 * A screen of a game played together (1.28): its game, run in step with every other screen's.
 *
 * The room says how far the game may run (`to`) and sends every order stamped with the tick it is carried
 * out after. This screen runs its game at the room's speed up to that tick, carries out each order just
 * before the tick after its stamp (as a Daily is played again, game/replay.ts), and every second of game time
 * tells the room what its game is (a hash). An order given on this screen does not change the game here: it
 * goes to the room (`Game.outbox`), and comes back stamped like everyone's.
 *
 * A screen that comes back to a game, or whose game has gone apart from the others', plays it again from its
 * orders (`rebuilding`), a slice of every frame, and goes on from there.
 */

import { TICK } from '../game/constants';
import { Game } from '../game/Game';
import type { Faction, GameConfig } from '../game/types';
import { gameHash } from './hash';
import {
  HAND_OVER, HASH_EVERY, keepArg, keptArg, REPORT_MS, ticksPerTurn,
  type ClientMsg, type PauseState, type PeerState, type RoomMsg, type Stamped,
} from './protocol';

/** A connection to the room, whatever carries it (a WebSocket, or a room in the same page in the tests). */
export interface Link {
  send(msg: ClientMsg): void;
  /** What the room says (set by whoever listens). */
  onMessage: ((msg: RoomMsg) => void) | null;
  /** The connection is up (true) or lost (false: it is trying again). */
  onStatus?: ((up: boolean) => void) | null;
  close(): void;
}

/** A word in the chat, or a mark on the map, as this screen keeps it (`at`: when it came, by the page's clock). */
export interface ChatLine {
  from: number;
  text: string;
  team: boolean;
  at: number;
}
export interface Ping {
  from: number;
  x: number;
  y: number;
  at: number;
}

export type StartMsg = Extract<RoomMsg, { t: 'start' }>;

/** At most this many milliseconds of a frame go to playing the game again, or to catching up. */
const SLICE_MS = 12;

export class Lockstep {
  game: Game;
  readonly seat: number;
  readonly config: GameConfig;
  /** Every order of the game so far, in the order the room stamped them. */
  log: Stamped[] = [];
  /** The next order of the log to carry out. */
  next = 0;
  to = 0;
  speed = 1;
  pause: PauseState | null = null;
  /** When (on this screen's clock) the room last said what its pause is. */
  private pauseHeard = 0;
  peers: PeerState[] = [];
  /** The game is being played again from its orders: how far (0 to 1), and why. */
  rebuilding: { why: string } | null = null;
  /** How many times the room found this screen's game out of step with the others' (the tests hold it to 0). */
  resyncs = 0;
  chat: ChatLine[] = [];
  pings: Ping[] = [];
  /** Players whose chat this screen does not show (a click on their name in the players' list). */
  muted = new Set<number>();
  /** The room ended the game (it could not keep the screens in step), or was lost: why. */
  ended: string | null = null;
  /** The room's last refusal (an order it would not take, a pause there were none left of). */
  error: { text: string; at: number } | null = null;
  /** The connection to the room is up. */
  online = true;
  /** Called with the new game when the game is made again (the screen draws that one from then on). */
  onGame: ((g: Game) => void) | null = null;
  /** Called when something arrives that the HUD shows (a word in the chat, a ping). */
  onNews: ((kind: 'chat' | 'ping', what: ChatLine | Ping) => void) | null = null;

  private acc = 0;
  /** Since when (this screen's clock) the game has waited at the room's tick, not paused (null: it is running). */
  private waitSince: number | null = null;
  private lastReport = -Infinity;
  private offerAsked = -Infinity;
  private reportedOver = false;

  constructor(
    private link: Link,
    start: StartMsg,
    private clock: () => number = () => performance.now(),
    private hidden: () => boolean = () => typeof document !== 'undefined' && document.hidden,
  ) {
    this.seat = start.you;
    this.config = start.config;
    this.game = this.make();
    this.take(start);
    link.onMessage = (m) => this.hear(m);
    link.onStatus = (up) => (this.online = up);
  }

  /** A new game from the config, for this screen. */
  private make(): Game {
    const g = Game.create(this.config);
    g.playerId = this.seat;
    g.outbox = (name, args) => this.give(name, args);
    return g;
  }

  /** The game as the room has it (at the start, on coming back): its orders, how far it may run, and whether to play it again. */
  private take(m: StartMsg) {
    // (Coming back after a moment away: the orders this screen has are the first of the room's, and the rest
    // are added; the game goes on as it was, with nothing to play again.)
    const ours = this.log.length;
    const same = m.log.length >= ours && (ours === 0 || sameOrder(m.log[ours - 1], this.log[ours - 1])) && this.game.tick <= m.to;
    this.log = m.log.slice();
    this.to = m.to;
    this.speed = m.speed;
    this.pause = m.paused;
    this.pauseHeard = this.clock();
    if (m.rebuild && !(same && ours > 0)) this.rebuild('Catching up with the game…');
    else if (m.rebuild) this.send({ t: 'report', tick: this.game.tick, hidden: this.hidden(), rebuilt: true });
  }

  private rebuild(why: string) {
    this.rebuilding = { why };
    this.game = this.make();
    this.game.fxEnabled = false;
    this.next = 0;
    this.acc = 0;
    this.onGame?.(this.game);
  }

  /** How far the game has been played again (0 to 1). */
  get progress(): number {
    return this.to > 0 ? Math.min(1, this.game.tick / this.to) : 1;
  }

  // =====================================================================
  // What the room says
  // =====================================================================

  private hear(m: RoomMsg) {
    switch (m.t) {
      case 'turn':
        for (const o of m.o) this.log.push(o);
        this.to = Math.max(this.to, m.to);
        return;
      case 'start':
        return this.take(m);
      case 'resync':
        this.resyncs++;
        this.log = m.log.slice();
        this.to = m.to;
        return this.rebuild('The screens fell out of step. Catching up with the game…');
      case 'pause':
        this.pause = m.state;
        this.pauseHeard = this.clock();
        return;
      case 'speed':
        this.speed = m.speed;
        return;
      case 'peers':
        this.peers = m.peers;
        return;
      case 'chat': {
        if (this.muted.has(m.from)) return;
        const line = { from: m.from, text: m.text, team: m.team, at: this.clock() };
        this.chat.push(line);
        if (this.chat.length > 30) this.chat.shift();
        this.onNews?.('chat', line);
        return;
      }
      case 'ping': {
        const p = { from: m.from, x: m.x, y: m.y, at: this.clock() };
        this.pings.push(p);
        if (this.pings.length > 12) this.pings.shift();
        this.onNews?.('ping', p);
        return;
      }
      case 'ended':
        this.ended = m.why;
        return;
      case 'error':
        this.error = { text: m.text, at: this.clock() };
        return;
      default:
        return;
    }
  }

  // =====================================================================
  // Running the game
  // =====================================================================

  /** One frame of the page: `dt` seconds of it. Runs the game as far as it may go, at the room's speed. */
  frame(dt: number) {
    const g = this.game;
    if (this.rebuilding) return this.replaySlice();
    if (g.outcome) {
      if (!this.reportedOver || this.clock() - this.lastReport >= REPORT_MS) this.report(true);
      return;
    }
    const tpt = ticksPerTurn(this.speed);
    const lag = this.to - g.tick;
    // (Behind by more than a few turns, as after a hidden page or a slow frame: faster until caught up.)
    const boost = lag > 3 * tpt ? Math.min(10, lag / (2 * tpt)) : 1;
    this.acc += dt * this.speed * boost;
    const t0 = this.clock();
    let steps = 0;
    while (this.acc >= TICK && g.tick < this.to && !g.outcome) {
      this.stepOnce();
      this.acc -= TICK;
      if (++steps % 8 === 0 && this.clock() - t0 > SLICE_MS) break;
    }
    // (Waiting for the room: no time is banked, or the game would leap when the next turn comes.)
    if (g.tick >= this.to) this.acc = Math.min(this.acc, TICK);
    if (g.tick >= this.to && !this.pause) this.waitSince ??= this.clock();
    else this.waitSince = null;
    if (this.clock() - this.lastReport >= REPORT_MS) this.report(false);
  }

  /** How far between this tick and the next the picture is (for the renderer), and 1 while waiting. */
  get alpha(): number {
    return this.game.tick >= this.to || this.rebuilding ? 1 : Math.min(1, this.acc / TICK);
  }

  /** The orders stamped for this tick, then the tick; and every second, what the game is. */
  private stepOnce() {
    const g = this.game;
    while (this.next < this.log.length && this.log[this.next][0] <= g.tick) this.apply(this.log[this.next++]);
    g.step();
    if (!this.rebuilding && g.tick % HASH_EVERY === 0) this.report(false, gameHash(g));
  }

  /** A slice of the game played again: as many ticks as fit in a frame. Done when it has caught up with the room. */
  private replaySlice() {
    const g = this.game;
    const t0 = this.clock();
    while (g.tick < this.to && !g.outcome && this.clock() - t0 < SLICE_MS) {
      for (let i = 0; i < 20 && g.tick < this.to && !g.outcome; i++) this.stepOnce();
    }
    if (g.tick >= this.to || g.outcome) {
      // (Carried out: what is due at this tick.)
      while (this.next < this.log.length && this.log[this.next][0] <= g.tick) this.apply(this.log[this.next++]);
      this.rebuilding = null;
      g.fx.length = 0;
      g.fxEnabled = true;
      this.acc = 0;
      this.report(!!g.outcome, undefined, true);
    } else if (this.clock() - this.lastReport >= REPORT_MS) this.report(false);
  }

  /** One order, carried out as the house that gave it. An order that fails, fails the same on every screen. */
  private apply(o: Stamped) {
    const g = this.game;
    const [, seat, name, raw] = o;
    if (name === HAND_OVER) {
      g.handOver(raw[0] as number, !!raw[1]);
      return;
    }
    const f = seat >= 0 ? g.factions[seat] : undefined;
    if (!f || f.kind !== 'empire') return;
    // (A decision is answered only by the house it asks.)
    if (name === 'cmdResolvePrompt' || name === 'dismissPrompt') {
      const p = g.prompts.find((x) => x.id === raw[0]);
      if (!p || p.fid !== seat) return;
    }
    const args = name === 'ensureOffer' ? [f] : raw.map(keptArg);
    const fn = (g as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
    if (typeof fn !== 'function') return;
    g.ordering++;
    try {
      fn.apply(g, args);
    } catch (e) {
      console.error(`order ${name} failed`, e);
    } finally {
      g.ordering--;
    }
  }

  /**
   * An order given on this screen (`Game.outbox`): to the room. The game does not change here until it comes
   * back. What the HUD is answered: true (it was sent); a decision's outcome, '' until it is known; the Boons
   * on offer, once they have been dealt (the room is asked to deal them, once).
   */
  private give(name: string, args: unknown[]): unknown {
    const g = this.game;
    if (this.rebuilding || g.outcome) return name === 'ensureOffer' ? null : false;
    if (name === 'ensureOffer') {
      const f = args[0] as Faction | undefined;
      if (!f || f.id !== this.seat) return null;
      if (f.draftOffer?.length) return f.draftOffer;
      if (f.pendingDrafts > 0 && this.clock() - this.offerAsked > 2500) {
        this.offerAsked = this.clock();
        this.send({ t: 'order', name, args: [] });
      }
      return null;
    }
    this.send({ t: 'order', name, args: args.map(keepArg) });
    return name === 'cmdResolvePrompt' ? '' : true;
  }

  // =====================================================================
  // What this screen says
  // =====================================================================

  send(msg: ClientMsg) {
    this.link.send(msg);
  }

  private report(over: boolean, hash?: number, rebuilt = false) {
    this.lastReport = this.clock();
    if (over) this.reportedOver = true;
    const msg: ClientMsg = { t: 'report', tick: this.game.tick, hidden: this.hidden() };
    if (hash !== undefined) msg.hash = hash;
    if (over) msg.over = true;
    if (rebuilt) msg.rebuilt = true;
    this.send(msg);
  }

  /** The page was hidden or shown: say so at once (a hidden page is not waited for). */
  visibility() {
    this.report(!!this.game.outcome);
  }

  /** This screen asks for a pause (or for the game to go on). */
  setPause(on: boolean) {
    this.send({ t: 'pause', on });
  }

  setSpeed(speed: number) {
    this.send({ t: 'speed', speed });
  }

  say(text: string, team: boolean) {
    this.send({ t: 'chat', text, team });
  }

  ping(x: number, y: number) {
    this.send({ t: 'ping', x, y });
  }

  leave() {
    this.send({ t: 'leave' });
    this.link.close();
  }

  /** The room is paused (or counting in). */
  get paused(): boolean {
    return !!this.pause;
  }

  /** Seconds until the count-in ends (null: none under way), and until anyone may resume (versus; 0: now). */
  get resumeIn(): number | null {
    const p = this.pause;
    return p?.resumeIn === undefined ? null : Math.max(0, (p.resumeIn - (this.clock() - this.pauseHeard)) / 1000);
  }

  get openIn(): number {
    const p = this.pause;
    return p?.openIn === undefined ? 0 : Math.max(0, (p.openIn - (this.clock() - this.pauseHeard)) / 1000);
  }

  /** Seconds the game has waited for the room (not paused): a turn late now and then is nothing; a second is someone slow. */
  get waitingFor(): number {
    return this.waitSince === null ? 0 : (this.clock() - this.waitSince) / 1000;
  }

  /** Is this screen's player the room's host? */
  get host(): boolean {
    return !!this.peers.find((p) => p.seat === this.seat)?.host;
  }

  /** A player's name (their seat's), for the HUD. */
  nameOf(seat: number): string {
    return this.config.seats?.[seat]?.name ?? this.game.factions[seat]?.name ?? '?';
  }
}

function sameOrder(a: Stamped | undefined, b: Stamped | undefined): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && JSON.stringify(a[3]) === JSON.stringify(b[3]);
}
