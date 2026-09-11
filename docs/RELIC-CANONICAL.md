# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page
**Settled:** September 11, 2026
**Derived data:** `app/data/relic-synergy.json`, written by
`scripts/build-relic-synergy.mjs`
**Read by:** `app/lib/relics.ts`, `app/lib/relic-properties.ts`,
`app/lib/relic-synergy.ts`, `app/lib/relic-advice.ts`,
`app/components/relic-list.tsx`
**Enforced by:** `npm run verify:relic-synergy`

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
`relicMainPercent` is the denominator of the upside in §7.

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

## 7. The outlook, and the one number JASWA had to estimate

**How often a power-up succeeds is estimated from the account's own relics.**
The game publishes no table and JASWA will not invent one. It does not have to:
every relic is a complete record of its own attempts — its level is the number
that succeeded, and the durability it has spent is the number that failed.

The estimate is the mean of a Beta posterior on a uniform prior,
`(successes + 1) / (successes + failures + 2)`, so an account with no history
reads an even chance rather than dividing by zero, and a single attempt does not
move the answer to certainty. The page states the figure and the sample size it
rests on, because a projection whose basis is invisible is a projection nobody
can argue with.

**It pools every level, which the game almost certainly does not.** A relic near
the ceiling is surely harder to push than one at `+0`. The pooled rate is the
honest simplification available from the evidence at hand; the per-level curve
the game shows on its own button would replace it, and would change only
`relicPowerUpChance` and nothing that reads it.

**How many levels are left in a relic.** A power-up either raises the level or
spends a durability, so the number of successes still in a relic is the number
of successes before its `durability`-th failure — a negative binomial. With at
most three failures and fifteen levels the tail sums directly, which keeps the
arithmetic exact and visible:

```
P(gain ≥ k)  = 1 − Σ_{j<k} C(j + d − 1, j) · q^j · (1 − q)^d
E[gain]      = Σ_{k=1..15−level} P(gain ≥ k)
```

**Upside is a ratio, not a count of levels.** A relic's strength scales with
`3 + level`, so three levels double a fresh relic and add a twentieth to a
nearly finished one. The table states the expected finishing level; the verdict
uses `E[gain] / (3 + level)`, which is what makes `+0` and `+12` comparable.

## 8. The verdict

Three verdicts — **Power up**, **Keep**, **Sell** — decided in this order. The
order is the rule; each step only sees what the steps above let through.

1. **A weak or poor fit sells.** No amount of room left makes a relic whose
   halves pull apart worth power-up stones, and this verdict has to reach both
   copies of a poor pair rather than only the second one.
2. **A second copy of the same pair sells**, unless it can still overtake the
   first. Two identical relics cannot both be used. The challenger is kept and
   powered up only when
   `P(final level > the kept copy's present level) ≥ the risk bar`.
   The comparison is against the incumbent's *present* level, not its
   projection: the question being asked is whether to spend stones on the
   challenger at all.
   The copy to keep is the highest level, then the one with the most attempts
   left, then the one held longest — all facts about the relic, so sorting the
   table cannot change which copy is the incumbent.
3. **An unjudged or neutral fit keeps.** Neutral is explicitly not a sell: it is
   a relic that suits fewer monsters, and the best copy of one is still worth
   holding.
4. **A good fit with no attempts left, or already at `+15`, keeps.**
5. **A good fit with upside above the risk bar powers up.** Only a relic that
   already fits well is ever sent to the bench — the rule the durability
   mechanic makes expensive to break.
6. **Anything else keeps.**

## 9. The risk slider

One appetite, read two ways, set once from 1 (cautious) to 5 (bold):

| Risk | Upside a relic must still hold (§8.5) | Chance a second copy must have (§8.2) |
| ---: | ---: | ---: |
| 1 | 40 % | 60 % |
| 2 | 28 % | 45 % |
| 3 | 18 % | 30 % |
| 4 | 10 % | 20 % |
| 5 | 4 % | 10 % |

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
