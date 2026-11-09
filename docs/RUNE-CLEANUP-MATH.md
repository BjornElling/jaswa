# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md`
**Reviewed:** October 20, 2026

This document describes the calculation, not the game rules. Game facts and their
sources live in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. What the page does with the answers — session reuse,
refresh, the safeguard controls, the filter panel — is
`docs/RUNE-CLEANUP-INTERFACE.md`.

| Module | Owns |
| --- | --- |
| `app/lib/rune-substat-weights.ts` | What one sub property is worth to one role (§3–§4) |
| `app/lib/rune-craft-end-state.ts` | What a Gem and a Grindstone do (§6) |
| `app/lib/rune-power-up-outcomes.ts` | What a rune may still become, and how likely (§7) |
| `app/lib/rune-cleanup-model.ts` | Every other piece of arithmetic: the perfect rune, the ordinary box, a candidate (§5, §8, §9.1) |
| `app/lib/rune-cleanup-advice.ts` | Policy: gates, calibration, Best role, verdicts, safeguards (§9) |
| `app/lib/compute/rune-chance-*` | Where the counting runs (§10.1) |

§10 lists the checks that hold each part.

## 1. Evidence and explicit assumptions

| Matter | Status |
| --- | --- |
| Ordinary 1–6★ main and sub-property intervals | Verified tables: mains `RUNE-CANONICAL.md` §3, sub properties §7. |
| Ancient runes | Main properties are the ordinary 6★ values at every level. Lines the rune was **born** with carry the Ancient interval; a line it gains by power-up, and every improvement, rolls from the ordinary 6★ table (`addedSubPropertyRange`; evidence in `RUNE-CANONICAL.md` §7). Weights, perfect rune and ordinary box stay ordinary. |
| Innate below 6★ | **Modelled**: a 4★ or 5★ innate takes that star class's sub-property range, in the perfect rune (§5) and in the generator. Only 6★ innates are measured (`RUNE-CANONICAL.md` §4). |
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

Every relevant sub property is converted to **maximum-roll equivalents of the rune's
own star class**. A percent line divides by its own class's maximum. A flat HP, ATK or
DEF line first becomes percentage points of the reference monster's base stat — the
same conversion at every star class — and then divides by the matching percent line's
maximum for the rune's class. For a six-star rune:

```
flat HP contribution = (flat HP × 100 / reference HP) / 8
HP % contribution    = HP % / 8
```

SPD, CRI Rate, CRI Dmg, RES and ACC are native points and divide by their own class's
maximum roll, so `SPD +5` on a five-star rune is one whole maximum roll, as `SPD +6` is
on a six-star one. A rune is measured against the best rune of its own class (§5) and
played forward with its own class's rolls (§7), so every figure on its row answers "how
good a rune of this class is this" — not how far its class's tables happen to shrink.

**What a role needs stays six-star** (§4). The finished build is a six-star one, so a
requirement, the main properties and the Grindstones that come off it are counted in
six-star rolls, and the resulting weights are the same for every star class.

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

Fast DD's example (§4.4), with the canonical average Legend stones:

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
in both directions. Max value is a ratio, so no choice of denominator repairs a change
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

## 5. Value, Max value and the perfect rune

A rune's score is a plain sum over every line it carries, **the innate included**:

```
score = Σ over lines of (the line's value in max rolls × its stat's weight)
```

Nothing is capped or discarded. The denominator is a concrete rune — **the best legal
ordinary rune of the candidate's own star class for this role in this slot** (six-star
for an Ancient rune):

- four sub properties at their maximum, on the four best-valued legal effect ids;
- the most valuable of them carrying all four upgrades as well (five maximum rolls),
  the other three at one — the game cannot put fewer than one roll on a line;
- an innate at the maximum of the fifth best-valued legal id, every innate tried;
- the ruler's Gem and Grindstone (§6) spent wherever they help;
- every duplication, main-property, innate and slot rule of `RUNE-CANONICAL.md` §§3–5.

```
Max value = score / ceiling
```

