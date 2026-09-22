# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` and `docs/RUNE-PRESET-METRICS.md`
**Reviewed:** 21 September 2026

This document describes the calculation, not the game rules. Game facts and their
sources belong in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. `app/lib/rune-substat-weights.ts` decides what one substat
is worth to one role, `app/lib/rune-cleanup-model.ts` is the one arithmetic
implementation of everything else, `app/lib/rune-cleanup-advice.ts` applies policy,
`npm run verify:rune-substat-weights` holds the weights deterministically,
`npm run verify:rune-slot-neutrality` holds the quality floor to the same share of
every slot, and `npm run verify:rune-cleanup-calibration` independently checks the
stochastic part.

## 1. Evidence and explicit assumptions

| Matter | Status |
| --- | --- |
| Ordinary 1–6★ main and substat intervals | Verified tables in `RUNE-CANONICAL.md` §§3–4. |
| Ancient main stats and later upgrades | Ordinary 6★ values. |
| Ancient rolls in Max value and Chance | Ancient min–max values for initial-roll terms; ordinary six-star values for upgrades. All reference calculations remain ordinary. |
| Gem and Grindstone legality/ranges | Verified tables and source notes in `RUNE-CRAFT-ITEMS.md`. |
| A value inside its legal integer interval | Modelled uniformly; the 6★ distribution has a measured check. |
| Upgrade target and new-line type | Assumed uniform over legal choices; neither is claimed as game fact. |
| Artifact main properties | Verified table in `ARTIFACT-CANONICAL.md` §2; confirmed against 262 real artifacts. |
| How a preset's artifact choice fills two slots | Stated assumption: evenly over the stats it named (§4.1). |
| The set a build completes | **Not modelled.** A preset states no set combination, and guessing one from the candidate is what §4.3 forbids. |
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
scored with it. The multiplier is derived in four steps, for one preset and one build.
Nothing in it reads the rune being judged, which is §4.3's whole subject.

### 4.1 Subtract what the build already brings

```
needed = max(0, target − reference base − the build's main properties − the role's artifacts)
```

- **Reference base** is the family average of §2.
- **Main properties** are the deterministic ordinary six-star `+15` values of all six
  slots — slots 1, 3 and 5 fixed, slots 2, 4 and 6 from the build being evaluated. A
  percent main is applied to the reference base; a flat one is added outright. A slot
  the preset leaves blank contributes nothing, because it has promised nothing.
- **Artifacts.** A monster carries exactly two, one of each category, and each has one
  flat main property: **HP +1,500, ATK +100 or DEF +100** (`ARTIFACT-CANONICAL.md` §2,
  confirmed against 262 real artifacts, which carry those values at every natural grade
  with no spread at all). A preset states which of the three its role wants and nothing
  narrower, so the two slots are **spread evenly over the stats it named** — two of one
  where it names one, one of each where it names two, two thirds of each where it names
  all three. Two artifacts' worth comes off, never more, and a preset that names none
  has none credited.
- **No completed set is subtracted.** §4.3 is why, and it is the one true statement
  about the game this model deliberately declines to use.

Every term here is a fact about the **role**, not about the rune being judged. That is
what §4.3 is protecting.

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

### 4.3 Why a rune's own set is kept out of it

**A completed set's stat bonus does not reduce the requirement, and this is the one
place where a true statement about the game is deliberately not used.**

It was used, briefly. A rune is judged for the build it would join; that build
completes the rune's own set; Fatal is +35 % ATK, so a Fatal rune met 283 of Fast DD's
missing 514 ATK before a single sub property was read. Every clause of that is true.

It is still the wrong input, because **the weights are the yardstick a rune is measured
against, and a recommendation is a comparison across sets.** Give each set its own
yardstick and the comparison stops meaning anything. Measured on 1,500 identical rune
bodies relabelled set by set, against presets that preferred every set equally, the
same runes were retained **431 to 520 times** on the strength of the label alone:

