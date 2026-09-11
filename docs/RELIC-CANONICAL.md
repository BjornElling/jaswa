# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**The synergy table:** 48 hand-written cells in `app/lib/relic-synergy.ts`, set
out in readable form in §5.1.1
**Read by:** `app/lib/relics.ts`, `app/lib/relic-properties.ts`,
`app/lib/relic-synergy.ts`, `app/lib/relic-advice.ts`,
`app/lib/relic-monster-statistics.ts`, `app/lib/relic-monster-fit.ts`,
`app/lib/relic-monster-grid.ts`, `app/components/relic-list.tsx`,
`app/components/relic-monster-list.tsx`
**Enforced by:** `npm run verify:relic-synergy`, `npm run verify:relic-maths`,
`npm run verify:relic-monster-plan`

---

## 1. Why relics need their own document

A rune belongs to one monster. An artifact belongs to one monster. **A relic is
engraved on up to 150 monsters at once**, and that single fact rewrites
every judgement around it.

- A good relic is not a good slot; it is a good *account*. Its value is the
  number of monsters in the metagame that want exactly it.
- A duplicate has little marginal value. One copy already covers more monsters
  than most accounts field, so a duplicate is kept only while its expected
  final strength beyond the account's incumbent clears the selected stone
  threshold.
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

**Relic Power-up Stones live in account inventory, not in rune craft items.**
The current export records their stack as
`inventory_info[item_master_type = 6, item_master_id = 19].item_quantity`.
The Relics filter strip shows that exact quantity; when an import does not carry
`inventory_info`, it says so rather than treating an unknown balance as zero.

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
`relicMainPercent` is one half of the strength index that `V(l, d)` in §7.2
measures a relic against; its unique-property threshold is the other half.

## 3. What is known about the mechanic, and from where

| Fact | Source |
| --- | --- |
| Main property is HP, ATK or DEF | Com2uS relic announcement |
| Sixteen unique properties, in six functional groups | Com2uS relic announcement |
| A unique property is fixed at crafting; a power-up changes only its value | Com2uS relic announcement |
| Power-up ceiling is `+15`; every relic starts at 3 durability; a failure spends one; at 0 no further attempt is possible | Com2uS relic announcement |
| One relic engraves on up to **150** monsters | Com2uS patch notes, v9.3.0, August 27 2026 — raised from 100; §3.1 |
| Effects read "*X* +N % per *T* *stat* at the start of battle" | Com2uS relic announcement, and the shape of `sec_effect` |
| Power-up success rates per level, `100 %` to `+3` then `80 %` down to `10 %` | Com2uS's published table — §7.4 |
| Primary effect ids `100`/`101`/`102` are HP/ATK/DEF | `ENGRAVING-STATISTICS.md` §1, on captured traffic |
| The unique-property id space is exactly `1`–`16` | The game's own Select Unique Property panel — §4 |

### 3.1 The engraving limit is 150, and it used to be 100

**Both figures were right, two weeks apart.** The limit is not a disputed
reading; it is a value Com2uS changed, and the patch notes say so in one
sentence:

| Date | Version | Limit |
| --- | --- | ---: |
| April 13, 2026 | v9.1.8 | Relics arrive, engravable on **100** monsters |
| August 27, 2026 | v9.3.0 | *"The maximum number of Monsters that can have the same Relic engraved at once has been increased from 100 to 150."* |

v9.3.0 reached Europe at 09:45 CEST on August 27, 2026. **JASWA obeys 150**, the
current figure, and keeps the history because a number that moved once can move
again — and because it explains the older one rather than leaving it looking
like a mistake somebody made.

**This is why the earlier reasoning in this section was wrong, and the lesson is
worth more than the number.** An earlier draft treated the two figures as a
disagreement between the relic announcement and the game's own Manage Relic
panel, and resolved it by ranking the sources: the client enforces the limit, so
the client wins. That reached the right answer for the wrong reason. The
announcement was not mistaken and the panel did not overrule it — the game
changed underneath both, and **a launch announcement is a statement about a
date, not a standing fact**. Every other figure in this document read from a
pre-release announcement carries the same exposure, and §7.4's power-up rates
most of all.

**Nothing can confirm it in traffic.** §4.3 is why: a capture taken while the
relic screens are open holds nothing about relics, because the property list,
the names, the power-up rates and this limit are all client-side. The patch
notes and the panel are the only routes there are.

**`relicEngravingLimit` in `app/lib/relic-properties.ts` is the only place the
number is written.** It sits with the power-up ceiling, the durability a relic
starts with and the published success rates, because it is the same kind of
fact: a constant of the game's own mechanic rather than a parameter of any
judgement JASWA makes. The page's tagline, the plan, the reason lines and the
verifier all read it from there, so a correction is one line and this section.

