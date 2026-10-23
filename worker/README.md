# The Daily board's server

The fastest crowns of each day's Daily, at hegemarch.com. A player who is crowned in a Daily can send the run to the board under three to five letters.
Before it goes up, a checker plays the run again from its orders and reads the result itself. A time on the board is one the game found, not
one a player typed in.

```
the game ──POST /api/daily/submit──▶ Worker (this folder) ──▶ D1 database (runs: pending)
                                         │
                                         └─ workflow_dispatch ──▶ GitHub Actions: scripts/verify-daily.ts
                                                                   plays each pending run again, in the version
                                                                   it was played in, and posts a verdict
the website ◀──GET /api/daily/board, /throne, /alltime── Worker ◀── verdict (runs: verified / rejected)
                                         └─ every ten minutes: each day gone by gets its Hegemarch (crowns)
```

It all runs on free plans: Cloudflare Workers Free (100,000 requests a day), D1 Free (5 GB, 5 million rows read a day), and GitHub Actions,
which is free for a public repository. A run is checked a minute or two after it is sent.

**What it keeps:** three to five letters, the house, the time, the Destiny, the version, and the run's orders (until they are no longer needed:
see `prune` in `src/index.ts`). There are no accounts, email addresses or cookies, and IP addresses are never stored.

## Setting it up (once)

You need Node.js (which you have), your Cloudflare login (hegemarch.com is on Cloudflare), and push access to github.com/tbrought/hegemarch.
Run the commands from the `worker` folder.

1. **Push the code to GitHub.** The checker is a workflow in `.github/workflows/verify-daily.yml`. GitHub can only start it once the file is
   on `main`.

2. **Log in to Cloudflare from the command line.** This opens the browser and asks you to allow it:

   ```
   cd worker
   npx wrangler login
   ```

3. **Create the database:**

   ```
   npx wrangler d1 create hegemarch-board
   ```

   It prints a `database_id` (a long id with dashes). Paste it into `wrangler.toml` in place of `PASTE-THE-DATABASE-ID-HERE`.

4. **Create the tables:**

   ```
   npx wrangler d1 execute hegemarch-board --remote --file=schema.sql
   ```

5. **Make the shared secret** that lets the checker, and nothing else, read runs and give verdicts. Make a random one:

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Give it to the Worker. Paste it when asked:

   ```
   npx wrangler secret put VERIFY_SECRET
   ```

   Then give the same value to GitHub. In the repository, go to **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → **New repository secret**: name `VERIFY_SECRET`, with the same value.
   - **Variables** tab → **New repository variable**: name `BOARD_API`, value `https://hegemarch.com/api/daily`.

6. **Let the Worker start the checker.** On GitHub, open your profile picture → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**:
   - Name: `hegemarch-board`. For Expiration, choose the longest offered, and note the date: the board stops calling the checker when the
     token expires. Runs then wait, and a new token fixes it.
   - Repository access: **Only select repositories** → `tbrought/hegemarch`.
   - Permissions → Repository permissions → **Actions: Read and write**. Nothing else is needed.

   Generate it, copy it, and give it to the Worker:

   ```
   npx wrangler secret put GITHUB_TOKEN
   ```

7. **Deploy the Worker:**

   ```
   npx wrangler deploy
   ```

   It answers at `hegemarch.com/api/daily/...` (the route is in `wrangler.toml`), alongside the website.

8. **Check that it answers.** Open `https://hegemarch.com/api/daily/board?day=2026-10-17` (any day). It should show
   `{"day":"2026-10-17","runs":[],"count":0}`. And `https://hegemarch.com/api/daily/throne` should show `"today":[]` and `"past":[]`.
   `https://hegemarch.com/api/daily/alltime` shows the all-time board (1.28): the 25 fastest crowns ever, each player's best.

9. **Deploy the game and the website (`release/`) as usual.** From 1.25 on, a crowned Daily offers POST TO THE BOARD on its results.

10. **Optional: a rate limit.** In the Cloudflare dashboard, open hegemarch.com → **Security → WAF → Rate limiting rules → Create rule**.
    Match: URI Path equals `/api/daily/submit`. Rate: 10 requests per 10 seconds, counted by IP. Action: Block for 10 seconds. The free
    plan allows one such rule. Cloudflare counts requests at its edge and keeps nothing on the board.

## Taking a name down

