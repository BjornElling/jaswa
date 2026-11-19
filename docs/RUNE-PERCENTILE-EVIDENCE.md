# Rune percentile implementation evidence

**Status:** Evidence for the experimental exact engine, which will not be adopted.
The existing production advice remains in use. The approved replacement is
[RUNE-PERCENTILE-SAMPLED-PLAN.md](RUNE-PERCENTILE-SAMPLED-PLAN.md); its measurements
are added here when it is implemented (plan §6, steps 0 and 8).
**Updated:** November 18, 2026.

The acceptance contract is [RUNE-PERCENTILE-PROPOSAL.md](RUNE-PERCENTILE-PROPOSAL.md).
This record separates measured results from targets. Personal account data stays
in ignored local files under `work/`; this document records aggregate counts only.

## Before the changes

The fresh full `verify:rune-cleanup-equivalence` baseline evaluated 582 runes in
six scenarios in 79,186 ms. It is stored locally as
`work/rune-percentile-before.json`. This is the old engine's output, not evidence
that its quality definition satisfies the proposal.

A local account export supplied 1,347 runes: 112 Ancient, 983 converted, 1,080
ground and two below six stars. Levels were +0: 106, +9: two, +12: 296 and
+15: 943. With the shipped roles, middle policy stops, Intangible stop 1 and
protections disabled, the old engine proposed 953 Sell, 390 Keep and four Power
up, taking 22,802 ms. Eighty proposed sales had observed sub-property SPD of at
least 20. These are review categories, not a verdict that all eighty must pass
the new policy. The account is validation evidence and never the ruler.

The original six `rune-cleanup-calculation.spec.ts` Playwright cases passed at
`http://localhost:3000/`. They captured empty and populated tables, filter changes,
blank and filled safeguards, and layout measurements before and after controls.
The server was started for this verification because port 3000 was not listening.
Before screenshots are retained locally in `work/percentile-before-shots/`.
All 117 original unit tests passed.

## Kernel measurements during implementation

The independent boundary check now verifies an ordered-roll oracle for the
original-drop SPD reference, denominator conservation under a one-state budget,
inclusive atoms, decimal policy equality, outward probability rounding and reused
interval bounds at new score cutoffs. Typecheck passes at this checkpoint.

On this Windows machine with Node 26.13.1, the six-star slot-4 specialist query
completed in approximately 0.81 seconds and returned an exact tail of
`49/1,658,880`. A broad fixed-price stress query completed in approximately
2.42 seconds with certified tail bounds `[0.0042640981, 0.0141155957]`, enough to
prove its top-5% event. Its percentile remains an interval. Peak process RSS in
that benchmark was 291,288 KiB. These are selected reference queries, not a full
account benchmark.

After that broad query, 3,000 distinct higher-cutoff reference queries took
approximately 73 ms. This measures reuse of a certified endpoint distribution;
it is **not** the proposed 3,000 complete warm rune judgments. The endpoint index
has a 64 MiB estimated retention budget shared across readings, and a reading
retains at most 512 exact-cutoff computations. No score buckets or sampled
probabilities enter the index.

Cancellation scheduled after 10 ms was reported at approximately 13 ms. A request
scheduled at 1,800 ms was reported at approximately 1,812 ms. Thus the respective
latencies include the delay until the event loop could receive the request,
rather than measuring only the final check. These cover cold reference traversal
and late index construction. The committed benchmark supports `--cancel-after`
for repeating the measurement.

## Replacement gates

The complete experimental advice path missed the readiness gate on the local
account. One finished rune had 86 reading identities and 71 numeric references.
One snapshot took 144.8 seconds cold and 117.0 seconds on repeat, with exact union
Chance 1, no certified rank witness and peak RSS 720,024 KiB. A later full-details
run still could not return that judgment within a 40-second budget.

The subsequent decision-only prototype could settle the first 30 selected account
runes in 31.2 seconds. Twenty-two changed from Sell to Keep and eight stayed Keep.
This selected subset starts with a previously sold SPD specialist. All its
decisions came from the union gate without fully resolving quality witnesses.
Repeating the subset reached 54 of 3,000 requested judgments in 58.8 seconds before
the shared 90-second deadline. Peak RSS was 1,341,972 KiB. This repeated-workload
benchmark was recorded with the exact-engine harness from the pre-sampling tree.

