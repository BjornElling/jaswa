# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**The synergy table:** 48 hand-written cells in `app/lib/relic-synergy.ts`, set
out in readable form in §5.1.1
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
| Power-up success rates per level, `100 %` to `+3` then `80 %` down to `10 %` | Com2uS's published table — §7.4 |
| Primary effect ids `100`/`101`/`102` are HP/ATK/DEF | `ENGRAVING-STATISTICS.md` §1, on captured traffic |
| The unique-property id space is exactly `1`–`16` | The game's own Select Unique Property panel — §4 |

**The engraving limit is recorded as 100 and not 150.** The official wording
says a hundred. Nothing in JASWA depends on the exact number — the argument in
§1 is that one relic covers far more monsters than an account fields, and that
holds at either figure — but the number is written down here so a later
correction has somewhere to land rather than being quietly assumed.

**The per-level power-up success rates are published**, and §7.4 carries them.
They are the single most consequential thing on this page: the first three
levels are free, and from `+3` the rate falls to a tenth.

## 4. The sixteen unique properties, and how they were pinned down

| id | Name | Effect |
| ---: | --- | --- |
| 1 | Sharp Conquest | DMG dealt +N % per T ATK |
| 2 | Solid Conquest | DMG dealt +N % per T DEF |
| 3 | Hearty Conquest | DMG dealt +N % per T MAX HP |
| 4 | Sharp Resolute | DMG taken −N % per T ATK |
| 5 | Solid Resolute | DMG taken −N % per T DEF |
| 6 | Hearty Resolute | DMG taken −N % per T MAX HP |
| 7 | Nimble Valiant | ATK +N % per T SPD |
| 8 | Solid Valiant | ATK +N % per T DEF |
| 9 | Hearty Valiant | ATK +N % per T MAX HP |
| 10 | Sharp Timeless | DEF +N % per T ATK |
| 11 | Nimble Timeless | DEF +N % per T SPD |
| 12 | Hearty Timeless | DEF +N % per T MAX HP |
| 13 | Sharp Primal | MAX HP +N % per T ATK |
| 14 | Nimble Primal | MAX HP +N % per T SPD |
| 15 | Solid Primal | MAX HP +N % per T DEF |
| 16 | Hearty Restore | Recovery & Shield +N % per T MAX HP |

**The names are two rules, not sixteen facts.** The family is what the property
grants — Conquest gives damage dealt, Resolute takes damage away, Valiant gives
ATK, Timeless DEF, Primal MAX HP, Restore recovery and shielding. The prefix is
the stat it reads: Hearty from MAX HP, Sharp from ATK, Solid from DEF, Nimble
from SPD. Every one of the sixteen is therefore a different pair, and no two can
share a name.

### 4.1 Why the order of that list is the order of the ids

The effects come from the game's own **Manage Relic → Select Unique Property**
panel, read off screen. Nothing on that panel states an id, so the claim that
its order is the export's `type` order needs evidence. It has five kinds:

1. **This account's own relic, on screen and in the export at once.** The relic
   on Beth reads `DMG dealt +1 % per 1500 ATK at the start of battle` and shows
   `+6`. Its export record is
   `{ type: 1, upgrade_curr: 6, pri_effect: [101, 9], sec_effect: [1, 1500, 1] }`.
   Position 1 of the panel is *DMG dealt per ATK*. The wording, the threshold
   `1500`, the percentage `1` and the level all agree.
2. **Three community-confirmed mappings land where this order puts them.** The
   sw-forge project records only readings a player confirmed against the panel,
   and has id 6 as *DMG taken per MAX HP*, id 12 as *DEF per MAX HP*, id 13 as
   *MAX HP per ATK*. All three match positions 6, 12 and 13 exactly.
3. **The list has the shape Com2uS announced**: sixteen properties in six
   functional groups. It is three Conquest, three Resolute, three Valiant, three
   Timeless, three Primal and one Restore — 16 in 6, with no self-referential
   pair and no SPD variant in the two damage groups.
