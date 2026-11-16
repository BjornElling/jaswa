# Rune percentiles: a specialist-preserving analytical model

**Status:** Revised design proposal; does not change binding contracts or the application.
**Created:** October 29, 2026. **Revised:** November 16, 2026.
**Scope:** Rune Clean-up, Rune Simulator, Statistics and their shared probability engine.

This revision incorporates the critical review into the model itself. It replaces
one global maximum-score percentile with percentiles for individual useful
role/build readings. It specifies crafting, numerical boundaries and failure
behaviour. Section 16 records the changes and remaining acceptance gates.
No production solver, performance result or real-account validation is claimed.

## 1. Decision and purpose

The primary objective is to avoid selling a rune that is exceptional for a stated
use. A fixed total retained share is secondary and is **not promised**. Adding a
new use must not revoke an existing qualifying use when its targets, reference
bases, build, policy and rune body remain unchanged.

Adopt these rules together:

1. Rank finished quality separately for each role/build reading against a declared
   synthetic population in the rune's slot and star class.
2. Preserve the original-drop denominator, including incompatible mains. Never
   rank against imported inventory or survivors of earlier sales.
3. Qualify if at least one permitted reading succeeds. For unfinished runes,
   calculate the conditional probability of that **union** on shared futures.
4. Use the shared canonical Gem/Grindstone valuation. Chance concerns power-up
   randomness under that credit, not actual craft results or item ownership.
5. Apply protections separately. Invalid inputs and unresolved calculations never
   become numerical zeroes or Sell recommendations.

Use finite enumeration, convolution and dynamic programming, with certified
bounds where full enumeration is too expensive. Benchmark before promising
interactive performance. Numerical precision does not establish unmeasured game
probabilities or prove that the utility captures every useful build.

This is a retention model, not a complete-build optimizer. It cannot guarantee
that a rune improves the account's best build, completes a set, is worth the mana,
or is surplus. Rune Optimization continues to answer complete-build questions
with complementary stats, placements and shared craft inventory.

## 2. Baseline and authoritative sources

The following were inspected together for this revision:

| Source | Responsibility |
| --- | --- |
| [RUNE-CANONICAL.md](RUNE-CANONICAL.md) | Game schedule, ranges, exclusions, lineages, sets and rerolls |
| [RUNE-CLEANUP-MATH.md](RUNE-CLEANUP-MATH.md) | Current weights, utility, gates and calibration |
| [RUNE-CLEANUP-INTERFACE.md](RUNE-CLEANUP-INTERFACE.md) | Saved choices, protections, refresh and presentation |
| `app/domain/runes/cleanup/rune-cleanup-model.ts` | Readings, perfect-rune ratios and ordinary diagnostics |
| `app/domain/runes/cleanup/rune-cleanup-advice.ts` | Calibration, chance gates, role choice and protections |
| `app/domain/runes/rune-power-up-outcomes.ts` | Future events, bounds and deterministic sampling |
| `app/domain/runes/rune-generation.ts` | Synthetic births and upgrades |
| `app/domain/runes/craft/rune-craft-end-state.ts` | Shared Gem placement and legal craft valuation |
| `app/domain/runes/rune-reapp-targets.ts` | Preservation targets, distinct from immediately legal stone use |

The current engine displays a perfect-rune ratio, with quality anchors 45%, 55%,
65%, 75% and 85%. Calibration uses 600 synthetic births per slot/star class, 128
completions for unfinished calibration bodies and a 625-cell policy grid. It
follows +0/+9/+12; candidate Chance normally uses 4,096 completions. `ordinaryBox`
is a truncated Gaussian diagnostic, not a rare-tail percentile distribution.

Intangible currently softens the correction above the anchor. **The inspected
advice code has no separate four-piece retention control.** The earlier proposal's
claim that such a control already had fitted floors was incorrect. This revision
introduces no automatic premium for four-piece sets. A future set-scarcity policy
needs its own explicit objective and controls.

Binding documents continue to govern the application until implementation changes
their subjects deliberately. This proposal does not authorize duplicate craft,
stat-sheet, placement, filter or acceleration rules.

## 3. Reference population and uncertainty

Let `D[s,k]` be a synthetic ordinary birth in slot `s`, star class `k`, taken
through its last sub-property event and evaluated as a +15 projection. It is a
finite probability distribution, not a materialized million-row sample or a
measured mixture of every acquisition source in the game.

| Component | Reference definition |
| --- | --- |
| Slot | Actual slot, 1–6 |
| Stars | Own class, 1–6; Ancient uses ordinary six-star reference |
| Main | Uniform over every legal main, including unwanted mains |
| Rarity | Odd: 75% Hero / 25% Legend; even: 25% Rare / 50% Hero / 25% Legend |
| Innate | 50% presence; uniform legal type and integer initial value |
| Natural types | Uniform legal selection without replacement |
| Values | Uniform integer choices from the canonical interval |
| Upgrade targets | Uniform over the existing eligible lines |
| Conditional draws | Independent given the legal state, as in the synthetic generator |
| Craft | Ordinary `canonicalCraftCredit` and shared placement policy |
| Sets | Neutral identity; no set-frequency distribution |
| Utility | Each reading's fixed weights and roster reference averages |

Rarity mix, innate rate and draw probabilities are model assumptions with the
standing recorded in the canonical documents. Normal/Magic births and odd-slot
Rare births have zero reference mass. Such **candidates remain supported**;
zero birth mass in the ruler is not a reason to hide or reject an owned rune.

