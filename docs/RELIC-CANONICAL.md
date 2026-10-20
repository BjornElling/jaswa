# Relics — what they are, and how JASWA judges them

**Status:** Binding project rules for the Relics page and the *Use for mons* plan
**Reviewed:** October 20, 2026
**Code:** `app/lib/relics.ts` (reader, counts), `app/lib/relic-properties.ts`
(vocabulary and game constants), `app/lib/relic-power-up-model.ts` (every
probability), `app/lib/relic-synergy.ts` (the 48 cells), `app/lib/relic-advice.ts`
(the verdict), `app/lib/relic-grid.ts`, `app/lib/relic-monster-value.ts`,
`app/lib/relic-monster-fit.ts`, `app/lib/relic-monster-grid.ts`; the stat sheet
`app/lib/monster-stats.ts`, the main-stat model `app/lib/main-stat-model.ts`,
eligibility `app/lib/monster-engrave-eligibility.ts`; the pages
`app/components/relic-list.tsx` and `app/components/relic-monster-list.tsx`
**Checks:** `verify:relic-synergy`, `verify:relic-maths`,
`verify:relic-monster-value`, `verify:relic-monster-plan`

A rune or an artifact belongs to one monster. **A relic is engraved on up to 150
monsters at once**, so a good relic is a good *account*, a duplicate is worth
little until the first copy runs out of places, and a power-up is neither cheap
nor repeatable. The Relics page is therefore a verdict — power up, keep or sell —
and *Use for mons* a separate question: which owned relic suits each monster's
own build (§11).

Every game rule names its evidence (§3); a premise JASWA adopts without one is
marked **modelled**.

---

## 1. Scope

- Sections 2–4 are the game: the export, the rules, the vocabulary.
- Sections 5–9 are the account-wide verdict.
- Section 10 is import parity; section 11 the per-monster plan.

## 2. What the export carries

One record per relic in `relics`, and the same records again beneath every
monster carrying it. `completeEngravedCollections` merges and de-duplicates them
on `rid`, as for artifacts.

```json
{ "rid": 2167432, "type": 14, "upgrade_curr": 9, "durability": 2, "locked": 0,
  "pri_effect": [100, 12], "sec_effect": [14, 150, 2], "source": 10002 }
```

| Field | Meaning |
| --- | --- |
| `rid` | identity and acquisition order (`obtainedOrder`) |
| `type` | the unique property, `1`–`16` (§4) |
| `upgrade_curr` | power-up level, `0`–`15` |
| `durability` | failed attempts still affordable, `0`–`3` |
| `pri_effect` | `[100 \| 101 \| 102, percent]` — HP, ATK or DEF as a percentage (the artifact main codes) |
| `sec_effect` | `[type, threshold, percent]` — the unique property at this level |

- **No `occupied_id`.** A relic names no monster; engraving counts come from
  walking the roster (`relicEngravingCounts`). A relic on nobody is absent from
  that map, never a `0` mistaken for "unknown".
- **Relic Power-up Stones** are account inventory, not craft items:
  `inventory_info[item_master_type = 6, item_master_id = 19].item_quantity`
  (`relicPowerUpStoneCount`). A list without the record is an exact zero; an
  import without `inventory_info`, or with a malformed or duplicated record,
  is *unknown* and the page says so.

### 2.1 How a relic enters the stat sheet

The main percentage is added to the base-stat percentage bonus before the
sheet's single rounding step (`monster-stats.ts`). *Evidence: in-game capture of
Icaru #2 — 736 base DEF, sheet 3,114 without its DEF +12 % relic, 3,203 with it;
12 points of base account for all 89 DEF.* The unique property is a
start-of-battle effect and is never added to the sheet.

## 3. The game rules, and their evidence

