# Hegemarch

An 8-bit real-time space strategy **roguelite**. The last Hegemarch fell, and the sector went
dark. Each run, a new heir lights it back up, one world at a time: kindle grey worlds into your
house's color, build a fleet of Strikers, Guardians and Breakers, draft Boons that reshape the run,
and follow one of three Destinies to be crowned the next Hegemarch, against rival houses, Corsair
raids and the Hollow.

Everything is drawn on a low-resolution pixel canvas (480×270, scaled up in whole pixels) with a
16-color palette, bitmap fonts and chiptune sound. There are no asset files: worlds, ships, music
and sound are all generated in code.

## Play it

```bash
npm install
npm run dev        # opens http://localhost:5173 in your browser
```

Or build a single self-contained file you can double-click (no server needed):

```bash
npm run build      # type-checks, bundles, and writes dist/hegemarch.html
```

Requires Node 18+ (developed on Node 24). Any modern desktop browser works.

## Your first run

The title screen offers three ways to play: a **Classic run** (25 to 70 minutes), an
**Ages run** (the long game, see below) and the **Daily run** (today's sector, the same for every
player). A run in progress is the banner at the top: CONTINUE.

The first run is **guided** (the First Night, BEGIN on the title screen). It shows you six things, one
at a time:

1. **Kindle a dark world.** Click a grey world, then press KINDLE. You pay for a seed ship, which flies
   out, lights the world and is used up. (If it is destroyed on the way, the Embers are lost.)
2. **Build a Striker** at your Hearth.
3. **Choose your first Boon.**
4. **Repel a pirate raider:** click your fleet's badge, then the world.
5. **Send your Scout exploring:** click your fleet's badge, then EXPLORE.
6. **Meet your three Destinies,** the ways this run can be won. You do not choose one: reaching
   any one of them wins.

Each step says what its words mean. In the First Night the first three Boons on offer and the three
Destinies (Conquest, Dominion, Ascension) are always the same, so that nothing in a first game
needs knowledge you do not have yet.

The screen starts almost empty and reveals more as you go (the Lore meter, fleet badges, the
Destinies, the minimap). When the guide is done, a card says so and offers MAIN MENU (start a run
of your own; this one stays saved) or KEEP PLAYING. From then on a small box at the right names a
**first goal** to try (a role for a world, a level, a fleet, your first capture), each worth 40
Embers the first time you reach it. A short tip card appears the first time something new happens,
and the game waits while you read it: OK (or Space) goes on, LATER puts it away (a flashing ★ TIP
button brings it back). Every tip is under How to Play (H) → TIPS. From your second
run on, the full screen is there from the start, and the guide can be switched on again in the run
setup.

**Not sure what something is? Point at it.** Boon cards, event choices, Destinies, omens and the
world and fleet panels explain the terms they use (Kindle, Glow, Hangar, Fealty…) in boxes beside
them, and on the Boons screen each total shows where its bonus comes from. In the menus, dotted
terms do the same.

## Rules in brief

- **Embers** are the only currency. Every world you hold earns them.
- **Worlds** have a size, a level (I to III) and one **role**: Mine (more Embers), Forge (builds
  ships), Observatory (Lore and sight) or Bastion (guns, armor, repairs). Your **Hearth** does all
  four. If it falls, your house goes dark and the run is over. The first role you give a newly
  kindled world costs no time; a later change takes 20 seconds.
- **Making a fleet stand**: a Bastion, a Hearth and any world with a Starbase keep an anti-warp
  field up (a violet ring): enemy ships there take 6 seconds longer to jump away. Under fire, every
  ship's drive spools at half speed. Raiders that keep running can be caught at a Bastion, or made
  to come home by going for their Hearth.
- **Lore** fills over time. Each time it fills, choose a **Boon**: upgrades, economy tricks, Pacts,
  and **Blueprints** that add Carriers, Lancers, Dreadnoughts and Starbases to your fleet. Boon text
  shows gains in teal, drawbacks in red and game terms (ships, roles, Embers) in gold, and every card
  shows what it changes for you (for example `DAMAGE 0→+25%`, or `STACK ×1→×2`) and pictures of
  what it affects: the ship type, the resource, your worlds. Event and ability choices show them too. Your Boons and
  relics line the left edge of the screen; **B** (or a click on that tray) opens the Boons screen,
  with the totals of every bonus from your house, the omens, your Boons and your relics.
- **Ships**: Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers.
  Your **Ark** levels up and learns abilities.
- **Scouts** wait for your order. Select one and press EXPLORE (or **E**), and it charts the dark
  world after world by itself. An **anomaly** (a violet swirl) waits until you send a ship to stop
  there; then you choose what to do. Ships only passing through, and Scouts out exploring, fly on.
  A Scout sees the places next door, so while exploring it charts a guarded place from outside and
  keeps out of it; when the rest lies behind guards it says so and comes home. Every ship you lose
  is reported in the log, with the place and who destroyed it.
- **The hangar** limits your fleet. Hold more worlds and raise their level for more room.
- **Destinies**: Conquest plus two of Dominion, Ascension, Relic Hunt, Ember Hoard and Purge the Void
  (the house that lands the killing blow on the Rift Heart wins it).
- **Rushing** is allowed from the first second, and it is all or nothing. Every Hearth's walls
  (hull, shields and guns) start at 45% and reach full strength at 12:00. Take a rival's Hearth and
  its house falls: its worlds swear fealty to you, and you win half its hoard and a free Boon. Fail,
  and you have spent your army while the rival kept its economy, and it now holds a grudge.
