# Rune Clean-up — the calculation contract

**Status:** Binding contract for the Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` (game rules) and `docs/RUNE-PRESET-METRICS.md` (preset composites)
**Reviewed:** 17 September 2026

This document fixes the calculation. It does not fix game rules — `RUNE-CANONICAL.md`
does that, and where the two disagree, that document wins for its own subject.

It replaces `RUNE-POTENTIAL-MATH.md`, which was written before this model existed and
forbade the thing this model does: it ruled that the projection must not use roll
probabilities. It now does, because the probabilities are the only honest way to
separate a rune that will reach a target from one that merely could. The old document
is deleted rather than kept, so that nobody reads a superseded prohibition as current.

`app/lib/rune-cleanup-model.ts` owns the arithmetic and
`app/lib/rune-cleanup-advice.ts` owns the policy. `npm run
verify:rune-cleanup-calibration` is the check.

---

## 0. What is measured and what is assumed

The distinction is load-bearing and appears on The Math page too. A model that hides
its assumptions is one nobody can argue with.

| Fact | Status | Basis |
| --- | --- | --- |
| 6★ sub-property ranges | **Measured** | HP %, ATK % and DEF % roll **5–8**, not 4–8. 489 clean single rolls off a real account contain no 4 at all, which a 4–8 uniform makes a sub-10⁻¹⁵ event. Spokland's 6★ table agrees. `RUNE-CANONICAL.md` §7 corrected. |
| Roll **value** distribution | **Measured uniform** | Prefix values, n = 1,530 — the one property the player's own selection does not reach. Pooled χ² = 52.97, df = 44, **p = 0.17**; HP flat uniform by deciles (p = 0.53). The normalised mean reads 0.481 / 0.488 / 0.492 / 0.523 at +0 / +9 / +12 / +15, i.e. **flat across selection pressure**, which is what rules out bias. |
| 6★ prefix ranges | **Measured** | Identical to the 6★ sub-property ranges. Resolves a conflict between the two published tables, both of which are star-agnostic. |
| Prefix frequency | **Measured** | 51.0 % of ordinary 6★ runes, independent of default grade. |
| Which of the four lines a power-up improves | **Assumed uniform** | No official statement, no datamine, no controlled sample. The universal 1/4 is a convention. |
| Which type a new sub property takes | **Assumed uniform** over the legal types | Likewise. The folklore that SPD is rarer is **not supported**. |

**Neither assumption can be settled from a player's own box, however large.** A box is
what survived the player's own decisions. A χ² on prefix *types* appeared to prove SPD
rare at p < 0.0001 — until splitting by power-up level showed SPD's ratio swinging
1.62 / 0.17 / 0.60 / 0.50 across +0 / +9 / +12 / +15. A game mechanic does not move with
how hard someone selected. The cause: a SPD prefix *blocks SPD as a sub property*, so a
rune carrying one is not worth rolling and sits at +0. That finding was withdrawn, and
it is recorded here because it nearly shipped.

## 1. The reference base line

A preset states whole-monster targets; a rune can only be asked for what its own runes
must find. The difference is the monster's base stats.

- A preset names a family — Attack, Support, Defence, HP, or no type.
- The base line is the average of **the user's own Lv. 40 monsters** of the matching
  SWARFARM archetype. `No type` averages every Lv. 40 monster.
- A family with no Lv. 40 monsters falls back to the roster-wide average.
- **No Lv. 40 monsters at all: the page refuses and says why.** Nothing is invented.

## 2. One currency: the max roll

Every demand and every supply is counted in **max rolls** — how many best-possible 6★
sub-property rolls a quantity is worth.

- A percent stat divides by its own maximum: `ATK % 8 → 8 / 8 = 1.00`.
- A flat stat is first converted to percentage points of the reference base:
  `ATK +20` against a base of 808 is `20 × 100 / 808 = 2.48 pp`, then `2.48 / 8 = 0.31`.

So a maximum flat roll is worth about a third of a maximum percent roll — **derived by
division, not asserted**. SWOP's flat-counts-half convention reaches a similar place by
assertion; this one shows its working and moves with the monster family, which is
correct, because a flat 20 is worth more to a weak attacker than a strong one.

It remains a **convention** that one best SPD roll, one best CRI Rate roll and one best
percent roll are equally valuable. The preset's targets supply the purpose that makes
this reasonable; it is not a claim about the game.

## 3. What the runes must find

A preset allows several main-stat combinations across slots 2, 4 and 6. Each is a
**build**, and a rune is judged against every build its own main stat fits, keeping its
best result. Eight shipped presets give about sixty builds.

```
need(s)      = target(s) − base(s) − setContribution(s)
remaining(s) = need(s) − mainStatContribution(build, s)
R(s)         = max(0, remaining(s)) / maxRoll(s)
```

`max(0, …)` matters: a stat already supplied by base, sets and main stats asks the
sub properties for nothing, and an unclamped negative demand would make a good rune
score below zero.

**`setContribution` is the whole build's sets, not only the rune's own.** A six-slot
build is never one set: a four-piece leaves room for exactly one two-piece, and
two-pieces stack to three (`RUNE-CANONICAL.md` §10). Crediting only the rune's own set
would hold a Fatal rune in a `Fatal / Blade` role to a CRI Rate target that the Blade
half supplies, and sell a rune that is exactly right. The partner is the best-ranked
compatible set the preset asks for.

Judging a Fatal rune assumes the Fatal set gets built, because that is the only reason
to keep it. That is a conditional, not a claim that the account can build it today.

## 4. Each slot's share

`K(s)` is how many of the six slots can legally carry `s` as a sub property in this
build, after the slot bans and each slot's own main property.

```
share(s) = R(s) / K(s)
```

**This dissolves the slot 2/4/6 ambiguity.** A rune's bar never depends on what another
rune turned out to be, because capacity is a fact about the build rather than a guess
about the player.

**It is a planning share, not an optimum.** It treats each stat's capacity as
independent, and real runes couple them: one rune has at most four distinct lines, types
cannot duplicate, and main and prefix remove choices. So the shares can promise more
simultaneous help than six real runes can carry. Stated honestly rather than repaired,
because the per-slot calibration in §8 equalises counts and cannot correct this.

## 5. Scoring one rune

```
fill    = Σ_s min(supply(s), share(s))
ceiling = the best fill a legal rune in this slot could reach in this build
Max value = fill / ceiling
```

Capping each stat at its own share stops five SPD rolls paying for missing HP. Dividing
by `ceiling` guarantees **the perfect rune for a preset reads 100 %**.

`ceiling` spends nine rolls — four initial, four from power-ups, one prefix — across at
most five legal stats, each line capped at five rolls. Greedy allocation is optimal
because each stat's contribution `min(rolls, share)` is concave.

**`ceiling` is per slot and per build, so Max value is a within-build reading.** §9 is
careful never to use it to choose between builds without also applying the chance gate.

### Reaching the ceiling from where the rune stands

Remaining events are `{3, 6, 9, 12}` above the current level. **Improvements come
before additions** (`RUNE-CANONICAL.md` §6): a Hero rune improves at +3/+6/+9 and gains
its fourth line at +12.

**An improvement can only land on a line the rune already has.** Leaving that out made
an early draft report a 68 % ceiling beside a 0 % chance, because the ceiling invented
an SPD line the rune did not own while the chance — correctly — would not.

**Gem** (a stated simplification): replace the least valuable line with the most
valuable legal missing stat, at the slider's assumed roll. **Grindstone**:
`max(existing grind, assumed grind)`, because a rune already ground three quarters of
the way is worth what an unground one is, and adding them would pay twice. The sliders
credit every rune whether or not the account owns a suitable item; that is what the
control means.

## 6. Chance to reach the threshold

`Chance = P(realised fill ≥ threshold × ceiling)` by +12.

Every way the improvements can be spread across the existing lines is enumerated — at
most 35 splits — and **each line's rolls are summed and only then capped** at what that
stat still needs. Additions are drawn without replacement from the legal missing types,
each receiving one roll. The result is read off the tail of a distribution carried on a
0.025-wide grid spanning the four max rolls a rune can still gain.

**Capping each roll separately was a real error and is the failure this section exists
to prevent.** Two improvements into one line would each be credited with closing the
same shortfall, so the chance came out too high and runes that should have been sold
read as worth rolling.

A rune at +12 or above has no events left; its chance is 1 or 0 and the gates collapse
correctly.

## 7. The sliders

| Slider | What it sets |
| --- | --- |
| Rune quality floor | the Max value bar — `[0.41, 0.49, 0.55, 0.62, 0.69]` |
| Power-up policy | the Chance bar — `[0.02, 0.08, 0.20, 0.40, 0.70]` |
| Accepted runes | `[1.00, 0.85, 0.70, 0.55, 0.40]` on a rune the preset only accepts |
| Broken runes | `[0.80, 0.60, 0.40, 0.20, 0]` on one it names neither way |
| Enchanted gems / Grindstones | where in the item's range the credited roll lands |
| Intangible runes | ×1 … ×5 on how many Intangible runes are wanted |
| Keep twice as many 4-set runes | ×2 on runes of a four-piece set |

The rank is the **worse** of the set rank and the main-stat rank. The discount applies
to Max value, and the chance is measured against `bar ÷ discount` so that an accepted
rune is not discounted once in its score and not at all in its odds.

## 8. Shares and slot balance, calibrated

A preset's share, the four-set switch and the Intangible slider say *how many* runes
are wanted, not how good one must be. There is no closed form between the two, so it is
measured: the calibration run scores simulated runes and solves for the multiplier that
makes the kept count scale by each stated factor.

The same run solves a **per-slot multiplier**. Slots 2, 4 and 6 choose their own main
property and a preset names only one or two, so most of their runes are rejected on the
main stat alone. Uncorrected, the best slot keeps **10.7×** what the worst does; after
correction, **1.14×**.

### The calibration run

Fresh runes, no Ancient. Slots 1, 3, 5 at **¾ Hero, ¼ Legend**; slots 2, 4, 6 at
**25 % Rare, 50 % Hero, 25 % Legend**, because those slots are filtered on their main
property first and a lower-rarity rune with the right main is worth rolling. The player
follows the advice exactly — roll to +9, re-check, roll to +12, re-check.

At the middle settings the run keeps **14.2 %** of runes, against a 15 % target, with
slots within 1.16× of each other.

**Calibration is conditional, and its conditions are load-bearing.** It answers: under
these RNG assumptions, this incoming distribution, these presets and these slider
positions, what multiplier gives this retained fraction. It is not evidence that the
underlying score is right, and it cannot repair §2, §4 or §6. Changing the simulated
mix, the presets, or the assumptions in §0 invalidates it.

Two known limits, recorded rather than hidden:

- **The slot multipliers are solved at the middle setting and drift at the ends.** At
  the strictest stop the spread opens to about 4×. One scalar per slot cannot follow a
  distribution whose shape changes with the bar.
- **A broad preset absorbs more than its stated share.** `Bruiser` takes 42.8 % of kept
  runes at ×2, because it is a `No type` role that accepts the widest set and main-stat
  lists and therefore wins the best-preset contest for runes that also fit others. The
  share slider scales a *bar*, not a quota.

## 9. The verdict

In order; the first gate a rune fails is its answer.

1. Not an ordinary 6★ rune → **Not rated**, with the reason named. Ancient runes roll
   from a table no source publishes (`RUNE-CANONICAL.md` §7).
2. Broken and "Broken runes" set to **No** → **Sell**.
3. Max value below the floor → **Sell**.
4. Chance below the policy bar → **Sell**.
5. Level < 12 → **Power up**. Level ≥ 12 → **Keep**.

**The gates are applied to every candidate build, not to a winner chosen first.**
Selecting the highest Max value and then testing its chance would sell a rune whose
best-looking build was a long shot while a slightly weaker one passed both gates. A rune
is sold only when **no** preset and build get it past both.

The row prints the chance itself, never the internal score.

## 10. Adversarial test requirements

| Risk | Test |
| --- | --- |
| +15 counted as a sub-property event | It must never add one. |
| Grindstone counted twice | `max(existing, assumed)`, never a sum. |
| Prefix treated as a sub property | It blocks its own type and takes no roll. |
| Slot 1/3 given a forbidden stat | Both directions. |
| Flat and percent mixed | One canonical unit, percentage points of base. |
| Negative demand | `max(0, …)` before any division. |
| Two rolls credited with one shortfall | The composition enumeration in §6. |
| Ceiling reachable only by an impossible roll | Improvements restricted to existing lines. |
| Discount applied twice | Chance measured against `bar ÷ discount`. |
| Best preset chosen before the chance gate | Existential across builds. |
| Ancient given a numeric ceiling | `class = 16` is never rated. |
| Calibration drifting | `npm run verify:rune-cleanup-calibration`. |

## 11. Change procedure

A change to the calculation updates this document first, then
`RUNE-CANONICAL.md` if a game rule changed, then the code and the checks, then the Rune
Clean-up section of The Math. A proposed feature needing an unverified assumption is
recorded in §0 as assumed rather than given a silent default.
