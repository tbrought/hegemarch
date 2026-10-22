# Multiplayer

Status: **built in 1.28** (co-op and versus), as decided in §10. This page was the design; the section
below says how the build came out, and where it differs from the draft that follows it.

## As built (1.28)

**Where the code is.**

| Part | Where |
| --- | --- |
| The simulation for several players: seats, teams, team Destinies, shared sight, the rekindle, gifts, surrender, the AI taking a house | `src/game` (`GameConfig.seats`, `Game.teamOf/allied/seated/mine/ours`, `commands/together.ts`, `systems/victory.ts`, `systems/visibility.ts`, `conquest.ts`) |
| What screens and rooms say | `src/net/protocol.ts` |
| The room: lobby, clock, orders, pauses, players gone and back, hashes | `src/net/RoomCore.ts` (the same code on hegemarch.com, on the dev server and in the tests) |
| A screen's game in step with the room | `src/net/Lockstep.ts`, `src/net/hash.ts`, `src/net/links.ts` |
| hegemarch.com's rooms | `worker/src/room.ts` (a Durable Object per room), `worker/wrangler.toml` |
| The dev server's rooms | `scripts/lib/roomhost.ts` (a Vite plugin) |
| On screen | `src/app/screens/together.ts` (host, join, lobby), `src/app/together.ts`, `src/ui/hud/together.ts`, `src/ui/modals/together.ts`, `run.ts startNetRun` |
| Tests | `tests/net.test.ts` (a room and 2 to 4 screens in one process, with a slow and jittery wire), `tests/roomdo.test.ts`, `scripts/together.mjs` (two browsers, in `npm run verify`) |

**A game alone is exactly as it was.** Every rule for several players keys on the seats, which a game
alone does not have; the golden traces (26 runs, whole state every 30 s) and the AI simulation came out the
same to the byte.

**Where the build differs from the draft below.**

- **No input delay to tune.** The room stamps an order with the tick the game may run to when the order
  arrives; no screen has run past it, so every screen carries it out then. An order takes a turn (a tenth
  of a second) and a round trip to come back.
- **Out of step: every screen plays the game again from its orders**, not a snapshot from a majority. The
  orders make the one true game, so a screen changed by anything but an order is put right, with no
  question of who was right. If it happens a third time, the room ends the game and says why.
- **The rekindle.** A fallen ally's ships are lost with their Hearth, as any fallen house's are. Taken back
  (or kindled again) by an ally, the world is their Hearth again, with their Ark, two Guardians and Embers
  to begin with; their Boons were never lost. Meanwhile they see through their allies' eyes.
- **Pings** are Alt and a click; **chat** is Enter (Tab: your team or everyone, in versus).
- **The stats** kept in a browser: co-op and versus played and won, and the record against each name played
  in versus (the Together page).
- **Not built** (later, with the rest of §2.3 and §6): curated fair sectors, open rooms and quick match,
  spectating and replays, Shared Command, Ages together, ranked seasons.
- **Names** in a room are checked as the Daily board's are (no slurs); the chat is not filtered (rooms are
  private, among friends), and a click on a player's name in the game mutes their chat on that screen.

---

The draft design follows, as it was approved.

## TL;DR

- **Two modes.** **Co-op** (2 to 4 players as allied houses against AI houses) and **Versus** (1v1,
  2v2, or a 3–4 player free-for-all, with AI houses optional). Build co-op first: it is friendlier,
  forgives imbalance, and needs the same technology as versus, which follows right after.
- **Deterministic lockstep, clocked by a small server.** Every player runs the whole game; only the
  orders travel. Hegemarch is already built for this. The simulation is seeded and the same in every
  browser (`dmath.ts`), it is driven by recorded orders, and it can replay a whole run from them
  (`replay.ts`, used by the Daily board). The server is one Cloudflare Durable Object per game room,
  next to the Worker that already runs the Daily board.
- **No ranked ladder at launch.** Ship private rooms (a code or a link to send a friend) and plain
  stats. A rating (Glicko-2, not Elo) can come later as seasons, once there are enough players at
  once to match, and once the sectors and the luck of the draft are made fair enough to rate. The
  "no account" promise can hold even then: a key kept in the browser, no email.
- **The biggest rule change:** in multiplayer the game cannot stop for one player's decision. Boon
  choices and event prompts run while the clock does, and pausing has rules (§3).
