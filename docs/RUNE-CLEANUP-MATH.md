# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md`
**Reviewed:** November 18, 2026

This document describes the calculation, not the game rules. Game facts and their
sources live in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. What the page does with the answers — session reuse,
refresh, the safeguard controls, the filter panel — is
`docs/RUNE-CLEANUP-INTERFACE.md`.

| Module | Owns |
| --- | --- |
| `app/domain/runes/rune-substat-weights.ts` | What one sub property is worth to one role (§3–§4) |
| `app/domain/runes/craft/rune-craft-end-state.ts` | What a Gem and a Grindstone do (§6) |
| `app/domain/runes/rune-power-up-outcomes.ts` | What a rune may still become, and how likely (§7) |
| `app/domain/runes/cleanup/rune-cleanup-model.ts` | Every other piece of arithmetic: the perfect rune and a candidate (§5, §8, §9.1) |
| `app/domain/runes/cleanup/rune-quality-reference.ts` | Stratified drops, exact sample ranks and score bars (§9.4) |
| `app/domain/runes/cleanup/rune-cleanup-advice.ts` | Policy: allowances, union, Best role, verdicts, safeguards (§9) |
| `app/platform/compute/rune-chance-engine.ts`, `app/platform/gpu/*/rune-chance-*` | Where the counting runs (§10.1) |

§10 lists the checks that hold each part.

## 1. Evidence and explicit assumptions

| Matter | Status |
| --- | --- |
| Ordinary 1–6★ main and sub-property intervals | Verified tables: mains `RUNE-CANONICAL.md` §3, sub properties §7. |
| Ancient runes | Main properties are the ordinary 6★ values at every level. Lines the rune was **born** with carry the Ancient interval; a line it gains by power-up, and every improvement, rolls from the ordinary 6★ table (`addedSubPropertyRange`; evidence in `RUNE-CANONICAL.md` §7). Weights, perfect rune and sampled reference stay ordinary. |
| Innate below 6★ | **Modelled**: a 4★ or 5★ innate takes that star class's sub-property range in the generator. Only 6★ innates are measured (`RUNE-CANONICAL.md` §4). |
| Gem and Grindstone legality and ranges | Verified: `RUNE-CANONICAL.md` §8 and `RUNE-CRAFT-ITEMS.md`. |
| A value inside its legal integer interval | **Modelled** uniform; the 6★ distribution has a measured check. |
| Which line an upgrade improves, and a new line's type | **Modelled** uniform over the legal choices (`RUNE-CANONICAL.md` §7). |
| Main-property rate on slots 2, 4 and 6 | **Modelled** uniform over the slot's legal mains (§9.3); not measured. |
| A generated drop's rarity | **Modelled**: odd slots 75 % Hero / 25 % Legend; even slots 25 % Rare / 50 % Hero / 25 % Legend. Shared with Rune Simulator; not measured. |
| Artifact main properties | Verified: `ARTIFACT-CANONICAL.md` §2. |
| How a role's artifact choice fills two slots | **Modelled**: evenly over the stats it names (§4.1). |
| The set a build completes | **Not modelled** (§4.3). |
| What a sub property is *worth* to a role | A product decision, as `RUNE-CANONICAL.md` §12 requires; §4 states it. |

The stochastic rules a rune's future follows are applied in one loop, in
`rune-power-up-outcomes.ts`, and checked against a separate simulation written from
the game's schedule rather than from that loop (§10).

## 2. One currency, including flat stats

Every relevant sub property is converted to **six-star maximum-roll equivalents,
whatever the rune's star class** (`runeScaleStars`). A percent line divides by the
six-star maximum of its stat. A flat HP, ATK or DEF line first becomes percentage
points of the reference monster's base stat and then divides by the matching six-star
percent maximum:

```
flat HP contribution = (flat HP × 100 / reference HP) / 8
HP % contribution    = HP % / 8
```

SPD, CRI Rate, CRI Dmg, RES and ACC are native points and divide by their six-star
maximum roll, so `SPD +5` is five sixths of a maximum roll on any rune. A rune's stats
are measurable quantities, so every rune is weighed on this one absolute scale: against
the perfect six-star rune (§5) and against six-star drops (§9.4). A lower-star rune is
still played forward with its own class's rolls (§7), because those are the rolls it
can get.

**A lower-star main costs its `+15` shortfall** (`runeFixedScore`). The requirement
counts every main at its six-star `+15` value (§4.1). A five-star main delivers less of
its stat, and the missing amount, in six-star rolls, is priced at the role's weight for
that stat and added to the rune's score, where it is negative. A main the role does not
pay for costs nothing; a five-star ATK % main (51 against 63) costs a role that wants
ATK the twelve points it lacks. An Ancient rune's main is the ordinary six-star one.

**This was decided on November 19, 2026.** Each star class used to be measured against
its own best rune and its own drops, so a top-5 % five-star rune passed the quality
floor as easily as a top-5 % six-star one, although it is worse at every stat the role
pays for. On one scale, nearly every five-star rune sells once the floor sits a little
above its minimum, which is the intended outcome.

**What a role needs stays six-star** (§4). The finished build is a six-star one, so a
requirement, the main properties and the Grindstones that come off it are counted in
six-star rolls.

The reference base is the average of the user's own level-40 monsters in the role's
family. A missing family uses the account-wide level-40 average; with no level-40
monster, Rune Clean-up refuses to calculate rather than fabricating a reference.

