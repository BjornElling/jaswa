# Solo R5 speed-team recommendation

**Reviewed:** October 21, 2026

**Account reference:** JASWA Helper — Steam, imported October 20, 2026

**Scope:** Three distinct six-monster teams, full auto, simultaneous rune assignments, no planned deaths or revive loop.

## Decision and evidence

Keep the 18 monsters as a **comparison baseline**, not as a solved fastest team. Replace the previous Swift defaults with support auras, remove the fixed 1–18 investment ranking, and make Will a decision about a particular opening and monster. Retain the existing speed and EHP figures as starting references; neither set of figures establishes a mechanical minimum or a reliable auto sequence.

The earlier review recorded all 18 monsters as owned, six-star and level 40, with 1,445 runes (137 Fight, 62 Tolerance, 32 Enhance and 39 Determination). Those are historical account observations, not a fresh inventory audit or evidence that enough strong complete sets exist. The developer reports that the listed speeds are easy to reach without Swift; use that information when selecting builds. No locked rune allocation or actual battle results accompany this review.

The objective is the shortest reliable **whole-raid completion time**, including the cost of failures. Individual damage, the number of turns and theoretical five-stack burst are diagnostics, not the objective. Start with functional survival, debuffs and healing, then compare damage delivered before and after the jump. Do not optimize three isolated damage meters.

