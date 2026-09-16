# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**Statistics layer revised:** September 12, 2026 — §11.2's curve, §11.3.2's
shrinkage, §11.4's weights, §11.5's capacity annotation and §11.5.2's margin
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
  *between* monsters cannot be describing the drop table — and it varies a great
  deal, as §11.3 measures. The synergy table asked the panel an account-wide
  question, which is exactly where the drop rate contaminates the answer.
- **A default is not a judgement.** It is a provisional value the user sees
  immediately and overwrites with one click, and §19.4 of
  `ARTIFACT-CANONICAL.md` guarantees their statement always wins. The
  "cannot be argued with" objection does not apply to a number whose whole
  purpose is to be argued with.
- **A user's statement is scored against; a default still is not.** This
  reverses the earlier "nothing is scored against it". Where the user has named
  the mains or the uniques they will accept, `relicSuitability` takes that
  statement as the answer for that term — a chosen option scores full credit, an
  unchosen one drops to `relicUsageCreditFloor` — and the fit engine ranks on it.
  A statement per copy is worth nothing if nothing reads it per copy, and the
  statement rides on `RelicAllocationSubject` rather than through `usageFor`,
  because the statistics are keyed per species and a statement is keyed per
  owned copy.

  The two halves stay independent: naming mains and saying nothing about uniques
  leaves the unique term reading `relicShrunkShares` exactly as before. Where the
  user has said nothing at all, nothing changes. The defaults still read raw
  shares and the fit still reads shrunk ones, and the two must not be merged —
  that would reintroduce §11.3's double count. The **synergy** term is untouched
  by a preference: it is a fact about how a main and a unique work together, not
  a preference about a monster.

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

**That promise costs nothing to keep, and an earlier draft claimed it cost the
floor.** The claim was that the bottom usage credit has to be `0.10` rather than
`0` because "a monster can only always have a best relic if no relic can ever
score zero". That is not true. `argmax` over a finite, non-empty list of relics
exists whatever the scores are, and §11.5.2's tie-break already decides which
one it names — and the synergy term has a floor of its own, so the fit could
never have reached zero even with both usage terms at nothing. The floor is a
**model assumption**, and §11.2 now argues for it as one.

**The one exception is capacity, and it is the game's exception, not JASWA's.**
An account can own relics, own monsters, and still have monsters the plan can
put nothing on, because every relic that would reach them is already carrying
its full 150. That row reads `No capacity` — a real state of the account, not a
missing answer.

### 11.2 Usage is one curve, measured against the monster's own leading choice

The game's **Relic Engraving Statistics** panel reports, for one monster type,
how often each main property and each unique property appears on it across the
player base. Let `p` be the share of that monster's engravings carrying the
property being judged, and `p*` the share of that monster's *most*-engraved
option on the same half. Then

```
credit = 0.10 + 0.90 · (p / p*) ^ 2
```

so the monster's own leading choice reads `1.00` by construction and everything
else reads how far short of it the population fell.

| `p / p*` | 1.00 | 0.80 | 0.60 | 0.50 | 0.40 | 0.20 | 0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Credit | 1.00 | 0.68 | 0.42 | 0.33 | 0.24 | 0.14 | 0.10 |

**One function serves both halves, and that is the point of the ratio.** Three
values compete for a main property and sixteen for a unique, so a fixed cut that
is a real bar on one half is a low bar on the other. The version this replaced
answered that with two threshold pairs, the unique's being the main's halved —
`ARTIFACT-CANONICAL.md` §19.3's reasoning, correctly applied. A ratio normalises
the difference away instead: the leader reads `1.00` on either half whatever the
vocabulary size, so the halving stops being an assertion and becomes arithmetic.

**The floor is a model assumption and is stated as one.** A profile almost nobody
engraves on this monster is evidence that it is the *wrong* profile, not a
slightly less popular right one — but "worth little" and "worth nothing" are
different claims, and the second is not one the data supports. The floor is also
what keeps the strength index meaningful on a monster whose players reject
everything the account owns: without it every relic there would score `0.50·Y`
and the page would answer with its oldest relic rather than its best. §11.1
records the worse argument this replaced.