| Set | Retained, against Violent |
| --- | ---: |
| Swift | +11.1 % |
| Enhance | +2.6 % |
| Fatal | +1.5 % |
| Blade | −2.4 % |
| Guard | −4.3 % |
| Accuracy | −4.9 % |
| Focus | −6.8 % |
| Rage | −7.9 % |

Note that it runs both ways. A set that relieves a target the role was *not* short of
lowers the ceiling and flatters every rune wearing it; a set that relieves the tightest
target lowers that target's tightness, the normalisation lifts every other weight, and
the ceiling rises instead. Neither ordering is one a player asked for or could predict.

**No choice of denominator repairs it.** Max value is a ratio, so it is invariant under
scaling the weights, and the damage is not a scaling — it is a change in the *shape* of
the weight vector, which moves each rune's ratio by an amount that depends on what that
rune happens to have rolled. Equal treatment across sets therefore requires that the
weights not depend on the candidate's set at all. That is arithmetic, not preference.

A set still decides a great deal through the preset's preferred/acceptable/broken
ranking, but **Intangible is a permanent exception**: its set side is always
`preferred` for every preset. Intangible is not offered in the preset set choices,
and no setting can downgrade or override that rule. The rune's main-stat preference
remains a separate judgement. The two allocation settings are separate policy
preferences: the 4-set switch and Intangible slider raise a candidate's place in
the finite allocation, but never change its score or downgrade the permanent
Intangible set rank.

**The way back.** If the requirement should count set bonuses again, a preset has to
state the set *combination* its builds use. `RUNE-CANONICAL.md` §10.1 already argues
that a build is a combination rather than a list of sets, and `app/lib/rune-set-pairs.ts`
already holds that vocabulary for monsters. A combination the preset states is the same
for every candidate, so it can shape the requirement without tilting the comparison; a
combination inferred from the one rune under judgement cannot. Until a preset says it,
this model does not guess it.

`npm run verify:rune-set-neutrality` is the check, and it holds both halves: identical
rune bodies must receive identical answers under every set label, and a preset that
does rank sets must still be obeyed.

### 4.4 A worked example

Fast DD, against a reference attack-type monster of 9,708 HP, 808 ATK, 568 DEF,
105 SPD, 18 CRI Rate, 50 CRI Dmg and 4 ACC; the build is ATK % / CRI Dmg % / ATK %
in slots 2, 4 and 6, and the preset names ATK artifacts and no others, so both
artifact slots are ATK. The candidate's set is not an input, so this one table is the
answer for every rune in that slot of that build (§4.3).

| Target | Wants | Base | Mains | Artifacts | Needed | One roll | Rolls | Carriers | Per rune | Ordinary | Tightness | **Weight** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SPD | 215 | 105 | 0 | 0 | 110 | 6 | 18.33 | 6 | 3.06 | 0.72 | 4.23 | **1.000** |
| CRI Rate | 90 | 18 | 0 | 0 | 72 | 6 | 12.00 | 6 | 2.00 | 0.72 | 2.77 | **0.655** |
| CRI Dmg | 175 | 50 | 80 | 0 | 45 | 7 | 6.43 | 5 | 1.29 | 0.69 | 1.86 | **0.440** |
| ATK | 2,500 | 808 | 1,178 | 200 | 314 | 64.6 | 4.86 | 5 | 0.97 | 0.57 | 1.70 | **0.402** |
| Accuracy | 25 | 4 | 0 | 0 | 21 | 8 | 2.63 | 6 | 0.44 | 0.65 | 0.67 | **0.159** |
| HP | 15,042 | 9,708 | 2,448 | 0 | 2,886 | 776.6 | 3.72 | 6 | 0.62 | 0.94 | 0.66 | **0.155** |
| DEF | 814 | 568 | 160 | 0 | 86 | 45.4 | 1.89 | 5 | 0.38 | 0.89 | 0.42 | **0.100** |

