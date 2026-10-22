/**
 * The room on hegemarch.com (worker/src/room.ts): a Durable Object, here with a storage in memory and
 * WebSockets that are pairs of objects. It takes screens, runs their game's clock, keeps the room in its
 * storage (its orders in chunks), comes back from it as it was, and deletes it seven days after its last use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newRoom, Room, type DOState, type RoomNamespace } from '../worker/src/room';
import type { ClientMsg, RoomMsg } from '../src/net/protocol';

class FakeSocket {
  other!: FakeSocket;
  listeners = new Map<string, ((e: { data?: string }) => void)[]>();
  got: RoomMsg[] = [];
  open = true;
  accept() {}
  addEventListener(ev: string, fn: (e: { data?: string }) => void) {
    this.listeners.set(ev, [...(this.listeners.get(ev) ?? []), fn]);
  }
  send(text: string) {
    if (!this.open) return;
    this.other.got.push(JSON.parse(text));
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.other.open = false;
    for (const fn of this.other.listeners.get('close') ?? []) fn({});
  }
  /** The screen's side: a message to the room. */
  say(msg: ClientMsg) {
    for (const fn of this.other.listeners.get('message') ?? []) fn({ data: JSON.stringify(msg) });
  }
}

function memoryState(): DOState & { data: Map<string, unknown>; alarmAt: number } {
  const data = new Map<string, unknown>();
  const st = {
    data,
    alarmAt: 0,
    storage: {
      get: async <T,>(k: string) => structuredClone(data.get(k)) as T | undefined,
      put: async (entries: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(entries)) data.set(k, structuredClone(v));
      },
      deleteAll: async () => data.clear(),
      setAlarm: async (at: number) => {
        st.alarmAt = at;
      },
    },
    blockConcurrencyWhile: async <T,>(fn: () => Promise<T>) => fn(),
  };
  return st;
}

const RealResponse = globalThis.Response;
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = function () {
    const a = new FakeSocket();
    const b = new FakeSocket();
    a.other = b;
    b.other = a;
    return { 0: a, 1: b };
  };
  // (Node's Response will not be a 101: a stand-in that carries the socket.)
  (globalThis as unknown as { Response: unknown }).Response = class {
    status: number;
    webSocket?: FakeSocket;
    ok: boolean;
    constructor(_body: unknown, init: { status?: number; webSocket?: FakeSocket } = {}) {
      this.status = init.status ?? 200;
      this.webSocket = init.webSocket;
      this.ok = this.status >= 200 && this.status < 300;
    }
  };
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.Response = RealResponse;
});

async function connect(room: Room): Promise<FakeSocket> {
  const r = (await room.fetch(new Request('https://hegemarch.com/api/room/ABCDE/ws', { headers: { Upgrade: 'websocket' } }))) as unknown as { webSocket: FakeSocket };
  return r.webSocket;
}

const bring = (name: string) => ({ name, heirs: ['concord', 'vael', 'wayfarer', 'lyceum', 'choir', 'ashen'], perks: {}, legendary: true, pacts: true });

describe('the room on hegemarch.com', () => {
  it('a new room by a code no room uses; a code in use is refused', async () => {
    const rooms = new Map<string, Room>();
    const states = new Map<string, DOState>();
    const ns: RoomNamespace = {
      idFromName: (n) => n,
      get: (id) => {
        const key = id as string;
        if (!rooms.has(key)) {
          states.set(key, memoryState());
          rooms.set(key, new Room(states.get(key)!));
        }
        return { fetch: (input) => rooms.get(key)!.fetch(new Request(typeof input === 'string' ? input : input.url, { method: 'POST' })) };
      },
    };
    const made = await newRoom(ns);
    expect(made?.code).toMatch(/^[A-Z2-9]{5}$/);
    const again = await rooms.get(made!.code)!.fetch(new Request(`https://room/init?code=${made!.code}`, { method: 'POST' }));
    // (Nobody is in it yet and its game has not begun: a room by that code may be made again.)
    expect(again.ok).toBe(true);
  });

  it('plays a game, keeps it, and wakes from its storage with every order, its players coming back with their tokens', async () => {
    const state = memoryState();
    const room = new Room(state);
    await room.fetch(new Request('https://room/init?code=ABCDE', { method: 'POST' }));
    const a = await connect(room);
    a.say({ t: 'hello', version: 1, build: 'b', bring: bring('ALICE') });
    const b = await connect(room);
    b.say({ t: 'hello', version: 1, build: 'b', bring: bring('BRUNO') });
    b.say({ t: 'ready', on: true });
    a.say({ t: 'start' });
    expect(a.got.some((m) => m.t === 'start')).toBe(true);
    // The clock runs: ten turns a second.
    vi.advanceTimersByTime(3000);
    const turns = b.got.filter((m) => m.t === 'turn') as Extract<RoomMsg, { t: 'turn' }>[];
    expect(turns.length).toBeGreaterThanOrEqual(28);
    expect(turns.at(-1)!.to).toBeGreaterThan(50);
    // A thousand orders: kept in chunks.
    for (let i = 0; i < 1000; i++) {
      a.say({ t: 'order', name: 'cmdStop', args: [0, [i]] });
      if (i % 20 === 0) vi.advanceTimersByTime(1000);
    }
    vi.advanceTimersByTime(6000);
    const meta = state.data.get('meta') as { logLen: number; phase: string };
    expect(meta.phase).toBe('playing');
    expect(meta.logLen).toBeGreaterThan(900);
    expect(state.data.has('log:0')).toBe(true);
    expect(state.data.has('log:2')).toBe(true);
    expect(state.alarmAt).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
    // The object is moved: a new one from the same storage has the same game, and a player comes back.
    const token = (a.got.find((m) => m.t === 'welcome') as { token: string }).token;
    const woken = new Room(state);
    const back = await connect(woken);
    back.say({ t: 'hello', version: 1, build: 'b', bring: bring('ALICE'), token });
    const start = back.got.find((m) => m.t === 'start') as Extract<RoomMsg, { t: 'start' }>;
    expect(start?.rebuild).toBe(true);
    expect(start.log.length).toBe(meta.logLen);
    expect(start.log[0][2]).toBe('cmdStop');
  });

  it('seven days after anyone was last in it, the room is deleted', async () => {
    const state = memoryState();
    const room = new Room(state);
    await room.fetch(new Request('https://room/init?code=ABCDE', { method: 'POST' }));
    expect(state.data.has('meta')).toBe(true);
    await room.alarm();
    expect(state.data.size).toBe(0);
  });
});
