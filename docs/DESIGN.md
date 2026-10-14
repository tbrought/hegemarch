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
  (+25% at it; a **Forge** that fits its world builds its ships **15% cheaper** instead, `forgeFit`:
  a Forge that built a quarter faster was hardly felt, the third playtest found). A newly kindled world starts as a Mine, and the **first role its house gives it costs no
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
    **A Bastion's field reaches one jump** (`Game.fieldReaches`, `isBastion`): it covers its own
    world and every place one starlane from it, at every level, with nothing else needed. That is
    the whole rule, and it is the one a player reads off the map: the fourth playtest's host made a
    Bastion, saw the field round that world only, and asked whether it was a bug. (It was the rule
    of 1.13: fields *linked* between two strongholds within two or three jumps, so a Bastion alone
    did nothing past its own world, and its card's "NO FIELD OF YOURS WITHIN 2 JUMPS TO LINK" said
    what was missing and not what to do. It had passed on paper: it could be drawn on the map, and
    it left a choice. It failed the third test, which is that what a player does shows its effect at
    once and on its own. Before that, 1.11 had reach by level: its own world, then its system's
    star, then the whole system. One level III Bastion did it all, and no second Bastion was ever
    worth its role.) A level makes a Bastion stronger, not wider. A Hearth's field and a Starbase's
    hold their own world only, and in the cradle a Bastion holds its own land only. Fields do not
    add up: a place two Bastions reach is held once.
    **A Bastion protects the worlds of its house one jump from it** (`Game.guardsOf`, `guardOf`,
    `FIELD_GUARD`): they take 20% less damage while it stands, 30% at level II, 40% at level III.
    It is what a Bastion is for. The third playtest's host did not see why he would build one, and
    said that going straight for the Hearth and ignoring every other world was the one tactic there
    was; he asked for Bastions that bar the way, or cost a fleet its shields and a share of its hull
    for flying past. Both tax movement, which is bad to play: a fleet is punished for going where it
    was sent. Protection takes nothing from anyone. A fleet flies where it likes; a Hearth with a
    Bastion next door is simply slow to crack, and taking the Bastion first is the better play,
    which also gives ships that break worlds their job. A Bastion protects its neighbours, not
    itself (next to a Hearth it is the way in); two Bastions next to each other protect each other,
    which is all the "interlocking" there needs to be. Of two Bastions next to one world the
    stronger counts, and both must fall before the protection is gone.
    On the map a Bastion's starlanes are drawn in the field's violet and each place it reaches wears
    the field's ring; a protected world wears a thin violet ring close about it, which flares when
    it takes a hit. The cards say it from every side ("FIELD ALSO REACHES THE 3 PLACES ONE JUMP
    AWAY", "PROTECTS AURELIA: 20% LESS DAMAGE", "PROTECTED BY CALYX V: 20% LESS DAMAGE", "FIELD FROM
    CALYX V: ENEMIES JUMP 6S SLOWER", and for a Bastion of the player's with no world of theirs next
    door, "NO WORLD OF YOURS ONE JUMP AWAY TO PROTECT"). (The word is "protected", not "walled": a
    Hearth's walls are its strength in the first minutes, another thing.) And the choice can be seen
    before it is made: the Bastion button's tip says what the role would do at this very world
    ("Here its field would reach 3 places and protect your Hearth and Calyx II"), and while the
    pointer is on the button the map shows it, blinking (`ViewState.fieldPreview`).
    So where a Bastion goes is the decision. A world has two starlanes at the median, so a Bastion
    protects one or two worlds; only about a third of Hearths have a neighbour that also touches
    their star, so protecting the Hearth and holding the system's crossroads are usually two
    Bastions' work. **Every Hearth has a world next door** (`mapgen.ts`): one Hearth in six had only
    its star and an anomaly for neighbours, and nothing could have protected it. Such a Hearth now
    gets a starlane to its nearest world (one that crosses no other lane and runs through no place,
    where there is one), so a seed that had such a Hearth makes a sector with one starlane more.
    Rival houses keep one world next to their Hearth for a Bastion (it is the first world a house
    kindles, and went to its first Forge or Observatory: 4 Hearths in 48 were protected until the
    choice of roles kept it), then put Bastions next to as many of their worlds as may be. They
    count a protected world as that much harder, and the Bastion that protects a Hearth as worth
    going for. In twelve AI-only games on medium sectors 37 of 48 houses built a Bastion, the first
    at minute 9 at the median, and 36 had their Hearth protected by one; a Bastion protected two
    worlds at the median, three at the most. Pace is within what the seeds vary by (40 seeds,
    Normal: small 36 and medium 32 of 40 games decided within the hour, against 34 and 35 with
    links; medians 41 and 41 minutes, against 46 and 39).
  - **Under fire a drive spools at half speed** (`UNDER_FIRE`, `FIRE_SPOOL`): a ship hit in the last
    two seconds takes twice as long to get away. Running from a fight costs time.
  So a raid on a Bastion is a commitment, a Bastion is the buildable answer to raiders, and the
  place to catch a fleet that keeps running is its own Hearth.
- **Kindle**: press KINDLE on a dark world; a seed ship launches from your nearest world and kindles
  it in 20 seconds once nothing that fights is there. It costs 120 Embers plus 30 per world you hold.
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
- **Two houses, one dark world** (1.18). Only what fights stops a kindling: a warship, a guard, a
  Corsair (`kindleBarred`, `fights`). Another house's seed ship does not, nor its Scout, nor a
  Starfall. Two seed ships at one world both kindle it, the first to finish has it, and the other is
  called off where it stands and does the next KINDLE for free, as a seed ship always did when its
  world stopped being dark. Until 1.18 any ship of another house stopped a kindling, a seed ship
  too, which cannot fire a shot: two of them waited for each other for good. A playtester reported
  three things that were this one: "they get blocked", "a race around seed ships late on", and "four
  planets with stalled seed ships in front of them". (He also thought seed ships outlived their
  house. They do not: in forty games no ship of a fallen house did, on a starlane or idle.) It was
  not rare, it was the usual state of a seed ship: in forty AI-only games a seed ship spent 54% of
  its life in such a stand-off, 22% kindling and 19% on its way. There were 230 stand-offs of twenty
  seconds or more, in 34 of the 40 games, a minute and a half at the median; 54 lasted over five
  minutes, one for fifty, and they ended when somebody's warships happened by. The note said "its
  defenders must be cleared first", and the world's card showed no defenders. A house's army also
  counted a dark world with a rival's seed ship on it as held, and marched there. With the rule
  there is no stand-off left (0 in forty games), 16% of seed ships kindle nothing where 21% did, and
  the sector fills as fast (30 worlds by minute 15, as before).
  - *The race can be read.* Each seed ship at work has its ring round the world, the second outside
    the first; the dark world's card says who else is kindling it and how far, and that warships of
    another house hold it when they do; the note names who finished first, and what bars a waiting
    seed ship ("the warships of Vael Imperium there must be driven off first").
  - *Rival houses.* A rival sends no seed ship to a world another house's has already reached (that
    one finishes first) and does send one where only a Scout stands. One of its seed ships that lost
    and has nothing else to kindle goes home to its nearest world instead of standing at the
    winner's. Its army goes for a dark world only when something that fights holds it.
  - *What it closed.* A Scout parked on a dark world denied it to every rival for 40 Embers, and a
    rival's Scout passing through stopped the player's kindling and threw away what was done.
  - *Pace*, on the same forty seeds: 32 games decided within the hour at a median of 37 minutes,
    against 31 and 40. On the cradle of Ages, 30 of 30 at a median of 34 minutes, against 30 and 37.
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
range, anti-heavy), **Dreadnought** (capital ship that levels up, max 2, and no hangar room: it is the
house's flagship, not a slot in its fleet), **Starbase** (one fortress
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
three minutes. If three of the player's drafts pass without a Blueprint, the next always shows one,
and one the run has not shown yet (see below). Rerolls, skipping for Embers and "decide later" are
available.

**Rarity.** A card is drawn by weight: Common 62, Rare 27, Epic 9, Legendary 2.2 (Blueprints ×1.6,
Pacts ×0.55). An Epic is in about 24% of offers. Two things in the Hall of Heirs change that, and
both say in numbers what they do, because a playtester had bought every rank of both and seen
nothing rarer than a Rare:
- **Fortunate Stars** (five ranks since 1.11) adds half again to the weight of an Epic Boon with each
  rank and, since 1.18, one and a half times the weight of a Legendary (and moves a little from
  Common to Rare): an Epic in about 32%, 38%, 44%, 49% and 55% of offers, and a Legendary in 5%, 7%,
  9%, 11% and 13% where no rank gives 2% (`EPIC_ODDS`, `LEGENDARY_ODDS`, measured over 600 runs and
  kept true by tests that deal the offers). The Hall shows both in a table under the perk, a figure
  for every rank and the rank held lit (`perkOdds`). In 1.18.0 they were sentences ("an Epic is in
  24% of your Boon choices and a Legendary in 2% now; 32% and 5% at rank 1, 55% and 13% at rank 5"):
  true, and a paragraph of figures beside cards that say what they do in a line. The table says it at
  a glance, and what each rank buys; Legendary Lineage says its guarantee and no figures.
  Until 1.18 a rank added half a Legendary's weight, like an Epic's, which sounds the same and is
  not: there are five Legendary Boons among some sixty, so all five ranks took them from 2 offers in a
  hundred to 6. With the promise below and three rerolls, a run of fourteen choices showed 1.2
  Legendary Boons with no rank and 1.6 with all five, for 770 Legacy. The same playtester, a second
  time, with every rank: "the return on those points didn't feel dramatic". It shows 2.3 now, and
  two or more in 79 runs of a hundred where it was 48. A player with no rank sees what they saw.
- **Legendary Lineage** guarantees a Legendary Boon in every run: if none has been offered by the
  fifth offer (`LEGENDARY_BY`), that offer holds one, in place of a Common Boon and never of a
  Blueprint. Left to their odds, three runs in four show none. It is a promise to the player only; a
  rival house draws as before (Legendary Boons from Hard).
- **Legendary Boons are open to every player** (1.18.3), at their odds, as the table says; only the
  First Night keeps to plain ones. Until then Legendary Lineage was also the gate: without it none was
  ever offered. So the Legendary figures of Fortunate Stars counted for nothing until another thing
  was bought, and three ways of saying so in the Hall all read badly (sentences of figures; a grey
  row with a note pointing at the other card; a row that was simply not there, which hid that the
  ranks would ever do anything for Legendaries). The rule was the trouble, not the words: without
  the gate each card says what it does, and every figure on Fortunate Stars counts from its first
  rank. A player with no rank and no Lineage now sees a Legendary in a run of fourteen choices about
  one time in four (2% of choices).
- **The Blueprint that is owed** (1.18) comes to the player after three offers without one, where it
  was four, and is one the run has not shown yet while there is one (`BLUEPRINT_BY`,
  `Faction.bpSeen`). The same playtester spent a run and all his rerolls looking for the Starfall's
  and did not see it. That was no accident: a run of fourteen choices showed it to 55 players in a
  hundred with no rank of Fortunate Stars and 81 with all five, and by the sixth choice to 29 and 53
  (a weapon of 2,500 Embers that turns up at the thirteenth choice is not built). Now 77 and 89, and
  by the sixth choice 41 and 58. Its rarity is as it was. Two stronger rules were measured and left:
  drawing the two Epic Blueprints twice as readily showed it to 94 in a hundred of those with every
  rank, and made an Epic
  Blueprint nearly as common as a Rare one. And it is the player's promise alone, like the one
  above: given to rival houses too, 98 of 160 held the Starfall's Blueprint where 73 had, they armed
  34 Starfalls in forty games where they had armed 20, and 28 of the games were decided within the
  hour where 31 had been. With rivals dealt to as before, those are 69, 21 and 32.
- **The odds are on the Boons page** (1.18). Under the totals: YOUR NEXT CHOICE, with the chance that
  it holds a Blueprint, an Epic, a Legendary. The playtester asked for the drop numbers "so you can
  see what your chances are", and a chance that is only felt cannot be told from bad luck. They are
  not looked up: the next offer is dealt three thousand times as the run would deal it at that
  moment, with dice of its own (`offerOdds`; dealing is one function, `deal`, that rolls the dice it
  is given), so the figures follow the Boons still to be had, the rank, the number of choices, the
  Blueprint that is owed and the Legendary that is promised. Each figure's tooltip says which of
  those applies ("your next choice holds one", "2 more may pass before it", "Legendary Boons can be
  offered once you own Legendary Lineage"). All three are always there, grey at 0%.
- **Not built: a perk that makes every Boon stronger**, which the playtester floated and withdrew in
  one breath. A Boon's text is its effect ("+30% Embers"), and would stop being true; a Blueprint or
  a Boon that switches something on has nothing to scale; and a multiplier under everything is a
  difficulty setting that cannot be seen, which is the complaint it was meant to answer.

How Boons read:
- **Effect text** is marked up in the data: `[gain]` draws teal, `[!drawback]` red, `{keyword}`
  gold, and game terms (ship types, roles, Embers, Lore, Hearth…) are found and drawn gold
  automatically (`src/render/rich.ts`). The same markup colors relics, omens, house bonuses, Ark
  abilities, event choices, role tooltips and the Hall of Heirs perks.
- **Cards** carry a category icon, a rarity frame (double for Epic, Legendary and Pacts; a spark runs
  round Legendary cards; an Epic's and a Legendary's header is filled with its colour), up to three
  "before → after" lines computed by applying the Boon to the house's real modifiers
  (`Game.computeMods`, `src/game/modstats.ts`), and a NEW or STACK ×n→×n+1 tag.
- **The deal** (1.19, `ui/modals/reveal.ts`). The places of the cards appear one after another,
  dashed, empty. Then each card is beamed in on its place, like a ship on a transporter pad: lights
  run down the sides of the pad, motes of white and the card's colour rise and twinkle, and the
  face is drawn in line by line from the top behind a white scan line. The cards come the commonest
  first and the rarest last, each after a beat that is longer for a rarer card (a Legendary's is
  half a second), and while a rarer card waits its empty place already shows a few motes of its
  colour: an Epic or a Legendary is seen coming. Once a card is all there its face flashes white and
  its colour (once for a Rare, twice for an Epic, three times for a Legendary), an Epic or a
  Legendary throws pixel sparkles round its frame, each rarity has its own chiptune sting (a
  Legendary's an "item found" fanfare), and a Legendary sets the dialog's frame flashing gold for a
  second. Three Commons take about a second and a half, a hand with a Legendary a little over two;
  a click or a number key while they come brings them all at once, and takes none unseen
  (`skipDeal`, `Modals.revealing`). A player whose computer asks for less motion gets no flashes.
  Under the pointer, once all are there, a card grows three pixels on each side, rises, and stands
  off the table on a hard two-pixel shadow. Before it the cards slid up 40 pixels in a third of a
  second, rarity was a colour of frame, and hover lifted a card two pixels: an Epic looked like a
  Rare in purple, and nothing was heard. The user wanted it to "feel really cool" when an Epic or a
  Legendary shows up. A mockup page in smooth web animation (glows, light rays, scaling) was turned
  down as not of the game; seven styles were then made in the game itself and filmed with the same
  hands (`npm run record:draft` films the deal as it is): turned face down, reels of a fruit
  machine, beamed down in a column, stars of rarity counting up, a strike from above, a pillar of
  light left standing, and this one, which was chosen.
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
- **The last stand** (1.17.3): once a Hearth's shields are gone, every ship of its house comes to it,
  whatever the odds (`breached`, `AIState.breach` in `ai/ai.ts`). The gathering above had no end: too
  few to win, the ships waited a jump short until they were enough, and if they never were, they
  stood there while the Hearth fell. A playtester of Ages took a capital with the rival's army
  watching from the next land, and it was how most houses died: in forty AI-only games 57 Hearths
  fell to another house, 42 of those houses still had a fleet, and at the median all of it stood
  within two jumps and none of it at the Hearth; in 14 the fleet standing by was worth a quarter or
  more of the attackers (24 ships at the median). On the cradle it was 5 of 22. A house that loses
  its Hearth loses every ship with it, so those ships were kept for nothing. The shields are the
  sign that an attack is in earnest: a raid that cannot crack the Hearth does not get that far, and
  until then the ships still gather, so that they come together. The house stands by its decision
  for half a minute after it last saw the shields gone (`STAND`): they trickle back under fire, and
  ships that turned round with every flicker would never arrive (the loop of the third playtest).
  It rarely saves the Hearth, and is not meant to: outnumbered three to one, a house falls as fast
  as before (about 37 seconds with its army a jump away). It makes the Hearth cost. With the
  attackers at three times the army's strength they lost 29% of their ships where they had lost 6%
  (39% against 12% among the stars), and at twice, 57% where they had lost 14%. No house's fleet
  stands by any more (0 of 56 falls, 0 of 22 on the cradle), and only 7 of the 56 houses still had a
  fleet when their Hearth fell. Pace: 31 of 40 games decided within the hour at a median of 40
  minutes, against 34 and 43; the cradle is unchanged (a median of 37 minutes). An early rush lands
  as rarely as it did (0 of 8 on Easy at 4:30, 0 of 8 on Normal at 7:00). Three other rules were
  tried on the same games and did no better: the shields half gone, going in as soon as the ships
  have gathered, and always going straight in.
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

### The Starfall
A playtester asked for two weapons: a planet buster that blows up a world and closes the route through
it, and a device that makes a sun go nova, planted like a bomb, with two minutes for its enemies to
defuse it. The Starfall (1.17) is the second, with the best of the first in it.

- **What it is.** An Epic Blueprint (`bpStarfall`; never offered in the First Night). With it the Hearth
  builds a Starfall for 2,500 Embers in a minute: a slow, unarmed ship that takes no hangar room. A
  house has one at a time, and each costs 1,000 more than its last (`STARFALL_STEP`).
- **Arming.** ARM at any star (`cmdArm`). From then on the Starfall does not move and cannot be called
  off. Every house is told, a clock stands over the star and at the top right of the screen, and
  every other house holds it against the one that armed it (the grudge rival houses bear a house that
  struck them: the playtester's own price for such a weapon).
- **Defusing** is destroying it. There is no new verb. It is a structure, so Breakers and Lancers are
  the ships for it. With nobody defending it, fifteen ships of the three kinds destroy it in 40
  seconds, eight in 73, four Breakers in 67 and four Lancers in 51; six Strikers do not in the two
  minutes, nor does an Ark alone. (Its first hull, 7,000, took the fifteen a minute: more than a
  fleet has left after the way home.)
- **The eruption** (`systems/starfall.ts`), 2 minutes later (`STARFALL_FUSE`): every ship at a place of
  that system is destroyed, whoever it belongs to, the armer's too, with Starbases, a Starfire Gate
  and the Corsairs' Stronghold. Every world of a house there is **scorched**: its shields are gone, it
  loses a level, and its Glow is back where a new world's is. That is the rule a sacked world already
  followed, and nothing else: no hull is touched, so **no world changes hands and no Hearth falls**.
- **The fire.** The star then burns for 3 minutes (`STARFALL_BURN`): a ship there takes 120 damage a
  second, which a Striker does not survive and a capital ship does. Ways are planned round a burning
  star where there is another way. Where there is none (the worlds of that system have no other), **a
  ship waits where it is until the fire is out, and flies on then**: rally points, Scouts, seed ships
  and rival fleets alike. Only its house's own order sends a ship through, and for the player that is
  the same order given twice: the first says that the ships will wait, the second sends them.

What decided its shape:

- **Routes run through stars, not worlds.** In twenty sectors of each size a closed star cut off the 6
  worlds of its system, and in 31% of cases (medium) parted other systems from each other as well; a
  closed world cut anything off in one case in five, and then one place. So the half of the planet
  buster that was about routes belongs at a star.
- **A world that is destroyed is gone from every later minute of the run**, from the income of the
  sector and from "60% of all worlds", which a house could then win by deleting what it cannot hold.
  Against a Hearth it would be a 2,500-Ember win, and against a Bastion it would do the job that 1.16
  gave to Breakers. Scorching leaves the map whole.
- **The price** is what a house earns in about 3 minutes from minute 15 on (a median income of 12 to 15
  Embers a second in AI-only games; the richest earn it in 80 seconds by minute 30), and hangars are
  95 to 98% full from minute 15 to 30: the Embers of the late game had little to go to.
- **Two minutes** is what the way home takes with something to spare: a fleet at a rival's Hearth
  reaches its own home star in about 70 seconds on a medium sector (53 to 90), which leaves some 50
  seconds to destroy the Starfall. At 90 seconds one fleet in ten would come too late.
- **Deadly, not closed.** A star that nothing can pass leaves fleets and rival houses with no way to
  where they are going, and a map in two pieces. A fire that can be crossed at a price is the solar
  flare the game already had, longer, and it is the playtester's own words ("transitable with
  certain boons").
- **A Starfall wins no Destiny by itself.** It takes no Hearth (taking one is the game's biggest prize:
  a house gone, its worlds sworn over, up to 6,000 Embers and a free Boon), and it does not harm the
  Rift Heart, which would hand Purge the Void to whoever held a star for two minutes while the
  Hollow's swarms flew past. It does destroy a Gate: that is an answer to Ascension behind walls, and
  it still takes two minutes of holding the star next to the house's whole fleet.

What that leaves at a Hearth's home star: a house keeps 83% of its worlds there and three quarters of
its Embers (AI-only games, minutes 20 and 30), so an eruption is a blow to its economy for a minute
and a half and a level off every world; but only 3 to 6% of a rival's fleet is at home, so it kills
little unless the fleet comes home and loses the fight for the Starfall. What the armer gains is that
the defender must come out and fight at the star, away from the Hearth's guns. A house may burn its
own home star: a besieger must leave, destroy the Starfall, or take the Hearth first (a fallen house's
ships are destroyed, its Starfall with them).

The smaller rulings: ships on a starlane are at no place and fly on (those bound for the star arrive
in the fire); seed ships die and are reported; the guards of dark worlds die and the worlds stay
dark; relics, derelicts and anomalies stay; the Choir cannot convert a Starfall; a second Starfall at
the same star is destroyed by the first eruption, and none can be armed at a star that burns; a solar
flare never picks a star with an armed Starfall; a house still asleep on its way from the cradle is
not touched; the cradle builds none.

**Rival houses** (`ai/ai.ts`). A house with the Blueprint builds one when its hangar is nearly full,
nothing threatens it, and **its own attacks have got nowhere**: it gave one up on a rival's world and
has taken none since (`AIState.stalled`; not before minute 16), or the run is past minute 35 with
nothing decided. It keeps
its Embers for it meanwhile (no levels, no bays, no ships beyond its standing fleet). It picks the
star whose system is worth most to its enemies and holds no world of its own, the system that
stopped it counting two and a half times (`starfallStar`; **on Easy never the player's home star**),
meets its army at its world nearest that star, goes there with it and arms once the star is theirs.
For some minutes after the fire, what it scorched is worth twice as much to its army. Every house
with worlds in that system comes to destroy the Starfall if it is enough against the escort (for its
Hearth's system every ship answers, from anywhere), and its Breakers, Lancers and capital ships go
for the Starfall while the rest fight the escort. Whoever is in the system gets out before the end:
ships at the star at the last moment, ships at its worlds 40 seconds sooner, and nobody is sent in
during the last minute. In forty AI-only games on
medium sectors, with the houses drafting as they do, 75 of 160 houses held the Blueprint by the end
and 40 Starfalls were built; 20 were armed (12 of them at a house's home star, the earliest at minute
25, the median one at minute 40), 12 stars erupted and 8 Starfalls were destroyed in time. An
eruption scorched 5 worlds and took 2 enemy warships at the median, 56 where a fleet had come to
fight for it, and no ship of the armer's own. A rival armed one in 11 of the 40 games, and won 6 of
those. Pace is as it was: 34 of 40 games decided within the hour at a median of 43 minutes, against
35 and 43 on the same seeds with the Blueprint in the pool and no house using it (and 32 and 41
before it was in the pool: a new Boon deals every draft anew). Conquests were 6 against 10, and
Ascensions 8 against 4.

(The first rival behaviour built one whenever it could, from minute 16. A house that was winning by
ordinary means then stopped to save for it and march to a star: a rival armed one in 18 of the 40
games, 30 were decided where 35 had been, and conquests fell from 10 to 4. A Starfall is for the wall
that would not fall.)

`npm run record:starfall` films one from the game's own canvas and sound (a fleet brings a Starfall to
a rival's home star, the rival's ships come for it, the fleet leaves at the last moment, the star
erupts and burns) and takes pictures of every state on the way; `scripts/film-frames.mjs` takes stills
from a film, for checking one without watching it. (Looking at those pictures found what no test had:
the Blueprint's card had no picture, because the cards could not draw a Starfall, and its text ran off
the card; and the flash of an eruption was a white square half a screen wide. 1.17.1.)

**What it looks like** (1.17.2). The first Starfall was an oval the size of an Ark, and the playtest's
host asked for it big and plain to see, so that a player can find it and shoot it. It is a star in a
cage now, 23 pixels across where an Ark is 11: a white-hot heart in gold and ember with a corona that
flickers, a ring with four struts, four clamps and four prongs, the same from every side (it does not
turn), with three motes circling it. Armed, its heart beats red and white, the motes run faster as
the time runs out, and a red ring closes on it once a second with four marks: the thing to shoot.
From so far out that ships are dots it is a cross (red and blinking once armed), and the minimap
marks a star with an armed Starfall in red and a burning one in ember. Only its picture grew: what
the simulation counts as its size is as it was, so the golden traces did not move. The few places of
the HUD that draw a ship in a small slot (a chip of the fleet's card, a slot of the queue) show its
sign instead, and a Boon's card draws it as big as its window allows. `scripts/starfall-look.mjs`
takes its picture in a fleet and alone, armed and not, from every height.

**Seen by the house that armed it** (1.18). The playtester who had asked for it: "I wasn't sure
exactly how much damage it did because I didn't have any way of seeing it, so it lost in drama a
little bit." He had not: a Starfall at a star saw that star and none of the system's worlds, and
when it erupted it was gone and its house saw nothing at all. Staged at a rival's home system of
seven places, the player saw one of them through the fuse and none after; seventeen ships went up
under fog, and a note said so. (The film of 1.17.1 had not shown this, because it was shot with the
fog lifted. `record:starfall` now shows what the player's house sees and no more.)
- An armed Starfall lights the whole system for its house, and the star it set alight goes on doing
  so while it burns (`visibilityTick`): two minutes of watching who flees and who comes for it, the
  eruption with every ship that goes up, and three minutes of looking at what is left behind a fire
  nobody can cross. A Starfall that is destroyed in time shows nothing more. It is the same for a
  rival house; no other house sees more for it.
- What it took stands over the star in large letters for seven seconds once the flash has cleared
  ("17 SHIPS · 1 WORLD"), for every house, as the eruption itself is; SCORCHED rises over each world.
- The note says whose they were: "took 23 ships (Vael Imperium 14, The Choir 6, yours 3)".
- Rival houses use it as they did: in forty games 21 armed and 12 erupted, against 20 and 12.

On screen: STARFALL is on the Hearth's card from the moment the Blueprint is drafted, and ARM on the
Starfall's card from the day it is built; both are greyed with the reason when they cannot be pressed
("One Starfall at a time", "Only at a star"). A star with an armed Starfall blinks as before a flare
with the time over it; every card in that system says what is coming ("THIS WORLD WILL BE SCORCHED",
"GET OUT: TALITHA ERUPTS IN 1:12"); a burning star says how long it burns, and a fleet in front of it
says that it waits and why. A tip explains a rival's Starfall the first time one is armed.

Two things the code learned from it. A field that most ships never have (`Unit.fire`) is written only
where it is set: written to every ship that arrived anywhere, it gave the ships of one game many
shapes in memory, and every loop over them ran two to three times slower. And a field that is given
up is deleted, not set to undefined: a save drops the one that is undefined, and the game that loads
it then puts the field back in another place than the game that went on, so the two no longer save
alike (found by `scripts/fuzz.ts`, which now builds, flies and arms Starfalls and sends ships through
fire). The same thing had sat in the rival houses since 1.9 (`ai.siege = undefined` when a siege is
called off) and did no harm until 1.17 gave them a second field that comes and goes (`stalled`); the
Ages fuzzer found it at 1.18, on the first seed whose game the new rules sent that way.

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
  good. Since 1.22 the box marks a goal reached (see below) before it moves on. They are an offer, not a script: nothing waits for them, and they can be reached in any
  order. This is how the guide goes further without more forced steps.
- **Unguided runs** say the same thing in the banner: once the first Boon is chosen, "Your Scout
  waits for orders…" until a Scout explores (for the first five minutes), and the EXPLORE button
  pulses until then.
- **Progressive reveal** on a guided run: Embers, the banner and the clock at first; the Lore meter
  after the first kindle; fleet badges after the first ship; Destinies and the Status screen after
  the first Boon; the minimap and comms log once an enemy is sighted.
- **Omens**: an unguided run opens with one card naming the sector's two omens and your ambition;
  after that they live in the Status screen. Since 1.22 they come in under their stars (see below).
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
- **The way a fleet will go** (third playtest). An order draws the way the ships will take, stop
  by stop, bright for a moment and then dim for as long as they are selected; a leg into a place
  the house knows to be dangerous is red (`Game.dangerKnown`: enemy ships or guns it sees there
  now, a world it last saw held by a rival, or a charted place guarded by monsters or Corsairs; a
  rival fleet out of sight is not known). The playtester had sent fleets through an enemy fleet
  that sat on a star he could see, because nothing showed him the way they would go.
  **Shift+right-click** (or Shift with the click of a MOVE order) adds a stop after the one the
  ships are bound for, as many as wanted; a drive that is charging goes on charging.
- **An offering takes a ship that can be offered.** The Whispering Rift asks for "the ship that found
  it", which is the first of a fleet to be counted there; when that was the Ark (never offered), the
  choice was greyed with six other ships standing by, and its tooltip said "You cannot afford this".
  Now the finder is taken unless it is the Ark or gone, and then the least costly of the house's
  other ships there (`offering`); the card names the ship ("Lose a Scout (your Ark found it, and an
  Ark is never offered)"); and a choice greyed for another reason than its price says the reason
  (`EventChoice.why`): with only the Ark there, to send a ship and choose then, the decision waiting
  behind its "!" meanwhile. And an anomaly waits for the rest of a fleet of the player's that is on
  the last starlane to it (`ANOMALY_WAIT`, half a minute at most): the decision may stop the game,
  and ships a second behind the first would then never arrive to be offered.
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
- **A decision is a page of a storybook** (1.20, `ui/modals/event.ts`, `ui/modals/storyText.ts`).
  It opens from its middle; under the title a picture of what it is about (what its choices touch,
  a Dreadnought turning beside an Ember) is alive in a window of deep space; the story comes in word
  by word, nine words a second, each word fading up out of the dark over a third of a second and
  settling a pixel as it does; a phrase of every story, marked in braces in the data (`EventDef.text`,
  one or two a story, a test holds it), is picked out in gold and rides a slow ripple a pixel high;
  then the choices slide in from the left one after another, and the outcome comes in the same way,
  in gold. A soft tick every third word. About two and a half seconds in all for a story of twenty
  words; a click, a number, Space or Enter while it comes brings all of it and answers nothing
  unseen (`skipEvent`, `Modals.revealing`), and the choices take no click until they are there.
  Before it the dialog was all there at once, the same frame as a tooltip's, and a player said so:
  "it just feels like a tooltip". Four ways in were made in the game and filmed (this one, a
  transmission decoded out of static, an old role-playing game's window typed letter by letter, a
  dialog that grows out of its place on the map); then three ways for its story (word by word,
  letter by letter, line by line as ink spreads), after the first cut was found jittery and too fast
  and its effects on the wrong text (on the choices, not the story). `npm run record:event` films
  it.
- **A ship rising a level powers up** (1.21, `ui/modals/event.ts`). Above the abilities to choose
  from, the ship itself is in a window of deep space: three rings close on it, the window flashes,
  and LEVEL n comes up beside it in large gold letters and stays; then the abilities fade up one after
  another (`LEVEL_UP`). A whine rising with the rings, a chord at the flash. All of it is there in
  about a second and a third; a click, a number, Space or Enter brings it at once, and the abilities
  take no click until they are there. Opened again later (its button), it is there at once. Before
  it the choice was a plain list. Three ways were filmed in the game: this one, the abilities beamed
  in as the Boon cards are, and a line of story word by word; the beam made a level-up look like a
  Boon draft, and the story was slow for something that comes several times a run.
- **The big moments of a run are heralded** (1.21, `ui/hud/herald.ts`). A rival house falls, your
  Last Stand, a rival begins or nears a Destiny (its Starfire Gate rising, charging, half charged;
  dominion, relics or a full hoard on the clock), a rival arms a Starfall, the Maw opens, you enter a
  new age, a rival's Ark rises or leaves. The game marks these (`Note.herald`: a title, a line, a
  colour: the house's own, gold for your triumphs, red for alarms, pink for the Hollow) and the HUD
  announces them across the upper part of the screen, in a band that drifts in from the left as it
  fades up, holds, and drifts on to the right as it fades away. The log keeps the full sentence; a
  herald replaces the toast for that news. What the player's own house does (its Gate, its Starfall,
  its hoard) is only told: it is news to nobody. A herald must never be in the way, so:
  - *The game does not stop for it.* A herald is news, not a question; the battle the player is
    fighting goes on under it, and orders, selection and the map under it work as ever (it takes no
    click). Under the pointer it turns see-through, smoothly, so what is under it can be seen. News that needs the player's hand already pauses the game when auto-pause is on (a
    Starfall armed where they have ships or worlds, a new age, an Ark leaving); the herald then plays
    over the paused map, which is when it is read.
  - *It waits while a dialog is open* (the game is stopped then too) and plays when the dialog closes.
  - *Several come one after another*, each held for a second less while another waits (`heraldTime`):
    a herald is on the screen for 3.2 seconds alone, 2.2 with another behind it, and one already far
    into its hold when another comes starts leaving from where it is. No more than three wait, the
    same news is never queued twice, and news that waited more than ten seconds of game time is
    left to the log.
  - *It is gentle.* It drifts 40 pixels, never more than about three a frame, and fades rather than
    slides across the screen; it is never wider than the screen, and sits under the objective banner.
    It makes no sound of its own when it shows at once (the news has sounded its alarm already); one
    that had to wait comes with a soft whoosh. Never over the end of the run.
  Three ways were filmed in the game: this one, black bars of a film closing in with the title fading
  up between them, and a title that slams down with a rumble. The other two put their words straight
  onto the map, where a ship under them showed through; the bars also covered the HUD for three
  seconds. `npm run record:herald` and `npm run record:ability` film the two.
- **The omens come in under their stars** (1.22, `ui/modals/cards.ts`, `ui/modals/omensPlan.ts`).
  Above the omens a window of the sector's sky: a star lights for each omen in turn (a ring closing on
  it, then a sparkle that twinkles on), joined to the last by a dotted line, as its omen fades up
  below; the Ambition's star lights last, in gold, with a flash, its rule turns gold and sparkles run
  round its heading. A note as each star lights, a sting for the Ambition. About 2.3 seconds for two
  omens and an Ambition (`omensPlan`); a click on the card, a number, Space or Enter brings all of it
  (a key it takes for that does not also close it: until 1.22 Space or Enter on this card closed it,
  and would now have closed it unread), and BEGIN takes the click after. What the omens and the
  Ambition say is explained when pointed at once they are there. Edge cases: with no Ambition the
  stars spread across the whole sky; with no omens and no Ambition it is all there at once; on a
  screen too short for the sky the card leaves it out and the omens come in the same way without
  it; an Ages run shows the card on its arrival among the stars, under the stars' sky. Three ways
  were filmed (this one; each omen's words one by one; each beamed in as the Boon cards are): the
  words were slow for a card of facts, the beam was the Boons again, and the sky gives the omens a
  look of their own, the sector's.
- **A Boon ready is marked** (1.22, `ui/hud/touches.ts`). The moment one more Boon waits than a frame
  before (the Lore is full, a new age, a Hearth taken), its button in the top bar flashes white and
  fades, a frame runs out from it and sparkles light at its corners: under a second, on the classic
  top bar and the cradle's alike. A Boon chosen sets off nothing; a run continued with a Boon waiting
  shows it once.
- **A goal reached sends its Embers home** (1.22, `ui/Goals.ts`). The box holds the goal two seconds
  more under GOAL REACHED: the goal is struck through in teal, left to right; its reward leaves the
  box as five Embers that fly, one after another, in a dip under the top bar to the Ember count, a
  tick taking the reward's place; the count takes the 40 in as the last lands (`hud.embersAway`: the
  game pays at once, the count shows it when it arrives, with its white flash and "+40"); then the
  next goal fades up. Edge cases: two goals reached together are marked one after the other; a goal
  reached while a dialog is open is marked once it closes; if
  the run ends or tips are turned off, Embers still in flight are taken in at once; the count never
  shows less than nothing. Two ways were filmed: this one, and DONE stamped across the box, which
  hid what had been done.
- **A dialog that opens by itself waits a second before it takes a click** (`DIALOG_GUARD`,
  `Modals.guarded`, `Ui.holdClicks`). An event comes up in the middle of play, on top of whatever
  the player was about to click: twice in one evening a playtester's click, already on its way to
  the map, chose an option of an event he had not seen yet. So a dialog nobody asked for (an event,
  an ability to choose, the cards of the First Night, the omens and the Ark's leaving) is shown at
  once and for its first second takes no click, no digit and no Escape, and does not light up under
  the pointer; a line under its title runs out to say for how long. A click on it in that second
  goes nowhere, and not through to the map either; a button pressed before it opened and let go on
  it clicks nothing. A dialog the player opens (the "! DECISION" button, B for a Boon) is theirs at
  once. After a choice, what the same dialog shows next (the outcome of an event, the next ability,
  the next Boon) waits half a second (`CHOICE_GUARD`): a double click chooses once, and does not
  put the outcome away unread. And what was chosen stays in the log with what came of it ("Ember
  Comet: Mine the core. Mining drones crack the core open."), for the outcome that was clicked away
  all the same. The game stands still behind a decision, so the second costs nothing.

## 6. Presentation

- **Feedback**: the Ember counter rolls toward its value and pops "+N"/"−N" for lump gains and
  spends, and a lump that comes in turns the count white for half a second (`hud/emberCount.ts`).
  (Until 1.18 it was white whenever the figure shown was 5 or more behind the real one. A steady
  income keeps it behind by a ninth of what a second brings, the game adds income twenty times a
  second and the screen draws sixty: between 39 and 53 Embers a second, 21 to 25 at double speed,
  the count changed colour on two frames in three, and above that it was white for good. The
  leading house earns 21 a second at minute 20 and the strongest 38 to 52. A playtester found it
  unpleasant.) Boon cards are beamed in one by one (see Boons, The deal); a chosen Boon flies to the tray;
  a rival Hearth falling is heralded (see above), with a rumble and a chime; red arrows at the screen edge point at
  your worlds under attack off screen (click to look); after 40 s without input and with Embers
  piling up, a hint says what to spend them on (at most every 3 minutes, off with tips).
- **A run that is won ends in a crowning** (`ui/Ending.ts`), on the map itself, in four beats of
  about fifteen seconds. *The moment*: the view goes to where the run was decided (the last rival
  Hearth to fall, `Faction.lostHearth`; the Maw; or the player's own Hearth), the screen shakes and
  rings of light roll out from it. *The light spreads*: the view pulls back to the whole sector, the
  dark lifts from it, and the house's worlds flare one after another outward from its Hearth, each
  ringing a note up the fanfare's scale. *The crowning*: two banners in the house's colour fall, a
  crown comes down over VICTORY, "SOLAR CONCORD IS CROWNED HEGEMARCH · BY CONQUEST", and one of every
  kind of ship that saw the end flies past. *The tally*: the run's figures count up one by one (time
  to the crown, most worlds, ships destroyed, Boons, Legacy), and a figure that beat the player's
  record is stamped NEW RECORD with what the record was; the others show the record that stands.
  A run that is lost is told shorter and quieter: a ring of red closes on the place where the Hearth
  stood, the dark comes in, DEFEAT, who was crowned or why, and the tally ("YOU LASTED 23:10").
  A click or a key goes straight to the tally, and from the tally to the results; nothing moves on
  by itself, and a run that was abandoned goes straight to its results with no ceremony. (It was two
  seconds: the screen dimmed, a word rose, and the results came after four seconds whether the
  player was done or not. The player who had won a forty-minute run got less ceremony than a Boon.)
  `npm run record:ending` films either ending from the game's own canvas and sound.
- **Records** (`meta/records.ts`, in the profile): the fastest crown, the longest a house lasted in
  a run it lost, the most worlds, ships destroyed, Boons and Legacy, kept for each kind of run (classic
  or Ages, the sector's size, the difficulty: a crown in twenty minutes on a small sector says nothing
  about a large one). A first run of its kind sets them and beats none. The results show the record
  beside each figure, and the Hall of Heirs lists them. The First Night and abandoned runs set none.
- **A run can be told to someone else** (`app/share.ts`): the results have three lines to paste (what
  happened, the sector and its figures, a link) and COPY CHALLENGE LINK. There is no server and no
  leaderboard: the link itself carries the sector (seed, size, difficulty, classic or Ages) and what
  its first player made of it, as a short code in the address's tail. Whoever opens it finds the
  setup on that sector, fixed, with the result to beat ("Solar Concord was crowned by Conquest in
  34:12. Take the crown faster."), chooses a house and plays; their results say how it went against
  it ("3:10 faster"). A code is typed by strangers, so anything that does not read as one is ignored.
  A Daily run, the same sector for everyone that day, has COPY DAILY LINE: one line to compare by.
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
- **The run, minute by minute** (third playtest: "economy graphs"). The game samples every house
  each half minute and at the end (`Game.history`, kept in the save): its Embers per second, its
  worlds, its fleet strength (what its warships are worth in battle, as the AI counts it) and its
  Boons. The results draw them as four small line charts on one time axis (`app/charts.ts`), one
  figure a chart: no chart has two scales. A house that was put out ends at zero where it fell.
  A large sector has six houses, and six house colours cannot all be told apart on one chart: gold,
  ember and red fall together for a colour-blind reader at any lightness the page could give them
  (measured: the best case is below the least difference that can be told). So the charts use
  emphasis: the player's house in its colour, one rival in its colour (the house that won, or the one
  that held the most worlds; a row of buttons above the charts picks another), the other houses grey.
  The two coloured lines are named where they end, the pointer (or the arrow keys) reads every house
  at a moment of the run on all four charts at once, and THE FIGURES AS A TABLE has it all in numbers,
  so nothing is told by colour alone. **Fleet strength is spelled out** under the charts ("195" is a
  number without a unit, and the game's host asked what it meant): what each warship adds, with its
  picture (Striker 1.6 … Ark 17.5), and three rules in a line each: a ship that is nearly destroyed
  counts 35%, every +10% damage or hull from Boons adds 5%, each level of an Ark or a Dreadnought
  adds 8%; and what is not counted. The words are made from the numbers the game counts with
  (`strengthParts`, `POWER_WRECK`, `POWER_BOON`, `LEVEL_STEP`), and a test holds them to
  `Game.unitPower`. The colours are the houses' own, unchanged: they are what the
  player knows a house by, they are far enough apart in pairs for full colour vision, and stepped to
  an even lightness they either merged or stopped looking like their houses.
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
- **The hangar is always in the top bar** once the fleet is ("14/20"). It used to appear only near
  its limit, and until then a player had to guess at the room that was left. It is quiet while there
  is room, bright from four fifths full (or three ships short), red when full, and drawn in figures
  of one width with room for the limit's digits, so that what stands after it keeps its place. Its
  tooltip says how many more ships there is room for.
- **The Hearth's projects are buttons with some life** (`Hud.drawProject`): the Hangar Bay, the
  Starfire Gate, a Starbase, the Ark to rebuild and the next age each have their picture, their
  colour (the bay teal like the hangar, the Gate the pink of Ascension, a Starbase sky, the Ark gold)
  and their price beside an Ember. They were grey boxes of small text, the dullest thing on the
  busiest card. Each moves when it matters and is still otherwise: the bay blinks its "+5" and its
  frame once the hangar is nine tenths full and the Embers are there, the Ark asks to be rebuilt, and
  the Starfire Gate shows the Boons it waits for ("6/15", with a line that fills along its foot) and,
  once it can be raised, has two sparks running round its frame. One that only lacks Embers shows
  its price in red and can still be clicked (the refusal says why); they take a second line when
  the card is too narrow for them. **The Hangar Bay is always there**, from the first second to the
  last bay ("10/10"): it used to appear at seven tenths of the hangar and go when all were built,
  and a button that comes and goes by rules nobody was told is bad to use. A player should know
  from the start where more room for ships comes from. (The rule for the whole HUD: a control is
  there or greyed with its reason, and does not appear and vanish on a condition the player cannot
  see.)
- **The Hall of Heirs** shows a house as the setup does: its banner (its Hearth and starting fleet,
  flying), its name, what it is, what it has in a list, and its price along the foot of the card, with
  how much Legacy is still missing. Every card is the same shape, whatever the length of a name. A
  perk or an unlock has a picture drawn with the game's own icons (Embers, Lore, a Guardian, a Boon, a
  star, walls, the Hearth; a Pact, a crown) in a frame that turns gold once the player has it; its
  name runs across the top of its card on one line, and the cards of a row start at the same height.
  **Perks last the whole run** (third playtest: a flat start was spent in the first minute and not
  worth the Legacy): Old Coin +4% Embers a rank, Lorekeepers +5% Lore a rank, Veteran Escort a
  Guardian at the start and +4% hull on every ship a rank, Ancestral Walls +10% hull on every world
  a rank (the Hearth +25% in all, as before), `meta/perks.ts`. **REFUND ALL** at the head of the perks
  gives back every rank for the Legacy it cost, to buy again (it asks once; houses and Forbidden
  Knowledge are kept).
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
  crowning or of the fall (it used to be started again on the next frame, and the fanfare played over
  it). After the fanfare of a run that was won comes **The Crowning**, a tune of its own in the
  fanfare's key (C major, at a walk), from its first bar every time; a fall is left in silence. The
  music of the results waits for the fanfare to be over, also for a player who skips straight to them. Under the smaller fanfare of an Ark that leaves its cradle the
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

**The icon** of the site and of the game is the flame: the game's ember drawn on a 16×16 grid in its
own palette (red at the edge, ember, gold, white-hot at the heart), on a dark tile with rounded
corners. `npm run favicon` (`scripts/favicon.mjs`) writes it as `site/favicon.svg`, as `favicon.ico`
(16, 32 and 48 pixels), as the 180-pixel icon a phone puts on its home screen, and into the address
of the icon inside the game's own page. (It was an 8×8 orange diamond with a gold middle, made before
the game had a look of its own.)

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

[CODE_TOUR.md](CODE_TOUR.md) is the way in for a developer: the folders, one frame, one order, how to
add a ship, a Boon, an event or a dialog, and how to check a change. In short:

```
src/game/      deterministic simulation (no DOM)
  Game.ts        the state, the short queries, and one line for everything longer, which hands the
                 game to the module that does the work:
  setup, save    a new game; saving and loading
  worldStats, shipStats, fields, starfall, pathing, boons, modSources   what is so
  unitLife, conquest   what follows from a hit, a death, a world taken, a Hearth fallen
  commands/      what a house can order (the player's UI and the AI alike), each with its check
  systems/       what happens by itself every tick: economy, production, movement (lanes, kindling),
                 combat, status, starfall, visibility, events, pirates, crisis, victory
  ai/ai.ts       AI houses: drafting, kindling, roles, upgrades, counter-building, attack planning
  data/          units, worlds, Boons, houses, relics, events, omens, Destinies, ambitions
src/render/    pixel canvas: Screen (scaling), Camera, Renderer, worlds, sprites, fonts, effects
src/ui/        immediate-mode HUD: the Ui toolkit; Hud (state and draw order) with its parts in hud/;
               Modals (open, close, guard) with each dialog in modals/; Actions, Input, Tutorial,
               Tips, Ending (how a run ends, on the map)
src/audio/     Sfx (synth) and Music (sequencer)
src/app/       App (the frame loop and the shared state), run (a run's life), sound, the menu pages
               in screens/ (each draws itself and has a table of what its buttons do), Attract (the
               sector that plays itself behind the menus and on the website), houseArt and modeArt
               (the pictures the menus draw), charts (the graphs of the results), share (a run to
               paste, and the link to its sector), rundata and Session (one run's shared UI state)
src/site/      the website's script: the live sector, houses, fleet, Boon draft (see "The website")
src/meta/      profile, settings, Legacy and the player's records
```

The simulation never touches the DOM or `Math.random` (visual jitter does), so the same seed gives
the same game with or without rendering, and a saved run continues identically.

A class here holds state and says in what order things happen; what happens is a function in a module
that takes the class's object (`killUnit(g, u)`, `drawTopBar(hud, R)`, `showSetup(app)`). `Game.ts`
keeps a one-line method for each of its modules' functions, so that every caller says `g.cmdMove(...)`
as before. (Until 1.16.2 four files were a third of the code: Game 2,700 lines, Hud 2,000, App 1,500,
Modals 1,400, each several things at once. They were taken apart along the seams they already had,
by a script that moved the code and did not retype it, and checked against the golden traces and the
UI snapshot of section 8: nothing in the game changed.)

## 8. Testing

- `npm test` (`tests/`, one file per subject, what they share in `tests/helpers.ts`): rules (kindling,
  roles, levels, hangar, Boons, Blueprint pity, events, omens), the
  combat triangle with equal budgets, early strikes and AI restraint, Hearth walls, spoils and
  fealty, every victory, effect-text markup in every data file, Boon previews and totals,
  determinism with and without effects, save/load round trips, and long AI-vs-AI soak games on
  every sector size.
- `npm run verify` (`scripts/verify.mjs`): everything below in one command (types, unit tests, the
  fuzzers, the golden traces and the UI snapshot if they were recorded, and every browser suite, for
  which it starts its own dev server). `--quick` leaves the browser out; `--release` builds, packages
  and checks the build and the site as well.
- **Golden traces** (`npm run golden -- record|check`, `scripts/golden.ts`): the proof that a change to
  the code changed nothing in the game. 24 fixed runs are played (rival houses alone, random commands,
  both together, Ages runs from the cradle to the stars, runs loaded from their own save half way) and
  the whole saved state is fingerprinted every 30 seconds of game time, with the effects asked for.
  `record` before a refactoring, `check` after: identical to the byte, or it says where they part.
- **The UI snapshot** (`npm run test:uisnap -- record|check`, `scripts/uisnap.mjs`): the same for what
  is on the screen. In a browser whose clock the script holds (and whose `Math.random` is seeded) 81
  scenes are staged: the menus, every card and dialog, a Boon draft with a Legendary coming in, a
  decision whose story is half there, a
  Starfall from its button to the star that burns, two seed ships at one world, the end of a run, an
  Ages cradle. Of each it
  writes down the pixels of the game's canvas, every HUD button with its place and tooltip, and the
  HTML of a menu page (but for the version number on the title page). Both recordings live in
  `.golden/`, outside git: they are true of one version of the rules, and a change that is meant to
  be felt makes new ones.
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
  The random players build Starfalls, fly them to stars, arm them and send ships through the fire,
  and an armed Starfall, a burning star and "one to a house" are among the invariants.
- The Starfall: `tests/starfall.test.ts` (building and arming, the eruption and everything it must
  not do, the fire and the ways round it, a save in mid-fuse, and what rival houses do: destroy one,
  save their fleet from one, choose a star, and build one only when their attacks have got nowhere)
  and `test:starfall` (`scripts/starfall.mjs`: the same in the browser, from the button at the Hearth
  to an order through the fire and a rival's Starfall at home). `scripts/layouts.mjs` stages its
  cards at their fullest on the smallest screen.
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
