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
  hull and shields, repairs your ships, an anti-warp field). Each planet type has a natural role
  (+25%). A newly kindled world starts as a Mine, and the **first role its house gives it costs no
  time** (`GNode.fresh`); a later change takes a 20-second retool. (Putting a world to the role it is
  good at used to cost those 20 seconds every time. Starting each world in its natural role instead
  would have cut the income of a player who never touches roles.) The **Hearth** does every role and
  cannot change.
- **A fleet can be made to stand.** Any ship can jump away after a 3.5-second spool, from anywhere in
  a world's well, so a war between fleets was a chase: the first playtester gave up on catching
  raiders and went for Hearths instead. Two rules change that, for every house alike:
  - An **anti-warp field** (`Game.fieldAt`, `HOLD_FIELD`): at a Bastion, at a Hearth (it does every
    role) and at any world with a Starbase, enemy ships take 6 seconds longer to jump away. The field
    shows as a violet ring inside the world's well, and the world's card says so, for its owner and
    for an attacker. The Gravity Anchors Boon adds its 4 seconds at every world of the house.
  - **Under fire a drive spools at half speed** (`UNDER_FIRE`, `FIRE_SPOOL`): a ship hit in the last
    two seconds takes twice as long to get away. Running from a fight costs time.
  So a raid on a Bastion is a commitment, a Bastion is the buildable answer to raiders, and the
  place to catch a fleet that keeps running is its own Hearth.
- **Kindle**: press KINDLE on a dark world; a seed ship launches from your nearest world and kindles
  it in 20 seconds once no enemies are present. It costs 120 Embers plus 30 per world you hold.
  Guarded dark worlds (militia, sentinels) must be cleared first. The Embers pay for the seed ship:
  it is never built at a Forge, takes no hangar room, and is **used up when the world lights**; if
  it is destroyed on the way, the Embers are lost and the player kindles again. The KINDLE button,
  the glossary and How to Play all say so (a player asked whether a seed ship should be consumed by
  kindling: it always was, and nothing said it).
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
- **Exploring Scouts do not throw themselves away, and no rule protects them.** A Scout is a ship
  like any other: the same drive, the same anti-warp fields, and guards fire on it at once. What
  keeps it alive is how it explores (`pickExploreTarget` in `systems/movement.ts`). A Scout sees the
  places next door, so it **charts a place from outside**: once the place it is bound for is in
  sight it picks the next one and does not fly in. It **never plans a way through a place seen to
  be guarded** (`Game.seenGuarded`, `Game.safeWay`), and looks before every leap. When no uncharted
  place can be reached safely it says how many lie "beyond guarded passages" and goes home; sending
  it further is the player's call, by hand. In the first public playtest a player lost three Scouts
  of four without a word from the game. Measured with every house exploring this way: about 2
  Scouts lost per house in twenty minutes (7 under the old rules, most of them inside Sentinel
  vaults and the Corsair base), nearly all caught by rival fleets, and about 83% of the sector
  charted (93% before, at that price). An earlier build made a newly arrived Scout untouchable for
  four seconds: it worked (1 lost, 100% charted) but was a rule with no reason behind it, and a
  Scout kept moving could not be shot at all.
- **A rival house makes the risky call for itself**: its Scouts go round a guarded place where they
  can and through it where they must (`f.ai` in `pickExploreTarget`), and it loses them as it
  always did (about 6 in twenty minutes, 94% charted). Rivals that knew the sector only up to the
  first guard found fewer targets: AI-only games ran about three minutes longer, with fewer
  conquests.
- **Boxed in.** In one to three sectors of a hundred every way out of the player's home system is
  guarded, and a careful Scout has nowhere to go until a fleet clears one (it says so and stays
  home). The First Night is not dealt such a sector (`Game.chartable`, checked in `App.startRun`),
  and its Scout step counts the order as given whatever the Scout found.
- **Saving changes nothing, to the tick.** A Hearth's walls rise by the whole second
  (`Game.wallsOf`), because worlds are rebuilt once a second and again on loading: with the time to
  the tick, a loaded Hearth stood a hair taller than the one that was saved, and under fire the
  two games drifted apart (found by `scripts/fuzz.ts --ages`).
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

