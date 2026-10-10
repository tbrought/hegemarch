# Hegemarch: Design Document

## 1. Vision

A lost 8-bit space-strategy cartridge. The last Hegemarch, the sector's sovereign, fell and took
the light with them. The sector starts dark and grey; your house lights it up, world by world, in its
own color, and whoever fulfils a Destiny is crowned the next Hegemarch. Underneath is a real-time 4X with a roguelite structure: every
run has a new sector, new rivals, new Destinies and a new draft of Boons, and every run (won or
lost) earns Legacy for the next heir.

Hegemarch grew out of an earlier prototype (Starfall Dynasty) that overloaded new players: at 0:00
it showed five resource readouts, nineteen build options and three upgrade cards. The rework moved
the depth into the draft and the screen into a "one thing at a time" model.

**Pillars**

1. **Light is territory.** Unclaimed worlds are grey. Kindling floods a world with color and rings
   it in your house color. The fog of war is simply the dark.
2. **One thing at a time.** Click anything and one small card offers its few big actions. Everything
   else stays folded away until it matters, and a first run reveals the screen gradually.
3. **The fleet is your deck.** You start with three ship designs in a clear triangle. Blueprint
   Boons add new ones, so each run's draft builds a different fleet.
4. **Time to think.** A slower clock, longer battles, AI rivals that leave you alone for the first
   ten-odd minutes unless you strike first, and an automatic pause when a decision is needed.
5. **Risk is a choice.** Nothing stops a rush. Hearth walls rise over the first 12 minutes, so an
   early strike can win a house outright, and a failed one usually loses the run.

## 2. Key decisions

| Question | Decision | Why |
| --- | --- | --- |
| Stack | TypeScript, Vite, Canvas 2D, Web Audio | Zero install; a 280 KB single-file build that runs from disk. |
| Look | 480×270 pixel canvas, scaled up by whole numbers; Ember-16 palette | Crisp square pixels at any window size; a strong identity far from realistic space games. |
| UI | Immediate-mode pixel UI on the canvas; DOM only for menus | The HUD sits on the same pixel grid as the game. Menus use web fonts (Press Start 2P, Pixelify Sans) with pixel-style borders. |
| Simulation | Deterministic, fixed 20 Hz tick, seeded RNG, commands as the only input | Headless tests and balance runs, seed sharing, daily runs, save/load mid-run. |
| Players | Single player against AI houses | Roguelites are solo and pausable; the deterministic core leaves room for replays or lockstep later. |
| Art and audio | Fully procedural | Dithered worlds, ship sprites as character art, chiptune synth and sequencer; no asset pipeline. |

## 3. Words

| Concept | Name |
| --- | --- |
| Currency | **Embers** |
| Research | **Lore**; each fill is a **Boon** |
| Fleet limit | **Hangar** (plus **Hangar Bays** bought at the Hearth) |
| Home world | **Hearth** (if it falls, your house "goes dark") |
| Flagship | **Ark** |
| Settle a world | **Kindle**, with a seed ship |
| Victory path | **Destiny** (fulfil one to be crowned **Hegemarch**) |
| Sector traits | **Omens** |
| Core ships | **Striker, Guardian, Breaker** |

## 4. Rules

### Worlds and economy
- Embers are the only currency. A world earns by size (S 0.4 / M 0.6 / L 0.8 per second at level I),
  times its level (I ×1, II ×1.5, III ×2), times its **glow** (a new or captured world ramps from 25%
  to full over 90 seconds). A world under fire earns half.
- Each world has one **role**: **Mine** (+75% Embers), **Forge** (builds ships, faster at higher
  levels), **Observatory** (Lore, and sees one starlane further) or **Bastion** (orbital guns, +50%
  hull and shields, repairs your ships). Each planet type has a natural role (+25%). Switching role
  takes a 20-second retool. The **Hearth** does every role and cannot change.
- **Kindle**: press KINDLE on a dark world; a seed ship launches from your nearest world and kindles
  it in 20 seconds once no enemies are present. It costs 120 Embers plus 30 per world you hold.
  Guarded dark worlds (militia, sentinels) must be cleared first.
