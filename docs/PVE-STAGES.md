# PvE database

**Status:** Binding
**Reviewed:** November 5, 2026
**Code:** `app/domain/reference/pve-stages.ts`, `app/data/swarfarm-pve-stages.json`, `app/data/labyrinth-miniboss-stages.json`
**Refresh:** `npm run refresh:pve-stages`
**Check:** `npm run verify:pve-stages`

What the game sets against a team in PvE: area by area, floor by floor, wave
by wave, enemy by enemy. JASWA looks an enemy up here and nowhere else.
Speed Tuning's floors, the Accuracy goal and the fastest enemy on a monster's
profile and Rune Optimization's enemy-relative combat-stat thresholds already
read it. A later figure that needs an enemy's HP or DEF, such as whether a monster kills it in one hit, reads it too.

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
`Rift Raid (R5)`. Every enemy-relative calculation uses its own area and floor;
no dungeon serves as a fixed reference for other content. Intrinsic monster
thresholds remain independent of the area.

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
| Labyrinth Normal, Rescue, Explode, Cooldown Time Up, Speed Limit | Hell | Observed maxima (§5) |
| Labyrinth Time Limit | 20 waves; one difficulty | Observed maxima (§5) |
| Labyrinth Boss | Tartarus Hell; separate Hell miniboss captures | Stated (§5) |

An area with no stage data has no stage-derived figures. A separately sourced
Accuracy goal can still be stated where the area has one. Readers show
`Unknown` and do not borrow another area's enemies. The Rift Beasts, Trial of
Ascension floors, its elemental towers, Spires of Ascension and other guild contents
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

### 3.1 Elements

`enemyElements` gives every enemy's element by monster id, as Swarfarm's
monster list records it: `Water`, `Fire`, `Wind`, `Light`, `Dark`, or `Pure`
for an enemy with none — the crystals and towers. It is never read off the
id's last digit, which names no crystal's, tower's or Abyss boss's element and
names the wrong one for four Dimension Hole enemies (47002–47005). The refresh
stops on an element outside that list, and `pve-stages.ts` refuses an enemy
without one.

`pveAreaElement` is the one element every enemy of an area shares, on every
floor and Abyss, its Pure enemies aside; none where two meet or an enemy's
element is unknown. Read on November 5, 2026, every Cairos dungeon a preset
fights in is one element:

| Area | Element | Advantage |
| --- | --- | --- |
| Giant's Keep | Water | Wind |
| Dragon's Lair | Fire | Water |
| Necropolis | Dark | Light |
| Spiritual Realm, Steel Fortress | Wind | Fire |
| Punisher's Crypt | Light | Dark |

The five elemental halls are one element too, but no preset fights there;
Hall of Magic mixes four. `RUNE-OPTIMIZATION.md` §2.2.2 says what the element
does to a preset's monsters.

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

## 5. Tartarus' Labyrinth

Read October 30, 2026. These are historical battle observations, not a fresh
capture of the current game. Neither SWCalc nor Swarfarm supplies newer
Labyrinth enemy data. Each Labyrinth content reads its own figures; a Normal
stage is never the reference for Rescue or another content.

### Ordinary stage types

