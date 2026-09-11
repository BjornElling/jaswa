# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**Derived data:** `app/data/relic-synergy.json`, written by
`scripts/build-relic-synergy.mjs`
**Read by:** `app/lib/relics.ts`, `app/lib/relic-properties.ts`,
`app/lib/relic-synergy.ts`, `app/lib/relic-advice.ts`,
`app/components/relic-list.tsx`
**Enforced by:** `npm run verify:relic-synergy`, `npm run verify:relic-maths`

---

## 1. Why relics need their own document

A rune belongs to one monster. An artifact belongs to one monster. **A relic is
engraved on up to a hundred monsters at once**, and that single fact rewrites
every judgement around it.

- A good relic is not a good slot; it is a good *account*. Its value is the
  number of monsters in the metagame that want exactly it.
- A second copy of a relic is worth nothing. One copy already covers more
  monsters than most accounts field, so the second is inventory, not a spare.
- A power-up is not cheap and not repeatable. Relics come with three
  durability, a failed attempt spends one, and at zero the relic's level is
  final for ever. There is no second chance and no re-roll.

So the Relics page is not a library the way the Artifacts page is. It is a
verdict: keep, power up, or sell.

## 2. What the export carries

One record per relic in `relics`, and the same records again beneath every
monster that wears one. `completeEquipmentCollections` merges and de-duplicates
them on `rid`, exactly as it does for artifacts.

```json
{ "rid": 2167432, "type": 14, "upgrade_curr": 9, "durability": 2, "locked": 0,
  "pri_effect": [100, 12], "sec_effect": [14, 150, 2], "source": 10002 }
```

| Field | Meaning |
| --- | --- |
| `rid` | Identity, and the acquisition order — the same role it plays on an artifact |
| `type` | Which of the sixteen unique properties the relic carries |
| `upgrade_curr` | Power-up level, `0`–`15` |
| `durability` | Failed attempts still affordable, `0`–`3` |
| `pri_effect` | `[100 \| 101 \| 102, percent]` — HP, ATK or DEF as a percentage |
| `sec_effect` | `[type, threshold, percent]` — the unique property at this level |

**There is no `occupied_id`.** A relic record names no wearer, because it has
many. Engraving counts are derived by walking the roster
(`relicEngravingCounts`), and a relic nobody wears is simply absent from that
map — never `0` mistaken for "unknown".

**`type` and `sec_effect[0]` state the family twice.** Every relic this account
has held agrees with itself. A record where the two disagree is rejected rather
than resolved, because picking a side would be a guess about which field JASWA
had misread.

**The main property is `3 + level` percentage points.** The account confirms it
at `+0` (3), `+6` (9) and `+9` (12), so `+15` is 18. It is the one figure that
indexes a relic's whole strength against its level, which is why
`relicMainPercent` is what `V(l, d)` in §7.2 measures a relic against.

## 3. What is known about the mechanic, and from where

| Fact | Source |
| --- | --- |
| Main property is HP, ATK or DEF | Com2uS relic announcement |
| Sixteen unique properties, in six functional groups | Com2uS relic announcement |
| A unique property is fixed at crafting; a power-up changes only its value | Com2uS relic announcement |
| Power-up ceiling is `+15`; every relic starts at 3 durability; a failure spends one; at 0 no further attempt is possible | Com2uS relic announcement |
| One relic engraves on up to **100** monsters | Com2uS relic announcement |
| Effects read "*X* +N % per *T* *stat* at the start of battle" | Com2uS relic announcement, and the shape of `sec_effect` |
| Primary effect ids `100`/`101`/`102` are HP/ATK/DEF | `ENGRAVING-STATISTICS.md` §1, on captured traffic |
| The unique-property id space is exactly `1`–`16` | The captured statistics, across 893 monster types — held by `verify:relic-synergy` |

**The engraving limit is recorded as 100 and not 150.** The official wording
says a hundred. Nothing in JASWA depends on the exact number — the argument in
§1 is that one relic covers far more monsters than an account fields, and that
holds at either figure — but the number is written down here so a later
correction has somewhere to land rather than being quietly assumed.

**The per-level power-up success rates are not known.** The game shows a rate on
the button and publishes no table. §7 says what JASWA does instead of inventing
one.

## 4. The unique-property vocabulary is incomplete, and says so

Five of the sixteen families carry a reading in `relic-properties.ts`:

| id | Family | Effect |
| ---: | --- | --- |
| 6 | Resolute | DMG taken −N % per T MAX HP |
| 12 | Timeless | DEF +N % per T MAX HP |
| 13 | Primal | MAX HP +N % per T ATK |
| 14 | Valiant (DEF) | ATK +N % per T DEF |
| 16 | Valiant (SPD) | ATK +N % per T SPD |

