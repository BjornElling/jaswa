# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` and `docs/RUNE-PRESET-METRICS.md`
**Reviewed:** 23 September 2026

This document describes the calculation, not the game rules. Game facts and their
sources belong in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. `app/lib/rune-substat-weights.ts` decides what one substat
is worth to one role, `app/lib/rune-craft-end-state.ts` decides what a Gem and a
Grindstone do, `app/lib/rune-power-up-outcomes.ts` decides what a rune may still
become and how likely it is, `app/lib/rune-cleanup-model.ts` is the one arithmetic
implementation of everything else, and `app/lib/rune-cleanup-advice.ts` applies policy.
`npm run verify:rune-substat-weights` holds the weights deterministically,
`npm run verify:rune-slot-neutrality` holds the quality floor to the same share of
every slot, `npm run verify:rune-craft-single-source` keeps the craft rules in one
file, `npm run verify:rune-chance-stability` holds the odds still, and
`npm run verify:rune-cleanup-calibration` independently checks both.

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

The stochastic assumptions are isolated in one loop — the one that plays a rune
forward, in `app/lib/rune-power-up-outcomes.ts` — and checked against a separate
simulation written from the game's schedule rather than from that loop.

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
remains a separate judgement. The two retention settings are separate policy
preferences: the 4-set switch and Intangible slider widen the share of their own
ordinary box that can pass the quality and chance gates. They never change the
score or downgrade the permanent Intangible set rank.

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

`app/lib/rune-craft-end-state.ts` is the only module that applies these rules, and
`npm run verify:rune-craft-single-source` is what keeps it that way. They used to be
applied in five places — a rune's own projection, the perfect rune of its slot, the
box of ordinary runes it is measured in, the probability engine and the craft planner
— and two of them had drifted apart, which is §6.1.

Craft sliders set a point in the selected item's legal range: none, average, three
quarters, or maximum. The model evaluates legal actions on actual lines rather than
adding a generic craft number to a selected stat, so an item only ever helps where the
game would let it. Both the rune's own projection and the §5 ceiling are computed with
the credited items, so turning a slider up raises the rune *and* the bar.

**The four rules, as the game states them** (`RUNE-CANONICAL.md` §§4, 8):

1. **A Grindstone sits on top of a sub property**, and only on one of the seven
   grindable effect ids. Never on the main property, and never on the innate, which
   takes neither craft item. One stone per line, and a line holds at most one — so
   the slider credits a stone to *every* grindable line the rune holds, which is what
   a player with a stock of them does, not one stone to be placed somewhere. It is
   credited as `max(the stone already there, the one the settings assume)` rather
   than added to it: a rune ground three quarters of the way is worth what an unground
   one is, because a stone can always be topped up, and adding them would pay the rune
   twice for one line.
2. **A Gem replaces one sub property**, and the rune must be at `+12` for it. The
   replaced line loses every roll it collected. A rune may carry one converted line at
   a time, so where it already has one, that is the only line a further Gem may
   replace.
3. **The new effect id must be legal**: allowed in the slot, and not the main
   property, the innate, or any *other* sub property. Re-rolling the replaced line's
   own id is allowed, and is what a player does to improve a bad value.
4. **A Gemmed line may then be ground**, where its new id is grindable — so an
   enchanted value that can be ground is always counted as ground.

Ancient runes use Ancient craft tables and ordinary runes ordinary ones, because that
is a legality rule rather than a valuation one. **It is a rule about what a rune may
be spent on, and not about the reference it is measured against.** The §5 ceiling
takes no lineage at all. An Ancient candidate used to be given an *Ancient* perfect
rune to divide by, so its stronger Ancient Gem and stone paid for its own denominator
and cancelled most of what they had just earned it: measured on a Legend Ancient
slot-2 rune at `+12`, Hero items at three quarters, the bar stood 4.1 % higher and the
rune read **71.5 % where the ordinary bar says 74.5 %**. Both ends of the scale stand
still while the candidate moves, which is §5's rule and the only reason an Ancient
rune can print above 100 % at all.

