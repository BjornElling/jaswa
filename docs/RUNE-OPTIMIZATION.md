# Rune Optimization — how six runes are chosen out of thousands

**Status:** Binding contract for the Rune Optimization page and its engine
**Reviewed:** October 20, 2026

Rune Optimization finds the rune builds one monster can have engraved that meet what
its profile asks for, and ranks them by one figure. This document says what it
calculates, how the search is kept finite, which of its shortcuts are exact and which
are not, and where each part of it runs.

| Module | Owns |
| --- | --- |
| `app/lib/rune-optimization-requirements.ts` | A calculation's requirements, seeded from the profile (§2) |
| `app/lib/rune-optimization-problem.ts` | Candidates, filters, exact reduction, the depth's cut (§3–§5) |
| `app/lib/rune-optimization-ranges.ts` | Figure dependencies, generous envelopes and proof of binding limits (§4.1, §4.3) |
| `app/lib/rune-optimization-shortlist.ts` | Exact range feasibility, complementary builds and paired improvements for the cut (§4.3, §5) |
| `app/lib/rune-optimization-craft-allocation.ts` | Exact per-stat allocation of held grades and stones after Gem placements are chosen (§6.4) |
| `app/lib/rune-optimization-search.ts` | The tree, the tail's blocks, the passes to a card, the merge of parts (§6–§7) |
| `app/lib/rune-optimization-settings.ts` | How to search: craft items, rune sources, depth, table size |
| `app/lib/rune-optimization-work.ts` | Measured trials, sampling uncertainty and the work reading (§5) |
| `app/lib/compute/rune-optimization-*.ts` | Workers, the client that fans out to them and relays their bars, the engine door (§6.5, §7) |
| `app/lib/compute/{backends,webgpu}/*rune-optimization*` | The card's packing, agreement gate, layout and shader (§7) |
| `app/components/rune-optimization-section.tsx` | The page (§8) |

Every figure comes from the shared stat sheet in `monster-stats.ts`, every craft rule
from `rune-craft-end-state.ts`, every build from `rune-set-pairs.ts`, every set fact from
`rune-sets.ts`. The optimizer has no arithmetic of its own for a stat, a set or a Gem.

---

## 1. Why this cannot be done by trying everything

Six slots, one rune each. An account of 3,000 runes holds about 500 per slot, so the
combinations number 500⁶ ≈ **1.6 × 10¹⁶**. Gems multiply it further: a rune at `+12`
can take a Gem on any of its four lines in any legal stat, so one rune becomes up to
about thirty end states.

So the calculation is a funnel. Each stage removes what it can prove cannot matter; only
the last stage before the search makes a judgement call, and that stage is visible on
screen.

| Stage | Exact? | What it does |
| --- | --- | --- |
| Filters (§3) | Yes | Admits the runes the question allows in each slot |
| Exact reduction (§4) | Yes | Drops what a range rules out or another candidate dominates |
| Depth's cut (§5) | **No — reported** | Keeps selection lanes plus complementary-build picks |
| Branch and bound (§6–§7) | Yes | Settles the remaining combinations without visiting most of them |

## 2. Requirements: the profile, then this calculation

The monster's profile **in the chosen content-area** (`DECK-PRESETS.md` §4.1) states the
answer's shape: the builds it accepts, the mains of slots 2, 4 and 6, whether a rune may
complete no set (no unless the owner said yes), whether an Intangible rune may be spent
(yes unless the owner said no), whether the monster always crits or always has element
advantage, the range each figure must fall in, and the
figure to rank by. Its leads are the chosen preset's leaders' and only Scenario's are
stated (none unless stated; §2.2.3). The profile only remembers these answers and hands
them to this page as its starting point: the page shows every one — under the stat
ranges, *Settings* (*Always crits*, *Always element advantage*), *Leads and bonuses* and
the area's block — named for the area, with its *Accuracy goal* and *Fastest enemy* —
drawn by the same components as the profile
(`fight-conditions.tsx`) — and any may be changed for one calculation without touching
the profile. A preset's leads are read off its leaders here too, never typed. Whether a held Immemorial Gem or Grindstone may be spent is not the
profile's: it is a setting of this page, shared by every monster, because the stock it
spends is the account's. A slot the owner never answered stays unrestricted (`Any`), as
it does in the monster profile. Community mains and their shares are reference text
below each slot; they never select an option or constrain a calculation.

The page's own controls may be changed for this calculation only and never write back to
the profile; *Reset to profile* discards those changes after confirmation. A change is for
the copy in the chosen preset: choosing another preset reads that area's shared profile
afresh and carries nothing across. Combat crit conditions are edited on the monster
overlay and read here.

### 2.1 Empty means any

An empty list of builds or slot mains means *any*. That is what the profile's own token
lines show (`Any build`, `Any`); an optimizer that read it as "none will do" would answer a
question the screen never asked.

### 2.1.1 Builds, broken sets and Intangible

A **build** is a whole six-slot combination of sets (`rune-set-pairs.ts`), written as the
set names joined by `/`, leading set first — `Violent`, `Violent/Will`, `Swift/Will`,
`Blade/Blade/Blade`. That string is the identifier the user reads, the preference stores
and the optimizer matches; `runeBuildName` is the one place that writes it. The game's
arithmetic (`RUNE-CANONICAL.md` §10) fixes the shapes: a four-set leads and leaves room
for exactly one two-set, at most three sets are named, and a two-set may repeat up to three
times. Intangible is never part of a build.

**A user asks for a build, not for a set.** Sets stated one at a time cannot say whether
Despair and Revenge mean `Despair/Revenge` or `Revenge/Revenge/Revenge`, and an optimizer
handed that list would have to guess. A combination is the whole answer. Six four-sets
against sixteen two-sets give 96 four-plus-two combinations, which a menu can list under
its leading set, and 816 two-set triples (repeats included), which it cannot — so a triple
is *composed* in the menu (`runeBuildContinuations`) rather than chosen from a list.

A build names the sets it must hold and leaves the slots it does not name **free**. What
may sit in a free slot is the profile's *Allow broken sets* (off unless the owner said
yes): off, every rune of a finished build belongs to a completed set, so `Violent` means
Violent and some whole two-set; on, the free slots take anything. The same switch holds
where no build is named at all. An engraved build is named by `activeRuneSets` and ends in
`Broken` where slots complete no set; a wanted build never does.

