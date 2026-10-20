# Calculation authority — SWCalc's game mechanics

**Status:** Binding source rule for every calculation JASWA performs
**Reviewed:** October 20, 2026

## Rule

[SWCalc — Summoners War Mechanics](https://swcalc.cz/game-mechanics#term-2-crit)
is the **authoritative documentation** for how the game calculates: the damage
pipeline and its terms (scaling, critical damage, damage bonus, the defense
factor, ignore defense, variance, additional damage, reductions), combat speed,
the speed buff, turn order and the unit-specific rules the page lists.

- Where SWCalc states a rule, JASWA follows it. A different source, another
  optimizer's figure or an earlier JASWA choice gives way, and the document
  that recorded the older choice is corrected.
- Where SWCalc says nothing, the subject's own canonical document in `docs/`
  decides, names its source, and marks what is **modelled** rather than
  verified.
- SWCalc calls its formulas "model formulas for prediction and tuning, not
  reverse-engineered game source code". That is the standing of every rule taken
  from it: the best documented model, not the game's code. A reproducible
  in-game observation that contradicts it is recorded in the subject's document
  before code changes.

## Where JASWA uses it

Read October 19, 2026 (the page carries no date or version).

| SWCalc term | JASWA | Where |
| --- | --- | --- |
| Term 2, Crit = 1 + displayed CD | `DMG = ATK × (1 + CR × CD)` | `RUNE-ROLE-METRICS.md` §2 |
| Term 4, DefenseFactor = 1000 / (1142 + 3.572 · DEF) | `E.HP = HP × (1142 + 3.572 × DEF) / 1000` | `RUNE-ROLE-METRICS.md` §3 |
| Term 4, Dbreak = 0.3 | `E.HP D` uses `0.3 × DEF` | `RUNE-ROLE-METRICS.md` §4 |
| Ch. 2, CombatSpeed = ⌈B(1 + ΣSpd%) + ΣFlat⌉ · SpdBuff | one rounding up, then the buff unrounded | `SPEED-TICK-CANONICAL.md` §2 |
| Ch. 2, SpdBuff% = ⌊30 · (1 + effect)⌋ | the recipient's artifact SPD UP Effect, truncated | `SPEED-TICK-CANONICAL.md` §2 |
| Ch. 2, Leo rule | others held to the slowest Leo | `SPEED-TICK-CANONICAL.md` §3.1 |
| Ch. 2, Attack Bar ties: start-of-battle combat speed, then pick order | ties by start-of-battle combat speed; at equal speed the attacker, then pick order | `SPEED-TICK-CANONICAL.md` §3.2 |

## Rules taken from other sources

SWCalc does not state these. Each is stated, with its source, in one place:

| Rule | Source | Stated in |
| --- | --- | --- |
| A tick fills 7 % of combat speed, 4.5 % in a raid | Ellia's Wiki, *Attack Bar* | `SPEED-TICK-CANONICAL.md` §3, `speed-tick.ts` |
| At equal start speed the attacker moves first | SWGT, Ellia's Wiki | `SPEED-TICK-CANONICAL.md` §3.2 |
| Sky Tribe Totem: 20 levels, 15 % at the top | the Fandom wiki's upgrade table; the export's own level 20 | `SPEED-TICK-CANONICAL.md` §2.1 |
| Which leads count where, raids included | Fandom *Leader Skill*; XelNecra's 2016 guide; the developer's decisions | `SPEED-TICK-CANONICAL.md` §2.2 |
| Glory buildings: ids, level tables, everywhere but RTA | RuneManager, swarm-api and Swarfarm for the ids; the Fandom wiki and Com2uS's v6.2.7 notice for the levels; Fandom *Buildings* for the reach | `account-buildings.ts`; `SPEED-TICK-CANONICAL.md` §2.4 |
| CRI Rate stops at 100 % | established game rule | `criticalRateCapPercent` in `rune-potential-metrics.ts` |
| Element advantage adds 15 % CRI Rate | Fandom *Attribute Advantage*: "the attacker gets extra 15% critical hit chance" | `elementAdvantageLift` in `monster-stats.ts` |
| Resistance never falls below 15 %; ACC and RES stop at 100 % | Fandom *Guide: Accuracy and Resistance* | `accuracy-ceiling.ts` |

## Where JASWA differs from another optimizer

- **E.HP differs from SWOP Pro by design.** JASWA uses SWCalc's
  `1142 + 3.572 × DEF`; SWOP Pro's figures fit `1140 + 3.5 × DEF` (Beth: 63,951
  here, 62,984 in SWOP Pro).

Everything else JASWA computes either agrees with SWCalc or is a subject SWCalc
does not cover (rune efficiency, artifact and relic scoring, the Rune Clean-up
probabilities).
