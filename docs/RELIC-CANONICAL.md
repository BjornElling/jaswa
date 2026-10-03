# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**Engraving model revised:** October 3, 2026 — per-copy rune investment and actual effect contributions
**The synergy table:** 48 hand-written cells in `app/lib/relic-synergy.ts`, set
out in readable form in §5.1.1
**Read by:** `app/lib/relics.ts`, `app/lib/relic-properties.ts`,
`app/lib/relic-synergy.ts`, `app/lib/relic-advice.ts`,
`app/lib/relic-monster-value.ts`, `app/lib/relic-monster-fit.ts`,
`app/lib/relic-monster-grid.ts`, `app/components/relic-list.tsx`,
`app/components/relic-monster-list.tsx`
**Enforced by:** `npm run verify:relic-synergy`, `npm run verify:relic-maths`,
`npm run verify:relic-monster-plan`, `npm run verify:relic-monster-value`

---

## 1. Why relics need their own document

A rune belongs to one monster. An artifact belongs to one monster. **A relic is
engraved on up to 150 monsters at once**, and that single fact rewrites
every judgement around it.

**Only a level-40 monster can receive a relic engraving.** This eligibility
rule comes before fit, capacity, and every recommendation: JASWA neither counts
an engraving on a lower-level monster nor proposes one there.

- A good relic is not a good slot; it is a good *account*. Its value is the
  number of monsters in the metagame that want exactly it.
- A duplicate has little marginal value **until the first copy runs out of
  places**. One copy already covers more monsters than most accounts field, so a
  duplicate is normally kept only while its expected final strength beyond the
  account's incumbent clears the selected stone threshold — but a copy engraved
  on its full 150 cannot reach a 151st monster at any level, and §8's rule 0 is
  the exception that follows.
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

### 5.2 Why this table is not measured from the player base — and where the same panel *is* a legitimate default

This section says two things, and they are not in tension. **The synergy table
above is hand-written and stays hand-written.** The same panel nevertheless
supplies the **starting values** a monster's own relic preferences begin from,
in the monster overlay. The difference is what the number is asked to do.

#### The table: still hand-written

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

#### The defaults: the same panel, a different job

The monster overlay asks a different question of the same numbers: *before this
user says anything, what should this monster's relic preferences show?* Here the
panel is a legitimate source, and `app/lib/monster-defaults.ts` reads it.

Three things make that sound where the synergy table's use of it was not:

- **The objection above is about the global level, not the per-monster
  variation.** Drops are monster-independent, so a distribution that varies
  *between* monsters cannot be describing the drop table — and it varies between monster species. The synergy table asked the panel an account-wide
  question, which is exactly where the drop rate contaminates the answer.
- **A default is not a judgement.** It is a provisional value the user sees
  immediately and overwrites with one click, and §19.4 of
  `ARTIFACT-CANONICAL.md` guarantees their statement always wins. The
  "cannot be argued with" objection does not apply to a number whose whole
  purpose is to be argued with.
- **A user's statement constrains recommendations; a default does not.**
  The engraving engine reads only the copy's saved main and unique selections.
  A non-empty selection restricts that half; a cleared menu allows any, exactly
  as the overlay names it. Statistics still seed the overlay, but never enter
  the engraving score. Existing choices are retained without rewriting storage.
**The caveat stands and is worth stating plainly: a relic share still partly
reflects what fell out of the game.** The main half carries real monster-specific
signal — HP leads on 546 types, ATK on 422, DEF on 49, with the leader's share
running 43 % to 100 %. The unique half carries far less: Nimble Primal leads on
974 of the 1,017 captured panels, so a user who accepts that default has accepted
population habit rather than knowledge about their monster. That is an acceptable
starting value and a poor conclusion, which is precisely why it is offered as the
former only.

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

### 7.0 One implementation, `app/lib/relic-power-up-model.ts`