A **derelict Dreadnought** (a galactic event) goes to the house that holds its place alone for 15
seconds. Rival houses send two free ships that are within five jumps to hold one they know of, the
way a player would. (Before, a derelict was one target among many for the whole army and almost
never won out: in forty AI-only games 8 of 21 were ever claimed, after a median 8 minutes, and four
of five sat untouched at a house's own home star. Now it is a median of under a minute, and game
length is unchanged: 46.7 against 47.4 minutes on the same forty seeds.) A derelict that someone
else is at is a fight, and that is still the army's to decide.

### Houses
Six houses (`src/game/data/heirs.ts`). The player plays one; the others are dealt as rivals.

| House | What it is | What it has |
| --- | --- | --- |
| **Solar Concord** | steady and rich | +10% Embers, sturdier worlds and shields. Ark: Aegis Field |
| **Vael Imperium** | war | +15% damage, cheaper ships, less Lore. Ark: Missile Barrage |
| **Wayfarer Clans** | speed | fast on the lanes and off them, cheap kindling, a second Scout. Ark: Nanite Cloud |
| **Lyceum Collective** | learning, and the swarm | +25% Lore, cheap Strikers, more Fighters, thin hulls. Ark: Strike Wing |
| **Choir of the First Flame** | faith: it converts | see below. Ark: Conversion |
| **Ashen Remnant** | fate | a fourth Boon to choose from, rerolls, an Epic Boon to start, fewer Embers. Ark: Ember Lance |

**The Choir of the First Flame** took the place of the Ironclad Dominion, the one house without a
character of its own: its fortress was the Concord's sturdiness, more of it, and slow. The Choir is
the house that takes and does not destroy.
- **Conversion** (its Ark, and no other ship ever learns it): the weakest enemy ships in range change
  sides, 1000 hull of them (two Strikers, or a Guardian) and 150 more for each level of the Ark, every
  36 s. Never an Ark, a Dreadnought, a Carrier, a seed ship or anything of the Hollow; a Corsair can
  be talked round. A ship that goes over forgets its orders, is dazed for a moment, and is from then
  on a ship of its new house, whatever its kind (so the Choir can come by ships it has no Blueprint
  for). The weakest go over first, so each is patched up to half its hull, and it takes no room in
  its new house's hangar (`Unit.guest`): without those two, an AI Choir turned 32 ships a game, gained
  mostly wrecks that kept it from building, and won 3 games in 32. No ship of the player's goes over
  silently: the log says which, and a tip the first time.
- **Captured worlds keep their level and Glow.** Any other house sacks a world it takes (a level
  lost, the Glow back to a quarter).
- **Zeal**: each ship the Choir loses at a world makes the rest of its ships there deal 5% more
  damage, up to 25%, until 10 s after the last loss. It is said over the place where the ship died,
  for both sides to see.
- **It does not run**: its drives take 25% longer to charge a jump.

As a rival it is neither weak nor strong: in 48 AI-only games it won 6 of the 32 it was dealt into
(the Ironclad Dominion: 7 of 32; the Ashen Remnant 6 of 30, the Lyceum 6 of 28, the Wayfarers 5 of
26). The Dominion was the one house that sat behind its walls, and outlasted wars it did not win;
without it AI-only games are a few minutes shorter (a mean of 42 minutes against 46).

Its name is longer than a state's, and meant to be. Where there is no room for it (a countdown
button, a line of a panel, the table of houses) it is **The Choir** (`HeirDef.short`,
`Game.shortName`). The **Lyceum Collective** was the Nyx Collective: Nyx is night, and the house is
scholars. A profile or a run saved under the old names loads under the new ones (`heirIdNow`): what a
player unlocked, won with and played stays theirs.

### Boons
A draft offers 3 choices, plus one each from the Ashen Remnant, Quantum Archives and the Codex
relic, up to 5 (so every card fits on the smallest screen; Quantum Archives stops appearing once a
house is at 5).

About 60 Boons in four rarities across War, Wealth, Growth, Lore, Ward, Blueprint and Pact
(double-edged) categories. Lore costs 150 + 80n + 3n² for the n-th Boon, so one arrives about every
three minutes. If four drafts pass without a Blueprint, the next one always shows one. Rerolls,
skipping for Embers and "decide later" are available.