Do not condition the ruler on a candidate's rarity, innate, rolled types or main.
Main compatibility belongs to a reading's event (§4), not a renormalized pool.
Ancient and already-modified candidates retain their actual properties; the
reference remains ordinary and evaluated under its own canonical credit.

Class-relative quality is deliberate: a high-ranked five-star rune need not be
stronger than a six-star rune. Label the reference class where mixed classes are
compared. A six-star absolute-strength ruler requires a deliberate redesign of
lower-star units, not merely a changed label.

Before replacement, report sensitivity to alternative rarity mixes (including
Legend-only), innate rates and main frequencies. These are declared stress
scenarios, not estimates of real rates. Record changed verdict categories and
rare-tail changes. Agreement across a few scenarios is not proof against every
possible distribution; disagreement must not disappear behind extra decimals.
Never estimate acquisition rates from the selection-biased kept inventory.

## 4. One precise utility for each reading

A reading `i` identifies a role, one main-stat build, slot, reference class and
the actual main it accepts in that slot. Its weights and reference monster base
are fixed before inspecting a candidate.

For an unstated main (`0` in the current build representation), expose one reading
per legal actual main **without crediting it in the target subtraction**. The
user stated no main there; expansion must not invent one in the requirement.
Each expanded reading accepts only its named main. Its own unstated slot retains
broken rank; another unstated slot does not lower rank, as in the existing
build-rank rule. Odd slots use their fixed actual main.

```text
u_i(x) = corrected shared canonical score of finished body x,
         using i's fixed weights, actual lineage and observed grind floors

H_i(x) = u_i(x), if x has i's actual main and u_i(x) > 0
         -infinity, otherwise
```

Only legal readings with a positive finite scoring scale participate. A role
with no positive targets supplies no reading. A role whose positive targets are
already met retains the current fallback that prices its named stats alike;
that is not an empty role. A zero-benefit body cannot qualify merely because
its main is uncommon or the allowed tail is large.

Use the current weight model initially. Main builds, role artifact-main assumptions
and roster bases remain inputs. Candidate sets, filters, inventory and owned craft
items do not alter weights. Surplus continues to score as the current contract
states; retention utility is not linear combat benefit beyond a game's stat cap.

A perfect-rune denominator is unnecessary for the percentile: dividing scores by
the same positive ceiling does not change their order within a reading. Use raw
shared utility for tail queries, removing an extra rounding step. Retain the
ordinary perfect-rune ratio as **Potential efficiency**, with its own name and
safeguard (§8). Wildcard expansion fixes each reading's main and diagnostic ceiling.

### 4.1 One canonical placement policy per lineage

`canonicalCraftCredit` credits an average Legend Gem and an average Legend
Grindstone on each grindable line. The code rounds each midpoint to an integer:
ordinary Legend SPD grind 4–5 credits 5, not the expectation 4.5. This is a
**rounded-midpoint comparison credit**, not the expected result of one craft.

The current `craftedScore()` chooses placement on an ordinary canonical plan,
then prices it on actual lineage. `craftedScoreCeiling()` optimizes at the actual
plan but is only a bound. That discrepancy is not merely conservative: it can
make an improved Ancient line score lower, as the second example below shows.

Regression example: slot-5 Ancient, no innate/grinds, unconverted CRI Rate, CRI Dmg,
Resistance and Accuracy each at 6; raw-point prices SPD=1 and ATK %=0.7, all others
zero. Ordinary credit values a new SPD line at 14 and ATK % at 13.3, selecting SPD.
Ancient credit values them at 14 and 14.7. The current score is **14**, while its
actual-plan bound is **14.7**.

Stronger regression: slot-5 Ancient Legend +12, no innate/grinds/conversion, SPD 7,
ATK % 8, CRI Rate 30, Resistance 6, with the same prices. Increasing only ATK %
from 8 to 9 switches the current Gem from ATK % to SPD and lowers score **26.7 to
26.6**. Both bodies can arise legally: all four upgrades land on CRI Rate.
This was reproduced through the current module. A percentile transformation
cannot repair the underlying reversal and could turn a stronger rune into Sell.

**Required shared-policy correction before the new model is usable:** choose the
canonical Gem placement on `craftPlan(actualLineage, canonicalCraftCredit)`, not
an always-ordinary plan. Enumerate legal realized bodies, including no Gem, and
choose the highest canonical utility with stable ties. Reuse that one placement
reference in every craft reader; a held item's grade/roll assumption must not
choose a different reference. This keeps the reference independent of settings
and owned inventory while respecting the candidate's fixed game lineage.

Under the proposed corrected policy, the first example scores 14.7; the second
retains ATK % Gem and scores 26.7 at both base values. These are toy utility units,
not measured percentiles. Update the craft owner's contract and all consumers
together; this proposal does not change them now. Never call the current upper
bound the corrected score or build another Gem selector inside the percentile
solver. Its shared kernel must evaluate the selected realized body consistently.

With nonnegative weights and the same constraints, increasing one observed base
value must not lower canonical utility or reading rank. Verify that property
against full legal Gem enumeration and the actual numerical kernel, including
placement switches. If future transition probabilities are unchanged, coupling
the same future rolls must also prove that conditional Chance cannot decrease.
This does not compare different innate types, conversion markers or lineages:
changing those also changes the legal action set.