*Allow Intangible runes* (on unless the owner said no) decides whether an Intangible may
be spent. At most one Intangible rune sits on a monster, and the search enforces it while
choosing, so two Intangible candidates never take two slots of one answer. An Intangible
completes a set only by the rule of `RUNE-CANONICAL.md` §10 (`intangibleCompletion` in
`rune-sets.ts`, the one implementation the sheet, the build names and the search read).
Where it completes nothing — two or more sets one short — JASWA neither chooses a set nor
discards the combination: with *Allow broken sets* on, the Intangible occupies its slot as
a broken rune; with it off, the combination is rejected by the ordinary broken-set rule.

### 2.2 Targets are ranges

Each of the eleven figures has a range: a floor (`targets`, the profile's `statTargets`)
and a ceiling (`ceilings`, `statCeilings`), each absent or stated on its own. Absent means
"no limit at that end"; `0` is a stated limit of nothing (`AGENTS.md` §3). A build outside
any range is not listed.

### 2.2.1 Every figure is the fight's

One rule decides what every figure on this page means: **a range names the final value,
after everything the fight adds** (the developer, October 21, 2026), and every range is
judged on the figure as the table shows it.

- **The eight stats** — HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES and ACC — are counted as
  the copy fights with them: its display stats plus leads (§2.2.3), crit conditions
  (§2.2.2), team sets on itself and its teammates (§2.2.4) and the account's **Glory
  buildings and totem** (`readBuildingBonuses` in `account-buildings.ts`: Guardstone DEF %,
  Crystal Altar HP %, Ancient Sword ATK %, the Sanctuary of the copy's own element ATK %,
  Fallen Ancient Guardian CRI Dmg points and Sky Tribe Totem SPD %). A CRI Rate range of
  100 on a copy with a 24-point crit lead asks the runes for 76. A SPD range is the combat
  speed of the preset's content (`SPEED-TICK-CANONICAL.md` §1) — with Rift Raid's leads in a
  Rift Raid preset, and in Scenario with the totem and no lead.
- **The three composites** — DMG, E.HP and E.HP D — are read from those eight.

Under each range the page shows the display stat, as the game's monster panel has it, and
after it in muted ink what the fight adds — `(+1,234)`, or `→ 100` where *Always crits*
lifts CRI Rate — with every source named on hover (`fightAddition` in `figure-marks.ts`):
`Crit lead +24%. Element advantage +15%.`. The addition keeps a box as wide as the widest
its stat can carry, so a lead or a setting that changes it moves nothing. The builds table
shows the totals and nothing else, the `Now` row included. The composites carry no
addition: they are the fight's by definition.

`monster-stats.ts` states this once. `combatBase` puts what a fight adds into the copy's
base, after its eight stats, at `combatAt`, and the CRI Rate a guaranteed crit lifts to at
`criRateFloorAt`; `totalsInto` writes the eight display stats and, beside them, the same
eight as the fight has them; every figure reads the second eight. The page passes the
buildings with the requirements, so the search, the shader, a found build read again, the
overlay and its shortfall marks all sum through that one sheet. `verify:monster-display-stats`
holds the rule on hand-built copies, and `verify:rune-optimization` against brute force.

A ceiling names the fight's figure itself, so the search's bound clamps that figure at the
ceiling (`capTotal`); every composite rises with the stats it reads, so the clamped figure
bounds them too.

### 2.2.2 Crit conditions

A monster whose owner says it always crits is counted at a certain crit: the fight's CRI
Rate is lifted to at least 100 (`alwaysCritsFloor`), and one past it stays where it is.
DMG reads CRI Rate capped at 100 %, so nothing a rune adds to CRI Rate moves DMG; the
reductions stop comparing CRI Rate for DMG, and a CRI Rate range is never asked. *Always
element advantage* adds 15 points to the fight's CRI Rate, which a range sees.

### 2.2.3 Leads

**A preset's leads are its leaders', read and never typed** (`team-leads.ts`). The leader
is the game's — `leader_unit_id`, or the first monster of an Arena defense — or the
crown's on a preset built in JASWA, and its leader skill comes from the Swarfarm snapshot
(`SPEED-TICK-CANONICAL.md` §2.2). A team fights under its own leader and, where its
content fights several decks in one battle, under the leaders of the others too: Rift
Raid 1, 2 and 3 take part in every Rift Raid battle, and each one's leader leads all three
(`battleDecks` in `preset-contents.ts`; the developer, October 20, 2026). Another Rift Raid
preset, and one built in JASWA, fights under its own leader alone.

A lead counts for a member where its area reaches the content and its element, if it
names one, is the member's. Leads of different stats add up; of the leads of one stat for
the same monsters — both for every monster, or both for one element — only the largest
counts; a lead of one stat for every monster and one for an element add up on that
element's monsters (`leadReaches`, `SPEED-TICK-CANONICAL.md` §2.2). ATK, DEF, HP and SPD
leads are a share of base summed with every other percentage and rounded once, as the game
counts a leader skill; CRI Rate, CRI Dmg, ACC and RES leads add points. Each reaches its
own stat; ATK, CRI Rate and CRI Dmg reach DMG, and HP and DEF reach E.HP and E.HP D. A SPD
lead is judged by the same reach Speed Tuning reads, so a SPD range and Speed Tuning's
combat speed agree.

*Leads and bonuses* on the monster overlay lists, in a preset's area, one line per leader
the team fights under — the stat and its percentage. A lead that does nothing for this
copy stays on its line, muted and struck through, with a red mark naming where it would
count (*Only counts in arena.*, *Only counts on Wind monsters.*) or which lead of its stat for
the same monsters counts instead. A preset with no leader says *No leader in this preset*; a leader the
import no longer holds, or one with no leader skill, keeps a line saying so. The block
keeps the box Scenario's fields take, so changing area moves nothing beside it.

**Scenario is no team and has no leader**, so there the copy states up to four leads by
hand — *CRI Rate*, *ATK*, *DEF* and *HP* — each a whole percentage, CRI Rate in points. A
blank lead means none; an explicit zero is kept as the user's choice. Only Scenario's
profile holds them: a lead stored in another area's profile is dropped alone on reading,
on saving and on *Copy from…* (`heldIn` in `monster-preferences.ts`).

What the fight adds to a stat is named on hover over its addition (§2.2.1). Own and
teammate sets are combined, for example “3 × Fight +24% of base ATK.”.

### 2.2.4 Automatic team-set bonuses

Fight, Determination, Enhance, Accuracy and Tolerance sets are counted from the other
members of the **chosen preset**, using that preset's rune placements. Their values and
the rule that they reach their holder too, in battle only, are `RUNE-CANONICAL.md` §10
(`teamSetBonuses` in `monster-stats.ts`). There are no manual counts. Profiles stay shared per content-area, but a team bonus is derived per preset,
never saved in a profile. A preset that saves monsters only uses their Scenario runes.
Scenario is the entire roster, not one team, and supplies no bonus from other monsters.
Other presets and a shared pool do not add their monsters to the team — not even the other
Rift Raid decks, whose leaders lead every team of the battle but whose sets do not.

Own and teammate HP/ATK/DEF contributions join the other combat percentages before
rounding and reach DMG, E.HP and E.HP D exactly once. Accuracy and Tolerance are
explained by the info mark, including the battle value beside a current ACC/RES figure;
they change no own-stat range. Incomplete sets, sold runes and missing members add
nothing.

The preset table, profile, shortfall check, search and graphics-card input all read this
derivation. A search may take a rune from another member of the selected team when
*Only runes not engraved in preset* is clear. The selected team's priority list protects
higher-priority members unless *Include runes from higher-priority monsters* is on. Neither
setting reads runes from another phase or orders monsters on another team. When the
account or preset changes, the bonus is derived again; an open result is reread with the
current bonus and marked stale if the question changed. Each candidate's own sets are
counted from that candidate, never from the build being replaced. Shield grants a shield,
not a stat bonus, and is outside this model.

### 2.3 The figure to rank by

The profile's *When met, sort by* names it, or the user chooses one in *Rank by* for this
calculation. **Nothing else ever does.** A figure guessed from the monster's type would
rank a search by a question nobody asked. Where neither names one, *Rank by* reads
*Choose a figure*, its caption says the profile names none, and *Find builds* stays
disabled with a hover saying the sort order is missing.

## 3. Candidates

Every search is for one monster **in one preset** — Scenario or a saved preset
(`DECK-PRESETS.md` §4). The page reads the monster's artifacts and starting runes out of
that preset. A rune's `occupiedId` on the imported item is its Scenario owner (`null` in
inventory); the page reads every rune through `runesInPreset`, which returns copies whose
`occupiedId` is the owner **in that preset**, or `null` where none of the preset's monsters
carries it. So in this calculation `occupiedId` means "engraved on this monster in this
preset", and a rune engraved only in other presets counts as not engraved in this one,
because a preset holds its own gear. A pool can reserve runes from another phase:
`poolRuneIds` reaches the search as excluded through `runeLocksInPreset`. A rune held by
another team of the same content remains a candidate. An engrave may then reuse it without
changing the other preset.