**The exponent is what keeps the bottom punitive.** A straight line would hand
0.28 to a property chosen a fifth as often as the leader; the square hands it
0.14. That is the same judgement the three steps encoded, expressed as a slope
rather than as a cliff.

#### 11.2.1 Why this replaced three hard steps

The steps were `1.00 / 0.50 / 0.10` at fixed shares — 40 % and 20 % for a main,
halved for a unique. Two things were wrong with them.

**A tenth of a percentage point could be worth two synergy bands.** A unique
share crossing 20.0 % moved its credit from 0.50 to 1.00, which at the weights
of the time was worth `0.35 × 0.50 = 0.175` of fit — exactly what separates
Neutral from Exceptional. That is not a defensible exchange rate for a rounding.
The old defence was that only **8.3 %** of main shares and **4.0 %** of unique
shares in the dataset have a 95 % confidence interval straddling a cut, which is
true and answers a different objection: the problem is not only that the
boundary is uncertain, it is that 39.99 % and 20.00 % were treated identically
while 39.99 % and 40.00 % were treated as different in kind.

**And the case the steps were defended on is one they get wrong.** The argument
against a continuous `min(1, p / 0.40)` was that every monster in the dataset has
a main property above 40 %, so the ramp awards 1.00 to the leading main
everywhere and cannot separate HP at 52 % from ATK at 39 % — scoring them 1.00
and 0.98, where the steps score 1.00 and 0.50. The first half of that is right
and remains the reason no *fixed-threshold* ramp will do. The second half only
works because 39 % happens to fall below the cut. On the real monster nearest
that description the two shares are **50.7 % and 40.2 %**, and the steps score
**both 1.00**, because both clear 40 %. The curve above reads 1.00 and 0.62, and
goes on separating them wherever they sit.

**The exponent is calibrated rather than chosen.** Across all 1,017 captured
panels, `2` is the exponent that keeps the continuous credit closest to the step
credits it replaces — RMSE 0.081, against 0.138 at `1` and 0.088 at `3`. The
change is continuity, deliberately not a change of policy.

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

**The unique half is a far weaker signal, and it is now measured rather than
merely conceded.** Nimble Primal leads on **927 of the 1,017** captured types,
holding 34.9 % of all engravings against a 6.25 % uniform share, while the other
fifteen sit between 2.7 % and 8.7 %.

Decomposing the variance of the credit each property earns, across every panel,
into the part explained by *which property it is* and the part explained by
*which monster it is on*:

| Term | Explained by the property | Explained by the monster |
| --- | ---: | ---: |
| Main property | 37.1 % | **62.9 %** |
| Unique property | **81.7 %** | 18.3 % |

Under the three steps this was starker still: the mean number of uniques
reaching the top tier on a monster was **0.88**, and on 855 of the 1,017 panels
the single one that did was Nimble Primal. The term was close to an indicator
for "is this Nimble Primal".

**That is a double count, and it is why the weight moved.** The synergy table
already rates Nimble Primal Exceptional on an HP main and Strong on the other
two. The same global preference was being paid for twice — once as expert
judgement, once as population habit — and the fit had no term that could tell
them apart. §11.4 records what the weights became and why the weight went to
synergy rather than to the main property.

**A lift over the global share was considered, tested, and refused.** Dividing a
monster's share by that property's global share is the statistically cleanest
separation of choice from popularity, and it does remove the double count
exactly. It was refused on what it then recommends. Run over the dataset, lift
ranks `Hearty Timeless` second on monster 10333 at **0.97×** — a property that
monster's players choose *less* often than average — because everything else
there is rarer still. Lift measures what is distinctive about a monster, and a
page asked what is good for the monster cannot answer with what is peculiar to
it. The diagnosis behind the proposal is right and is acted on in §11.4; this
particular cure is not.

**A captured panel is used, whatever its size.** `relic-monster-statistics.ts`
reports `missing` only where the dataset has never captured the type.

#### 11.3.1 A monster with no panel is judged against the population, not against synergy

**The obvious fallback is wrong, and the dataset says so plainly.** Give the two
usage terms the synergy band's own credit and `F` reduces to `Y` — so an
unmeasured monster reaches `F = 1.00` on any Exceptional pair, the ceiling of
the measured scale. Measured, that inverts the page:

| The same `+15` ATK / Sharp Conquest relic | Fit | Score |
| --- | ---: | ---: |
| on Beth, whose players put ATK main on it 69 % of the time | 0.877 | 0.877 |
| on a monster with no panel at all | **1.000** | **1.000** |

**Evidence made the score go down.** A measured monster has to earn both usage
terms from its own panel, while an unmeasured one gets them for free — so the
monsters JASWA knew least about were the ones it rated highest, and the relics
it named for them were chosen on a fit it had not measured. (The figures are the
current model's; the inversion was the same shape under the one this replaced,
at 0.825 against 1.000.)

**The fix is a prior, and a prior is what the population already is.** With no
monster-specific evidence, the honest expectation for a property's share is what
that property earns across every captured panel — on the current capture, mains
of HP 54.5 %, ATK 35.1 %, DEF 10.4 %, and uniques led by Nimble Primal at 38.9 %
against a 6.25 % uniform share. The same `+15` ATK/Sharp Conquest relic then
reads **0.669 on an unmeasured monster against 0.877 on Beth**, which is the
right order.

**The prior is a prior over *shares*, and it used to be a prior over credits.**
That change is what let the fallback stop being a second model; §11.3.2 is where
it goes.

**Per property, and computed rather than written down.** "Expect an average
main" and "expect an average *DEF* main" are different claims and only the second
is true: DEF leads on 49 of 1,017 captured types, which is why its prior share is
a tenth and HP's is over a half. `relicPopulationShares` derives every figure
from the dataset on first use, so a capture session moves them and no constant
can go stale. The numbers above are illustrative of the current capture, not a
specification.

**What this does to the ranking was stated wrongly here, and the correction
matters.** The earlier text said that "ranking within one unmeasured monster
still reduces to strength and synergy, because the two prior terms are constants
there". They are not. They are constant *per property*, and the relics competing
for one unmeasured monster carry **different** properties — which is the whole
reason the prior is per property rather than one number. On the current capture
the two prior terms can differ by

```
0.30 · (credit(HP main) − credit(DEF main))  +  0.20 · (credit(Nimble Primal) − credit(a rare unique))
```

which is a wide spread on a fit that runs from 0.10 to 1.00, and far more than
one synergy band is worth. So the honest statement is the opposite of the one
that stood here:

> **On a monster with no panel, JASWA ranks relics substantially by the global
> metagame** — it takes what the player base engraves on the average monster as
> its expectation for this one. Strength and synergy decide the rest.

That is a defensible thing to do and it is not what the page said it was doing.

**This deliberately uses the global level §5.2 distrusts**, and the distrust is
not withdrawn: for a monster with a large panel JASWA reads that monster's own
distribution and the prior barely enters. For a monster without one there is
nothing else, and a labelled prior beats a flat guess, a synergy ceiling, or no
answer at all. The row says which it got — `No statistics; using averages.`

#### 11.3.2 Sample size is weighed, and it was first gated on and then ignored

**An earlier version refused any panel under 100 observations.** The arithmetic
behind it was sound — a share carries a standard error of `√(p(1−p)/n)`, so at
`n = 100` a share on the then-40 % boundary has a 95 % interval of about
±9.6 points, wide enough to span two of the tiers of the day. The rule was still
wrong, and **Camules is the case that showed it**:

| Camules, 88 engravings | Share | Distance from the boundary of the day |
| --- | ---: | --- |
| HP | 52.5 % | 2.4 standard errors clear of 40 % |
| ATK | 38.6 % | 0.3 — genuinely uncertain |
| DEF | 8.9 % | not in doubt |

**Reliability is a property of a cell, not of a panel.** Two of those three
are decided and the gate threw away all three because the middle one is close.
And the game shows the player exactly those percentages with no caveat, so a
page answering "no statistics" about a monster whose panel is open on the next
screen is reporting on itself rather than on the game.

**`ENGRAVING-STATISTICS.md` §5 already owns this question**: an empty panel is
not a capture, and anything else is. That rule is binding, it is what
`artifact-preferences.ts` follows, and a second competing rule here made the two
pages disagree about one dataset. It is gone.