The names a run may go up under are checked by the Worker (`nameProblem` in `../src/meta/board.ts`: its two lists, `SPELLED_ANYWHERE`
and `WHOLE`). If you change the lists, deploy the Worker again (`npx wrangler deploy`). If a name gets through that should not stand,
blank it to `???` (it keeps its place; it counts as no one's reign). Put in its day and its letters:

```
npx wrangler d1 execute hegemarch-board --remote --command "UPDATE runs SET name = '???' WHERE day = '2026-10-18' AND name = 'XXXXX'"
npx wrangler d1 execute hegemarch-board --remote --command "UPDATE crowns SET name = '???' WHERE day = '2026-10-18' AND name = 'XXXXX'"
```

(The second matters for a day more than four days gone: the last four are crowned again from their runs every ten minutes.)

The all-time board (1.28) is worked out again at 04:00 UTC each day, and shows the blanked name from then. To have it show at once:

```
npx wrangler d1 execute hegemarch-board --remote --command "DELETE FROM meta WHERE key = 'alltime'"
```

(The next look at the board works it out again from the runs.)

## The all-time board

The leaderboard page (`hegemarch.com/leaderboard/`, `../site/leaderboard/`): the 25 fastest Daily crowns ever, each player's best by their letters (a run that stands is kept for good: `prune` drops old
orders, never a crown). It is worked out when a run comes to stand and once a day, and kept in the `meta` table as one row, so
a look at the page reads one row, not every crown there has ever been. Nothing to set up: the first look after the Worker is
deployed works it out from the runs already there.

## With every release

**If `schema.sql` has changed, run step 4 again** (it only adds what is missing; nothing is lost). 1.25.2 added the `crowns` table.

**Push the release commit when you deploy it (or before).** The checker plays a run in the version it was played in. It finds that
version's code by the version in `package.json` on GitHub. A run from a version that isn't on GitHub yet waits: it is tried again every
half hour, for up to three days.

## Games played together (1.28)

The same Worker runs the rooms of games played together (`src/room.ts`, docs/MULTIPLAYER.md): a Durable Object for each room, named by
its five-letter code, at `hegemarch.com/api/room/...`. A room holds its lobby and the clock of its game, passes every player's orders to
every player, and keeps them (a player whose connection drops comes back and catches up). Every player's browser runs the game itself:
the room never does, so it stays small and cheap.

**Setting it up** is one deploy, from the `worker` folder, after the release that brings it:

```
npx wrangler deploy
```

`wrangler.toml` already has the route (`hegemarch.com/api/room/*`), the binding (`ROOMS`) and the migration that creates the Durable
Object class (`rooms-1`, SQLite-backed, which the free plan allows). Nothing else to create, no secret.

**What it costs:** a room uses Durable Object time only while its game is played: about 450 GB-seconds an hour of play. The free plan
allows 13,000 GB-seconds and 100,000 requests a day (WebSocket messages count 20 to one), so about 28 hours of games a day. If games
together outgrow that, the $5/month Workers plan pays for the rest at a fraction of a cent per game-hour. A room no one has used for
seven days is deleted.

**What it keeps:** each player's name (three to five letters), house and a random token (to come back with), the game's settings and its
orders, for seven days. No accounts, no email, no IP addresses.

**Locally**, the dev server (`npx vite`) runs the same rooms itself (`../scripts/lib/roomhost.ts`): two browser tabs on
`localhost:5173` can play together with no Worker at all.

## Watching it work

- GitHub → **Actions** → *Check the Daily board*: one entry per call, with a line for each run checked (stands, or why not).
- `npx wrangler tail` shows the Worker's requests live.
- `npx wrangler d1 execute hegemarch-board --remote --command "SELECT day, name, heir, time, status, reason FROM runs ORDER BY created DESC LIMIT 20"`
  lists the latest runs.
- To take a run off the board: `... --command "UPDATE runs SET status = 'rejected', reason = 'removed' WHERE id = '<id>'"`.

## The parts

| File | What it is |
| --- | --- |
| `src/index.ts` | The Worker: submit, status, board, throne, the all-time board, and the checker's pending and verdict. |
| `schema.sql` | The database: `runs`, `crowns` (each day's Hegemarch, kept for good) and `meta` (when the checker was last called). Safe to run again: it only adds what is missing. |
| `wrangler.toml` | Its name, route, database, the cron trigger (every ten minutes: a waiting run is called for again, and once a day the board is pruned). |
| `../scripts/verify-daily.ts` | The checker (GitHub Actions). |
| `../src/game/replay.ts` | How a run is played again, and what a list of orders may hold. |
| `../src/meta/board.ts` | What the game, the website and the Worker agree on. |
| `src/room.ts` | A room of a game played together: the Durable Object around `../src/net/RoomCore.ts` (the same room the dev server and the tests run). |
| `../scripts/board-e2e.ts` | The whole board end to end on this machine: a bot's crowned Daily is sent, checked and shown, and two runs that are not what they claim are turned down. |
