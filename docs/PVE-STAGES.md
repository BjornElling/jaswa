# PvE database

**Status:** Binding
**Reviewed:** October 24, 2026
**Code:** `app/lib/pve-stages.ts`, `app/data/swarfarm-pve-stages.json`
**Refresh:** `npm run refresh:pve-stages`
**Check:** `npm run verify:pve-stages`

What the game sets against a team in PvE: area by area, floor by floor, wave
by wave, enemy by enemy. JASWA looks an enemy up here and nowhere else.
Speed Tuning's floors, the Accuracy goal and the fastest enemy on a monster's
profile already read it. A later figure that needs an enemy's HP or DEF, such
as whether a monster kills it in one hit, reads it too.

## 1. What an enemy carries

| Field | Meaning |
| --- | --- |
| `monster` | The game's monster id, which the catalogue names. `null` for a stated enemy the catalogue has no entry for |
| `name` | A stated enemy's own name. A catalogued enemy is named by the catalogue |
| `level`, `stars` | As the source gives them |
| `speed` | **Combat speed.** An enemy fights under no lead, so this is the figure the clock runs on (`SPEED-TICK-CANONICAL.md` §1) |
| `resistance`, `accuracy`, `criRate`, `criDamageReduction` | In percent |
| `hp`, `attack`, `defense` | As the source gives them |

A Swarfarm enemy has every field. On a stated floor, a field the source does
not give is `null`, and every reader treats it as unknown. It is never filled
in from a neighbouring floor or a similar monster.

## 2. Areas and floors

An area uses the id of the preset content it is (`giants`, `rift-raid`,
`dreaming-fairies`, …), so `pveAreaOf` maps a preset's content to its area
with no table in between. Hall of Magic (`magic`) is an area too: Speed
Tuning tunes for it, though no preset fights there.

An area's floors run from easiest to hardest. **The hardest floor is the last
one**: an Abyss counts as harder than the dungeon's last ordinary floor, even
though B12's monsters are levelled above Abyss Hard's. A team built for an
area is judged against `hardestPveFloor`, and the floor's name heads the
block that states it, for example `Giant's Keep (Abyss Hard)` or
`Rift Raid (R5)`.

| Area | Hardest floor | Source |
| --- | --- | --- |
| Giant's Keep, Dragon's Lair, Necropolis, Spiritual Realm | Abyss Hard | Swarfarm |
| Steel Fortress | B10 (Swarfarm's Abyss has no waves) | Swarfarm |
| Punisher's Crypt, Hall of Magic | B10 | Swarfarm |
| Forest of Roaring Beasts, Sanctuary of Dreaming Fairies, Cliff of Tough Beast Men, Ruin of Silent Death, Castle of Forgotten Heroes | Level 5 | Swarfarm |
| Hellground of Raging Fires | none: Swarfarm files it without enemies | none |
| Rift Raid | R5 | Stated (§4) |
| Dimension Raid phases 1, 2, 3 | Levels 1–5 | Swarfarm |
| Temple of Chaos | Level 100 | Stated (§4) |

An area with no stage data has no stage-derived figures. A separately sourced
Accuracy goal can still be stated where the area has one. Readers show
`Unknown` and do not borrow another area's enemies. The Rift Beasts, Trial of
Ascension floors, its elemental towers, Spires of Ascension and guild contents
still have no staged enemy data.

## 3. Swarfarm

`scripts/refresh-swarfarm-pve-stages.mjs` writes
`app/data/swarfarm-pve-stages.json`. It reads every dungeon Swarfarm files
under Cairos Dungeon, Dimensional Hole, Rift Beast or Rift Raid, except its
placeholders and the Dimension Predator, and keeps every floor that has
enemies in every wave. Each enemy is one row, in the column order the file
names in `enemyColumns`. `pve-stages.ts` checks that order on load. The five
rotating Dimension Raid entries have the same five levels and wave layouts;
the reader checks that they still match and splits their waves into the game's
three phases.

The refresh runs by hand only, never in the app. It waits three seconds
between requests, stops on a rate limit, and refuses a floor where an enemy
lacks a figure or names a monster Swarfarm does not list, so the database is
never half known. The file keeps floors JASWA does not read yet (the
elemental halls and the older Dimension Hole remains), so an area can be added
later without a refresh.

## 4. Stated floors

A floor Swarfarm does not cover is entered by hand in `statedFloors`, with
its source and the date it was read. A floor is either Swarfarm's or stated,
never a mix, and `pve-stages.ts` refuses a stated floor for an area Swarfarm
already covers.

- **Rift Raid R5.** Theria Games, [*Summoners War Chaos Beast
  Guide*](https://theriagames.com/guide/summoners-war-chaos-beast-guide/)
  (Nel B, April 13, 2025), gives the R5 boss "per head" as level 90, 863,400
  HP, 3996 ATK, 2670 DEF, 192 SPD, 30 % Resistance, 0 % Accuracy and 0 % CRI
  Rate. The three heads share one HP pool and one attack gauge, and each of
  the three decks faces one head, so the floor is one wave with one enemy.
  Stars and CRI damage reduction are not given. The 30 % Resistance gives the
  15 % Accuracy goal that the r/summonerswar FAQ also states.
- **Temple of Chaos Level 100.** [SWCalc, *Summoners War Mechanics*](https://swcalc.cz/game-mechanics#temple-of-chaos)
  gives the boss 735,495 HP, 22,265 ATK, 1,000 DEF and a constant 50 %
  Resistance. Its speed is not stated, so the fastest-enemy figure remains
  unknown. The Resistance gives the 35 % Accuracy goal.
