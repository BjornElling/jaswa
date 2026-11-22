# Rune craft items — what `rune_craft_item_list` holds

**Status:** Binding for every reader of the export's rune craft items
**Reviewed:** November 3, 2026

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

Every view is laid out in columns of one height. First the controls, as one
surface: the question — the item kind, the stack (Best use only) and Assumed
roll — and beneath it, with no rule between them, the filters in
two rows: Family, Grade, Location and Level; then Rune set, Stat, Stat already
grinded / Can change gem'ed stat? and *No. of suggestions*, the ranking length.
Best use adds Only keep-runes after Level, or on a row of its own beneath them
where the window is under 1800px wide. Item and Family share a first track as
wide as Rune set's field, which ends where the word Ancient ends above it, and
every other track is as wide as its widest group, so no gap opens between
columns. No group moves
between views; the grinded / gem'ed group keeps room for both its wordings, so
switching the item kind moves nothing. Where the controls share the row with
Most wanted, or the screen is narrower, the filters fold into two tracks, Level
still beside Location.

*Level* is a two-handle range over the rune's power-up level, `+0` to `+15`,
both ends included. It opens at `+12` to `+15`: from `+12` a rune has rolled
every sub it will get and can take a Gem, so that is where a craft item is
usually spent. It narrows the rankings and nothing else.

Then a column of its own, the shared calculation column every calculating
panel ends in (`calculation-actions.tsx`): Clear results and Calculate, the
calculation status beneath them, and Reset filters and Reset ignored at its
foot. While it works, Calculate reads *Calculating…* and, under the pointer or
keyboard focus, *Cancel calculation* in red; pressing it then stops the work
and leaves the answer from before it started. In What's missing, *Most wanted* follows
at the far edge in a box of the Statistics kind: ten rows always, whatever the
ranking length, in the caption size so the box stays narrow.

*No. of suggestions* runs over the stops 1, 5, 10, 25, 50 and 100: one step of
the hand should matter, and the difference between 60 and 65 runes does not.
A view opens on Grindstone, an Average roll, no Location chosen (every rune, under the inclusive-filter rule), Level
`+12` to `+15` and five suggestions. Each view's question and filters are saved choices
(`craftViews`, `craft-view-choices.ts`), so they outlast a reload and a
restart; the three views keep theirs apart. Reset filters returns the filter
panel only; the item kind, the chosen stack and the assumptions are the
question.

Recommendations and Best use read `rune-craft-recommendations.ts`. Every calculation reads
all held Gems, all held Grindstones and all runes, independently of the filters.
Best use narrows that complete answer to one stack; Recommendations narrows it
by the selected categories. With no item chosen, Best use includes every item
of the displayed kind, following the universal inclusive-filter rule.
A suggestion spends one item independently. Suggestions are alternatives, not a
stock allocation across several runes. Stock depth does not multiply a rune's
score or produce duplicate entries for the same rune in one ranking.

`craftComparison` in `rune-craft-end-state.ts` enumerates every legal target
through `craftVariants`, the same end-state enumeration Rune Optimization uses.
It includes a converted line's same-stat re-Gem and retained stone, rejects a
non-improving assumed same-stat roll, respects level, slot, innate, duplicate,
lineage and set restrictions, and excludes a stone whose assumed roll cannot
beat the current bonus. The inventory's *Can improve* remains a potential count
at the item's maximum, independent of the assumed-roll rankings.

**Before and after stand on one premise, and come from one function.**
`craftComparison` returns the rune before the item together with every way to
spend it, so no caller can read the two on different terms:

- **A Gem** is judged on the placement rule's lines (§5.1): every grindable line
  carries the Grindstone of the user's craft credit (Settings › Gems &
  Grindstones) where that raises it — before the Gem and after it alike — and a
  line already ground higher keeps its own. The stone uses the rune's lineage,
  including the Ancient tables for an Ancient rune. The gain is therefore the Gem's
  alone, read on exactly the line-ups that chose its stat; only the Gem's own roll
  is the item's, at the Assumed roll. A credit whose Grindstone is *None* reads the
  Gem on the rune as it stands.