This makes lines comparable. It does not make them equal; §4 says how they differ.

## 3. What a target means

A positive role target says the role aims at that stat, and **how far it aims**. It is
not a per-rune requirement and never a cap. A 21 SPD rune is more valuable than a 17 SPD
rune in a role aiming at 17 SPD per rune: its surplus lets another rune carry HP, ACC or
another required stat. **No rune is ever scored lower for exceeding a target.**

Only these make a line worth nothing: the role has no positive target for its stat, the
build already meets that target without any sub property, the effect id is illegal on
the slot, or it duplicates an effect id the game forbids. Set and main-stat preferences
decide the preferred, acceptable and broken rank; they never turn a wanted sub property
off.

**A slot the role names no main stat for accepts every main that slot allows, at the
broken rank.** Leaving a slot blank means no preference there, not a refusal to judge
runes in it. The opposite reading would make a rune the role wants report "No role can
use it" because of a slot it does not mention — the invisible failure `AGENTS.md` §0.1
forbids.

**A reading's rank is the worse of the rune's set and the build it is read in**, and a
build ranks as its weakest stated slot among 2, 4 and 6 — not the rune's own slot alone.
A slot-5 rune read in a build with DEF % in slots 4 and 6 is an acceptable reading when
the role only accepts DEF % there, and carries the accepted discount (§9) like any other.
Judging the rune's own slot alone once let a Gem win by moving a rune from the preferred
build into a merely accepted one, undiscounted. Another slot left blank is no preference
and does not lower the rank; the rune's own slot left blank still reads as broken.
Readings of equal rank compete freely, so a Gem may move a rune between two preferred
builds, or between two accepted ones.

## 4. What one sub property is worth

A stated target is a **weight**, never a relevance switch: a 215 SPD target and a 25
Accuracy target do not ask the runes for the same thing. Each target gets a multiplier
between 0 and 1, and every max roll of that stat is scored with it. The multiplier is
derived below for one role and one build. Nothing in it reads the rune being judged
(§4.3).

### 4.1 Subtract what the build already brings

```
needed = max(0, target − reference base − the build's main properties − the role's artifacts)
```

- **Reference base** is the family average of §2.
- **Main properties** are the ordinary six-star `+15` values of all six slots, whatever
  the level or star class of the rune being judged, because the requirement describes
  the finished six-star build. Slots 1, 3 and 5 are fixed; slots 2, 4 and 6 come from
  the build. A percent main is applied to the reference base; a flat one is added
  outright. A slot the role leaves blank contributes nothing. `mainContribution` reads
  `mainPropertyMaximum(6, …)` and nothing else.
- **Artifacts.** A monster carries two, one of each category, each with one flat main:
  HP +1,500, ATK +100 or DEF +100 (`ARTIFACT-CANONICAL.md` §2). A role names which of
  the three it wants, so the two slots are spread evenly over the stats it named — two
  of one, one of each, or two thirds of each. A role that names none has none credited.
- **No completed set is subtracted** (§4.3).

Every term is a fact about the **role**, not about the rune being judged.

### 4.2 Convert to max rolls, take off the stones, spread it, divide by what runes give anyway

```
rollsNeeded     = needed / (what one six-star max roll of the stat is worth in its unit)
rollsToRoll     = rollsNeeded − what the credited Grindstones find of it (§4.2.1)
carriers        = how many of the six slots may legally carry the stat
perRune         = rollsToRoll / carriers
ordinaryPerRune = what one ordinary carrying rune rolls of it anyway
tightness       = perRune / ordinaryPerRune
weight          = tightness / (the largest tightness in this role)
```

`ordinaryPerRune` is computed slot by slot from the event model the chance uses, on an
ordinary six-star **Legend-born** rune: four lines drawn uniformly without replacement
from the slot's legal ids, one initial roll each, four upgrades spread uniformly over
the four. Each of a slot's `n` legal ids appears on `4/n` of runes, a line that exists
collects two rolls on average, and a roll averages its interval's midpoint. The
flat/percent asymmetry survives: a slot with an ATK % main supplies ATK only through
flat ATK lines.

**Why Legend-born.** A Hero or Rare rune still ends with four lines drawn uniformly
from the same ids, so every stat's supply shrinks by the same factor (7/8, 6/8), and the
normalisation removes a common factor: the weights are the same whichever rarity the
yardstick uses. What rarity changes is how much a rune can become, which its own
schedule answers (§7, §8); measured against the Legend-born reference, a Hero rune
perfect for its rarity reads below 100 % because it rolled once less.

The innate is left out of `ordinaryPerRune`: half of runes have one, a role cannot plan
around it, and leaving it out raises every ratio by about the same factor, which the
normalisation removes. It is counted in full in a rune's own score.

**A ratio of means, not a tail probability.** Targets real roles state sit so deep in
the tail of "an ordinary rune supplies this share" that tail probabilities differ by
orders of magnitude for reasons a player should not value — a slot whose main takes ATK
off its own line list ranked ATK above every other stat on exactly the rune that cannot
carry it. A ratio of means is finite and smooth, and says what is true: the other five
slots must find that ATK. Which lines *this* rune may carry is the ceiling's question
(§5).