**But showing the sample size solved the reader's problem and left the model's
untouched**, and for a while that is all this section did. Every Recc. main stat
and Recc. unique prop. cell's title ends with the number of engravings its
percentages were drawn from, because §1 of that document is right that a
percentage discards the sample size. What it did not do was reach the judgement:
30 % of 30 observations and 30 % of 60,000 produced **exactly the same credit**,
and a page that makes the recommendation itself cannot hand the reader a number
and expect them to correct it afterwards.

**Every panel is now weighed against the population by its own size.** For each
property,

```
p̂(x | m) = (count(x, m) + λ · p₀(x)) / (n(m) + λ)
```

with `p₀` the population share from §11.3.1 and `λ = 100`. A large panel moves
almost not at all; a thin one is pulled toward what the average monster does; no
panel is refused for its size.

**λ is the sample size the abandoned gate named, and that is not a coincidence.**
The gate was right that a panel of about a hundred engravings is roughly as
informative as knowing nothing in particular about the monster — a share on the
old 40 % cut carries a 95 % interval of ±9.6 points there. It was wrong only in
what it did about it. Refusing the panel throws away the cells that panel
decides; weighing it half against the population keeps them and moves the
undecided ones toward the average. Camules' 88 engravings read HP 52.5 %, and
come out at **53.2 %**; a panel of 69,590 does not move at all.

**The unmeasured monster is now `n = 0` and needs no rule of its own.** That is
the real prize, and it is why §11.3.1's prior had to become a prior over shares
rather than over credits: shares compose with counts and credits do not. A
separate branch for "no panel" is a second model, and two models disagree
eventually — §11.3.1 records the disagreement the old pair produced. There is one
path through `relicSuitability` now, and the fallback is the end of it rather
than a fork in it.

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

F(m, r) = 0.30·M + 0.20·U + 0.50·Y
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

**`F` runs from 0.10 to 1.00.** All three terms bottom out at 0.10 and all three
top out at 1, so the fit's range is exactly the floor to one.

**Main keeps its 0.30 although it is the sharpest signal, and that is
considered.** The synergy table is *indexed by* main property, so a main already
speaks twice — once through `M` and once through `Y`. Weighting it 0.30 rather
than a third keeps the two mentions roughly balanced. The consequence is that a
wrong main is punished twice, through both terms; that is the intended behaviour
and not a bug in the weights.

**The unique property's own weight fell from 0.35 to 0.20, and §11.3's
decomposition is why.** 81.7 % of that term's variation is about which property
it is rather than which monster it is on, and the part that is about the game
rather than the monster is already in `Y`. A term cannot be paid twice for one
fact.

#### 11.4.1 Why the weight went to synergy and not to the main property

The obvious destination is wrong, and this is the part measurement settled
rather than argument. `M` is the empirical term with real monster-specific
content — 62.9 % of its variation is about the monster — so moving the weight
there looks like following the evidence. It is not, because the evidence is
about *inference* and the weights are about *value*. Once `U` is discounted, the
synergy table is the **only** term that judges the unique property at all, and a
relic's unique property is half of what it does. Taking weight off `U` and
putting it on `M` leaves that half nearly unrepresented and lets a perfect main
carry a useless pair.

Measured over random relic pools across all 1,017 panels, by the share of
recommendations whose named relic carries a Weak or Poor pair:

| Weights `M / U / Y` | Weak or Poor pairs recommended | Exceptional or Strong |
| --- | ---: | ---: |
| 0.30 / 0.35 / 0.35 — as it stood | 15.4 % | 60.3 % |
| 0.50 / 0.15 / 0.35 — weight to main | **25.4 %** | 48.0 % |
| 0.35 / 0.20 / 0.45 | 14.6 % | 57.2 % |
| **0.30 / 0.20 / 0.50 — weight to synergy** | **10.0 %** | **61.1 %** |

The direction that follows the information content makes the page visibly worse.
The direction that follows what each term is *for* makes it better.

#### 11.4.2 The case that settled multiplication

