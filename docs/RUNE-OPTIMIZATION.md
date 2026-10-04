# Rune Optimization — how six runes are chosen out of thousands

**Status:** Binding contract for the Rune Optimization page and its engine
**Reviewed:** 4 October 2026

Rune Optimization finds the rune builds one monster can wear that meet what its
profile asks for, and ranks them by one figure. This document says what it
calculates, how the search is kept finite, which of its shortcuts are exact and
which are not, and where each part of it runs.

| Module | Owns |
| --- | --- |
| `app/lib/rune-optimization-requirements.ts` | A calculation's requirements, seeded from the profile (§2) |
| `app/lib/rune-optimization-problem.ts` | Candidates, filters, exact reduction, the depth's cut (§3–§5) |
| `app/lib/rune-optimization-shortlist.ts` | Exact range feasibility, complementary builds and paired improvements for the cut (§4.3, §5) |
| `app/lib/rune-optimization-craft-allocation.ts` | Exact per-stat allocation of held grades and stones after Gem placements are chosen (§6.4) |
| `app/lib/rune-optimization-search.ts` | The tree, the tail's blocks, the passes to a card, the merge of parts (§6–§7) |
| `app/lib/rune-optimization-settings.ts` | How to search: craft items, rune sources, depth, table size |
| `app/lib/compute/rune-optimization-*.ts` | Workers, the client that fans out to them and relays their bars, the engine door (§6.5, §7) |
| `app/lib/compute/{backends,webgpu}/*rune-optimization*` | The card's packing, agreement gate, layout and shader (§7) |
| `app/components/rune-optimization-section.tsx` | The page (§8) |

Every figure comes from the shared stat sheet in `monster-stats.ts`, every craft
rule from `rune-craft-end-state.ts`, every build from `rune-set-pairs.ts`. The
optimizer has no arithmetic of its own for a stat, a set or a Gem.

---

## 1. Why this cannot be done by trying everything

Six slots, one rune each. An account of 3,000 runes holds about 500 per slot, so
the combinations number 500⁶ ≈ **1.6 × 10¹⁶**. At ten million evaluations a
second that is fifty years. Gems multiply it further: a rune at `+12` can take a
Gem on any of its four lines in any legal stat, so one rune becomes up to about
thirty end states, and 30⁶ ≈ 7 × 10⁸ *per* combination of runes.

So the calculation is built as a funnel. Each stage removes what it can prove
cannot matter; only the last stage before the search makes a judgement call, and
that stage is visible on screen.

| Stage | Exact? | Measured on a real 3,038-rune account |
| --- | --- | --- |
| Filters (§3) | Yes | Violent/Will with slot mains: 500 → 50–160 per slot |
| Dominance (§4) | Yes | a further 10–50 % |
| Depth's cut (§5) | **No — reported** | selection lanes plus complementary-build picks |
| Branch and bound (§6–§7) | Yes | billions of combinations settled in seconds (§6.7) |

## 2. Requirements: the profile, then this calculation

The monster's profile — its *preset*, in the page's own words — states the
answer's shape: the builds it will accept, the mains of slots 2, 4 and 6, whether
a rune may complete no set (no unless the owner said yes), whether an Intangible
rune and an Immemorial Gem or Grindstone may be spent (both yes unless the owner
said no), whether the monster always crits or always has element advantage, its
crit lead (none unless stated), the range each figure must fall in, and the figure
to rank by. The page opens on exactly that, read *resolved*
(`monster-preference-resolution.ts`), so a slot the owner never answered carries
the community's answer — and says so under the field.

The page's own controls may be changed for this calculation only and never write
back to the profile; *Reset to preset* discards those changes after confirmation.
Combat crit conditions are edited on the monster overlay and read here.

### 2.1 Empty means any

An empty list of builds or slot mains means *any*. That is what the profile's own
token lines show (`Any build`, `Any`), and an optimizer that read it as "none will
do" would answer a question the screen never asked.

### 2.1.1 Builds and broken sets

A build names the sets it must hold — `Violent`, `Violent/Will`, `Swift/Will` —
and leaves the slots it does not name free (`rune-set-pairs.ts`). What may sit
in a free slot is the profile's *Allow broken sets*: off, every rune of a finished
build belongs to a completed set, so `Violent` means Violent and some whole
two-set; on, the free slots take anything. The same switch holds where no build is
named at all. An Intangible counts as belonging to a set only where it completes
one.

The game allows at most one Intangible Rune in a monster's six equipped runes.
The optimizer enforces that while choosing a build, so two Intangible candidates
can never consume two slots in one answer. A single Intangible completes a set
only when exactly one set is one piece short. If two or more sets are one piece
short, it completes none; there is no set-choice conflict to resolve. With
*Allow broken sets* on, that Intangible may still occupy the slot as a broken
rune. With it off, the combination is rejected by the ordinary broken-set rule.

