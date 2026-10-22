/**
 * A room of a game played together (1.28, docs/MULTIPLAYER.md): its lobby, and the clock of its game.
 *
 * The room does not play the game; every screen does. It keeps the seats and the order of things: it lets
 * the game run a turn further every tenth of a second, stamps each order with the tick it is carried out
 * after, passes every order to every screen, and keeps them all (a screen that comes back plays the game
 * again from them). It compares what each screen says its game is, every second of game time, and if two
 * differ it has every screen play the game again from its orders. It keeps the rules of the game together
 * that are not the game's: pauses, the speed, a player gone too long (the AI leads their house), chat.
 *
 * It is the same wherever it runs: in a Durable Object on hegemarch.com (worker/src/room.ts), on the dev
 * server (scripts/lib/roomhost.ts), and in the tests. Its host gives it a clock and connections, calls
 * `turn` every `TURN_MS`, and may keep `save()` to bring a room back with `restore`.
 */

import type { GameConfig, Seat } from '../game/types';
import { nameProblem } from '../meta/board';
import {
  AWAY_MS, cleanName, COUNT_IN_MS, DEFAULT_OPTIONS, HAND_OVER, HASH_EVERY, HOUSE_IDS, MAX_LAG_TICKS, MAX_PLAYERS, NET_ORDERS, NET_SPEEDS, NET_VERSION,
  orderShape, PAUSE_MS, plainArg, SEATS_BY_SIZE, startProblem, ticksPerTurn, VERSUS_PAUSES,
  type Bringing, type ClientMsg, type LobbySeat, type LobbyState, type PauseState, type PeerState, type RoomMsg, type RoomOptions, type Stamped,
} from './protocol';

/** A connection to one screen, as the host gives it. */
export interface Conn {
  send(msg: RoomMsg): void;
  close(): void;
}

/** A player of the room: their seat, and their connection while they have one. */
interface Member {
  conn: Conn | null;
  token: string;
  seat: number;
  bring: Bringing;
  build: string;
  /** Where their game is (its tick), and whether its page is hidden (a hidden page is not waited for). */
  tick: number;
  hidden: boolean;
  /** When they last said where they are, and when they went away (0: they are here). */
  heard: number;
  awaySince: number;
  /** Their game is being played again from the orders (they came back, or the games went apart). */
  rebuilding: boolean;
  over: boolean;
  /** Orders they may still send this second (a few hundred a minute is far more than anyone gives). */
  budget: number;
  budgetAt: number;
}

/** What a room keeps to be brought back (a Durable Object that was put to sleep, or moved). */
export interface RoomSave {
  code: string;
  phase: RoomCore['phase'];
  options: RoomOptions;
  seats: LobbySeat[];
  members: { token: string; seat: number; bring: Bringing; build: string }[];
  owner: number;
  config: GameConfig | null;
  log: Stamped[];
  to: number;
  speed: number;
  pausesLeft: number[];
}

/** Orders a player may send in a burst, and how many a second come back to them. */
const BURST = 60;
const PER_SECOND = 25;
/** A screen not heard from for this long is not waited for. */
const SILENT_MS = 5000;
/** The most chat says at once. */
const CHAT_MAX = 120;
/** A game is played again from its orders at most this many times before the room gives up on keeping it in step. */
const MAX_RESYNCS = 2;

export class RoomCore {
  phase: 'lobby' | 'playing' | 'over' = 'lobby';
  options: RoomOptions = { ...DEFAULT_OPTIONS };
  seats: LobbySeat[] = [];
  members: Member[] = [];
  /** The seat of the room's owner (who sets it up and starts it). */
  owner = -1;
  /** The build of the game the room is for (the first to come in sets it). */
  build = '';
  config: GameConfig | null = null;
  log: Stamped[] = [];
  pending: Stamped[] = [];
  /** The tick the game may run to. */
  to = 0;
  speed = 1;
  pause: PauseState | null = null;
  pausesLeft: number[] = [];
  /** Each seat's hash of its game, by tick. */
  hashes = new Map<number, Map<number, number>>();
  resyncs = 0;
  resyncing = false;
  private lastPeers = 0;
  /** Changed since the host last saved. */
  dirty = true;

  constructor(
    public code: string,
    private clock: () => number,
    private random: () => number = Math.random,
  ) {
    this.seats = defaultSeats(this.options);
  }

  // =====================================================================
  // Coming and going
  // =====================================================================