- **A seed ship on its mission belongs to no fleet.** Fleet badges, selection boxes and control groups
  leave it out, and an order to a mixed selection never redirects it (it launches beside the Hearth
  fleet, so it used to be swept up and silently stranded). Only an order to seed ships alone calls a
  kindling off, and the game says so. A seed ship without a mission does the next KINDLE for free
  (the button says FREE and a banner points it out); one that is destroyed is reported.
- **Raise** a world to level II (160) and III (380), scaled by size: more output, hull and hangar.
- **Hangar**: 16 + 3 per world + 1 per world level above I + 5 per Hangar Bay. Ships use 1 (Striker,
  Scout), 2 (Guardian, Breaker, Lancer), 4 (Carrier) or 6 (Dreadnought).
- **Scouting is the player's call.** The player's Scouts (the starting ones and any built later) wait
  for orders like every other ship; EXPLORE (or E) sends the selected Scouts charting the dark,
  world after world, and leaves any other selected ships where they are. With no Scout selected, E
  picks the idle Scouts and shows them (E again sends them). EXPLORE is offered only while some world
  is still uncharted (a decision can chart the whole sector), and every refusal says why. Rival houses' Scouts set
  out at once (the AI would order the same thing a moment later).
- **Anomalies wait for a ship that is sent there.** A player's ship looks at an anomaly only when it
  stops there: ships with further jumps queued, and Scouts out exploring, fly on. So a choice
  never pops up because a fleet happened to pass by. AI houses decide on the spot, so any of their
  ships at an anomaly takes it.

### Ships and combat
Three weapon families form a triangle: **rapid** (Strikers) shreds heavy hulls, **siege** (Breakers)
cracks medium hulls and worlds, **flak** (Guardians) tears through light craft and fighters. Equal-
Ember fights between counters are decisive but not total (the winner keeps roughly 60–85% of its
hull); mirror fights take 50–125 seconds. Breakers are the way to take worlds (siege ×2 against
planets). Blueprint ships: **Carrier** (fighter wings, rebuilt in the hangar), **Lancer** (very long
range, anti-heavy), **Dreadnought** (capital ship that levels up, max 2), **Starbase** (one fortress
per world). The **Ark** levels up from damage and kills and learns an ability at levels 3, 5 and 7.

Ships only passing through a world do not stop to besiege it, and scouts never shoot worlds.

### Boons
A draft offers 3 choices, plus one each from the Ashen Remnant, Quantum Archives and the Codex
relic, up to 5 (so every card fits on the smallest screen; Quantum Archives stops appearing once a
house is at 5).

About 60 Boons in four rarities across War, Wealth, Growth, Lore, Ward, Blueprint and Pact
(double-edged) categories. Lore costs 150 + 80n + 3n² for the n-th Boon, so one arrives about every
three minutes. If four drafts pass without a Blueprint, the next one always shows one. Rerolls,
skipping for Embers and "decide later" are available.

How Boons read:
- **Effect text** is marked up in the data: `[gain]` draws teal, `[!drawback]` red, `{keyword}`
  gold, and game terms (ship types, roles, Embers, Lore, Hearth…) are found and drawn gold
  automatically (`src/render/rich.ts`). The same markup colors relics, omens, house bonuses, Ark
  abilities, event choices, role tooltips and the Hall of Heirs perks.
- **Cards** carry a category icon, a rarity frame (double for Epic, Legendary and Pacts; a spark runs
  round Legendary cards), up to three "before → after" lines computed by applying the Boon to the
  house's real modifiers (`Game.computeMods`, `src/game/modstats.ts`), and a NEW or STACK ×n→×n+1
  tag.
- **Picking** flies the Boon's tile from the card to its slot in the **tray**, a column of tiles down
  the left edge (stacks fold into one tile with a count; relics follow in blue). Hovering a tile
  shows its name and text; clicking it, or pressing B with no draft waiting, opens the **Boons
  screen**: every Boon by category, relics, house bonuses and omens, beside a totals panel of every
  bonus from every source.

### Rushing
There is no truce. What keeps an early rush risky:
- **Hearth walls**: a Hearth's hull, shields and guns start at 45% and rise to full strength at
  12:00. Ordinary worlds are not affected.
