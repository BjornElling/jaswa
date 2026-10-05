# Deck Presets and rune placement

**Status:** Implementation contract and investigation, October 5, 2026.

## Game terminology and scope

Com2uS calls the feature **Deck Preset**, the village equipment arrangement
**Default Monster** in its [later loading instructions](https://store.steampowered.com/news/posts/?enddate=1778652013&feed=steam_community_announcements),
and the place to manage saved decks **Deck Building**.
JASWA should use those names. A generic "Scenario" would obscure the game's
own distinction between the default arrangement and a saved deck.

The [v9.2.0 update notice](https://store.steampowered.com/news/posts/?enddate=1777441037&feed=steam_community_announcements)
and its [preset capacity table](https://hive-fn.qpyou.cn/hubweb/contents/2EN_1777364557.png)
name these destinations:

| Group | Attack Deck Preset destinations | Defense Deck Preset destinations |
| --- | --- | --- |
| Arena | Arena; Arena Interserver Battle | Both |
| Guild | Siege Battle; World Guild Battle; Guild Rival Battle; Labyrinth: Normal, Rescue, Explode, Cooldown Time Up, Speed Limit, Time Limit, Boss; Monster Subjugation: Water, Fire, Wind, Boss | Siege Battle; World Guild Battle |
| Cairos Dungeon | Giant's Keep; Dragon's Lair; Necropolis; Spiritual Realm; Steel Fortress; Punisher's Crypt | — |
| Trial of Ascension | Trial of Ascension | — |
| Challenge of Ascension | Tower of Water, Fire, Wind, Light, Dark; Spires of Ascension | — |
| Temple of Chaos | Temple of Chaos | — |
| Rift of Worlds | Fire, Ice, Wind, Light, Dark Beast; Rift Raid | — |
| Dimension Hole | Forest of Roaring Beasts; Sanctuary of Dreaming Fairies; Cliff of Tough Beast Men; Ruin of Silent Death; Castle of Forgotten Heroes; Hellground of Raging Fires; Dimension Raid phases 1, 2, 3 | — |

The [April developer's note](https://store.steampowered.com/news/posts/?enddate=1775632877&feed=steam_community_announcements)
says the same rune can be saved on different monsters in different Preset
decks. The v9.2.0 notice adds a narrower restriction: Siege Battle defense
decks cannot share a rune among their ten decks. That exception must be
modelled as a rule for that destination, once the export's numeric deck types
have been established, rather than as a global one-owner rule.

## What the captured export establishes

The local helper traffic log contains `HubUserLogin` responses with `deck_list`.
A saved deck is identified by **both** `deck_type` and `deck_seq`. Its optional
`equip` array contains one record per monster: `unit_id`, `rune_id_list`, and
`artifact_id_list`. `equip: null` means no saved equipment. The account also
has `world_arena_rune_equip_list`, which has rune and monster IDs but is a
separate equipment system. `deck_recent_list` is a recent deck list, not a
saved Preset list.

The traffic log also shows `setDeckList` responses. They carry
`deck_info.deck_type` and a `deck_info.deck_list` for that type, with the same
saved-deck fields as login. The helper currently has no `setDeckList` handling
in `helper/src-tauri/src/profile.rs`, so a live import can retain stale saved
decks after the player edits one in the game. This must be fixed and released
with the helper before JASWA claims live Preset synchronization.

The capture contains 55 saved deck records, 32 with an equipment array, and
eight with actual rune assignments. It proves that a physical rune can occur
in several decks: 52 rune IDs occur in more than one, with a maximum of three
decks for one rune. The overlap includes different `deck_seq` values under
the same `deck_type`. A model keyed only by content type would overwrite real
placements. One saved deck refers to a rune absent from the current account;
the reader records this stale reference instead of inventing an owner or
rejecting the whole account. The capture also contains 24 stale artifact
references.

The captured numeric `deck_type` values are **not yet matched** to the names
in the game's table. Neither the game notice nor the export explains that
mapping. Do not infer it from monster counts or the order of entries. A
numeric type can be preserved losslessly until a game panel or another
authoritative mapping confirms its name.

## Structural rule

The account owns physical runes. Placement is a relationship among a rune,
a monster, and a **specific deck identity**. The Default Monster arrangement
and World Arena equipment are additional contexts. Within one deck a rune
has at most one owner and a monster at most one rune per slot. Across decks,
the same rune may have different owners. Rune stats, grade, slot and craft
state remain properties of the physical rune and never get copied into each
deck's placement record.

`app/lib/deck-presets.ts` reads saved rune and artifact placement and rejects duplicate
identities, duplicate assignment within a deck, unknown monsters and double
occupied slots. It retains references to runes the player no longer owns and
reports them as missing. `verify:deck-presets` checks the contract with
synthetic decks and can additionally measure a private traffic log without
printing IDs: `node --experimental-strip-types --no-warnings --import
./scripts/json-module-hook.mjs scripts/verify-deck-presets.mjs <log-path>`.

## Remaining integration

The workspace still reads `occupied_id` on a physical rune and `unit.runes` as
the current build. Every such consumer must receive an explicit equipment
context before Deck Presets can be presented as active builds: monster stat
sheets, Speed Tuning, Rune Optimization, rune location and hold decisions,
engraving, clean-up, and all rune and artifact overlays. Editing a saved deck
must change only that deck's assignments. A context-aware import audit must
compare every saved assignment with reachable interface state. The numeric
`deck_type` mapping and the Siege Battle defense exception need evidence from
the game's panels or a documented protocol before the UI names or enforces
them. This work is unfinished; the current UI must not claim to show a saved
deck's equipped stats.

The next implementation steps are ordered by dependency:

1. Make Default Monster, World Arena, and a saved `(deck_type, deck_seq)` one
   explicit equipment-context type. Require a context argument for reading a
   wearer, a monster's six slots, or its stat sheet. A physical `Rune` should
   no longer carry `occupiedId`.
2. Resolve equipment once at the account boundary, including artifacts, and
   pass that resolved context through every workspace and worker input. Never
   let a filter pick a different calculation context.
3. Make editing and engraving update only the selected context. Check the
   Siege Battle defense sharing rule after its deck type is established.
   Merge `setDeckList` responses by deck type in the helper and release it.
4. Add an import and UI parity check: every saved deck and every assignment
   must be reachable, and a selected deck's displayed totals must come from
   its own equipment. Exercise empty decks, full decks, a shared rune with
   different owners, and a sold rune still named by a saved deck.
5. Remove the global wearer fields and scan `app/`, `scripts/`, `tests/`, and
   `docs/` for `occupiedId`, `occupied_id`, and `unit.runes` use. Any remaining
   reference must explicitly describe Default Monster or the raw export.