A **candidate** is one rune in one end state: as it stands, or with the Gem and
Grindstones the settings allow. A rune enters its own slot's list when:

- it is **not locked to another monster** of the preset, and **not excluded** from this
  one (`rune-locks.ts`). A rune locked to *this* monster is the slot's only candidate,
  exactly as engraved: no filter removes it, no craft item is counted on it, and the slot
  is not searched. Locks and exclusions bind one scope — Scenario or one preset — and no
  other; they live with the import, so a new import has
  none, and they are off under *Always synchronized*. Locking a rune engraves it first.
- it is not engraved in this preset, is on this monster, or — unless *Only runes not
  engraved in preset* is ticked — is on another monster of the preset;
- within a concrete team, that other monster is not **above it on the preset's
  priority list** (`monster-priority.ts`, the *Presets* page), unless *Include runes from
  higher-priority monsters* is ticked. A monster not on the list ranks below every monster
  on it. Only members of this preset are compared. The page resolves the list into the
  copies spared (`RuneOptimizationInput.spared`);
  `mayTakeFrom` is the one rule the search and the re-reading of a build apply. The two
  switches are independent, though the second has nothing to decide while the first is
  ticked. Scenario has no team: its Include switch is disabled and higher-priority
  protection stays on when borrowing from the roster, regardless of a saved switch value;
- its set can appear in a stated build, unless a build leaves slots free;
- its main is one the slot accepts;
- it is not Intangible, unless Intangible runes are allowed.

A held Immemorial Gem or Grindstone is spent only where *Allow Immemorial Gems and
Grindstones* is ticked. An assumed (*Theoretical*) item is always the rune's own lineage,
so the switch does not touch it.

A Gem may turn a rune's converted line into another property only where *Allow changing a
gemmed stat* is ticked (on by default). Off, that line may still be gemmed again for a
better roll of the property it already carries; a rune without a converted line is
untouched.

**Unfinished runes.** A main property grows deterministically with power-up level, so
*Count unfinished runes at their +15 main stat* is a fact about what the rune will carry,
not a projection of luck. Sub properties are counted as they stand. With *Slot 1/3/5 only
counts at +12* also on, a flat-main rune at `+12` or below is counted at `+12`
(`flatMainPropertyAtTwelve`; values in `RUNE-CANONICAL.md` §3, *Flat mains at +12*); one at `+13` or `+14`
keeps its actual main. The choice is disabled while the `+15` switch is off, without
losing its saved selection.

**Selection.** *Just fill in empty slots* preserves every occupied slot exactly as
engraved, without main projection or craft work, even where its main or set is outside
the requested choices. Whole-build sets and stat ranges still apply, so a fully engraved
monster offers only its unchanged build. *Limit changes* activates *Maximum changes*, a
whole number from 1 to 6, the most of the six chosen runes that may move onto the
monster, inventory runes filling empty slots included; Gems, Grindstones and power-ups
are not changes. A blank field blocks searching until it is filled. The limit prunes a
prefix only when its selected runes plus the minimum changes in every remaining slot
already exceed it, and it is checked before admitting results or raising a shared
ranking bar, for processor and card answers alike.