- **AI restraint and grudges**: an AI house holds fire on other houses' worlds until its own first
  attack time, unless provoked. Striking its worlds or ships gives it a grudge: it may hit back at
  once and values the grudge target 2.5× when it picks targets.
- **Early warning**: AI houses see fleets bound for their worlds once those fleets are in sight and
  pull defenders home.
- **Stakes**: taking a Hearth eliminates the house, pays half its hoard (up to 6,000 Embers) and a
  free Boon, and its worlds swear **fealty** to the conqueror (they change owner, reset glow and keep
  their level). A failed rush leaves the attacker without an army against a rival with its economy
  intact and a grudge.

Measured with `npx tsx scripts/rush.ts` (Normal, opening build of Breakers, Breaker, Striker,
Guardian, then the AI plays on for the rusher): small sectors, launched at 4:00, take the Hearth in
about half of the runs; failed rushes end with 1–6 worlds by 35 minutes.

### Destinies
Conquest (take every rival Hearth) plus two of: **Dominion** (60% of all worlds for 150 s),
**Ascension** (15 Lore Boons, then raise and defend the Starfire Gate for 4 minutes), **Relic Hunt**
(most relics for 3 minutes), **Ember Hoard** (16k/24k/32k Embers by sector size for 90 s; taking a
rival's worlds seizes part of its hoard) and **Purge the Void** (destroy the Rift Heart).

### Threats and pace (Normal, medium sector, 1× speed)
| Moment | Time |
| --- | --- |
| Hearth walls at full strength (they start at 45%) | 12:00 |
| Warlike AI houses rush (Hard / Brutal) | about 7:00 / 5:30 |
| First Corsair raid | about 10:00 (12:00 Easy, 8:00 Brutal) |
| First rival attack on a passive player | 13–17 min (20–30 Easy, 10–13 Brutal) |
| Galactic events | first at 6–7 min, then every 5–6 min |
| The Maw opens (Purge the Void runs) | about 18–21 min |
| Medium AI-only games | 24–86 min, median about 39 (sectors without Dominion run longest) |

Measured with `npm run simulate` and `npm run balance:passive`. Speeds are ½×, 1×, 2× and 3×.

## 5. Teaching the game

- **The First Night** (first run, or on request): six guided steps with a bobbing gold arrow and a
  one-line objective banner: kindle a world, build a Striker, choose a Boon, repel a weak scripted
  raider by clicking your fleet badge and then the world, send the Scout exploring (fleet badge,
  then EXPLORE), and meet the three Destinies. The camera frames each target in the clear band
  between the banner and the card. The Scout step is skipped when a Scout is already exploring,
  none is left, or the sector is charted. Runs saved before the Scout step existed are renumbered
  on load (`game.ui.tutV`), so a finished guide stays finished.
- **Unguided runs** say the same thing in the banner: once the first Boon is chosen, "Your Scout
  waits for orders…" until a Scout explores (for the first five minutes), and the EXPLORE button
  pulses until then.
- **Progressive reveal** on a guided run: Embers, the banner and the clock at first; the Lore meter
  after the first kindle; fleet badges after the first ship; Destinies and the Status screen after
  the first Boon; the minimap and comms log once an enemy is sighted.
- **Omens**: an unguided run opens with one card naming the sector's two omens and your ambition;
  after that they live in the Status screen.
- **The end of the guide** is a card of its own, "The First Night is complete", with MAIN MENU (back
  to the title; the run is saved, so CONTINUE picks it up) or KEEP PLAYING. Decisions that came up
  during the guide wait behind the "! DECISION" button instead of popping up, and tips keep quiet
  for 45 seconds of play, so nothing that follows is mistaken for another step. The guide also
  finishes however the Destinies card goes away, raids the Hearth if the first seed ship is lost,
  and says so when an ignored raider leaves.
- **Firsts**: a short tip card the first time something happens (raid, anomaly, an anomaly on the
  map after the first minute, Blueprint, the Hollow, Ark level-up, nearly full hangar), once per
  profile. Its 22-second clock only runs while it can be read (not behind a dialog, not while
  paused, not under the pointer). LATER, or running out, parks it behind a flashing ★ TIP button on
  the right; How to Play (H) has a TIPS tab with all of them.
- **Hover help** (`src/ui/glossary.ts`): about 70 glossary entries (game terms plus every Ark
  ability) are matched in any text. Hovering a Boon card shows boxes for its terms beside the card;
  event choices, abilities, omens, Destinies, Boons-screen entries, tray tiles and the world and
  fleet panels show them by the pointer. Everyday words (Embers, Lore, hull…) are only explained
  when nothing rarer is mentioned. Tip-only areas ("hints" in `Ui`) never take clicks from what is
  under them. The Boons screen totals list their sources (house, omens, each Boon, relics). The
  DOM menus underline glossary terms (dotted) and explain them, and controls carry `data-tip`.
- **What a choice affects, as pictures** (`src/ui/subjects.ts`): every Boon card, event choice and
  ability choice shows the ship type (drawn as on the map, in the house color), resource or part of
  the realm it touches. Boons are read from the modifiers they really change, then from their text
  (so "+15% shields" shows the fleet though it never says "ships"; "enemy ships" is not the fleet);
  events and abilities from their text; a few have a hand-set list (`icons`). On Boon cards the
  pictures live in a framed window of deep space under the header (stars that twinkle and drift),
  ships at twice their size and icons at three times, or small in the header when the cards have
  no room (the smallest screen with long texts). Stat lines about one ship type show its picture
  in place of its name. An ability that names nobody shows the ship itself.
- **The pictures move.** Ships turn through their 16 headings with engines flickering, holding on
  each quarter turn (the clean views of the sprite); flames flicker, the little world rotates,
  travel arrows and fighters march, targets pulse, the skull's eyes glow, and a glint runs across
  every icon every few seconds. Under the pointer everything quickens: the ship spins freely, the
  stars streak, and the window's frame takes the rarity's color. A choice that cannot be afforded
  is dim and still. All of it is derived from the sprites and icons (extra frames, or a
  transformation of their pixels), in `src/ui/subjects.ts`.
- **Comms log**: the newest message is shown whole (wrapped); older ones fold to one line and
  unfold under the pointer, which also holds them on screen. The lines are hints, not buttons, so
  clicks and orders still reach the map beneath. The full log (L) wraps every message, stamps it
  with its game time, scrolls, and jumps to the place on a click.
- **The title screen puts first what the player most likely wants.** Its largest element is a
  banner: the run in progress (the house's banner, "CLASSIC RUN IN PROGRESS", the house, a line like
  "Medium · Normal · 7 worlds · 12:34 played", and one word for the click: CONTINUE), or, for a
  player who has never played, the guided First Night (BEGIN). With neither, there is no banner and
  the cards under it grow. Under the banner the **ways to play** stand side by side as cards
  (CLASSIC RUN, AGES RUN, DAILY RUN): choosing a mode is the title screen itself, not a step after
  it. Each card is one button with a living picture of what the mode is (`src/app/modeArt.ts`), its
  name in its own color, one line on what it is, and how long it takes. The pictures: a tiny sector
  that plays itself (a house lights the dark worlds, meets a rival, takes its Hearth and is crowned;
  then a new sector is dealt to other houses); the climb of the ages toward an Ark; and the chart of
  today's daily sector, which is the real map every player is dealt that day, with a countdown to
  the next. A saved Ages run still on its cradle shows the climb in its banner, lit as far as the
  age it has reached. A mode the player has not opened yet is flagged NEW. Everything that is not a
  run (Hall of Heirs, How to Play, Settings) is a quiet row at the foot; the Hall's button shows a
  light when the player's Legacy would buy something there. The setup page carries the same three
  modes as tabs, so a change of mind costs one click. In a window too short for it the title screen
  scrolls from the top; under 760 px wide the cards stack, each with its picture beside its words.
- **House banners** (`src/app/houseArt.ts`): each house card on the setup page (and the banner of
  the title screen) carries a small canvas drawn with the game's sprites at three screen pixels per pixel: the
  house's Hearth at the left, ringed in its color, and the fleet it really starts with (its Ark and
  escorts) flying out over drifting stars, each ship bobbing to its own beat. Under the pointer
  the fleet speeds up; the chosen house surges ahead, flies on fast, and its Ark sends out a ring
  every few seconds. The tooltip lists the starting fleet.