An additive `0.50·S + 0.30·F + 0.20·Y` was proposed first and abandoned on a
case it decides wrongly. **A `+15` relic banks 0.50 from its level alone,
whatever pair it carries** — over half of a perfect relic's score for a profile
the monster has no use for.

Take an ordinary ATK monster, around 2,700 ATK and 900 DEF, and two relics:

Take an ordinary ATK monster whose players engrave ATK main 55 % of the time and
DEF 15 %, and Sharp Conquest 35 % against Solid Conquest 20 %, and two relics:

| | Relic A | Relic B |
| --- | --- | --- |
| Main | ATK | DEF |
| Unique | Sharp Conquest — DMG dealt per ATK | Solid Conquest — DMG dealt per DEF |
| Level | `+6` | `+15` |
| `S` | 0.417 | 1.000 |
| Synergy | Exceptional | Neutral |
| `F` | 1.000 | 0.379 |

A is the relic that feeds the stat the monster builds. B is fully levelled and
points most of its size at a stat the build is not about.

```
additive        A: 0.50(0.417) + 0.30(1.000) + 0.20(1.00) = 0.708
                B: 0.50(1.000) + 0.30(0.379) + 0.20(0.50) = 0.714   → B wins

multiplicative  A: 0.417 × 1.000 = 0.417
                B: 1.000 × 0.379 = 0.379                            → A wins
```

**The additive form recommends B, and B is the wrong answer.** An 18 % DEF main
on a pure attacker is a large number pointed at nothing; addition lets that
number buy a win because it treats size and relevance as interchangeable.

**The two forms disagree in a window, and the panel above is stated to sit in
it.** That is not a weakness of the demonstration: a contrast between two
decision rules can only be shown where they decide differently, and
`verify:relic-monster-plan` re-runs this exact case so the additive model cannot
return without the check failing.

**Multiplication still respects a finished relic, which was the reason
addition was attractive.** Break-even against that same mediocre `+15` sits
between `+3` and `+6`: a perfectly suited `+3` relic scores 0.292 and loses to
it, and by `+6` the suited relic takes over at 0.417. An almost undeveloped
"perfect" relic does not automatically outrank a relic that is actually
delivering — it has to be levelled far enough to mean something first.

### 11.5 The engraving limit is a gate, not a queue

A rune or an artifact belongs to one monster, so recommending one is a private
matter between that monster and that piece of equipment. **A relic is shared, and
shared a finite number of times**: once 150 monsters carry it the game refuses
the next engraving until it is unengraved from one of them.

**Every monster is nevertheless told its own best relic.** The gate is the
engraving count the import actually carries, so a relic is withheld only when
the game would refuse the engraving *today* — never because other monsters also
want it. Then, and only then, the row falls to the monster's next best and says
why — and, where the account is wearing that relic on monsters it suits less
well, says how many of them (§11.5.1).

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

The exact alternative is on record too. Maximising `Σ Score(m, r)·x(m,r)` subject
to one relic per monster and 150 monsters per relic is a maximum-weight bipartite
b-matching, it is solvable exactly by min-cost flow rather than greedily, and at
this size it is cheap. Nothing here claims otherwise. What is claimed is that its
output answers a different question — *what should the account look like* — and
that the two costs above are what buying that answer costs.

**What the gate must not do is defend the account's history, and for a while it
did.** Reading today's counts as a hard constraint optimises inside the existing
distribution rather than over the account. A relic full of 150 monsters that fit
it badly stayed full; the monster that would have used it best was routed away
and told only that the relic was full. That is path dependence — poor old
engraving decisions protected from better new ones — and the row's wording made
it worse by naming a dead end instead of a move.

**So a blocked row now counts the wearers it would beat.** Where the ideal relic
is full, the plan scores every monster currently wearing it on that same relic
and reports how many fit it worse than this one does. The row then reads
`Best one is full; 37 wear it worse.` instead of `Best one is at its 150 limit.`,
and the action — unengrave one of them — is visible from the row.

The plan still does not perform that move. Reshuffling the roster is the
reserving pass, with all of its costs; counting is not. **That count is the one
figure on the row drawn from the rest of the roster**, which is why §11.6's
guarantee is stated over the verdict, the fit and the score, and why
`displaceableWearers` is named apart from them in the type. The verifier holds
the three and checks that no fourth field has quietly joined the annotation.