**Gems and Grindstones** have their own settings, deliberately not Rune Clean-up's:
*None*, *Owned only* (the account's own stacks, each spendable as often as it is deep)
or *Theoretical* (an assumed item of a named grade), and for both the roll assumed —
worst, one third, average, two thirds (the default), three quarters, best. `craftVariants`
in `rune-craft-end-state.ts` produces every legal end state: every wanted line ground, and
from `+12` one Gem into every legal wanted stat. A Gem or stone on a stat nothing in the
calculation reads is not offered.

Every held grade and compatible stack is offered, and each held Grindstone is optional
independently. A theoretical stone is also optional where a ceiling reads its stat. A
lower same-stat Gem, or a Gem into a stat the question otherwise ignores, is retained
where removing an existing contribution can meet a ceiling. An item that changes no read
figure and removes no ceiling contribution is omitted.

Before craft expansion, the six slot/set lists are reconciled against the finished set
rules: a set identity with no valid six-slot assignment is removed. The traversal stops
when every identity has support, or after 50,000 visits; exceeding that budget keeps every
identity. This is an exact proof with a bounded opportunity to decline, not a heuristic
cut. A locked rune remains the slot's only choice, including a locked Intangible when the
owner has disabled taking additional Intangibles.

## 4. Exact reduction

### 4.1 Only what the question reads

The ranking figure, the floors and the ceilings decide which display and battle
accumulators matter. DMG reads ATK, CRI Rate and CRI Dmg; E.HP reads HP and DEF. Every
other accumulator is ignored by every reduction below.

Before reduction, independent slot maxima and reachable set bonuses prove which ceilings
could bind at all; minima and unavoidable bonuses prove which floors could still fail. A
ceiling at or above that upper envelope, or a floor at or below the lower envelope, is no
longer read by the search. This proof uses the full admitted craft pool before the depth
cut, never a heuristic shortlist. The original requirements stay intact on screen, in
preferences and when results are re-read; only the calculation's internal limits and
accumulators are simplified. `rune-optimization-ranges.ts` owns these dependencies and
envelopes.

### 4.2 Dominance

Within one slot and one set-equivalence group, candidate *a* **dominates** *b* when *a*
is at least as good on every accumulator that matters and spends no held item *b* does
not. A group normally is one set. When broken sets are allowed, Intangible is
unavailable, and a stated build leaves free slots (or no build is stated), sets that are
neither required by a build nor able to complete a stat bonus the question reads are
equivalent and share a group. Every figure JASWA computes rises with every accumulator, so
replacing *b* by *a* in any build keeps its sets, its item spend and every target it met,
and cannot lower the ranking figure.

A ceiling breaks "more is better" on the accumulators it reads, so on those *a* must
*equal* *b* rather than beat it — a narrower reduction, never a wrong one.

HP, ATK and DEF are a percentage and a flat pair the game rounds up once. *a* is safely no
worse on a pair when it is no worse on both halves, or when its combined contribution is at
least one whole point ahead — the most one rounding can take back.

**One dominator is not enough when the table lists more than one build.** *b* is dropped
only once as many distinct physical dominators exist as the table has rows. Several work
plans for one rune cannot count as several builds; within one physical rune, one
dominating plan is enough, and those small families are reduced before the wider
comparison. A dominator that requires an extra move cannot remove an engraved rune.
Identical candidates break the tie towards the rune already on the monster.

Within one rune, equally useful Gem plans preserve its strongest matching role: when two
or more replacement lines contribute to none of the monster's judged figures, the least
valuable line for that role is offered first. The role comes from the user's saved roles
and account reference stats, using the Clean-up engine's Max value ruler without assumed
Gems or Grindstones; both set and main must match. Monster figures, ranges, legal
converted lines and held-item spend still decide dominance first. With no matching role or
reference line, the ordinary stable order remains. Editing roles marks an existing
optimization table as stale.

A held stack of six cannot run out: one kind/stat stack is used at most once per rune, so
dominance may ignore that stack's scarcity while still reporting its spend. Comparisons are
indexed by identical ceiling contributions and subsets of scarce spend.

### 4.3 A rune that cannot reach a range

Before the depth cut, each candidate is combined with independent maxima from the other
five slots and independent reachable stat-set bonuses. If even that overestimate misses a
floor, the candidate cannot belong to any accepted build. A set absent from enough slots
cannot promise a completion; an Intangible can supply at most one missing piece.
Independent minima, with the bonuses every stated build requires, give the opposite proof
against a ceiling. These checks read no current build and no heuristic price. They run
before the dominance comparison and again after it; each range reduction repeats until no
slot shrinks, for at most eight passes. Stopping early only retains extra candidates.

## 5. The depth's cut — the one shortcut that is not exact

What the exact reductions leave can still be hundreds per slot. **Depth** sets the width
of each selection lane per slot and set, and how long the search may run:

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

Depth is one native slider, numbered 1–10, usable with the pointer and arrow keys; its
value and warning each have a fixed box. The stored values are `quick`, `step2`, `step3`,
`balanced`, `step5`, `step6`, `thorough`, `step8`, `step9` and `complete`.

### 5.1 Reading the work

**The combination count does not decide the warning.** The raw product of admitted runes
is not the work: an all-sets-required question with trillions of preliminary combinations
can finish in under a second, and an impossible floor with the same count as a broad
search leaves nothing to search. More requirements have no single direction — loose floors
make more accumulators relevant and keep more candidates, impossible ones cut the pool to
zero, exact set requirements strengthen the bounds. Free *set* slots are not open
*physical* slots: four locked slots leave a two-slot tail no worker can share. Gems change
the choices far more than stones; Intangible and a larger table keep more candidates
through exact reduction. And switching off the card is not a speed ratio. So the work is
read from the actual prepared question, by trial:

After 750 ms without an edit, one background worker prepares the actual question and tries
the whole search with a 500 ms search budget, through the normal engine door and card
agreement gate, and reports the engine that really answered. If it finishes, the page
reports its measured time without a warning. A finished trial has searched the chosen
depth's pool, not necessarily every eligible rune.

Otherwise it times three branches — first, middle and last of the first open tree slot,
250 ms each — so the samples span the ordered candidates. The partition width comes from
the actual recipe pool after exact reduction, the depth cut and held-item grouping; a
two-slot tail has one share. The client uses the same width to avoid launching idle
workers.

Only three **finished**, reasonably consistent shares support an envelope: the lowest and
highest durations are scaled by the share count and available workers, then halved and
doubled. A minimum below 5 ms, a spread above fourfold, or an unfinished share gives
**uncertain**, without a speed recommendation. This is a heuristic envelope, not a
confidence interval: unsampled branches, contention and later pruning can differ. A low end
above the chosen search limit warns in yellow; above four times the limit, in red. Neither
blocks searching or promises completion. An actual run replaces the trial reading:
finishing reports its time including preparation; reaching the limit warns from observed
evidence. A user stopping is not a timeout. Trial timing starts at the engine's own first
clock read, after packing and the card gate, so per-worker setup is not multiplied by the
branch count.

Edits, account changes, hardware-setting changes and leaving the workspace cancel the trial
and invalidate its evidence. Starting a calculation terminates the trial; its prepared pool,
when available, is reused without changing any candidate or the normal time limit. A
20-second watchdog bounds preparation and driver calls. A failed or expired trial says the
time is unknown and never disables *Find builds*. No preference is added; all trial evidence
stays in memory on this computer. The reading's tooltip records choices by slot, physical
runes and end states, judged figures, ceilings and slots without a required set.

### 5.2 What the cut keeps

A candidate's independent worth is its **first-order contribution** to the ranking figure,
measured against the admitted pool, one vote per physical rune however many Gem
alternatives it has. **The currently engraved build never prices candidates**; it supplies
the `Now` row, and ownership and locks still decide admission and move counts.

The cut keeps the best distinct physical rune families by each measure: one representative
per physical rune for the ranking lane, each floor lane and each ceiling lane. Different
lanes may keep different Gem variants of one rune; one family may not fill a lane with
mutually exclusive copies. A separate item-free lane keeps at most a third of the width,
rounded down, minimum one. After a lane chooses a Gem placement, all its legal grade and
Grindstone alternatives remain reachable; resource allocation is never a depth shortcut.
For the tightest stated ceilings it also keeps the lowest-contribution end states, because
a high-ranked rune can be a bad complement near an upper limit. Every ceiling still takes
part in the exact checks and the finished-build judgement; only this bounded lane chooses
the tightest few. The eight direct-stat floors are also treated as a temporary Clean-up
role: `substatWeights` and `weightedValuation` price their pressure in six-star max-roll
equivalents, against this copy's base, its actual artifact contribution and the admitted
pool's most common main per slot, with no future Grindstones assumed.

**Free set slots also have a price.** With no build stated or some slots free, each
candidate's ordering score includes a per-piece share of the stat bonus its set could
complete, for sets that can fit or are required. This never changes a build's actual
figures. The beam gives a partial stat set a proportional bonus for ordering its prefixes;
finished guides and the final search count completed sets alone.

That price is guidance, not a replacement for DMG, E.HP or E.HP D, and two individually
strong runes may be poor complements. So the cut also looks for **whole builds before
picking individual runes**:

- Four deterministic beam searches keep 64 prefixes each, with different prices for unmet
  floors and exceeded ceilings; where there are no ranges the identical beams run once.
  Set feasibility and held-item stock are checked as they grow. Each Gem placement
  contributes its strongest, cheapest and two resource-priced representatives rather than
  every product of stone alternatives; a ceiling fixes only the affected lines' amounts
  and stacks. Partial prefixes price scarcity, so six runes do not each reserve the same
  one-item stack. Finished guides are ranked by actual figures.
- Finished guides must satisfy the actual sets, ranges, Intangible rule and stock. Up to
  four guides are improved by replacing two same-set runes at once, for at most two rounds
  and 200,000 pair evaluations per guide.
- Candidates from those improvements and twelve finished guides supplement the lanes. The
  guides seed the result table before the tree opens. The guide is identical across finite
  depths, so a deeper shortlist keeps every shallower candidate.
- With held items, an additional beam searches Gem placements within the physical rune
  families those guides chose, restores their legal supply alternatives, and resolves each
  finished placement through the exact allocation of §6.4. Only guides with a strictly
  stronger ranking figure add candidates, and this lane does not repeat the pair sweep.

Both beams stop a prefix that cannot reach a floor even with independent remaining maxima
and generous set bonuses, or must exceed a ceiling even with minima and unavoidable
bonuses; the envelopes use the admitted supply alternatives and the sets the remaining
slots actually offer. The search also checks those guides and their same-set one-rune
neighbours before opening the tree, again against real sets, ranges and spend; a seeded
build's identity is remembered so it cannot fill a second row or raise the bar twice, and
guides are deduplicated by their allocated recipe. This adds no cut.

Preparation, including indexed craft recipes, runs once in a worker, and the prepared
problem is shared with the search parts. The beam and its paired improvements are
heuristics within the reported cut: they prove no candidate inferior and do not establish a
global optimum. Depth 10 uses neither the beam nor the selection lanes, only the exact
reductions.

### 5.3 Rejected approaches

Recorded so they are not retried without new evidence:

- **Exact allocation at surviving tree prefixes** cut evaluated combinations slightly but
  cost more in matching than it saved.
- **Allocation-based guidance as a replacement for the ordinary beam** improved some
  starting results and weakened others; it survives only as the supplement above.
- **Allocation guidance over the whole admitted account** raised preparation cost,
  especially under composite ceilings; the supplement reads only the guides' families.
- **A greedy Gem-filling failure as proof of infeasibility**, or a rule that always
  replaces the least efficient sub property: neither preserves the range and shared-stock
  contract.

`npm run verify:rune-optimization-quality` holds the cut separately from exactness: depth 1
matches depth 10's optimum on eight fixed wider pools, finite depths keep shallower picks,
moving every rune to inventory leaves selection unchanged, and empty and impossible
questions return no builds. These are regression checks, not a claim that a finite
shortlist always finds the optimum.

## 6. The search

A depth-first **branch and bound** in two halves. The **tree** places the first four slots
— fewest candidates first, each slot best first, so strong builds fill the table early and
the bar rises fast. The **tail** is the last two slots, the two widest, where the
combinations are. The tree is iterative, so it can stop between two prefixes and resume;
that is what lets the tail go to a card in passes (§7).

### 6.1 The bound

At every node the open slots can add at most what their candidates hold. Every figure rises
with every accumulator, so the figures of an optimistic sum bound every build below the
node. A node is entered only if its bound meets every target and could beat the build last
in the table. Direct-stat ceilings cap the optimistic totals before the sheet reads a
composite, and a ceiling on the ranking figure caps the bound too. Equal scores stay
eligible for the tie order.

**Only what the question reads.** A set bonus on an accumulator no decision reads is ignored
by the bound; a found build's reported figures still count it.

**The open slots are bounded per main.** One rune cannot carry an ATK %, a CRI Rate and a CRI
Dmg main at once, so each open slot's candidates are taken per main, and a bound row is one
main per open slot summed. Dominated rows are dropped; past two dozen, rows are folded into
their accumulator-wise maximum, still a bound.

**Set bonuses are bounded per plan.** The free slots hold only so many pieces, so the bound
is taken for each way they could still complete stat sets, with an engraved Intangible
standing in for one missing piece once. Only maximal, non-dominated plans are tried, worked
out once per search. A plan credits only stat sets that fit beside the required sets or
that the build requires; slots owed to required neutral sets — and started neutral sets
when broken sets are refused — are reserved first. Letting an engraved Intangible's credit
also reduce the reservation overestimates what is possible; it cannot hide an accepted
build.

With broken sets refused and three or fewer slots left, the bound enumerates the actual
remaining slot/set groups, and only completions the shared set rules accept contribute a
row, with their own bonuses; more than 24 rows fold into their independent maxima.

Completion rows and tail blocks each have a 2 MiB cache budget per worker; eviction
recalculates the same answer. Most nodes fail, so the loosest pairing of row and plan is
tried first; where it fails every pairing does.

### 6.2 The tail: blocks

The two tail slots' candidates are grouped by set once per search. A **block** is one group
of each, with one set state — whether it can be a stated build, which set an Intangible
completes, what the sets add — decided once per block. A block whose bound cannot reach the
table is never opened.

A set needs a group of its own only where it can change a decision: a stated build asks for
it, its bonus lands on an accumulator the question reads, or it is Intangible. Every other
set shares one neutral group — except when an Intangible can be engraved, or broken sets
are refused, when every set keeps its own group. Which blocks a prefix may open depends only
on its four runes' groups, so the set rules run once per signature. A pair inside a block is
decided on the block's bonus, exact on every accumulator a decision reads; only a pair that
makes the table has its figures counted again from its runes' real sets.

### 6.3 Builds and the Intangible rule

Sets are checked as they are placed: a branch that can no longer become a stated build — or,
with broken sets refused, can no longer finish every set it started — stops at the rune that
ruined it. A finished combination is a stated build when every set the build names is
complete; with broken sets refused, every rune must also sit in a completed set
(`noBrokenSets`). The Intangible rule is §2.1.1's.

An open slot promises a set only if one of its actual candidates carries it. A suffix table
counts that support once per slot; required and started sets that cannot gather enough
supported pieces stop before stat bounds run. An engraved or reachable Intangible may
contribute one optimistic wildcard, and one slot or wildcard may be promised to several
sets independently: this can keep impossible branches, never remove a valid completion.
Where every open slot offers every read set, the check is omitted.

### 6.3.1 Ceilings

Floors and the ranking bar read upper bounds; ceilings read **lower bounds**. After each
placement, the prefix plus each remaining slot's independent minima and already completed
set bonuses underestimates every completion; if even that exceeds a ceiling, the branch
stops. Intangible credit is omitted here, because its completion can change. Equality at
either endpoint stays eligible, and every figure is read through the shared sheet.

Tail blocks and first-rune placements use their groups' minima and their **exact** set bonus
for the same test, before opening pairs or sending a block to the card. The last group also
has a balanced tree of minimum/maximum boxes, at most eight candidates per leaf: a box wholly
outside any requested range is skipped. For a capped ordinary stat whose candidates vary in
one accumulator only, candidates are ordered by that stat and binary searches find both ends
of the eligible interval. Percentage/flat pairs qualify only when their percentage is
constant; rounded standalone values and composites are never assumed to order their sheets.

These tests remove only impossible completions. The card's shader still overestimates
eligibility, and returned pairs are checked on the processor. `verify:rune-optimization`
compares pruning with the unpruned traversal and checks tight and contradictory intervals on
all eleven figures against brute force.

### 6.4 Held items

With *Owned only*, every candidate names the stacks it spends: a combination needing three
stones from a stack of two is not offered. All compatible grades and stacks take part,
including set-specific alternatives to an Immemorial item.

**Choose placements and ceiling-sensitive work first; allocate independent items
afterwards.** A recipe names a rune and the Gem's replacement line and stat (no Gem is its
own recipe), and — where a ceiling reads them — the exact value, grind and stacks on every
ceiling-sensitive line. The tree and the card bound each recipe by its independent
accumulator maxima, which are optimistic and may assume the same scarce item on several
runes. For a promising six-recipe combination, each kind/stat group assigns at most six
lines to the compatible stacks, maximizing their total contribution: independent best
choices are used when they fit, otherwise a minimum-cost flow finds the exact assignment.
An optional stone has a free unchanged choice; an assumed item has unlimited supply. The
final six end states are counted by the shared stat sheet and checked against every floor
and ceiling. A failed assignment rejects the recipe combination, never an imported rune.
Matching results have a 4,096-entry cache per worker.

