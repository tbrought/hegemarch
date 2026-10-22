/**
 * How a screen reaches its room (1.28): a WebSocket to the room's server (hegemarch.com, or the dev server),
 * which comes back by itself when the connection is lost; and, for the tests, a room in the same process.
 */

import type { Link } from './Lockstep';
import type { ClientMsg, RoomMsg } from './protocol';
import type { Conn, RoomCore } from './RoomCore';

/** The server with the rooms: the page's own (the dev server's), and hegemarch.com's from www too (the Worker's route is there). */
function roomHost(): string {
  return location.hostname === 'www.hegemarch.com' ? 'hegemarch.com' : location.host;
}

/** Where rooms are: hegemarch.com/api/room, or the dev server's. */
export function roomBase(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${roomHost()}/api/room`;
}

/** Can this page play together? Only from a server that has rooms (not a file opened from a disk, not itch.io). */
export function canPlayTogether(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return location.protocol.startsWith('http') && (h === 'hegemarch.com' || h === 'www.hegemarch.com' || h === 'localhost' || h === '127.0.0.1');
}

/** Ask the server for a new room: its code. */
export async function newRoom(): Promise<string> {
  const r = await fetch(`${location.protocol}//${roomHost()}/api/room/new`, { method: 'POST' });
  if (!r.ok) throw new Error(`The server could not make a room (${r.status}).`);
  const { code } = (await r.json()) as { code: string };
  return code;
}

/**
 * A WebSocket to a room. Every time it opens (the first time, and each time it comes back) it says hello
 * with what `hello` gives (the token, once the room has given one), and it sends what was given while it was
 * down once it is up again. It tries again after a second, then two, four, up to ten.
 */
export class WsLink implements Link {
  onMessage: ((msg: RoomMsg) => void) | null = null;
  onStatus: ((up: boolean) => void) | null = null;
  private ws: WebSocket | null = null;
  private queue: ClientMsg[] = [];
  private closed = false;
  private wait = 1000;
  private up = false;

  constructor(
    private url: string,
    private hello: () => ClientMsg,
  ) {
    this.open();
  }

  private open() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.wait = 1000;
      this.up = true;
      ws.send(JSON.stringify(this.hello()));
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
      this.onStatus?.(true);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage?.(JSON.parse(String(e.data)) as RoomMsg);
      } catch (err) {
        console.error(err);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.up) this.onStatus?.(false);
      this.up = false;
      if (this.closed) return;
      setTimeout(() => this.open(), this.wait);
      this.wait = Math.min(10_000, this.wait * 2);
    };
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    // (Orders and reports are not kept for later: the room's state says what was missed. Anything else is.)
    else if (msg.t !== 'report' && msg.t !== 'order') this.queue.push(msg);
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}

/**
 * A screen's link to a room in the same process (the tests): what one says reaches the other after `delay`
 * milliseconds of the given clock (`later`), or at once. Messages go through JSON, as over a wire.
 */
export function localLink(room: RoomCore, later?: (fn: () => void) => void): Link & { conn: Conn; drop(): void } {
  const deliver = (fn: () => void) => (later ? later(fn) : fn());
  let open = true;
  const link = {
    onMessage: null as ((msg: RoomMsg) => void) | null,
    onStatus: null as ((up: boolean) => void) | null,
    conn: null as unknown as Conn,
    send(msg: ClientMsg) {
      if (!open) return;
      const wire = JSON.stringify(msg);
      deliver(() => open && room.message(link.conn, JSON.parse(wire)));
    },
    close() {
      if (!open) return;
      open = false;
      room.gone(link.conn);
    },
    /** The connection is lost (not closed by either side). */
    drop() {
      link.close();
    },
  };
  link.conn = {
    send(msg: RoomMsg) {
      if (!open) return;
      const wire = JSON.stringify(msg);
      deliver(() => open && link.onMessage?.(JSON.parse(wire)));
    },
    // (Closed by the room after what it said last: that still arrives, as over a socket.)
    close() {
      deliver(() => (open = false));
    },
  };
  return link;
}