**Every probability this page states is computed in that file and nowhere
else.** Not the chance of the next level, not the chance of reaching a target,
not where a relic will come to rest, not what it will be worth when it stops.
A caller that wants one of these numbers imports it; a caller that reaches for
`relicPowerUpRates` to work one out itself is the failure this rule exists to
prevent.

The reason is not tidiness. A second implementation would not merely duplicate
the work — it would drift, and the page would then print two different chances
for the same relic with neither being obviously the wrong one. The verdict in
the advice column and the percentage printed beneath it have to come from the
same arithmetic, or the page is arguing with itself.

The rule is enforced rather than stated: `verify:relic-maths` reads every module
in `app/lib` and fails if any file other than the model and the properties table
so much as touches `relicPowerUpRates` outside an import. It was tested against
subscripting, a `for … of`, a `reduce`, an alias and a spread copy, and catches
all five.

`scripts/verify-relic-maths.mjs` is the one deliberate exception. It re-derives
these results from closed forms written independently of the recursions, and
from a Monte Carlo of the game's own loop, precisely so a disagreement is
caught. That is a check on the model, not a second copy of it, and it is why the
functions take the rate curve as an argument.

**The model has been reviewed adversarially**, by two reviewers instructed to
break it rather than bless it. Neither could produce a wrong number for any
valid relic: the recursion, its boundaries, its iteration order and its handling
of durability are correct, and a Monte Carlo of the mechanic agrees with the
tables to within sampling noise. Both found the same two ways to produce a wrong
number from an *invalid* input, and both are now closed:

- **A target above `+15`.** §8.2's gate asks for `incumbent + 1`, which is `16`
  whenever the incumbent is a finished copy — a real call on a real account. It
  answered `0`, but only because the published table has fifteen entries and the
  sixteenth read back as absent. A curve one entry longer had the relic climbing
  to a `+16` the game has no room for. The ceiling is now a stated boundary.
- **A malformed rate curve.** Driving the recursions with a truncated table used
  to return a landing distribution that summed to `1`, looked entirely
  well-formed, and put 99 % of its mass on the wrong level, with nothing raised.
  A curve that is not fifteen chances in `[0, 1]` is now refused outright.

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

1. **Every relic is certain to `+3` — which is not the same as free.** The first
   three attempts succeed at 100 %, so they cost no durability, but the game
   charges its usual stones and gold for each one: the power-up panel prices a
   roll at `+0` exactly as it prices one at `+14`. Nothing is advised against
   those levels on a pair worth keeping, and a `+0` relic is not a worse relic
   than a `+3` one — it is the same relic three certain steps earlier. On a pair
   the synergy gate has rejected, however, a certain level is a certain waste,
   which is why §8's gate outranks this rule rather than following it.
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
attempts were all made at `+0` to `+9`, three of those levels are certain, and the
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

0. **A copy that has run out of places is no longer an incumbent.** Rules 1 and 4
   below both rest on §1's premise: one relic already covers more monsters than
   an account fields, so a second copy of the same pair adds nothing unless it
   can overtake the first. **§11 made capacity something the page computes with,
   and that premise stopped holding at the ceiling.** A relic engraved on its
   full 150 cannot take a 151st monster whatever its level, so a weaker duplicate
   of it is not redundant — it is the only way the account can put that pair on
   another monster at all. Where the incumbent is at `relicEngravingLimit`, this
   relic is judged on its own next attempt exactly as a relic with no incumbent
   is, and a spent one keeps with `Other copy is on 150.`

   This is a **capacity** exception and not a strength one. It says nothing about
   the duplicate being stronger; it says the comparison rule 4 performs has no
   object left to compare against.
