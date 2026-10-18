# Code tour

For a developer new to Hegemarch. Ten minutes here should tell you where anything lives and how to
change it safely. Why the game works the way it does is in [DESIGN.md](DESIGN.md); this page is only
about the code.

## The folders

```
src/game/        the simulation: no DOM, no clock, no Math.random
  Game.ts          the state, and one line for everything you can ask or tell the game
  setup.ts         a new game: sector, houses, first fleets
  save.ts          saving and loading
  worldStats.ts    what a world yields and can do      shipStats.ts   what a ship can do
  fields.ts        anti-warp fields, Bastions          pathing.ts     ways through the sector
  starfall.ts      the Starfall: what is armed, what burns, what one costs
  boons.ts         the Boon pool and offers            modSources.ts  where a house's bonuses come from
  unitLife.ts      a ship built, hit, destroyed        conquest.ts    worlds taken, houses fallen, the winner
  commands/        what a house can order: orders.ts, production.ts, choices.ts, climb.ts, checks.ts
  systems/         what happens by itself every tick: economy, production, movement, combat, ...
  ai/ai.ts         how rival houses decide (they give the same commands the player does)
  data/            tables: ships, worlds, Boons, events, houses, relics, Destinies
  mapgen.ts        the sector generator
  ages.ts          an Ages run's passage from its cradle world to the stars
  replay.ts        a Daily played again from its orders (the board), and what a list of orders may hold
  dmath.ts         sine, cosine, arc tangent and length, the same to the last bit in every browser
src/render/      drawing the map on a low-resolution canvas: Renderer, Camera, sprites, fonts
src/ui/          everything drawn over the map during a run
  Ui.ts            the immediate-mode toolkit: what is drawn this frame is what can be clicked
  Hud.ts + hud/    the HUD: top bar, Destiny chips, Boon tray, fleet badges, log, minimap, cards, heralds
  Modals.ts + modals/   the dialogs: Boon draft, events, Status, How to Play, settings
  Input.ts         mouse and keys            Actions.ts   orders with feedback (sound, reason)
src/app/         the page around the game
  App.ts           the frame loop and the shared state
  run.ts           a run's life: started, continued, saved, ended
  screens/         the menu pages (HTML): title, setup, Hall of Heirs, Settings, the throne, results
  Session.ts       what the HUD and the input share about the run on screen
src/audio/       sound effects and music, both synthesised
src/meta/        the player's profile, Legacy and records (localStorage); board.ts, the Daily board's
                 terms (what the game, the website and the board's server agree on)
src/site/        the website's own script (hegemarch.com): the live sector, the houses, the board, the throne
worker/          the Daily board's server (a Cloudflare Worker with a D1 database; worker/README.md)
tests/           unit tests, one file per subject (fields, ships, boons, rivals, ...)
scripts/         balance simulations, fuzzers and browser suites; verify-daily.ts, the board's checker
                 (GitHub Actions); trailer/, the trailers, made from the game itself
```

