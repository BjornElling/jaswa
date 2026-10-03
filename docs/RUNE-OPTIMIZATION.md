# Rune Optimization — how six runes are chosen out of thousands

**Status:** Binding contract for the Rune Optimization page and its engine
**Reviewed:** 30 September 2026

Rune Optimization finds the rune builds one monster can wear that meet what its
profile asks for, and ranks them by one figure. This document says what it
calculates, how the search is kept finite, which of its shortcuts are exact and
which are not, and where each part of it runs.

| Module | Owns |
| --- | --- |
| `app/lib/rune-optimization-requirements.ts` | A calculation's requirements, seeded from the profile (§2) |
| `app/lib/rune-optimization-problem.ts` | Candidates, filters, exact reduction, the depth's cut (§3–§5) |
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
| Depth's cut (§5) | **No — reported** | to at most `keep` per slot and set |
| Branch and bound (§6–§7) | Yes | billions of combinations settled in seconds (§6.7) |

## 2. Requirements: the profile, then this calculation

The monster's profile states the answer's shape: the builds it will accept, the
mains of slots 2, 4 and 6, whether an Intangible rune and an Immemorial Gem or
Grindstone may be spent (both yes unless the owner said no), whether the monster
always crits (no unless the owner said yes), the targets it must reach, and the
figure to rank by. The page opens on exactly that, read *resolved*
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

### 2.2.1 Always crits

A monster whose owner says it always crits — a skill, a leader or a team that
guarantees one — is counted at a certain crit. `monster-stats.ts` states the rule
once, as `alwaysCritsLift`: a hundred points on the CRI Rate of the base the search
reads. DMG reads CRI Rate capped at 100 %, so every hit is a crit and nothing a rune
adds to CRI Rate moves a figure; the reductions stop comparing CRI Rate for DMG,
and a CRI Rate floor is never asked. Because the lift is on the base, the card's
shader needs no rule of its own. Every CRI Rate *shown* is the monster's own, with
the green *Always crits* mark after it.

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

A held Immemorial Gem or Grindstone is spent only where Immemorial items are allowed.
An assumed (*Theoretical*) item is always the rune's own lineage, so the switch does
not touch it.

**Unfinished runes.** A main property grows deterministically with power-up level,
so *Count unfinished runes at their +15 main stat* is a fact about what the rune
will carry, not a projection of luck. Sub properties are counted as they stand.

**Gems and Grindstones** have their own settings, deliberately not Rune Clean-up's:
*None*, *Owned only* (the account's own stacks, each spendable as often as it is
deep) or *Theoretical* (an assumed item of a named grade), and for both the roll
assumed — worst, average, two thirds (the default), three quarters, best. `craftVariants` in
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
sets are one short, so with one in reach every set keeps its own group.

Which blocks a prefix may open, and what each adds, depends only on its four runes'
groups. A few hundred such signatures cover millions of prefixes, so the set rules
run once per signature.

A pair inside a block is decided on the block's bonus, which is exact on every
accumulator a decision reads. Only a pair that makes the table has its figures
counted again from its runes' real sets, so a Violent rune in the neutral group
still reports the sheet it would really have.

### 6.3 Builds and the Intangible rule

Sets are checked as they are placed: a branch that can no longer become a stated
build stops at the rune that ruined it. A finished combination is a stated build
when every set in it is complete and, for a build without broken slots, nothing
else is worn.

An Intangible completes the one set that is exactly one rune short
(`RUNE-CANONICAL.md` §10). **Where several are, the game picks one and JASWA does
not know which**, so such a combination is not offered, and the stat sheet counts
no completion for it. `intangibleCompletion` in `monster-stats.ts` states this once
for the sheet, the build names and the search.

### 6.4 Held items

With *Owned only*, every candidate names the stacks it spends and the search counts
them: a combination needing three stones from a stack of two is not offered.
**Known gap:** only the best held item per stat is offered for a rune; where that
stack runs out, the next-best stack would still do and is not tried yet.

### 6.5 Time, parallelism and a shared bar

The search stops at its depth's time limit and says so: the table is then the best
it had found. It runs in one worker per spare processor core, up to eight, each
taking every *n*-th candidate of the first slot with a choice in it, and their
tables merge by one total order — ranking figure, then fewer runes moved, then the
picks — so the split cannot change the answer. The progress line under the panels
is theirs.

**The parts share their bar.** A part whose table is full proves the merged table
holds as many builds at or above its last row, because the parts' builds are
distinct. So every rise is relayed by the client to the other parts, and each prunes
against the highest bar any part has reached — dropping only builds *strictly*
below it, so ties stay for the order after the figure to settle. Eight parts then
prune like one search rather than like eight small ones. A part hears the others
between two passes to the card, or on the processor every 50 ms.

### 6.6 What holds it

`npm run verify:rune-optimization` searches random small accounts against brute
force over the unreduced candidates scored by `calculateMonsterTotals`, and requires
every row to agree: the funnel at `Complete`, whole; split three ways; split with
the parts sharing their bars, at once and in slices; and in passes, the way a card
is driven, with a stand-in card as generous as a card may ever be — it sends back
every pair, shuffled, overflows past a few dozen, and in a second run refuses
midway so the processor has to finish. It was checked by breaking it: a bound three
per cent too tight, and a dominance that dropped on one dominator, both fail it.

`npm run verify:rune-optimization-card` runs the shader itself (§7).

### 6.7 Measured

On a real 2,444-rune account, the Rune Optimization page itself, eight workers,
the card switched on and then off:

| Question | Graphics card | Processor |
| --- | --- | --- |
| Any build, rank DMG, Quick | 1.1 s | 0.9 s |
| Any build, rank DMG, Balanced | 3.4 s | 6.2 s |
| Any build, rank DMG, Thorough | 8.3 s | 20.2 s |
| Any build, rank DMG, Complete | 24.4 s | 63.0 s |

Every one of them finished. Before this search was rebuilt the Balanced question ran
into its 45-second limit. *Builds checked* counts what each engine evaluated in
full: the card evaluates every pair of an open block, where the processor first
skips each rune of the first tail slot that cannot reach the bar, so the card's
count is the larger by two orders of magnitude for the same table.

The narrower the question, the faster the answer.

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
   - it now sits on **another monster** while *Take runes from other monsters* is off;
   - the Gems and Grindstones **still to come need more of a held item** than the
     account has left, counted over the whole build.

   Some changes alter the work rather than block it. A rune that took a Gem on
   another line cannot take the planned one (a rune holds one converted line), so
   that Gem is dropped. A rune newly locked to this monster is used as worn, as the
   search uses a locked rune, so the work still planned on it is dropped. Where the
   new figures fall below a target, the overlay's *Targets* and the row's mark say
   which.

   The status line says the runes or the locks changed, because a better build the
   change made possible is only found by searching again. Listing fewer builds cuts
   the same table shorter. Changing the requirements or the other search settings —
   or listing more builds than were searched — marks the table as stale; a monster
   that left the account says so.

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
- **The Intangible ambiguity** (§6.3) needs one capture of a monster wearing an
  Intangible with two sets one rune short.