  /** A screen says who it is: a player new to the room, or one coming back with their token. */
  hello(conn: Conn, msg: Extract<ClientMsg, { t: 'hello' }>) {
    if (msg.version !== NET_VERSION) return refuse(conn, 'This room is for another version of Hegemarch. Reload the page to play.');
    if (this.build && msg.build !== this.build) return refuse(conn, `This room plays version ${this.build}, and this page is ${msg.build}. Reload the page (both of you) to play together.`);
    const back = msg.token ? this.members.find((m) => m.token === msg.token) : undefined;
    if (back) {
      // (The same player again: a page reloaded, or a connection lost and found.)
      back.conn?.close();
      back.conn = conn;
      back.awaySince = 0;
      back.heard = this.clock();
      conn.send({ t: 'welcome', token: back.token });
      if (this.phase === 'lobby') this.broadcastLobby();
      else this.rejoin(back);
      this.dirty = true;
      return;
    }
    if (this.phase !== 'lobby') return refuse(conn, 'This room\'s game has begun. Ask its players to start a new room.');
    const seat = this.seats.findIndex((s) => s.kind === 'open');
    if (seat < 0 || this.members.length >= MAX_PLAYERS) return refuse(conn, 'This room is full.');
    if (!this.build) this.build = msg.build;
    // (A name is three to five letters, and one the Daily board would take: no slurs. Otherwise a guest's.)
    const said = cleanName(String(msg.bring?.name ?? ''));
    const name = said.length >= 3 && !nameProblem(said) ? said : 'GUEST';
    const bring = { ...msg.bring, name, heirs: (msg.bring?.heirs ?? []).filter((h) => HOUSE_IDS.includes(h)) };
    const m: Member = {
      conn, token: this.newToken(), seat, bring, build: msg.build, tick: 0, hidden: false, heard: this.clock(), awaySince: 0,
      rebuilding: false, over: false, budget: BURST, budgetAt: this.clock(),
    };
    this.members.push(m);
    const s = this.seats[seat];
    s.kind = 'player';
    s.name = bring.name;
    s.ready = false;
    // (A house the player has, and no one in the room has taken.)
    s.heir = this.freeHouse(bring.heirs.length ? bring.heirs : HOUSE_IDS, seat) ?? '';
    if (this.owner < 0) this.owner = seat;
    conn.send({ t: 'welcome', token: m.token });
    this.dirty = true;
    this.broadcastLobby();
  }

  /** A connection has gone (closed, or lost). */
  gone(conn: Conn) {
    const m = this.members.find((x) => x.conn === conn);
    if (!m) return;
    m.conn = null;
    if (this.phase === 'lobby') {
      // (In the lobby a seat is given up with its connection: whoever comes next may take it.)
      this.drop(m);
      return;
    }
    m.awaySince = this.clock();
    this.dirty = true;
    this.sendPeers();
  }

  /** A player leaves for good: in a game, the AI leads their house from now. */
  private leave(m: Member) {
    m.conn?.close();
    m.conn = null;
    if (this.phase === 'lobby') {
      this.drop(m);
      return;
    }
    if (this.phase === 'playing' && !this.seats[m.seat].ai) this.handOver(m.seat, true);
    this.members = this.members.filter((x) => x !== m);
    if (this.owner === m.seat) this.owner = this.members[0]?.seat ?? -1;
    this.dirty = true;
    this.sendPeers();
  }

  /** A player leaves the lobby: their seat is open again. */
  private drop(m: Member) {
    this.members = this.members.filter((x) => x !== m);
    const s = this.seats[m.seat];
    if (s) {
      s.kind = 'open';
      s.heir = '';
      delete s.name;
      delete s.ready;
      delete s.handicap;
    }
    if (this.owner === m.seat) this.owner = this.members[0]?.seat ?? -1;
    this.dirty = true;
    this.broadcastLobby();
  }

  /** A player who came back to a game: the whole of it so far, to play again; then their house is theirs again. */
  private rejoin(m: Member) {
    if (!this.config || !m.conn) return;
    m.rebuilding = true;
    m.tick = 0;
    m.conn.send({ t: 'start', config: this.config, you: m.seat, log: this.log, to: this.to, speed: this.speed, paused: this.pauseNow(), rebuild: true });
    if (this.phase === 'playing' && this.seats[m.seat].ai) this.handOver(m.seat, false);
    this.sendPeers();
  }