The model credits craft types, not owned stocks, spending order or repeated
attempts. Ancient takes Ancient items only; Intangible takes its own or Immemorial
ordinary items. Never substitute ordinary items for missing Ancient ones.
A union over readings permits choosing a use and craft after power-up rolls; it
does not promise simultaneous Gem placements or one final rune for every role.

## 5. Reading-local percentiles and their guarantees

For each reading, define an inclusive upper tail and strict lower rank:

```text
A_i(t) = P[H_i(D[s,k]) >= t], for finite t > 0
Q_i(t) = 100 * (1 - A_i(t))

Reading i qualifies if H_i(x) is finite AND A_i(u_i(x)) <= alpha_i.
```

Incompatible mains retain their original mass with no success. Never query
`A_i(-infinity)` to decide usability. An unusable reading has no rank. Every
reported quality figure names the reading whose `Q_i` it uses.

For a fixed reading and `0 < alpha_i <= 1`:

```text
P[H_i(D) is finite AND A_i(H_i(D)) <= alpha_i] <= alpha_i
```

Ties can make this strict. With score masses 0:70%, 1:20%, 2:7%, 3:3%, score 3
has tail 3% and rank 97; score 2 has tail 10% and rank 90. Top 5% admits 3%, not
part of the score-2 atom. Never break ties by randomness or rune identifier.

For eight uniform mains with one compatible main, that reading's main supply is
12.5%. A top-5% original-drop allowance can admit the best 40% of that supply if
ties and zero-benefit bodies permit it. At allowance >=12.5%, every positive-score
body of that main can qualify. Main scarcity is part of this measure, not proof
of excellent substats. Main-conditioned quality would answer a different question.

### 5.1 Why the former global maximum is rejected

| Reference group | Mass | Reading A | Reading B |
| --- | ---: | ---: | ---: |
| Ordinary | 90% | 0.1 | 0.1 |
| A specialists | 4% | 0.9 | 0.1 |
| B specialists | 4% | 0.1 | 0.9 |
| A maximum | 1% | 1.0 | 0.1 |
| B maximum | 1% | 0.1 | 1.0 |

An A specialist has tail 5% and rank 95 in A. Against `max(A,B)` its tail becomes
10% and rank 90 when B is added. Its usefulness did not change. The revised
reading-local tail stays 5%; adding B cannot revoke A's success. Both readings
attain their normalized maxima; the effect is not caused by an invalid ceiling.

This revision admits 10% for the two uses in this toy population. In general:

```text
max_i P(E_i) <= P(any E_i) <= min(1, sum_i P(E_i))
```

No global `P(selected) <= alpha` is claimed. Independent 5% events give 9.75% for
two uses and 33.658% for eight. Real readings are correlated: compute their union
on common bodies, never by independence or summing marginal tails.

Duplicate events do not increase retention. Broad roles with many distinct builds
can admit more than narrow ones; show their coverage in Statistics and stress-test
this multiplicity. Neither "top 5% overall" nor "keeps 5% per role" is accurate:
allowance is per reading with original-drop mass. A global cap or demand allocation
would be another policy with an explicit coverage tradeoff.

## 6. Retention policy and preserved choices

A reading's rank combines the actual set and **whole build's** main preferences
through the existing worse-rank rule. Intangible's set side is always preferred;
its main/build rank still matters. Do not penalize set and main independently.

```text
m = selected Intangible factor for Intangible; otherwise 1
r_i = selected preferred/accepted/broken tail factor for reading i
alpha_i = min(1, alpha * m * r_i)
```

A forbidden rank fails permission; it is not a tail of zero. Even an
above-reference candidate cannot qualify through it. Set identity never changes
`Q_i`. No four-piece multiplier is introduced.

Proposed definitions preserve each stored control's stop index. They are product
choices, not equivalent numerical translations of old score discounts:

| Stop | Base tail | Existing Chance requirement | Accepted factor | Broken factor | Intangible factor |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20% | 1% | 1.00 | 0.90 | 1 |
| 2 | 10% | 5% | 0.95 | 0.85 | 1.5 |
| 3 | 5% | 20% | 0.85 | 0.80 | 2 |
| 4 | 2% | 50% | 0.70 | 0.65 | 3.5 |
| 5 | 1% | 80% | 0.55 | Forbidden | 5 |

Columns are independent controls, not five combined presets. At base 5%, accepted
factor 0.85 means top 4.25%; Intangible factor 2 means top 10%; together they mean
top 8.5%. Multiply tails, never ranks. The Intangible premium is a chosen retention
preference, not a measured scarcity ratio or promise of twice as many survivors.

Keep the production domain `0 < alpha <= 1`, `0 < beta <= 1` and positive finite
permitted factors. Rejection is explicit; do not use zero as a magic disable or
allow-all value. At `alpha_i=1` a useful legal body can qualify, an unusable one
cannot. A stronger Ancient or already-crafted body may have tail zero and rank
100: above this reference support, not perfect or certain while unfinished.

Keep the user's stored stop selections and explain their new numerical meaning.
Never reinterpret a saved potential-efficiency percentage as a percentile.
Validate each preference independently, preserve empty lists and blank versus
explicit zero, and introduce no format/schema/database version machinery. New
independent fields default independently; unrelated choices never reset.

## 7. Conditional power-up Chance and displayed readings

Let `X_l` be the observed rune at actual level `l`, and `Y` its legal terminal
sub-property body projected to +15. For fixed calculation inputs:

```text
E_i(Y) = reading i is permitted
         AND H_i(Y) is finite
         AND A_i(u_i(Y)) <= alpha_i

C_i(X_l) = P[E_i(Y) | X_l]
C_any(X_l) = P[any i: E_i(Y) | X_l]
PotentialRank_i(X_l) = max over reachable useful Y of Q_i(u_i(Y))
```

The unprotected chance gate is `C_any >= beta`. Retain positive beta; `0 >= 0`
must never admit an impossible rune. No useful reachable reading is a valid
unusable result, distinct from missing configuration or malformed data (§8).

For mutually exclusive events at 3% each, the union is 6%, not maximum 3%.
For identical events it remains 3%. Different successful readings may require
different Gem placements; their shared terminal body counts only once.

Chance is **power-up success under canonical craft credit**. At +12 and above,
valid Chance is 0 or 1 because no random sub-property events remain. Real crafts
can still miss credited values. Actual craft success needs a separate distribution,
budget and retry policy. Expected utility and Potential rank are not that chance.

For finished runes, display the best `Q_i` among permitted useful readings and
identify its witness reading. For unfinished runes, display the maximum
`PotentialRank_i`, also identifying its witness. The table's **Chance for any
role/build** can be contributed by other readings. The explanation keeps every
reading's own potential, Chance, cutoff and expected utility together.

Choose a qualifying-use explanation from readings with `C_i > 0`, prioritizing
higher `C_i`, then expected shared utility, then the existing role-order/build tie
rule. It need not individually meet beta when the union does. If no reading has
positive Chance, show the best permitted potential with the failure reason.
An unrelated high rank must not be attached to the role justifying the verdict.

Keep current action levels: qualifying +12/+15 says Keep; +13/+14 says Power up
for deterministic main progress; below +12 says Power up. +15 adds no sub roll.

## 8. Verdicts, safeguards and unavailable calculations

Return a structured state, not just convenient numerical fields:

| State | Advice |
| --- | --- |
| Complete, union meets beta | Keep/Power up by existing level rule |
| Complete, no permitted useful success or union below beta | Sell candidate, subject to protections |
| Missing roles or necessary reference averages | Explain missing input; no calculated Sell |
| Malformed or unmodelled rune mechanic | Visible diagnostic; no calculated Sell |
| Unsettled bounds, worker failure or cancellation | Incomplete/unavailable; no calculated Sell |

A proved successful reading can establish a passing union without resolving
irrelevant readings. Selling requires a certified upper union bound below beta
and no invalid unresolved reading that could supply an unmodelled use. Invalid
readings with legitimate targets cannot silently become zero-weight roles.
Valid intentionally empty roles contribute no event.

During refresh/cancellation keep the previous body and answer together, labelled
with their standards. Never present old advice as fresh for a changed body.
Superseded work cannot commit after an import or edit.

Apply shared protections without altering quality or Chance:

- Pre-grind SPD uses the **observed sub-property base value only**. No innate,
  main, projected upgrade or grind counts. Blank disables; explicit zero remains
  a threshold requiring a SPD sub property.
- Potential efficiency retains the perfect-rune ratio and 1% Chance condition.
  Both belong to the same reading; B's union contribution cannot lend Chance to
  A's efficiency. This 1% stays independent of selected beta.
- Non-Scenario engraving reads the account-wide placement summary, not one preset
  or `occupiedId` alone. Preserve manual holds, locks and Unsellable rules.
- Re-app/Refine targets only replace a calculated sale, Refine before Re-app.
  A protection is not a terminal quality survivor.

A hold remains visible on an invalid/unresolved rune but does not validate its
probability. Count overlapping protection reasons as one protected body.

### 8.1 Reroll potential and craft sequencing

Separate **preservation target** from **action legal now**. The current target
contract can preserve a Legend with four visible lines below +12 while it climbs
to the stone's required level. A lesser rarity's unseen lines must not be invented
to make it a Refine target. An early target instruction must say it needs powering
up, not that the stone can already be used.

The analytical future includes power-up events and comparison craft, not random
Reappraisal or Refinement outcomes. Reappraisal changes sub types and removes craft
effects. Refinement keeps types and grinds, but is barred by a Gem, Ancient lineage
or Intangible. Both have the canonical +12 usage requirement; Intangible permits
neither. Refinement's acceptance/refusal behaviour is not established and must not
be guessed.

A projected Gem is not an observed conversion. Do not mutate imported markers,
erase Refine protection, spend inventory or recommend a Gem before considering an
applicable reroll target. A real Gem locks reconversion to its line and bars Refine;
a Grindstone does not bar Refine. Action legality reads actual state and its owner.

## 9. Exact candidate futures

Read the canonical schedule, not current colour or guessed history. Rarity is
original `extra`; `rank` is not rarity. Improvements precede additions, so a new
line cannot receive a later improvement in the current schedule. With `b` held
lines and `u` remaining improvements, allocation vector `n` has:

```text
sum_j n_j = u
P(n) = u! / product_j(n_j!) * (1/b)^u
number of allocations = choose(u+b-1, b-1)
```

Legend +0 has 35 allocations instead of 256 ordered target histories; Hero +0
has 10 instead of 27; Rare +0 has 3 instead of 4. At `u=0`, use one no-upgrade
allocation, including `b=0` for Normal. `b=0,u>0` is invalid, not division by zero.