| Rule | Value | Evidence |
| --- | --- | --- |
| A relic is one main (HP, ATK or DEF, a percentage) plus one unique property fixed at crafting; a power-up changes only the unique's value | — | Dev note 2026-04-08; v9.1.8 |
| Sixteen unique properties in six functional groups | 16 | Dev note 2026-04-08; ids §4 |
| One relic per monster | 1 | v9.1.8 ("One Relic can be engraved on a Monster"); the single slot on screen |
| Only a Lv. 40 monster takes a relic (`relicMinimumMonsterLevel`) | 40 | v9.1.8 |
| Monsters one relic may be engraved on at once (`relicEngravingLimit`) | **150** (100 until v9.3.0) | v9.1.8 (100); v9.3.0 ("increased from 100 to 150") |
| Power-up ceiling (`relicMaximumLevel`) | +15 | v9.1.8 |
| Durability: every relic starts at 3; a failure spends 1; at 0 no further attempt; the relic stays usable | 3 | v9.1.8; Dev note 2026-04-08 |
| A power-up spends **Relic Power-up Stones and Mana Stones**, at every level alike | — | v9.1.8 |
| Breakdown returns Relic Pieces and Power-up Stones, the stones scaling with level | — | Dev note 2026-04-08; v9.1.8 |
| Main property is `3 + level` % (`relicMainPercent`): 3 at +0, 18 at +15 | — | the account: every one of 294 relic records, levels 0–11 (export, 2026-10-20) |
| Unique percent is fixed: 1 % for Conquest and Resolute, 2 % for the rest (`relicUniquePercent`) | — | the account, all 294 records; the dev note's "+1 % per 2,500 ATK" |
| Unique thresholds by tier (§7.5) | — | in-game panel readings at +0/+3/+6/+9/+12/+15; the account at levels 5, 7, 8 and 11 confirms each tier holds for three levels |
| Power-up success rates (§7.4) | 100 % to +3, then 80 % … 10 % | Com2uS's launch table; **no text copy exists** — the dev note carries it as an image the news API strips; transcribed before 2026-09-11 and not re-checked since |
| A preset reads the relic engraved on the monster, never its own | — | v9.2.0 ("the Relic information currently engraved on the Monster will be reflected in the Preset") |
| Relics are engraved or removed from the battle preparation screen too | — | v9.3.0 |
| Relic Engraving Statistics panel | — | v9.2.8 (2026-07-29) |
| No relic in Dimension Arena (announced for November 2026) | — | Developer's Preview #6, 2026-10-02 |