- **Menus never hide an answer below the fold, and a question's marked answer is what the player
  just asked for.** Launching a new run while one is saved asks in a pop-up centred over the page,
  START A NEW RUN?, with two answers: START NEW RUN (marked) and GO BACK (also Esc). Continuing the
  saved run is not offered there: the title screen's banner offers it already, and in the pop-up it
  only undid a launch by a stray click. The setup page itself says nothing about the saved run (a
  notice at its top was clutter above the fold; the pop-up says it at the moment it matters).
  The saved run is not thrown away. It ends as an abandoned run: it is paid its Legacy (the pop-up
  says how much) and entered in the Chronicle (`App.retireSavedRun`), and the new run opens with a
  line saying so. Nothing but the run itself is lost. Menu pages that redraw on a click (setup,
  Hall of Heirs, settings) keep their scroll position (`App.put`).
- **Auto-pause** (setting) for anomalies (when a ship you sent reaches one), visitors, the first
  raid and a Hearth under siege.
  Closing a decision without choosing parks it behind a "! DECISION" button.

## 6. Presentation

- **Feedback**: the Ember counter rolls toward its value and pops "+N"/"−N" for lump gains and
  spends; Boon cards are dealt (they slide in one after another); a chosen Boon flies to the tray;
  a rival Hearth falling gets a banner, a rumble and a chime; red arrows at the screen edge point at
  your worlds under attack off screen (click to look); after 40 s without input and with Embers
  piling up, a hint says what to spend them on (at most every 3 minutes, off with tips). The end of
  a run is its own moment: the screen dims, VICTORY or DEFEAT rises with the reason (gold sparks on
  a win), and a click skips to the results, where the Legacy total counts up.