The experimental Statistics worker used all five checkpoints on each latent
path. On the local browser fixture, it certified three terminal failures and
left 297 of 300 terminal outcomes unresolved in its ten-second sample budget.
The per-reading catalogue was also incomplete under that budget. These results
leave the existing production workflow in use.

The complete experimental UI diff is preserved locally in
`work/rune-percentile-experimental-77491a4.patch`, based on commit `77491a4`.
With the experimental UI active, the focused Playwright cases for empty and
populated Clean-up, overlay protection, replacement requests and the Statistics
layout passed on `http://localhost:3000/`. The populated four-rune flow took 27
seconds. This remained a local prototype check. The legacy Simulator and broader
browser checks were not all ported to the experimental activation.

The synthetic sensitivity check changed the outcome at one of five tested utility
cuts when the compatible main's assumed frequency increased to one half. Removing
that main from the synthetic birth model changed one cut in the other direction.
Legend-only, Hero-only and the two extreme innate rates preserved the five tested
top-5% outcomes. These scenarios stress the model assumptions and do not estimate
game acquisition rates. The local import parity audit passed, including all
1,347 owned runes. Full account verdict changes and consumer agreement remain
unverified.

The isolated shared craft correction was compared with the fresh baseline on
all 3,492 synthetic judgments. There were no verdict or assigned-role changes.
The canonical realized-body sum and Ancient placement moved 1,467 maximum
values, 1,352 standings, 19 chances and eight displayed chance descriptions.
The largest chance movement was approximately 1.88 percentage points. The
existing legacy chance shader now identifies score cutoff atoms for CPU replay.
Its agreement fixture verifies exact counts on other jobs and passed on the
local card. The isolated craft correction also preserved the verdict and assigned
role of every one of the 1,347 local account runes under the baseline policy.

The foundation passed type checking, lint, build, 133 unit tests and the 11
focused Clean-up and Statistics browser tests on the local Vite server. The
domain chain finished. It skipped the artifact acquisition-order check because
its traffic log was unavailable. The separate account-export parity audit passed.
The full
browser run passed 361 of 362 tests. One Gems & Grinds case timed out while
waiting for its first recommendation. It passed once in isolation and again in
all five repetitions on the final code. The complete suite did not pass in a
single run.

The proposal's time budgets remain targets: 3,000 warm
judgments in two seconds, selected cold reference queries in five seconds and
cancellation reported within 100 ms. Frequent incomplete results prevent replacing
the production engine.

## Shared quality boundary experiment

The experiment computes a certified score bracket per numerical reference and
policy allowance, then reuses it for every rune. The account fixture is the
same 1,347 owned runes and the same baseline settings. The commands below were run on the exact-engine tree with the passive local export
and saved baseline. The current harness measures the sampled implementation.

```text
node --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-percentile-account.mjs --runes=1347 --warm=3000 --deadline-ms=150000 --warm-deadline-ms=30000 --decision-only --shared-boundary --interleave
node --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-percentile-account.mjs --statistics --deadline-ms=10000 --shared-boundary
```

The account benchmark reports finished sub-property bodies (+12 and above)
separately from unfinished bodies. It replays attempted runes in the same
reference scope for the warm measurement, with a separate warm deadline.
Decision-only measurements omit resolved rank and expected utility details.
The measured preparation time covers reference partitions and indexes,
including any work interrupted by the deadline. Other work includes scoring
the rune, traversing its possible futures and assembling the advice.

With `--reference-states=1024`, the full scan took 69.0 seconds and left all
1,347 runes unresolved, including 1,239 finished bodies and 108 unfinished
bodies. Reference preparation took 2.45 seconds across 515 builds. The warm
scan returned 103 judgments in 30 seconds, all unresolved, while building no
new reference indexes. A small cold reference budget alone therefore leaves
substantial candidate-side work and does not give usable verdicts.

At the default reference budget, the interleaved scan returned 32 judgments
in 150 seconds. Four of the 16 finished bodies and nine of the 16 unfinished
bodies were unresolved. Reference preparation accounted for 144 seconds across
415 builds. The warm repeat returned 175 judgments in 30 seconds with no new
reference preparation, and 69 were unresolved. Peak RSS was 2,071,884 KiB.