  // =====================================================================
  // What a screen says
  // =====================================================================

  message(conn: Conn, msg: ClientMsg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') return this.hello(conn, msg);
    const m = this.members.find((x) => x.conn === conn);
    if (!m) return;
    m.heard = this.clock();
    switch (msg.t) {
      case 'order':
        return this.order(m, msg.name, msg.args);
      case 'report':
        return this.report(m, msg);
      case 'pause':
        return this.setPause(m, !!msg.on);
      case 'speed':
        return this.setSpeed(m, msg.speed);
      case 'chat':
        return this.chat(m, msg.text, !!msg.team);
      case 'ping':
        return this.ping(m, msg.x, msg.y);
      case 'leave':
        return this.leave(m);
      case 'again':
        return this.again(m);
      default:
        return this.lobby(m, msg);
    }
  }

  // =====================================================================
  // The lobby
  // =====================================================================

  private lobby(m: Member, msg: ClientMsg) {
    if (this.phase !== 'lobby') return;
    const mine = this.seats[m.seat];
    const owner = m.seat === this.owner;
    const versus = this.options.together === 'versus';
    switch (msg.t) {
      case 'sit': {
        const to = this.seats[msg.seat];
        if (!to || to.kind !== 'open') return;
        to.kind = 'player';
        to.name = mine.name;
        to.heir = mine.heir;
        to.team = versus ? to.team : 0;
        to.ready = false;
        mine.kind = 'open';
        mine.heir = '';
        delete mine.name;
        delete mine.ready;
        if (this.owner === m.seat) this.owner = msg.seat;
        m.seat = msg.seat;
        break;
      }
      case 'house': {
        // (Co-op: a house of the player's own. Versus: any of the six, for everyone.)
        const ok = HOUSE_IDS.includes(msg.heir) && (versus || m.bring.heirs.includes(msg.heir));
        if (!ok || this.seats.some((s, i) => i !== m.seat && s.kind !== 'closed' && s.heir === msg.heir)) return;
        mine.heir = msg.heir;
        mine.ready = false;
        break;
      }
      case 'team':
        if (!versus || !Number.isInteger(msg.team) || msg.team < 0 || msg.team > 5) return;
        mine.team = msg.team;
        mine.ready = false;
        break;
      case 'ready':
        mine.ready = !!msg.on && !!mine.heir;
        break;
      case 'options': {
        if (!owner) return;
        const o = { ...this.options, ...sane(msg.options) };
        // (Never a sector with fewer seats than there are players in the room.)
        if (SEATS_BY_SIZE[o.size] < this.members.length) o.size = this.options.size;
        const sizeChanged = o.size !== this.options.size || o.together !== this.options.together;
        this.options = o;
        if (sizeChanged) this.reseat();
        else this.teamUp();
        for (const s of this.seats) if (s.kind === 'player') s.ready = false;
        break;
      }
      case 'seat': {
        if (!owner) return;
        const s = this.seats[msg.seat];
        if (!s || s.kind === 'player') {
          // (The owner can set a player's handicap and team; the rest of a player's seat is the player's.)
          if (s && versus && msg.handicap !== undefined) s.handicap = clampHandicap(msg.handicap);
          if (s && versus && msg.team !== undefined && Number.isInteger(msg.team) && msg.team >= 0 && msg.team <= 5) s.team = msg.team;
          break;
        }
        if (msg.kind) {
          s.kind = msg.kind;
          if (s.kind !== 'ai') s.heir = '';
        }
        if (msg.heir !== undefined && s.kind === 'ai') {
          if (msg.heir === '' || (HOUSE_IDS.includes(msg.heir) && !this.seats.some((x, i) => i !== msg.seat && x.kind !== 'closed' && x.heir === msg.heir))) s.heir = msg.heir;
        }
        if (msg.team !== undefined && versus && Number.isInteger(msg.team) && msg.team >= 0 && msg.team <= 5) s.team = msg.team;
        this.teamUp();
        break;
      }
      case 'start':
        if (!owner) return;
        return this.start(m);
      default:
        return;
    }
    this.dirty = true;
    this.broadcastLobby();
  }

