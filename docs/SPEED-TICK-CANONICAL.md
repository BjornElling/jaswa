# Speed and turn order — canonical rules

**Status:** Binding rule basis for JASWA Speed Tuning
**Reviewed:** October 20, 2026
**Game:** *Summoners War: Sky Arena*

This document states the game rules Speed Tuning is built on. `app/domain/speed/speed-tick.ts`
is their only implementation; every figure the page shows is computed there or
from what it returns. A rule changed there is changed here in the same commit.
Where the sources disagree or say nothing, this document says so, and the
choice JASWA made is marked **modelled**, not presented as a verified rule.
Where SWCalc states a rule it decides (`CALCULATION-AUTHORITY.md`).

`npm run verify:speed-tick` holds the implementation to this document.

## 1. Every speed names its form

A bare "speed" is not used, and there are exactly two forms. A rune line's
value is **SPD**.

| Name | What it is | Where it comes from |
| --- | --- | --- |
| **display speed** | Base speed plus the rune bonus: the figure on the game's monster screen and on every other JASWA page | `calculateMonsterTotals` in `monster-stats.ts`, the one stat sheet |
| **combat speed** | The speed the clock runs on (§2): display speed's base and runes with the totem and the leads that count where the team fights (§2.2) — General leads only for a preset whose content is not yet named | `combatSpeed` in `speed-tick.ts` |

One name for every content, by the user's decision of October 21, 2026: an
earlier "arena speed", "dungeon speed", "raid speed" and "guild speed" made
the reader ask whether they were four different things. Where the team fights
decides which leads count, never what the figure is called.

**Speed Tuning speaks combat speed** (the user's decision of November 24,
2026): the turn order is decided by it, so a team's overlay leads with it, its
interval (§7.1) is a range of combat speeds and a what-if is typed as one.
The *Combat speed* column always shows the figure from the engraved runes.
Beside the what-if field, *Display speed* shows the display speed from the
runes while the field is blank. Once a combat speed is entered, it shows the
lowest display speed that reaches it, found by asking `combatSpeed` at each
display speed from bare runes up. A combat speed under bare runes gets a dash.

A what-if value is always a combat speed and goes to the clock as it stands:
the clock reads nothing of a unit's speed but its combat speed, so no rune
speed is invented to reach it. It is the speed the monster fights at, totem
and leads included, so a new leader does not move it. It is saved
with the team, so the experiment is there when the team is opened again, but
only the team's overlay reads it: the page behind it, its verdicts and every
other figure judge the runes engraved.

## 2. Combat speed

    S = ⌈ B · (1 + t + l + s + r) + b + f ⌉                 without a speed buff
    S = ⌈ B · (1 + t + l + s + r) + b + f ⌉ · (1 + p/100)   under a speed buff

- `B` is base speed, `b` all flat speed on runes (main, innate, substats and grinds),
  and `f` is a fixed flat speed passive that is automatic from battle start.
- `t` is the Sky Tribe Totem (§2.1), `l` the leader skill (§2.2), `s` Swift
  (0.25 with a completed Swift set, otherwise 0), and `r` an automatic passive
  speed percentage. All four are fractions of **base** speed and add.
- **One rounding up, over the whole sum.** No term is rounded on its own.
- **The buff multiplies the rounded figure and is not rounded again**, so a
  buffed speed may carry a tenth.
- `p` is the buff's potency, ⌊30 · (1 + SPD UP Effect)⌋ %, truncated: +24 %
  makes 37 %, not 37.2 %. **SPD UP Effect is the recipient's**: the sum of the
  artifact sub property *SPD UP Effect* (id 206) on the monster that receives
  the buff, whoever cast it, read off its engraved artifacts
  (`monsterSpeedParts`).