In import order, the three-minute run returned 136 finished-body judgments
before reaching any unfinished bodies. It left 37 of the 136 unresolved. The
warm repeat of only those bodies returned all 3,000 judgments in 3.01 seconds,
with 816 unresolved. A separate warm repeat of one finished SPD specialist
returned 3,000 certified Keep judgments in 3.37 seconds after two reference
builds that took 321 ms in total. The runs replayed the same candidates and
shared the machine with verification work. Neither run represents the full
account at the default budget.

The ten-second Statistics run tracked five checkpoints for each of 300 sampled
paths. It certified three failures and left 297 paths unresolved at the
terminal gate. The qualifying funnel left the same count unresolved. No
terminal reading entered the per-reading catalogue before the deadline.
At 30 seconds with up to 1.5 seconds per checkpoint, the same 297 terminal
outcomes remained unresolved. The catalogue reached 172 rows and none was
fully resolved.

The experiment leaves the existing production path in service. The completed
body repeat shows where sharing boundaries helps. The account and Statistics
gates still need faster preparation of tighter reference brackets and less
candidate-side work for unfinished bodies.

## Sampled implementation

### Account verdicts

The same passive export supplied 1,347 runes, including 108 with sub-property
events remaining. At the middle stops, Intangible ×1 and safeguards off, the
planner found 517 distinct reference price vectors across the used pieces.

| Before → after | Keep | Power up | Sell |
| --- | ---: | ---: | ---: |
| Keep | 386 | 0 | 4 |
| Power up | 0 | 4 | 0 |
| Sell | 686 | 70 | 197 |

| Slot | Sell → Keep | Sell → Power up | Keep → Sell |
| --- | ---: | ---: | ---: |
| 1 | 137 | 15 | 0 |
| 2 | 125 | 7 | 0 |
| 3 | 141 | 19 | 0 |
| 4 | 76 | 6 | 1 |
| 5 | 124 | 16 | 0 |
| 6 | 83 | 7 | 3 |

| Sampled Best role | Sell → Keep | Sell → Power up | Keep → Sell |
| --- | ---: | ---: | ---: |
| Bomber | 89 | 8 | 0 |
| Bruiser | 168 | 17 | 4 |
| Def DD | 27 | 3 | 0 |
| Def-tank | 41 | 1 | 0 |
| Fast DD | 52 | 0 | 0 |
| First-turn debuff | 58 | 15 | 0 |
| HP tank | 97 | 25 | 0 |
| No-spd bruiser | 27 | 0 | 0 |
| Slow DD | 30 | 0 | 0 |
| Support | 97 | 1 | 0 |

All 80 former sales with at least 20 observed pre-grind SPD had an
applicable SPD-priced reading, cleared one of those readings and became
Keep. Bruiser and Support each supplied 26 of their Best readings. The four new
sales were finished even-slot runes. Each missed all its permitted
same-main bars. Across the account, 167 Best-role names changed. Among the
overlapping craft and grade cohorts, 60 Ancient, 557 converted, 599 ground
and one below-six-star rune moved from Sell to Keep. Two converted and two
ground runes moved from Keep to Sell. The independent SPD-only fixture
checks that a specialist clears on its own reading. The four even-slot
runes with exactly one usable role were previously Sell. One became Keep,
one became Power up and two remained Sell.

The saved preferences were also read locally. The comparison
used the same 12 roles, settings, preset placements and active safeguards
on both builds. No account or preference data is included here.

| Calculated before → after | Keep | Power up | Sell |
| --- | ---: | ---: | ---: |
| Keep | 546 | 0 | 20 |
| Power up | 0 | 32 | 1 |
| Sell | 508 | 70 | 170 |

| Protected before → after | Keep | Power up | Sell | Re-app |
| --- | ---: | ---: | ---: | ---: |
| Keep | 906 | 0 | 17 | 2 |
| Power up | 0 | 32 | 1 | 0 |
| Sell | 217 | 70 | 99 | 0 |
| Re-app | 2 | 0 | 0 | 1 |

With these preferences, 162 Best-role names changed. The protected verdicts
included 18 new sales, five from slot 4 and 13 from slot 6.

### Sensitivity and equivalence

Run `npm run verify:rune-quality-sampling -- <local-export> --catalogue` for independent
holdouts and the paired account sweep. The acceptance bands are one-sided for
the reference because tied atoms can leave the qualified mass below the
allowance. Two independent holdout seeds covered every legal main in slots
1–6 at five and six stars under broad and SPD-only pricing, and all 517
price vectors used by the account. All 8,694 comparisons passed, including
the 0.55 % allowance and the positive score guard at full allowance.