- **A Grindstone** is judged on the rune as it stands, because the stone is what is
  being judged.

There is no control for the premise. *Then grind it* once ground the Gem's own line
by an assumed stone while the rune it was measured against stood unground, so a Gem
won on a stone its replaced line could have taken too: on a Bruiser SPD rune, an
HP + Gem took ATK 8 % because HP +385 ground to +755 beat the bare ATK line, though
the same stone on ATK was worth more — and the Gem's right line was CRI Dmg.
`verify:craft-recommendations` holds that rune.

Each before and after line-up meets every allowed build of every role. The
valuation and the ceiling of the user's credit are Clean-up's `prepareRuneCandidate`
reading, with the same accepted/broken discounts. The score prices the sub
properties and innate as the premise leaves them: no imagined power-ups.
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

**A Grindstone card is the rune's whole plan** (`grindLines`, `grindPlan`).
Grinds on different lines do not exclude one another, so in Recommendations and
Best use a card takes every stone the rune should take — per sub line, the shown stone that
scores highest there and raises the rune — every lifted line shown alike, and
its score is the rune with all of them in, priced on the same role readings that
priced each stone alone. The title names one stone and counts the rest, as in
`Hero Fatal · SPD (+ 2)`: the stone that adds most on its own, or in a Highest
stat ranking the card's own stone; Ignore waves away the named one. A card's
title never says Gem or Grind, because the Item choice already does. Highest
score and Highest gain rank runes by that plan; Highest stat still ranks by the
one stat's final value, and its card shows the plan too. A filter narrows the
plan as it narrows the cards. Showing the other stones toned down beside one leading stone, with the leading stone's score
alone, was tried and removed: it read as though the rune should take one stone
when it can take all of them. What's missing keeps one item per card, because
it asks which single item the box lacks against the best single item it holds.

### 5.1 A Gem only with the rune's most desirable stat — a deliberate choice

**An Enchanted Gem is suggested on a rune only when its stat is the stat that
rune most wants. If the box holds no Gem of that stat, the rune gets no Gem
suggestion at all, even where a Gem of another stat would raise its score.**
This is a design decision, not a gap in the calculation.

The reason is what a Gem is. A rune takes one, and the stat it puts there stays
until another Gem replaces it. A Hero ATK % Gem spent today on a rune that
wants SPD is a small gain now that closes the rune to the right stat, or costs
a second Gem to undo. Waiting for the right stone is the better use of both.