### 2.2 Targets are ranges

Each of the eleven figures has a range: a floor (`targets`, the profile's
`statTargets`) and a ceiling (`ceilings`, `statCeilings`), each absent or stated
on its own. Absent means "no limit at that end"; `0` is a stated limit of nothing
(`AGENTS.md` §3). A build outside any range is not listed at all.

### 2.2.1 Crit conditions

A monster whose owner says it always crits — a skill, a leader or a team that
guarantees one — is counted at a certain crit. `monster-stats.ts` states the rule
once, as `alwaysCritsLift`: a hundred points on the CRI Rate of the base the search
reads. DMG reads CRI Rate capped at 100 %, so every hit is a crit and nothing a rune
adds to CRI Rate moves a figure; the reductions stop comparing CRI Rate for DMG,
and a CRI Rate floor is never asked. Because the lift is on the base, the card's
shader needs no rule of its own. Every CRI Rate *shown* is the monster's own, with
the green info mark after it.

*Always element advantage* adds 15 CRI Rate points and *Crit lead* adds the
stated percentage points. They add to each other and to the copy's own CRI Rate
for DMG, CRI Rate floors and ceilings, capped at 100 % for DMG. They do not alter
the CRI Rate printed on screen. The green mark beside that figure explains each
contribution on hover. A blank lead means no stated bonus; an explicit zero is
kept as the user's choice. *Always crits* still makes every CRI Rate target moot.

### 2.3 The figure to rank by

The profile's *When these are met show me Rune suggestions based on the highest…*
names it. Where it names none, the monster's archetype decides: **DMG** for
Attack, **SPD** for Support, **E.HP** for everything else — a build that keeps a
monster alive is never a wrong answer where nothing better is known. The caption
says the figure was chosen from the monster's type.

## 3. Candidates

A **candidate** is one rune in one end state: as it stands, or with the Gem and
Grindstones the settings allow. A rune enters its own slot's list when:

- it is **not locked to another monster** (`rune-holds.ts`). A rune locked to *this*
  monster is the slot's only candidate, exactly as worn: no filter removes it and
  no craft item is counted on it.
- it sits in the inventory, on this monster, or — unless *Only use runes from
  inventory* is ticked — on another monster;
- that other monster is not **above it on the priority list** (`monster-priority.ts`,
  the *Rune Priority* page), unless *Include runes from higher-priority monsters* is
  ticked. A monster not on the list ranks below every monster on it, so it takes no
  rune from any of them. The page resolves the list into the copies spared
  (`RuneOptimizationInput.spared`); the search never reads the order or the switch,
  and `mayTakeFrom` is the one rule both it and the re-reading of a build apply. The
  two switches are independent: neither disables the other, though the second has
  nothing to decide while the first is ticked;
- its set can appear in a stated build, unless a build leaves slots free;
- its main is one the slot accepts;
- it is not Intangible, unless Intangible runes are allowed.

A held Immemorial Gem or Grindstone is spent only where Immemorial items are allowed.
An assumed (*Theoretical*) item is always the rune's own lineage, so the switch does
not touch it.

**Unfinished runes.** A main property grows deterministically with power-up level,
so *Count unfinished runes at their +15 main stat* is a fact about what the rune
will carry, not a projection of luck. Sub properties are counted as they stand.

**Gems and Grindstones** have their own settings, deliberately not Rune Clean-up's:
*None*, *Owned only* (the account's own stacks, each spendable as often as it is
deep) or *Theoretical* (an assumed item of a named grade), and for both the roll
assumed — worst, one third, average, two thirds (the default), three quarters, best. `craftVariants` in
`rune-craft-end-state.ts` produces every legal end state: every wanted line ground,
and from `+12` one Gem into every legal wanted stat. A Gem or stone on a stat
nothing in the calculation reads is not offered — it spends an item to change no
figure.

Every held grade and compatible stack is offered, and each held Grindstone is
optional independently. A theoretical stone is also optional where a ceiling
reads its stat. A lower same-stat Gem, or a Gem into a stat the question otherwise
ignores, is retained where removing an existing contribution can meet a ceiling.
An item that changes no read figure and removes no ceiling contribution is omitted.

Before craft expansion, six slot/set lists are reconciled against the real finished
set rules. A set identity with no valid six-slot assignment is removed. The traversal
stops when every identity has support, or after 50,000 visits; exceeding that budget
keeps every identity. This is an exact proof with a bounded opportunity to decline,
not another heuristic cut. A locked rune remains the slot's only choice, including
a locked Intangible when the owner has disabled taking additional Intangibles.

## 4. Exact reduction

### 4.1 Only what the question reads

The ranking figure, the floors and the ceilings decide which of the twelve stat
accumulators matter. DMG reads ATK, CRI Rate and CRI Dmg; E.HP reads HP and DEF. Every other
accumulator is ignored by every reduction below — a rune's Accuracy is noise to a
DMG build with no Accuracy floor.

