# Rune rules — the canon

**Status:** Binding game-rule canon for every part of JASWA that reads a rune
**Reviewed:** October 20, 2026
**Game:** *Summoners War: Sky Arena* (not *Chronicles* or *Lost Centuria*)

This document states the game's rune rules that JASWA builds on — the stat
sheet, Rune Clean-up, Gems & Grinds, the Simulator, Rune Optimization and the
import alike. Where code, interface or a secondary guide contradicts it, this
document governs until it is corrected with recorded evidence.

Every rule carries its evidence: a numbered source from §13, the account export
it was measured on, or the developer's in-game observation, each with its date.
A **modelled** premise is JASWA's own working assumption where the game
publishes nothing; it is marked as such and is never presented as a game rule.
An unknown field, set or value never gets a silent fallback.

## 1. Model and vocabulary

A monster holds six runes, one in each **slot** 1–6. A rune has a **Rune Set**
(`set_id`), a slot (`slot_no`), a star class (**grade**, 1–6★; `class` in the
export), a **rarity** (`extra`; §6), a **Main Property** (`pri_eff`), possibly a
**Prefix Property** or innate (`prefix_eff`), and zero to four **Sub
Properties** (`sec_eff`).

A **roll** is either a sub property's first value or a later improvement of it
at +3, +6, +9 or +12. +15 gives no sub-property roll; it improves the main
property only.

JASWA's projections, Max values and chances describe the finished rune at +15.
Its sub properties are those at +12, since nothing rolls between +12 and +15;
only the main property grows, deterministically, in that interval.

The game's names are **HP**, **ATK**, **DEF**, **SPD**, **CRI Rate**, **CRI
Dmg**, **Resistance** and **Accuracy**, and JASWA uses them in the interface.

## 2. Stats and export encoding

Measured on the account export `Culpa-21822407.json` (client 9.2.9, August 23,
2026; source 12), which follows the SWEX format (source 8).

| Effect id | Game name | Form |
| ---: | --- | --- |
| 1 | HP + | flat |
| 2 | HP % | percent |
| 3 | ATK + | flat |
| 4 | ATK % | percent |
| 5 | DEF + | flat |
| 6 | DEF % | percent |
| 8 | SPD | flat |
| 9 | CRI Rate | percentage points |
| 10 | CRI Dmg | percentage points |
| 11 | Resistance | percentage points |
| 12 | Accuracy | percentage points |

Effect 7 is not a valid rune property in the export, and code must not invent a
meaning for it. `class` is the star class 1–6, or `16` for an Ancient rune (§7);
`extra` is the rarity (§6). `rank` is not a quality field: it reads `5` on runes
of every rarity (sources 9, 10).

## 3. Main properties

| Slot | Kind | Legal main properties |
| ---: | --- | --- |
| 1 | fixed | ATK + |
| 2 | chosen | HP +, HP %, ATK +, ATK %, DEF +, DEF %, SPD |
| 3 | fixed | DEF + |
| 4 | chosen | HP +, HP %, ATK +, ATK %, DEF +, DEF %, CRI Rate, CRI Dmg |
| 5 | fixed | HP + |
| 6 | chosen | HP +, HP %, ATK +, ATK %, DEF +, DEF %, Resistance, Accuracy |

A sub property never repeats the main property's stat, and no sub-property stat
appears twice on one rune.

### At +15

A main property grows deterministically with power-up; it does not roll. Final
values by star class, each usable only in the slots above (source 6, *Main
Stats*, read October 20, 2026; source 8):

| Main property | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HP + | 804 | 1,092 | 1,380 | 1,704 | 2,088 | 2,448 |
| HP %, ATK %, DEF % | 18 % | 20 % | 38 % | 43 % | 51 % | 63 % |
| ATK +, DEF + | 54 | 74 | 93 | 113 | 135 | 160 |
| SPD | 18 | 19 | 25 | 30 | 39 | 42 |
| CRI Rate | 18 % | 20 % | 37 % | 41 % | 47 % | 58 % |
| CRI Dmg | 20 % | 37 % | 43 % | 58 % | 65 % | 80 % |
| Resistance, Accuracy | 18 % | 20 % | 38 % | 44 % | 51 % | 64 % |

The 4★ ATK + and DEF + value is 113 by SW Exporter's `mapping.js`, which reads
the game's data (source 8, read October 19, 2026); Spokland's hand-kept table
shows 112 (source 6), and the weaker source gives way.

An Ancient rune's main property at +15 equals the ordinary 6★ value: every
Ancient +15 main in the account export of October 19, 2026 reads 2,448, 63, 160,
42 or 80 (source 13).

