# Speed and turn order — canonical rules

**Status:** Binding rule basis for JASWA Speed Tuning
**Reviewed:** October 11, 2026
**Game:** *Summoners War: Sky Arena*

This document states the game rules Speed Tuning is built on. `app/lib/speed-tick.ts`
is their only implementation; every figure the page shows is computed there or
from what it returns. A rule changed there is changed here in the same commit.
Where the sources disagree or say nothing, this document says so, and the
choice JASWA made is marked **modelled**, not presented as a verified rule.

`npm run verify:speed-tick` holds the implementation to this document.

## 1. Three speeds, never confused

Every speed on the page names its form. A bare "speed" is not used.

| Name | What it is | Where it comes from |
| --- | --- | --- |
| **display speed** | Base speed plus the rune bonus: the figure on the game's monster screen and on every other JASWA page | `calculateMonsterTotals` in `monster-stats.ts`, the one stat sheet |
| **arena speed** | The combat speed in arena | §2, with arena's leader rules |
| **dungeon speed** | The combat speed in dungeons | §2, with dungeon leader rules |

A what-if value is always a display speed. It is turned back into flat rune
speed (`runeSpeedForDisplay`), so an experiment changes the runes and nothing
else: base speed, Swift, totem and leader stay the monster's own. It is saved
with the team, so the experiment is there when the team is opened again, but
only the team's overlay reads it: the page behind it, its verdicts and every
other figure judge the runes engraved.

## 2. Combat speed

Without a speed buff:

    S = ⌈ B · (1 + t + l + s) + b ⌉

With a speed buff:

    S = ⌈ B · (1 + t + l + s) + b ⌉ · 1.3

- `B` is base speed, `b` all flat speed on runes (main, innate, substats and grinds).
- `t` is the Sky Tribe Totem, `l` the leader skill, `s` Swift (0.25 with four
  Swift pieces, otherwise 0). All three are fractions of **base** speed and add.
- **One rounding up, over the whole sum.** No term is rounded on its own.
- **The buff multiplies the rounded figure and is not rounded again**, so a
  buffed speed may carry a tenth. Its potency is ⌊30 · (1 + SPD UP Effect)⌋ %,
  truncated: +24 % makes 37 %, not 37.2 %.
- **SPD UP Effect is the recipient's.** It is the sum of the artifact sub
  property *SPD UP Effect* (id 206) on the monster that receives the buff,
  whoever cast it (SWCalc). It is read off the copy's engraved artifacts
  (`monsterSpeedParts`).

The SPD UP Effect was once left out and every buff read as 30 %. On a Dragon's
Lair team (October 9, 2026, at dungeon speeds 292, 183, 175 and 169) Agrius's
own buff after each turn then put Julie before his second turn, where the game
moved Agrius first; from +17 % his buff is 35 %, and the clock agrees with the
game.

Sources: SWCalc, *Speed Calculation* (swcalc.cz/game-mechanics), which is
authoritative (`CALCULATION-AUTHORITY.md`) — its worked Agrius example is
⌈104 × 1.15 + 145⌉ = 265, buffed 265 × 1.37 = 363.05. Ellia's Wiki, *Attack Bar*
(elliabot.neocities.org/game_mechanics/attack_bar/) and SWSpeedTuner's source
(`Math.ceil((1.15 + lead/100) * base + runeSpeed)`) agree on the unbuffed form.
The buff was earlier modelled as rounding up after the multiplication; SWCalc
does not, and decides. SWLens contradicts itself on the totem and is not used.

**Swift.** Display speed shows Swift's 25 % rounded up to a whole number
(`displayedSwiftBonus`); battle uses the exact quarter inside the single
rounding above. A tune built from displayed figures can therefore be off by one
when base speed is not divisible by four; the page never makes that mistake,
because it computes from base and rune speed. The display rounds **up**: this
matches JASWA's stat sheet and SWSpeedTuner, while one old Reddit comment says
"nearest". Treated as verified by the two agreeing implementations.

**Integer arithmetic.** The totem moves in half percents, so the formula is
evaluated as `B · (1,000 + 10·(t + l) + 250·Swift) + 1,000·b` in whole numbers,
and no rounding meets a floating-point remainder.

### 2.1 Sky Tribe Totem

Decoration `master_id` **6** in the export's `deco_list`, which is the id
RuneManager and every optimizer reading the same export use for the speed
shrine. Its bonus by level (the in-game upgrade table, fandom wiki):

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
| ---: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| % | 1 | 2 | 2.5 | 3 | 4 | 5 | 5.5 | 6 | 7 | 8 | 8.5 | 9 | 10 | 11 | 11.5 | 12 | 13 | 14 | 14.5 | 15 |

