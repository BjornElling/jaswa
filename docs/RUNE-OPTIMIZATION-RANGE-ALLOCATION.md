# Rune Optimization — allocating craft work with ranges

Reviewed: 4 October 2026. The binding contract is
[RUNE-OPTIMIZATION.md](RUNE-OPTIMIZATION.md).

## What changed

A single stated ceiling formerly disabled all recipe allocation. Even an
unreachable ATK ceiling expanded every optional stone and Gem grade into the
six-slot search. Ceiling guidance also retained the full product of unrelated
craft work in its beam. This cost both preparation time and opportunities to
find stronger builds before a time limit.

`rune-optimization-ranges.ts` now owns figure dependencies, independent range
envelopes and the proof that a stated limit can bind. It uses the existing stat
sheet and set-bonus vocabulary; it adds no game formula. A proof over the full
admitted pool can remove an internal ceiling or floor and its now-unused
accumulators. The user's original requirements stay unchanged.

Recipe allocation fixes only ceiling-sensitive work: the exact line values,
grinds and stacks spent on every accumulator an active ceiling reads. Work on
other accumulators is matched afterwards. A DMG ceiling therefore fixes ATK,
CRI Rate and CRI Dmg; an SPD ceiling leaves ATK work free. The beam uses the same
recipe identity, with its existing strongest, cheapest and resource-priced
representatives for independent work. Guidance remains a heuristic at finite
depth; exact reductions remain exact.

Range feasibility now repeats to a bounded fixed point. Direct-stat ceilings
tighten optimistic composite scores through the shared stat sheet. A work plan
whose optimistic score is strictly below the already-found row for its physical
rune combination needs no further item assignment. Equality still participates
in the ordinary tie order.

## Why the hybrid allocation is exact

A legal Gem placement fixes the replacement line and its stat. Each active
ceiling's dependencies fix the amounts and held stacks on the lines it reads.
All candidates within that recipe therefore have identical ceiling contributions
and fixed supply use. The tree checks those fixed stacks in the usual way.

The remaining Gem grades and stones change only free accumulators. Every ranking
figure and floor is monotone in them. Different kind/stat groups use disjoint
stacks, and no free group can compete with a fixed group. Maximizing their totals
with the existing capacity-constrained matching preserves every achievable floor
and maximizes the recipe combination's ranking figure without changing a ceiling.

Each selected recipe restores its complete legal product of free item choices
from the original craft pool, even at depth 10. This matters: matching separately
maximized groups must be able to find their combined legal end state, and an
earlier range or dominance reduction may have removed that particular combination.
Only complete legal craft states supplied by `rune-craft-end-state.ts` participate.
The final processor reading checks every resolved build, including all ceilings.

## Measurements

Before: commit `2386fc3`. After: the range-allocation changes. Measurements use
the processor, one search part and the same inputs and three-second search cap.
Preparation is separate from that cap. Captured questions use depth 1 and 50
results; their 2,437-rune account and full outputs remain local under `work/`.
These are individual measurements on this machine, not portable speed ratios.

Poseidon: Despair/Focus, ATK % / CRI Dmg / ATK % mains, floors of 215 SPD, 75 ACC,
60,000 E.HP and 30,000 E.HP D, owned Gems and Grindstones:

| Ceiling | Preparation before → after | Best DMG before → after | Completed before / after |
| --- | ---: | ---: | --- |
| None | 1.75 s → 1.69 s | 6,674 → 6,674 | Yes / Yes |
| ATK 1 billion | 11.95 s → 1.60 s | 6,566 → 6,674 | No / Yes |
| SPD 230 | 11.47 s → 3.02 s | 6,566 → 6,674 | No / No |
| ATK 2,400 | 10.57 s → 2.85 s | 5,768 → 5,984 | No / No |
| E.HP 120,000 | 14.36 s → 6.14 s | 6,464 → 6,674 | No / No |

