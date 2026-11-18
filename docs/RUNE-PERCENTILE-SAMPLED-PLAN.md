# Rune percentiles, sampled: the problem and an implementation plan

**Status:** Implementation plan. Supersedes the exact solver of
`RUNE-PERCENTILE-PROPOSAL.md` §§9–10 and `RUNE-PERCENTILE-NUMERICS.md`; keeps that
proposal's policy where §3 below says so.
**Created:** November 18, 2026.
**Scope:** Rune Clean-up, the rune overlay, Rune Simulator and the Statistics box,
which all read `runeAdvice`.

This document is meant to be enough on its own: an experienced developer should be
able to implement the change from it without reading the earlier proposal. Module
and function names refer to the tree at commit `6b7de60`.

---

## 1. The problem

### 1.1 What was wanted

The production engine sells runes that are excellent for one use. The cause is its
quality gate: a *Max value* floor (45–85 % of a perfect rune), calibrated per slot
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
- **Max value survives as an efficiency figure**, and the *Potential value*
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

### 3.3 Decisions to confirm before implementing

These are product choices. The plan below implements the **recommended** option.
Each alternative changes one function.

1. **Denominator: the rune's own main, not all mains.** *Recommended.* The proposal
   kept every legal main of the slot in the denominator. With seven or eight mains in
   slots 2, 4 and 6, that turns "top 5 %" into "top 35–40 % of the runes with this
   main". At the lowest stop (20 %) **every** useful rune of a wanted main in an even
   slot would pass (20 % ≥ 1/7). Measuring against runes of the same slot and main
   means "top 5 %" reads the same in every slot: *better than 95 % of the runes of
   this slot and main for this build*. A role that needs only one slot-2 main then
   keeps few slot-2 runes, which is right: it needs few. The alternative is
   `mainShare = 1 / slotMainProperties[slot].length` in §4.3. Nothing else changes.
2. **Sample size 16,384 per reading.** At the strictest reading (1 % × 0.55 =
   0.55 %) the cutoff still sits among 90 samples. §7.3 makes the choice
   verifiable.
3. **Reason strings stay as they are** (`Below the floor`, the printed chance), so no
   repository-wide rename is needed (`AGENTS.md` §7 item 14). The slider keeps its
   name *Rune quality floor* and its stop labels; only the numbers behind the stops
   and their explanations change.

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

With `mainShare = 1` (decision 3.3.1):

```text
tail(u)   = mainShare × #{ j : scores[j] ≥ u } / N       // share of reference drops at least as good
quality share of a rune = tail(its +15 projection)        // "Top 3.2 %"
```

A reading with allowance α qualifies a score `u` when `u > 0` and `tail(u) ≤ α`.
With `q = α / mainShare` and `k = floor(q × N)`:

- `q ≥ 1`: every useful score qualifies → `wanted = Number.MIN_VALUE`.
- otherwise: `tail(u) ≤ α` ⇔ `#{scores ≥ u} ≤ k` ⇔ `u > scores[N − 1 − k]` →
  `wanted = max(nextUp(scores[N − 1 − k]), Number.MIN_VALUE)`.

`wanted` is a raw score bar for the existing `≥` comparisons (`chanceStep`,
`shareReaching`, `countJobs`, the shader). `nextUp(x)` is the next representable
double above `x`. Implement it with a shared `Float64Array`/`BigInt64Array` view: for
finite `x ≥ 0`, add one to the bit pattern; for `x < 0`, `-nextDown(-x)`. Ties are
therefore inclusive in the tail, as the proposal required: a rune that only equals the
k-th best sample fails.

`count(scores ≥ u)` is `N − lowerBound(scores, u)` by binary search.

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

### 4.6 Best role and the printed figures

- **Pool:** if cleared, the readings with `C_i > 0`; otherwise all allowed readings
  (forbidden broken readings only as the last fallback, as now).
- **Choice:** `mostExpected` unchanged, except that the tie-break on `value`
  (standing) becomes "lower `qualityShare` first" (better quality wins).
- **Row figures**, all from the chosen reading except Chance:
  - `maxValue`: Max value (efficiency against the perfect rune), unchanged.
  - `qualityShare`: `tail(best)`, where `best = candidate.best` (the +15 projection
    for a finished rune, the best reachable for an unfinished one).
  - `requirement`: the chosen reading's `alpha`.
  - `chance`: **`U`**, because that is what the gate compared. The printed number
    must clear the stop exactly when the rune does (`runeChanceText` is unchanged).
  - `readingChance`: the chosen reading's own `C_i`, for the *Potential value*
    safeguard (§8).

---

## 5. Architecture

### 5.1 New module: `app/domain/runes/cleanup/rune-quality-reference.ts`

The only owner of the reference sample, its scores and the cutoff arithmetic. Pure,
synchronous and thread-agnostic.

```ts
export const referenceSampleSize = 16_384;

export type QualityReference = Readonly<{
  key: string;              // `${slot}|${stars}|${main}|${prices.join(',')}`
  mainShare: number;        // 1 with decision 3.3.1
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

### 5.2 `rune-power-up-outcomes.ts`: one addition

```ts
/** The share of runs on which at least one reading reaches its bar. Same runs, same seed as `countJobs`. */
export function countUnion(future: RuneFuture, scorings: readonly EndStateScoring[],
  wanted: readonly number[], runs = chanceRuns): number;