**Until §11 there was nothing to correct.** The old note here said that nothing
in JASWA depended on the exact number, and that was true: §1's argument is that
one relic covers far more monsters than an account fields, and that holds at
either figure. §11 changes it. The limit is now a **hard capacity constraint on
a shared resource**, and the plan it produces is different at 100 than at 150 —
fifty monsters' worth of different, per relic. The figure has stopped being
context and become arithmetic, which is why it now has a section of its own.

**The per-level power-up success rates are published**, and §7.4 carries them.
They are the single most consequential thing on this page: the first three
levels are free, and from `+3` onward the rates fall progressively, ultimately
to 10 %.

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

## 5. Synergy is one table

**The question.** A relic has a main property and a unique property, but the
player needs one answer: how attractive is this pair as an account-wide
investment? Synergy therefore combines the property's practical effect, the
natural fit of its two stats, and the breadth of relevant monsters. It is not a
separate "double-dip" score plus a hidden coverage score.

**The answer is forty-eight cells in `relic-synergy.ts`, written down.** Nothing
derives them, nothing regenerates them, and every one can be edited on its own
line when a better judgement is to hand. `npm run verify:relic-synergy` checks
only that the table stays whole — every property has a row, every row has all
three mains, every value is one of the five bands, and no band has fallen out
of use. A row may deliberately grade all mains alike when practical coverage,
rather than a mechanical source-stat interaction, is the judgement.

### 5.1 What each cell was judged from

Three inputs inform the one band:

1. **Effect strength.** Does the property make a meaningfully useful outcome?
2. **Natural stat fit.** Does the main suit the monsters that want that outcome?
   A main feeding the property's source stat is evidence here, not an automatic
   upgrade: `ATK → DEF` can be mechanically neat yet too narrow to merit stones.
3. **Account coverage.** How broadly do relevant monsters want the finished
   profile? `SPD → MAX HP` is strong precisely because fast supports, control
   units and bruisers commonly want more HP even though no main property feeds
   SPD.

The table is an expert-informed judgement, not a claimed empirical measurement.
It was revised against a current specialist guide's matrix where its practical
coverage signal consistently contradicted a mechanical-only reading. That guide
is useful evidence, not an authority: its property names contain an error, and
the game vocabulary in §4 remains the source of technical names and effects.

| Band | Meaning |
| --- | --- |
| Exceptional | A top pair: high effect and very broad relevant use. Primary stone target. |
| Strong | Clearly valuable, with broad use or exceptional value for a substantial archetype. |
| Neutral | Useful, but situational or plainly behind the best alternatives. |
| Weak | Plausible only for a narrow need; not a general stone target. |
| Poor | Very rarely a rational use of scarce stones. |

### 5.1.1 The whole table

| id | Unique property | Grants | Reads | HP main | ATK main | DEF main |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Sharp Conquest | DMG dealt | ATK | ★ Strong | ★★ Exceptional | ◇ Neutral |
| 2 | Solid Conquest | DMG dealt | DEF | ✕✕ Poor | ✕✕ Poor | ◇ Neutral |
| 3 | Hearty Conquest | DMG dealt | MAX HP | ★ Strong | ✕ Weak | ✕ Weak |
| 4 | Sharp Resolute | DMG taken | ATK | ✕✕ Poor | ✕ Weak | ✕✕ Poor |
| 5 | Solid Resolute | DMG taken | DEF | ✕✕ Poor | ✕✕ Poor | ✕ Weak |
| 6 | Hearty Resolute | DMG taken | MAX HP | ★ Strong | ✕✕ Poor | ◇ Neutral |
| 7 | Nimble Valiant | ATK | SPD | ★ Strong | ★★ Exceptional | ◇ Neutral |
| 8 | Solid Valiant | ATK | DEF | ✕ Weak | ◇ Neutral | ◇ Neutral |
| 9 | Hearty Valiant | ATK | MAX HP | ◇ Neutral | ◇ Neutral | ✕ Weak |
| 10 | Sharp Timeless | DEF | ATK | ✕ Weak | ✕ Weak | ✕ Weak |
| 11 | Nimble Timeless | DEF | SPD | ◇ Neutral | ✕ Weak | ★ Strong |
| 12 | Hearty Timeless | DEF | MAX HP | ★ Strong | ✕ Weak | ★ Strong |
| 13 | Sharp Primal | MAX HP | ATK | ◇ Neutral | ◇ Neutral | ✕ Weak |
| 14 | Nimble Primal | MAX HP | SPD | ★★ Exceptional | ★ Strong | ★ Strong |
| 15 | Solid Primal | MAX HP | DEF | ★ Strong | ✕ Weak | ★ Strong |
| 16 | Hearty Restore | Recovery & Shield | MAX HP | ◇ Neutral | ✕✕ Poor | ✕✕ Poor |

