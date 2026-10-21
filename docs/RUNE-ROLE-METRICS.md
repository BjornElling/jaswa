# Composites — DMG, E.HP, E.HP D, and rune efficiency

**Status:** Binding calculation contract for the composites `DMG`, `E.HP` and
`E.HP D` wherever they are read — the Monsters page, the monster overlay, Rune
Optimization and its shader — and for `Eff. %` in Gems & Grinds
**Depends on:** `docs/CALCULATION-AUTHORITY.md` and `docs/RUNE-CANONICAL.md`
**Reviewed:** October 21, 2026

This is the only document that defines these four figures. The composites
measure what a copy does in a fight; they are not a battle simulator and never
replace a monster's own skill.

## 1. Inputs

**The panel shows a stat; the fight judges it.**

The game's monster panel shows the copy's base stats, its engraved runes (main
property, innate, sub properties with their Grindstone bonuses), its personal
set bonuses (Energy, Guard, Swift, Blade, Rage, Focus, Endure, Fatal;
`RUNE-CANONICAL.md` §10), its artifacts' flat main properties and its relic's
main property as a share of base — no team set, lead or building. That
**display sheet** is kept and shown, but no range, target, ranking or composite
reads it.

Every figure that is judged — the eight stats and the three composites — is the
fight's: the display sheet plus exactly what the fight adds (`CombatBonuses` in
`app/lib/monster-stats.ts`). The developer's decision of October 21, 2026: a
value typed into a stat's range is the final value after every bonus, so a CRI
Rate floor of 100 under a 24-point crit lead asks the runes for 76.

- **Leads:** HP, ATK, DEF and SPD as a percentage of base; CRI Rate, CRI Dmg,
  RES and ACC in points. A preset's come off its leaders; Scenario states HP,
  ATK, DEF and CRI Rate by hand and no SPD lead, as it is no team.
- **Team sets:** Fight, Determination and Enhance as a percentage of the copy's
  own base, Accuracy and Tolerance in points, completed on the copy itself or on
  its teammates (`RUNE-CANONICAL.md` §10).