### Flat mains at +12

A flat main at +12 is its base plus twelve increments, before the final-level
bonus (source 6, *Main Stats*, read October 20, 2026). Ancient runes have the
same values as ordinary 6★ runes.

| Main property at +12 | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HP + | 580 | 790 | 1,000 | 1,240 | 1,530 | 1,800 |
| ATK +, DEF + | 39 | 53 | 67 | 82 | 99 | 118 |

## 4. Prefix Property (innate)

A **Prefix Property**, usually called the *innate*, is the separate extra stat
below the main property. It is not a sub property and takes none of the four
sub-property places. It exists from the rune's creation, has one fixed value,
never receives a power-up roll, and cannot be the target of a Gem or Grindstone
(source 6, *Prefix Property*).

An innate is one of the eleven sub-property stats. No stat appears in more than
one of the main property, the innate and the sub properties, so an innate makes
its stat unavailable as a sub property — for natural rolls, Gems and
Reappraisal alike.

On ordinary 6★ runes the innate ranges are **the sub-property ranges of §7**:

| Prefix property | Min | Max |
| --- | ---: | ---: |
| HP + | 135 | 375 |
| HP %, ATK %, DEF % | 5 % | 8 % |
| ATK +, DEF + | 10 | 20 |
| SPD | 4 | 6 |
| CRI Rate | 4 % | 6 % |
| CRI Dmg | 4 % | 7 % |
| Resistance, Accuracy | 4 % | 8 % |

Evidence: 1,530 innates on ordinary 6★ runes in the account export of August 23,
2026 (source 12) lie exactly inside these ranges and reach both ends of each.
The published star-independent tables (source 6: HP + 53–323; source 7:
52–355) are not 6★ ranges.

**Modelled:** an innate below 6★ takes that star class's sub-property range; no
lower-star innate has been measured.

**Modelled:** a rune carries an innate with probability exactly **50 %**,
whatever its set and rarity. Com2uS publishes no rate. The premise is re-checked
against a fresh account measurement at each game update.

## 5. Legal sub properties per slot

Besides the ban on repeating the main property or the innate, these slot rules
hold for natural rolls and Gems alike:

| Slot | Sub-property stats that are never legal |
| ---: | --- |
| 1 | ATK + (the main property), DEF + and DEF % |
| 2 | only the stat chosen as main property |
| 3 | DEF + (the main property), ATK + and ATK % |
| 4 | only the stat chosen as main property |
| 5 | HP + (the main property) |
| 6 | only the stat chosen as main property |

Slot 1 may carry ATK % but never DEF + or DEF %; slot 3 may carry DEF % but
never ATK + or ATK %. An innate adds one more ban on top.

## 6. Rarity and the power-up schedule

