# Rune quality floor — five useful steps

**Reviewed:** 10 October 2026  
**Calculation contract:** `RUNE-CLEANUP-MATH.md` §9

The requested upper stops are 65 %, 75 % and 85 %. The lower stops are 45 % and
55 %, giving one ten-percentage-point progression:

| Stop | Meaning | Minimum discounted Max value |
| --- | --- | --- |
| 1 | I'm a newbie | 45 % |
| 2 | Been playing for a while | 55 % |
| 3 | I've got good runes | 65 % |
| 4 | G1 baby | 75 % |
| 5 | You've seen my replays | 85 % |

These are quality anchors, not percentiles or promised keep rates. Slot balance
may tighten them. Accepted and Broken discounts still apply, and unfinished
runes must also satisfy the independent Power-up policy. A control rune with
SPD +4, RES +7 %, ACC +7 % and ATK +5 % showed an 85.0 % selected minimum and an
87.1 % actual requirement after slot correction. The overlay states both.

## Why 45 % and 55 %

The beginner reference is a player holding five-star runes and some six-star
Rare and Hero runes. It informs the policy; it adds no star- or grade-specific
exception to scoring. Each rune retains its own star-class yardstick, and a
Rare or Hero rune has fewer upgrades than the Legend-born perfect reference.

The check generated 8,064 ordinary bodies: 672 per slot at each of five and six
stars, completed at +12. It used the canonical generator's mixed grades and
cycled legal mains, seed offset 900,000, the shipped roles and the reference
family stats used by the equivalence check. Active craft was Hero/two-thirds;
the comparison ruler remained Hero/three-quarters. Every compatible build was
priced by the existing scorer, with the usual 85 % Accepted and 80 % Broken
worth. This is a model experiment, not measured game drop data.

Before slot correction, the share clearing each anchor was:

| Population | Bodies | At 45 % | At 55 % |
| --- | ---: | ---: | ---: |
| Five-star Hero | 2,520 | 74.1 % | 49.8 % |
| Six-star Rare | 504 | 30.8 % | 8.1 % |
| Six-star Hero | 2,520 | 74.0 % | 48.5 % |

Among six-star Rare bodies with at least one Preferred reading, the corresponding
shares were 58.2 % and 26.2 %. Thus 45 % permits useful beginner Rare runes without
accepting almost every usable one; 55 % makes a substantial next step. A 35 %
anchor would admit 92.6 % of those Preferred Rare bodies and 80.8 % of all
six-star Hero bodies. That is a weaker quality distinction than the reference
calls for. Choosing the lower stops remains a product judgement, not a theorem
about player progression.

The actual finished-rune Keep counts, including slot and set corrections, were:

| Population | At stop 1, other controls at defaults | At stop 2, other controls at defaults | At stop 1, policy/Accepted/Broken at stop 1 |
| --- | ---: | ---: | ---: |
| Five-star Hero | 435 / 2,520 | 182 / 2,520 | 974 / 2,520 |
| Six-star Rare | 25 / 504 | 5 / 504 | 153 / 504 |
| Six-star Hero | 250 / 2,520 | 107 / 2,520 | 814 / 2,520 |

These counts concern already-completed bodies. They are not the survival rate of
the +0 → +9 → +12 selling funnel. The independent slot-policy holdout checks that
whole funnel; sparse upper-stop survivors cannot establish slot evenness.

The first stop is consequently compatible with the beginner reference, but it
does not override demanding choices elsewhere. No saved setting, role or preset
is reset to achieve these counts.

## Why the overlay stopped quoting a top percentile

One in 1,000 is 0.1 %. However, one-decimal rounding prints any positive share
below 0.05 % as `0.0 %`; the display alone cannot establish zero probability.
The former label also used an approximate reference distribution with truncated
Gaussian kernels, so merely adding decimals would still overstate its accuracy.

A speed-only role supplies a direct counterexample with positive reference stats:
the diagnostic share is exactly zero at both 85 % and 90 %, yet the same slot-1
Legend line-up starting at SPD +4 can reach 94.1176 %. With neutral SPD grind +4,
reaching 90 % requires all four upgrades to land on SPD and their rolls to sum to
at least 23. Of the 81 equally likely sequences of four rolls from {4, 5, 6},
five qualify: four sixes, or three sixes and one five. Its conditional probability
is therefore `(1/4)^4 × 5/81 = 5/20,736`, or 0.0241127 %, strictly positive.
This disproves interpreting the diagnostic zero as impossibility without relying
on a lucky Monte Carlo sample.

At the former 90 % floor, a separate control account reproduced the screenshot's
Destroy line-up. Both level-40 reference monsters had HP 10,500, ATK/DEF 700,
SPD 105, CRI Rate 15, CRI Dmg 50, RES 15 and ACC 0; roles and other settings were
the defaults. Def-tank was selected. The diagnostic reference share was
0.0190452 %, printed as `0.0 %`. A separate 100,000-body Legend-only slot-1
reference sample, scored across the same role's compatible builds at the neutral
craft credit, had 71 bodies at or above 90 %: 0.071 %. This is sampling evidence
of an inaccurate tail estimate, not an exact population percentile.

The existing rune's future asks a different question. Independently aggregating
its four remaining upgrade events produced 2,761 distinct final stat vectors.
Each target and each legal integer roll was weighted by the contract's uniform
probabilities, and the existing scorer priced the completed vectors with active
craft credit. Their passing probability at 90 % was 0.0990201 %. The engine's
4,096-run estimate was 3/4,096, or 0.0732422 %, compatible with that sparse count.
Its maximum was 97.4050 %, so reaching 90 % was possible but rare. These control
figures do not determine the user's own account's odds: its reference monsters,
roles and settings were not available.

## Fresh equivalence record

A fresh pre-change baseline was captured deliberately before editing the ladder:
582 legal runes across eight settings/role scenarios. The same population was
recorded after the change. Both runs passed their degenerate-input checks.

| Capture | SHA-256 |
| --- | --- |
| `work/rune-quality-floor-before.json` | `d867dd484975e841a0e8370eca5856946b9056a9f60126ebdbc09fe9553ad823` |
| `work/rune-quality-floor-after.json` | `452ea41efb4d998bc514d1d23cb9acda8004c10ff98259f26aedc7cf216537c9` |

The old baseline is intentionally not an equality target for a policy change.
At maximum craft, the middle stop's higher minimum changed 127 verdicts:
173 Power up / 83 Keep became 87 Power up / 42 Keep. The permissive scenario's
higher beginner minimum changed 49 verdicts: 46 Power up / 16 Keep became
12 Power up / 1 Keep. The strict scenario had no survivors on either side, so
its unchanged result is not evidence that lowering the top stop does nothing.
Seven Best role labels changed because different readings cleared the gates.
Other scenarios kept their verdicts, although some chances changed with their
actual floors. No scorer or power-up event rule changed.

The captures remain local under `work/`; their fresh hashes and the deliberately
changed results are recorded here with the policy change.