3 Exceptional · 11 Strong · 12 Neutral · 13 Weak · 9 Poor.

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

What the measurement got right is kept in §5.1 as qualitative reasoning rather
than as evidence: alignment among the main stat, the property's source and its
granted outcome can matter. It is one input to the account-wide judgement, not
a necessary condition.

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
V(l, 0)  = relicStrengthIndex(l, source)                 what it actually became
V(l, d)  = p(l)·V(l + 1, d) + (1 − p(l))·V(l, d − 1)
```

**Why a second run is necessary.** `P` asks whether a relic will *finish*, and
answers `0` for anything that runs out of durability on the way. An exceptional
`+12` with no durability left has `P = 0` and is one of the best things an
account can own. `V` measures its realised, normalised **strength proxy**: the
main property and the unique-property threshold are equal halves of
`relicStrengthIndex`. An ATK-, DEF- or HP-reading `+12` has a proxy of 75 % of a
finished relic (main: 15/18; unique: 500/750); an SPD-reading one is about
81.7 % (main: 15/18; unique: 100/125). The threshold half normalises threshold
efficiency; it deliberately does not claim to model a particular monster's
integer effect breakpoints. **A model that judged on `P` alone would sell
either.** Once the published rates arrived (§7.4), `P` turned out to be unfit
for the other question too — it is near zero for everything — and `V` now
carries expected strength instead.

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
`+15`, and `V` is its expected normalised strength — and the verifier holds all
three to each other to machine precision. They are still written separately,
because three recursions built from three different boundaries agreeing is a
check worth having.

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
3. **Stones buy far more future strength on a `+0` relic than on a `+12` one.**
   The expected gain from a full three durability is 7.2 levels at `+0` and 0.7
   at `+12`. The *Likely end* column makes that opportunity cost visible; the
   power-up verdict itself intentionally answers the narrower next-attempt
   question defined in §8.

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
say. `relicStrengthIndex` weighs the two halves equally for both the *Likely
end* context and the measured strength gain used in §8. `verify:relic-maths`
checks that lower relics retain more expected future strength at every weighting
from all-main to all-unique.

**Every figure in that table is read, not inferred.** The MAX HP value at `+15`
was the one that needed reading twice — it was illegible in the first capture
and stood for a while on the strength of the 18× ratio holding at the other five
anchors. It came back `9,000`, which is what the ratio predicted, and the ratio
is now confirmed at all six tiers rather than five.

**One thing is still inference, and the investment score depends on it.** The
anchors are observed at `+0`, `+3`, `+6`, `+9`, `+12` and `+15`, but no relic on
this account has ever sat at an intermediate level. Until one is observed,
JASWA assumes each published threshold remains constant through its three-level
tier: `+0` through `+2`, then `+3` through `+5`, and so on. A relic at `+4` or
`+7` would settle the assumption in one glance; `verify:relic-maths` makes the
assumed steps explicit so they cannot become accidental.

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

## 8. The verdict accounts for the strength an investment buys

**A relic's one synergy band multiplies the exact expected strength of its next
attempt:**

| Fit | Weight |
| --- | ---: |
| Exceptional | × 4 |
| Strong | × 2 |
| Neutral | × 1 |
| Weak | × ½ |
| Poor | × ¼ |

For an open relic at level `l`, the chance of reaching the *next* level is
exactly `p(l)`: one successful attempt reaches `l + 1`; durability only decides
whether an attempt exists. A success is not always worth the same amount,
though. Every level raises the main property, and reaching `+3`, `+6`, `+9`,
`+12` or `+15` also lowers the unique-property threshold.

Let `S(l)` be `relicStrengthIndex(l, source)`, and let one ordinary
non-tier-level gain be the unit. JASWA calculates

```
investment score = 100 × synergy multiplier × p(l)
                 × [S(l + 1) − S(l)] / [S(1) − S(0)]
