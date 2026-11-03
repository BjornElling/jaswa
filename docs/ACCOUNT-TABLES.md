# Account tables and views

**Status:** Binding interface contract for the account tables and the artifact workspace views
**Reviewed:** October 20, 2026
**Code:** `app/components/sortable-table.tsx`, `app/components/use-sorted-rows.ts`,
`app/lib/table-layouts.ts`, `app/lib/monster-identity.ts`,
`app/lib/sealed-shrine-storage.ts`, `app/components/artifact-maximum-values.tsx`,
`app/components/use-auto-recalculate.ts`
**Checks:** `tests/table-sorting.spec.ts`, `tests/awakening-search.spec.ts`,
`verify:monster-awakening-scope`, `verify:recommendation-filters`,
`verify:artifact-recalculate-mode`, `verify:library-layout`

How the account's tables sort and search, and how the artifact workspace reports
a result. Game rules and scores live in `ARTIFACT-CANONICAL.md`; layout
stability in `AGENTS.md` §2.

---

## 0. Inclusive filter selections

`app/lib/filter-selection.ts` states the rule for every inclusive filter group:
no selected options and all offered options selected both mean **all**. Only a
proper, non-empty subset narrows the rows. Multiple selections in one group
are alternatives; different groups combine. A record carrying several locations
matches when one of those locations matches the chosen subset.

This applies to Location, Element, Type, Grade, Set, Slot, Rarity, Durability,
Advice and their equivalents across Monsters, Runes, Artifacts, Relics and
Gems & Grinds. The booleans used by a two-option Location group obey exactly
the same rule. Selecting the entire offered vocabulary is unrestricted even
where a record has an unstated field or a category the short filter row omits.
The user's controls keep their actual pressed/checked state; no interpretation
rewrites saved choices or resets other filters.

Conditions such as *Hide if*, *Only show if*, *Have ≥*, *Include Intangible*,
*Ancient*, and *Lvl. < 40* retain their existing predicate semantics. Search,
numeric ranges, calculation modes and role requirements also retain their own
meaning. The developer confirmed this boundary on October 25, 2026.

`verify:filter-selection` holds the shared truth tables and its use in each
workspace; `tests/filter-selection.spec.ts` drives the visible groups.

## 1. Every table sorts on every column

Any table sorts by any of its columns, ascending and descending — names,
locations and marks included. A ranking the user cannot re-ask is a ranking
they have to trust. **A column with no comparison is a defect.**

Sorting belongs to the shared frame: every table declares `SortableColumn`s and
renders `SortableHeader`; no table carries its own sort state, header markup or
arrow. A view that shows **entries rather than a table** (the monster chooser's
recommendation blocks) has no columns to offer, so it **names the figure it
ranks by** in a line under its heading. `tests/table-sorting.spec.ts` asserts
that no heading is inert and each reverses on a second click.

## 2. The sort arrow sits outside the heading text

The arrow goes on the side of the label **away** from the column's own edge:
after the text when left-aligned or centred, before it when right-aligned, so a
right-aligned heading stays against the figures it names. `sortMarkSide` in
`table-layouts.ts` derives it from the same `align` that positions the heading
and its cells. The mark keeps its footprint when unsorted, so a click never
re-lays out the row.

## 3. A search reaches a monster's awakened forms, never its lesser ones

Awakening is one-way. Searching `poison master` also shows Kyle, the copy the
user actually owns; searching `kyle` does **not** show Poison Master. The scope
is one element's chain, not the family: `Kyle` never answers `Todd`.

- **Both monster tables answer alike.** Stats and Numbers both read
  `withHigherAwakenings` (`monster-identity.ts`); `tests/awakening-search.spec.ts`
  runs one set of expectations against each. Stats also matches rune sets, and
  that match seeds no widening.
- **The seed is the whole account; the result is the page's own rows.** What
  the account holds — every location, the Sealed Shrine included, before any
  filter — seeds the lineage (`shrineMonsterRecords`). What the search returns
  is bounded by the rows the page can list. No filter, Location box or the
  `Lvl. < 40` default decides what the account contains.
