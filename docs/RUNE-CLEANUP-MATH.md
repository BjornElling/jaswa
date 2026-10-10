# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` and `docs/RUNE-ROLE-METRICS.md`
**Reviewed:** 10 October 2026

This document describes the calculation, not the game rules. Game facts and their
sources belong in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. `app/lib/rune-substat-weights.ts` decides what one substat
is worth to one role, `app/lib/rune-craft-end-state.ts` decides what a Gem and a
Grindstone do, `app/lib/rune-power-up-outcomes.ts` decides what a rune may still
become and how likely it is, `app/lib/rune-cleanup-model.ts` is the one arithmetic
implementation of everything else, and `app/lib/rune-cleanup-advice.ts` applies policy.
`npm run verify:rune-substat-weights` holds the weights deterministically,
`npm run verify:rune-slot-neutrality` holds the actual quality floors and mixed
grade population, `npm run verify:rune-slot-policy-matrix` holds the complete funnel, `npm run verify:rune-craft-single-source` keeps the craft rules in one
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
| Upgrade target and new-line type | Uniform over legal choices — a game rule, `RUNE-CANONICAL.md` §7. |
| Main-property rate on slots 2, 4 and 6 | Assumed uniform over the slot's legal mains (§9.3); not measured. |
| Generated drop's default grade | Simulator assumption: odd slots 75 % Hero / 25 % Legend; even slots 25 % Rare / 50 % Hero / 25 % Legend. Unsorted drops have not been measured. |
| Artifact main properties | Verified table in `ARTIFACT-CANONICAL.md` §2; confirmed against 262 real artifacts. |
| How a role's artifact choice fills two slots | Stated assumption: evenly over the stats it named (§4.1). |
| The set a build completes | **Not modelled.** A role states no set combination, and guessing one from the candidate is what §4.3 forbids. |
| What a substat is *worth* to a role | A product decision, as `RUNE-CANONICAL.md` §12 requires. §4 states it in full. |

The stochastic rules a rune's own future follows are applied in one loop — the one
that plays a rune forward, in `app/lib/rune-power-up-outcomes.ts` — and checked
against a separate simulation written from the game's schedule rather than from that
loop.

## 2. One currency, including flat stats

All relevant substats are converted to **maximum-roll equivalents of the rune's own
star class**. A percent line divides by its own class's maximum. HP, ATK and DEF flat
lines first become percentage points of the selected reference monster's base stat —
a conversion that is the same at every star class — and then divide by the matching
percentage line's maximum for the rune's class. For a six-star rune:

```
flat HP contribution = (flat HP × 100 / reference HP) / 8
HP % contribution    = HP % / 8
```

and for a five-star rune the divisor is the five-star HP % maximum instead. The same
conversion is used for ATK and DEF. Thus `HP +375` and `HP % +8` can be compared
without a made-up universal flat-stat weight. SPD, CRI Rate, CRI DMG, RES and ACC are
native points and divide by their own class's maximum roll, so `SPD +5` on a
five-star rune is one whole maximum roll, exactly as `SPD +6` is on a six-star one.

**It used to be six-star rolls for every rune**, with a main-property factor on top,
which read a perfect five-star rune at 67 % and a perfect four-star one at 45 %. That
was the star tables talking: it weighed a lower-star rune's stats by how far each
one's table happens to shrink — CRI Dmg from 7 to 6, SPD from 6 to 5 — and printed the
result as a judgement of the rune. A rune is now measured against the best rune of its
own class (§5) and its chance is played forward with its own class's rolls (§7), so
every figure on its row answers "how good a rune of this class is this".

**What a role needs stays six-star** (§4). The finished build the runes are collected
for is a six-star one, so a requirement, the main properties that come off it and the
Grindstones that come off it are counted in six-star rolls, and the weights that come
out of it are the same for every star class.

The reference base is the average of the user's own level-40 monsters in the role's
family. A missing family uses the account-wide level-40 average; with no level-40
monster, Rune Clean-up refuses to calculate rather than fabricating a reference.

**This makes lines comparable. It does not make them equal**, and §4 is the part that
says so.

## 3. What a target means

A positive role target says the role aims at that stat, and **how far it aims**.
It is deliberately not a per-rune requirement and it is never used as a cap. A 21 SPD
rune remains more valuable than a 17 SPD rune in a role aiming at 17 SPD per rune:
its surplus lets a different rune carry HP, ACC or another required stat in the
eventual build. **No rune is ever scored lower for exceeding a target.**

Only these things make a line worth nothing: the role has no positive target for
its target stat, the build already meets that target without any substat at all, the
effect id is illegal on the slot, or it duplicates an effect id the game forbids. Set
and main-stat preferences determine preferred, acceptable and broken rank; they do
not turn a wanted substat off.

**A slot the role names no main stat for accepts every main that slot allows, at
the broken rank.** This is the canonical reading. Leaving a slot blank means the role
has no preference there, not that it refuses to judge runes in it — a role that
states slots 4 and 6 and leaves slot 2 blank still judges slot-2 runes, and they take
the broken main rank because nothing was preferred. The opposite reading would make a
rune the role wants report "No role can use it" because of a slot it does not
mention, which is the invisible failure `AGENTS.md` §0.1 forbids.

## 4. What one substat is worth