The uncapped and loose-ATK after searches completed in 1.39 s and 1.60 s,
respectively, and returned the same 50 ranked DMG scores. With SPD 230, 9,371
end states became 793 tree choices after recipe grouping. The before pool had
9,492 tree choices. The other capped searches improved the best result found
within the short budget; unfinished runs do not prove a shortlist's optimum.

The same SPD-230 Poseidon input also went through the normal parallel client,
eight available search parts, the graphics-card agreement gate and the ordinary
depth-1 time limit. Both reported `Graphics card`. The before run took 27.73 s
including preparation, reached its limit and found best DMG 6,566. The after run
took 10.65 s including preparation, completed its shortlist and found best DMG
6,674. This is a completed finite-depth shortlist, not proof of the account's
global optimum. The existing local server served both code snapshots; no second
server or hosted preview was started.

Galleon: Shield/Will, ATK % or SPD / CRI Dmg / ATK % or ACC mains, floors of
218 SPD, 100,000 E.HP and 50,000 E.HP D, ceiling of 230 SPD, owned items:

| Reading | Before | After |
| --- | ---: | ---: |
| Preparation | 34.79 s | 11.97 s |
| Tree choices after grouping, summed over slots | 46,776 | 3,007 |
| Best DMG at the three-second search cap | 5,547 | 5,814 |
| Completed | No | No |

Through the normal parallel client and graphics card at the ordinary depth-1
limit, Galleon took 62.29 s before and 29.22 s after, including preparation.
Both reached the limit; best DMG improved from 5,583 to 5,991. These browser
measurements include allocation and worker/card setup, and differ from the
single-part processor preparation measurements above.

A fixed 12-rune generated account provides completed comparisons with five rows,
owned Hero/Legend supply and no finite-depth cut:

| Ceiling | Full evaluations before → after | Five ranked scores |
| --- | ---: | --- |
| ATK 1 billion | 187,420 → 25 | Unchanged |
| SPD 160 | 2,123,052 → 57,076 | Unchanged |
| ATK 1,500 | 122,130 → 40,364 | Unchanged |

The SPD case took 2.18 s before and 0.10 s after; the ATK 1,500 case took 0.11 s
before and 0.034 s after. The evaluation counts are reproducible work measures;
wall time also includes matching and varies between runs. An impossible E.HP
ceiling returned no builds on both paths.

Reproduce the generated matrix:

```powershell
node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-optimization-ranges.mjs
```

Pass a local serialized `RuneOptimizationInput` as the second argument for a
captured account. An optional third argument selects one case by its printed
name, such as `'SPD ceiling'`. The benchmark keeps account data local.

## Verification and limits

- The existing oracle still compares 200 random accounts and 66 tight interval
  tables against unreduced enumeration through the actual stat sheet.
- Another 36 rich crafted-range tables compare hybrid allocation with unreduced
  brute force and full item enumeration. They exercise limited Hero/Legend supply,
  standard, Ancient and Immemorial compatibility, tight direct/composite ranges,
  cloning, splitting and preservation of stated requirements.
- Six wider crafted pools with tight ranges retain the depth-10 optimum at
  depth 1. The existing eight wide quality pools, nested finite-depth choices,
  guide seeding and supply regressions still pass. These fixed pools establish
  regressions, not a probability for all accounts.
- The real-card check compares processor and card answers on 102 accounts,
  including 18 crafted-range cases. The shader and acceleration routing are
  unchanged; only the processor owns allocation and final eligibility.
- Browser checks exercise empty and fully filled requirements, owned craft work
  under a tight SPD ceiling, stable panels, result opening and Escape on the
  existing local server at `http://localhost:3000/`.
- All 180 Playwright tests, TypeScript checking, lint and the Vite production
  build pass. Import parity was audited against the local helper capture.

Finite depth still cuts physical rune families and Gem placements. Active composite
ceilings can fix several craft dimensions, and broad questions can still time out.
No new preference or import format was introduced.