Both are in the candidate's own class's max rolls (§2), so a perfect four-, five- or
six-star rune reads 100 %. There is no main-property factor: a main decides which build
a rune belongs to, not how good a member of it the rune is, and the requirement already
counts every main at its six-star `+15` (§4.1).

**100 % is a reference point, never a ceiling.** No Max value, expectation or Gems &
Grinds score is capped anywhere. A rune that reads more than the perfect ordinary rune —
an Ancient rune's higher born rolls, a line already ground past the canonical stone —
reads more, and keeps every recommendation that would lift it further. A cap made every
rune above the mark look alike and left nothing to recommend for it.
`verify:rune-substat-weights` holds both halves: the best maximal ordinary rune reads
exactly 100 %, and a rising line keeps rising past it. Probabilities and shares — a
Chance, a standing in the box — stay between 0 and 1, because they are not scores.

**Max value is what the row prints, not what the gates read.** A ratio against the
perfect rune of a slot describes one rune honestly but is not comparable between slots,
because the perfect runes of two slots are not equally far above what those slots
ordinarily produce. §9.1 states the floor the gates use.

### 5.1 Every build of a role is evaluated

A role describes a family of builds: the main-stat combinations it accepts in slots 2,
4 and 6. Because main properties come off the requirement (§4.1), the same rune is worth
different amounts to different builds, so every compatible build is prepared and each is
a **complete reading** with its own Max value, floor and Chance. A reading clears only
when its own Max value and its own Chance clear both gates; a high Max value from one
build never borrows a passing Chance from another. Best role is then chosen among the
readings (§9.6).

A rune fits only the builds naming its own main, and it is played forward once however
many builds ask about it: another build is another price list over the same runs. A
build whose best end state misses its bar settles at zero without a run, and builds that
price every line alike share one question. Narrowing the family would mean asking the
user which build they intend — a role-model decision, not made here.

## 6. Gems and Grindstones

`app/lib/rune-craft-end-state.ts` is the only module that applies the craft rules, and
`npm run verify:rune-craft-single-source` keeps it that way. The game's rules are
`RUNE-CANONICAL.md` §8; that module's header lists them as applied. What this model adds:

- **One credit, and no setting.** Every rune judgement assumes an average Legend Gem and
  an average Legend Grindstone (`canonicalCraftCredit`): the candidate's projection, the
  ruler of §§4–5 and §9.1, the floor calibration, the Gem's placement (§6.1) and Gems &
  Grinds' reading of a Gem (`RUNE-CRAFT-ITEMS.md` §5). Items are evaluated as legal
  actions on actual lines, so an item helps only where the game would let it.
- **A Grindstone is credited on every grindable line** the rune holds, as `max(the stone
  already there, the canonical one)`, never added to it: a stone can always be topped up,
  and adding would pay the rune twice for one line.
- **A Gem's new line is worth its roll plus the credited Grindstone** wherever the new
  id is grindable. `gemOptions` prices every Gem that way, and `craftedLines` hands the
  same end state to whatever acts on the verdict.
- **A Gem is never forced.** The end state is the better of "no Gem" and the chosen
  placement (§6.1) at the credit, so considering a craft item can only raise a rune.
- **A Gem is spent at `+12`, after every power-up.** The chance plays the remaining
  events out first and crafts what it actually got (§9.2).
- **Lineage is legality, not reference.** A candidate's own craft tables follow its
  lineage, so an Ancient rune takes Ancient Legend items. The ruler — the weights, the
  perfect rune and the ordinary box — takes no lineage. It is priced inside
  `prepareRuneCandidate` and is not a parameter, because a ruler a caller may choose is a
  ruler two callers can choose differently.

**Why one credit.** Rune Clean-up once read a rune under three assumptions at once: its
own Gem and Grindstone sliders for the candidate, Hero items at three quarters for the
ruler and the floor calibration, and average Legend items for the Gem's placement. Gems
& Grinds read a fourth. Each was defensible alone; together they let two views disagree
about one rune's craft for reasons no player could see.

### 6.1 Which line the Gem replaces, and with which stat

