/**
 * A game played together, in one process (1.28): a room, its screens, the wire between them with as much
 * delay and jitter as a test asks for, and a clock the test turns. Each screen's player may be the game's own
 * AI, thinking for that player between ticks and giving its orders as a player does (through the room).
 */
import { aiTick, makeAIState } from '../src/game/ai/ai';
import { HEIR_BY_ID } from '../src/game/data/heirs';
import type { Game } from '../src/game/Game';
import { RNG } from '../src/game/rng';
import type { AIState } from '../src/game/types';
import { gameHash } from '../src/net/hash';
import { localLink } from '../src/net/links';
import { Lockstep, type StartMsg } from '../src/net/Lockstep';
import { NET_VERSION, TURN_MS, type Bringing, type ClientMsg, type RoomMsg } from '../src/net/protocol';
import { RoomCore } from '../src/net/RoomCore';

export const ALL_HOUSES = ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'];

export interface Screen {
  name: string;
  link: ReturnType<typeof localLink>;
  /** What the room last said of its lobby, and every message it sent this screen. */
  lobby: Extract<RoomMsg, { t: 'lobby' }>['state'] | null;
  heard: RoomMsg[];
  token: string;
  ls: Lockstep | null;
  /** The game's AI plays this screen's house. */
  bot: boolean;
  mind: AIState | null;
  lastThink: number;
  hidden: boolean;
}

export class NetWorld {
  /** Milliseconds on the world's clock. */
  t = 0;
  room: RoomCore;
  screens: Screen[] = [];
  private events: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;
  private nextTurn = TURN_MS;
  private rnd: RNG;

  constructor(
    public delay = 0,
    public jitter = 0,
    seed = 1,
  ) {
    this.rnd = new RNG(seed);
    let r = seed * 7919;
    this.room = new RoomCore('TESTS', () => this.t, () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296));
  }

  /** Something that crosses the wire: it arrives after the delay, give or take the jitter, but never before what was sent before it. */
  private wire = (lane: { last: number }) => (fn: () => void) => {
    const at = Math.max(lane.last, this.t + this.delay + this.rnd.float(0, this.jitter));
    lane.last = at;
    this.events.push({ at, seq: this.seq++, fn });
  };

  /** A screen comes to the room (a player with these houses, and a Hall). */
  join(name: string, bring: Partial<Bringing> = {}, token?: string): Screen {
    const lane = { last: 0 };
    const link = localLink(this.room, this.wire(lane));
    const s: Screen = { name, link, lobby: null, heard: [], token: token ?? '', ls: null, bot: true, mind: null, lastThink: -999, hidden: false };
    link.onMessage = (m) => this.hear(s, m);
    const b: Bringing = { name, heirs: ALL_HOUSES, perks: {}, legendary: true, pacts: true, ...bring };
    link.send({ t: 'hello', version: NET_VERSION, build: 'test', bring: b, token: token || undefined });
    this.screens.push(s);
    return s;
  }

  private hear(s: Screen, m: RoomMsg) {
    s.heard.push(m);
    if (m.t === 'welcome') s.token = m.token;
    if (m.t === 'lobby') s.lobby = m.state;
    if (m.t === 'start' && !s.ls) {
      s.ls = new Lockstep(s.link, m as StartMsg, () => this.t, () => s.hidden);
      s.mind = null;
      s.ls.onGame = () => (s.mind = null);
    }
  }

  send(s: Screen, msg: ClientMsg) {
    s.link.send(msg);
  }

  /** Let `ms` of the world's clock pass: the wire, the room's turns, and each screen's frames (and its AI player). */
  run(ms: number, frameMs = 16) {
    const end = this.t + ms;
    let nextFrame = this.t;
    while (this.t < end) {
      this.events.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const step = Math.min(end, this.nextTurn, nextFrame, this.events[0]?.at ?? Infinity);
      this.t = Math.max(this.t, step);
      while (this.events.length && this.events[0].at <= this.t) this.events.shift()!.fn();
      if (this.t >= this.nextTurn) {
        this.room.turn();
        this.nextTurn += TURN_MS;
      }
      if (this.t >= nextFrame) {
        for (const s of this.screens) {
          if (!s.ls || s.hidden) continue;
          if (s.bot) this.think(s);
          s.ls.frame(frameMs / 1000);
        }
        nextFrame += frameMs;
      }
    }
  }

  /** The screen's player, if it is the game's AI: it thinks every ten ticks, with dice of its own, and gives orders through the room. */
  private think(s: Screen) {
    const ls = s.ls!;
    const g = ls.game;
    const p = g.player;
    if (ls.rebuilding || g.outcome || !p.alive || !p.isPlayer || g.tick - s.lastThink < 10) return;
    s.lastThink = g.tick;
    const gameRng = g.rng;
    const mineAi = p.ai;
    const drafts = p.pendingDrafts;
    g.rng = new RNG((g.tick * 2654435761 + p.id) >>> 0);
    try {
      s.mind ??= makeAIState(g, p, HEIR_BY_ID[p.heir].personalities);
      p.ai = s.mind;
      // (Its Boons it chooses as a player does, below: the AI's own way of choosing gives up on a draft not yet dealt.)
      p.pendingDrafts = 0;
      aiTick(g, p, 0.5);
    } finally {
      g.rng = gameRng;
      p.ai = mineAi;
      p.pendingDrafts = drafts;
    }
    if (drafts > 0) {
      const offer = g.ensureOffer(p);
      if (offer?.length) g.cmdChooseCard(p.id, offer[(g.tick / 10) % offer.length | 0]);
    }
  }

  /** The screens playing. */
  get playing(): Screen[] {
    return this.screens.filter((s) => s.ls && s.link.conn && !s.ls.rebuilding);
  }

  /** Hold the room's clock and let every screen reach it: then their games must be one game. */
  settle(): Game[] {
    const was = this.room.pause;
    this.room.pause = { by: -1, since: this.t };
    for (let i = 0; i < 400 && this.playing.some((s) => s.ls!.game.tick < this.room.to && !s.ls!.game.outcome); i++) this.run(50);
    this.room.pause = was;
    return this.playing.map((s) => s.ls!.game);
  }

  hashes(): number[] {
    return this.settle().map((g) => gameHash(g));
  }
}