Convolve each line's integer roll distribution `G_j(z)` to `G_j(z)^n_j`, shifted
by observed base values. For `a` additions from `L` legal types, an unordered
subset has probability `1/choose(L,a)`; integrate its initial values. An impossible
addition count is invalid, not truncated to the pool size.

The pool excludes actual main, innate and held types, plus slot restrictions.
Slot 1 forbids flat/percent DEF; slot 3 forbids flat/percent ATK. An innate never
upgrades, takes no craft item and bars its stat from sub properties/conversions.
Observed base and grind stay separate.

Ancient born lines/innate have higher initial ranges; **every future addition and
upgrade uses ordinary six-star ranges**. Observed born values are not redrawn.
Lower-star ordinary candidates use their own ranges. No item-lineage fallback.

At every terminal vector evaluate permitted readings through the shared craft
policy, query their individual tails, and accumulate the union once:

```text
C_any = sum_n P(n) * sum_B P(B) * sum_values P(values | n,B)
        * indicator(any E_i(terminal vector))
```

Do not merge states merely because scalar weighted scores match: Gem legality
depends on the complete vector. Keep lineage, converted-line location and existing
grinds. A merge requires identical future transitions and terminal readings.
Historical roll counts may be absent; never infer a unique history from a total
or require Simulator-only `rolls` metadata to judge an imported rune.

Validate schedule line counts, legal ids, finite integer values, main/innate
exclusions and conversion restrictions before solving. Multiple converted lines,
a Gem below its legal level, a grind on an ungrindable stat or +12 with fewer
than four lines is a diagnostic. Do not inherit `emptyInterval` or
`Math.min(additions,pool.length)` repairs. Do not reject a valid rerolled body
merely because it cannot be reconstructed as an untouched original birth.
Unknown histories/reroll rules need evidence, not invented legality.

### 9.1 Rare-tail fixture

A Legend starts with SPD 4 and has four upgrades. Final raw SPD >=27 requires
four SPD hits with increment sum >=23: four sixes, or three sixes and one five.

```text
P = (1/4)^4 * 5/3^4 = 5/20,736 = 0.02411265432098765%
```

This is a conditional raw-SPD fixture, not a crafted percentile or drop rate.
In 4,096 independent samples the probability of no success is about 37.24%.
Zero sampled hits do not prove impossibility. Preserve the positive analytical
mass; a Gaussian approximation is not an acceptable rare-tail substitute.

## 10. Reference queries and numerical certification

Integrate main, rarity, innate, born types/values and the shared future solver.
An incompatible main retains original mass with `H_i=-infinity`. Generator and
solver use one finite distribution description, not copied probability tables.

Reference tails are **marginal per reading**, with no global maximum-score CDF.
Candidate/Statistics unions remain joint because readings share one body's future.
Reuse legal structures, convolutions and identical utility queries; numerical
deduplication never merges different permissions or removes role identities.

### 10.1 Score equality

Use the shared terminal kernel and current finite binary64 utility, with lines
and sums in canonical stat-id order, fixed craft tie breaking and identical
operand/order rules in candidate and reference. This defines score equality for
the initial implementation. Bounds must enclose that **actual computation**,
including intermediate rounding, not a different real-arithmetic expression.

No general epsilon, rounded-score bucket or reference-only weight formula.
Different summation orders can split a real-arithmetic tie; permuted equal bodies
must use the same canonical kernel. Rational utility would be a deliberate change
to the shared weight/craft contract, not a solver-only shortcut.

Pruning encloses the corrected terminal score and craft choice, including placement
and same-stat eligibility boundaries. Prove its monotonicity rather than inheriting
the current engine's assumption: the current ordinary-choice/Ancient-pricing policy
fails it (§4.1). Bound all possible placements where needed. Never print an
optimistic score bound as the actual result.

### 10.2 Probability bounds

Use integer/rational masses where practical, otherwise directed numerical error
bounds. Discrete states do not make arbitrary JavaScript arithmetic exact. Query
upper tails directly; do not lose small positive mass by subtracting an almost-one
lower CDF, underflow, or clamping to zero.

For terminal score interval `[v_low,v_high]`, monotonicity gives:

```text
A_i(v_high) <= A_i(u_i(Y)) <= A_i(v_low)
```

Include reference-query errors. A reading passes only when the upper tail bound
is <= alpha_i, fails only when its lower bound is > alpha_i; otherwise its mass
stays unresolved. Handle any interval crossing the useful-score boundary as
unresolved until usefulness is proved. A body passes when any reading passes;
it fails only when all permitted readings fail.

Sum proved success into `C_low` and unresolved mass into `C_high-C_low`. Pass
only if `C_low >= beta`; propose Sell only if `C_high < beta`. Equality belongs
to passing. Resolve residual equality exactly under the defined kernel or report
Calculation incomplete. Time/memory limits never justify Sell.

Tail bounds `[a_low,a_high]` imply rank bounds
`[100*(1-a_high),100*(1-a_low)]`. Score error at an atom can move its **whole mass**,
even with tiny probability-summing error. Independently test exact ties, nearly
equal scores, alpha/beta equality and the usefulness boundary.

### 10.3 Feasible computation

Cache convolutions and reading queries. Use certified early decisions, state
sharing and adaptive integer-range splitting near active thresholds. Thirty-five
allocations do not mean thirty-five terminal vectors: flat HP ranges alone contain
hundreds of values per roll. Avoid an unbounded Cartesian loop for every reading.