**Every line is offered every legal Gem, and the pair that gains most on a fixed
reference rune is kept.** Which Gem is legal depends on which line is replaced — a Gem
may not duplicate one of the *other* lines, so removing the SPD line is what makes a SPD
Gem legal — so "offer the weakest line the best Gem" is a different and wrong rule.

The reference is the rune's lines with every grindable line raised by an average Legend
Grindstone where that raises it, and each candidate Gem an average Legend Gem, ground
likewise (`canonicalCraftCredit`; ordinary Legend, never Ancient). The pair is chosen in
the role's own prices on that rune and only then valued at the candidate's credit — the
same credit for Clean-up, a held item's roll for Gems & Grinds; where that Gem could not
legally take the line, or gains nothing there, the rune keeps no Gem. So which stat a
rune should be gemmed with moves with the rune and the role, and with nothing else:
Rune Clean-up, the rune overlay and Gems & Grinds name the
same stat (`RUNE-CRAFT-ITEMS.md` §5.1). Choosing at the credit instead was tried and
removed: Gems & Grinds measured against the rune as it stands and credited an SPD Gem
with the stone its line could take anyway, so the two views named different stats for
one rune.

The projection, the ceiling, the box, the odds and the craft planner all read the one
function, `craftedScore`, and the graphics card makes the same choice from the same
packed reference. One reading stands apart, and only as a bound: `craftedScoreCeiling`
puts the Gem wherever it gains most *at the credit*. The chosen placement is one of
those, so no end state is worth more, and `reachableCeiling` uses it to rule a chance out
without counting (§7, step 2). It is never a figure a view prints.
`verify:rune-cleanup-calibration` checks the rule against §8 written out afresh (§10).

## 7. Chance: a certain no, a certain yes, or a count

`Chance` is the probability that a rune's final `+15` Max projection reaches its
reading's floor. The random part ends at `+12`; the deterministic main-stat increase to
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
   priced and crafted (§6), and the answer is the share that cleared the bar.

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
`<1 %`; `0 %` is kept for a chance that is exactly zero. `runeChanceText` in
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
floor, the weights, the ordinary box and the perfect-rune denominator are ordinary, so an
Ancient rune moves against a bar that does not. Its craft items are Ancient, because
that is a legality rule (§6). `verify:rune-cleanup-ancient` holds this: an Ancient and
an ordinary Magic rune with the same born line read the same Max value and the same
Chance within the counting band.

## 8. Runes below +15 and below six stars

A rune's Max value is what it can still become, so an unfinished rune is projected to
its own best legal end state before it is scored.

| The rune | What the projection does |
| --- | --- |
| Fewer than four sub properties | `RUNE-CANONICAL.md` §6 fixes which remaining events improve held lines and which add lines. Added lines are drawn without replacement from the ids the slot, the main and the innate leave legal; their order cannot matter, because no improvement follows them. Gem legality is settled on the final line-up. |
| Improvements still to come | Every one lands on a line the rune already holds (§7.1). In the best case they concentrate on the held line worth most — a line-up's value is linear in the split and the Gem's gain convex in it, so the maximum is at a corner. |
| Below six stars | Its own star class's intervals for every future roll, its lines priced in its own class's max rolls, measured against its own class's perfect rune and ordinary box (§2, §5). |
| Hero, Rare, Magic or Normal born | Its own rarity's schedule decides every remaining event, so its best end state and chance are its own. Measured against the Legend-born reference, a rune perfect for its rarity reads below 100 % (§4.2). |
| Ancient | Born lines at their Ancient values; added lines, improvements, the weights, the box, the main property and the denominator ordinary six-star. Craft items Ancient (§7.4). |
| At `+12` or above | No sub-property event left. The `+15` main is deterministic, so Max value is settled and Chance is 1 or 0. The row says `Main stat only`, `Already there` or `Below the floor` rather than dressing a certainty as a gamble. |

The denominator never moves with the candidate's own rolls, lineage or level; it moves
with its star class and nothing else. Whether a four-star rune is worth keeping at all is
the floor's question, asked of the four-star population (§9.1).

## 9. Verdict and unbounded role matching