Sources: SWCalc, *Speed Calculation* (swcalc.cz/game-mechanics) — its worked
Agrius example is ⌈104 × 1.15 + 145⌉ = 265, buffed 265 × 1.37 = 363.05. Ellia's
Wiki, *Attack Bar* (elliabot.neocities.org/game_mechanics/attack_bar/) and
SWSpeedTuner's source (`Math.ceil((1.15 + lead/100) * base + runeSpeed)`) agree
on the unbuffed form. Observation, October 9, 2026, Dragon's Lair at dungeon
speeds 292, 183, 175 and 169: with Agrius's +17 % SPD UP Effect his own buff is
35 %, and only then does the clock move him before Julie, as the game did.

**Swift.** A Swift set counts when it is completed, by four Swift runes or by
three and an Intangible (`intangibleCompletion` in `rune-sets.ts`).
Display speed shows Swift's 25 % rounded up to a whole number
(`displayedSwiftBonus`); battle uses the exact quarter inside the single
rounding above. A tune built from displayed figures can therefore be off by
one when base speed is not divisible by four; the page computes from base and
rune speed and never makes that mistake. The display rounds **up**: JASWA's
stat sheet and SWSpeedTuner agree.

**Integer arithmetic.** The totem moves in half percents, so the formula is
evaluated as `B · (1,000 + 10·(t + l + r) + 250·Swift) + 1,000·(b + f)` in whole
numbers, and no rounding meets a floating-point remainder.

### 2.1 Sky Tribe Totem

Decoration `master_id` **6** in the export's `deco_list`, the id RuneManager
and every optimizer reading the same export use for the speed shrine. It runs
to level 20: the export's own totem stands at level 20 (export observation),
and Com2uS's v6.2.7 notice made level 20 of every building equal the old
level-10 maximum (`account-buildings.ts`). Its bonus by level, the in-game
upgrade table as the Fandom wiki gives it:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
| ---: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| % | 1 | 2 | 2.5 | 3 | 4 | 5 | 5.5 | 6 | 7 | 8 | 8.5 | 9 | 10 | 11 | 11.5 | 12 | 13 | 14 | 14.5 | 15 |

**Disputed between levels 3 and 19:** RuneManager ships a different table
(…4.5, 5, 5.5, 6, 6.5, 7, 8…). Spokland's ten-level table
(summonerswar.spokland.com/building/sky_tribe_totem: 2, 3, 5 … 15 %) is the
form before v6.2.7 and is outdated. All agree on 15 % at the top, where nearly
every account stands.

The totem applies in all areas (Fandom *Sky Tribe Totem*: "applicable in all
areas"), so arena and dungeons alike. The import refuses a `deco_list` it
cannot read, a building listed twice, or a level outside 1–20
(`accountBuildingsProblem`): a totem read as absent would move every combat
speed without a word. An export with no `deco_list` at all is imported; the
page then says the totem is not in the import and counts it as 0 %.

### 2.2 Leader skills

Read from Swarfarm (`leader_skill`). Only `attribute: "Attack Speed"` changes a
combat speed, but the snapshot keeps every lead, because the team editor names
whatever a monster leads with and marks a lead that does not count where the
team is going. The table holds for every attribute (`leaderAreaReaches`):

| Lead's area | Arena | Dungeon | Raid | Guild | Content not yet named |
| --- | --- | --- | --- | --- | --- |
| General | yes | yes | yes | yes | yes |
| Arena | yes | no | no | no | no |
| Dungeon | no | yes | no | no | no |
| Guild | no | no | no | yes | no |

A lead that names an element counts, wherever its area lets it, only on
monsters of that element. Swarfarm writes such a lead two ways — `area:
"Element"`, or `area: "General"` with `element` set (Agrius, Dokkaebi Lord,
the Doctors) — so the snapshot stores one: the area, and the element beside it.

Which contents fall in each area (`preset-contents.ts`, `speed-contents.ts`):

- **Arena** — Arena Attack and both Arena defenses. Source: Fandom *Leader Skill*.
- **Dungeon** — the Cairos dungeons, where Swarfarm files all seven tuned
  dungeons, and Trial of Ascension with its Towers and Spires, Temple of Chaos,
  the Rift of Worlds beasts and the Dimension Hole dungeons (the developer's
  word, October 10, 2026).
- **Raid** — Rift Raid and the Dimension Raid phases: General and element
  leads only. The developer's decision of October 19, 2026, after XelNecra's
  Rift of Worlds guide (summonerswarskyarena.info/rift-of-worlds-analysis-and-basic-guide-by-xelnecra/,
  January 4, 2016): "only leader-skills without area restriction will work …
  The Rift raid also does not count as a dungeon … One-Element-Leaders however
  will work." Applying it to Dimension Raid is **modelled**.
- **Guild** — the Guild tab's contents (Siege Battle, World Guild Battle,
  Labyrinth, Monster Subjugation).