- **Crit conditions:** *always crits* lifts CRI Rate to at least 100 and lowers
  nothing past it; *always element advantage* adds 15 CRI Rate points. Evidence
  for the 15: Fandom, [*Attribute
  Advantage*](https://summonerswar.fandom.com/wiki/Attribute_Advantage), read
  through its API on October 19, 2026: "When attacking with attribute
  advantage, the attacker gets extra 15% critical hit chance." SWCalc states no
  figure.
- **Glory buildings and the totem**, read from the export's `deco_list`
  (`app/lib/account-buildings.ts`, which records the decoration ids, level
  tables and their sources): Crystal Altar HP, Ancient Sword ATK and Guardstone
  DEF as a percentage of base; the Sanctuary of the copy's own element as ATK %
  of base; the Fallen Ancient Guardian as CRI Dmg points; the Sky Tribe Totem as
  SPD % of base. They apply wherever the account fights except RTA (Fandom,
  [*Buildings*](https://summonerswar.fandom.com/wiki/Buildings), October 19,
  2026), and no preset is an RTA team. An export with no building list counts
  none.

Each percentage is summed with every other percentage on the stat and rounded
up once, as the game counts a leader skill (`totalsInto`); the fight's SPD is so
`SPEED-TICK-CANONICAL.md`'s combat speed. CRI Rate, RES and ACC are not capped
as figures — a range sees the points past 100 — and DMG caps CRI Rate itself.
The composites then read:

- `ATK`, `HP` and `DEF` as whole numbers, as the fight has them.
- `CR`, the fight's CRI Rate as a decimal, capped at `1`. CRI Rate is a chance,
  so it counts up to 100 % and no further (`criticalRateCapPercent`); no source
  found states any effect beyond it (searched October 20, 2026).
- `CD`, the fight's CRI Dmg as a decimal (150 % is `1.50`).

Buffs, skill-ups, artifact sub properties' battle effects, the enemy's DEF,
damage variance and battle-dependent set effects are not counted.

## 2. DMG — average ATK-based critical output

```text
DMG = ATK × (1 + CR × CD)
```

The expected damage basis before skill multiplier and target reduction:

```text
ATK × (1 + CD) × CR + ATK × (1 − CR)
```

It holds for ordinary ATK-scaling hits only. A skill that scales with DEF, HP,
SPD or a mix needs that skill's own coefficients, so DMG must not make ATK a
universally good stat.

## 3. E.HP — effective durability without DEF break

```text
E.HP = HP × (1142 + 3.572 × DEF) / 1000
```

E.HP is roughly the raw damage needed to remove the current HP through SWCalc's
DEF reduction factor (Term 4), which is authoritative
(`CALCULATION-AUTHORITY.md`):

```text
defenseFactor = 1000 / (1142 + 3.572 × DEF)
```

## 4. E.HP D — effective durability under DEF break

```text
E.HP D = HP × (1142 + 3.572 × (0.3 × DEF)) / 1000
```

DEF break leaves 30 % of the normal DEF (SWCalc Term 4, `Dbreak = 0.3`). E.HP D
therefore favours HP, while E.HP also rewards the balance between HP and DEF.

`metricDmg`, `metricEhp` and `metricEhpD` in `app/lib/rune-potential-metrics.ts`
are the one implementation; the Rune Optimization shader reads their constants
by name. Every composite on screen and in every comparison is rounded down to a
whole number (`figureOf`).

## 5. Eff. % — SWOP-compatible rune efficiency

`Eff. %` belongs to **one rune**, not to a monster, and only Gems & Grinds reads
it: it is that workspace's provisional, role-blind score
(`provisionalRuneScore` in `app/lib/rune-craft-plan.ts`). It is the share of a
standardised six-star +15 rune's stat budget the rune holds. The main property,
the current sub properties with their Grindstone bonuses, and the innate count;
the Gem marker does not change the value. Flat HP, ATK and DEF count at half
their value.

```text
mainShare  = mainPropertyMaximum(stars, main) / mainPropertyMaximum(6, main)
lineValue  = (baseOrGemValue + grindValue) × 0.5   // HP +, ATK +, DEF +
           =  baseOrGemValue + grindValue           // every other stat
lineShare  = lineValue / (5 × maximumRoll(stat, 6))
Eff. %     = 100 × (mainShare + Σ lineShare over sub properties and innate) / 2.8
```

`5 × maximumRoll(stat, 6)` is a six-star line that took every upgrade:

| Stat | Reference |
| --- | ---: |
| HP + | 1,875 |
| HP %, ATK %, DEF %, Resistance, Accuracy | 40 % |
| ATK +, DEF + | 100 |
| SPD, CRI Rate | 30 |
| CRI Dmg | 35 % |

An Ancient rune (`class: 16`) reads as six stars, so its main share is that of a
6★ rune. Values stay exact in the calculation.

## 6. Control against SWOP Pro

The account export `Culpa-21822407.json` (August 23, 2026) is the input and a
SWOP Pro screenshot the answer key, with no fight bonus counted. Beth's
artifacts carry `ATK +100` each, so both enter her sheet before DMG.

| Figure | From the export | SWOP Pro |
| --- | ---: | ---: |
| HP | 15,319 | 15,319 |
| ATK | 2,712 | 2,712 |
| DEF | 849 | 849 |
| SPD | 224 | 224 |
| DMG | 6,778.3728 → `6,778` | 6,778 |
| E.HP | 63,951.1263 → `63,951` | 62,984 |
| E.HP D | 31,431.3465 → `31,431` | 31,119 |
| Avg. Eff. % | 90.82 | 90.82 |

Beth's six unrounded efficiencies are `94.86`, `81.46`, `96.30`, `94.05`,
`89.50` and `88.73`, averaging exactly `90.82`, and match the single runes SWOP
shows truncated (95, 81, 96, 94, 90, 89). Lapis `93.41`, Konamiya `96.79`, Megan
`106.17`, Emma `90.18`, Sigmarus `88.23` and Verad `90.50` match too, confirming
the half weight of flat HP, ATK and DEF. SWOP Pro computes E.HP with
`1140 + 3.5 × DEF`; JASWA follows SWCalc, so E.HP and E.HP D differ from it by
design.

## 7. Sources and revision rule

1. [SWCalc — Summoners War Mechanics](https://swcalc.cz/game-mechanics#term-2-crit) —
   **authoritative** for the damage pipeline, the DEF factor, stat scaling and
   the crit bucket (`CALCULATION-AUTHORITY.md`). It precedes the sources below.
2. [SW Exporter `mapping.js`](https://raw.githubusercontent.com/Xzandro/sw-exporter/master/app/mapping.js)
   — an open SWOP-compatible reference for `Eff. %`: the `2.8` normalisation,
   the main-property and innate logic and the Grindstone bonus.
3. [SWGT — EFF% and score](https://swgt.io/controllers/faq/view?faqEntryID=76)
   — the SWOP standard of counting flat HP, ATK and DEF at 50 %.
4. Fandom, [*Attribute Advantage*](https://summonerswar.fandom.com/wiki/Attribute_Advantage)
   and [*Buildings*](https://summonerswar.fandom.com/wiki/Buildings), October 19,
   2026 — the element-advantage CRI Rate and where buildings apply.
5. [SWLens RTA Builder Wizard & Optimizer Guide](https://www.swlens.io/guides/rta-wizard)
   — optimizer precedent for average DMG and E.HP as role measures.

SWCalc describes its model as a verified practical prediction, not published
game source code. Where SWCalc and another source disagree, JASWA follows
SWCalc. On a reproducible newer client observation this document changes first,
then code and tests.
