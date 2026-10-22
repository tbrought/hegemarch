/**
 * Rooms of games played together on the dev server (1.28): the same room as hegemarch.com's
 * (src/net/RoomCore.ts), at the same addresses (POST /api/room/new, /api/room/<CODE>/ws), so that the game
 * runs the same against either. A Vite plugin (vite.config.ts) puts it on `npx vite`; the browser suites
 * play together through it.
 *
 * WebSockets here are the few lines a room needs (RFC 6455: the handshake, text frames, ping and close),
 * written out rather than taken from a package: the game has none it runs on.
 */

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { isCode, makeCode, TURN_MS, type ClientMsg } from '../../src/net/protocol';
import { RoomCore, type Conn } from '../../src/net/RoomCore';

interface Socket {
  send(text: string): void;
  close(): void;
}

/** Accept a WebSocket on an upgraded request: each text message to `onText`, and `onClose` once when it goes. */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex, onText: (text: string) => void, onClose: () => void): Socket | null {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string') {
    socket.destroy();
    return null;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  (socket as unknown as { setNoDelay?(on: boolean): void }).setNoDelay?.(true);
  let buf = Buffer.alloc(0);
  let parts: Buffer[] = [];
  let closed = false;
  const frame = (op: number, payload: Buffer) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    if (n >= 126 && n < 65536) {
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(n, 2);
    } else if (n >= 65536) {
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(n), 2);
    }
    if (!socket.destroyed) socket.write(Buffer.concat([head, payload]));
  };
  const end = () => {
    if (closed) return;
    closed = true;
    onClose();
  };
  socket.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const maskAt = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskAt + (i & 3)];
      buf = buf.subarray(off + len);
      if (op === 0x8) {
        frame(0x8, Buffer.alloc(0));
        socket.end();
        end();
        return;
      }
      if (op === 0x9) frame(0xa, payload);
      else if (op === 0x0 || op === 0x1 || op === 0x2) {
        parts.push(payload);
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          onText(text);
        }
      }
    }
  });
  socket.on('close', end);
  socket.on('end', end);
  socket.on('error', end);
  return {
    send: (text) => frame(0x1, Buffer.from(text, 'utf8')),
    close: () => {
      frame(0x8, Buffer.alloc(0));
      socket.end();
    },
  };
}

/** The rooms of the dev server: made by code, their clocks run while their games do, let go an hour after everyone has gone. */
export class RoomHost {
  rooms = new Map<string, { room: RoomCore; timer: ReturnType<typeof setInterval> | null; emptySince: number }>();

  newRoom(): string {
    let code = makeCode(Math.random);
    while (this.rooms.has(code)) code = makeCode(Math.random);
    this.rooms.set(code, { room: new RoomCore(code, Date.now), timer: null, emptySince: Date.now() });
    return code;
  }

  /** An HTTP request under /api/room: true if it was this host's to answer. */
  http(req: IncomingMessage, res: ServerResponse): boolean {
    const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '');
    if (path === '/api/room/new' && req.method === 'POST') {
      this.sweep();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: this.newRoom() }));
      return true;
    }
    return false;
  }

  /** An upgrade to a WebSocket: true if it was this host's (a room's address). */
  upgrade(req: IncomingMessage, socket: Duplex): boolean {
    const m = /^\/api\/room\/([A-Z2-9]{5})\/ws$/.exec((req.url ?? '').split('?')[0]);
    if (!m) return false;
    const code = m[1];
    const entry = isCode(code) ? this.rooms.get(code) : undefined;
    let conn: Conn | null = null;
    const ws = acceptWebSocket(
      req,
      socket,
      (text) => {
        if (!entry || !conn) return;
        let msg: ClientMsg;
        try {
          msg = JSON.parse(text) as ClientMsg;
        } catch {
          return;
        }
        entry.room.message(conn, msg);
        this.after(code);
      },
      () => {
        if (entry && conn) {
          entry.room.gone(conn);
          this.after(code);
        }
      },
    );
    if (!ws) return true;
    conn = { send: (msg) => ws.send(JSON.stringify(msg)), close: () => ws.close() };
    if (!entry) {
      conn.send({ t: 'error', text: 'There is no room with that code (or it has closed).' });
      conn.close();
    }
    return true;
  }

  /** The room's clock runs while its game does and anyone is in it. */
  private after(code: string) {
    const e = this.rooms.get(code);
    if (!e) return;
    const run = e.room.phase === 'playing' && !e.room.empty();
    if (run && !e.timer) e.timer = setInterval(() => e.room.turn(), TURN_MS);
    else if (!run && e.timer) {
      clearInterval(e.timer);
      e.timer = null;
    }
    if (e.room.empty()) e.emptySince ||= Date.now();
    else e.emptySince = 0;
  }

  private sweep() {
    for (const [code, e] of this.rooms) {
      if (e.emptySince && Date.now() - e.emptySince > 60 * 60_000) {
        if (e.timer) clearInterval(e.timer);
        this.rooms.delete(code);
      }
    }
  }
}

/** The Vite plugin: the dev server answers /api/room as hegemarch.com does. */
export function roomsPlugin() {
  const host = new RoomHost();
  return {
    name: 'hegemarch-rooms',
    configureServer(server: {
      middlewares: { use(fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void };
      httpServer: { on(ev: 'upgrade', fn: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): void } | null;
    }) {
      server.middlewares.use((req, res, next) => {
        if (!host.http(req, res)) next();
      });
      server.httpServer?.on('upgrade', (req, socket) => {
        host.upgrade(req, socket);
      });
    },
  };
}