4. **The thresholds agree once grouped by the stat this mapping says each
   property reads.** Both of the account's DEF-reading properties carry `2500`
   at `+0` (ids 5 and 8), and both of its SPD-reading ones carry `300` — id 11
   at `+0`, and id 14 at `+9` carrying exactly half of it. A wrong mapping would
   have to produce that coincidence by accident.
5. **The panel's own ordering rule is consistent**: within a family, the sources
   run ATK, SPD, DEF, MAX HP with the granted stat omitted. Valiant skips ATK
   and reads SPD, DEF, MAX HP; Timeless skips DEF; Primal skips MAX HP; the two
   damage families have no SPD variant at all.

### 4.2 The two mappings this table corrects

sw-forge has id 14 and id 16 both as *Valiant*. Under the naming rule in §4
that cannot happen — a family plus a source stat is unique — and the panel
order puts 14 at *MAX HP per SPD* (**Nimble Primal**) and 16 at *Recovery &
Shield per MAX HP* (**Hearty Restore**). The three mappings they confirmed
against the panel are right; these two were not confirmed and are wrong.

The correction matters. Under sw-forge's reading, id 14 grants ATK; under the
panel's own order it grants MAX HP. Every judgement about the most-used property
in the game turns on which of those is true, and §5's table would have graded
all three of its cells backwards.

### 4.3 The relic panel sends no traffic

A capture taken while opening the relic screens holds nothing about relics: the
property list, the names and the power-up rates are all client-side. So the
vocabulary cannot be collected the way `ENGRAVING-STATISTICS.md` collects the
statistics panels, and reading it off screen is not a shortcut — it is the only
route there is.

## 5. Synergy is a table

**The question.** A relic has a main property and a unique property. The unique
property sizes itself from one of the monster's stats and grants another. When
the main property raises the stat the unique property *reads*, the relic pays
twice — the main stat helps directly, and it makes the relic's own effect
bigger. When it does not, the two halves are strangers sharing a slot. That is
what "synergy" means here, and it is worth a great deal on an item a hundred
monsters will wear.

**The answer is forty-eight cells in `relic-synergy.ts`, written down.** Nothing
derives them, nothing regenerates them, and every one can be edited on its own
line when a better judgement is to hand. `npm run verify:relic-synergy` checks
only that the table stays whole — every property has a row, every row has all
three mains, every value is one of the five bands, no band has fallen out of use
and no property grades the same against all three mains.

### 5.1 What each cell was first filled in from

Three questions about the pair, in this order of weight:

1. **Does the main property raise the stat the unique property reads?** If it
   does, the main *multiplies* the relic: a bigger ATK both hits harder and buys
   a bigger `DMG dealt per ATK` bonus. This is the only real double-dip a relic
   has.
2. **Does the main property raise the stat the relic grants?** Then the two
   merely *add* — an HP main and a relic granting MAX HP both push one number,
   which is worth having but is not a multiplication.
3. **Do the relic and the main point the same way?** ATK main is on a damage
   dealer; HP and DEF mains are on something that has to survive. A relic that
   grants `DMG dealt` or `ATK` is offensive and everything else is defensive.

Which gives:

| Case | Band |
| --- | --- |
| The main multiplies the relic, and both push one way | Exceptional |
| Nothing can feed SPD, and main and relic stack on one stat | Exceptional |
| Main and relic stack, but another main would have multiplied it | Strong |
| The main multiplies the relic, but they pull apart | Strong |
| Right direction, no multiplication | Neutral |
| Wrong direction, on a relic no main could have fed | Weak |
| Wrong direction, and another main would have fed it | Poor |

The SPD line is the one worth stating twice. **No main property can raise SPD**,
so a Nimble relic can never be multiplied by anything, and its best possible
partner is the main that stacks with what it grants. HP main on Nimble Primal is
therefore the top band not despite reading SPD but because nothing better is
available to it — which is also where the community lands.