- Identity (`monsterIdentityId`) **folds** a lineage into one key for counting
  copies; this scope keeps stages **ordered**. "…or better" belongs here, "how
  many" there. `verify:monster-awakening-scope` holds the direction, the
  element boundary, and that a form the account does not hold is never
  conjured into a result.

## 4. Stats and Numbers

The Monsters pages are **Stats** (the stat sheet) and **Numbers** (Inventory,
Monster Storage and both Sealed Shrine tabs); Location keeps `Storage` as a
value. Each keeps its own filters when navigation leaves and returns.

- **Gear reads as one block** directly after Runes, left-aligned: the artifact
  `HP/ATK`/`DEF` codes and the relic are codes, not quantities. The
  `.gear-start` inset separates them from the sets without a rule.
- **A derived figure sits a step back.** `E.HP`, `E.HP D` and `DMG` are computed,
  not read off the export, so they take the muted tone; full tone is for what
  the game itself states (`AGENTS.md` §5's two-tone device, not a colour).

## 5. The artifact recommendation figures add up

Every count the recommendation view prints reconciles with the others on the
page. The summary counts **every slot in scope**, naming each unfilled part only
when non-zero:

```
552 of 560 slots filled (8 awaiting preferences)
```

so filled + unfilled + awaiting = total, and a complete account reads `560 of
560 slots filled`. The parts derive from one total in
`artifact-maximum-values.tsx`. An internal distinction that makes a total
exclude something must not surface as a total the user cannot verify.

## 6. Before and after are two questions

**Location before** reads the import; **Location after** reads the allocation —
engraved if a monster was allocated the artifact, inventory if the advice is
*Sell*. They partition the rows independently, so `after: Engraved` yields as
many rows as the summary's filled slots while **Already matching** is unset.

**Conversion** and **Already matching** sit side by side, joined by an
**And/Or** switch — the one place in the program two groups are joined in
words, and the one join the user chooses, because both ask Yes or No about the
same advice and "converted or already placed" is a list worth asking for. *And*
is the default. *Or* joins only the groups that narrow: an unset group means
every row, so letting it take part would make the other group's choice do
nothing. **Conversion / Yes** shows rows with recommended conversions; **No**
shows rows with none, including Intangible artifacts, which cannot be
converted. **Already matching / Yes** shows the *Keep* rows, the artifacts
already on their recommended monster; **No** shows every other row. Both start
unset, and each follows §0's rule: no selection or both options shows all
rows.

**The view opens on the plan's engravings**: `Location after: Engraved` starts
pressed, leaving the artifacts the plan would engrave. It is a default, not a
restriction: one click restores the sell rows, and the allocation is still
computed over the whole library. These filters read the advice, so they narrow
rows and never change it.
`verify:recommendation-filters` drives them on a real import.

## 7. A stale result says so, and the user chooses who refreshes it

In owned-stone mode, every artifact recommendation view includes the stone
inventory in its calculation input. Spending the last stone invalidates its
recommendations even when the attempted conversion leaves the artifact unchanged.
Theoretical and no-conversion modes do not depend on the stone inventory.

A calculated table answers the settings and import it was calculated from.
When either moves, it is marked **out of date** in every view, never presented
as current. **Re-calculate** in Settings (`ArtifactSettings.recalculate`) has
exactly one of two values:

- **Manually** (default) — the result is kept and marked stale; Calculate
  remains the way to a fresh one. A whole-library calculation is work the user
  asked for.
- **On change** — the calculation re-runs itself; the notice reports the
  refresh under way. The complete previous result remains in place until its
  replacement is ready, including the records and conversion inventory that
  produced it. Never combine old scores with newly imported records or hide
  rows during the wait. The notice reserves its space in every state. Choosing
  another monster or artifact, clearing results and a failed calculation still
  discard that result. All three artifact recommendation views share
  `SettledCalculation` for this pending presentation.

The mode is not scoring input: `scoringSettings()` excludes it from the key a
view compares its held result against, and lists its fields so a new setting
must be classified on purpose. Auto-refresh never starts a *first* calculation,
never runs while one is in flight, and never retries a failed one — an error
clears the held result (`use-auto-recalculate.ts`,
`verify:artifact-recalculate-mode`).