These are **reported, not verified here**. They come from the community
sw-forge project, which records only mappings a player confirmed against the
in-game panel; this account has shown just one of the five on screen. Two
families share the name *Valiant* and are separated by the stat they read, the
device `MONSTER-NAME-ELEMENT-DECISION.md` settles for monsters the game ships
under one name.

The other eleven are a number and nothing more, and the interface says
`Property 5` rather than inventing a word for it —
`ARTIFACT-CANONICAL.md` §14's prohibition, which is not suspended because a
blank looks untidy.

**This is a gap in what JASWA can *say*, not in what it can *do*.** Every
judgement on the page — synergy, outlook, duplicate, verdict — is computed from
the property's identity and the numbers in its own record. None of it needs the
wording. That is the deliberate consequence of the method in §5, and it is why a
partly-read vocabulary is a working state rather than a broken one.

**To close the gap**, open a relic in the game, read the line above its effect
and the effect itself, and add the pair to `relicProperties`. Nothing else has
to change.

## 5. Synergy is measured, not asserted

**The question.** A relic has a main property and a unique property. The unique
property sizes itself from one of the monster's stats. When the main property
feeds that stat, the relic pays twice — once directly, once through its own
effect — and when it does not, the two halves are strangers sharing a slot. That
is what "synergy" means here, and it is worth a great deal on an item a hundred
monsters will wear.

**Why not a table of opinions.** Community tier lists for relics exist and
disagree, most of them reasoning from a rule of thumb — *same stat is good
synergy* — rather than from evidence. Worse, the rule is not reliably true: the
measurement below finds that the player base puts **HP** mains on the two
ATK-granting families far more often than ATK mains, which the rule of thumb
calls a mismatch and the metagame calls a bruiser. A hand-written table would
have shipped the rule and the error with it.

**The measurement.** The game's own **Relic Engraving Statistics** panel reports,
per monster, how often each main property and each unique property is engraved
on it. JASWA already holds that capture — `app/data/engraving-statistics.json`, see
`ENGRAVING-STATISTICS.md`. Pooled by species, it covers **893 monster types and
5,563,894 engravings**.

Monsters differ in what they want. So if a main property and a unique property
suit the same monsters, they turn up together more often than two drawn
independently would, and that excess is measurable:

1. For each monster, take its two distributions. Its weight is the midpoint of
   the two totals, which disagree only by the panel's own rounding.
2. Accumulate the joint mass of every (main, unique) pair as the product of the
   two shares within that monster, summed over monsters.
3. Divide by the mass expected if the two were independent across the whole
   population. That ratio is the **lift**: `1` is chance.
4. Standardise the log lift within each main property, across its own sixteen
   partners, giving a **score** in standard deviations.

**Step 2 is a floor, not a claim.** The panel never reports the pairs
themselves, so a monster's own joint is unobserved and is taken as the product
of its margins. That cannot manufacture an association — everything measured is
variation *between* monsters, which is real — it can only understate one.

**Step 4 is what makes the three mains comparable.** HP is 52 % of all mains and
DEF is 9 %, and a dominant margin cannot deviate as far from chance as a rare
one can; comparing raw lifts would grade every DEF relic on a longer ruler. The
relic's main property is fixed and cannot be changed, so the question that
matters is which partners *this* main favours, and that is what the
standardised score answers.

**The table is derived once, not read live.** The capture is 6.5 MB and the
answer is 48 numbers, so `scripts/build-relic-synergy.mjs` reduces one to the
other and the app ships `app/data/relic-synergy.json`. A page that imported the
archive to read 48 numbers would make every visitor download it. That is a
derived value written down, which `AGENTS.md` §6 is right to be wary of, and it
is kept honest the way the capture itself is: the verifier below re-derives the
table from the statistics and fails if the committed file has drifted. **Re-run
the builder after any capture session that adds relic panels.**

**The five bands**, on the score:

| Band | Score | Mark |
| --- | --- | --- |
| Exceptional | ≥ +1.00 | Two gold stars |
| Strong | +0.35 to +1.00 | One gold star |
| Neutral | −0.35 to +0.35 | One hollow diamond |
| Weak | −1.00 to −0.35 | One red cross |
| Poor | < −1.00 | Two red crosses |

The boundaries are symmetric statements about the evidence rather than a quota,
and across the 48 pairs they fall out at **11 / 8 / 11 / 9 / 9**.

**The colours.** Gold at the top two bands is the `ARTIFACT-CANONICAL.md` §18
exception applied for the same reason it was granted there: at those bands the
grade *is* the invitation to act. The red is the verdict vocabulary
(`--state-bad`), for a machine reporting that its own measurement came out
against the relic. Degree is carried by the number of marks and never by a
second shade, and the band's name is written beside the marks, so the column
reads identically with the colour taken away — `AGENTS.md` rule 5.