**Disputed between levels 3 and 19:** RuneManager ships a different table
(…4.5, 5, 5.5, 6, 6.5, 7, 8…). Both agree on 15 % at level 20, which is where
nearly every account stands. JASWA follows the game's own table.

The totem applies in all areas (fandom *Sky Tribe Totem*: "applicable in all
areas"), so arena and dungeons alike. The import refuses a `deco_list` it cannot
read, a totem level outside 1–20, or two totems (`skyTribeTotemProblem`): a totem
read as absent would move every arena and dungeon speed without a word. An
export with no `deco_list` at all is imported; the page then says the totem is
not in the import and counts it as 0 %.

### 2.2 Leader skills

Read from Swarfarm (`leader_skill`). Only `attribute: "Attack Speed"` changes a
combat speed, but the snapshot keeps every lead, because the team editor names
whatever a monster leads with and marks a lead that does not count where the
team is going. The table holds for every attribute (`leaderAreaReaches`). Where
one counts:

| Area | Arena | Dungeons | Guild content | Content not yet named |
| --- | --- | --- | --- | --- |
| General | yes | yes | yes | yes |
| Arena | yes | no | no | no |
| Dungeon | no | yes | no | no |
| Guild | no | no | yes | no |

A lead that names an element counts, wherever its area lets it, only on
monsters of that element. Swarfarm writes such a lead two ways — `area:
"Element"`, or `area: "General"` with `element` set (Agrius, Dokkaebi Lord,
the Doctors) — so the snapshot stores one: the area, and the element beside it.
Reading only `"Element"` as a restriction once gave Agrius's fire-only +30 %
CRI Rate to the whole team.

Source: fandom *Leader Skill*. "Dungeon" covers the Cairos dungeons, which is
where Swarfarm files all seven tuned dungeons, and — the player's word, October
10, 2026 — Trial of Ascension, Temple of Chaos, Rift of Worlds and Dimension
Hole too; "Guild" covers the Guild tab's contents (Siege Battle, World Guild
Battle, Labyrinth, Monster Subjugation). A preset whose content the export does
not name is read with General leads alone, the only ones sure to count there,
and its figure is called its *combat speed*.

Only the Cairos dungeons and arena have enemies to cut in (§6). Every other
content is tuned for the team's own turn order, with no enemy guessed for it. The leader is chosen per team and
is independent of the move order: the last monster to move may lead.

### 2.3 Guild

No guild bonus raises speed. Guild levels (patch 4.0.0) unlock guild skills —
Axe of Punishment for Cairos dungeons among them — that raise other stats. The
page states this in its rule panel. If the in-game guild skill panel ever shows
a speed line, this section is wrong and the model must grow a term.

## 3. The attack-bar clock

1. Every bar starts empty.
2. A **tick** adds 7 % × current combat speed to every bar (raids 4.5 % and RTA
   1.5 %, which the page does not tune).
3. If any bar is at 100 % or more, **exactly one** unit moves: the fullest bar.
   Its bar empties and the overflow is lost.
4. Then the next tick runs, even if another bar already passed 100 %.

Sources: Ellia's Wiki; the fandom *Attack Bar* page ("after a turn ends, another
tick happens"); SWGT (the bar resets to 0). A unit needs `⌈100 / (7 · n)⌉`
combat speed to move within `n` ticks: 1,429, 715, 477, 358, 286, 239, 205, 179,
159, 143 …

Bars are reported in hundredths of a percent (a tick is `7 × speed`, a turn
10,000). The clock counts a hundred times finer — a tick is
`7 × speed × (100 + buff %)` — so a buffed speed's tenth stays whole and every
comparison is exact.

### 3.1 Leo

Leo's passive, *Eye of the Storm* (com2us skill 7813, also on the unawakened
Dragon Knight): "The attack speed of all enemies and allies is limited to your
attack speed. This effect does not affect enemies with the same skill or Boss
Monsters." SWCalc: "If Leo exists, non-Leo monsters are capped to the lowest
Leo combat speed." On every tick, every other unit's combat speed — its buff
included — is held to the slowest Leo's current combat speed.

**Modelled:** a dungeon stage does not say which enemy is the boss, so in
dungeons no enemy is capped — the pessimistic reading. Arena has no bosses,
and the worst-case arena enemy is level with the team's first mover as the cap
leaves it (§3.2, §6).

### 3.2 Ties

