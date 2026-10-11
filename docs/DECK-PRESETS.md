# Deck Presets and engraving

**Status:** Binding contract, October 7, 2026; shared pools revised October
11, 2026, and widened to every content of several decks in one battle the same
day. JASWA leaves the model in
which a rune or artifact is engraved on exactly one monster. Every rule of
placement, and every page that reads one, follows this document.

## 1. What the game says

Com2uS calls the feature **Deck Preset** (v9.2.0, April 29, 2026). Sources,
all from the official announcement feed:

- [DN1] 12th Anniversary Developer's Note, April 8, 2026:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1829528821303434>
- [DN2] "[Info] New Feature: Deck Preset", with a Q&A, April 20, 2026:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1830163047265653>
- [920] v9.2.0 update notice, April 29, 2026:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1831432155564095>
  and its capacity table: <https://hive-fn.qpyou.cn/hubweb/contents/2EN_1777364557.png>
- Later notices v9.2.2 – v9.3.2 in the same feed.
- [ToC] Temple of Chaos preview, November 5, 2025:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1815580768225554>
- [900] v9.0.0 update notice, November 12, 2025:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1816215235343275>
- [924] v9.2.4 update notice, June 12, 2026:
  <https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1835236783562442>

The rules JASWA relies on:

1. **A preset is one deck: one team.** It saves the monsters and, by a
   toggle, the runes and artifacts engraved on them [DN1, 920]. What a player
   loosely calls "a preset type" the game calls a **content**: Arena,
   Giant's Keep, Siege Battle and so on.
2. **Each content has a fixed number of presets.** Every content has Attack
   presets; only Arena, Arena Interserver Battle, Siege Battle and World Guild
   Battle also have Defense presets [920]:

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
   per-Preset basis."* The game enforces this when a preset is saved (v9.2.2).
4. **Exception: the ten Siege Battle defense presets share one pool.** A rune
   or artifact may appear only once across all of them [920]: *"as before,
   the same Runes/Artifacts cannot be shared among Siege Battle defense decks
   (up to 10)."* The notice says nothing of their monsters, so JASWA shares
   only the gear.
5. **Exception: Temple of Chaos's teams share one pool, monsters included.**
   Temple of Chaos fights with three decks of five monsters at once, set on the
   tabs 1–3 of one entry, and *"Monsters, Runes, and Artifacts cannot be used
   across multiple decks"* [900; ToC]. A rune, artifact or monster belongs in
   at most one of the teams. The player confirmed the rule for this account on
   October 10, 2026, and also that the game does not stop it being broken:
   runes can in fact be engraved on several of the teams at once. JASWA
   therefore reads such an account as it stands and shows the overlap as a
   fault of the preset (§4); it never refuses the import for it.
6. **Exception: every other content that fights with several decks in one
   battle shares one rune pool across them.** [924] names five contents that
   *"use multiple decks"* in one battle and gives each the *Include Placed
   Runes* option, which includes or leaves out runes already placed on monsters
   in the battle's other decks — the game's own admission that those decks
   draw on one set of runes:

   | Content | Decks in one battle | Pool in JASWA |
   | --- | --- | --- |
   | Temple of Chaos | three teams | rule 5, monsters included |
   | Dimension Raid | phases 1, 2 and 3 | one pool across the three phase contents |
   | Rift Raid | three teams | one pool |
   | World Guild Battle (attack) | five teams | one pool |
   | Guild Rival Battle | its simultaneous teams | the World Guild Battle pool: the two share one row of the capacity table [920] and one set of presets |

   The defense side follows the same line. Siege Battle defense keeps its pool
   (rule 4, restated by [920]), and the World Guild Battle defense decks, which
   stand at once, share one too. Siege Battle *attack* is the one guild content
   with no pool: each attack is a battle of its own, so a rune may serve in any
   number of them.

   The notices speak of runes; JASWA shares the artifacts with them, as it does
   for rules 4 and 5, because the reason is the same — the decks fight at the
   same time. They say nothing of monsters, so in these pools a monster may
   stand in more than one deck. As in rule 5, the game may let an overlap
   through, and JASWA reads it and shows it as a fault (§4).