### 4.2 Dominance

Within one slot and one set-equivalence group, candidate *a* **dominates** *b*
when *a* is at least as good on every accumulator that matters and spends no held
item *b* does not. A group normally is one set. When broken sets are allowed,
Intangible is unavailable, and a stated build leaves free slots (or no build is
stated), sets that are neither required by a build nor able to complete a stat
bonus the question reads are equivalent and share a group: exchanging one for
another cannot change a valid build or any judged figure.
Every figure JASWA computes rises with every accumulator, so replacing *b* by *a*
in any build keeps its sets, its item spend and every target it met, and cannot
lower the ranking figure.

A ceiling breaks "more is better" on the accumulators it reads: the stronger rune
can carry a build past the top of a range the weaker one kept it inside. On those
accumulators *a* must therefore *equal* *b* rather than beat it — a narrower
reduction, never a wrong one.

HP, ATK and DEF are a percentage and a flat pair that the game rounds up once. *a*
is safely no worse on a pair when it is no worse on both halves, or when its
combined contribution is at least one whole point ahead — the most one rounding
can take back.

**One dominator is not enough when the table lists more than one build.** *b* could
still hold the second row that *a* leaves free. Each dominator gives one build at
least as good as any build using *b*, so *b* is dropped only once as many
distinct physical dominators exist as the table has rows. Several work plans for
one rune cannot count as several different builds. Within one physical rune,
one dominating plan is enough: it improves the same result row. Those small
families are reduced before the wider cross-rune comparison. A dominator that
requires an extra move cannot remove a worn rune, because surplus in a target
stat need not improve the ranking figure. Identical candidates break the tie
towards the rune already on the monster.

A held stack of six cannot run out: one kind/stat stack is used at most once
per rune. Dominance may ignore that stack's scarcity while still reporting its
actual spend. Comparisons are indexed by identical ceiling contributions and
subsets of scarce spend, avoiding comparisons between incompatible resource plans.

With no build stated, no Intangible allowed and broken sets allowed, a set matters
only for the stat bonus it completes, so every set without one — Violent, Will, Despair and the rest
— is one group, and a Violent rune can be dominated by a better Will rune. On the
real account this halves the candidates of an unconstrained search.

### 4.3 A rune that cannot reach a range

Before the depth cut, each candidate is combined with independent maxima from the
other five slots and independent reachable stat-set bonuses. This overestimates
what a real build can achieve. If even that sum misses a floor, the candidate cannot
belong to any accepted build. A set absent from enough slots cannot promise a
completion; an Intangible can supply at most one missing piece. Independent minima,
with bonuses every stated build requires, give the opposite proof: if that sum
exceeds a ceiling, the candidate cannot be used either.
These checks do not read the current build and never use a heuristic price.
They run before the quadratic dominance comparison and again after reduction.

## 5. The depth's cut — the one shortcut that is not exact

What the exact reductions leave can still be hundreds per slot. **Depth** sets the
width of each selection lane per slot and set, and how long the search may run:

| Depth | Picks per selection lane and slot/set | Search time limit |
| --- | --- | --- |
| 1 | 6 | 15 s |
| 2 | 8 | 20 s |
| 3 | 10 | 30 s |
| 4 (default) | 12 | 45 s |
| 5 | 16 | 1 min |
| 6 | 20 | 90 s |
| 7 | 24 | 2 min |
| 8 | 32 | 3 min |
| 9 | 48 | 5 min |
| 10 | every one | 10 min |

Depth is one native slider, numbered 1–10, usable with the pointer and arrow keys.
Its value and warning each have a fixed box. The established saved choices keep
their meaning: `quick`, `balanced`, `thorough` and `complete` remain valid preference
values at steps 1, 4, 7 and 10. The intermediate steps are additional choices.

The existing coarse estimate (§8) is compared with a broad work budget: one million
combinations per search second on the processor, fifty million with graphics-card
use enabled. These are planning thresholds, not measured speeds. Going above the
budget warns in yellow; above ten times it warns in red. Switching graphics-card use
off also warns in yellow even without a monster selected. A severe work warning takes
precedence. None prevents starting the search.

The warning says it may stop at the limit and keeps the builds found: pruning can make a huge combination
space cheap, Gem variants and supplemental picks can expand it, and enabling the card
does not guarantee that it will accept the calculation. The actual engine and whether
the search reached its limit are still reported after it runs. No second GPU decision
or device probe is introduced for this estimate.

A candidate's independent worth is its **first-order contribution** to the ranking
figure, measured against the admitted candidate pool. Each physical rune gets one
vote in that reference, however many Gem alternatives it has. **The currently worn
build never prices candidates.** It supplies the `Now` row; ownership and locks
still decide admission and move counts.