Dependencies run one way: `game/` imports nothing from the other folders (but for the numbers of the
Hall's perks, `meta/perks.ts`), and no two files import each other. A module in `game/` takes the
game as its first argument (`killUnit(g, u)`); the HUD's, dialogs' and app's modules take theirs
(`hud`, `modals`, `app`).

## One frame

`App.loop` runs once per browser frame and calls `frameGame`:

1. `Input.update` reads held keys and edge-panning.
2. `Game.step` runs zero or more times. Each call is one fixed tick of 0.05 s, so game speed changes
   how many ticks a frame gets, never the size of a tick. `step` calls the systems in a fixed order:
   visibility, economy, production, abilities, combat, projectiles, movement, status, Corsairs, the
   Hollow, events, each rival house's AI, victory.
3. `Renderer.render` draws the map.
4. `Hud.update` then `Hud.draw` draw the HUD and any open dialog on top.

## One order

A right-click on a world goes `Input` → `Actions.orderAt` → `g.cmdMove` → `commands/orders.ts`.

- Every command has a `check` that returns the reason it cannot be done, or `null`. The HUD shows
  that reason on the button; `Actions` says it as a toast.
- Rival houses call the same `g.cmd*` functions from `ai/ai.ts`. There is no second set of rules.
- A few reasons are told apart in code (`WHY` in `commands/checks.ts`); compare against those
  constants, never against the sentence.

## Three rules that must hold

1. **The simulation is deterministic.** In `src/game/`, use `g.rng`, never `Math.random`, `Date` or
   anything from the DOM. The same seed and commands must give the same game, in every browser: use
   `dsin`, `dcos`, `datan2` and `dhypot` (`dmath.ts`), never `Math.sin`, `cos`, `atan2`, `hypot`,
   `pow`, `exp`, `log` or `**`, which each engine may round its own way (a Daily is played again
   elsewhere, by the board's checker). `tests/dmath.test.ts` holds both.
2. **State is plain data.** Everything in a save is JSON (`save.ts`). What can be recomputed is left
   out and rebuilt on load. A loaded game must continue exactly as the saved one would have.
3. **The order of random draws is part of the game.** Reordering steps in `setup.ts` or `mapgen.ts`
   changes every sector. If you move code there, check the golden traces (below).
4. **The player changes the game only by an order.** Every `g.cmd*` the HUD calls is in
   `ORDER_NAMES` (`Game.ts`); a Daily keeps each one, with the tick it was given after, and the board
   plays the run again from them (`replay.ts`). The UI may read the game as it likes, and keep its own
   notes in `g.ui` (which the simulation never reads), but change nothing the game plays by: anything it
   changed directly would be missing when the run is played again, and an honest crown would not stand.

## How to add things

**A Boon.** Add an entry to `game/data/cards.ts`. Its `mods` function changes numbers on the house's
modifiers (`game/mods.ts`), or sets a flag with `flag(m, 'name', value)` that the rule reads where
it applies (`f.mods.flags.name`). `modstats.ts` turns modifiers into the lines the draft shows.
If it answers a problem a new player may not have met yet, put it in the key that opens it in
`game/data/boonKeys.ts` (a test checks that every Boon is in the starting deck or in one key).

**An ability.** Add it to `ABILITIES` in `game/data/abilities.ts`, with what it says over the ship
that casts it (`says`) and, if it lasts, what it leaves (`leaves`); what it does to `tryCast` in
`game/systems/abilities.ts`, returning the ships it touched; its shape to `castLook` in
`render/abilityLooks.ts` (and a mark to `LASTING` for what it leaves); its sound to `CAST_SOUND` in
`audio/battleSounds.ts` and `Sfx`. A test holds every ability to all of them.

**An event.** Add an entry to `EVENTS` in `game/data/events.ts`: a title, a text, and choices. Each
choice has a `run` that changes the game and returns the sentence the player reads. `cond` and `why`
say when a choice is unavailable and what to tell the player.

**A ship.** Add its id to `UnitType` in `game/types.ts`, its stats to `game/data/units.ts`, its
pixel art to `render/sprites.ts` and a glossary entry to `ui/glossary.ts`. To make it buildable, add
it to `shipTypesFor` in `commands/production.ts` (behind a Blueprint Boon if it needs one).

**A command.** Write `checkX` and `cmdX` in the right file under `game/commands/`, add the two
one-line methods to `Game.ts`, a method with feedback to `ui/Actions.ts`, and the button to the HUD.

**A dialog.** Add its kind to `Modal` in `app/Session.ts`, a function that draws it in
`ui/modals/`, and a case in `Modals.drawKind`. Open it with `hud.modals.open({ kind })`. If it opens
by itself, pass `unbidden: true` so that it ignores clicks for its first second.

**A big moment.** Pass a `Herald` (a title, a line, a colour) as the last argument of `g.notify`:
the HUD announces it across the screen (`ui/hud/herald.ts`) as well as in the log. Keep it for news
that changes the run; a herald that comes often stops being one.

**A menu button.** A button in a page's HTML carries `data-sa="name:argument"`. Add `name` to that
page's actions table in `app/screens/`.

## Checking a change

```bash
npm run verify              # everything: types, unit tests, fuzzers, every browser suite
npm run verify -- --quick   # without a browser
npm test                    # unit tests only
```

For a change that must not alter the game at all (a refactoring):

```bash
npm run golden -- record       # before: fingerprint 24 fixed runs
npm run test:uisnap -- record  # before: snapshot 84 staged scenes (needs the dev server)
# ...make the change...
npm run verify                 # compares both, and runs everything else
```

The golden traces compare the whole saved state every 30 seconds of game time, to the byte. The UI
snapshot compares canvas pixels, every HUD button with its tooltip, and the HTML of each menu page.
Both live in `.golden/`, outside git: record them again after any change that is meant to be felt.

## Where to start reading

- `src/game/Game.ts`: the list of everything the game can be asked or told.
- `src/ui/Hud.ts`: `drawAll` shows the order the HUD is drawn in.
- `src/app/App.ts`: `frameGame` is the frame described above.
