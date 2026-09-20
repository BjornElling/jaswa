# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` and `docs/RUNE-PRESET-METRICS.md`
**Reviewed:** 20 September 2026

This document describes the calculation, not the game rules. Game facts and their
sources belong in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. `app/lib/rune-substat-weights.ts` decides what one substat
is worth to one role, `app/lib/rune-cleanup-model.ts` is the one arithmetic
implementation of everything else, `app/lib/rune-cleanup-advice.ts` applies policy,
`npm run verify:rune-substat-weights` holds the weights deterministically, and
`npm run verify:rune-cleanup-calibration` independently checks the stochastic part.

## 1. Evidence and explicit assumptions

| Matter | Status |
| --- | --- |
| Ordinary 1–6★ main and substat intervals | Verified tables in `RUNE-CANONICAL.md` §§3–4. |
| Ancient main stats and later upgrades | Ordinary 6★ values. |
| Ancient drop substats | Higher Ancient *initial* table only; see `RUNE-CANONICAL.md` §7. |
| Gem and Grindstone legality/ranges | Verified tables and source notes in `RUNE-CRAFT-ITEMS.md`. |
| A value inside its legal integer interval | Modelled uniformly; the 6★ distribution has a measured check. |
| Upgrade target and new-line type | Assumed uniform over legal choices; neither is claimed as game fact. |
| A build completes the candidate's own rune set, once | Stated assumption (§4.3). |
| What a substat is *worth* to a role | A product decision, as `RUNE-CANONICAL.md` §12 requires. §4 states it in full. |

The stochastic assumptions are isolated in the exact probability engine and checked
against a separate Monte Carlo oracle, not a duplicate implementation.

## 2. One currency, including flat stats

All relevant substats are converted to **six-star maximum-roll equivalents**. A
percent line divides by its six-star maximum. HP, ATK and DEF flat lines first become
percentage points of the selected reference monster's base stat, then divide by the
corresponding percentage-line maximum:

```
flat HP contribution = (flat HP × 100 / reference HP) / 8
HP % contribution    = HP % / 8
```

The same conversion is used for ATK and DEF. Thus `HP +375` and `HP % +8` can be
compared without a made-up universal flat-stat weight. SPD, CRI Rate, CRI DMG, RES
and ACC are native points and divide by their own maximum roll.

The reference base is the average of the user's own level-40 monsters in the preset's
family. A missing family uses the account-wide level-40 average; with no level-40
monster, Rune Clean-up refuses to calculate rather than fabricating a reference.

**This makes lines comparable. It does not make them equal**, and §4 is the part that
says so.

## 3. What a target means

A positive preset target says the role aims at that stat, and **how far it aims**.
It is deliberately not a per-rune requirement and it is never used as a cap. A 21 SPD
rune remains more valuable than a 17 SPD rune in a role aiming at 17 SPD per rune:
its surplus lets a different rune carry HP, ACC or another required stat in the
eventual build. **No rune is ever scored lower for exceeding a target.**

Only these things make a line worth nothing: the preset has no positive target for
its target stat, the build already meets that target without any substat at all, the
effect id is illegal on the slot, or it duplicates an effect id the game forbids. Set
and main-stat preferences determine preferred, acceptable and broken rank; they do
not turn a wanted substat off.

**A slot the preset names no main stat for accepts every main that slot allows, at
the broken rank.** This is the canonical reading. Leaving a slot blank means the role
has no preference there, not that it refuses to judge runes in it — a preset that
states slots 4 and 6 and leaves slot 2 blank still judges slot-2 runes, and they take
the broken main rank because nothing was preferred. The opposite reading would make a
rune the preset wants report "No preset can use it" because of a slot it does not
mention, which is the invisible failure `AGENTS.md` §0.1 forbids.

## 4. What one substat is worth

**This section replaced the model in which every positive target was a switch.**
Under that model a maximum Accuracy roll and a maximum CRI Dmg roll scored
identically for Fast DD, because both stats had a positive target; a 215 SPD target
and a 25 Accuracy target asked the runes for the same thing. They do not.

Each target gets a **multiplier between 0 and 1**, and every max roll of that stat is
scored with it. The multiplier is derived in four steps, for one preset, one build
and one rune set.

### 4.1 Subtract what the build already brings

```
needed = max(0, target − reference base − every main property in the build − the completed set)
```

- **Reference base** is the family average of §2.
- **Main properties** are the deterministic ordinary six-star `+15` values of all six
  slots — slots 1, 3 and 5 fixed, slots 2, 4 and 6 from the build being evaluated. A
  percent main is applied to the reference base; a flat one is added outright. A slot
  the preset leaves blank contributes nothing, because it has promised nothing.
