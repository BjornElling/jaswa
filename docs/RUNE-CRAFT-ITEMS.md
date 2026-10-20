# Rune craft items — what `rune_craft_item_list` holds

**Status:** Binding for every reader of the export's rune craft items
**Reviewed:** October 20, 2026

`RUNE-CANONICAL.md` §8 is the authority on what an Enchanted Gem and a
Grindstone *do*, which runes each may go on, and the value tables JASWA reads.
This document covers the other half: how the export writes the items down, and
what the app may therefore say about them. Engraved artifact conversion stones
are a different collection, `artifact_crafts` (`ARTIFACT-CANONICAL.md` §15.12).

---

## 1. The record

Every entry carries `craft_item_id`, `craft_type`, `craft_type_id`, `amount`
and `sell_value`. Two of them do the work.

**`craft_type` names the item**, and the six values pair off — a gem and a
grindstone for each of the three lineages:

| `craft_type` | Item |
| ---: | --- |
| 1 | Enchanted Gem |
| 2 | Grindstone |
| 3 | Immemorial Enchanted Gem |
| 4 | Immemorial Grindstone |
| 5 | Ancient Enchanted Gem |
| 6 | Ancient Grindstone |

**`craft_type_id` reads `SS TT GG`** — set, stat, grade — as a 5- or 6-digit
number, so `set × 10 000 + stat × 100 + grade`:

```text
  1 04 04    Hero Energy ATK % item
 13 08 05    Legend Violent SPD item
 99 11 05    Legend Immemorial Resistance item
  5 11 14    Hero Ancient Rage Resistance item
```

`SS` is the game's own `set_id`, the one every rune carries. `TT` is the effect
id of `RUNE-CANONICAL.md` §2. `GG` is `1` Normal through `5` Legend.

## 2. What the account shows

Read from the account export `Culpa-21822407.json` (August 23, 2026; 826 stacks
holding 2,734 items), every field is exhaustive and nothing is left over:

| `craft_type` | Stats seen | Sets seen | Grades seen |
| ---: | --- | --- | ---: |
| 1 | all eleven | 1–25 | 4, 5 |
| 2 | 1, 2, 3, 4, 5, 6, 8 | 1–25 | 3, 4, 5 |
| 3 | 11 | 99 | 5 |
| 4 | 1, 3, 4, 5, 6 | 99 | 4, 5 |
| 5 | all eleven | 1–24 | 13, 14, 15 |
| 6 | 1, 2, 3, 4, 5, 6, 8 | 1–24 | 13, 14, 15 |

Three readings follow, and each is a check the code makes rather than an
assumption it carries:

- **Odd types are gems, even types are grindstones.** `RUNE-CANONICAL.md` §8
  allows a grindstone on HP +, HP %, ATK +, ATK %, DEF +, DEF % and SPD and on
  nothing else, and types 2, 4 and 6 are exactly the ones whose stats stay
  inside that list; types 1, 5 and, by its pairing, 3 carry CRI Rate, CRI Dmg,
  Resistance and Accuracy as well. `readCraftItem` rejects a grindstone record
  naming an ungrindable stat.
- **Set 99 is the Immemorial marker.** It is not a rune set, it appears on types
  3 and 4 and nowhere else, and those are the set-independent pair of
  `RUNE-CANONICAL.md` §8. Types 3 and 4 must carry it; no other type may.
- **Types 5 and 6 are the Ancient pair, and their grades run ten higher.** They
  carry the same set and stat vocabulary as their ordinary counterparts, no
  grade below 13, and a sell value above the ordinary item of the matching rank
  at every grade (28 800 / 36 000 / 44 400 against 30 000 / 37 000 for a gem).
  Grade `13 + n` is read as ordinary grade `3 + n`.

Placement follows `RUNE-CANONICAL.md` §8's table, which `lineageFits` applies:
an ordinary item goes on an ordinary rune of its own set, an Ancient item on an
Ancient rune of its own set, and an Immemorial item on any ordinary rune but
never an Ancient one. An Intangible rune is `set_id` 25 like any other set, so
it is matched by an Intangible item or an Immemorial one.

## 3. Ancient value ranges

Ancient is not a grade multiplier. Types 5 and 6 use the separate Ancient Gem
and Grindstone tables of `RUNE-CANONICAL.md` §8, and `CraftItem.range` always
exposes that exact interval, so Gems & Grinds and Rune Clean-up project owned
Ancient items numerically. The tables' source is `RUNE-CANONICAL.md` §13 item
11, a secondary source from 2019 that the export confirms only in part; a client
observation wins where it disagrees.

## 4. Parity

`validateGameFile` reads every positive craft stack through `readCraftItem` and
every rune through `readRune`, so the collection the account badge counts and
the collection the box list shows are the same. The game leaves an otherwise
valid craft record with `amount: 0` after its last item is spent; that is an
empty stack, not an owned item, and the import removes it before the record is
stored. Any non-empty record that cannot be decoded into a kind, a set, a stat
and a grade fails loudly under `AGENTS.md` §0.1 part 3, and `readCraftItems`
throws on it as `readRunes` does. On the account export of August 23, 2026 both
readers accept everything — 826 of 826 stacks, 3,242 of 3,242 runes.

`npm run verify:rune-craft-items` pins section 1, section 2 and the placement
rules built on them, against synthetic records rather than personal data.