7. **Relics are not saved per preset.** A preset uses whatever relic the
   monster carries in Default [920]. One relic may be engraved on up to 150
   monsters (v9.3.0; `RELIC-CANONICAL.md`).
8. **Default still exists.** A monster's own runes and artifacts outside any
   preset are its **Default** arrangement, independent of every preset
   [DN1, v9.2.2, v9.2.3]. In Default a rune is engraved on one monster at most,
   as before.
9. **Engraved runes and artifacts can be sold** (v9.3.0). A preset then keeps
   a reference to a rune the account no longer owns.

What the notices leave open, and JASWA must not invent:

- Whether the monsters of the pools of rules 4 and 6 may repeat. The notices
  name runes and artifacts only, so only those are shared.
- Which saved decks make up one battle. A content of several decks per battle
  has more presets than one battle uses — Temple of Chaos 15 for three teams,
  World Guild Battle 15 for five, Dimension Raid ten per phase — and the export
  does not say which go together. Every saved deck of the pool's contents is
  therefore read into one pool. Two alternative teams for the same place in a
  battle that share a rune then show as a fault on both (§4) though they never
  fight together; should an export show how decks are grouped into a battle,
  the pool must be narrowed to one battle's decks.
- What powering up, gemming or grinding does to a preset. The rune is one
  physical object, so its stats are read once and every preset sees the same
  rune; nothing is copied per preset.
- Team sizes per content. A preset's size is the size of its own saved deck.

## 2. Terminology

The game uses **engrave** for all three kinds of gear: "engraved Runes",
"Relic Engrave List", the "Rune / Artifact / Relic Engraving Statistics"
panels. JASWA uses it alone:

| Concept | JASWA word | Never |
| --- | --- | --- |
| A rune, artifact or relic on a monster | **engraved** (verb **engrave**) | equipped, equip, worn, wearer, wears, socketed |
| A rune or artifact on no monster in a context | **in inventory** | free, unused, spare |
| One saved deck | **preset** | team, deck (in UI), scenario |
| The grouping of presets | **content**, by the game's name | preset type, mode |
| A monster's own arrangement outside presets | **Default** | current build, worn build |
| Rune Clean-up's role targets (formerly "presets") | **roles** | presets |
| Rune Optimization's monster settings (formerly "preset") | **profile** | preset |

"Preset" means the game's preset and nothing else. Identifiers follow the
interface words. Raw export field names (`occupied_id`, `deck_list`) keep
their spelling only where the raw export is read.

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

A captured account held 57 saved decks, two of them the Arena defenses. Runes
occurred in up to three decks at once, including different `deck_seq` under
one `deck_type`; decks named one rune and several artifacts the account no
longer owned.

**The numeric `deck_type` values are matched to contents from the game's own
screen where it has shown them, and otherwise to the content they most likely
are**, so every saved deck stands in the structure below. An assumed match is
marked on the preset (*Content assumed, not yet confirmed in the game*) until
the screen confirms or corrects it. A value no reading covers keeps its number
on screen and is still used fully; a preset is never hidden for want of a name
(AGENTS.md §0.1). Matched so far (`preset-contents.ts`):

| `deck_type` | Content | Number shown | Basis |
| --- | --- | --- | --- |
| 1 | Arena Attack | `deck_seq` | screen |
| 2 | World Guild Battle | `deck_seq` | assumed: 14 three-monster decks numbered 1–15, World Guild Battle's capacity |
| 3 | Rift Raid | `deck_seq` | screen |
| 4 | Labyrinth Normal | `deck_seq` | assumed (§7) |
| 6 | Trial of Ascension | `deck_seq` | screen |
| 8 | Monster Subjugation Water | `deck_seq` | assumed (§7) |
| 9 | Monster Subjugation Fire | `deck_seq` | assumed (§7) |
| 19, 20, 21 | Dimension Raid phases 1, 2, 3 | `deck_seq` | screen |
| 23 | Temple of Chaos | `deck_seq` | player, October 10, 2026: the account's three Temple of Chaos teams |
| 24 | Cairos Dungeon: the hundreds of `deck_seq` are 1 Giant's Keep, 2 Dragon's Lair, 3 Necropolis, 4 Spiritual Realm, 5 Steel Fortress, 6 Punisher's Crypt | `deck_seq` mod 100 | screen |

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