  /** The seats of the room's size and kind, keeping its players in theirs (as far as there are seats). */
  private reseat() {
    const fresh = defaultSeats(this.options);
    const players = this.members.slice(0, fresh.length); // (all of them: the room keeps a size that seats them)
    for (const m of players) {
      const was = this.seats[m.seat];
      const at = players.indexOf(m);
      fresh[at] = { ...was, kind: 'player', team: this.options.together === 'versus' ? at : 0, ready: false };
      if (this.owner === m.seat) this.owner = at;
      m.seat = at;
    }
    this.seats = fresh;
    this.teamUp();
  }

  /** Co-op: the players are one team; each AI house its own (or one team, if the rivals unite). */
  private teamUp() {
    if (this.options.together !== 'coop') return;
    this.seats.forEach((s, i) => (s.team = s.kind === 'ai' ? (this.options.unite ? 1 : 1 + i) : 0));
  }

  /** Why the game cannot start yet, or null. */
  whyNot(): string | null {
    return startProblem(this.seats, this.options, this.owner);
  }

  /** The game begins: the config every screen makes the same game from, and the clock starts. */
  private start(m: Member) {
    const why = this.whyNot();
    if (why) {
      m.conn?.send({ t: 'error', text: why });
      return;
    }
    // The houses that will play, in order (closed seats are not in the sector), and the AI's houses dealt.
    const order = this.seats.map((s, i) => [s, i] as const).filter(([s]) => s.kind !== 'closed');
    const taken = new Set(order.map(([s]) => s.heir).filter(Boolean));
    for (const [s] of order) {
      if (s.heir) continue;
      const free = HOUSE_IDS.filter((h) => !taken.has(h));
      s.heir = free[Math.floor(this.random() * free.length)] ?? HOUSE_IDS[0];
      taken.add(s.heir);
    }
    const coop = this.options.together === 'coop';
    const seats: Seat[] = order.map(([s]) => {
      const mem = this.members.find((x) => this.seats[x.seat] === s);
      const seat: Seat = { heir: s.heir, human: s.kind === 'player', team: s.team };
      if (s.kind === 'player' && mem) {
        seat.name = mem.bring.name;
        // (Co-op: the player's own Hall and unlocks. Versus: everything, and no perks, for everyone.)
        seat.perks = coop ? { ...mem.bring.perks } : {};
        seat.legendary = coop ? mem.bring.legendary : true;
        seat.pacts = coop ? mem.bring.pacts : true;
        if (!coop && s.handicap) seat.handicap = s.handicap;
      }
      return seat;
    });
    // (Members to their seats in the game: the index among the houses that play.)
    for (const mem of this.members) mem.seat = order.findIndex(([s]) => s === this.seats[mem.seat]);
    this.owner = Math.max(0, order.findIndex(([, i]) => i === this.owner));
    this.seats = order.map(([s]) => s);
    const seed = Math.floor(this.random() * 4294967296) >>> 0;
    this.config = {
      seed, size: this.options.size, difficulty: this.options.difficulty, heir: seats.find((s) => s.human)?.heir ?? seats[0].heir, perks: {},
      unlockLegendary: true, unlockPacts: true, seats, together: this.options.together, version: this.build,
    };
    if (!coop && this.options.sameLuck) this.config.sameLuck = true;
    if (!coop && this.options.timeLimit > 0) this.config.timeLimit = this.options.timeLimit;
    this.phase = 'playing';
    this.log = [];
    this.pending = [];
    this.to = 0;
    this.speed = this.options.speed;
    this.pause = null;
    this.pausesLeft = this.seats.map((s) => (s.kind === 'player' ? VERSUS_PAUSES : 0));
    this.hashes.clear();
    this.resyncs = 0;
    this.resyncing = false;
    for (const mem of this.members) {
      mem.tick = 0;
      mem.over = false;
      mem.rebuilding = false;
      mem.heard = this.clock();
      mem.conn?.send({ t: 'start', config: this.config, you: mem.seat, log: [], to: 0, speed: this.speed, paused: null });
    }
    this.dirty = true;
    this.sendPeers();
  }

  /** The game is over: its clock stops, and the room's lobby says so (its host may start another). */
  private over() {
    this.phase = 'over';
    this.dirty = true;
    this.broadcastLobby();
  }

  /** After a game: the same room, the same seats, a new sector. */
  private again(m: Member) {
    if (this.phase !== 'over' || m.seat !== this.owner) return;
    this.phase = 'lobby';
    this.config = null;
    this.log = [];
    for (const s of this.seats) {
      delete s.ai;
      if (s.kind === 'player') s.ready = false;
    }
    this.dirty = true;
    this.broadcastLobby();
  }