- **Not yet named** — a preset whose content the export does not name: General
  leads alone, the only ones sure to count there.

The leader is chosen per team and is independent of the move order: the last
monster to move may lead.

**Several leaders, one battle.** Rift Raid 1, 2 and 3 take part in every Rift
Raid battle, and each one's leader leads all three decks (the developer,
October 20, 2026; `battleDecks` in `preset-contents.ts`). A team of one of them
fights under its own leader and the other two's, which Speed Tuning reads off
those decks and never chooses (`otherLeaders`); another Rift Raid preset, and
one built in JASWA, fights under its own. Which of a battle's leads add up
(the developer, October 21, 2026, after Fandom):

- **Different stats add up:** +33 % ATK, +24 % CRI Rate and +33 % HP all count.
- **One stat, the same monsters, does not:** two leads of +33 % ATK for every
  monster give +33 %, not +66 % — XelNecra's guide above agrees: "if two
  players decide to bring a speed leader, only one of the leader abilities
  will come into effect". The largest counts; that it is the largest is
  **modelled**.
- **One stat, different monsters, adds up:** +33 % ATK for every monster and
  +40 % ATK for Fire monsters give a Fire monster +73 %, and any other +33 %.

`leadReaches` (`speed-tick.ts`) is the one rule — area, element, then the
stacking above — that the speed figures and every other lead reader
(`team-leads.ts`, `RUNE-OPTIMIZATION.md` §2.2.3) apply. The teams' Fight,
Enhance and Determination sets are not shared across the battle's decks: a
team set reaches its own team only (§2.2.4 of `RUNE-OPTIMIZATION.md`).

### 2.3 Guild

No guild bonus raises speed. Guild levels (patch 4.0.0) unlock guild skills —
Axe of Punishment for Cairos dungeons among them — that raise other stats. If
the in-game guild skill panel ever shows a speed line, this section is wrong
and the model must grow a term.

### 2.4 The other Glory buildings