**This section replaced the model in which every positive target was a switch.**
Under that model a maximum Accuracy roll and a maximum CRI Dmg roll scored
identically for Fast DD, because both stats had a positive target; a 215 SPD target
and a 25 Accuracy target asked the runes for the same thing. They do not.

Each target gets a **multiplier between 0 and 1**, and every max roll of that stat is
scored with it. The multiplier is derived in the steps below, for one role and one build.
Nothing in it reads the rune being judged, which is §4.3's whole subject.

### 4.1 Subtract what the build already brings

```
needed = max(0, target − reference base − the build's main properties − the role's artifacts)
```

- **Reference base** is the family average of §2.
- **Main properties** are the deterministic ordinary six-star `+15` values of all six
  slots — the largest a main property can ever be, whatever the level or star class of
  the rune being judged, because the requirement describes the finished six-star
  build. Slots 1, 3 and 5 are fixed, slots 2, 4 and 6 come from the build being
  evaluated. A percent main is applied to the reference base; a flat one is added
  outright. A slot the role leaves blank contributes nothing, because it has
  promised nothing. `mainContribution` in `rune-substat-weights.ts` reads
  `mainPropertyMaximum(6, …)` and nothing else.
- **Artifacts.** A monster carries exactly two, one of each category, and each has one
  flat main property: **HP +1,500, ATK +100 or DEF +100** (`ARTIFACT-CANONICAL.md` §2,
  confirmed against 262 real artifacts, which carry those values at every natural grade
  with no spread at all). A role states which of the three it wants and nothing
  narrower, so the two slots are **spread evenly over the stats it named** — two of one
  where it names one, one of each where it names two, two thirds of each where it names
  all three. Two artifacts' worth comes off, never more, and a role that names none
  has none credited.
- **No completed set is subtracted.** §4.3 is why, and it is the one true statement
  about the game this model deliberately declines to use.

Every term here is a fact about the **role**, not about the rune being judged. That is
what §4.3 is protecting.

### 4.2 Convert to max rolls, take off the stones, spread it, and divide by what runes give anyway

```
rollsNeeded     = needed / (what one six-star max roll of the stat is worth in its unit)
rollsToRoll     = rollsNeeded − what the credited Grindstones find of it (§4.2.1)
carriers        = how many of the six slots may legally carry the stat at all
perRune         = rollsToRoll / carriers
ordinaryPerRune = what one ordinary carrying rune rolls of it anyway
tightness       = perRune / ordinaryPerRune
weight          = tightness / (the largest tightness in this role)
```

`ordinaryPerRune` is computed slot by slot from the same event model the chance
calculation uses, applied to an ordinary six-star **Legend-born** rune: it draws four
sub-property lines uniformly without replacement from the effect ids the slot allows,
each line takes one initial roll, and four upgrades fall uniformly across the four —
eight rolls. So each of a slot's `n` legal ids appears on `4/n` of runes, a line that
exists collects two rolls on average, and a roll averages the midpoint of its
interval. **The flat/percent asymmetry survives it**: a slot whose main property is
ATK % supplies its ATK only through flat ATK lines, and is correctly read as
supplying very little ATK rather than none.

**Why Legend-born, when a Hero rune rolls seven times and a Rare six.** A Hero rune
starts with three lines, improves them at `+3`, `+6` and `+9`, and draws its fourth
line at `+12` with one roll; a Rare starts with two and gains two. Either still ends
with four lines drawn uniformly from the same ids, so every stat's supply shrinks by
the same factor — 7/8, 6/8 — and a factor common to every stat is exactly what the
normalisation removes: the weights are identical whichever grade the yardstick is
built from. What the grade *does* change is how much a rune can become, and that is
answered from the rune's own schedule (§7, §8); the reference a rune is measured
against (§5, §9.1) is the Legend-born one, so a Hero rune that is perfect for its grade
reads below 100 % because it genuinely rolled once less.

#### 4.2.1 What the Grindstones find

Every grindable line of every rune in the finished build carries the comparison
Grindstone — the fixed credit used to price the role's requirement (§6, §9.2) — so a
role gets part of a grindable stat from stones rather than from
rolls. How much depends on **how many lines hold the stat**, and that depends on how
much the role asks for: a small ATK need is met by a line or two and brings a stone or
two; a large SPD need puts SPD on every rune that may carry it, and every one of those
is ground. So the build is read as holding just enough lines of the stat to meet the
need, each worth what an ordinary line rolls plus its stone, and never more lines than
the six slots may legally hold, flat and percent counted separately because a rune may
carry both:

```
lines           = min(legal lines, rollsNeeded / (ordinary line rolls + its stone))
relief          = lines × its stone
rollsToRoll     = rollsNeeded − relief
```

Below the cap this lowers the requirement in proportion — by the stone's share of a
ground line — which is exactly what adding the stones to the ordinary supply would
have said instead: the two readings agree. At the cap it lowers it by a fixed amount,
because every line that can be ground already is and the rest falls on the rolls
alone. The stones are ordinary six-star ones whatever the candidate's lineage, for the
reason the ceiling and the box are ordinary: the yardstick must not move with the rune
it measures. **A Gem is not credited here.** One Gem per rune goes to whichever line the
weights price highest, so crediting it in the weights would make them depend on
themselves; it lives in the ceiling and the box, where the weights are already settled.

Fast DD's example below, with Hero stones at three quarters:

| Target | Rolls needed | Lines | Stones find | Weight without | Weight with |
| --- | ---: | ---: | ---: | ---: | ---: |
| SPD | 18.33 | 6.00 (every slot) | 4.00 | 1.000 | 1.000 |
| CRI Rate | 12.00 | — | 0 | 0.655 | 0.837 |
| CRI Dmg | 6.43 | — | 0 | 0.440 | 0.562 |
| ATK | 4.86 | 3.33 | 1.66 | 0.402 | 0.339 |
| Accuracy | 2.63 | — | 0 | 0.159 | 0.203 |
| HP | 3.72 | 2.04 | 1.30 | 0.155 | 0.129 |
| DEF | 1.89 | 1.05 | 0.64 | 0.100 | 0.085 |

The stats no stone can touch weigh more against the ones it can, which is the whole
effect: a role that grinds its SPD needs fewer SPD rolls from its runes.
`verify:rune-substat-weights` holds it — the accounting, the lines at both ends, and
that nothing moves with no stone credited.

The innate property is left out of `ordinaryPerRune`. Exactly half of runes have one
and a role cannot plan around it; it is counted in full in a rune's own score, and
leaving it out of the yardstick raises every ratio by about the same factor, which
the normalisation removes.

**Why a ratio of means and not the tail probability.** `P(an ordinary rune supplies
this share)` is the obvious reading of "how hard", and it was implemented and
measured first. Every target a real role states sits deep in that tail, and tails
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
scored alike. The alternative — every weight zero — would leave the role unable to
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
bodies relabelled set by set, against roles that preferred every set equally, the
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
lowers the ceiling and flatters every rune carrying it; a set that relieves the tightest
target lowers that target's tightness, the normalisation lifts every other weight, and
the ceiling rises instead. Neither ordering is one a player asked for or could predict.

**No choice of denominator repairs it.** Max value is a ratio, so it is invariant under
scaling the weights, and the damage is not a scaling — it is a change in the *shape* of
the weight vector, which moves each rune's ratio by an amount that depends on what that
rune happens to have rolled. Equal treatment across sets therefore requires that the
weights not depend on the candidate's set at all. That is arithmetic, not preference.

A set still decides a great deal through the role's preferred/acceptable/broken
ranking, but **Intangible is a permanent exception**: its set side is always
`preferred` for every role. Intangible is not offered in the role set choices,
and no setting can downgrade or override that rule. The rune's main-stat preference
remains a separate judgement. The two retention settings are separate policy
preferences: the 4-set switch and Intangible slider widen the share of their own
ordinary box that can pass the quality and chance gates. They never change the
score or downgrade the permanent Intangible set rank.

**The way back.** If the requirement should count set bonuses again, a role has to
state the set *combination* its builds use. `RUNE-CANONICAL.md` §10.1 already argues
that a build is a combination rather than a list of sets, and `app/lib/rune-set-pairs.ts`
already holds that vocabulary for monsters. A combination the role states is the same
for every candidate, so it can shape the requirement without tilting the comparison; a
combination inferred from the one rune under judgement cannot. Until a role says it,
this model does not guess it.

`npm run verify:rune-set-neutrality` is the check, and it holds both halves: identical
rune bodies must receive identical answers under every set label, and a role that
does rank sets must still be obeyed.

### 4.4 A worked example