### 5.1.1 The whole table

| id | Unique property | Grants | Reads | HP main | ATK main | DEF main |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Sharp Conquest | DMG dealt | ATK | ✕✕ Poor | ★★ Exceptional | ✕✕ Poor |
| 2 | Solid Conquest | DMG dealt | DEF | ✕✕ Poor | ◇ Neutral | ★ Strong |
| 3 | Hearty Conquest | DMG dealt | MAX HP | ★ Strong | ◇ Neutral | ✕✕ Poor |
| 4 | Sharp Resolute | DMG taken | ATK | ◇ Neutral | ★ Strong | ◇ Neutral |
| 5 | Solid Resolute | DMG taken | DEF | ◇ Neutral | ✕✕ Poor | ★★ Exceptional |
| 6 | Hearty Resolute | DMG taken | MAX HP | ★★ Exceptional | ✕✕ Poor | ◇ Neutral |
| 7 | Nimble Valiant | ATK | SPD | ✕ Weak | ★★ Exceptional | ✕ Weak |
| 8 | Solid Valiant | ATK | DEF | ✕✕ Poor | ★ Strong | ★ Strong |
| 9 | Hearty Valiant | ATK | MAX HP | ★ Strong | ★ Strong | ✕✕ Poor |
| 10 | Sharp Timeless | DEF | ATK | ◇ Neutral | ★ Strong | ★ Strong |
| 11 | Nimble Timeless | DEF | SPD | ◇ Neutral | ✕ Weak | ★★ Exceptional |
| 12 | Hearty Timeless | DEF | MAX HP | ★★ Exceptional | ✕✕ Poor | ★ Strong |
| 13 | Sharp Primal | MAX HP | ATK | ★ Strong | ★ Strong | ◇ Neutral |
| 14 | Nimble Primal | MAX HP | SPD | ★★ Exceptional | ✕ Weak | ◇ Neutral |
| 15 | Solid Primal | MAX HP | DEF | ★ Strong | ✕✕ Poor | ★★ Exceptional |
| 16 | Hearty Restore | Recovery & Shield | MAX HP | ★★ Exceptional | ✕✕ Poor | ◇ Neutral |

9 Exceptional · 13 Strong · 11 Neutral · 4 Weak · 11 Poor.

**The five bands**, and how they read on the page:

| Band | Mark |
| --- | --- |
| Exceptional | Two gold stars |
| Strong | One gold star |
| Neutral | One hollow diamond |
| Weak | One red cross |
| Poor | Two red crosses |

**The colours.** Gold at the top two bands is the `ARTIFACT-CANONICAL.md` §18
exception applied for the same reason it was granted there: at those bands the
grade *is* the invitation to act. The red is the verdict vocabulary
(`--state-bad`), for a machine reporting that its own judgement came out against
the relic. Degree is carried by the number of marks and never by a second shade,
and the band's name is written beside the marks, so the column reads identically
with the colour taken away — `AGENTS.md` rule 5.

### 5.2 Why this is not measured from the player base

An earlier version of this page derived all 48 cells from the game's **Relic
Engraving Statistics** panel: 893 monster types and 5.5 million engravings,
scored by how much more often each main and each unique turned up together than
chance would put them. It was internally sound — two halves of the population
agreed at `r ≈ 0.99` — and it was **the wrong measurement**, for a reason no
amount of sample size fixes.

**Relics are new, and almost nobody is choosing.** An account engraves the
relics it happened to craft. What the panel records is therefore mostly the drop
table and the crafting rate, with whatever deliberate pairing exists buried
underneath. A statistic drawn from that measures luck, and a strong correlation
in it is a strong correlation in luck.

It also cannot be argued with. A cell that looks wrong has no line to change —
only a pipeline to re-run, which will produce the same number again. **A table
can be corrected in the place where the mistake is.** That is worth more here
than any amount of agreement between halves of a population that was not
deciding anything.