- **The biggest code change:** the simulation assumes one human (`g.playerId`, `f.isPlayer`). That
  becomes a set of humans with teams, plus a "viewer" that only the interface knows about (§4.4).

---

## 1. What we are building on

**Already there, and exactly what lockstep needs:**

| Piece | Where | Why it matters |
| --- | --- | --- |
| Seeded, fixed-tick simulation (20 ticks a second) | `Game.step`, `rng.ts`, `TICK` | Every machine computes the same game from the same orders |
| Cross-browser deterministic math | `dmath.ts` (fdlibm sin/cos/atan2/hypot), a test that bans the others | Chrome, Firefox and Safari players stay in sync. The Daily board already relies on this |
| Orders as data: `[tick, name, args]`, 29 order types | `ORDER_NAMES` in `Game.ts` | These are the messages to send. Nothing else needs to travel |
| One seam that sees every order | The `ORDER_NAMES` prototype wrapper in `Game.ts` | Can route orders to the network without touching the 31 interface call sites |
| Replay from orders, with validation | `replay.ts`, `badOrders` | Reconnect = replay to now; results can be checked by replaying (as the Daily checker does) |
| Bots that give orders the way a player does | `scripts/lib/bot.ts` | Thousands of automated multiplayer games in tests |
| One hostility rule for all of combat | `Game.hostile(a, b)` | Alliances plug in at a single point |
| AI that can run any house | `ai/ai.ts` | Fills empty seats, takes over a disconnected player |
| A Worker on hegemarch.com, D1, GitHub Actions checker | `worker/`, `verify-daily.ts` | Hosting, storage and result checking exist |

**What assumes one human, and must change** (88 references to `playerId`, `g.player` or `isPlayer` in
`src/game`, in these groups):

- **Perks and Hall unlocks** apply to `playerId` only (`modSources.ts`, `conquest.ts` Second Breath).
- **Drafts and prompts:** only the player waits to choose; AI houses choose at once (`boons.ts`,
  `events.ts`, `choices.ts`).
- **Notifications** drop everything not addressed to the player (`Game.notify`), and many are worded
  from the player's side ("Your Ark is rising…" when `f.isPlayer`). With two humans, both would read
  "your".
- **Interface state the simulation reads:** `g.ui` holds some state that changes play
  (`offersDealt`, `legendarySeen`, `goal:*`, `tutBoon`). It must move into each house's own state.
- **Exploration and discovery** are worked out for `g.player` only (`discovery.ts`).
- **The outcome** is "the player won or not" (`declareWinner`, `playerWon`).
- **The AI** weighs the player's worlds a little higher (`ai.ts`), which becomes "humans'".
- **Pausing:** the game halts while a decision window is open (`Session.halted`). Fine alone,
  impossible together.
- **Ages:** the move from the cradle to the stars builds a new game (`toStars`). This is doable in
  lockstep, but it is the trickiest transition, so Ages multiplayer comes later.

---

## 2. The modes

### 2.1 Co-op: Allied Houses (build first)

2 to 4 players, each leading their own house, on one team against the AI houses. A medium sector has
4 houses and a large one 6; seats not taken by players are AI rivals.

- **Allies are friends in every rule.** Their ships don't fight, and their worlds don't shoot each
  other's ships. Ships may pass through and wait at an ally's worlds. You cannot kindle a world your
  ally holds. (This is one change to `hostile()` plus the kindle check.)
- **Shared sight.** You see what your allies see: their explored map and their scouts' reach.
- **Send Embers.** A new order, *Gift*, sends Embers to an ally (free in co-op).
- **Team Destinies.** The team wins when any member fulfils a Destiny, counted for the team:
  - Conquest: every Hearth outside the team is out.
  - Domination: the team's worlds together.
  - Relics: the team's relics together.
  - Ascension (a Starfire Gate) or the Hollow's killing blow: any member's.
  - Treasury: the team's Embers together, against a higher bar.

  Thresholds to be tuned in play.
- **A fallen ally can be rekindled.** When your Hearth falls you're not out. Your surviving ships
  stay yours, but you cannot build. If an ally retakes your old Hearth world, it becomes your Hearth
  again (level 1) and you're back in the run. This keeps a friend playing instead of watching, gives
  the team a real rescue choice, and is visible on the map. Proposed as a mechanic; confirm before it
  is built.
- **The team loses** when every human Hearth is out, or an AI house fulfils a Destiny first.
- **Difficulty:** the lobby picks the AI difficulty as now. An option, *The rivals unite*, makes the
  AI houses allies of each other, for a harder run.