**A pair the statistics say nothing about is `null`, never a low grade.** The
band buttons never gather it and the advice column says `Fit not judged`.

### 5.1 The evidence that this is a measurement

`npm run verify:relic-synergy` re-derives the table independently, compares it
cell for cell to the one the app ships, and then splits the 893 monster types in
half at three stated seeds and correlates the two halves' scores. They agree at
**r ≈ 0.99**. Weighting every monster equally instead of by its engraving count
moves nothing either (`r = 0.992`): this is a property of the metagame, not of a
handful of popular monsters.

The account's own two engraved relics both land in the top band — the two the
user actually chose to use, out of six.

## 6. Level, durability and the difference between them

A relic at `+4` with attempts left is one nobody has got round to. A relic at
`+4` with none will be `+4` for ever. **The number alone cannot tell them
apart**, so the table separates the three states it can be in:

| State | Meaning | How it reads |
| --- | --- | --- |
| `open` | Attempts left, below `+15` | Full ink, no mark |
| `spent` | Durability at 0 | Dimmed, barred-circle mark |
| `maxed` | At `+15` | Dimmed, ceiling mark |

Durability is three pips and always three: the spent ones are the reason a
level will never move again, so they stay on the page as hollow rings rather
than disappearing.

## 7. Three recursions, and the arithmetic is exact

Everything the page decides and everything it shows comes out of one one-line
recursion, run three times with three sets of boundaries. **A power-up has two
outcomes and only two**: it succeeds and the level goes up, or it fails and a
durability goes down. Write `p(l)` for the chance of success at level `l`, and
everything else follows.

### 7.1 `P(l, d)` — the chance of ever reaching `+15`

```
P(15, d) = 1                                           already there
P(l, 0)  = 0                    for l < 15             no attempts left, ever
P(l, d)  = p(l)·P(l + 1, d) + (1 − p(l))·P(l, d − 1)
```

That is the whole calculation, and it is exact rather than an approximation.
The closed form — a sum over every way to spread at most `d − 1` failures across
the remaining levels — agrees with it term for term:

```
P(l, 1) = Π pᵢ
P(l, 2) = (Π pᵢ)·[1 + Σ qⱼ]
P(l, 3) = (Π pᵢ)·[1 + Σ qᵢ + Σ qᵢ² + Σᵢ<ⱼ qᵢqⱼ]          qᵢ = 1 − pᵢ
```

The `qᵢ²` term is the one a hand-written version drops: two failures can land on
the *same* level, so the sum runs over multisets, not pairs. JASWA uses the
recursion and not the expansion — it is shorter, it is far harder to get subtly
wrong, and it keeps working unchanged if Com2uS ever moves the ceiling or the
durability a relic starts with.

`npm run verify:relic-maths` checks the recursion against those closed forms
over 200 randomly drawn, deliberately **uneven** rate curves. The worst
disagreement is 3·10⁻¹⁶ — machine precision.

### 7.2 `V(l, d)` — what the relic is expected to be worth in the end

The same recursion, with one boundary changed:

```
V(15, d) = 1
V(l, 0)  = (3 + l) / 18                                 what it actually became
V(l, d)  = p(l)·V(l + 1, d) + (1 − p(l))·V(l, d − 1)
```

**Why a second run is necessary.** `P` asks whether a relic will *finish*, and
answers `0` for anything that runs out of durability on the way. That is the
right question for spending stones and the wrong one for keeping a relic: an
exceptional `+12` with no durability left has `P = 0` and is one of the best
things an account can own. `V` says it is worth 83 % of a finished relic,
because that is what `15/18` of the main property is. **A model that judged both
questions on `P` alone would sell it**, and that is the single correction JASWA
makes to the formula as it was put.

`V` also never falls when a level or an attempt is added, which `P` alone does
not guarantee across the two branches. The verifier holds it to both.

### 7.3 `D(l, d)` — where the relic actually lands

The same recursion a third time, carrying a whole distribution instead of a
single number. A relic stops in exactly one of two ways, and those are the two
boundaries:

```
D(15, d) = all of the mass on +15                       finished
D(l, 0)  = all of the mass on +l                        stopped where it stands
D(l, d)  = p(l)·D(l + 1, d) + (1 − p(l))·D(l, d − 1)
```

`P` and `V` are both readings of this one distribution — `P` is its mass on
`+15`, `V` its mean — and the verifier holds all three to each other to machine
precision. They are still written separately, because three recursions built
from three different boundaries agreeing is a check worth having.