Prototype in a cancellable CPU worker. Keep the common acceleration door and
report which engine answered. A sampling shader is not an exact backend. Any
future card implementation must prove kernel/bound agreement on the user's card.
Measure worst cases before replacing the current engine.

## 11. Statistics and the investment funnel

Top 5% describes an individual terminal reading requirement, not 5% globally,
of the current box, or surviving the investment policy. For terminal union `E`
and chance gates `B_l` at the decision points:

```text
P(qualifying funnel survivors) = P(E AND every B_l) <= P(E)
```

Example: 10% of births are promising with 50% terminal success each; all others
have none. Terminal success is 5%. Beta 20% invests and can realize 5%; beta 80%
sells all at the start. Neither changes the quality ruler. Do not refit ranks to
compensate for early sales. Economic mana/opportunity costs remain unmodelled.

Define the proposed full funnel at +0/+3/+6/+9/+12, checking policy after every
new sub-property event. +15 adds deterministic main progress only. Existing
+0/+9/+12 summaries can remain summaries, but cannot be called an every-decision
funnel while skipping +3/+6 sales. Condition off-checkpoint candidates on their
actual observed states.

Propagate **one latent body path**, selling branches when conditional union fails.
Never multiply marginal checkpoint survival rates. Reusing a seed is insufficient
if independent generation calls consume draws differently or omit state updates:
each checkpoint must be a prefix of the same birth and roll history. For a fixed
terminal event test the tower identity:

```text
C(X_l) = sum_next P(next | X_l) * C(next)
```

Observed rolls can raise or lower Chance; the identity concerns its conditional
expectation. Individual Chance is not monotone with power-up level.

Report per-reading supply, role/build coverage, terminal union, investment per
checkpoint, qualifying funnel survivors and extra protected survivors. Count
bodies once. Apply synthetic protections only where their inputs exist. Actual
locks, holds and Scenario/preset placements belong to current-account counts,
not invented synthetic frequencies. Protection-reason counts are not additive.

Terminal and conditional answers may be analytical while a costly funnel remains
an explicitly labelled estimate. Sampling error, certified numerical bounds and
uncertainty in game assumptions are distinct; identify each. Monte Carlo remains
an independent validation tool, not the definition of quality.

## 12. Presentation, state and caches

Recommended wording, with reading details in the explanation:

```text
Quality requirement: Top 5% for a role/build
Chance required: 20%
Potential rank: 98.4 for Fast DD, ATK % / CRI Dmg / ATK %
Chance for any role/build: 37%

Compared with modelled ordinary 6-star births in slot 4.
Each reading retains all legal mains in its reference denominator.
This Intangible reading has a top-10% allowance.
Chance covers power-up rolls with assumed Legend craft credit.
It excludes the chance of obtaining or rolling those craft items.
```

Finished bodies say Quality rank. Potential rank is best reachable quality, not
present strength, expected rank or probability. Expected rank and rank of expected
utility are different diagnostics; do not substitute either silently.

Show each reading's own cutoff and Chance beside its quality. A high rank for a
forbidden or stricter reading does not justify a verdict for another. Explain
policy restrictions and unions instead of displaying apparently contradictory
numbers. Several readings may jointly justify Power up without any one meeting beta.

Round displayed rank/Chance down at displayed precision; use unrounded certified
comparisons and expose extra digits/intervals near boundaries. Rank 94.96 must
not print 95.0 beside Sell at requirement 95. A tiny positive Chance is not an
exact zero. Reserve space for precision, long names, missing states and explanations;
selection never resizes/reflows neighbours. Inclusive filters keep actual selected
controls and use the shared empty/whole-group interpretation.

Cache each reading's distribution by slot/class, actual main compatibility,
complete weights/reference bases, canonical scoring/placement contract and model
parameters. Other roles, permission ranks, alpha/beta, filters, placements,
protections and hardware preference do not move that reading's ruler. An import
can change roster averages and invalidate affected readings even though rune
inventory is excluded from the reference key.

Cache futures by the relevant full body, including lineage, original rarity,
level, main, innate, base values, conversion and observed grinds, not id alone.
Permission/policy edits can reuse futures but recompute events. Retain role
identities/tie order outside deduplicated numerical work. Never mix bodies,
policies or reference inputs from separate requests.

## 13. Implementation and acceptance evidence

1. Expose a shared finite distribution for generator/solver; retain existing
   interval, schedule and craft-table owners. Prototype without import changes.
2. Specify canonical kernel equality and sound bounds; reproduce ordinary/Ancient
   craft cases before adding marginal tails.
3. Implement reading tails and small candidate futures. Expand from finished
   bodies/one event to all stars, levels and rarities, with independent ordered
   trees as an oracle rather than another caller of the DP.
4. Add common-body union and safeguards through one advice API. Retire fitted
   floors and Gaussian percentile claims deliberately. Table, overlay, Simulator,
   Statistics and craft consumers must agree on the shared question.
5. Add Statistics and presentation/state contracts, preserve individual choices,
   and update every label reference together.
6. Benchmark and inspect changed-sale categories locally before replacement.

Proposed evaluation budgets: 3,000 warm judgments in two seconds, selected cold
reference queries in five seconds, cancellation reported within 100 ms of the
request on the benchmark machine, and a measured stated peak-memory budget.
Cancellation checks/yields must also occur during cold reference work and inner
loops; measuring only time after the next check would conceal blocking. These
are targets, not results.
Include flat-stat intervals, nearly identical readings, broad main choices, large
atoms, all stars, Normal/Magic +0 and repeated edits during cold queries. Frequent
incomplete results make the feature unready; do not substitute sampling silently.