| Variation from the 16,384-body reference | Sell → Keep | Keep → Sell | Sell → Power up |
| --- | ---: | ---: | ---: |
| 4,096 bodies, nested sample | 2 | 7 | 1 |
| 65,536 bodies, nested sample | 2 | 1 | 0 |
| Independent reference seed | 4 | 1 | 0 |
| Independent candidate seed | 0 | 0 | 1 |
| Both seeds independent | 4 | 1 | 1 |

None of the variations introduced a sale with pre-grind SPD of 20 or more.
The largest unfinished-rune flip was 0.74 percentage points from the policy
gate. The sweep checks finished flips against every compatible reading,
since Best role can change when the rune crosses the union gate. Every
finished flip was within 32 % of its holdout band in at least one reading
that crossed the cutoff. The largest tied boundary atom consumed 86.6 %
of a specialist reference.

The before and after equivalence baselines each covered the same 582
synthetic runes in six scenarios. The comparison found the expected changes
in Chance, verdict, Best role and the Best reading's discounted Potential.
The fresh baseline includes quality share, requirement and marginal chance.
The final scorer reproduced it exactly. The SHA-256 of the synthetic JSON
baseline was `73fb472949c24a668746c3468dabb11b5aa188bb3f9f0826360f18c72df420dc`.

### Browser timing

Use `node scripts/benchmark-rune-percentile-account.mjs <local-export> 5`
with JASWA running on `http://localhost:3000/`. A fresh page is used for
each cold case. Warm account timings call the worker client again, and warm
Statistics changes the quality stop so it bypasses the completed-result memo.
The same command with a single repetition and `--memory` samples JavaScript
heap and backing storage through Chromium's debugger.

Chromium 159.0.8154.6 on 16 logical cores, five samples per cell. The times
are median / worst. Other verification browsers ran alongside these checks.

| Case | Processor setting | Card setting enabled |
| --- | ---: | ---: |
| Cold account, end to end | 6.97 / 8.32 s | 3.68 / 3.76 s |
| Cold account, reference preparation | 2.05 / 3.05 s | 1.44 / 1.81 s |
| Warm account | 2.25 / 3.27 s | 1.85 / 2.10 s |
| Accepted policy edit | 2.20 / 2.42 s | 1.79 / 2.00 s |
| Role HP target edit | 2.98 / 3.76 s | 2.35 / 2.72 s |
| Warm overlay | 171 / 748 ms | 163 / 471 ms |
| Cold Statistics | 4.64 / 5.67 s | 4.63 / 5.86 s |
| Warm Statistics policy edit | 1.87 / 2.20 s | 1.99 / 2.20 s |

The median passed each time gate. Worst samples under concurrent test load
exceeded the warm-account, overlay and Statistics targets. All these account
and Statistics requests reported Processor. The single-event batches in these
requests were smaller than the 32-job dispatch threshold. The separate real
card check verified exact sampled counts with replay at tied raw cutoffs.
Cancellation of an in-flight answer settled as superseded within the timer's
millisecond resolution.

The peak sampled JavaScript heap plus buffer and string backing storage was
about 109 MiB for an advice worker and 532 MiB across the worker pool and main
page in the account runs. These figures exclude browser-native and graphics
allocations. A valid all-mains configuration with 1,904 distinct references
streamed its score arrays, answered all 16 requested runes and discarded a
cancelled predecessor. The final foreground-lane smoke check completed
a cold overlay in 597 ms while table and Statistics were preparing, and all
three requests returned within 5.55 s. The 1,904-reference calculation then
completed in 22.7 s.

The old engine took 46.1 s for a cold in-process account run. Its separate
in-process Statistics runs took 27.2 s cold and 5.1 s warm. Those runs
measured the old Node path and provide orientation for the browser timings.

Local Playwright runs captured Rune Clean-up before and after calculation,
the Quality column and its sort, and the overlay before and after a hold.
They exercised empty and imported accounts, the 3,001-rune table and the
fully populated 1080p overlay. The real export passed import parity.

The final `npm test` run passed the domain chain and all 362 browser tests.
The TypeScript check, lint, production build, 128 unit tests, preference
monotonicity and the real WebGPU chance check also passed.