`app/domain/account/account-buildings.ts` reads every Glory building from `deco_list`:
Guardstone (DEF %), Crystal Altar (HP %), Ancient Sword (ATK %), the five
Sanctuaries (ATK % for their element's monsters) and Fallen Ancient Guardian
(CRI Dmg). None moves a speed. They raise the composites a fight is judged by
— DMG, E.HP, E.HP D — everywhere the account fights except RTA (Fandom
*Buildings*), and the display sheet leaves them out because the game's monster
panel does not show them. Their ids, level tables and sources are stated in
that module.

## 3. The attack-bar clock

1. Every bar starts empty.
2. A **tick** adds the content's tick × current combat speed to every bar:
   **7 %** everywhere Speed Tuning reads, **4.5 %** in a raid — Rift Raid and the
   Dimension Raid phases (`tickPercentOf`, `SpeedContent.tick`). Source: Ellia's
   Wiki, *Attack Bar*, which gives 7 %, raids 4.5 % and RTA 1.5 %; SWCalc gives
   no value. RTA is no preset and has no rule here. Applying the raid tick to
   Dimension Raid is **modelled**.
3. If any bar is at 100 % or more, **exactly one** unit moves: the fullest bar.
   Its bar empties and the overflow is lost.
4. Then the next tick runs, even if another bar already passed 100 %.

Sources: Ellia's Wiki; the Fandom *Attack Bar* page ("after a turn ends,
another tick happens"); SWGT (the bar resets to 0). A unit needs
`⌈10,000 / (7 · n)⌉` combat speed to move within `n` ticks at 7 % — 1,429, 715,
477, 358, 286, 239, 205, 179, 159, 143 … — and `⌈10,000 / (4.5 · n)⌉` in a raid
(2,223 for one tick).

Bars are reported in hundredths of a percent (a turn is 10,000). The clock
counts a thousand times finer — a tick is `70 × speed × (100 + buff %)`, or
`45 ×` in a raid — so a buffed speed's tenth and a raid's half percent stay
whole and every comparison is exact.

### 3.1 Leo

Leo's passive, *Eye of the Storm* (com2us skill 7813, also on the unawakened
Dragon Knight): "The attack speed of all enemies and allies is limited to your
attack speed. This effect does not affect enemies with the same skill or Boss
Monsters." SWCalc: "If Leo exists, non-Leo monsters are capped to the lowest
Leo combat speed." On every tick, every other unit's combat speed — its buff
included — is held to the slowest Leo's current combat speed.

**Modelled:** a dungeon stage does not say which enemy is the boss, so in
dungeons no enemy is capped — the pessimistic reading. Another player's team
has no bosses, and the worst-case enemy in Arena and Siege Battle is level with
the team's first mover as the cap leaves it (§3.2, §6).

### 3.2 Ties

An exact tie on the bar is settled in this order:

1. **The higher combat speed at the start of battle moves first.** SWCalc,
   *Attack Bar ties* (read October 19, 2026): "monsters with the same highest
   attack bar will move in order of their combat speed at the start of battle.
   If that also ties, monsters picked first move first. Combat speed at the
   start of battle includes runes, totems, leader skills, and some passives
   (e.g. Shumar). Buffs such as Shield and Will are only applied after the
   tie-break order has been set." The start-of-battle figure is `TickUnit.speed`:
   runes, totem, leader and Swift, with no buff and no Leo cap, so under Leo
   the uncapped speed decides (Ellia: "Under Leo, ties are broken by original
   SPD instead of placement"). Start-of-battle passives such as Shumar's are not
   modelled.
2. **At equal start speed, the user's team goes before the enemy.** The user's
   team is the attacker everywhere Speed Tuning reads it — arena offence,
   Siege Battle attacks and every dungeon. SWCalc's "picked first" names no side, so this rests on SWGT,
   *How to use the Speed Tick Bracket Calculator* (swgt.io/faq/39, read October
   2, 2026): "same speed unit on offense and defense, offense will go first",
   and Ellia: "priority is given to the attacker". **Modelled** where Ellia
   lets field position come before side: the page cannot see positions.
3. **Between the user's own monsters at equal start speed**, pick order
   decides, which the page cannot see. In the simulation the one listed first
   moves, and the event names who it was tied with (`tiedWith`); the verdict
   is "position decides" (§7), never a pass.

**Start of battle.** No source describes any random factor in arena or
dungeons; the clock is deterministic.

## 4. What a turn does

A monster's turn applies its speed effects (`TurnEffect`):

- **Attack-bar boost** — added to the bar at once, in percentage points; it may
  exceed 100 %. A boosted monster does not move at once: the next tick still
  runs, then the fullest bar goes.
- **Speed buff** — the recipient's combat speed is the buffed form of §2 for a
  number of its own turns. It counts down at the end of the holder's turn,
  except the turn that granted it.

**Drawn.** The Ticks view shows a boost where it acts: as the jump it makes in
the recipient's bar, between two ticks, with a chevron on top. A speed buff is
not drawn.

**Modelled, unverified:** an "all allies" boost does not reach the monster
casting it, because its bar empties as its turn is taken; a boost a skill names
for the caster itself lands after that reset. An "all allies" speed buff does
include the caster.

**Auto battle decides every choice.** Speed Tuning reads a team as the game's
full auto plays it, never as a player picking targets by hand.

**One ally: the lowest attack bar.** A boost or speed buff to one ally goes to
the other ally with the lowest attack bar as the turn begins, unless the
skill's own words name its target, and then the words decide: "the ally with
the highest Attack Bar" (*Tactical Bomb*, *Sword of Justice*) goes to the
highest. The caster is never its own target. The target is chosen once per
turn, so a skill that fills a bar and grants a buff gives both to the same
ally. Level bars go to the monster listed first. Observation, October 8, 2026,
Giant's Keep on full auto at combat speeds 182, 181, 176, 173 and 172:
Prilea, Teshar, Konamiya — whose *Resurge* fills Teshar, the lowest bar,
having just moved — Homunculus, Lyn, then Teshar again before Prilea. The team
table names the recipient of a member's first turn in the tag under it:
`+100 % ATB → Teshar`.

Verdehile's Boiling Blood passes over allies that carry a similar passive
(`skipsSimilar`), as its text says.

## 5. Which effects a monster has

From Swarfarm's skill data (`skill-effects` 17 *Increase ATB* and 5 *Increase
ATK SPD*), matched to the copy's own skills and skill levels from the export.