A maximum CRI Dmg roll is worth 2.8 maximum Accuracy rolls to this role, and a
maximum SPD roll 6.3 of them. The two ATK artifacts move ATK from 0.658 to 0.402 —
below CRI Dmg, where before they were counted it sat above it.

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
Max value = score / ceiling × (candidate main maximum / 6★ main maximum)
```

The main factor puts deterministic lower-star main properties on the same scale as
their 6★ counterparts. A perfect 4★ or 5★ rune is rated, but cannot masquerade as a
perfect 6★ rune. Ancient leaves this factor unchanged because Ancient does not alter
main stats, and the ceiling stays the ordinary six-star one. Ordinary runes are capped
at that ceiling; Ancient runes are not, so a higher Ancient initial roll can correctly
print above 100 % rather than being flattened to it.

`npm run verify:rune-substat-weights` builds that rune for every slot of every build
of every shipped preset and fails unless it reads exactly 100 %.

**Max value is what the row prints and is not what the gates read.** A ratio against
the perfect rune of a slot is an honest description of one rune, and it is not
comparable between slots, because the perfect runes of two slots are not equally far
above what those slots ordinarily produce. §9.1 states the second anchor the gates
use and why the two numbers have to stay apart.

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
the bar as well as the rune. The ordinary denominator remains the reference; an
Ancient rune can therefore read past 100 % when its Ancient roll interval takes it
beyond that ordinary perfect rune.

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
the game's grade-specific order: a Normal rune adds four lines; a Magic rune
improves its born line and then adds three; a Rare rune improves its two born lines
and then adds two; a Hero rune improves its three born lines and then adds one; a
Legend rune improves four times. At every event the choice is uniform over the
lines or legal new effect ids that exist **at that event**; +15 is never a
sub-property event.

For an Ancient candidate, every initial-roll term in this probability uses the
verified Ancient min–max interval; upgrade terms use the ordinary six-star interval.
The quality bar, role valuation, ordinary reference box and perfect-rune denominator
remain ordinary. The same Ancient/ordinary split is used by Max value, so the two
figures answer the same candidate rather than quietly using different roll tables.

The engine enumerates every legal event sequence and every legal integer roll value.
An added line receives its initial draw before any later event can improve it, and it
is credited with the same Grindstone every other line is. All realised value is
summed in full: surplus ACC, SPD or HP is never discarded. The independent Monte
Carlo oracle checks ordinary 4★/5★/6★ and Ancient 6★ fixtures.

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
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes which remaining events improve born lines and which add new lines. Every legal event sequence is enumerated; an added id must be legal in the slot and may not duplicate the main property, the innate, an existing line or a reserved Gem. |
| Improvements still to come | They land uniformly only on lines that exist when that event occurs. In the best case they concentrate on whichever legal line is worth most; the chance calculation follows the same event order and spreads them as the game does. |
| Below six stars | Its own star's substat intervals are used for every future roll, and its own star's `+15` main property scales the result. It is neither ignored nor given an artificial six-star roll. |
| Ancient | Initial-roll terms in its Max-value and Chance projections use the Ancient interval; upgrades, role valuation, the reference box, main property and denominator use ordinary six-star rules. Its craft items remain Ancient because that is a legality rule. |
| Already `+12` or `+15` | Nothing is left to project, so its Max value is what it is, and its chance is 1 or 0. The row says `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator never moves with the candidate. A perfect four-star rune therefore
reads below a perfect six-star one on one shared scale rather than reading 100 % on a
scale of its own.

## 9. Verdict and finite preset allocation

The population judged is every rune the import holds, and no setting narrows it.
This is binding because the eligible pool and its quotas are global: withholding a
rune would hand its place in a preset's share to the runes that remain and change
their verdicts. A rune equipped on a monster and a rune already at +12 are judged
like any other. The table's Equipped/Inventory buttons and its level range are
presentation filters applied after the engine has answered, and they change no
figure.