- **Text is never drawn through a pattern.** A dither (every other pixel) over or under the
  1-pixel-wide font scrambles it, so: dialogs dim what is behind them with a flat dark shade and
  leave the top bar (Embers, Lore) bright; the comms log sits on a flat shade; the drag-select box
  fills under the world names; the live sector behind the menus and the results page is drawn
  without names or labels, under a flat darkening; locked houses fade their text, not their card,
  so the map never shows through. Dithers remain only on art (worlds, fog, the CRT option).

- **Screen**: the canvas is the window divided by a whole-number scale chosen so it is at least
  480×270 game pixels (a pixel-size setting picks 640×360 or 400×225 instead). CSS upscales with
  `image-rendering: pixelated`.
- **Palette**: Ember-16 (void, night, indigo, slate, dusk, mist, bone, gold, ember, red, wine, sea,
  teal, sky, violet, pink). Houses: Concord gold, Vael red, Wayfarer teal, Nyx violet, Ironclad sky,
  Ashen ember. Corsairs mist, ancient guardians dusk, the Hollow pink.
- **Worlds**: per-world lat/long noise textures mapped onto spheres lit from the upper left and
  quantized to the terrain ramp with a 4×4 Bayer matrix. Dark worlds use the cold ramp; kindling
  dissolves dark into color in Bayer order. Sprites are cached per pixel radius.
- **Ships**: character-art sprites (from the proposal mockup plus new hulls), rotated into 16
  directions with 4×4 supersampled nearest-neighbour sampling, tinted per house, with a 1-px shadow.
- **Text**: two bitmap fonts drawn from tinted atlases: a variable-width 5×7 font with lowercase and
  a 3×5 caps font for the map.
- **Sound**: Web Audio pulse waves (12.5/25/50% duty), triangle and LFSR noise; a sequencer plays a
  title theme, a calm "night" loop and a "war" loop when your worlds or fleets are fighting; a
  jingle plays when a world is kindled.

### The website

The landing page (hegemarch.com) is built from the game's code (`src/site/`), so it shows the game
and not pictures of it, and it cannot drift from the rules.

