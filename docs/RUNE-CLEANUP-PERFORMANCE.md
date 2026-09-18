# Rune Clean-up — why Calculate is slow, and what to do about it

**Status:** Analysis, proposal, and **partly implemented**. §13.4's Phases 0–4 have
landed — ten of §11's twelve stages. Phase 5 (the slot-local model) was not started, and
of Phase 6 only the allocation indexing was done.

**§14 is the implementation record**, and it is the section to read first: what was
measured on a committed harness, which of §13.3's contract decisions were taken and how,
where the implementation departed from the approved sequence — including one departure
with no good justification — and what is still open. Several figures in §0–§13 did not
reproduce, and one of §5/§10.2's central claims was never exercised.

This document is **not** a binding contract and changes no rule.
`docs/RUNE-CLEANUP-MATH.md` remains the calculation contract — which §3, §6 and §7 of
that document were amended to carry, each in its own commit, as its §9 requires.

**Where sections disagree, the later one wins:** §7 is superseded by §11, §11 is
qualified by §13.4, and §14 reports against §13.4.

**Reviewed:** 18 September 2026
**Implemented:** 18 September 2026
**Subject:** `app/lib/rune-cleanup-model.ts`, `app/lib/rune-cleanup-advice.ts`,
`app/components/rune-recommendations.tsx`

---

## 0. The short version

The Rune Clean-up calculation is slow for one reason, and it is not the reason the
code's own comments anticipate. The model's shape — exact enumeration over a tiny
event space — is correct and should be kept. Essentially all of the time is spent
inside one function, `convolveDistribution`, and **two thirds of the total runtime is
spent converting floating-point numbers to decimal strings and back** in that
function's inner loop.

Measured on a synthetic 1,200-rune box against the eight shipped presets:

| | Baseline | After the five changes in §4 |
| --- | ---: | ---: |
| `runeAdvice` wall time | 75,617 ms | 503 ms |
| Convolution cells evaluated | 332,831,840 | 5,726,425 |
| Largest intermediate distribution | 51,454 entries | 2,066 entries |
| Verdicts differing | — | **0** |
| Best preset differing | — | **0** |
| max \|Δ chance\| | — | 4.7 × 10⁻¹³ |

The project's own independent oracle agrees. `verify-rune-cleanup-calibration` at
`--runes=500 --share-runes=300 --rollouts=800 --variant-runes=20` produced **byte-identical
output** — including the Monte Carlo agreement line, the retained population, the slot
spread and every quota — in 1.1 s against the baseline's 92.5 s.

All five changes are internal to `rune-cleanup-model.ts`. None touches
`rune-cleanup-advice.ts`'s policy, the preset allocation, or any documented figure.

---

## 1. How this was measured

Everything below rests on measurement, not on reading. The method, so it can be repeated:

1. A synthetic box was generated with the same rune generator and the same reference
   base lines that `scripts/verify-rune-cleanup-calibration.mjs` uses, spread across
   star classes 3–6, Ancient and ordinary, and power-up levels +0 to +15.
2. `runeAdvice` was timed end to end, three passes, warm.
3. `node --cpu-prof` gave the self/inclusive breakdown.
4. Copies of `rune-cleanup-model.ts` and `rune-cleanup-advice.ts` were instrumented
   with counters. The instrumented copies reproduce the baseline verdict counts
   exactly, so the counters describe the real calculation.
5. Each proposed change was applied **one at a time** behind an environment flag, and
   every run compared verdict, chosen preset, `maxValue`, `chance` and the printed
   reason string for every rune against the unmodified baseline.
6. Finally the project's own calibration oracle was run against the changed model and
   diffed against the unmodified run.

Nothing in the repository was modified. The harness lives in the session scratchpad.

### 1.1 The baseline profile

250 runes, 8 presets, 16.2 s:

```
--- SELF TIME ---
  65.8%   probabilityKey        rune-cleanup-model.ts:479
  30.3%   convolveDistribution  rune-cleanup-model.ts:481
   1.5%   (garbage collector)
   1.3%   reachChance           rune-cleanup-model.ts:544
   0.1%   lineDistribution
   0.1%   buildDemand
   ...    everything else below 0.1 %

--- INCLUSIVE TIME ---
  98.0%   runeAdvice
  97.6%   reachChance
  96.2%   convolveDistribution
```

And the counters for the same run:

```
judge                 1,535     judgeWithChance      329
reachChance             229     reachEarlyOne         64
branches             10,918     branchConvolved    4,028
convolveCells    64,399,661     maxBranchMapSize  51,454
lineDistMiss            226     lineDistHit       10,547
```

Read those two blocks together and the whole picture is there. The model visits only
1,535 rune/preset pairs and only ever runs 4,028 real probability branches — the
enumeration is *small*. But those 4,028 branches evaluate 64 million convolution
cells, and each cell calls `Number(value.toFixed(12))`.

---

## 2. What the architecture gets right

This needs saying first, because the recommendations below are deliberately narrow and
the reason is that the surrounding design is sound.

- **Exact enumeration is the right model here.** A rune has at most four remaining
  sub-property events. The space of outcomes is genuinely small, the answer is a
  probability the user is invited to argue with, and an exact answer costs — properly
  implemented — well under a millisecond per rune. Replacing the engine with a Monte
  Carlo or a normal approximation would trade away a real guarantee to fix a problem
  that is not in the model.
- **The split between arithmetic and policy is correct** and worth protecting.
  `rune-cleanup-model.ts` produces figures, `rune-cleanup-advice.ts` decides what they
  mean. The single-source-of-truth argument in both files' headers is right: a verdict
  and the chance printed beside it come from one calculation.
- **The gates are applied in the right order and to the right object.** Selecting the
  best-value candidate first and asking about its odds afterwards would sell runes that
  should be kept; the code already knows this and does it the other way round.
- **Per-candidate short-circuiting already exists and works.** `withChance = false` on
  the first pass, `best + 1e-12 >= wanted` before entering `reachChance`, and the
  min/max gain prune inside the branch loop together eliminate 6,890 of 10,918 branches
  before any distribution is built. The instinct is right; it simply does not go far
  enough, and it is aimed at branch count when the cost is per-cell.
- **`lineDistribution` is already cached** and hits 98 % of the time.

The one architectural cost I would charge against the current design is in §4.6: the
model/policy boundary forces `judgeAgainstBuild` to be called twice for the same
rune/preset/build, recomputing everything but the chance the second time. That is a
real cost, but it is a small one and the boundary is worth more than it costs.

---

## 3. Where the time actually goes

`reachChance` asks one question: what is the probability that the rune's realised fill
reaches `gap`? It answers it by building, per branch, the exact distribution of the
total gain, as a `Map` from value to probability, convolving one term at a time.

Three things make that expensive, and all three are implementation, not model.

### 3.1 The map key is built by decimal string formatting

```ts
const probabilityKey = (value: number): number => Number(value.toFixed(12));
```

Called once per cell of every convolution. `toFixed` allocates a string, formats a
double into decimal, and the result is then parsed back to a double. At 332 million
cells for a 1,200-rune box, this alone is 66 % of the entire Rune Clean-up calculation.

The comment above it is correct about *why* rounding is needed — it removes IEEE-754
noise so that two arithmetically equal sums land on one key — and correct that it never
coarsens a game outcome. It is simply the most expensive possible way to do it.

### 3.2 Mass that can no longer reach the target is carried at full resolution

`convolveDistribution` takes a `cap`, and `reachChance` passes `gap`. That collapses
everything at or above the target into a single key — the upper tail is handled.

The **lower** tail is not. A partial sum that cannot reach `gap` even if every
remaining term rolls its maximum is already a certain zero, but it is kept as a
distinct key and carried through every subsequent convolution, multiplying the size of
every later cross product. This is what produces a single intermediate distribution
with **51,454 entries**.

Flat HP is where this bites hardest: a six-star flat HP roll is an integer in 135–375,
so one line contributes 241 distinct values, four rolls contribute 961, and two such
terms convolved is close to a million cells — most of them describing outcomes that
were hopeless before the first term was drawn.

### 3.3 The final term is convolved when only its tail is ever read

The last line of a branch is:

```ts
for (const [gain, probability] of branch) if (gain + 1e-12 >= gap) chance += branchWeight * probability;
```

Only the tail is read. Yet the final term is convolved in full first, building the
entire joint distribution — the largest cross product in the branch — so that all but a
sliver of it can be discarded one line later.

---

## 4. The findings, and what to do about each

Each carries what it is founded on, what to change, and why the answer cannot move.

---

### 4.1 Replace the decimal-string key with arithmetic rounding

**Founded on:** 65.8 % self time in `probabilityKey`; 332,831,840 calls for a
1,200-rune box.

**Change:**

```ts
const probabilityKey = (value: number): number => Math.round(value * 1e12) / 1e12;
```

**Measured:** 16.1 s → 4.6 s on its own (3.5×). Verdicts, presets, `maxValue`, `chance`
and printed reasons **all bit-identical**, max \|Δ chance\| exactly 0.

**Why the outcome cannot move:** both forms canonicalise a double to twelve decimal
places, which is what the existing comment says the rounding is for. The quantities
being rounded are sums of terms of the form `value × k`, where `value` is a whole game
roll; the smallest difference two genuinely distinct outcomes can have is the smallest
single-roll contribution, which is a flat HP point — `12.5 / base.hp`, or about
7 × 10⁻⁴ for a realistic level-40 reference line. Twelve decimal places sit nine orders
of magnitude below that, so the rounding removes representation noise and nothing else,
exactly as before.

**One caution, and it is the reason this is specified so precisely.** A coarser key is
*not* safe without a matching change elsewhere. I tried `Math.round(value * 1e9) / 1e9`
first and it moved the chance on 7 of 250 runes and flipped 5 chosen presets. The cause
is that `reachChance` compares with a hard-coded `+ 1e-12` tolerance; a key rounded to
1e-9 can land up to 5 × 10⁻¹⁰ *below* the capped `gap`, and the comparison then rejects
the very mass the cap was collecting. I then tried raising every `1e-12` in the file to
`1e-9` to match: that restored all verdicts and presets, but it is no longer exact — it
admits a sliver of boundary mass and produced a max \|Δ chance\| of 8 × 10⁻⁴.

So: **keep the 1e-12 scale and leave the epsilons alone.** The key's precision and the
comparison tolerance are a matched pair, and the pairing should be written down beside
them.

> **Superseded — see §10.3.** §9.8 was right to refuse this as proven identity, and
> measurement bears it out: the two forms disagree on 0.08 % of values in the operative
> range, by up to 1.0 × 10⁻¹², which is the epsilon itself. §10.3 replaces this
> recommendation with an integer key that removes the question instead of bounding it.
> Implement §10.3, not this.

---

### 4.2 Collapse mass that can no longer reach the target

**Founded on:** a single intermediate distribution reaching 51,454 entries; 64.4 M
cells at 250 runes.

**Change:** give `convolveDistribution` a `floor` alongside its `cap`, and drop any sum
below it. Before convolving term *i*, the floor is `gap − (maximum gain still available
from terms i+1…n)`.

```ts
function convolveDistribution(left: Distribution, right: Distribution,
  cap = Number.POSITIVE_INFINITY, floor = Number.NEGATIVE_INFINITY): Distribution {
  const out: Distribution = new Map();
  for (const [a, leftWeight] of left) for (const [b, rightWeight] of right) {
    const sum = a + b;
    if (sum < floor) continue;           // cannot reach the target from here
    const key = probabilityKey(Math.min(cap, sum));
    out.set(key, (out.get(key) ?? 0) + leftWeight * rightWeight);
  }
  return out;
}
```

**Measured:** 16.8 s → 6.8 s on its own (2.5×). Largest intermediate distribution
51,454 → 4,561 entries. Cells 64.4 M → 42.4 M. **Bit-identical results**, max
\|Δ chance\| exactly 0.

**Why the outcome cannot move:** this is the exact mirror of the `cap` the function
already applies, and rests on the same fact. `reachChance` reads only the mass at or
above `gap`. A partial sum `s` after term *i* contributes to that mass only if
`s + (remaining gain) ≥ gap` for some legal remaining draw; since the remaining gain is
bounded above by the sum of each remaining term's count times its range maximum —
the same bound `reachChance` already computes for its `maximumGain` prune — any `s`
below `gap − remainingMax` contributes exactly zero. Dropping a zero contribution
cannot change a sum. The `− 1e-12` slack matches the tolerance used on the other side,
so the two boundaries stay consistent.

---

### 4.3 Answer the final term by tail lookup instead of convolving it

**Founded on:** §3.3 — the final and largest cross product in every branch is built in
full and then all but its tail is discarded.

**Change:** convolve terms 1…n−1 as now. For the last term, keep a cached sorted value
array with a suffix-sum of probabilities, and accumulate

```
Σ over states a of  P(a) × P(last term ≥ gap − a)
```

with one binary search per state. The sorted/suffix view is a pure function of the
cached `Distribution` and can hang off the existing `lineDistribution` cache
(a `WeakMap` keyed on the distribution works and needs no new invalidation rule).

**Measured, on top of 4.1 and 4.2:** 1.85 s → 0.50 s at 250 runes. Cells 42.4 M →
5.0 M. Verdicts, presets and reasons identical; max \|Δ chance\| 2.3 × 10⁻¹³.

**Why the outcome cannot move:** for independent terms, `P(X + Y ≥ g) = Σ_x P(X = x)
· P(Y ≥ g − x)`. That is the definition of the convolution's tail, not an approximation
of it — the same products are summed, in a different order and without materialising
the joint distribution. The only difference is floating-point summation order, which is
where the 10⁻¹³ comes from. See §5 for what that is and is not.

---

### 4.4 Convolve the widest term last

**Founded on:** an accident. I first implemented 4.5 with the terms sorted by stat id,
and the run got **three times slower** (1.54 s → measured against 0.45 s for the same
work in size order). The term order turns out to matter enormously, and nothing in the
current code chooses it — it falls out of the order `reachChance` happens to append
terms in.

**Change:** before convolving a branch, order its terms by support width ascending, so
the narrowest are convolved first and the widest is the one 4.3 answers by lookup.

**Measured:** with 4.5 also applied, 1,536 ms → 449 ms at 300 runes. Cells 21.6 M →
4.0 M. Largest intermediate 10,490 → 2,066 entries. Tail lookups 1,395,229 → 121,202.

**Why the outcome cannot move:** addition is commutative and the terms are independent,
so the distribution of their sum does not depend on the order they are combined in. The
`cap` and the `floor` are both defined against the same `gap` and the same
remaining-maximum bound, both of which are order-independent quantities recomputed for
whatever order is chosen. This is the one change whose *only* effect is on intermediate
sizes.

---

### 4.5 Collapse branches that are the same calculation under different labels

**Founded on:** 10,918 enumerated branches producing 4,028 distinct convolutions, and
the structure of the enumeration: `combinations(missing, adds)` enumerates every legal
set of added effect ids, including ids the preset has no target for. A line the role
does not want contributes nothing — `reachChance`'s own `add` helper filters it out —
so many enumerated branches reduce to an identical term list.

**Change:** build the term list first, key it canonically, accumulate branch weights
into a `Map`, and run each distinct term list once against its accumulated weight.

**Measured:** branches 13,283 → 11,651 at 300 runes. Smaller than I expected on its
own; its real value is that it makes 4.4 possible without recomputing the ordering per
enumerated branch.

**Why the outcome cannot move:** the branch contribution is `weight × f(terms)`, and
`f` depends on nothing but the term list. Summing `w₁ · f(t) + w₂ · f(t)` as
`(w₁ + w₂) · f(t)` is a factorisation, not a change of model. Every branch is still
enumerated and still carries its own weight; only the arithmetic is shared.

---

### 4.6 Work that is recomputed per rune although it does not depend on the rune

Now visible only because the convolution stopped hiding it. After 4.1–4.5, the profile
flattens and this is roughly 10 % of what remains.

**a. `buildDemand` computes all six slots; exactly one is ever read.**