**The population judged is every rune the import holds, and no setting narrows it.**
Every rune is judged independently; an engraved rune and a rune at `+12` are judged like
any other. Location, level and every other table filter are presentation applied after
the engine has answered, and change no figure.

For every build of every role the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. Every viable reading competes: a
preferred reading never suppresses an acceptable one, nor a broken one while *Broken
runes* permits it. The rank makes that reading's own gates stricter or looser; it is not
a priority between roles. At *Broken runes* = No, a broken reading is rejected outright.

**The quality floor is a minimum discounted Max value** (`qualityThresholds`):

| Stop | *Rune quality floor* | Minimum discounted Max value |
| --- | --- | --- |
| 1 | I'm a newbie | 45 % |
| 2 | Been playing for a while | 55 % |
| 3 | I've got good runes (default) | 65 % |
| 4 | G1 baby | 75 % |
| 5 | You've seen my replays | 85 % |

These are quality anchors, not percentiles or promised keep rates. Slot balance may
raise a floor, never lower it (§9.1). Accepted and Broken discounts apply before the
comparison, and no set preference can undercut the minimum. The lower stops are a
product judgement, aimed at a player holding five-star runes and some six-star Rare and
Hero runes; they add no star- or rarity-specific exception to scoring.

**The Chance floor is one comparison**: the rune's chance in that same reading (§5.1)
against the *Power-up policy* stop (`chanceThresholds`): Full YOLO 1 %, Adventurous 5 %,
Balanced 20 %, Picky 50 %, Take no chances 80 %. The discounted floor is divided by the
reading's discount to give the bar its Chance is counted against, so both gates describe
one reading. Accepted worth is 1.00/0.95/0.85/0.70/0.55 (`acceptedWorth`); Broken worth
0.90/0.85/0.80/0.65/0 (`brokenWorth`).

**Verdicts.** A rune that passes at least one reading is **Power up** below `+12`,
**Keep** at `+12`, **Power up** at `+13` and `+14`, and **Keep** at `+15`. Between `+12`
and `+15` the action is deterministic main-stat investment. The `+12` and `+15` readings
are the same finished projection; `+15` is a display checkpoint, not a second gate, so a
rune that fails is **Sell** at `+12` and still shows **Sell** at `+15`. A rune that passes
no reading is **Sell**, for the first applicable reason: `No role can use it`, `Broken:
not wanted`, `Below the floor`, or its printed Chance.

**Best role** is the passing reading the rune is expected to be worth most to, or, where
none passes, the reading it is expected to be worth most to (§9.6). Max value and Chance
always come from that same reading. It is the single source for every Best role label
in Rune Clean-up and Rune Simulator, and it can never displace another rune or make a
passing rune **Sell**.

**Retention setting.** *Intangible runes* (×1, ×1½, ×2, ×3½, ×5) divides an Intangible
rune's slot correction — the part of its floor above the chosen anchor — by its factor.
It creates no role inventory, quota or one-rune-per-role assignment, and cannot undercut
the quality minimum, so a verdict never depends on how many other runes match the same
role.

*Keep twice as many 4-set runes* was removed in November 2026. Fitted slot by slot it
could not keep the slots level: a slot whose floor sat on the quality anchor had no
four-piece runes to spare below it while the other five did — at the most lenient policy
325 / 274 / 306 / 270 / 321 / 246 of 600 against 246 apiece without it. Fitted to keep
them level it lowered no slot's floor at any setting, because the most lenient
calibration always has a slot on the anchor and every stricter one inherits from it.

**Safeguards change the verdict only.** *Never sell if…* holds four safeguards: *Pre-grind
SPD ≥* (default on, 20), *Potential value ≥* (default on, 90 %, and only where Chance is at
least 1 %), *Engraved in non-Scenario preset* (default on) and *Re-app/refine target*
(default on). None changes Max value, Chance or Best role. A protected rune reads
**Power up** below `+12` and at `+13`/`+14`, and **Keep** at `+12`/`+15`, with the reason
`Pre-grind SPD protected`, `Potential value protected` or `Preset engraving protected`.
A reroll is offered **only instead of a sale**: a re-app or refine target is asked only of
a rune the engine would sell, Refine before Re-app, and its advice outranks the other
safeguards. `withRuneSellProtection` applies all four; `rune-reapp-targets.ts` owns the
target rule. Their exact conditions and controls are `RUNE-CLEANUP-INTERFACE.md` §3.
Refine counts the actual sub-property types specified by the user against that rule's
minimum. It does not rank types through a role or build; main and innate never count.