- **It opens on a live sector.** A real game, played by the AI houses in the visitor's browser
  (`app/Attract.ts`, the same class that plays behind the game's menus). It starts at 0:00 and
  shows the first fourteen minutes in about six seconds, the houses spreading their colors over
  the dark, then drops into real time. The camera glides from fight to fight and now and then
  pulls back to the whole sector. A panel names the houses and the worlds each holds (a click
  flies to that house's Hearth), the sector's news is told as it happens (worlds kindled and
  taken, Hearths put out, houses fallen, the crowning), and a switch turns on the title theme and
  the sound of the battles in view. When a house is crowned, a new sector begins.
- **The page is a starlane.** Each section hangs from a dark world on a lane down the side. A
  section is grey until the visitor scrolls to it; then its world is kindled and the section
  floods with color, as worlds do in the game.
- **The houses** are the setup screen's own banners. Choosing one shows its bonuses and starting
  fleet and gives the whole page that house's color; left alone, the page tours them once.
- **The fleet** is the triangle in motion: each ship in turn fires on the one it beats.
- **The draft is the game's draft.** A real, unplayed run of the chosen house deals the choices by
  the game's rules (rarities, Blueprints, Pacts, the Ashen Remnant's fourth choice), with rerolls;
  after four picks it sends the visitor to the game.
- **Nothing moves unasked** for a visitor who prefers reduced motion (a still picture and a button
  stand in for the live sector), the sector waits while it is off screen, and with scripts off the
  page is the picture, the pitch and the PLAY button.

## 7. Architecture

```
src/game/      deterministic simulation (no DOM)
  Game.ts        state, queries, commands (shared by the player's UI and the AI), save/load
  systems/       economy, production, movement (lanes, kindling), combat, status, visibility,
                 events, pirates, crisis, victory
  ai/ai.ts       AI houses: drafting, kindling, roles, upgrades, counter-building, attack planning
  data/          units, worlds, Boons, houses, relics, events, omens, Destinies, ambitions
src/render/    pixel canvas: Screen (scaling), Camera, Renderer, worlds, sprites, fonts, effects
src/ui/        immediate-mode HUD: Ui toolkit, Hud, Modals, Actions, Input, Tutorial, Tips
src/audio/     Sfx (synth) and Music (sequencer)
src/app/       App (menus, loop, results), Attract (the sector that plays itself behind the menus
               and on the website), houseArt and modeArt (the pictures the menus draw) and Session
               (one run's shared UI state)
src/site/      the website's script: the live sector, houses, fleet, Boon draft (see "The website")
src/meta/      profile, settings and Legacy
```

The simulation never touches the DOM or `Math.random` (visual jitter does), so the same seed gives
the same game with or without rendering, and a saved run continues identically.

## 8. Testing

- `npm test`: rules (kindling, roles, levels, hangar, Boons, Blueprint pity, events, omens), the
  combat triangle with equal budgets, early strikes and AI restraint, Hearth walls, spoils and
  fealty, every victory, effect-text markup in every data file, Boon previews and totals,
  determinism with and without effects, save/load round trips, and long AI-vs-AI soak games on
  every sector size.
- `npm run simulate` / `npm run balance:passive`: pacing and balance numbers.
- Browser tests through `playwright-core` with the installed Edge or Chrome: `test:e2e` (about 50
  assertions over real input, including the Boon tray, the Boons screen and hover help),
  `test:tutorial` (the First Night end to end and at its edges: lost seed ship, ignored raider,
  replaced Destinies card, save and continue, tips that wait and come back), `test:shots` (the
  whole First Night), `test:gallery` (every panel and hover state, Boon cards in flight),
  `test:perf` (340 ships at about 140 FPS headless), `test:dist` (the built file from disk).
- `npx tsx scripts/rush.ts [seeds] [size] [difficulty] [minute]`: how often an opening rush lands.
- `npm run test:fuzz` (`scripts/fuzz.ts`): random players send random commands, valid and nonsense,
  across seeds, sizes, houses and difficulties; invariants are checked every 5 s of game time (no
  NaN, no negative Embers, hull within bounds, every unit somewhere, every living house holding its
  Hearth…) and every 8 minutes the game is saved, loaded and run on next to the original, which must
  stay byte-identical. `--ai` lets the AI play every house to reach late wars and every victory.
- `test:uifuzz`, `test:layouts`, `test:menus`: random play through the real UI (fails on any error or
  a dialog that cannot be left), every dialog at the extremes of screen size and content, and every
  menu over the live sector.
- `test:site`: the packaged website served from `release/site`: the live sector (dawn, real time,
  news, the flight to a Hearth, sound, the crowning and the sector after it), the lighting of
  sections, the houses and their tour, the triangle, a whole Boon draft, then the page at laptop,
  tablet and phone widths, with reduced motion and with scripts off.

## 9. Ages mode

A second way to play, beside the classic run: every house begins as a tribe in the Stone Age, all on
one **cradle world**, and climbs age by age to the stars. It is a longer game (about an hour or
more): the cradle first, then the classic game among the stars with what was won on the cradle.

Its card on the title screen shows the climb: the swift line of each age marching toward an Ark that
lifts into the stars (`app/modeArt.ts`). The same picture heads its setup, with the six ages named
under it.

### The cradle

- **One planet, a map of lands.** Nodes are lands joined by paths (`generateCradle`): each house has
  its Hearth on the rim with three lands of its own, border lands lie between neighbours, and the
  richest lands in the middle are held by beasts. Everything else is the classic game seen small:
  lands are kindled by Firebearers (the seed ship), take roles, rise in level, and are taken by siege.
- **Ages.** Stone, Bronze, Iron, Powder, Machine (`data/eras.ts`). A house's age decides:
  - what a Forge can build. Three lines of units keep the triangle in every age (swift beats siege,
    siege beats sturdy, sturdy beats swift) under new names and looks: Hunter, Chariot, Horseman,
    Dragoon, Armored Car (swift); Warrior, Spearman, Legionary, Musketeer, Tank (sturdy); Ram,
    Catapult, Cannon, Howitzer (siege). The Stone Age has no siege unit, so no walls fall before bronze;
  - how strong its units, walls and guns are (`power`, from 0.3 in the Stone Age to 1 in space), and how
    fast its units travel the paths. A new age upgrades every unit its house has, wherever the unit
    stands: the change spreads outward from the Hearth (`UPGRADE_SPREAD` world units a second, never
    more than `UPGRADE_MAX` = 5 seconds), a ring sweeps the map with it, and each unit flashes as it
    changes. (The first build kept old units old until they had rested 20 seconds in a land of their
    house. It cost a rule to learn and gave little: at home it was only a wait, and Boons already
    treat a line of units as one thing that changes its name with the age.);
  - which roles and levels its lands can have (Bastions and level II from the Bronze Age, level III
    from the Iron Age).
- **Lore climbs the ages.** On the cradle Lore is not turned into Boons: it is saved for the next age.
  With the Lore of the age gathered, the player presses ADVANCE (an explicit order, never automatic):
  it takes the Lore, a price in Embers, and time at the Hearth, and stands still while the Hearth is
  under attack.
- **Every age has its own Boons.** A house chooses one Boon at the start and one with every new
  age, from the seven that belong to that age (`cradle: true, age: n` in `data/cards.ts`; 35 in all,
  one Epic per age): Hunting Bands and Firekeepers in the Stone Age, Shield Wall and Siegecraft with
  bronze, Paved Roads and Iron Discipline, Powder Mills and Banking Houses, Railways and War
  Industry. The house keeps them among the stars. They are written in the words of the stars like
  every other Boon ("Guardians gain 20% hull"); on the cradle the vocabulary shows them in the
  words of the age ("Warriors gain 20% health").
- **The Ark.** The step out of the Machine Age is the Ark. When the player's Ark is done it leaves,
  and the run goes on among the stars. A rival's Ark that leaves first takes its house with it: its
  lands fall dark, open to anyone, and it will have a head start among the stars. A house whose Ark
  has left is gone ahead, not beaten.
- **Winning and losing there.** Lose your Hearth and the run is over, as always. Put out every rival
  Hearth before any Ark rises and the run is won on the spot (Conquest). Otherwise it is decided
  among the stars.
- No Corsairs, no Hollow, no anomalies and no omens on the cradle: those belong to the stars.

### The cradle on screen

- **The land.** One dark continent in a dark sea (`render/ground.ts`), painted once per run so that
  every land and every path is on dry ground. As among the stars, a land is grey until a house holds
  it; then its settlement stands in the house's color on a patch of lit ground. Settlements are built
  of the buildings of their house's age (huts and a great fire, mud brick and a ziggurat, stone and a
  keep, chimneys and a palace, factories and a tower), more of them at higher levels.