**Every target already met.** Where no target needs anything from sub properties,
every stat the role names is scored alike. All weights zero would leave the role unable
to judge any rune.

#### 4.2.1 What the Grindstones find

Every grindable line of the finished build carries the comparison Grindstone — the
fixed ruler credit (§6) — so a role gets part of a grindable stat from stones. How much
depends on how many lines hold the stat, which depends on how much the role asks for.
The build is read as holding just enough lines to meet the need, each worth what an
ordinary line rolls plus its stone, and never more lines than the six slots may hold
(flat and percent counted separately):

```
lines       = min(legal lines, rollsNeeded / (ordinary line rolls + its stone))
relief      = lines × its stone
rollsToRoll = rollsNeeded − relief
```

Below the cap this lowers the requirement by the stone's share of a ground line; at the
cap by a fixed amount. The stones are ordinary six-star ones whatever the candidate's
lineage, because the yardstick must not move with the rune it measures. **A Gem is not
credited here**: it goes to whichever line the weights price highest, so crediting it
would make the weights depend on themselves. It lives in the ceiling and the
candidate's end state.

Fast DD's example (§4.4), with Settings' starting credit, average Legend stones:

| Target | Rolls needed | Lines | Stones find | Weight without | Weight with |
| --- | ---: | ---: | ---: | ---: | ---: |
| SPD | 18.33 | 6.00 (every slot) | 5.00 | 1.000 | 1.000 |
| CRI Rate | 12.00 | — | 0 | 0.655 | 0.900 |
| CRI Dmg | 6.43 | — | 0 | 0.440 | 0.604 |
| ATK | 4.86 | 3.03 | 1.94 | 0.402 | 0.332 |
| Accuracy | 2.63 | — | 0 | 0.159 | 0.219 |
| HP | 3.72 | 1.84 | 1.53 | 0.155 | 0.125 |
| DEF | 1.89 | 0.95 | 0.75 | 0.100 | 0.083 |

The stats no stone can touch weigh more against the ones it can.

### 4.3 Why a rune's own set is kept out of it

**A completed set's stat bonus does not reduce the requirement**, although a rune is
judged for the build it would join and that build completes the rune's set. The weights
are the yardstick, and a recommendation compares runes across sets; giving each set its
own yardstick retained identical rune bodies at different rates purely by their label,
in both directions. Potential is a ratio, so no choice of denominator repairs a change
in the *shape* of the weight vector. Equal treatment across sets therefore requires
weights that do not depend on the candidate's set at all.

A set still decides a great deal through the role's preferred/acceptable/broken rank.
**Intangible is a permanent exception**: its set side is always `preferred` for every
role, it is not offered in the role set choices, and no setting can downgrade it. The
rune's main-stat rank remains a separate judgement. The retention setting *Intangible
runes* (§9) widens the share of its own runes that passes the gates; it never changes a
score.

**The way back.** If the requirement should count set bonuses, a role must state the
set *combination* its builds use (the build vocabulary of `RUNE-OPTIMIZATION.md` §2.1.1 and
`rune-set-pairs.ts`). A stated combination is the same for every candidate; one inferred
from the rune under judgement is not. Until a role says it, this model does not guess.

### 4.4 A worked example

Fast DD, against a reference attack-type monster of 9,708 HP, 808 ATK, 568 DEF, 105 SPD,
18 CRI Rate, 50 CRI Dmg and 4 ACC; the build is ATK % / CRI Dmg % / ATK % in slots 2, 4
and 6; both artifact slots are ATK; no Grindstone credited. The candidate's set is not
an input, so this is the answer for every rune in that slot of that build.

| Target | Wants | Base | Mains | Artifacts | Needed | One roll | Rolls | Carriers | Per rune | Ordinary | Tightness | **Weight** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SPD | 215 | 105 | 0 | 0 | 110 | 6 | 18.33 | 6 | 3.06 | 0.72 | 4.23 | **1.000** |
| CRI Rate | 90 | 18 | 0 | 0 | 72 | 6 | 12.00 | 6 | 2.00 | 0.72 | 2.77 | **0.655** |
| CRI Dmg | 175 | 50 | 80 | 0 | 45 | 7 | 6.43 | 5 | 1.29 | 0.69 | 1.86 | **0.440** |
| ATK | 2,500 | 808 | 1,178 | 200 | 314 | 64.6 | 4.86 | 5 | 0.97 | 0.57 | 1.70 | **0.402** |
| Accuracy | 25 | 4 | 0 | 0 | 21 | 8 | 2.63 | 6 | 0.44 | 0.65 | 0.67 | **0.159** |
| HP | 15,042 | 9,708 | 2,448 | 0 | 2,886 | 776.6 | 3.72 | 6 | 0.62 | 0.94 | 0.66 | **0.155** |
| DEF | 814 | 568 | 160 | 0 | 86 | 45.4 | 1.89 | 5 | 0.38 | 0.89 | 0.42 | **0.100** |

A maximum CRI Dmg roll is worth 2.8 maximum Accuracy rolls to this role, and a maximum
SPD roll 6.3 of them.

## 5. Value, Potential and the perfect rune

A rune's score is a plain sum over every line it carries, **the innate included**, plus
its main's shortfall (§2), which is zero for a six-star or Ancient rune:

```
score = Σ over lines of (the line's value in max rolls × its stat's weight)
      + (main at +15 − six-star main at +15) in max rolls × the main stat's weight
```

