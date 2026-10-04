# Rune Optimization — assessing the work

**Reviewed:** 4 October 2026

The former warning multiplied admitted rune counts across six slots and assumed
one million combinations per second on the processor, fifty million when card
use was enabled. Those constants had no device measurement behind them. They
could warn about a search that exact reduction and bounds made inexpensive,
while missing Gem variants and the effect of ceilings on held-item allocation.

## The questions tested

`scripts/benchmark-rune-optimization-work.mjs` varies one input at a time: ranking
alone, several loose floors, an impossible floor, a four-set leaving two free set
slots, all sets required, Intangible, owned items, assumed Gems, assumed stones,
both, owned items with a ceiling, 100 results, depth 1, and four locked slots.
It runs the same trial used by the page and then the actual parallel client,
reusing the prepared pool. Both go through the normal engine door. No account
data is uploaded, and no captured account is committed.

There are two pools: a fixed generated 251-rune account (seed 20261004, 35–45
runes per slot), and a local captured 2,437-rune account. The captured pool was
also run with the card enabled, checking the reported engine. The page and
browser modules were served at `http://localhost:3000/`; Chromium's current
headless mode exposed the card. The local server was restarted after the
earlier server stopped responding. These are measurements on this machine,
not portable timing constants.

The benchmark deliberately caps the validation search at three seconds per
worker. **An unfinished validation is not a measured completion time**, nor
evidence that depth 10 would reach its normal ten-minute limit. Wall time
includes worker creation and handing over the pool, but not the preparation
already measured separately. A driver pass and search setup can exceed the
short internal cap; the page's trial also has a 20-second external watchdog.

## What changed the work

Captured pool, depth 10 unless stated, processor, 10 results unless stated:

| Question | End states after reduction | Search choices after recipe grouping | Validation |
| --- | ---: | ---: | --- |
| Rank DMG only | 725 | 725 | Unfinished at the 3 s cap |
| Four loose floors | 2,077 | 2,077 | Unfinished at the 3 s cap |
| Impossible SPD floor | 0 | 0 | Finished, 0.024 s |
| Violent, two free set slots | 851 | 851 | Unfinished at the 3 s cap |
| Violent/Will, no broken sets | 316 | 316 | Finished, 0.59 s |
| Intangible allowed | 1,623 | 1,623 | Unfinished at the 3 s cap |
| Owned Gems and stones | 18,226 | 2,863 | Unfinished at the 3 s cap |
| Assumed Gems | 2,176 | 2,176 | Unfinished at the 3 s cap |
| Assumed stones | 730 | 730 | Unfinished at the 3 s cap |
| Both assumed | 2,335 | 2,335 | Unfinished at the 3 s cap |
| Owned items, SPD ceiling 180 | 45,753 | 45,753 | Unfinished at the 3 s cap |
| Rank only, 100 results | 1,474 | 1,474 | Unfinished at the 3 s cap |
| Rank only, depth 1 | 150 | 150 | Finished, 0.20 s |
| Four locked slots | 267 | 267 | Finished, 0.032 s |

Several findings matter to a recommendation:

- **The raw product is not the work.** Violent/Will had about 2.72 trillion
  preliminary combinations but finished in 0.59 seconds. The trial's sampling
  envelope was 0.17–1.25 seconds, and issued no warning. An impossible floor had
  the same 4.24 quadrillion preliminary combinations as the broad search, but
  exact feasibility left nothing to search.
- **More requirements have no single direction.** Loose floors made more
  accumulators relevant and retained more candidates: 725 became 2,077.
  Impossible requirements cut the pool to zero. Exact set requirements narrowed
  it and made the bounds stronger. Counting filled fields cannot capture this.
- **Free set slots and open physical slots are different.** Violent leaves two
  slots free to wear other sets, but all six rune slots still participate in
  the tree. Four locked slots leave only a two-slot tail: no tree sharing is
  possible or needed. Its per-slot widths were 1/1/1/1/136/127.
- **Gems change the choices; stones alone need not.** In this question Gems
  expanded the pool much more than assumed stones. Held-item recipes reduced
  18,226 end states to 2,863 choices without losing item competition. At the time
  of this measurement, a ceiling disabled recipe allocation and retained 45,753
  choices. The subsequent [range-allocation improvement](RUNE-OPTIMIZATION-RANGE-ALLOCATION.md)
  keeps only ceiling-sensitive work concrete. The model reads the actual current
  pool rather than assigning one fixed multiplier to craft use.
- **Intangible and table size affect exact reduction too.** Intangible retained
  more set identities and choices. Requesting 100 rows preserved candidates
  a ten-row answer could safely dominate. Neither is represented by rune count.
- **The card toggle is not a speed ratio.** The card answered the repeated
  capture matrix through the same agreement gate used by the page. Some small
  questions incur more worker/card setup than useful arithmetic; difficult
  questions remained unfinished at the short cap on both engines. That says
  nothing about a universal fiftyfold speed improvement.

On the generated pool, assumed Gems increased choices from 202 to 1,344;
assumed stones kept 202. The Gem questions finished their parallel validation
in about 2.2–2.4 seconds despite an inconclusive trial. That is why an
unfinished short trial says **uncertain**, rather than recommending less depth.

## The resulting recommendation and its limits

The page first tries the actual whole search with a 500 ms search budget. If
it finishes, that is observed completion at the selected depth. Otherwise it
samples the first, middle and last branch of the actual first open tree slot,
with 250 ms each. The timer begins at the engine's own search clock, after
packing and the card agreement gate: setup cannot be charged once per branch.

Three completed samples with durations of at least 5 ms and a spread of at most
fourfold support an envelope. Scale their minimum and maximum by branch count
and available workers, then halve the low end and double the high end. Warn
only when even the low end exceeds the chosen search budget; the stronger tone
starts at four times that budget. An unfinished or uneven sample has no timing
recommendation. An actual run supersedes the trial, and an actual timeout
supplies direct warning evidence. A deliberate stop supplies none.

These factors are conservative heuristic choices, **not a fitted statistical
model or a confidence interval**. Three branches cannot establish what every
other branch costs, and core contention, shader passes and a rising shared bar
can change the time. The benchmark cases establish concrete failures in the
former combination-count model and exercise the replacement; they do not
calibrate a universal probability of completion. A short trial often remains
uncertain on a large captured account, and says so. Avoiding a false alarm is
preferable to inventing a precise estimate from an unfinished branch.

Reproduce the generated matrix with:

```powershell
node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-optimization-work.mjs
```

Pass a local serialized `RuneOptimizationInput` as the final argument for a
captured question. Set `JASWA_BENCH_GPU=1` to repeat through the card gate; the
reported engine confirms whether it actually answered. The verification script
`npm run verify:rune-optimization-work` holds the recommendation's boundaries,
unfinished/uneven samples, empty pools, two-slot tails and preservation of the
original problem and time limit. Interface tests exercise large impossible
pools, failed trials, full numeric ranges and panel positions before and after
the changed reading.