- **The troops.** Each age has its own pictures for the three lines, the scout and the Firebearer
  (`TROOPS` in `render/sprites.ts`). They are drawn from the side and mirrored to face left or right,
  never turned; their legs, wheels or tracks move only while they do.
- **The words.** The cradle is the same game seen small, so its HUD is the same HUD with other words:
  everything it draws passes through a vocabulary (`ui/vocab.ts`: world to land, ship to unit, starlane
  to path, hangar to supply, hull to health or walls, and each unit line to its name in the player's
  age). Lines written for the cradle say what they mean directly.
- **The pictures.** Whatever the HUD draws of a unit (build buttons, Boon cards, lists) is drawn in
  the player's age (`setArtEra`). On a Boon card, "all your ships" is a pair of the age's troops, a
  world is a dwelling of the age, the hangar is a supply tent, and the card's window looks onto dark
  ground under a strip of night sky, not onto the stars.
- **The climb.** The top bar shows the Lore of the age; when it is full, a button there (and on the
  Hearth's card, and the A key) gives the order to advance, with what it costs and brings. The corner
  where the Destinies sit among the stars shows the race instead: every house and the ages it has
  reached. A card explains the cradle when the run begins, and tips explain each first (the Lore
  gathered, a new age, the first siege unit, a rival's Ark).

### The stars

When the player's Ark is done, a card says what goes with it and where every rival stands, and its
button takes the run on (`game/ages.ts`, `App.toStars`). What follows is the classic game, built from
how the cradle went:

- **The houses** are the player's and every rival that left the cradle alive or is still climbing
  there. A house whose Hearth was put out on the cradle does not follow.
- **Arrivals.** A rival whose Ark left earlier has been out there that long (at most 5 to 11 minutes,
  by difficulty): the sector is played forward without the player until the player arrives. A rival
  still on the cradle follows when its own climb would have ended (at most 12 minutes later). Until a
  house arrives it holds its Hearth and nothing more: it earns nothing, does nothing, and nothing can
  hurt or fight it (`Faction.asleepUntil`, `Game.asleep`). For some minutes after a house arrives its
  rivals leave it alone unless it strikes first (`graceUntil`).
- **What is kept.** Every house keeps the Boons of its ages, and brings half its Embers (up to 2,000)
  and 50 for each land it held. The player's Hearth is as high as it stood on the cradle, and the
  lands held pay a few ships more at the start (one for every two, up to four). Lore makes Boons again.
- The run's results count both stages, and an Ages run that reached the stars earns 30% more Legacy.

### How it sits in the code

`GameConfig.mode: 'ages'` with `stage: 'cradle' | 'stars'`; `Game.cradle` is true on the cradle and
gates every rule above. Houses have an `era` and units keep theirs; in a classic run both are always
the Space Age, whose strength is exactly 1, so classic games are untouched (their simulated results
are byte-for-byte what they were). The pieces: `game/data/eras.ts` (the ages), `generateCradle` in
`game/mapgen.ts`, the cradle's Boons in `game/data/cards.ts`, `game/ages.ts` (the passage),
`render/ground.ts` and `TROOPS` in `render/sprites.ts` (the look), `ui/vocab.ts` (the words).

### Pace and testing

`npm run simulate:ages` plays the cradle with AI houses only. On a medium cradle the first Ark leaves
at about 30 minutes on Easy, 22 on Normal and 19 on Hard, and the middle one at 42, 32 and 27; wars
between houses begin at about 16, 12 and 7 minutes. A player who puts everything into Lore can leave
in about 21 minutes on Normal, at the price of a thin army.

`tests/ages.test.ts` covers the rules (ages, gating, the Ark, upgrading, the cradle's map, the passage,
arrivals, saves); `npm run test:ages` plays a whole run in a browser; `npm run test:fuzz -- 12 55 --ages`
fuzzes both stages and the crossing; `test:layouts` checks the cradle's cards and bars at every
screen size; `scripts/ages-look.mjs` takes screenshots of every age for a visual review.
