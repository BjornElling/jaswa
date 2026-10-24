# Always-on passive stat bonuses

**Status:** Binding rule for passive stat additions
**Reviewed:** October 24, 2026
**Game:** *Summoners War: Sky Arena*
**Data reviewed:** Swarfarm monster and skill API snapshot, retrieved October 24, 2026
**Code:** `app/lib/passive-stat-bonuses.ts`, resolved by `app/lib/team-leads.ts` and applied by `app/lib/monster-stats.ts`
**Check:** `npm run verify:passive-stat-bonuses`

This document decides which automatic passive effects enter JASWA's fight
figures and why. A lead is not the only source of a stat a monster fights with.
The same resolved bonuses feed the profile, Monster Stats, Rune Optimization,
and the optimization shader.

## 1. Rule

Include a passive when it makes a supported stat higher by a fixed amount from
the start of the fight, or when its automatic battle-start rule has a fully
specified calculation. Apply it to the monster that owns the passive. Apply a
team passive only to the teammates named by the skill.

The automatic addition does not include an effect that needs an attack, a turn,
damage, a stack, an HP or buff condition, or another in-fight event to become
active. Where a skill combines a fixed start-of-fight bonus with a conditional
one, include only the fixed portion. A battle-start effect counts as automatic
when the game applies it without a player action and its target and calculation
are known.

The eight supported figures are HP, ATK, DEF, SPD, CRI Rate, CRI Dmg, RES and
ACC. Damage modifiers, immunity, attack bar, healing and effects on an enemy's
stats are not additions to one of those figures.

## 2. Shaina and Boomerang Warriors

Shaina's passive gives Shaina **+25 ACC points**. If at least one Boomerang
Warrior is in the same preset, each Boomerang Warrior in that preset also gets
**+25 ACC points**. The same +25 applies to every Boomerang Warrior; it does not
multiply by the number of Boomerang Warriors. Other teammates get none of this
bonus.

Scenario has no team, so it applies Shaina's personal +25 ACC and no aura to
other copies in the account. A preset reads only its own members. A Shaina in a
different preset, or in another deck of a multi-deck battle, is not silently
treated as a teammate.

