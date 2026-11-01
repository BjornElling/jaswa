# Rune craft items — what `rune_craft_item_list` holds

**Status:** Binding for every reader of the export's rune craft items
**Reviewed:** October 29, 2026

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

## 5. Recommendations, Best use and What's missing

The page lists Recommendations, Your box, Best use for this and What's missing,
in that order; the box alone opens by itself. All three craft views are one
component, `craft-item-best-use.tsx`, with one mode each, and read
`rune-craft-recommendations.ts`.

Every view has two panels. The question panel holds the item kind, the stack
(Best use only), Assumed roll, Then grind it, and Calculate, Clear results and
Cancel with the calculation status beneath them. The filter panel runs one
subject per row — the item (Family, Grade, Stat), then the rune it goes on
(Rune set, Location, Stat already grinded / gem'ed, and in Best use Only
keep-runes) — with the ranking length and Reset filters in the last column.
The other views leave Only keep-runes' cell empty, so no group moves between
views.

What's missing is laid out in three columns of one height, and the other views
are to follow once it is settled. The controls come first: the two panels as
one surface with a rule between them, the filters in three columns — Family,
Grade, Location; Rune set, Stat, Stat already grinded / gem'ed — and
*Suggestions per list*, the ranking length, on a row of its own. Then a column
for Clear results, Calculate, the cancelling ✕ (Rune Optimization's stop), the
status beneath them and Reset filters and Reset ignored at its foot. Last, at
the far edge, *Most wanted* in a box of the Statistics kind: ten rows always,
whatever the ranking length, in the caption size so the box stays narrow.
Reset filters returns the filter panel
only; the item kind, the chosen stack and the assumptions are the question.

Recommendations and Best use read `rune-craft-recommendations.ts`. Every calculation reads
all held Gems, all held Grindstones and all runes, independently of the filters.
Best use narrows that complete answer to one stack; Recommendations narrows it
by the selected categories. With no item chosen, Best use includes every item
of the displayed kind, following the universal inclusive-filter rule.
A suggestion spends one item independently, with an optional assumed follow-up
Grindstone on the gemmed property only. Suggestions are alternatives, not a
stock allocation across several runes. Stock depth does not multiply a rune's
score or produce duplicate entries for the same rune in one ranking.

`craftItemApplications` in `rune-craft-end-state.ts` enumerates every legal target
through `craftVariants`, the same end-state enumeration Rune Optimization uses.
It includes a converted line's same-stat re-Gem and retained stone, rejects a
non-improving assumed same-stat roll, respects level, slot, innate, duplicate,
lineage and set restrictions, and excludes a stone whose assumed roll cannot
beat the current bonus. The inventory's *Can improve* remains a potential count
at the item's maximum, independent of the assumed-roll rankings.

Each before and after line-up meets every allowed build of every role. The
valuation and fixed neutral ceiling are Clean-up's `prepareRuneCandidate`
reading, with the same accepted/broken discounts. The score prices the current
sub properties and innate only: no imagined power-ups and no additional craft.
The best reading is chosen separately before and after; its role may change.
This current-line reading is distinct from Clean-up's future-value verdict.
Both use the same ruler; neither a filter nor the item moves it.

- **Highest score:** the distinct runes with a positive score gain, ordered by
  score after spending the item.
- **Highest gain:** those runes ordered by the increase in their best score,
  in percentage points.
- **Highest stat:** Grindstones only. The distinct runes ordered by the final
  value of the specific sub property the item improves, including its stone.
  Recommendations gives each stat its own ranking: HP + and SPD are different
  units. A genuine stat increase remains eligible even when no role values it.

Ties use rune id, item id and target index. The calculation retains the best
target for **every rune/item pair**, including pairs below the current shortlist.
Score and gain share that best target because the pair's baseline is fixed.
Filtering and ranking are immediate projections of this complete answer; each
displayed ranking includes a rune at most once. Item, kind, family, grade, rune
set, stat, Location, already-crafted state, Only keep-runes and count never
invalidate an answer or start the craft worker.
The two disclosures share one answer through `compute/craft-result-memory.ts`,
including after workspace navigation. Reset filters resets only filters.

### What's missing

What's missing asks the engine about the box **and** everything it lacks, in one
calculation with its own memory (`missingCraftResultMemory`), so it never
overwrites the answer the other two views share. `missingCraftItems` lists, for
every set the account has runes of and only in the lineage those runes take,
every Hero and Legend Gem and Grindstone the box does not hold, with
`amount: 0`. Lower grades are left out because a lower grade of the same item
only rolls less. An Immemorial item rolls what the set's own item of that grade
rolls, so it is never a third choice: one held covers the set's item for every
ordinary set, and a listed set item says on its title that an Immemorial one
fits too. Whether an item is held is not a placement rule, so
`craftItemApplications` judges an absent item exactly as a held one.

Only absent items are shown, and each must clear a bar: the best the box's own
items of the same kind reach on that rune, or the rune as it stands where none
does (`heldCraftBenchmark`). The bar is read from the whole answer, so a filter
cannot lower it. Highest score and Highest gain list the runes an absent item
lifts past that bar, Highest gain by the distance past it; Highest stat lists
stones whose final value beats the best held stone of that stat. Each card adds
*Your box*, the bar it cleared. *Most wanted* says it per item: every rune names
the one absent item that lifts it furthest past the box, and items are ordered
by how many runes named them, then by their largest gain. The same ranking
function (`craftRecommendationRankings`) serves all three views; the box's views
pass the rune as it stands as their bar. An account with runes and an empty box
can still ask; one with no runes is told to import some.

**Stat already grinded** reads the item's specific stat on the rune before
spending anything: Yes includes a positive existing Grindstone bonus and No
includes none. A bonus on a different stat does not match.

**Can change gem'ed stat?** controls whether suggestions may replace an existing
Gem with a different stat. Yes permits every legal Gem application. No keeps
the existing Gem stat but still permits a better Gem of that same stat, and
does not restrict a rune's first Gem. The craft engine still rejects equal or
lower same-stat base values. Both controls keep Yes and No independent, with
neither chosen by default; neither or both leaves the answer unrestricted.
They filter the complete answer without recalculating or changing the held-box
benchmark, in Recommendations, Best use and What's missing. The saved choices
keep their existing storage field so changing the wording preserves them.

**Only keep-runes** (Best use only) has one choice, Yes. Chosen, it keeps the
runes whose *calculated* Rune Clean-up verdict is Keep and drops every other
verdict — Power up, Sell, and the Re-app and Refine a reroll target puts on a
sale. The sell safeguards (pre-grind SPD, potential value, preset engravings,
reroll targets) are read past through `calculatedRuneVerdict`: a rune kept only
because the user protects it is not one the calculation keeps. The verdicts
come from Clean-up's own engine (`use-rune-keepers.ts`): answers Clean-up
already holds for these inputs are read from `rune-advice-memory.ts`, and only
the runes it has not judged are asked of the advice worker, on a channel of
their own, once a craft answer is on screen. While they are first asked, the
status line says so and the rankings wait rather than show an unnarrowed list;
once an answer exists, a later update narrows by it until the new one is in. This is
the one filter that may start a worker, and it is never the craft worker.

**Ignore** sits in the top-right corner of every card in Recommendations,
Best use and What's missing. It waves away the card's rune together with the item's kind and stat:
ignoring a SPD Grind on a rune hides every SPD Grind on that rune, of any grade
or set, while an ATK Grind or a SPD Gem on it is still suggested. Every view
reads and writes one shared list, so ignoring in one hides it in all. The list is
saved choices (`craftIgnores`, `craft-ignores.ts`) keyed by `rune_id`, so they
outlast reloads, imports and live sync. **Reset ignored**, under Reset filters,
empties the shared list from any view; it stays in place, disabled, while the list is empty.
The reader retains valid entries from the developer's saved per-view choices
when combining them, drops invalid entries individually and deduplicates them.
Ignoring narrows what is shown like a filter: it never invalidates an answer,
and What's missing's bar is still read from the whole answer.
The filter runs on every rune/item pair before selecting the best suggestion
for each rune. Ignoring its best improvement therefore promotes an improving
alternative of another stat; it never removes the rune itself or its other
Gem and Grindstone suggestions. If every improving alternative is ignored,
there is no remaining suggestion to show until the list is reset.

Assumed roll and Then grind it sit in the question panel as calculation
assumptions. Changing them, the roles, scoring preferences or the account's
Lv. 40 monsters requires a new calculation and cancels work answering the old
question.

**A change to the box or the runes never does.** Every rune/item pair is judged
on that rune and that item alone, so the remembered answer is keyed by
everything but the items and runes, and lists the items and runes it has judged
(`craftItemKey`: the item without its amount; `craftRuneKey`: the whole rune).
`reconcileCraftCalculation` prepares the next answer: a stack that has left the
box, and a rune gone or changed, takes its old rows with it; a stack whose
amount merely changed keeps its rows under its new size. What is new — an item held, or in What's missing newly
absent; a rune new or changed — is calculated alone, without pressing
Calculate: every item on each new rune, and each new item on the runes already
judged (`craftExtensionRequests`), folded in by `extendCraftCalculation`. The
extended answer is exactly a fresh calculation's, which
`verify:craft-recommendations` holds. All three views keep the previous complete
answer on screen until every extension is finished, then publish the complete
replacement together. A changed rune never disappears between those answers.
Removals and quantity-only changes publish immediately when no calculation is
needed. Every published answer retires obsolete rune and item keys, so repeated
syncs retain only the current account. A failed extension keeps the previous
answer, reports the failure in the status line and is not retried until the
account changes again. Clear results explicitly discards the answer.

So a live sync, which replaces the whole import whenever the game changes,
never empties either view, and a reader scrolled down the rankings stays where
they are. Only keep-runes holds the same line: while Rune Clean-up judges a
new or changed rune, the rankings go on narrowing by its previous answer rather
than wait empty. `gems-and-grinds-live-sync.spec.ts` drives both views through a
live sync with the page scrolled down and fails on any scroll. It also holds
worker requests while a leading SPD rune changes in all three views, checks its
contents and bounds throughout the wait, and checks removal only after a
maximum grind has been calculated. Calculation is
explicit, cancellable, and runs in a dedicated worker. Session filters are
read one choice at a time; adding Rune set does not discard the other choices.

The processor joins items by set and lineage and prepares role prices once per
build/slot/star class. Thirty-two rune matrices are combined before dispatch so
small questions do not each pay for a separate card readback. The score matrix goes through `runAccelerated`, with a
card agreement gate and bounded passes of at most 16,384 jobs (under 2 MiB per
storage binding). Every buffer offset and workgroup size comes from
`compute/webgpu/craft-score-layout.ts`. The card narrows the contenders within
0.001 percentage point plus a conservative relative allowance of 2⁻¹⁶; the
processor rechecks every possible winner in double
precision and makes the final ranking. The result reports the engine used.

`npm run verify:craft-recommendations` compares rankings with exhaustive role
readings and holds the shared shader layout. `npm run
verify:craft-recommendations-card` executes the agreement gate and checks exact
rankings against the processor on this machine's card at localhost:3000.

Cards lead with the item being spent, followed by the rune's emblem, facts and
labelled Location. The main property uses body emphasis; role and score use
ordinary body text. Innate and the After label share one row above the compact
four-line sub-property reading. A gemmed After line with
a stone shows its Gem value and mark, then an arrow to the total including the
stone. Only Best role and before/after Score remain in the evaluation. Rank
headings stand alone; explanatory prose belongs in this contract.