### 5.1 Every boost on every turn

The user's instruction for tuning: every attack-bar effect a monster has counts
on every one of its turns. A boost behind a cooldown, a chance, a critical hit
or a kill is assumed to land. A monster still uses one active skill per turn —
its strongest speed skill (team boost first, then speed buff, then its own bar)
— plus every passive.

Skill-ups reading "Attack Bar Recovery +N%" strengthen the boost by that share
of itself, counted only up to the copy's own skill level: Bernard's 30 % at
+5 % and +10 % is 34.5 % (SWGT; single source).

### 5.2 When Swarfarm has no number

Where `quantity` is 0 or empty, the skill's own words decide:

- "increases … Attack Bar … by 20%" is 20 %;
- "fills up the Attack Bar" or "to the MAX" is a full bar, whichever way the
  target is worded — "an ally target's", "the target ally's", "the ally's";
- a speed buff's turns are read from "for 2 turns".

Anything else — a boost in proportion to damage or to harmful effects, a bar
swapped or balanced — depends on the battle. It is **not counted**, and the
page says so beside the monster rather than inventing a figure. A zero beside
a numbered effect of the same kind in one skill is that skill's unnumbered
part, and is not counted either.

Where an effect carries none of Swarfarm's target flags, the description names
the target: "all allies", "an ally", or otherwise the monster itself.

The page shows a speed buff as `SPD buff`, and as `+p % SPD` only where one
recipient's potency is known (`shortTurnEffect`).

## 6. What the team faces

Only the attacks on another player's team — Arena and Siege Battle — and the
Cairos dungeons have enemies to cut in. Every other content is tuned for the
team's own turn order, with no enemy guessed for it.

Which kind of opponent a content has is one field, `SpeedContent.opponent`
(`speed-contents.ts`): `worst-case`, `stages` or `none`. The analysis and every
view ask that field, never the area, so Arena and Siege Battle share every line
of the worst-case reading and its wording.

**Arena offence (4 monsters) and Siege Battle attacks (3 monsters).** The
worst-case enemy is the fastest one that still cannot take the first turn:
level with the team's first mover at equal start speed, since such a tie goes
to the attacker (§3.2). Anything faster could win the opening; anything slower
cuts in no earlier. The page reports after which of the team's turns it first
moves. A siege attack is read in the guild area (§2.2), so a Guild lead counts
there and an Arena lead does not. That the attacker also wins a tie in Siege
Battle is **modelled**: SWGT's rule names offence and defense, not arena. The
defense decks of either content are tuned for their own order alone.