**Binding norm: an exact tie on the bar between the user's team and the enemy
goes to the user's team.** The user's team is the attacker everywhere Speed
Tuning reads it — arena offence and every dungeon — and the attacker moves first
on a tie. Every figure follows from this one rule: the clock (`speed-tick.ts`),
the Enemy cut in table, the Ticks view and the enemy cut-in verdict (§7.2)
all count a level speed with the enemy as the team's.

Sources, read October 2, 2026:

- SWGT, *How to use the Speed Tick Bracket Calculator* (swgt.io/faq/39):
  "same speed unit on offense and defense, offense will go first."
- Ellia's Wiki, *Attack Bar* (elliabot.neocities.org/game_mechanics/attack_bar/):
  on equal attack bar "the monster that is placed more left will take
  priority", and between the leftmost monsters of opposing teams "priority is
  given to the attacker (first pick in RTA)."
- SWCalc (`CALCULATION-AUTHORITY.md`) says only that the highest attack bar
  goes first and that same-priority monsters move "in the same order they were
  selected in setup"; it does not name a side, so this section decides.

**Modelled, not verified:** Ellia's wording lets field position come before
side, so an enemy placed further left than a tied ally could still move first.
The page cannot see positions on either side and follows SWGT's plain rule. An
in-game observation of an enemy winning a tie from a position further left is
to be recorded here before the code changes.

**Between the user's own monsters** a tie is settled by field position — the
monster further left moves first (Ellia; SWGT's leader-first example). The page
cannot see positions, so such a tie is reported as its own verdict — "position
decides" — and never counted as a pass; in the simulation it goes to the one
listed first. A tie-break of Leo's own beyond §3.1 (Ellia: ties after Leo moves
are broken by original speed) is not modelled.

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
not drawn: shading the ticks filled under it was tried and read as clutter.

**Modelled, unverified:** an "all allies" boost does not reach the monster
casting it, because its bar empties as its turn is taken; a boost a skill names
for the caster itself lands after that reset. An "all allies" speed buff does
include the caster.

**Auto battle decides every choice.** Speed Tuning reads a team as the game's
full auto plays it, never as a player picking targets by hand.

**One ally: the lowest attack bar.** A boost or speed buff to one ally goes to
the other ally with the lowest attack bar as the turn begins — established game
behaviour under auto battle — unless the skill's own words name its target, and
then the words decide: "the ally with the highest Attack Bar" (*Tactical Bomb*,
*Sword of Justice*) goes to the highest. The caster is never its own target. The
target is chosen once per turn, so a skill that fills a bar and grants a buff
gives both to the same ally. Level bars go to the monster listed first.

Observed October 8, 2026, in Giant's Keep on full auto, at dungeon speeds 182,
181, 176, 173 and 172: Prilea, Teshar, Konamiya — whose *Resurge* fills Teshar,
the lowest bar, having just moved — Homunculus, Lyn, then Teshar again before
Prilea. The fullest bar, modelled here before, would have filled Homunculus,
who was already past 100 %. The team table names the recipient of a member's
first turn in the tag under it: `+100 % ATB → Teshar`.

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

## 6. What the team faces

**Arena offence (4 monsters).** The worst-case enemy is the fastest one that
still cannot take the first turn: level with the team's first mover, since a
tie goes to the attacker (§3.2). Anything faster could win the opening;
anything slower cuts in no earlier. The page reports after which of the team's turns it first moves.

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

Enemy speeds are Swarfarm's per-enemy `speed`, read as dungeon speed. Each
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

The snapshot also keeps each enemy's `resist`. It is not part of the turn
order: the team overlay quotes the floor's fastest enemy and the accuracy a
monster can still use there — the highest resistance less 15, because the game
never lets a resistance fall below 15 per cent.

## 7. Judging a tune

**Binding rule: the order the user places the team in is the authority.** The
monster placed n-th must have the n-th first turn of the team, and no enemy
turn may come before it. Any other outcome is a fault, whichever monster caused
it: a first monster that moves fourth is out of place as surely as the three
that passed it. (The user's instruction, October 11, 2026. Before it, each
member looked up the order only, so a slow first monster read as in place and
only the monsters that passed it were faulted.)

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
- **Tie** — in its place only by an exact tie on the bar with a teammate.
- **Enemy cuts in** — an enemy turn comes before its first, on any stage (in
  arena the worst-case enemy, §6).

