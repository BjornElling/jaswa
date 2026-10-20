# Solo R5 speed-team recommendation

**Account snapshot:** JASWA Helper — Steam, imported October 20, 2026

**Scope:** Three distinct six-monster teams for one Solo Rift Raid 5 run. No team uses a planned death or revive loop.

## Recommendation at a glance

  | Team | Leader    | Main idea                                                | Frontline / backline |
  | ---- | --------- | -------------------------------------------------------- | -------------------- |
  | 1    | Theomars  | Fran first, Darion protection, Miriam, Brandia/Baleygr   | 4 / 2                |
  | 2    | Tesarion  | Riley first, four-monster frontline, Hwa and twin damage | 4 / 2                |
  | 3    | Akhamamir | Colleen first, Loren S1 control, Icaru–Raoq team-ups     | 4 / 2                |

All 18 selected monsters are in the imported account and are six-star, level 40. The teams are built for simultaneous use, so keep their rune assignments disjoint during the raid. Runes can be moved between presets before or after the run; one rune cannot serve two of these teams at once.

**The three leader skills are shared across all 18 monsters in R5.** Select Theomars, Tesarion and Akhamamir as the three team leaders: their distinct general leads give the whole raid +24% Critical Rate, +41% Resistance and +24% Attack Speed. The three bonuses stack because they affect different stats. Raid leaders are chosen one per team; they are not team-local. Ally buffs such as Miriam's passive-enhanced buffs remain within the six-monster team that casts them, while harmful effects on the boss are shared across the raid. The boss's three heads have separate attack bars and each attacks the team facing it; do not treat ATB control as one shared raid-wide bar. [Com2uS raid announcement](https://m-mercury.qpyou.cn/custom/board_detail/4), [Rift of Worlds guide](https://summonerswarskyarena.info/rift-of-worlds-analysis-and-basic-guide-by-xelnecra/)

This is a speed-oriented recommendation with a safety margin, not a claim that the exact 18 builds have already been solved rune-by-rune. The current import contains 1,445 six-star runes; JASWA's provisional rune-efficiency estimate has a median of 92 and a 25th percentile of 81. That is a healthy pool, but a set label is never worth weakening a monster's required EHP or speed. The estimate is only a sorting aid, not an official game score.

The R5 guide's starting survival marks are 25k HP / 1.5k DEF for a two-monster frontline, 22k / 1.3k for a four-monster frontline, and 20k / 800 DEF for the backline. I use those as raw minimums, then assign different EHP margins by role: damage dealers stay close to the relevant floor so their runes can favor damage, while protection and control units get more bulk. A four-front damage dealer still needs real frontline stats; this is not permission to build a glass cannon. The boss's frontline Crush ignores beneficial effects, so Will is not a substitute for bulk. [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide)

## Speed tuning

The R5 boss is commonly listed at 192 combat SPD, 30% RES and 0% ACC. Each head has its own attack bar and faces one six-monster team; the boss's HP and harmful effects are shared. Build and check each six-monster speed order against that team's head independently. The +24% speed lead is shared, but a turn or ATB change on one head is not a turn on the other heads. The targets below use the account's level-20 Sky Tribe Totem (+15%) and Akhamamir's shared +24% Attack Speed lead for every team. Speeds in the team columns are **display SPD**: the figure on the monster panel after runes, including any Swift-set bonus. Where a Swift set changes the minimum panel figure by one point, the table gives the Swift target first and the non-Swift figure in parentheses. Combat SPD is calculated with the exact raid formula for the listed base SPD and rune set; recheck final engraved runes with JASWA's Raid speed tuner. [R5 boss stats](https://theriagames.com/guide/summoners-war-chaos-beast-guide/), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4), [JASWA speed rules](SPEED-TICK-CANONICAL.md)

The R5 clock advances in 4.5% ticks. Every monster below is tuned above the boss's 192 combat SPD, with each team's last mover at 197 or faster. This gives every team a first-turn margin against its own head; it does not replace the EHP and cleanse requirements or guarantee that a run cannot fail to RNG. [SWMasters boss mechanics](https://www.swmasters.com/blog/r5-guide)

### Team 1 — Theomars lead

Move order by **display SPD**, fastest first:

  | Order | Monster           | Placement |  Display SPD target | Raid combat SPD |
  | ----: | ----------------- | --------- | ------------------: | --------------: |
  |     1 | Fran              | Front     |                 187 |             227 |
  |     2 | Darion (2A)       | Front     | 178 (177 non-Swift) |             216 |
  |     3 | Miriam            | Front     | 175 (174 non-Swift) |             215 |
  |     4 | Brandia           | Back      |                 166 |             210 |
  |     5 | Theomars (Leader) | Front     |                 163 |             202 |
  |     6 | Baleygr           | Back      |                 157 |             197 |
  |     — | R5 boss           | —         |                   — |         **192** |

Theomars is Team 1's selected leader, but his general +24% Critical Rate lead applies to all 18 monsters. Damage dealers therefore target 76% Critical Rate on their info panel before the battle lead; Theomars's own awakening bonus counts toward his panel figure. [Theomars leader and skills](https://swarena.gg/monster/theomars)

  | Monster     | Recommended runes and slot 2 / 4 / 6                                          |       ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                                    |
  | ----------- | ----------------------------------------------------------------------------- | --------: | ----------------------: | ---------------------------: | ---------------------------------------------------------------------------------- |
  | Fran        | Swift / Will; SPD / HP% / HP%                                                 |       15% | 29% panel + shared lead |       ≥145k, front-4 support | Heal/cleanse reliability, then extra HP and DEF                                    |
  | Darion (2A) | Fight / Fight / Tolerance preferred; Swift / Will if needed; SPD / HP% / DEF% |       15% | 29% panel + shared lead |          ≥175k, front-4 tank | His 2A passive makes him take 15% more damage; EHP and RES first, then ACC         |
  | Miriam      | Swift / Will or Guard / Will; SPD / HP% / DEF%                                | 0% needed | 29% panel + shared lead |       ≥145k, front-4 support | EHP and RES, then HP / DEF; keep her alive for the passive                         |
  | Brandia     | Rage / Will; SPD / CD% / ATK%                                                 |       15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR with shared lead, then CD and ATK; max skill-ups before premium runes |
  | Theomars    | Vampire / Will; SPD / CD% / ATK%                                              |       15% | 29% panel + shared lead | ≥130k, front-4 damage dealer | EHP, then 76% panel CR, ACC and damage; Vampire helps him sustain the frontline    |
  | Baleygr     | Rage / Will; SPD / CD% / ATK%                                                 | 0% needed |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR with shared lead, then CD and ATK; max his damage skills              |

This keeps the proposed Miriam / Theomars / Brandia / Baleygr core and adds Darion for frontline mitigation. Fran is the first mover and attack buffer; her cleanse and healing add a safety valve, while Miriam strengthens this team's buffs only. Theomars is the one damage dealer placed in the four-monster frontline and must reach its EHP target. This is not the Baleygr–Janssen strategy: no unit is expected to die, and Janssen is not used. [Miriam's passive](https://www.sw-database.com/miriam)

### Team 2 — Tesarion lead

Move order by **display SPD**, fastest first:

  | Order | Monster           | Placement | Display SPD target | Raid combat SPD |
  | ----: | ----------------- | --------- | -----------------: | --------------: |
  |     1 | Riley             | Front     |                187 |             226 |
  |     2 | Hwa               | Front     |                180 |             221 |
  |     3 | Tesarion (Leader) | Front     |                175 |             214 |
  |     4 | Sabrina           | Back      |                169 |             209 |
  |     5 | Talia             | Back      |                162 |             203 |
  |     6 | Dias              | Front     |                157 |             197 |
  |     — | R5 boss           | —         |                  — |         **192** |

Riley, Hwa, Tesarion and Dias form a four-monster frontline; Sabrina and Talia stay in the back. This accepts a small rune-cost increase on Hwa and Tesarion to gain more shared frontline protection and spread frontline damage across four members. Riley moves first and brings the team's attack buff and cleanse/healing. Tesarion is Team 2's selected leader, but his general +41% Resistance lead applies to all 18 monsters: aim for 29% RES on the info panel before the lead, giving about 70% in combat. This is a target, not immunity to debuffs. [Tesarion leader skill](https://swarena.gg/monster/tesarion), [Com2uS frontline rules](https://m-mercury.qpyou.cn/custom/board_detail/4)

  | Monster  | Recommended runes and slot 2 / 4 / 6                                                    |                             ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                               |
  | -------- | --------------------------------------------------------------------------------------- | ------------------------------: | ----------------------: | ---------------------------: | ----------------------------------------------------------------------------- |
  | Riley    | Violent / Will or Swift / Will; SPD / HP% / HP%                                         |                       0% needed | 29% panel + shared lead |     ≥145k, front-4 protector | SPD and EHP first, then skill-up her cleanse/heal                             |
  | Hwa      | Rage / Will; SPD / CD% / ATK%                                                           | 15% total (awakening covers it) |        29% if efficient | ≥130k, front-4 damage dealer | 76% panel CR and required frontline EHP; then speed and damage                |
  | Tesarion | Rage / Will; SPD / CD% / ATK%                                                           | 15% total (awakening covers it) |        29% if efficient | ≥130k, front-4 damage dealer | 76% panel CR and required frontline EHP; then speed and damage                |
  | Sabrina  | Rage / Will; SPD / CD% / ATK%                                                           |                             15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR, then speed, ACC and damage; retain enough bulk for the backline |
  | Talia    | Rage / Will; SPD / CD% / ATK%                                                           |                             15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR, then speed and damage; do not build her as a glass cannon       |
  | Dias     | Fight / Tolerance / Will preferred; Revenge / Will if aura is covered; SPD / HP% / DEF% |                             15% | 29% panel + shared lead |          ≥150k, front-4 tank | EHP, then ACC and enough SPD to meet 157; his passive reduces incoming damage |

Hwa is here for the R5-specific attack-speed slow and attack-bar reduction as well as damage. Com2uS says harmful effects are shared but each head has a separate bar; from that distinction, I treat the lasting speed-slow debuff as shared and Hwa's immediate attack-bar reduction as local to this team's head. Riley supplies the team cleanse, healing and attack buff; Dias adds mitigation and multiple debuffs. The twin pair supplies the main repeated damage. The four-member frontline spreads incoming frontline damage and shields the backline from area damage; all four still need to meet the four-front raw HP/DEF minimums. [Hwa and Dias in R5](https://www.swmasters.com/blog/r5-guide), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4)

### Team 3 — Akhamamir lead

Target **display SPD** and first-turn order (Colleen's ATB effect included):

  | Order | Monster            | Placement |  Display SPD target | Raid combat SPD |
  | ----: | ------------------ | --------- | ------------------: | --------------: |
  |     1 | Colleen (2A)       | Back      |                 214 |             255 |
  |     2 | Amarna             | Front     | 213 (212 non-Swift) |             252 |
  |     3 | Loren              | Back      |                 200 |             240 |
  |     4 | Icaru (2A)         | Front     |                 196 |             239 |
  |     5 | Raoq (2A)          | Front     |                 188 |             231 |
  |     6 | Akhamamir (Leader) | Front     |                 174 |             213 |
  |     — | R5 boss            | —         |                   — |         **192** |

Akhamamir is Team 3's selected leader, and his general +24% Attack Speed lead applies to all 18 monsters. Colleen is first so the team's attack buffer opens the turn order; her 2A S3 also boosts the attack bar of allies at full HP, so the speed targets are intended to preserve the listed sequence with that skill effect active. Amarna follows with cleanse and healing. The last mover remains above this head at 192 combat SPD. Loren is tuned just ahead of the team-up units: she can attempt her own S1's three hits early, and if Icaru or Raoq selects her or Colleen, their useful multi-hit S1 effects can be activated repeatedly. Loren's hits also trigger her passive's attack-bar reduction and DEF-break attempts. [Akhamamir leader and R5 role](https://www.sw-database.com/akhamamir), [Loren's S1 and passive](https://www.sw-database.com/loren-light-cowgirl), [Colleen's 2A skills](https://www.sw-database.com/colleen)

  | Monster      | Recommended runes and slot 2 / 4 / 6                                              |                             ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                                           |
  | ------------ | --------------------------------------------------------------------------------- | ------------------------------: | ----------------------: | ---------------------------: | ----------------------------------------------------------------------------------------- |
  | Colleen (2A) | Swift / Fight preferred; Swift / Will if aura is covered; SPD / HP% / HP% or DEF% |                             15% | 29% panel + shared lead |           ≥90k, back support | Heal/attack-buff uptime, then EHP and resistance; finish skill-ups                        |
  | Amarna       | Swift / Will or Violent / Will; SPD / HP% / HP%                                   |                             15% | 29% panel + shared lead |       ≥145k, front-4 support | SPD, cleanse uptime, EHP, then ACC; keep his brand/DEF break accurate                     |
  | Loren        | Violent / Tolerance / Will; SPD / HP% / HP%                                       | 15% total (awakening covers it) | 29% panel + shared lead |           ≥90k, back control | Meet SPD/EHP; her S1/passive make her a priority helper                                   |
  | Icaru (2A)   | Guard / Determination / Violent; SPD / DEF% / DEF%                                |                             15% | 29% panel + shared lead |       ≥140k, front-4 utility | About 2,500 total DEF for two helpers if efficient; then EHP, SPD and ACC                 |
  | Raoq (2A)    | Vampire / Will preferred; SPD / CD% / HP% or ATK%                                 |                             15% |        29% if efficient | ≥130k, front-4 damage dealer | EHP first, then 76% panel CR, SPD and damage; ATK% only if EHP still clears the mark      |
  | Akhamamir    | Rage / Will; SPD / CD% / ATK%                                                     |                             15% |        29% if efficient | ≥130k, front-4 damage dealer | Frontline EHP and 76% panel CR first; then speed and damage; his S3 benefits from debuffs |

Amarna, Icaru, Raoq and Akhamamir form the four-monster frontline; Colleen and Loren stay in the backline as protected support/control. This is an intentional S1 package: team-ups can activate Colleen's multi-hit S1 for attack break and Loren's three-hit S1 for attack-bar reduction and DEF-break attempts. Loren's passive can attempt up to 60% attack-bar reduction across her three hits, with a DEF-break attempt on each hit; resistance still applies. Raoq calls two allies; Icaru calls a DEF-dependent number of allies. Helper selection is random, so the lineup makes those S1s available without guaranteeing which ally is called on a given turn. Aim for about 2,500 total DEF on Icaru to call two helpers if that target fits without weakening the build; do not chase the much higher three-helper breakpoint at the cost of good runes. [Raoq (2A) skills](https://www.sw-database.com/raoq-fire-inugami), [Icaru (2A) skills](https://www.sw-database.com/icaru-water-inugami), [community-tested Icaru DEF breakpoints](https://www.reddit.com/r/summonerswar/comments/phwb49/), [Loren's skills](https://www.sw-database.com/loren-light-cowgirl), [Colleen's skills](https://www.sw-database.com/colleen)

## Shared stat and rune rules

- **EHP and raw floors:** Use JASWA's `HP × (1142 + 3.572 × DEF) / 1000`, but do not use EHP as a substitute for the raid's raw-stat marks. All three teams use four frontliners: keep at least 22k HP / 1.3k DEF for every frontliner and 20k / 800 DEF for every backliner. Those marks correspond to roughly 127k and 80k EHP. Then target by role: 130k for a four-front damage dealer, 145k for a four-front protector/support, 150k for Dias as the key mitigation tank, 175k for 2A Darion because his passive makes him take 15% more damage, 85k for a backline damage dealer, and 90k for a backline support/control unit. The tables apply these individually. These role-tiered EHP numbers are my recommended build budget inferred from the guides' positional HP/DEF marks; they are not separate game breakpoints. The extra margin goes to units keeping the team alive; damage dealers get only a modest buffer above their positional floor, not an arbitrary tank target. Never lower HP or DEF to hit a combined EHP number: the boss's frontline Crush gets more dangerous as DEF falls and ignores beneficial effects. Four frontliners also protect the backline from area damage and spread incoming frontline damage. [JASWA calculation authority](CALCULATION-AUTHORITY.md), [Darion's 2A passive](https://www.sw-database.com/darion), [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide)
- **ACC:** Aim for 15% total panel accuracy on monsters that must land debuffs. Awakened bonuses count toward the total: Hwa, Tesarion and Loren already exceed it and need no rune ACC. Do not keep adding ACC past 15% for this boss. Pure buff/heal units can leave ACC at zero if their attacks do not supply a required debuff.
- **RES:** All 18 monsters receive Tesarion's shared +41% RES lead. Aim for 29% panel RES (about 70% in battle) on frontline monsters, healers and cleansers. A Tolerance set adds 10% RES to all six monsters on its own team; with one such set, 19% panel RES reaches the same 70% benchmark. Do not spend premium damage substats on redundant RES unless you want extra resistance. Damage dealers may trade RES for damage after reaching their EHP requirement. [Com2uS rune effects](https://www.summonerswar.com/en/skyarena/game)
- **Critical Rate:** All 18 monsters receive Theomars's shared +24% CR lead. Damage dealers target 76% panel CR; awakening bonuses are already part of the monster's panel stat. Supports that do not rely on critical damage do not need 100% CR.
- **SPD:** Every speed target includes Akhamamir's shared +24% Attack Speed lead and the level-20 +15% totem. Match the exact preferred-set display target in the tables, including the stated Swift adjustment, then verify all six members remain above their own head's 192 combat SPD in JASWA's raid tuner.
- **Sets:** Rage / Will is the first choice for the main damage dealers, not a command to accept weak Rage runes. Use a strong Fatal / Will, Vampire / Will or other stat-efficient build if it meets the speed, EHP and damage role better. Use Swift for first movers only when it is the best stat-efficient way to meet the exact target. Put Fight sets on supports or protection units when they still meet their speed/EHP targets: each 2-piece set gives all six monsters on that team +8% ATK. Aim for at least one strong Fight set per team, and a second where it does not cost a better damage or survival build. Use Tolerance similarly for a team-wide +10% RES. These team-wide set auras do not cross to the other two teams. The active attack-buff monster is first on each speed list, but Auto AI still chooses its skill; a Fight aura gives the reliable passive baseline if it does not cast the buff immediately. Will remains useful for the opening, but never at the cost of frontline EHP. [Com2uS rune effects](https://www.summonerswar.com/en/skyarena/game), [R5 Fight-set team scope](https://www.reddit.com/r/summonerswar/comments/125oa62)
- **Do not make three teams share a rune.** Solo R5 uses the three teams in one run. The account has ample Will runes; Rage is more limited, so reserve its best four-set combinations for Baleygr, Brandia and the highest-output damage dealers first.
- **Skill-ups:** Brandia currently has no skill-ups and should be max-skilled before receiving the account's best Rage set. Baleygr and Colleen (2A) are also incomplete; finish their important damage/heal skill-ups. Incomplete skill-ups make damage or debuff uptime less dependable.

## Rune-investment order: 1–18

This order reserves the best damage runes for the highest-impact dealers first, as requested. It ranks rune investment, not which monster must be built first to make the first safe test run; support EHP and speed requirements remain hard gates.

  | Rank | Monster      | Why this rune priority                                                                              |
  | ---: | ------------ | --------------------------------------------------------------------------------------------------- |
  |    1 | Brandia      | Largest debuff-scaled damage ceiling; max her skill-ups before assigning the best Rage set.         |
  |    2 | Baleygr      | Highest burst; give him the next-best offensive set while preserving backline EHP and 76% panel CR. |
  |    3 | Talia        | One of the twins' main damage sources; preserve her EHP while maximizing CD / ATK.                  |
  |    4 | Sabrina      | Twin damage and follow-up pressure; meet CR and EHP before adding more damage.                      |
  |    5 | Akhamamir    | Debuff-scaled damage and the shared SPD lead; clear front-four EHP before finishing his damage set. |
  |    6 | Hwa          | Damage plus speed slow and ATB reduction; good runes improve both damage and control.               |
  |    7 | Theomars     | Frontline bruiser and shared CR lead; EHP first, then CR and damage.                                |
  |    8 | Raoq (2A)    | Damage and two-helper team-up; front-four EHP still comes first.                                    |
  |    9 | Tesarion     | Damage against debuffed targets, with the shared RES lead; his awakening already covers ACC.        |
  |   10 | Icaru (2A)   | Team-up and DEF break; invest only if the DEF threshold does not demand weak runes.                 |
  |   11 | Loren        | Team-up S1 partner and boss control; prioritize speed, EHP and ACC over damage.                     |
  |   12 | Amarna       | Cleanse, healing and brand/DEF break make this a high-value support build.                          |
  |   13 | Colleen (2A) | Main heal, ATK buff and repeated attack-break/heal-block attempts.                                  |
  |   14 | Fran         | First mover, cleanse and backup heal; speed and EHP outrank damage.                                 |
  |   15 | Riley        | Frontline cleanse/healing anchor; speed and EHP first.                                              |
  |   16 | Darion (2A)  | Team damage reduction and DEF break; build him efficiently for front-four survival.                 |
  |   17 | Dias         | Damage reduction and useful debuffs; build to the four-front tank target.                           |
  |   18 | Miriam       | Her passive strengthens this team's buffs; the investment only pays off if she survives.            |

## Candidates considered but not selected

- **Hellea:** She is a strong alternative to Loren if you prefer direct damage, DEF break and branding over extra S1 attack-bar control. She is fully skilled in this account; use her at Loren's backline position with 199 display SPD and at least 85k EHP as a damage build, so she moves before Icaru, Raoq and Akhamamir. [Hellea skills](https://summonersky.com/monster/dark-harpy)
- **Tarq:** His team-up can add damage, and SWGT includes him in Solo R5 examples. I kept the Icaru–Raoq pair and Loren's S1 control rather than adding a third team-up unit; this leaves room for boss control and Akhamamir's damage. If using Tarq in Raoq's front-four slot, retain the 22k HP / 1.3k DEF raw floors and aim for at least 130k EHP before checking CR and run consistency. [SWGT Solo RAID examples](https://swgt.io/controllers/gameguides/soloRAID?raidID=1)
- **Shihwa:** A good R5 brand/damage candidate. Loren is selected for the extra S1 boss control in the team-up package; Shihwa can replace Loren if you prefer more damage and brand uptime, provided she reaches 85k backline EHP and the same speed target. [Shihwa R5 rating](https://www.sw-database.com/shihwa)
- **Lucas:** A legitimate beginner-R5 option with a self-generated shield, brand and conditional DEF break. Team 3 keeps Loren's S1 control and the Icaru–Raoq pair. Consider Lucas only if you are willing to drop one of those roles and he meets the 90k backline support/control EHP and speed target; his S2 needs CR to make the DEF break dependable. [SWGT Solo RAID examples](https://swgt.io/controllers/gameguides/soloRAID?raidID=1), [Lucas skills](https://swgt.io/monsterSearch/?ss=Lucas&usePublic=false)
- **Tien Qin:** His heal, anti-crit buff, ATK break and heal block are useful in a sustain team, but he has no cleanse and his +16% SPD leader is Guild-only, so it does not lead an R5 team. Riley already covers the safer cleanse/heal role in Team 2. [Tien Qin guide and leader area](https://theriagames.com/guide/summoners-war-tien-qin-light-drunken-master/)
- **Astar:** A viable damage alternative that appears in Solo R5 team examples. He trades away Loren's team-up S1 control; try him in Loren's position only if he meets 85k backline damage-dealer EHP and 200 display SPD, and the run still controls the boss reliably. [SWGT Solo RAID examples](https://swgt.io/controllers/gameguides/soloRAID?raidID=1)
- **Ken:** Strong damage in a debuff-heavy fight, but Loren adds repeated ATB reduction and DEF-break attempts through the team-up package. Ken is a direct Loren alternative if your run needs more damage and his build reaches 85k backline EHP plus Loren's 200 display SPD target.

## Sources and limits

- R5 frontline/backline stat guidance, role recommendations and boss mechanics: [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4).
- Current Solo RAID examples, including Brandia/Baleygr, twins, Tarq, Astar and Lucas: [SWGT Solo RAID](https://swgt.io/controllers/gameguides/soloRAID?raidID=1).
- The three selected R5 leaders are global across the raid, while ally buffs remain team-local: [Com2uS raid announcement](https://m-mercury.qpyou.cn/custom/board_detail/4), [Rift of Worlds leader rules](https://summonerswarskyarena.info/rift-of-worlds-analysis-and-basic-guide-by-xelnecra/). Leader values and roles: [Theomars](https://swarena.gg/monster/theomars), [Tesarion](https://swarena.gg/monster/tesarion), [Akhamamir](https://www.sw-database.com/akhamamir).
- Awakened level-40 base SPD values for the speed targets: [monster stat database](https://summonerswarskyarena.info/monster-stat-database/); the raid calculation uses this repository's [speed canonical](SPEED-TICK-CANONICAL.md).
- Team-up and S1 effects: [Raoq (2A)](https://www.sw-database.com/raoq-fire-inugami), [Icaru (2A)](https://www.sw-database.com/icaru-water-inugami), [Loren](https://www.sw-database.com/loren-light-cowgirl), [Hellea](https://summonersky.com/monster/dark-harpy).
- Tien Qin's +16% SPD lead is Guild-only: [Tien Qin guide and leader area](https://theriagames.com/guide/summoners-war-tien-qin-light-drunken-master/).
- The raid speed formula and the distinction between display SPD and combat speed follow this repository's [speed canonical](SPEED-TICK-CANONICAL.md); EHP follows its [calculation authority](CALCULATION-AUTHORITY.md).

The account snapshot and monster skill levels were inspected locally. I have not run R5 with these teams or generated a locked, rune-by-rune solution. Before the first live run, assign disjoint runes, confirm each monster's displayed SPD, raw HP / DEF floors and role-specific EHP in JASWA, and run the speed-tick analysis for the three leader configurations. The rune-investment ranking does not override those checks: if a frontline or cleanser misses its survival/speed mark, finish that build before attempting the run.
