# Deck Presets and engraving

**Status:** Binding contract for placement: every rule of where a rune,
artifact or relic is engraved, and every page that reads one
**Reviewed:** October 20, 2026

## 1. What the game says

Com2uS calls the feature **Deck Preset** (v9.2.0, April 29, 2026). Every notice
below is on the game's official Steam announcement feed. The steamstore links
render their body by script, so the reproducible reader is the Steam news API,
which returns each notice in full by its `gid`:
<https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2426960&count=300&maxlength=0>
(read October 19, 2026).

| Tag | Notice | Date | `gid` |
| --- | --- | --- | --- |
| [ToC] | [Tomorrow Update] Update Notice (Temple of Chaos preview) | November 5, 2025 | 1815580768225554 |
| [900] | v9.0.0 Update Notice | November 12, 2025 | 1816215235343275 |
| [DN1] | [Info] 12th Anniversary Update Developer's Note | April 8, 2026 | 1829528821303434 |
| [918] | v9.1.8 Update Notice | April 13, 2026 | 1829528821314708 |
| [DN2] | [Info] New Feature: Deck Preset, with a Q&A | April 20, 2026 | 1830163047265653 |
| [920] | v9.2.0 Update Notice, and its capacity table <https://hive-fn.qpyou.cn/hubweb/contents/2EN_1777364557.png> | April 29, 2026 | 1831432155564095 |
| [922] | v9.2.2 Update Notice (Modified) | May 13, 2026 | 1832700592785416 |
| [923] | v9.2.3 Update Notice | June 1, 2026 | 1833968530897135 |
| [924] | v9.2.4 Update Notice | June 12, 2026 | 1835236783562442 |
| [927] | v9.2.7 Update Notice | July 15, 2026 | 1838407329253345 |
| [930] | v9.3.0 Update Notice | August 28, 2026 | 1842212951302056 |

The rules JASWA relies on:

1. **A preset is one deck: one team.** It saves the monsters and, by a
   toggle, the runes and artifacts engraved on them [DN1, 920]. What a player
   loosely calls "a preset type" the game calls a **content**: Arena,
   Giant's Keep, Siege Battle and so on.
2. **Each content has a fixed number of presets.** Every content has Attack
   presets; only Arena, Arena Interserver Battle, Siege Battle and World Guild
   Battle also have Defense presets [920, capacity table]:

   | Content | Attack | Defense |
   | --- | --- | --- |
   | Arena; Arena Interserver Battle (one cell) | 15 | 1 each |
   | Siege Battle | 25 | 10 |
   | World Guild Battle; Guild Rival Battle (one cell) | 15 | World Guild Battle: 5 |
   | Labyrinth: Normal, Rescue, Explode, Cooldown Time Up, Speed Limit, Time Limit, Boss | 5 each | — |
   | Monster Subjugation: Water, Fire, Wind, Boss | 3 each | — |
   | Cairos Dungeon: Giant's Keep, Dragon's Lair, Necropolis, Spiritual Realm, Steel Fortress, Punisher's Crypt | 3 each | — |
   | Trial of Ascension | 10 | — |
   | Challenge of Ascension: Towers of Water, Fire, Wind, Light, Dark; Spires of Ascension | 5 each | — |
   | Temple of Chaos | 15 | — |
   | Rift of Worlds: Fire, Ice, Wind, Light, Dark Beast | 3 each | — |
   | Rift Raid | 10 | — |
   | Dimension Hole: each of the six dungeons | 3 | — |
   | Dimension Raid: phases 1, 2, 3 | 10 each | — |

   World Arena is not a preset content; it keeps its own save-and-load of
   every monster's runes and artifacts [920].
3. **A rune or artifact is engraved at most once per preset**, and may be
   engraved in any number of presets at the same time, including several
   presets of the same content. DN2, verbatim: *"you cannot engrave the same
   Runes or Artifacts on different Monsters within the same deck. It is best
   to think of it as Runes and Artifacts being available for use on a
   per-Preset basis."* [922] fixed a crash when saving a preset that broke
   this; what the save now does was not captured.