shinedday's November 3, 2021 post, [*Tartarus Labyrinth — data for each
stages*](https://www.reddit.com/r/summonerswar/comments/qlveqf/), reports SWEX
data for 89 sampled stages across four difficulties. Its [original table
image](https://i.redd.it/zbdzr312ydx71.png) states the maxima below. Hell is the
reference, consistent with other areas' hardest floors. Time Limit has no
selectable difficulty: its later waves earn the Hell reward, so its heading
names **20 waves**, not a fictitious Hell difficulty.

| Content | Highest observed combat speed | Highest observed RES | Accuracy goal | Highest observed HP | Highest observed DEF |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal | 252 | 80% | 65% | 76,905 | 2,799 |
| Rescue | 248 | 42% | 27% | 54,120 | 2,141 |
| Explode | 252 | 42% | 27% | 77,700 | 2,862 |
| Cooldown Time Up | 252 | 42% | 27% | 53,235 | 2,128 |
| Speed Limit | 225 | 42% | 27% | 54,660 | 1,157 |
| Time Limit | 268 | 86% | 71% | 102,855 | 2,225 |

These are maxima of a sample, not exhaustive guarantees. The post's prose
omits Cooldown Time Up; the image includes it. A smaller November 2020
[first-hand observation](https://www.reddit.com/r/summonerswar/comments/jsq8ai/)
found 220–230 SPD and 79% RES in one Normal Hell stage; that narrower sample
does not override the larger survey. No lower difficulty's Rescue figures are
used: the author warns that the rescued ally contaminated their maxima.

The linked GitLab repository and notebook now require sign-in; the public
project API returns 404, and no public mirror was found. The available table
does not identify individual enemies or waves, or second- and third-fastest
speeds. `observedMaxima` preserves this distinction: it is mutually exclusive
with enemy waves. ATK and every final-wave stat remain unknown. No maximum is
turned into a synthetic monster or an invented final-wave boss.

The headings read, for example, **Labyrinth Normal (Hell)**. Tooltips carry the
sample qualification without nesting parentheses. The Labyrinth-only speed
line shows up to three positions, separated by slashes, for the three highest
**distinct known combat speeds**. Ties share a position. Each position has a
short tooltip explaining the enemy and wave where known. Missing ranks are
omitted, with no separator or placeholder: Normal therefore reads `252`.
The box reserves room for three figures in every state. Other
contents retain their single fastest-enemy figure. Speed Limit restricts allied
speed, so its enemy figure is not an ordinary outspeed requirement; its tooltip
says so. No Labyrinth stage is added to Speed Tuning's Cairos enemy simulation.

### Bosses

i_am_the_hacker's June 12, 2019 [*Labyrinth mini boss (hell) stages, wave and
boss stats*](https://www.reddit.com/r/summonerswar/comments/bzk4yq/) links
[raw SWEX captures](https://pastebin.com/5CvcnDbU). The local snapshot preserves
all 13 enemies in each boss's three waves (5/5/3), with their raw game monster
ids; the shared catalogue names them. SPD, RES, ATK, DEF, level, stars and
critical-damage reduction are direct fields. HP, Accuracy and CRI
Rate remain unknown because the author's interpretations of `con`,
`hit_bonus` and `critical_bonus` are explicitly guesses.

| Boss, Hell | Wave 1 crystal / Minotauros combat speed | Wave 2 crystal / Minotauros combat speed | Boss / towers combat speed | Highest RES | Accuracy goal |
| --- | --- | --- | --- | --- | --- |
| Guilles | 199 / 196 | 205 / 199 | 100 / 100 | 55% | 40% |
| Kotos | 199 / 196 | 204 / 199 | 100 / 100 | 55% | 40% |
| Leos | 199 / 196 | 205 / 199 | 100 / 100 | 55% | 40% |

The game shares one Boss preset category. Its speed line reads `205/204/199`
across these captures; the tooltips identify Guilles/Leos wave 2 crystals,
Kotos wave 2 crystals, and the 199-speed crystals/Eintau/Burentau/Urtau
respectively.

shinedday's November 9, 2021 [*Tartarus Hard/Hell — All miniboss up —
Theorycraft*](https://www.reddit.com/r/summonerswar/comments/qpzqo6/) explicitly
states Tartarus's 55% Hell Resistance in footnote 2, yielding the same 40%
Accuracy goal. Its linked CSV is unavailable. The post describes Tartarus's
Attack Bar gain from allied turns; it supplies no numeric combat-speed target.
The boss profile takes Tartarus as its hardest floor and keeps its speed
unknown. The speed-rank tooltips name the relevant miniboss waves, and the row tooltip
scopes the speeds to minibosses, so 205 is never presented as an outspeed
requirement for Tartarus itself. The author's estimated Tartarus Accuracy is not used.