Default is not a content. It is the runes' ordinary placement — what Scenario
and every battle outside a preset uses — and stands alone before the tabs.

## 4. The model

The account owns physical runes and artifacts. A placement is the relation
(item, monster, **context**). A context is either **Default** or one preset
`(deck_type, deck_seq)`.

- Within a context, an item has at most one monster and a monster at most one
  rune per slot and one artifact per slot.
- Across contexts, the same item may have different monsters.
- **A pool is a limit on what JASWA does, never on what it reads.** The
  game's decks of one pool (`sharedPool` in `preset-contents.ts`) — the Siege
  Battle and World Guild Battle defense presets, and the teams of Temple of
  Chaos, Dimension Raid, Rift Raid and World Guild Battle (§1, rules 4–6) —
  should hold each item on at most one monster between them, and Temple of
  Chaos each monster in at most one team. A pool is named by its own id, not
  by a content, because one battle may span several contents: Dimension Raid's
  three phases are three contents and one pool. The game does not
  always stop it, and what the game shows on a team is what JASWA shows. So
  each deck is its own context, read exactly as the game saved it, with its
  own team, gear, profiles, priority and speed tuning. A preset built in JASWA
  is a draft of one team and never joins the game's pool.
  - **An overlap is a fault of the preset, never of the import.** Decks of one
    pool that hold the same item — or, for Temple of Chaos, the same monster —
    keep it on every one of them. Each team involved names what it shares
    (`poolConflicts`), and the Presets page says so on the preset's warning
    line beside its sold items and missing monsters: *Shares 2 runes and
    1 monster with another team*. A deck that saved monsters only is measured
    on the Default gear it runs on.
  - Each deck knows what the pool's other decks hold (`poolRuneIds`,
    `poolArtifactIds`, `poolTakenUnitIds`) and uses it only to refuse: JASWA
    never forms an overlap. Rune Optimization reads every rune another team
    holds as excluded (`runeLocksInPreset`), a rune the team shares with one
    included; an engrave refuses a build bringing such a rune in; a monster
    joining a game deck brings its Default gear less what the deck or the pool
    holds, and a monster another Temple of Chaos team holds is not offered.
  - Nothing done in one deck writes into another. The previous model made an
    engrave take its runes out of the pool's other decks, and with them every
    rune the game had let two teams share; a team then showed a monster with
    no runes that the game showed fully geared.
- A relic belongs to Default only and is read into every context.
- Item stats, grade, slot and craft state belong to the physical item and are
  never copied into a placement.
- A placement naming an item the account no longer owns is kept and shown as
  sold; it is never dropped and never repaired.

Placement is resolved once, at the account boundary. `Rune` and `Artifact`
carry no owner field. Every reading of a monster's slots, its stat sheet,
its sets or its speed takes a context argument, and no page, filter or worker
picks a context of its own.

### 4.1 A profile belongs to a copy in one context

What the user says a monster is for — its profile: nickname, wanted builds and
slot mains, stat ranges, the figure to rank by, crit and element switches,
leads, and the artifact and relic wishes — is stated for a copy **in one
context**, never for the copy. The same Lushen in Default, in Arena Attack 3
and in Arena Attack 4 is three profiles, and an edit to one reaches neither of
the others. A monster has no one identity across presets; it has one per team
it stands in.

- Profiles are stored by context and then by `unit_id`
  (`monster-preferences.ts`). A copy appears at most once in a preset, so the
  pair names one team member exactly; two arena teams holding the same copy are
  two presets and two profiles.