The cut keeps the best distinct physical rune families by each measure: one
representative per physical rune for the ranking lane, each floor lane and each
ceiling lane. Different lanes may retain different Gem variants of the same rune;
several variants cannot occupy the same slot together, so letting one family fill
one lane would spend the lane on mutually exclusive copies. A separate item-free
lane retains at most a third of the width, rounded down with a minimum of one.
After a lane chooses a Gem placement, all its legal grade and Grindstone
alternatives remain reachable; resource allocation is never a depth shortcut.
For the tightest stated ceilings it also keeps the lowest-contribution end states,
because a high-ranked
rune can be a bad complement when the other five runes already approach the upper
limit. Every ceiling still participates in exact range checks, dominance and the
finished-build judgement; only the bounded heuristic lane chooses the tightest few.
It also treats the eight direct-stat floors as a temporary Clean-up preset: `substatWeights` and
`weightedValuation` price their selection pressure in max-roll equivalents. The
reference is this copy's base, its actual artifact contribution and the admitted
pool's most common main per slot. This extra lane rewards the targets that ask most
of sub properties. It assumes no future Grindstones: candidates already contain the
craft work allowed by the optimization settings. It uses six-star rolls as one common
currency for comparing actual stat contributions, rather than rewarding a weaker
star class for being good relative to its own ceiling.

**Free set slots also have a price.** With no build stated or some slots left free,
each candidate's ordering score includes a per-piece share of the stat bonus its set
could complete. Ranking DMG gives Blade, Fatal and Rage attention; demanding floors
can give Energy, Guard, Focus or another relevant stat set attention. A four-set is
not credited for two free slots beside a required four-set. Only sets that can fit,
or are themselves required, are priced. This never changes a build's actual figures.
The beam likewise gives a partial stat set a proportional bonus for ordering its
prefixes, but finished guides and the final search count completed sets alone.

That price is guidance, not a replacement for DMG, E.HP or E.HP D. Those composite
figures cannot be represented by Clean-up's eight direct-stat targets, and two
individually strong runes may be poor complements. So the cut also looks for **whole
builds before picking individual runes**:

- Four deterministic beam searches retain 64 prefixes each, with different prices
  for unmet floors and exceeded ceilings. Their reference for open slots comes from
  the admitted pool; set feasibility and held-item stock are checked as they grow.
  Where there are no ranges the identical beams run once. Each Gem placement
  contributes its strongest, cheapest and two resource-priced representatives
  rather than every product of stone alternatives; ceilings keep all representatives.
  Partial prefixes also price scarcity, so six runes do not each reserve the same
  one-item stack in their ordering. Finished guides are ranked by actual figures.
- Finished guides must satisfy the actual sets, ranges, Intangible rule and stock.
  Up to four different guides are improved by replacing two same-set runes at once,
  for at most two rounds and 200,000 pair evaluations per guide. This can trade speed
  or Accuracy between slots while gaining damage, where neither change works alone.
- Candidates from those improvements and twelve finished guides supplement the
  independent lanes. The guides seed the result table before the tree opens, while
  the candidates remain ordered by proxy so strong bound-raising candidates lift
  the bar early. The guide is identical across finite depths: a deeper shortlist
  retains every shallower candidate.

The search also checks those whole guides and their same-set one-rune neighbours
before opening the tree. Their real sets, ranges and held-item spend are checked
again, and each belongs to its eventual search part. They start the table with useful
builds even when a short time limit leaves most combinations unvisited. A seeded
build's identity is remembered so revisiting it cannot fill another row or raise the
bar with a duplicate. This adds no cut: the tree still searches the same candidates.

Preparation, including indexed craft recipes, runs once in a worker, then the
prepared problem is shared with the search parts. Beam prefixes carry only the
stack indexes they spend, sorted with
repetitions, rather than copying the account's entire craft inventory on every
expansion. This changes allocation cost, not supply or candidate selection.

The beam and its paired improvements are heuristics within the reported cut. They
prove no candidate inferior and do not establish a global optimum. Preparation has
this additional bounded work; the table above limits the subsequent search. Depth 10
uses neither the beam nor the selection lanes, only the exact reductions.

`npm run verify:rune-optimization-quality` holds the cut separately from exactness:
Depth 1 matches depth 10's optimum on eight fixed wider pools, finite depths retain
shallower picks, moving every rune to inventory leaves selection unchanged, and
empty and impossible questions return no builds. These are regression checks, not
a claim that a finite shortlist always finds the optimum.

## 6. The search

A depth-first **branch and bound** in two halves. The **tree** places the first
four slots — fewest candidates first, each slot best first, so strong builds fill
the table early and the bar rises fast. The **tail** is the last two slots, the two
widest, and it is where the combinations are. The tree is iterative rather than
recursive, so it can stop between two prefixes and pick up where it left off; that
is what lets the tail be handed to a card in passes (§7).

