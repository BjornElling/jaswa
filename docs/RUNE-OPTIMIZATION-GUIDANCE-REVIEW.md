# Rune Optimization — guidance and early stopping

Reviewed: 4 October 2026. The binding contract is
[RUNE-OPTIMIZATION.md](RUNE-OPTIMIZATION.md).

## Accepted changes

- **Actual remaining set support.** Counting free slots alone can promise a
  missing Violent piece where none of those slots offers Violent. The support
  bound reads actual slot/set availability during admission, guidance and search.
  It preserves both engraved and future Intangible completions. Independent support
  can reuse a slot or wildcard, so it is an overestimate; only failure prunes.
  The search omits the extra check where all open slots offer every read set.
- **Impossible guide prefixes stop early.** Independent remaining maxima and
  minima, with generous and unavoidable set bonuses, check floors and ceilings.
  An impossible prefix no longer consumes a position in the finite beam. These
  envelopes use admitted alternatives and the shared stat sheet.
- **Stock-resolved supplementary guides.** The ordinary representative beams and
  paired improvements remain. A second beam explores Gem placements within their
  promising physical rune families. Free grades and stones are assigned through
  the existing exact allocator at completion; ceiling-sensitive work stays fixed.
  Complete supply alternatives are restored before allocation. Only a strictly
  stronger guide adds candidates, and this lane does not repeat the pair sweep.
- **Less repeated work.** Different beam prices can find the same allocated
  recipe. Deduplicating guides avoids repeating its neighbour sweep. Scratch
  buffers are reused for failed extensions; retained prefixes own their copies.

The extra lane changes the reported finite-depth heuristic, not exact reductions
or the depth-10 candidate pool. Independent guides remain available. No scoring,
craft legality, shader, saved preference or import format changed.

## Rejected experiments

**Exact allocation at surviving tree prefixes** reduced evaluated combinations
but increased search time. On the uncapped captured Poseidon question, one trial
fell from 9.62 million to 9.36 million full evaluations while search time rose
from 1.42 to 2.08 seconds. Timing varies, but that reduction did not pay for its
matching overhead. The implementation was removed.

**Replacing the ordinary beam with allocation-based guidance** improved four of
40 generated starting results but weakened one. It was rejected as a replacement;
independent guidance is preserved in the final supplement.

**Repeating allocation guidance over the full admitted account** increased
preparation cost, especially with active composite ceilings. The final lane uses
the physical families identified by ordinary guidance and admits only stronger
supplementary guides. It is not a second full-account search.

No greedy Gem-filling failure is used as proof of infeasibility, and no rule
always replaces the least efficient sub property. Neither would preserve the
range and shared-stock contract.

## Measurements

Before: `d2a524e`. After: this change. Captured questions use the same local
2,437-rune account, depth 1, owned Gems and Grindstones, 50 distinct physical
rows, one processor search part and a three-second search cap. Preparation is
outside that cap. Before and after were run in separate processes, sequentially.
The numbers are individual measurements on this machine, not portable ratios.

Poseidon asks for Despair/Focus, ATK % / CRI Dmg / ATK % mains, floors of
215 SPD, 75 ACC, 60,000 E.HP and 30,000 E.HP D. Galleon asks for Shield/Will,
ATK % or SPD / CRI Dmg / ATK % or ACC, 218 SPD, 100,000 E.HP and 50,000 E.HP D.

| Question | Preparation before → after | Search before → after | Best DMG before → after | Completed before / after |
| --- | ---: | ---: | ---: | --- |
| Poseidon, no ceiling | 2.35 s → 2.42 s | 2.26 s → 1.51 s | 6,674 → 6,674 | Yes / Yes |
| Poseidon, SPD 230 | 5.55 s → 4.33 s | 3.00 s → 3.00 s | 6,674 → 6,674 | No / No |
| Galleon, no ceiling | 12.39 s → 8.63 s | 3.00 s → 3.00 s | 5,839 → 5,839 | No / No |
| Galleon, SPD 230 | 22.67 s → 15.35 s | 3.01 s → 3.01 s | 5,814 → 5,846 | No / No |

Every ranked score in the after tables was at least its corresponding before
score. The completed Poseidon tables had identical scores in all 50 positions.
Unfinished tables prove quality within this budget, not their shortlist's optimum.

The normal Galleon page was also measured before and after on the existing
`http://localhost:3000/` server, with the graphics card, parallel client and the
ordinary depth-1 limit. The same account and SPD-230 requirements returned 50
rows with best DMG 5,991 on both runs. Click-to-table time was 34.00 seconds
before and 32.44 seconds after; both reached the search limit. This small timing
difference is one local observation, not a portable speed guarantee. Only the
engine files were temporarily restored to the baseline for that comparison;
the final source was restored afterwards. No second server was started.

Forty fixed small generated accounts measure the checked table available on an
immediate stop, after guide and neighbour seeding. Four improve and 36 keep their
best score; none loses ground. The four E.HP improvements are:

| Pool | Before | After |
| --- | ---: | ---: |
| 7 | 183,714 | 184,848 |
| 9 | 185,522 | 187,227 |
| 11 | 188,306 | 189,916 |
| 15 | 202,450 | 203,109 |

The quality check also completes both depth 1 and depth 10 for these four pools
and the pool that regressed in the replacement experiment. Their best scores
agree. These are regression cases, not a guarantee for all accounts or time limits.

Reproduce current guidance measurements:

```powershell
node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-optimization-guidance.mjs --generated --seed-only
```

Replace `--generated` with a local serialized `RuneOptimizationInput` for captured
uncapped and SPD-230 questions. Omit `--seed-only` to run three-second searches.
An optional second positional argument names a local snapshot of
`rune-optimization-problem.ts`; its sibling search module is used too. The original
measurements kept four engine modules in an ignored local directory,
with their imports pointing to that snapshot or unchanged repository dependencies.
Inputs and detailed outputs remain local under `work/optimization-pruning/`.

## Verification

The exact oracle checks 200 random accounts and 66 tight interval tables against
unreduced brute force, plus 36 rich crafted-range tables against full item
enumeration. It also checks splitting, worker cloning, shared bars, card passes
and processor recovery. Dedicated support cases preserve engraved and future
Intangibles while rejecting a missing set that the remaining slots cannot supply.

The quality suite holds nested depths, seeded and unseeded tables, empty and
impossible questions, scarce stock, tight ceilings and complete-pool references.
Five additional stock pools hold immediate-stop quality, unique guide recipes and
agreement between the completed depth-1 and depth-10 best scores.

TypeScript, lint, the Vite production build and all 180 Playwright tests pass.
The real graphics-card check passes its agreement gate and matches the processor
on 102 accounts (344 rows, 257 passes and 1,608,342 pairs on the card). Work
estimation and preference-survival checks pass. Import parity was audited against
the local helper capture; it was not skipped.

Browser verification uses the already-running local server. Empty imports and
requirements, all ranges filled, held crafts under a tight SPD ceiling, searching,
result opening and Escape were driven. Before/after screenshots and measured
boxes show the requirement and monster panels stay fixed. The captured-account
flow also returns 50 rows and opens the first build without moving those panels.