Sources, all read through the Steam news API
(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2426960&count=300&maxlength=0`,
2026-10-19): **Dev note** — "[Info] 12th Anniversary Update Developer's Note",
2026-04-08, gid 1829528821303434; **v9.1.8**, 2026-04-13, gid 1829528821314708;
**v9.2.0**, 2026-04-29, gid 1831432155564095; **v9.2.8**, 2026-07-29, gid
1839676055882296; **v9.3.0**, 2026-08-28 (Europe: August 27, 09:45 CEST), gid
1842212951302056; **Developer's Preview #6**, 2026-10-02, gid 1845383656385392.
SWCalc states no relic rule (checked 2026-10-19).

### 3.1 The engraving limit

`relicEngravingLimit` (150) is the only place the number is written; the
tagline, the plan, the reasons and the verifier read it. It moved once, from
100 at launch to 150 in v9.3.0, so a launch-announcement figure is a statement
about a date — the power-up rates above all. Nothing in traffic can confirm it:
the property list, names, rates and limit are client-side (§4.3).

## 4. The sixteen unique properties

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

**The names are two rules.** The family is what the property grants — Conquest
damage dealt, Resolute damage taken, Valiant ATK, Timeless DEF, Primal MAX HP,
Restore recovery and shielding. The prefix is the stat it reads — Hearty MAX HP,
Sharp ATK, Solid DEF, Nimble SPD. So no two of the sixteen share a name. The
export states the family twice (`type` and `sec_effect[0]`); a record where they
disagree is rejected rather than resolved.

### 4.1 Why this order is the id order

The effects and their order come from the game's **Manage Relic → Select Unique
Property** panel, read off screen. The claim that panel order is `type` order
rests on:

1. **The account's own relic on screen and in the export.** Beth's relic reads
   `DMG dealt +1 % per 1500 ATK at the start of battle` at `+6`; its record is
   `{ type: 1, upgrade_curr: 6, pri_effect: [101, 9], sec_effect: [1, 1500, 1] }`.
2. **Three community-confirmed mappings land where this order puts them**:
   sw-forge's ids 6, 12 and 13.
3. **The announced shape**: 3 Conquest, 3 Resolute, 3 Valiant, 3 Timeless,
   3 Primal, 1 Restore — sixteen in six groups.
4. **The thresholds agree by source stat**: every relic carries exactly the
   threshold §7.5 gives for its level and the stat this mapping says it reads.
5. **The panel's ordering rule**: within a family the sources run ATK, SPD, DEF,
   MAX HP with the granted stat omitted.

### 4.2 The two mappings this table corrects

sw-forge lists ids 14 and 16 both as *Valiant*, which the naming rule forbids.
Panel order puts 14 at MAX HP per SPD (**Nimble Primal**) and 16 at Recovery &
Shield per MAX HP (**Hearty Restore**). Those two sw-forge entries were not
panel-confirmed.

### 4.3 The relic panel sends no traffic

A capture taken while the relic screens are open holds nothing about relics, so
the vocabulary cannot be collected the way `ENGRAVING-STATISTICS.md` collects the
statistics; reading it off screen is the only route.

---

## 5. Synergy is one table

How attractive is a main + unique pair as an **account-wide investment**? One
band answers it, judged from three inputs: the property's effect strength, the
natural fit of the main to the monsters that want that outcome (a main feeding
the source stat is evidence, not an automatic upgrade), and how broadly relevant
monsters want the finished profile. The table is an expert-informed judgement,
revised against a current specialist guide's matrix where its practical coverage
consistently contradicted a mechanical reading; §4, not the guide, owns the
names.

The **48 cells in `relic-synergy.ts`** are written down; nothing derives or
regenerates them, and each can be edited on its own line. `relicSynergy` throws
on a pair it does not hold. `verify:relic-synergy` checks only that the table is
whole: every property has all three mains, every value is a band, and no band
is unused.

| Band | Meaning |
| --- | --- |
| Exceptional | high effect, very broad use; primary stone target |
| Strong | clearly valuable, broad or exceptional for a substantial archetype |
| Neutral | useful, situational, or behind the best alternatives |
| Weak | plausible only for a narrow need |
| Poor | very rarely a rational use of stones |

### 5.1 The whole table

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

**How a band reads.** Exceptional two gold stars, Strong one gold star, Neutral
a hollow diamond, Weak one red cross, Poor two. Gold at the top two bands is the
`ARTIFACT-CANONICAL.md` §18 reasoning — there the grade *is* the invitation to
act; the red is the verdict vocabulary (`--state-bad`). Degree is the number of
marks, never a second shade, and the band's name is written beside them, so the
column reads the same without colour.

### 5.2 Why the table is not measured from the player base

The game's **Relic Engraving Statistics** could supply all 48 cells as
co-occurrence scores, and once did. It is the wrong measurement: relics are new,
an account engraves what it happened to craft, and so the panel mostly records
the drop table and crafting luck. A derived cell also cannot be argued with — a
wrong one has only a pipeline to re-run. The same panel *is* a legitimate
**per-monster starting value** in the overlay, because a distribution that
varies between monsters cannot be describing the monster-independent drop table;
that use, and its caveat, are in `ENGRAVING-STATISTICS.md` §10.

---

## 6. Level, durability and the difference between them

A `+4` with attempts left is unfinished; a `+4` with none is final. The table
separates the three states (`RelicLevelState` in `relic-grid.ts`):

| State | Meaning | Reads |
| --- | --- | --- |
| `open` | attempts left, below `+15` | full tone, no mark |
| `spent` | durability 0 | muted, barred-circle mark |
| `maxed` | at `+15` | muted, ceiling mark |

Durability is always three pips; spent ones stay as hollow rings.

## 7. Three recursions, exact

A power-up has two outcomes: success raises the level, failure spends a
durability. With `p(l)` the success rate at level `l`, everything follows.

### 7.0 One implementation

**Every probability the page states is computed in `relic-power-up-model.ts`
and nowhere else.** A verdict and the chance printed beside it must come from
the same arithmetic. `verify:relic-maths` fails if any `app/lib` file other than
the model and `relic-properties.ts` touches `relicPowerUpRates` outside an
import (subscripts, loops, `reduce`, aliases and spreads are all caught). The
verifier itself re-derives the results from independent closed forms and a
Monte Carlo of the game's loop, which is why the functions take the rate curve
as an argument. Two invalid inputs are refused outright: a target above `+15`,
and a rate curve that is not fifteen chances in `[0, 1]`.

### 7.1 `P(l, d)` — the chance of ever reaching a level

```
P(15, d) = 1
P(l, 0)  = 0                    for l < 15
P(l, d)  = p(l)·P(l + 1, d) + (1 − p(l))·P(l, d − 1)
```

`relicReachChance` runs it to any target (the same recursion with the target as
its ceiling). The closed form — a sum over multisets of at most `d − 1` failures,
including two on the same level — agrees with it to 3·10⁻¹⁶ over 200 uneven
random curves (`verify:relic-maths`).

### 7.2 `V(l, d)` — the strength it is expected to end with

```
V(15, d) = 1
V(l, 0)  = relicStrengthIndex(l, source)
V(l, d)  = p(l)·V(l + 1, d) + (1 − p(l))·V(l, d − 1)
```

`P` answers 0 for an excellent `+12` with no durability left; `V` measures its
realised strength. `relicStrengthIndex` weighs two halves equally: the main
(`(3 + l) / 18`) and the unique threshold efficiency (threshold at +15 / threshold
now). An ATK-, DEF- or HP-reading `+12` is 75 % of a finished relic; an SPD-reading
one about 81.7 %. The index normalises threshold efficiency; it does not model
any monster's integer breakpoints. `V` never falls when a level or an attempt is
added; the verifier holds it.

### 7.3 `D(l, d)` — where the relic lands

The same recursion carrying a distribution (`relicFinalLevelChances`):

```
D(15, d) = all mass on +15
D(l, 0)  = all mass on +l
D(l, d)  = p(l)·D(l + 1, d) + (1 − p(l))·D(l, d − 1)
```

`P` is its mass on `+15` and `V` its expected strength; the verifier holds all
three to each other. **The table prints the median** (`relicLanding().level`):
the level reached or beaten at least half the time, with that tail printed
beneath it. The mode (`likeliest`) is where a relic most often stalls, near the
start of the climb, and is a poor column; it and the mean are in the tooltip.

| Relic | Median | Mode | Expected levels gained |
| --- | --- | --- | ---: |
| `+0`, 3 durability | `+7` at 61 % | `+7` at 21 % | 7.2 |
| `+0`, 1 durability | `+5` at 56 % | `+4` at 24 % | 5.0 |
| `+9`, 2 durability | `+10` at 58 % | `+9` at 42 % | 0.9 |
| `+12`, 3 durability | `+12` | `+12` at 51 % | 0.65 |

### 7.4 `p(l)`, the game's rate table

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

`relicPowerUpRates`; `verify:relic-maths` fails if it stops matching. Provenance
is in §3. Three consequences run the page:

1. **Every relic is certain to `+3`, which is not free.** Those attempts cost no
   durability but cost the same Relic Power-up Stones and Mana as any other.
   On a pair the synergy gate rejected, a certain level is a certain waste.
2. **`+15` is a lottery.** A fresh relic with three durability reaches it about
   once in 11,500 tries, so no verdict turns on `P`.
3. **Stones buy far more on a low relic**: 7.2 expected levels from three
   durability at `+0`, 0.65 at `+12`. The *Likely end* column shows it.

### 7.5 The thresholds: what a power-up moves

The unique percent never changes (§3); **the threshold falls**, in six tiers of
three levels each (`relicThreshold`):

| Reads | `+0`–`+2` | `+3`–`+5` | `+6`–`+8` | `+9`–`+11` | `+12`–`+14` | `+15` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ATK or DEF | 2,500 | 2,000 | 1,500 | 1,000 | 750 | 500 |
| MAX HP | 45,000 | 36,000 | 27,000 | 18,000 | 13,500 | 9,000 |
| SPD | 300 | 250 | 200 | 150 | 125 | 100 |

MAX HP is exactly 18 × ATK/DEF at every tier. The importer holds every relic to
this table (§10), and the account's 294 records — intermediate levels 5, 7, 8
and 11 among them — all pass.

**The two halves do not grow together.** Over fifteen levels the main multiplies
by 6, an ATK-, DEF- or HP-reading unique by 5, an SPD-reading one by 3, so a
Nimble relic starts nearer its ceiling. `verify:relic-maths` checks that the
ordering every power-up verdict rests on — stones buy more on a lower relic —
holds at every weighting of the two halves from all-main to all-unique; the
verdicts themselves are decided at the equal weighting only.

## 8. The verdict

A relic's synergy band multiplies the strength its next attempt buys:

| Fit | Weight (`relicSynergyWeights`) |
| --- | ---: |
| Exceptional | × 4 |
| Strong | × 2 |
| Neutral | × 1 |
| Weak | × ½ |
| Poor | × ¼ |

```
investment score = 100 × weight × p(l) × [S(l + 1) − S(l)] / [S(1) − S(0)]
```

with `S = relicStrengthIndex` and the unit one ordinary (non-tier) level
(`relicOrdinaryLevelStrengthGain`). A success crossing into `+3`, `+6`, `+9`,
`+12` or `+15` also lowers the threshold and earns its measured multiple. It is
a **decision score, not a probability**; above 100 is a priority signal.

**The incumbent** of a relic is the best other same-pair copy at an equal or
higher level — highest level, then lower `rid`; equal copies leave the lower
`rid` as incumbent. **Modelled:** only that single best copy is considered.

The rules keep stable numbers, and are listed in the order `decide()` asks
them; rule 3 is asked before rule 2, and their conditions are disjoint:

- **Rule 1 — the synergy gate, first, of every relic.** The slider names the weakest fit
   the account holds (§9). A relic below it sells with `<Band> fit: below
   threshold.` (e.g. `Weak fit: below threshold.`), whatever its level,
   durability, duplicates or next attempt. Nothing outranks it: the gate asks
   whether the pair is worth owning, everything after asks whether it is worth
   stones.
- **Rule 3 — a relic that cannot be powered up** (at `+15` or durability 0):
   - with a full incumbent (rule 0 below): keeps, `Other copy is on 150.`;
   - with any other incumbent: sells, `No power-up; +<level> kept.`;
   - with none: keeps, `Cannot power up.`
- **Rule 2 — the duplicate gate**, beside an incumbent that is not full, and it does not
   read the slider. An incumbent at `+15` cannot be passed: sell, `Cannot beat
   +15.` Otherwise the chance to pass it, `P(l, d, h + 1)`, is compared with a
   threshold set by this relic's band (`relicOvertakeThresholds`); at or above
   it powers up, below it sells, both reading `Beat +<h>: <chance>`.

   | Fit | Passes at | A `+0`, 3-durability challenger tries against up to |
   | --- | ---: | --- |
   | Exceptional | 5 % | `+9` (10.7 %; a `+10` is 4.3 %) |
   | Strong | 15 % | `+8` (22.4 %; a `+9` is 10.7 %) |
   | Neutral | 30 % | `+7` (39.9 %; a `+8` is 22.4 %) |
   | Weak | 50 % | `+6` (61.3 %; a `+7` is 39.9 %) |
   | Poor | 70 % | `+5` (82.3 %; a `+6` is 61.3 %) |

   A climbed challenger reaches further; a spent one less far. Against a `+12`
   even a fresh challenger passes 0.36 % of the time. The gate is asked before
   the certain levels, so a `+0` beside a `+12` copy is not powered up on a
   guaranteed level it has no use for.
- **Rule 4 — certain levels power up**: below `+3` the attempt cannot fail, reading
   `Sure +1: 100%`.
- **Rule 5 — every other open relic** compares its investment score with the slider's
   threshold: at or above it powers up, below it keeps, reading `Next +1:
   <chance>`. This is the only rule the threshold decides.

**Rule 0, the capacity exception.** The duplicate rules rest on one copy
already covering more monsters than an account fields. A copy engraved on its
full `relicEngravingLimit` cannot take another monster at any level, so a weaker
duplicate is the only way to put that pair on more monsters: where the incumbent
is full, this relic is judged as if it had none (rules 4–5; rule 3 keeps it).
It is a capacity exception, not a strength one. Capacity is
`relicEngravingCounts` over the whole eligible roster.

The cell prints the game chance or status, never the internal score. A sale
ignores the stones a breakdown returns (§3) — **modelled** as a simplification.

## 9. The slider

One choice, `RelicInvestmentSelectivity`, sets both the score threshold and the
minimum synergy band; the two tables move together, or a stop would admit a band
and then refuse to spend on any of it.

| Stop | Name | Score threshold (`relicInvestmentThresholds`) | Weakest fit kept (`relicMinimumSynergyBands`) |
| ---: | --- | ---: | --- |
| 1 | Picky | 120 | Strong |
| 2 | Balanced | 80 | Neutral |
| 3 | Optimistic | 50 | Weak |
| 4 | Wishful thinking | 35 | Poor |
| 5 | Burn it all | 20 | Poor |

- **The slider opens on stop 3, *Optimistic***
  (`defaultRelicInvestmentSelectivity`); Reset returns it there. *Balanced* is
  the ordinary judgement, with only one stop stricter.
- The scale starts at Strong, not Exceptional, so the most cautious stop is not
  the most destructive one. The two boldest stops share Poor and differ only in
  threshold; *Burn it all* exists to give the scale an end.
- The slider sits in the filter strip because it changes verdicts, not rows.

## 10. Parity: what the importer enforces

`file-imports.ts` validates relics **through `readRelic`**, the reader the page
uses, and refuses the whole file on any failure (`AGENTS.md` §0.1): a relic rides
up to 150 monsters, so a half-read one would carry a wrong judgement across the
roster. A relic is rejected unless:

1. `rid` is a safe integer; `pri_effect[0]` is 100/101/102; `sec_effect[0]` is
   a known id equal to `type`; the threshold and percent are positive;
2. `upgrade_curr` is a whole number 0–15 and `durability` 0–3;
3. **main percent = `3 + level`**, **threshold = `relicThreshold(level, per)`**,
   and **percent = `relicUniquePercent`** — the advice judges from level and
   family while the plan reads the imported numbers, so a relic the vocabulary
   does not describe would be judged two ways on one page.

And the roster is rejected (`relicEngravingProblem`) when a unit carries **more
than one relic** (*This file engraves more than one relic on one monster.*) or
a relic sits on a monster **below Lv. 40 or of unknown level** (*This file
engraves a relic on a monster below Lv. 40.*). Every relic on the account passes
(294 records, 2026-10-20). The first that fails is news about the game.

---

## 11. *Use for mons* — value on the monster's own build

`relic-monster-value.ts` and `relic-monster-fit.ts` answer which owned relic
suits each monster. They use neither the population, nor synergy bands, nor the
investment proxy; sections 5–9 still decide Power up, Keep or Sell.

### 11.1 The main-stat model supplies the priorities

The priorities are the main-stat model's need (`MAIN-STAT-MODEL.md`), read
through `copyMainStatNeed` — the same need that decides an artifact's main, so a
relic and an artifact are never told different stories. The copy's base `B` and
its sheet `T` (artifact mains included, relic excluded) come from
`monster-stats.ts`; no second stat sheet exists.

```
weight[s] = need[s] / sum(need)        for s in HP, ATK, DEF
```

A need of 100 % HP and 60 % DEF gives weights 0.625 and 0.375. SPD sizes a
source but is never a priority; relics grant no CRI Rate, CRI Dmg, RES or ACC.
Bases and totals must be finite and positive, or the row reads `No
recommendation` with an import instruction; a copy no source can give a need
reads the same with an instruction to engrave six runes. A zero weight stays
zero.

### 11.2 The effect calculation

The imported `mainPercent`, `threshold` and `percent` are used, never values
rebuilt from the level.

```
mainGain = B[main] × mainPercent / 100
A        = T with mainGain added to its main stat
u        = A[source] / threshold × percent / 100
```

For an HP, ATK or DEF grant the unique gain is `B[target] × u`. **Modelled,
awaiting an in-game check:** base-relative bonuses, continuous rather than
whole-threshold scaling, and the unique reading after the main; no unique feeds
back into its source. The source is the display sheet at the runes' current
levels: leads, buildings, guild flags, team sets, buffs and passives are not
counted.

### 11.3 One scale

```
statPoints(s, gain) = 100 × weight[s] × gain / B[s]
score               = mainPoints + uniquePoints
```

Points are weighted percentage points of base, not a probability.

Example: need 100 % HP, 60 % DEF, no ATK; 250 display speed. An HP +12 Nimble
Timeless grants 15 % HP and 4 % DEF (2 % per 125 SPD): 9.375 + 1.500 =
**10.875**. A DEF +12 Nimble Primal grants 15 % DEF and 4 % HP: 5.625 + 2.500 =
**8.125**. The first wins on this build.

### 11.4 Indirect effects are declared value choices

`relicIndirectValue`:

| Unique grants | Equivalent gain | Priority |
| --- | --- | --- |
| DMG dealt | `A[ATK] × u` | ATK |
| DMG taken reduction | `(2/3) × A[HP] × u / (1 − u)` | HP |
| Recovery & Shield | `(2/3) × A[HP] × u` | HP |

Taking `u` less damage buys `u / (1 − u)` more effective HP; the 2/3 credit is
the developer's discount. Damage dealt uses ATK as its proxy and knows no skill
coefficients. These are approximations stated in The Math, not game rules. A
non-finite or negative contribution, or a reduction of 100 % or more, throws.

### 11.5 Saved choices and engraving capacity

- A saved non-empty main or unique selection restricts that half; a cleared
  menu or no selection allows any. The statistics default never enters the
  score. No owned relic matching: `No recommendation`, saying why.
- Highest score wins; a tie keeps the relic already engraved, then acquisition
  order. Tolerance is 1e-10 points, for floating point only.
- The **150 limit** gates new engravings; a full relic stays available to a
  monster already carrying it. Every matching relic full: `No capacity`. No
  relics imported: an import instruction. Each monster's recommendation is an
  **independent answer**, not a jointly feasible allocation: nothing reserves
  places.
- A blocked ideal counts the known monsters it is engraved on that would score
  lower with it; this count alone reads the rest of the roster and never changes
  the recommendation.
- **Only Lv. 40 monsters that are not Material enter the plan**
  (`isRelicPlanMonster`). Leaving Material monsters out is **JASWA policy**, not
  a game rule: capacity is finite and fodder abounds. It picks the rows
  proposed for and never changes the capacity count, which reads every eligible
  monster, Material ones included. A monster the catalogue cannot classify
  stays in.

### 11.6 Display filters never enter the calculation

Each row is computed from the monster, every owned relic and the imported
counts; search, element, type, storage and Hide filters then choose which rows
show. A monster computed alone gets the same answer as in the full roster.

### 11.7 What the table shows

*Current relic* is the monster's engraved relic. *Recommended relic* names one
candidate, or *Same*. *Main value* and *Unique value* are the candidate's
weighted contributions in points, two decimals, summing to the ranking score;
their titles name the bonus, source value, total and the current relic's
contribution. Advice is Engrave, Replace, Keep, No capacity or No
recommendation; missing information never reads as lack of capacity. Empty
plan: *No monster here is up for a relic plan.* / *Relics need Lv. 40, and JASWA
leaves Material monsters out of the plan.*

### 11.8 Verification

`verify:relic-monster-value` holds worked examples for priorities, flats,
grinds, sets, source interactions, all sixteen effects and the indirect
equivalences. `verify:relic-monster-plan` holds ties, small improvements,
preferences, imported capacity, independence from the roster, and the import
rules of §10. The Playwright suite drives empty and populated imports.