**Why the allocation is exact.** Once six rune/Gem placements are fixed, a Gem's grade
changes only its new stat's amount — not which line may be ground, nor the stone a
same-stat conversion keeps — and Grindstones address separate kind/stat stacks. So each
kind/stat allocation has at most six requests, and different groups never compete for an
item. Each active ceiling's dependencies fix the amounts and stacks on the lines it reads,
so every candidate within a recipe has identical ceiling contributions and fixed supply use,
which the tree checks as usual. What is left — the remaining grades and stones — changes only
free accumulators, in which every ranking figure and floor is monotone. Maximizing each free
group's total therefore preserves every achievable floor and maximizes the combination's
ranking figure without moving a ceiling. Ancient, set-specific and Immemorial compatibility
is already encoded in the legal alternatives `rune-craft-end-state.ts` supplies.

Every retained recipe restores the full legal product of its free item choices before
matching, at depth 10 too, because an earlier range or dominance reduction may have removed
the combination the separately maximized groups need. A physical row already found needs no
further matching when another plan's optimistic score is strictly lower; equal scores still
resolve for the tie order.

**One row per physical combination.** Alternative Gem or stone plans for the same six rune
ids improve that row rather than filling another. Each worker and the merge keep the best
plan found for each combination, and bars come from tables of distinct physical
combinations, so a worker's bar is safe for every other part.