### 6.1 The bound

At every node of the tree the open slots can add at most what their candidates
hold. Every figure rises with every accumulator, so the figures of an optimistic
sum bound every build below the node. A node is entered only if its bound meets
every target and could beat the build now last in the table.

**Only what the question reads.** The ranking figure and the targets read a few
accumulators (§4.1). A set bonus on any other accumulator moves no figure a decision
turns on, so the bound ignores those sets entirely; the figures a found build
reports still count them.

**The open slots are bounded per main.** The most each accumulator could gain on
its own would let one rune in slot 4 carry an ATK %, a CRI Rate and a CRI Dmg main
at once — exactly the build a DMG bound reaches for, and one no rune is. So each
open slot's candidates are taken per main, and a bound row is one main per open slot
summed. Rows another row beats on every accumulator the question reads are dropped;
past two dozen, the rows are folded into their accumulator-wise maximum, which is
still a bound, only a looser one.

**Set bonuses are bounded per plan.** Assuming every set bonus at once — Fatal, Rage
and triple Blade together — made the bound useless on an unconstrained search. The
free slots hold only so many pieces, so the bound is taken for each way the free
slots could still complete stat sets, with a worn Intangible standing in for one
missing piece once. Only *maximal* plans are tried — a plan that could still complete
one more set never decides — and of those only the ones no other plan beats on every
accumulator. Which plans those are depends only on the free slots, the Intangible
credit and how far each planned set is towards its next completion, so each is
worked out once per search.

A plan can credit only stat sets that fit beside the required sets, or that the
build itself requires. Slots still owed to required neutral sets — and started
neutral sets when broken sets are refused — are reserved before planning stat
bonuses. An already worn Intangible may complete a set one piece short without
using another slot. Letting that credit also reduce the reservation deliberately
overestimates what is possible; it cannot hide an accepted build.

With broken sets refused and three or fewer slots left, the bound enumerates the
actual remaining slot/set groups. Each group contributes independent accumulator
maxima, and only completions accepted by the shared set rules contribute a row,
with their own set bonuses. This couples the rune bound to sets that can really be
finished. Dominated rows are removed; more than 24 rows are folded into their
independent maxima, which stays an upper bound.

Completion rows and tail blocks each have a 2 MiB cache budget per worker. Eviction
recalculates the same answer; it never removes a candidate or a branch.

Most nodes fail, so the loosest pairing of row and plan is tried first. Where it
fails every pairing does, and the node cost one evaluation.

### 6.2 The tail: blocks

The two tail slots' candidates are grouped by set once per search. A **block** is
one group of each, and it has one set state: whether it can be a stated build,
which set an Intangible completes, what the sets add. That is decided once per block
rather than once per pair, and a block whose bound — the prefix, the best of each
group, the block's exact set bonus — cannot reach the table is never opened.

A set only needs a group of its own where it can change a decision: a stated build
asks for it, its bonus lands on an accumulator the question reads, or it is
Intangible. Every other set shares one neutral group. That stops being true the
moment an Intangible can be worn, because which set it completes depends on which
sets are one short, so with one in reach every set keeps its own group — and so
does refusing broken sets, because then a rune's set decides whether the build can
be finished at all.

Which blocks a prefix may open, and what each adds, depends only on its four runes'
groups. A few hundred such signatures cover millions of prefixes, so the set rules
run once per signature.

A pair inside a block is decided on the block's bonus, which is exact on every
accumulator a decision reads. Only a pair that makes the table has its figures
counted again from its runes' real sets, so a Violent rune in the neutral group
still reports the sheet it would really have.

### 6.3 Builds and the Intangible rule

Sets are checked as they are placed: a branch that can no longer become a stated
build — or, with broken sets refused, can no longer finish every set it has
started — stops at the rune that ruined it. A finished combination is a stated
build when every set the build names is complete; with broken sets refused, every
rune must also sit in a completed set (`noBrokenSets`).

### 6.3.1 Ceilings

Every bound in the tree is an upper estimate, and an upper estimate past a ceiling
says nothing about the build beneath it, so a ceiling never prunes the tree. It is
judged once, on a finished build's own figures, after its real sets are counted.
The card is unaffected: its answer is already generous, and every pair it sends
back is judged on the processor.

An Intangible completes the one set that is exactly one rune short
(`RUNE-CANONICAL.md` §10). **Where several are, it completes none.** This is not an
unknown state and JASWA must not choose a set or discard the combination merely
because the Intangible has no completion: *Allow broken sets* decides whether the
result may still be worn. `intangibleCompletion` in `monster-stats.ts` states this
once for the sheet, the build names and the search.

### 6.4 Held items

With *Owned only*, every candidate names the stacks it spends: a combination needing
three stones from a stack of two is not offered. All compatible grades and stacks
participate, including set-specific alternatives to an Immemorial item.