Nothing is capped or discarded. The denominator is a concrete rune — **the best legal
ordinary six-star rune for this role in this slot**, for every rune:

- four sub properties at their maximum, on the four best-valued legal effect ids;
- the most valuable of them carrying all four upgrades as well (five maximum rolls),
  the other three at one — the game cannot put fewer than one roll on a line;
- an innate at the maximum of the fifth best-valued legal id, every innate tried;
- the ruler's Gem and Grindstone (§6) spent wherever they help;
- every duplication, main-property, innate and slot rule of `RUNE-CANONICAL.md` §§3–5.

```
Potential = score / ceiling
```

Both are in six-star max rolls (§2), so a perfect six-star rune reads 100 % and a
perfect five-star rune reads less: its rolls are smaller, and its main falls short. A
very weak lower-star rune can read below zero, which says its lines do not make up for
its main. There is no multiplicative main factor: a six-star main is what the
requirement already counts (§4.1), and a lower-star main is charged only what it lacks
of a stat the role pays for.

**100 % is a reference point, never a ceiling.** No Potential, expectation or Gems &
Grinds score is capped anywhere. A rune that reads more than the perfect ordinary rune —
an Ancient rune's higher born rolls, a line already ground past the credited stone —
reads more, and keeps every recommendation that would lift it further. A cap made every
rune above the mark look alike and left nothing to recommend for it.
`verify:rune-substat-weights` holds both halves: the best maximal ordinary rune reads
exactly 100 %, and a rising line keeps rising past it. Probabilities and shares — a
Chance, a quality share — stay between 0 and 1, because they are not scores.

Potential is efficiency against the perfect ordinary rune. Accepted and Broken
matches discount the figure and the expectation by the corresponding rank
factor. The Potential safeguard uses the discounted efficiency and the
chance from the same reading. The verdict gate reads sampled quality (§9.1).

### 5.1 Every compatible build is evaluated

A role describes a family of main-stat combinations in slots 2, 4 and 6. Each
compatible build defines its own valuation, efficiency and quality bar. A blank
slot accepts any legal main in that slot. Its reference uses the candidate's
actual main, so that property still cannot appear as a sub property.

## 6. Gems and Grindstones

`app/domain/runes/craft/rune-craft-end-state.ts` is the only module that applies the craft rules, and
`npm run verify:rune-craft-single-source` keeps it that way. The game's rules are
`RUNE-CANONICAL.md` §8; that module's header lists them as applied. What this model adds:

- **One credit, chosen once by the user.** Every rune judgement assumes the one Gem and
  Grindstone set on Settings › Gems & Grindstones (`RunePotentialSettings.craftCredit`):
  each a grade (or *None*), a roll and a rounding — *Up* or *Down*; *Nearest* is not
  offered, since the word does not say which way a half goes — starting at an average
  Legend roll rounded up (`defaultCraftCredit`). It prices the candidate's projection,
  the Gem's placement (§6.1), Gems & Grinds' reading of a Gem (`RUNE-CRAFT-ITEMS.md` §5)
  and Rune Optimization's *Theoretical* items — never the ruler (below). The candidate's
  own craft uses its lineage's tables; the ordinary ruler and box remain ordinary. Items are evaluated as legal actions on actual lines, so an item helps
  only where the game would let it.
- **A Grindstone is credited on every grindable line** the rune holds, as `max(the stone
  already there, the credited one)`, never added to it: a stone can always be topped up,
  and adding would pay the rune twice for one line.
- **A Gem's new line is worth its roll plus the credited Grindstone** wherever the new
  id is grindable. `gemOptions` prices every Gem that way, and `craftedLines` hands the
  same end state to whatever acts on the verdict.
- **A Gem is never forced.** The end state is the better of "no Gem" and the chosen
  placement (§6.1) at the credit, so considering a craft item can only raise a rune.
- **A Gem is spent at `+12`, after every power-up.** The chance plays the remaining
  events out first and crafts what it actually got (§9.2).
- **The candidate's lineage sets its craft tables.** An Ancient candidate uses the
  Ancient Gem and Grindstone tables both for its own credit and for choosing its one Gem
  placement. An ordinary candidate uses the ordinary tables. The weights, perfect rune and
  reference box stay ordinary and take no lineage. They are priced with the one fixed
  ruler, `rulerCraftCredit` — an average Legend Gem and Grindstone, rounded up — whatever
  the user's credit says. Every page passes it to `newRuneAdviceScope`, and no candidate
  passes one of its own, because a ruler a caller may choose is a ruler two callers can
  choose differently.

**Why one credit.** Rune Clean-up once read a rune under three assumptions at once: its
own Gem and Grindstone sliders for the candidate, Hero items at three quarters for the
ruler and the sampled references, and average Legend items for the Gem's placement. Gems
& Grinds read a fourth. Each was defensible alone; together they let two views disagree
about one rune's craft for reasons no player could see. The credit became the user's
choice in November 2026, and that changed none of this: it is still one credit, read by
every view at once, and a change to it is a change every view's answer waits on.