### 9.1 A quality minimum and a complete selling funnel

The perfect rune defines Max value (§5). The floor a reading must clear is the chosen
anchor, raised per slot by **slot balance**: it is measured on an original generated
population with equal numbers per slot and every legal main cycled evenly. A main no
active role can use stays in the denominator and is sold. Each sample body is evaluated
at `+0`, `+9` and `+12`; it must survive both power-up decisions and be kept at `+12`.
The `+12` survivor count is divided by the original generated count.

The ordinary Legend-only distribution (`ordinaryBox`) is a **diagnostic** standing and
tie-breaker; it defines neither the gate nor the slot calibration. It is a Gaussian
mixture on a grid, each kernel truncated at three standard deviations, so its rare tail
can be underestimated or vanish. **A diagnostic zero is not impossibility.** Counter-
example: for a speed-only role, a slot-1 Legend line-up starting at SPD +4 with the
neutral SPD stone +4 reaches 90 % only if all four upgrades land on SPD and their rolls
from {4, 5, 6} sum to at least 23 — five of 81 equally likely sequences (four sixes, or
three sixes and a five). Its probability is `(1/4)^4 × 5/81 = 5/20,736` ≈ 0.024 %,
strictly positive, while the diagnostic share at 90 % is exactly zero. So the rune
overlay states the selected minimum and the actual required Max value, including any slot
correction, and never translates them into a top percentile.

### 9.2 One standard for every rune

**Every rune — below, at and above `+12` — is judged on one question: what its Max value
will be at `+15` with the canonical items credited.** Every grindable line carries the
canonical Grindstone, the Gem goes where §6.1's reference rune says it gains most (and
nowhere, if it would not beat the line it replaces), and a Gemmed line is ground too.
The perfect rune and the ordinary box are priced with the same credit, and no setting
moves either: the ruler under every rune stands still.

A stone already spent is part of the rune and meets the credit through §6's `max`: a
rune ground to no more than the canonical stone reads exactly as it did bare, and one
ground past it can only rise — past 100 % where it gets there (§5).

For a rune observed at level `l`, let `R_l(ω)` be one legal completion through `+12`.
Every completion is crafted before it is valued:

```
S_l(ω)    = score(best legal craft(R_l(ω), canonical credit)) / ceiling   (uncapped)
Max value = max_ω S_l(ω)
Chance    = P(S_l(ω) ≥ the reading's floor)
```

This applies at `+0` and `+9` as well as `+12`. A fourth line is certain to appear, but
its Grindstone benefit depends on its id: if SPD is one of seven legal reveals on a Hero
`+9` rune and the only valuable stat, its expected future stone gain is
`g_SPD × w_SPD / 7`. No separate level-based craft bonus exists.

### 9.3 All original drops count

Equal initial counts per slot and equal final survival shares give roughly equal numbers
of kept runes. Measuring only usable mains would hide the even-slot drops the roles cannot
use. An unusable main is never made usable to fill a quota, and a slot that serves no role
stays unusable.

### 9.4 One calibration for every checkpoint and policy

For every star class present in the calculation, the canonical generator supplies **600
ordinary drops per slot** with the rarity mix of §1. `+0`, `+9` and `+12` are checkpoints
of the same seeded bodies — **one population of 600 per slot at three checkpoints**. A
`+0` or `+9` Sell cannot contribute to the final count. Every candidate is read with
`canonicalCraftCredit`, as an account's own runes are.

Each unfinished candidate is played forward **128 times** (`balanceRuns`), and those
runs are read at every Power-up policy stop; a `+12` candidate is priced directly. For
each stop the sample records the best passing score of its preferred, acceptable and
broken readings, and the smallest checkpoint score is that body's complete-funnel limit.

