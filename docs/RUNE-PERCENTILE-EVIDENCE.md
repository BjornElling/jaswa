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
benchmark is reproducible with `scripts/benchmark-rune-percentile-account.mjs`.

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
same 1,347 owned runes and the same baseline settings. Run the benchmark from
the repository with the passive local export and saved baseline:

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
