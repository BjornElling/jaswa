# Calculation authority — SWCalc's game mechanics

**Status:** Binding source rule for every calculation JASWA performs
**Reviewed:** October 1, 2026

## Rule

[SWCalc — Summoners War Mechanics](https://swcalc.cz/game-mechanics#term-2-crit)
is the **authoritative documentation** for how the game calculates: the damage
pipeline and its terms (scaling, critical damage, damage bonus, the defense
factor, ignore defense, variance, additional damage, reductions), combat speed,
the speed buff, the attack-bar tick, turn order and the unit-specific rules the
page lists.

- Where SWCalc states a rule, JASWA follows it. A different source, another
  optimizer's figure or an earlier JASWA choice gives way, and the document
  that recorded the older choice is corrected.
- Where SWCalc says nothing, the subject's own canonical document in `docs/`
  decides, as before, and still marks what is **modelled** rather than verified.
- SWCalc calls its formulas "model formulas for prediction and tuning, not
  reverse-engineered game source code". That is the standing of every rule taken
  from it: the best documented model, not the game's code. A reproducible
  in-game observation that contradicts it is recorded in the subject's document
  before code changes.

## Where JASWA uses it

| SWCalc term | JASWA | Where |
| --- | --- | --- |
| Term 2, Crit = 1 + displayed CD | `DMG = ATK × (1 + CR × CD)` | `RUNE-ROLE-METRICS.md` §2 |
| Term 4, DefenseFactor = 1000 / (1142 + 3.572 · DEF) | `E.HP = HP × (1142 + 3.572 × DEF) / 1000` | `RUNE-ROLE-METRICS.md` §3 |
| Term 4, Dbreak = 0.3 | `E.HP D` uses `0.3 × DEF` | `RUNE-ROLE-METRICS.md` §4 |
| Ch. 2, CombatSpeed = ⌈B(1 + ΣSpd%) + ΣFlat⌉ · SpdBuff | one rounding up, then the buff unrounded | `SPEED-TICK-CANONICAL.md` §2 |
| Ch. 2, SpdBuff% = ⌊30 · (1 + effect)⌋ | 30 % (no speed-up effect is read) | `SPEED-TICK-CANONICAL.md` §2 |
| Ch. 2, ΔATB = CombatSpeed · TickSize | 7 % per tick | `SPEED-TICK-CANONICAL.md` §3 |
| Ch. 2, Leo rule | others held to the slowest Leo | `SPEED-TICK-CANONICAL.md` §3.1 |
| Ch. 2, highest attack bar first; ties in setup order | ties within the team by listed order; SWCalc names no side, so a tie with the enemy goes to the attacker per SWGT and Ellia | `SPEED-TICK-CANONICAL.md` §3.2 |

## Reconciliation of October 1, 2026

Three calculations differed from SWCalc and were corrected:

1. **E.HP and E.HP D** used `1140 + 3.5 × DEF`, chosen because it reproduced
   SWOP Pro's figures. SWCalc's defense factor is `1142 + 3.572 × DEF`. JASWA now
   uses SWCalc's, and its E.HP no longer equals SWOP Pro's (Beth: 63,951 here,
   62,984 in SWOP Pro).
2. **The speed buff** multiplied the unrounded speed and rounded the product
   up: `⌈(B·(1+…) + b) × 1.3⌉`. SWCalc rounds once before the buff and leaves the
   buffed figure unrounded (its Agrius example: 265 × 1.37 = 363.05).
3. **Leo** was not modelled. His Eye of the Storm caps every other monster's
   combat speed at his own; Speed Tuning now applies it.

Everything else JASWA computes either agrees with SWCalc (display speed's
Swift rounding, the additive speed bucket, flat speed after the percentages,
the tick, the fullest bar moving first) or is a subject SWCalc does not cover
(rune efficiency, artifact and relic scoring, the Rune Clean-up probabilities).