All 625 combinations of the four five-stop controls (quality, policy, Accepted, Broken)
are fitted as one ordered grid. A setting inherits the floors of its immediate less
demanding neighbours, then raises the floors of overrepresented slots to the lowest
survivor count. So a stricter quality, policy, Accepted or Broken choice cannot re-admit
a rune, and every checkpoint and every view reads the same floor.

A zero count in a small sample does not establish a zero population: the fit keeps a
one-observation tail allowance rather than emptying every slot. A structurally unusable
slot remains a genuine limit; balancing cannot invent a useful stat or weaken the minimum.

Every count here is of the calibration's generated sample, never of the user's runes, and
it is the calculation's own verdict that is balanced: the sell safeguards (§9) protect a
rune for what it holds, whatever its slot.

The calibration depends on the roles, the reference lines and the policy, never on the
runes asked about, so the engine keeps the last four calibrations by the content of those
inputs. Its population is eighteen independent pieces — each slot at `+0`, `+9` and
`+12` — each a function of those inputs and a fixed seed, so the page counts them on
several cores at once and hands the result to every worker that asks
(`countCalibrationPiece`, `adoptCalibrationPopulation`); the numbers are the ones one core
would count. The floor grid is worked out lazily: a setting reads only the settings
below it, so only those cells are computed. There is no serialized population to go stale: `ordinarySample` calls the
generator in `rune-generation.ts`, which Rune Simulator also uses, so a corrected rule
reaches the next calculation's population automatically.

### 9.5 The live Statistics box is an estimate, not a second model

Rune Settings's Statistics box asks two questions of one fixed synthetic population:

- **Percent to roll**: the share at `+0` whose verdict is **Power up**.
- **Percent to keep**: the share whose `+0` and `+9` verdicts are **Power up** and whose
  `+12` verdict is **Keep** (or a re-app/refine target).

The population is 50 six-star runes per slot (`runeStatisticsRunesPerSlot`), 300 at each
checkpoint, with the generator's rarity mix and every legal main cycled evenly; `+0`, `+9`
and `+12` are checkpoints of the same bodies. It runs the ordinary advice engine with the
current roles and settings, follows the Simulator's funnel, and applies safeguards to the
retained checkpoint answers without recalculating them. At a proportion of 50 %, 300
observations give a standard error of about 2.9 points (95 % ≈ ±5.7): a comparable
indicator of how settings move the verdicts, not evidence of a real drop rate.

### 9.6 Which role a rune is named for

**Best role is the reading the rune is expected to be worth most to**, chosen first among
the readings that clear both gates and, only where none does, among all permitted ones.
That order is the promise: a reading that says **Sell** can never be named while another
says **Keep** or **Power up**. `npm run verify:rune-best-role` holds it.

Max value is the best case — every improvement on one line at its maximum — and naming
by it flatters the role that prices one stat alone. Chance is a tail against a bar and
rewards a wide distribution over a useful one. So the choice reads the **expectation at
`+15`**, after the same accepted/broken discount as Max value and never above the rune's
own Max value — no expectation can beat the best case. That bound is the rune's own, not
100 %.

**How the expectation is computed.** Without the Gem, an end state is linear in every
roll, so its expectation is exact (`expectedPlainScore`): each improvement lands on each
held line alike at its interval's midpoint, and each gained line is any legal id alike at
its initial midpoint plus its stone. Only the Gem's gain is averaged, over the first 256
of the rune's chance runs (`expectationRuns`, `meanGemGain`). The exact part plus the most
a Gem can add (`gemGainBound`) bounds each reading without runs, so readings are walked in
falling bound and the walk stops at the first whose bound is below the best expectation
found.

**Ties**, in this order (`mostExpected`): higher expectation, then higher Max value, then
higher standing, then higher Chance, then the role id that sorts first. The answer never
depends on enumeration order.

## 10. Checks