**Without ceilings, choose placement first and allocate items afterwards.** A recipe
names a rune and the Gem's replacement line and stat, with no Gem as its own recipe.
The tree and the card bound each recipe by its independent accumulator maxima.
These are optimistic figures only. For a promising six-recipe combination, each
kind/stat group assigns at most six lines to the compatible stacks, maximizing
their total contribution. An optional stone has a free unchanged choice; an
assumed item has unlimited supply. Independent best choices are used immediately
when they fit; otherwise a minimum-cost flow finds the exact assignment.

This is exact because all read figures and floors are monotone, and stacks of
different kinds or stat ids cannot compete. Maximizing each accumulator's
contribution at once maximizes every read figure for those placements. The final
six actual end states are looked up and counted by the shared stat sheet. A failed
assignment rejects the recipe combination, never an imported rune. Matching results
have a 4,096-entry cache per worker; eviction repeats the same answer.

**With any ceiling, retain the full end-state search.** More can exceed a ceiling,
so the monotone allocation proof does not apply. Optional stones and lower Gem
alternatives remain candidates and are judged on their actual figures.

**One row per physical combination.** Alternative Gem or stone plans for the same
six rune ids improve that row rather than filling another. Each worker and the
merge keep the best plan found for each combination. Bars come from tables of
distinct physical combinations, so a worker's bar remains safe for every other part.

### 6.5 Time, parallelism and a shared bar

The search stops at its depth's time limit and says so: the table is then the best
it had found. It runs in one worker per spare processor core, up to eight, each
taking every *n*-th candidate of the first slot with a choice in it, and their
tables merge by one total order — ranking figure, then fewer runes moved, then the
picks — so the split cannot change the answer. The progress line under the panels
is theirs.

Preparation's stages are shown before the search percentage; the depth's limit is
the search time, with preparation additional. Clock checks include tail pairs and
blocks as well as tree candidates, so a large tail cannot bypass the limit.
*Stop the search* asks each part to finish with its checked builds; leaving the
workspace or replacing the calculation still terminates its workers immediately.
Stopping during preparation cancels it, while retaining the previous table.

Only parts with distinct tree work are launched. If several workers cannot be
started or a search worker fails, the client retries the same prepared problem in
one worker. It reports that stage and keeps the chosen depth and requirements.
An unexpected failure of that single search is still an error, recorded in the
console; the previous table is retained. This recovery is independent of the one
shared rule deciding whether the card answers.

**The parts share their bar.** A part whose table is full proves the merged table
holds as many builds at or above its last row, because the parts' builds are
distinct. So every rise is relayed by the client to the other parts, and each prunes
against the highest bar any part has reached — dropping only builds *strictly*
below it, so ties stay for the order after the figure to settle. Eight parts then
prune like one search rather than like eight small ones. A part hears the others
between two passes to the card, or on the processor every 50 ms.

### 6.6 What holds it

`npm run verify:rune-optimization` searches 200 random small accounts against brute
force over the unreduced candidates scored by `calculateMonsterTotals`, and requires
every row to agree: the funnel at depth 10, whole; split three ways; split with
the parts sharing their bars, at once and in slices; and in passes, the way a card
is driven, with a stand-in card as generous as a card may ever be — it sends back
every pair, shuffled, overflows past a few dozen, and in a second run refuses
midway so the processor has to finish. It was checked by breaking it: a bound three
per cent too tight, and a dominance that dropped on one dominator, both fail it.

`npm run verify:rune-optimization-card` runs the shader itself (§7).

`verify:rune-optimization-quality` also compares seeded and unseeded exhaustive
tables on the same shortlists, checks that no build is counted twice, checks that
time limits and stop requests preserve feasible guides, and holds the Intangible
completion that needs no further slot. In that case, Energy, Guard and Blade are
each one piece short with an Intangible already worn: two open slots finish all
three. Charging another slot for the Intangible loses the only accepted build;
restoring that charge was checked to make the regression fail. Seeded, unseeded
and split tables also agree on 16 crafted accounts, with 156 guides spending held
items. The interface's stability suite exercises
an open Shield/Will search at depth 1, stopping with results, an immediate time
limit, and a worker allocation failure that recovers in one worker.

### 6.7 Measured

The 4 October review and measurements of resource allocation, including the
comparison with full grade/stone combinations on the same shortlist, are in
[Rune Optimization candidate review](RUNE-OPTIMIZATION-CANDIDATE-REVIEW.md).

Historical measurements before the guided shortlist, on a real 2,444-rune account,
the Rune Optimization page itself, eight workers,
the card switched on and then off:

| Question | Graphics card | Processor |
| --- | --- | --- |
| Any build, rank DMG, width now at depth 1 | 1.1 s | 0.9 s |
| Any build, rank DMG, width now at depth 4 | 3.4 s | 6.2 s |
| Any build, rank DMG, width now at depth 7 | 8.3 s | 20.2 s |
| Any build, rank DMG, depth 10 | 24.4 s | 63.0 s |

