# Solo R5 speed-team recommendation

**Account snapshot:** JASWA Helper — Steam, imported October 20, 2026

**Scope:** Three distinct six-monster teams for one Solo Rift Raid 5 run. No team uses a planned death or revive loop.

## Recommendation at a glance

  | Team | Leader    | Main idea                                                | Frontline / backline |
  | ---- | --------- | -------------------------------------------------------- | -------------------- |
  | 1    | Theomars  | Fran first, Darion protection, Miriam, Brandia/Baleygr   | 4 / 2                |
  | 2    | Tesarion  | Riley first, four-monster frontline, Hwa and twin damage | 4 / 2                |
  | 3    | Akhamamir | Colleen first, Loren S1 control, Seren–Raoq team-ups     | 4 / 2                |

All 18 selected monsters are in the imported account and are six-star, level 40. The teams are built for simultaneous use, so keep their rune assignments disjoint during the raid. Runes can be moved between presets before or after the run; one rune cannot serve two of these teams at once.

**The three leader skills are shared across all 18 monsters in R5.** Select Theomars, Tesarion and Akhamamir as the three team leaders: their distinct general leads give the whole raid +24% Critical Rate, +41% Resistance and +24% Attack Speed. The three bonuses stack because they affect different stats. Raid leaders are chosen one per team; they are not team-local. Ally buffs such as Miriam's passive-enhanced buffs remain within the six-monster team that casts them, while harmful effects on the boss are shared across the raid. The boss's three heads have separate attack bars and each attacks the team facing it; do not treat ATB control as one shared raid-wide bar. [Com2uS raid announcement](https://m-mercury.qpyou.cn/custom/board_detail/4), [Rift of Worlds guide](https://summonerswarskyarena.info/rift-of-worlds-analysis-and-basic-guide-by-xelnecra/)

This is a speed-oriented recommendation with a safety margin, not a claim that the exact 18 builds have already been solved rune-by-rune. The current import contains 1,445 runes, including 1,443 six-star runes; JASWA's provisional rune-efficiency estimate has a median of 92 and a 25th percentile of 81. That is a healthy pool, but a set label is never worth weakening a monster's required EHP or speed. The estimate is only a sorting aid, not an official game score.

The R5 guide's starting survival marks are 25k HP / 1.5k DEF for a two-monster frontline, 22k / 1.3k for a four-monster frontline, and 20k / 800 DEF for the backline. I use those as conservative starting budgets, then assign different EHP margins by role: damage dealers stay close to the relevant floor so their runes can favor damage, while protection and control units get more bulk. A four-front damage dealer still needs real frontline stats; this is not permission to build a glass cannon. The boss's frontline Crush ignores beneficial effects, so Will is not a substitute for bulk. [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide)

## Speed tuning

The R5 boss is commonly listed at 192 combat SPD, 30% RES and 0% ACC. Each head has its own attack bar and faces one six-monster team; the boss's HP and harmful effects are shared. Build and check each six-monster speed order against that team's head independently. The +24% speed lead is shared, but a turn or ATB change on one head is not a turn on the other heads. The targets below use the account's level-20 Sky Tribe Totem (+15%) and Akhamamir's shared +24% Attack Speed lead for every team. Speeds in the team columns are **display SPD**: the figure on the monster panel after runes, including any Swift-set bonus. Where a Swift set changes the minimum panel figure by one point, the table gives the Swift target first and the non-Swift figure in parentheses. Combat SPD is calculated with the exact raid formula for the listed base SPD and rune set; recheck ally order with JASWA's Raid speed tuner. Its current Raid view does not model the enemy; the 192-SPD head comparison below uses the same clock separately. [R5 boss stats](https://theriagames.com/guide/summoners-war-chaos-beast-guide/), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4), [JASWA speed rules](SPEED-TICK-CANONICAL.md)

The R5 clock advances in 4.5% ticks. Every monster below is tuned above the boss's 192 combat SPD, with each team's last mover at 197 or faster. This gives a margin against a zero-start-ATB head only; it does not replace the EHP and cleanse requirements or guarantee that a run cannot fail to RNG. [SWMasters boss mechanics](https://www.swmasters.com/blog/r5-guide)

**Opening ATB is a separate mechanic.** Player experiments report head openings with 100%, 30% and 0% starting ATB, assigned unpredictably. A forced-first head cannot be outsped. The tables specify ally order and a zero-start-ATB, 192-SPD reference; they are **not a guarantee that every ally acts before every head**. I have not independently reproduced the reported opening assignments in the current game. Keep Will on the initial builds and confirm actual opening states before replacing it with offensive auras. Boss attacks can change HP and therefore Colleen's conditional boost. [First-hand R5 opening investigation](https://www.reddit.com/r/summonerswar/comments/st38hv/)

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

Theomars's elemental-advantage passive can lower his own CR requirement while active. I retain 76% panel CR as the conservative target because the boss can apply Oblivion; lowering his CR would make damage depend on keeping that passive active. Do not treat his awakening CR as an additional hidden bonus beyond the panel. [Attribute advantage and CR](https://swcalc.cz/game-mechanics), [boss Oblivion](https://www.swmasters.com/blog/r5-guide)

  | Monster     | Recommended runes and slot 2 / 4 / 6                                          |       ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                                    |
  | ----------- | ----------------------------------------------------------------------------- | --------: | ----------------------: | ---------------------------: | ---------------------------------------------------------------------------------- |
  | Fran        | Swift / Will; SPD / HP% / HP%                                                 |       15% | 29% panel + shared lead |       ≥145k, front-4 support | Heal/cleanse reliability, then extra HP and DEF                                    |
  | Darion (2A) | Fight / Tolerance / Will preferred; Swift / Will if needed; SPD / HP% / DEF%  |       15% | 29% panel + shared lead |          ≥175k, front-4 tank | His 2A passive makes him take 15% more damage; EHP and RES first, then ACC         |
  | Miriam      | Fight / Enhance / Will or Swift / Will; SPD / HP% / DEF%                      | 0% needed | 29% panel + shared lead |       ≥145k, front-4 support | EHP and RES, then HP / DEF; keep her alive for the passive                         |
  | Brandia     | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%     |       15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR with shared lead, then CD and ATK; max skill-ups before premium runes |
  | Theomars    | Vampire / Will; ATK% or SPD / CD% / ATK%                                      |       15% | 29% panel + shared lead | ≥130k, front-4 damage dealer | EHP, then 76% panel CR, ACC and damage; Vampire helps him sustain the frontline    |
  | Baleygr     | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%     | 0% needed |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR with shared lead, then CD and ATK; max his damage skills              |

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

  | Monster  | Recommended runes and slot 2 / 4 / 6                                                        |                             ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                               |
  | -------- | ------------------------------------------------------------------------------------------- | ------------------------------: | ----------------------: | ---------------------------: | ----------------------------------------------------------------------------- |
  | Riley    | Violent / Will or Swift / Will; SPD / HP% / HP%                                             |                       0% needed | 29% panel + shared lead |     ≥145k, front-4 protector | SPD and EHP first, then skill-up her cleanse/heal                             |
  | Hwa      | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%                   | 15% total (awakening covers it) |        29% if efficient | ≥130k, front-4 damage dealer | 76% panel CR and required frontline EHP; then ATK and CD                      |
  | Tesarion | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%                   | 15% total (awakening covers it) |        29% if efficient | ≥130k, front-4 damage dealer | 76% panel CR and required frontline EHP; then ATK and CD                      |
  | Sabrina  | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%                   |                             15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR, then ACC and damage; retain enough bulk for the backline        |
  | Talia    | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%                   |                             15% |        29% if efficient |     ≥85k, back damage dealer | 76% panel CR, then ATK and CD; do not build her as a glass cannon             |
  | Dias     | Fight / Tolerance / Will preferred; Revenge / Fight / Will if appropriate; SPD / HP% / DEF% |                             15% | 29% panel + shared lead |          ≥150k, front-4 tank | EHP, then ACC and enough SPD to meet 157; his passive reduces incoming damage |

Hwa is here for the R5-specific attack-speed slow and attack-bar reduction as well as damage. Com2uS says harmful effects are shared but each head has a separate bar; from that distinction, I treat the lasting speed-slow debuff as shared and Hwa's immediate attack-bar reduction as local to this team's head. Riley supplies the team cleanse, healing and attack buff; Dias adds mitigation and multiple debuffs. The twin pair supplies the main repeated damage. The four-member frontline spreads incoming frontline damage and shields the backline from area damage; all four still need to meet the four-front raw HP/DEF starting budgets. [Hwa and Dias in R5](https://www.swmasters.com/blog/r5-guide), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4)

### Team 3 — Akhamamir lead

Target **display SPD** and first-turn order (Colleen's ATB effect included):

  | Order | Monster            | Placement |  Display SPD target | Raid combat SPD |
  | ----: | ------------------ | --------- | ------------------: | --------------: |
  |     1 | Colleen (2A)       | Back      | 214 (213 non-Swift) |             255 |
  |     2 | Amarna             | Front     | 213 (212 non-Swift) |             252 |
  |     3 | Loren              | Back      |                 200 |             240 |
  |     4 | Seren (2A)         | Front     |                 198 |             239 |
  |     5 | Raoq (2A)          | Front     |                 188 |             231 |
  |     6 | Akhamamir (Leader) | Front     |                 174 |             213 |
  |     — | R5 boss            | —         |                   — |         **192** |

Akhamamir is Team 3's selected leader, and his general +24% Attack Speed lead applies to all 18 monsters. Colleen is first so the team's attack buffer opens the turn order; her 2A S3 also boosts the attack bar of allies at full HP, so the speed targets are intended to preserve the listed sequence with that skill effect active. Amarna follows with cleanse and healing. The last mover remains above this head at 192 combat SPD. Loren is tuned just ahead of the team-up units: she can attempt her own S1's three hits early, and if Seren or Raoq selects her or Colleen, their useful multi-hit S1 effects can be activated repeatedly. Loren's hits also trigger her passive's attack-bar reduction and DEF-break attempts. [Akhamamir leader and R5 role](https://www.sw-database.com/akhamamir), [Loren's S1 and passive](https://www.sw-database.com/loren-light-cowgirl), [Colleen's 2A skills](https://www.sw-database.com/colleen)

  | Monster      | Recommended runes and slot 2 / 4 / 6                                              |                             ACC |              RES target |                   EHP target | After the survival and speed marks, prioritize…                                           |
  | ------------ | --------------------------------------------------------------------------------- | ------------------------------: | ----------------------: | ---------------------------: | ----------------------------------------------------------------------------------------- |
  | Colleen (2A) | Fight / Fight / Will preferred; Swift / Will alternative; SPD / HP% / HP% or DEF% |                             15% | 29% panel + shared lead |           ≥90k, back support | Heal/attack-buff uptime, then EHP and resistance; finish skill-ups                        |
  | Amarna       | Swift / Will or Violent / Will; SPD / HP% / HP%                                   |                             15% | 29% panel + shared lead |       ≥145k, front-4 support | SPD, cleanse uptime, EHP, then ACC; keep his brand/DEF break accurate                     |
  | Loren        | Revenge / Tolerance / Will preferred; Violent / Will alternative; SPD / HP% / HP% | 15% total (awakening covers it) | 29% panel + shared lead |           ≥90k, back control | Meet SPD/EHP; her S1/passive make her a priority helper                                   |
  | Seren (2A)   | Rage / Will or Fatal / Will; ATK% or SPD / CD% / HP% or ATK%                      |                             15% | 29% panel + shared lead | ≥130k, front-4 damage dealer | Frontline EHP and 76% panel CR; then ATK and CD; no helper-count DEF threshold            |
  | Raoq (2A)    | Vampire / Will preferred; SPD / CD% / HP% or ATK%                                 |                             15% |        29% if efficient | ≥130k, front-4 damage dealer | EHP first, then 76% panel CR and damage; ATK% only if EHP still clears the mark           |
  | Akhamamir    | Rage / Will preferred; Rage / Fight conditional; ATK% or SPD / CD% / ATK%         |                             15% |        29% if efficient | ≥130k, front-4 damage dealer | Frontline EHP and 76% panel CR first; then ATK and CD; his S3 benefits from debuffs       |

Amarna, Seren, Raoq and Akhamamir form the four-monster frontline; Colleen and Loren stay in the backline as protected support/control. This is an intentional S1 package: team-ups can activate Colleen's multi-hit S1 for attack break and Loren's three-hit S1 for attack-bar reduction and DEF-break attempts. Loren's passive can attempt up to 60% attack-bar reduction across her three hits, with a DEF-break attempt on each hit; resistance still applies. Raoq calls two allies; Seren (2A) calls two to three with S3, without Icaru's DEF-dependent helper count. Her four S3 hits also attempt DEF break, and her two-hit S1 attempts attack break when another unit calls her. This is why I select Seren over Icaru after reviewing the wider roster. Helpers are random; useful S1s are available but no particular helper is guaranteed. Calling a support activates S1, not its heal, cleanse or attack buff. [Seren's 2A skills](https://swarfarm.com/bestiary/12105-dark-harpu-seren/), [Raoq's skills](https://www.sw-database.com/raoq-fire-inugami), [Loren's skills](https://www.sw-database.com/loren-light-cowgirl)


## Shared stat and rune rules

- **EHP and raw floors:** Use JASWA's `HP × (1142 + 3.572 × DEF) / 1000`, but do not use EHP as a substitute for the raid's raw-stat marks. All three teams use four frontliners. Before local battle auras, start with 22k HP / 1.3k DEF for every frontliner and 20k / 800 DEF for every backliner. Those marks correspond to roughly 127k and 80k EHP. Then target by role: 130k for a four-front damage dealer, 145k for a four-front protector/support, 150k for Dias as the key mitigation tank, 175k for 2A Darion because his passive makes him take 15% more damage, 85k for a backline damage dealer, and 90k for a backline support/control unit. The tables apply these individually. These role-tiered EHP numbers are conservative panel-reference budgets inferred from the guides' positional HP/DEF marks; they are not separate game breakpoints. The extra margin goes to units keeping the team alive; damage dealers get only a modest buffer above their positional floor, not an arbitrary tank target. Do not trade away necessary frontline DEF merely to hit an EHP number: the boss's frontline Crush gets more dangerous as DEF falls and ignores beneficial effects. Four frontliners also protect the backline from area damage and spread incoming frontline damage. [JASWA calculation authority](CALCULATION-AUTHORITY.md), [Darion's 2A passive](https://www.sw-database.com/darion), [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide)
- **ACC:** Aim for 15% total panel accuracy on monsters that must land debuffs. Awakened bonuses count toward the total: Hwa, Tesarion and Loren already exceed it and need no rune ACC. Do not keep adding ACC past 15% for this boss. Pure buff/heal units can leave ACC at zero if their attacks do not supply a required debuff.
- **RES:** All 18 monsters receive Tesarion's shared +41% RES lead. Aim for 29% panel RES (about 70% in battle) on frontline monsters, healers and cleansers. A Tolerance set adds 10% RES to all six monsters on its own team; with one such set, 19% panel RES reaches the same 70% benchmark. Do not spend premium damage substats on redundant RES unless you want extra resistance. Damage dealers may trade RES for damage after reaching their EHP requirement. [Com2uS rune effects](https://www.summonerswar.com/en/skyarena/game)
- **Critical Rate:** All 18 monsters receive Theomars's shared +24% CR lead. Damage dealers target 76% panel CR; awakening bonuses are already part of the monster's panel stat. Supports that do not rely on critical damage do not need 100% CR.
- **SPD:** Every speed target includes Akhamamir's shared +24% Attack Speed lead and the level-20 +15% totem. Match the exact preferred-set display target in the tables, including the stated Swift adjustment, then verify ally order in JASWA and compare against the separate 192-combat-SPD head reference; the current Raid tuner does not simulate that enemy.
- **Sets:** Rage / Fight and Rage / Will are the first comparisons for the main damage dealers, not a command to accept weak Rage runes. Use a strong Fatal / Will, Vampire / Will or other stat-efficient build if it meets the speed, EHP and damage role better. Use Swift for first movers only when it is the best stat-efficient way to meet the exact target. Put Fight sets on supports or protection units when they still meet their speed/EHP targets: each 2-piece set gives all six monsters on that team +8% ATK. There is no one- or two-set cap: compare the benefit to all six allies against the stats forgone on each carrier. Use Tolerance similarly for a team-wide +10% RES. These team-wide set auras do not cross to the other two teams. The active attack-buff monster is first on each speed list, but Auto AI still chooses its skill; a Fight aura gives the reliable passive baseline if it does not cast the buff immediately. Will remains useful for the opening, but never at the cost of frontline EHP. [Com2uS rune effects](https://www.summonerswar.com/en/skyarena/game), [R5 Fight-set team scope](https://www.reddit.com/r/summonerswar/comments/125oa62)
- **Do not make three teams share a rune.** Solo R5 uses the three teams in one run. The account has ample Will runes; Rage is more limited, so reserve its best four-set combinations for Baleygr, Brandia and the highest-output damage dealers first.
- **Skill-ups:** Brandia currently has no skill-ups and should be max-skilled before receiving the account's best Rage set. Baleygr and Colleen (2A) are also incomplete; finish their important damage/heal skill-ups. Incomplete skill-ups make damage or debuff uptime less dependable.

## Rune-investment order: 1–18

This order reserves the best damage runes for the highest-impact dealers first, as requested. It ranks rune investment, not which monster must be built first to make the first safe test run; support survival and exact speed requirements still gate the build; account for battle auras when assessing survival.

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
  |   10 | Seren (2A)   | Damage, DEF break and two-to-three helpers; S1 attack break also works when called.                 |
  |   11 | Loren        | Team-up S1 partner and boss control; prioritize speed, EHP and ACC over damage.                     |
  |   12 | Amarna       | Cleanse, healing and brand/DEF break make this a high-value support build.                          |
  |   13 | Colleen (2A) | Main heal, ATK buff and repeated attack-break/heal-block attempts.                                  |
  |   14 | Fran         | First mover, cleanse and backup heal; speed and EHP outrank damage.                                 |
  |   15 | Riley        | Frontline cleanse/healing anchor; speed and EHP first.                                              |
  |   16 | Darion (2A)  | Team damage reduction and DEF break; build him efficiently for front-four survival.                 |
  |   17 | Dias         | Damage reduction and useful debuffs; build to the four-front tank target.                           |
  |   18 | Miriam       | Her passive strengthens this team's buffs; the investment only pays off if she survives.            |

## Wider roster review

**Decision:** Keep Teams 1 and 2; replace Icaru with the account's fully skilled Seren (2A) in Team 3. The 1–18 ranking reflects that choice. The alternatives below compete for existing slots. Changing a monster requires recalculating display SPD from its own base SPD and rune set; copying the outgoing monster's panel number is unsafe.

### Highest-value alternatives

  | Candidate | Account and contribution                                                                   | Decision for these teams                                                                                                                           |
  | --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Agrius    | Owned, fully skilled; general 30% CR lead, brand/slow and boss-specific speed-based damage | First alternative to Theomars. His lead lowers all damage dealers' panel CR target from 76% to 70%, retaining Tesarion and Akhamamir.              |
  | Kro (2A)  | Owned, fully skilled; S1 DEF break, one-helper S2, debuff-scaled S3 and branding           | First personal-burst alternative to Seren. Trades helper count and attack-break redundancy for damage/brand. Keep frontline bulk in her slot.      |
  | Tarq (2A) | Two owned; use the fully skilled 3/3/2 copy. Calls two allies and brands; S1 self-heals    | Strong alternative to Seren or Raoq. His self-SPD buff needs a fresh multi-turn tune.                                                              |
  | Arang     | Owned, fully skilled; three-hit branding S1 and S3 ATK/DEF/SPD debuffs                     | Excellent team-up partner if replacing Loren with damage. Accept the loss of direct control of this head.                                          |
  | Prilea    | Owned, fully skilled; DEF-break S1/S2, plus S3 DEF break against stun-immune targets       | Best specialist if damage is lost to missing DEF break after a jump. Does not replace Loren's ATB control.                                         |
  | Hraesvelg | Owned, fully skilled; ATK/SPD buff, brand and self-cycling                                 | Strong offensive buffer, especially with Miriam. Berserk lowers DEF by 30% and raises SPD; do not inherit a tank build or unchanged turn sequence. |
  | Bastet    | Owned, fully skilled; ATK buff, shield, 30% ally ATB boost and S1 attack break             | Coherent Colleen alternative with Amarna retaining heal/cleanse. Loses backup healing; different ATB boost needs a new tune.                       |

Skill references: [Agrius](https://swarfarm.com/bestiary/34102-fire-centaur-knight/), [Kro](https://swarfarm.com/bestiary/11005-dark-inugami-kro/), [Tarq](https://swarfarm.com/bestiary/10601-water-hellhound-tarq/), [Arang](https://swarfarm.com/bestiary/11203-wind-nine-tailed-fox-arang/), [Prilea](https://swarfarm.com/bestiary/10503-wind-harpy-prilea/), [Hraesvelg](https://swarfarm.com/bestiary/18803-wind-barbaric-king-hraesvelg/), [Bastet](https://swarfarm.com/bestiary/20501-water-desert-queen-bastet/).

I retain Theomars initially for frontline damage and his general lead without introducing Agrius's self-SPD-buff rotation. Agrius remains a serious challenger: a non-Swift build with his 104 base SPD needs **161 display SPD for 202 raid combat SPD** under the retained 39% totem/leader bonus. In Theomars's front slot, meet the same 130k starting EHP budget and 15% ACC, then target 70% panel CR and damage. His subsequent self-buff changes later rotations; Oblivion can suppress his passive. This is a specified alternative, not a verified faster result.

### Remaining candidates

- **Hellea and Shihwa:** Owned, fully skilled brand/damage options. Hellea also brings a useful DEF-break S1. They compete with Loren's head-local control or an existing damage slot. Shihwa's leader is **40% fire ATK**, not CR; it must replace one of the three chosen leads. Removing Akhamamir requires retuning all 18 speeds. [Hellea](https://swarfarm.com/bestiary/10505-dark-harpy-hellea/), [Shihwa](https://swarfarm.com/bestiary/11202-fire-nine-tailed-fox-shihwa/)
- **Icaru (2A):** Retain as a defensive team-up alternative. Use **Guard / Determination / Fight** or **Violent / Determination**, each six runes. About 2,500 in-battle DEF permits two helpers; include tower and local Determination bonuses in the threshold calculation. His higher DEF can favor a thinner frontline, but pursuing three helpers must justify the offensive stats spent. [Icaru skills](https://www.sw-database.com/icaru-water-inugami)
- **Verdehile:** Owned, fully skilled; critical S1 hits can trigger his team ATB passive when called. This is useful S1 synergy, but changes the complete turn trace and adds animations. More turns alone do not prove a faster raid. Use 76% panel CR under Theomars if trying him. [Documented Solo R5 examples](https://swgt.io/controllers/gameguides/soloRAID?raidID=1)
- **Astar, Lucas, KEN/Bernadotte and Xiao Lin:** Owned damage alternatives. Astar adds sustain/damage, Lucas a personal shield and conditional utility, and Xiao Lin debuff-based damage. **KEN is the account's collaboration equivalent of Bernadotte**, not a missing separate acquisition. None is demonstrated to beat the selected package with these runes. If replacing backline Loren, start around 85k damage-dealer EHP and preserve the position before the team-up units, accepting lost head-local ATB control. Recalculate each monster's display SPD. [SWGT lineups](https://swgt.io/controllers/gameguides/soloRAID?raidID=1), [local collaboration mapping](../app/data/collaboration-species.json)
- **Melissa:** Owned, fully skilled alternative paired with Sabrina. A third twin consumes Hwa's control or Dias's mitigation slot. I retain those roles rather than assume another follow-up attacker wins overall.
- **Kahli (2A) and Hwahee:** Owned offensive attack-buffer alternatives. They cannot automatically replace a cleanse/healing package. Kahli's ATK/SPD buff changes later tuning; her **23% fire CR lead** is narrower than Theomars's 24% general lead. Invincibility does not solve Crush's disregard for beneficial effects. [Kahli skills](https://swarfarm.com/bestiary/12002-fire-high-elemental-kahli/)
- **Tien Qin, Xiong Fei, Belladeon (2A), Lulu (2A), Konamiya, Mei Hou Wang and Fuco:** Owned sustain, utility or bruiser alternatives. Use them to fix a specific observed survival/debuff gap; they are not automatic speed upgrades over the current coverage. Tien Qin has no cleanse, and his guild-only SPD lead does not apply. [Tien Qin](https://theriagames.com/guide/summoners-war-tien-qin-light-drunken-master/), [traditional R5 roles](https://www.swmasters.com/blog/r5-guide)
- **Wind Homunculus:** Owned, but advice must use its selected skill path. Another guide's branding build cannot be assumed to match this account.
- **Janssen:** Owned, but his revive-related payoff does not justify a slot when all six allies are meant to remain alive. Dagora, Iunu and Drogan are excluded as planned-death enablers.
- **Deborah, Fami, Argen, Xiao Chun, Chamie and Igmanodon:** Not found in this import. Deborah would merit a full re-evaluation if acquired. Fami's general lead is **25% Critical Damage**; she is not an available substitute here. [Fami leader](https://swarfarm.com/bestiary/16704-light-magical-archer-fami/)

SWGT's published fast lineups establish useful candidates, but their death/revive units and unowned monsters matter. Their advertised completion times cannot be transferred to these modified no-death teams. Appearing in a 21-second composition does not prove that inserting one monster here reproduces its time. [SWGT / Seiishizo compositions](https://swgt.io/controllers/gameguides/soloRAID?raidID=1)

## Final mechanical review and improvement decisions

### Rune choices and defensive auras

**Use ATK% slot 2 on damage dealers whenever good SPD substats reach the exact display target.** SPD slot 2 is an alternative, not a universal requirement. Brandia and Baleygr should not lose an ATK% main stat merely because a table specifies their turn order. On frontline attackers, HP% or DEF% in another slot may still yield the strongest complete build.

The import contains 137 Fight, 62 Tolerance, 32 Enhance and 39 Determination runes. These are individual rune counts, not guaranteed complete sets of sufficient quality. Your strong offensive Fight runes can go on damage dealers: compare **Rage / Fight**, **Fatal / Fight** and their Will equivalents as complete team allocations. Three strong two-piece auras on a support can beat a four-piece set whose extra turns add little useful work.

  | Set, two pieces | Effect on its own six-monster team | Decision                                                                                               |
  | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | Fight           | +8% of each recipient's base ATK   | Default offensive aura; compare total team damage, not just the carrier's sheet.                       |
  | Enhance         | +8% of each recipient's base HP    | Useful if it frees damage dealers' HP substats for ATK/CD while preserving battle survival.            |
  | Determination   | +8% of each recipient's base DEF   | Compare against Enhance for frontline protection; especially valuable if Icaru reaches another helper. |
  | Tolerance       | +10 percentage points RES          | Useful when it releases valuable RES substats after accounting for the shared 41% lead.                |

These effects stack locally, include the carrier and use base stats. They are not +8% of total panel stats and do not appear as buff icons. Their constant stat bonuses therefore do **not** generate Baleygr Knowledge. [Com2uS rune reference](https://sw.com2us.com/en/skyarena/game), [JASWA rune model](RUNE-CANONICAL.md)

One Enhance gives Brandia about **844 HP** from her 10,545 base HP and Baleygr about **817 HP** from his 10,215 base HP. Around 20,000 HP, that is roughly a 4% HP/EHP increase at unchanged DEF, before other battle HP bonuses; it is not +8% total HP. One Determination gives them about 49 and 54 DEF respectively. Compare actual battle EHP and frontline DEF rather than assuming either defensive set always wins.

**Preferred first aura allocation:** Darion **Fight / Tolerance / Will**; Miriam **Fight / Enhance / Will** at **174 display SPD**; Dias **Fight / Tolerance / Will**; Colleen **Fight / Fight / Will** at **213 display SPD**; Loren **Revenge / Tolerance / Will**. Every combination uses six runes and retains opening Will. Before further offensive choices, Team 1 gets two Fight, one Enhance and one Tolerance; Team 2 gets one Fight and one Tolerance; Team 3 gets two Fight and one Tolerance. Colleen's non-Swift target needs strong SPD substats; use Swift / Will at 214 display SPD if its complete build is better.

For extra HP on Team 2, compare Dias **Fight / Enhance / Will**, trading Tolerance rather than opening Will. On Team 3, compare Loren **Enhance / Tolerance / Will**, trading Revenge for HP across six allies. These are the first defensive-aura comparisons. Dropping Will for another Fight/Enhance set is a later option only after the actual boss opening has been checked. No aura removes the need for meaningful DEF against Crush.

With one Tolerance, 19% panel RES plus the 41% lead reaches the optional 70% combat target. Additional sets often lose value because monsters already have their base RES; Riley's awakened RES is higher still. Do not pay twice for resistance already supplied. This target is a safety budget, not debuff immunity.

The EHP tables are conservative **panel-reference budgets before local battle auras**. Once Enhance or Determination is counted in the battle sheet, it can replace some HP/DEF rune investment on attackers. Count its bonus once and preserve the HP/DEF balance appropriate to position. Spend released stats on damage rather than raising every attacker to a support's tank budget.

### Formation: retain four front, with a defined three-front alternative

More frontline members share frontline damage and improve backline protection. Moving an attacker back can free offensive stats, but leaves three allies absorbing frontline pressure and reduces backline protection. I keep **4 front / 2 back** as the primary recommendation. There is no sourced exact mitigation percentage by member count here; I do not interpolate one.

  | Team | Possible 3 front / 3 back arrangement                          | Assessment                                                                                                                                                                |
  | ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1    | Front: Fran, Darion, Miriam. Back: Brandia, Theomars, Baleygr. | Best first offensive variant: three protectors remain in front with Darion mitigation. Check increased damage to every backliner before reducing Theomars's bulk.         |
  | 2    | Front: Riley, Tesarion, Dias. Back: Hwa, Sabrina, Talia.       | Frees Hwa's damage build, but Tesarion absorbs more frontline pressure. The rune cost can move rather than disappear.                                                     |
  | 3    | Front: Amarna, Seren, Raoq. Back: Colleen, Loren, Akhamamir.   | Frees Akhamamir's damage build but leaves two offensive units in a thinner front. Less attractive initially; restoring Icaru could improve survival at an offensive cost. |

A switch requires rebuilding the whole team, not simply lowering the moved attacker from 130k to 85k EHP. Start the remaining frontliners conservatively toward the two-front guide's 25k HP / 1.5k DEF reference, then assess actual damage. That reference is not a proven three-front breakpoint. Keep four front if the extra protection costs more team damage than the moved attacker gains. [Frontline guidance](https://www.swmasters.com/blog/r5-guide)

### Team-ups, damage delivery and boss timing

The reference opening was recalculated with the repository's raid clock: starting every bar empty, all six allies act in the listed order before a 192-SPD head. Team 3 also preserves this reference order with no Colleen boost, a uniform 15% boost or a uniform 16.5% boost. This validates the numerical reference, **not the raid's full opening**: the clock run omits the boss's reported starting ATB allocation, scripted events and unequal HP-dependent boosts. The speed tables therefore remain build targets requiring live opening verification. Raising every ally above 192 is not a substitute for that verification.

An attack buffer moving first does not guarantee Auto casts its buff. Team-ups cannot force a particular helper or activate that helper's heal. Loren, Colleen and Seren have useful S1 effects; Amarna supplies utility when called, while Akhamamir contributes damage. Kro, Arang, Prilea and Hellea are valuable alternatives precisely because their S1s remain useful when called. Fix missing DEF break or attack break before adding redundant debuffs simply to raise the debuff count.

Boss HP thresholds, cleanses, Roar, cooldowns and uneven Colleen boosts change subsequent sequences. Speed slow is shared; immediate ATB reduction is treated as head-local. Loren's control does not compensate for removing Hwa from Team 2. Extra Violent turns and ATB cycling also cost animations and can advance turn-triggered mechanics; maximum turns are not automatically minimum completion time. [Boss mechanics](https://www.swmasters.com/blog/r5-guide), [separate head bars](https://m-mercury.qpyou.cn/custom/board_detail/4)

Baleygr's damage depends on actual Knowledge at the attack. Without deaths, assess stacks from active buffs and his own critical hits. Miriam amplifies the ATK buff but is not another buff icon; rune auras are not stack generators. Do not assume five-stack burst every rotation. Check this alongside ATK-buff, brand and DEF-break uptime before deciding another damage dealer or Rage set is the missing improvement.

**Improvement order:** finish key skill-ups; optimize six-rune builds with ATK% slot 2 and Fight/Enhance tradeoffs; use Seren's team-up/S1 package; then compare Agrius, Kro and Team 1's three-front variant individually. Retain the CR/RES/SPD leaders initially. Replacing RES with an offensive lead is a later survival-for-damage trade; replacing SPD changes all display-speed targets.

## Sources and limits

- R5 frontline/backline stat guidance, role recommendations and boss mechanics: [SWMasters R5 guide](https://www.swmasters.com/blog/r5-guide), [SW Database R5 guide](https://www.sw-database.com/post/r5-beginners-guide), [Com2uS raid mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4).
- Current Solo RAID examples, including Brandia/Baleygr, twins, Tarq, Astar and Lucas: [SWGT Solo RAID](https://swgt.io/controllers/gameguides/soloRAID?raidID=1).
- The three selected R5 leaders are global across the raid, while ally buffs remain team-local: [Com2uS raid announcement](https://m-mercury.qpyou.cn/custom/board_detail/4), [Rift of Worlds leader rules](https://summonerswarskyarena.info/rift-of-worlds-analysis-and-basic-guide-by-xelnecra/). Leader values and roles: [Theomars](https://swarena.gg/monster/theomars), [Tesarion](https://swarena.gg/monster/tesarion), [Akhamamir](https://www.sw-database.com/akhamamir).
- Awakened level-40 base SPD values for the speed targets: [monster stat database](https://summonerswarskyarena.info/monster-stat-database/); the raid calculation uses this repository's [speed canonical](SPEED-TICK-CANONICAL.md).
- Team-up and S1 effects: [Raoq (2A)](https://www.sw-database.com/raoq-fire-inugami), [Icaru (2A)](https://www.sw-database.com/icaru-water-inugami), [Loren](https://www.sw-database.com/loren-light-cowgirl), [Hellea](https://summonersky.com/monster/dark-harpy).
- Tien Qin's +16% SPD lead is Guild-only: [Tien Qin guide and leader area](https://theriagames.com/guide/summoners-war-tien-qin-light-drunken-master/).
- The raid speed formula and the distinction between display SPD and combat speed follow this repository's [speed canonical](SPEED-TICK-CANONICAL.md); EHP follows its [calculation authority](CALCULATION-AUTHORITY.md).

The account snapshot and monster skill levels were inspected locally. I have not run R5 with these teams or generated a locked, rune-by-rune solution. Before the first live run, assign disjoint runes, confirm each monster's displayed SPD, raw HP / DEF starting budgets and role-specific EHP in JASWA, with all three shared leads active. Then verify the real opening against each head, including nonzero starting ATB, before calling the speed tune complete. The rune-investment ranking does not override those checks: if a frontline or cleanser misses its survival/speed mark, finish that build before attempting the run.