Too fast, too slow and an enemy cutting in are red. A member in its place that
an enemy cuts into leads its line with the enemy — `Enemy cuts in (stage 2) ·
moves 6th` — rather than an "In place" the red would contradict; a member out
of place names the enemy last. A tie is yellow: both members of a tie say which
teammate they are tied with and that position decides, without a tuning
suggestion on the verdict line. A tie is not counted as out of place on the
team summary; when it is the only concern, the summary names the tie and shows
a green check. A team with any member out of place, or any enemy that can cut
in, has a red cross. A saved team always has a green check or a red cross.

With *No speed tuning* selected, the team's own first-turn order still decides
the summary and its mark. The summary keeps the order verdict, followed by
` · No speed tuning` instead of an enemy cut-in verdict; enemy turns are not
counted in this reading.

**Where it moves.** The verdict names a member's absolute place on the field,
`moves 5th`, with every turn before it counted — enemy turns and a teammate's
second turn alike. A member boosted into a second turn before the whole team
has had a first names both: `moves 2nd and 4th`. The places are read on the
worst stage, the one whose first enemy turn comes earliest (in arena the one
worst-case enemy; with no enemies, the team alone), and the Ticks view opens on
that stage, so every number on a verdict is a numbered disc there. The place
judged is the rank among first turns, read on the team alone; the absolute
place only says where on the field that turn falls.

### 7.1 The interval — between the neighbours

**Binding rule: a member's interval is the display speeds at which its first
turn comes strictly after that of the member placed just above it and
strictly before that of the member placed just below it, every other member at
the display speed it has now — its what-if where one is typed.** Both places
that offer display speeds quote it: the overlay's *Interval* column, beside
display speed, and the `needs … display speed` on the verdict line, which
quotes it only where the current value lies outside it. They cannot disagree,
because they are the same figure.

The interval answers one question: where this monster fits between the two
beside it, as they stand now. It is not the speed the monster would need for
the whole team to come right, and it does not look past its two neighbours; a
neighbour out of its own place says so on its own line, with its own interval.
Enemies play no part in it — an enemy that gets in is a fault of its own
(§7) — and neither does any member but the two neighbours, except through the
clock: their boosts and buffs still move the bars.

A tie with either neighbour counts against a value: no order may hang on field
position the page cannot see. The first member has nobody above it, so its
interval is open — `xx+`, faster always fits; the last has nobody below it.

Every display speed from bare runes up to the highest a what-if takes is run
on the team's clock, so boosts, buffs, Leo's cap and rounding are answered by
the one implementation, with nothing restated. A boost aimed at the lowest bar
can make a faster monster move later, so the values that fit may lie in more
than one stretch; the stretch holding the member's current value is shown, or
failing that the stretch nearest it. The interval is shown as `xx – yy`, `xx+`
where the stretch reaches the highest display speed, or a dash where no display
speed puts the member between its neighbours — for instance where the one
above is slower than the one below.

**Superseded.** Until October 11, 2026 the interval was a top-down tuning
range: the display speeds that kept a member behind every monster above it
*and* left every monster below a place with no enemy getting in, so that typing
each member's value in turn from the top ended in a perfect team. It read
enemies and the whole team, and with them was hard to read: a slot could show a
dash because of a monster three places down. The user replaced it with the
neighbour interval above.

The verifier (`verify:speed-tick`) re-reads every sampled team off its own
trace, apart from the module: each member is too fast or too slow exactly when
its first turn ranks elsewhere than its place; and for a third of the sweep
each interval is typed in across its width, both edges included, and one
display speed past either edge must not fit, while a dash must not fit at a
spread of values.

The interval is searched only in the overlay, which shows it; the page reads
every team at once without it.

### 7.2 Enemy cut in

**Enemy cuts in** — a member an enemy has a turn before is red (§7). It reads
the same traces as the Enemy cut in table: `Enemy cuts in (stage 2)` in a
dungeon, `Worst-case enemy cuts in` in arena. It replaced *slower than the
fastest enemy*, a speed comparison that a boost could contradict.

**Enemy can cut in** — on the team summary, an enemy turn comes before the
team's last first turn, read off the very traces the Ticks view draws, boosts,
buffs and Leo's cap included. It fails the team in arena and on any dungeon
stage. A dungeon stage's enemies may be faster than any build; the page still
says so in red, because the order placed is then not the order the battle
plays.

## 8. Data sources

`scripts/refresh-swarfarm-speed-data.mjs` (`npm run refresh:speed-data`) writes
`app/data/swarfarm-speed-skills.json` (leaders and skills; loaded by the Speed
Tuning page only) and `app/data/swarfarm-speed-dungeons.json` (dungeon floors;
small, read wherever a saved team is validated). It is a manual maintenance
command with a three-second pause between requests and never runs in the app.