#### 11.5.2 A recommendation is never churn

**Ties are broken deterministically, and a great many relics tie.** Five synergy
bands and a curve that saturates at the monster's leading choice put relics on
identical scores often. `rankRelicsForMonster` orders by score, then by **what
the monster already wears**, then by the relic's acquisition order (`rid`, the
same rule §8.1 uses to choose between equal copies).

**The middle clause is not decoration.** Ordering equal scores on `rid` alone is
deterministic and still wrong here: it can name a relic scoring exactly what the
incumbent scores, and the row then asks for an engraving that buys nothing at
all. Same value, more work, and a relic slot spent to get there.

**Near-ties are the same problem one decimal along.** A relic beating the
incumbent by a thousandth is separated from it by a rounding in a population
share, a hand-set synergy band, or §11.2's exponent — none of which is evidence
that moving the engraving would help. So a relic must beat what the monster wears
by **5 %** before the page asks for the change; below that the row reads `Keep`
and says `Next best gains under 5 %.`

Five per cent is smaller than one synergy band at any level, so a real upgrade is
never suppressed. Measured over random relic pools across every captured panel it
retires **1.1 %** of the changes the page would otherwise ask for — the size of a
churn correction rather than a policy.

**`npm run verify:relic-monster-plan` holds the pass to its promises:** exactly
one answer per monster, never a relic the game would refuse today, a row that is
identical whether it is computed alone or beside the whole roster, and an
engraving asked for only when it buys something.

### 11.5.3 Material monsters are outside the plan

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
the level filter and the two **Hide if** controls change which finished rows the
user is looking at, and can never change what any of them says.

The last two are the ones worth naming, because they read the finished row.
`Already optimal` drops every row whose verdict is `Keep` — precisely the
monsters already wearing the relic this page would give them. On an account
whose relics are mostly placed that is the commonest verdict by a wide margin,
so the control turns the table into a worklist. `Already engraved` drops every
monster carrying a relic at all, whichever relic it is and whatever the page
thinks of it: engraving a bare monster costs only the relic's own places, while
moving an engraved one means undoing an engraving first, so this leaves the
monsters that can be acted on today. Note that the two are not nested —
`Already engraved` also hides the `Replace` rows, which `Already optimal` keeps.
Both remove rows *after* the verdict is decided and never feed back into it.

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
| Recommended relic | The relic to engrave, or `Same` where that is what it already wears |
| Recc. main stat | The recommended relic's main property, as a share of this monster's most-engraved main |
| Recc. unique prop. | The same reading for its unique property |
| Advice | The verdict, and a reason line only where there is one to give |

**Three headings say `Recommended` or `Recc.`, and that repetition is the
point.** The two percentage columns rate the relic the page is proposing, not
the one beside them in **Current relic**; unqualified, `Main stat` sat two
columns from `Current relic` and read as though it described it. The subject of
a column belongs in its heading, where a reader meets it, and not only in the
cell titles a reader has to hover to find.

**The column widths are measured, not chosen by eye.** What a reader sees
between two columns is the padding plus whatever width each column carries past
its own content, and the alignment decides which end that slack lands on. A
left-aligned column followed by a right-aligned one contributes *both* columns'
slack to the seam between them — `Recommended relic` into `Recc. main stat` was
a 207px hole on that account alone. A right-aligned column followed by a
left-aligned one contributes none and shuts to bare padding, which is what
happened at `LVL` and again at `Advice`, at 24px.

So the widths are solved rather than chosen. Each column gets its content plus
whatever slack the seam beside it needs to match the rest, and the two seams
that would otherwise close up are opened with a `gutter` (`ColumnGutter` in
`table-layouts.ts`). Every seam then measures 82–100px, against 27–108px before,
and the row fills its width with no spare band at either end.

**Two seams sit at the top of that range and cannot come down.** A column can
never be narrower than its own heading, and `Recc. main stat` and `Recc. unique
prop.` are both far wider than the percentage under them. Any width a heading
forces past its content becomes seam, so shortening those two headings is the
only thing that would even them out further — which is the trade this table
made knowingly, because a reader who cannot tell which relic a percentage rates
is worse off than one looking at a seam 14px wider than its neighbours.