- **Pace**: AI houses leave other houses' worlds alone until their first attack (about 12:00 on
  Normal, 16:00 on Easy) unless you strike them first; warlike houses rush at about 7:00 on Hard and
  5:30 on Brutal. Corsairs raid from about 10:00. A medium run takes about 35 to 50 minutes.
  Speeds: ½×, 1×, 2×, 3×. The game pauses itself when it needs a decision (you can turn that off).
  While it is paused, or held by a tip card, you can look around and read, but not give orders.

| Input | Action |
| --- | --- |
| Left-click | Select a world, a ship or a fleet badge. With ships selected, click a world to send them |
| Drag · Shift-click · double-click | Box-select ships · add to selection · all ships of a type here |
| Right-click | Send selected ships, attack a ship. With a world selected: set its rally point |
| Wheel · arrows · right/middle-drag | Zoom · pan · pan |
| Space · + / − | Pause · game speed |
| B · U · H · L | Boons (the draft when one is waiting) · status · help · comms log |
| Shift-click a ship button | Queue five of that ship |
| F · K · E · S · R · C | All warships · kindle selected world · send selected Scouts exploring (with none selected: pick your idle Scouts) · stop · retreat · look at your Hearth |
| Ctrl+1–9 / 1–9 · Esc | Control groups · cancel, or open the menu |

## Ages runs

AGES RUN on the title screen starts a longer game (about an hour or more) in two parts.

- **The cradle.** Every house begins as a tribe in the Stone Age, all on one planet: a map of lands
  joined by paths. It plays like the game above seen small (kindle lands, give them roles, raise
  units, take lands by siege), with one difference: **Lore climbs the ages** instead of making Boons.
  When the Lore bar at the top is full, press the button beside it (or **A**): for a price in Embers
  and some time at your Hearth, the next age begins. There are five: Stone, Bronze, Iron, Powder,
  Machine.
- **What an age brings.** Stronger units under new names and looks (a Striker is a Hunter, then a
  Chariot, a Horseman, a Dragoon, an Armored Car), new things to build (siege units and Bastions
  with bronze, higher levels later), stronger walls, and one Boon that your house keeps for good,
  chosen from the seven that belong to that age (Hunting Bands, Shield Wall, Paved Roads…). Every
  unit you already have is upgraded to the new age, wherever it stands; the change spreads out from
  your Hearth in a few seconds.
- **The Ark.** The step out of the Machine Age is your Ark. When it is done, your house leaves for
  the stars and the run goes on as the game above, with your Boons, half your Embers, and a few
  ships more for the lands you held.
- **The race.** Your rivals climb too (the corner of the screen shows how far). A rival whose Ark
  leaves before yours has been playing among the stars for that long when you arrive; one you left
  behind arrives later. A rival whose Hearth you put out on the cradle never follows, and putting
  out every rival Hearth before any Ark rises wins the run on the spot.

On Normal the first rival Ark leaves at about 22 to 30 minutes; a run takes 60 to 85 minutes on a
medium sector.

## Releasing

`npm run package` builds the game and the website, and writes everything to upload into `release/`:

| Path | Where it goes |
| --- | --- |
| `release/site/` | The website: the landing page (`site/index.html`) and its script (`site.js`, built from `src/site/`), the game at `/play/`, the download at `/hegemarch.zip` |
| `release/itch/hegemarch-web.zip` | itch.io, played in the browser |
| `release/itch/hegemarch.zip` | itch.io, the download (the same file the website offers) |

The version comes from `package.json`; it shows on the title screen and the landing page.

The landing page is made from the game itself, not from pictures of it: it opens on a real sector
played live by the AI houses, and its houses, ships, Boon draft and Destinies come from the game's
own data and code, so they stay true when the game changes. Look at it before uploading with
`npm run preview:site`, and check it with `npm run test:site`.

## Development

```bash
npm run typecheck          # tsc --noEmit
npm test                   # Vitest: rules, combat triangle, victories, determinism, save/load, AI soak runs
npm run simulate -- 5 medium 1 60 [-v]   # headless AI-vs-AI games with pacing stats
npm run balance:passive    # how long an idle player survives on each difficulty
npm run simulate:ages -- 8 medium 1 70   # the cradle of Ages runs played by the AI: when each house
                                         # reached each age, when its Ark left, how the wars went
```

Browser tests drive the real game in headless Edge or Chrome through `playwright-core`. Start a
dev server first (`npx vite --port 5173 --strictPort`), then:

```bash
npm run test:e2e           # mouse/keyboard flows with assertions
npm run test:shots         # plays the First Night and saves screenshots to .shots/
npm run test:gallery       # stages every panel (and hover states) for a visual review
npm run test:tutorial      # the First Night end to end, plus its edge cases and the tip cards
npm run test:audio         # a big battle on screen: the music stays exactly in tune, the mix never clips
npm run test:menus         # screenshots of every menu screen over the live sector
npm run test:ages          # an Ages run end to end: cradle, ages, Ark, the crossing, arrival, saves
npm run test:layouts       # every dialog at the smallest and largest screens, biggest offers and texts
npm run test:uifuzz        # minutes of random clicks, drags, keys and resizes through menus and runs
npm run test:perf          # big battle frame-rate check
npm run test:dist          # smoke-tests dist/hegemarch.html from disk (after npm run build)
npm run test:site          # the website in release/site, at four widths, with motion reduced and
                           # scripts off (after npm run package; needs no dev server)
```

The simulation has its own fuzzer, which needs no browser:

```bash
npm run test:fuzz -- 40 45            # 40 games of 45 minutes of random (and nonsense) commands,
                                      # checking invariants and that save/load changes nothing
npm run test:fuzz -- 24 90 --ai       # the AI plays every house: reaches late wars and every victory
npm run test:fuzz -- 12 55 --ages     # Ages runs: the cradle, the crossing, and on among the stars
```

See [docs/DESIGN.md](docs/DESIGN.md) for the design and architecture.