- **No fallback between contexts.** A copy with no profile in a preset reads the
  defaults there, not its Default profile: a fallback is a channel an edit in
  Default flows through. Moving a profile across is the user's act — *Copy
  from…* in the overlay — and copies it; afterwards each is its own.
- Speed Tuning's order and what-ifs and a preset's priority list are already
  per preset, and so are a rune's Lock and Exclude (§5).
- A preset deleted in JASWA takes its profiles, speed tuning and priority list
  with it; a copy taken out of a preset takes its profile there.
- A copy is named by the profile of the context it is read in: the Presets page
  and Speed Tuning by each preset's, Rune Optimization and Monster Stats by the
  chosen preset's, and every page about Default — Monster Numbers, the artifact
  and relic pages, Rune Clean-up — by Default's.
- Artifact Optimization, its value columns and the relic plan judge Default
  (§5) and read Default's profiles. A relic is Default's in every preset (§1),
  so a preset profile's relic wishes are read only by that preset's overlay,
  against the relic it carries there.
- A profile stored before profiles had a context is read as Default's — the
  context every profile was written in before presets — and is not spread into
  any preset.

Presets the player builds in JASWA are the player's own choices
(AGENTS.md §0). They are stored with the preferences, are never overwritten by
an import, and are checked one preset at a time on load.

## 5. The workspace

**Presets** (formerly Rune priority).
- *Content* heads the page with *Area* beside it and *Preset* below, and
  opens on Default.
- *Content* lists Default, the game's seven tabs (§3.1) and, only while there
  are any, the presets not yet named. *Area* lists the chosen tab's contents,
  all of them, and is disabled where the tab holds one. Default is chosen in
  *Content* outright; any other choice offers the area's presets in *Preset*,
  each shown with the faces of its team, and the list below is empty until one
  is chosen.
- A preset built in JASWA stands in its content exactly as the game's do,
  after them; one without a content stands with the presets not yet named.
- *Add preset* sits at the right, starts the new preset in the chosen content
  under the name the game would give its next one, and is available as soon as
  a content other than Default is chosen, and only while live sync is off.
- While live sync is off, the game's presets are the user's to change too:
  a monster is added to the first empty position or taken out of its own,
  the crown names the leader, and *Delete preset* removes it. Each change is
  written into the import, as an engrave is, and the next import states the
  game's own presets again. A monster added to a preset that saves its gear
  brings its Default gear, less what the preset already engraves; one taken out
  takes its gear and its profile there with it.
- The order of monsters within a preset is their priority for runes. Rune
  competition exists only inside a preset, so that is the only place a
  priority means anything; between the teams of a pool there is no order,
  because a rune on another team is never taken at all.
- Each monster has a shortcut to Rune Optimization in that preset. The preset
  has one *Speed tuning*, under *Add preset* and *Delete preset*, which opens
  its team over Presets — the overlay Speed Tuning's own lines open — disabled
  only on Default and on a preset with no monsters.

**Rune Optimization.**
- The preset being optimized for is shown prominently above the monster:
  one plain list of Default and every preset. The monster list contains only
  members of the chosen preset. Changing preset keeps the chosen monster if
  it belongs there, otherwise clears the monster choice. An empty preset says
  it has no monsters and cannot start a search.
- A monster opened from a place about one preset — a preset's list, a Speed
  Tuning team, a row of Monster Stats, a rune engraved in one preset, a build —
  opens its overlay on
  that preset, and *Save and optimize* there opens Rune Optimization on it. A
  monster opened from a place about no preset — Monster Numbers, an artifact, a
  relic — opens on Default, which is what those pages show. Opening the overlay
  leaves the preset chosen across the program alone; only *Save and optimize*
  changes it.
- The overlay's *Build for* box is a menu of Default and the presets the copy
  stands in, and switches the profile, gear and figures the panel reads. It
  waits while an edit is unsaved, so an edit is never carried across. Beneath
  it sit *Save and optimize* and *Copy from…*, which offers every other one of
  those contexts, whether the copy has a profile there or not (§4.1).