**The rarity JASWA reads is the rune's original drop rarity.** The export's
`extra` is the rarity the rune dropped with and never changes. The game paints a
rune in its *current* rarity, which rises as lines are added at +3/+6/+9/+12, so
a Rare rune at +12 shows in the game as Legend (source 7, *Blade*). JASWA shows
the original rarity deliberately: it fixes the rune's power-up schedule, which
is what the user decides by (the developer's decision, October 19, 2026).

| Rarity | Ordinary `extra` | Ancient `extra` | Sub properties at +0 | New sub properties | Improvements at +3/+6/+9/+12 |
| --- | ---: | ---: | ---: | --- | ---: |
| Normal | 0 or 1 | 11 | 0 | +3, +6, +9, +12 | 0 |
| Magic | 2 | 12 | 1 | +6, +9, +12 | 1 (+3) |
| Rare | 3 | 13 | 2 | +9, +12 | 2 (+3, +6) |
| Hero | 4 | 14 | 3 | +12 | 3 (+3, +6, +9) |
| Legend | 5 | 15 | 4 | none | 4 (+3, +6, +9, +12) |

Some export paths write Normal as `0`, others as `1`, and JASWA reads both.
Ancient runes carry `extra` 13–15 in the account export of October 19, 2026
(source 13); SWEX names 11–15 as the Ancient encoding (source 8), and JASWA
accepts the whole range.

A rune improves its born lines first and adds the missing ones after. Evidence:
every Hero rune at +9 in the account export of October 19, 2026 holds three
lines — ordinary 6★ (17 of 17) and Ancient (8 of 8) alike — and the one Rare at
+9 holds three (source 13), so a Hero gains its fourth line at +12.

From +12 every rune holds four sub properties. An improvement picks one existing
sub property, so the most rolls one stat can hold after +12, its first included,
is:

| Rarity | Most rolls of one stat |
| --- | ---: |
| Normal | 1 |
| Magic | 2 |
| Rare | 3 |
| Hero | 4 |
| Legend | 5 |

That is a ceiling, not a promise.

## 7. Sub-property ranges

The star class sets the range of each ordinary sub-property roll, at drop and at
every later power-up, so a 4★ or 5★ roll is never priced as a 6★ one. The table
agrees with Spokland's tables (source 6) and with SWEX's six-star maxima, each of
which is five times the 6★ maximum below (source 8, read October 19, 2026).

| Sub property | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
| --- | --- | --- | --- | --- | --- | --- |
| HP + | 15–60 | 30–105 | 45–165 | 60–225 | 90–300 | 135–375 |
| HP %, ATK %, DEF % | 1–2 % | 1–3 % | 2–5 % | 3–6 % | 4–7 % | 5–8 % |
| ATK +, DEF + | 1–4 | 2–5 | 3–8 | 5–10 | 7–15 | 10–20 |
| SPD, CRI Rate | 1 | 1–2 | 2–3 | 2–4 | 3–5 | 4–6 |
| CRI Dmg | 1–2 % | 1–3 % | 2–4 % | 2–5 % | 3–6 % | 4–7 % |
| Resistance, Accuracy | 1–2 % | 1–3 % | 2–4 % | 2–5 % | 3–7 % | 4–8 % |

The 6★ HP %, ATK % and DEF % floor is 5 %: 489 single rolls on +0 runes in the
account export of August 23, 2026 (212 HP %, 132 ATK %, 145 DEF %) hold no 4 %,
which a 4–8 uniform roll makes a sub-10⁻¹⁵ event (source 12), and Spokland's 6★
table says 5–8 % (source 6).

### Distribution

**Modelled:** a roll is uniform over the whole numbers of its range. The
measurement agrees: the innate is the one property a player's keep-or-sell
choices do not touch, and on a 6★ rune it draws from the sub-property range. Over
1,530 innates a χ² test against uniform gives `χ² = 52.97`, `df = 44`,
`p = 0.17`, HP + is uniform over 135–375 measured in tenths (`p = 0.53`), and the
normalised mean holds still at 0.481 / 0.488 / 0.492 / 0.523 at +0 / +9 / +12 /
+15, where a sample distorted by selection would move with the selection
pressure (source 12).

**Modelled:** an improvement picks each of the rune's existing sub properties
with equal chance — `1/4` on a rune with four lines — and a new sub property is
each stat the slot, main property, innate and other sub properties leave legal
with equal chance. Com2uS publishes no rate, and a player's own box cannot test
it: the box is what survived the player's decisions, so every count in it is
distorted by that selection.

### Ancient runes

Ancient runes come from the Dimension Hole and carry `class: 16`; an ordinary 6★
rune is `class: 6`. Only an Ancient rune's **born** lines — and its innate —
roll from the higher Ancient initial range (source 6, *Ancient Rune*: "higher
minimum and maximum initial sub-stats"):

| Sub property | Min | Max |
| --- | ---: | ---: |
| HP + | 165 | 435 |
| HP %, ATK %, DEF % | 6 % | 10 % |
| ATK +, DEF + | 12 | 24 |
| SPD, CRI Rate | 5 | 7 |
| CRI Dmg | 5 % | 9 % |
| Resistance, Accuracy | 6 % | 10 % |

The numbers are source 11's. The account export of August 23, 2026 confirms the
cells HP % 10, SPD 7 and Accuracy 10 (source 12); the rest are secondary.

**A line an Ancient rune gains at +3/+6/+9/+12, and every improvement roll, use
the ordinary 6★ table.** Evidence, the account export of October 19, 2026
(source 13), lines without a Gem:

- Ancient Legend runes gain no line, so every line is born: none lies below the
  Ancient minimum.
- Ancient Hero and Rare runes at +12 and +15 have gained a line: 18
  never-improved lines lie below the Ancient minimum (SPD 4, Accuracy 4, HP % 5
  among them), which no born Ancient line can be.
- Ancient runes at +9, before the Hero's fourth line arrives: none.

Pricing every future roll from the Ancient table would raise both Max value and
Chance falsely.

Ancient runes take their own **Ancient Enchanted Gems**, **Ancient
Grindstones** and **Ancient Reappraisal Stones**, and nothing else (§8, §9).

## 8. Enchanted Gems and Grindstones

### Enchanted Gem: replaces one sub property

An **Enchanted Gem** is used on a rune at **+12** or higher (source 7, *Enchanted
Gem*). It replaces one existing sub property with the Gem's stat; the replaced
stat's power-up rolls do **not** carry over. A rune holds at most one
Gem-converted line at a time, and a later Gem may replace that converted line
again.

A Gem never gives the stat of the rune's main property, innate or another of its
sub properties, so §4 and §5 hold for a conversion too.

| Gem grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD | CRI Rate | CRI Dmg | Resistance, Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 100–150 | 2–4 % | 8–12 | 1–3 | 1–3 % | 1–3 % | 2–4 % |
| Magic | 130–220 | 3–7 % | 10–16 | 2–4 | 2–4 % | 3–5 % | 3–6 % |
| Rare | 200–310 | 5–9 % | 15–23 | 3–6 | 3–5 % | 4–6 % | 5–8 % |
| Hero | 290–420 | 7–11 % | 20–30 | 5–8 | 4–7 % | 5–8 % | 6–9 % |
| Legend | 400–580 | 9–13 % | 28–40 | 7–10 | 6–9 % | 7–10 % | 8–11 % |

Ancient Gems have their own table (source 11):

| Ancient Gem grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD | CRI Rate | CRI Dmg | Resistance, Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 100–210 | 2–6 % | 8–16 | 1–4 | 1–4 % | 2–6 % | 2–6 % |
| Magic | 130–280 | 3–9 % | 10–20 | 2–5 | 2–5 % | 3–7 % | 3–8 % |
| Rare | 200–370 | 5–11 % | 15–27 | 3–7 | 3–6 % | 4–8 % | 5–10 % |
| Hero | 290–480 | 7–13 % | 20–34 | 5–9 | 4–8 % | 5–10 % | 6–11 % |
| Legend | 400–640 | 9–15 % | 28–44 | 7–11 | 6–10 % | 7–12 % | 8–13 % |

### Grindstone: a bonus on one sub property

A **Grindstone** adds a separate bonus to one existing sub property. Only HP +,
HP %, ATK +, ATK %, DEF +, DEF % and SPD can be ground; CRI Rate, CRI Dmg,
Resistance and Accuracy cannot (sources 6, 8). A Grindstone has no level
requirement (source 6, *Grindstone*).

A Gem-converted line can be ground afterwards when its new stat is grindable; in
the export one `sec_eff` entry carries both the Gem marker and a Grindstone bonus
(source 12).

A later Grindstone may go on the same stat for a better value, but only when its
possible result can beat the bonus already there; it then replaces that bonus,
and nothing stacks (sources 6, 7). The bonus observed on the rune, not the
grade of the item that made it, is the rune's current stat.

| Grindstone grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD |
| --- | ---: | ---: | ---: | ---: |
| Normal | 80–120 | 1–3 % | 4–8 | 1–2 |
| Magic | 100–200 | 2–5 % | 6–12 | 1–2 |
| Rare | 180–250 | 3–6 % | 10–18 | 2–3 |
| Hero | 230–450 | 4–7 % | 12–22 | 3–4 |
| Legend | 430–550 | 5–10 % | 18–30 | 4–5 |

Ancient Grindstones (source 11):

| Ancient Grindstone grade | HP + | HP %, ATK %, DEF % | ATK +, DEF + | SPD |
| --- | ---: | ---: | ---: | ---: |
| Normal | 80–180 | 1–5 % | 4–12 | 1–3 |
| Magic | 100–260 | 2–7 % | 6–16 | 1–3 |
| Rare | 180–310 | 3–8 % | 10–22 | 2–4 |
| Hero | 230–510 | 4–9 % | 12–26 | 3–5 |
| Legend | 430–610 | 5–12 % | 18–34 | 4–6 |

The ordinary Gem and Grindstone tables match SWEX cell for cell (source 8, read
October 19, 2026), and the Grindstone table matches Spokland from Magic to
Legend (source 6).

### A Gem that keeps the property keeps its Grindstone

When a Gem replaces a ground sub property with the **same** property — an ATK %
line with an ATK % Gem — the Grindstone bonus on the line survives, and only the
base value is replaced by the Gem's roll. This holds whether the line was rolled
and then ground or is itself an earlier, ground Gem. A Gem that changes the
property starts the new line with no stone, because a bonus belongs to the
property it was spent on. A later, larger stone still replaces the kept one as
above.

Evidence: Com2uS announced it in Developer's Preview #3 of April 10, 2025, and it
shipped in v8.7.1: "When using a Gem of the same sub property on an amplified sub
property … the boosted value will no longer reset during conversion" (source 4,
read October 20, 2026). A guide older than that update says otherwise.
`npm run verify:rune-regem-keeps-grind` holds every reader of this rule to it.

### Which runes an item may go on

| Item | Goes on |
| --- | --- |
| Enchanted Gem, Grindstone | an ordinary rune of the item's own Rune Set |
| Immemorial Gem, Immemorial Grindstone | an ordinary rune of any set, Intangible included — never an Ancient rune |
| Ancient Gem, Ancient Grindstone | an Ancient rune of the item's own Rune Set — nothing else |

An ordinary item is no fallback for an Ancient rune (source 6, *Ancient Rune*).
An Intangible rune is Rune Set 25 like any other, so it takes Intangible and
Immemorial items. That an Immemorial item cannot go on an Ancient rune is the
developer's in-game observation (October 19, 2026); source 6's *Immemorial* page
says only "any Rune Set".

### How the export writes a modification

A sub property in `sec_eff` normalises to:

```text
[effectId, baseOrGemValue, gemMarker, grindValue]
currentSubValue = baseOrGemValue + grindValue
```

`gemMarker` marks a Gem-converted line. `grindValue` is already earned and is
neither a future roll nor counted twice (source 12). `RUNE-CRAFT-ITEMS.md`
covers how the export writes the items themselves.

## 9. Rerolls: Reappraisal and Rune Refinement

The two have opposite purposes and are never mixed up:

| Effect | Keeps | Changes | Not allowed on |
| --- | --- | --- | --- |
| **Reappraisal** | Rune Set, slot, star class, main property, innate | all four sub properties and their power-up distribution | a rune below +12; an Intangible rune |
| **Rune Refinement** | Rune Set, slot, star class, main property, innate, the sub-property stats, Grindstone bonuses | the sub-property values and power-up levels, redistributed | a rune below +12; an Ancient, Intangible or Gem-converted rune |

**Reappraisal** rerolls all four sub properties and keeps the main property and
the innate. The result may be accepted or refused, and accepting it removes
every Gem and Grindstone effect (source 6, *Reappraisal Stone*). It is the one
effect that changes *which* sub properties a rune has. An Ancient rune takes an
**Ancient** Reappraisal Stone under the same +12 rule (source 6, *Ancient
Reappraisal Stone*). Intangible runes are "restricted from using Reappraisal
Stones" (source 2). Neither stone has a rarity or star requirement.

**Rune Refinement**, in the words of the v9.0.0 notice of November 12, 2025
(source 3): "Refinement Stone allows you to redistribute sub property values and
Power-up levels while keeping the sub property types unchanged", "Refinement can
be performed only on Runes powered up to +12 or higher", "Refinement Stones
cannot be used on Intangible Runes, Ancient Runes, or Runes converted with an
Enchanted Gem", and "Sub property values amplified with Grindstones are
retained". A Grindstone does not bar refinement; only a Gem does, and JASWA
refuses the action rather than simulating an exception. The notice does not say
whether a refinement can be declined.

## 10. Rune Sets

A set activates at the number of runes in the **Set** column. A two-set can
stack up to three times on one monster, and a four-set combines with one
two-set. Intangible is the exception, below.

| `set_id` | Rune Set | Set | Effect | Kind |
| ---: | --- | ---: | --- | --- |
| 1 | Energy | 2 | HP +15 % | constant stat |
| 2 | Guard | 2 | DEF +15 % | constant stat |
| 3 | Swift | 4 | SPD +25 % | constant stat |
| 4 | Blade | 2 | CRI Rate +12 % | constant stat |
| 5 | Rage | 4 | CRI Dmg +40 % | constant stat |
| 6 | Focus | 2 | Accuracy +20 % | constant stat |
| 7 | Endure | 2 | Resistance +20 % | constant stat |
| 8 | Fatal | 4 | ATK +35 % | constant stat |
| 10 | Despair | 4 | 25 % chance to Stun on attack | battle, chance |
| 11 | Vampire | 4 | Life Drain +35 % | battle, chance |
| 13 | Violent | 4 | 22 % chance of an Additional Turn | battle, chance |
| 14 | Nemesis | 2 | ATK Gauge +4 % per 7 % HP lost | battle, conditional |
| 15 | Will | 2 | Immunity for 1 turn at battle start | battle, conditional |
| 16 | Shield | 2 | 3-turn Shield for the whole team, 15 % of the holder's base HP | battle, conditional |
| 17 | Revenge | 2 | 15 % counterattack with the first skill at 75 % of the original damage | battle, chance |
| 18 | Destroy | 2 | the enemy's MAX HP −30 % of the damage; cap 60 % | battle, conditional |
| 19 | Fight | 2 | all monsters' ATK +8 % | constant team stat |
| 20 | Determination | 2 | all monsters' DEF +8 % | constant team stat |
| 21 | Enhance | 2 | all monsters' HP +8 % | constant team stat |
| 22 | Accuracy | 2 | all monsters' Accuracy +10 % | constant team stat |
| 23 | Tolerance | 2 | all monsters' Resistance +10 % | constant team stat |
| 24 | Seal | 2 | 15 % chance to disable a qualifying set effect for 1 turn | battle, chance |
| 25 | Intangible | — | stands in for one missing rune; no piece count of its own | special rule |

Evidence: source 1 (read October 20, 2026) for the effects and the team sets'
"all Monster's" wording; sources 6 and 7 for stacking and battle detail; SWEX
holds the same `set_id`s (source 8). `rune-sets.ts` holds the one table.

### Recipient, basis and stacking

Two recipient rules, kept strictly apart:

1. **The holder's own set effects** — Energy, Guard, Swift, Blade, Rage, Focus,
   Endure, Fatal, Despair, Vampire, Violent, Nemesis, Will, Shield, Revenge,
   Destroy and Seal — arise only on the monster with the completed set, Shield
   being the stated team effect.
2. **Team sets** — Fight, Determination, Enhance, Accuracy and Tolerance — apply
   to every monster of the same team, **the holder included**. Com2uS says "all
   Monster's" (source 1), not "all other allies".

Fight, Determination and Enhance are computed for each recipient from its own
base ATK, DEF or HP, not the holder's. Completed team sets stack additively:
three Fight sets on one monster give +24 % ATK to everyone on the team, the
holder included.

Energy, Guard, Fatal and Swift are likewise percentages of the holder's own base
HP, DEF, ATK and SPD. Blade, Rage, Focus, Endure, Accuracy and Tolerance add
their CRI, Accuracy or Resistance percentage points and are never reinterpreted
as multiplicative battle buffs.

### Display and battle values

The five team sets apply in battle, to their holder too, and enter none of the
eight display stats; personal stat sets such as Blade and Fatal do. Evidence: the
developer's in-game observation of October 16, 2026 — the same Fran build in the
Trial of Ascension deck panel against a fresh account export. Base ATK 670, rune
ATK 198 %, flat ATK 247 and artifact ATK 100 give `ceil(670 × 2.98) + 347 =
2,344`, exactly the game's `670 + 1,674`; her Fight set, completed by an
Intangible, would have raised display ATK to 2,398. Two teammates also carry
Fight, and all three sets apply to her battle ATK (`ceil(670 × 3.22) + 347 =
2,505`), never to her display ATK. Accuracy and Tolerance add battle percentage
points the same way and leave the display figures alone.

### Battle detail

These are set properties JASWA shows; none is a numeric stat (sources 6, 7):

- **Shield:** each completed set gives the whole team a removable Shield for 3
  turns at 15 % of the holder's base HP. Shields from several sets, on one or
  several teammates, stack. It re-applies on a new wave except in a Secret
  Dungeon, but not after Revival.
- **Will:** one set gives Immunity for 1 turn at battle start. More completed
  Will sets extend it additively, to 3 turns with three sets; the Immunity is a
  removable buff.
- **Despair:** the 25 % Stun is an attempt of its own beside a skill's own Stun.
  It is tried per hit on multi-hit attacks and cannot be resisted, but Immunity
  stops it.
- **Vampire:** heals the holder by 35 % of the damage; it does not apply to
  attacks that scale with the target's HP.
- **Nemesis:** +4 % Attack Bar per 7 % HP lost, per set. Continuous Damage and
  skills that spend the holder's own HP do not trigger it.
- **Revenge:** +15 % counterattack chance per set at 75 % of basic damage; more
  sets raise the chance additively.
- **Destroy:** 30 % of the damage dealt lowers the enemy's MAX HP, at most 4 %
  of it per attack per set and 60 % over the battle. More sets raise the
  per-attack cap (8 % with two, 12 % with three). Destroy cannot hit Bosses.
- **Violent:** the first Additional Turn attempt is 22 %, and the chance of
  further consecutive turns falls. This is battle chance, not a stat value.
- **Seal:** the 15 % chance attaches the Seal effect to the holder's attacks. It
  can disable Despair, Vampire, Violent, Nemesis, Revenge, Destroy or Seal for
  1 turn, never a set effect that changes stats directly, such as Energy or
  Fatal.

### Intangible

Intangible is a wildcard, not a set: it has no piece count and no stat bonus of
its own.

- A monster may hold at most **one** Intangible rune (source 1).
- It replaces one missing rune of a set that is exactly one rune short (sources
  1, 5): 3 Violent + 2 Will + 1 Intangible gives both Violent and Will. It never
  counts as more than one missing rune.
- **With two or more sets each one rune short, it completes none of them**; the
  game does not choose a winner. Source 5 says it "cannot replace two or more
  Rune sets at once"; that it then completes neither is the developer's in-game
  observation (October 19, 2026).
- Its craft items are §8's and its rerolls §9's: Intangible and Immemorial items
  only, no Reappraisal, no Refinement.

What a build may do with an Intangible that completes nothing is a product rule,
in `RUNE-OPTIMIZATION.md` §2.1.1.

## 11. Battle rules JASWA does not model

These get no implicit formula anywhere in JASWA. They are listed so that their
absence from a numeric model is not mistaken for a game rule:

- How Attack Bar, turn limits and removable buffs behave in each game mode —
  Violent and Seal in real-time PvP in particular.
- Whether team set effects cross between separate teams in multi-party modes;
  the model covers only the monster's own team.
- The battle outcome of Despair, Vampire, Destroy, Nemesis, Revenge, Violent,
  Will, Shield and Seal. They are recorded set properties, but cannot
  responsibly be turned into one universal rune score.

## 11.1 The game's own sort order (the Manage panel)

The game's Manage panel offers a **Sort by** dropdown. JASWA reproduces three of
its options, so a player who has just sorted the box in the game can sort alike
in JASWA and compare the two lists row by row. The orders are **observed**, not
derived from a rule, and `scripts/verify-rune-game-sort.mjs` holds them.

| Sort by | Order |
| --- | --- |
| Grade | slot ascending → star class descending → rarity descending (Legend → Hero → Rare → Magic → Normal) → Ancient first → set id ascending → power-up level descending → rune id descending |
| Power-up Lv. | slot ascending → power-up level descending → star class descending → Ancient first → rarity descending → set id ascending → rune id descending |
| Obtained | acquisition order, newest first |

**Reading the panel.**

- **"Grade" in the panel means rarity, not star class** — against §1, where
  *grade* is the star class (`class`) and *rarity* is `extra`.
- A tile's **stars** are the star class.
- The **colour of the stars** marks `+15` and nothing else: purple stars are a
  maxed rune, gold ones are not.
- **Ancient** is a **white ring around the rune icon**, nothing on the stars.
- The rune id (`rune_id`, which `Rune.obtainedOrder` carries) breaks the last
  tie. `date_add` resolves only to the second and the game grants runes in bulk,
  as for `Artifact.obtainedOrder`.

**Evidence.** Grade: the developer's Manage-panel screenshots compared with an
account export — 6★ runes all before 5★; on slot 6, Ancient Legend runes
together before ordinary Legend ones, and sets in ascending `set_id` (Blade,
Rage, Despair, Nemesis, Will, Shield), highest level first within a set; three
observed swaps (Vampire, Energy, Guard) equal on every earlier key confirm the
descending rune id. Power-up Lv.: the developer's in-game observation of October
10, 2026 against the current export — slot 1 ends with an ordinary Rare +0
before slot 2 starts with an Ancient Legend +15 (slot before level); 6★ Rare +15
before 5★ Legend +15, and 5★ Hero +15 before Ancient 6★ Legend +12 (level before
star class, star class before rarity); Ancient Rare +15 before ordinary Legend
+15 (Ancient before rarity, unlike Grade); five ordinary 6★ Hero Rage +15 runes
in slot 2 with mains ATK, SPD, SPD, SPD, ATK in strictly descending id (main
property does not group). Anonymous transitions are held in the script; the
personal export is not committed.

**Open.** The model fits every capture so far and is not exhaustive. Ancient
against star class cannot be isolated on this account, whose Ancient runes are
all 6★, and the rarity order is fully observed only among 6★ runes. Whether the
panel's Grade sorts by original or current rarity (§6) is not isolated: a +12
rune whose `extra` is below Legend decides it. A deviation leads to a new
measurement and a correction of this section and the script.

## 12. What these rules do not decide

A rune's worth to a role, SPD against HP %, which Gems, Grindstones or rerolls to
spend, and any efficiency or rune-score formula are product decisions, not game
facts. They live in `RUNE-CLEANUP-MATH.md`, `RUNE-OPTIMIZATION.md` and
`RUNE-ROLE-METRICS.md`.

## 13. Sources and revision rule

1. Com2uS, [Rune System — game guide](https://summonerswar.com/en/skyarena/game), read October 20, 2026 — set effects, the team sets' "all Monster's", Shield duration, one Intangible per monster replacing one missing rune.
2. Com2uS, RELOADED developer's note, June 2023 — Intangible runes "restricted from using Reappraisal Stones". It was read at `summonerswar.com/en/skyarena/news/list/4225`, a list address that now serves another notice (checked October 19, 2026); no fixed copy has been found.
3. Com2uS, v9.0.0 update notice, November 12, 2025, as copied by [Spokland](https://summonerswar.spokland.com/game/update/v9.0.0_update_notice-2025-11-12) — Rune Refinement, quoted in §9. Secondary as a host, primary in wording.
4. Com2uS, Developer's Preview #3, 11th Anniversary Update II, April 10, 2025, shipped in the [v8.7.1 update notice, as copied by Spokland](https://summonerswar.spokland.com/game/update/v8.7.1_update_notice-2025-04-26), read October 20, 2026 — a same-property Gem keeps the Grindstone (§8).
5. Com2uS press release, [“Summoners War: Sky Arena Unleashes RELOADED Update on June 30th”](https://www.cosmocover.com/newsroom/summoners-war-sky-arena-unleashes-reloaded-update-on-june-30th/), June 29, 2023, read October 20, 2026 — Intangible replaces one missing set and cannot replace two or more at once.
6. Spokland — [Rune Sets](https://summonerswar.spokland.com/rune/set), [Main Stats](https://summonerswar.spokland.com/rune/stat) (read October 20, 2026), [Prefix Property](https://summonerswar.spokland.com/rune/prefix), [Sub Property](https://summonerswar.spokland.com/rune/sub-stat), [Enchanted Gem](https://summonerswar.spokland.com/rune/enchanted_gem), [Grindstone](https://summonerswar.spokland.com/rune/grindstone), [Immemorial](https://summonerswar.spokland.com/rune/immemorial), [Reappraisal Stone](https://summonerswar.spokland.com/rune/reappraisal_stone) and [Ancient Rune](https://summonerswar.spokland.com/rune/ancient_rune) (read October 19, 2026). Secondary; official text or a reproducible client observation wins.
7. Summoners War: Sky Arena Wiki — [Runes](https://summonerswar.fandom.com/wiki/Runes), [Enchanted Gem](https://summonerswar.fandom.com/wiki/Enchanted_Gem), [Grindstone](https://summonerswar.fandom.com/wiki/Grindstone) and [Blade](https://summonerswar.fandom.com/wiki/Blade), read as search excerpts on October 19, 2026 (direct fetches refused). Secondary.
8. SW Exporter, [`app/mapping.js`](https://raw.githubusercontent.com/Xzandro/sw-exporter/master/app/mapping.js), master branch, read October 19, 2026 — set ids, Gem and Grindstone tables, six-star sub maxima, main values, Ancient `extra` 11–15.
9. [SWEX raw rune records](https://github.com/Xzandro/sw-exporter/issues/316) — `rank` stays `5` while `extra` follows the rarity.
10. [SW Forge rune parser](https://github.com/antajl/sw-forge/blob/main/js/data/parser.js) — `extra` as rarity, `class` as star class and Ancient marker.
11. [Xzandro's Ancient roll tables](https://www.reddit.com/r/summonerswar/comments/c0dc2h/ancient_grindstone_ancient_enchanted_gems_min_max/), 2019 — Ancient initial ranges and Ancient Gem and Grindstone tables. Secondary and not re-fetched; partly confirmed by source 12.
12. The account export `Culpa-21822407.json`, client 9.2.9, August 23, 2026 — field format, `class` and `extra`, stat ids, innate, roll, Gem and Grindstone values.
13. The developer's account export of October 19, 2026 — Ancient added lines and main values, line counts at +9, Ancient `extra`.
14. The developer's in-game observations: October 10, 2026 (Manage-panel sort), October 16, 2026 (display against battle ATK) and October 19, 2026 (Immemorial items refused on Ancient runes; an Intangible with two sets one short completes neither).

At every game update the set table, the `class` and `extra` mapping and the
sub-property ranges are validated again, and the modelled premises re-checked
against a fresh account measurement.