What the measurement got right is kept in §5.1 as reasoning rather than as
evidence: main and unique must point the same way, and which way depends on
what the property reads and what it grants.

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
answers `0` for anything that runs out of durability on the way. An exceptional
`+12` with no durability left has `P = 0` and is one of the best things an
account can own; `V` says it is worth 75 % of a finished relic — three quarters of the main
property and two thirds of the unique. **A model that judged on `P` alone would
sell it.** Once the published rates arrived (§7.4), `P` turned out to be unfit
for the other question too — it is near zero for everything — and `V` now
carries both, as a level and as a difference.

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

### 7.4 `p(l)` is the game's own published table

| From | Rate | | From | Rate |
| --- | ---: | --- | --- | ---: |
| `+0 → +1` | 100 % | | `+7 → +8` | 45 % |
| `+1 → +2` | 100 % | | `+8 → +9` | 40 % |
| `+2 → +3` | 100 % | | `+9 → +10` | 35 % |
| `+3 → +4` | 80 % | | `+10 → +11` | 30 % |
| `+4 → +5` | 70 % | | `+11 → +12` | 25 % |
| `+5 → +6` | 60 % | | `+12 → +13` | 20 % |
| `+6 → +7` | 50 % | | `+13 → +14` | 15 % |
| | | | `+14 → +15` | 10 % |

`relicPowerUpRates` in `relic-properties.ts`, and
`npm run verify:relic-maths` fails if the shipped table stops matching it.

**Three consequences, and they run the page.**

1. **Every relic is free to `+3`.** Nothing is ever advised against the first
   three levels, and a `+0` relic is not a worse relic than a `+3` one — it is
   the same relic three free steps earlier.
2. **`+15` is a lottery, not a target.** A fresh relic with all three durability
   reaches it about **once in eleven thousand times**. That is why §8 does not
   decide anything on `P(l, d)`: weighted or not, a number that is `0.009 %` for
   one relic and `0.002 %` for another is not separating them.
3. **Stones are worth about eleven times more on a `+0` relic than on a `+12`
   one.** The expected gain from a full three durability is 7.2 levels at `+0`
   and 0.7 at `+12`. Any rule that spent stones on the relics closest to the
   ceiling would have it exactly backwards.

### 7.5 The thresholds: what a power-up actually moves

The unique property has two numbers and only one of them moves. **The percentage
is fixed by what the property grants** — 1 % for the two damage families, 2 % for
everything else — and never changes. **The threshold falls**, in six tiers, so a
relic grows stronger by needing less of the source stat to buy the same step.

| Reads | `+0` | `+3` | `+6` | `+9` | `+12` | `+15` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ATK or DEF | 2,500 | 2,000 | 1,500 | 1,000 | 750 | 500 |
| MAX HP | 45,000 | 36,000 | 27,000 | 18,000 | 13,500 | 9,000 |
| SPD | 300 | 250 | 200 | 150 | 125 | 100 |

**All six of this account's relics carry exactly the threshold this table gives
for their level and source stat.** That is a confirmation of the table, and the
sixth independent confirmation of the id mapping in §4.1 — read the source stat
wrongly for any of them and the number would not land.

**The two halves do not grow together.** Over the fifteen levels the main
property multiplies by 6, a unique property reading ATK, DEF or MAX HP by 5, and
one reading SPD by only **3**. So a Nimble relic arrives closer to its own
ceiling than any other and has correspondingly less to win from being levelled
— which is precisely what an index built on the main property alone could not
say. `relicStrengthIndex` weighs the two halves equally and
`verify:relic-maths` re-decides the whole table at every weighting from
all-main to all-unique to show that the verdicts do not turn on that choice.

**Every figure in that table is read, not inferred.** The MAX HP value at `+15`
was the one that needed reading twice — it was illegible in the first capture
and stood for a while on the strength of the 18× ratio holding at the other five
anchors. It came back `9,000`, which is what the ratio predicted, and the ratio
is now confirmed at all six tiers rather than five.