And the rule that follows from all four: **a Gem is never forced.** The end state is
whichever of "no Gem" and the best legal placement scores higher, so considering a
craft item can only raise a rune, never lower it. This matters below `+12`: a line that
receives a good upgrade can remain the original line, while a different final line may
be replaced if — and only if — that is the better realised end state.

**A Gem is spent at `+12`, after every power-up.** The chance calculation plays the
rune's remaining events out first and applies rule 4 to what it actually got, so an
upgrade is never discarded merely because a line might later be Gemmed.

### 6.1 Which line the Gem replaces

**The best one, and it used not to be.**

The projection's rule was: find the least-contributing line, and offer it the best
legal Gem. The ceiling's rule was: offer every line every legal Gem and keep the best
pair. Both were written from the same paragraph of `RUNE-CANONICAL.md` §8 and they are
not the same rule, because **which Gem is legal depends on which line is being
replaced** — a Gem may not duplicate one of the *other* lines, so removing the line
that holds SPD is what makes a SPD Gem legal at all.

So a rune whose weakest line was HP + and whose best available Gem was SPD scored as
though the Gem were worth what it added to the HP + line, when a player would have
replaced the SPD line and taken a full Gem roll of it. Measured against the rules
written out independently from §8, over 1,210 finished runes at five craft credits, the
worst case read **9.20 where the rules say 10.12** — nine per cent of that rune's whole
score. Nothing failed, because the only simulation in the suite passed a neutral
credit and never exercised a Gem at all.

Both halves are now the one function, and both are checked: the craft end state of
every synthetic finished rune is compared against §8 written out afresh inside
`verify:rune-cleanup-calibration`, and the chance oracle runs a second time with both
items credited.

## 7. Chance: a certain no, a certain yes, or a count

`Chance` is the probability that a rune's final Max value reaches the quality floor by
`+12`, including the deterministic main-stat factor. It is answered in three steps, and
the first two are exact:

1. **A rune with no events left** — already `+12` or `+15` — has nothing to project.
   Its chance is `1` or `0`, and the row says `Already there` or `Below the floor`
   rather than dressing a certainty as a gamble.
2. **A rune whose best possible end state misses the bar** cannot reach it by any road,
   and one whose **worst possible end state clears it** cannot miss. Both bounds are
   computed, not sampled, and between them they settle most of a real box.
3. **Everything else is played forward and counted.** The rune is taken to `+12`
   `chanceRuns` times by the game's own loop, each run is priced and offered its craft
   end state, and the answer is the share that cleared the bar.

### 7.1 Why it is counted rather than enumerated

The exact answer is an enumeration of every split of the remaining improvements, every
subset of the additions, and every integer value each of those rolls can take — and
then, for each of those thousands of end states, the Gem decision of §6, which depends
on the realised values and so cannot be factored out of the sum. It was implemented
that way, on a lattice of 10⁻¹² score units, with a branch tree, convolutions of raw
roll sums, and pruning bounds at three levels. It is the right answer, arrived at a way
that costs **nine seconds for 1,500 runes** at the fullest craft settings and
twenty-three for a real box — and the result is a number printed to the nearest
percentage point.

Counting is the same answer to within the resolution it is counted at, it applies §6's
rules to a realised rune rather than to a model of them, and it is the one description
of this calculation that can be given to a player in a sentence: *JASWA plays the rune
forward a few thousand times and counts how often it ends up good enough.*

**The schedule is simpler than the old engine made it look**, and this is what makes a
run cheap. `RUNE-CANONICAL.md` §6 writes an improvement wherever the event index is
below the grade's born-line count and an addition everywhere else, and the indices run
in order — so **every remaining improvement happens before every remaining addition,
without exception**. No line a rune has yet to gain can ever receive an improvement,
the set of lines an improvement may land on never changes, and a rune's whole future is
three numbers and a list. The old engine enumerated the events as an ordered sequence
and rediscovered that structure branch by branch, at the cost of walking `10 × 9 × 8 ×
7` orderings of a draw whose order cannot matter.