```

An ordinary level therefore keeps the previous scale, while a success that
crosses a unique-property tier earns its measured multiple. This makes `+8 → +9`,
`+11 → +12` and `+14 → +15` materially more attractive than the equally
probable main-stat-only steps beside them. The score is deliberately a
**decision score, not a probability**. A score above 100 % is a priority signal,
not a claimed game chance. The smaller, symmetric synergy ladder is a
transparent prioritisation rule, not a claim that ordinal bands have measured
cardinal utility.

The final-level distribution remains on the page as context: it describes where
a relic is likely to end. The strength index supplies the explicit one-step
gain above; neither hides a different recommendation formula.

The rules, in the order they outrank each other:

1. **A relic that cannot be powered up keeps only when it is the account's best
   same-pair copy.** It sells when another same-pair relic is at an equal or
   higher level. Equal levels keep the lower `rid`, so one deterministic copy
   remains. Its reason says exactly that.
2. **Free levels power up.** At `+0`, `+1` and `+2`, the next level cannot
   spend stones. This applies to every relic that is still open for an attempt.
3. **The hard synergy gate comes before return on investment.** The threshold
   also sets a minimum synergy band: setting 1 accepts
   only Exceptional, setting 2 also accepts Strong, setting 3 also accepts
   Neutral, setting 4 also accepts Weak, and setting 5 accepts every band.
   An open relic below that band is sold with `Synergy < threshold.` This is a
   deliberate lexicographic rule: the score ranks stone investments only among
   profiles the player is willing to own.
4. **A lower or newer equal open copy is a replacement plan.** Let `h` be its
   incumbent's current level and let `D_c(k)` be the challenger's final-level
   distribution. Its expected marginal account strength is

   ```
   Δduplicate = Σₖ D_c(k) × max(0, S(k) − S(h))
   duplicate score = 100 × synergy multiplier × Δduplicate / [S(1) − S(0)]
   ```

   It credits neither a result below the incumbent nor an equal result, and
   credits every overshoot by exactly its excess. It deliberately measures
   expected marginal account value across the challenger's whole remaining
   plan, not stones spent to achieve it. The visible chance remains
   `P(l, d, h + 1)`, the exact chance to pass the incumbent. An incumbent at
   `+15` cannot be passed, so the challenger sells. Below the selected threshold
   every other challenger sells; otherwise it powers up.
5. **Every other open relic compares its next-attempt investment score with the
   selected threshold.** At or above it powers up; otherwise it keeps.

Every advice cell prints the relevant game chance below its verdict — for
example `Next +1: 35%`. The internal score and threshold decide the verdict but
are deliberately not printed: the player needs the chance of the action, not
the conversion used to rank it. A relic rejected by the hard synergy gate says
`Synergy < threshold.` instead.

## 9. The power-up threshold

One selectivity choice controls both the internal score threshold and the hard
minimum synergy band:

| Setting | Score threshold | Minimum synergy |
| ---: | ---: | --- |
| 1 | 180 % | Exceptional |
| 2 | 120 % | Strong |
| 3 | 80 % | Neutral |
| 4 | 50 % | Weak |
| 5 | 20 % | Poor |

The former name “risk” was imprecise: the game chance already describes risk.
The slider instead chooses how high the adjusted score must be before scarce
stones are recommended. It lives in the filter strip because it changes verdicts
rather than rows, is session state, and Reset returns it to 3.

## 10. Parity

`file-imports.ts` validates relics **through `readRelic`**, the same reader the
page uses, for the reason `AGENTS.md` §0.1 gives: a relic that passes a
structural check on `rid` and then cannot be judged is counted, invisible, and
worse than rejected. Before this page existed, that was exactly the state the
import was in.

A rejection is therefore a loud one, and is meant to be. A relic rides 150
monsters; a half-read one would carry a wrong judgement across the whole roster
rather than spoiling a single slot.

---

## 11. Use for mons — which relic each monster should wear

§8 answers what a relic is worth to the **account**: keep it, spend stones on
it, or sell it. This section answers a different question, monster by monster:

> Of the relics this account already owns, which one should this monster be
> wearing right now?

They share the relics and nothing else. Different rows, different filters,
different arithmetic — which is why they are two menus on one page rather than
one table with a mode switch.

### 11.1 Exactly one recommendation per monster

**Every monster gets one relic named, and never two.** A relic occupies the
monster's relic slot, so a page offering a shortlist would be handing back the
decision it exists to make.

That promise is load-bearing on the arithmetic below. It is the reason the
bottom usage tier is worth `0.10` rather than `0` (§11.2), and the reason a
monster with no statistics falls back to synergy instead of dropping out
(§11.3): a monster can only always have a best relic if no relic can ever score
zero.

**The one exception is capacity, and it is the game's exception, not JASWA's.**
An account can own relics, own monsters, and still have monsters the plan can
put nothing on, because every relic that would reach them is already carrying
its full 150. That row reads `No capacity` — a real state of the account, not a
missing answer.

### 11.2 Usage is three hard tiers, and the bottom one is punitive

The game's **Relic Engraving Statistics** panel reports, for one monster type,
how often each main property and each unique property appears on it across the
player base. Let `p_M` be the relic's main property's share of that monster's
engravings and `p_U` its unique property's share.

| Main property usage | Credit `M` | | Unique property usage | Credit `U` |
| --- | ---: | --- | --- | ---: |
| ≥ 40 % | 1.00 | | ≥ 20 % | 1.00 |
| 20 % – 40 % | 0.50 | | 10 % – 20 % | 0.50 |
| < 20 % | 0.10 | | < 10 % | 0.10 |

**The unique cuts are the main cuts halved, because sixteen values compete for a
unique property and only three for a main.** Chance alone puts 33 % on a main
and 6.25 % on a unique, so 20 % is a real bar for a unique where for a main it
would be a low one. This is `ARTIFACT-CANONICAL.md` §19.3's reasoning and its
same halving, for the same reason: one threshold across two differently sized
vocabularies either discards useful mains or calls most uniques desirable.

**The bottom tier is 0.10 and not proportional, on purpose.** A profile almost
nobody engraves on this monster is evidence that it is the *wrong* profile, not
a slightly less popular right one. A proportional floor would hand a quarter of
the credit to a property with 5 % uptake for no better reason than that it
exists.

**Hard steps beat a ramp here, and that is measured rather than assumed.** A
continuous `min(1, p_M / 0.40)` was the first proposal and it fails on this
data: across the 1,017 captured panels **every single monster has a main
property above 40 %**, the leading share running from 43 % to 100 % with a
median of 72 %. So the ramp awards 1.00 to the leading main on every monster in
the game, and then cannot separate HP at 52 % from ATK at 39 % — it scores them
1.00 and 0.98. The steps score the same pair 1.00 and 0.50, which is the
distinction a reader is actually looking at.

**What the steps cost is resolution inside a tier, and what they risk is the
boundary.** A share at 39.9 % and one at 40.1 % differ by a factor of two in
credit. Measured, that is a smaller problem than it sounds: only **8.3 %** of
main shares and **4.0 %** of unique shares in the whole dataset have a 95 %
confidence interval that straddles a tier boundary at all. Inside a tier, the
observed share breaks ties and never scores (§11.5).

### 11.3 What the statistics can and cannot be asked

**§5.2 rejected this same panel as the basis for the synergy table, and that
rejection stands.** The reasoning there is that relics are new, most accounts
engrave whatever they happened to craft, so the *global level* of any share is
contaminated by the drop table and the crafting rate.

**The per-monster question survives that objection, and the reason is simple:
drops are monster-independent.** A distribution that varies between monsters
cannot be describing the drop table. It varies a great deal on the main
property — HP leads on 546 captured types, ATK on 422, DEF on 49 — and that
spread is a record of what players chose, not of what fell out of the game.

**The unique half is a weaker signal and this document says so.** Nimble Primal
leads on **923 of the 1,017** captured types, holding 34.9 % of all engravings
against a 6.25 % uniform share, while the other fifteen sit between 2.7 % and
8.7 %. Whatever that measures, it says nearly the same thing about nearly every
monster. It is not useless — it does corroborate Nimble Primal — but it carries
far less monster-specific information than the main property does, and the
weights in §11.4 are set with that in mind.

**A lift over the global share was considered and refused.** Dividing a
monster's share by that property's global share is the statistically cleanest
separation of choice from popularity, and it answers the wrong question: lift
measures what is *distinctive* about a monster, so it would prefer an odd relic
precisely because it is unusually common there. The page is asked what is good
for the monster, not what is peculiar to it.

**A captured panel is used, whatever its size.** `relic-monster-statistics.ts`
reports `missing` only where the dataset has never captured the type.

#### 11.3.1 A monster with no panel is judged against the population, not against synergy

**The obvious fallback is wrong, and the dataset says so plainly.** Give the two
usage terms the synergy band's own credit and `F` reduces to `Y` — so an
unmeasured monster reaches `F = 1.00` on any Exceptional pair, the ceiling of
the measured scale. Measured, that inverts the page:

| The same `+15` ATK / Sharp Conquest relic | Fit | Score |
| --- | ---: | ---: |
| on Beth, whose players put ATK main on it 69 % of the time | 0.825 | 0.825 |
| on a monster with no panel at all | **1.000** | **1.000** |

**Evidence made the score go down.** A measured monster has to clear both top
tiers to reach 1.00, while an unmeasured one gets there for free — so the
monsters JASWA knew least about were the ones it rated highest, and the relics
it named for them were chosen on a fit it had not measured.

**The fix is a prior, and a prior is what the population already is.** With no
monster-specific evidence, the honest expectation for a property's credit is
what that property earns *across every panel large enough to read*:

| Main | Prior credit | | Unique | Prior credit |
| --- | ---: | --- | --- | ---: |
| HP | 0.777 | | Nimble Primal | 0.91 |
| ATK | 0.553 | | Sharp Conquest | 0.26 |
| DEF | 0.163 | | Nimble Valiant | 0.16 |
| | | | the other thirteen | 0.10 – 0.11 |

The same relic now reads 0.605 on the unmeasured monster against Beth's 0.825,
which is the right order. The prior is neither optimistic nor pessimistic on
average — that is what makes it a prior rather than a guess — and ranking within
one unmeasured monster still reduces to strength and synergy, because the two
prior terms are constants there.

**Per property, and computed rather than written down.** "Expect an average
main" and "expect an average *DEF* main" are different claims and only the
second is true: DEF leads on 49 of 1,017 captured types, which is why its prior
is 0.163 and HP's is 0.777. `relicUsagePriors` derives all nineteen figures from
the dataset on first use, so a capture session moves them and no constant can go
stale. The table above is therefore illustrative of the current dataset, not a
specification.

**This deliberately uses the global level §5.2 distrusts**, and the distrust is
not withdrawn: for a monster *with* a panel JASWA reads that monster's own
distribution and never touches the prior. For a monster without one there is
nothing else, and a labelled prior beats a flat guess, a synergy ceiling, or no
answer at all. The row says which it got — `No statistics; using averages.`

#### 11.3.2 There is no sample-size gate, and there was one

**An earlier version refused any panel under 100 observations.** The arithmetic
behind it was sound — a share carries a standard error of `√(p(1−p)/n)`, so at
`n = 100` a share on the 40 % boundary has a 95 % interval of about ±9.6 points,
wide enough to span two tiers. The rule was still wrong, and **Camules is the
case that showed it**:

| Camules, 88 engravings | Share | Distance from its tier boundary |
| --- | ---: | --- |
| HP | 52.5 % | 2.4 standard errors clear of 40 % |
| ATK | 38.6 % | 0.3 — genuinely uncertain |
| DEF | 8.9 % | not in doubt |

**Tier reliability is a property of a cell, not of a panel.** Two of those three
are decided and the gate threw away all three because the middle one is close.
And the game shows the player exactly those percentages with no caveat, so a
page answering "no statistics" about a monster whose panel is open on the next
screen is reporting on itself rather than on the game.

**`ENGRAVING-STATISTICS.md` §5 already owns this question**: an empty panel is
not a capture, and anything else is. That rule is binding, it is what
`artifact-preferences.ts` follows, and a second competing rule here made the two
pages disagree about one dataset. It is gone.

**The sample size is shown instead of gated on.** Every Main stat and Unique
prop. cell's title ends with the number of engravings its percentages were drawn
from, because §1 of that document is right that a percentage discards the sample
size — 30 % of 88 and 30 % of 69,590 are not the same evidence, and the reader
is the one who should weigh that.

**A half-empty panel is still refused outright.** Both distributions must be present.
Judging a relic on its main while inventing the unique half would be
`AGENTS.md` §0.1's third failure — a row counted, scored, and wrong. The two
totals are also counted separately: the capture stores counts and never
percentages (`ENGRAVING-STATISTICS.md` §1), and on 290 captured types the two
totals differ slightly, so neither may be normalised against the other's sum.

### 11.4 Suitability scales strength; it is not added to it

**A relic's power-up level says how much it delivers. The three suitability
signals say how much of that delivery this monster can use.** Those are not two
substitutable kinds of value, so they multiply:

```
Score(m, r) = relicStrengthIndex(level, source) × F(m, r)