- The candidate runes are every owned rune, minus those engraved on other
  monsters of the same preset where the settings say so, and minus every rune
  another deck of the preset's pool holds, whatever the settings say. Runes in
  other presets cost nothing and are always candidates. `runesInPreset` gives
  each rune the monster carrying it in the chosen preset, so the search reads
  one placement and no other.
- *Only use runes from inventory* became *Only runes not engraved in preset*:
  ticked, no monster of the preset gives up a rune, while a rune engraved only
  in other presets stays a candidate.
- *Include runes from higher-priority monsters* refers to monsters of the same
  preset.
- *Just fill in empty slots* and *Max changes* are measured against the
  monster's build in the chosen preset.
- *Engrave* writes the build into the chosen preset and moves nothing out of
  any other context, a deck of the same pool included (§4).
- **Lock and Exclude** (`rune-locks.ts`) bind one rune to one monster in one
  scope: Default, one preset, or — where the game's decks share one pool (§1,
  rules 4–6) — the whole pool. A lock engraves the rune
  on the monster, makes it the slot's one answer and keeps it from every other
  monster of the scope; an exclusion keeps it out of that monster's builds only,
  taking it off the monster first where it is engraved there. Every control
  names that move: *Engrave and lock* or *Lock*, *Remove and exclude* or
  *Exclude*, by where the rune is now.
  Both are stored with the import rather than the preferences: a new file, a new
  game session or a sync replaces them with the game's data, which has none, and
  under *Always synchronized* both are off.

**Speed Tuning.**
- Rules are removed.
- The three columns hold presets by content: dungeons left (Cairos, Dimension
  Hole, Rift of Worlds), Arena Attack and Defense centre, all others right.
- A preset's monsters are the game's; the user states the turn order wanted
  and the what-if display speeds, stored per preset. The leader is the user's
  to choose wherever the preset is (§5, Presets): saved with the team, it is
  written as the Presets page's crown writes it, and under live sync it is only
  reported. Until an order is
  stated, the preset is read in the game's own order.
- Every speed is computed from the preset's own runes, with the relic from
  Default.
- The Arena column lists its defences first, then the attack teams.
- Every preset with a monster is a team, and every team opens and is tuned
  alike. A content without enemy data — Trial of Ascension, Temple of Chaos,
  Rift of Worlds, Dimension Hole and the guild contents — is tuned for its own
  turn order, its leader skills counted by its area
  (`SPEED-TICK-CANONICAL.md` §2.2); a preset whose content is not yet named
  counts only the leads that count everywhere, and has the places it fills.
- *No speed tuning*, under a team's last slot and off by default, is the
  user's word that the team is not speed tuned. Saved with the team's tuning,
  it reads the team against no enemy: each monster still says whether it is in
  place and which of the team's turns it takes, the *Enemy cut in* section and
  Ticks leave the overlay, and the page shows *No speed tuning*
  with a green check.

**Rune Optimization.** A build's Location names the Default monster for a rune
free in the selected preset, by name alone, as the game's rune list does. A
rune freed in the preset from a monster that still carries it in Default is
shown on that monster before and after, so it has no Previously. If that Default
monster is the one being optimized, the card says *Inventory* instead: the
rune still has to be engraved in this preset, which the Changes figure counts.
Previously names the rune's earlier place in that preset after JASWA moves it,
in Location's words: a rune the preset left free names its Default monster.

**Rune Clean-up, Gems & Grinds and every rune or artifact list.**
- One *Engraved* label replaces the monster name in the location column. A
  fixed-width count beside it gives the number of placements.
- Hover or focus reveals the monsters, grouped by context.
- The filter is the same everywhere: *Engraved* / *Inventory*, and nothing
  chosen means everything.
- A sell recommendation for an engraved item carries a red mark, because
  selling empties a slot in every context that uses it.

**Artifact pages.** The artifact list's location follows the rune rule above.
Artifact Optimization and its value columns plan Default: which artifact a
monster carries in Default and what to engrave, keep or sell there.