Every one of them finished. Before this search was rebuilt the depth-4 question ran
into its 45-second limit. *Builds checked* counts what each engine evaluated in
full: the card evaluates every pair of an open block, where the processor first
skips each rune of the first tail slot that cannot reach the bar, so the card's
count is the larger by two orders of magnitude for the same table.

The narrower the question, the faster the answer.

On 3 October 2026 the guided shortlist was compared with the preceding cut on a
local captured account, for Poseidon: Despair/Focus, ATK % / CRI Dmg / ATK % mains,
215 SPD, 75 ACC, 60,000 E.HP and 30,000 E.HP D floors, owned craft items and 50 rows.
The same capture and one card-driven search process were used for both cuts:

| Depth | Preceding cut, best DMG | Guided cut, best DMG |
| --- | --- | --- |
| 1 | 5,752 | 6,392 |
| 4 | 6,009 | 6,445 |
| 7 | 6,079 | 6,445 |

Both depth-1 and depth-4 searches finished. The preceding depth-7 search finished;
the guided depth-7 search reached its limit, so its figure is the best found, not a
proved maximum of that shortlist. Depth 1 gained 11.1 % and trailed the deeper
answer by 0.8 %. This is an older capture than the user's reported 5,792 / 6,286 /
6,384 example; it measures an improvement on this input, not that current account
or a guarantee for every question. Preparation also costs more, about two seconds
on this run; the deeper shortlist admits more candidates and can take longer.

On 3 October 2026, the preparation and bound changes were measured on the same
local 2,437-rune capture and the same Chromium/card setup, using eight search parts.
Galleon asked for Shield/Will, ATK % or SPD / CRI Dmg / ATK % or ACC mains,
218 SPD, 100,000 E.HP and 50,000 E.HP D, owned craft items and 50 rows at depth 1.
The client took 46.1 seconds before and 23.7 seconds after, returning 50 builds
with the same best DMG, 5,944. Both reached their search time limit; neither proves
that shortlist's optimum. Driving the final page also returned 50 builds, in
22.6 seconds, with its control and requirement panels unchanged in position and
size. This capture is smaller than the 2,607-rune account in the reported image;
the reported error itself was not reproduced on it. The recovery path was verified
with an injected worker allocation failure.

## 7. The graphics card

`HARDWARE-ACCELERATION.md` keeps decisions on the processor and offers the card
whole questions. The tree is decisions all the way down and stays on the processor.
The card takes the tail: for a pass of blocks it is asked **which pairs could clear
the table's current bar and every floor**, and answers with a shortlist.

- **Generous, never strict.** The card works in single precision; it takes every
  rounded stat a whole point high and compares every figure with slack to spare, so
  it can shortlist a pair that does not belong, never leave off one that does. Every
  shortlisted pair is judged again on the processor, from the prefix's own exact
  state, before it may enter the table. The card's answer is therefore always the
  processor's answer.
- **Passes start small and grow.** The tree prunes with the bar the table held when
  the last pass came back, so the first pass is a few dozen blocks and each answered
  pass doubles the next, up to 32,768 blocks or 2²⁵ pairs.
- **A pass that clears more than the card can report** — 65,536 pairs, which happens
  only before the table is full — says so, and is split in two and asked again. A
  single block that still overflows is judged on the processor.
- **A card that refuses** its very first pass hands the whole search to the
  processor, and the status line says `Processor`. A card that refuses later hands
  over what is left, and the status line says `Graphics card + processor`.

`rune-optimization-layout.ts` holds every offset, `rune-optimization-shader.ts`
interpolates them, and `webgpu-rune-optimization-backend.ts` packs the passes and
holds the agreement gate: a battery of hand-built blocks with the bar and a floor
in the middle of their figures, on which every pair the processor keeps must be on
the shortlist, nothing on it may fall short by more than the card's stated
generosity, and a pass too full to report must say so.

`npm run verify:rune-optimization-layout` holds the offsets by reading source.
`npm run verify:rune-optimization-card` runs the shader: Chromium's new headless
mode exposes this machine's own card, so it loads the modules from the dev server,
passes the agreement gate, and searches the same random accounts the processor was
proved on — and wider ones — with the tail on the card, requiring the processor's
table pick for pick. It needs a running dev server and a card, and is not part of
`npm test`.

## 8. The page

1. **Monster** — every owned copy by its copy name in a large field with its
   portrait, *Open preset* under it; the depth slider and table size beside it, because they
   are read at the moment of searching; then *Find builds* and a square stop mark.
   The line under the depth gives a rough size of the search before it runs —
   the runes the filters admit, at most the depth's number per slot and set,
   multiplied across the slots — and the time limit as "up to". It skips craft
   variants and the exact reduction, so it is an order of magnitude, never a
   count; with no monster chosen it says in words how much the depth looks
   through. A reserved three-line box below it carries the work warning (§5).