4. **The ten Siege Battle defense presets share one pool.** A rune or artifact
   may appear only once across all of them [920]: *"as before, the same
   Runes/Artifacts cannot be shared among Siege Battle defense decks (up to
   10)."* The notice says nothing of their monsters, so only the gear is
   shared.
5. **Temple of Chaos's teams share one pool, monsters included.** Temple of
   Chaos fights with three decks of five monsters at once, set on the tabs 1–3
   of one entry, and *"Monsters, Runes, and Artifacts cannot be used across
   multiple decks"* [900; ToC]. The developer confirmed the rule in the game on
   October 10, 2026, and also that the game does not stop it being broken:
   runes can in fact be engraved on several of the teams at once.
6. **The other contents that fight with several decks in one battle share one
   pool of gear.** [924] names the contents that *"use multiple decks"* —
   Temple of Chaos, Rift Raid, Dimension Raid, World Guild Battle and Guild
   Rival Battle — and adds to Rune Advanced Settings a box that includes or
   leaves out, **in a rune search**, the runes placed in the battle's other
   decks. That box is a search filter, and [923]'s overlap indicator on the
   preset selection screen is a warning; neither notice states which overlaps
   the game allows. The pools rest on other evidence:

   | Content | Decks in one battle | Pool | Evidence |
   | --- | --- | --- | --- |
   | Temple of Chaos | three teams | rule 5, monsters included | [900]; the developer, October 10, 2026 |
   | Dimension Raid | one deck per phase, phases 1–3 | a **phase pool**: one pool across the three phase contents; a phase's own decks are alternatives and may share a rune | The developer's in-game observation, recorded October 19, 2026 |
   | Rift Raid | several teams | a **team pool**: no rune on two teams | **modelled** on the same ground — the decks fight at once (the developer's decision, October 19, 2026) |
   | World Guild Battle (attack) | several teams | a **team pool**: every monster of every team draws on one set of runes | The developer, October 27, 2026 |
   | Guild Rival Battle | its simultaneous teams | the World Guild Battle pool: the two share one row of the capacity table and one set of presets [920] | **modelled**, as World Guild Battle |

   The pools carry artifacts with the runes, because the reason is the same —
   the decks fight at the same time. Nothing says their monsters may not
   repeat, so outside Temple of Chaos a monster may stand in more than one deck
   of a pool. Siege Battle *attack* has no pool: each attack is a battle of its
   own. The World Guild Battle defense decks stand at once too, and JASWA gives
   them a pool by analogy with Siege Battle's; that pool is **modelled and
   unsourced**, and dormant while no `deck_type` is matched to the content
   (§7).
   Two kinds of pool, then. In a **team pool** every team reserves against
   every other. In a **phase pool** — Dimension Raid, where a phase is the
   content of one confirmed `PresetContentId` — only decks of different phases
   reserve; a phase's own decks are alternatives. The developer's rule,
   October 27, 2026, which replaces the same-content rune reuse of October 24
   (that rule let every team of a one-content pool share runes, Temple of
   Chaos's included).
7. **Relics are not saved per preset.** A preset uses whatever relic the
   monster carries in Scenario [920]: *"the Relic information currently
   engraved on the Monster will be reflected in the Preset."* A relic is
   engraved on a monster of Lv. 40 [918], and one relic on up to 150 monsters
   [930] (`RELIC-CANONICAL.md`).
8. **Outside saved presets.** A monster's own runes and artifacts outside any
   preset are its **Scenario** arrangement in JASWA, independent of every
   preset [DN1, 922, 923]. In Scenario a rune or artifact is engraved on one
   monster at most.
9. **Engraved runes and artifacts can be sold** [930: *"Engraved
   Runes/Artifacts can now also be selected and sold when using Sell
   Selected"*]. A preset then keeps a reference to a rune the account no
   longer owns.
10. **A Normal Sealed Shrine monster can stand in a preset.** [920] replaced
    the shrine's own temporary engravings with presets: *"The feature used to
    load Monsters from the Normal Monster Sealed Shrine and use them with
    temporary engravings has been replaced by the Deck Preset feature."*

What the notices leave open, and JASWA must not invent:

- Whether the monsters of the pools of rules 4 and 6 may repeat. The sources
  name runes and artifacts only, so only those are shared.
- Which saved decks make up one battle. A content of several decks per battle
  has more presets than one battle uses — Temple of Chaos 15 for three teams,
  World Guild Battle 15 for several — and the export does not say which go
  together (§7).
- What powering up, gemming or grinding does to a preset. The rune is one
  physical object, so its stats are read once and every preset sees the same
  rune; nothing is copied per preset.
- Team sizes per content. A preset's size is the size of its own saved deck.

## 2. Terminology

The words for placement — engraved, in inventory, preset, content, Scenario,
roles, profile — are fixed in `LANGUAGE-CONTRACT.md` (*Game terminology*), and
this document uses them. Identifiers follow the interface words; raw export
field names (`occupied_id`, `deck_list`, `equip`) keep their spelling only
where the raw export is read.

## 3. What the export establishes

`HubUserLogin` carries `deck_list`. A saved preset is identified by **both**
`deck_type` and `deck_seq`. Each deck lists its monsters in `unit_id_list`, `0`
for an empty position, and names its `leader_unit_id`. Its `equip` array holds
one record per monster: `unit_id`, `rune_id_list`, `artifact_id_list`; `null`
or an empty array means the preset saved monsters only. The Arena defense and
the Arena Interserver defense are not in `deck_list` but in
`defense_deck_info` and `server_arena_defense_deck_info`, each with its
`unit_id_list` (the Interserver one as `{pos_id, unit_id}`) and `equip`, and
no leader field: the first monster leads. `world_arena_rune_equip_list` is
World Arena's separate system. `deck_recent_list` is the recent decks, not a
preset list.

Saving a preset sends `setDeckList`; the answer's `deck_info` carries the
`deck_type` saved and **every** saved deck of that type as it now stands
(captured October 7, 2026). The helper replaces that type's decks and no other
(`apply_deck_list`). A deck's `equip` entries name monsters by `unit_id`, so
the helper never reads a deck as a unit record. An edit left unsaved sends
nothing. Saving the Arena defense sends `arenav2_setDefenseUnitList`, whose
answer carries `defense_deck_info` in the login's own shape; the helper keeps
whichever defense field an answer carries whole (`apply_defense_decks`).

Export observation (the October 2026 capture): runes occur in up to three decks
at once, including different `deck_seq` under one `deck_type`, and decks name
runes and artifacts the account no longer owns (rules 3 and 9).

`app/lib/deck-presets.ts` reads the decks and refuses the import for a
duplicate preset identity, an item twice in one deck, two runes in one slot of
one monster, an `equip` entry for a monster outside the deck, and a deck that
saves gear for some of its monsters but not all. A member the roster
(`unit_list`) does not hold is a **missing member**, not a refusal: a sold
monster, or one resting in the Normal Sealed Shrine (rule 10), whose `equip`
entry stays readable.

**The numeric `deck_type` values are matched to contents from the game's own
screen where it has shown them, and otherwise to the content they most likely
are**, so every saved deck stands in the structure below. An assumed match is
marked on the preset (*Content assumed, not yet confirmed in the game*) until
the screen confirms or corrects it, and an assumed deck joins no pool (§4). A
value no reading covers keeps its number on screen and is still used fully; a
preset is never hidden for want of a name (AGENTS.md §0.1). Matched so far
(`preset-contents.ts`):

| `deck_type` | Content | Number shown | Basis |
| --- | --- | --- | --- |
| 1 | Arena Attack | `deck_seq` | screen |
| 2 | World Guild Battle | `deck_seq` | the developer, October 28, 2026: presets 1 and 2 on the game's screen |
| 3 | Rift Raid | `deck_seq` | screen |
| 4, 5, 7, 8, 9, 10, 11 | Labyrinth Normal, Rescue, Speed Limit, Time Limit, Cooldown Time Up, Explode, Boss | `deck_seq` | captured as the developer saved one deck in each, October 30, 2026, each save matched to a screenshot of its menu entry |
| 6 | Trial of Ascension | `deck_seq` | screen |
| 19, 20, 21 | Dimension Raid phases 1, 2, 3 | `deck_seq` | screen |
| 23 | Temple of Chaos | `deck_seq` | the developer, October 10, 2026: the account's three Temple of Chaos teams |
| 24 | Cairos Dungeon: the hundreds of `deck_seq` are 1 Giant's Keep, 2 Dragon's Lair, 3 Necropolis, 4 Spiritual Realm, 5 Steel Fortress, 6 Punisher's Crypt | `deck_seq` mod 100 | screen (screens of October 7, 2026) |
| 25 | Rift of Worlds beasts: the hundreds of `deck_seq` are 1 Ice, 2 Fire, 3 Wind, 4 Light, 5 Dark Beast | `deck_seq` mod 100 | 5 Dark Beast captured as the developer saved its decks 1 and 2, October 29, 2026; 1–4 assumed (§7) |
| 27 | Monster Subjugation: the hundreds of `deck_seq` are 1 Water, 2 Fire, 3 Wind, 10 Boss | `deck_seq` mod 100 | the developer: 2 Fire on October 27, 2026; 1 Water, 3 Wind and 10 Boss on October 28, 2026 |

4 and 6 under type 24 were confirmed through the recent decks, whose Cairos
sub-types 19–24 run in the same order and were matched on screen for all six.

### 3.1 The structure

The game's Attack Deck screen lists its contents under seven tabs, each with a
menu of its contents, read row by row (screens of October 8, 2026). JASWA's
preset menus are this structure, fixed: every tab and every content is listed
on every account, with presets or without.

| Tab | Contents |
| --- | --- |
| Arena | Arena Attack, Arena Defense, Arena Interserver Defense |
| Guild | Siege Battle, Siege Battle Defense, World Guild Battle, World Guild Battle Defense, Labyrinth (Normal, Rescue, Explode, Cooldown Time Up, Speed Limit, Time Limit, Boss), Monster Subjugation (Water, Fire, Wind, Boss) |
| Cairos | Giant's Keep, Dragon's Lair, Necropolis, Spiritual Realm, Steel Fortress, Punisher's Crypt |
| Trial of Ascension | Trial of Ascension, Tower of Fire, Tower of Water, Tower of Wind, Tower of Light, Tower of Dark, Spires of Ascension |
| Temple of Chaos | Temple of Chaos |
| Rift of Worlds | Ice Beast, Fire Beast, Wind Beast, Light Beast, Dark Beast, Rift Raid |
| Dimension Hole | Forest of Roaring Beasts, Sanctuary of Dreaming Fairies, Cliff of Tough Beast Men, Ruin of Silent Death, Castle of Forgotten Heroes, Hellground of Raging Fires, Dimension Raid phases 1, 2, 3 |

The defense contents sit under the tab of their attack; the game keeps them on
its Defense Deck screen. The Guild tab's menu is the one not yet read off the
screen: its contents are the capacity table's guild rows, in its order.

Scenario is JASWA's name for a monster's arrangement outside saved presets.
It is not a content: it holds the ordinary placement used in Scenario battles
and every battle outside a preset, and stands alone before the tabs.

## 4. The model

The account owns physical runes and artifacts. A placement is the relation
(item, monster, **context**). A context is either **Scenario** or one preset:
a game deck `(deck_type, deck_seq)`, an Arena defense, or a preset built in
JASWA.

- Within a context, an item has at most one monster and a monster at most one
  rune per slot and one artifact per slot.
- Across contexts, the same item may have different monsters.
- A relic belongs to Scenario only and is read into every context.
- Item stats, grade, slot and craft state belong to the physical item and are
  never copied into a placement.
- A placement naming an item the account no longer owns is kept and shown as
  sold; it is never dropped and never repaired. A member the roster does not
  hold is missing in a game deck and in a preset built in JASWA alike; the
  Presets page names a Normal Sealed Shrine member by name and counts the rest
  as *not in this import*.
- A preset that saved monsters only runs each member on its Scenario gear.

Placement is resolved once, at the account boundary (`presets.ts`,
`readPresets`). A rune's or artifact's own `occupiedId` is its **Scenario**
monster (the export's `occupied_id`, `null` in inventory) and means nothing
about any preset. Every reading of a monster's slots, its stat sheet, its sets
or its speed takes a context argument (`monsterInPreset`), and no page, filter
or worker picks a context of its own. A calculation about one preset reads its
runes through `runesInPreset`, which returns copies whose `occupiedId` is the
monster carrying the rune in that preset, or `null`; artifacts are never
rewritten, so an artifact's `occupiedId` is always Scenario's.

### Pools

A pool is the game decks of rules 4–6: `sharedPool` in `preset-contents.ts`,
named by its own id rather than by a content, because one battle may span
several contents — Dimension Raid's three phases are three contents and one
pool. **Only a game deck whose content the screen confirmed joins a pool.** A
deck whose content is assumed is read as a placement of its own and withholds
nothing, because a guess about its content is no ground for refusing a rune.
A preset built in JASWA is a draft of one team and never joins a pool.

A pool is a **team pool** or a **phase pool**. Where the battle places one
deck of each content — Dimension Raid, one deck per phase
(`oneDeckPerContent`) — the decks of one content are alternatives: they never
stand together, so they may hold the same gear, and only the other phases'
decks reserve against them. Everywhere else every deck of the pool reserves
against every other. Runes, artifacts and monsters follow the same decks.

**A pool is a limit on what JASWA does, never on what it reads.** Every deck
of a pool is its own context, read exactly as the game saved it, with its own
team, gear, priority and speed tuning. Every saved deck of the pool's
contents is one pool, since the export does not say which decks fight
together.

- **An overlap is a fault of the preset, never of the import.** Decks of one
  pool that hold the same item — or, for Temple of Chaos, the same monster —
  keep it on every one of them. Alternatives of one phase may share; every
  other overlap is visible through `poolConflicts` and the Presets page's
  warning line.
- Each deck knows what the pool's other decks hold (`poolRunes`, with the deck
  and monster holding each rune, `poolArtifactIds`, `poolTakenUnitIds`), so
  JASWA never forms an overlap:
  - **whose runes a monster may take is one rule, `rune-sources.ts`.** Teams
    are never ranked against each other: a rune another deck of the pool
    holds is withheld unless *Include runes from higher-priority monsters* is
    ticked, and *Only runes not engraved in preset* withholds it always. A
    rune locked on another deck is withheld whatever the switches say. **A
    rune the monster carries here and another deck holds too is no
    exception:** the game let the overlap be saved but fields neither team
    with it, so it is withheld from both monsters alike, and a build keeps it
    only on the same terms as taking it. Inside the team, the priority list
    rules as before (§5);
  - an engrave of a build **takes every such rune it keeps or brings in off
    every deck of the pool holding it**, remembering where it sat there — the
    one write into another deck, and the price of including it. Engraving a
    build that keeps an overlapping rune is the user settling the overlap in
    this deck's favour. A Lock claims only its own rune and an Exclude none,
    so neither settles an overlap of another rune;
  - a monster joining a game deck brings its Scenario gear less what the deck
    or the pool holds, and a monster another Temple of Chaos team holds is not
    offered;
  - a Lock or Exclude is set in the selected preset only (`rune-locks.ts`).
- Apart from that one taking, nothing done in one deck writes into another.

### Team sets

The members of one preset supply their completed team-set bonuses to one
another, from that preset's rune placements. A pool is not a team, and
Scenario is the whole roster, not a team. `RUNE-OPTIMIZATION.md` §2.2.4 holds
the rule and which figures count it.

### 4.1 One monster profile per content-area

A profile states one owned copy's job in **Scenario or one content-area**:
nickname, desired rune builds and slot mains, stat ranges, ranking figure,
combat conditions, and artifact and relic wishes — and, in Scenario alone, which
has no leader, its leads. A preset's leads are its leaders' and are read, never
stated (`RUNE-OPTIMIZATION.md` §2.2.3). Every team in Arena
Attack reads that copy's one Arena Attack profile. Arena Defense, Giant's Keep
and Scenario have separate profiles, even when they hold the same copy.

- Storage is keyed by `scenario`, `content:<content id>` or `unassigned`, then
  by `unit_id`. `monster-profile-scope.ts` resolves the area once for every
  reader. Unnamed teams share the explicit unassigned area; no content is
  guessed beyond the import's existing classification.
- Gear, team membership, leader, rune priority, locks and speed tuning remain
  team-specific. Sharing a profile never copies or merges game placements.
- No fallback between areas. An unstated choice reads species defaults there,
  never Scenario's profile. *Copy from…* copies another area's stated choices;
  later edits stay independent. A profile with no stated choices stays visible
  but cannot be copied; an explicit zero or a deliberately cleared rune list is
  a stated choice, and a gear answer with both bands emptied is not
  (`ARTIFACT-CANONICAL.md` §19.4).
- Removing a monster from a team or deleting a team leaves its area profile
  intact, including when it was the area's last team, so re-importing the team
  uses the user's choices again.
- Presets, Monster Stats, Rune Optimization and Speed Tuning resolve nicknames
  and profile choices through the team's content-area. Scenario-only artifact,
  relic and rune workspaces read Scenario's profile.
- The overlay's *Build for* offers Scenario and each area once, without a team
  dropdown. It switches the shared profile and a representative team's gear
  together, waits while an edit is unsaved, and names that team in the
  *Engraved runes* heading's hover title, leaving the heading's line to the
  heading and the build. Opening from a team keeps that
  team; switching area uses its first team.
- A stored profile keyed by team or by no context is outside the contract and
  is rejected one scope at a time; every other preference survives.

Presets the player builds in JASWA are the player's own choices
(AGENTS.md §0). They are stored with the preferences, are never overwritten by
an import, and are checked one preset at a time on load.

## 5. Rules every page obeys

**Presets.** The page where placements are made.
- *Content* heads the page with *Area* beside it and *Preset* below, and
  opens on Scenario. *Content* lists Scenario, the game's seven tabs (§3.1)
  and, only while there are any, the presets not yet named. *Area* lists the
  chosen tab's contents, all of them, and is disabled where the tab holds one.
  Scenario is chosen in *Content* outright; any other choice offers the area's
  presets in *Preset*, each shown with the faces of its team, and the list
  below is empty until one is chosen.
- A preset built in JASWA stands in its content exactly as the game's do,
  after them; one without a content stands with the presets not yet named.
- *Add preset* sits at the right, starts the new preset in the chosen content
  under the name the game would give its next one, and is available as soon as
  a content other than Scenario is chosen, and only while live sync is off.
- While live sync is off, the game's presets are the user's to change too:
  a monster is added to the first empty position or taken out of its own,
  the crown names the leader, and *Delete preset* removes it. Each change is
  written into the import, as an engrave is, and the next import states the
  game's own presets again. A monster added to a preset that saves its gear
  brings its Scenario gear, less what the preset or its pool already engraves;
  one taken out takes its gear there with it; its area profile stays.
- The order of monsters within a preset is their priority for runes held by
  this team: a monster may take a rune from one below it, from one above it
  only with *Include runes from higher-priority monsters*. Priority never
  reaches another team; a rune another deck of the pool holds is taken only
  with that same switch (`rune-sources.ts`).
- Each monster has a shortcut to Rune Optimization in that preset. The preset
  has one *Speed tuning*, under *Add preset* and *Delete preset*, which opens
  its team over Presets — the overlay Speed Tuning's own lines open — disabled
  only on Scenario and on a preset with no monsters.

**Opening a monster.** A monster opened from a place about one preset — a
preset's list, a Speed Tuning team, a row of Monster Stats, a rune engraved in
one preset, a build — opens its overlay on that preset, and *Save and
optimize* there opens Rune Optimization on it. A monster opened from a place
about no preset — Monster Numbers, an artifact, a relic — opens on Scenario,
which is what those pages show. Opening the overlay leaves the preset chosen
across the program alone; only *Save and optimize* changes it.

**Choosing a gear context.** Presets and Monster Stats share *Content*, *Area*
and *Preset*: `PresetChooser` draws the fields and `preset-choice.ts` resolves
the choice. Rune Optimization offers Scenario and every preset in one list.
A page that makes presets — Presets — offers every content, empty ones
included, because a preset is added to the content chosen; a page that only
reads them offers only the tabs and contents holding one. The profile editor
offers content-areas instead (§4.1).

**Rune Optimization** searches for one monster in one context and engraves
into that context only, moving nothing out of any other, a deck of the same
pool included. Its candidates, switches, locks and exclusions are
`RUNE-OPTIMIZATION.md` §3. A build's *Location* names a rune's place in the
chosen preset as the game's rune list does:
- a rune in inventory in the preset that is engraved on a monster in Scenario
  is named by that monster alone, as long as that monster is not in the preset;
- a rune whose Scenario monster is in the preset says *Inventory*, as in the
  game: the preset decides that monster's runes, so one taken off it there —
  in JASWA or in the game, then synchronized — is unengraved in the preset;
- one exception, as in the game: a rune the preset carried on a monster when
  the import was loaded, taken off that monster in the preset since, while the
  monster still carries it in Scenario, says *Inventory*, with that monster as
  its *Previously*;
- if the Scenario monster is the one being optimized, the card says
  *Inventory* too: the rune still has to be engraved in this preset, which the
  Changes figure counts;
- *Previously* names the rune's earlier place in that preset after JASWA moves
  it, in *Location*'s words.

This is the one rune workspace that reads a rune's current place from the chosen
preset. `runesInPreset` supplies that placement and the build card applies the
game's remembered-placement rule. Every other rune workspace uses the shared
Scenario-first reading in `rune-placement.ts`: name the Scenario monster and
count the other placements, or say *Engraved* with the total when there is no
Scenario placement. Location labels, engraved filters and safeguards read that
same summary; no other workspace chooses one preset's monster as the rune's
current location.

**Speed Tuning.** Every preset with a monster is a team, and nothing else is:
its monsters are the preset's, every speed is computed from the preset's own
runes with the relic from Scenario, and the leader is the user's to choose on
the team as on the Presets page — saved with the team, written as the crown
writes it, and under live sync only reported. Until a turn order is stated,
the team is read in the game's own order. How the page lays out and judges a
team is `SPEED-TICK-CANONICAL.md` §9.

**Rune Clean-up, Gems & Grinds and every rune or artifact list.**
- Runes use the Scenario-first reading above: the Scenario monster's name, with
  `(+ n)` for other placements; or *Engraved × n* when Scenario has none.
  A rune with no placements says *Inventory*.
- Artifacts show every placement as `monster — preset`; their Scenario-only
  owner field is not a rune-placement summary.
- Hover or focus reveals the monsters, grouped by context.
- The filter is the same everywhere: *Engraved* / *Inventory*, and nothing
  chosen means everything.
- A sell recommendation for an engraved item carries a red mark, because
  selling empties a slot in every context that uses it.

**Artifact pages.** The artifact list's location names every placement above.
Artifact Optimization and its value columns plan Scenario: which artifact a
monster carries in Scenario and what to engrave, keep or sell there.

**Monster Stats** reads one context at a time. The chooser sits above the
filters, ruled off from them, offering only contents with presets, and the page
opens on Scenario. The table lists the chosen preset's team in its own order,
each copy with the runes and artifacts it carries there and Scenario's relic, so
sets, stats and composites are the preset's and never Scenario's. The choice is
not a filter: *Reset filters* leaves it alone.

**Monster Numbers** shows Scenario and the number of presets each monster
belongs to.

## 6. Verification

`npm run verify:deck-presets` holds the model at the import boundary, in
`readPresets` and in the pages' readings: an empty preset, a full preset, a
rune shared by two presets with different monsters, a sold rune still named by
a preset, a sold member with gear, a Normal Sealed Shrine member, a pool
overlap, World Guild Battle's teams as one pool, and an assumed deck that joins no pool. It measures a private traffic
log without printing IDs:
`node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-deck-presets.mjs <log-path>`.
`npm run audit:import-parity` checks that every saved deck of a real capture
is a preset the interface offers, with its own placements
(`IMPORT-PARITY-CONTRACT.md`).

## 7. Open questions

Each is a TODO: until it is answered, JASWA keeps the safe reading named here
and says so where it matters.

- **`deck_type` 25, hundreds 1–4.** Only Dark Beast (5) has been captured.
  Ice, Fire, Wind and Light Beast are read as 1–4 from the tab's menu order,
  which is also the element order type 27 numbers by, and marked assumed until
  a save in each is captured.
- **Saving the Arena Interserver defense.** Not yet captured. The helper takes
  any answer carrying `server_arena_defense_deck_info` whole, as it does for
  the Arena defense, whose save is confirmed.
- **The Siege Battle and World Guild Battle defense decks** are not matched to
  any `deck_type` yet, so their pools are dormant. The World Guild Battle
  defense pool is modelled and unsourced (rule 6).
- **Siege Battle defense: Normal and 4★ bases.** Since [930] *"you can now set
  the placement order separately for Normal Bases and 4★ Bases"*, with 4★
  defense decks saved under a category of their own. Whether that is one
  content or two — its own `deck_type`, capacity and pool — needs a capture.
- **Deck order.** Since [927] the player sets the order of the presets (*"The
  deck list order is set based on the order you select the decks"*). JASWA
  orders a content's decks by `deck_seq`; whether the export carries the
  game's order needs a capture after July 15, 2026.
- **Which saved decks make up one battle** in a content of several decks per
  battle (§1) whose decks the export does not tell apart — Temple of Chaos and
  World Guild Battle. Every saved deck of such a content is read as
  one pool, so two alternative teams for the same place in a battle that share
  a rune show as a fault on both though they never fight together. Dimension
  Raid does not have this gap: its phases are separate contents, and a phase's
  own presets are alternatives (§4, *Pools*). Nor does Rift Raid any longer:
  it has decks 1, 2 and 3 only, and every battle fields all three (the
  developer, October 20, 2026; `RUNE-OPTIMIZATION.md` §2.2.3).
- **Team sizes not seen on screen.** Siege Battle and World Guild Battle are
  read as three, Monster Subjugation, the Towers and Spires as five,
  the Rift of Worlds beasts and Rift Raid as six, Dimension Raid as five.
  Dimension Hole's four, Temple of Chaos's five, Labyrinth Rescue's four and
  the other Labyrinth contents' five are from the screen.
- **An artifact's tier word.** The interface says *Grade* on some pages and
  *Quality* on others (`LANGUAGE-CONTRACT.md`).