Fast DD, against a reference attack-type monster of 9,708 HP, 808 ATK, 568 DEF,
105 SPD, 18 CRI Rate, 50 CRI Dmg and 4 ACC; the build is ATK % / CRI Dmg % / ATK %
in slots 2, 4 and 6, and the role names ATK artifacts and no others, so both
artifact slots are ATK, and no Grindstone is credited (§4.2.1 shows what one does).
The candidate's set is not an input, so this one table is the answer for every rune in
that slot of that build (§4.3).

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
formula — **the best legal ordinary rune of the candidate's own star class for this
role in this slot** (six-star for an Ancient rune):

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
Max value = score / ceiling
```

Both are in the candidate's own class's max rolls (§2), so a perfect four-, five- or
six-star rune reads 100 %. **There is no main-property factor any more.** It used to
multiply by the candidate's `+15` main over the six-star one, which read a perfect
five-star rune at 67 %; but a main property decides which build a rune belongs to, not
how good a member of that build the rune is, and the requirement already counts every
main at its six-star `+15` (§4.1). An Ancient rune is a six-star rune measured against
the ordinary six-star ceiling. Ordinary runes are capped at that ceiling; Ancient runes
are not, so a higher Ancient initial roll can correctly print above 100 % rather than
being flattened to it.

`npm run verify:rune-substat-weights` builds that rune for every star class, slot and
build of every shipped role and fails unless it reads exactly 100 %.

**Max value is what the row prints and is not what the gates read.** A ratio against
the perfect rune of a slot is an honest description of one rune, and it is not
comparable between slots, because the perfect runes of two slots are not equally far
above what those slots ordinarily produce. §9.1 states the second anchor the gates
use and why the two numbers have to stay apart.

### 5.1 Every build of a role is now evaluated

A role describes a family of builds. It used to be enough to judge a rune against
the first build whose own slot matched, because nothing outside the rune's slot could
change its score. §4.1 ended that: a build with HP % in slots 4 and 6 asks its runes
for thousands less HP than one with ATK % there. Every compatible build is therefore
prepared and **the rune keeps its best**.

**Every compatible build is a complete reading.** A role's builds are the main-stat
combinations it accepts in slots 2, 4 and 6. Each supplies its own Max value, quality
floor and Chance. A build clears only when that same reading clears both gates; a
high Max value from one build may not borrow a passing Chance from another. Best role
is then the passing reading the rune is expected to be worth most to, or, where none
pass, simply the reading it is expected to be worth most to (§9.6).

The obvious worry is the count: three mains preferred in each of slots 2, 4 and 6 is
27 builds. A rune only fits the builds naming its own main, so that is nine for a
slot-2 rune and 27 for a slot-1 rune, and it costs less than it sounds, for three
reasons. A rune is played forward once however many builds ask about it; another build
is another price list over the same runs. A build whose best end state misses its own
bar settles at zero without a run. And two builds whose main stats differ only where
the role wants nothing price every line alike and draw the same bar, so they ask one
question, counted once — on a role with 64 builds that was half of its jobs. Measured
on the processor, 2,500 runes against the shipped roles went from 2.7 s to about 8 s;
adding a 64-build role costs a further 1.5 s. The counting is the part the graphics
card takes over (§10.2).

**The consequence, stated rather than left to be discovered.** A rune with one
excellent line may still find the build whose other targets are covered by main
properties, because that is the build in which its line is worth most. But the row
reports that build's own Chance as well; it never splices together two favourable
answers. Narrowing the family would mean asking the user which build they actually
intend — a role-model decision, not an arithmetic one, and not made here.

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
   replaced line loses every roll it collected — and its stone, unless the Gem re-rolls
   the line's own id (rule 3). **The new line is worth the Gem's roll plus the credited
   Grindstone** wherever its id is grindable (rule 4), because a converted line can be
   ground like any other; `gemOptions` prices every Gem that way, and `craftedLines`
   hands the same stone on to whatever acts on the verdict. A rune may carry one
   converted line at a time, so where it already has one, that is the only line a
   further Gem may replace.
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

`Chance` is the probability that a rune's final `+15` Max projection reaches the quality
floor. The random substat part ends at `+12`; the deterministic main-stat increase from
`+12` to `+15` is included in the final projection and never adds a substat roll. It is answered in three steps, and
the first two are exact:

1. **A rune with no substat events left** — already `+12` or `+15` — has nothing to project.
   Its chance is `1` or `0`, and the row says `Already there` or `Below the floor`
   rather than dressing a certainty as a gamble.
2. **A rune whose best possible end state misses the bar** cannot reach it by any road,
   and one whose **worst possible end state clears it** cannot miss. Both bounds are
   computed, not sampled, and between them they settle most of a real box.
3. **Everything else is played forward and counted.** The rune is taken through its
   final substat event at `+12` `chanceRuns` times by the game's own loop, each run is
   priced and offered its craft end state, and the answer is the share that cleared the
   `+15` bar. From `+12` to `+15`, only the main property grows; no new substat event is
   generated.

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
against the eight shipped roles:

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

The loosest policy stop asks for 1 %, which is forty-one sample increments, but sampling
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

A sub property's stone is deliberately left out of the hash. It prices an end state
and never decides where an improvement lands, and taking it in gave a rune ground to
exactly the credited stone a different stream from the same rune bare — which, once
the Gem's expectation began choosing Best role (§9.6), let the grind move the role
against §9.2.

`npm run verify:rune-chance-stability` is the check, and it is the one that says
counting is enough. One population is judged several times at **different
resolutions** — a quarter of the shipped run count, the shipped one, and sixteen times
it, which is a sixty-fourfold sweep end to end — with nothing about the runes or the
policy changing, and the totals, the breakdown by slot, by role and by
preferred/acceptable/broken rank, and the certainties all have to hold still. Measured
over 3,000 runes with Gems and Grindstones credited:

| | Moved by |
| --- | ---: |
| Power up and Sell at `+0` | 0 runes |
| Power up and Sell at `+9` | 8 runes in 3,000 |
| Any one slot's retained count | at most 3 |
| Any one role's retained count | at most 4 |
| **Everything at `+12` and `+15`** | **nothing at all** |

The last row is not luck: a rune at `+12` has no substat events left, so §7's first
step settles it and no run is ever drawn. A rune at `+15` is the same substat state,
with the deterministic main-stat increase included in its displayed projection.

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

## 8. Runes below +15 and below six stars

A rune's Max value is what it can still become, so an unfinished rune is projected to
its own best legal end state before it is scored.

| The rune | What the projection does |
| --- | --- |
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes which remaining events improve born lines and which add new lines. The lines it gains are drawn without replacement from the ids the slot, the main property and the innate leave legal; the order they arrive in cannot matter, because no improvement follows them. Gem legality is settled after the final line-up exists. |
| Improvements still to come | Every one of them lands on a line the rune already holds, because improvements precede additions without exception (§7.1). In the best case they concentrate on whichever held line is worth most — the value of a line-up is linear in how they are split and the Gem's gain is convex in it, so the maximum is always at a corner. |
| Below six stars | Its own star's substat intervals are used for every future roll, its lines are priced in its own star's max rolls, and it is measured against the perfect rune and the ordinary box of its own star class (§2, §5). It is neither ignored nor given an artificial six-star roll. |
| Hero, Rare, Magic or Normal born | Its own grade's schedule decides every remaining event — a Hero rune improves three lines and draws its fourth at `+12`, seven rolls in all — so its best end state and its chance are its own. It is measured against the Legend-born reference, so a rune perfect for its grade reads below 100 % (§4.2). |
| Ancient | Initial-roll terms in its Max-value and Chance projections use the Ancient interval; upgrades, role valuation, the reference box, main property and denominator use ordinary six-star rules. Its craft items remain Ancient because that is a legality rule. |
| Already `+12` or `+15` | No substat event is left to project. The `+15` main-stat value is deterministic, so its Max value is settled and its chance is 1 or 0. The row says `Main stat only`, `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator never moves with the candidate's own rolls, lineage or level; it moves
with its star class and nothing else. A perfect four-star rune reads 100 % against the
perfect four-star rune, and whether a four-star rune is worth keeping at all is the
floor's question, asked of the four-star box (§9.1).