```

The loop is `shareReaching` with an inner loop over readings and `break` on the first
hit. Nothing else in this file changes. The runs, seed, schedule and shader stay as
they are, so `verify:rune-chance-layout` and `verify:rune-chance-card` are untouched.

### 5.3 `rune-cleanup-model.ts`

- `candidateChanceAsk(candidate, threshold)` takes `threshold` in Max-value units
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

### 5.6 Unchanged consumers

`rune-cleanup-statistics.ts`, `rune-simulator.ts`, Gems & Grinds and Rune
Optimization keep their code. The first two read `runeAdvice`; the last two use
`prepareRuneCandidate` with `noCraftCredit` and never read a quality gate.

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
- `q ≥ 1` gives `Number.MIN_VALUE`; a zero score never qualifies.
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

**Step 4 — threads.**
Convert the calibration pool (§5.5). Keep the rule that all references are ready
before rune progress starts, so the status line never goes back from rune progress to
preparation.

**Step 5 — interface.**
- `rune-overlay.tsx` `Evaluation`:
  - *Selected Rune quality floor* → value `Top 5 %` (the base allowance).
  - *Required Max value for this rune* → label **Required quality for this rune**,
    value `Top 4.25 %` (the chosen reading's α).
  - Add **Quality of this rune**: `Top 3.2 %` (`qualityShare`).
  - Readings table: replace nothing that exists. Add a column **Quality** (`Top x %`)
    after *Match*. Its width is reserved for `Top 100 %` in tabular figures, so a
    value arriving never moves a column (`AGENTS.md` §2).
  - These are new labels, not renames of a label a test addresses. Check
    `tests/rune-overlay.spec.ts:122` and update it to the new facts.
- `rune-cleanup-grid.ts`: add a sortable **Quality** column (`qualityShare`,
  ascending is best) beside *Max value*, hidden by default like *Max value*, with
  the same reserved-width rule.
- **One formatter**, `runeQualityText(share, requirement)`, in
  `rune-cleanup-advice.ts` beside `runeChanceText`. It prints the requirement
  exactly (percent, at most three decimals, trailing zeros trimmed) and the share
  **rounded up** to the same number of decimals, minimum one. Then the printed share
  is ≤ the printed requirement exactly when the rune passes the reading. A share of 0
  (above every sample) prints `Top 0 %`.
- `the-math-section.tsx`: rewrite the *Rune quality floor* paragraph. Each stop is a
  top share of the runes of the same slot and main for one build; Accepted, Broken
  and Intangible widen or narrow that share; Power-up policy is the chance that any
  role reaches its share. Remove the slot-balance text.
- `rune-potential-section.tsx`: stop labels and the slider name are unchanged. A
  stop's helper text, if it prints a percentage, reads the new allowance array.

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

**Step 7 — checks.** See §7.

**Step 8 — documents.**
- `RUNE-CLEANUP-MATH.md`: §5 calls Max value an efficiency figure that no gate reads
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

### 7.2 Existing checks to adapt

| Check | Change |
| --- | --- |
| `verify:rune-slot-neutrality` | Its Max-value anchor and floor assertions go. Keep checkpoint identity, empty inputs and rejection of unusable mains. Add: the base allowance means the same share in every slot (from 7.1.1). |
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

### 7.4 Account review

Run the account before and after under the same settings and tabulate the changed
verdicts: Sell→Keep, Keep→Sell, Power up↔Sell, by slot and by Best role. Look in
particular at:
- the 80 former sales with observed SPD ≥ 20 (the case the change exists for);
- Ancient, converted/ground, below-six-star and reroll-target runes;
- even-slot runes with a main only one role uses (decision 3.3.1).

Record the aggregate counts only in `RUNE-PERCENTILE-EVIDENCE.md`; the export stays in
`work/`. Run `npm run audit:import-parity` if any reader changed (none should).

### 7.5 Definition of done

`AGENTS.md` §7 in full: `tsc`, lint, build, `npm test` (the whole chain, rerun after
any fix), `test:e2e`, the visual check against `http://localhost:3000/` with empty and
full input, the item 11 checks plus §7.1, and a commit on `main`. The rune chance
shader is unchanged, so `verify:rune-chance-card` only needs to pass as before.

---

## 8. Safeguards

`withRuneSellProtection` keeps its four safeguards and their order. One change:
*Potential value ≥* reads `advice.readingChance ≥ 0.01` instead of `advice.chance`. The
efficiency figure and its chance must come from the same reading, and the union
chance can be contributed by other readings (proposal §8). *Pre-grind SPD*,
*Engraved in non-Scenario preset* and *Re-app/refine target* are unchanged.

---

## 9. Preferences

No preference field is added, removed or renamed. `runeQuality`, `powerUpPolicy`,
`acceptedRunes`, `brokenRunes` and `intangibleRunes` keep their stored stop numbers
1–5. Only what a stop means changes, and that lives in code. Nothing is migrated or
versioned (`AGENTS.md` §0). `npm run verify:preference-survival` must pass unchanged.

---

## 10. Risks

| Risk | Handling |
| --- | --- |
| Sampling noise moves a rune across a cutoff between two sample sizes | The sample is fixed, so the answer is deterministic. 7.2's size sweep bounds how many verdicts depend on the sample. A rune near its cutoff is near it whatever the method. |
| Even slots keep fewer runes than under the original-drop denominator | That is decision 3.3.1's intent. 7.4 shows the counts. The alternative is one line. |
| Many readings make the union lenient | That is the proposal's stated trade: each use keeps its share. The Statistics box shows the total keep rate live. |
| A reading whose reference has almost no positive scores | `q`'s cutoff lands on 0; `wanted = MIN_VALUE` requires a positive score, so a useless body never passes. |
| Reference and candidate scoring drift apart | One `craftedScore`, one `priceList`, one `canonicalCraftCredit`. Step 1's bit-identity test holds it, and `verify:rune-craft-single-source` keeps the craft rules in one module. |
| GPU per-reading counts and the CPU union use different runs | Same seed and draw functions on both. The `max ≤ U ≤ sum` assertion fails loudly if they ever diverge. |