- **The completed set** is §4.3.

### 4.2 Convert to max rolls, spread it, and divide by what runes give anyway

```
rollsNeeded     = needed / (what one max roll of the stat is worth in that stat's unit)
carriers        = how many of the six slots may legally carry the stat at all
perRune         = rollsNeeded / carriers
ordinaryPerRune = what one ordinary carrying rune supplies of it anyway
tightness       = perRune / ordinaryPerRune
weight          = tightness / (the largest tightness in this preset)
```

`ordinaryPerRune` is computed slot by slot from the same event model the chance
calculation uses: an ordinary six-star rune draws four sub-property lines uniformly
without replacement from the effect ids the slot allows, each line takes one initial
roll, and four upgrades fall uniformly across the four. So each of a slot's `n` legal
ids appears on `4/n` of runes, a line that exists collects two rolls on average, and
a roll averages the midpoint of its interval. **The flat/percent asymmetry survives
it**: a slot whose main property is ATK % supplies its ATK only through flat ATK
lines, and is correctly read as supplying very little ATK rather than none.

The innate property is left out of `ordinaryPerRune`. Roughly half of runes have one
and a role cannot plan around it; it is counted in full in a rune's own score, and
leaving it out of the yardstick raises every ratio by about the same factor, which
the normalisation removes.

**Why a ratio of means and not the tail probability.** `P(an ordinary rune supplies
this share)` is the obvious reading of "how hard", and it was implemented and
measured first. Every target a real preset states sits deep in that tail, and tails
that deep differ by many orders of magnitude for reasons that have nothing to do with
what a player should value. A Slow DD slot-2 rune carries ATK % as its main property,
so its ATK share is reachable only through flat ATK lines; the probability collapsed
to 10⁻⁸ and the surprisal `−log₂ p` then scored ATK at 26.6 bits against SPD's 1.9 —
ranking ATK **above every other stat on precisely the rune that cannot carry it**. A
ratio of means is finite, moves smoothly with the target, and says the thing that is
actually true: the other five slots have to find that ATK instead. Which lines *this*
rune may legally carry is a separate question, and §5 answers it where it belongs, in
the ceiling this rune's own slot is measured against.

**Every target already met.** Where no target needs anything from substats at all,
there is no tightest target to normalise against. Every stat the role names is then
scored alike. The alternative — every weight zero — would leave the preset unable to
judge any rune, which is the invisible failure §3 already rules out.

### 4.3 The set the rune belongs to

A rune is judged for the build it would go into, and that build completes **the set
the rune itself belongs to, once**. That is the least a build containing it can do,
and it is the only set fact a single rune establishes. A Fatal rune is asking to be
part of a Fatal build, so the role's ATK requirement is 35 % of base lighter for it
than for a Violent rune — and its own ATK lines are worth correspondingly less.

Only sets whose effect `RUNE-CANONICAL.md` §10 records as a constant stat contribute.
Battle and chance effects contribute nothing, because §11 of that document forbids
converting one into a stat.

### 4.4 A worked example

Fast DD, against a reference attack-type monster of 9,708 HP, 808 ATK, 568 DEF,
105 SPD, 18 CRI Rate, 50 CRI Dmg and 4 ACC; the build is ATK % / CRI Dmg % / ATK %
in slots 2, 4 and 6; the rune is Violent, which contributes no stat.

| Target | Wants | Base | Mains | Needed | One roll | Rolls | Carriers | Per rune | Ordinary | Tightness | **Weight** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SPD | 215 | 105 | 0 | 110 | 6 | 18.33 | 6 | 3.06 | 0.72 | 4.23 | **1.000** |
| ATK | 2,500 | 808 | 1,178 | 514 | 64.6 | 7.95 | 5 | 1.59 | 0.57 | 2.78 | **0.658** |
| CRI Rate | 90 | 18 | 0 | 72 | 6 | 12.00 | 6 | 2.00 | 0.72 | 2.77 | **0.655** |
| CRI Dmg | 175 | 50 | 80 | 45 | 7 | 6.43 | 5 | 1.29 | 0.69 | 1.86 | **0.440** |
| Accuracy | 25 | 4 | 0 | 21 | 8 | 2.63 | 6 | 0.44 | 0.65 | 0.67 | **0.159** |
| HP | 15,042 | 9,708 | 2,448 | 2,886 | 776.6 | 3.72 | 6 | 0.62 | 0.94 | 0.66 | **0.155** |
| DEF | 814 | 568 | 160 | 86 | 45.4 | 1.89 | 5 | 0.38 | 0.89 | 0.42 | **0.100** |