For every build of every preset the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. A passing rune is eligible for
every preset it passed. The account is then allocated globally: `runeShare` is
converted to its stated factor and active presets receive largest-remainder quotas
from the eligible pool. Scarce presets are allocated first and each rune serves one
preset, so a broad preset cannot quietly consume a narrow preset's requested
inventory.

An eligible candidate outside finite requested capacity says so explicitly. The
4-set and Intangible preferences break allocation ties; they do not alter the
quality score. Assigned runes below +12 are **Power up**; assigned runes at +12 are
**Keep**. The rest are **Sell** with the first applicable reason.

**The quality floor's five stops state a share of an ordinary box** — a third of it
at stop 1, 15 % at the default stop 3, a few per cent at stop 5 — and §9.1 is how a
share becomes a Max value. The box is the synthetic one this document has always
named: ordinary six-star runes at `+12` for the role in question. What changed is
that the ladder now says the share and the model works out the Max value, rather
than the ladder being a Max value calibrated to produce the share.

## 9.1 The floor is a share of each slot's own box

**A quality floor stated as one Max value does not mean the same thing in two
different slots, and the difference is not small.** Slot 1 may never carry DEF, slot
3 may never carry ATK, slot 5 may never carry flat HP, and a chosen main property
bars its own effect id wherever it sits (`RUNE-CANONICAL.md` §5). So a role built
around DEF asks slot 3 for a stat it can draw and slot 1 for one it cannot, and the
two slots' ordinary runes end up in entirely different places on their own scales.
Dividing by the perfect rune of each slot (§5) lines the six scales up at the *top*
and says nothing about the body — and the body is where the verdicts are made.

What one Max-value floor kept, measured by `verify:rune-slot-neutrality` against the
engine before this section existed — 2,000 ordinary six-star `+12` runes per slot,
every one carrying a main the preset asked for, at the default setting:

| Preset | 1 | 2 | 3 | 4 | 5 | 6 | Spread |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Def DD | 28.2 % | 22.1 % | 29.6 % | **8.8 %** | 16.8 % | 22.0 % | 3.4x |
| Bruiser | **62.1 %** | 27.6 % | 52.1 % | 34.4 % | 43.5 % | 34.9 % | 2.3x |
| PvP def | 26.8 % | 13.4 % | **41.9 %** | 19.1 % | 24.6 % | 18.8 % | 3.1x |
| A role built mostly on DEF | **51.0 %** | 22.2 % | 11.8 % | 21.6 % | **9.3 %** | 22.3 % | 5.5x |
| A role built mostly on ATK | 12.1 % | 57.0 % | **87.4 %** | 57.1 % | **11.1 %** | 55.6 % | 7.9x |

A player following that kept four slot-3 runes for every slot-4 rune of a Def DD
account, and needed one of each. **It runs both ways**, which is why no rule of
thumb repairs it: a slot that cannot draw the wanted stat has a *lower* ceiling, so
an ordinary rune reads higher against it and the slot over-fills; a slot that can
draw it has a high ceiling that ordinary runes fall far short of, and the slot
starves. Which of the two happens to which slot depends on the preset, and the two
DEF rows above show the same preset family doing each.

**So the floor is read from each slot's own box.** `ordinaryBox` in
`rune-cleanup-model.ts` states a second concrete rune beside §5's perfect one:

- four sub-property lines drawn uniformly without replacement from the effect ids the
  slot allows, one initial roll each, four upgrades spread uniformly over the four;
- an innate on the measured **51 %** of runes (`RUNE-CANONICAL.md` §4), one roll from
  the same interval, with neither Gem nor Grindstone on it;
- every roll worth the midpoint of its ordinary six-star interval, which is exact
  rather than simulated because a valuation is linear in the roll count;