| Property | Required evidence |
| --- | --- |
| Probability conservation | Birth/transition/terminal mass sums to one within certified bounds |
| Small exact cases | Independent ordered trees agree, including `5/20,736`, no upgrades and multiple additions |
| Reading calibration | Selected mass <= each reading allowance; global union reported separately |
| Specialist preservation | Adding an unchanged use cannot revoke an existing event or reduce union Chance |
| Breadth/deduplication | Identical events deduplicate; distinct builds expose combined coverage without a global count promise |
| Correlation | Identical, overlapping and disjoint events; alternative Gem placements do not duplicate mass |
| Main denominator | All mains retain mass; wildcard expansion preserves unstated-main weight semantics |
| Usefulness | Zero-benefit, illegal scale and missing reference are distinct; rare mains cannot make zero benefit useful |
| Terminal determinism | Valid +12–+15 Chance is 0/1 under credit, without implying deterministic real crafting |
| Ties/bounds | Canonical ordering, close scores, atom boundaries, alpha/beta equality, usefulness boundary and sound pruning |
| Policy monotonicity | Tighter allowances/higher beta never admit a previously failed unprotected rune under fixed inputs |
| Rank changes | Preferred/accepted edits change policy, not an unchanged reading's ruler |
| Craft agreement | Corrected shared policy versus exhaustive legal bodies, lineage, converted line, strict same-stat improvement and retained/lost grinds |
| Body improvement | Increased base under fixed constraints never lowers utility/rank, or Chance with the same future kernel; Ancient 26.7→26.6 regression must pass after the shared-policy correction |
| Ancient/lower stars | Born/future intervals, item lineage, class labels and above-reference rank 100 |
| Rerolls | Early preservation versus +12 usage, no projected-Gem mutation, Refine/Re-app legality and precedence |
| Protections | Same-reading efficiency/1% rule, observed sub SPD only, every placement and unique override counts |
| Funnel | One path, all stated checkpoints, off-checkpoint states, tower identity and early sales |
| Invalid/unavailable | Missing interval, insufficient pool, illegal types/counts/markers, failure and cancellation never fabricate Sell |
| Cache agreement | Cached/uncached equality; changed body/base/policy cannot accept stale work |
| Empty/full input | No import/roles, met targets, blank/zero fields, all mains, many readings, long names and large values |
| Sensitivity | Declared alternative models expose verdict dependence on unsupported assumptions |
| Preference survival | Unrelated saved choices survive; efficiency is never reinterpreted as percentile |

Capture a fresh cleanup equivalence baseline before engine changes and explain
each changed category. Run required weight, neutrality, craft, probability,
monotonicity and chance-stability checks. Replace calibration assertions with
proved reading-local/joint-event invariants; never weaken checks just to accept
output. Existing craft-monotonicity obligations retain their own fixed-reference
question; there is no new configurable Clean-up craft credit.

Use actual local runes for validation if available, especially newly sold SPD
specialists, Ancient, converted/ground, low-star and reroll-target runes. Inventory
is evidence, not the ruler. Record missing account evidence if none is available.
No personal data is transmitted. Run import parity after reader/vocabulary/
eligibility changes; absent capture is a skip. Implementation's visual checks use
project Playwright at localhost:3000, empty/full flows and before/after layout checks.
No game request, retry, changed response or automated game input is allowed.

## 14. Additional game-mechanic limits

| Risk | Required boundary |
| --- | --- |
| Intangible treated as universally usable | Preferred set rank is retention policy. A real build allows at most one; it supplies one missing piece, and several sets each one short can leave it completing none. Percentile does not certify build legality. |
| Set size/battle effects become hidden bonuses | No invented universal utility for four-piece scarcity or Violent/Will/Despair effects. Actual completed sets remain build questions. |
| Main projection becomes randomness | Main +15 is deterministic; present stats, finished-build valuation and action level remain distinct. |
| Grinds counted twice or erased | Keep base and grind separate, preserve existing floors on same-stat Gems, lose them on changed type, then apply shared credited floor only. |
| Gem goes on any weak line | An observed conversion locks reconversion to that line. Same-stat Gem strictly raises base; main/innate/other-line exclusions still hold. |
| Retention score implies combat improvement | CRI Rate/RES/ACC caps, area ACC, actual bases, leader/team effects and exact speed thresholds belong to shared combat/build models. Linear retention surplus is no combat forecast. |
| Family average guarantees every monster | Flat/percent value and needs depend on actual bases. Roster changes can legitimately change ranks; averages are declared surrogates. |
| Reroll odds are assumed known | Use preservation rules only; do not invent outcome distributions, refusal behaviour or birth-history reconstruction of rerolled bodies. |
| Candidates outside synthetic birth support disappear | Normal/Magic, odd Rare, Ancient and valid modified candidates remain reachable. Zero reference birth mass is not illegal ownership. |
| Comparison craft becomes a spending instruction | Credited craft can be unavailable, costly or destructive of reroll options. Actual actions use shared craft/reroll legality and the observed body. |

No checklist proves every future mechanic covered. Unknown legal ids/ranges/states
must surface and block a Sell calculation for the rune until passive evidence
establishes the rule. Never manufacture requests, read game-process memory,
negotiate keys or automate play to obtain it.

