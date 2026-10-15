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
Embers the first time you reach it: the goal is struck through and its Embers fly to your count. A short tip card appears the first time something new happens,
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
  field up (a violet ring): enemy ships there take 6 seconds longer to jump away. A Bastion's field
  also reaches **every place one jump from it** (its starlanes turn violet), and the Bastion
  **protects** your other worlds there: they take 20% less damage while it stands, 30% at level
  II, 40% at level III. So a Hearth with a Bastion next door is cracked by taking the Bastion
  first. Point at the Bastion button and the map shows what it would cover. Under fire, every
  ship's drive spools at half speed. Raiders that keep running can be caught at a Bastion, or made
  to come home by going for their Hearth.
- **Lore** fills over time. Each time it fills, choose a **Boon**: upgrades, economy tricks, Pacts,
  and **Blueprints** that add Carriers, Lancers, Dreadnoughts, Starbases and the Starfall to your fleet. The cards
  are beamed in one by one, the rarest last, and an Epic or a Legendary arrives with sparkles and a sting. Boon text
  shows gains in teal, drawbacks in red and game terms (ships, roles, Embers) in gold, and every card
  shows what it changes for you (for example `DAMAGE 0→+25%`, or `STACK ×1→×2`) and pictures of
  what it affects: the ship type, the resource, your worlds. Event and ability choices show them too. Your Boons and
  relics line the left edge of the screen; **B** (or a click on that tray) opens the Boons screen,
  with the totals of every bonus from your house, the omens, your Boons and your relics, and the
  chances that your next choice holds a Blueprint, an Epic or a Legendary Boon. A Blueprint is owed
  to you after three choices without one, and it is one the run has not shown you yet. A new player
  discovers Boons as they meet what they are for: their first battle, an enemy ship destroyed, a world
  attacked, a full hangar and a few more open the Boons for them, for good, and the next choice holds
  one (the Boons screen says what is still to be found).
- **A dark world that two houses want** goes to the seed ship that finishes first: both kindle, each
  with its ring on the map, and the one that loses does your next KINDLE for free. Only warships and
  guards stop a kindling; another house's seed ship or Scout does not.
- **Ships**: Strikers beat Breakers, Breakers beat Guardians and worlds, Guardians beat Strikers.
  Your **Ark** levels up and learns abilities: it powers up on screen, then offers three to choose from.
- **Scouts** wait for your order. Select one and press EXPLORE (or **E**), and it charts the dark
  world after world by itself. An **anomaly** (a violet swirl) waits until you send a ship to stop
  there; then you choose what to do, on a page that opens with a picture of it and its story coming
  in under a scan line. Ships only passing through, and Scouts out exploring, fly on.
  A Scout sees the places next door, so while exploring it charts a guarded place from outside and
  keeps out of it; when the rest lies behind guards it says so and comes home. Every ship you lose
  is reported in the log, with the place and who destroyed it.
- **The hangar** limits your fleet. Hold more worlds and raise their level for more room.
  Dreadnoughts take none.
- **The Starfall** (an Epic Blueprint) is built at your Hearth for 2,500 Embers, flown to any star and
  **armed** there. Two minutes later the star erupts, unless the Starfall is destroyed first: every
  ship in that system is destroyed, yours too, and every world there is scorched (no shields, a level
  lost, the Glow of a new world). No world changes hands, so no Hearth falls to it. Every house is
  told, with a clock at the top right, and every other house holds it against the one that armed it.
  The star then burns for three minutes: fleets wait in front of the fire, and the same order given
  twice sends them through it. The house that armed it sees the whole system from that moment until
  the fire is out, and what it took stands over the star. Rival houses build and arm them too, and
  come to destroy yours.
- **A run that is won ends in a crowning** on the map (a click skips it), and its figures are
  counted up against your records for that kind of run. **After it** the results draw the run minute
  by minute: every house's Embers per second, worlds, fleet strength and Boons, your house beside a
  rival of your choosing; and they have the run to paste for your friends, with a **challenge link**
  that opens the same sector for whoever follows it.
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
  A decision that comes up by itself takes no click for its first second, so a click already on its
  way does not answer it for you.
  While it is paused you can look around and give orders; it goes on when you press Space.

| Input | Action |
| --- | --- |
| Left-click | Select a world, a ship or a fleet badge. With ships selected, click a world to send them |
| Drag · Shift-click · double-click | Box-select ships · add to selection · all ships of a type here |
| Right-click | Send selected ships (their way shows, red where you know of danger), attack a ship. With a world selected: set its rally point |
| Shift+right-click | One more stop on the way for the selected ships |
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

New to the code? Start with [docs/CODE_TOUR.md](docs/CODE_TOUR.md): where everything lives, how a
frame and an order flow, and how to add a ship, a Boon, an event or a dialog.

```bash
npm run verify             # everything below in one command (starts its own dev server for the
                           # browser suites); -- --quick leaves the browser out, -- --release also
                           # builds, packages and checks the build and the site
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
npm run test:music         # every part of all eleven tracks, played through the real sound engine
npm run test:qol           # the small things: remembered setup, Escape, keyboard, fullscreen, a silent hidden tab
npm run test:starfall      # the Starfall: built, armed, a star that erupts and burns, an order through the fire
npm run record:starfall    # films a Starfall from arming to the burning star (.shots/starfall.mp4) and takes its pictures
npm run record:draft       # films Boon drafts being dealt, an Epic and a Legendary among them (.shots/draft.mp4)
npm run record:event       # films decisions coming in, an anomaly and a visitor (.shots/event.mp4)
npm run record:ability     # films the Ark rising two levels and choosing its abilities (.shots/ability.mp4)
npm run record:herald      # films the big moments of a run heralded across the screen (.shots/herald.mp4)
npm run record:omens       # films the omens coming in under their stars at the start of a run (.shots/omens.mp4)
npm run record:touches     # films a Boon becoming ready and a goal reached, close up (.shots/touches.mp4)
npm run record:discovery   # films a new player discovering Boons: a world attacked, the herald, the next choice (.shots/discovery.mp4)
npm run record:martyr      # films a rival's Martyr swarm against your fleet, and a rival's news in its colours (.shots/martyr.mp4)
npm run test:menus         # screenshots of every menu screen over the live sector
npm run test:ages          # an Ages run end to end: cradle, ages, Ark, the crossing, arrival, saves
npm run test:layouts       # every dialog at the smallest and largest screens, biggest offers and texts
npm run test:fit           # every decision and outcome, level-up, omens pair and herald fits the smallest screens
npm run test:reveals       # keys and clicks while things come in; heralds and goals meeting dialogs and tip cards
npm run test:discovery     # a new player discovering Boons: the starting deck, a key turning, the next choice, a new run
npm run test:calm          # a player who asks for less motion: every new moment comes and goes, no kindling ring
npm run test:frame         # the game in a frame (artifact, itch.io): a click in it always takes the keyboard back
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

A change that must not alter the game at all (a refactoring) has two checks of its own:

```bash
npm run golden -- record       # before: the whole saved state of 24 fixed runs, fingerprinted every 30 s
npm run test:uisnap -- record  # before: 81 staged scenes (pixels, every button and tooltip, menu HTML)
npm run verify                 # after: compares both, to the byte, and runs everything else
```

See [docs/CODE_TOUR.md](docs/CODE_TOUR.md) for the code and [docs/DESIGN.md](docs/DESIGN.md) for the
design.