## 9. Verdict and unbounded role matching

The population judged is every rune the import holds, and no setting narrows it.
This is binding because every rune is judged independently. A rune engraved on a
monster and a rune already at +12 are judged like any other. The table's
Engraved/Inventory buttons and its level range are presentation filters applied
after the engine has answered, and they change no figure.

For every build of every role the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. Every viable reading competes:
a preferred reading never suppresses an acceptable one, nor a broken one while the
Broken runes setting permits it. The rank makes that reading's own gates stricter or
looser; it is not a priority rule between roles. **The Chance floor is one
comparison: the rune's chance in that same build reading (§5.1) — against the Power-up policy
stop**, and the stops mean what their labels say: Full YOLO 1 %, Adventurous 5 %,
Balanced 20 %, Picky 50 %, Take no chances 80 %. They used to run 2 %–40 %, so Take no
chances still rolled a rune that would miss more often than it arrived. The Chance
column prints whole percentage points rounded **down**, so the number on screen clears
the stop exactly when the rune does; rounded to the nearest point, a 79.6 % rune
printed `80 %` beside a Sell. A real chance under one point prints `<1 %`.

A passing rune is eligible for every role it passed. If it passes at least one
role, it is **Power up** below +12, **Keep** at +12, and **Power up** again at +13 or +14. At +15 it is **Keep**. Between +12 and +15 the
action is deterministic main-stat investment; no new chance is shown. **Best role is
the passing reading the rune is expected to be worth most to** (§9.6). Max value and
Chance always come from that same build. If no reading passes both gates, Best role
is instead the reading it is expected to be worth most to, regardless of its Chance.
A passing reading therefore always outranks a failing one. This rule is the single source
for every Best role label in Rune Clean-up and Rune Simulator; it cannot displace
another rune or make an otherwise passing rune **Sell**. A rune that passes none of
the roles is **Sell** for the first applicable ordinary reason.

The +12 and +15 readings are otherwise identical: Max value, standing, chance and
the keep/sell decision are all based on the same finished +15 projection. +15 is a
display checkpoint, not a second recommendation gate. Thus a rune that fails the
requirements is already **Sell** at +12, and an owned rune at +15 still displays
**Sell** when its final projection fails them.

The 4-set and Intangible settings alter only the retained share used by the two
gates. They do not create a finite role inventory, a global quota, or a one-rune-
per-role assignment. This keeps their intended relative preference while making
the verdict independent of how many other runes happen to match the same role.

**The quality floor is a minimum discounted Max value**, rather than a retained
percentile disguised as a quality label. Its five stops are **10 %, 35 %, 55 %,
75 % and 90 %**. G1 genuinely requires at least 75 %, and the replay-tested stop
at least 90 %, in one complete compatible build reading. Accepted and Broken
discounts apply before this comparison. Set preferences cannot undercut the minimum.

## 9.1 A quality minimum and a complete selling funnel

The perfect rune still defines Max value (§5). Slot balance may raise the
selected minimum, never lower it. It is measured on the **original generated
population**, with equal numbers per slot and every legal main cycled evenly.
A main no active role can use stays in the denominator and is sold.

Each fixed sample body is evaluated at +0, +9 and +12. It must survive both
power-up decisions and finally be kept at +12. The +12 survivor count is divided
by the original generated count. The ordinary Legend-only distribution remains
a diagnostic standing and tie-breaker; it no longer defines the quality gate
or the slot calibration.

## 9.2 One standard for every rune

**Every rune — below, at and above `+12` — is judged on one question: what its Max
value will be at `+15` with the active items credited.** Every grindable line carries
the credited Grindstone, the Gem goes where §6.1 says it gains most (and nowhere, if
no placement beats the line it would replace), and a Gemmed line is ground too. The
perfect rune and ordinary box are held at one neutral Hero / three-quarters reference
credit, so changing the craft sliders changes the candidate's projection without
moving the common ruler underneath every other rune.

A stone the player has already spent is part of the rune and meets the credited one
through §6's `max`: a rune ground to no more than the credit reads **exactly** as it
did bare, and one ground past it can only rise. Grinding a rune therefore never moves
it onto a different scale.

**The old moving-ruler reading is gone.** Crediting an item changes the candidate's
projected end state and its chance of reaching the fixed floor; it does not raise the
perfect denominator or the ordinary population at the same time. A more generous
craft setting can therefore only make a rune easier to keep, while a less generous
one can only make it harder. A stone already spent remains part of the rune and meets
the active credit through §6's `max`, so a real stone no larger than the credit changes
nothing. `verify:rune-cleanup-craft-monotonic` checks the candidate rule, and
`verify:rune-cleanup-preference-monotonic` checks the complete recommendation funnel.

