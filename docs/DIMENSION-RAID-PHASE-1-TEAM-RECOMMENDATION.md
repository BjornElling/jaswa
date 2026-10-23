# Dimension Raid Phase 1 team recommendation

**Reviewed:** October 24, 2026

**Account reference:** JASWA Helper — roster overview imported October 23, 2026

**Scope:** One Phase 1 team with one monster of each element, excluding every
monster shown in the current Phase 2 and Phase 3 presets. Rune assignments are
out of scope; this is a team to test, not a verified clear.

## First team to test

Try **Shaina #1, Talia #1, Hraesvelg, Amarna and Hellea**. The lineup has one
monster of each element and uses none of the monsters reserved by the shown
Phase 2 and Phase 3 teams.

One earlier reason for this lineup was wrong: **Shaina and Talia do not team up
with each other.** Their ally attack requires a Boomerang Warrior, and this
five-monster team has none. Keep them only for their separate skills; do not
count a twin combo or its extra hits as part of the plan. [Shaina's skill
description](https://swarfarm.com/bestiary/21902-fire-chakram-dancer-shaina/),
[Talia's skill description](https://swarfarm.com/bestiary/21901-water-chakram-dancer-talia/)

| Monster | Element | Job in this team | Why it earns the slot |
| --- | --- | --- | --- |
| **Shaina #1** | Fire | Repeated defense-break pressure | Her passive weakens Defense with each attack. This is useful setup for Talia, but it is not a team-up. |
| **Talia #1** | Water | Main single-target damage | Her third skill hits harder against a weakened target below half HP. Her second skill cleanses herself, raises her Attack, and grants another turn. |
| **Hraesvelg** | Wind | First-cycle team buff and damage | His third skill raises the team's Attack and Attack Speed for two turns. Berserk raises his damage and speed while lowering his Defense, so keep him sturdy. |
| **Amarna** | Light | Cleanse, healing and recovery | His third skill removes harmful effects from the whole team, heals, and can revive fallen allies. He also brings defense break and Brand. |
| **Hellea** | Dark | Brand and defense break | Her third skill applies both to the boss, giving Talia a better damage window. |

The current Phase 2 and Phase 3 teams reserve Icaru (2A), Kro (2A), Raoq
(2A), Fran, Loren, Carcano, Darion (2A), Veromos, Riley and Laika. The
recommendation uses none of them. Com2uS says duplicate monsters cannot be
used across the three phases. [Dimension Raid announcement](https://summonerswar.com/en/skyarena/news/list/4419?category=update&page=1)

## Leader choice

Dimension Raid is treated as **Raid** for leader skills in JASWA. General and
element leader skills count; Dungeon and Guild leader skills do not
(`SPEED-TICK-CANONICAL.md` §2.2). The leaders on this five-monster shortlist
therefore do not offer a team-wide Attack boost:

| Leader | Skill | Reach in this team | Recommendation |
| --- | --- | --- | --- |
| **Amarna** | +25% Defense, General | All five | Default for the first stability test. |
| **Hellea** | +30% Attack, Dark | Hellea only | Try if the team survives comfortably and damage is the bottleneck. |
| **Shaina** | +33% Attack, Dungeons | None in Dimension Raid | Do not count this lead here. |
| **Talia** | +24% Critical Rate, Dungeons | None in Dimension Raid | Do not count this lead here. |
| **Hraesvelg** | +33% Attack, Guild | None in Dimension Raid | Do not count this lead here. |

For this exact five, **Amarna is the useful all-team lead**; Hellea is the
offensive alternative for one monster. A stronger roster-specific Attack
leader cannot be named from the lineup and reservation list alone. Any
replacement has to be owned, meet the live Phase 1 entry condition, preserve
one monster per element, and not be reserved by Phase 2 or 3. Do not treat
Shaina's Dungeon lead as an active Raid lead.

## Speed and turn order

Aim for this **display speed ladder**, highest first. It gives every monster a
first turn before the boss while leaving **exactly 5 display speed between each
pair** for rune adjustment:

| Monster | Display speed target | Approx. combat speed with level-20 Totem | First-cycle job |
| --- | ---: | ---: | --- |
| **Hraesvelg** | **200** | **216** | Open with the team Attack and Attack Speed buff. |
| **Hellea** | **195** | **211** | Apply Brand and Defense break. |
| **Shaina #1** | **190** | **206** | Add Defense-break pressure. |
| **Talia #1** | **185** | **201** | Take the damage turn after the setup. |
| **Amarna** | **180** | **195–196** | Close the opening sequence; cover recovery after the boss responds. |

The combat-speed estimates assume a level-20 Sky Tribe Totem (+15%), Amarna's
Defense lead, no speed leader, and no Hraesvelg buff yet. The only range is
Amarna's one-point Swift display-rounding difference. Actual combat speed also
depends on the account's Totem and engraved runes; use JASWA's combat-speed
reading for each finished build. The display targets themselves are already
well above the boss's **community-reported combat speed of 150**, even before
the Totem is added. Com2uS has not published that speed, so treat the first
battle as confirmation. [Phase 1 team report](https://www.reddit.com/r/summonerswar/comments/183g8ik/dimensional_raid_1_team_4_dimensions/),
[Hraesvelg stats](https://swarfarm.com/bestiary/18803-wind-barbaric-king-hraesvelg/),
[Hellea stats](https://swarfarm.com/bestiary/10505-dark-harpy-hellea/),
[Shaina stats](https://swarfarm.com/bestiary/21902-fire-chakram-dancer-shaina/),
[Talia stats](https://swarfarm.com/bestiary/21901-water-chakram-dancer-talia/),
[Amarna stats](https://swarfarm.com/bestiary/20404-light-anubis-amarna/)

Keep at least 5 display speed between adjacent monsters if a rune swap changes
the totals, and keep Amarna at 180 or higher so the whole team retains its
first-turn margin. This is the intended opening speed order, not a promise
about which skill Auto will choose. Hraesvelg's Attack Speed buff and Berserk
change turn order after his opening move, so confirm the first cycle in battle.

Set the game's **Attack Order** separately: it controls target priority, not
which monster moves first. For Phase 1, make the boss the priority target, then
follow any target the fight explicitly requires. Com2uS added Attack Order for
Phases 1 and 3. [v8.0.9 update notice](https://summonerswar.com/en/skyarena/news/list/4420)

Display speed and combat speed are different figures. JASWA models combat speed
from base speed, Totem, a leader that counts in Raid, Swift and engraved rune
SPD, then advances the Raid clock in 4.5% ticks (`SPEED-TICK-CANONICAL.md`
§§1–3). Its PvE database has no Dimension Raid boss speed (`PVE-STAGES.md`
§§2–3), so 150 remains the community report above, not a JASWA enemy record.

## Entry condition

Phase 1 inherits the entry condition of the Dimension Hole area hosting the
raid, and that condition rotates. The account reference suggests Karzhan's
default-four-star cap, but the condition is not shown here. The proposed five
meet that cap: Shaina, Talia, Hraesvelg and Amarna are default four-star;
Hellea is default three-star. Check the live condition before using this team
after a rotation. [Com2uS on Phase 1's rotating condition](https://summonerswar.com/en/skyarena/news/list/4419?category=update&page=1),
[Com2uS on Karzhan's four-star cap](https://sw.com2us.com/en/skyarena/news/list/1890?category=update&page=1)

## First-run check

Start with Amarna as leader and use the speed ladder above. Record whether all
five get their first turn before the boss, Hraesvelg buffs before the damage
turns, Hellea's Brand and Defense break land before Talia, and the boss's
hit-triggered response puts a dangerous monster at risk. If survival is
comfortable but damage is short, test Hellea as leader. Change one choice at a
time and keep the result provisional until the Phase 1 run is observed.
