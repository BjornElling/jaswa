# Deck Presets and engraving

**Status:** Binding contract, October 7, 2026. JASWA leaves the model in
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
   or artifact may appear only once across all of them [920].
5. **Relics are not saved per preset.** A preset uses whatever relic the
   monster carries in Default [920]. One relic may be engraved on up to 150
   monsters (v9.3.0; `RELIC-CANONICAL.md`).
6. **Default still exists.** A monster's own runes and artifacts outside any
   preset are its **Default** arrangement, independent of every preset
   [DN1, v9.2.2, v9.2.3]. In Default a rune is engraved on one monster at most,
   as before.
7. **Engraved runes and artifacts can be sold** (v9.3.0). A preset then keeps
   a reference to a rune the account no longer owns.

What the notices leave open, and JASWA must not invent:

- Whether presets of a content that places several decks at once (Temple of
  Chaos, Rift Raid, Dimension Raid, World Guild Battle, Guild Rival Battle)
  may share a rune. v9.2.4's "Include Placed Runes" setting suggests they may;
  no notice states it. Until it does, JASWA treats each of those presets as
  independent and says so where it matters.
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
`deck_type` and `deck_seq`. Its optional `equip` array holds one record per
monster: `unit_id`, `rune_id_list`, `artifact_id_list`. `equip: null` means
the preset saved monsters only. `world_arena_rune_equip_list` is World Arena's
separate system. `deck_recent_list` is a recent-deck list, not a preset list.

`setDeckList` responses carry `deck_info.deck_type` and a
`deck_info.deck_list` for that type, with the same fields. The helper does not
yet merge them (`helper/src-tauri/src/profile.rs`), so a live import keeps
stale presets after the player edits one in the game.

A captured account held 55 saved decks, 32 with equipment, eight with rune
assignments. 52 rune IDs occurred in more than one deck, up to three, including
different `deck_seq` under one `deck_type`. One deck named a rune the account
no longer owned, and there were 24 such artifact references.

**The numeric `deck_type` values are not yet matched to content names.**
Neither the notices nor the export give the mapping. It is established by
comparing a fresh capture with the game's Deck Building screen, never by
inferring from team sizes or order. Until a value is matched, JASWA shows the
preset under its number and still uses it fully; a preset is never hidden for
want of a name (AGENTS.md §0.1).

## 4. The model

The account owns physical runes and artifacts. A placement is the relation
(item, monster, **context**). A context is either **Default** or one preset
`(deck_type, deck_seq)`.

- Within a context, an item has at most one monster and a monster at most one
  rune per slot and one artifact per slot.
- Across contexts, the same item may have different monsters.
- Across the Siege Battle defense presets, an item has at most one monster.
- A relic belongs to Default only and is read into every context.
- Item stats, grade, slot and craft state belong to the physical item and are
  never copied into a placement.
- A placement naming an item the account no longer owns is kept and shown as
  sold; it is never dropped and never repaired.

Placement is resolved once, at the account boundary. `Rune` and `Artifact`
carry no owner field. Every reading of a monster's slots, its stat sheet,
its sets or its speed takes a context argument, and no page, filter or worker
picks a context of its own.

Presets the player builds in JASWA are the player's own choices
(AGENTS.md §0). They are stored with the preferences, are never overwritten by
an import, and are checked one preset at a time on load.

## 5. The workspace

**Presets** (formerly Rune priority).
- *Choose preset* heads the page; nothing below it is active until a preset
  is chosen.
- The page lists the imported presets by content, plus the player's own.
- *Create preset* sits at the right and is available only while live sync is
  off.
- The order of monsters within a preset is their priority for runes. Rune
  competition exists only inside a preset, so that is the only place a
  priority means anything.
- Each monster has a shortcut to Rune Optimization in that preset.

**Rune Optimization.**
- The preset being optimized for is shown prominently and can be changed
  there.
- The candidate runes are every owned rune, minus those engraved on other
  monsters of the same preset, minus the Siege Battle defense pool when the
  preset is a Siege Battle defense preset. Runes in other presets cost
  nothing and are always candidates.
- *Only use runes from inventory* is removed.
- *Include runes from higher-priority monsters* refers to monsters of the same
  preset.
- *Just fill in empty slots* and *Max changes* are measured against the
  monster's build in the chosen preset.
- *Engrave* writes the build into the chosen preset and moves nothing out of
  any other context.
- A lock means "keep this rune on this monster in this preset".

**Speed Tuning.**
- Rules are removed.
- The three columns hold presets by content: dungeons left (Cairos, Dimension
  Hole, Rift of Worlds), Arena Attack and Defense centre, all others right.
- Every speed is computed from the preset's own runes, with the relic from
  Default.
- The player's tuning settings are stored per preset.

**Rune Clean-up, Gems & Grinds and every rune or artifact list.**
- One *Engraved* label replaces the monster name in the location column. A
  fixed-width count beside it gives the number of placements.
- Hover or focus reveals the monsters, grouped by context.
- The filter is the same everywhere: *Engraved* / *Inventory*, and nothing
  chosen means everything.
- A sell recommendation for an engraved item carries a red mark, because
  selling empties a slot in every context that uses it.

**Artifact pages** read a context the same way: the chosen preset, or Default.

**Monster pages** show Default and the number of presets each monster
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
