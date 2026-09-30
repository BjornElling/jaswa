# Rune Optimization — how six runes are chosen out of thousands

**Status:** Binding contract for the Rune Optimization page and its engine
**Reviewed:** 30 September 2026

Rune Optimization finds the rune builds one monster can wear that meet what its
profile asks for, and ranks them by one figure. This document says what it
calculates, how the search is kept finite, which of its shortcuts are exact and
which are not, and what is left to build.

| Module | Owns |
| --- | --- |
| `app/lib/rune-optimization-requirements.ts` | A calculation's requirements, seeded from the profile (§2) |
| `app/lib/rune-optimization-problem.ts` | Candidates, filters, exact reduction, the depth's cut (§3–§5) |
| `app/lib/rune-optimization-search.ts` | The branch-and-bound search and the merge of its parts (§6) |
| `app/lib/rune-optimization-settings.ts` | How to search: craft items, rune sources, depth, table size |
| `app/lib/compute/rune-optimization-*.ts` | Workers, the client that fans out to them, the engine door (§7) |
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
| Depth's cut (§5) | **No — reported** | to at most `keep` per slot and set |
| Branch and bound (§6) | Yes | 10¹⁰ combinations → 3 × 10⁶ evaluated |

## 2. Requirements: the profile, then this calculation

The monster's profile states the answer's shape: the builds it will accept, the
mains of slots 2, 4 and 6, whether an Intangible may be spent, the targets it must
reach, and the figure to rank by. The page opens on exactly that, read *resolved*
(`monster-preference-resolution.ts`), so a slot the owner never answered carries
the community's answer — and says so under the field.

Anything may be changed on the page. **A change there is for this calculation
only** and never written back to the profile; `Back to the profile` discards it.

### 2.1 Empty means any

An empty list of builds or slot mains means *any*. That is what the profile's own
token lines show (`Any build`, `Any`), and an optimizer that read it as "none will
do" would answer a question the screen never asked.

### 2.2 Targets are floors

A target is a minimum on one of the eleven figures. Absent means "not aimed at";
`0` is a stated floor of nothing (`AGENTS.md` §3). A build below any floor is not
listed at all.

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
- it sits in the inventory, on this monster, or — where *Take runes from other
  monsters* is on — on another monster;
- its set can appear in a stated build, unless a build leaves slots broken;
- its main is one the slot accepts;
- it is not Intangible, unless Intangible runes are allowed.

**Unfinished runes.** A main property grows deterministically with power-up level,
so *Count unfinished runes at their +15 main stat* is a fact about what the rune
will carry, not a projection of luck. Sub properties are counted as they stand.

**Gems and Grindstones** have their own settings, deliberately not Rune Clean-up's:
*None*, *Owned only* (the account's own stacks, each spendable as often as it is
deep) or *Theoretical* (an assumed item of a named grade), and for both the roll
assumed — worst, average, three quarters, best. `craftVariants` in
`rune-craft-end-state.ts` produces every legal end state: every wanted line ground,
and from `+12` one Gem into every legal wanted stat. A Gem or stone on a stat
nothing in the calculation reads is not offered — it spends an item to change no
figure.

## 4. Exact reduction

### 4.1 Only what the question reads

The ranking figure and the targets decide which of the twelve stat accumulators
matter. DMG reads ATK, CRI Rate and CRI Dmg; E.HP reads HP and DEF. Every other
accumulator is ignored by every reduction below — a rune's Accuracy is noise to a
DMG build with no Accuracy floor.

### 4.2 Dominance

Within one slot and one set, candidate *a* **dominates** *b* when *a* is at least
as good on every accumulator that matters and spends no held item *b* does not.
Every figure JASWA computes rises with every accumulator, so replacing *b* by *a*
in any build keeps its sets, its item spend and every target it met, and cannot
lower the ranking figure.

HP, ATK and DEF are a percentage and a flat pair that the game rounds up once. *a*
is safely no worse on a pair when it is no worse on both halves, or when its
combined contribution is at least one whole point ahead — the most one rounding
can take back.

**One dominator is not enough when the table lists more than one build.** *b* could
still hold the second row that *a* leaves free. Each dominator gives one build at
least as good as any build using *b*, so *b* is dropped only once as many
dominators exist as the table has rows. That is what makes the whole table exact,
not only its first row. Identical candidates break the tie towards the rune
already on the monster.

With no build stated and no Intangible allowed, a set matters only for the stat
bonus it completes, so every set without one — Violent, Will, Despair and the rest
— is one group, and a Violent rune can be dominated by a better Will rune. On the
real account this halves the candidates of an unconstrained search.

## 5. The depth's cut — the one shortcut that is not exact

What dominance leaves can still be hundreds per slot. **Depth** sets how many are
kept per slot and set, and how long the search may run:

| Depth | Kept per slot and set | Time limit |
| --- | --- | --- |
| Quick | 6 | 15 s |
| Balanced (default) | 12 | 45 s |
| Thorough | 24 | 2 min |
| Complete | every one | 10 min |

A candidate's worth for the cut is its **first-order contribution** to the
ranking figure, measured as the gradient of that figure at the monster's current
build (so CRI Rate is priced as worthless on a monster already at the cap). The
cut keeps the best by that measure **and** the best for each target separately: a
rune that does little for DMG may be the only way to reach the SPD floor, and a
cut blind to targets would make a reachable build look impossible.

This is the judgement the whole design allows itself, and only while it is seen:
the table's caption says how many runes each slot tried and that the cut kept the
ones that add most.

## 6. The search