  // =====================================================================
  // The game
  // =====================================================================

  /** An order from a player: checked, put in their own house's name, and stamped with the tick it is carried out after. */
  private order(m: Member, name: string, args: unknown) {
    if (this.phase !== 'playing' || this.resyncing || this.seats[m.seat]?.ai || m.rebuilding) return;
    if (!(NET_ORDERS as readonly string[]).includes(name) || !Array.isArray(args) || !args.every(plainArg)) return;
    // (The order's own shape: a list where a list goes, a number where a number goes. The house argument is the room's to set.)
    const a = [...args];
    if (name === 'ensureOffer') a.length = 0;
    else if (name.startsWith('cmd') && name !== 'cmdResolvePrompt') a[0] = m.seat;
    if (!orderShape(name, a)) return;
    const now = this.clock();
    m.budget = Math.min(BURST, m.budget + ((now - m.budgetAt) / 1000) * PER_SECOND);
    m.budgetAt = now;
    if (m.budget < 1) return;
    m.budget--;
    // (An order is always for the house of whoever sent it: set above.)
    this.stamp(m.seat, name, a);
  }

  private stamp(seat: number, name: string, args: unknown[]) {
    const o: Stamped = [this.to, seat, name, args];
    this.pending.push(o);
    this.log.push(o);
    this.dirty = true;
  }

  /** The room's own word in the stream: the AI leads a house (`toAi`), or gives it back. */
  private handOver(seat: number, toAi: boolean) {
    const s = this.seats[seat];
    if (!s || s.kind !== 'player' || !!s.ai === toAi) return;
    s.ai = toAi;
    this.stamp(-1, HAND_OVER, [seat, toAi ? 1 : 0]);
  }

  private report(m: Member, msg: Extract<ClientMsg, { t: 'report' }>) {
    if (this.phase === 'lobby' || !Number.isInteger(msg.tick)) return;
    m.tick = msg.tick;
    m.hidden = !!msg.hidden;
    if (msg.rebuilt) {
      m.rebuilding = false;
      if (this.resyncing && !this.members.some((x) => x.conn && x.rebuilding)) this.resyncing = false;
    }
    if (msg.over && this.phase === 'playing') {
      m.over = true;
      // (The game is over when every screen that is here says so.)
      if (this.members.every((x) => !x.conn || x.over)) this.over();
    }
    if (msg.hash !== undefined && !m.rebuilding && !this.resyncing && msg.tick % HASH_EVERY === 0) this.compare(m.seat, msg.tick, msg.hash >>> 0);
  }

  /** Each screen's game at a tick, compared once every screen that is here has said what it is. */
  private compare(seat: number, tick: number, hash: number) {
    let at = this.hashes.get(tick);
    if (!at) this.hashes.set(tick, (at = new Map()));
    at.set(seat, hash);
    // (Old ticks are forgotten: a screen that never says is not waited for.)
    for (const t of this.hashes.keys()) if (t < tick - HASH_EVERY * 10) this.hashes.delete(t);
    const here = this.members.filter((x) => x.conn && !x.rebuilding);
    if (!here.every((x) => at!.has(x.seat))) return;
    const seen = new Set(here.map((x) => at!.get(x.seat)));
    this.hashes.delete(tick);
    if (seen.size > 1) this.resync(`the games of ${here.length} screens went apart at ${(tick / 20).toFixed(0)} s`);
  }

  /**
   * The screens' games have gone apart. Every screen plays the game again from its orders, which every screen
   * has and which make the one true game (a screen whose game was changed by anything but an order is put
   * right). If that happens again and again, the room ends the game: its screens cannot be kept in step.
   */
  private resync(why: string) {
    if (this.resyncs >= MAX_RESYNCS) {
      this.broadcast({ t: 'ended', why: `This game could not be kept in step on every screen (${why}).` });
      this.over();
      return;
    }
    this.resyncs++;
    this.resyncing = true;
    this.flush();
    for (const m of this.members) if (m.conn) m.rebuilding = true;
    this.broadcast({ t: 'resync', log: this.log, to: this.to, why });
  }

