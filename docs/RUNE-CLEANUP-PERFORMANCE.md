# Rune Clean-up — why Calculate is slow, and what to do about it

**Status:** Analysis and proposal. **Not** a binding contract, and it changes no rule.
`docs/RUNE-CLEANUP-MATH.md` remains the calculation contract; nothing proposed here
alters a figure that document defines.
**Reviewed:** 18 September 2026
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