### 6.5 Time, parallelism and a shared bar

The search stops at its depth's time limit and says so: the table is then the best it had
found. It runs in one worker per spare processor core, up to eight, each taking every *n*-th
candidate of the first slot with a choice in it, and their tables merge by one total order —
ranking figure, then fewer runes moved, then the picks — so the split cannot change the
answer.

Preparation's stages are shown before the search percentage; the depth's limit is the
search time, preparation additional. Clock checks include tail pairs and blocks. *Stop the
search* asks each part to finish with its checked builds; leaving the workspace or replacing
the calculation terminates its workers immediately. Stopping during preparation cancels it
and keeps the previous table.

Only parts with distinct tree work are launched. If several workers cannot be started or a
search worker fails, the client retries the same prepared problem in one worker, reports
that stage and keeps the depth and requirements. An unexpected failure of that single
search is an error, recorded in the console; the previous table is kept. This recovery is
independent of the rule deciding whether the card answers.

**The parts share their bar.** A part whose table is full proves the merged table holds as
many builds at or above its last row, because the parts' builds are distinct. So every rise
is relayed to the other parts, and each prunes against the highest bar any part has reached
— dropping only builds *strictly* below it, so ties stay for the order. A part hears the
others between two passes to the card, or on the processor every 50 ms.