**Choosing a preset.** *Content*, *Area* and *Preset*, as the Presets page
lays them out, are the one way a preset is chosen: `PresetChooser` draws the
three fields and `preset-choice.ts` resolves and falls back the choice, so
every page that offers it looks and behaves alike and is mended in one place.
A page that makes presets — Presets — offers every content, empty ones
included, because a preset is added to the content chosen; a page that only
reads them offers only the tabs and contents holding one.

**Monster Stats** reads one context at a time. The chooser sits above the
filters, ruled off from them, offering only contents with presets, and the page
opens on Default. The table lists the chosen preset's team in its own order,
each copy with the runes and artifacts it carries there and Default's relic, so
sets, stats and composites are the preset's and never Default's. The choice is
not a filter: *Reset filters* leaves it alone.

**Monster Numbers** shows Default and the number of presets each monster
belongs to.

## 6. Order of work

Each step is committed on its own:

1. Terminology: *engraved* everywhere; Clean-up presets become roles; the
   Rune Optimization preset becomes a profile.
2. Match `deck_type` to content names from a capture and the Deck Building
   screen.
3. The context model: placements resolved at import, `occupiedId` removed,
   the stat sheet takes a context.
4. The Presets page.
5. Rune Optimization in a preset.
6. Speed Tuning by preset.
7. Clean-up, Gems, artifact pages and filters.
8. Helper: merge `setDeckList`, then release.
9. Parity: every preset and placement reachable in the interface; a selected
   preset's figures come from its own placements. Exercise an empty preset, a
   full preset, a rune shared by two presets with different monsters, and a
   sold rune still named by a preset.

`app/lib/deck-presets.ts` already reads saved placements and rejects a
duplicate preset identity, an item twice in one preset, an unknown monster and
a doubly filled slot; `verify:deck-presets` holds it and can measure a private
traffic log without printing IDs:
`node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/verify-deck-presets.mjs <log-path>`.

## 7. Open questions

Each is a TODO: until it is answered, JASWA keeps the safe reading named here
and says so where it matters.

- **`deck_type` 2 — which guild content.** Fourteen three-monster decks,
  numbered 1–15. More than ten rules out the Siege Battle defense presets, so
  they are not the shared pool. They are Siege Battle attack or World Guild
  Battle / Guild Rival Battle attack; fifteen is the latter's capacity where
  Siege Battle's is 25, so they are read as World Guild Battle until the screen
  says otherwise. The answer now matters beyond the name: as World Guild Battle
  the fourteen decks are one pool (§1, rule 6), as Siege Battle attack none.
- **`deck_type` 4, 8, 9.** Five-monster decks, three or fewer of each, holding
  the same teams as one another. None is Temple of Chaos, whose presets are
  type 23, nor a Dimension Hole dungeon or Rift of Worlds beast,
  whose teams are four and six. Two of type 9's teams were last fought in a
  content whose recent-deck numbers fall in four groups — Monster
  Subjugation's shape, with Labyrinth the other guild content of five. Read as
  Labyrinth Normal (4), Monster Subjugation Water (8) and Fire (9); the areas
  within each are a guess the Guild tab's screen will settle.
- **Saving the Arena Interserver defense.** Not yet captured. The helper takes
  any answer carrying `server_arena_defense_deck_info` whole, as it does for
  the Arena defense, whose save is confirmed.
- **The Siege Battle and World Guild Battle defense pools** are modelled and
  enforced (`sharedPool`) but no deck type is matched to either yet.
- **Which saved decks make up one battle** in a content of several decks per
  battle (§1). Every saved deck of the pool's contents is read as one pool.
- **Team sizes not seen on screen.** Siege Battle and World Guild Battle are
  read as three, Labyrinth, Monster Subjugation, the Towers and Spires as five,
  the Rift of Worlds beasts as six. Dimension Hole's four and Temple of Chaos's
  five are from the screen.
- **Speed Tuning outside arena and Cairos.** Trial of Ascension, raids and the
  rest have no enemy data or settled leader-skill area, so they are listed and
  not judged.