### 7.2 The resolution, and why it is enough

**4,096 runs.** One rune's answer is a deterministic estimate, not an exact
probability. At the widest point of a binomial distribution (`p = 0.5`), its standard
error is about 0.78 percentage points and a 95 % interval is about ±1.53 points;
at `p = 0.02`, the corresponding interval is about ±0.43 points. That uncertainty
is wider than the displayed tenth-of-a-point floor, so the box-level stability check
below is part of the contract rather than a claim that each row is exact.

The number that had to be checked is not that one. A verdict is a threshold, and a
threshold turns a spread into flipped rows — so what matters is what the resolution
does to a **box**. Measured on 1,500 synthetic runes at the fullest craft settings,
against the eight shipped presets:

| Runs per answer | Keep | Power up | Time |
| ---: | ---: | ---: | ---: |
| 1,024 | 67 | 170 | 1.6 s |
| 4,096 | 67 | 169 | 2.2 s |
| 16,384 | 67 | 169 | 4.8 s |
| 65,536 | 67 | 169 | 15.3 s |

Per slot the counts move by at most one rune anywhere above 1,024. Sixteen times the
work buys nothing a player could see, so the second, finer round this engine briefly
had — a re-run at eight times the resolution for answers landing near the policy bar —
was removed rather than kept for the look of the thing.

**What it cannot resolve, stated rather than left to be discovered.** The finest answer
four thousand runs can give is one run in four thousand, about 0.024 of a percentage
point. Two odds a tenth of a point apart are therefore the same answer to this engine,
and a chance of 0.02 % against one of 0.07 % is a coin toss between one hit and three.

The loosest policy stop asks for 2 %, which is eighty sample increments, but sampling
uncertainty can still matter near that bar. The calculation therefore checks the box
across resolutions, and the GPU path rechecks jobs near the active bar on the CPU so
single-precision cannot change the policy decision. The display still avoids claiming
two decimals below a tenth of a point: anything real but below that floor reads
`under 0.1 %`, and `0 %` means the engine settled it at zero without drawing a run.

### 7.3 The same rune always prints the same number

The stream of draws is a hash of **the rune itself** — its slot, star class, lineage,
grade, level, main property, innate and every sub property — and of the run's own
number. Not a generator carrying state, and not the rune's id. Three consequences, and
the third is why it is the rune and not the id:

- Two calculations of one box agree exactly, and the order the runes are judged in
  cannot move a verdict.
- The graphics card reproduces the processor's stream rather than keeping one of its
  own, because every draw is integer arithmetic on both sides (§10.2).
- **Two identical runes are given identical odds.** Seeding from the id instead put
  three copies of one rune in a box at 55 %, 56 % and 57 % — each answer honest to its
  own resolution, and the three of them together an obvious defect on screen.

`npm run verify:rune-chance-stability` is the check, and it is the one that says
counting is enough. One population is judged several times at **different
resolutions** — a quarter of the shipped run count, the shipped one, and sixteen times
it, which is a sixty-fourfold sweep end to end — with nothing about the runes or the
policy changing, and the totals, the breakdown by slot, by preset and by
preferred/acceptable/broken rank, and the certainties all have to hold still. Measured
over 3,000 runes with Gems and Grindstones credited:

| | Moved by |
| --- | ---: |
| Power up and Sell at `+0` | 0 runes |
| Power up and Sell at `+9` | 8 runes in 3,000 |
| Any one slot's retained count | at most 3 |
| Any one preset's retained count | at most 4 |
| **Everything at `+12`** | **nothing at all** |