**The table prints the median, not the mode.** The mode is the literal answer to
"which single level is it most likely to land on", and it is a bad column: for
*any* relic with an attempt left it is `+15`, because `+15` absorbs every path
that gets there while the fourteen levels below split what is left between them.
Its probability is then exactly `P(l, d)` — the column immediately to its left.
Measured on this account, every open relic's mode was `+15`, at anywhere from
13 % to 48 %.

The median answers the same question and does not collapse: the level the relic
reaches or beats half the time. On the same relics it reads `+14`, `+11`, `+10`,
`+8`, `+6` — a real spread — and it stays a whole level, which a mean does not.
The size of its own tail is printed under it, because a median is a statement
about a tail and the tail is never exactly a half. The mode and the mean are
both in the cell's tooltip for anyone who wants them.

### 7.4 `p(l)` is a table, and it is measured, not invented

The game shows a success rate on its own power-up button and publishes no table,
so `flatSuccessRates` fills all fifteen entries with one estimate — **taken from
the account's own relics**. Every relic is a complete record of its own
attempts: its level is the number that succeeded, the durability it has spent is
the number that failed. The estimate is a Beta posterior mean on a uniform
prior, `(successes + 1) / (successes + failures + 2)`, so an account with no
history reads an even chance instead of dividing by zero. The page states the
figure and the sample size beside the risk slider.

The rates are a **table of fifteen** rather than one number because the real
curve certainly is not flat — `+14` cannot be as easy as `+0`. Reading the
game's own figures off the button replaces `flatSuccessRates` and nothing else:
both recursions already take a per-level curve, and the verifier already tests
them on one.

## 8. The verdict is one multiplication

**A relic's fit multiplies both numbers, on a halving ladder:**

| Fit | Weight |
| --- | ---: |
| Exceptional | × 4 |
| Strong | × 2 |
| Neutral | × 1 |
| Weak | × 0.5 |
| Poor | × 0.25 |

From that, two quantities, each read against a bar the risk slider sets:

- **Stones** — `weight × P(l, d)`. Is this relic worth power-up stones? At risk 3
  the bar is `1.00`, which reads exactly as *an even chance on an exceptional
  fit, or a certainty on a neutral one*.
- **Merit** — `weight × V(l, d)`, on a 0–4 scale. Is this relic worth a slot at
  all? It is not a column — the *Lands on* column says the same thing in levels,
  which is the unit a player thinks in — but every verdict that turns on it
  prints it, so the judgement is still arguable.

The rules, in the order they outrank each other:

1. **An unjudged fit keeps.** Nothing to multiply.
2. **A second copy of the same pair** is settled before anything that could keep
   it: no fit makes an account want two of one relic, because one already covers
   a hundred monsters. It earns stones on the same bar, measured against passing
   the copy in front of it — `weight × P(l, d, that copy's level + 1)`, the same
   recursion with a nearer target. Below the bar, it sells.
3. **Merit below the holding bar sells.** No band is special-cased: a poor fit
   sells because a quarter of its finished strength cannot clear the bar, not
   because a rule says poor fits sell.
4. **A finished relic keeps** — at `+15`, or out of durability. There is nothing
   to spend stones on, whatever `P` says.
5. **Stones above the bar powers up.**
6. **Anything else keeps.**

Every reason printed in the table is the arithmetic itself — `4 × 48 % to +15 =
1.90`, `Merit 0.32 under 0.45` — so a verdict can be checked rather than
trusted.

## 9. The risk slider

One appetite, two bars:

| Risk | Stones bar (§8) | Holding bar (§8.3) |
| ---: | ---: | ---: |
| 1 | 2.00 | 0.60 |
| 2 | 1.40 | 0.52 |
| 3 | 1.00 | 0.45 |
| 4 | 0.65 | 0.38 |
| 5 | 0.35 | 0.30 |

At risk 1 only a near-certain exceptional relic earns stones; at risk 5 a neutral
fit with a one-in-three chance does. The holding bar moves with it because the
two are one disposition — a player willing to gamble on a power-up is the same
player who holds on to a maybe — but it moves far less, so the slider's visible
effect stays where its label says it is.

It sits in the filter strip because it belongs to the same question the filters
answer — what should this table be telling me — even though it changes the
verdicts rather than which rows survive. It is session state like every other
filter, and Reset puts it back to 3.

## 10. Parity

`file-imports.ts` validates relics **through `readRelic`**, the same reader the
page uses, for the reason `AGENTS.md` §0.1 gives: a relic that passes a
structural check on `rid` and then cannot be judged is counted, invisible, and
worse than rejected. Before this page existed, that was exactly the state the
import was in.

A rejection is therefore a loud one, and is meant to be. A relic rides a hundred
monsters; a half-read one would carry a wrong judgement across the whole roster
rather than spoiling a single slot.