The row names one role and prints one build reading's figures — its Max value,
standing and Chance together (§5.1).

### Future craft is already part of the projection

For a rune observed at level `l`, let `R_l(ω)` be one legal completion through +12.
Every completion is crafted before it is valued:

```
S_l(ω) = score(best legal craft(R_l(ω), active credit)) / fixed neutral ceiling
Max value = max_ω S_l(ω)
Chance = P(S_l(ω) >= the reading's floor)
```

This applies at +0 and +9 as well as +12. A Gem chooses the largest legal net gain
on the completed line-up, not automatically the weakest visible stat. It is never
forced when the existing rune is better. Every grindable final line receives the
credited Grindstone, including revealed lines and the Gemmed replacement.

A fourth line is certain to appear, but its Grindstone benefit is conditional on
its id. If SPD is one of seven legal reveals on a Hero +9 fixture and it is the only
valuable stat, its expected future Grindstone gain is `g_SPD * w_SPD / 7`, not
zero and not the full SPD stone. Revealing an unwanted id legitimately removes that
possible gain; it is new information, not a missing pre-+12 craft credit.

`verify:rune-future-craft` checks nine Rare/Hero/Legend checkpoints, a Gem whose
finished value is guaranteed before the reveal, the exact expected gain from a
hidden grindable stat, and a strong line where adding a Gem would be double counting.
No separate level-based craft bonus is added to the model.

## 9.3 All original drops count

Equal initial counts per slot and equal final survival shares produce roughly
equal numbers of kept runes. Measuring only usable mains would hide the many
even-slot drops the roles cannot use. Unusable mains are never made usable to
fill a quota, and a slot that cannot serve any role stays unusable.

## 9.4 One calibration for every checkpoint and policy

The canonical generator supplies 600 ordinary drops per slot and star class:
75 % Hero / 25 % Legend on slots 1, 3 and 5; 25 % Rare / 50 % Hero /
25 % Legend on slots 2, 4 and 6. These are modelling assumptions shared with
Rune Simulator, not published game drop rates. +0, +9 and +12 are checkpoints
of the same seeded bodies. A +0 or +9 Sell cannot contribute to the final count.

The sample prices 128 possible futures per unfinished candidate at each
checkpoint. A completed +12 candidate is priced directly. For each chance stop
it records the best passing score for preferred, accepted and broken readings;
the smallest checkpoint score is that body's complete-funnel limit.

All 625 combinations of the four five-stop controls are fitted as one ordered
grid. A setting inherits the floors of its immediate less demanding neighbours,
then raises floors of overrepresented slots to the lowest survivor count.
Thus stricter quality, policy, Accepted or Broken cannot re-admit a rune.
Every checkpoint and every view uses the same resulting Max-value floor.

A zero count in a small sample cannot establish a zero population. The fit
retains a one-observation tail allowance instead of emptying all slots. This
still tightens slots with a clearly larger tail. When the holdout has fewer
than 30 survivors, it reports **sparse: balance unmeasured**; that is not
evidence of evenness. The highest floors need a larger population to measure
their rare survivors. A structurally unusable slot remains a genuine limit:
balancing cannot invent a useful stat or weaken the minimum to fill it.

The four-piece preference has its own fit against the same funnel. Its target
is twice the ordinary survivor count, capped by each slot's available qualifying
four-piece runes and inherited floors. Only four-piece floors can soften;
two-piece candidates retain their own floor. Intangible preference softens
only the extra correction on an Intangible rune. Neither can undercut the quality
minimum. Calibration always uses neutral Hero / three-quarters craft credit,
so craft choices change candidates without moving another rune's ruler.

`verify:rune-slot-neutrality` holds quality anchors, grade mix, uniform mains,
checkpoint identity and empty inputs. `verify:rune-slot-policy-matrix` follows
independent sample bodies through the complete +0 → +9 → +12 funnel, exercises
each slider stop and extreme combinations, and checks all 625 floor combinations
for monotonicity. Its denominator is every original generated drop.

## 9.5 The live Statistics box is an estimate, not a second model

Rune Set-up's Statistics box asks two deliberately narrow questions of one fixed
synthetic population:

- **Percent to roll** is the share of the population at `+0` whose Rune Clean-up
  verdict is `Power up`.
- **Percent to keep** is the share of the original population whose `+0` and `+9`
  verdicts both survive the sell gate and whose `+12` verdict is `Keep`.

The population is 50 runes for each of the six slots, or **300 runes at each
checkpoint**. It uses the simulator's drop-grade mix of six-star runes, with every
legal main cycled evenly. Each rune has its own deterministic random stream, so the
+0, +9 and +12 records are
checkpoints of the same bodies rather than three unrelated samples. The statistics
calculation then uses the ordinary advice engine, including the current roles,
quality floor, chance policy, set preferences and craft assumptions. Accepted, Broken,
Intangible, the four-set preference and craft credit still change their own verdicts, but the floor's slot-balance
calibration uses one fixed neutral yardstick for every setting. Otherwise tightening a
filter or reducing craft credit could widen the calibrated preferred-main floor and make
a stricter choice appear to keep more. It follows the same funnel as the Rune Simulator:
runes sold at +0 never reach +9, and runes sold at
+9 never reach +12. A worker keeps the calculation off the interface thread, and a
newer slider choice supersedes an older answer.