  private setPause(m: Member, on: boolean) {
    if (this.phase !== 'playing') return;
    const now = this.clock();
    const versus = this.options.together === 'versus';
    if (on) {
      if (this.pause) {
        // (Asked to pause during the count-in: it stays paused.)
        if (this.pause.resumeAt) delete this.pause.resumeAt;
        else return;
      } else {
        if (versus && (this.pausesLeft[m.seat] ?? 0) <= 0) {
          m.conn?.send({ t: 'error', text: 'You have no pauses left in this game.' });
          return;
        }
        if (versus) this.pausesLeft[m.seat]--;
        this.pause = { by: m.seat, since: now };
        if (versus) this.pause.openAt = now + PAUSE_MS;
      }
    } else {
      if (!this.pause || this.pause.resumeAt) return;
      if (versus && this.pause.by !== m.seat && now < (this.pause.openAt ?? 0)) {
        m.conn?.send({ t: 'error', text: 'Only the player who paused can go on, until a minute has passed.' });
        return;
      }
      this.pause.resumeAt = now + COUNT_IN_MS;
    }
    this.dirty = true;
    this.broadcast({ t: 'pause', state: this.pauseNow() });
    this.sendPeers();
  }

  /** The pause as it is sent: with how long until the count-in ends and until anyone may resume, from now. */
  private pauseNow(): PauseState | null {
    if (!this.pause) return null;
    const now = this.clock();
    const p: PauseState = { ...this.pause };
    if (p.resumeAt !== undefined) p.resumeIn = Math.max(0, p.resumeAt - now);
    if (p.openAt !== undefined) p.openIn = Math.max(0, p.openAt - now);
    return p;
  }

  private setSpeed(m: Member, speed: number) {
    // (Co-op: the room's owner sets the speed for everyone. Versus: the lobby set it, for the whole game.)
    if (this.phase !== 'playing' || this.options.together !== 'coop' || m.seat !== this.owner || !NET_SPEEDS.includes(speed)) return;
    this.speed = speed;
    this.dirty = true;
    this.broadcast({ t: 'speed', speed });
  }