**Rarity.** A card is drawn by weight: Common 62, Rare 27, Epic 9, Legendary 2.2 (Blueprints ×1.6,
Pacts ×0.55). An Epic is in about 20% of offers. Two things in the Hall of Heirs change that, and
both now say in numbers what they do, because a playtester had bought every rank of both and seen
nothing rarer than a Rare:
- **Fortunate Stars** (three ranks) adds half again to the weight of Epic and Legendary Boons with
  each rank (and moves a little from Common to Rare): an Epic in about 28%, 35% and 41% of offers
  (`EPIC_ODDS`, kept true by a test that deals the offers). It used to make that 22%, 27% and 29%. The
  Hall shows the odds at the rank held and at the next one.
- **Legendary Lineage** lets Legendary Boons appear, and a run now shows at least one: if none has
  been offered by the fifth offer (`LEGENDARY_BY`), that offer holds one, in place of a Common Boon
  and never of a Blueprint. Left to their weight, four runs in five showed none at all. It is a
  promise to the player only; a rival house draws as before.

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
  pull defenders home. Ships within four jumps answer a threat to a world; for the Hearth every
  ship does, from anywhere (a fleet used to go on besieging a far world while its own Hearth fell).
  Ships at a threatened world, or on their way to it, stay on that job as long as it needs them (up
  to half again the enemy's strength). Before 1.9 they were sent on to the army's business and back
  every few seconds and never fought: the loop the third playtest saw at a rival's Hearth, where one
  defender changed course up to sixty times in two and a half minutes. Too few to win at the Hearth,
  they gather a jump or two short of it and go in together once they are enough (they used to fly
  in one by one and be picked off). And a few ships on their own (new ships, stragglers, defenders)
  go round places held by more than they could take on, where there is another way; the army itself
  takes the straight way, or its attacks take so long that they are called off.
- **A siege that gets nowhere is called off**: every 50 seconds at its target an AI fleet must have
  taken 3% off the world's hull and shields, or be in a battle; otherwise it goes home and picks
  again. A fleet without the guns for a world no longer sits at it for minutes.
- **Stakes**: taking a Hearth eliminates the house, pays half its hoard (up to 6,000 Embers) and a
  free Boon, and its worlds swear **fealty** to the conqueror (they change owner, reset glow and keep
  their level). A failed rush leaves the attacker without an army against a rival with its economy
  intact and a grudge.

Measured with `npx tsx scripts/rush.ts` (opening build of Breakers, Breaker, Striker, Guardian, then
the AI plays on for the rusher), small sectors, launched at 4:30. Up to 1.8 the rush took the Hearth
in half of the runs on Easy (4 of 8) and a third on Normal (2 of 6), but mostly because the Hearth's
defenders were caught in the loop above and away. Since 1.9 they are at home: 0 of 8 on Easy and 0
of 6 on Normal, and a rush at 7:00 on Normal takes 1 of 8. An early rush now has to beat the house's
army, or come while it is away. Against a player who does nothing, the AI houses are as deadly as
before (`npm run balance:passive`: about the same times on Normal, Hard and Brutal; some games last longer on Easy).

AI-only games (`npm run simulate`, 40 seeds a size, Normal) last longer since houses stopped feeding
ships to their enemies: decided within 60 minutes in 31, 34 and 28 of 40 games (small, medium,
large; before 1.9: 37, 35 and 37), with a median of 42, 41 and 45 minutes (37, 36 and 39).

### Destinies
Conquest (take every rival Hearth) plus two of: **Dominion** (60% of all worlds for 150 s),
**Ascension** (15 Lore Boons, then raise and defend the Starfire Gate for 4 minutes), **Relic Hunt**
(most relics for 3 minutes), **Ember Hoard** (16k/24k/32k Embers by sector size for 90 s; taking a
rival's worlds seizes part of its hoard) and **Purge the Void** (destroy the Rift Heart).

Purge the Void goes to the house that lands the **killing blow** on the Rift Heart, whoever did the
rest (like a neutral boss in a MOBA: it can be stolen, by a rival or by the player). The rule is
said on the Destiny's card and when the barrier falls. For its first 4 minutes a void barrier takes
nine tenths off every hit on the Heart; a countdown stands over the Maw and in the Destiny's line
(BARRIER 3:12), and the log says when it falls. The Hollow's swarms go for the nearest world of a
house and keep clear of Sentinel vaults and the Corsair base on the way (`Game.pathAvoiding`): they
used to walk into them and never arrive.

### Threats and pace (Normal, medium sector, 1× speed)
| Moment | Time |
| --- | --- |
| Hearth walls at full strength (they start at 45%) | 12:00 |
| Warlike AI houses rush (Hard / Brutal) | about 7:00 / 5:30 |
| First Corsair raid | about 10:00 (12:00 Easy, 8:00 Brutal) |
| First rival attack on a passive player | 13–17 min (20–30 Easy, 10–13 Brutal) |
| Galactic events | first at 6–7 min, then every 5–6 min |
| The Maw opens (Purge the Void runs) | about 18–21 min |
| Medium AI-only games | 22–60+ min, median about 41 (sectors without Dominion run longest) |

Measured with `npm run simulate` and `npm run balance:passive`. Speeds are ½×, 1×, 2× and 3×.

## 5. Teaching the game

- **The First Night** (first run, or on request): six guided steps with a bobbing gold arrow and a
  one-line objective banner: kindle a world, build a Striker, choose a Boon, repel a weak scripted
  raider by clicking your fleet badge and then the world, send the Scout exploring (fleet badge,
  then EXPLORE), and meet the three Destinies. The camera frames each target in the clear band
  between the banner and the card. The Scout step is skipped when a Scout is already exploring,
  none is left, or the sector is charted. Runs saved before the Scout step existed are renumbered
  on load (`game.ui.tutV`), so a finished guide stays finished.
- **The guide explains its own words.** Under each step's line a smaller one says what the words
  in it mean and why the step matters ("Your Hearth is your home world. A Striker is a fast, cheap
  gunship."; "Lore, the violet bar, fills by itself. Each time it is full you choose a Boon").
  A first-time player reported being told to build a Striker at the Hearth with neither explained.
- **The First Night leaves little to chance.** Its first Boon offer is dealt by hand: Ember Tithe,
  Striker Wings and Kindling Rites, each about something the player has just done (`FIRST_OFFER`;
  a reroll and every later offer are random). A random first offer had been two Boons about Boon
  choices and one about an Ark the player did not know they had. Its Destinies are fixed too:
  Conquest, Dominion and Ascension, the three that need the least explaining, so there is no Maw in
  a first game.
- **The Destinies are a list, not three cards.** Down the card, one under the other, with OR between
  them, under "HOW THIS RUN CAN BE WON: You do not choose one." Side by side like the Boons on
  offer, they were taken for a choice of one.
- **First goals** (`game/data/goals.ts`, `ui/Goals.ts`): once the guide is over, a small box in the
  right-hand column names one thing to try next (give a world a role, hold 4 worlds, raise a world,
  build 6 ships, earn 3 Boons, destroy 10 enemy ships, capture a rival world). Pointing at it says
  how and why. Reaching a goal for the first time ever pays 40 Embers (`Game.cmdGoal`, once a run)
  and moves the box on; the profile remembers, and when all seven are reached the box is gone for
  good. They are an offer, not a script: nothing waits for them, and they can be reached in any
  order. This is how the guide goes further without more forced steps.
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
  profile. With auto-pause on (the default) the card **holds the game** until it is answered: OK
  (or Space), or LATER, which keeps it behind a flashing ★ TIP button. Nothing happens behind a
  card that is being read, and no order is taken either. A card waits until the player's hands are
  free (no ships picked with their destination still to come, no box being dragged; eight seconds
  at most), so that it never comes up in the middle of an order. With auto-pause off the card has a 22-second clock that only runs while
  it can be read (not behind a dialog, not while paused, not under the pointer). Every tip can be
  read again under How to Play (H) → TIPS.
- **Hover help** (`src/ui/glossary.ts`): about 70 glossary entries (game terms plus every Ark
  ability) are matched in any text. Hovering a Boon card shows boxes for its terms beside the card;
  event choices, abilities, omens, Destinies, Boons-screen entries, tray tiles and the world and
  fleet panels show them by the pointer. Everyday words (Embers, Lore, hull…) are only explained
  when nothing rarer is mentioned. Tip-only areas ("hints" in `Ui`) never take clicks from what is
  under them. The Boons screen totals list their sources (house, omens, each Boon, relics). The
  DOM menus underline glossary terms (dotted) and explain them, and controls carry `data-tip`.
  In the game, the words that pointing at a text would explain carry the same dotted underline
  (tooltips, tip cards, the banner, Boon cards): `Ui.termsFor` picks the terms, the text marks exactly
  those (`marksOf`), so every marked word has its box and every box its mark.
- **What the map and the HUD did not show** (second round of the first playtest): a world's **level**
  is three pips beside its name, lit up to the level, at any zoom that shows the name, and the next
  pip blinks while the world is being raised (the level used to be small text, zoomed in only, so
  finding the worlds not yet at III meant clicking through them). A place with **nothing left in
  it** has its name in grey (`Game.siteSpent`: an opened anomaly, an empty vault, the Corsair base
  once destroyed, the Maw once purged). A house that is **on the clock for a Destiny** is a
  countdown in the right-hand column (`Hud.destinyClocks`): "DOMINION · YOURS IN 1:32" in gold,
  "VAEL IMPERIUM · DOMINION IN 1:32" in red, pulsing in the last half minute, with what to do about
  it in its tooltip and a click that looks at the place; before, a hold was one line in the log and
  a tooltip that counted up. And the fleet card's chips are as wide as their ship, so a
  **Dreadnought** has its picture (it was the one ship too wide for the chip, and got none).
- **An Ark's ability is never lost, and its choice is never missed.** With auto-pause on, the choice
  of an ability opens by itself, once, like any other decision (it waited behind a small "ARK LEVEL
  5!" button at the edge of the screen, easy to miss right after the Boon that gave the levels);
  closed without a choice it waits behind that button. A rebuilt Ark is offered any ability it is
  owed (`Game.oweAbilities`: levels gained while there was no Ark, by the Ark Ascendant Boon, came
  without their ability). And that Boon is not dealt to a house whose Ark is at level 7 or 8, where
  its two levels would be lost (`CardDef.when`).
- **What the player sees is what happened.** A ship of the player's is never lost silently: the log
  says "Lost at Cinder to Ancient Sentinels: 2 Scouts, 1 Striker", one line per place that counts up
  while more are lost there (`Note.loss`), with an alarm only when the place is off screen. A shield
  bar is empty when the shield is (other bars keep one pixel while anything is left, but a shield
  that is shot down recharges a trickle at once and seemed to hold), and the moment a world's shields
  give way is written over it: SHIELDS DOWN. A click on one of the player's own ships always picks
  it, even while an order waits for its destination (before, the world around the ship took the
  click as a move order, so a second ship at the same world could not be selected).
- **What the third playtest found hard to read** (October 2026). The top bar keeps its tooltips
  above an open dialog (a Boon to choose is a question of Lore and Embers; under the dialog's shade
  they had gone), and the Lore and BOON tooltips say when the next Boon comes at the present rate
  ("The next Boon: 120 of 450 Lore in about 2:40"). A Destiny chip at the top right says how far it
  is ("3/12", "40%") and, once its Destiny is on the clock, the time left, in gold. A fleet whose
  drives are charging has a bar under its badge and a line in its card ("JUMPING IN 9 S: HELD BY AN
  ANTI-WARP FIELD, UNDER FIRE"): a charge held by a field and slowed by fire can last twenty
  seconds, and seed ships under fire looked as if they would not go. Salvage Crews and War Economy
  are one figure, **Embers from kills**, so each card shows what it adds to the other (two lines
  had each shown its own share, and War Economy seemed to replace Salvage Crews). The screen stops
  shaking while paused (the shake was wound down by the game's clock, so a Dreadnought's upgrade
  dialog shook for as long as it was open).
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
- **How to Play** (`src/app/howto.ts`), the page behind the title screen, is for someone who has not
  played yet and will give it half a minute. It was ten paragraphs, opened and not read. It is now
  the game in five moves, each a picture and a sentence (kindle worlds, give each a role, build a
  fleet, choose Boons, take the crown), then what is coming on one line of time (0:00 quiet, 10:00
  Corsairs, 12:00 rivals, 18:00 the Hollow), the controls as keys to look up, and what an Ages run
  is. Three of the pictures move, drawn with the game's sprites like the title screen's: a seed ship
  lights a world, each ship of the line fires on the one it beats, Lore fills and one Boon of three
  is taken. They stand still for a player who asks for less motion. What the old page said beyond
  this is taught in a run: by the First Night, the tips, and How to Play there (H). `npm run
  test:howto` checks the page at four sizes.
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
- **A pause is a pause to think.** While the game is paused, by the player, by an alarm or by a
  tip card, the player looks around and gives orders, and the game goes on when they are ready.
  Once the run has ended nothing acts any more (no key spends Embers or opens a Boon choice over the
  ending). Everything that takes input asks one question, `Session.mode` ('play' or 'none'), and
  every order the player can give goes through `ui/Actions.ts`, which asks it first. (From 1.3.3 to
  1.8 a pause was for looking only, for the feel of an RTS; a playtester paused and unpaused around
  every single order instead, and said it plainly: do not make the controls serve the feel, and do
  not punish the player who likes to think. `npm run test:stopped` checks both states.)
  Closing a decision without choosing parks it behind a "! DECISION" button.

## 6. Presentation

- **Feedback**: the Ember counter rolls toward its value and pops "+N"/"−N" for lump gains and
  spends; Boon cards are dealt (they slide in one after another); a chosen Boon flies to the tray;
  a rival Hearth falling gets a banner, a rumble and a chime; red arrows at the screen edge point at
  your worlds under attack off screen (click to look); after 40 s without input and with Embers
  piling up, a hint says what to spend them on (at most every 3 minutes, off with tips). The end of
  a run is its own moment: the screen dims, VICTORY or DEFEAT rises with the reason (gold sparks on
  a win), and a click skips to the results, where the Legacy total counts up.
- **The results put Legacy first.** Under the verdict, a gold-framed banner counts up the Legacy
  earned, says in two lines what Legacy is (kept between runs, spent in the Hall of Heirs on houses,
  perks and rarer Boons) and what it buys right now ("Enough for: Old Coin ◆40 …"), or how far the
  next thing is with a bar, and has the button to spend it. The first playtester took the Hall of
  Heirs for a leaderboard and nearly closed the screen: the only hint was one dim line under a
  table. The stats name the seed and the setup, and COPY RUN DETAILS copies version, seed, setup,
  outcome, Destinies, omens and Boons for a bug report (where the clipboard is refused, the text is
  shown to select), and a last line, `Data:`, that is the same and more for a machine to read: JSON
  in base64, so that no chat mangles it (`app/rundata.ts`: perks, relics, the player's figures and
  where every house stood).
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
  teal, sky, violet, pink). Houses: Concord gold, Vael red, Wayfarer teal, Lyceum violet, Choir sky,
  Ashen ember. Corsairs mist, ancient guardians dusk, the Hollow pink.
- **Worlds**: per-world lat/long noise textures mapped onto spheres lit from the upper left and
  quantized to the terrain ramp with a 4×4 Bayer matrix. Dark worlds use the cold ramp; kindling
  dissolves dark into color in Bayer order. Sprites are cached per pixel radius.
- **Ships**: character-art sprites (from the proposal mockup plus new hulls), rotated into 16
  directions with 4×4 supersampled nearest-neighbour sampling, tinted per house, with a 1-px shadow.
- **Text**: two bitmap fonts drawn from tinted atlases: a variable-width 5×7 font with lowercase and
  a 3×5 caps font for the map. The menus are set in Pixelify Sans and Press Start 2P, and the game
  carries its own copies (`src/fonts`, under the Open Font License): they are inside the one file a
  player downloads, so it looks the same with no connection, and the website serves them itself, so
  neither asks anything of another site.
- **Build keys** (as the top row of keys is in Age of Empires): with one of the player's worlds that
  builds selected (a Forge, or the Hearth), **Q W E R T Y** are the ship buttons of its panel, in
  their order, each with its letter in the corner; Shift with one queues five. With ships selected,
  or nothing, E and R keep their own meaning (Explore, Retreat). **Tab** goes to the next world that
  builds, the idle ones first (Shift+Tab goes back), and the top bar has a button for the ones that
  build nothing (an anvil and "2 IDLE"): a click there does what Tab does. Whenever one more Forge runs
  out of work it flashes, turning to fire and back for three seconds, then waits quietly. (As a bare
  number beside an anvil it read as one more rate, like the Embers'.) Tab, Q, Tab, W queues ships all over the
  house without the mouse. Control groups stay as they were (Ctrl+1 to 9 saves ships, 1 to 9 selects
  them, twice looks at them).
- **The Hall of Heirs** shows a house as the setup does: its banner (its Hearth and starting fleet,
  flying), its name, what it is, what it has in a list, and its price along the foot of the card, with
  how much Legacy is still missing. Every card is the same shape, whatever the length of a name. A
  perk or an unlock has a picture drawn with the game's own icons (Embers, Lore, a Guardian, a Boon, a
  star, walls, the Hearth; a Pact, a crown) in a frame that turns gold once the player has it; its
  name runs across the top of its card on one line, and the cards of a row start at the same height.
- **The small things** (the sweep of October 2026, `npm run test:qol`): the setup opens on the house,
  sector and difficulty chosen last time; Escape is BACK on every page behind the title screen; house
  cards and tick boxes are worked with the keyboard, and a page drawn again keeps the keyboard where
  it was; Settings has fullscreen (where the browser offers it) and, in a run, the track that plays
  with NEXT; a hidden tab is silent, the music stopping with the game; the dialogs that are read
  (Status, How to Play, the Comms Log) are one size; How to Play in a run is the same five numbered
  moves as on the title screen; the goal card names its goal in full; on a screen that is touched
  and has no mouse, the title says the game needs one.
- **Sound**: Web Audio pulse waves (12.5/25/50% duty), triangle and LFSR noise; a jingle plays when a
  world is kindled.
- **Music** (`src/audio/Music.ts`) is asked for by mood, and every mood has several tracks: the title
  screen (Hegemarch, The Empty Throne), a quiet night (Night Watch, Embers, Starlanes, Deep Field), a
  battle, while your worlds or fleets are fighting (To Arms, Breakers, Last Stand), and the cradle of
  an Ages run (First Fires, Long Road). It was one part of eight bars per mood, round and round: 15
  to 25 seconds, for a run of an hour. A track is now two parts played in an order, its form, with
  voices coming and going from pass to pass (the tune held back for the first, an echo behind it
  later, the drums in or out), and lasts 80 to 150 seconds. When it is over it comes home to its first
  chord, the night is silent for a few seconds, and another track of the mood begins: every track
  once, in a new order each round, never the same twice running. A battle does not wait between its
  tracks. A mood that is interrupted picks its track up at the part it had reached, so a skirmish does
  not send the night back to its beginning. The tracks differ in key, tempo, metre (Starlanes is in
  three), bass, drums and the wave that sings. When a run ends the music stops for the fanfare of the
  crowning or of the fall and stays stopped (it used to be started again on the next frame, and the
  fanfare played over it); the music of the results waits for the fanfare to be over, also for a
  player who skips straight to them. Under the smaller fanfare of an Ark that leaves its cradle the
  music steps back for two seconds and comes forward again. `tests/music.test.ts` checks the writing (every note in
  its key or its chord, no long note a semitone above a chord tone, no leap over an octave) and plays
  half an hour into a list; `npm run test:music` plays every part of every track through the real
  sound engine. **Settings has a Track row**: a selector of every track, grouped by mood, and NEXT.
  Picking one plays it from where its tune comes in (and turns the sound on, if it was off); the
  selector shows what is playing, also when the music moves on by itself. (It was a section of
  eleven buttons, which was most of the page.)
- **Sound that says where it is.** A browser plays nothing before the first click or key on a page,
  so the title screen used to be silent and the music came from nowhere at the first button pressed.
  The sound engine is now made when the page opens: where the browser allows it, the title theme
  plays with the title; everywhere else the first click or key, wherever it lands, starts it. A
  **sound button** in the corner of every menu screen says which: SOUND ON, SOUND OFF, or CLICK FOR
  SOUND while the browser waits. One click on it turns everything off or on (`settings.muted`, kept
  apart from the volumes); the click that woke the sound does not also turn it off. Settings has the
  same switch, on the menus and in a run. The button is a child of the screen that is showing, in
  the margin above its page: it stands beside that screen's scrollbar and goes up with the page when
  it is scrolled. (Pinned to the corner of the window, it sat on the scrollbar.) `npm run test:sound`
  checks it under both browser rules, and with a scrollbar that takes room.

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
- **The Ages run** has a section of its own: the climb the game's title screen draws for that mode
  (the swift line of each age marching toward an Ark), with the six ages named under it.
- **Nothing moves unasked** for a visitor who prefers reduced motion (a still picture and a button
  stand in for the live sector), the sector waits while it is off screen, and with scripts off the
  page is the picture, the pitch and the PLAY button.
- **Round the page**: a footer with the ways on (the game, itch.io, the source) and the licence of the
  typefaces; a page of its own for an address with nothing at it (`site/404.html`: a dark world and
  the way back); what a link to the site or to the game shows when it is shared (title, a line, the
  picture); the color of the browser round it on a phone. The game's own page says it needs
  JavaScript to a browser that has it off, where it used to be blank.

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
- `test:sound`: the sound button and the first click, with a browser that waits for one and with one
  that does not, at desktop and phone widths.
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
