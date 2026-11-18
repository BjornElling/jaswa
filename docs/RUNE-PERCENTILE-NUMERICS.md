# Certified rune reference reuse

**Status:** Superseded on November 18, 2026 by
[RUNE-PERCENTILE-SAMPLED-PLAN.md](RUNE-PERCENTILE-SAMPLED-PLAN.md), which replaces
certified bounds with a fixed sample. It describes the experimental exact engine
that is still in the tree, and is deleted with that engine (plan §6, step 6).

The scoring and equality contract is still the shared canonical binary64 kernel.
These bounds save work; they do not define another score or population.

## Comparing two price tables

For one fixed ordinary reference body, every legal realized Gem body is available
to both readings. Its exact, nonnegative weighted sum is linear in the prices.
If componentwise price ratios lie between `a` and `b`, their maxima obey
`a * L_old <= L_new <= b * L_old`. Missing positive support prevents the relevant
one-sided bound; it is never filled in or guessed.

The implementation includes five multiplications and four additions. Let
`u = 2^-53`, `gamma = 9*u/(1-9*u)` and `delta = 10*2^-1074`. For each legal
body and therefore for the maximum over them:

```text
(1-gamma)*L - delta <= S <= (1+gamma)*L + delta
```

The relative-error and underflow models follow Rump's equations 2.2–2.4 in
[Error estimation of floating-point summation and dot product](https://www.tuhh.de/ti3/paper/rump/altRu11.pdf).
Five product underflow errors, each at most half an underflow unit, propagate
through at most four positive additions by a factor below two. The chosen
absolute allowance exceeds that total. Integer property and credited craft
values below `2^40`, and prices at most `2^900`, keep these calculations finite.
The fast path verifies these guards and otherwise leaves the ordinary solver
responsible for the query.

Eliminating the exact sums gives bounds on the actual old and new kernel scores:

```text
A = a*(1-gamma)/(1+gamma)
B = b*(1+gamma)/(1-gamma)
A*S_old - delta*(A+1) <= S_new <= B*S_old + delta*(B+1)
```

For a positive new-score cutoff `t`, an old score at least
`(t + delta*(A+1))/A` is sufficient; one at least
`(t - delta*(B+1))/B` is necessary. The sufficient cutoff rounds upwards and
the necessary cutoff downwards using exact rational arithmetic. A nonpositive
necessary cutoff admits the entire compatible main mass. These directions retain
whole atoms at boundaries. A bound overlapping the allowance cannot decide the
reading and falls back to its own calculation.

## Cache boundaries

Reuse is opt-in for the canonical craft callback. Arbitrary monotone oracle
callbacks do not qualify. Peers must have identical slot, star class, actual main,
rarity mixture, innate probability and complete main probabilities. A role id,
permission, alpha or beta never substitutes for any of those inputs.

The cache stores actual score endpoints and exact masses. It does not round
scores into buckets. Numerical identities remain separate from role/build
identities. A bounded registry retains only price metadata and endpoint indexes;
it retains no rune body or role callback.

`verify:rune-percentile-boundaries` checks the coupling against complete shared
scores, including subnormal products and placement changes. It also compares a
reused SPD reference with an independent ordered-roll oracle and verifies that
changing the rarity mixture prevents reuse of the old probability measure.

## Shared policy boundaries

The account experiment prepares a reference without using any candidate
score. For each legal type and roll allocation it evaluates the lowest and
highest terminal utility using the canonical scorer. The whole structure mass
belongs to each endpoint index. The lower index bounds the inclusive tail from
below and the upper index bounds it from above. Unvisited compatible mass
has no positive lower endpoint and has an infinite upper endpoint.

For each index, sort the actual scores descending and accumulate their exact
masses. The crossing atom is the first atom whose cumulative mass is
**greater** than the allowance. A score at or below the lower crossing atom
fails. A score strictly above the upper crossing atom passes. We represent
the latter comparison with the next binary64 score so ties stay together and
an inclusive tail exactly equal to the allowance still passes. A missing
crossing atom is represented by zero since only positive scores are useful.
An infinite upper crossing atom establishes no finite passing score.

The prototype reuses the bracket for every candidate with the same numerical
reading and allowance. Candidate boxes between the two boundaries are
unresolved. If a box is wholly inside that gap, subdividing its roll ranges
cannot add a proof for that reading. For unfinished runes the solver still
traverses one shared set of outcomes and counts an outcome once in the union.
The remaining mass stays in the upper bound if an early stop proves the
verdict. Display ranks in this mode can consult existing reference evidence
without starting a candidate-specific tail traversal.