- **Roguelite progression:** each player drafts their own Boons and earns their own Legacy. Each
  player brings their own Hall of Heirs perks and unlocked houses. Co-op is your run, shared.
- **Pausing:** anyone may pause and anyone may resume (with a 3-second count-in). The host sets the
  speed, which everyone sees.

### 2.2 Versus

1v1, 2v2, or a free-for-all of 3–4 players. AI houses can fill the other seats of a large sector.

- **The Hall of Heirs does not apply, in any versus game, casual or rated.** Everyone plays the
  Daily's rules:
  - **No perks.** Old Coin, Lorekeepers, Veteran Escort, Archivist, Fortunate Stars, Ancestral Walls
    and Second Breath are all off. They're flat advantages earned by hours played (more Embers, Lore,
    hull, walls and rerolls, rarer Boons), and over a 40-minute game they compound. A friend invited
    on their first day would face a maxed Hall and lose to the numbers, not the play, and every loss
    would leave "was that fair?" behind.
  - **The same Boons for everyone:** Pacts and Legendaries (with the Legendary promise) for every
    player, whatever they've unlocked.
  - **All six houses for everyone.** Houses are balanced against one another, but a veteran
    choosing from six against a newcomer's three could counter-pick.
- **The Hall still gains from versus.** A versus game pays Legacy, win or lose, which is spent in the
  Hall for single-player and co-op. Versus feeds your progression, but progression never decides a
  versus game.
- **For friends of uneven skill:** an explicit handicap per seat in private rooms (+10%, +20% or
  +30% Embers), shown in the lobby and on the results screen. Unlike hidden perks, it's out in the
  open and both players agreed to it. It's never allowed in rated play.
- **AI seats** in versus play at the lobby's difficulty, the same for every human.
- **Destinies are a race.** Everyone sees the same Destinies and everyone's progress toward them, as
  the countdown banners already show. This is where Hegemarch differs from AoE2: you can lose to a
  Gate you didn't scout, a hoard you didn't raid, or a Starfall you didn't defuse. Teams win as in
  co-op.
- **Fair sectors.** Sectors are generated, so starting positions can be uneven. For casual play,
  accept it, as AoE2 random maps do. For anything rated, use a curated list of seeds whose Hearths
  score close on a fairness measure: worlds within reach, distance to rivals, chokepoints. Generating
  and scoring thousands of seeds is a script, not a new map generator.
- **The same luck (optional; on for rated play).** Each human's Boon offers come from a random stream
  seeded the same for every seat. Player A's third offer is the same as player B's third offer, and
  only the choices differ.
- **Pausing:** 3 pauses per player per game, up to 60 seconds each. The player who paused may resume
  at any time; anyone may resume once the 60 seconds are up (3-second count-in). The lobby fixes the
  speed.
- **Ending a game:** surrender (a team vote in 2v2), or the last house standing. An AI house that
  wins means no human wins.
- **Ember gifts in 2v2** cost 20% in transit, so one player can't simply bankroll the other.

### 2.3 Later (not in the first release)

- **Shared Command:** two players run one house, as in AoE2's co-op. Simple for the simulation, and
  good for teaching a friend.
- **Ages together:** co-op and versus from the cradle.
- **Daily Duo:** a co-op Daily with its own board.
- **Spectating and replays:** every game is its orders, so any game can be watched again. That needs
  a viewer screen.

---

## 3. Rules that change in multiplayer

| Topic | Single-player now | Multiplayer |
| --- | --- | --- |
| Time | Stops for every decision window | Never stops for one player's decision. Drafts wait behind "! DECISION" (as they can already, with LATER), and so do event prompts |
| Pause | Any time, as long as you like | Co-op: anyone, unlimited. Versus: 3 × 60 s each (§2) |
| Speed | 0.5× to 3×, any time | Set in the lobby. Co-op host may change it; versus is fixed |
| A hidden tab | Pauses the game | The game goes on. On return, your game catches up in a few seconds |
| Saving | Autosave, CONTINUE | The room keeps the orders; a room can be resumed by the same players for 7 days |
| Leaving | Abandon | Surrender, or leave (the AI takes your house) |

---

## 4. How it works

### 4.1 The model: lockstep with a server clock

Three ways to network an RTS:

1. **Server-authoritative simulation** (the server runs the game). Workers have tight CPU limits, and
   hundreds of ships in battle would not fit. Ruled out.
