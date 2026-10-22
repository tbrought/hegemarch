/**
 * A room of a game played together (1.28), on hegemarch.com: a Durable Object for each room (its code is its
 * name), holding the room (src/net/RoomCore.ts, the same room the dev server and the tests run) and the
 * WebSockets of its screens.
 *
 *   POST /api/room/new           a new room: { code }
 *   GET  /api/room/<CODE>/ws     a screen's WebSocket to its room
 *
 * Its clock runs while its game does and anyone is in it. What it keeps (its seats, the game's config and
 * every order) is written to its storage every few seconds, so that a room moved or woken goes on: its
 * screens come back by themselves with their tokens. A room no one has used for seven days is deleted. It
 * keeps no account, no address and no IP: a player is a name of three to five letters and a token.
 */

import { isCode, makeCode, TURN_MS, type ClientMsg } from '../../src/net/protocol';
import { RoomCore, type Conn, type RoomSave } from '../../src/net/RoomCore';

// The little of the Workers runtime used here (@cloudflare/workers-types has it all).
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
interface ServerSocket extends WebSocket {
  accept(): void;
}
export interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
}
export interface DOState {
  storage: DOStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
export interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
}

/** Orders kept under one key of the room's storage. */
const CHUNK = 400;
/** A room's storage is written at most this often while its game runs (and at once when anything else changes). */
const SAVE_MS = 5000;
/** A room no one has come to for this long is deleted. */
const KEEP_MS = 7 * 24 * 60 * 60_000;

export class Room {
  private core: RoomCore | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSave = 0;
  /** Orders already written whole to storage (the chunk they end is rewritten as it fills). */
  private savedLen = 0;
  /** The room read back from its storage (the runtime holds every request until then; so does this). */
  private ready: Promise<void>;

  constructor(private state: DOState, _env?: unknown) {
    this.ready = state.blockConcurrencyWhile(async () => {
      const meta = await state.storage.get<Omit<RoomSave, 'log'> & { logLen: number }>('meta');
      if (!meta) return;
      const log: RoomSave['log'] = [];
      for (let k = 0; k * CHUNK < meta.logLen; k++) log.push(...((await state.storage.get<RoomSave['log']>(`log:${k}`)) ?? []));
      this.core = RoomCore.restore({ ...meta, log: log.slice(0, meta.logLen) }, Date.now);
      this.savedLen = Math.floor(meta.logLen / CHUNK) * CHUNK;
    });
  }

  async fetch(req: Request): Promise<Response> {
    await this.ready;
    const url = new URL(req.url);
    if (url.pathname.endsWith('/init')) return this.init(url.searchParams.get('code') ?? '');
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('A room is reached by a WebSocket.', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as ServerSocket;
    server.accept();
    const conn: Conn = {
      send: (m) => {
        try {
          server.send(JSON.stringify(m));
        } catch {
          /* gone */
        }
      },
      close: () => {
        try {
          server.close(1000, 'bye');
        } catch {
          /* gone */
        }
      },
    };
    if (!this.core) {
      conn.send({ t: 'error', text: 'There is no room with that code (or it has closed).' });
      conn.close();
    } else {
      server.addEventListener('message', (e: MessageEvent) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(e.data)) as ClientMsg;
        } catch {
          return;
        }
        this.core?.message(conn, msg);
        this.after();
      });
      const gone = () => {
        this.core?.gone(conn);
        this.after();
      };
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  /** A new room by this code: unless one is in use by it (a game going on, or anyone in it). */
  private async init(code: string): Promise<Response> {
    if (!isCode(code)) return new Response('No such code.', { status: 400 });
    if (this.core && !(this.core.empty() && this.core.phase !== 'playing')) return new Response('In use.', { status: 409 });
    this.core = new RoomCore(code, Date.now);
    this.savedLen = 0;
    await this.persist();
    return new Response('ok');
  }

  /** After anything: the clock runs while the game does and anyone is here, and what changed is kept. */
  private after() {
    const core = this.core;
    if (!core) return;
    const run = core.phase === 'playing' && !core.empty();
    if (run && !this.timer) {
      this.timer = setInterval(() => {
        core.turn();
        if (core.dirty && Date.now() - this.lastSave >= SAVE_MS) void this.persist();
      }, TURN_MS);
    } else if (!run && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (core.dirty && (core.phase !== 'playing' || Date.now() - this.lastSave >= SAVE_MS)) void this.persist();
  }

  private async persist() {
    const core = this.core;
    if (!core) return;
    this.lastSave = Date.now();
    const { log, ...meta } = core.save();
    // (A new game in the same room starts its orders again.)
    if (log.length < this.savedLen) this.savedLen = 0;
    const put: Record<string, unknown> = { meta: { ...meta, logLen: log.length } };
    for (let k = Math.floor(this.savedLen / CHUNK); k * CHUNK < log.length; k++) put[`log:${k}`] = log.slice(k * CHUNK, (k + 1) * CHUNK);
    this.savedLen = Math.floor(log.length / CHUNK) * CHUNK;
    await this.state.storage.put(put);
    await this.state.storage.setAlarm(Date.now() + KEEP_MS);
  }

  /** Seven days after anyone last came: the room is deleted (unless someone is in it). */
  async alarm() {
    await this.ready;
    if (this.core && !this.core.empty()) {
      await this.state.storage.setAlarm(Date.now() + KEEP_MS);
      return;
    }
    await this.state.storage.deleteAll();
    this.core = null;
  }
}

/** POST /api/room/new: a code no room is using, and its room made. */
export async function newRoom(rooms: RoomNamespace): Promise<{ code: string } | null> {
  for (let i = 0; i < 8; i++) {
    const code = makeCode(Math.random);
    const r = await rooms.get(rooms.idFromName(code)).fetch(`https://room/init?code=${code}`, { method: 'POST' });
    if (r.ok) return { code };
  }
  return null;
}

/** GET /api/room/<CODE>/ws: the screen's WebSocket, to the room of that code. */
export function roomSocket(req: Request, rooms: RoomNamespace, code: string): Promise<Response> {
  return rooms.get(rooms.idFromName(code)).fetch(req);
}