### 6.6 What holds it

`npm run verify:rune-optimization` searches 200 random small accounts against brute force
over the unreduced candidates scored by `calculateMonsterTotals`, and requires every row to
agree: the funnel at depth 10, whole; split three ways; split with shared bars, at once and
in slices; and in passes, the way a card is driven, with a stand-in card as generous as a
card may ever be — it returns every pair, shuffled, overflows past a few dozen, and in a
second run refuses midway so the processor has to finish. Rich crafted-range tables compare
the hybrid allocation of §6.4 with unreduced brute force and full item enumeration.

`npm run verify:rune-optimization-card` runs the shader itself (§7).

`verify:rune-optimization-quality` also compares seeded and unseeded exhaustive tables on
the same shortlists, checks that no build is counted twice, checks that time limits and
stop requests keep feasible guides, and holds the Intangible completion that needs no
further slot: Energy, Guard and Blade each one piece short with an Intangible engraved, two
open slots finish all three. `verify:rune-optimization-work` holds the work reading's
boundaries (§5.1). The interface suite exercises an open Shield/Will search at depth 1,
stopping with results, an immediate time limit, and a worker allocation failure that
recovers in one worker.

## 7. The graphics card

`HARDWARE-ACCELERATION.md` keeps decisions on the processor and offers the card whole
questions. The tree is decisions all the way down and stays on the processor. The card
takes the tail: for a pass of blocks it is asked **which pairs could clear the table's
current bar and every floor**, and answers with a shortlist.

- **Generous, never strict.** The card works in single precision; it takes every rounded
  stat a whole point high and compares every figure with slack, so it can shortlist a pair
  that does not belong, never leave off one that does. Every shortlisted pair is judged
  again on the processor before it may enter the table, so the card's answer is always the
  processor's answer.
- **Passes start small and grow.** The first pass is a few dozen blocks and each answered
  pass doubles the next, up to 32,768 blocks or 2²⁵ pairs.
- **A pass that clears more than the card can report** — 65,536 pairs — says so, and is
  split in two and asked again. A single block that still overflows is judged on the
  processor.
- **A card that refuses** its first pass hands the whole search to the processor, and the
  status line says `Processor`. A card that refuses later hands over what is left, and the
  status line says `Graphics card + processor`.

`rune-optimization-layout.ts` holds every offset and, in `runeOptimizationFloatConstants`,
the composite formula constants it takes from `rune-potential-metrics.ts`;
`rune-optimization-shader.ts` interpolates them, and `webgpu-rune-optimization-backend.ts`
packs the passes and holds the agreement gate: hand-built blocks with the bar and a floor in
the middle of their figures, on which every pair the processor keeps must be shortlisted,
nothing shortlisted may fall short by more than the card's stated generosity, and a pass too
full to report must say so.

`npm run verify:rune-optimization-layout` holds the offsets and constants by reading source.
`npm run verify:rune-optimization-card` runs the shader: Chromium's new headless mode
exposes this machine's card, so it loads the modules from the dev server, passes the
agreement gate, and searches the same random accounts the processor was proved on — and
wider ones — with the tail on the card, requiring the processor's table pick for pick. It
needs a running dev server and a card, and is not part of `npm test`.

## 8. The page

1. **Monster** — the *Preset* the build is for, then every copy in it by its copy name in
   a large field with its portrait. Switching preset keeps a member shared by both
   contexts; otherwise the monster choice is cleared. *Open profile* sits under it with
   *Reset to profile* to its right (disabled until a requirement differs from the
   profile) and, at the field's right edge, a quiet *Speed tuning* that opens the chosen
   preset's team over this page (disabled for Scenario and an empty preset). Beside it are
   the depth slider and *Builds listed*, read at the moment of searching; then *Find
   builds* and a square stop mark (*Stop the search*). The line under the depth gives a
   rough size of the search before it runs — the runes the filters admit, at most the
   depth's number per slot and set, multiplied across the slots — and the time limit as
   "up to"; it skips craft variants and exact reduction, so it is an order of magnitude,
   never a count or a timing. With no monster chosen it says in words how much the depth
   looks through. A reserved three-line box below it carries the trial reading,
   uncertainty or work warning (§5.1), without moving either panel.
2. **Requirements for this calculation** — two thirds: builds, the three slot mains
   sharing their own row equally, *Rank by* (its space reserved before a monster is
   chosen) and the eleven ranges in two rows, each with a caption line that says only what
   differs from the profile or where an unstated answer came from. One third, down the
   whole box: *Runes* (*Allow broken sets*, *Allow Intangible runes*, from the profile);
   *Selection* (*Only runes not engraved in preset*, *Just fill in empty slots*, *Include
   runes from higher-priority monsters*, *Limit changes*); *Adjustments* (*Count unfinished
   runes at their +15 main stat*, *Slot 1/3/5 only counts at +12*); *Gems/Grinds* (*Allow
   Immemorial Gems and Grindstones*, *Allow changing a gemmed stat*), then Gems and
   Grindstones. Selection, adjustments and the Gems/Grinds settings are saved preferences
   and hold for every monster.
