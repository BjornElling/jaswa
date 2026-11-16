# Rune percentiles: an analytical replacement for quality calibration

**Status:** Design proposal; does not change the current contracts or application.
**Date:** October 29, 2026.
**Scope:** Rune Clean-up, Rune Simulator and their shared probability engine.

**Critical review:** November 16, 2026. See [§16](#16-critical-review-before-implementation).
The review qualifies the recommendation below: the mathematical direction is
sound, but the proposal is not ready to implement as a reliable selling rule
until the blocking decisions and counterexamples in §16 have been resolved.

## 1. Recommendation

Adopt the proposed direction: measure a finished rune against a defined population
of runes in its slot, and express the quality requirement as a retained upper-tail
share. Replace sampled slot-floor calibration with a discrete probability model.
Keep the probability of reaching the requirement as a separate figure.

This is the best fit for the stated product goal. A percentage of a perfect rune
answers a different question from a percentile. Converting the displayed number
without replacing the decision rule would leave the original confusion intact.

The recommended design has three parts:

1. **Quality:** how rarely an ordinary rune in this slot finishes at least this well
   for the user's roles.
2. **Chance:** the conditional probability that this unfinished rune reaches the
   chosen quality requirement with the assumed craft items.
3. **Retention policy:** widen or narrow the allowed tail for Intangible,
   four-piece, accepted and broken runes. Keep those adjustments out of quality.

Use analytical enumeration, convolution and dynamic programming, with certified
probability bounds where complete enumeration is too expensive. Do not promise
that arbitrary roles and all reference distributions can be evaluated exactly in
interactive time before benchmarking them. This document establishes a complete
mathematical target, not a measured production runtime.

The feature described in the request belongs to **Rune Clean-up** in this checkout.
Rune Optimization searches complete six-rune builds; it should continue to rank
actual build results. A rune percentile is useful for retention, but cannot replace
the optimizer's treatment of complementary stats, sets and shared craft inventory.

## 2. What the current implementation actually does

The relevant sources were inspected together:

| Source | Current responsibility |
| --- | --- |
| [RUNE-CLEANUP-MATH.md](RUNE-CLEANUP-MATH.md) §§5–9 | Value, future projection, gates and calibration |
| `app/domain/runes/cleanup/rune-cleanup-model.ts` | Candidate scores, ceilings and diagnostic ordinary distributions |
| `app/domain/runes/cleanup/rune-cleanup-advice.ts` | Shared slot floors, discounts, role choice and verdicts |
| `app/domain/runes/rune-power-up-outcomes.ts` | Remaining events, bounds and deterministic sampling |
| `app/domain/runes/rune-generation.ts` | Synthetic drop model shared with Simulator |
| `app/domain/runes/craft/rune-craft-end-state.ts` | All legal Gem and Grindstone end states |

Currently, Max value is the best reachable crafted score divided by a legal
perfect-rune ceiling. The five quality anchors are 45%, 55%, 65%, 75% and 85%.
The gate can raise these anchors separately by slot, using 600 synthetic drops
per slot and star class, 128 completion samples per unfinished calibration rune,
and a joint grid of 625 setting combinations. Calibration follows the same bodies
through +0, +9 and +12. Candidate Chance normally uses 4,096 completions.

Intangible currently softens the correction above the anchor; the four-piece
setting has its own fitted floors. Neither is a direct percentile multiplier.
The diagnostic `ordinaryBox` is a truncated Gaussian mixture, not the actual
calibration population. It is explicitly unsuitable for a rare-tail percentile.

Consequently, two runes showing 80% can receive different advice in different
slots even before ordinary explanations such as different Chance, role rank or
protection apply. The numbers describe different denominators; the user's
interpretation of one common quality scale is reasonable, but the scale does
not currently provide it.

## 3. Specify the reference population before choosing a formula

Let `D[s,k]` be an ordinary, unselected rune drop in slot `s`, star class `k`,
powered through its final sub-property event and evaluated as a +15 projection.
It is a probability distribution, not a materialized million-row sample.

For the first implementation, retain the canonical generator's assumptions:

| Component | Proposed reference |
| --- | --- |
| Slot | Condition on the actual slot; compare slots through their ranks |
| Stars | Condition on the rune's star class; Ancient uses ordinary six-star |
| Main | Every legal main, uniformly weighted, including mains no role wants |
| Rarity | Odd: 75% Hero / 25% Legend; even: 25% Rare / 50% Hero / 25% Legend |
| Innate | 50% probability, legal type selection and initial roll interval |
| Types | Uniform legal selection without replacement |
| Values and upgrade targets | Uniform within the canonical legal choices |
| Lineage | Ordinary reference; actual Ancient candidate retains Ancient legality |
| Craft credit | Fixed `canonicalCraftCredit`, including for all references |
| Sets | Neutral set identity; preference affects retention, not the ruler |
| Roles and reference monster bases | The user's current roles and roster reference averages |

These are **model assumptions**, not newly established game drop rates. In
particular, the differing odd/even rarity mixes already encode a product choice.
Changing them changes percentiles. The interface must say "modelled ordinary
runes in this slot", not "all real drops". Source-specific measured distributions
would be a later explicit product decision, not an inferred fact.

Do not condition on the candidate's rarity, innate, main or rolled line types.
Otherwise a weak Rare rune can become elite merely among Rare runes, an innate's
advantage is normalized away, and wanted even-slot mains cease paying for the
unwanted mains in the original drops. Do not rank against the imported inventory:
selling, importing or filtering would move the standard under unchanged runes.

Keeping star classes separate preserves the current contract. A 95th-percentile
five-star rune is not thereby stronger than a six-star rune. Display the class in
the explanation. If the desired product is absolute endgame strength instead,
replace this with one six-star reference and rework the lower-star score units
explicitly; do not silently mix those two meanings.

No roles, no positive usable weights or no valid reference averages means no
quality calculation. Explain what must be supplied; do not invent a distribution.

## 4. Define one ranking across all roles and builds

For a finished body `x`, a compatible reading `i` means one role and one of its
main-stat builds. Define:

```text
v_i(x; c) = best legal crafted weighted score of x under craft credit c
           / that reading's fixed ordinary perfect-rune ceiling

T(x) = max over compatible readings i of v_i(x; neutral credit)
T(x) = -infinity if no useful compatible reading exists
```

Use the existing weights and ceilings initially. Their normalized scores make
this an explicit product valuation, not a claim to measure optimal complete-build
utility. Candidate sets never alter the weight vector. Ignore preferred/accepted/
broken rank while constructing the neutral reference: all main-compatible useful
readings compete. A blank main preference keeps its current meaning of no stated
preference, rather than becoming a rejection.

The reference survival function is:

```text
A_s,k(t) = P[T(D[s,k]) >= t]
Q_s,k(t) = 100 * (1 - A_s,k(t)) = 100 * P[T(D[s,k]) < t]
```

This uses the **inclusive upper tail** and the strict lower percentile. All
identical scores receive the same rank. `Top 5%` means `A <= 0.05`, equivalently
`Q >= 95`. Never say "top 95%" when the intended meaning is "95th percentile".

For a candidate reading, evaluate `Q(v_i(x; active credit))` against that same
slot distribution. It is the percentile that this reading's result would achieve
in the population ranked by its best neutral reading. Because `Q` is monotone,
the best neutral reading reproduces `Q(T(x))`. Retain the individual readings for
policy checks, so a strong rejected reading cannot lend its quality to a weaker
permitted reading.

Why the maximum is inside the reference distribution matters. If two independent
role scores each pass their own top-5% test, their union retains
`1 - 0.95^2 = 9.75%`. Eight would retain `1 - 0.95^8 = 33.658%`.
Real roles are correlated, so neither independence nor summing their tails is
valid. Evaluating every reading on the **same finished body**, then taking its
maximum, resolves that correlation. Duplicate roles leave the maximum unchanged.

This neutral reference intentionally does not change when only a set or main rank
changes from preferred to accepted. Rank edits affect policy directly. Changes
to targets, build main combinations, role membership or reference bases can change
the underlying utility and therefore require a new reference distribution.

## 5. Ties, unavailable mains and what slot balance can promise

A discrete distribution cannot generally retain exactly 5% while treating equal
runes equally. Suppose score masses are:

| Score | Probability |
| ---: | ---: |
| 0 | 70% |
| 1 | 20% |
| 2 | 7% |
| 3 | 3% |

Score 3 has upper tail 3% and rank 97; score 2 has upper tail 10% and rank 90.
A top-5% rule keeps 3%, not 5%. Including a fraction of score-2 runes requires
random or identifier-based tie breaking. Reject that: identical rune bodies
should receive identical advice. Do not interpolate probability mass inside a tie
and then describe the interpolated result as a guaranteed retained fraction.

For `0 <= alpha < 1`, the neutral terminal selection satisfies:

```text
P[A(T(D)) <= alpha] <= alpha
```

It equals `alpha` only when the discrete support permits it. Reject a body with
no useful compatible reading even at `alpha = 1`; do not turn `-infinity` into
an eligible score just because its tail is one.

All mains remain in the original denominator. For an illustrative even slot with
eight equally likely mains and only two usable mains, usable supply is 25%.
A 5% original-drop allowance then corresponds to the best 20% of usable bodies,
assuming their utility distribution permits that cut. Ranking only usable mains
would instead retain `25% * 5% = 1.25%` of original drops. That is exactly the
hidden difference the proposed denominator avoids.

Thus common percentiles replace slot-specific score corrections. They align the
intended terminal survival shares under the reference model, not the realized
counts of a finite account. They do not guarantee equal counts when slots have
different drop frequencies, ties, protections, preference multipliers or unusable
supply. Actual counts of `n` independent reference drops have mean `n*p` and
standard deviation `sqrt(n*p*(1-p))`; for one million at 5%, these are 50,000 and
217.945. The million is an explanation of a distribution, not a required sample.

## 6. Retention settings operate on tail shares

Let `alpha` be the base allowed share, for example `0.05`. For a reading `i`:

```text
m = Intangible factor for Intangible, otherwise four-piece factor or 1
a_i = preferred/accepted/broken retention factor, in [0,1]
alpha_i = min(1, alpha * m * a_i)
```

Preserve the current rule that Intangible's set side is always preferred and that
the four-piece multiplier does not also apply to it. Combine set and main rank
through the existing worse-rank rule, once; do not accidentally discount twice.
A forbidden rank is explicitly ineligible, including at a zero tail or endpoint.

| Example, base top 5% | Allowed tail | Required percentile |
| --- | ---: | ---: |
| Preferred ordinary | 5% | 95 |
| Accepted factor 0.5 | 2.5% | 97.5 |
| Intangible factor 2 | 10% | 90 |
| Intangible factor 2, accepted main factor 0.5 | 5% | 95 |
| Four-piece factor 2 | 10% | 90 |

Multiply the **tail**, not the percentile. Doubling 95 is meaningless; doubling
its 5% allowance gives a 90th-percentile requirement. A quality of 93 can therefore
be kept as Intangible and sold as ordinary: the explanation shows its applicable
top-10% versus top-5% allowance. Quality itself does not change.

The factors describe allowed shares, not guaranteed count ratios. Ties, multiple
readings, main-rank mixtures and limited useful supply prevent a promise of exactly
twice as many. Rename any count promise accordingly when implementing.

Offer direct percentile choices, for example 80, 90, 95, 98 and 99, only as proposed
starting values. These are product recommendations, not values fitted to the
developer's account. The existing 45–85% anchors and 1.00–0.55 score discounts have
no mathematical one-to-one conversion into these new meanings.

Preserve the developer's saved selections individually. Retain existing controls'
selected stops where they remain the same choice, explain their new tail meaning,
and do not reinterpret a numeric 0.85 score discount as evidence for an equivalent
15% count reduction. Any newly introduced field is independently validated and
defaulted; no document-wide preference reset or migration/version machinery.

## 7. Unfinished runes: quality and probability are different

Let `X_l` be the observed rune at level `l`, and `Y` a legal completion through +12.
For each reading, the successful terminal event is:

```text
E_i(Y) = reading i is permitted
         AND A_s,k(v_i(Y; active credit)) <= alpha_i

C_i(X_l) = P[E_i(Y) | X_l]
C_any(X_l) = P[there exists i: E_i(Y) | X_l]
Q_best,i(X_l) = max over reachable Y of Q_s,k(v_i(Y; active credit))
```

The proposed Power-up rule is `C_any >= beta`, where `beta` is the user's existing
chance requirement. Max reachable quality remains useful as **Potential rank**;
it is not the main quality measurement of an unfinished rune. A best possible
rank of 99.9 with a 0.1% chance of reaching the requirement is a gamble, not an
ordinary 99.9th-percentile finished rune.

Use the union probability for the verdict. For two mutually exclusive successful
roles at 3% each, `C_any = 6%`; `max(C_i) = 3%` incorrectly sells at a 5% chance
requirement. When the events are identical, the union is 3%, not 6%. Count the
shared completions once. This is a deliberate change from the present rule that
one individual reading must clear both gates.

Choose the displayed Best role from permitted readings using expected utility,
with deterministic ties as today, and show its own potential and individual
chance in the explanation. The table's Chance must explicitly mean **chance for
any role**. Do not attach that union probability to the chosen role as though
that role alone had it. Expected utility can be accumulated during the same
analytical traversal, with craft chosen after the outcome is observed.

At +12 and above there are no remaining random sub-property events: `C_any` is
exactly zero or one. Main-stat progress to +15 is deterministic. Keep the current
Power up/Keep distinction at +13/+14 versus +12/+15. Keep safeguards as separate
verdict overrides and name their reasons. A protected rune need not meet the
quality requirement, and protected counts must not be described as calibrated
quality survivors.

## 8. The power-up funnel cannot promise a final 5% inventory

Terminal top-5% quality and a power-up chance threshold are two independent
choices. If the user sells a promising but unlikely +0 rune, its successful
future branch is lost. Let `E` denote terminal qualification and `B_l` denote
passing the chance rule at each chosen checkpoint:

```text
P[kept through the funnel] = P[E AND every B_l]
                          <= P[E]
```

Simple exact example: 10% of drops are identifiable promising bodies at +0; each
has a 50% chance to meet the terminal quality requirement; all others have zero.
Terminal success is 5%. A 20% chance requirement retains those bodies and yields
5%; an 80% requirement sells them all and yields 0%. It would be dishonest to
label both policies "keeps 5%".

Recommend **quality defines the terminal top share; policy controls willingness
to invest**. Report projected +0 investment and full-funnel retention separately.
Do not refit quality when the power-up policy changes. Doing so would make a
quality requirement mean a different finished rune after a risk-setting edit.

For comparison, an alternative could solve for a score threshold whose complete
funnel retention is 5%. That needs nested conditional probabilities, may have no
solution under strict policy, and can weaken terminal quality to compensate for
early sales. It recreates the present opaque coupling. It is not recommended.

An economically optimal investment policy would compare mana cost and opportunity
cost against expected account/build improvement. Percentiles do not establish
those costs. Keep the explicit chance policy until that different objective is
specified and supported by data.

## 9. Exact analytical calculation of a candidate's future

The existing schedule provides the useful simplification: every remaining
improvement happens before every remaining new line. A new line cannot receive
an improvement. Use that structure instead of enumerating ordered histories.

Suppose `b` existing lines can receive `u` improvements. A count vector
`n = (n_1,...,n_b)`, with `sum(n)=u`, has probability:

```text
P(n) = u! / (product_j n_j!) * (1/b)^u
number of count vectors = choose(u+b-1, b-1)
```

For a Legend +0, `b=4,u=4`: 35 vectors replace 256 target sequences. For Hero +0,
`b=3,u=3`: 10 replace 27. For Rare +0, `b=2,u=2`: 3 replace 4. Handle `u=0`
with one empty/no-improvement outcome, including a Normal rune with `b=0`.

If one roll of line `j` has integer probability generating polynomial
`G_j(z) = sum_v P(V_j=v)*z^v`, the increment after `n_j` hits has distribution
`G_j(z)^n_j`. Compute these tiny convolutions once per interval and hit count.
Then combine their supports, shifted by the observed line values.

If `a` new lines will be drawn from `L` remaining legal types, an unordered subset
`B` has probability `1/choose(L,a)` under uniform selection without replacement.
Combine its initial value distributions. Include actual slot, main, innate,
existing line and converted-line exclusions before making this pool. For Ancient
candidates, existing born values are already observed; future added values and
upgrades use ordinary six-star ranges under the canonical contract.

For every joint terminal vector, evaluate the legal crafted result for every
reading and then the union event. Accumulate its joint probability once:

```text
C_any = sum_n P(n)
        * sum_B P(B)
        * sum_value_vectors P(values | n,B)
        * indicator(any permitted reading qualifies after its best legal craft)
```

Gems are an adaptive decision **after** rolls, not another random event in this
model: `E[max_craft score]` is generally not `max_craft E[score]`.
The shared craft module must evaluate the realized vector, including already
converted lines, same-stat improvement legality and existing grind floors.
Do not convolve only scalar weighted scores: two line vectors with the same
plain score can have different legal or profitable Gem replacements.

Raw integer line values and legal metadata are sufficient DP keys for a fixed
body. A state may be merged only if all future transitions and every reading's
terminal craft decision are identical. Role-dependent weighted-score rounding is
not an exact merge. Integer roll-count masses can be represented exactly where
denominators agree; otherwise use rational weights or controlled floating-point
accumulation with explicit error bounds. Being discrete does not make arbitrary
JavaScript arithmetic symbolically exact.

### Worked rare-tail calculation

Condition on a slot-1 Legend whose SPD starts at 4, with four future upgrades,
and consider a target requiring final raw SPD at least 27. Assume SPD roll values
4, 5 and 6 and equal target probabilities, as in the canonical model. Only four
SPD hits can reach it. Four upgrades must sum to at least 23; their successful
sequences are four sixes or three sixes and one five:

```text
P = (1/4)^4 * (1+4)/3^4 = 5/20,736
  = 0.0002411265432098765 = 0.02411265432098765%
```

This is a conditional toy threshold, not a measured unconditional drop rate or a
full-role crafted percentile. It also reproduces the current contract's warning
that a truncated Gaussian can report zero for a genuinely possible tail.
In 4,096 independent samples, the chance of seeing no successes is
`(1 - 5/20,736)^4096`, about 37.24%. Exact summation retains this mass.

## 10. Building the slot reference analytically

The reference requires more work than a conditional candidate because it also
integrates over born properties and their values. Enumerate the finite mixture:

```text
P(T in region) = sum_main p(main)
                * sum_rarity p(rarity | slot)
                * sum_innate p(innate type and value or absence)
                * sum_born_types p(legal born subset)
                * sum_born_values p(values)
                * P(T(final body) in region | born body)
```

The last term is the same future solver. Sets need no frequency assumption because
the ruler is set-neutral. Read mixture parameters from the canonical distribution
description shared with the generator, not a copied table. For lower stars keep
their own tables; for Ancient candidates keep the ordinary six-star reference.

Compute the joint body once and price every compatible reading against it. Store
sorted score atoms with masses and suffix sums for `A(t)`, or retain certified
intervals while resolving queries. Never multiply independently computed role
CDFs: their scores share the same line types and rolls.

Even after count-vector compression, a naive joint product can be large. For an
illustrative four-line Legend with two value choices per initial roll and each
upgrade, there are `2^8 * 4^4 = 65,536` ordered value/target histories before
innates and type choices. Real flat-stat intervals can contain hundreds of values.
The number 35 counts allocation vectors, not all terminal states. Replacing the
current sampler with an unbounded Cartesian loop would ignore the reason it was
introduced.

The production algorithm should therefore combine:

1. Cached convolution tables, legal line-up structure and shared candidate futures.
2. Early acceptance/rejection when sound score envelopes prove all or none of a
   branch passes. Use the shared craft rules and existing exact bounds.
3. Aggregation of terminal states only under a proved equivalence relation.
4. Adaptive splitting of integer-value ranges with retained probability mass.
   Envelopes over all readings bound the maximum and each craft choice. A Gem's
   same-stat eligibility boundary must be included in the bounds or split at.
5. Query-driven refinement near the active quantiles, rather than resolving a
   full high-resolution CDF that no displayed requirement uses.

For a probability query, sum proved passing mass into `L` and unresolved mass
into `U-L`; then `P` is in `[L,U]`. Tighten reference-tail and candidate-outcome
bounds together. Pass only when the lower chance bound reaches `beta`; sell only
when the upper bound is below it. For equality that remains ambiguous, enumerate
the residual state space or use exact arithmetic; a work/time limit must expose
"Calculation incomplete" and must never silently produce Sell.

Likewise, a tail in `[a_low,a_high]` yields a percentile interval
`[100*(1-a_high), 100*(1-a_low)]`. State a required display precision and refine
until it is met, without using rounding to decide the verdict. An approximation
that cannot certify its threshold comparison is not an exact analytical answer.

Recommend a CPU worker first. Analytical branching and maps are not automatically
good GPU work. Keep the common acceleration door; if a card backend is later
justified by measurements, it must prove agreement on the user's card. Do not
reuse a sampling shader and label its answer exact.

## 11. Precision and sample-size comparisons

The following are binomial illustrations under independent sampling, not measured
errors of this checkout's deterministic stratified calibration:

| Samples | True share | Expected hits | Approximate 95% half-width, percentage points |
| ---: | ---: | ---: | ---: |
| 600 | 5% | 30 | 1.744 |
| 4,096 | 5% | 204.8 | 0.667 |
| 1,000,000 | 5% | 50,000 | 0.0427 |

Formula: `1.96*sqrt(p*(1-p)/N)*100`. Even a million samples has a finite tail
resolution and sampling error. Analytical integration removes that sampling
error, but cannot remove error in the assumed drop model or chosen utility.
For a 5% probability and a desired 95% half-width of 0.1 percentage points,
the same normal approximation requires `ceil(1.96^2*0.05*0.95/0.001^2)` =
182,476 samples. This is why simply increasing the sample size is not the preferred
long-term answer to the request.

Do not use a Gaussian tail approximation to obtain rare percentiles; smoothness
is not evidence of accuracy. Monte Carlo remains valuable as an independent
validation oracle with stated uncertainty, not the definition of quality.

## 12. Concrete implementation plan

### Step 1: specify and expose the shared distribution

Introduce a pure `rune-drop-distribution.ts` describing canonical finite choices
and their probabilities. The generator samples it; the analytical solver sums it.
Keep intervals and schedule in `rune-properties.ts`, and craft tables behind
`rune-craft-end-state.ts`. No reader, import eligibility or placement rule changes
are required for the mathematical prototype.

### Step 2: implement the conditional analytical future

Extend or replace the calculation inside `rune-power-up-outcomes.ts` behind one
shared future contract. Provide terminal traversal, probability bounds, mean
utility and attainable bounds. Prototype on fully known +12 bodies, then +9
Hero/Rare reveals, then Legend and all earlier levels. Tests must compare against
independently enumerated small event trees, not merely another caller of the DP.

### Step 3: implement the joint slot distribution

Add `rune-quality-distribution.ts` owning `T`, inclusive survival queries and
quantile boundaries. Use one distribution per slot and reference star class.
Cache by mathematical content: model parameters, roles' valuation/build content,
reference averages, ceilings and fixed comparison credit. Exclude imported rune
inventory, filters, placement, chance policy, tail multipliers, safeguards and
hardware preference. Those do not change the neutral ruler. Deduplicate identical valuations/builds before computation.

### Step 4: replace gate semantics in one place

Change `rune-cleanup-advice.ts` to derive each `alpha_i`, ask the shared terminal
union event, compare Chance to `beta`, and apply existing safeguards afterwards.
Remove the 625-cell fitted slot-floor grid and retire `ordinaryBox` wherever it
purports to provide the new percentile. Keep perfect-rune efficiency only as an
optional diagnostic with its own name. Use identical results in table, overlay,
Simulator and Statistics. A view never reconstructs its own percentile or gate.

Keep the saved pre-grind SPD safeguard in its existing SPD units. Preserve the
saved potential-value safeguard as an explicitly named **Potential efficiency**
safeguard against the perfect-rune ratio, including its existing 1% Chance
condition, evaluated for an individual reading under the new quality requirement.
Do not silently turn its saved 90% efficiency threshold into the 90th percentile.
It remains a separately explained safety override; a future rank safeguard would
be a new independently saved choice. Preset, lock and re-app/refine protections
keep their own meanings and precedence.

### Step 5: make the interface explain the actual rule

Recommended wording:

```text
Quality requirement: Top 5%
Chance required: 20%
Potential rank: 98.4
Chance for any role: 37%

Explanation:
Compared with modelled ordinary 6-star runes in slot 4.
This Intangible rune may qualify within the top 10%.
Its chance of reaching that requirement for at least one role is 37%.
```

For finished runes use **Quality rank**. If unfinished runes need a present-day
rank, it must be a separately defined diagnostic, not a re-labelled best case.
Reserve fixed column widths and explanatory space; selection changes no layout.
Keep actual selected filter controls unchanged when an empty group means all.

Avoid recreating the original confusion through rounding: a rank of 94.96 must
not print 95.0 beside Sell at a 95 requirement. Round displayed ranks and Chance
down at the displayed precision, compare unrounded quantities, and show enough
precision in the explanation to distinguish a boundary case. Multiplied tail
requirements can need extra decimal places too; reserve space for them and show
the actual applicable cutoff. A certified interval spanning that cutoff remains
unresolved, regardless of how its midpoint would print.

### Step 6: quantify the complete funnel separately

Statistics must show the original-drop denominator, terminal quality eligibility,
probability of investment at each actual checkpoint, full-funnel survivors, and
additional protected survivors. Terminal percentile and candidate Chance can be
analytical even while a costly full-funnel statistic is still explicitly an
estimate. Do not present an estimated Statistics percentage as exact.

For an exact funnel, propagate mass forward over observed checkpoint states and
discard a branch whenever its conditional union Chance fails. Continue the same
body to the next checkpoint. Sum terminal qualifying survivors once and apply
protections under their actual checkpoint rules. Do not multiply marginal
checkpoint survival percentages; they are correlated.

### Step 7: benchmark before replacing the current engine

Measure cold/warm reference queries and candidate throughput on this machine for
the shipped roles, one-stat roles, duplicate roles, broad multi-main roles, the
canonical craft credit and none, all supported stars, ordinary/Ancient and all observed levels.
Record state counts, unresolved mass, runtime, cancellation delay and memory.
Use the real account locally when available, but never transmit it. Do not claim
an implementation is optimal from state-count compression alone.

Acceptance target proposed for evaluation: warm conditional judgments for 3,000
runes within two seconds and cold selected reference queries within five seconds,
with prompt cancellation. These are desired budgets, not measurements. If they
are missed, optimize state sharing and certified range aggregation; ship the
analytical model only when its correctness and user-visible latency are adequate.
Do not silently substitute uncertified sampling to meet the budget.

## 13. Verification required before implementation is accepted

| Property | Required evidence |
| --- | --- |
| Probability conservation | Each transition and terminal mixture sums to one within a justified numerical bound |
| Exact small cases | Independent ordered enumeration agrees with grouped DP, including the `5/20,736` tail |
| Terminal determinism | Every +12/+15 candidate has Chance 0 or 1; +13/+14 adds no randomness |
| Correlated roles | Identical, overlapping and disjoint successful events produce the correct union |
| Duplicate roles | No change to ruler, Chance or verdict |
| Main denominator | Unwanted mains retain their original mass; no useful reading remains explicitly unusable |
| Ties | Equal terminal scores receive equal ranks and advice, irrespective of id or input order |
| Monotonic controls | Lower allowed tail or higher chance requirement never admits a previously rejected rune |
| Craft credit | More generous credit cannot lower eligibility or Chance under the fixed ruler |
| Rank changes | Preferred to accepted changes policy, without refitting the neutral distribution |
| Ancient/lower stars | Current lineage legality and explicit reference-class interpretation hold |
| Reference calibration | Neutral terminal selection obeys `P[selected] <= alpha`, with tie deficits explained |
| Funnel | Separate analytical examples verify early sales, shared bodies and safeguard counts |
| Empty/full inputs | No import, no roles, blank/zero targets, all mains, many roles and long labels |
| Preference survival | Unrelated saved settings, roles and presets survive independently |
| Engine/view agreement | Worker, table, overlay, Simulator and Statistics ask the same mathematical contract |
| Interval honesty | Unresolved comparisons remain incomplete; no approximate zero becomes impossibility |

The present slot-neutrality and calibration checks encode the current anchor/
funnel contract. Replace their assertions deliberately alongside the contract;
do not weaken them until a new invariant is proved. Also run the repository's
required cleanup, probability, preference-monotonicity, craft-monotonicity and
chance-stability checks, and capture the fresh equivalence baseline before the
engine change. A changed result is expected, but every changed category needs an
explanation. Run import parity if reader/vocabulary/eligibility changes enter the
implementation; a missing capture remains a skip. Visual verification uses the
local server and project Playwright, including empty and populated flows.

## 14. Alternatives and the final design decision

| Alternative | Assessment for this goal |
| --- | --- |
| Rename current Max value as a percentile | Incorrect: its denominator is a perfect rune, not a population |
| Rank imported inventory | Unstable after import/sale and biased by previous retention |
| One million synthetic runes | Straightforward reference experiment; expensive and still noisy in rare tails |
| Gaussian mixture percentile | Fast, but unsupported rare-tail values and possible false zeroes |
| Separate role percentiles followed by maximum | Inflates union retention and ignores correlation unless jointly recalibrated |
| Calibrate the full funnel to an exact retained count | Couples quality to risk policy and can have no feasible solution |
| Optimize expected complete-build improvement | Potentially better for a different account-allocation objective; needs costs and demand |
| Joint discrete slot percentile plus conditional union Chance | Recommended: coherent quality meaning, explicit policy and analytical probabilities |

The user's intuition is the correct organizing idea. Its strongest implementation
is a probability-weighted reference population, a joint rank across useful roles,
tail-share retention controls, and an analytical conditional future. The important
product commitment is precise: **Top 5% states a finished-quality requirement;
Chance states the risk of reaching it.** Equal inventory counts and optimal mana
spending are separate objectives and should not be smuggled into either number.

## 15. Evidence, limits and reproducibility

Game intervals, schedule and craft legality above are taken from the repository's
[RUNE-CANONICAL.md](RUNE-CANONICAL.md), [RUNE-CRAFT-ITEMS.md](RUNE-CRAFT-ITEMS.md)
and the shared modules inspected on the date above. The local working tree already
contained changes, including craft modules; this proposal reads their current
contract and does not modify them. Any later implementation must check the then
current contract rather than freeze their internal APIs from this proposal.

[SWCalc's mechanics reference](https://swcalc.cz/game-mechanics), checked October
29, 2026, covers damage and speed mechanics. It supplies no rune-drop percentile
distribution for this proposal. No new game probability is inferred from it.
Uniform choices and rarity/innate mixes retain the explicit modelled standing
recorded in the local canonical and cleanup documents.

The numerical results in §§4–11 are analytical examples, not measurements of a
new engine or the account. They can be reproduced with this dependency-free
JavaScript snippet; it enumerates the worked tail independently:

```js
const p = 5 / 20736;
let successes = 0;
for (let a = 4; a <= 6; a++)
  for (let b = 4; b <= 6; b++)
    for (let c = 4; c <= 6; c++)
      for (let d = 4; d <= 6; d++)
        if (a + b + c + d >= 23) successes++;
console.assert(successes === 5);
console.assert(successes / (3 ** 4 * 4 ** 4) === p);
console.log({
  rareTailPercent: 100 * p,
  noHitAt4096: (1 - p) ** 4096,
  unionTwo: 1 - 0.95 ** 2,
  unionEight: 1 - 0.95 ** 8,
  millionCountSD: Math.sqrt(1e6 * 0.05 * 0.95),
  requiredSamples: Math.ceil(1.96 ** 2 * 0.05 * 0.95 / 0.001 ** 2),
});
for (const n of [600, 4096, 1000000]) {
  console.log(n, 1.96 * Math.sqrt(0.05 * 0.95 / n) * 100);
}
```

No production solver, performance benchmark, real-account percentile distribution
or new UI is implemented by this documentation change. Those are explicit
implementation tasks, rather than fabricated evidence for the recommendation.

## 16. Critical review before implementation

**Reviewed:** November 16, 2026. This section records findings against the proposal,
the current canonical documents and the current source. It changes no application
behaviour and does not claim that the proposed engine has been tested.

### 16.1 Assessment and scope of confidence

The inclusive survival function, probability-weighted mixtures, conditional
future and correlated union are mathematically appropriate for a narrowly defined
goal: select unusually good finished bodies under a stated utility and reference
population, then control investment risk separately. The worked `5/20,736` tail,
multinomial allocation and unordered new-line subset probabilities are correct
under the documented uniform, independent draw assumptions. Keeping full line
vectors until crafting and refusing unresolved Sell decisions are sound choices.

That does **not** establish the best possible model for avoiding regrettable sales.
An exact percentile can rank the wrong utility with perfect numerical accuracy.
The proposal already acknowledges build optimization and economic costs, but its
claim to be the best fit is too strong without deciding whether scarce specialist
runes or a fixed total retained share takes priority. These goals can conflict.
The following blockers are requirements to settle before implementation, rather
than reasons to abandon analytical conditional probabilities.

### 16.2 Blocker: a global maximum can sacrifice specialists

The normalized perfect-rune ratios in §4 are not role-specific rarity measures.
Two roles may have quite different attainable distributions even after dividing
by their ceilings. Taking their maximum gives an advantage to whichever utility
has more mass near its ceiling; it does not give equal opportunity to every role.

An exact toy counterexample uses two readings of the same reference bodies:

| Body group | Mass | Reading A | Reading B |
| --- | ---: | ---: | ---: |
| Ordinary | 90% | 0.1 | 0.1 |
| A specialists | 4% | 0.9 | 0.1 |
| B specialists | 5% | 0.1 | 1.0 |
| Exceptional for both | 1% | 1.0 | 1.0 |

With only A, its specialists have `A(0.9)=0.05`, rank 95, and pass top 5%.
After adding B, the same bodies have `A(0.9)=0.10`, rank 90, and fail. Their
usefulness for A, stats, policy and crafting have not changed. This is a valid
consequence of the proposed formula, not a numerical bug. Duplicating a role is
harmless, but adding a different role is not monotone. In an extreme case one
reading's maximum score lies below the global cutoff: **no rune can qualify for
that reading**, even when it is the best possible specimen for that purpose.

The problem also applies to a reference reading that the candidate's actual set
can never use under the selected policy. It still raises the neutral bar. Keeping
set ranks outside the ruler is deliberate, but the resulting lost specialist
coverage must be accepted explicitly, rather than described only as correlation
correction. A user who adds a role normally expects to find additional uses.

**Required decision:** choose and document one of these objectives:

- A global rarity budget, accepting that adding a role can sell an unchanged
  specialist and that some roles may receive no qualifying supply.
- Retain a rune that is exceptional for any permitted role, using per-reading
  tails and their conditional union. Total retention then grows with the number
  of distinct uses and is not bounded by the base tail share.
- A role-coverage policy with explicit allocations or protections. Calibrating
  the joint maximum of per-reading ranks can reduce unequal score-scale effects,
  but still requires a tradeoff between coverage and a fixed global budget.

For preventing regrettable sales, favour the second objective unless a fixed
global share is the actual requirement. Do not silently substitute it: it changes
the meaning of top 5% in §§4–5. First compare the alternatives on speed-only,
balanced damage, tank and Accuracy roles, including a role with only one wanted
stat. Report per-role attainable rank and qualifying supply, not just total Keep.
Neither role count nor imported inventory size should become an unstated demand
weight. Percentiles alone cannot tell whether the account needs one or twenty
runes for a role, or whether a weaker complement completes an otherwise unusable
set; preserve explicit safeguards for those separate concerns.

### 16.3 Blocker: define crafting as a valuation, not an actual success probability

In the current shared module, `canonicalCraftCredit` substitutes deterministic
average Legend values. It does not integrate over the random result of spending
one Gem or Grindstone. Thus a finished +12 rune can correctly have Chance 1 under
the model even though a real craft roll can miss the quality requirement. The
identity `P(score at average craft >= t) = P(actual crafted score >= t)` is false.
Likewise, maximizing a score at average craft is not the expectation of the best
score under random crafts. The current `craftRollValue()` rounds each midpoint
to an integer: an ordinary Legend SPD Grindstone credits 5 from its 4–5 range,
not the arithmetic expectation 4.5. Call this the canonical rounded-midpoint
credit, not an exact expected craft result. Actual item availability, repeated
attempts and their costs are absent.

Keep the fixed credit, as the binding craft contract requires, but define Chance
as **power-up success under credited average crafting** everywhere it appears.
Explain that +12 determinism concerns remaining power-up randomness, not a
guaranteed crafting result. A future actual-crafting probability would require a
separate stochastic model, item budget and stopping policy. The union over roles
also means a suitable role and its craft may be chosen after rolls are seen; it
does not promise one Gem placement that simultaneously serves every role.

There is a second, concrete mismatch with §4's phrase "best legal crafted score":
`craftedScore()` chooses the Gem placement on the **ordinary** canonical reference
plan (`choicePlan()`), then values that placement using the candidate's plan.
For Ancient items, different stat intervals can make this differ from choosing
the highest-value placement at Ancient credit. `craftedScoreCeiling()` optimizes
at the actual plan, but is explicitly a bound, not the score a view may print.
Using that bound as terminal utility would silently change the model.

This mismatch is reproducible through the current shared module. Take a slot-5
Ancient finished body with unconverted CRI Rate, CRI Dmg, Resistance and Accuracy
lines each at 6, no innate or grinds, and only raw-point prices `SPD=1`, `ATK %=0.7`.
Ordinary canonical credit prices a new SPD line at 14 and ATK % at 13.3, so the
reference policy selects SPD. Ancient credit still values SPD at 14 but ATK % at
14.7. `craftedScore()` returns 14; `craftedScoreCeiling()` returns 14.7. These are
toy valuation units, not a measured account rank. The discrepancy was executed
against the current module during this review.

**Required correction:** define `v_i` by the shared placement policy, or change
that policy deliberately in its owning contract and all consumers first. Do not
promise an unconstrained best craft while calling a fixed-placement valuation.
Require an Ancient case where ordinary-reference and Ancient-optimal placements
differ, plus same-stat Gems below/equal/above the existing base, an already
converted line, a kept same-stat grind and a lost different-stat grind.
The terms "active credit" and configurable craft benchmarks in §§4, 7 and 12
must not introduce a new Clean-up setting; noncanonical credit belongs to clearly
separate diagnostics or the workspaces that already ask that question.

### 16.4 Blocker: precision of the model is not evidence for the drop model

The proposed odd/even rarity mix is a synthetic product distribution. It excludes
Normal and Magic births and gives Rare zero mass in odd slots. That can be a
legitimate ruler, but "ordinary, unselected rune drop" is insufficiently specific:
it is not the distribution of every acquisition source or every supported rune.
Candidates outside that birth mixture remain valid; they must still be judged
and shown. A uniform main pool also includes unwanted flat mains by design.

Exact integration cannot validate 50% innates, uniform main/type selection,
uniform targets, independence of rolls or the synthetic rarity mixture. The
repository marks these assumptions appropriately; presenting several decimal
places must not imply measured game accuracy. Selection-biased kept inventory
cannot establish acquisition frequencies. Source-specific distributions may
change both percentile and verdict without any candidate stat changing.

Before adopting Sell advice, run sensitivity comparisons against plausible
alternative rarity mixes (including Legend-only acquisition), innate rates and
main frequencies. These are stress scenarios, not claims about game rates.
Record rank/verdict changes and identify which conclusions depend strongly on an
unverified premise. Keep the canonical reference fixed until an explicit decision
changes it; do not fit it to the user's retained inventory. The UI should identify
the synthetic mixture and fixed craft assumption in its explanation.

The review rechecked [SWCalc's mechanics reference](https://swcalc.cz/game-mechanics)
and [SW Exporter's mappings](https://github.com/Xzandro/sw-exporter/blob/master/app/mapping.js).
The former supplies combat formulas; the latter supplies encoded vocabulary and
tables. Neither establishes the full joint drop distribution required here.
This review establishes no new game drop probabilities. Canonical schedule,
Ancient ranges and Gem/Grindstone restrictions remain the local source of truth;
unknown future mechanics require evidence from passive sources.

### 16.5 Blocker: score equality needs a numerical contract too

§§9–10 discuss probability error, but not enough about score comparison error.
Finite line values do not make role weights, reference averages, divisions by
ceilings or craft-valued scores exact JavaScript numbers. Inclusive tails are
discontinuous at atoms. An arbitrarily small score error at a large tie can move
its **entire mass**, even when accumulated probability error is tiny.

Specify one canonical score evaluation and comparison contract shared by
reference queries, candidate traversal and all pruning. Include operation order,
stable line ordering and tie representation. If using real-arithmetic intervals,
overlapping score intervals must remain unresolved until comparison or equality
is proved. A general epsilon or rounded score bucket is not a proof of equal
utility and may erase a real difference. Rational comparison where practical, or
a precisely specified floating-point score definition with sound bounds around
that computation, are possible implementation choices.

For reference-tail bounds `[a_low,a_high]`, a candidate terminal state is proved
successful only if `a_high <= alpha_i`, and proved unsuccessful only if
`a_low > alpha_i`. All other mass remains unresolved when bounding Chance. This
must include uncertainty in the candidate score itself and in adaptive craft
selection. Refining only probability sums cannot settle an uncertain score tie.
Compare independently evaluated equal bodies in permuted line/role orders,
nearly equal scores, exactly equal tail thresholds and equality at `beta`.
Do not round or clamp a positive tail to zero through underflow or cancellation;
query rare tails directly rather than subtracting an almost-one lower CDF.

### 16.6 Additional contracts needed before coding

| Gap | Required behaviour and adversarial check |
| --- | --- |
| Zero chance requirement | Existing controls use `beta >= 0.01`. Retain that domain or explicitly require attainable success as well as `C_any >= beta`; otherwise `0 >= 0` admits impossible and forbidden runes. Test both endpoints if the API permits them. |
| Zero tail and rank 100 | A finite ordinary reference cannot admit its own maximum at `alpha=0`, but a stronger Ancient or already-crafted candidate can lie above the entire support and have tail zero. Define whether zero means literal zero reference mass or disable retention. Rank 100 means above reference support, not perfect or optimal. Never turn an unfinished Potential rank of 100 into certainty. |
| All positive targets already met | The current weight contract deliberately scores named stats alike in this degenerate case. Distinguish it from no positive targets at all; preserve that fallback or explicitly change its owning contract. Test a met target beside blank and explicit-zero targets. |
| Class-relative quality | A high-ranked low-star rune can be much weaker in absolute stats. Showing the class only in an explanation may be insufficient in a combined sortable table. Label class-relative ranks where users compare them and keep the existing low-star sale policy explicit. |
| Best role and Potential rank | Selecting by expected utility can choose a role with zero qualifying chance while another reading makes the union pass. Define whether the main rank is that role's potential or the maximum over permitted readings. Explain the qualifying readings and keep each role's values together; never display one reading's score as another's justification. |
| Potential-efficiency safeguard | Its potential efficiency and 1% Chance condition must refer to the same individual reading. A high potential in A cannot borrow the union Chance contributed only by B. Verify that changing the normal chance policy does not accidentally change the safeguard's own 1% rule. |
| Deduplication | Identical valuations can share numerical work, but their policy masks can differ by set/main rank. Merge utility computations, not role identity or permission. Test duplicate valuations with one forbidden and one permitted reading, then reverse their order. |
| Malformed future | A missing interval, too few legal additions, impossible born-line count or multiple converted lines is an explicit invalid calculation/import condition. Do not inherit `emptyInterval` or `Math.min(additions,pool.length)` fallbacks from the current future reader: they fabricate valid-looking probabilities from an invalid rune. Keep the rune visible with a diagnostic. |
| Checkpoint consistency | Define whether Statistics sells only at +0/+9/+12 or at every actual decision opportunity. Include Magic, Normal and off-checkpoint levels. For a fixed terminal event verify `C(X_l) = sum P(next | X_l) * C(next)`; individual observed rolls may raise or lower Chance. |
| Reference/candidate consistency | Under identical ordinary unmodified inputs and canonical credit, integrating conditional terminal outcomes over births must reproduce the reference tail. This checks the two solvers' agreement; it does not validate their shared game assumptions. |
| Unavailable calculation | No valid roles/reference bases, a failed worker, cancellation or unresolved intervals produce an explicit unavailable/incomplete state, not zero Chance, rank zero or Sell. Preserve applicable user protections and keep every imported rune reachable. |
| Cache freshness | An import can change roster reference averages even when inventory is excluded from the ruler key. Invalidate on every mathematical dependency, including build compatibility and star-specific tables. A worker answer started before an import/role edit must never overwrite the current calculation. |

### 16.7 Feasibility and a concrete acceptance gate

Analytical probability remains the recommended target, but §10 is an algorithm
strategy rather than a demonstrated solution. Query-driven refinement across many
distinct role/main weight vectors may resolve almost every branch. A time limit
must leave an honest incomplete answer, and a selling feature that often remains
incomplete is not yet usable. Measure worst cases as well as shipped-role averages:
flat HP intervals, many nearly identical roles, narrow thresholds near large atoms,
Normal +0 additions, all compatible mains and repeated edits during cold queries.
Set memory and cancellation budgets as well as runtime budgets.

Before approving implementation, require all of the following evidence:

1. An explicit decision on specialist coverage versus a fixed global share, with
   the §16.2 counterexample and representative role comparisons recorded.
2. One executable utility specification resolving Gem placement and average-craft
   semantics, agreed with the shared craft contract before any engine replacement.
3. Independent small-tree probability checks, score-tie comparisons, the endpoint
   and invalid-input matrix above, and sensitivity results for model assumptions.
   Include bodies whose successful readings require different Gem placements;
   count the body once without requiring both crafts to be made simultaneously.
4. A bounded-error prototype that answers both the reference query and conditional
   future, with measured worst-case memory, runtime and unresolved mass. A proof of
   the 35 allocation vectors is not evidence for end-to-end interactive performance.
5. An offline comparison on real locally held runes if available, reviewing every
   newly proposed sale category, particularly specialist SPD, Ancient, already
   Gem-converted/ground and lower-star runes. Inventory is validation material,
   not the percentile denominator. If no export is available, record the missing
   evidence. No automatic sale or game interaction is part of this work.

**Review conclusion:** the probability architecture is credible and improves on
sampled calibration, but the proposal is not yet a complete or demonstrably best
retention model. Specialist coverage, crafting semantics, model sensitivity and
score-boundary correctness are the main risks of confidently misleading advice.
Settle those before investing in the full analytical reference solver. The rest
of the original safeguards should remain; this review adds to them.