A maximum CRI Dmg roll is worth 2.8 maximum Accuracy rolls to this role, and a
maximum SPD roll 6.3 of them. On a Fatal rune the ATK weight falls from 0.658 to
0.296, because the set has already found 283 of the 514 ATK.

## 5. Value, Max value and the perfect rune

A rune's score is a plain sum over every line it carries, **the innate included**:

```
score = Σ over lines of (the line's value in max rolls × its stat's weight)
```

Nothing is capped and nothing is discarded. The denominator is a concrete rune, not a
formula — **the best legal ordinary six-star rune for this role in this slot**:

- four sub properties at their maximum, on the four best-valued legal effect ids;
- the most valuable of them carrying all four later upgrades as well, so it stands at
  five maximum rolls while the other three stand at one;
- an innate property at the maximum of the fifth best-valued legal effect id;
- the credited Gem and Grindstone of §6 spent wherever they help;
- every duplication, main-property, innate and slot rule of `RUNE-CANONICAL.md`
  §§3–5 respected.

Nine rolls across five distinct effect ids. **An earlier form of this wrote five rolls
on the best line and three on the second**, which is nine substat rolls across two
lines and a rune the game cannot produce — four lines each begin with one roll, so
the four upgrades may concentrate but the other three never fall below one. It made
no difference while every wanted stat priced alike; with weights it flattered the
second-best stat by two whole rolls.

```
Max value = min(1, score / ceiling) × (candidate main maximum / 6★ main maximum)
```

The main factor puts deterministic lower-star main properties on the same scale as
their 6★ counterparts. A perfect 4★ or 5★ rune is rated, but cannot masquerade as a
perfect 6★ rune. Ancient leaves this factor unchanged because Ancient does not alter
main stats, and the ceiling stays the ordinary six-star one so that Ancient's higher
initial interval cannot move the bar it is measured against.

`npm run verify:rune-substat-weights` builds that rune for every slot of every build
of every shipped preset and fails unless it reads exactly 100 %.

### 5.1 Every build of a preset is now evaluated

A preset describes a family of builds. It used to be enough to judge a rune against
the first build whose own slot matched, because nothing outside the rune's slot could
change its score. §4.1 ended that: a build with HP % in slots 4 and 6 asks its runes
for thousands less HP than one with ATK % there. Every compatible build is therefore
prepared and **the rune keeps its best**.

One candidate per preset reaches the Chance gate: the build the rune scores best in.
The row prints one Max value and one Chance against one preset, so the build those two
describe is the same one. Choosing between *presets* on chance as well as value is a
different question, and §9's gates still do it.

**The consequence, stated rather than left to be discovered.** "Its best build" now
means something stronger than it used to, and it reads optimistically: a rune with one
excellent line will find the build whose other targets are covered by main properties,
because that is the build in which its one line is worth the most. A PvP def rune
carrying HP % and nothing else useful reaches 89 % against the DEF % / DEF % build,
where DEF needs nothing from sub properties, and 77 % against the HP % / HP % build,
where it needs a great deal. Both readings are true of the build they describe, the
preset says it will accept either, and the quality floor's stops (§9) are calibrated
against this engine and not the previous one. Narrowing it would mean asking the user
which build they actually intend — which is a preset-model decision, not an arithmetic
one, and is not made here.

## 6. Gems and Grindstones

Craft sliders set a point in the selected item's legal range: none, average, three
quarters, or maximum. The model evaluates legal actions on actual lines, rather than
adding a generic craft number to a selected stat. Both the rune's own projection and
the §5 ceiling are computed with the credited items, so turning a slider up raises
the bar as well as the rune, and no rune can read past 100 % because the settings
promised it a stone.

- A **Grindstone** is credited on every grindable line, the rune's own and the ones it
  has yet to gain, as `max(existing grind, credited grind)` — never added to what is
  there, which would pay a rune twice for the same line.
- A **Gem** replaces one line. It respects duplicate, main, innate and slot rules; a
  re-Gem may only replace the already Gemmed line; and it preserves a Grind only for
  the same effect id, after which a fresh stone may be credited.
- Ancient runes use Ancient craft tables and ordinary runes ordinary craft tables.

**A Gem is spent at `+12`, after every power-up, and it discards the rolls its line
collected on the way.** So a line the projection reserves for a Gem contributes
exactly the Gem's own value however the remaining upgrades fall, and the upgrades
that land on it are lost — the chance calculation still allocates them there, because
the game picks uniformly and knows nothing of the plan, and then counts nothing for
them.