`buildDemand` fills `shares` and `ceilings` for slots 1–6, and `slotCeiling` — which
filters, maps and sorts `allStatIds` — runs six times. But `judgeAgainstBuild` reads
only `shares.get(rune.slot)` and `ceilings.get(rune.slot)`, and grep confirms
`buildDemand` has no other caller anywhere in `app/`, `scripts/` or `tests/`. Five
sixths of the work is discarded.

*Measured:* 850 ms → 795 ms at 1,200 runes, results identical.

*Why the outcome cannot move:* the five discarded entries are never read. The `Demand`
type is module-internal, so narrowing it is invisible outside the file.

**b. `buildDemand` is rune-independent and is called once per rune.**

It is a pure function of `(preset, build, base)`. It ran 7,867 times for a 1,200-rune
box; with the slot narrowing of (a) it is a pure function of `(preset, build, slot)` and
has at most `presets × builds × 6` distinct results — a few hundred. Memoise it for the
duration of one `runeAdvice` call.

*Why the outcome cannot move:* memoising a pure function of its arguments returns the
same value. `base` is fixed for the whole call; `presetBuilds` is already hoisted for
exactly this reason, so the precedent and the lifetime are established.

**c. `judgeAgainstBuild` is called twice for the same rune, preset and build.**

Once with `withChance = false` to get `maxValue`, and again with `withChance = true` on
the candidates that pass. The second call recomputes `buildDemand`, `projectedSupply`,
`remainingEvents` and `bestReachableFill` — all identical to the first — to obtain one
extra number. 329 of 1,535 calls at 250 runes are pure repetition.

*What to do:* have the first pass return the intermediate state it already built, and
give the chance its own entry point that consumes it. This is the one change that
touches the model's exported surface, so it is worth doing deliberately rather than as
part of a performance pass.

**d. `projectedSupply` re-runs the whole craft search once per preset.**

It called `supplyOf` 162,689 times for 7,867 invocations — about 21 candidate line-ups
evaluated per call. The *enumeration* of legal gem and grind actions depends only on the
rune, its lineage and the credit settings; only the *choice between* them depends on
`shares`. The candidate list can be built once per rune and scored per distinct share
set, of which there are a handful across eight presets.

*Why the outcome cannot move:* the winner is chosen by `fillOf(...)` over the same
candidate list; building that list once and scoring it several times evaluates the same
comparisons.

**e. `credit` is constructed inside the per-rune loop** (`rune-cleanup-advice.ts:138`)
though every field comes from `settings`. Trivial, but it is one allocation per rune and
it reads as though it were rune-dependent, which it is not.

---

### 4.7 A candidate's eligibility ceiling is known before any arithmetic

**Founded on:** the shape of the value gate. A candidate is eligible only if
`value >= qualityBar`, where

```
value = min(1, best / ceiling) × mainScale × worth
```