**Dungeons (5 monsters).** The hardest floor Swarfarm carries enemy data for:
the Abyss Hard floor (Swarfarm files each Abyss as its own dungeon, Hard as
floor 2) where one exists, otherwise the highest floor.

| Dungeon | Floor used | Note |
| --- | --- | --- |
| Giant's Keep | Abyss, floor 2 | |
| Dragon's Lair | Abyss, floor 2 | |
| Necropolis | Abyss, floor 2 | |
| Spiritual Realm | Abyss, floor 2 | |
| Steel Fortress | B10 | Swarfarm's Abyss floors carry no waves |
| Punisher's Crypt | B10 | No Abyss on Swarfarm |
| Hall of Magic | B10 | |

Enemy speeds are Swarfarm's per-enemy `speed`, read as combat speed. Each
stage is simulated from empty bars with the team, and the page reports when
its first enemy moves. **Unverified:** whether the game resets bars between
stages; the page counts each stage from its start. Several Abyss stages repeat
the B12 speeds exactly on Swarfarm, which may be a gap in its data.

Each enemy is also kept as the game's monster id (Swarfarm's `monster`,
translated to its `com2us_id`), and the Ticks view names it as the catalogue
does — `Golem (Water) #1`, `Kuhn`, `Golem (Water) #2` on Giant's Keep's
stage 2.

**Accepted, not documented.** A handful of dungeon structures carry only a
Korean placeholder on Swarfarm, and no source found names them. Their names
are inferred and were accepted by the user on October 8, 2026
(`acceptedEnemyNames` in `speed-tuning-analysis.ts`):

| Swarfarm placeholder | id | Where | Accepted name |
| --- | --- | --- | --- |
| `가드_보라(중)_심연층` | 211016 | Necropolis Abyss, stages 1 and 3 | Medium Crystal |
| `가드_정령(중)_심연층` | 211506 | Spiritual Realm Abyss, stages 1 and 3 | Medium Crystal |
| `타워(정령) - 1_심연층` | 102266 | Spiritual Realm Abyss, stage 4 | Tower |
| `타워(정령) - 2_심연층` | 102366 | Spiritual Realm Abyss, stage 4 | Tower |

Each shares its icon family and id pattern with the English-named structure
whose name it is given elsewhere: "(중)", medium, with Medium Crystal's
21xx16, "타워" with Tower's. They name a lane and nothing else; no figure
depends on them. A name seen in the game replaces its row. A placeholder with
no accepted name reads `Enemy n`, and `verify:speed-tick` fails on it.

**Useful accuracy.** The snapshot also keeps each enemy's `resist`. It is not
part of the turn order: the team overlay quotes the accuracy a monster can
still use on the floor — its highest resistance less the 15 % floor no
resistance falls below (`usefulAccuracy` in `accuracy-ceiling.ts`, which
states the rule and its source once). The monster overlay's area block reads
the same figure for a Cairos area as its *Accuracy goal*, and the floor's
fastest enemy (`fastestEnemySpeed`) as its *Fastest enemy (combat speed)*,
under a heading naming the floor as the game names it (`Giant's Keep (Abyss
Hard)`, `Steel Fortress (B10)`), so the two pages cannot disagree about one
dungeon.

## 7. Judging a tune