This is intentionally a fast, comparable indicator. At the worst-case proportion
of 50 %, 300 observations have a binomial standard error of about 2.9 percentage
points and a rough 95 % interval of about ±5.7 points. That is useful for seeing how
the settings move the recommendation, but it is not evidence of the game's real rune
drop rate and it is not the population from which the scoring rules are inferred.
The diagnostic standing remains the closed-form `ordinaryBox`; the larger
600-per-slot sample in §9.4 supplies the complete-funnel calibration.

There is no serialized ordinary population to become stale. `ordinarySample` calls
the canonical generator in `rune-generation.ts`, which is also the generator used by
the Rune Simulator. If a game rule or a generation bug is corrected there, the next
calculation creates the updated deterministic population automatically. Keeping the
population as a fixed seed plus a generator, rather than as a checked-in 10,000-rune
file, makes that update safe and avoids a cache-invalidation path that could silently
judge an old population with a new method.

**What it costs.** The finished balance judges 2,000 drops per slot and the fresh
balance judges another 600 per slot, playing 64 possible futures for each fresh
candidate (128 at the two lenient chance stops). Both are computed once per star
class. The calibration depends on the roles, the reference lines and the policy,
never on the runes asked about, so the engine keeps the last four calibrations by
the content of those inputs. A refresh after a sync, one rune opened in the
overlay and the Rune Simulator's four checkpoints then reuse it; without that,
judging a single `+0` rune cost about 8 seconds in Node, as much as the whole
calibration. The first calculation still pays it: a 3,001-rune synthetic box took
about 42 seconds in headless Chromium's processor path on the development machine.
The worker kept the page responsive.

## 9.6 Which role a rune is named for

**Best role is the reading the rune is expected to be worth most to**, chosen first
among the readings that clear both gates and, only where none does, among all of them.
The order of those two steps is the promise that matters: a role that says **Sell** can
never be named while another role says **Keep** or **Power up**, because a failing
reading is not in the pool while a passing one exists. `npm run verify:rune-best-role`
holds it, rebuilding every reading of a population from the model's own pieces.

**It used to be the reading with the highest Max value, and Max value is the best
case.** At `+0` it is the one outcome in several hundred where every improvement lands
on one line at its maximum. That flatters the role that prices one stat alone. A
six-star Hero Will slot-5 rune with ATK % 5, CRI Rate 4 and SPD 5, measured against a
real account's roles, showed the whole effect:

| Role | Best case (Max value) | Expected at `+15` | Chance, exact |
| --- | ---: | ---: | ---: |
| Support | **81.7 %** | 49.2 % | 15.7 % |
| Bruiser | 79.9 % | **71.4 %** | 3.5 % |
| Bomber | 77.8 % | 65.0 % | 1.6 % |
| Fast DD | 78.4 % | 64.7 % | 8.0 % |

Support prices SPD and almost nothing else, so its perfect rune is essentially five
SPD rolls, and a rune whose three improvements all land on SPD comes close to it. But
that is what happens on a small share of outcomes: on the rest the improvements land
on ATK % and CRI Rate, which Support cannot use, and the rune ends near half of its
perfect rune. Every other role on that list uses all three lines, so every outcome
moves the rune forward. The best case named Support; what the rune will most likely
become names Bruiser.

**Chance is not the answer either**, though it looks like one. It is a tail against a
bar, and a rune whose every roll helps a little has a *narrow* distribution, which
reaches a bar above its middle less often than a wide distribution with a lower middle.
Support's 15.7 % beside Fast DD's 8 % is exactly that: the robustness that makes a rune
useful to a role is what lowers its chance of an exceptional result there. Chance stays
where it belongs, as the gate.

**How the expectation is computed.** Without the Gem, a rune's end state is linear in
every roll, so its expectation is exact and needs no runs: each improvement lands on
each held line alike at its interval's midpoint, and each line gained is any legal id
alike at its initial midpoint plus its stone (`expectedPlainScore`). Only what the Gem
adds is not linear, and it is averaged over the first 256 of the runs the chance is
counted on (`meanGemGain`) — the same runs, because a run is a function of its own
number. So few are enough because only the Gem is averaged: on a real account of 2,958
runes, averaging over all 4,096 instead named another role for 8 of them, each a
near-tie, and cost the calculation a tenth of its time. It is capped at the Max value, which no expectation can exceed, and it
carries the same accepted/broken discount. Measured against an exact enumeration of
every outcome on runes with one or two events left, it agrees to within half a point.

**What it costs.** Counting a reading's Gem over its runs is a pass over four thousand
end states, and most readings are never counted: the exact part plus the most a Gem can
add to any run (`gemGainBound`) is a ceiling on the expectation that needs no runs, so
readings are walked in falling ceiling and the walk stops at the first whose ceiling is
below the best expectation found. On a real account of 2,958 runes the calculation went
from 12.4 s to 12.7 s on the processor, and the Statistics box's 900 synthetic runes from
7.5 s to 8.0 s; the choice is made on the processor whatever counts the chances.

Max value and Chance on the row still come from the chosen build, as §5.1 requires.
The row therefore shows a lower Max value than before wherever the best case and the
expectation named different roles — which is the change, not a side effect of it.