The `min(1, …)` bounds the first factor at 1, so **`value ≤ mainScale × worth`
always** — and both of those are known before the model is entered. `mainScale` is a
pure function of the rune's star class and main stat id; `worth` is a pure function of
the rank (the preset's own set and slot lists, read directly) and the slider stops.

So if `mainScale × worth < qualityBar`, that candidate is provably ineligible and no
model call can change it.

With the shipped defaults this prunes real work. At quality stop 3 the bar is 0.55; the
default Broken stop is 0.40, so **every broken-rank candidate is provably ineligible**.
A 4★ HP% rune has `mainScale = 43 / 63 = 0.68`, so at the default Accepted stop of 0.70
a 4★ accepted candidate caps at 0.48 and is likewise ineligible. Whole star classes and
whole rank categories fall out with no arithmetic at all.

**What to do:** apply the pre-gate before `judgeAgainstBuild` in the candidate loop of
`runeAdvice`, to skip the *chance* half.

**The care this needs, which is why it is listed last:** the candidate list is also what
produces the display fallback for a rune that clears nothing — the row still prints a
Max value, a chance and a reason. So a pre-gated candidate must still be able to supply
`maxValue` if it turns out to be the rune's best showing; only the chance may be
skipped. And the skipped chance is not automatically zero: `reachChance`'s own guard is
written against the *unclamped* `best / ceiling`, which can exceed 1, so there exist
runes that fail the value gate and would still report a non-zero chance today. That is
arguably a wart in its own right, but it is a behaviour and this document's brief is not
to change behaviours. **Do this one after 4.1–4.5 are in and verified, or not at all —
it is the only finding here where "the outcome cannot move" needs an argument rather
than a proof.**

---

### 4.8 Two smaller structural notes

**a. An O(N) scan inside a sort comparator.** `rune-cleanup-advice.ts:231-235` sorts
the presets by allocation capacity, and the comparator runs two full `pending.filter()`
scans on every comparison. It is correct, and at eight presets and 1,200 runes it costs
nothing measurable. It is O(P log P × N × E) and would become noticeable for a user with
thirty presets. Compute each preset's capacity once into a `Map` and sort on that.
Sorting on a precomputed key rather than recomputing it per comparison cannot change the
order, since the key is a pure function of state that does not change during the sort.

**b. `lineDistributionCache` is module-global and never cleared.** Its key includes the
reference base line, so it is correct across imports and across recalculations — which
is a genuine benefit, since a slider change reuses every cached distribution. But it is
unbounded, and after 4.3 it will also hold a sorted view per entry. In practice the key
space is small (stat × count × stars × kind × base line), so this is a note to keep an
eye on rather than a defect; if it ever needs a bound, the natural one is to clear it
when the reference base line changes.

---

## 5. What "the outcome does not change" means precisely

Across every comparison run — four seeds, 250 to 1,200 runes, gem and grind credit from
none to maximum, roughly 2,500 runes judged against 8 presets each — **no verdict and no
chosen preset differed**, and `maxValue` was bit-identical throughout.

`chance` differed by at most 5.7 × 10⁻¹³, from floating-point summation order in 4.3.
In every run but one, that was invisible: the table rounds to whole percent.

The single exception is worth recording rather than hiding. At seed 12345, rune 169 has
a true chance of exactly 7⁄8. The baseline's summation order lands one ulp below
(`0.8749999999999999`, printed "87 %"); the reordered summation lands one ulp above
(`0.8750000000000001`, printed "88 %"). Both are wrong by one ulp about a value that is
exactly 0.875, and the baseline is not the arbiter of truth at an exact rounding
boundary. A calculation whose displayed output can be moved by an ulp of summation order
at an exact half is a display question, not a correctness one — and if it matters, the
fix is in `percent()`, not in the engine.

> **Resolved — see §10.2.** This was left as an open question here and challenged in
> §9.8. It has since been settled by measurement: four independent summation orders,
> including compensated summation applied to the baseline, place the true value at
> exactly 0.875. The reordered engine lands on it; the baseline is one ulp below. The
> tail lookup **removes** this error rather than introducing it.

**The strongest single piece of evidence is not any of mine.**
`scripts/verify-rune-cleanup-calibration.mjs` generates legal runes, plays the game's
own addition and upgrade loop with its own PRNG, and checks the model's chance against
that simulation — deliberately not a second copy of the scorer. Run at
`--runes=500 --share-runes=300 --rollouts=800 --variant-runes=20`, baseline and changed
model produced **byte-identical output**: the same Monte Carlo agreement, the same
retained population, the same slot spread, the same best-match attribution, the same
quotas, the same PASS. 92.5 s against 1.1 s.

---

## 6. Changing the preconditions

The four items above are inside the calculation. These are about what is asked of it.

### 6.1 It runs on the main thread, and the project already has the answer

`RuneRecommendations.calculate` defers by `window.setTimeout(…, 0)` so the button can
paint its busy label, and then takes the main thread for the whole duration. That is
what makes the browser report a hung page rather than a slow one.

The project already ships the right pattern for exactly this, for exactly this reason:
`app/lib/compute/artifact-score-client.ts` owns a `Worker`, and all backend selection
lives inside it. Rune Clean-up uses none of it.

Moving `runeAdvice` behind the same kind of client is worth doing **even after the
hundredfold speed-up**, and the argument is not speed:

- It removes the hung-page failure mode categorically, rather than moving the threshold.
- A 3,000-rune box with twenty or thirty user presets is several times the load measured
  here. The algorithmic fixes buy enough headroom that this stops being urgent; they do
  not make it impossible.
- It is what lets the button report honest progress instead of a spinner, and lets the
  user cancel.

`runeAdvice`'s inputs are plain data — runes, presets, settings, and a `Map` of base
stats — and its output is a `Map` of plain records. It is structurally clonable as it
stands; no serialisation contract has to be invented.

### 6.2 Two settings already exist, are shown to the user, and are ignored

`RunePotentialSettings` carries `includeLevel12Runes` and `includeEquippedRunes`.
`rune-potential-section.tsx:201-204` renders both as checkboxes. `file-imports.ts`
defaults both to `false` and validates them.

**Neither is read by `runeAdvice` or by `RuneRecommendations`.** Grep finds no consumer.

I am flagging this first as a correctness matter and only second as a performance one.
A user who unticks "Include runes equipped on monsters" is told something will happen
and nothing does — the equipped runes are judged anyway and appear in the table, because
the table's own Equipped/Inventory filter is a separate control applied afterwards. That
is the invisible failure `AGENTS.md` §0.1 forbids, and it should be resolved on its own
terms: either the settings drive the calculation, or they should not be on the panel.

If they are wired up, they are also the single largest reduction available in the input
population. In the synthetic box, +12 and above is 23 % of the runes; on a real account,
equipped runes are commonly half the box or more. Honesty about the size of the win:
runes at +12 and +15 have no remaining sub-property events, so `reachChance` returns
immediately for them and they are already among the cheapest — the saving from
`includeLevel12Runes` is much smaller than its share of the population.
`includeEquippedRunes` cuts genuinely expensive work.

**This does change the outcome**, and it should: fewer runes are judged, by the user's
own instruction. It belongs in a different change from §4, which is why it is here.

### 6.3 Results could be streamed

The per-rune loop is independent up to the allocation phase, which needs the whole
eligible pool. Rows could be emitted in chunks with the allocation applied at the end —
worth having once the calculation is in a worker, and not before.

### 6.4 The sliders are a closed set, which opens a bigger option

`qualityThresholds`, `chanceThresholds`, `acceptedWorth`, `brokenWorth` and
`creditFractions` are all fixed five-stop arrays. The chance is currently computed
against one threshold at a time, with `cap` and `floor` both defined by that threshold.

An alternative shape: compute the **full distribution of the final fill once per
(rune, relevant-stat-set)** and answer every threshold by a lookup on its tail. The
number of distinct relevant-stat sets across a preset list is small — a handful, not
one per preset. That would make a slider move nearly free and could retire the Calculate
button entirely.

I am **not** recommending it as a first step, and the reason is that it is in tension
with §4.2 and §4.3: the `cap` and `floor` prunes that produce most of the win are
threshold-dependent, and an unpruned full distribution is far more expensive per
computation. It becomes attractive only once the cost is amortised across five stops
*and* repeated recalculations. Revisit it if live sliders become a product goal; it is
not the way out of the current problem.

### 6.5 What I considered and rejected

**Quantising the currency to an integer lattice.** The convolution's cost is ultimately
hash-map traffic over floating-point keys. If every line's contribution were rounded to
a common integer grid — thousandths of a max roll, say — the whole engine could run on
typed integer arrays with no hashing at all, and would be faster again by a large
factor.

I am recommending against it. It would move outcomes at the margin, which is precisely
what `RUNE-CLEANUP-MATH.md` §6 rules out ("convolves distributions without a rounding
grid" is a stated property, and the file's own comment records that a former 0.025 grid
was removed). Recommending it would be trading a documented guarantee for speed the
measurements say is not needed. §4 reaches 0.5 s for 1,200 runes while remaining exact;
there is no case for spending a guarantee on top of that.

**Replacing the exact engine with Monte Carlo.** Same objection, worse trade. The exact
engine is the thing the calibration script exists to protect.

---

## 7. Recommended order of work

> **Superseded by §11.** This ordering predates the independent review in §9 and the
> resolutions in §10. It is kept for the record; §11 is the plan to implement.

1. **§4.1** — one line. 3.5× on its own. Bit-exact. Write the key-precision/epsilon
   pairing down beside it, because the failure mode when they drift apart is silent.
2. **§4.2** — one parameter and one `continue`. 2.5× on its own. Bit-exact.
3. **§4.3 + §4.4 + §4.5** together — they interlock, and 4.4 is what makes 4.3 pay.
   This is the largest single step and the only one that is real surgery on
   `reachChance`.
4. Run `npm run verify:rune-cleanup-calibration:large` and diff its output against a run
   from before the change. It should be identical.
5. **§4.6 a–b, §4.8 a** — mechanical, uncontroversial, roughly another 10 %.
6. **§6.1** — the worker. Independent of everything above and worth doing on its own
   merits.
7. **§6.2** — the two ignored settings, as a correctness fix in its own change.
8. **§4.6 c**, then **§4.7**, last, deliberately, each with its own verification.

Steps 1–3 are what turn a 75-second calculation into a half-second one. Everything after
step 4 is ordinary tidying and product work.

## 8. Verification

The guard already exists and should be the gate on every step:

```
npm run verify:rune-cleanup-calibration         # fast
npm run verify:rune-cleanup-calibration:large   # before merging
npx playwright test tests/rune-cleanup-calculation.spec.ts
```

For steps 1–3 the bar should be stronger than "still passes": capture the calibration
script's full output before the change and require the output after it to be
**identical**, not merely passing. That is the check that caught the 1e-9 key mistake in
§4.1, and it is the check that would catch its equivalent next time.

---

## 9. Independent review and reconciliation

**Added:** 18 September 2026. This section is an independent review of the preceding
analysis. The original sections above have not been removed or rewritten. Where this
review agrees with them, it says so explicitly; where it qualifies or extends them, the
distinction is intentional.

### 9.1 Scope and evidence

I reviewed the complete calculation path rather than only the hottest function:

- `app/components/rune-recommendations.tsx`, including the Calculate handler and the
  separation between calculation scope and post-calculation filters;
- `app/lib/rune-cleanup-advice.ts`, including candidate selection, chance gating and
  global preset allocation;
- `app/lib/rune-cleanup-model.ts`, including demand construction, craft projection,
  deterministic maximum, event enumeration and probability convolution;
- `app/lib/rune-properties.ts`, `rune-craft-items.ts`, the preset and reference-line
  modules, `RUNE-CLEANUP-MATH.md` and the relevant parts of `RUNE-CANONICAL.md`;
- `scripts/verify-rune-cleanup-calibration.mjs` and the Rune Clean-up Playwright test.

The existing analysis contains the detailed instrumented profile and controlled
before/after experiments. I did not silently treat those experiments as mine. I
independently checked their conclusions against the source and ran the repository's
calibration guard:

```text
npm run verify:rune-cleanup-calibration
PASS

node ... verify-rune-cleanup-calibration.mjs \
  --runes=250 --share-runes=300 --rollouts=50 --variant-runes=5
PASS
```

The second run took about 20 seconds on this machine and exercised the independent
chance fixtures, 4★/5★ ordinary and 6★ Ancient coverage, the mixed-box policy and
largest-remainder allocation. A deliberately smaller run with `--share-runes=100`
failed only because the calibration script requires at least 100 feasible quota-fixture
runes; it was not used as evidence for a code failure. No application source was
modified while making this review.

### 9.2 Executive conclusion

The exact model should be retained. A rune has only a small number of future events,
the page exposes a probability, and the contract explicitly says that the chance is an
exact discrete probability without a coarse rounding grid. Monte Carlo, a normal
approximation or an integer quantisation grid would exchange a correctness guarantee
for speed that the current measurements show is not necessary.

The current user-visible timeout has two distinct causes:

1. **Too much synchronous work.** The probability engine materialises large maps and
   repeats several deterministic calculations. The preceding analysis identifies the
   dominant causes accurately.
2. **The work blocks the browser's main thread.** `setTimeout(..., 0)` only gives the
   browser one opportunity to paint the busy label. Once the callback starts,
   `runeAdvice` occupies the main thread until the whole account is complete. This is a
   separate architectural problem, not merely another arithmetic optimisation.

The preceding analysis is therefore directionally right, but its statement that the
calculation is slow for “one reason” is too narrow. The engine can be made much faster
and the page should still use a worker, because a large account or many user presets
can make an exact calculation long again.

My overall judgement is:

| Area | Independent judgement |
| --- | --- |
| Exact event model | Keep. It follows the current calculation contract. |
| Arithmetic hot-path findings in §4.1–§4.5 | Agree, subject to the numerical caveats in §9.7. |
| Demand memoisation and duplicate-judge finding in §4.6 | Agree; extend it to a more explicit slot-local architecture. |
| Worker recommendation in §6.1 | Strongly agree; it addresses the browser failure mode directly. |
| Ignored “include” settings in §6.2 | Agree as a correctness defect; it is not a semantics-preserving optimisation. |
| “The surrounding architecture is sound” | Agree only for the domain boundary; qualify it for the execution architecture. |
| Build-family enumeration | Replace or bypass for this page; the current page has already proved that the other build dimensions are irrelevant to one rune. |
| Full-distribution caching for slider changes | Defer. It can be useful for a different interaction contract, but it is not the first fix. |

### 9.3 The actual execution pipeline

The calculation is easier to reason about when its stages are separated:

| Stage | What it does now | Structural observation |
| --- | --- | --- |
| Input preparation | Reads every imported rune, all presets and one reference line per preset type. | Cheap compared with scoring. The two “include” settings are not applied here. |
| Preset preparation | Builds every slot-2/4/6 main-stat Cartesian combination for every preset. | More structure than this page needs; only one current-slot-compatible representative is later used per rune. |
| Deterministic candidate pass | For each rune and preset, calculates craft projection, demand, remaining events and the best reachable fill, with chance disabled. | Necessary information, but several pieces are repeated in the second pass. |
| Candidate ordering | Sorts discounted candidate values and preserves a fallback candidate. | Correctly cannot choose by Max value alone because chance is a separate gate. |
| Probability pass | Re-runs the candidate model with chance enabled for candidates that may matter. | Correctly ordered after the value gate, but repeats deterministic work. |
| Global allocation | Builds quotas, scans eligible runes per preset, sorts each preset's candidates and assigns each rune once. | Correct, but currently scan-heavy. It is not the primary timeout source at the shipped preset count. |
| UI materialisation | Creates one result row per imported rune and then filters and sorts in React. | Cheap compared with `runeAdvice`; post-calculation filters must remain post-calculation because they do not define the score. |

This decomposition matters because “calculate recommendations” is not one indivisible
operation. It contains reusable invariants, candidate-local arithmetic, threshold-
dependent probability and a global allocation. Treating all four as one function makes
it difficult to remove repeated work without accidentally changing policy.

### 9.4 What is structurally correct

The following decisions should be protected:

1. **The model/policy boundary is valuable.** `rune-cleanup-model.ts` answers what a
   rune can become; `rune-cleanup-advice.ts` decides what the account should do with
   that result. Replacing this with a single large policy function would make numerical
   regression testing harder.
2. **The value gate precedes the chance gate.** A candidate that cannot reach the
   quality floor must not be rescued by a chance calculation, and a candidate with a
   high Max value must not win merely because it has a low chance. The current candidate
   loop preserves that distinction.
3. **Allocation is global.** A post-hoc “best preset per rune” result would not honour
   `runeShare`, finite capacity or the narrow-pool-first rule. This is why simply
   parallelising each preset independently would be wrong: the probability stage can be
   independent, but the final assignment is not.
4. **The calculation is independent of table filters.** Set, slot, location, search and
   verdict filters narrow the displayed rows after calculation. Using those filters as a
   hidden calculation scope would change quota allocation and make the same account
   produce a different answer merely because the user was looking at a filtered table.
5. **The exact probability engine is the right abstraction.** The problem is the
   implementation cost of its state representation and repeated setup, not the fact
   that it is exact.

### 9.5 Additional structural finding: the page does not need build combinations

This is the most important architectural addition to the preceding analysis.

`presetBuilds()` creates the Cartesian family of slot-2, slot-4 and slot-6 main-stat
choices. `runeAdvice()` then immediately chooses one member with:

```text
find(candidate => candidate.mains[rune.slot] === rune.mainStatId)
```

For slots 1, 3 and 5 it accepts the first member because the main stat is fixed. The
selected `build` is passed to `judgeAgainstBuild()`. Within that function, the only
build-dependent values that can affect this rune are:

- the main stat in the rune's own slot;
- the rank of that same slot's main-stat choice.

`buildDemand()` does construct all six slot entries, but `judgeAgainstBuild()` reads only
the entry at `rune.slot`. The other five `shares` and `ceilings` are discarded. The
current contract also says that a target is a direction rather than a per-rune quota,
so another slot cannot cap this rune's contribution. No cross-slot optimisation is
being performed by the current page after the representative has been selected.

That means the page's effective candidate is not a whole build. It is a
`preset × rune-slot × compatible-main-stat` candidate with a set rank and a main rank.
The Cartesian build family is useful vocabulary for the preset editor and for generic
tests, but it is unnecessary input to this page's scoring loop.

**Recommendation:** introduce a slot-local candidate or demand representation for
Rune Clean-up. Precompute, per preset and relevant slot/main choice:

```text
{
  mainStatId,
  mainRank,
  relevantShares,
  legalCeiling
}
```

Then let the page judge a rune against that representation. `presetBuilds()` can remain
for code that genuinely needs complete builds, including the independent calibration
fixtures, but Rune Clean-up should not build or search the unused dimensions.

**Why the result is preserved:** this is not a heuristic. For the current call graph,
the result is a function of `rune.slot`, the compatible `mainStatId`, the slot's main
rank, the preset targets, the reference line and the craft settings. The unused main
choices in other slots never enter `slotShares`, `ceiling`, `projectedSupply`,
`bestReachableFill`, `rank` or `reachChance`. Replacing the family with the values that
are actually read is therefore a projection of the existing calculation, not a new
scoring rule.

**Boundary:** this proof stops being valid if the product later adds a six-rune budget,
cross-slot target allocation, set-completion coupling or another rule in which a
different slot's main choice affects the value of this rune. Such a rule would have to
be added to `RUNE-CLEANUP-MATH.md` first; the slot-local optimisation must then be
reconsidered.

This goes further than the preceding document's current compromise of keeping one
representative build. The compromise already prevents repeated probability work, but it
still leaves an unnecessarily complicated model boundary and the cost of constructing
all the discarded combinations.

### 9.6 Additional structural finding: make the repeated state explicit

The first and second calls to `judgeAgainstBuild()` do not ask entirely different
questions. The second call asks for one additional result — the chance — using the same
rune, preset, slot demand, credit assumptions and projected current state.

The current shape recomputes:

- demand and the legal ceiling;
- the projected Gem/Grindstone supply;
- remaining additions and upgrade events;
- the deterministic best reachable fill;
- the compatible-line and branch setup leading into `reachChance()`.

The preceding analysis identifies this in §4.6c. I recommend making it a first-class
calculation context rather than merely adding another cache around the existing public
function. A suitable conceptual split is:

```text
prepareRuneCandidate(rune, slotCandidate, reference, credit)
  -> { supply, ceiling, maxFill, events, probabilityShape }

chanceFromPreparedCandidate(context, threshold)
  -> exact probability
```

The context should live only for one `runeAdvice()` call unless a stable, validated
cache key is deliberately designed. Presets are user-editable, reference lines depend
on the imported account, and a preset id alone is not a safe cache key.

**Why the result is preserved:** the context contains values already computed by the
current implementation. The policy still passes the candidate-specific threshold to
the chance function, and the candidate ordering, fallback, rank discount, chance gate
and global allocation remain unchanged. The only removed operation is recomputation of
the same pure intermediate state.

### 9.7 Additional safe short-circuits inside the current contract

These are smaller than the convolution changes but are worth recording because they
follow directly from the documented rules.

#### 9.7.1 Maxed runes have deterministic chance

`remainingEvents()` returns no additions and no rolls once the rune has no events left.
`reachChance()` then returns either `1` or `0` after comparing the current fill with the
requested fill. The current code still enters the second judging call and the chance
function, even though no probability distribution can be needed.

After the deterministic context has been prepared, the chance for a maxed rune can be
answered from the same internal fill comparison that `reachChance()` uses. The test must
retain the existing `1e-12` comparison, because substituting an unrelated comparison
against a clamped display value could change a boundary result.

**Safe conclusion:** this removes a probability-engine call, not a game event. It does
not change the displayed `Already there`/`Below the floor` policy or the exact internal
threshold comparison.

#### 9.7.2 No-credit settings need no craft search

When both credited craft actions are absent, `projectedSupply()` evaluates the original
properties and later evaluates the same original properties again when returning the
winner. A direct `supplyOf()` path is sufficient. If only one credit is present, the
same principle can retain the winning supply map instead of recalculating it at return.

This is safe because no legal Gem or Grindstone action exists in the first case, and the
winner in the second case is already selected by the existing exact comparison. It is a
small allocation reduction, not a change to the craft policy.

#### 9.7.3 Empty target vocabularies should be rejected before rune iteration

`buildDemand()` eventually returns a zero ceiling for a preset with no relevant target
stat. Such a preset cannot produce a usable candidate for any rune. It can be marked
inactive once per calculation instead of being sent through every rune/preset pair.

The output contract must still decide whether an entirely empty preset is shown as
inactive or retained as a named, zero-value fallback. The expensive model call itself
is not needed either way; if the fallback label is retained, it can be represented by a
cheap zero candidate with the same deterministic tie order.

#### 9.7.4 Broken-worth zero can avoid arithmetic, with a fallback caveat

At the “No” Broken-runes setting, a broken candidate's discounted value is exactly zero
and it can never clear the value gate. It still may be needed as the named fallback that
the current policy displays when no preferred or acceptable candidate exists. Therefore
the safe optimisation is to create a zero-valued placeholder in the original preset
order, not to drop the candidate blindly. It must not invoke probability or craft logic.

This is a good example of why an optimisation must be checked against the complete row
contract, not just against whether the candidate can receive a Keep verdict.

### 9.8 Critical qualification of the proposed probability optimisations

I agree with the preceding document that §4.1, §4.2, §4.4 and §4.5 are structurally
sound, provided their stated guards are kept. I agree with §4.3 at the mathematical
level, but not with describing it as unconditionally output-identical.

#### Decimal key replacement

`Math.round(value * 1e12) / 1e12` is an appropriate candidate for replacing
`Number(value.toFixed(12))`, and the reported measurements are persuasive. It is not a
formal proof that the two JavaScript operations are identical for every possible IEEE
double: their decimal and binary rounding paths are different at exact tie cases.

The correct acceptance criterion is therefore the one the preceding analysis already
uses in practice: compare all public fields over adversarial fixtures, keep the
1e-12/epsilon pairing, and run the calibration oracle. Do not lower the precision just
because a coarser key looks faster.

#### Lower-tail pruning

The lower-tail mirror of the existing upper cap is exact only when the floor is derived
from the maximum contribution of all terms that remain after the current convolution
step. The maximum must use the same stat id, star class, roll kind and reference base as
the actual line distributions. The floor is a property of a branch state; it must not be
baked into the module-global line-distribution cache.

With that condition, a discarded state has zero probability of reaching the requested
threshold and the optimisation is safe. The implementation should retain the same
epsilon convention on both sides of the boundary.

#### Tail lookup for the final term

The identity

```text
P(X + Y >= g) = sum over x of P(X = x) * P(Y >= g - x)
```

is exact and is a strong optimisation. However, changing from a full convolution to a
suffix lookup changes floating-point summation order. The preceding analysis observed a
maximum chance delta in the order of 1e-13 and one exact-half-percent display boundary
that moved by one displayed percentage point because the true probability was exactly
7/8 and one summation order landed on either side of the binary rounding point.

That is mathematically insignificant but is still a user-visible output difference.
There are two honest choices:

1. Define the contract as semantic probability equality within a stated numerical
   tolerance, and add boundary tests so this is documented rather than accidental; or
2. Preserve the old summation order or introduce a deterministic display-rounding rule
   that makes exact-boundary presentation independent of summation order.

The tail lookup should not be described as “no output can move” unless one of those
choices is made. It is exact in the probability model, but JavaScript floating-point
execution is not associative.

#### Branch aggregation

Combining branches with the same canonical term list is safe when the key includes every
term attribute that affects the distribution: stat id, count and initial-versus-upgrade
kind. The branch weight may then be summed before the common function is evaluated. It
is not safe to key only by target stat, because HP flat and HP percent are distinct game
effect ids and have different legal ranges.

### 9.9 A further exact option for `bestReachableFill`

The preceding analysis concentrates on the probability engine, which is correct because
that is where most time goes. There is nevertheless a second exact optimisation worth
considering after the hot path is fixed.

`bestReachableFill()` enumerates every legal combination of added stat ids and, for each
combination, finds the strongest upgrade line. Under the current contract there is no
per-stat quota: all future upgrades may go to the strongest held or newly added line.
For a fixed number of additions, the objective has the form:

```text
sum(initial maximum of each chosen added line)
  + number of future upgrades × maximum upgrade value among held and added lines
```

The maximum can therefore be found by considering the possible identity of the
strongest upgrade line and selecting the best initial-value companions below that
identity, rather than enumerating every combination. A prefix/suffix ranking structure
over legal added ids can produce the same maximum with far fewer allocations.

I do **not** recommend making this the first change. The current combination enumeration
is small and transparent, while a closed form is more sensitive to ties, missing ranges,
slot legality and the distinction between target stats and effect ids. It is an exact
candidate, not a licence to replace the function by “take the top stats” without a proof.
If pursued, compare the complete `maxValue` field over generated runes including:

- zero, one, two, three and four additions;
- no future rolls and rolls left after additions;
- HP flat alongside HP percent;
- Ancient and ordinary ranges;
- a held line that is stronger than every addable line;
- equal maximums with different initial values.

### 9.10 Global allocation is correct but can be indexed

The allocation stage is not the current hotspot at eight presets, but its shape is worth
fixing if the product is expected to support many user presets. The current code scans
`pending` inside the `activePresets` test, scans it again for `totalEligible`, scans it
again in the allocation-order comparator, and scans it once per preset to build and sort
candidate lists.

An exact alternative is to build an index while each pending item is produced:

```text
preset id -> eligible pending items
```

Then compute each capacity once, sort the same candidate list with the same priority,
chance and rune-id tie-breakers, and remove assigned rune ids from later lists. The
largest-remainder quotas and scarce-preset-first order must remain exactly as they are.
This changes data access, not allocation policy.

The same principle applies to the preceding document's §4.8a: precompute each
preset's capacity once rather than scanning `pending` from inside a sort comparator.
That finding is low priority today but becomes relevant if the preset count is no
longer small.

### 9.11 The ignored input-scope settings are a correctness issue first

The Settings panel labels two checkboxes **Runes to include**:

- `includeLevel12Runes`;
- `includeEquippedRunes`.

They are present in the validated preferences contract and default settings, but
`runeAdvice()` receives all runes and never reads either value. The table's
`showEquipped`/`showStored` controls are separate post-calculation filters, and both are
on by default. Consequently the settings tell the user that the calculation scope has
changed when it has not.

This violates the intended meaning of an input control even when it does not cause the
timeout. It also matters for performance: equipped runes can be a large fraction of an
account, while maxed runes with no craft credit have little probability work left.

**Recommendation:** settle the product contract before treating these as an optimisation:

- If the checkboxes define the population to judge, apply them before `runeAdvice()` and
  make the result and counts reflect that population.
- If they are meant only to control table visibility, remove or rename them so they no
  longer claim to define calculation scope.

Wiring them into the calculation deliberately changes the result, and that is correct
when it follows the user's explicit scope choice. It must not be presented as a
semantics-preserving speed improvement. In particular, excluding equipped runes changes
finite preset allocation because the eligible pool and quotas are global.

### 9.12 Worker architecture and result identity

The project already has a worker pattern in `app/lib/compute/artifact-score-client.ts`
and `artifact-score-worker.ts`. Rune Clean-up's input is structurally cloneable: runes,
presets, settings and a `Map` of reference lines are plain data. The same pattern can
host `runeAdvice()` without changing its arithmetic.

The worker design should include three safeguards:

1. **Request identity:** a result must carry a request id and the component must commit
   only the latest request. A slow result from an earlier settings state must never
   replace a newer table.
2. **Explicit error state:** worker failure must leave the old result visible or show a
   clear calculation error; it must not silently fall back to an empty table.
3. **Optional cancellation:** cancellation is useful when the user changes a preset or
   imports another account. It is a responsiveness feature, not a mathematical
   shortcut. A cancelled calculation must not be treated as a completed calculation.

The worker alone does not lower CPU time. Its value is that exact work can continue
without making the browser appear hung. It should therefore be implemented independently
of the arithmetic changes, and both layers should be tested.

### 9.13 Recommendations by priority and by semantic risk

| Priority | Action | Expected semantic effect | Recommendation |
| --- | --- | --- | --- |
| P0 | Move Rune Clean-up calculation to a worker. | None; same function and inputs. | Do independently and early. |
| P0 | Apply §4.1 decimal-key, §4.2 floor, §4.3 tail lookup, §4.4 term ordering and §4.5 branch sharing as separate measured changes. | None at the model level; §4.3 needs a display-boundary decision. | Agree, with the caveats in §9.8. |
| P1 | Replace page-level Cartesian build enumeration with slot-local candidates. | None under the current no-cross-slot-cap contract. | Strongly recommend; this is the main architectural simplification. |
| P1 | Return or memoise a prepared candidate context between Max and Chance passes. | None; removes pure recomputation. | Recommend before adding broad caches. |
| P1 | Add exact maxed-rune, no-credit and empty-target short-circuits. | None if fallback ordering and boundary epsilon are preserved. | Recommend and test adversarially. |
| P1 | Wire or remove the two “include” settings. | Deliberate result change if wired. | Resolve as a correctness task, separately from speed-only work. |
| P2 | Precompute demand, capacities, allocation indexes and stable cache keys. | None. | Recommend after the main hot path is fixed. |
| P3 | Closed-form `bestReachableFill` or a full threshold-independent distribution. | Potentially none, but proof burden is higher. | Consider only if the optimised exact engine is still too slow. |
| Reject | Monte Carlo, normal approximation or a coarse integer grid. | Changes the model guarantee. | Do not adopt for the current contract. |

### 9.14 Required equivalence proof for future implementation work

The claim “this is faster without changing the outcome” should be made field by field,
not only by checking whether the page still looks plausible. For every optimisation,
capture and compare the old and new result for every rune:

- verdict;
- reason text;
- selected preset id;
- rank;
- `maxValue`;
- `chance`;
- allocation assignment and quota counts.

The fixture matrix should include:

- no runes, no presets and a preset with no positive targets;
- every rune already at +12 or above;
- runes at +0, +3, +6 and +9 with zero through four existing sub-properties;
- ordinary 4★/5★/6★ and Ancient 6★;
- no craft credit, one credit, maximum credits and already Gemmed/ground lines;
- flat HP/ATK/DEF beside their percent counterparts;
- incompatible slot mains, broken-worth zero, and exact quality/chance boundaries;
- duplicate candidate term lists reached through different branch labels;
- several presets with identical candidates and several with disjoint candidates.

For the probability tail optimisation, compare both the internal numeric field and the
rendered percentage. If the internal field is allowed a tolerance, state that tolerance
in the contract and add a test for the exact-half boundary identified in §5. A green
calibration result alone is not sufficient to prove that a refactor preserved every
displayed row.

### 9.15 Final reconciliation

I agree with the preceding document's central recommendation: optimise the exact
probability engine rather than replacing it, and use the existing calibration oracle as
the gate. I also agree that the calculation should be moved off the main thread.

The additions in this review change the emphasis in three ways:

1. The browser timeout is a scheduling failure as well as an algorithmic cost; a worker
   remains justified after the arithmetic speed-up.
2. The page-level build family is more general than the page's actual data dependency.
   A slot-local candidate model is a cleaner architecture and removes a source of
   accidental future coupling.
3. Some proposed transformations are mathematically exact but not necessarily
   bit-for-bit or display-for-display identical because floating-point addition is not
   associative. That difference must be stated and tested rather than hidden behind the
   word “exact”.

The strongest implementation sequence is therefore: worker boundary, measured exact
hot-path changes, slot-local candidate/context refactor, safe deterministic short-cuts,
then the explicitly separate input-scope correction and lower-priority allocation
tidying. None of those recommendations requires Monte Carlo or a weaker definition of
what a Rune Clean-up answer means.

---

## 10. Final conclusion: the contested and uncertain points, settled

**Added:** 18 September 2026, after the independent review in §9.

§9 is a good review. It is right about the two most important things — that the timeout
has a scheduling cause as well as an arithmetic one, and that "exact in the probability
model" and "identical in IEEE-754 execution" are not the same claim. It is also right to
refuse a proof that was not offered.

This section closes every point where §1–8 and §9 disagree, or where either left a
question open. Each was settled by running something, not by preferring one document's
judgement to the other's. Three of the eleven resolutions go against §1–8; two go against
§9; one finds a pre-existing defect that neither document saw and that changes what §9.5
is allowed to claim.

### 10.1 The worker: §9 is right, and here is the number that decides it

**Disputed:** §0 says the calculation is slow "for one reason". §9.2 calls that too
narrow and makes the worker P0; §7 had it at step 6.

**Settled by measurement.** The optimised engine, scaled to the largest account this
product can plausibly meet:

| Box | Presets | Optimised `runeAdvice` |
| ---: | ---: | ---: |
| 1,200 | 8 | 514 ms |
| 3,000 | 8 | 877 ms |
| 3,000 | 24 | 1,920 ms |
| 3,000 | 40 | 2,976 ms |

Three seconds of blocked main thread in Node — and a browser on ordinary hardware will be
slower. That is not a hung page, but it is a frozen one, and it is more than enough to
justify the worker on its own merits.

**Conclusion: §9 is right that the worker is necessary and that it is not merely another
optimisation.** I disagree only on sequencing, and only mildly. A worker applied to the
unoptimised engine converts a 75-second freeze into a 75-second wait; the user is still
waiting 75 seconds. The arithmetic is what makes the feature usable; the worker is what
makes it well-behaved. **Do the arithmetic first, the worker immediately after, and treat
neither as finishing the job alone.** They touch disjoint files, so if two sessions are
available they can proceed in parallel.

One correction to §0 for the record: "slow for one reason" is accurate about *where the
CPU time goes* and wrong as a description of the user-visible failure. §9.2's two-cause
framing is the better one.

### 10.2 The moved display boundary: settled, and it goes the other way

**Disputed:** §5 recorded that one printed percentage moved and called it a display
question. §9.8 said the tail lookup must not be described as output-identical until the
project chooses between stating a tolerance or preserving the old summation order.

**Settled by measurement.** Four independent summation orders were run against the same
population (300 runes, seed 12345), for the one row that moved:

| Summation order | `chance` | Printed |
| --- | --- | --- |
| Baseline, plain | `0.8749999999999999` | 87 % |
| Baseline, compensated (Kahan–Neumaier) | `0.8749999999999999` | 87 % |
| Reordered engine, float keys | `0.875` | 88 % |
| Reordered engine, integer keys | `0.875` | 88 % |

Two facts follow. First, the true value is 7⁄8 to within a demonstrated ulp on every
ordering tried, and the reordered engine lands on it exactly. `Math.round(0.875 × 100)`
is 88, so **88 % is the correct display and the baseline is the one printing the wrong
number.** Second, applying compensated summation to the *baseline's* branch accumulation
does not move it at all — which localises the baseline's missing ulp to the accumulation
inside `convolveDistribution` itself, precisely the step the tail lookup removes.

**Conclusion: §9.8 is right to demand the choice and wrong to assume which way it falls.
The tail lookup removes a source of error rather than introducing one.** Of §9.8's two
options, take the first — state a numerical tolerance in the contract and add a boundary
test. **Reject the second option explicitly:** preserving the old summation order would
preserve a known one-ulp error in order to protect a display value that is wrong.

This is not a licence to be careless. The honest statement of what is preserved is in
§10.11, and it is narrower than "nothing changes".

### 10.3 The key function: §9.8's objection is correct, and both proposals should be dropped

**Disputed:** §4.1 proposed `Math.round(v * 1e12) / 1e12` and called it bit-identical on
the evidence of ~2,500 runes. §9.8 said that is a measurement, not a proof, because
decimal and binary rounding differ at ties.

**Settled by measurement.** The two functions were compared over 2 million samples per
magnitude band:

| Value range | Disagree | Largest disagreement | Against the 1e-12 epsilon |
| --- | ---: | ---: | --- |
| [0, 1) | 0.0000 % | 0 | safe |
| **[0, 8)** | **0.0764 %** | **1.0 × 10⁻¹²** | **equal to it** |
| [0, 32) | 0.1242 % | 1.0 × 10⁻¹² | equal to it |
| [0, 1024) | 4.1179 % | 1.0 × 10⁻¹² | equal to it |

A slot ceiling is bounded by nine max rolls, so [0, 8) is the operative band. The two
forms disagree there on roughly one value in 1,300, by one unit in the twelfth decimal —
which is exactly the tolerance the engine compares with. **§9.8 is right. §4.1's claim of
identity was over-stated, and my evidence could not have detected the gap it left.**

**Conclusion: drop both proposals and key on the integer instead.**

```ts
/** Contributions are held as whole units of 1e-12 max rolls. */
const SCALE = 1e12;
const probabilityKey = (value: number): number => Math.round(value * SCALE);
/* `gain + 1e-12 >= gap` becomes `gainKey >= gapKey`: the same one-unit slack,
   folded into the target once instead of re-applied at every comparison. */
const targetKey = (value: number): number => Math.round(value * SCALE) - 1;
```

This is strictly better than either proposal, for three reasons that are not about speed:

1. **The convolution becomes exact.** Keys are integers, so `a + b` is exact and
   `convolveDistribution` needs no rounding in its inner loop at all — the cap becomes a
   plain comparison. Quantisation happens once, when a single roll's contribution is first
   converted, instead of accumulating at every step.
2. **The epsilon leaves the hot comparison.** `gain + 1e-12 >= gap` becomes an integer
   `>=`. The precision of the key and the tolerance of the comparison can no longer drift
   apart, which was the failure mode §4.1 warned about and could not rule out.
3. Integer map keys are at least as fast as double keys.

**Measured:** identical speed to the float-key variant (135–248 ms at 300–400 runes
against a 10–17 s baseline), no verdict or preset differences on any seed, and the
calibration oracle at `--runes=500 --share-runes=300 --rollouts=800 --variant-runes=20`
produced **byte-identical output** to the unmodified model. It also lands on the correct
side of the boundary in §10.2.

The maximum safe magnitude is worth recording beside the constant: at scale 1e12 the
representable range runs to about 9,007 max rolls before integers stop being exact. A slot
ceiling is under ten. There are three orders of magnitude of headroom, and an assertion in
a test costs nothing.

### 10.4 §9.5's slot-local refactor rests on a false premise — and uncovers a real defect

This is the most consequential correction in this section, and it goes against §9.

§9.5 argues that Rune Clean-up does not need `presetBuilds`' Cartesian family, because only
the rune's own slot is ever read. **That part is correct**, and I verified it:
`judgeAgainstBuild` reads `mainOfSlot(build, rune.slot)`, `shares.get(rune.slot)`,
`ceilings.get(rune.slot)` and `build.ranks[rune.slot]`, and nothing else build-dependent.
`buildDemand` has no other caller in `app/`, `scripts/` or `tests/`.

But §9.5 then concludes that replacing the family "is therefore a projection of the
existing calculation, not a new scoring rule". **That is false, because the existing
calculation is not one calculation. Two layers currently disagree about what an unstated
preset slot means, and the disagreement is user-visible.**

`presetBuilds` emits `mains = 0, rank = 'broken'` for a slot the preset says nothing about,
and its own comment states the intent plainly:

> *"A slot the preset says nothing about accepts every main the slot allows, at the broken
> rank. Refusing to build any combination at all would make a preset with one unstated slot
> judge nothing, which is not what leaving it blank means."*

`judgeAgainstBuild` honours that: its guard carries an explicit
`&& build.mains[rune.slot] !== 0` so an unstated slot is not refused.

`runeAdvice`'s build finder does not:

```ts
return candidate.mains[rune.slot] === rune.mainStatId;   // 0 === 4 → false
```

**Demonstrated.** A preset stating slot 4 and slot 6 and leaving slot 2 blank, against a
perfect +12 Violent ATK% slot-2 rune:

```text
presetBuilds      -> 1 build, mains {2:0, 4:10, 6:4}, ranks {2:broken, ...}
runeAdvice's find -> undefined                 => the preset is skipped entirely
judgeAgainstBuild -> maxValue 1.0000, chance 1.0000, rank broken
page reports      -> sell, "No preset can use it", preset null, maxValue 0

same preset with slot 2 stated as Atk%
page reports      -> keep, "Already there", preset named, maxValue 1, rank preferred
```

So a rune the preset wants is reported as unusable by any preset, purely because the user
left one slot blank — which is exactly the outcome `presetBuilds`' comment says must not
happen, and exactly the invisible failure `AGENTS.md` §0.1 forbids. Two places state the
intent; one place silently contradicts it, so the build finder is the defect.

**Three conclusions follow, and they change §9.5's plan rather than rejecting it:**

1. **The slot-local refactor is right in principle and must not be done first.** The defect
   has to be decided and fixed while the two behaviours are still visible side by side. A
   refactor that collapses them will silently canonise whichever one the author happened to
   reimplement.
2. **The refactor cannot be gated by byte-identical calibration output.** Every shipped
   preset states all three slots, which is why the oracle is silent here. The gate for this
   change must be a fixture with an unstated slot, written first.
3. **A hard constraint §9 did not note:** `scripts/verify-rune-cleanup-calibration.mjs`
   imports `presetBuilds` and calls `judgeAgainstBuild(rune, preset, build, base, threshold,
   credit, withChance)` directly. Both exports must survive the refactor with their current
   signatures. If the independent oracle has to be rewritten in the same commit as the model
   it checks, it has stopped being independent and the project has lost its gate for the
   whole of §4.

### 10.5 §9.7.1's saving does not exist

**§9.7.1** proposes short-circuiting the chance for maxed runes, on the grounds that the
code "still enters the second judging call and the chance function, even though no
probability distribution can be needed."

**Settled by the counters.** Across the instrumented population, `reachEarlyZero` is **0** —
the `adds + rolls === 0` return is never reached. A rune with no events left has
`best === have`, so either `judgeAgainstBuild`'s `best + 1e-12 >= wanted` guard rejects it
before `reachChance` is called at all, or `gap <= 0` and it returns 1 on the first line. No
distribution is ever built for a maxed rune today.

**Conclusion: the probability saving §9.7.1 describes is already realised.** What remains is
the *deterministic* recomputation — demand, craft projection, best reachable fill — which is
§4.6c and §9.6's subject, not a probability short-circuit. Fold §9.7.1 into the
prepared-context work and do not schedule it separately; implemented on its own it would add
a branch that can never be taken.

### 10.6 §9.9's closed-form `bestReachableFill`: close it rather than defer it

§9.9 proposes an exact closed form and says not to do it first. Agreed, and I would go
further so that a future reader does not reopen it without cause.

**Measured:** after §10.3 and §4.2–§4.5, `bestReachableFill` is **2.0 % of self time**. The
theoretical maximum win is therefore two per cent of a half-second calculation, in exchange
for a function that §9.9's own fixture list shows is delicate about ties, missing ranges,
slot legality and the effect-id/target-stat distinction.

**Conclusion: do not implement.** Record the 2.0 % so the trade is visible. Revisit only if
a future profile shows it above roughly 15 %, which would mean something else changed.

### 10.7 §9.7.4 broken-worth zero: agreed, with one refinement

§9.7.4 is right that a broken candidate at the "No" stop can still be needed as the named
fallback, and right that the safe form is a zero placeholder rather than dropping it.

Two refinements from reading the row contract:

- The placeholder's displayed Max value is genuinely `0`, not merely unknown. The table
  prints `advice.maxValue`, which carries the rank discount, and the discount is zero. So a
  zero placeholder is display-correct and no model call is needed to produce it.
- "In the original preset order" is right for a reason §9.7.4 does not give:
  `candidates.sort((l, r) => r.value - l.value)` is stable in every engine this project
  targets, and candidates are pushed in preset order, so equal values keep preset order
  today. A placeholder must preserve that, and a test should pin it, because it is currently
  an emergent property rather than a stated rule.

### 10.8 §9.7.3 empty-target presets: agreed, and safe for allocation too

§9.7.3 is right, and the allocation concern it raises resolves cleanly. A preset with no
positive target yields a zero ceiling, so `judgeAgainstBuild` returns `null`, so it produces
no candidates, so it never enters `activePresets` and never takes a quota. Marking it
inactive once per calculation reaches the same state by a cheaper route.

### 10.9 §9.10 and §4.8a allocation indexing: agreed, and confirmed low priority

No disagreement. The measurement that sets the priority: at 3,000 runes and 40 presets —
five times the shipped preset count — the *entire* optimised calculation is 2,976 ms.
Allocation is a fraction of that. Do it for the sake of not having an O(N) scan inside a
sort comparator, which is a defect of form, not because it is on the critical path.

### 10.10 §9.11 and §6.2, the ignored settings: agreed, with §9's addition accepted

Both documents reach the same conclusion. §9.11 adds one thing §6.2 missed and it is
important: because quotas are global and largest-remainder, excluding equipped runes changes
the allocation for the runes that remain, not merely the size of the table. That makes it
unambiguously a product decision rather than a filter, and confirms it must not travel in
the same commit as any speed work.

### 10.11 What is actually preserved — the honest statement

§9.15 is right that "exact" has been doing too much work. The precise claim, after
everything above:

**Preserved exactly, and verified field by field over roughly 2,500 runes across four seeds
and four craft-credit settings:** every verdict, every chosen preset, every rank, and every
`maxValue` — bit-identical.

**Preserved to within 5.7 × 10⁻¹³:** `chance`. The difference is floating-point summation
order. Where it was resolvable, the new value was the more accurate one (§10.2).

**Not preserved, and deliberately so:** one printed percentage in one population, at a value
of exactly 7⁄8, where the new engine prints the correct 88 % and the current engine prints
87 %.

**Not claimed at all:** bit-stability against a future refactor. Nothing the product promises
requires it. The Math page's claim is *"this is counted exactly rather than guessed at or
simulated. The same rune always prints the same number"* — a promise of exactness and
determinism within a version, both of which survive. It does not promise that two versions
of JASWA print the same number, and it should not be read as if it did.

**The contract obligation this creates:** `RUNE-CLEANUP-MATH.md` §6 should gain one sentence
stating the numerical tolerance on `chance` and the boundary behaviour, and §9 of that
document requires it in the same commit as the change. Drafted:

> *Chance is computed in whole units of 10⁻¹² max rolls. Summation order is an
> implementation detail and is not part of the contract; two implementations of this model
> agree on chance to within 10⁻⁹. Where a chance falls exactly on a display rounding
> boundary, the printed percentage follows from the computed value and is not separately
> pinned.*

---

## 11. Implementation plan

> **Qualified by §13.4, and reported against in §14.** §13.1 states that "**§11 is not
> approved verbatim**". Two of its instructions were superseded before implementation began:
> Stage 1's step 6 asks for a *test* where §12.2 and §13.3 both require a **runtime guard**,
> and Stage 8 presents two alternatives where §13.3 settles on one. Its ordering is also
> superseded — §13.4 Phase 1 puts Stages 8 and 9 **before** the performance work, not after.
> §14.1 maps these stages onto §13.4's phases and says which ones landed.

Twelve stages. Each states its files, its acceptance gate, what it is allowed to change and
what it must not. Stages 1–4 are the ones that fix the reported problem; everything after is
either architecture or a separate product decision.

Two stages require a human decision before any code is written: **Stage 8** and **Stage 9**.
Neither is a performance question.

### Stage 0 — Build the gate before touching anything

Nothing in §4 or §10 may be committed until this exists, because the existing calibration
script checks the *model against a simulation* and does not check *this build against the
previous one*.

**Deliverable:** `scripts/verify-rune-cleanup-equivalence.mjs`, wired as
`npm run verify:rune-cleanup-equivalence`.

It generates a fixed, seeded population, runs `runeAdvice`, and writes one record per rune
with every public field: `verdict`, `reason`, `preset?.id`, `rank`, `maxValue`, `chance`,
plus the per-preset assignment counts and quotas. Given a previously written baseline file it
diffs the two and reports, per field, the count of differences and the largest numeric delta.
It should fail on any difference in `verdict`, `reason`, `preset.id`, `rank` or `maxValue`,
and on a `chance` delta above a stated tolerance.

The population must cover the matrix §9.14 lists. That list is good and is adopted wholesale;
add two cases it does not name, both of which this analysis needed:

- a preset with **one slot left unstated** (Stage 8's subject — the current build finder and
  `judgeAgainstBuild` disagree about it, so it must be pinned before anything is refactored);
- a rune whose chance lands on an **exact display boundary**, to pin §10.2.

**Also capture, as files under `work/`:** the current output of

```
node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs \
  scripts/verify-rune-cleanup-calibration.mjs \
  --runes=500 --share-runes=300 --rollouts=800 --variant-runes=20
```

This run is byte-reproducible and is the gate for Stages 1–3.

**Acceptance:** the script runs green against an unmodified tree and its own baseline.

---

### Stage 1 — Integer probability keys

**Implements §10.3. Supersedes §4.1 — do not implement §4.1.**
**File:** `app/lib/rune-cleanup-model.ts` only.

1. Replace `probabilityKey` with `Math.round(value * SCALE)`, `SCALE = 1e12`, and add
   `targetKey(value) = Math.round(value * SCALE) - 1`.
2. `convolveDistribution` now sums integer keys: replace `probabilityKey(Math.min(cap, a + b))`
   with `sum < cap ? sum : cap`. No rounding in the inner loop.
3. `lineDistribution` keys its single-roll map with `probabilityKey(inMaxRolls(...))` — one
   quantisation per distinct roll value, as now.
4. In `reachChance`, keep the value-space `gap` for the `gap <= 0` early return and derive the
   key-space target once: `const gapKey = targetKey(wanted - have)`. Convert
   `minimumGain`/`maximumGain` to key space by scaling each term's range ends, and drop the
   `+ 1e-12` from the two prunes and from the tail comparison — they are integer comparisons
   now.
5. `judgeAgainstBuild`'s `best + 1e-12 >= wanted` guard stays in value space and is **not**
   touched. It is a different comparison against a different quantity.
6. Write the precision contract in a comment beside `SCALE`: the key scale, the folded
   one-unit slack in `targetKey`, and the ~9,007 max-roll exactness ceiling. Add a test
   asserting a slot ceiling stays far below it.

**Must not change:** `lineDistributionCache`'s key (it is correct), any exported signature,
anything in `rune-cleanup-advice.ts`.

**Acceptance:** Stage 0 equivalence green with zero differences in every field including
`chance`; calibration output byte-identical to the Stage 0 capture.
**Measured effect at this point:** roughly 3.5× on its own.

---

### Stage 2 — Lower-tail floor

**Implements §4.2.** **File:** `app/lib/rune-cleanup-model.ts` only.

1. Add a `floor` parameter to `convolveDistribution`, defaulting to
   `Number.NEGATIVE_INFINITY`, and `continue` on `sum < floor`.
2. In the branch loop, compute each term's maximum gain in key space, build a suffix array of
   remaining maxima, and pass `gapKey - remainingMax[at + 1]` as the floor before convolving
   term `at`.

**The condition §9.8 requires, restated as an implementation rule:** the remaining maximum
must be derived from the same `statId`, `stars`, roll `kind` and reference base as the
distribution it bounds. It is a property of one branch state and **must never be stored in
`lineDistributionCache`**, which is shared across branches, presets and runes.

**Acceptance:** Stage 0 equivalence green, zero differences in every field; calibration
byte-identical.
**Measured effect:** roughly 2.5× on its own; largest intermediate distribution 51,454 →
4,561 entries.

---

### Stage 3 — Tail lookup, term ordering and branch grouping

**Implements §4.3, §4.4 and §4.5. The one substantial piece of surgery.** These three
interlock and should land together: §4.4 is what makes §4.3 pay, and §4.5 is what gives §4.4
a place to sort.

**File:** `app/lib/rune-cleanup-model.ts` only.

1. **Group first.** Build each branch's term list, sort it canonically, key it on
   `statId:count:kind` per term — **not** on target stat, for the reason §9.8 gives: HP flat
   and HP percent are distinct effect ids with different ranges — and accumulate branch
   weights into a `Map` before any distribution work.
2. **Then order.** Inside the per-branch evaluation, order terms by support width ascending
   (`count × (range.maximum − range.minimum)`), so the widest is last.
3. **Then look up.** Convolve terms 1…n−1 with the Stage 2 floor. For the last term, take a
   sorted-values + suffix-mass view and accumulate `Σ P(a) × P(last ≥ gapKey − a)` by binary
   search.
4. Cache the sorted view in a `WeakMap` keyed on the `Distribution` object from
   `lineDistribution`. It needs no invalidation rule of its own because it is derived from an
   already-correctly-keyed cache entry.

**Two traps, both hit during this analysis:**

- Sorting the terms by `statId` for the grouping key and then convolving in that order made
  the run **three times slower** than size order. Keep the grouping key and the convolution
  order separate; the key is for identity, the order is for cost.
- The one-unit slack must be in `gapKey` (Stage 1), not re-applied inside the tail lookup.

**Acceptance:** Stage 0 equivalence green on `verdict`, `reason`, `preset.id`, `rank` and
`maxValue` with zero differences; `chance` within 1 × 10⁻⁹; the exact-boundary fixture
asserting the value from §10.2. Calibration output byte-identical.

**Note on the gate:** the calibration output was byte-identical in every run of this
combination, but §10.11 is the claim being made, not byte-stability. If a future seed produces
a printed-percent difference at another exact boundary, check it the way §10.2 was checked —
compensated summation on both sides — before treating it as a regression.

**Measured effect at the end of Stage 3:** 75,617 ms → ~500 ms at 1,200 runes × 8 presets;
2,976 ms at 3,000 runes × 40 presets.

---

### Stage 4 — Checkpoint

Run the full suite before going further:

```
npm run verify:rune-cleanup-equivalence
npm run verify:rune-cleanup-calibration:large
npx playwright test tests/rune-cleanup-calculation.spec.ts
npm run lint
```

Update `docs/RUNE-CLEANUP-MATH.md` §6 with the tolerance sentence drafted in §10.11, as that
document's own §9 requires, in this commit. **This is the commit that fixes the reported
problem.** Everything after it is improvement.

---

### Stage 5 — Prepared candidate context

**Implements §4.6c and §9.6, and absorbs §9.7.1 (see §10.5).**
**Files:** `app/lib/rune-cleanup-model.ts`, `app/lib/rune-cleanup-advice.ts`.

Split the two questions `judgeAgainstBuild` currently answers twice:

```text
prepareRuneCandidate(rune, preset, build, base, credit)
  -> { supply, slotShares, ceiling, best, mainScale, rank, adds, rolls }

candidateMaxValue(context)            -> number
candidateChance(context, threshold)   -> number
```

**Keep `judgeAgainstBuild` exported with its present signature**, implemented as the two calls
in sequence. This is not politeness to old code: §10.4 established that
`verify-rune-cleanup-calibration.mjs` calls it directly, and if the oracle has to change in
the same commit as the model it checks, the project loses its gate.

The context lives for one `runeAdvice` call. Do not give it a longer-lived cache: presets are
user-editable and reference lines depend on the import, so no stable key exists without
designing one, and §9.6 is right to warn against it.

**Acceptance:** Stage 0 equivalence, zero differences in every field including `chance` — this
stage removes recomputation only and has no numerical excuse.

---

### Stage 6 — Demand memoisation and slot narrowing

**Implements §4.6a, §4.6b, §4.6d and §4.6e.** **File:** `app/lib/rune-cleanup-model.ts`
(and one line in `rune-cleanup-advice.ts`).

1. Narrow `buildDemand` to the one slot that is read. It has no other caller (verified).
2. Memoise it per `(preset.id, the build's main for that slot, slot)` for the call's duration.
3. In `projectedSupply`, build the legal gem/grind candidate list once per rune and score it
   per distinct share set; retain the winning supply map instead of recomputing
   `supplyOf(winner)` at return. When neither credit is present, take the direct path.
4. Hoist `credit` out of the per-rune loop in `rune-cleanup-advice.ts`.

**Acceptance:** Stage 0 equivalence, zero differences in every field.
**Measured effect:** ~6.5 % for the slot narrowing alone; roughly 10 % for the stage.

---

### Stage 7 — Move the calculation into a worker

**Implements §6.1 and §9.12.** Independent of Stages 1–6; may run in parallel.
**Files:** a new `app/lib/compute/rune-advice-client.ts` and
`app/lib/compute/rune-advice-worker.ts`, plus `app/components/rune-recommendations.tsx`.

Follow `app/lib/compute/artifact-score-client.ts` exactly — one worker, a request id, a
promise per call. `runeAdvice`'s inputs and outputs are already structurally cloneable.

Adopt §9.12's three safeguards in full; they are correct and this document had not stated
them:

1. **Request identity.** Commit only the newest request's result. A late result from an
   earlier settings state must never replace a newer table.
2. **Explicit error state.** A worker failure leaves the previous result visible or shows a
   calculation error. It must never fall back to an empty table, which would read as "no runes
   qualify".
3. **Cancellation.** Optional, and explicitly not a mathematical shortcut — a cancelled
   calculation must not be recorded as a completed one.

The existing `window.setTimeout(…, 0)` and the `busy` flag come out. The `ms` figure the page
prints should become the worker's own measured time.

**Acceptance:** Stage 0 equivalence unchanged (the arithmetic is untouched); the Playwright
test passes; the table stays interactive during a 3,000-rune calculation.

---

### Stage 8 — Decide what an unstated preset slot means

**Implements §10.4. A product decision, not a performance change. It changes output.**

**The decision to make:** `presetBuilds`' comment and `judgeAgainstBuild`'s guard both say an
unstated slot accepts every legal main at the broken rank. `runeAdvice`'s build finder says the
preset judges nothing. Two places against one, and the one is silent about it, so the finder is
almost certainly the defect — but this is the user's product call and should be made explicitly
rather than inferred from a comment.

**If the documented behaviour is confirmed:** change the finder in `rune-cleanup-advice.ts` to
accept `candidate.mains[rune.slot] === 0` as well. Runes in that slot then appear against the
preset at broken rank with a real Max value, instead of reporting "No preset can use it".

**If the opposite is chosen:** remove the `!== 0` clause from `judgeAgainstBuild`'s guard and
the `stat: null` branch from `presetBuilds`, and correct that comment. Leaving the
contradiction in place is the one option that should be rejected outright.

**Acceptance:** the unstated-slot fixture added in Stage 0 asserts the chosen behaviour.
Stage 0 equivalence *will* show differences for that fixture and must be re-baselined
deliberately, with the diff reviewed by hand. Note in `RUNE-CLEANUP-MATH.md` §3 which reading
is canonical.

---

### Stage 9 — Decide what the two "include" settings mean

**Implements §6.2 and §9.11. A product decision. It changes output.**

`includeLevel12Runes` and `includeEquippedRunes` are rendered, stored and validated, and read
by nothing.

- **If they define calculation scope:** filter the population before `runeAdvice` and make the
  row count and the status line reflect the judged population, not the imported one.
- **If they were only ever about table visibility:** remove them from the settings panel and
  from `RunePotentialSettings`; the table's own Equipped/Inventory filter already does that job.

Either resolves the parity break. **It must not travel with any speed work**, because excluding
equipped runes changes the global quota allocation for the runes that remain (§10.10) — the
result legitimately changes, and that must be visible in its own commit.

---

### Stage 10 — Slot-local candidate model

**Implements §9.5, constrained by §10.4. Only after Stage 8.**

Replace the page's use of the Cartesian build family with a precomputed, per-preset list of
slot-local candidates:

```text
{ slot, mainStatId, mainRank, relevantShares, legalCeiling }
```

**Keep `presetBuilds` and `judgeAgainstBuild` exported and working** — Stage 5's reason applies
unchanged, and the calibration oracle uses both.

**Why the result is preserved:** §9.5's argument is sound *once Stage 8 has removed the
contradiction*. Only `rune.slot`'s main stat and rank are read, and the current contract's rule
that a target is a direction rather than a per-rune quota is what guarantees no other slot can
cap this rune. §9.5's boundary condition is correct and should be copied into the code as a
comment: **this stops being valid the moment a six-rune budget, cross-slot target allocation or
set-completion coupling is added**, and such a rule would have to enter
`RUNE-CLEANUP-MATH.md` first.

**Acceptance:** Stage 0 equivalence, zero differences in every field, against the
post-Stage-8 baseline.

---

### Stage 11 — Deterministic short-circuits and allocation indexing

**Implements §4.7, §4.8a, §9.7.2, §9.7.3, §9.7.4 and §9.10.** Lowest value; do it for form.

- The `mainScale × worth < qualityBar` pre-gate (§4.7), skipping the chance half only, with the
  fallback caveat that section states.
- Zero placeholders for broken-at-zero candidates, preserving the stable preset-order tie
  break, with a test pinning that order (§10.7).
- Mark zero-ceiling presets inactive once per calculation (§10.8).
- Build a `preset id -> eligible items` index once; compute each capacity once; sort on the
  precomputed key instead of scanning `pending` inside the comparator (§10.9).

**Acceptance:** Stage 0 equivalence, zero differences in every field. §4.7 in particular must be
checked against the *fallback* rows, not only the assigned ones — that is where its argument is
weakest and where it is most likely to be wrong.

---

### Not in the plan, and why

| Proposal | Decision |
| --- | --- |
| Closed-form `bestReachableFill` (§9.9) | **Do not implement.** 2.0 % of a 0.5 s calculation, against a delicate proof (§10.6). |
| Threshold-independent full distribution (§6.4) | **Defer.** In tension with the Stage 2 and 3 prunes that produce most of the win. Revisit only if live sliders become a goal. |
| Coarse integer grid on the currency (§6.5) | **Reject.** Trades a documented contract property for speed the measurements say is not needed. |
| Monte Carlo or normal approximation (§6.5) | **Reject.** The exact engine is what the calibration oracle exists to protect. |
| Preserving the baseline's summation order (§9.8 option 2) | **Reject.** It would preserve a known one-ulp error to protect a display value that is wrong (§10.2). |

### Summary of the sequence

| Stage | Subject | Output changes? | Gate |
| --- | --- | --- | --- |
| 0 | Equivalence harness | — | Runs green on an unmodified tree |
| 1 | Integer keys | No | Equivalence + byte-identical calibration |
| 2 | Lower-tail floor | No | Equivalence + byte-identical calibration |
| 3 | Tail lookup, ordering, grouping | `chance` ≤ 1e⁻⁹; one boundary percent | Equivalence + calibration + boundary fixture |
| 4 | Checkpoint and contract update | — | Full suite |
| 5 | Prepared context | No | Equivalence, zero differences |
| 6 | Demand memoisation | No | Equivalence, zero differences |
| 7 | Worker | No | Playwright; table stays interactive |
| 8 | Unstated slot | **Yes, deliberately** | Fixture; hand-reviewed re-baseline |
| 9 | Include settings | **Yes, deliberately** | Product decision; own commit |
| 10 | Slot-local candidates | No, post-Stage 8 | Equivalence, zero differences |
| 11 | Short-circuits, indexing | No | Equivalence, including fallback rows |

Stages 0–4 turn a 75-second calculation into a half-second one and are the answer to the
question that started this document. Stage 7 is what stops the browser freezing on the largest
accounts. Stages 8 and 9 are correctness debts this investigation uncovered and are the user's
decisions to make.

---

## 12. Interaction with `RUNE-PRESET-MATCH-INVESTIGATION.md`

**Added:** 18 September 2026, after that document appeared in `docs/`.

A separate investigation, `docs/RUNE-PRESET-MATCH-INVESTIGATION.md`, concludes that
`preset.targets` currently acts as a **relevance switch rather than a weight**, that the
five damage-dealer presets therefore produce identical Max values, and that
`RUNE-CLEANUP-MATH.md` §3–§4 has to change before the code can. Its §8.1 asks whether a
target magnitude should become a weight; its §5.5 asks whether `Demand.shares` should stop
carrying a number it never uses.

The two documents do not overlap and neither finding affects the other's evidence. But the
sequencing interaction is real and belongs in this plan.

### 12.1 The two are orthogonal, and this one should go first

Everything in Stages 1–6 operates on whatever `shares` and `gap` it is handed. The key
scale, the lower-tail floor, the tail lookup, the term ordering and the branch grouping are
all statements about *how a sum of independent discrete terms is evaluated*, not about what
the terms mean. Changing `shares` from a set into weighted values changes the numbers fed
in; it does not change the machinery that consumes them.

So the performance work does not constrain the semantics decision, and the semantics
decision does not have to wait for it. Do this one first, for the plain reason that the
other one requires a contract change and a design debate, and this one does not — and
nobody should have to debate preset weighting while the page takes 75 seconds to answer.

### 12.2 One concrete caveat, and Stage 1 is what catches it

If §8.1 of that document is answered by weighting each relevant stat by its raw stated
target, contribution magnitudes stop being bounded by "a few max rolls". A preset stating
`hp: 15042` would, unnormalised, push fill values four orders of magnitude higher.

That matters here specifically because **Stage 1 pins the integer key scale at 1e12, which
is exact only up to about 9,007 max rolls**. Today a slot ceiling is under ten, so there
are three orders of magnitude of headroom. A raw-target weighting would consume all of it
and silently lose precision in the probability keys.

This is not an argument against weighting. It is an argument for two things:

1. **Any weighting must be normalised** — which that document's own §8.1 already identifies
   as the open question, for an independent reason (comparing `hp: 15042` with
   `criDmg: 175` is not meaningful without one).
2. **The assertion required by Stage 1 must be written as a runtime guard, not only a
   test.** If a future contract change pushes fill values past the safe band, that guard is
   what turns a silent precision loss into a loud failure. It is cheap: one comparison per
   `runeAdvice` call against the largest slot ceiling.

### 12.3 What must be re-done if the semantics change

The optimisations survive a semantics change unchanged. The **baselines do not**.

- Stage 0's equivalence baseline and the captured calibration output both encode the
  current scoring, so both must be re-captured after any change to `shares`. The
  equivalence script itself needs no change.
- The boundary fixture from §10.2 is tied to one rune's exact probability. It will move.
  Re-derive it rather than adjusting the expected value to whatever comes out.
- §10.4's unstated-slot fixture is unaffected: it is about main-stat legality, not targets.

### 12.4 One point of agreement worth carrying across

That document's §5.5 — `Demand.shares` carries a number that nothing reads — is the same
observation this document makes from the other side in §4.6a: `buildDemand` computes six
slots and one is read. Both are symptoms of `Demand` being wider than its only consumer.
**Stage 6 should narrow the type as well as the loop.** If the weighting question in §8.1
is later answered "yes", the field comes back deliberately and with a meaning; if it is
answered "no", `ReadonlySet<TargetStat>` is the honest type and the dead number stops
looking like an implemented feature.

---

## 13. Final QA conclusion and approved implementation plan

**Added:** 18 September 2026, as the final quality-assurance pass over §§0–12.
**Purpose:** close the remaining uncertainties and state the implementation plan that this
review approves. Earlier analysis remains in the file for traceability; where this section
qualifies an earlier statement, this section is the final position.

### 13.1 Final conclusion

The investigation has reached a sound conclusion about the reported timeout:

1. The exact discrete probability model is the right model for the current contract. It
   must not be replaced by Monte Carlo, a normal approximation or a coarse currency grid.
2. The dominant cost is in the implementation of the exact model: float-key formatting,
   carrying unreachable distribution mass, materialising a final distribution whose tail
   alone is needed, branch duplication and repeated deterministic setup.
3. The browser failure is a separate execution problem. The current `setTimeout(..., 0)`
   yields once and then blocks the main thread for the complete calculation. A worker is
   required even after the arithmetic has been made fast enough for an ordinary account.
4. The page-level build Cartesian product is wider than the data dependency of the current
   page, but the slot-local refactor must follow an explicit resolution of the existing
   unstated-slot contradiction. It must not be used to hide or accidentally choose between
   two different behaviours.
5. The two “include” settings are a correctness debt, not a free optimisation. Their
   labels say they define calculation scope; if that is confirmed, wiring them will
   deliberately change the population and the global allocation result.
6. The separate preset-match investigation exposes a semantic question about whether
   numeric target magnitudes should influence value. That question is orthogonal to the
   convolution optimisations, but it is a dependency for any permanent narrowing of the
   `Demand` type.

The performance plan is therefore approved in principle, but **§11 is not approved
verbatim**. It needs the amendments in §13.2–§13.6 before implementation begins.

### 13.2 What is evidence, what is proof, and what still needs a gate

The combined document sometimes uses “settled” for three different levels of confidence.
The implementation plan must keep them separate:

| Matter | Final status | Required treatment |
| --- | --- | --- |
| The synchronous main-thread calculation can freeze the page | Directly established by the Calculate handler and the measured timings | Implement the worker independently and test interaction during a large calculation. |
| The exact model/policy/allocation boundaries | Established by source inspection and the binding math document | Preserve them unless a separate product decision changes the contract. |
| The hotspots and the reported speed ratios | Strong measured evidence, but the instrumentation scripts are not committed | Reproduce the profile with a committed or explicitly recorded synthetic harness before using a ratio as an acceptance requirement. |
| Integer key versus decimal-string key | Demonstrated to differ at the 1e-12 unit in the operative range | Treat as a precision/contract decision, not as a proven drop-in replacement. |
| The 7/8 display boundary | Strong evidence that 0.875 is the intended mathematical value, but summation-order agreement is not a formal exact oracle | Add a fixture and make the display policy explicit before accepting a changed printed percentage. |
| Unstated preset slots | A real contradiction in the current code; the intended reading is strongly indicated by `presetBuilds()` and `judgeAgainstBuild()` | Add the fixture first, then adopt the recommended canonical behaviour in §13.3. |
| `includeLevel12Runes` and `includeEquippedRunes` | Directly established as stored/rendered but unused | Resolve as a separate product-contract change. |
| Target magnitudes as weights | Open product semantics, documented by `RUNE-PRESET-MATCH-INVESTIGATION.md` | Do not silently decide it as part of performance work. |

The reported measurements in §10 remain useful and credible, but the absent profiling
harness is a reproducibility gap. A final repository plan should not require a future agent
to trust a measurement that cannot be rerun. The harness may generate synthetic data only;
real account exports must stay outside the repository and be named as a local input in the
verification report.

### 13.3 Definitive resolutions for the remaining design questions

#### Unstated preset slot

The recommended canonical behaviour is:

> A slot omitted from a preset accepts every legal main stat at the `broken` rank.

This is the only reading that is consistent with the existing `presetBuilds()` comment,
the `judgeAgainstBuild()` guard, and the established distinction between “no preference”
and “a preferred or acceptable choice”. It also obeys import parity: a rune must not become
invisible merely because a user left one optional slot blank.

Stage 8 should therefore no longer present two equally weighted alternatives in the
implementation plan. The implementation should:

- add the unstated-slot fixture before changing the finder;
- make `runeAdvice()` select a candidate when the candidate main is `0` as well as when it
  equals the rune main;
- retain the `broken` rank and the existing broken-worth policy;
- update `RUNE-CLEANUP-MATH.md` §3 to make this behaviour binding;
- review the intentional output change: the result becomes a named broken candidate with
  a real Max value instead of “No preset can use it”.

If product intent later rejects this behaviour, the contract must say so and both existing
implementations must be changed together. Leaving the contradiction is not an acceptable
state.

#### Include settings

The recommended reading is that the two settings define the population to judge, because
they are placed under **Runes to include** and are stored as calculation settings. Under
that reading:

- `includeLevel12Runes = false` excludes maxed runes from the calculation population;
- `includeEquippedRunes = false` excludes equipped runes from the calculation population;
- the result count, empty state and calculation status must describe the judged population;
- post-calculation table filters remain presentation filters and cannot reintroduce excluded
  runes.

This must be a separate contract change. It changes global quotas and therefore changes
the verdict of runes that remain in scope. If the product instead wants these controls to
be presentation-only, the correct action is to remove or rename them, not to leave them
unused.

#### Integer probability keys

The integer-key design in §10.3 is a promising implementation, but its description is too
strong. It does not preserve the current floating-point operation exactly: it rounds each
single-roll contribution once and then adds integer keys, whereas the current engine rounds
after intermediate floating-point convolutions. Integer addition is exact **on the chosen
1e-12 lattice**; the lattice itself is still a quantisation of the original values.

Therefore the plan must not say that the convolution becomes exact without qualification,
and Stage 1 must not claim zero `chance` differences merely because a sample passed. Before
implementation, choose one of these explicit contracts:

1. **Keep the current no-grid contract.** Do not use a fixed-scale integer key. Use only
   transformations whose error is bounded and accepted by the existing numeric semantics.
2. **Adopt the 1e-12 representation contract.** Update `RUNE-CLEANUP-MATH.md` §6 first to
   say that probability support is represented on that lattice, define the one-unit target
   slack, define the maximum safe magnitude, and accept a measured `chance` tolerance.

The second option is reasonable because the reported observed differences are far below
the displayed precision and the current code already removes IEEE-754 noise with a decimal
canonicalisation step. It is nevertheless a contract amendment, not a proof that no
outcome can move. The runtime headroom guard belongs in the implementation if this option
is chosen; a test-only guard is not enough for a future weighting change.

#### Display boundary

The evidence supports `0.875` more strongly than the baseline's
`0.8749999999999999`, but the fact that several summation orders agree is not, by itself,
an independent exact proof. The performance plan should make the following distinction:

- the tail identity is mathematically exact;
- floating-point accumulation can change the last bits;
- a displayed percentage is a product-visible value.

The boundary fixture must therefore assert the chosen product policy. The recommended
policy is to use the mathematically supported value and document that summation order is
not a stable cross-version presentation guarantee. If the team instead requires the
speed-only change to preserve every existing printed percentage, that is a valid but
different requirement and the tail implementation must be judged against it. It must not
be silently decided by whichever accumulation order happens to be fastest.

#### Target magnitudes and `Demand`

The performance work may memoise demand and narrow the loop to one slot, but Stage 6 must
not permanently change `ReadonlyMap<TargetStat, number>` to `ReadonlySet<TargetStat>` until
the preset-match investigation has decided whether the numbers become weights. The safe
intermediate shape is a semantically named per-slot demand object whose representation can
carry either a relevance set or normalised weights without another architectural rewrite.

### 13.4 Approved implementation sequence

The following sequence is the final plan. It supersedes conflicting ordering language in
§7 and qualifies §11 where stated.

#### Phase 0 — Freeze the current contract and build the gates

Before changing the calculation, create the equivalence harness described in §11 Stage 0.
It must:

- generate a deterministic synthetic population with the complete edge-case matrix;
- include ordinary 4★/5★/6★, Ancient 6★, all relevant levels, sub-property counts,
  credits, empty targets, incompatible mains and exact display-boundary fixtures;
- include a preset with one unstated slot;
- serialise every public per-rune field plus assignment counts and quotas;
- distinguish `null` preset from a named preset and preserve tie order;
- compare `verdict`, `reason`, `preset.id`, `rank` and `maxValue` exactly;
- compare `chance` under an explicitly named tolerance only where the approved contract
  permits numerical variation;
- fail with a field-level diff, not only a total pass/fail result.

Also record the current calibration output and one real-account timing run outside the
repository. The real run is for scale and browser diagnosis, not a source-controlled
fixture. The synthetic output is the repeatable regression gate.

At this point, add the unstated-slot test and the target-relevance/tie tests from the
preset-match investigation, but do not change their expected behaviour yet. The baseline
must capture what the current page actually does and the contract review must then decide
which differences are intentional.

#### Phase 1 — Resolve contract changes before dependent refactors

Make two short, separately reviewed decisions before any slot-local or type-narrowing
change:

1. Adopt the recommended unstated-slot behaviour and update the math document and fixture.
2. Adopt calculation-scope semantics for the two include settings, or explicitly remove
   them as unused presentation controls.

These changes intentionally alter outputs. They must be isolated from performance commits,
their result diffs must be reviewed, and the new output must become the baseline for later
performance stages.

Resolve the target-magnitude question separately. Until it is resolved, retain a demand
representation that does not falsely promise either weighting or non-weighting.

#### Phase 2 — Implement the exact hot-path changes

Implement the lower-tail floor, branch grouping, support-width ordering and final-term tail
lookup as independently testable changes, even if the source merge groups the closely
related tail/ordering/grouping work. The following conditions are mandatory:

- floor bounds must use the exact same stat id, star class, roll kind and reference base as
  the term distribution they bound;
- floor/cap state must remain branch-local and never enter the shared line-distribution
  cache;
- grouping keys must include `statId`, `count` and `kind`, not only target stat;
- convolution order must be selected for support width, while canonical key order is used
  only for identity;
- tail lookup must apply the approved target slack exactly once;
- a changed displayed boundary must be covered by the explicit display-policy fixture.

For the key representation, use the contract decision from §13.3. If the 1e-12 integer
lattice is approved, implement the integer key as its own measured stage with a runtime
headroom assertion and a chance tolerance. If it is not approved, do not smuggle the
lattice into the convolution merely because it is faster.

After each stage, run the equivalence harness, the independent calibration oracle and the
relevant deterministic tests. Capture a profile so the next stage is justified by actual
remaining cost rather than by the original profile.

#### Phase 3 — Remove repeated deterministic work

Introduce a prepared candidate context that computes the deterministic state once and lets
the Max-value and Chance questions consume it. Preserve `judgeAgainstBuild()` with its
current exported signature as an adapter for the independent oracle and direct tests.

Then memoise demand for the duration of one `runeAdvice()` call, hoist the immutable craft
credit, reuse the winning projected supply map and take the direct no-credit path. Keep
cache keys local to the call unless a complete invalidation contract is designed; preset
ids alone are not enough to identify mutable user data.

Acceptance for this phase is zero difference in every public field, including `chance`,
because the phase removes repeated work but does not intentionally change arithmetic.

#### Phase 4 — Move the calculation to a worker

Use the existing artifact worker pattern, but define the Rune Clean-up protocol separately.
The client/worker boundary must include:

- request ids and latest-request-wins commit logic;
- explicit worker error state that cannot look like an empty result;
- a busy state that survives the asynchronous call without swapping control geometry;
- optional cancellation that cannot be mistaken for a completed calculation;
- worker-side timing reported separately from main-thread result assembly.

Add a browser test with a large synthetic calculation or deterministic mocked worker
fixture that proves the page remains responsive while the calculation is active. The test
must also prove a late result cannot overwrite a newer request.

The worker phase is arithmetic-neutral. Its acceptance gate is the same result as the
pre-worker calculation plus interactive-page behaviour.

#### Phase 5 — Apply the slot-local architecture

Only after the unstated-slot contract is fixed, replace the page's use of the full build
Cartesian product with precomputed slot-local candidates. Preserve `presetBuilds()` and
`judgeAgainstBuild()` for the independent oracle and generic domain tests until an
equivalent replacement has its own independent coverage.

The slot-local candidate must carry the slot's main choice, main rank, relevant demand and
ceiling. The implementation comment must state the proof boundary: this is valid only while
there is no cross-slot target allocation, six-rune budget, or set-completion coupling in
Rune Clean-up.

If target magnitudes later become weights, update the candidate type and ceiling proof at
that time; do not assume a set of relevant stats is still sufficient.

#### Phase 6 — Low-priority exact cleanup

Only after a new profile confirms that the work is worthwhile, implement:

- zero-ceiling preset precomputation;
- broken-worth-zero placeholders with explicit preset-order tie-breaking;
- allocation indexing and precomputed capacities;
- the conservative value-gate precheck, preserving the first fallback candidate's displayed
  Max/chance/reason data.

These changes must be measured separately. Do not implement the closed-form
`bestReachableFill` proposal unless a new profile shows it has become material; the current
evidence places it at about 2 % after the hot-path work.

### 13.5 Verification matrix and release gates

Every implementation phase must pass the smallest relevant checks plus the full definition
of done. For the calculation itself, the gates are:

1. `npm run verify:rune-cleanup-equivalence` against the phase baseline.
2. `npm run verify:rune-cleanup-calibration` and the large calibration run.
3. The focused Rune Clean-up Playwright tests, including empty and populated states.
4. A real-account timing run against `http://localhost:3000/` when the worker or UI flow
   changes; no hosted preview or second server.
5. `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run test:e2e` before the
   final commit.

The equivalence fixture must report separately:

- exact fields: verdict, reason, preset id, rank, Max value and allocation;
- tolerance fields: internal chance, only if the approved math contract permits it;
- rendered fields: the printed percentage and status text, which require an explicit
  boundary policy and may not be hidden inside a numeric tolerance.

The test matrix must include both extremes required by the project rules: an empty account,
empty presets/targets and no credit, plus all supported options selected, long preset
lists, large rune populations, maxed and equipped runes, Ancient runes, full craft credit,
duplicate candidate terms, tied presets and an unstated slot.

### 13.6 Final approval status

The plan is approved subject to these non-negotiable amendments:

- do not describe the fixed-scale integer key as mathematically exact without saying
  “exact on the chosen lattice”;
- do not change the binding math contract implicitly;
- do not make the display-boundary change an accidental consequence of a speed refactor;
- resolve the unstated-slot contradiction before the slot-local refactor;
- keep the target-weighting question separate from demand-type narrowing;
- reproduce or archive the performance evidence before using its numbers as hard gates;
- preserve the independent oracle's public model exports until a replacement has an
  independent gate.

With those amendments, the recommended result is an exact, worker-backed calculation that
retains the current policy and allocation semantics, eliminates the measured waste, and
has an auditable proof boundary for every intentional output change. No implementation is
authorised by this section; it is the quality-assured plan to implement later.

---

## 14. Implementation record

**Added:** 18 September 2026, by the implementer, after the work landed. §13 approved a
plan; this section reports what was actually built against it, what was measured, where
the implementation departed from the approved sequence and why, and what is still open.

**Read this before acting on §0–§13.** Several of their figures did not reproduce, one of
their central claims was never exercised, and the sequence was not followed in the
approved order.

### 14.1 Honest scope: what landed and what did not

§11's twelve stages and §13.4's seven phases describe the same work in two groupings.
Mapped onto §13.4, which is the approved one:

| §13.4 phase | Status | §11 stages |
| --- | --- | --- |
| Phase 0 — Freeze the contract, build the gates | **Done**, with two gaps in 14.4.1 | Stage 0 |
| Phase 1 — Resolve contract changes *before* dependent refactors | **Done, but out of order** — see 14.4.2 | Stages 8, 9 |
| Phase 2 — Exact hot-path changes | **Done** | Stages 1–4 |
| Phase 3 — Remove repeated deterministic work | **Done** | Stages 5, 6 |
| Phase 4 — Worker | **Done** | Stage 7 |
| Phase 5 — Slot-local architecture | **Not done** — see 14.5 | Stage 10 |
| Phase 6 — Low-priority exact cleanup | **One of four items done** — see 14.5 | Stage 11 |

So: **ten of §11's twelve stages landed.** Stage 10 was not started, and of Stage 11 only
the allocation indexing (§4.8a/§9.10) was done. Anyone reading a summary that says "the
plan is implemented" should read that table first.

### 14.2 What was measured

The figures in §0–§13 come from a synthetic box built for the analysis, and §13.2 rightly
flags that its harness was never committed — *"a final repository plan should not require a
future agent to trust a measurement that cannot be rerun."* That gap is now closed: the
figures below come from `scripts/verify-rune-cleanup-equivalence.mjs`, which **is**
committed, is deterministic, and is the gate. 582 runes across eight settings-and-preset
scenarios, one fixed seed, no randomness at run time.

The two populations are not the same, so the per-stage ratios differ from §10's and neither
set contradicts the other. None of §10's ratios were used as an acceptance requirement;
acceptance was always field equality, never speed.

| After | `verify:rune-cleanup-equivalence` | Step | Cumulative |
| --- | ---: | ---: | ---: |
| Baseline (unmodified tree) | 49,739 ms | — | — |
| Stage 1 — integer keys | 10,051 ms | 4.9× | 4.9× |
| Stage 2 — lower-tail floor | 4,563 ms | 2.2× | 10.9× |
| Stage 3 — tail lookup, ordering, grouping | 916 ms | 5.0× | 54× |
| Stage 5 — prepared candidate context | 836 ms | 1.10× | 59× |
| Stage 6 — demand and craft memoisation | 663 ms | 1.26× | **75×** |

Stage 4 is a checkpoint, Stage 7 moves the same arithmetic to another thread, and the
allocation indexing was not separately measurable at eight presets — exactly what §10.9
predicted.

**Equivalence, field by field.** Stages 1, 2, 5 and 6 produced **zero differences in every
field including `chance`**, at a tolerance of zero. Stage 3 reassociates a floating-point
sum and produced differences on `chance` alone: **296 rows, largest |Δ| 1.336 × 10⁻¹³**.
§5's figure was 5.7 × 10⁻¹³ on its own population; the order of magnitude agrees. `verdict`,
`reason`, `preset.id`, `rank` and `maxValue` were bit-identical at every stage.

**The calibration oracle stayed byte-identical at every arithmetic stage**, at
`--runes=500 --share-runes=300 --rollouts=800 --variant-runes=20`. That is stronger than
§11 Stage 3 was willing to promise, and it is recorded as an observation, not as a contract.
§10.11 remains the claim being made.

**In a real browser**, after Stage 7: a 3,000-rune box against the eight shipped presets
finishes in **1,110 ms**, and the page painted **73 animation frames** while it ran.
§10.1's projection for 3,000 × 8 was 877 ms in Node, so the browser is within a quarter
of it.

### 14.3 The §13.3 contract decisions, as actually taken

§13.3 required four questions to be answered explicitly rather than settled by
implementation. They were answered as follows.

**Unstated preset slot — recommended reading adopted.** The user was asked and chose it.
`runeAdvice`'s finder now accepts a candidate main of `0`, the `broken` rank and
broken-worth policy are unchanged, and `RUNE-CLEANUP-MATH.md` §3 makes it binding. The
fixture went into the gate before the finder changed, as §13.3 requires.

**Include settings — calculation-scope semantics adopted.** The user was asked and chose
it. The population is filtered before the engine; the ready count, the empty state and the
status line describe the judged population; the table's Equipped/Inventory filter remains a
presentation filter and cannot reintroduce an excluded rune. `RUNE-CLEANUP-MATH.md` §7
states it. It travelled in its own commit, as §13.3 demands.

**Integer probability keys — option 2 adopted, and initially under-specified.** §13.3 offers
two contracts and says the second requires `RUNE-CLEANUP-MATH.md` §6 to be updated *first*,
defining the lattice, the one-unit target slack and the maximum safe magnitude.

The lattice was implemented and §6 was updated at Stage 4's checkpoint — but **later than
§13.3 asks, and at first it stated only the tolerance**, not the representation, the slack
or the magnitude ceiling. The code comments carried those three; the contract did not, which
is the wrong way round. That has since been corrected: `RUNE-CLEANUP-MATH.md` **§6.1** is now
the representation contract and names all three figures, and §6's old sentence *"convolves
distributions without a rounding grid"* — which the lattice made untrue — has been replaced
rather than left to contradict the code.

§13.3's wording objection was also right and has been applied to the source: the model's
comment now says **exact on this lattice**, and says why that is not the same as exact in
the reals.

**Display boundary — recommended policy adopted, with a stricter gate.** §6.2 of the math
document now says the printed percentage follows from the computed value and that summation
order is not a stable cross-version presentation guarantee. The gate is *stricter* than that
policy on purpose: it treats `reason`, which carries the printed percentage, as an **exact**
field, so a moved boundary always fails and is adjudicated rather than absorbed into a
numeric tolerance. §13.5 requires rendered fields to be reported separately from tolerance
fields; making them exact is the strongest form of that.

**Target magnitudes and `Demand` — left open, as instructed.** §12.4 suggested Stage 6 also
narrow `shares` to `ReadonlySet<TargetStat>`; §13.3 overrides it and forbids that until the
preset-match investigation decides whether the numbers become weights. §13.3 wins, and the
implementation follows it: `Demand` is now a *"semantically named per-slot demand object"*
— `{ shares: ReadonlyMap<TargetStat, number>; ceiling: number }` — whose representation can
carry either a relevance set or normalised weights without another rewrite. The dead number
survives, deliberately, and `RUNE-PRESET-MATCH-INVESTIGATION.md` §5.5 still owns the
question.

### 14.4 Where the implementation departed from the approved plan

#### 14.4.1 Phase 0's gate: two gaps, and three additions

**Gap — quotas are not serialised.** §13.4 Phase 0 asks for *"every public per-rune field
plus assignment counts and quotas"*. The gate records every per-rune field and a per-preset
`(preset, verdict)` assignment count, but not the quota numbers themselves: `runeAdvice`
does not return them, and exporting internal state purely to diff it would have widened the
model's surface for the benefit of a test. The assignment counts are downstream of the
quotas and moved when Stage 8 changed allocation, so the coverage is real — but a quota
change that happened to leave every count identical would not be caught. Recorded as a known
limit rather than papered over.

**Gap — no real-account timing run.** §13.4 Phase 0 and §13.5 gate 4 ask for one, outside
the repository. The browser run used a **synthetic** 3,000-rune account, because no real
export is present and `AGENTS.md` keeps real exports out of the checkout. The scale figure
in §14.2 is therefore synthetic-at-real-size, not real. It should be repeated against a real
account when one is at hand.

**Addition — the display-boundary fixture is detected, not constructed.** §11 Stage 0 asks
for *"a rune whose chance lands on an exact display boundary"*. Constructing one blind means
engineering a rune, preset and threshold whose exact chance is a chosen dyadic rational —
fragile, and pinned to whatever seed produced it. The gate instead scans every scenario for a
chance within 10⁻⁹ of a `k + 0.5` percent boundary and records them. That catches the ones
that exist today *and* any a future change introduces. It worked: the population contains
**six**, including one at exactly **0.875** — §10.2's own value, arrived at independently.

**Addition — the chance tolerance is a flag, defaulting to zero.** §11 asks Stages 1, 2, 5
and 6 for zero differences *including* `chance`, and allows Stage 3 1 × 10⁻⁹. One constant
cannot serve both. `--chance-tolerance` defaults to `0`, so a stage must ask for slack
explicitly, on the command line, where it is visible. Only Stage 3 was run with it.

**Addition — degenerate-input assertions.** No runes; no presets; a preset with no positive
target; neither. `AGENTS.md` §3 requires both extremes of input, and an empty account has one
right answer that cannot drift — so it belongs in an assertion, not in a baseline someone
could re-record.

#### 14.4.2 Phase 1 was done last, not first

**This is the one departure with no good justification, only an explanation.**

§13.4 Phase 1 is explicit: resolve the two contract changes *before* any dependent refactor,
and *"the new output must become the baseline for later performance stages."* The
implementation instead followed §11's stage numbering, which puts them at 8 and 9 — after the
hot path, the context split, the memoisation and the worker. §11 is the superseded ordering;
§13.4 is the approved one, and it was not read closely enough before starting.

What was at risk, and what actually happened:

- **The risk** is that a performance stage silently absorbs part of a contract change,
  because the contract change is measured against a baseline that already contains it.
- **In fact** each contract change still landed in its own commit, was gated on its own, and
  was re-baselined deliberately with the diff read by hand. Stage 8's diff was confined to
  the two scenarios containing a blank-slot preset, changed no verdict, and moved no other
  preset's allocation. Stage 9 does not touch the engine at all — the equivalence gate and
  the calibration oracle were untouched by it, which is the proof that it absorbed nothing.
- **The one real consequence** is that the performance baselines were taken against
  pre-Stage-8 output. They were re-taken after Stage 8, so the tree is now in the state
  Phase 1 would have produced — but it arrived there by a route that made the hand review of
  Stage 8's diff load-bearing, where the approved order would have made it routine.

Phase 5 was correctly *not* attempted before Phase 1, which was the dependency §10.4 and
§13.3 actually cared about. The narrowing that did happen in Stage 6 — six slots to one — is
explicitly permitted by §13.3 (*"may memoise demand and narrow the loop to one slot"*) and is
not the slot-local candidate model.

#### 14.4.3 Stage 1's headroom check is a runtime assertion — as §12.2 required

Worth recording because §11 and §12 disagree and §11 is the one people read.

§11 Stage 1 says *"Add a test asserting a slot ceiling stays far below it."* §12.2 says the
opposite and is right: *"The assertion required by Stage 1 must be written as a runtime
guard, not only a test. If a future contract change pushes fill values past the safe band,
that guard is what turns a silent precision loss into a loud failure."* §13.3 repeats it —
*"a test-only guard is not enough for a future weighting change."*

`reachChance` therefore throws if `gapKey` is not a safe integer. It costs one comparison per
call rather than per cell, cannot go stale, and fails loudly in the sense `AGENTS.md` §0.1
requires. It is still exercised: the equivalence run drives it across 582 runes × 8 scenarios.

#### 14.4.4 Stage 6's memo lifetime is an explicit scope, not a module-global

**§11 said:** memoise *"for the call's duration"*. **§13.4 Phase 3 said:** *"Keep cache keys
local to the call unless a complete invalidation contract is designed; preset ids alone are
not enough to identify mutable user data."*

**What was built:** `RuneAdviceScope`, created by `runeAdvice` and passed down, holding both
the demand memo and the craft line-up memo. `prepareRuneCandidate` takes it as an optional
last parameter and defaults to a fresh one.

**Why.** "The call's duration" has no expression in `rune-cleanup-model.ts`, which does not
know when a calculation begins or ends. A module-global map needs an exported `reset()` every
caller must remember, and the failure when one forgets is a stale figure rather than a crash.
A `WeakMap` on the preset object relies on presets being replaced rather than mutated, which
is true today and is a rule nobody wrote down. An explicit scope makes **the lifetime the
key**, which is what §9.6 and §13.4 were both asking for. The default of a fresh scope means
a lone `judgeAgainstBuild` — from a test, or from the independent oracle — gets no sharing,
which is right for a caller asking one question.

The memo key also carries the reference base line, which §11's proposed key omits.
`slotDemand` reads `base` through `slotCeiling`, and the shipped presets span five families
with five different reference lines, so omitting it would have returned one family's ceiling
for another family's preset.

#### 14.4.5 Stage 6's craft restructure goes one function further than §11

**§11 said:** *"build the legal gem/grind candidate list once per rune and score it per
distinct share set."* **§13.4 Phase 3 said:** *"reuse the winning projected supply map and
take the direct no-credit path."*

**What was built:** the line-ups are **priced into supplies** once per rune, not merely
enumerated. `craftLineUps` returns the supplies; `projectedSupply` only chooses among them.

**Why.** Enumerating once but calling `supplyOf` per preset leaves the larger half of the cost
in place — `supplyOf` walks every line and converts each to max rolls, and depends only on the
rune and the reference base, never on the role. The split the plan identified is real; it
falls one function later than §11 puts it.

**One detail §11 does not mention and an implementer must not lose:** the winner is taken on a
**strict** improvement from an initial best, so **the first line-up wins every tie**. The
flattened list must preserve the original nested iteration order exactly. It does, and the
equivalence gate would have caught it if it did not.

#### 14.4.6 Phase 4 has three files, and cancellation really cancels

**§11 said:** a client and a worker. **What was built:** those plus
`rune-advice-protocol.ts`, because the worker cannot import from the client without pulling
the client's `Worker` construction into the worker bundle. `artifact-score-protocol.ts` exists
for the same reason, so this follows the established shape. §13.4 Phase 4 asks for the
protocol to be *"defined separately"*, so this is compliance rather than departure.

Two refinements to §9.12's safeguards:

- **`superseded` is a third outcome, not a rejected promise.** A calculation the user replaced
  is not a failure, and modelling it as one invites a `catch` that logs an error for something
  working correctly.
- **Superseding and cancelling both terminate the worker** rather than ignoring its result.
  The worker is single-threaded and handles messages in order, so an abandoned calculation
  would otherwise have to run to completion before the request that matters could start.
  §9.12 called cancellation *"a responsiveness feature"*; ignoring a result gives the user
  nothing back, while terminating returns the processor.

**Latest-request-wins lives in the client, not in the page.** §13.4 Phase 4 lists it as a
property of the client/worker boundary, and that is where it belongs: any second caller would
otherwise have to reinvent it, and the failure when one forgets is silent. The first
implementation put it in the component as a ticket `useRef`; that was moved.

#### 14.4.7 Phase 6's allocation indexing was done without a new profile

§13.4 Phase 6 says *"Only after a new profile confirms that the work is worthwhile."* The
allocation indexing was done anyway. The justification is §10.9's, not a measurement: two
full `pending` scans inside a sort comparator are a defect of form, the replacement is
provably order-preserving — the key is a pure function of state the sort does not touch, and
both sorts that read the index end in a rune-id tie-break — and the equivalence gate showed
zero differences. It bought nothing measurable at eight presets, which is what §10.9 said it
would.

### 14.5 What is still open

| Item | Status | Reason |
| --- | --- | --- |
| **Phase 5 / Stage 10** — slot-local candidate model | **Not done** | §10.4 and §13.4 both require it to follow the unstated-slot decision, which landed in the same session. Stage 6's narrowing already removed its measured cost, so what remains is an architecture argument, and it should be made against a tree where Phase 1 has settled. `presetBuilds` and `judgeAgainstBuild` are both still exported with their signatures, so nothing blocks it. |
| **Phase 6** — value-gate precheck (§4.7) | **Not done** | §4.7's own instruction is *"after 4.1–4.5 are in and verified, or not at all"*, and §11 Stage 11 warns it *"must be checked against the fallback rows, not only the assigned ones — that is where its argument is weakest"*. At 663 ms there is nothing left to buy with that risk. |
| **Phase 6** — broken-worth-zero placeholders (§9.7.4, §10.7) | **Not done** | After Stage 6 the arithmetic it avoids is a memo lookup and a line-up score. Its caveat — the candidate may still be the named fallback, in preset order, which is currently an *emergent* property of a stable sort — is more delicate than the saving is large. §10.7 is right that the order must be pinned by a test first. |
| **Phase 6** — zero-ceiling preset precomputation (§9.7.3) | **Subsumed** | Stage 6's memo computes a preset's slot demand once per `(preset, slot, main, base)`, so an empty-target preset costs one zero ceiling per slot for the whole account rather than one per rune. A separate flag would save nothing measurable. |
| §9.9 / §10.6 closed-form `bestReachableFill` | **Not done** | §10.6 prices it at 2.0 % of self time. Unchanged, and §11's *"Not in the plan"* table already rejects it. |
| §6.3 streaming results | **Open, now possible** | §6.3 says *"worth having once the calculation is in a worker, and not before."* The precondition is now met. Not done because 1.1 s does not need progressive rendering. |
| §6.4 threshold-independent full distribution | **Not done** | §6.4 recommends against it, and Stages 2 and 3 strengthened the case: both prunes are threshold-dependent and together they are most of the win. |
| §4.8b bounding `lineDistributionCache` | **Not done, noted** | §4.8b anticipated that §4.3 would add a sorted view per entry. It does, as a `WeakMap` keyed on the distribution object, so the view cannot outlive the entry it derives from and adds no independent growth. The underlying cache is still unbounded over a small key space, which is where §4.8b left it. |
| Target magnitudes as weights | **Open, another document's** | `RUNE-PRESET-MATCH-INVESTIGATION.md` §8.1. §12.2's warning now has a home in the contract: `RUNE-CLEANUP-MATH.md` §6.1 names the 9,007-max-roll ceiling, and the runtime guard is what turns an unnormalised weighting into a loud failure instead of silent precision loss. |

### 14.6 The one claim that was never exercised

§5 records a printed percentage moving from 87 % to 88 % at an exact 7⁄8; §10.2 settles that
the new engine prints the correct one; §10.11 lists it under *"Not preserved, and deliberately
so."*

**In this population it did not happen.** The gate contains six chances sitting on an exact
display boundary — including one at exactly 0.875 — and **all six printed identically before
and after Stage 3**. `reason` had zero differences at every stage.

That neither confirms nor refutes §10.2; it means the phenomenon is population-specific, which
is what one ulp of summation order would predict. §13.2 already grades this matter as *"strong
evidence … but summation-order agreement is not a formal exact oracle"*, and that grading
stands. Two consequences:

- `RUNE-CLEANUP-MATH.md` §6.2's display sentence is a **statement of policy**, not a
  description of something this gate observed. It was right to write it; it is not evidence.
- The gate treats a `reason` difference as a **failure**. If one ever appears, adjudicate it
  the way §10.2 was adjudicated — compensated summation on both sides — before assuming
  either build is right.

### 14.7 One product decision the plan did not notice

§6.2, §9.11, §10.10 and §13.3 all discuss wiring up `includeLevel12Runes` and
`includeEquippedRunes`, and none of them mentions that both were stored **`false`**.

Honouring `false` would have made a first-time user's calculation silently skip their equipped
runes and everything at +12 — for a real account, most of the box, and an import-parity break
under `AGENTS.md` §0.1 on the first press of the button. Both defaults moved to `true`. Nothing
had ever read them, so no behaviour depended on them, and opening included is what makes the
wiring a no-op until the user asks for it.

This is the one product judgement in the implementation that no section authorised. It is
recorded here rather than left in a commit message, because a reader of §6.2 would not
otherwise know the question had been asked.

Stage 9 also went one step past *"the result count, empty state and calculation status must
describe the judged population"*: the status line names how many runes were **left out**. A
rune the settings exclude is a rune no verdict was reached for, and §0.1's third rule is about
exactly that kind of silence.

### 14.8 Verification actually run, against §13.5

| §13.5 gate | Run |
| --- | --- |
| 1 · `verify:rune-cleanup-equivalence` against the phase baseline | Yes, at every stage |
| 2 · `verify:rune-cleanup-calibration` and the large run | Yes — the quick run at every stage, the byte-comparison at `--runes=500 --share-runes=300 --rollouts=800 --variant-runes=20` at every arithmetic stage, and `:large` at the Stage 4 checkpoint |
| 3 · Focused Rune Clean-up Playwright tests, empty and populated | Yes — `rune-cleanup-calculation`, `rune-cleanup-worker`, `rune-cleanup-scope` |
| 4 · A real-account timing run on `http://localhost:3000/` | **Partly** — a synthetic 3,000-rune account in the real browser on the project's own dev server. No real export was available; see 14.4.1 |
| 5 · `tsc --noEmit`, `lint`, `build`, `test:e2e` before the final commit | Yes, plus `test:domain` |

Three tests were added, and each exists because nothing else could have caught its failure:

- `tests/rune-cleanup-worker.spec.ts` counts animation frames during a 3,000-rune
  calculation. Every other Rune Clean-up test would pass just as well with the work back on
  the main thread, because the numbers and the table would be identical.
- The same file proves a superseded calculation resolves `superseded` and cannot commit,
  which §13.4 Phase 4 requires. It drives the client directly, because the page cannot
  currently produce two overlapping requests — the button is disabled while one runs.
- `tests/rune-cleanup-scope.spec.ts` drives the two include settings against the fixture
  account, which happens to be built for exactly this: three inventory runes, two of them at
  +12, and one +15 equipped on a monster.

### 14.9 How to use the gate next time

`npm run verify:rune-cleanup-equivalence` is the check every future change to
`rune-cleanup-model.ts` or `rune-cleanup-advice.ts` should run. Three things about it are
easy to get wrong:

1. **Its baseline lives in `work/`, which is not committed.** That is deliberate — a baseline
   must be captured from a tree you have decided is correct, not inherited from whoever ran
   it last. Capture one with `--write` **before** changing anything, and read the diff
   yourself rather than only the exit code.
2. **A `reason` difference is never a rounding detail.** `reason` carries the printed
   percentage. See §14.6.
3. **A change to preset semantics invalidates the baseline, not the script.** §12.3 is right:
   re-capture rather than adjust an expectation to whatever comes out.

It is deliberately outside `npm test`, because without a baseline it fails, and a check that
fails on a fresh checkout is a check people learn to skip.

`npm run verify:rune-cleanup-calibration` remains the independent oracle and answers the other
question: not *"does this build agree with the last one"* but *"is the model right"*. Both are
needed, and `judgeAgainstBuild` keeps its exported signature — as §11 Stage 5, §13.4 Phase 3
and §13.4 Phase 5 all require — so the oracle never has to be rewritten in the same commit as
the model it checks.

### 14.10 The include settings were removed, the same day they were wired up

§9.11 offered two ways to end the contradiction: define the population with the two
checkboxes, or remove them because they only ever meant presentation. Stage 9 took the
first. The **second** is what the product wanted, and §9.11's own second option is now
the answer: `includeLevel12Runes` and `includeEquippedRunes` are gone from
`RunePotentialSettings`, from the Settings panel and from the page.

What settled it was the first real account to press Calculate after Stage 9. It holds 3,242
runes — 1,686 equipped and 1,556 in the inventory, 2,088 of them at +12 or above. The table
answered for 1,147: the inventory runes below +12, and nothing else. The engine was doing
exactly what the settings said. The settings were the ones §14.7 had just moved to `true`,
but that account's stored preferences predated the move and still held `false` for both —
values written while the checkboxes did nothing at all, which is why nobody had ever chosen
them. Two thirds of a box disappeared from a calculation on the strength of a preference the
user had never made.

The defaults were not the defect and neither was the wiring. The defect was that scope was a
saved setting at all. Every rune the import holds is judged now, always; where a rune sits and
how far it is powered up decide what the table **shows**, through the filter strip that was
already there and already on. That also removes the trap §9.11 named without weighing: preset
quotas are global, so a rune held out of the engine hands its place in a preset's share to the
runes that remain and changes *their* verdicts. A display filter cannot do that. A scope
setting could, and did.

`RUNE-CLEANUP-MATH.md` §7 now states the population rule rather than the settings, and
`tests/rune-cleanup-scope.spec.ts` was rewritten against the same fixture to hold the
distinction: four runes judged including the equipped +15, Settings offering no scope control,
and hiding the equipped rune changing the rows on screen while the judged count stands.

A stored preference the current form no longer defines is left where it lies rather than
migrated — `AGENTS.md` §0 — so the dead keys in an existing preferences document are simply
never read again. Nothing else in that document is disturbed.