- the credited Gem and Grindstone of §6 spent on it, so turning a slider up raises
  the bar as well as the rune;
- ordinary six-star throughout, Ancient included, for §5's reason — both ends of the
  scale must stay still while the candidate moves.

A rune's **standing** is then where its Max value falls in that box, `0`–`1`, and the
floor is a share of it. Standing is what every gate and every comparison between
presets is settled on; Max value is what the row prints, because "42 %
of a perfect rune" is the honest description of the rune itself and a percentile is
not. They are deliberately different numbers, and a slot-4 rune kept beside a
slot-3 rune that reads higher is the system working.

Three things about that box had to be right, and each one was measured still wrong
after the one before it had been fixed:

1. **The middle.** §4.2's yardstick drops the innate because every target's ratio
   moves by the same factor when it goes and the normalisation removes it. Nothing
   removes it here, so the box carries it.
2. **The family of builds.** §5.1 lets a rune keep its best build. A slot-1 rune fits
   *every* build of a preset because its main is fixed; a slot-2 rune fits only those
   naming its own main — 24 against 6 for Bruiser — and a maximum over more draws is
   simply larger. The ordinary rune is therefore offered the same choice: each drawn
   line-up is priced in every build of the family and keeps its best, and only then
   is the average taken.
3. **The shape.** Matching middles leaves 16 % against 6 %; matching middles and
   widths leaves 20.0 % against 13.7 %, because a maximum Gem credited to a DEF role
   hands *every* rune the wanted stat in the two slots that may draw it and crushes
   the top of their distributions while the other four keep a long tail. So the box
   is kept as a distribution over a `0`–`1` grid rather than as two moments. The one
   Gaussian left is the smear *within* a single line-up, where a sum of eight uniform
   rolls genuinely is one.

`npm run verify:rune-slot-neutrality` is the gate. It puts a synthetic box of every
slot against all eight shipped presets and seven adversarial ones — roles built
almost entirely on DEF, on ATK, on HP, on SPD, on ACC, on crit, and one that wants
everything — holding the main property fixed so that only the slot can move a
verdict, and tests the six shares with Pearson's χ² on five degrees of freedom. It
also checks that the ladder delivers the share it names, that a slot which can carry
*nothing* the role wants is an honest zero rather than a scale, and that the standing
still ranks runes within a slot. Against the engine before this, seventeen of its
eighteen scenarios scored between 139 and 3,898 and the eighteenth scored 32; it now
scores at most 31 against a limit of 45.

**The stops have now been restated twice, and for the same reason both times.** They
ran `0.41`–`0.69` as Max values before the substat weights of §4 and `0.36`–`0.63`
after, and both ladders were this ladder: the shares were always what the numbers
were chosen to produce. A calibrated number left alone through a change of scale
silently stops meaning what it says, and that is how the default setting once became
twice as strict as it read.

**What it cost in retained runes.** The old ladder was looser than it read: measured
against the same synthetic box, its five stops admitted 49.5 %, 34.6 % and 23.5 % of
it where they said a third, 23 % and 15 %. The new ones deliver 32.8 %, 23.2 % and
15.6 %. On a box of ordinary six-star `+12` runes drawn across all six slots at the
default floor, the engine retained 20.4 % before and 13.4 % after; almost all of the
difference is the over-admission above being removed, with slots 1, 3 and 5 falling
from 41.5 %, 39.5 % and 27.3 % to a common 22–23 %. What is now delivered is the
15 % this section has claimed all along.

## 10. Calibration and adversarial checks

`scripts/verify-rune-substat-weights.mjs` is the deterministic gate on §§4–5. It holds
the thing a simulation cannot: a Monte Carlo of the model's own score agrees with the
model whatever the score *means*. It checks that a stated target is no longer a
switch, that main properties and the role's artifacts come off the requirement while a
rune's own set does not, that a met target asks for nothing, that surplus is never
penalised, that lower star classes stay on one scale, that credited craft items move
both ends, and that the §5 rune reads exactly 100 % in every slot of every build of
every shipped preset.