F(m, r) = 0.30·M + 0.35·U + 0.35·Y
```

with `M` and `U` from §11.2 and `Y` the synergy band as suitability:

| Band | `Y` |
| --- | ---: |
| Exceptional | 1.00 |
| Strong | 0.75 |
| Neutral | 0.50 |
| Weak | 0.25 |
| Poor | 0.10 |

**This ladder is steeper than §8's stone multipliers, deliberately.** There the
question is which relic deserves a scarce power-up stone, and a Weak relic that
is cheap to finish is still worth ranking. Here the question is whether to put
the relic on the monster, and §5.1 defines Weak as plausible only for a narrow
need and Poor as very rarely rational. A band that means "rarely rational"
should not read as a fifth of the way to exceptional.

**`F` runs from 0.10 to 1.00, so the floor is structural rather than bolted
on.** All three terms bottom out at 0.10, so no relic can score zero and §11.1's
promise holds by construction.

**Main takes the smallest weight although it is the sharpest signal, and that is
considered.** The synergy table is *indexed by* main property, so a main already
speaks twice — once through `M` and once through `Y`. Weighting it 0.30 rather
than a third keeps the two mentions roughly balanced against the unique
property, which §11.3 shows the statistics describe far less sharply. The
consequence is that a wrong main is punished twice, through both terms; that is
the intended behaviour and not a bug in the weights.

#### 11.4.1 The case that settled multiplication

An additive `0.50·S + 0.30·F + 0.20·Y` was proposed first and abandoned on a
case it decides wrongly. **A `+15` relic banks 0.50 from its level alone,
whatever pair it carries** — over half of a perfect relic's score for a profile
the monster has no use for.

Take an ordinary ATK monster, around 2,700 ATK and 900 DEF, and two relics:

| | Relic A | Relic B |
| --- | --- | --- |
| Main | ATK | DEF |
| Unique | Sharp Conquest — DMG dealt per ATK | Solid Conquest — DMG dealt per DEF |
| Level | `+6` | `+15` |
| `S` | 0.417 | 1.000 |
| Synergy | Exceptional | Neutral |
| Usage | both halves in the top tier | main < 20 %, unique 10–20 % |

A is the relic that feeds the stat the monster builds. B is fully levelled and
points most of its size at a stat the build is not about.

```
additive        A: 0.50(0.417) + 0.30(1.00) + 0.20(1.00) = 0.708
                B: 0.50(1.000) + 0.30(0.375) + 0.20(0.50) = 0.733   → B wins