1. **The hard synergy gate is asked first, of every relic.** The slider sets a
   weakest fit the account is willing to hold: `Picky` keeps Strong and better,
   `Balanced` also keeps Neutral, `Optimistic` also keeps Weak, and
   `Wishful thinking` and `Burn it all` keep every band. A relic below that band
   is sold with, for example, `Weak fit: below threshold.` — whatever its level,
   its durability, its duplicates or its next attempt.

   **The scale starts at Strong.** It used to start at Exceptional, which sold
   all but a handful of a real library — Strong pairs included — and so made the
   most cautious stop the most destructive one. The two boldest stops share the
   Poor band as a result; §8.5's threshold is what still separates them.

   **`Balanced` is the ordinary setting**, where the slider opens and where most
   accounts should stay. Only one stop is stricter; the three above it climb from
   optimistic to indefensible, and `Burn it all` exists to give the scale an end
   rather than because anyone should sit on it.

   This is a deliberate lexicographic rule, and the gate answers a different
   question from everything after it. The gate asks whether the pair is worth
   owning at all; the rules below ask, of a pair that survived, whether it is
   worth spending stones on. **Nothing outranks the gate.** It sat third until
   the two rules that outranked it were found to be readmitting relics the
   setting had already rejected: a relic below `+3` was powered up on the
   grounds that those levels are free — see §7's correction, they are certain,
   not free, and the stones are charged — so at the strictest setting the page
   recommended stones on hopeless relics, the one thing the gate exists to
   prevent. A relic that could not be powered up at all was kept for the same
   reason, filling the account with finished relics of a ruled-out pair. Neither
   exception survives.
2. **The duplicate gate is asked second, and it does not read the slider.** A
   relic standing beside a same-pair copy at an equal or higher level is judged
   on one question: can it ever pass that copy? The chance is `P(l, d, h + 1)`
   with `h` the incumbent's level — the exact chance to reach one level above it
   — and it is compared against a threshold set by the challenger's own synergy
   band:

   | Fit | Passes the gate at | A fresh challenger then tries against an incumbent up to |
   | --- | ---: | --- |
   | Exceptional | 5 % | `+9` (10.7 %; a `+10` is 4.3 %) |
   | Strong | 15 % | `+8` (22.4 %; a `+9` is 10.7 %) |
   | Neutral | 30 % | `+7` (39.9 %; a `+8` is 22.4 %) |
   | Weak | 50 % | `+6` (61.3 %; a `+7` is 39.9 %) |
   | Poor | 70 % | `+5` (82.3 %; a `+6` is 61.3 %) |

   The right-hand column is for a `+0` challenger with all three durability; a
   challenger that has already climbed reaches further, and one with durability
   spent does not reach as far.

   **The slider is deliberately not consulted.** It says how wide a net the
   account keeps, which is a matter of taste; this gate asks whether an attempt
   is lost, which is not. A challenger with a 2 % chance of passing its incumbent
   is a bad investment at every setting, and letting a bold stop override that
   would recommend stones on attempts that cannot land.

   Synergy sets the price of admission because it is what the attempt buys. The
   figures are calibrated against §8.4's real overtake chances: a
   full-durability challenger passes a `+5` incumbent 82 % of the time, a `+8`
   22 %, a `+10` 4.3 % and a `+12` 0.36 %. So in practice these five thresholds
   sort duplicates by how high the incumbent has climbed.

   **Exceptional is not exempt.** At 5 % it still tries against an incumbent up
   to `+10` and gives up beyond it: against a `+12` it passes about once in 280
   attempts, and no pairing is good enough to make that a plan. An incumbent at
   `+15` cannot be passed at all, so the challenger sells with `Cannot beat +15.`

   This gate outranks rule 4, and for the same reason the synergy gate outranks
   everything: a `+0` challenger beside a `+12` copy would otherwise be powered
   up on the strength of a guaranteed level it has no use for.

   The gate replaced a score that weighed the challenger's whole landing
   distribution against the slider's threshold. That number answered a real
   question — expected marginal account strength — but in units no player could
   check, and the page printed a plain chance beside it. `relicDuplicateMarginal`
   `Strength` survives in `relic-advice.ts` for `verify:relic-maths`; it no
   longer decides anything.
