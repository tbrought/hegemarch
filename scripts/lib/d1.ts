/**
 * A stand-in for Cloudflare D1 (the Daily board's database, worker/), on Node's own SQLite: the board's
 * server is tested here as it runs there, against its own schema (worker/schema.sql).
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from '../../worker/src/index';

type Value = null | number | bigint | string | Uint8Array;

export function testDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('worker/schema.sql', 'utf8'));
  const statement = (sql: string, values: Value[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => statement(sql, v as Value[]),
    first: async <T>() => (db.prepare(sql).get(...values) ?? null) as T | null,
    all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[], meta: { changes: 0 } }),
    run: async () => ({ results: [], meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  });
  return { prepare: (sql: string) => statement(sql) };
}