2. **Requirements for this calculation** — two thirds: builds, the three slot
   mains, the figure to rank by and the eleven ranges in two rows, with a caption
   line under each that says only what differs from the preset or where an
   unstated answer came from; *Reset to preset* under them. One third, down the
   whole box: the settings — *Any set* (broken sets, Intangible, Immemorial) from
   the preset, and Gems, Grindstones and rune sources, which are saved
   preferences and hold for every monster.
4. **Status** — at the foot of the monster panel, under *Find builds*, dimmed:
   the search's progress while it runs, then builds checked and runes considered
   on one line and time and engine on the next. The stale warning sits between
   the two; a search that stopped at its limit says so above the table. A change
   to the runes or locks since the search is not announced here: the rows it
   touches say so themselves (item 6).
5. **Builds** — the current build pinned first as `Now`, then the ranked builds.
   Every column sorts; the order starts on the ranking figure. Choosing a row opens
   the build in an overlay: its six runes in the game's rune circle — slot 1 at
   the top, the rest clockwise — each as it is in the account now: set, level,
   main, innate, sub properties and where the rune is; and beside the circle, slot
   by slot, the modifications the build assumes — which line a Gem replaces and
   with what, which stone goes on which line, and a main counted at +15.
6. **Following the table** — a change to the runes does not throw the table away.
   The player follows it by moving, gemming and grinding, and a sync bringing that
   back re-reads every build against the account as it is now
   (`rune-optimization-refresh.ts`): a Gem or stone applied since the search counts
   as done at what it rolled and leaves the modifications, one not yet applied is
   still counted as planned, Moves follow where each rune now sits, and the figures
   are summed again with the search's own arithmetic (`buildFigures`).

   A change that stands in a build's way keeps the row and names the rune, slot by
   slot, in the overlay and as a yellow mark on the row, which is dimmed:
   - the rune was **sold or fed** — the row keeps no figures;
   - it is **locked where it is**, and that is not this monster (or the inventory);
   - **another rune is locked into its slot** on this monster;
   - it now sits on **another monster** whose runes the search could not take —
     *Only use runes from inventory* was ticked, or that monster is above this one on
     the priority list;
   - the Gems and Grindstones **still to come need more of a held item** than the
     account has left, counted over the whole build.

   Some changes alter the work rather than block it. A rune that took a Gem on
   another line cannot take the planned one (a rune holds one converted line), so
   that Gem is dropped. A rune newly locked to this monster is used as worn, as the
   search uses a locked rune, so the work still planned on it is dropped. Where the
   figures fall below a target or above a ceiling, the overlay's *Targets* and the
   row's mark say which, and the row is dimmed.

   The targets and ceilings a build is held to are the stat ranges **on screen**,
   not those it was searched under: narrowing a range after the search dims every
   row now outside it, and widening it again lifts the dimming. The figures
   themselves stay counted as the search counted them, *Always crits* included.

   The status line says the runes or the locks changed, because a better build the
   change made possible is only found by searching again. Listing fewer builds cuts
   the same table shorter. Changing the requirements or the other search settings —
   or listing more builds than were searched — marks the table as stale; a monster
   that left the account says so.

Nothing a choice changes moves anything else (`AGENTS.md` §2): captions are
reserved lines, the craft selects disable rather than disappear, the status line
has its own reserved height.

An unfinished search with no result says no build was found before it stopped;
it does not claim the requirements are impossible. A finished guided shortlist
with no result names that shortlist and suggests greater depth. Only the complete
search, or an exact range reduction leaving a slot empty, can rule builds out.
Preparation, retry and error messages use the reserved status box, and an error
keeps the previous result table.

## 9. Open questions, recorded rather than guessed

- **Team sets on the stat sheet.** `rune-properties.ts` lists Fight, Determination,
  Enhance, Accuracy and Tolerance as including the wearer; the stat sheet has never
  counted them and was matched against SWOP Pro without them. An in-game capture
  should settle whether the game's own stat panel shows them.
- **Relic unique properties.** A relic's main HP, ATK or DEF percentage is counted
  on the visible sheet. The Icaru #2 game panel showed 3,203 DEF against 3,114
  without its +12 % DEF relic: 736 base DEF × 12 % adds 89 after the sheet's one
  rounding step. Its unique property remains a battle effect, outside the sheet.
- **Repeated two-sets.** `rune-set-pairs.ts` cannot express `Energy/Energy/Energy`,
  which the game allows. The search handles repeated sets; the build vocabulary
  does not yet offer them.
- **The Intangible ambiguity** (§6.3) needs one capture of a monster wearing an
  Intangible with two sets one rune short.
