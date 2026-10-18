-- The Daily board's database (Cloudflare D1): the runs sent to it, and when the checker was last called.
--   npx wrangler d1 execute hegemarch-board --remote --file=worker/schema.sql
-- It keeps three letters, a house, a time and a run's orders: no account, no address, no IP.

CREATE TABLE IF NOT EXISTS runs (
  -- The first 16 hex digits of the SHA-256 of the run (its day, house and orders): the same run sent twice is one.
  id TEXT PRIMARY KEY,
  -- The Daily's day, as its seed knows it: "2026-10-17" (UTC, unpadded).
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  heir TEXT NOT NULL,
  -- The version of the game the run began in: the checker plays it again in that version.
  version TEXT NOT NULL,
  -- The crown's time as the player's game gave it, and as the checker found it (seconds of game time).
  claimed REAL NOT NULL,
  time REAL,
  victory TEXT NOT NULL,
  -- The run's orders (gzip and base64, or JSON: enc), kept while they may be needed.
  orders TEXT,
  enc TEXT NOT NULL,
  -- 'pending' until the checker has played it again, then 'verified' (it stands) or 'rejected' (reason).
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created INTEGER NOT NULL,
  checked INTEGER
);
CREATE INDEX IF NOT EXISTS runs_board ON runs (day, status, time);
CREATE INDEX IF NOT EXISTS runs_status ON runs (status, created);

-- Each day's Hegemarch (1.25.2): the fastest crown of a day gone by, kept when its runs are long gone. Set
-- again every ten minutes for the last few days, while a late run may still change it (index.ts, crownDays).
CREATE TABLE IF NOT EXISTS crowns (
  day TEXT PRIMARY KEY,
  -- The day as a number (days since 1 January 1970), to put the days in order.
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  heir TEXT NOT NULL,
  time REAL NOT NULL,
  victory TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crowns_ord ON crowns (ord);
CREATE INDEX IF NOT EXISTS crowns_name ON crowns (name, ord);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- When the checker was last called (ms): it is called at most once a minute.
INSERT OR IGNORE INTO meta (key, value) VALUES ('dispatched', '0');