Below `+12` the Gem is projected onto a line the rune **already holds**. This is a
stated projection, not a search: a line the rune has not drawn yet cannot be planned
around, and letting the Gem land on one would credit the rune for something it is
not. At `+12` every line is offered and the choice is exactly optimal, because the end
state is then a sum of independent lines.

## 7. Exact chance to reach the quality floor

`Chance` is the exact discrete probability that final Max value reaches the quality
floor by +12, including the deterministic main-stat factor. Events are modelled in
order: until four substats exist, each event adds a distinct legal id; afterwards each
event improves one of the four lines; +15 is never a substat event.

The engine enumerates every unordered legal set of added ids, every multinomial split
of upgrades across the completed lines, and every legal integer roll value. Added
lines receive their initial draw before upgrades allocated to them, so a Hero rune's
fourth line can receive later upgrades, and they are credited with the same
Grindstone every other line is. All realised value is summed in full: surplus ACC, SPD
or HP is never discarded. The independent Monte Carlo oracle checks ordinary 4★/5★/6★
and Ancient 6★ fixtures.

### 7.1 The representation contract

**Probability support is represented on a lattice of 10⁻¹² score units.** A term's
contribution is quantised to a whole number of those units **once**, where it crosses
from the game's own whole numbers into score units; sums of those whole numbers are
then exact, so nothing downstream rounds again. "Exact" here means **exact on that
lattice** — the lattice itself is a quantisation of the underlying value, and this
document states it rather than implying the engine works in unrounded reals.

The distribution of a term is built over the **sum of its raw roll values**, as whole
game numbers, and priced afterwards. A valuation is linear, so the price of the sum is
the sum of the prices, and doing it in that order has two consequences that both
matter: the quantisation happens once per term instead of once per roll, and the
convolution depends on nothing but the interval and the count — not on the reference
monster and not on what a role pays for the stat. Pricing first made every one of
those convolutions role-dependent, and on a real account rebuilding them per preset,
per build and per rune set was half the total run time.

The rule the lattice protects: **no grid may ever be coarse enough to merge two
outcomes the game can distinguish.** The smallest difference two distinct outcomes can
have is one flat point of a scaled stat — about 7 × 10⁻⁴ score units for a realistic
reference line — which is nine orders of magnitude above one lattice unit.

Three figures are part of this contract and must move together if any of them moves:

- **Scale.** 10⁻¹² score units per unit.
- **Target slack.** A threshold comparison carries exactly **one unit** of slack, folded
  into the target once rather than applied at each comparison. This is the successor to
  the former `+ 1e-12` epsilon, and it is what keeps the key's precision and the
  comparison's tolerance from drifting apart.
- **Maximum safe magnitude.** Keys stay exact below `Number.MAX_SAFE_INTEGER` divided by
  the scale — about **9,007 score units**. A slot ceiling is at most nine, and §4's
  weights are normalised to a maximum of 1 precisely so that a weight can only ever
  lower a contribution, so there are three orders of magnitude of headroom. The engine
  asserts this at run time rather than trusting it, because a future change that made
  contributions larger — weighting a target by its raw stated magnitude, for instance —
  would consume that headroom and otherwise lose precision silently.

### 7.2 Numerical tolerance and display

Summation order is an implementation detail and is not part of this contract; two
implementations of this model agree on chance to within 10⁻⁹. The probability model is
exact, but IEEE-754 addition is not associative, so a reassociation that is exact in the
model can still move the last bits of a double.

Where a chance falls exactly on a display rounding boundary, **the printed percentage
follows from the computed value**, and summation order is not a stable presentation
guarantee across versions. What this document does promise is exactness and determinism
*within* a version: the same rune always prints the same number.

`npm run verify:rune-cleanup-equivalence` is the check that holds every other field —
verdict, reason, preset, rank and Max value — to bit equality across a change. It treats
the printed percentage, which `reason` carries, as an exact field rather than absorbing
it into the numeric tolerance, so a moved boundary is always adjudicated and never
assumed.

## 8. Runes below +12 and below six stars

A rune's Max value is what it can still become, so an unfinished rune is projected to
its own best legal end state before it is scored.