**Why the ruler does not follow the credit.** For a few hours it did: the weights, the
perfect rune and the sampled drops were finished with the user's Gem and Grindstone. A
credit is an assumption about what a rune may become, and a Gem is spent only where it
gains, so a better credit can only help a rune. With the ruler moving too, it hurt: a
Legend Gem lifts the top of the drops and the perfect rune further than it lifts a
middling rune, and Statistics kept 5.7 % of its births with a Legend Gem, 6.0 % with a
Normal one and 7.0 % with none. The ruler is a yardstick, not an assumption, so it
stands still; the credit moves the rune and nothing else.
`verify:rune-cleanup-craft-monotonic` walks a ladder of ever better credits over the
whole policy and fails if any rune's odds fall or any power-up or keep turns into a sale.

**The choice and what it moves.** A richer credit raises the rune and the perfect rune
alike, so Potential moves less than either; the sampled quality share moves with the box,
which is crafted the same way. What does move is every threshold stated against them —
the *Never sell potential value* floor protects a different set of runes under a
different credit. A Gem set to *None* leaves the placement rule nothing to choose with:
Clean-up crafts no Gem, and Gems & Grinds names no stat and lets every held Gem stand on
its own gain.

### 6.1 Which line the Gem replaces, and with which stat

**Every line is offered every legal Gem, and the highest-scoring complete body at the
credit is kept, including the body with no Gem.** Which Gem is legal depends on which
line is replaced — a Gem may not duplicate one of the *other* lines, so removing the SPD
line is what makes a SPD Gem legal — so "offer the weakest line the best Gem" is a
different and wrong rule.

The body is the rune's lines with every grindable line raised by the credited Grindstone
where that raises it, and each candidate Gem the credited Gem, ground likewise (ordinary
tables for ordinary runes, Ancient for Ancient runes). The pair is chosen in the role's
own prices on that body. Gems & Grinds asks the same question of a held Gem: its lines
are ground by the credit, and only the Gem's own roll is the item's. Gems & Grinds
judges every item in the Best role Rune Clean-up chose (§9.6), and in its build where
the chosen reading names one, so the recommendation follows the rune overlay's placement
(`RUNE-CRAFT-ITEMS.md` §5.1). Measuring a held Gem against the rune as it stands was
tried and removed: it credited an SPD Gem with the stone its line could take anyway, so
the two views named different stats for one rune.

Until November 2026 the placement was chosen on a fixed average-Legend reference and
then valued at the reading's credit, because the credit and the reference could differ.
With one credit for every reading they cannot, so the placement is chosen and valued on
the same credit, and the second line-up the scorer used to carry is gone.

The comparison is of complete realized bodies, including the unchanged body with no
Gem. It keeps the body with the highest utility; an exact tie keeps no Gem,
then the first line in ascending original stat id and the first Gem in canonical option
order. Each total adds the innate contribution first, then sub-properties by their
resulting stat id in ascending order, after a replacement. This gives one fixed sum
order independent of how the export listed its lines.

The projection, the ceiling, the box, the odds and the craft planner all read the one
function, `craftedScore`, and the graphics card makes the same choice from the same
packed credit. `craftedScoreCeiling` puts the Gem wherever it gains most at the credit,
which is now the placement itself; `reachableCeiling` uses it to rule a chance out
without counting (§7, step 2). It is never a figure a view prints.
`verify:rune-cleanup-calibration` checks the rule against §8 written out afresh (§10).

## 7. Chance: a certain no, a certain yes, or a count

`Chance` is the share of futures where the rune reaches the quality bar for at
least one permitted reading. The random part ends at `+12`; the deterministic main-stat increase to
`+15` is included in the projection and adds no sub-property roll. It is answered in
three steps, and the first two are exact:

1. **A rune with no sub-property event left** — any rune at `+12` or above — has
   nothing to project. Its chance is `1` or `0`.
2. **A rune whose best possible end state misses the bar** cannot reach it, and one
   whose **worst possible end state clears it** cannot miss. Both bounds are computed,
   not sampled; the first reads the Gem at its most favourable placement (§6.1), so it
   bounds the chosen one.
3. **Everything else is played forward and counted.** The rune is taken through its
   remaining events `chanceRuns` (4,096) times by the game's own loop, each run is
   priced and crafted (§6), and the answer is the share where at least one reading cleared its own bar.
   A future that clears several bars counts once.

### 7.1 Why it is counted rather than enumerated

The exact answer enumerates every split of the remaining improvements, every subset of
the additions and every integer value of each roll, then applies the Gem decision of §6
to each end state — which depends on the realised values and cannot be factored out.
Counting gives the same answer to within its resolution, applies §6 to a realised rune
rather than to a model of it, and fits in one sentence: *JASWA plays the rune forward a
few thousand times and counts how often it ends up good enough.*

The schedule (`RUNE-CANONICAL.md` §6, `remainingEvents`) puts every remaining
improvement before every remaining addition. So no line a rune has yet to gain can
receive an improvement, the lines an improvement may land on never change, and a rune's
future is three numbers and a list.

### 7.2 The resolution, and how Chance is printed

**4,096 runs.** One rune's answer is an estimate: at `p = 0.5` its standard error is
about 0.78 percentage points (95 % ≈ ±1.53), at `p = 0.02` about ±0.43. A verdict is a
threshold, so what matters is what that spread does to a box, which
`verify:rune-chance-stability` holds (§7.3). The GPU path rechecks jobs near the active
bar on the processor so single precision cannot change a verdict (§10.1).