`scripts/verify-rune-set-neutrality.mjs` is the fairness gate on §4.3, and it is paired
by construction: one synthetic population of rune *bodies* is generated once, every set
is judged on exactly those bodies, and every field of every answer must match. It then
checks the mirror image — that a preset which *does* rank sets is still obeyed, because
a gate that only demanded neutrality would pass just as happily on an engine that had
stopped reading the set at all.

`scripts/verify-rune-slot-neutrality.mjs` is the fairness gate on §9.1, and it is
built the same way: a synthetic box of ordinary six-star `+12` runes is generated for
every slot, every rune in it carries a main property the preset asked for and the
sets are cycled so that neither of those can move a verdict, and the six shares that
survive the gates are tested against each other with Pearson's χ². It runs the eight
shipped presets, seven adversarial single-stat roles, the craft sliders at maximum
and both ends of the quality ladder. It then checks the three things a bare equality
test would miss: that the ladder admits the share it names, that a slot which can
legally carry nothing the role wants reports "No preset can use it" rather than being
given a scale, and that a rune which out-scores another of its own slot still outranks
it.

`scripts/verify-rune-cleanup-calibration.mjs` independently generates legal runes,
executes additions/upgrades with its own PRNG, and checks chance fixtures, finite advice
for lower stars and Ancient runes, feasible preset allocation, and a population smoke test. It reports the total
retained rate and slots but does not impose an invented universal slot distribution or
retained percentage: those follow the user's presets and standards. Its output is an
implementation regression check, not proof of an unverified game-RNG rule.
`npm run verify:rune-cleanup-calibration` is the fast
regression guard; `npm run verify:rune-cleanup-calibration:large` is the 1,000-rune
statistical run used before release.

`scripts/verify-rune-cleanup-equivalence.mjs` answers the other question, which the
calibration oracle deliberately cannot: whether this build says what the last one did.
It records every public field of every row over a fixed population and eight settings
and preset scenarios, and diffs them against a recorded baseline. The five are
complementary — the weights gate says the score means the right thing, the set gate
says the same rune is scored alike whatever it is labelled, the slot gate says the
floor cuts every slot at the same place, the oracle says the probability is right,
and the equivalence gate says a refactor moved none of them — and a change to the
engine runs all five.

## 10.1 What it costs

Measured on a real captured account of 3,242 runes against the eight shipped presets,
at the default settings, warm:

| | Before §4 | After §4 |
| --- | ---: | ---: |
| `runeAdvice`, in Node | 0.52 s | 0.6 s |
| The same account in the browser worker, as the page reports it | — | 1.2 s |

About the same as the old engine, for a model that prices every stat separately and
enumerates every build rather than one. The first working version was fourteen times
slower; four things closed that, each recorded where it lives — the raw-sum
distributions of §7.1, the single candidate per preset of §5.1, one valuation's eleven
conversion factors being worked out once rather than per line, and §4.3 taking the
candidate's set out of the weight key, which cut the number of distinct weight vectors
by the number of sets in the account.

**§9.1 adds about 40 %**, measured over eight warm runs of a synthetic account of the
same 3,242 runes: 0.47 s without the ordinary box and 0.65 s with it. A box is one
enumeration of every line-up a slot can draw, priced in every build of the family, and
it is memoised per slot, main property, craft credit, lineage and build family — so it
is built a hundred-odd times for a whole account rather than once per rune. The first
version cost three times as much rather than forty per cent: building each case's
Gaussian smear afresh put a quarter of a million `exp` calls behind every box, and
caching the kernel on its quantised width and offset is what closed that.

## 11. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates
this document, The Math, the deterministic weight checks, the independent calibration
and a fresh equivalence baseline in the same commit. A new uncertainty is named as an
assumption, never smuggled in as a default.