*Most desirable* is the Gem placement rule of `RUNE-CLEANUP-MATH.md` §6.1 —
the one rule Rune Clean-up and the rune overlay apply too, so every view names
the same stat. It is judged at the **user's craft credit**: the rune's lines as
they stand, each grindable line raised by the credited Grindstone where that
raises it, and each candidate Gem the credited Gem, ground likewise — ordinary
items for an ordinary rune and Ancient items for an Ancient rune. Where the credit's
Gem is *None* the rule has no Gem to choose with: it names no stat (`gemChoice` is
`null`), and every held Gem that raises its rune is shown on its own gain. Every
legal `(line, stat)` pair is priced so in every role reading the rune
is judged in (`gemChoiceLineUps`), and the stat whose best end state is worth
most — and beats the same reading's rune without a Gem — is the one
the rune wants. The ranking travels on every row of the rune (`gemChoice`), and
`desirableGemStats` reads its top. Neither the grade held nor the Assumed roll
enters it: those decide what a Gem is shown to gain, not which stat it should be.
*Can change gem'ed stat?* No does: it removes from the ranking every stat it
refuses before the top is read (*Can change gem'ed stat?* below), so a rune that already carries a Gem wants a
better roll of that stat. The reason above does not apply there — the user has
already decided the stat stays — and read after the top, the two rules emptied
the rune between them. Under Yes such a rune wants both: the rule's stat, and a
better roll of the stat its Gem already holds, which closes nothing.
The gain itself is read on the same-lineage reference lines (§5), so the line a Gem is
shown on and the stat it was chosen for cannot disagree about the stones. A Hero Gem of the chosen stat is suggested like a Legend
one, as long as it raises the rune.

Measuring against the rune as it stands was tried and removed. It paid a Gem
for the stone its line could take anyway, so an SPD Gem on an SPD line won
from the Grindstone the line was still missing, while Rune Clean-up — which
grinds every line first — chose another stat for the same rune.

The rule covers every Gem view. In Recommendations and Best use a Gem of
another stat is dropped before the rankings. In What's missing only absent Gems
of the winning stat are listed, and the box's bar (`heldCraftBenchmark`) counts
a held Gem only when it has that stat, because a held Gem of a lesser stat is
never suggested and so has done nothing for the rune; *Most wanted* tallies the
same rows. Filters do not enter the choice: *Can change gem'ed stat?*, Grade,
Family, Stat, Location and Level narrow what is shown afterwards, so a filter can hide
the chosen Gem but never promote another stat in its place. A stat the user has
ignored on a rune is the one exception: Ignore says the user does not want that
stat there, so it leaves that rune's choice and the next stat in the rule's
order stands in.

Grindstones are deliberately outside the rule. A stone takes no place of its
own: every grindable line can carry one, and a better stone later simply
replaces it, so grinding a lesser line never closes the rune to a better one.
Nor does the inventory's *Can improve*, which counts runes an item can
mechanically raise rather than recommending anything.

Ties use rune id, item id and target index. The calculation retains the best
target for **every rune/item pair**, including pairs below the current shortlist.
Score and gain share that best target because the pair's baseline is fixed.
Filtering and ranking are immediate projections of this complete answer; each
displayed ranking includes a rune at most once. Item, kind, family, grade, rune
set, stat, Location, Level, already-crafted state, Only keep-runes and count never
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
items of the same kind reach on that rune, or the rune before the item — on the
same premise (§5) — where none does (`heldCraftBenchmark`). The bar is read from the whole answer, so a filter
cannot lower it. Highest score and Highest gain list the runes an absent item
lifts past that bar, Highest gain by the distance past it; Highest stat lists
stones whose final value beats the best held stone of that stat. Each card adds
*Your box*, the bar it cleared. *Most wanted* says it per item: every rune names
the one absent item that lifts it furthest past the box, and items are ordered
by how many runes named them, then by their largest gain. The same ranking
function (`craftRecommendationRankings`) serves all three views; the box's views
pass the rune before the item as their bar. An account with runes and an empty box
can still ask; one with no runes is told to import some.

**Stat already grinded** reads the item's specific stat on the rune before
spending anything: Yes includes a positive existing Grindstone bonus and No
includes none. A bonus on a different stat does not match.

**Can change gem'ed stat?** controls whether suggestions may replace an existing
Gem with a different stat. Yes permits every legal Gem application. No keeps
the existing Gem stat but still permits a better Gem of that same stat, and
does not restrict a rune's first Gem. The craft engine still rejects equal or
lower same-stat base values.

No is applied to the ranking of §5.1, not after it. On a rune with a Gem the
game allows only the gemmed line to be replaced, so the permitted ranking holds
the gemmed stat alone, and a better roll of it is the rune's choice even where
the placement rule would rather have another stat. A rune with no Gem keeps the
placement rule's own choice: No never steers a first Gem onto a line whose stat
it repeats unless that is the stat worth most.

Yes is a permission, so it never shows less than No. On a rune with a Gem it
offers both the placement rule's stat and the better roll of the gemmed stat
that No offers: re-rolling a stat the rune has already spent its Gem on closes
nothing §5.1 protects. Read as the placement rule alone, Yes emptied such a
rune whenever the box lacked the rule's stat, while No still showed the better
roll — and Yes looked like *must change*.

The two read differently on purpose. *Stat already grinded* is an inclusive
filter under `AGENTS.md` §2.2: Yes and No are independent, neither is chosen
by default, and neither or both leaves the answer unrestricted. *Can change
gem'ed stat?* is a permission, not a filter: exactly one of Yes and No is
always chosen, Yes by default, and Reset filters returns it to Yes. As an
inclusive group "neither" and "both" both meant Yes, so No was the only choice
that said anything. The two are saved apart (`already` and `gemChange`).
Both filter the complete answer without recalculating, in Recommendations, Best
use and What's missing. *Stat already grinded* never moves the held-box
benchmark. *Can change gem'ed stat?* moves it only by deciding which Gem stat a
rune wants: under No a held Gem of the gemmed stat is suggested, so the box
counts it as done, and a missing item must beat it.

**Only keep-runes** (Best use only) has one choice, Yes. Chosen, it keeps the
runes whose *calculated* Rune Clean-up verdict is Keep and drops every other
verdict — Power up, Sell, and the Re-app and Refine a reroll target puts on a
sale. The sell safeguards (pre-grind SPD, potential, preset engravings,
reroll targets) are read past through `calculatedRuneVerdict`: a rune kept only
because the user protects it is not one the calculation keeps. The verdicts
come from Clean-up's own engine (`use-rune-keepers.ts`): answers Clean-up
already holds for these inputs are read from `rune-advice-memory.ts`, and only
the runes it has not judged are asked of the advice worker, on a channel of
their own. Only *Calculate* asks them (`AGENTS.md` §5): a Calculate pressed while the filter is
chosen asks Rune Clean-up after the craft answer, and the answer records that it did
(`CraftCalculation.keepers`). Choosing the filter after an answer that never asked is a new
question — the answer leaves the page behind *Something changed since the last calculation*
until Calculate, and turning the filter off again shows it again; turning it off after one
that did ask only widens it. While they are first asked, the status line says so and the
rankings wait rather than show an unnarrowed list; a sync afterwards asks only the runes it
changed and narrows by the previous answer until the new one is in.

**Ignore** sits in the top-right corner of every card in Recommendations,
Best use and What's missing. It waves away the card's rune together with the item's kind and stat:
ignoring a SPD Grind on a rune hides every SPD Grind on that rune, of any grade
or set, while an ATK Grind or a SPD Gem on it is still suggested. Every view
reads and writes one shared list, so ignoring in one hides it in all. The list is
saved choices (`craftIgnores`, `craft-ignores.ts`) keyed by `rune_id`, so they
outlast reloads, imports and live sync. **Reset ignored**, under Reset filters,
empties the shared list from any view; it stays in place, disabled, while the list is empty.
An ignore made long ago still decides what its rune is offered — a Gem of the
next stat stands in for the ignored one — so every card whose rune has anything
ignored carries a muted crossed-out eye beside Ignore, whose tooltip reads
*Ignored* and then each ignored item, one per line (`SPD Gem`, `HP % Grind`). The
mark's box is reserved on every card and only shown where it applies, so it
moves nothing.
The reader retains valid entries from the developer's saved per-view choices
when combining them, drops invalid entries individually and deduplicates them.
Ignoring narrows what is shown like a filter: it never invalidates an answer,
and What's missing's bar is still read from the whole answer.
The filter runs on every rune/item pair before selecting the best suggestion
for each rune. Ignoring its best improvement therefore promotes an improving
alternative of another stat — for a Gem, the next most desirable stat of §5.1,
and only if the box holds one; it never removes the rune itself or its other
Gem and Grindstone suggestions. If every improving alternative is ignored,
there is no remaining suggestion to show until the list is reset.

Assumed roll sits in the question panel as a calculation assumption. Changing them, the roles, scoring preferences or the account's
Lv. 40 monsters is a new question: the answer leaves the page behind *Something changed
since the last calculation* until Calculate, and asking the old question again shows it
again.

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
account changes again. Clear results explicitly discards the answer; cancelling
keeps it, and an extension the user cancelled is not started again until the
question changes.

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
four-line sub-property reading. Every After line with a stone shows its value
before grinds, then an arrow to the total including the stone. A converted
line keeps its Gem mark after the base value. This applies to natural and
converted properties, for recommended Grindstones and Gems alike, in all three
views. Only Best role and before/after Score remain in the evaluation. Rank
headings stand alone; explanatory prose belongs in this contract.