2. **Peer-to-peer lockstep** (WebRTC between browsers). There's no server cost, but some players need
   a relay (TURN) to connect, someone has to host, and when the host leaves the game breaks.
3. **Lockstep with a relay that keeps the clock.** Recommended. Every browser runs the game; a small
   server collects orders, stamps each with the tick it will be carried out on, and sends each turn's
   orders to everyone. StarCraft II and AoE2 DE work broadly this way.

Why the third:
- No one hosts.
- A slow or hidden tab doesn't freeze everyone else.
- Orders can't be faked for another house: the server knows who sent them.
- Reconnecting is easy: the server has the whole log.
- It reuses Cloudflare, which the project already runs.

### 4.2 The turn loop

- A **turn** is 100 ms of real time: 2 ticks at 1×, 4 at 2×.
- When you give an order, your client shows it at once (the selection, the path, the click sound),
  and sends it to the room.
- The room stamps the order **turn N + D**, where D is the *input delay*: 2 to 5 turns (200–500 ms),
  sized to the slowest connection in the room, re-measured and announced. At the end of every turn,
  the room sends that turn's orders to everyone (often none).
- Every client runs a turn only once it has that turn's bundle. All orders of a turn are applied in
  one fixed order: by seat, then by send order. So every machine does the same thing on the same
  tick.
- **Behind** (a slow machine, a tab that was hidden): run several ticks per frame until caught up.
- **Ahead** (the network hiccupped): wait. Up to about half a second is hidden by drawing between
  ticks, as now.
- **Pacing:** once a second each client reports its tick and visibility. If a visible client stays
  far behind, the room slows the clock for everyone and says why ("Slowed for Mira").

Message volume is small. Clients send only orders plus one report a second; the room sends ten small
bundles a second.

### 4.3 The seam

In multiplayer, the `ORDER_NAMES` wrapper in `Game.ts` doesn't carry out an order: it sends it. When
the stamped order comes back in a bundle, the client carries it out exactly as `replay.ts` does now.
The interface keeps calling `g.cmdMove(...)` as before. The same seam could also drive a local
two-tab version over `BroadcastChannel`, for development and testing with no server.

### 4.4 Changes to the simulation (the bulk of the work)

1. **Many humans.**
   - `g.humans` (a set of house ids) replaces `playerId` in the rules.
   - `f.isPlayer` stays, meaning "a human leads this house".
   - Perks, drafts that wait, events and goals all key on the house, not on "the player".
2. **A viewer, outside the simulation.** "Whose eyes" (camera, fog, notifications, the HUD) belongs
   to the client. `g.player` remains only as an interface convenience, never read by the rules.
3. **Teams.**
   - `f.team` on each house, with `hostile(a, b)` false within a team.
   - Kindle and capture checks respect allies.
   - Shared exploration for teams.
   - Team Destinies in `victory.ts` and `conquest.ts`.
4. **State out of `g.ui`.** Anything the rules read moves into the house's own state: the Legendary
   promise counters, goals claimed and the tutorial flags. A test fails if the simulation reads
   `g.ui`.
5. **Notifications as data.**
   - `notify` records who did what to whom, and the interface words it for the viewer: "Your Ark is
     rising" for you, "The Vael are building an Ark" for your ally.
   - About 30 call sites change.
   - It also fixes a latent oddity: the player's own notices are built into the game state as text.
6. **Orders that arrive late are harmless.** With 200–500 ms between click and execution, an order
   may name a ship that has just died, or a world that just changed hands. Every command must quietly
   do nothing in that case, never throw. They mostly do already, since none throws; a fuzz test will
   prove it.
7. **Random streams per house** for drafts and events, so one player opening a draft doesn't shift
   another's luck, and "the same luck" (§2.2) is possible.

### 4.5 Desyncs: detect, recover, learn

- **Detect.** Every second each client sends a hash of the game: units, worlds, Embers, Lore and the
  random streams. The room compares them.
- **Recover.**
  - With three or more players, the minority reloads from a majority client's save: `save.ts` sends a
    snapshot, then the client replays to now.
  - In a two-player game nobody can tell who is right. Co-op resyncs to the host's game. Versus ends
    the game with no result.
- **Learn.** On a desync the room keeps the orders log and the hashes. A script replays the log in
  Node and in each browser engine, finds the first tick where they differ, and prints what differed.

This should be rare, since the Daily board already proves cross-browser determinism every day, but
it must never be silent.

### 4.6 The server: a game room