The last row is not luck: a rune at `+12` has no events left, so §7's first step
settles it and no run is ever drawn.

### 7.4 Ancient runes

For an Ancient candidate, every **initial** roll uses the verified Ancient interval and
every improvement uses the ordinary six-star one. A line the rune *gains* at `+6` is
having its initial roll then, so it draws from the Ancient table; this is what
`verify:rune-cleanup-ancient` has asserted all along, and until 23 September 2026 the
calibration oracle disagreed with it and read the ordinary table instead. That one
difference was worth up to sixteen percentage points of chance on an unfinished
Ancient rune, and it was the whole of the disagreement between the two.

The quality bar, the role valuation, the ordinary reference box and the perfect-rune
denominator all remain ordinary, so an Ancient rune moves against a bar that does not.

## 8. Runes below +12 and below six stars

A rune's Max value is what it can still become, so an unfinished rune is projected to
its own best legal end state before it is scored.

| The rune | What the projection does |
| --- | --- |
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes which remaining events improve born lines and which add new lines. The lines it gains are drawn without replacement from the ids the slot, the main property and the innate leave legal; the order they arrive in cannot matter, because no improvement follows them. Gem legality is settled after the final line-up exists. |
| Improvements still to come | Every one of them lands on a line the rune already holds, because improvements precede additions without exception (§7.1). In the best case they concentrate on whichever held line is worth most — the value of a line-up is linear in how they are split and the Gem's gain is convex in it, so the maximum is always at a corner. |
| Below six stars | Its own star's substat intervals are used for every future roll, and its own star's `+15` main property scales the result. It is neither ignored nor given an artificial six-star roll. |
| Ancient | Initial-roll terms in its Max-value and Chance projections use the Ancient interval; upgrades, role valuation, the reference box, main property and denominator use ordinary six-star rules. Its craft items remain Ancient because that is a legality rule. |
| Already `+12` or `+15` | Nothing is left to project, so its Max value is what it is, and its chance is 1 or 0. The row says `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator never moves with the candidate. A perfect four-star rune therefore
reads below a perfect six-star one on one shared scale rather than reading 100 % on a
scale of its own.

## 9. Verdict and unbounded preset matching

The population judged is every rune the import holds, and no setting narrows it.
This is binding because every rune is judged independently. A rune equipped on a
monster and a rune already at +12 are judged like any other. The table's
Equipped/Inventory buttons and its level range are presentation filters applied
after the engine has answered, and they change no figure.

For every build of every preset the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. A passing rune is eligible for
every preset it passed. If it passes at least one preset, it is **Power up** below
+12 and **Keep** at +12. The row chooses its strongest passing preset only to explain
the result; that choice cannot displace another rune and no desired amount can make
an otherwise passing rune **Sell**. A rune that passes none of the presets is **Sell**
for the first applicable ordinary reason.

The 4-set and Intangible settings alter only the retained share used by the two
gates. They do not create a finite preset inventory, a global quota, or a one-rune-
per-preset assignment. This keeps their intended relative preference while making
the verdict independent of how many other runes happen to match the same preset.

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
- the same optional Gem and Grindstone end-state rule as a candidate rune — literally
  the same function, so the reference cannot receive a craft penalty merely because
  craft is being considered, and cannot drift from §6 either. The box used to write
  §8's placement rule out again, with its own reading of which ids an innate bars;
  it now hands its line-up to `craftedScore` like everything else;
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

## 9.2 Two readings of a rune, and one of them wins whole

**Crediting a craft item raises the rune, the §5 ceiling and the §9.1 box, and for
some runes the box rises further than the rune does.** Considering an item the player
is never obliged to spend must not lower a verdict, so a rune is read twice and keeps
the better reading: *spend the items, and be measured against a box that spent them
too*, or *spend nothing, and be measured against a box that spent nothing either*.

Each is a whole calculation — a preset, a build, a rank, a Max value, a standing and a
chance that belong together — and **the row prints one of them entire**. It used to
take the larger of each field separately and the preset name from whichever reading
existed, so a row could carry one preset's name and rank beside another preset's
chance: `55 %` printed under a preset whose own odds were 3 %. §5.1 says the two
figures in a row describe one build, and a figure maxed across two presets describes
neither.

The escape also has to be a reading of *something*. The gate read the credited Max
value in the *uncredited* box for a while — a crafted rune against an uncrafted
population, lenient by construction and a standing no rune actually has — which
admitted more than the share §9's ladder names.

**A consequence worth stating.** Because a row now names one preset and prints that
preset's figures, turning a slider up can lower the printed Max value: the item hands
the rune to a preset that *stands* it higher while describing it lower. Measured
across 120 fixtures at three craft credits, that happened to 6 of them, by up to 7.5
points, every one a preset switch with the standing rising and the verdict unchanged.
Standing, odds and verdict are monotone and `verify:rune-cleanup-craft-monotonic`
holds all three; Max value is not, and §9.1 already says it is the description rather
than the currency.

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

`scripts/verify-rune-cleanup-calibration.mjs` independently generates legal runes and
plays the game's own addition/upgrade loop with its own PRNG. It checks the chance
**twice** — once with no craft credited, which isolates the substat RNG, and once with
both items credited, which puts §6's Gem decision inside the probability rather than
beside it. Only the first of those existed until 23 September 2026, which is why §6.1's
defect survived for as long as it did.

It also holds §6 itself, deterministically and exhaustively: the craft rules are
written out afresh inside the script from `RUNE-CANONICAL.md` §8 — grindability, the
one converted line, the duplicate and slot bans, the stone a re-Gem keeps — and every
synthetic finished rune's end state is compared against the engine's at five craft
credits. It agrees to 2 × 10⁻¹⁵ over 1,210 comparisons, and reading the weakest line
instead of the best pair fails it by nine per cent of a rune's score.

Its population section reports the total retained rate and the slots but does not
impose an invented universal slot distribution or retained percentage: those follow the
user's presets and standards. `npm run verify:rune-cleanup-calibration` is the fast
regression guard; `npm run verify:rune-cleanup-calibration:large` is the 1,000-rune
statistical run used before release.

`scripts/verify-rune-chance-stability.mjs` is the gate on §7 — whether counting is
enough. One population of rune bodies is generated once and judged several times at
different **resolutions**, which changes how finely every answer in the account is
counted while changing not a single rune, and the totals, the breakdown by slot, by
preset and by rank, and the certainties at `+12` all have to hold still. It also puts
two copies of one rune in a box and requires one answer twice, which is the half that
says a player pressing Calculate sees a consistent account rather than merely a
repeatable one.

`scripts/verify-rune-craft-single-source.mjs` is a source-text gate rather than a
behavioural one, and §6.1 is why it exists: two implementations that happen to agree
today are still two implementations. Only `rune-craft-items.ts`, which holds the §8
tables, and `rune-craft-end-state.ts`, which applies them, may read either.

`scripts/verify-rune-chance-layout.mjs` holds the one WebGPU failure the runtime
cannot report. A rejected pass is caught by a validation scope and falls back to the
processor; a *misread* buffer is not rejected at all, because every offset is inside
the buffer and every value is a number. Neither side writes an offset of its own — both
take them from `rune-chance-layout.ts`, and the shader interpolates them — and this
confirms that is still true.

`scripts/verify-rune-cleanup-equivalence.mjs` answers the other question, which the
calibration oracle deliberately cannot: whether this build says what the last one did.
It records every public field of every row over a fixed population and eight settings
and preset scenarios, and diffs them against a recorded baseline. The gates are
complementary — the weights gate says the score means the right thing, the set gate
says the same rune is scored alike whatever it is labelled, the slot gate says the
floor cuts every slot at the same place, the craft gate says a Gem does what §8 says,
the oracle says the probability is right, the stability gate says the resolution is
enough, and the equivalence gate says a refactor moved none of them — and a change to
the engine runs all of them.

**The equivalence gate treats `chance` as a numeric field with a tolerance and every
other field as exact.** It was exact on every field before, because the odds were
enumerated rather than counted; now a baseline recorded on one build and compared on
the next agrees on `chance` to the resolution of §7.2, and on verdict, reason, preset,
rank, Max value and standing to the bit.

## 10.1 What it costs

Measured on a synthetic account of 1,500 runes against the eight shipped presets, in
Node, warm — three settings, because the craft sliders are what the old engine cost
the most of:

| | Enumerated | Counted |
| --- | ---: | ---: |
| No craft credited | 1.25 s | 0.83 s |
| Gem and stone at maximum | 8.98 s | 2.39 s |
| 400 level-0 runes, craft at maximum | 9.20 s | 1.92 s |

The verdicts move by one or two runes across the whole box, which is §7.2's table read
from the other end. Three things account for the difference, and only one of them is
the counting:

- **The event schedule collapses** (§7.1). Every remaining improvement precedes every
  remaining addition, so the additions are a *subset* and not an ordering:
  `C(10,4) = 210` arrangements where the old engine walked 5,040.
- **A rune is played forward once** however many presets ask about it. Playing it out
  is a fact about the rune; only the pricing is a fact about the role.
- **Pricing is a table lookup.** A `Valuation` is linear by contract, so the eleven
  slopes are read once per role into a flat array. That is the innermost operation of
  the whole calculation, and it was a `Map` lookup per line per branch.

**§9.1's ordinary box is now the expensive half**, which it was not before: it is one
enumeration of every line-up a slot can draw, priced in every build of the family, and
it is memoised per slot, main property, craft credit, lineage and build family — so it
is built a hundred-odd times for a whole account rather than once per rune.

## 10.2 Where the counting happens

**The odds are the one part of this calculation shaped like a graphics card's work**:
the same short arithmetic, a few million times, with no branch that depends on another
lane. So `app/lib/compute/` offers it to the card whenever the user's Hardware
acceleration setting allows and the card accepts, and the status line under the table
says which engine answered.

The structure is stated in `docs/HARDWARE-ACCELERATION.md` and is deliberately not
specific to runes. What matters to this document is what it does *not* move:

- **The card answers one question only** — how many of a rune's runs cleared a bar.
  Every certainty of §7, every threshold, every gate and the whole of the policy stay
  on the processor, so a verdict cannot depend on where it was computed.
- **The runs themselves are identical**, because every draw is integer arithmetic on
  both sides: the same hash of the same counter, and the same multiply-high for turning
  it into a number below a bound. A float there would round the hash above 2²⁴ and the
  two engines would draw different rolls.
- **The pricing is not identical**, because a card works in single precision. That
  moves a score by about one part in ten million, so a run whose end state sits within
  that of the bar can fall on either side of it. The agreement gate allows up to one
  percentage point of share difference for accumulated float rounding; jobs near the
  active policy bar are then rechecked on the processor before the verdict is settled.
- **A card must prove itself before it is used.** `runeChanceAgreement` puts a small
  battery of hand-built runes through both engines and compares; a card that disagrees
  by more than the tolerance is not used at all, and the status line says Processor.
  That turns the one failure mode a shader has — quietly wrong numbers — into a visible
  fall back.

## 11. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates
this document, The Math, the deterministic weight checks, the independent calibration,
the stability gate and a fresh equivalence baseline in the same commit. A change to
what a Gem or a Grindstone does goes in `rune-craft-end-state.ts` and nowhere else; a
change to how the odds are counted goes in `rune-power-up-outcomes.ts`, and if it
changes the draws it changes the shader in the same commit. A new uncertainty is named
as an assumption, never smuggled in as a default.