**Binding rule: the order the user places the team in is the authority** (the
user's instruction, October 11, 2026). The monster placed n-th must have the
n-th first turn of the team, and no enemy turn may come before it. Any other
outcome is a fault, whichever monster caused it: a first monster that moves
fourth is out of place as surely as the three that passed it.

Only first turns are ranked. A teammate boosted into a second turn before the
whole team has had a first moves nobody out of place: the turns that count are
the first ones, in the order placed. An enemy turn is different — an enemy that
can cut in before a member is a fault, in arena and on every dungeon stage
alike.

- **In place** — its first turn is the one its place asks for, with no tie
  and no enemy turn before it.
- **Too fast** — its first turn comes earlier among the team's first turns
  than its place.
- **Too slow** — its first turn comes later than its place.
- **Tie** — in its place only by an exact tie with a teammate at equal start
  speed (§3.2, step 3).
- **Enemy cuts in** — an enemy turn comes before its first, on any stage (in
  arena and a Siege Battle attack the worst-case enemy, §6).

Too fast, too slow and an enemy cutting in are red. A member in its place that
an enemy cuts into leads its line with the enemy — `Enemy cuts in (stage 2) ·
moves 6th` — rather than an "In place" the red would contradict; a member out
of place names the enemy last. A tie is yellow: both members of a tie say which
teammate they are tied with and that position decides, without a tuning
suggestion on the verdict line. A tie is not counted as out of place on the
team summary; when it is the only concern, the summary names the tie and shows
a green check. A team with any member out of place, or any enemy that can cut
in, has a red cross. A saved team always has a green check or a red cross.

With *No speed tuning* selected (§9), the team's own first-turn order still
decides the summary and its mark. The summary keeps the order verdict,
followed by ` · No speed tuning` instead of an enemy cut-in verdict; enemy
turns are not counted in this reading.

**Where it moves.** The verdict names a member's absolute place on the field,
`moves 5th`, with every turn before it counted — enemy turns and a teammate's
second turn alike. A member boosted into a second turn before the whole team
has had a first names both: `moves 2nd and 4th`. The places are read on the
worst stage, the one whose first enemy turn comes earliest (in arena and
siege the one worst-case enemy; with no enemies, the team alone), and the Ticks view opens on
that stage, so every number on a verdict is a numbered disc there. The place
judged is the rank among first turns, read on the team alone; the absolute
place only says where on the field that turn falls.

### 7.1 The interval — between the neighbours, ahead of the enemy

**Binding rule (the user's, October 11, 2026, widened November 11, 2026, in
combat speed since November 24, 2026): a member's interval is the combat speeds
at which its first turn comes strictly after that of the member placed just
above it and strictly before that of the member placed just below it, with no
enemy turn before it, every other member at the combat speed it has now — its
what-if where one is typed.** Both places that offer combat speeds quote it:
the overlay's *Interval* column, beside combat speed, and the `needs … combat
speed` on the verdict line, which quotes it only where the current value lies
outside it. They cannot disagree, because they are the same figure.

The interval answers one question: where this monster holds its place, as the
team stands now. It is not the combat speed the monster would need for the
whole team to come right, and it does not look past its two neighbours and the
enemy; a neighbour out of its own place, or cut into, says so on its own line,
with its own interval. No member but the two neighbours plays a part, except
through the clock: their boosts and buffs still move the bars.

**The enemy is the one the reading meets.** `oppositionOf`
(`speed-tuning-analysis.ts`) is the one place a team's enemies are set up — the
worst case of Arena and Siege Battle, a floor's stages, or nobody — and both the
reading (§6, §7.2) and the interval search ask it, at every combat speed tried.
The worst case follows the team's first mover, so a member that slows enough to
hand another the opening meets an enemy level with that one. On a floor, a
value fits only if no stage's enemy gets in before the member. With *No speed
tuning* the team faces nobody, and the interval is the order's alone.

A tie with either neighbour counts against a value: no order may hang on pick
order the page cannot see. The first member has nobody above it, and the worst
case is level with it, so against another player's team its interval is open —
`xx+`, faster always fits; on a floor a fast enemy may close it from below. The
last member has nobody below it. Without a booster, a worst case level with the
opener gets in before every later member, so their intervals are mostly a dash:
the page then says what the opening really is.

Every combat speed from bare runes up to the highest a what-if takes is run
on the team's clock, so boosts, buffs and Leo's cap are answered by
the one implementation, with nothing restated. A boost aimed at the lowest bar
can make a faster monster move later, so the values that fit may lie in more
than one stretch; the stretch holding the member's current value is shown, or
failing that the stretch nearest it. The interval is shown as `xx – yy`, `xx+`
where the stretch reaches the highest combat speed, or a dash where no combat
speed puts the member between its neighbours ahead of the enemy — for instance
where the one above is slower than the one below.

The verifier (`verify:speed-tick`) re-reads every sampled team off its own
trace, apart from the module: each member is too fast or too slow exactly when
its first turn ranks elsewhere than its place; and for a third of the sweep
each interval is typed in across its width, both edges included, and one
combat speed past either edge must not fit — between the neighbours on the
team's trace and with no enemy turn before it on the drawn enemy traces —
while a dash must not fit at a spread of values. The sweep covers a dungeon,
Arena and Siege Battle.

The interval is searched only in the overlay, which shows it; the page reads
every team at once without it.

### 7.2 Enemy cut in

**Enemy cuts in** — a member an enemy has a turn before is red (§7). It reads
the same traces as the Enemy cut in table: `Enemy cuts in (stage 2)` in a
dungeon, `Worst-case enemy cuts in` in arena and Siege Battle.

**Enemy can cut in** — on the team summary, an enemy turn comes before the
team's last first turn, read off the very traces the Ticks view draws, boosts,
buffs and Leo's cap included. It fails the team in arena, in a Siege Battle
attack and on any dungeon stage. A dungeon stage's enemies may be faster than any build; the page still
says so in red, because the order placed is then not the order the battle
plays.

## 8. Data sources

`scripts/refresh-swarfarm-speed-data.mjs` (`npm run refresh:speed-data`) writes
`app/data/swarfarm-speed-skills.json` (leaders and skills; loaded by the Speed
Tuning page only). The dungeon floors a team is tuned against are the PvE
database's (`PVE-STAGES.md`), read through `hardestPveFloor`, so Speed Tuning,
the Accuracy goal and the fastest enemy on a profile read one floor. Both
refreshes are manual maintenance commands with a three-second pause between
requests and never run in the app.

## 9. The page

Which presets are teams, and whose monsters, gear and leader they carry, is
`DECK-PRESETS.md` §5. On the page:

- Three columns hold the teams by content (`PresetColumn`): dungeons left
  (Cairos, Dimension Hole, Rift of Worlds), Arena Attack and Defense centre,
  all others right. The Arena column lists its defenses first, then the attack
  teams.
- Every team opens and is tuned alike. A content without enemy data is tuned
  for its own turn order, its leads counted by its area (§2.2); a preset whose
  content is not yet named counts only the leads that count everywhere.
- The user states the turn order wanted and the what-if combat speeds. They
  are kept for the **team**, not the preset: its preset content (Arena Attack,
  Tower of Fire …, or *unnamed*) and its monsters by species
  (`unit_master_id`), whatever slots they stand in
  (`speed-tuning-preferences.ts`). Every preset of that content with exactly
  those species reads the same statement — two at once, or one built after the
  last was deleted — and a statement is never forgotten. A team with a member
  the import does not hold has no species to be kept by, so nothing on it can
  be stated.
- A team with no order stated is shown in the order it moves in now
  (`gameTurnOrder`): by first turn on the clock, at the runes engraved and
  never a what-if, the preset's slots settling a tie. It follows the runes and
  the leader until the user moves a monster; *Reset turn order* hands it back.
- Every figure is derived from the current import on each render.
- *No speed tuning*, under a team's last slot and off by default, is the
  user's word that the team is not speed tuned. Saved with the team's tuning,
  it reads the team against no enemy: each monster still says whether it is in
  place and which of the team's turns it takes, and the *Enemy cut in* section
  and Ticks leave the overlay (§7).
- The Sky Tribe Totem's level and bonus have a panel of their own: it is the
  one speed term that belongs to the account rather than to a team.