**The printed Chance is whole percentage points rounded down**, so the number on screen
clears a Power-up policy stop exactly when the rune does; rounded to the nearest point,
a 79.6 % rune would print `80 %` beside a Sell. A real chance under one point prints
`<1 %`; `0 %` means a settled zero or zero hits in the sample. `runeChanceText` in
`rune-cleanup-advice.ts` is the one formatter: the table's Chance column
(`rune-cleanup-grid.ts` re-exports it), Rune Simulator's Chance column and the advice
`reason` it shows all print through it.

### 7.3 The same rune always prints the same number

The stream of draws is a hash of **the rune itself** — slot, star class, lineage,
rarity, level, main property, innate and every sub property — and of the run's number.
Not a stateful generator, and not the rune's id. So two calculations of one box agree
exactly, the judging order cannot move a verdict, the graphics card reproduces the
processor's stream (every draw is integer arithmetic, §10.1), and **two identical runes
get identical odds**. A sub property's stone is left out of the hash: it prices an end
state and never decides where an improvement lands, so grinding a rune to exactly the
credited stone cannot change its stream.

`npm run verify:rune-chance-stability` judges one population at a quarter of, at, and
at sixteen times the shipped run count, and requires the totals, the breakdown by slot,
by role and by rank, and the certainties to hold still. Runes at `+12` and above never
move: §7 step 1 settles them without a run.

### 7.4 Ancient runes

An Ancient candidate's born lines already carry their Ancient values. Every line it
gains and every improvement is drawn from the ordinary six-star table (§1). The quality
floor, the weights, the sampled reference and the perfect-rune denominator are ordinary, so an
Ancient rune moves against a bar that does not. Its craft items are Ancient, because
that is a legality rule (§6). `verify:rune-cleanup-ancient` holds this: an Ancient and
an ordinary Magic rune with the same born line read the same Potential and the same
Chance within the counting band.

## 8. Runes below +15 and below six stars

A rune's Potential is what it can still become, so an unfinished rune is projected to
its own best legal end state before it is scored.