3. **Status** — at the foot of the monster panel, under *Find builds*, dimmed: the search's
   progress while it runs, then builds checked and runes considered on one line and time
   and engine on the next. The stale warning sits between the two; a search that stopped
   at its limit says so above the table. A change to the runes or locks since the search
   is not announced here: the rows it touches say so (item 5).
4. **Builds** — the current build pinned first as `Now`, then the ranked builds, in the
   order of the ranking figure, ties in the search's own order. The headers do not sort:
   the search holds only the best builds by that one figure, so ordering by another column
   would rank a sample rather than the account. Another order is another search, and *Rank
   by* starts it: with a table on screen or a search running, choosing a figure searches
   again at once. With no table it only sets the figure for *Find builds*. Choosing a row
   opens the build in an overlay: its six runes in the game's rune circle — slot 1 at the
   top, the rest clockwise — each as it is in the account now, and beside the circle, slot
   by slot, the modifications the build assumes — which line a Gem replaces and with what,
   which stone goes on which line, and a main counted at `+12` or `+15`. Each rune card
   carries a lock and an exclusion, the same choice the rune overlay's *Lock* makes; each
   names the move it makes (`runeLockLabels`): *Lock* or *Engrave and lock*, *Exclude* or
   *Remove and exclude*. *Engrave on monster* engraves the six runes on the selected monster
   **in the chosen preset and nowhere else**: in Scenario it moves the physical runes in the
   saved import, its former runes returning to inventory; in a game preset it rewrites that
   preset's saved gear, a preset that saved only its monsters first taking every member's
   Scenario gear; in a preset built in JASWA it writes the preference. A rune taken from
   another monster of the same preset leaves that monster; no other preset changes. There
   is no separate plan or undo state. Gems, Grindstones and future power-ups remain
   modifications to perform in the game. Engraving in Scenario or a game preset is
   unavailable under *Always synchronized*; a preset built in JASWA may always be engraved.
5. **Following the table** — a change to the runes does not throw the table away. A sync
   re-reads every build against the account as it is now (`rune-optimization-refresh.ts`):
   a Gem or stone applied since the search counts as done at what it rolled, one not yet
   applied is still planned, Changes follow where each rune now sits, and the figures are
   summed again with the search's own arithmetic (`buildFigures`).

   A change that stands in a build's way keeps the row and names the rune, slot by slot, in
   the overlay and as a yellow mark on the row, which is dimmed:
   - the rune was **sold or fed** — the row keeps no figures;
   - it is **locked where it is**, and that is not this monster (or the inventory);
   - **another rune is locked into its slot** on this monster;
   - it has been **excluded** from this monster;
   - it now sits on **another monster** whose runes the search could not take — *Only runes
     not engraved in preset* was ticked, or that monster is above this one on the preset's
     priority list;
   - **another rune now fills the slot** while only empty slots may change;
   - the build now needs **more rune changes than its limit**;
   - the Gems and Grindstones **still to come need more of a held item** than the account
     has left, counted over the whole build.

   A rune that took a Gem on another line cannot take the planned one (a rune holds one
   converted line), so that Gem is dropped. A rune newly locked to this monster is used as
   engraved, so the work still planned on it is dropped. Where the figures fall below a
   target or above a ceiling, the overlay's *Targets* and the row's mark say which.

   A build is held to the requirements and settings **on screen**, not those it was
   searched under, by the same rules the search applies (`slotMainAllowed`,
   `setRuleMissed`, `craftSupplies`, `countedMainValue`, `mayTakeFrom`). Narrowing the
   question dims every row it now rules out, and widening it lifts the dimming:
   - a stat range the figures now fall outside;
   - **broken sets** refused while a set is broken, or a **build** taken away that the sets
     were — named on the row;
   - **Intangible runes** refused, or a **slot main** taken away, on the rune that breaks it
     — never on a rune locked here or kept by *Just fill in empty slots*;
   - *Only runes not engraved in preset*, the priority list, *Just fill in empty slots* or a
     lower *Maximum changes*;
   - a **Gem or Grindstone still to come** the settings no longer offer: none, owned only
     where the plan assumed one, Immemorial items refused, a gemmed stat held, or a grade or
     roll that no longer reaches the planned value.

   *Count unfinished runes at their +15 main stat* and *Slot 1/3/5 only counts at +12*,
   turned off, count a projected main as it stands; turned on, they raise nothing the search
   did not count. Widening the question never adds a row: a better build is only found by
   searching again. Listing fewer builds cuts the same table shorter. Changing any
   requirement or search setting — or listing more builds than were searched — marks the
   table as stale; a monster that left the account says so.

Nothing a choice changes moves anything else (`AGENTS.md` §2): captions are reserved lines,
the craft selects disable rather than disappear, the status line has its own reserved
height.

An unfinished search with no result says no build was found before it stopped; it does not
claim the requirements are impossible. A finished guided shortlist with no result names that
shortlist and suggests greater depth. Only the complete search, or an exact range reduction
leaving a slot empty, can rule builds out. Preparation, retry and error messages use the
reserved status box, and an error keeps the previous result table.

## 9. Open questions, recorded rather than guessed

- **Relic unique properties.** A relic's main HP, ATK or DEF percentage is counted on the
  visible sheet; its unique property remains a battle effect outside the sheet.

## 10. Reproducing measurements

Measurements are not contract and are not recorded here. Inputs and outputs stay local
under `work/`; no account data is committed or uploaded.

| Command | Measures |
| --- | --- |
| `npm run bench:rune-optimization-work` | The work reading of §5.1 over a question matrix that varies one input at a time, then the actual parallel client. Needs the dev server on `http://localhost:3000/`. Pass a serialized `RuneOptimizationInput` as the argument for a captured question; set `JASWA_BENCH_GPU=1` to go through the card gate. |
| `npm run bench:rune-optimization-ranges` | The hybrid allocation of §6.4 on a generated matrix of ceilings. Optional arguments: a serialized `RuneOptimizationInput`, then one case name, such as `'SPD ceiling'`. |
| `npm run bench:rune-optimization-guidance -- --generated --seed-only` | The guidance of §5.2: the table available on an immediate stop. Replace `--generated` with a serialized `RuneOptimizationInput` for a captured question; omit `--seed-only` for three-second searches. An optional second argument names a local snapshot of `rune-optimization-problem.ts` to compare against. |