## 15. Evidence and reproducibility

This revision follows [RUNE-CANONICAL.md](RUNE-CANONICAL.md),
[RUNE-CRAFT-ITEMS.md](RUNE-CRAFT-ITEMS.md), the cleanup contracts and shared modules
inspected November 16, 2026. It establishes no new game rule or drop rate; the
canonical documents retain their evidence and unresolved details.

[SWCalc's mechanics reference](https://swcalc.cz/game-mechanics) and
[SW Exporter's mappings](https://github.com/Xzandro/sw-exporter/blob/master/app/mapping.js)
were rechecked November 16, 2026. SWCalc supplies combat formulas and SWEX encoded
vocabulary/tables; neither establishes the full joint birth distribution or
validates this synthetic odd/even rarity mixture.

The Ancient reversals in §4.1 were reproduced against the current module. Separate
enumeration of legal realized Gem bodies under actual-lineage canonical credit
confirmed proposed scores 14.7 and 26.7/26.7. This validates the worked examples,
not the unimplemented general solver or every proposed monotonicity property.

This dependency-free Node fixture checks the specialist example, union, tie
deficit, main denominator and rare tail. It is not a production solver or benchmark:

```js
import assert from 'node:assert/strict';
const bodies = [
  { mass: 90, a: 0.1, b: 0.1 },
  { mass: 4, a: 0.9, b: 0.1 },
  { mass: 4, a: 0.1, b: 0.9 },
  { mass: 1, a: 1.0, b: 0.1 },
  { mass: 1, a: 0.1, b: 1.0 },
];
const mass = predicate => bodies.reduce((n, x) => n + (predicate(x) ? x.mass : 0), 0);
const tail = (key, score) => mass(x => x[key] >= score);
assert.equal(mass(() => true), 100);
assert.equal(tail('a', 0.9), 5);
assert.equal(mass(x => Math.max(x.a, x.b) >= 0.9), 10);
const event = (key, x) => tail(key, x[key]) <= 5;
assert.equal(mass(x => event('a', x)), 5);
assert.equal(mass(x => event('a', x) || event('b', x)), 10);
assert.equal(mass(x => event('a', x) || event('a', x)), 5);
for (const allowance of [1, 2, 5, 10, 20, 100]) {
  assert.ok(mass(x => tail('a', x.a) <= allowance) <= allowance);
}
const atoms = [{ score: 0, mass: 70 }, { score: 1, mass: 20 },
  { score: 2, mass: 7 }, { score: 3, mass: 3 }];
const atomTail = score => atoms.reduce((n, x) => n + (x.score >= score ? x.mass : 0), 0);
assert.equal(atoms.reduce((n, x) => n + (atomTail(x.score) <= 5 ? x.mass : 0), 0), 3);
assert.equal((1 / 8) * 0.4, 0.05);
let successes = 0;
for (let a = 4; a <= 6; a++)
  for (let b = 4; b <= 6; b++)
    for (let c = 4; c <= 6; c++)
      for (let d = 4; d <= 6; d++)
        if (a + b + c + d >= 23) successes++;
assert.equal(successes, 5);
assert.equal(successes / (3 ** 4 * 4 ** 4), 5 / 20736);
console.log('Passed reading, union, tie, denominator and rare-tail fixtures.');
```

For scale, independent sampling at true share 5% has approximate 95% half-width
`1.96*sqrt(0.05*0.95/N)`: 1.744 percentage points at N=600, 0.667 at N=4,096,
0.0427 at N=1,000,000. These are illustrations, not measured errors for current
deterministic stratified calibration. Analytical integration removes sampling
error, not uncertainty in the game model or utility.

## 16. Review resolution and remaining gates

| Finding | Incorporated response |
| --- | --- |
| Global maximum sacrifices specialists | Reading tails; monotone addition of uses; global retention guarantee removed (§§1, 5) |
| Craft policy understates or reverses Ancient value | Required shared lineage-specific canonical placement; 14/14.7 and 26.7→26.6 regressions (§4.1) |
| Chance implies real craft success | Rounded-midpoint credit distinguished from power-up randomness (§§4.1, 7) |
| Unsupported probabilities look exact | Synthetic support/assumptions and sensitivity evidence explicit (§3) |
| Score ties lack a numerical contract | Shared canonical kernel, error bounds and equality checks (§10) |
| Best role borrows another's figures | Quality witness separated from union Chance; individual figures remain together (§7) |
| Invalid data becomes Sell or disappears | Structured unavailable states; no silent future repairs (§§8–9) |
| Safeguards mix units/chances | Existing units, same-reading 1% rule and separate unique override counts (§8) |
| Further game/flow risks | Wildcard mains, reroll sequencing, every-event funnel, latent paths and caches (§§4, 8, 11–14) |
| Unsupported current four-piece claim | Corrected baseline; no implicit set-size premium (§§2, 6) |

These choices settle what this revision proposes. They do not prove that all
blockers have been experimentally resolved. Implementation still requires a
shared-kernel/bounds prototype, independent exact small-tree agreement, sensitivity
results, worst-case performance/cancellation evidence and local-account changed-sale
review where data is available.

Before replacement, update owning cleanup math/interface contracts, score and
probability APIs, Statistics, safeguards and all consumer/test references together.
Do not change the game canon to make a product policy look like a game rule.
This revision changes the proposal only; production code/preferences are unchanged.
No publication or game interaction is authorized by this document.