| Check | Holds |
| --- | --- |
| `verify:rune-substat-weights` | §§4–5 deterministically: a target is a weight, mains, artifacts and credited stones come off the requirement while a rune's set does not, a met target asks nothing, surplus keeps paying past 100 %, each star class is priced in its own rolls, a richer candidate credit moves only the rune and never reads lower, and an exhaustive search finds the best maximal ordinary rune at exactly 100 % in every star class, slot and build of every shipped role. |
| `verify:rune-set-neutrality` | §4.3, paired: identical rune bodies under every set label give identical answers, and a role that does rank sets is still obeyed. |
| `verify:rune-slot-neutrality` | The Max-value anchors, the mixed-rarity population, checkpoint identity, empty inputs and honest rejection of unusable mains (§9.1). |
| `verify:rune-slot-policy-matrix` | 41 independent `+0 → +9 → +12` funnels against all original drops, counted by the calculation's own verdict past the sell safeguards; Pearson's χ² only where at least 30 survive (otherwise "balance unmeasured"); all 625 slider combinations structurally for minimum quality and monotone floors (§9.4). It does not establish statistical equality for every combination or for edited roles. |
| `verify:rune-future-craft` | §9.2 on nine Rare/Hero/Legend checkpoints: a legal SPD Gem and its stone, a stone on a hidden SPD line weighted by its reveal probability, and no Gem bonus for a rune already better than the Gem. |
| `verify:rune-cleanup-calibration` | An independent generator and the game's addition/upgrade loop with its own PRNG; the chance twice, with no craft and with the canonical items credited; and §6 against `RUNE-CANONICAL.md` §8 written out afresh, over every synthetic finished rune at six credits. `:large` is the 1,000-rune statistical run. |
| `verify:rune-cleanup-probability` | The event order of §7.1 on hand-calculable fixtures with one valuable stat: a line still to come never receives an earlier improvement. |
| `verify:rune-cleanup-ancient` | §7.4. |
| `verify:rune-cleanup-craft-monotonic` | A more generous credit never lowers what a rune can reach or its odds, and a stone spent up to the canonical one moves no row (§9.2). |
| `verify:rune-cleanup-preference-monotonic` | A more lenient slider never sells a rune a stricter one keeps, over the whole recommendation funnel. |
| `verify:rune-chance-stability` | §7.3: the box holds still across a sixty-fourfold resolution sweep, and two copies of one rune get one answer. |
| `verify:rune-best-role` | §9.6. |
| `verify:rune-craft-single-source` | Source text: only `rune-craft-items.ts` and `rune-craft-end-state.ts` read the §8 tables; the shader is the one sanctioned second implementation. |
| `verify:rune-chance-layout` | The chance shader's offsets all come from `rune-chance-layout.ts` (§10.1). |
| `verify:rune-cleanup-equivalence` | Whether this build says what the last one did (below). |

No caller of `prepareRuneCandidate` passes a ruler: it is the canonical one inside the
model. A check that needs exact arithmetic states its bar in the stat's own units and
puts it on the candidate's scale, rather than choosing a different ruler.

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
`app/lib/compute/` offers them to the card through the one door of
`docs/HARDWARE-ACCELERATION.md`, and the status line under the table names the engine
that answered. What does not move:

- **The card answers one question only** — how many of a rune's runs cleared a bar.
  Every certainty of §7, every threshold, gate and policy stays on the processor.
- **The runs are identical**: every draw is integer arithmetic on both sides, the same
  hash of the same counter and the same multiply-high to a bound.
- **The pricing is not identical**: single precision moves a score by about one part in
  ten million, so a run at the bar may fall either side. The agreement gate allows up to
  one percentage point of share difference, and jobs near the active policy bar are
  rechecked on the processor before the verdict is settled.
- **A card proves itself first.** `runeChanceAgreement` puts hand-built runes through
  both engines; a card outside the tolerance is not used, and the status line says
  `Processor`.

## 11. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates this
document, The Math page, the deterministic weight checks, the independent calibration,
the stability gate and a fresh equivalence baseline in the same commit (`AGENTS.md` §7,
item 11). A change to what a Gem or Grindstone does goes in `rune-craft-end-state.ts` and
nowhere else; a change to how the odds are counted goes in `rune-power-up-outcomes.ts`,
and if it changes the draws it changes the shader in the same commit. A new uncertainty is
named as **modelled**, never smuggled in as a default.