A depth-first **branch and bound** over the six slots, fewest candidates first, each
slot best first, so strong builds fill the table early and the bar rises fast.

### 6.1 The bound

At every node the open slots can add at most the best each holds per accumulator.
Every figure rises with every accumulator, so the figures of that optimistic sum
bound every build below the node. A node is entered only if its bound meets every
target and could beat the build now last in the table.

**Set bonuses are bounded per plan, not per stat.** Assuming every set bonus at
once — Fatal, Rage and triple Blade together — made the bound useless on an
unconstrained search. The free slots hold only so many pieces, so the bound is
taken for each way the free slots could still complete stat sets, with a worn
Intangible standing in for one missing piece once; a node survives if any plan
could make the table. On the real account this cut evaluated combinations from
247 million to 28 million for the same search.

### 6.2 Builds and the Intangible rule

Sets are checked as they are placed: a branch that can no longer become a stated
build stops at the rune that ruined it. A finished combination is a stated build
when every set in it is complete and, for a build without broken slots, nothing
else is worn.

An Intangible completes the one set that is exactly one rune short
(`RUNE-CANONICAL.md` §10). **Where several are, the game picks one and JASWA does
not know which**, so such a combination is not offered, and the stat sheet counts
no completion for it. `intangibleCompletion` in `monster-stats.ts` states this once
for the sheet, the build names and the search.

### 6.3 Held items

With *Owned only*, every candidate names the stacks it spends and the search counts
them: a combination needing three stones from a stack of two is not offered.
**Known gap:** only the best held item per stat is offered for a rune; where that
stack runs out, the next-best stack would still do and is not tried yet.

### 6.4 Time, parallelism and honesty

The search stops at its depth's time limit and says so: the table is then the best
it had found. It runs in one worker per spare processor core, up to eight, each
taking every *n*-th candidate of the first open slot, and their tables merge by one
total order — ranking figure, then fewer runes moved, then the picks — so the split
cannot change the answer. The progress line under the panels is theirs.

### 6.5 What holds it

`npm run verify:rune-optimization` searches random small accounts two ways — the
full funnel at `Complete`, whole and split three ways, against brute force over the
unreduced candidates scored by `calculateMonsterTotals` — and requires every row to
agree. It was checked by breaking it: a bound three per cent too tight, and a
dominance that dropped on one dominator, both fail it.

### 6.6 Measured

On the real 3,038-rune account, one worker, Balanced depth:

| Question | Time | Complete |
| --- | --- | --- |
| Violent/Will, SPD/CRI Dmg/ATK % mains, SPD ≥ 200, rank DMG | 1.0 s | yes |
| Any build, rank DMG, Quick | 21 s (≈ 3 s on eight workers) | yes |
| Any build, rank DMG or E.HP, Balanced | stopped at 30 s | no |
| Violent/Broken with Legend theoretical Gems and stones | stopped at 30 s | no |

The narrower the question, the faster the answer; an unconstrained search at a deep
setting is the case §7 is for.

## 7. The graphics card

`HARDWARE-ACCELERATION.md` keeps decisions on the processor and offers the card
whole questions. A branch and bound is decisions all the way down, so the search
goes through `runAccelerated` with **no card half yet**, and the status line says
`Processor` because that is true.

The part a card can take is the bottom of the tree: for a batch of four-slot
prefixes that survived their bound, the full cross product of the last two slots
— a few thousand pairs each, independent, with one number coming back — returning
each prefix's best few builds for the processor to merge. That is the next step,
and it comes with the layout module, the agreement battery and the source check
`HARDWARE-ACCELERATION.md` requires of every shader. No browser this repository
drives exposes WebGPU, so it will be verified by the gate on a real card.

## 8. The page

1. **Monster** — every owned copy by its copy name, *Open profile* beside it, and
   *Find builds*, *Stop* and *Back to the profile*.
2. **Requirements for this calculation** — builds, Intangible, the three slot
   mains, the figure to rank by and the eleven floors, each with a one-line caption
   saying where its answer came from. The monster's current figure sits under each
   floor.
3. **How to search** — Gems, Grindstones, rune sources, depth and table size. These
   are saved preferences and hold for every monster.
4. **Status** — builds checked, runes considered, time, engine; notices when the
   table is stale or the search stopped at its limit.
5. **Builds** — the current build pinned first as `Now`, then the ranked builds.
   Every column sorts; the order starts on the ranking figure. Choosing a row opens
   its six runes below: set, level, main as counted, innate, lines after crafting,
   where the rune is now, and what it spends.

Nothing a choice changes moves anything else (`AGENTS.md` §2): captions are
reserved lines, the craft selects disable rather than disappear, the status line
has its own reserved height.

## 9. Open questions, recorded rather than guessed

- **Team sets on the stat sheet.** `rune-properties.ts` lists Fight, Determination,
  Enhance, Accuracy and Tolerance as including the wearer; the stat sheet has never
  counted them and was matched against SWOP Pro without them. An in-game capture
  should settle whether the game's own stat panel shows them.
- **Relics.** A relic's main property is a percentage of HP, ATK or DEF, and the
  sheet does not count it, because it is not known whether it acts on the visible
  stats or at the start of battle. Artifacts and relics are used as worn.
- **Repeated two-sets.** `rune-set-pairs.ts` cannot express `Energy/Energy/Energy`,
  which the game allows. The search handles repeated sets; the build vocabulary
  does not yet offer them.
- **The Intangible ambiguity** (§6.2) needs one capture of a monster wearing an
  Intangible with two sets one rune short.