| The rune | What the projection does |
| --- | --- |
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes which remaining events improve held lines and which add lines. Added lines are drawn without replacement from the ids the slot, the main and the innate leave legal; their order cannot matter, because no improvement follows them. Gem legality is settled on the final line-up. |
| Improvements still to come | Every one lands on a line the rune already holds (§7.1). In the best case they concentrate on the held line worth most — a line-up's value is linear in the split and the Gem's gain convex in it, so the maximum is at a corner. |
| Below six stars | Its own star class's intervals for every future roll, because those are the rolls it can get. Its lines priced in six-star max rolls, its main's `+15` shortfall charged, and measured against the perfect six-star rune and six-star drops (§2, §5, §9.4). |
| Hero, Rare, Magic or Normal born | Its own rarity's schedule decides every remaining event, so its best end state and chance are its own. Measured against the Legend-born reference, a rune perfect for its rarity reads below 100 % (§4.2). |
| Ancient | Born lines at their Ancient values; added lines, improvements, the weights, the box, the main property and the denominator ordinary six-star. Craft items Ancient (§7.4). |
| At `+12` or above | No sub-property event left. The `+15` main is deterministic, so Potential is settled and Chance is 1 or 0. The row says `Main stat only`, `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator and the sampled reference never move with the candidate's own rolls,
star class, lineage or level. A four-star rune is asked the same question as a six-star
one: whether it ranks among the best six-star drops for some use.

## 9. Verdict and unbounded role matching

At each sampled future, test the rune in every permitted build. Keep or power up
when the share that reaches at least one bar meets the Power-up policy stop.
A passing rune at +12 or +15 is Keep. A passing rune below +12 or at +13/+14 is
Power up. An otherwise configured rune with no permitted use is Sell.
A potentially usable role whose required reference stats are missing makes a
rune the other roles would sell unavailable. A keep or power-up stands: the
missing role could only add events, and adding an event never lowers the union.
Worker failures keep the previous completed results.

### 9.1 A whole-slot quality allowance

Each reading compares with **every** ordinary six-star drop of its own slot, whatever
the rune's own star class, as the reading's role sees that slot in the reading's
position. Every legal main of the slot is born equally often and carries 16,384
reference bodies. A main the role can put in this slot — the rune's own, or another
the role names here while its other slots stay as the reading's build has them — is
scored in that build and scaled onto the reading's ruler by the ratio of the two
perfect runes (§5); the rune's own main keeps scale 1, so its own atoms keep the exact
tie rule of §9.4. A main the role cannot use there is a drop worth nothing to it. A
slot the role leaves blank reads every main in the reading's own build. Slots 1, 3 and
5 have one main, so their population is their own reference, unchanged.
`PopulationReference` in `rune-quality-reference.ts` owns the arithmetic.

This replaces the same-main allowance of November 18, 2026
(`RUNE-PERCENTILE-SAMPLED-PLAN.md` §3.3). A main is not priced — the build already
counts it (§4.1) — so a same-main bar kept the same share of each main, and on slots
2, 4 and 6 that is the share of a seventh or an eighth of the slot. On the shipped roles
at the *Top 2 %* stop, 1,200 finished drops per slot kept 16.7, 13.8 and 18.7 % in
slots 1, 3 and 5 against 7.3, 4.2 and 4.6 % in slots 2, 4 and 6; a slot-4 CRI Dmg rune
had to beat other CRI Dmg runes, a seventh of the supply, for a place every monster
needs once. Under the whole-slot rule the same drops keep 16.7, 17.6, 13.8, 14.3, 18.7
and 14.2 %. A main no role can use never passes, so at the loosest stops slots 2, 4 and
6 stay somewhat below the fixed slots, which is the supply they really have.
Builds that differ only in the rune's own slot read one population, so a role naming
two mains for a slot keeps one quota of that slot, not one per main.

The base allowances are 20, 10, 5, 2 and 1 %. Preferred matches use the base
allowance. Accepted factors are 1, 0.95, 0.85, 0.70 and 0.55. Broken factors
are 0.90, 0.85, 0.80 and 0.65, followed by No, which removes the event.
Intangible multiplies the allowance by 1, 1.5, 2, 3.5 or 5. Cap the resulting
share at 100 %. The arithmetic uses integer millionths before choosing the
sample index. Each allowance applies to one reading. Actual retention depends
on the union of all permitted uses and the makeup of the account.

The Power-up policy stops are 1, 15, 30, 50 and 80 %. Adventurous and Balanced
were 5 and 20 % until November 19, 2026: at the *G1 baby* quality floor the
Statistics births rolled 51 and 18 % at those stops, where the wording asks for
about one rune in five and one in ten. At 15 and 30 % they roll 20.7 and 9.7 %
(the user's own roles, settings and reference lines). Calculate each marginal
and the union on the same 4,096 outcomes. Settle provable zeros and ones first.
Use the fused processor counter for multiple live events on one future. One
live event can use the existing chance card path. A certain hit settles the
union, and any marginals required for the explanation or safeguard are still counted.

Both processor counters answer each outcome through `craftedScoreAgainst`, which
places the credited Gem only for a body within a rounding margin of one of its
bars. A plain body at or above every bar clears them, because the end state is
never below it. Otherwise the best Gem body is found in real arithmetic, one
best-first walk per line, and differs from the placement only by summation order.
On the local account, fewer than one outcome in ten thousand needed the placement,
and the advice pass took half the time. Stored Statistics streams keep exact
scores, because a later policy asks other bars of them.

### 9.2 Safeguards

Pre-grind SPD, engraving outside Scenario and Re-app/refine targets retain their
existing definitions. Potential requires the chosen reading's discounted
Potential to reach the user's minimum and its chance of reaching that reading's
quality bar to reach 1 %. Safeguards run on the verdict supplied by the same
engine and can be reapplied to held readings when preferences change.

### 9.3 All original drops count

Statistics divides investment and retention counts by the number of original
births. The model covers each legal main and uses the slot-dependent rarity
weights in §1. A main no configured role accepts stays in the denominator.

### 9.4 The reference sample and ties

A reference holds 16,384 ordinary six-star bodies, stratified by the shared
rarity mix. Each body runs from birth to +12 through the shared generator and
upgrade schedule. Its seed uses slot, star class, main, rarity stratum and its index
within that stratum. Statistics uses a separate seed stream. Prices and body
identity determine the sorted scores. Changing policy moves the bar within
those scores.

For a score `u`, the quality share is the fraction of sample scores greater
than or equal to `u`. For allowance `α`, let `k = floor(α × N)`. If
`k < N`, require a score strictly above the sample score at ascending index
`N − 1 − k`. The next representable float is the first inclusive bar above
that atom. A tied atom is either included or excluded whole. Every passing
score is positive, even at full allowance. Half the smallest positive line
price separates zero from the smallest positive score across both number
formats used by the counters.

### 9.5 The live Statistics box

Each fixed birth has +0, +9 and +12 snapshots. The box counts a birth as rolled
if +0 says Power up. It counts it as kept if it also survives +9 and the final
+12 answer keeps it, including either reroll recommendation. Statistics uses
the same advice worker pool. Changing only a safeguard reapplies it to the
checkpoint answers. A numerical policy change can reuse the fixed future
scores.

### 9.6 Which role a rune is named for

If the union clears, choose among the individual readings that contribute a
hit. Otherwise choose among all permitted readings. A forbidden reading can
supply a name when no permitted one exists. Rank by discounted expected value,
then Potential, smaller quality share, higher individual chance, role ID
and the slot 2, 4 and 6 main IDs. The overlay's Best row uses the same candidate, and Gems & Grinds judges every
Gem and Grindstone in it (`RUNE-CRAFT-ITEMS.md` §5), so no view names another role.
For each other role, choose from individually clearing builds first, then
positive-chance builds, then other permitted builds, then naming fallbacks.

## 10. Checks

| Check | Holds |
| --- | --- |
| `verify:rune-substat-weights` | §§4–5 deterministically: a target is a weight, mains, artifacts and credited stones come off the requirement while a rune's set does not, a met target asks nothing, surplus keeps paying past 100 %, a point is priced alike at every star class and a five-star main costs exactly its `+15` shortfall, a richer candidate credit moves only the rune and never reads lower, and an exhaustive search finds the best maximal six-star rune at exactly 100 %, and each lower class below the one above it, in every slot and build of every shipped role. |
| `verify:rune-set-neutrality` | §4.3, paired: identical rune bodies under every set label give identical answers, and a role that does rank sets is still obeyed. |
| `verify:rune-slot-neutrality` | Whole-slot allowances keep slots 2, 4 and 6 within reach of slots 1, 3 and 5, mixed rarity, checkpoint identity, blank input and unusable mains. |
| `verify:rune-slot-policy-matrix` | Adjacent policy monotonicity for all 625 combinations and role addition/reordering/duplication. |
| `verify:rune-future-craft` | §9.2 on nine Rare/Hero/Legend checkpoints: a legal SPD Gem and its stone, a stone on a hidden SPD line weighted by its reveal probability, and no Gem bonus for a rune already better than the Gem. |
| `verify:rune-cleanup-calibration` | An independent generator and the game's addition/upgrade loop with its own PRNG; the chance twice, with no craft and with Settings' starting items credited; and §6 against `RUNE-CANONICAL.md` §8 written out afresh, over every synthetic finished rune at eight credits, rounding up, down and to the nearest included. `:large` is the 1,000-rune statistical run. |
| `verify:rune-cleanup-probability` | The event order of §7.1 on hand-calculable fixtures with one valuable stat: a line still to come never receives an earlier improvement. |
| `verify:rune-cleanup-ancient` | §7.4. |
| `verify:rune-cleanup-statistics-funnel` | One fixed birth at +0, +9 and +12 and survivor-only Statistics counts. |
| `verify:rune-craft-lineage-placement` | §6.1 complete-body placement, canonical stat-id sums, Ancient/ordinary lineage, no-Gem ties and the percentile Improvements projection. |
| `verify:rune-cleanup-craft-monotonic` | A more generous credit never lowers what a rune can reach or its odds, and a stone spent up to the credited one moves no row (§9.2), under Settings' starting credit and a smaller one rounded down; and over the whole policy, a ladder of ever better credits never lowers a rune's odds or turns a power-up or keep into a sale (§6). |
| `verify:rune-cleanup-preference-monotonic` | A more lenient slider never sells a rune a stricter one keeps, over the whole recommendation funnel. |
| `verify:rune-chance-stability` | §7.3: the box holds still across a sixty-fourfold resolution sweep, and two copies of one rune get one answer. |
| `verify:rune-quality-reference` | Exact tie bars, deterministic stratification, scoring identity, union counts, same-reading protection, missing input withholding only a sale, and `craftedScoreAgainst` agreeing with `craftedScore` at, beside and away from every bar at three credits and both lineages. |
| `verify:rune-best-role` | §9.6. |
| `verify:rune-craft-single-source` | Source text: only `rune-craft-items.ts` and `rune-craft-end-state.ts` read the §8 tables; the shader is the one sanctioned second implementation. |
| `verify:rune-chance-layout` | The chance shader's offsets all come from `rune-chance-layout.ts` (§10.1). |
| `verify:rune-chance-card` | The active WebGPU card flags score-cutoff atoms and exactly matches processor counts on the remaining agreement jobs (§10.1). |
| `verify:rune-cleanup-equivalence` | Whether this build says what the last one did (below). |

No candidate passes a ruler of its own: it is the scope's, `rulerCraftCredit`, fixed
for every calculation (§6). A check that needs exact arithmetic
states its bar in the stat's own units and puts it on the candidate's scale, rather than
choosing a different ruler.

**The equivalence gate.** `npm run verify:rune-cleanup-equivalence` records every public
field of every row over a fixed generated population and six settings and role
scenarios, and diffs them against a baseline. Every field is exact, including `reason`,
which carries the printed Chance; `chance` alone may take `--chance-tolerance`, which
defaults to zero. Its baseline lives in `work/`, which is not committed: capture one with
`--write` **before** changing anything, from a tree you have decided is correct, and read
the diff yourself rather than only the exit code. A `reason` difference is never a
rounding detail. A change to role semantics invalidates the baseline, not the script —
re-capture rather than adjust an expectation. It is outside `npm test` because it fails
without a baseline. The calibration oracle answers the other question — whether the model
is right — and both are needed.

### 10.1 Where the counting happens

The odds are the one part of this calculation shaped like a graphics card's work, so
`app/platform/compute/` offers them to the card through the one door of
`docs/HARDWARE-ACCELERATION.md`, and the status line under the table names the engine
that answered. What does not move:

- **The card answers one question only** — how many of a rune's runs cleared a bar.
  Every certainty of §7, every threshold, gate and policy stays on the processor.
- **The runs are identical**: every draw is integer arithmetic on both sides, the same
  hash of the same counter and the same multiply-high to a bound.
- **Score-cutoff atoms are replayed.** Single precision can move a score across its
  cutoff, including a score shared by many runs. The shader marks jobs whose score
  comparisons intersect its rounding margin. The processor replays these jobs, as
  well as jobs near the active policy chance bar.
- **A card proves itself first.** `runeChanceAgreement` requires the boundary flag
  and exact agreement on the remaining fixture jobs. The status names the engines
  whose counts were ultimately used.

## 11. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates this
document, The Math page, the deterministic weight checks, the independent calibration,
the stability gate and a fresh equivalence baseline in the same commit (`AGENTS.md` §7,
item 11). A change to what a Gem or Grindstone does goes in `rune-craft-end-state.ts` and
nowhere else; a change to how the odds are counted goes in `rune-power-up-outcomes.ts`,
and if it changes the draws it changes the shader in the same commit. A new uncertainty is
named as **modelled**, never smuggled in as a default.