Theomars, Tesarion and Akhamamir provide shared general leads of +24% CR, +41% RES and +24% SPD. Each ally receives all three. Ally buffs and rune auras remain local to their own six-monster team; boss HP and lasting harmful effects are shared, while each head has a separate attack bar. Immediate ATB reduction is therefore treated as head-local, unlike a lasting speed-slow debuff. [Com2uS raid announcement](https://m-mercury.qpyou.cn/custom/board_detail/4), [local leader data](../app/data/swarfarm-speed-skills.json)

## Critical assessment of the supplied analysis

The supplied critique correctly challenges automatic four-front formations, mandatory 70% RES, compulsory speeds above the boss, and Baleygr's guaranteed second claim on premium runes. It also correctly distinguishes Fran's single-target cleanse from Riley's team-wide removal of one effect. However, several conclusions need qualification:

- **Some criticisms describe an older or stronger claim than the current document makes.** The previous text already acknowledged unpredictable starting ATB, hypothetical EHP budgets and a three-front alternative. The defect was that later instructions still treated those provisional references as exact requirements. This revision makes their status consistent throughout.
- **Baleygr's uncertainty is real, but the supplied stack accounting is incomplete.** Will and Shield can supply opening Knowledge, Miriam can roll a shield, and receiving a buff is the relevant event. Neither a stronger buff nor a Fight aura is another buff application. The previous plan's suggestion that his own critical hits generate Knowledge was also wrong: his current passive has no such rule. See the explicit cases below. [Current passive](https://swarfarm.com/api/v2/skills/2088/), [rune interaction notes](https://summonerswar.fandom.com/wiki/Lightning_Emperor_%28Fire%29_-_Baleygr)
- **Early buffers do not make Will redundant across this roster.** Fran grants immunity with S3, Riley has immunity skills, but Colleen and Amarna provide none. Team 3 has no immunity caster. Even on Teams 1 and 2, acting early neither forces the right Auto skill nor prevents a head from acting first.
- **Shared debuffs do not replace Dias's local protection.** His passive reduces damage to the other five allies; its critical-hit protection is personal to Dias. Shared debuffs do not reproduce those benefits. Remove him only if Team 2's actual survival permits it, not because another team supplies debuffs. Likewise, Darion's passive is subject to Oblivion; its full benefit cannot be assumed throughout a failed run. [Dias skills](https://www.sw-database.com/dias), [Darion skills](https://www.sw-database.com/darion)
- **Kro and Agrius are good experiments, not demonstrated upgrades.** Six percentage points of raid-wide CR from Agrius have value only where builds can exchange the released CR for useful stats. Kro's branding partly overlaps Amarna and 2A Colleen; his burst must beat Seren's lost helper attacks and attack-break redundancy.
- **Easy non-Swift speed targets justify removing Swift as the default, not declaring Swift intrinsically useless.** A complete Swift build could still free more valuable substats elsewhere. There is no reason to pay for excess SPD, but set labels alone do not decide the strongest six-rune allocation.

## One build table per team

Rows show the intended **reference opening order**, not guaranteed Auto actions. Every recommendation uses six runes. A slash separates complete sets: Fight / Fight / Will means two Fight sets and one Will set. No Swift set is assumed in these tables.

**Read the figures correctly:** ACC is total panel ACC, including awakening. EHP is a provisional **unbuffed panel reference before local auras**, in thousands; it is not a proven survival threshold. Raid combat SPD includes the level-20 totem (+15%) and shared Akhamamir lead (+24%), with no speed buff. Display SPD is included to make the target usable in the monster panel. These are reference targets to reproduce first, not minimum speeds to maximize past. The battle-stat and timing sections below explain what must be tested.

Will in a row is a conservative opening comparison build, not a claim that every monster needs it. The Will section defines when its slot can become Fight, Tolerance, Enhance or Determination. Damage-set alternatives and main stats are described once below rather than repeated in another monster table.

### Team 1 — Theomars lead: Miriam and burst

| Monster            | Position | Recommended rune sets      | ACC requirement          | EHP reference | Raid combat SPD | Display SPD |
| ------------------ | -------- | -------------------------- | ------------------------ | ------------: | --------------: | ----------: |
| Fran               | Front    | Fight / Fight / Will       | 15%                      |          145k |             227 |         186 |
| Darion (2A)        | Front    | Fight / Shield / Will      | 15%; awakening covers it |          175k |             216 |         177 |
| Miriam             | Front    | Fight / Enhance / Will     | No investment            |          145k |             215 |         174 |
| Brandia            | Back     | Rage / Fight               | 15%                      |           85k |             210 |         166 |
| Theomars (Leader)  | Front    | Vampire / Will             | 15%                      |          130k |             202 |         163 |
| Baleygr            | Back     | Rage / Will                | No investment            |           85k |             197 |         157 |

**Required opening aura:** Darion carries one complete Shield set (two Shield runes). It grants Baleygr an opening shield and an extra Knowledge source; one individual Shield rune does not activate the set. Keep this set on Team 1 in every baseline and candidate build involving Baleygr. With his own Will, he starts with two Knowledge while his passive is active.

Fran's S2 removes all effects from **one** ally. Her S3 heals and grants ATK and immunity but does not cleanse existing debuffs. Her healing scales with ATK, so three defensive main stats are not automatically her best support build. Miriam strengthens this team's ATK/DEF/SPD buffs; her passive is not an additional buff icon. Darion supplies mitigation while his passive is active. [Fran skills](https://www.sw-database.com/fran), [Miriam skills](https://www.sw-database.com/miriam)

This is the least convincing team-wide recovery package: a slow run with several allies under Oblivion or attack break can exceed Fran's single-target recovery capacity. Test that failure mode explicitly. Will buys opening protection; it cannot turn Fran into an AoE cleanser. If this is the actual failure, compare a genuine team cleanser or revised buffer package before spending more runes on Baleygr.

Brandia gets first consideration for offensive improvement, but her actual skill use and damage must justify investment. Baleygr's next-best-Rage entitlement is withdrawn until Knowledge and delivered damage are measured. Test Theomars in the back with Fran, Darion and Miriam as the three frontliners; keep the four-front setup as the controlled reference. His passive can be suppressed by boss Oblivion, so retain 76% panel CR initially rather than relying on elemental advantage.

### Team 2 — Tesarion lead: twins and control

| Monster            | Position | Recommended rune sets      | ACC requirement          | EHP reference | Raid combat SPD | Display SPD |
| ------------------ | -------- | -------------------------- | ------------------------ | ------------: | --------------: | ----------: |
| Riley              | Front    | Fight / Fight / Will       | No investment            |          145k |             226 |         187 |
| Hwa                | Front    | Rage / Fight               | 15%; awakening covers it |          130k |             221 |         180 |
| Tesarion (Leader)  | Front    | Rage / Fight               | 15%; awakening covers it |          130k |             214 |         175 |
| Sabrina            | Back     | Rage / Fight               | 15%                      |           85k |             209 |         169 |
| Talia              | Back     | Rage / Fight               | 15%                      |           85k |             203 |         162 |
| Dias               | Front    | Fight / Tolerance / Will   | 15%                      |          150k |             197 |         157 |

Riley's S3 removes **one harmful effect from each ally**, heals and grants ATK. Her immunity skills are separate decisions; an opening ATK buff does not itself prove immunity coverage. S4 requires totems and cannot be assumed available immediately. Test triple-aura Riley before retaining Violent for its familiar PvP value; compare Violent / Fight only if extra healing or cleansing turns improve this raid's results. [Riley skills](https://www.sw-database.com/riley)

The twin pair is the primary damage package. Hwa supplies slow and local ATB reduction. Dias's value is primarily defensive; redundant debuffs are useful insurance but do not establish his slot. A replacement must preserve survival and useful coverage. Test moving Hwa back before removing mitigation; that leaves Riley, Tesarion and Dias in front and changes pressure on all six allies.

### Team 3 — Akhamamir lead: team-ups and debuffs

| Monster            | Position | Recommended rune sets      | ACC requirement          | EHP reference | Raid combat SPD | Display SPD |
| ------------------ | -------- | -------------------------- | ------------------------ | ------------: | --------------: | ----------: |
| Colleen (2A)       | Back     | Fight / Fight / Will       | 15%                      |           90k |             255 |         213 |
| Amarna             | Front    | Fight / Fight / Will       | 15%                      |          145k |             252 |         212 |
| Loren              | Back     | Revenge / Tolerance / Will | 15%; awakening covers it |           90k |             240 |         200 |
| Seren (2A)         | Front    | Rage / Fight               | 15%                      |          130k |             239 |         198 |
| Raoq (2A)          | Front    | Vampire / Fight            | 15%                      |          130k |             231 |         188 |
| Akhamamir (Leader) | Front    | Rage / Fight               | 15%                      |          130k |             213 |         174 |

Colleen heals and buffs ATK; Amarna supplies recovery and team cleansing. **Neither grants immunity.** The early supports' Will protects them before their first actions; compare Will on the damage dealers too if opening Oblivion, attack break or slow costs more than Fight contributes. [Colleen skills](https://www.sw-database.com/colleen), [Amarna skills](https://www.sw-database.com/amarna-light-anubis)

Colleen's 2A S3 checks for full HP **after healing**, then boosts qualifying allies. Unequal damage can still produce unequal boosts. Her current incomplete skill-up and eventual improved boost must be treated as separate timing cases. A calculation with all allies boosted equally does not cover every injured opening.

Raoq calls two helpers; Seren's 2A S3 calls two to three, with her own DEF-break attempts and useful S1 attack break. Helpers are random. Team-ups activate S1, including its relevant effects, not the helper's heal or cleanse skill. Loren's S1/passive makes her a useful repeated DEF-break/ATB partner. Akhamamir's DoT does not land on this boss; his useful arguments are the global lead, S2 control against stun-immune targets and S3 damage. Enemy-max-HP damage is mitigated by the boss. [Seren skills](https://swarfarm.com/bestiary/12105-dark-harpu-seren/), [Raoq skills](https://www.sw-database.com/raoq-fire-inugami), [Loren skills](https://www.sw-database.com/loren-light-cowgirl), [Akhamamir skills](https://www.sw-database.com/akhamamir), [boss immunities](https://summonerswar.spokland.com/battle_map/rift_of_worlds/rift_raid)

Compare Kro with Seren first: measure extra personal burst against lost helper damage and debuff reliability. Do not declare Team 3 over-supported solely by counting supports; their S1 effects can amplify damage on all three teams. Conversely, the shared debuff pool is a reason to measure redundancy instead of preserving every control slot automatically. A later three-front test can move Akhamamir back, leaving Amarna, Seren and Raoq in front; two remaining attackers then face more pressure.

## Will: opening insurance, not jump insurance

The developer's concern is partly correct: one-turn Will can expire before the jump, overlap a successfully cast immunity buff, or be stripped. That makes universal Will a poor unquestioned default. It does not make it useless:

1. **It exists before any Auto decision.** Ruler of Chaos changes the heads' opening bars. A faster Fran or Riley cannot guarantee immunity before an opening head attack. Will can prevent early attack break, slow and Oblivion from disrupting the intended setup. The reported 100%/30%/0% bar allocation remains an unverified player observation here; no exact assignment is needed to reject a guaranteed empty-bar opening. [Boss skill descriptions](https://summonerswar.spokland.com/battle_map/rift_of_worlds/rift_raid), [original player investigation](https://www.reddit.com/r/summonerswar/comments/st38hv/)
2. **Its duration belongs to the recipient's turns.** The buffer taking a turn does not consume an attacker's Will. The recipient's own first turn can end the one-turn protection; do not confuse team-up helper attacks with its normal turns. Speed, Auto skills and the boss event timeline determine whether protection still exists when needed. [Will rune description](https://summonerswar.spokland.com/rune/set)
3. **Stripping and ignoring buffs are different problems.** Rageful Roar removes beneficial effects and stuns; Will is not dependable protection against that strip-then-control sequence. Crush ignores beneficial effects, so Will is no substitute for raw survival. Total Annihilation removes the boss's own harmful effects; that description does not establish that the jump strips allies' immunity. Do not merge these three skills into one explanation. Sources conflict about old 25% jumps versus a 50% trigger; use the current in-game panel and observed run, not an old guide's exact threshold. [Boss skills, including 50% trigger](https://summonerswar.spokland.com/battle_map/rift_of_worlds/rift_raid), [older 25% description](https://www.swmasters.com/blog/r5-guide)
4. **Its value differs by monster.** Early buffers and cleansers can lose the whole opening if disabled. Damage dealers may contribute more with Fight if recovery is adequate. Team 3 has no cast immunity. Baleygr also gains an opening resource from Will, so his decision cannot use only the usual immunity-versus-Fight comparison.

**Recommendation:** Start with the selective Will builds above, then compare one change at a time. On supports, replace Will with Fight when opening protection proves unnecessary; use a defensive aura only to solve a measured survival or resistance need. On attackers already shown with Fight, compare Will if opening debuffs impair damage or timing. Baleygr is a separate stack experiment. No game runs have yet established which Will sets are dispensable.

### Baleygr: correct the resource model before investing

The current passive gains Knowledge from received beneficial effects, +1 at the start of his turn **only when he has at most two**, and +3 on a monster's death, capped at five. There is no critical-hit trigger. Deaths are outside this plan. His S3 consumes stacks and hits according to the number consumed; missing later hits can cost more than a simple proportional share because damage increases through the sequence. [SWARFARM passive](https://swarfarm.com/api/v2/skills/2088/), [Baleygr skills](https://www.sw-database.com/baleygr-fire-lightning-emperor)

Illustrative opening cases, assuming his passive is active and the stated buffs are actually granted:

- Hypothetical no rune buff, Fran's two buffs only: two Knowledge, then the conditional +1 gives three.
- Hypothetical Will only, then Fran's two buffs: up to three, with no extra point merely for starting his turn at three.
- Hypothetical no rune buff, Fran's two buffs and Miriam's two: up to four, with no automatic fifth point.
- Will plus both buff skills (even before counting the required Shield): up to five. This is a plausible five-stack opening, not an Auto guarantee.
- **Required baseline: Shield plus Will, then Fran's two buffs:** up to four Knowledge, with no automatic fifth at turn start. Miriam must supply another application or another verified source must contribute. Darion's Fight / Shield / Will supplies the shield. Compared with the former Fight / Tolerance / Will, the cost is ten percentage points of local RES; count any boss healing from stripped buffs as well. Additional Shield sets may enlarge the shield but must not be counted as separate shield icons or guaranteed extra Knowledge.

The cases without Shield explain the mechanic; they are not permitted builds for Baleygr's team under the developer's Shield requirement. These are upper-bound application counts, not a claim that refreshing an existing ATK/immunity icon always grants another point in every sequence. Record actual stacks, including overlap, Miriam's chance-based shield, boss Oblivion, and every subsequent S3. The opening Will/Shield buffs are not renewed after each S3; a strong first burst proves nothing about later five-stack uptime. Miriam's stronger buff and passive rune stats add no separate stack. [Will/Shield Knowledge interaction](https://summonerswar.fandom.com/wiki/Lightning_Emperor_%28Fire%29_-_Baleygr), [Miriam active skill](https://www.sw-database.com/miriam)

## Swift, auras and stat costs

**No Swift build is required by this recommendation.** With the developer's reported SPD substats, use the required order at the lowest useful speed and spend the four-piece opportunity on team benefit. Swift remains an allocation candidate only if the complete build demonstrably saves enough other stats to beat the aura build. Excess speed can add animations, consume protection earlier or move damage ahead of debuffs; it is not free damage.

Fight is the first offensive support choice. Each completed two-piece set gives **its own six allies** +8% of their individual base ATK. Tolerance gives +10 percentage points RES; Enhance and Determination give +8% base HP and DEF. They stack locally and are constant stats, not strippable buff icons or Knowledge generators. Four Swift runes can therefore be replaced with two useful two-piece sets, provided actual stats and timing remain adequate. Three Fight sets on one support are valid; there is no arbitrary aura cap. [Game rune reference](https://www.summonerswar.com/en/skyarena/game), [JASWA rune model](RUNE-CANONICAL.md)

Fight does not mean +8% final damage: an extra 8% base ATK adds proportionally less to an attacker that already has substantial ATK bonuses, and not all damage scales with ATK. Compare the six recipients' delivered damage. Enhance/Determination can win offensively if they release enough defensive rune stats on multiple attackers. Neither is automatically inferior to Fight.

**Tolerance is conditional, not Fight's automatic equal.** With Tesarion's lead, a normal 15%-RES monster starts at 56% combat RES before rune RES and auras. One Tolerance gives 66%, three give 86%, and five reach the 100% cap with some excess. Riley and Dias already have 40% panel RES from awakening: 81% with the lead, 91% with one Tolerance and capped with two. Count each recipient; repeated Tolerance can quickly be wasted on these units. One Tolerance lowers the panel RES needed for the old optional 70% target from 29% to 19%, but that target itself is not a breakpoint.

For a resistible effect, conditional landing chance after activation is `1 − max(15%, RES − ACC)` with valid capped stats. At the commonly listed 0% boss ACC, 70% RES leaves 30% landing chance; 100% RES still leaves 15%. This does not protect against stripping or effects that bypass resistance. Added resistance can help, especially against Oblivion, but cannot be called immunity. [Resistance mechanics](https://summonerswar.fandom.com/wiki/Resistance), [boss reference stats](https://theriagames.com/guide/summoners-war-chaos-beast-guide/)

For attackers, compare Rage / Fight against Fatal / Fight, triple Fight and a stronger mixed allocation. Use Vampire only when sustain justifies its damage cost; it is a reference on the two exposed attackers, not a permanent requirement. Use ATK% slot 2 whenever substats reach the desired order; SPD slot 2 is an option. CD% slot 4 and ATK% slot 6 are the offensive starting point, with HP%/DEF% substituted where the position requires it. Supports use HP%/DEF% and enough SPD, with Fran's ATK-based healing assessed separately. All 18 builds must use disjoint runes.

## Accuracy, survival and timing

**ACC:** The 15% target follows the commonly listed 30% boss RES and 15% minimum resistance chance. More ACC cannot improve that resistance check under this assumption; it cannot fix a skill's activation chance or an immune effect. Darion, Hwa, Tesarion and Loren already cover the target through awakening. Miriam's stun is ineffective here; Baleygr's buff steal is not a required raid debuff. Riley has no required hostile effect. Brandia and the other listed debuffers still receive a target even when damage is their main role. [Boss reference stats](https://theriagames.com/guide/summoners-war-chaos-beast-guide/), [monster data](https://swarfarm.com/api/v2/monsters/)

**CR:** Retain 76% panel CR on damage dealers with Theomars, including awakening already visible on the panel. Agrius's general 30% lead lowers that to 70%. Do not spend six released points twice, and do not assume every existing rune build can realize the theoretical saving.

**EHP:** Use `HP × (1142 + 3.572 × DEF) / 1000` consistently. The earlier 130k/145k/150k/175k front and 85k/90k back targets are retained only to reproduce a conservative comparison. Darion's 175k was not derived as a mechanical threshold from his 15% extra damage. His passive, enemy attack break, artifacts, heals and battle auras must be assessed separately. Count Enhance/Determination once in the battle sheet, and do not assume a higher unbuffed EHP necessarily survives every buff-ignoring or position-dependent attack. [SWCalc defense factor](https://swcalc.cz/game-mechanics#term-4-defensefactor), [JASWA calculation authority](CALCULATION-AUTHORITY.md)

Traditional guide starting points are 22k HP / 1.3k DEF for four frontliners, 25k / 1.5k for two, and 20k / 800 DEF for backliners. These are practical heuristics, not hard game gates; neither interpolation nor a single EHP cutoff establishes a three-front requirement. Four frontliners distribute pressure and protect the back. Moving Theomars back can free his stats but raise the survival cost for all five other allies. Test the complete formation and its rune allocation before claiming the change saves resources. [Frontline guide](https://www.swmasters.com/blog/r5-guide), [formation mechanics](https://m-mercury.qpyou.cn/custom/board_detail/4)

**Timing:** The table figures express the retained combat-speed references without Swift under +39% base SPD bonuses, checked through the repository's single speed model. Fran needs 186 display SPD for 227 raid combat SPD without Swift; the previous 187 display target was the Swift figure and would give 228 without it. The commonly listed head speed is 192 raid combat SPD. Being above it establishes neither actual opening order against nonzero bars nor correct burst timing. Do not raise every monster above 192 as an independent optimization objective. [SWCalc speed calculation](https://swcalc.cz/game-mechanics), [JASWA clock](SPEED-TICK-CANONICAL.md)

Within a team, put a useful buff and DEF-break opportunity ahead of its major attack where possible. Across teams, sharing debuffs does not synchronize skill animations, Auto decisions or boss events. The current speed tool cannot certify this full raid sequence. This review reran the empty-bar clock: all three listed orders hold before a 192-SPD head; Team 3 also holds with a uniform 15% or 16.5% ally boost. These are reference checks only: unequal boosts, failed debuffs, extra turns, opening bars and the jump require observation. After the boss cleanses its debuffs, measure whether DEF break and brand are restored before Brandia, Baleygr or the twins commit damage.

## Alternatives and investment decisions

Keep these candidates, but tie each test to the contribution it replaces:

- **Kro (2A) for Seren:** First burst comparison on Team 3. Keep the same formation initially, with appropriate frontline survival. Test whether added burst/brand outweighs helper attacks and attack-break coverage.
- **Agrius for Theomars:** First leader comparison. The 30% general CR lead releases six percentage points across the raid; retain the RES/SPD leads. His self-speed mechanics require a new multi-turn check. At 104 base SPD, non-Swift 161 display SPD gives 202 raid combat SPD under +39%. Do not infer a faster raid from CR alone. [Agrius skills](https://swarfarm.com/bestiary/34102-fire-centaur-knight/)
- **Tarq (2A) for Seren or Raoq:** Compare two-helper attacks, brand and self-sustain; his self-SPD buff changes later order. **Hraesvelg for Baleygr** is another conditional offensive test, but his buffs change timing and Berserk reduces his DEF. [Tarq](https://swarfarm.com/bestiary/10601-water-hellhound-tarq/), [Hraesvelg](https://swarfarm.com/bestiary/18803-wind-barbaric-king-hraesvelg/)
- **Prilea, Arang or Hellea:** Use only if their DEF-break/brand/damage package beats existing control or redundant support. Replacing Loren loses direct control of Team 3's head. **Bastet for Colleen** changes boost, shield, healing and debuff coverage together, so it is a later package comparison, not a clean one-variable swap.
- **Icaru (2A):** A defensive team-up alternative. Calculate helper count from his actual battle DEF including local Determination; do not copy Seren's damage build. **Verdehile** changes team ATB and animations; more turns do not establish a faster completion.
- **Astar, Lucas, KEN/Bernadotte, Xiao Lin or Melissa:** Damage candidates after the required coverage is measured. KEN is the account's collaboration equivalent of Bernadotte. A third twin must justify displacing control or protection. **Kahli/Hwahee** are offensive buffers, not automatic cleanser replacements; changing a selected leader changes raid-wide stats.
- **Tien Qin, Xiong Fei, Belladeon, Lulu, Konamiya, Mei Hou Wang or Fuco:** Recovery/utility comparisons for an observed problem. Tien Qin has no cleanse and his Guild SPD lead does not apply. A **Wind Homunculus** recommendation requires the account's actual skill path.
- **Janssen, Dagora, Iunu and Drogan:** Do not import their planned-death strategies into this no-death recommendation. The previous account review did not find **Deborah, Fami, Argen, Xiao Chun, Chamie or Igmanodon**; acquisition would require a fresh roster assessment.

Published Solo R5 lineups establish relevant candidates, not transferable completion times. SWGT's 2026 beginner example and faster examples contain death/revive enablers or unavailable monsters. Their timings do not validate these modified no-death teams. [SWGT / Seiishizo compositions](https://swgt.io/controllers/gameguides/soloRAID?raidID=1)

Build supports to their useful function first. Then give Brandia and the twins first consideration for offensive improvement, followed by the measured team-up package. Treat Baleygr's priority as conditional on actual stacks and damage, and the Theomars/Agrius decision as a raid-wide allocation comparison. Skill-ups affecting healing, cooldowns and activation are part of the build. The earlier review recorded incomplete Brandia, Baleygr and 2A Colleen skills; confirm current levels before investing. There is no evidence for a precise priority ranking of all 18 monsters.

## Battle validation and decision gates

1. **Record the baseline.** Save all three leaders, formations, skill levels, six-rune assignments and relevant artifacts, including Team 1's mandatory complete Shield set. Use the tables to reproduce a first comparison, not as proof it is optimal. Record panel HP/DEF/ACC/RES/CR/SPD and the battle auras separately. No shared rune or planned death is allowed.
2. **Inspect full-auto runs before optimizing.** Record each head's opening action, actual buff skills, early debuffs, Baleygr's stacks at every S3, which allies Colleen boosts, debuff restoration after the jump, and deaths or near-deaths with their cause. If the baseline fails, fix the observed problem before ranking offensive variants.
3. **Screen one change at a time.** Use at least 30 runs per candidate as a practical first screen, recording failures, any monster death, median, mean, slowest run and total elapsed time including failures/retries. Compare matched rune quality where feasible. A formation or leader change necessarily needs its corresponding complete rebuild; document that intervention rather than pretending its other stats stayed identical.
4. **Run the highest-value comparisons.** First test Team 1's three-front allocation and Baleygr's resource delivery, then Kro/Seren and Agrius/Theomars individually. Test selective Will removal, aura substitutions and lower speed/defensive budgets separately. A recurrent deficit after the jump can justify a different cleanser or attacker instead of more opening insurance.
5. **Validate reliability beyond the screen.** Zero failures in 30 runs does not demonstrate a sub-1% failure rate. For zero failures, the one-sided 95% upper bound is `1 − 0.05^(1/n)`; at 30 runs it is about 9.5%, and about 299 failure-free runs are needed to get below 1%, assuming independent comparable runs. Track deaths separately because no planned deaths is weaker than no deaths in practice.
6. **Allocate the full rune pool last.** Optimize all 18 builds together against measured survival and timing needs. Recheck after skill-ups, artifacts, a leader change or a new formation. Keep the variant only when reliable whole-run performance improves; do not retain needless RES, SPD, EHP or a familiar set name for its own sake.

This document reviews mechanics and proposes testable builds. It does not claim in-game verification, a measured failure rate, or the fastest possible roster. The critical unknowns are actual Auto behavior, opening states, Knowledge delivery and the rune cost of survival. Those require game observations; neither a guide nor JASWA's isolated speed trace can supply them.