- **One Durable Object per room**, beside the Daily Worker on hegemarch.com/api. The room holds the
  lobby, the seats, the turn clock, the orders log and the pause and disconnect rules.
- **Rooms are joined by a short code or a link:** hegemarch.com/play/#join=K7QX, the same way
  challenge links work today.
- **Privacy keeps the board's promise:** no account, no email, no cookie, and no IP address stored.
  A room keeps its orders for 7 days (for resuming and replays), then deletes them.
- **Cost** (Cloudflare's current list prices). The free plan allows 100,000 requests and 13,000
  GB-seconds of room time a day, with WebSocket messages counted 20 to 1. A room is about 450
  GB-seconds an hour of play, so the free plan covers roughly 28 hours of games a day. Past that, on
  the $5/month Workers plan, extra time costs well under a cent per game-hour. Messages are not the
  limit: a 4-player hour is about 1,000 billed requests.
- **Versions:**
  - Everyone in a room must run the same build. The lobby compares a hash of the simulation code and
    asks out-of-date players to reload.
  - The offline download (the single HTML file) and the itch.io build show multiplayer as needing
    hegemarch.com.

### 4.7 Connections

- **Lost for less than 60 s:** a banner shows "Mira lost connection". The game goes on; their ships
  keep their last orders.
- **After 60 s:** the AI takes the house, as an order stamped by the room, so every client switches
  at the same tick.
- **1v1 only:** after 2 minutes the remaining player can choose to keep waiting, let the AI play, or
  take the win.
- **Rejoin:**
  1. The client downloads the orders log and replays to now, with a progress bar. A 40-minute game
     replays in about 8 seconds today.
  2. Then the AI hands the house back.

---

## 5. Interface

- **Title screen:** PLAY TOGETHER, which offers:
  - Host a room, then choose:
    - the mode
    - the sector size and seed (or a curated fair one)
    - the speed
    - the AI difficulty
    - the seats: each a player, an AI or open, with its house and team
  - Join by code
  - The lobby: the seats, a ready check, chat, and the code and link to share.
- **In the run:**
  - A players strip: house colours, names, connection, who paused.
  - Map pings (Alt+click, shown to allies, with a sound).
  - Team chat in co-op; all-chat and team chat in versus. Rooms are private, so no public moderation
    is needed yet.
  - The Gift order in a world's or the Hearth's actions.
  - The pause and speed rules shown where the speed buttons are.
- **The end:** one results screen per team (tallies per player), Legacy earned, and "Play again"
  with the same seats.
- **The First Night stays single-player.** Multiplayer unlocks after it, so everyone in a room knows
  the basics.

---

## 6. Ranking: recommendation

**Not at launch.** Four reasons:

1. **Population.** A ladder needs enough people online at once to match within a minute or two. A
   queue that never fills feels worse than no queue at all.
2. **Fairness first.** Rated games need fair sectors and equal luck in the draft (§2.2). Without
   them, a rating measures the seed as much as the player.
3. **Identity.** Hegemarch promises no accounts. A rating needs a stable identity.
4. **Cheating.** In any lockstep game every player holds the whole game state, so a modified client
   can see through the fog. AoE2 lives with this. A rating makes cheating more tempting.

**What to ship instead:** private rooms, per-browser stats (wins and losses by mode and house), and
a head-to-head record against the names you've played.

**When there's a crowd** (for example, 20 or more players online at peak, weekly):

1. Add an open room list and a quick match.
2. Then seasonal ranked 1v1:
   - **Rating:** Glicko-2, which copes with few games and long breaks better than Elo.
   - **Fairness:** curated fair sectors, with "the same luck" on.
   - **Verified results:** the room's orders log is replayed by the same GitHub Actions checker that
     verifies the Daily.
   - **Identity:** a key pair made in the browser (WebCrypto), a 3–5 letter name as on the board,
     and an optional code to carry it to another browser. No email.

---

## 7. Edge cases

| Case | What happens |
| --- | --- |
| An order names a ship that died before it was carried out | Nothing; the click's feedback already played. Commands never throw (fuzz-tested) |
| Two players order the same tick | Applied by seat, then by send order: the same everywhere |
| A player's tab is hidden | The game goes on; they catch up on return. Hidden clients don't slow the room |
| A slow laptop at 3× | The room slows to what it can keep up with, and says so |
| Someone opens the Boon draft and thinks for a minute | The run goes on. The offer is made by an order (`ensureOffer`), so every client deals the same cards |
| An order is sent for another house | The room stamps the sender's own seat; the simulation rejects anything else, as the Daily checker does |
| An ally arms a Starfall in a system holding your fleet | It erupts as for anyone: the fuse warns everyone, allies included. A real team decision |
| Your Hearth falls in co-op | You keep your ships and can be rekindled (§2.1) |
| Your Hearth falls in versus | You're out; you can watch with the fog lifted (no chat to your team) |
| Disconnect in 1v1 | Wait / AI / take the win, after 2 minutes |
| The room's server restarts mid-game | Clients reconnect; the room reloads its log from storage and resumes on the next turn |
| Different game versions | The lobby refuses, naming who must reload |
| Desync | Detected within a second, resynced or ended, logged for a fix (§4.5) |
| Pause spam in versus | 3 per player, 60 s each, and anyone resumes after that |
| A game that never ends | An optional time limit in the lobby, after which the house or team furthest toward a Destiny wins. Without one it plays on until decided, as single-player does (the Hollow only appears when it is one of the run's Destinies) |
| Leaving co-op mid-run | The AI takes your house; your friends carry on |
| The same person in two tabs | One seat per connection; a second join takes the seat over (a reconnect) |
| Chat abuse | Private rooms only at first; mute per player |
| The offline or itch.io build | Multiplayer shown as needing hegemarch.com |

---

## 8. Testing

1. **Headless lockstep games** in Node:
   - 2 to 4 clients, each a `Game`, behind an in-memory room with random latency and jitter.
   - Bots give the human seats' orders.
   - Hashes are compared every second; hundreds of games per run (like the fuzz suites).
2. **Cross-engine:** record a 4-player game, replay it in Chromium, Firefox and WebKit (Playwright),
   and compare hashes every second.
3. **Snapshots:** saving, loading and playing on must equal playing straight through. Reconnect and
   resync depend on it.
4. **Two-tab interface fuzz:** the existing UI fuzzer drives two players in one room over
   `BroadcastChannel`, with hashes compared. This catches the interface changing game state outside
   an order.
5. **The room**, on a local Durable Object (wrangler dev):
   - joining, leaving, reconnecting and AI takeover
   - the pause and speed rules
   - spoofed and oversized orders, and rate limits
6. **Bad networks:** Playwright throttling (300 ms latency, jitter, 30 seconds offline) and a check
   that every client agrees afterwards.
7. **Playtests** with a debug overlay showing ping, input delay, tick lag and the hash.

---

## 9. Phases

| Phase | What | Size |
| --- | --- | --- |
| 0 | The simulation for many humans (§4.4), co-op rules (§2.1). A hot-seat switch (one machine, a key to change whose house you lead) to play co-op before any networking | Large |
| 1 | Lockstep core: turn loop, the order seam, hashes, the two-tab transport. Co-op playable between two tabs | Medium |
| 2 | The room server: codes, lobby, reconnect, AI takeover, pause rules, logs | Medium |
| 3 | Interface: lobby, in-run players strip, pings, chat, team results | Medium |
| 4 | Hardening (§8) and playtests, then release as **Play together (beta)**: co-op | Medium |
| 5 | Versus: fair seeds, the same luck, surrender, versus pauses | Medium |
| 6+ | Open rooms and quick match, spectating and replays, Shared Command, Ages together, ranked seasons | Later |

---

## 10. Decisions (all taken as recommended, 2026-10-22)

1. **Order:** co-op first, then versus (recommended), or both together?
2. **Ranking:** no ladder at launch, stats only, ranked seasons once there's a crowd. Agreed?
3. **Server:** Cloudflare Durable Objects beside the Daily Worker (free to start; the $5/month plan
   once there's steady play). Agreed, or would you rather avoid any server cost (peer-to-peer, with
   the drawbacks in §4.1)?
4. **Versus rules:** 3 pauses of 60 s per player, speed fixed by the lobby (1× by default). The Hall
   of Heirs is off in all versus games (§2.2: no perks, every Boon and house for everyone, Legacy
   still earned), with an optional open handicap in private rooms. Agreed?
5. **Co-op progression:** your own Hall perks and unlocks count in co-op, and each player earns full
   Legacy. Agreed?
6. **The rekindle mechanic** (§2.1): a fallen ally comes back when their Hearth is retaken. Build it,
   or keep it simple (a fallen ally just keeps their ships)?
7. **Size:** up to 4 players in a room (6 houses with AI). Enough for now?