3. **A relic that cannot be powered up keeps only when it is the account's best
   same-pair copy.** It sells when another same-pair relic is at an equal or
   higher level. Equal levels keep the lower `rid`, so one deterministic copy
   remains. Its reason says exactly that.
4. **Certain levels power up.** At `+0`, `+1` and `+2` the next attempt succeeds
   at 100 %, so it cannot spend durability — it does spend the usual stones and
   gold. A guaranteed level on a pair both gates have admitted is the best stone
   the account can spend, which is why this outranks the score.
5. **Every other open relic compares its next-attempt investment score with the
   selected threshold.** At or above it powers up; otherwise it keeps. This is
   the only rule the slider's threshold decides, and it is reached only by a
   relic that is worth owning and is not a hopeless duplicate.

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

## 11. Use for mons — value on the monster's own build

The engraving question uses `relic-monster-value.ts` and `relic-monster-fit.ts`.
It does not use the population, synergy bands or the investment strength proxy.
Sections 5–9 still decide Power up, Keep or Sell without any change.

### 11.1 Rune investment supplies the priorities

Read the copy's base B, its rune-only sheet R and its equipped sheet T through
`monster-stats.ts`. R includes rune mains, innates, substats, grinds and completed
personal stat sets. T also includes artifact mains. Neither includes a relic.
No second stat-sheet implementation is allowed.

For each of HP, ATK and DEF:

```
increase[s] = max(0, (R[s] − B[s]) / B[s])
weight[s]   = increase[s] / sum(increase)
```

Adding 100 % HP and 60 % DEF yields HP weight 0.625 and DEF weight 0.375.
Artifacts affect what a unique property reads, not the rune priorities. SPD
sizes a source-dependent effect, but cannot be a priority for a stat relics do
not grant. CRI Rate, CRI Dmg, RES and ACC are not granted by relics either.

All four source bases and totals must be finite and positive. Missing stats
produce `No recommendation` with an import instruction. No HP/ATK/DEF rune
investment produces the same verdict with an instruction to equip runes. Neither
is silently excluded or filled from population habit. A zero weight stays zero.

### 11.2 The effect calculation

Use the imported `mainPercent`, `unique.threshold` and `unique.percent`, not a
value reconstructed from the relic's level. This respects every accepted record.

The explicit battle model is:

```
mainGain = B[main] × mainPercent / 100
A        = T, with mainGain added to its main stat
u        = A[source] / threshold × uniquePercent / 100
```

A is a single source snapshot. Unique bonuses never feed back into the source.
For HP, ATK or DEF, the unique gain is B[target] × u.

These are **model assumptions awaiting an in-game check**: stat bonuses are
base-relative, unique scaling is continuous rather than whole-threshold steps,
and the unique reads after the main bonus. The official announcement states
that unique effects are proportional to stats, but does not settle rounding or
execution order. The previous document's 2,700 ATK → 1.8 % damage example also
used continuous scaling; it was not an in-game measurement. No claim of verified
battle arithmetic is made. SWCalc remains the calculation authority and states
no relic-specific rule at the time of this change.

A source uses the imported personal sheet and this candidate's main bonus.
Leaders, towers, guild flags, team set effects, buffs, passives and other battle
conditions are not invented. The sheet's existing Intangible and team-set
limitations therefore apply here too.

### 11.3 Put each gain on the same scale

```
statPoints(s, gain) = 100 × weight[s] × gain / B[s]
score              = mainPoints + uniquePoints
```

Points are weighted percentage points of base stats, not a percentage of a
finished relic, a success probability or a predicted win rate. They need not
lie between zero and 100. Normalising priorities makes them comparable without
rewarding one monster simply for having more total rune investment.

Example: 100 % extra HP, 60 % extra DEF, no extra ATK; 250 display speed.
An HP +12 Nimble Timeless grants 15 % HP and 4 % DEF (2 % per 125 SPD):
9.375 main points + 1.500 unique points = **10.875**. A DEF +12 Nimble Primal
grants 15 % DEF and 4 % HP: 5.625 + 2.500 = **8.125**. The first wins on this
build; changing the runes can change the answer.

