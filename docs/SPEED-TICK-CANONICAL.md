# Speed and turn order — canonical rules

**Status:** Binding rule basis for JASWA Speed Tuning
**Reviewed:** September 24, 2026
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
else: base speed, Swift, totem and leader stay the monster's own.

## 2. Combat speed

Without a speed buff:

    S = ⌈ B · (1 + t + l + s) + b ⌉

With a speed buff:

    S = ⌈ (B · (1 + t + l + s) + b) · 1.3 ⌉

- `B` is base speed, `b` all flat speed on runes (main, innate, substats and grinds).
- `t` is the Sky Tribe Totem, `l` the leader skill, `s` Swift (0.25 with four
  Swift pieces, otherwise 0). All three are fractions of **base** speed and add.
- **One rounding up, over the whole sum.** No term is rounded on its own.

Sources: Ellia's Wiki, *Attack Bar* (elliabot.neocities.org/game_mechanics/attack_bar/);
SWSpeedTuner's source (`Math.ceil((1.15 + lead/100) * base + runeSpeed)`). Both
agree. SWLens contradicts itself on the totem and is not used.

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

Read from Swarfarm (`leader_skill` with `attribute: "Attack Speed"`). Where one counts:

| Area | Arena | Dungeons |
| --- | --- | --- |
| General | yes | yes |
| Arena | yes | no |
| Dungeon | no | yes |
| Guild | no | no |
| Element | on monsters of that element | on monsters of that element |

Source: fandom *Leader Skill*. "Dungeon" covers the Cairos dungeons, which is
where Swarfarm files all seven tuned dungeons. The leader is chosen per team and
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

Bars are held in hundredths of a percent (a tick is `7 × speed`, a turn
10,000), so every comparison is exact.

**Ties.** An exact tie is settled by field position: the monster further left
moves first (Ellia; SWGT). The page cannot see positions, so a tie is reported
as its own verdict — "position decides" — and never counted as a pass. In the
simulation a tie goes to the enemy (the pessimistic reading) and between allies
to the one listed first. Leo's special tie rule is not modelled.

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

**Modelled, unverified:** an "all allies" boost does not reach the monster
casting it, because its bar empties as its turn is taken; a boost a skill names
for the caster itself lands after that reset. An "all allies" speed buff does
include the caster. A single-target boost or buff goes to the ally closest to
its turn (the fullest other bar), which is how a booster is used.

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
- "fills up the Attack Bar" or "to the MAX" is a full bar;
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
still cannot take the first turn: one arena speed below the team's first
mover. Anything faster could win the opening; anything slower cuts in no
earlier. The page reports after which of the team's turns it first moves.

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

## 7. Judging a tune

The user's order is strict: monster A before monster B means A's first turn
comes before B's. Per member, against every other member:

- **In place** — every relation holds, with no tie and, where asked, the margin.
- **Too slow / too fast / out of order** — a relation fails.
- **Tie** — a relation holds only by an exact tie on the bar.
- **Margin** — in order, but a neighbour given `margin` more combat speed
  would pass it. The margin is combat speed; the interval is display speed.

Each member out of place gets its own interval of display speeds: every whole
display speed from bare runes to 999 is run through the clock with the others
held where they are, and the passing run nearest the current value is printed.
"No display speed fixes this on its own" means no value of that monster alone
does. The verifier confirms every printed interval at both edges.

## 8. Data sources

`scripts/refresh-swarfarm-speed-data.mjs` (`npm run refresh:speed-data`) writes
`app/data/swarfarm-speed-skills.json` (leaders and skills; loaded by the Speed
Tuning page only) and `app/data/swarfarm-speed-dungeons.json` (dungeon floors;
small, read wherever a saved team is validated). It is a manual maintenance
command with a three-second pause between requests and never runs in the app.