multiplicative  A: 0.417 × [0.30(1.0) + 0.35(1.0) + 0.35(1.0)]  = 0.417
                B: 1.000 × [0.30(0.1) + 0.35(0.5) + 0.35(0.5)]  = 0.380   → A wins
```

**The additive form recommends B, and B is the wrong answer.** An 18 % DEF main
on a pure attacker is a large number pointed at nothing; addition lets that
number buy a win because it treats size and relevance as interchangeable.

**Multiplication still respects a finished relic, which was the reason
addition was attractive.** Break-even against that same mediocre `+15` sits
between `+3` and `+6`: a perfectly suited `+3` relic scores 0.292 and loses to
it, and by `+6` the suited relic takes over at 0.417. An almost undeveloped
"perfect" relic does not automatically outrank a relic that is actually
delivering — it has to be levelled far enough to mean something first.

**What this model deliberately does not do.** JASWA holds each monster's real
stats, so Sharp Conquest at `+6` on 2,700 ATK is exactly computable — `+1.8 %`
damage dealt. Scoring the effect directly would be more principled than scoring
the population's habits, and it is not what this page does: it would need a role
model per monster to weigh `+1.8 % DMG` against `+9 % ATK` against
`MAX HP +2 % per 125 SPD`, and §7.2 already records that JASWA does not model
relic value per monster. The usage statistics are a proxy for that judgement,
and §11.3 bounds how far the proxy can be trusted.

### 11.5 The engraving limit is a gate, not a queue

A rune or an artifact belongs to one monster, so recommending one is a private
matter between that monster and that piece of equipment. **A relic is shared, and
shared a finite number of times**: once 150 monsters carry it the game refuses
the next engraving until it is unengraved from one of them.

**Every monster is nevertheless told its own best relic.** The gate is the
engraving count the import actually carries, so a relic is withheld only when
the game would refuse the engraving *today* — never because other monsters also
want it. Then, and only then, the row falls to the monster's next best and says
why: `Best one is at its 150 limit.`

**A monster already wearing a relic spends no capacity on it.** Re-recommending
what a monster is already carrying costs no new engraving, so a relic sitting on
150 monsters stays available to exactly those monsters and is unavailable to
everyone else. That is the game's own behaviour, and it is why the gate cannot
simply be "is this relic full".

#### 11.5.1 What this gives up, stated plainly

**The column is a set of answers, not a single feasible plan.** §11.3's
measurement makes that bite rather than being theoretical: one unique property
leads on 90.8 % of monster types, so on a large roster the account's best relic
is the right answer for far more than 150 monsters. Follow the column down and
the 151st will be refused by the game.

**A reserving pass was built first and then removed**, so the choice is on
record. It was greedy over every `(monster, relic)` pair in score order — the
same shape as `allocateArtifactPlacements` — and it produced a plan that was
feasible as a whole: the best relic went to its 150 best homes and the rest were
sent elsewhere. Two things were wrong with it as *advice*.

1. **A row could not be understood on its own.** A monster was told to wear a
   second-rate relic because of a queue it could not see, and the row's only
   explanation was that something better had been taken by monsters elsewhere in
   a table the user might well be filtering away.
2. **A row was not stable.** Because the pass ranked the whole roster, importing
   one monster, or awakening one, could change a different monster's
   recommendation. A page whose answer for Beth depends on what happened to
   Bulldozer is hard to trust and harder to act on in pieces.

**Answering each monster with its own best relic is the more useful of the
two**, and the cost is the paragraph above rather than a hidden defect. The
account's own counts still bind: as soon as a relic really is full, every
monster that does not wear it is routed to its next best and told so.

**Ties are broken deterministically, and hard tiers make that necessary.** Three
steps of usage credit and five of synergy put a great many relics on exactly the
same score for one monster. `rankRelicsForMonster` orders by score and then by
the relic's acquisition order (`rid`, the same rule §8.1 uses to choose between
equal copies), so two runs of the same import cannot disagree.

**`npm run verify:relic-monster-plan` holds the pass to its promises:** exactly
one answer per monster, never a relic the game would refuse today, and a row
that is identical whether it is computed alone or beside the whole roster.

### 11.5.1 Material monsters are outside the plan

**A Material monster wears no equipment**, which is the reason
`ENGRAVING-STATISTICS.md` §4 leaves all twelve of them out of the capture list.
Here that is not a cosmetic matter. Engraving capacity is finite and an account
holds fodder by the dozen, so a Rainbowmon given a place on the account's best
relic takes that place from a monster that could have used it. They are
therefore excluded before the plan is built — the one narrowing of the roster
that is not a display filter.

**Only what the catalogue positively calls Material.** An archetype of `none` is
an unmapped monster and not a fodder one, so a monster JASWA cannot classify
stays in the plan: hiding a row on a guess is the failure `AGENTS.md` §0.1 is
about, while over-including one costs a place at worst.

### 11.6 Display filters never enter the calculation

**A row is computed from that monster, the relics, and the engraving counts in
the import — and from nothing else.** Search, Element, Type, Inventory, Storage,
the level filter and **Hide if → Already optimal** change which finished rows
the user is looking at, and can never change what any of them says.

The last of those is the one worth naming, because it filters on the page's own
verdict. `Already optimal` drops every row whose verdict is `Keep` — precisely
the monsters already wearing the relic this page would give them. On an account
whose relics are mostly placed that is the commonest verdict by a wide margin,
so the control turns the table into a worklist. It removes rows *after* the
verdict is decided and never feeds back into it.

Under §11.5's gate this is close to free: each answer is already independent of
every other monster, so there is nothing a filter *could* reach. It was not free
under the reserving pass that came first, and it is written down because the
guarantee has to survive whichever pass is in place. **The order is the rule:**

```
every monster + every relic  →  score  →  gate on the import's own counts  →  filter the view
```

`verify:relic-monster-plan` holds it directly: the recommendation, fit and score
for a monster computed on its own must equal the ones computed with the whole
roster present. The page's own Playwright suite checks the same thing through
the interface, by reading every visible row, applying a filter, and requiring
the survivors to be untouched.

### 11.7 What the table shows

| Column | What it says |
| --- | --- |
| `#`, Monster, Elem, Type, LVL | The monster, as the roster table names it |
| Current relic | What it wears today — every relic the export gives it, never only the first |
| Use this | The relic to engrave, or `Same` where that is what it already wears |
| Main stat | The recommended relic's main property, as a share of this monster's most-engraved main |
| Unique prop. | The same reading for its unique property |
| Advice | The verdict, and a reason line only where there is one to give |