### 11.4 Indirect bonuses are declared value choices

`relicIndirectValue` states these choices once, beside the effect calculation:

| Unique grants | Equivalent gain | Priority |
| --- | --- | --- |
| DMG dealt | A[ATK] × u | ATK |
| DMG taken reduction | (2/3) × A[HP] × u / (1 − u) | HP |
| Recovery & Shield | (2/3) × A[HP] × u | HP |

The reduction equivalence follows survival arithmetic: taking 10 % less damage
buys 1 / 0.9 − 1 = 11.11 % more effective HP. The developer's requested 2/3
credit discounts that gain because HP may also contribute damage. This is not
a defense formula and does not require a second E.HP implementation.

Damage dealt uses ATK as its declared proxy. It does not know skill coefficients,
so HP- and DEF-scaling attackers and damage-independent supports may be misvalued.
Recovery & Shield uses a 2/3 HP proxy; it does not infer which monster heals,
whose HP a skill reads, or whether it produces shields. These judgements are
approximations, openly described in The Math, not game rules. Exact scoring
within the model does not imply exact battle performance.

Non-finite or negative contributions, and a reduction of 100 % or more, fail
loudly rather than being capped or silently removed from the ranking. Every
one of the sixteen property definitions has an effect path.

### 11.5 Saved choices and engraving capacity

A saved non-empty main or unique selection restricts candidates for that half.
Clearing either menu allows any option for that half; absence also imposes no
restriction. Neither consults the statistics default, and none is rewritten.
If no owned relic matches the selections, show `No recommendation` and say why.

Within those choices, highest score wins. A numerical tie keeps the relic already
worn; acquisition order settles the rest. The former 5 % replacement margin is
removed: any meaningful increase in the computed value may be recommended.
The only tolerance is 1e-10 score points to absorb floating-point arithmetic.

The import's **150 engraving limit** still gates new wearers. A full relic
remains available to a monster already wearing it. Recommendations do not reserve
places or queue monsters: they are independent answers, not a jointly feasible
account allocation. If every matching relic is full, show `No capacity`.
If no relics were imported, show an import instruction instead.

A blocked ideal counts the known current wearers receiving fewer points, including
wearers whose preferences no longer accept that relic. Missing or unruned wearers
cannot be compared and are not counted as worse. This count alone depends on the
rest of the roster; it never changes the recommendation.

Only level-40, non-Material monsters enter the plan. Existing eligibility and
engraving-count rules are unchanged. Every eligible monster remains reachable,
even when its build cannot be scored.

### 11.6 Display filters never enter the calculation

Compute each row from the monster, every owned relic and the imported counts.
Then apply search, element, type, storage and Hide if controls. Filtering changes
which rows are shown and never what a surviving row says. The same monster
computed alone receives the same recommendation and value as in the full roster.

### 11.7 What the table shows

Current relic shows every relic the export gives the monster. Recommended relic
names one candidate, or Same when it is already worn. Main value and Unique value
show the recommended candidate's weighted contributions in score points, to two
decimal places. Their sum is the score used by the ranking, before display
rounding. Each title names the actual bonus, source value, total score and the
first current relic's corresponding contribution. They do not display popularity.

Advice is Engrave, Replace, Keep, No capacity or No recommendation. Missing
information never masquerades as insufficient capacity. Reasons accompany only
capacity constraints or an unscorable row. No controls change their own geometry
or the table's fixed column measure when selected.

### 11.8 Verification

`verify:relic-monster-value` holds independent worked examples for priorities,
flat lines, grinds, sets, source interactions, all sixteen effects and the indirect
equivalences. `verify:relic-monster-plan` holds ties, small improvements,
preferences, imported capacity and independence from the roster. The Playwright
suite drives the interface with empty and populated imports. The Math contains
the same worked example and explicitly labels the model assumptions.