Changing a heading on this table changes its column's minimum width, so the
widths are checked by measuring the rendered rows again, not by adjusting one
percentage until the screenshot looks right.

**The two percentage columns are readings, not the score.** `Score` and `Fit`
stood here first and were replaced, because a composite is the one number on a
table nobody can check. Each of these can be checked against the game's own
Statistics panel in one glance: the leading option on a monster always reads
100 %, and everything else reads its share of that.

**They are deliberately the *raw* ratio, and the credit behind the judgement is
not.** §11.2 shrinks the same share toward the population by the panel's own size
before curving it, and a shrunk share cannot be checked against anything on
screen. The two are monotonically related and answer the same question; only one
of them is arguable, and a column the reader cannot check is a column the reader
must trust. The sample size in the cell's title is what says how far the two have
been pulled apart.

This is a smaller gap than it was. The columns once showed a ratio while the
model used three fixed steps, so a main at 39 % and one at 21 % on the same
monster read differently in the column and identically in the judgement. Both are
now the same continuous shape.

They rate the relic in **Recommended relic**, not the one in **Current relic**,
so the columns describe what the page is proposing. The incumbent's figures are
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

**The reason line is usually empty, and that is the point.** Three facts earn
one, and each is one the row cannot otherwise show.

**Capacity**, because it is the sole reason a row shows anything but the
monster's best relic and nothing else on the page reveals that. Where the account
wears that relic on monsters it suits less well, the line counts them
(§11.5.1) — `Best one is full; 37 wear it worse.` — because the count is what
turns a dead end into a move.

**Retention**, because a `Keep` that is not the monster's best relic looks
identical to one that is. `Next best gains under 5 %.` says the page is not
claiming this is the best relic, only that the difference is too small to spend
an engraving on (§11.5.2).

And **the state of the statistics**, because a fit assembled from population
averages is a different claim from one measured on this monster and the columns
beside it cannot tell them apart.

The usage credits deliberately get no line. A row reading "Both halves are
favoured here" beside two columns already reading 100 % is one fact written
twice, and the sentence is the vaguer of the two. The shares behind them live in
those cells' own titles, where they explain the numbers instead of competing with
them.

### 11.8 What this model does not identify

Three of the model's limits are not uncertainty to be narrowed by more captures.
They are things the available evidence cannot say at all, and a page that makes
the recommendation itself owes the reader the list.

**The panel reports two marginals, never the pair.** It gives
`p(main | monster)` and `p(unique | monster)` as separate distributions — the
capture holds exactly those two count lists and nothing that crosses them. So `M`
and `U` are each a marginal preference, and **the population's preference for the
*combination* is not observed**. A monster can favour HP mains and favour Sharp
Conquest without its players ever pairing the two, and the model would still
assemble that relic out of two good halves. `Y` is what stands in the gap,
because it judges the pair — but it is an account-wide expert judgement and not a
measurement of this monster. Nothing short of a joint count fixes it, and the
game does not publish one.

**`relicStrengthIndex` is a development proxy asked to do comparison work.** §7.2
defines it as how far a relic has come toward its own `+15`, with the main
property and the unique-property threshold as equal halves, and that is the right
shape for the question §8 asks — is this relic worth a stone? Here it is asked
something stronger: to put a finished Recovery & Shield relic and a finished
`DMG dealt` relic on the same scale so suitability can do the rest. Both read
`1.000`. That is a stated premise, not a measurement, and it is the model's
largest remaining approximation.

**The effect itself is computable and is not computed.** JASWA holds each
monster's real stats, so Sharp Conquest at `+6` on 2,700 ATK is exactly
`+1.8 %` damage dealt. Scoring that directly would be more principled than
scoring the population's habits, and it is not what this page does: it would need
a role model per monster to weigh `+1.8 % DMG` against `+9 % ATK` against
`MAX HP +2 % per 125 SPD`, and §7.2 records that JASWA does not model relic value
per monster. The usage statistics are a proxy for that judgement; §11.3 bounds
how far the proxy can be trusted, and this is the ceiling above it.