## 10. Calibration and adversarial checks

`scripts/verify-rune-substat-weights.mjs` is the deterministic gate on §§4–5. It holds
the thing a simulation cannot: a Monte Carlo of the model's own score agrees with the
model whatever the score *means*. It checks that a stated target is no longer a
switch, that main properties, the role's artifacts and the credited Grindstones come off
the requirement while a rune's own set does not, that a met target asks for nothing,
that surplus is never penalised, that every star class is priced in its own max rolls,
that credited craft items move both ends, and that the §5 rune reads exactly 100 % at
every star class in every slot of every build of every shipped role.

`scripts/verify-rune-set-neutrality.mjs` is the fairness gate on §4.3, and it is paired
by construction: one synthetic population of rune *bodies* is generated once, every set
is judged on exactly those bodies, and every field of every answer must match. It then
checks the mirror image — that a role which *does* rank sets is still obeyed, because
a gate that only demanded neutrality would pass just as happily on an engine that had
stopped reading the set at all.

`scripts/verify-rune-slot-neutrality.mjs` holds the real Max-value anchors,
the ordinary mixed-grade population, checkpoint identity, empty inputs and honest
rejection of unusable mains. `scripts/verify-rune-slot-policy-matrix.mjs` measures
43 independent complete +0 → +9 → +12 funnels against all original drops. It uses
Pearson's χ² only when at least 30 survive; sparse outcomes explicitly report
balance unmeasured. All 625 slider combinations are checked structurally for
minimum quality and monotone floors. This does not establish statistical equality
for every combination, or for an arbitrary user's edited roles.

`scripts/verify-rune-future-craft.mjs` checks nine Rare/Hero/Legend checkpoint
fixtures against hand-calculable guarantees: a legal SPD Gem, its Grindstone,
and a Grindstone on a hidden SPD line weighted by its reveal probability. A
finished rune already better than the Gem receives no additional Gem bonus.

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
user's roles and standards. `npm run verify:rune-cleanup-calibration` is the fast
regression guard; `npm run verify:rune-cleanup-calibration:large` is the 1,000-rune
statistical run used before release.

`scripts/verify-rune-chance-stability.mjs` is the gate on §7 — whether counting is
enough. One population of rune bodies is generated once and judged several times at
different **resolutions**, which changes how finely every answer in the account is
counted while changing not a single rune, and the totals, the breakdown by slot, by
role and by rank, and the certainties at `+12`/`+15` all have to hold still. It also puts
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
and role scenarios, and diffs them against a recorded baseline. The gates are
complementary — the weights gate says the score means the right thing, the set gate
says the same rune is scored alike whatever it is labelled, the slot gate says the
floor cuts every slot at the same place, the craft gate says a Gem does what §8 says,
the oracle says the probability is right, the stability gate says the resolution is
enough, and the equivalence gate says a refactor moved none of them — and a change to
the engine runs all of them.

**The equivalence gate treats `chance` as a numeric field with a tolerance and every
other field as exact.** It was exact on every field before, because the odds were
enumerated rather than counted; now a baseline recorded on one build and compared on
the next agrees on `chance` to the resolution of §7.2, and on verdict, reason, role,
rank, Max value and standing to the bit.

## 10.1 What it costs

Historical chance-engine benchmark, before the fresh slot calibration in §9.4, on
a synthetic account of 1,500 runes against the eight shipped roles in Node, warm.
It compares the old enumeration with counted futures; it is not the current
end-to-end latency:

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
- **A rune is played forward once** however many roles ask about it. Playing it out
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

## 12. Quality-floor verification, 10 October 2026

The fresh pre-change snapshot is `tests/fixtures/rune-cleanup-quality-before.json`;
the intentional new quality contract is recorded in
`tests/fixtures/rune-cleanup-quality-baseline.json`. Both use the equivalence
script's quick deterministic population (150 runes, two scenarios). After the
quality change, making the exact maximum lazy, using native numeric sorting, and looking up
the same-id Gem directly reproduced every public field bit for bit against the
new baseline. Recheck with:

```sh
npm run verify:rune-cleanup-equivalence -- --quick --baseline=tests/fixtures/rune-cleanup-quality-baseline.json
```

The required weight, set, slot, craft-source, calibration, probability,
craft-monotonicity and chance-stability checks passed. The independent large
calibration also passed (1,000 mixed drops and 1,000 rollouts per oracle fixture).
The slot-policy matrix passed 43 holdout funnels and all 625 structural cases;
its scarce tails remain explicitly unmeasured.

A local account snapshot, completed through the normal import path, contained
2,632 runes. With the developer's saved roles and other choices, G1 baby retained
159, and You've seen my replays retained 21. These are observations of that
snapshot, not quotas: no account-dependent rank cut is applied to reach them.
Import parity passed across all entity kinds. No personal data is in either
committed baseline.

The cold full-funnel calibration is CPU work independent of the imported rune
count. Playwright uses two workers and a 60-second assertion budget to cover
that first calculation; its recommendation and layout assertions are unchanged.

Typecheck, lint and build passed, as did all 220 Playwright tests. Visual checks
reused the existing server at `http://localhost:3000/`: empty and imported
Rune Set-up, the quality choices, all 2,632 Rune Clean-up rows and The Math.
The measured settings boxes did not move when the quality choice changed.
