# Rune percentiles, sampled: the problem and an implementation plan

**Status:** Implemented November 18, 2026. The production contract is
[RUNE-CLEANUP-MATH.md](RUNE-CLEANUP-MATH.md). Measurements and the account
comparison are in [RUNE-PERCENTILE-EVIDENCE.md](RUNE-PERCENTILE-EVIDENCE.md).
**Created:** November 18, 2026. **Decisions approved:** November 18, 2026 (§3.3).
**Scope:** Rune Clean-up, the rune overlay, Rune Simulator and the Statistics box,
which all read `runeAdvice`.

This document is meant to be enough on its own: an experienced developer should be
able to implement the change from it without reading the earlier proposal. Module
and function names refer to the tree at commit `6b7de60`. Since November 22, 2026
the craft credit is the user's (Settings › Gems & Grindstones): `canonicalCraftCredit`
below is now the scope's ruler, `newRuneAdviceScope(settings.craftCredit).ruler`, and
a reference request carries it (`RUNE-CLEANUP-MATH.md` §6).

---

## 1. The problem

### 1.1 What was wanted

The production engine sells runes that are excellent for one use. The cause is its
quality gate: a *Potential* floor (45–85 % of a perfect rune), calibrated per slot
(`RuneFloorCalibration` in `rune-cleanup-advice.ts`). A SPD specialist that is
mediocre against the perfect rune of its build is sold, although very few drops
are as good for that role. The local account had 80 proposed sales with observed SPD
of at least 20.

The idea behind the new model is right and simple:

> For every role/build a rune can serve, ask where the rune stands among all the
> runes the game could have dropped in that slot for that build. Keep it if it is
> in the top X % for **at least one** use.

### 1.2 Why the experimental engine is unusable

The experimental engine (`app/domain/runes/percentile/*`,
`cleanup/rune-percentile-*.ts`) answers that question, but under self-imposed
requirements that the question does not need:

1. **Exact, certified probability.** The reference distribution of a reading is not
   sampled. Every main, rarity, innate, sub-property type and every integer roll
   value is enumerated with rational arithmetic and directed error bounds. Flat HP
   alone has hundreds of values per roll. One reference query took 0.8–2.4 s, and the
   account needed 415–515 of them: 144 s of preparation before a single rune was
   judged.
2. **Exact candidate futures.** The chance is not counted over 4,096 plays as in
   production. Every future of the rune is enumerated with certified bounds. When
   the bounds do not settle within the budget, the answer is "unresolved". 297 of 300
   Statistics paths ended unresolved; one rune took 145 s.
3. **No approximation anywhere.** The proposal forbids score buckets, sampling and
   epsilons (§10.1), so none of the usual shortcuts were open.

The measurements are in `RUNE-PERCENTILE-EVIDENCE.md`. The cost is caused by the
**exactness requirement**, not by the question. The precision buys nothing a player
could act on. The smallest chance gate is 1 %, so a difference between 0.024 % and
0 % never changes a verdict. The game-model assumptions under the reference (rarity
mix, uniform mains, uniform values) are themselves modelled, not measured, so
certifying the fifth decimal of a modelled distribution is false precision.

### 1.3 Why the simple version is fast

Once a reading's reference distribution is known, "top X %" is **one score
cutoff**. Everything after that is what production already does:

- A finished rune (+12 and above): compare its score with the cutoff.
- An unfinished rune: count the share of its 4,096 played-forward runs that reach the
  cutoff — the existing `chanceStep`/`countJobs` machinery, GPU path included.

The reference distribution does not depend on the rune being judged, only on slot,
star class, main and the build's price list. It is computed once and shared.
Sampling it is cheap. Measured on this machine (Node 26, slot 4, six-star, CRI Dmg
main, a broad price list):

| Sample size | Generate bodies | Score all | Sort | 95th percentile |
| ---: | ---: | ---: | ---: | ---: |
| 8,192 | 30 ms | 11 ms | 0.7 ms | 41.16 |
| 65,536 | 138 ms | 51 ms | 4.7 ms | 41.10 |

That is about 0.8 µs per scored body. The cutoff at 8k and 65k samples agrees to
0.15 %.

> **Architecture review — evidence.** The measurements support abandoning the
> certified solver. They do not establish the performance of the replacement.
> The 415–515 references came from interrupted exact-engine scans. The timing
> table covers one broad price list and its 5% tail. The 8,192-body scoring
> rate is about 1.34 µs/body. The quoted 0.8 µs/body comes from the larger
> run. Budget from a full inventory of distinct sampled references and measure
> the 0.55% tail and new candidate workload. Keep a reproducible sampled
> benchmark with the fixture, seed and timed phases.

> **Assessment (Claude).** Agreed. 0.8 µs is the steady state of the larger run;
> the 8,192 run's 1.34 µs includes warm-up. A budget should not rely on the better
> figure. The 415–515 count comes from the exact engine's own grouping and is only an
> order of magnitude for this design. Step 0 should therefore inventory the
> account's distinct `(slot, stars, main, prices)` keys and time full preparation at
> both the 0.55 % and the 20 % tail, with a committed, seeded benchmark script.

---

## 2. The solution in one paragraph