**The two percentage columns are readings, not the score.** `Score` and `Fit`
stood here first and were replaced, because a composite is the one number on a
table nobody can check. Each of these can be checked against the game's own
Statistics panel in one glance: the leading option on a monster always reads
100 %, and everything else reads its share of that. A main at 39 % on a monster
whose leader has 40 % and one at 21 % on the same monster fall in the same tier
(§11.2) and are plainly not the same relic — the tiers are the right shape for
deciding and the wrong shape for showing.

They rate the relic in **Use this**, not the one in **Current relic**, so the
columns describe what the page is proposing. The incumbent's own two figures are
in each cell's title, because without them the size of a proposed change cannot
be read off the row. Where the panel is missing or too thin there is nothing to
divide by and the cell reads `—`; a `0 %` would claim the population had
rejected the property rather than that nobody had counted it.

**`S × F` still decides which relic is named** — §11.4 is unchanged. It is
simply no longer printed: the player needs the relic and the reason, and a
composite in a column costs width and invites the reader to take it on trust.
The three terms behind it remain in the titles.

**A relic reads `Nimble Primal` over `HP (lvl. 12)`.** The level is spelled out
rather than written `+12` because it sits directly beside a main property, and
`HP +12` reads as twelve points of HP — the quantity `AGENTS.md` §5 says a main
property never states. The library table's `+12` column has no stat beside it
and keeps the short form.

**Four verdicts.** `Engrave` for a bare monster gaining a relic, `Replace` where
the relic it wears is the wrong one, `Keep` where it already wears the
recommendation, and `No capacity` where the limit has locked it out. They carry
the `--state-*` verdict colours `AGENTS.md` §5 allows for a machine reporting
its own state, and the verdict's name is written beside the colour, so the
column reads identically with the colour taken away.

**The reason line is usually empty, and that is the point.** Only two facts earn
one. **Capacity**, because it is the sole reason a row shows anything but the
monster's best relic and nothing else on the page reveals that. And **the state
of the statistics**, because a fit assembled from population averages is a
different claim from one measured on this monster and the number alone cannot
tell them apart.

The usage tiers deliberately get no line. A row reading "Both halves are
favoured here" beside two columns already reading 100 % is one fact written
twice, and the sentence is the vaguer of the two. The tiers and the shares
behind them live in those cells' own titles, where they explain the numbers
instead of competing with them.