This follows the passive wording and its target family. The game's 2021 balance
history also records a fix for the old behaviour that gave Shaina's ACC to
unrelated allies: [SWGT's Shaina page and balance history](https://swgt.io/monsterSearch/?com2usID=21912).
The passive and its automatic effect are also recorded by
[SWMasters](https://www.swmasters.com/shaina-fire-chakram-dancer).

## 3. Included passives

The amounts below are the additions after the passive has been awakened where
the game has separate pre-awakening, awakened and second-awakening forms. A
pre-awakening form is included where the API assigns it the same passive. A
second-awakening value replaces the earlier value; it is not added on top.

| Monster form(s) | Master ID(s) | Passive skill ID | Included effect |
| --- | --- | --- | --- |
| Bremis | 10812 | 1712 | CRI Dmg +50 points |
| Rizak | 10915 | 1915 | RES +50 and ACC +50 points |
| Dark Hellhound; Shumar | 10605, 10615 | 1515 | SPD +15. Shumar's additional HP-dependent SPD is excluded. |
| Second-awakened Shumar | 10635 | 1565 | SPD +25. This replaces +15; HP-dependent SPD and conditional CRI Rate are excluded. |
| Huga | 14811 | 5411 | CRI Rate +15 and CRI Dmg +30 points |
| Light Griffon; Shamann; second-awakened Shamann | 11504, 11514, 11534 | 2514, 2564 | RES +20 points |
| Dark Griffon; Varus; second-awakened Varus | 11505, 11515, 11535 | 2515, 2565 | DEF +50% of base DEF |
| Light Lizardman; Glinodon | 17804, 17814 | 8714 | CRI Rate +20 and CRI Dmg +20 points |
| Wind Magical Archer; Ardella | 15403, 15413 | 6813 | CRI Rate +25 points. HP-dependent CRI Dmg is excluded. |
| Wind Minotauros; Eintau | 17703, 17713 | 8613 | ATK +50% of base ATK |
| Dark Minotauros; Kamatau | 17705, 17715 | 8615 | ATK +100% of base ATK. HP-dependent extra ATK is excluded. |
| Water Ninja; Susano | 13501, 13511 | 4811 | RES +50 points |
| Dark Phantom Thief; Guillaume | 14105, 14115 | 5715 | CRI Dmg +100 points |
| Fire Chakram Dancer; Shaina | 21902, 21912 | 12612 | ACC +25 points on Shaina; Shaina's same-preset Boomerang Warrior rule is in §2. |
| Onimusha; Kaki | 25102, 25112 | 15012 | At battle start, DEF gains 20% of the resulting ATK figure. |
| Paladin; Leona | 21805, 21815 | 12515 | At battle start, ATK and DEF both become the higher of their two resulting figures. |
| Unawakened and awakened Dark Inosuke Hashibira | 32105, 32115 | 21515 | At battle start, ATK +30% of base ATK and CRI Rate +20 points |
| Unawakened and awakened Dark White Tiger Blade Master | 32805, 32815 | 22115 | At battle start, ATK +30% of base ATK and CRI Rate +20 points |

CRI Rate, CRI Dmg, RES and ACC amounts are percentage points, as the game's
stat panel expresses them. ATK, DEF and SPD additions stated as a share of base
are summed with other battle percentages before the game's rounding. Shumar's
flat SPD is kept equivalent to the same integer addition after speed rounding.

## 4. Reviewed, not added

The review used every monster form and every skill marked passive in the
Swarfarm API snapshot: 3,099 forms, including 1,987 marked obtainable, and 852
passive skill records. A stat-name search produced the candidate set; each
candidate was read as a whole skill, including its target, trigger, duration,
and whether it changes a figure or only damage. A skill was not included just
because the description contains a stat word.

| Passive candidates reviewed | Decision |
| --- | --- |
| Gamir; Grotau; GingerBrave; Thomas | ATK or SPD changes with HP condition. The value changes during the fight. |
| Jumaline; Amelia; Erwin; Shumar's second-awakening CRI clause | CRI Rate, DEF, ATK, SPD or CRI Rate changes after a critical hit, an attack, or being attacked. |
| Elpuria; Antares; Artamiel; Jager; Mei Hou Wang; Narsha; Suiki; Mayasura | Stats stack or change after a turn, attack, ally event or passive activation. |
| Perna; Antares; Astar; Jaara; Carbine; Magnum; Hwoarang; Taebaek; Legolas; Elder Horn | A stat bonus is granted after revival, damage, a hit, a turn or a critical attack, often for a duration or until a cap. |
| Crane; Chilling; Misty; Elsharion; Wedjat | The amount depends on current buffs, debuffs, ally state or events. Wedjat's HP effect also scales by the number of harmful effects. |
| Skogul; Alesia; Cyborg | A stat changes with a weapon or debuff state; it is not a fixed start-of-fight addition. |
| Dova; Frodo; Silver Tail | A battle-start or turn-start event chooses a temporary ATK, Recovery or Endure buff from an ally's state, or requires a condition. These are timed buffs, not constant passive stat additions. |
| Iron and other Living Armor forms | HP scales from the DEF at battle entry, but the skill record provides no coefficient or exact rounding rule. No coefficient is guessed. |
| Fire Ciri; Reyka | CRI Rate scales with SPD and overflow becomes CRI Dmg. The available data confirms the relationship but not a game-authoritative coefficient and rounding rule; no ratio is guessed. |
| Wind Chun-Li | The passive changes the attack's SPD-based damage multiplier, not the eight stat figures that this section adds. It remains in damage mechanics. |
| All remaining passive candidates | They do not add a supported stat, affect only damage or attack bar, heal, grant protection or immunity, or change an enemy. They do not belong in a stat-addition list. |

The omissions above are deliberate, visible boundaries. If a verified game
rule later supplies a missing formula or trigger model, add it here and to the
single shared stat calculation before any page uses it.

## 5. Sources and check

The passive descriptions and monster-form mappings were read from the
[Swarfarm passive-skill API](https://swarfarm.com/api/v2/skills/?passive=true&page_size=100)
and [monster API](https://swarfarm.com/api/v2/monsters/?page_size=100). The
snapshot date and counts are recorded above so the review has a reproducible
scope. Shaina's target family and the balance correction are cross-checked
against the game profile and history linked in §2.

`npm run verify:passive-stat-bonuses` checks the shared arithmetic against the
listed forms. The Playwright test `tests/automatic-passive-stat-bonuses.spec.ts`
checks Shaina alone, with one and with two Boomerang Warriors, and an unrelated
teammate. `npm run verify:rune-optimization-layout` and
`npm run verify:rune-optimization-card` check the processor and graphics-card
readings of the same figures.