**One thing is still inference.** The tiers step at `+0`, `+3`, `+6`, `+9`,
`+12` and `+15`, which is how the table is labelled — but no relic on this
account has ever sat at an intermediate level, so whether `+1` and `+2` hold the
`+0` value is unconfirmed. A relic at `+4` or `+7` would settle it in one
glance.

### 7.6 What this replaced, and why the replacement matters

Before the table was to hand, JASWA estimated **one** rate for all fifteen
levels from the account's own relics: a level gained is a success, a durability
spent is a failure. On this account that read **76 %**.

That estimate was not wrong about what it measured. The account's nineteen
attempts were all made at `+0` to `+9`, three of those levels are free, and the
true average across that range is close to it. **It was wrong about everywhere
else.** Applied to `+10 → +15`, where the real rates are 30 % down to 10 %, it
overstated the chance of finishing a relic by more than three orders of
magnitude — `19 %` against `0.009 %`.

The lesson is recorded here rather than quietly fixed, because the failure was
not arithmetic. Every step was defensible: the estimator was unbiased for its
own sample, the sample was real, and the model said out loud that it was
pooling. What it did not say was that **the sample covered only the cheap half
of the curve**, and a projection is only as good as the range its evidence
spans.

## 8. The verdict is one multiplication

**A relic's fit multiplies both numbers, on a halving ladder:**

| Fit | Weight |
| --- | ---: |
| Exceptional | × 10 |
| Strong | × 5 |
| Neutral | × 1 |
| Weak | × ⅕ |
| Poor | × ⅒ |

The ladder mirrors itself about Neutral — every band is the exact reciprocal of
its opposite number — so it reads the same from either end: an exceptional fit
is worth ten neutral ones, and a poor fit a tenth of one. The spread is wide on
purpose. A relic rides a hundred monsters, so the gap between the right pairing
and the wrong one is not a matter of degree, and a narrower ladder would let a
poor fit out-argue a good one on level alone.

From that, two quantities, each read against a bar the risk slider sets:

- **Stones** — `weight × (V(l, d) − V(l, 0))`. Is this relic worth power-up
  stones? The second factor is what having durability left is worth: the
  expected finished strength, less what the relic would be worth if it could
  never be touched again. It is `E[levels gained] / 18`; the expected gain
  itself travels in the *Likely end* column's title, because the advice cell
  already prints the whole multiplication and a column for each factor would
  have said the same thing three times.
- **Merit** — `weight × V(l, d)`, on a 0–10 scale. Is this relic worth a slot at
  all? It is not a column — the *Likely end* column says the same thing in
  levels, which is the unit a player thinks in — but every verdict that turns on
  it prints it, so the judgement is still arguable.

`P(l, d)` is no longer one of them, and §7.4 says why: the published rates make
it near zero for everything that is not already finished.

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

**The working is kept, but not printed.** Every verdict carries the arithmetic
that produced it — `5.0 × 28 % left to win = 1.4`, `Merit 0.05 under 0.26` — in
its cell's title, so a verdict can still be checked rather than trusted. It is
not a second line under the verdict any more: with the columns beside it already
saying where the relic ends up, a line of working on every row read as noise
rather than as evidence.

## 9. The risk slider

One appetite, two bars:

| Risk | Stones bar (§8) | Holding bar (§8.3) |
| ---: | ---: | ---: |
| 1 | 2.50 | 0.40 |
| 2 | 1.60 | 0.33 |
| 3 | 1.00 | 0.26 |
| 4 | 0.50 | 0.19 |
| 5 | 0.25 | 0.12 |

At risk 1 only a barely-touched exceptional relic earns stones; at risk 5 a
neutral fit with a full three attempts does. The holding bar stays below what a
neutral fit is worth at every setting, which is deliberate: Neutral is not a
sell (§8.3), and only the two negative bands are ever let go.

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