For every reading (role × build × the rune's actual main), draw a fixed,
deterministic sample of 16,384 synthetic drops of that slot, star class and main.
Play each to +12, score it with the reading's price list and the canonical craft
credit, and sort the scores. The reading's requirement "top α" becomes a score
cutoff in that sorted list. A rune passes a reading when its +15 projection clears
the cutoff. An unfinished rune's chance for a reading is counted over its existing
4,096 runs, exactly as now. The verdict uses the chance that **any** permitted reading
clears its cutoff (the union), counted on the same runs. Bodies are shared per
(slot, stars, main), scores per distinct price list, and both are cached across
calls like today's calibration. The fitted slot floors, the 625-cell policy grid,
the ordinary box and the whole exact engine are removed.

> **Architecture review — recommendation.** Adopt the sampled, reading-local
> cutoff and the shared-future union. This preserves specialists, lets finished
> runes use one comparison and avoids certifying a synthetic drop model to
> precision its assumptions cannot justify. A fitted global score would
> sacrifice specialists. Exact enumeration of the reference alone brings back
> the cold bottleneck. A checked-in table cannot serve arbitrary edited
> pricing. Score buckets or a quantile sketch would add an approximation where
> discrete ties and sparse tails matter most. Start with exact order statistics
> of deterministic samples.
>
> Revise the execution architecture before rollout. Build a reference provider
> keyed by numerical reading inputs and batch per-rune chance questions so they
> retain joint outcomes where needed. Let Statistics, Simulator and advice
> lease the same reference work. Prototype those seams and run §7.3 before
> retiring the production engine. Use measured results to decide whether the
> existing card path earns its place for multi-reading questions (§4.5).

> **Assessment (Claude).** Agreed on both halves. Exact order statistics of a fixed
> sample are the right start; buckets would add error exactly where ties and thin
> tails decide verdicts. The execution points are worked out in the reviews of
> §§4.5, 5.1 and 5.5, and I assess them there. Agreed that the performance
> checkpoint must come before the production engine is retired (see Step 3).

---

## 3. Decisions

### 3.1 Kept from `RUNE-PERCENTILE-PROPOSAL.md`

- **Reading-local percentiles** (§5): each reading is ranked against its own
  reference, so adding a role never revokes another role's keep.
- **Union over readings** (§7): a rune passes when the chance that *any* permitted
  reading succeeds meets the Power-up policy. It is counted on shared runs, never by
  summing or assuming independence.
- **Policy stops keep their stored indices** (§6). The quality stops mean
  allowances 20 / 10 / 5 / 2 / 1 %. Accepted, Broken and Intangible multiply the
  allowance (factors in §4.4). Broken = No forbids broken readings.
- **The shared canonical craft** (§4.1, already in production): the reference and
  the candidate are scored by the same `craftedScore` with `canonicalCraftCredit`.
  The reference uses ordinary lineage, the candidate its own.
- **Potential survives as an efficiency figure**, and the *Potential*
  safeguard keeps reading it (§8).
- **Never sell on missing input**: a missing reference base or no usable reading
  gives the existing "No role can use it", never a computed sale from garbage.

### 3.2 Dropped

- Exact enumeration, rational arithmetic, certified bounds and "unresolved"
  states. Every answer is a number; an answer is deterministic because the sample
  and the run streams are fixed.
- The ban on sampling (§10.1, §11 "Monte Carlo remains a validation tool").
- The +0/+3/+6/+9/+12 funnel for Statistics. Statistics keeps its current
  +0/+9/+12 funnel through `runeAdvice` (`RUNE-CLEANUP-MATH.md` §9.5).
- Sensitivity runs as a replacement gate. They can be run later as a script; they
  never block a verdict.

> **Review — uncertainty.** A fixed seed gives reproducibility. At 0.55%, the
> nominal 90 reference hits imply a binomial planning estimate of about 0.058
> percentage points of standard error in tail mass, before stratification or
> ties. At the 1% candidate gate, 4,096 runs give about 41 hits and about 0.155
> percentage points of standard error by the same approximation. One hit can
> change a verdict at any gate. Keep the deterministic point estimate for advice
> and make seed/size sensitivity a release check on changed sales. Describe zero
> hits as zero in the sample. Special handling for near-cutoff sales would be a
> separate product decision.

> **Assessment (Claude).** Agreed; the figures check out
> (√(0.0055 · 0.9945 / 16,384) ≈ 0.058 points, √(0.01 · 0.99 / 4,096) ≈ 0.155
> points). The deterministic point estimate is the right product behaviour. A
> "near the cutoff" band at run time would bring back the unresolved state this plan
> removes. Seed and size sensitivity belongs in release evidence, not in a verdict.

### 3.3 Approved product decisions

These three were open product choices. They were approved on November 18, 2026,
and the rest of this plan assumes them.

> **Reversed November 20, 2026 — decision 1.** The same-main denominator is replaced
> by the whole slot, every main counted (`RUNE-CLEANUP-MATH.md` §9.1). "It needs few"
> confused need with supply: every monster needs one rune per slot, and a wanted
> slot-4 main is an eighth of slot 4's drops. Measured on the shipped roles at *Top 2 %*,
> slots 2, 4 and 6 kept 7.3, 4.2 and 4.6 % of their drops against 13.8–18.7 % in
> slots 1, 3 and 5. The worry below about the loosest stop holds only for a main
> few roles want, and keeps no more of a slot than slot 1 keeps at the same stop.

1. **Denominator: the rune's own slot and main.** A rune is compared with the runes of
   the same slot, star class and main. "Top 5 %" means *better than 95 % of the runes
   of this slot and main for this build*, and it reads the same in every slot.
   This reverses `RUNE-PERCENTILE-PROPOSAL.md` §§1, 3 and 5, which kept every legal
   main of the slot in the denominator. With seven or eight mains in slots 2, 4 and 6,
   that turned "top 5 %" into "top 35–40 % of the runes with this main". At the
   lowest stop (20 %) it would have kept **every** useful rune of a wanted main in an
   even slot (20 % ≥ 1/7). Under the approved rule, a role that needs only one slot-2
   main keeps few slot-2 runes, which is right: it needs few.
2. **Sample size 16,384 per reading.** At the strictest reading (1 % × 0.55 =
   0.55 %) the cutoff still sits among 90 samples. The sample-size sweep in §7.2
   makes the choice verifiable.
3. **Reason strings stay as they are** (`Below the floor`, the printed chance), so no
   repository-wide rename is needed (`AGENTS.md` §7 item 14). The slider keeps its
   name *Rune quality floor* and its stop labels; only the numbers behind the stops
   and their explanations change.

> **Review — denominator.** Keep the approved same-main comparison. Each
> allowance applies within a modelled slot, star class and main, for one
> reading. It provides neither an overall retention quota nor a promise of
> equal supply across slots. State this in the Math explanation. Ancient
> candidates deliberately use their own lineage and an ordinary six-star
> reference (`referenceStars`). Include an Ancient fixture for that asymmetry.

> **Assessment (Claude).** Agreed. Step 5's Math text should say in one sentence that
> an allowance is a share within one slot, star class and main for one build, not a
> keep quota. §7.1 should gain an Ancient fixture: an Ancient body and an ordinary
> body with the same lines read against the same ordinary reference.

---

## 4. The model, precisely

### 4.1 Readings

A reading is one `RuneCandidate` from `prepareRuneCandidate(rune, role, build,
base, canonicalCraftCredit, scope)`, exactly as `runeAdvice` builds them today:
every role with a reference base, every build of `roleBuilds(role)` that accepts
the rune's main, `rank` from `worseRank(set rank, buildRank)`. Nothing about which
readings exist changes.

The reading's **reference key** is

```text
(slot, stars = referenceStars(rune), main = candidate.main, prices = priceList(candidate.valuation))
```

`prices` is a `Float64Array` indexed by stat id. Two builds whose price lists are
equal element by element share one reference. That covers builds differing only in
slots where the role wants nothing, as the ledger already notices.

> **Review — shared pricing seam.** Extract legality, actual-main resolution,
> canonical ruler pricing and the positive slot-ceiling check into one path
> used by `prepareRuneCandidate` and the reference planner. Calling
> `buildPricing` in both places alone can schedule a reference for a build with
> positive weights and a zero slot ceiling. Preserve blank-slot wildcards and
> current set ranking. Keep reading identity (role, build, rank) apart from
> reference identity. Share reference work by price vector and piece. Merge
> chance events only when the scoring, future and event threshold agree, and
> retain the mapping to original readings for Best role and the overlay.

> **Assessment (Claude).** Agreed; this is a real defect in §5.5. As specified there,
> `readingPrices` only prices. `prepareRuneCandidate` also resolves a blank slot to
> the rune's main and rejects a zero ceiling, so a reference could be built for a
> reading that never exists. Replace both with one exported function, for example
> `readingScale(role, build, base, slot, main, stars, scope) → { valuation, prices,
> ceiling, rank } | null`, called by `prepareRuneCandidate` and by the reference
> planner. Chance events may merge only on identical future, scoring and bar, which
> is the ledger's existing rule.

### 4.2 The reference sample

For a key's `(slot, stars, main)`:

- **N = 16,384 bodies**, stratified by rarity on `runeBirthRarityMasses(slot)`.
  Odd slots get 12,288 Hero and 4,096 Legend; even slots get 4,096 Rare, 8,192
  Hero and 4,096 Legend. Stratifying removes the rarity mix from the sampling noise
  at no cost.
- Each body: `generateRuneBody({ setName: null, slot, stars, rarity, mainStatId:
  main, random })`, then `upgradeRuneBody(body, 12, random)`. These are the shared
  generator and schedule, so the reference follows any future correction of the
  game rules automatically. The innate rate (50 %), types and values come from the
  generator.
- `random` is a deterministic xorshift stream seeded from `(slot, stars, main,
  index)` with the avalanche used by `ordinarySampleBirths`. The same key always
  gives the same bodies, in any order and on any thread.
- Bodies are ordinary lineage (`ancient: false`), sets neutral (sets never enter the
  score; `RUNE-CLEANUP-MATH.md` §4.3).

The bodies do not depend on the role, so they are generated once per
`(slot, stars, main)` and packed:

```ts
type ReferenceBodies = {
  readonly slot: number; readonly stars: number; readonly main: number;
  readonly count: number;                 // N
  readonly prefixStatId: Int32Array;      // N, -1 for none
  readonly prefixValue: Int32Array;       // N
  readonly lineCount: Uint8Array;         // N, 0–4 (Rare/Hero bodies end with 4 at +12)
  readonly lines: Int32Array;             // N × 4 × 2: statId, value
};
```

> **Review — sampling contract.** Derive strata from `runeBirthRarityMasses`
> and mains from `slotMainProperties`. Allocate an exact integer count per
> stratum for the supported sizes and reject sizes where the masses cannot be
> represented, unless an allocation rule is documented. Give references a
> seed namespace distinct from Statistics. Parameterize experimental holdout
> seeds. Seed bodies by index within their stratum independently of total size
> so size sweeps can reuse a nested sequence. Exercise independent seeds too.
> Decode packed `-1` to `null` for `gemOptions` and use `runeInnateScore`
> or its shared equivalent. Evaluating `0 * prices[-1]` produces `NaN`.

> **Assessment (Claude).** Agreed on every point. The `-1` → `NaN` case is a genuine
> bug in my sketch. Every current mass divides 16,384 exactly; any other size should
> be rejected. Seeding by index within a stratum makes the 4k/16k/65k sweep compare
> nested samples, which is the right stability question. Independent seeds answer the
> other question, sampling variance, so both are needed. A separate seed namespace
> from Statistics is required; otherwise Statistics' bodies would be the reference's
> own first bodies, and their verdicts would correlate with the ruler.

### 4.3 Scores, cutoff and quality share

For one reference key:

```ts
plan    = craftPlan('standard', canonicalCraftCredit)
options = gemOptions(plan, prices, slot, main, prefixStatId)   // memoised per prefixStatId
score_j = craftedScore(plan, options, prices, lines_j, prefixValue_j * prices[prefixStatId_j], scratch)
scores  = Float64Array of all score_j, sorted ascending
```

`lines_j` are `EndStateLine`s with `grind: 0, gemmed: false`. This is the same call
the candidate side makes through `EndStateScoring`. Candidate and reference therefore
share one kernel, and equal bodies give bit-identical scores.

The sample holds only the reading's own main (decision 3.3.1), so a share of the
sample is a share of the runes the rune is compared with:

```text
tail(u)   = #{ j : scores[j] ≥ u } / N                 // share of same-slot, same-main drops at least as good
quality share of a rune = tail(its +15 projection)      // "Top 3.2 %"
```

A reading with allowance α qualifies a score `u` when `u > 0` and `tail(u) ≤ α`.
With `k = floor(α × N)`:

- `α = 1`: every useful score qualifies → `wanted = Number.MIN_VALUE`.
- otherwise: `tail(u) ≤ α` ⇔ `#{scores ≥ u} ≤ k` ⇔ `u > scores[N − 1 − k]` →
  `wanted = max(nextUp(scores[N − 1 − k]), Number.MIN_VALUE)`.

`wanted` is a raw score bar for the existing `≥` comparisons (`chanceStep`,
`shareReaching`, `countJobs`, the shader). `nextUp(x)` is the next representable
double above `x`. Implement it with a shared `Float64Array`/`BigInt64Array` view: for
finite `x ≥ 0`, add one to the bit pattern; for `x < 0`, `-nextDown(-x)`. Ties are
therefore inclusive in the tail, as the proposal required: a rune whose score only
equals the (k + 1)-th best sample fails, because that sample and the k above it would
make k + 1 runes at least as good.

`count(scores ≥ u)` is `N − lowerBound(scores, u)` by binary search.

> **Review — boundary contract.** The order statistic and inclusive tail are
> correct. Require finite, nonnegative scores and a nonempty sample. Normalize
> signed zero before incrementing the Float64 bit pattern. A nonnegative-only
> successor helper is sufficient here. Compute `k` from exact integer policy
> units (§4.4). Test immediately below, at and above the cutoff with an independent
> literal tail count, including all-equal, all-zero and full-allowance fixtures.
> For kernel equivalence, construct an actual finished rune candidate from a
> reference body and compare its score. Replaying the reference loop tests the
> same integration twice.

> **Assessment (Claude).** Agreed. Scores are nonnegative by construction
> (nonnegative prices and values), so a nonnegative-only `nextUp`, which normalizes
> `-0` and asserts finiteness, is enough. Building a real finished candidate from a
> reference body is a better kernel test than mine, which replayed the same loop.

### 4.4 Allowance of a reading

```ts
const qualityAllowances = [0.20, 0.10, 0.05, 0.02, 0.01];   // runeQuality stop 1–5
const acceptedFactors   = [1.00, 0.95, 0.85, 0.70, 0.55];   // acceptedRunes stop 1–5
const brokenFactors     = [0.90, 0.85, 0.80, 0.65, 0];      // brokenRunes stop 1–5; 0 = forbidden
const intangibleFactors = [1, 1.5, 2, 3.5, 5];              // intangibleRunes stop 1–5

alpha = min(1, qualityAllowance × rankFactor × (isIntangibleRuneSet(rune.setName) ? intangibleFactor : 1))
rankFactor = preferred: 1, acceptable: acceptedFactor, broken: brokenFactor
```

A broken reading at factor 0 is **forbidden**: it takes part in nothing but the
fallback naming of Best role, as now. These arrays replace `qualityThresholds`,
`acceptedWorth`, `brokenWorth` and the advice file's `intangibleFactors`, and they
are plain numbers. `rune-percentile-readings.ts` and its `Rational` copies go away.

> **Review — separate allowance and role weighting.** Encode the multiplicands
> in integer hundredths, multiply, then cap the numerator at the denominator
> (1,000,000 for three factors). Compute `k = floor(N * numerator / denominator)`.
> Use the same ratio for display and policy tests, with no epsilon at equality.
> The merged plan also needs to specify what `mostExpected` discounts and what
> Potential prints. Today both expectation and Potential use rank discounts,
> and Potential feeds the Potential safeguard. Preserve that behaviour
> explicitly using the existing weights (including for the expectation's
> bound), while the new factors govern allowance alone. If the intent is to
> change the role weighting or print undiscounted efficiency, approve that as
> a product change and show its separate impact on Best role and protections.

> **Assessment (Claude).** Agreed, and the second paragraph finds a real omission.
> Today the printed Potential and the Best-role expectation (and its bound) are
> multiplied by `acceptedWorth`/`brokenWorth`. My plan deleted those arrays as if
> they fed only the floor. The new factor tables are numerically identical to them.
> I recommend one table per control, used for two things: the allowance factor, and,
> unchanged, the discount on Potential, expectation and bound. Best role and the
> Potential safeguard then behave as today, and no second product decision is
> needed. Integer arithmetic: factors in hundredths (1.5 → 150), denominator 10⁶,
> `k = floor(N · numerator / denominator)` in integers.

### 4.5 Chance and the union

For each permitted reading `i` with bar `wanted_i`:

```text
C_i = P(craftedScore of a run ≥ wanted_i)                    // existing per-reading chance
U   = P(for some permitted i: craftedScore_i(run) ≥ wanted_i)  // union, same runs
```

- Finished runes (`future.upgrades = 0 && future.additions = 0`): `C_i ∈ {0, 1}` from
  `bestEndState ≥ wanted_i`, and `U = max C_i`.
- Unfinished runes: `C_i` from the existing `chanceStep` (certain no, certain yes, or a
  counting job) through the `ChanceLedger` and the chance counter (CPU or card,
  unchanged). Then:
  - if any `C_i = 1` → `U = 1`;
  - if at most one reading has `C_i > 0` → `U = max C_i`;
  - otherwise `U = countUnion(future, scorings, wanteds)` on the processor, over the
    **same** runs (`playForward(future, chanceRuns)`, same seed). Readings are ordered
    by falling `C_i` so that most runs exit at the first reading.

`max C_i ≤ U ≤ min(1, Σ C_i)` holds by construction because the runs are identical.
Assert it in development builds; it catches a stream drifting between the card and
the processor.

Cost: the union pass scores each run against readings until the first hit, so it
never scores more than the per-reading count already scored. It adds at most one CPU
pass of today's counting cost, and only for runes with two or more live readings.

**Verdict:** a rune is *cleared* when `U ≥ chanceBar` (stops 1 / 5 / 20 / 50 / 80 %,
unchanged). Level rules (`decide`) are unchanged: Power up below +12 and at +13/+14,
Keep at +12/+15, otherwise Sell.

> **Review — count by rune.** A second union pass after marginal counts can
> repeat the expensive work and can exceed the *deduplicated* marginal count
> if the union loops over raw readings. Group jobs by the shared future and
> use one `playForward` per group. Settle proven zeros and ones first. Score
> each live unique scoring once per outcome, comparing it with all relevant
> bars if the same scoring has different bars. Accumulate integer hit counts
> for each event and increment the union count once per outcome with any hit.
> Fan counts back to the ledger's original reading IDs. If any event is
> certainly true, the union is settled, but still count the marginals needed
> for Best role, explanations and protection. A short circuit in the multi-event
> loop is only safe once all requested marginal counts for that run are known.
>
> For initial acceleration, benchmark fused CPU groups against the existing
> GPU marginal count plus CPU union. Route single-event groups through the
> existing acceleration entry point. If multi-event groups need the card to
> meet the gates, return bit-packed hit masks for their events from a batched
> backend, OR the masks and popcount on the processor, and replay any
> ambiguous job entirely on CPU before merging. Chunk buffers within the
> hardware contract. Do not infer a union from marginals. Report CPU/GPU use
> across the counting passes. Test per-run masks or exact hit counts against
> a scalar CPU oracle. The union inequality alone cannot detect different
> streams that coincidentally satisfy the bounds.
>
> Float32 can round `nextUp(cutoff)` back onto the tied score, and
> `Number.MIN_VALUE` packs to zero. The current shader marks near-cutoff
> observations ambiguous and the backend replays those jobs. Verify that on
> the new bars, including exact ties, zero versus positive, both rarity
> schedules and Ancient/crafted cases. Count the replay rate before assuming
> the shader remains a performance win. Compare exact CPU and GPU-with-replay
> outputs and verdicts near every gate, including the 1% protection check.

> **Assessment (Claude).** Agreed; my second pass with early exit was wrong in the
> detail that matters. Best role, the explanation and the safeguard need every
> marginal count. An early exit therefore saves nothing that a fused pass does not
> get for free. Start with the fused processor counter: one `playForward` per
> future, one score per unique scoring per run, compared with every bar of that
> scoring, integer counts per event and for the union. Measure before touching the
> card.
>
> The Float32 point is more serious than stated for full allowance. Once
> `Number.MIN_VALUE` becomes 0 on the card, a zero-score run passes. The
> positive-score guard should not depend on a subnormal. Every positive score is at
> least the reading's smallest positive line price, because values are integers of at
> least 1. Half that price is a bar representable in both precisions. Exact zero
> usefulness should also be settled on the processor before dispatch
> (`reachableCeiling ≤ 0` → 0).

### 4.6 Best role and the printed figures

- **Pool:** if cleared, the readings with `C_i > 0`; otherwise all allowed readings
  (forbidden broken readings only as the last fallback, as now).
- **Choice:** `mostExpected` unchanged, except that the tie-break on `value`
  (standing) becomes "lower `qualityShare` first" (better quality wins).
- **Row figures**, all from the chosen reading except Chance:
  - `maxValue`: Potential (efficiency against the perfect rune), unchanged.
  - `qualityShare`: `tail(best)`, where `best = candidate.best` (the +15 projection
    for a finished rune, the best reachable for an unfinished one).
  - `requirement`: the chosen reading's `alpha`.
  - `chance`: **`U`**, because that is what the gate compared. The printed number
    must clear the stop exactly when the rune does (`runeChanceText` is unchanged).
  - `readingChance`: the chosen reading's own `C_i`, for the *Potential*
    safeguard (§8).

> **Review — explain the same build.** For the role selected as Best, use the
> very same candidate/build in its overlay row. Today's per-role pool prefers
> builds that individually clear beta. When only the union clears beta that
> pool can show a zero-chance build instead of the contributing build marked
> Best. For every other role prefer individually clearing permitted builds,
> then positive-chance permitted builds, then the other permitted builds, and
> finally the forbidden naming fallback. Make the shared final tie-break
> canonical (role ID and slot 2/4/6 mains in a fixed order). Use the chosen
> candidate's individual chance and potential share on its row. Show union
> Chance separately, and distinguish best reachable quality on unfinished
> runes from its likelihood. A sampled chance of zero cannot distinguish an
> unreachable bar from a reachable bar with no hits. For forbidden or
> unavailable readings render absent figures as a dash with the existing
> explanation. Provide an explicit absence state so a real Top 100% remains
> distinguishable from missing input.

> **Assessment (Claude).** Agreed. The overlay's Best row must be the very candidate
> the rune is named for, and the proposed order for the other roles plus a canonical
> tie-break is right. On zero chance: `chanceStep` already settles an unreachable bar
> exactly through `reachableCeiling`. The engine can therefore carry "settled
> impossible" apart from "counted, no hits" at no cost. How a counted zero is
> *printed* can stay as `runeChanceText` prints it today, unless the developer wants a
> different wording. An explicit absence state instead of `qualityShare = 1`:
> agreed, and that replaces the sentinel values in §5.4.

---

## 5. Architecture

### 5.1 New module: `app/domain/runes/cleanup/rune-quality-reference.ts`

The only owner of the reference sample, its scores and the cutoff arithmetic. Pure,
synchronous and thread-agnostic.

```ts
export const referenceSampleSize = 16_384;

export type QualityReference = Readonly<{
  key: string;              // `${slot}|${stars}|${main}|${prices.join(',')}`
  scores: Float64Array;     // ascending, length referenceSampleSize
}>;

export function referenceBodies(slot: number, stars: number, main: number,
  count?: number): ReferenceBodies;
export function referenceScores(bodies: ReferenceBodies, prices: PriceList): Float64Array;
export function qualityShare(reference: QualityReference, score: number): number;   // tail(u)
export function qualityBar(reference: QualityReference, alpha: number): number;     // `wanted`
export function nextUp(value: number): number;

/** One calculation's view of every reference it needs, with the cross-call cache behind it. */
export type QualityReferences = {
  get(slot: number, stars: number, main: number, prices: PriceList): QualityReference;
};
export function qualityReferences(populationKey: string): QualityReferences;
```

**Cache.** Module-level LRU maps, keyed by content, as `calibrations` is today:

- bodies by `${slot}|${stars}|${main}`. They depend on nothing else, so they survive
  role and setting changes. 26 combinations per star class (1 + 7 + 1 + 8 + 1 + 8
  mains) at about 700 KiB each.
- scores by `populationKey + reference key`, where `populationKey` is today's
  `calibrationPopulationKey(roles, base, stars)` (roles and reference stats are what
  the prices derive from).
- Budget: 64 MiB of `Float64Array` scores (128 KiB each → 512 references), evicting
  least recently used. The account needed up to 515 references; the tail beyond the
  budget is recomputed at about 15 ms each.

Settings (stops, policy) are **not** in any key: they only move `alpha` and so
`qualityBar`, which is one array lookup.

> **Review — cache ownership and working sets.** Within a fixed sampler
> configuration, use `(slot, stars, main, prices)` as the sole score key.
> Policy, role order, names, and unrelated roles or reference stats do not
> alter a price vector. Key test samples separately by seed and count, or
> bypass production caching in the harness. Intern the keys per planning
> scope and account for bytes as well as entry count. The proposed 512-entry
> LRU cannot serve a 515-key working set by recomputing only its three-entry
> tail. A repeat in the same order can evict every key before it is reused.
> Pin the prepared references for the current request. Reuse warm entries
> across requests under a measured byte budget. For a request above that
> budget, process key groups in bounded batches, attach the bar and the
> candidate's tail to each reading, then release the arrays. Preserve
> complete progress and results across those batches. Avoid eager eviction
> during adoption and a second pass of lazy regeneration in advice.
>
> Full sorted arrays are a good first representation because the UI needs
> ranks for arbitrary scores and settings can take effect immediately. If the
> measured budget fails, try lossless run-length encoding of equal scores
> with cumulative counts for discrete readings, where that reduces actual
> byte use. A cutoff-only cache is an option only if arbitrary tail queries
> have an explicit path. A shared body is 656 KiB using the listed arrays,
> about 16.7 MiB for 26 mains/slots in one star class. Budget both caches
> across browser threads and pending transfer or clone buffers.

> **Assessment (Claude).** Agreed. A 512-entry LRU scanned in order by a 515-key
> working set is the classic pathology: every access misses. Pinning the current
> request's references and keeping a byte budget only across requests fixes it. The
> score key should be the numerical key alone, as proposed; my `populationKey` prefix
> would have thrown away valid references after any unrelated role edit. 656 KiB per
> body set is the correct figure (I rounded to 700). Full sorted arrays first, with
> run-length encoding only if measurement asks for it: agreed.

### 5.2 `rune-power-up-outcomes.ts`: one addition

```ts
/** The share of runs on which at least one reading reaches its bar. Same runs, same seed as `countJobs`. */
export function countUnion(future: RuneFuture, scorings: readonly EndStateScoring[],
  wanted: readonly number[], runs = chanceRuns): number;
```

The loop is `shareReaching` with an inner loop over readings and `break` on the first
hit. Nothing else in this file changes. The runs, seed, schedule and shader stay as
they are, so `verify:rune-chance-layout` and `verify:rune-chance-card` are untouched.

> **Review — implementation choice.** Put the grouped processor counter and
> optional exact event-mask interface here (see §4.5). Reuse the existing
> line decoder and score kernel. Specify that run count and stream both belong
> to the group, and define zero/one handling before dispatch. Keep the
> single-job count as a reference for tests. An inner loop that separately
> calls `runScore` for each reading re-decodes the same body each time.

> **Assessment (Claude).** Agreed. This is the home of the fused counter from §4.5.
> Decode each run once into the shared line buffer, then score each unique scoring
> once. Keep `countJobs` as the single-event reference the tests compare against.

### 5.3 `rune-cleanup-model.ts`

- `candidateChanceAsk(candidate, threshold)` takes `threshold` in Potential units
  and multiplies by `ceiling`. Change it to take the **raw** bar (`wanted`), because
  cutoffs are raw scores, and drop the `±Infinity` special cases (the caller never
  asks for a forbidden reading). Update `candidateChance` and `judgeAgainstBuild` to
  match. `judgeAgainstBuild` is the oracle's entry point; its callers pass
  `threshold × ceiling`.
- Remove `ordinaryBox`, `OrdinaryBox`, `OrdinaryFamily`, `slotMainFamily`,
  `standingIn`, `boxThreshold`, `boxResolution` and everything only they use, once
  §6 step 4 has removed their last readers. Also remove `RunePercentileModel`,
  `prepareRunePercentileModel` and `runePercentileCraftProjection`.
- Keep `ordinarySample`/`ordinarySamplePaths` (Statistics and scripts use them).

> **Review — preserve the oracle.** Prefer a distinct raw-score entry point
> for the new ask. Keep `judgeAgainstBuild` and fixture-facing
> `candidateChance` in their existing Potential units as narrow wrappers
> through that ask, while the oracle still operates in those units.
> This preserves a check independent of the percentile conversion. If all
> callers are converted to raw units, update their source data and comparisons
> explicitly and show that their expected odds are independent of the new
> scorer. Multiplying a normalized threshold by the ceiling in new advice can
> move it by an ULP and undo the tie rule.

> **Assessment (Claude).** Agreed. Keep `judgeAgainstBuild` and `candidateChance` in
> Potential units for the oracle scripts. Add a separate raw entry point, for example
> `candidateChanceAskAt(candidate, wanted)`, used only by the advice. That keeps the
> independent oracle independent and avoids the ULP round trip through `ceiling`.

### 5.4 `rune-cleanup-advice.ts`

Removed: `RuneFloorCalibration`, `checkpointScores`, `calibrationPieces`,
`countCalibrationPiece`, `adoptCalibrationPopulation`, `calibrationSampleCount`,
`balancePopulations`, `balancedFloors`, `calibrationFor`, `slotFloorMaxValues`,
`qualityThresholds`, `acceptedWorth`, `brokenWorth`, the 600/128 constants and the
grid.

Added: the allowance arrays of §4.4 (exported for the Math page and the overlay),
`readingAllowance(settings, rank, intangible): number | null`, and the reference
plumbing of §5.5.

`runeAdvice` keeps its signature and its three passes:

1. **Certain.** For each rune, build the contenders as today (role × compatible
   build × `prepareRuneCandidate`). For each, compute `alpha`. A forbidden one is kept
   for naming only. Otherwise get `reference = references.get(slot, stars, main,
   scoring.prices)`, `wanted = qualityBar(reference, alpha)` and `qualityShare =
   qualityShare(reference, candidate.best)`. Then add `candidateChanceAsk(candidate,
   wanted)` to the ledger. The ledger's dedupe key is unchanged and still exact,
   because `wanted` is in it.
2. **Left.** `ledger.settle(await count(ledger.jobs(), chanceBar))`, unchanged.
3. **Meaning.** Per rune: the `C_i`, then `U` by §4.5 (calling `countUnion` with the
   rune's `future` and the live readings' `scoring`/`wanted`), then `cleared = U ≥
   chanceBar`, the pool and Best role by §4.6, `decide`, and `withRuneSellProtection`.

The `explain` readings (`RoleReading`) replace `floorShare` and `floorMaxValue` with
`qualityShare`, `requirement` and `chance` (the reading's own `C_i`). `cleared` for a
role means *this reading alone* clears its cutoff with `C_i ≥ chanceBar`. That is
informational; the verdict is the union.

`RuneAdvice` fields: remove `standing`, `floorShare`, `floorMaxValue`; add
`qualityShare: number`, `requirement: number`, `readingChance: number`. Where no role
can use the rune: `qualityShare = 1`, `requirement = 0`, `readingChance = 0`.

> **Review — unavailable versus empty.** The current `decide` emits Sell
> with “No role can use it.” Section 3.1 says to avoid an input-driven sale.
> Define states before implementing the three passes. A configured calculation
> with no permitted useful match can return a policy sale. No roles configured,
> a required reference base missing for a potentially usable role, invalid
> model input, or an incomplete reference/worker result needs an unavailable
> result, outside the actionable Sell list. Use the existing failed/pending
> calculation path for request-level failures and keep the prior completed
> view with its original inputs. A deliberately targetless role adds no event.
> Test the states separately, including Broken = No and an incomplete result
> while another role would otherwise sell the rune. If empty configuration is
> intended to be an actionable sale, resolve that contradiction explicitly
> before implementation. Never encode missing reference work as `C_i = 0`
> or let it trigger a reroll recommendation.

> **Assessment (Claude).** Partly agreed. My §3.1 sentence contradicts `decide`: "No
> role can use it" *is* a Sell, and the sentence must be corrected. Some of the cases
> are, however, already handled before the engine runs. The page refuses to
> calculate without roles or a reference base (`rune-recommendations.tsx:328`,
> `rune-potential-section.tsx`). A rune whose main no configured role uses is an
> intended policy Sell and should stay one.
>
> The real gap is narrower. `runeAdvice` silently skips a single role whose
> reference base is missing (`if (!line) continue`). If that role could have read the
> rune, the rune should be unavailable rather than sold. Incomplete reference or
> worker results belong on the existing request-level failure path. Never encoding
> missing work as `C_i = 0`: agreed.

### 5.5 Threads: the calibration pool becomes the reference pool

Today `rune-calibration-worker.ts` / `rune-calibration-client.ts` count calibration
pieces in parallel, and `rune-advice-worker.ts` adopts them
(`adoptCalibrationPopulation`). Keep that plumbing and change its content:

- **Piece** = `{ slot, stars, main }`. The client derives the pieces from the runes
  being judged: the distinct `(slot, referenceStars(rune), mainStatId)` plus, for
  Statistics, every main of every slot at six stars.
- **Worker work per piece:** `referenceBodies(slot, stars, main)`, then, for every
  role with a reference base and every build that accepts `main` in `slot`,
  `buildPricing` → `prices`, deduplicated by content, and `referenceScores` for each.
  Pricing reuses `prepareRuneCandidate`'s path through a small exported helper
  `readingPrices(role, build, base, slot, main, stars, scope): PriceList | null` in
  `rune-cleanup-model.ts`, so the worker cannot price differently from the advice.
- **Result:** `{ key, scores: Float64Array }[]`, transferred, not copied
  (`postMessage(..., transfer)`).
- **Adoption:** `adoptQualityReferences(populationKey, pieces)` in
  `rune-quality-reference.ts` puts them in the cache. A piece of the wrong shape (length
  ≠ `referenceSampleSize`, unsorted) is refused, as today.
- **Progress:** the status line's calibration fraction becomes "references
  prepared / references needed". The status text and its slot stay as they are
  (`AGENTS.md` §2).

In-process callers (scripts, tests, Simulator without workers) compute missing
references lazily inside `QualityReferences.get`.

Rename the files to `rune-reference-worker.ts` / `rune-reference-client.ts` and the
factory entry in `worker-factories.ts`. Their names are not user-visible.

> **Review — reference requests and lifetime.** Reuse the worker factories,
> bounded scheduling and lease/cancellation pattern. Replace whole-role,
> whole-star cache identity with per-reference keys. Enumerate the exact
> request keys using the shared pricing path before dispatch. If two callers
> overlap, coalesce in-flight keys and lease unfinished work. A cancellation
> releases only that caller's leases, terminates orphaned work and ignores late
> results. A second caller needing more keys must enqueue the missing ones.
> Report completed distinct requested keys over total, including hits, and
> enter rune progress only after preparation. Give the overlay a foreground
> path through the shared worker budget so it cannot queue behind all unrelated
> misses. A worker may generate each piece's bodies once and score its missing
> price vectors in batches to preserve responsiveness.
>
> Prefer one shared authority for cache retention across clients. Worker-to-owner
> transfers detach the sender, so a worker cannot both transfer a buffer and
> retain that buffer in its LRU. Reuse worker-local adopted arrays when available,
> and send only missing keys to a consumer. Explicitly choose which side
> retains a reusable copy, account for any structured clones, and charge pinned
> or in-flight arrays to the memory budget. Adopt only known keys for the active
> request, with correct length, finite nonnegative entries and monotonic order.
> A missing piece may be retried through a bounded worker fallback or reported
> as unavailable. Avoid restarting a valid whole population after one failure.
> Cover reuse after a settings/role edit, simultaneous requests, factory failure,
> cancellation during preparation and late messages after account reset.

> **Assessment (Claude).** Agreed on correctness: coalescing, per-caller leases and
> ignoring late results are needed. On proportion, I suggest the simplest design that
> meets them. One owner on the main thread (the reference client) holds the cache,
> schedules misses on the existing pool and sends arrays to the consuming worker by
> structured clone. `SharedArrayBuffer` is not an option, because the app is not
> cross-origin isolated. A full account's copy is at most about 64 MiB, a cost of tens
> of milliseconds, which the measurement in §7.3 will confirm or refute. A foreground
> lane for the overlay can wait until measurement shows queueing.

### 5.6 Unchanged consumers

`rune-cleanup-statistics.ts`, `rune-simulator.ts`, Gems & Grinds and Rune
Optimization keep their code. The first two read `runeAdvice`; the last two use
`prepareRuneCandidate` with `noCraftCredit` and never read a quality gate.

> **Review — consumer paths.** Keep their decision logic on `runeAdvice`.
> The worker wiring must change. Statistics runs in `rune-statistics-worker.ts`
> with no access to the advice worker's module LRU. Simulator has a separate
> worker, and repeated Statistics slider changes can terminate its worker and
> discard a worker-local cache. Lease the shared provider from their clients,
> pass the prepared view to their workers, and keep the synchronous provider
> for in-process calls only. Statistics can plan keys from its actual synthetic
> bodies, or from all legal six-star mains if measured. Simulator needs its
> configured slot, star/Ancient and main combinations or the actual generated
> set, with one view across checkpoints. Gems & Grinds does read Clean-up
> keepers through `use-rune-keepers.ts`, even though its craft scoring uses
> `noCraftCredit`. Verify that indirect flow and update its progress wording.

> **Assessment (Claude).** Agreed and verified. `rune-statistics-worker.ts` and
> `rune-simulator-worker.ts` exist, and Gems & Grinds reads keepers through
> `use-rune-keepers.ts` (`craft-item-best-use.tsx`). §5.6's "keep their code" is wrong
> for their wiring. Their clients must obtain prepared references from the shared
> owner and pass them to their workers.

---

## 6. Implementation steps

Each step leaves the tree type-checking. Commit when the whole change meets
`AGENTS.md` §7, or per step if a step meets it alone.

**Step 0 — baseline.**
`npm run verify:rune-cleanup-equivalence -- --write` on the current tree. Time
`runeAdvice` on the local account export (`scripts/benchmark-rune-percentile-account.mjs`
can be trimmed to call `runeAdvice` instead) and on Statistics. Record both in
`RUNE-PERCENTILE-EVIDENCE.md`.

**Step 1 — reference module.**
Write `rune-quality-reference.ts` (§5.1) with unit tests in
`rune-quality-reference.test.ts` (vitest, as the percentile tests were run):
- `nextUp`: 0, `Number.MIN_VALUE`, 1, a large value, negatives; `nextUp(x) > x`, and
  nothing lies strictly between them (check via the bit pattern).
- `qualityBar`/`qualityShare` on a hand-made sorted array with ties: `[0, 0, 1, 1, 1,
  2, 3]`, N = 7, for α at, just above and just below `k/N`. A score equal to a tied
  atom has the inclusive tail.
- `α = 1` gives `Number.MIN_VALUE`; a zero score never qualifies.
- Determinism: `referenceBodies` twice gives equal arrays; changing the piece order
  changes nothing.
- Rarity strata sum to N; every body has four lines at +12 for Hero/Legend and Rare.
- A reference scored on one price list, compared with the same bodies scored one by
  one through `craftedScore`, is bit-identical (the shared kernel).

**Step 2 — union counter.**
Add `countUnion` (§5.2). Test on a fixture rune with two readings: equal bars give
`U = C`; disjoint stats give `U = C_1 + C_2` (exact on the same runs); always `max ≤ U
≤ sum`.

**Step 3 — advice.**
Rewrite `runeAdvice` and the policy arrays (§5.4) and change `candidateChanceAsk`
(§5.3). Use `qualityReferences` lazily in-process. Delete the calibration code and
the box diagnostics in the same step; nothing may keep reading them.

> **Review — executable transition.** Step 3 still needs to typecheck with
> older workers and interfaces in the tree. Either land the new path behind
> a temporary internal entry point and switch all consumers together, or move
> dependent field, protocol and test-fixture changes into the same step.
> Shadow-run the baseline and replacement against the same frozen inputs
> before deleting the exact experiment. Keep the funnel verification and
> assert that each original birth has one identity at +0, +9 and +12,
> with only survivors counted. Current Statistics regenerates its checkpoints
> deterministically from the same birth seed. Assert equivalence with
> `ordinarySamplePaths` or consume those paths explicitly. Exercise Simulator
> checkpoint verdicts with the same inputs and craft sequencing.
> Put the real account and Statistics performance checkpoint before Steps 5–6.
> A prototype that drops per-reading details or craft recommendations may
> isolate costs, but it does not qualify against the release gates.

> **Assessment (Claude).** Agreed. I recommend the first option. The new path lands
> beside the old one under an internal entry point (for example `runeAdviceSampled`)
> and is shadow-run against the same frozen inputs. The account and Statistics
> measurements happen there. Only then do all consumers switch in one commit, and
> the old engines are deleted after that. Every commit builds, as `AGENTS.md` §1
> requires.

**Step 4 — threads.**
Convert the calibration pool (§5.5). Keep the rule that all references are ready
before rune progress starts, so the status line never goes back from rune progress to
preparation.

**Step 5 — interface.**
- `rune-overlay.tsx` `Evaluation`:
  - *Selected Rune quality floor* → value `Top 5 %` (the base allowance).
  - *Required Potential for this rune* → label **Required quality for this rune**,
    value `Top 4.25 %` (the chosen reading's α).
  - Add **Quality of this rune**: `Top 3.2 %` (`qualityShare`).
  - Readings table: replace nothing that exists. Add a column **Quality** (`Top x %`)
    after *Match*. Its width is reserved for `Top 100 %` in tabular figures, so a
    value arriving never moves a column (`AGENTS.md` §2).
  - These are new labels, not renames of a label a test addresses. Check
    `tests/rune-overlay.spec.ts:122` and update it to the new facts.
- `rune-cleanup-grid.ts`: add a sortable **Quality** column (`qualityShare`,
  ascending is best) beside *Potential*, hidden by default like *Potential*, with
  the same reserved-width rule.
- **One formatter**, `runeQualityText(share, requirement)`, in
  `rune-cleanup-advice.ts` beside `runeChanceText`. It prints the requirement
  exactly (percent, at most three decimals, trailing zeros trimmed) and the share
  **rounded up** to the same number of decimals, minimum one, and two below 0.1 %.
  Then the printed share is ≤ the printed requirement exactly when the rune passes
  the reading. A share never prints below its last decimal, so a share of 0 (above
  every sample) prints `Top 0.01 %`.
- `the-math-section.tsx`: rewrite the *Rune quality floor* paragraph. Each stop is a
  top share of the runes of the same slot and main for one build; Accepted, Broken
  and Intangible widen or narrow that share; Power-up policy is the chance that any
  role reaches its share. Remove the slot-balance text.
- `rune-potential-section.tsx`: stop labels and the slider name are unchanged. A
  stop's helper text, if it prints a percentage, reads the new allowance array.

> **Review — presentation equality.** Compute the displayed ceiling
> of the sample share from its integer hit count, and the printed requirement
> independently from its exact policy ratio. Use at least one decimal and
> enough decimals to express the requirement exactly. Test just below, at,
> and above a stop, full allowance, zero hits, and the positive-score guard.
> The printed equality claim applies to a usable reading's best score,
> not to beta or the final protected verdict. For zero score under full
> allowance, use the unavailable/zero-usefulness indication instead of
> implying passage by showing two equal percentages. Size the column for
> the maximum supported string (for example `Top 99.999 %`, wider than
> `Top 100 %`), including the pending and unavailable states. Sort by the
> raw share, with missing values last in both directions. Test the union-only
> passing overlay and a role whose displayed build differs from its
> expectation leader. Search for the old accessible label as required by
> AGENTS.md even though the slider itself keeps its name.

> **Assessment (Claude).** Agreed, including a correction of my own decision 3.3.3.
> Replacing *Required Potential for this rune* is a rename of an accessible label, so
> `AGENTS.md` §7 item 14's repository-wide grep applies. Reserving the column for
> `Top 99.999 %` and sorting missing values last: agreed.

**Step 6 — remove the exact engine.**
Delete:
- `app/domain/runes/percentile/` (all files, including `percentile.test.ts`).
- `app/domain/runes/cleanup/rune-percentile-engine.ts`, `rune-percentile-readings.ts`,
  `rune-percentile-statistics.ts`, `rune-percentile-formatting.ts`.
- `scripts/benchmark-rune-percentile-reference.mjs`,
  `verify-rune-percentile-advice.mjs`, `verify-rune-percentile-boundaries.mjs`,
  `verify-rune-percentile-sensitivity.mjs`.
- `package.json`: `verify:rune-percentile`, `verify:rune-percentile-boundaries`,
  `verify:rune-percentile-advice` and their places in `test:domain`.
- `docs/RUNE-PERCENTILE-NUMERICS.md`.

Adjust:
- `rune-birth-model.ts`: masses become plain numbers (`0.75`, `0.25`, …) without
  importing `percentile/probability`.
- `scripts/verify-rune-cleanup-statistics-funnel.mjs`: it imports the experimental
  Statistics. Rewrite it against `calculateRuneCleanupStatistics` (one body through
  +0/+9/+12, each body counted once) or delete it, and remove it from the chain.
- `scripts/verify-rune-craft-lineage-placement.mjs` lines 140–150: test the same
  Improvements projection through `finishedLines`'s path (`craftedLines` with the
  candidate's own `scoring`) instead of `runePercentileCraftProjection`.

> **Review — removal and regression checks.** Audit symbols and imports
> repo-wide. The existing simulator check reads
> `floorMaxValue`. Craft-monotonicity reads `standing`, and several listed
> checks pass normalized thresholds to `candidateChance`. The unbounded
> check searches for the old calibrated-floor formula and the reuse check
> exercises old sharing rules. Update them to protect the replacement
> invariants. Include protocol, factory mocks, Gems & Grinds fixtures,
> accessible labels, and the hardware contract's calibration row. An app
> typecheck alone cannot catch broken script callers.

> **Assessment (Claude).** Agreed and verified. `verify-rune-simulator.mjs` and
> `verify-rune-slot-neutrality.mjs` read `floorMaxValue`. The craft-monotonic check
> reads `standing`. Seven scripts call `candidateChance` or `judgeAgainstBuild`.
> `HARDWARE-ACCELERATION.md` has a calibration row (line 121). These belong in Step 6
> by name.

**Step 7 — checks.** See §7.

**Step 8 — documents.**
- `RUNE-CLEANUP-MATH.md`: §5 calls Potential an efficiency figure that no gate reads
  except the safeguard. §9 and §9.1 state the quality gate of §4 here. §9.4 is
  replaced by the reference sample. §9.7 is removed. §10 gets the new check list.
- `RUNE-CLEANUP-INTERFACE.md`: the overlay facts, the Quality column and the
  formatter.
- `RUNE-PERCENTILE-PROPOSAL.md`: set *Status* to "Superseded by
  `RUNE-PERCENTILE-SAMPLED-PLAN.md` for the computation; §§1, 5–7 policy kept".
- `RUNE-PERCENTILE-EVIDENCE.md`: add the before/after measurements and the
  account's changed-verdict categories.
- `AGENTS.md` §7 item 11: replace the calibration checks with the checks of §7.

---

## 7. Verification

### 7.1 New checks

Add `scripts/verify-rune-quality-reference.mjs` (`verify:rune-quality-reference`,
in `test:domain`):

1. **Reading calibration.** For each shipped role and build in each slot at six
   stars, draw an *independent* sample (another seed, 16,384 bodies). The share that
   qualifies at α ∈ {1, 2, 5, 10, 20} % is within `α ± 4·√(α(1−α)/N)`. This is the
   proposal's "selected mass ≤ allowance", stated with a sampling tolerance.
2. **Specialist preservation.** Over a fixed synthetic population, adding a role to
   the role list never turns a cleared rune into Sell, and never lowers `U`.
3. **Policy monotonicity.** Over the same population, a stricter quality,
   Accepted, Broken or Power-up stop never clears a rune that a more lenient one
   sells (this replaces the grid's inheritance). The existing
   `verify:rune-cleanup-preference-monotonic` holds the whole funnel; keep it.
4. **Union bounds.** `max C_i ≤ U ≤ min(1, Σ C_i)` on every rune of the population.
5. **Body improvement.** Raising one observed sub-property base value never lowers a
   finished rune's `qualityShare` rank under any reading (the shared craft policy's
   monotonicity; the Ancient 26.7 → 26.6 case of the proposal §4.1 is the fixture).
6. **Empty and full input** (`AGENTS.md` §3): no roles → every rune "No role can use
   it", no exception; a role with no positive target → no reading; every stop at
   both extremes; Broken = No; every main of every slot.

> **Review — statistical and structural acceptance.** An inclusive discrete
> tail can undershoot the allowance by a large tie atom. A two-sided interval
> around alpha would fail a correct SPD specialist or a distribution with many
> zeros. For each supported reference, assert that its in-sample qualified
> count is at most `k` and that lowering the bar to the next score atom
> would exceed `k`, except at the positive-score floor. On holdout data use
> a one-sided overshoot check and record the mass of the boundary atom and
> legitimate undershoot. Calibrate the tolerance for both reference and holdout
> variation. For continuous IID planning with equal sample sizes, their
> difference has variance about `2 * alpha * (1 - alpha) / N`. Use repeated
> independent stratified seed pairs for the actual acceptance band. Cover
> the strictest 0.55% case, full allowance, wildcard and specialist builds,
> multiple stars and all legal mains. A small deterministic fixture belongs
> in `test:domain`. Run the full repeated catalogue sweep as release evidence.
>
> For Chance, compare each reading's hit count and the union with a scalar
> oracle on the identical runs. Construct explicit identical, disjoint and
> overlapping hit sequences. Different preferred stats do not guarantee
> disjoint events. Compare integer hits and test beta and the 1% safeguard
> at the adjacent hit counts. For monotonicity use unprotected outcomes
> with the same rune, bodies, runs and original readings. Include Intangible
> as a widening policy and Broken = No as removal of an event. Exercise
> adding, reordering and duplicating an existing reading. When an observed
> finished score improves, the numerical tail should be nonincreasing.
> Check monotonicity through the Ancient/sub-property fixture and compare
> without a rounding tolerance on the discrete tail count.

> **Assessment (Claude).** Agreed. My two-sided `α ± 4σ` test would fail correct
> readings. A SPD-only reading has a large atom at zero and coarse atoms above it, so
> its qualifying share legitimately undershoots α. The in-sample exactness check
> (at most `k`, and the next atom down exceeds `k`) plus a one-sided holdout overshoot
> check is the right acceptance test. Scalar-oracle comparison of integer hit counts:
> agreed.

### 7.2 Existing checks to adapt

| Check | Change |
| --- | --- |
| `verify:rune-slot-neutrality` | Its Potential anchor and floor assertions go. Keep checkpoint identity, empty inputs and rejection of unusable mains. Add: the base allowance means the same share in every slot (from 7.1.1). |
| `verify:rune-slot-policy-matrix` | Replace the 625-cell grid and the χ² floor balance with 7.1.3 over all 625 combinations: structural monotonicity only. |
| `verify:rune-cleanup-calibration` | Keep the independent generator, chance and craft oracles. Drop any assertion on the fitted floor. `judgeAgainstBuild` callers pass raw bars. |
| `verify:rune-chance-stability` | Unchanged in purpose. Add a sweep of `referenceSampleSize` at 4,096 / 16,384 / 65,536: totals by slot, role and rank hold still within the documented band. This is what makes decision 3.3.2 verifiable. |
| `verify:rune-best-role` | Tie-break on `qualityShare` instead of standing. |
| `verify:rune-cleanup-equivalence` | Expected to differ everywhere. Read the diff by category (§7.4) and record a fresh baseline in the commit, as `AGENTS.md` §7 item 11 requires. |
| `verify:rune-substat-weights`, `-set-neutrality`, `-craft-single-source`, `-cleanup-probability`, `-cleanup-craft-monotonic`, `-cleanup-ancient`, `-future-craft`, `-craft-lineage-placement` | Must pass unchanged, except the import fix of step 6. |
| `tests/rune-cleanup-calculation.spec.ts`, `tests/rune-overlay.spec.ts` | Update facts and column names. Run empty and populated flows with before/after screenshots at a stable viewport (`AGENTS.md` §1.1, §2). |

### 7.3 Performance gates

Measured on this machine with the local account export (1,347 runes), shipped roles,
middle stops:

| Measurement | Gate |
| --- | --- |
| Whole account, cold (references + advice) | ≤ 10 s; report the split |
| Whole account, warm (references cached) | ≤ 3 s |
| One rune in the overlay, warm | ≤ 300 ms |
| Statistics box, cold / warm | ≤ 5 s / ≤ 2 s |
| Peak memory of the advice worker | ≤ 300 MiB |

Expected, from §1.3: about 515 references × 16,384 × 0.8 µs ≈ 7 s of scoring on one
core, spread over the pool; body generation ≈ 1 s. The union pass costs at most one
extra CPU count, and only for unfinished runes with several live readings (108 on
this account). If the cold gate fails, the first lever is to generate only the
references of readings that a candidate can still reach. A reading whose
`reachableCeiling` is below the score at its *loosest* possible cutoff needs no exact
cutoff. The second lever is to lower `referenceSampleSize`, if 7.2's sweep allows it.

> **Review — performance gate design.** Use actual browser client/worker
> requests on the local server for sign-off. A Node microbenchmark can
> isolate generation and scoring but cannot capture queueing, cloning,
> preparation reuse, cancellation or GPU replay. Record median and worst of
> at least five runs per case on the reference machine with its core count,
> browser and engine. Separate cold start, same-input recompute with the
> result memo bypassed, a policy change, a role-price edit, and one overlay
> opened cold and during account/Statistics work. Include Simulator and a
> valid large all-mains role setup, concurrent Statistics/table work and
> rapid replacement/cancel. In addition to the stated time limits, report
> total retained and peak memory across the main thread and worker pool,
> distinct keys, misses/recomputes, bytes copied, live jobs, card replays and
> the union path's share of wall time. Confirm a cold miss, a warm hit and
> cancellation by instrumentation. Under cancellation the user should regain
> control within the earlier 100 ms target and a stale result must never commit.
> Report card-enabled and processor-only timings separately. A cold result
> below 10 s does not by itself demonstrate that 300 ms overlay latency or
> 2 s Statistics refresh is realistic. Use the same full-detail request and
> explicitly distinguish reference-cache hits from completed-result memo hits.
>
> The proposed first lever needs a cutoff before it can prune the reference.
> A candidate ceiling alone cannot bound an unknown quantile. Prune only
> provably unusable readings before planning, or use a cutoff already derived
> from the very same sample. For a cold miss, optimize key sharing, scheduling
> and scoring first, then compare sample sizes against §§7.1–7.2. Record the
> verdict-flip rate under reference-only, candidate-only and combined seed
> changes separately. Report paired flips by direction and margin to beta
> or to the quality cutoff. Set a release tolerance before looking at the
> account results. At minimum, require zero verdict flips outside the
> holdout bands and review every seed-sensitive new sale among the SPD
> specialist fixtures. Retention totals can conceal offsetting flips.

> **Assessment (Claude).** Agreed that sign-off belongs in the browser, and that my
> "first lever" is unsound: no cutoff exists before the sample has been scored.
> Proportion matters for a single-user application, so I suggest a core gate for
> release. Measure the median of five runs for: a cold and a warm account, a policy
> change, a role edit, Statistics, one overlay, cancellation, and peak memory, with
> processor-only and card-enabled timings reported separately. The remaining counters
> are diagnostics to collect when a gate fails. Paired flip analysis with a tolerance
> fixed before looking at the account: agreed.

### 7.4 Account review

Run the account before and after under the same settings and tabulate the changed
verdicts: Sell→Keep, Keep→Sell, Power up↔Sell, by slot and by Best role. Look in
particular at:
- the 80 former sales with observed SPD ≥ 20 (the case the change exists for);
- Ancient, converted/ground, below-six-star and reroll-target runes;
- even-slot runes with a main only one role uses (decision 3.3.1).

Record the aggregate counts only in `RUNE-PERCENTILE-EVIDENCE.md`; the export stays in
`work/`. Run `npm run audit:import-parity` if any reader changed (none should).

> **Review — verdict evidence.** Record all transition cells, including
> Keep ↔ Power up, both calculated and protected. First compare with
> safeguards off as in the historical benchmark, then with the user's
> effective policy and protections. Separate cause categories such as same-main
> denominator, former calibration gate, multi-reading union, allowance/rank
> change, and changed Best-role witness. For the SPD case, report how many
> of the 80 now have an applicable SPD use, clear it, or remain sold and why.
> A high observed SPD can coexist with a main no role wants. Include at least
> one designed specialist fixture whose rescue follows from the new rule.
> Keep account records and identifiers out of the committed evidence.

> **Assessment (Claude).** Agreed. The point that high SPD can sit on a main no role
> wants matters: some of the 80 may rightly stay sold, and the evidence should say
> which and why rather than count rescues only.

### 7.5 Definition of done

`AGENTS.md` §7 in full: `tsc`, lint, build, `npm test` (the whole chain, rerun after
any fix), `test:e2e`, the visual check against `http://localhost:3000/` with empty and
full input, the item 11 checks plus §7.1, and a commit on `main`. The rune chance
shader is unchanged, so `verify:rune-chance-card` only needs to pass as before.

---

## 8. Safeguards

`withRuneSellProtection` keeps its four safeguards and their order. One change:
*Potential ≥* reads `advice.readingChance ≥ 0.01` instead of `advice.chance`. The
efficiency figure and its chance must come from the same reading, and the union
chance can be contributed by other readings (proposal §8). *Pre-grind SPD*,
*Engraved* and *Re-app/refine target* are unchanged.

> **Review — meaning of Potential.** Using the chosen reading's own
> chance is required. Name it precisely as the chance of reaching that
> reading's quality bar. That is a different event from clearing the old
> Potential floor, and from finishing above the user's Potential
> threshold. Keep the existing same-reading safeguard semantics if that is
> intended. Decide explicitly whether only the chosen reading can protect
> a sale (as the plan says) or any qualifying permitted reading can. Under
> the chosen-reading rule a newly chosen Best role can remove a protection
> while the unprotected union cannot decrease. Test both the cross-reading
> borrowing counterexample and a change in Best role. Keep the protection
> explanation, precedence and placement checks on the existing shared path.

> **Assessment (Claude).** Agreed. I recommend keeping today's chosen-reading rule;
> production already reads the chosen reading's Potential and chance. The plan should
> name the event precisely: the chance of reaching that reading's quality bar. With
> the worth discount kept (§4.4 assessment), only the chance's event changes, from the
> old floor to the reading's cutoff. The Best-role-change test is worth adding.

---

## 9. Preferences

No preference field is added, removed or renamed. `runeQuality`, `powerUpPolicy`,
`acceptedRunes`, `brokenRunes` and `intangibleRunes` keep their stored stop numbers
1–5. Only what a stop means changes, and that lives in code. Nothing is migrated or
versioned (`AGENTS.md` §0). `npm run verify:preference-survival` must pass unchanged.

> **Review — preference and result lifetimes.** Preserve the exact stored
> indices and per-choice readers. Invalidate in-memory answers when their
> actual calculation inputs change. Policy changes invalidate advice while
> the numerical reference keys continue to hit. Test protection-only refresh
> paths and confirm that held results, overlay answers and the Statistics
> memo do not apply stale advice to a changed rune or configuration.

> **Assessment (Claude).** Agreed. Keying references numerically, as the §5.1
> assessment proposes, is what makes "policy changes invalidate advice, not
> references" true.

---

## 10. Risks

| Risk | Handling |
| --- | --- |
| Sampling noise moves a rune across a cutoff between two sample sizes | The sample is fixed, so the answer is deterministic. 7.2's size sweep bounds how many verdicts depend on the sample. A rune near its cutoff is near it whatever the method. |
| Even slots keep fewer runes than under the original-drop denominator | That is decision 3.3.1's intent: a slot keeps runes for the mains its roles use. 7.4 shows the counts. |
| Many readings make the union lenient | That is the proposal's stated trade: each use keeps its share. The Statistics box shows the total keep rate live. |
| A reading whose reference has almost no positive scores | The cutoff lands on 0; `wanted = MIN_VALUE` requires a positive score, so a useless body never passes. |
| Reference and candidate scoring drift apart | One `craftedScore`, one `priceList`, one `canonicalCraftCredit`. Step 1's bit-identity test holds it, and `verify:rune-craft-single-source` keeps the craft rules in one module. |
| GPU per-reading counts and the CPU union use different runs | Same seed and draw functions on both. The `max ≤ U ≤ sum` assertion fails loudly if they ever diverge. |

> **Review — release decision.** Add cold-start regressions, cache churn after
> a one-role edit, large tied atoms, and missing inputs that look like sales
> to the risk register. The performance gate needs to cover the full user
> workflow and browser memory, and the correctness gate needs to cover
> exact event agreement on the sampled runs. Keep the cutover contingent on
> those gates and the reviewed changed-sales evidence. A stable seed, a green
> union-bounds assertion and passing kernel microbenchmarks are each useful
> checks on one part of the system.

> **Assessment (Claude).** Agreed.

## 11. Assessment summary

The review is sound. It found five defects in the plan body that must be corrected
before implementation:

1. **Pricing seam (§4.1):** the reference planner must share legality, main
   resolution and the zero-ceiling check with `prepareRuneCandidate`, through one
   function.
2. **Worth discount (§4.4):** the accepted/broken discount on Potential and the
   expectation must be kept. The plan deleted it by accident.
3. **Full-allowance bar (§4.5):** the positive-score guard must not be a subnormal
   that packs to zero in Float32.
4. **"Never sell on missing input" (§3.1):** contradicted `decide`. The real gap is
   a single role with a missing reference base.
5. **Unchanged consumers (§5.6):** Statistics and Simulator have their own workers,
   and Gems & Grinds reads keepers indirectly.

Three choices in the review I recommend settling as follows:

- **Counting:** a fused processor counter first; the card only if measurement
  requires it.
- **Transition:** a shadow entry point, measured on the account before any
  consumer switches.
- **Reference ownership:** one owner on the main thread, with structured clones to
  workers.

I recommend trimming two parts to the core gates: the performance instrumentation
(§7.3) and the reference-request lifecycle (§5.5). The remaining review points are
agreed as written. None of the review's points changes the three approved
decisions, except that 3.3.3 is narrower: one overlay label is renamed.
