# Rune craft items — what `rune_craft_item_list` holds

**Status:** Binding for the Gems & Grinds workspace
**Settled:** September 13, 2026

`docs/RUNE-CANONICAL.md` §8 is the authority on what an Enchanted Gem and a
Grindstone *do*, and its value tables are the ones this workspace reads. This
document covers only the half that document does not: how the export writes
them down, and what the app is therefore allowed to say about them.

`ARTIFACT-CANONICAL.md` §15.12 named this collection once already, from the
other side — engraved conversion stones live in `artifact_crafts`, and reading
`rune_craft_item_list` as artifact properties resolved two of forty owned pairs
while inventing ids such as −487. This is the positive statement of what those
records actually are.

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

Read from the delivered export (wizard 21822407, 826 stacks holding 2,734
items), every field is exhaustive and nothing is left over:

| `craft_type` | Stats seen | Sets seen | Grades seen |
| ---: | --- | --- | ---: |
| 1 | all eleven | 1–25 | 4, 5 |
| 2 | 1, 2, 3, 4, 5, 6, 8 | 1–25 | 3, 4, 5 |
| 3 | 11 | 99 | 5 |
| 4 | 1, 3, 4, 5, 6 | 99 | 4, 5 |
| 5 | all eleven | 1–24 | 13, 14, 15 |
| 6 | 1, 2, 3, 4, 5, 6, 8 | 1–24 | 13, 14, 15 |

Three readings follow from that table, and each is a check the code makes
rather than an assumption it carries:

- **Odd types are gems, even types are grindstones.** §8 allows a grindstone on
  HP +, HP %, ATK +, ATK %, DEF +, DEF % and SPD and on nothing else, and types
  2, 4 and 6 are exactly the ones whose stats stay inside that list. Types 1, 5
  and, by its pairing, 3 carry CRI Rate, CRI Dmg, Resistance and Accuracy as
  well. `readCraftItem` rejects a grindstone record naming an ungrindable stat,
  so a misread of this table fails loudly instead of offering a stone to the
  wrong runes.
- **Set 99 is the Immemorial marker.** It is not a rune set, it appears on types
  3 and 4 and nowhere else, and §8 describes the Immemorial gem and grindstone
  as precisely the set-independent pair. Types 3 and 4 must carry it; no other
  type may.
- **Types 5 and 6 are the Ancient pair, and their grades run ten higher.** §7
  says Ancient runes use their own gems and grindstones and that an ordinary one
  is not a permitted fallback. These two types carry the same set and stat
  vocabulary as their ordinary counterparts, no grade below 13, and a sell value
  above the ordinary item of the matching rank at every grade (28 800 / 36 000 /
  44 400 against 30 000 / 37 000 for a gem). Grade `13 + n` is read as ordinary
  grade `3 + n`.

Intangible needs no clause: it is `set_id` 25 like any other set, so an
Intangible rune is matched by an Intangible item or by an Immemorial one, which
is exactly the pair §10 allows it.

## 3. Ancient value ranges

Ancient is not a grade multiplier. Types 5 and 6 use the separate Ancient
Gem/Grindstone tables in `RUNE-CANONICAL.md` §8, and `CraftItem.range` always
exposes that exact interval. This lets the box and Rune Clean-up calculate a
numeric, reproducible projection rather than treating owned Ancient materials
as visible-but-unusable. The source is named in the canonical document's
revision rule; a client observation wins if the game changes it.

## 4. Parity

`validateGameFile` reads every craft record through `readCraftItem` and every
rune through `readRune`, so the collection the account badge counts and the
collection the box list shows are the same collection. This is `AGENTS.md` §0.1
part 3 applied: a stack that passes a structural check and then cannot be
decoded into a kind, a set, a stat and a grade would be counted and invisible,
which is worse than rejected. On the delivered export both readers accept
everything — 826 of 826 stacks, 3,242 of 3,242 runes.

`npm run verify:rune-craft-items` pins section 1, section 2 and the placement
rules built on them, against synthetic records rather than personal data.