  private chat(m: Member, raw: string, team: boolean) {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text) return;
    const msg: RoomMsg = { t: 'chat', from: m.seat, text, team };
    for (const x of this.members) if (x.conn && (!team || this.allies(x.seat, m.seat))) x.conn.send(msg);
  }

  /** A mark on the map, for the player's allies (and themselves). */
  private ping(m: Member, x: number, y: number) {
    if (this.phase !== 'playing' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const msg: RoomMsg = { t: 'ping', from: m.seat, x, y };
    for (const o of this.members) if (o.conn && this.allies(o.seat, m.seat)) o.conn.send(msg);
  }

  private allies(a: number, b: number): boolean {
    return a === b || (this.seats[a] && this.seats[b] && this.seats[a].team === this.seats[b].team);
  }

  // =====================================================================
  // The clock
  // =====================================================================

  /** One turn of the room's clock (every `TURN_MS`): the game may run a turn further, unless it waits. */
  turn() {
    if (this.phase !== 'playing') return;
    const now = this.clock();
    // A player gone too long: the AI leads their house until they come back.
    for (const m of this.members) if (!m.conn && m.awaySince && now - m.awaySince >= AWAY_MS) this.handOver(m.seat, true);
    if (this.pause?.resumeAt && now >= this.pause.resumeAt) {
      this.pause = null;
      this.broadcast({ t: 'pause', state: null });
      this.sendPeers();
    }
    if (!this.pause && !this.resyncing && !this.waiting(now)) this.to += ticksPerTurn(this.speed);
    this.flush();
    if (now - this.lastPeers >= 1000) this.sendPeers();
  }

  /**
   * The turn's orders and how far the game may now run, to every screen (one playing its game again too: it
   * keeps them, and plays on to them once it has caught up).
   */
  private flush() {
    const msg: RoomMsg = { t: 'turn', to: this.to, o: this.pending };
    this.pending = [];
    for (const m of this.members) m.conn?.send(msg);
  }

  /** Is a screen far behind (and not hidden, and not silent)? The game waits for it: everyone slows to the slowest. */
  private waiting(now: number): boolean {
    return this.members.some((m) => m.conn && !m.hidden && !m.rebuilding && now - m.heard < SILENT_MS && m.tick < this.to - MAX_LAG_TICKS);
  }

  private sendPeers() {
    this.lastPeers = this.clock();
    if (this.phase === 'lobby') return;
    const peers: PeerState[] = this.members.map((m) => ({
      seat: m.seat, name: m.bring.name, online: !!m.conn, ai: !!this.seats[m.seat]?.ai, lag: Math.max(0, this.to - m.tick), hidden: m.hidden,
      pauses: this.options.together === 'versus' ? (this.pausesLeft[m.seat] ?? 0) : -1, host: m.seat === this.owner,
    }));
    this.broadcast({ t: 'peers', peers });
  }

  // =====================================================================
  // Telling
  // =====================================================================

  private broadcast(msg: RoomMsg) {
    for (const m of this.members) m.conn?.send(msg);
  }

  lobbyState(seat: number): LobbyState {
    return { code: this.code, phase: this.phase, options: this.options, seats: this.seats, you: seat, owner: this.owner };
  }

  private broadcastLobby() {
    for (const m of this.members) m.conn?.send({ t: 'lobby', state: this.lobbyState(m.seat) });
  }

  /** Is anyone here? (A host may let a room with no one in it go.) */
  empty(): boolean {
    return !this.members.some((m) => m.conn);
  }

  private newToken(): string {
    let s = '';
    for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(this.random() * 36)];
    return s;
  }

  private freeHouse(want: string[], seat: number): string | null {
    return want.find((h) => !this.seats.some((s, i) => i !== seat && s.kind !== 'closed' && s.heir === h)) ?? null;
  }

  // =====================================================================
  // Kept, and brought back
  // =====================================================================

  save(): RoomSave {
    this.dirty = false;
    return {
      code: this.code, phase: this.phase, options: this.options, seats: this.seats, owner: this.owner, config: this.config, log: this.log,
      to: this.to, speed: this.speed, pausesLeft: this.pausesLeft,
      members: this.members.map((m) => ({ token: m.token, seat: m.seat, bring: m.bring, build: m.build })),
    };
  }

  /** A room brought back from what it kept: everyone is away until they come back (with their tokens). */
  static restore(data: RoomSave, clock: () => number, random: () => number = Math.random): RoomCore {
    const r = new RoomCore(data.code, clock, random);
    Object.assign(r, { phase: data.phase, options: data.options, seats: data.seats, owner: data.owner, config: data.config, log: data.log, to: data.to, speed: data.speed, pausesLeft: data.pausesLeft });
    r.build = data.members[0]?.build ?? '';
    const now = clock();
    r.members = data.members.map((m) => ({
      conn: null, token: m.token, seat: m.seat, bring: m.bring, build: m.build, tick: 0, hidden: false, heard: now, awaySince: now,
      rebuilding: false, over: false, budget: BURST, budgetAt: now,
    }));
    if (r.phase === 'lobby') r.members = [];
    r.dirty = false;
    return r;
  }
}

function refuse(conn: Conn, text: string) {
  conn.send({ t: 'error', text });
  conn.close();
}

/** The seats a room starts with: co-op, you and a friend against the AI; versus, you against one other player. */
export function defaultSeats(o: RoomOptions): LobbySeat[] {
  const n = SEATS_BY_SIZE[o.size];
  return Array.from({ length: n }, (_, i): LobbySeat => {
    if (o.together === 'versus') return { kind: i < 2 ? 'open' : 'closed', heir: '', team: i };
    return { kind: i < 2 ? 'open' : 'ai', heir: '', team: i < 2 ? 0 : o.unite ? 1 : 1 + i };
  });
}

/** Room options as they may be: anything else is left as it was. */
function sane(o: Partial<RoomOptions>): Partial<RoomOptions> {
  const out: Partial<RoomOptions> = {};
  if (o.together === 'coop' || o.together === 'versus') out.together = o.together;
  if (o.size === 'small' || o.size === 'medium' || o.size === 'large') out.size = o.size;
  if (o.difficulty === 0 || o.difficulty === 1 || o.difficulty === 2 || o.difficulty === 3) out.difficulty = o.difficulty;
  if (typeof o.speed === 'number' && NET_SPEEDS.includes(o.speed)) out.speed = o.speed;
  if (typeof o.sameLuck === 'boolean') out.sameLuck = o.sameLuck;
  if (typeof o.unite === 'boolean') out.unite = o.unite;
  if (typeof o.timeLimit === 'number' && [0, 30, 45, 60, 90].includes(o.timeLimit)) out.timeLimit = o.timeLimit;
  return out;
}

function clampHandicap(h: number): number {
  return [0, 0.1, 0.2, 0.3].includes(h) ? h : 0;
}