| The rune | What the projection does |
| --- | --- |
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes how many lines it still gains and how many improvements are left. Every legal set of additions is enumerated and the best kept; an added id must be legal in the slot and may not duplicate the main property, the innate, an existing line or a reserved Gem. |
| Improvements still to come | They land on lines the rune will actually have. In the best case they concentrate on whichever final line is worth most; the chance calculation, by contrast, spreads them uniformly as the game does. |
| Below six stars | Its own star's substat intervals are used for every future roll, and its own star's `+15` main property scales the result. It is neither ignored nor given an artificial six-star roll. |
| Ancient | Lines it dropped with use the Ancient initial interval. Added lines, later upgrades and the main property use the ordinary six-star tables, and its craft items are the Ancient ones. |
| Already `+12` or `+15` | Nothing is left to project, so its Max value is what it is, and its chance is 1 or 0. The row says `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator never moves with the candidate. A perfect four-star rune therefore
reads below a perfect six-star one on one shared scale rather than reading 100 % on a
scale of its own.

## 9. Verdict and finite preset allocation

The population judged is every rune the import holds, and no setting narrows it.
This is binding, and it follows from the allocation below rather than from
convenience: the eligible pool and its quotas are global, so a rune withheld from
the engine would not merely go unanswered — it would hand its place in a preset's
share to the runes that remain and change their verdicts. A rune equipped on a
monster and a rune already at +12 are judged like any other. The table's
Equipped/Inventory buttons and its level range are presentation filters applied
after the engine has answered, and they change no figure.

For every build of every preset the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. A passing rune is eligible for
every preset it passed. The account is then allocated globally: `runeShare` is
converted to its stated factor and active presets receive largest-remainder quotas from
the eligible pool. Scarce presets are allocated first and each rune serves one preset.
Thus a broad preset cannot quietly consume a narrow preset's requested inventory.

An eligible candidate outside finite requested capacity says so explicitly. Larger-set
and Intangible preferences break allocation ties; they do not alter the quality score.
Assigned runes below +12 are **Power up**; assigned runes at +12 are **Keep**. The
rest are **Sell** with the first applicable reason.

**The quality floor's five stops are calibrated, and they moved when §4 landed.** They
are measured against a synthetic box of ordinary six-star runes at `+12`: the default
stop passes about 15 % of that box, and the ladder runs from roughly a third of the
box down to a few per cent. The old stops were calibrated against a model in which
every wanted stat priced alike, so an ordinary rune with four wanted lines sat close
to a perfect one; now a perfect rune concentrates on the tightest target the role has
and the same box reads about one stop lower throughout. Leaving the numbers alone
would have made the default setting silently twice as strict as it says it is.

## 10. Calibration and adversarial checks

`scripts/verify-rune-substat-weights.mjs` is the deterministic gate on §§4–5. It holds
the thing a simulation cannot: a Monte Carlo of the model's own score agrees with the
model whatever the score *means*. It checks that a stated target is no longer a
switch, that main properties and a completed set come off the requirement, that a met
target asks for nothing, that surplus is never penalised, that lower star classes stay
on one scale, that credited craft items move both ends, and that the §5 rune reads
exactly 100 % in every slot of every build of every shipped preset.

`scripts/verify-rune-cleanup-calibration.mjs` independently generates legal runes,
executes additions/upgrades with its own PRNG, and checks chance fixtures, finite advice
for lower stars and Ancient runes, feasible preset allocation, and a population smoke
test. It reports the total retained rate and slots but does not impose an invented
universal slot distribution or retained percentage: those follow the user's presets
and finite quotas. Its output is an implementation regression check, not proof of an
unverified game-RNG rule. `npm run verify:rune-cleanup-calibration` is the fast
regression guard; `npm run verify:rune-cleanup-calibration:large` is the 1,000-rune
statistical run used before release.

`scripts/verify-rune-cleanup-equivalence.mjs` answers the other question, which the
calibration oracle deliberately cannot: whether this build says what the last one did.
It records every public field of every row over a fixed population and eight settings
and preset scenarios, and diffs them against a recorded baseline. The three are
complementary — the weights gate says the score means the right thing, the oracle says
the probability is right, the equivalence gate says a refactor did not move either —
and a change to the engine runs all three.

## 10.1 What it costs

Measured on a real captured account of 3,242 runes against the eight shipped presets,
at the default settings, warm:

| | Before §4 | After §4 |
| --- | ---: | ---: |
| `runeAdvice`, in Node | 0.52 s | 1.13 s |
| The same account in the browser worker, as the page reports it | — | 1.9 s |

Roughly twice the old engine, for a model that prices every stat separately and
enumerates every build rather than one. Three things account for the difference
between that and the fourteen-fold regression the first working version had, and each
is recorded where it lives: the raw-sum distributions of §7.1, the single candidate per
preset of §5.1, and one valuation's eleven conversion factors being worked out once
rather than per line.

## 11. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates
this document, The Math, the deterministic weight checks, the independent calibration
and a fresh equivalence baseline in the same commit. A new uncertainty is named as an
assumption, never smuggled in as a default.
