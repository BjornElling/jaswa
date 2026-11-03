# Artifact rules — canonical specification

**Status:** Binding rule basis for every artifact JASWA reads, scores or recommends
**Reviewed:** October 20, 2026
**Game:** *Summoners War: Sky Arena*, client v9.3.x
**Code:** `app/lib/artifact-properties.ts` (vocabulary), `app/lib/artifacts.ts`
(reader), `app/lib/artifact-conversion-stones.ts` (stones),
`app/lib/artifact-optimal-value.ts` (the score),
`app/lib/artifact-value-on-monster.ts` and `app/lib/compute/artifact-score-core.ts`
(its two readers), `app/lib/artifact-preferences.ts` (defaults)
**Checks:** `verify:artifact-score-agreement`, `verify:artifact-score-scale`,
`verify:normal-conversion-maximum`, `verify:conversion-roll-range`,
`verify:engraved-conversion-stones`, `verify:intangible-artifacts`,
`verify:historical-artifact-import`, `verify:authoritative-artifact-import`,
`verify:artifact-conversion-lock`, `verify:conversion-share-tiebreak`,
`verify:artifact-obtained-order`, `verify:artifact-recommendation-allocation`,
`verify:webgpu-parameter-layout`

Where code, interface or a secondary guide contradicts this document, this
document governs until it is corrected with evidence. Every game rule names its
evidence (§14); a premise JASWA adopts without one is marked **modelled**. The
table and view contracts of the artifact pages live in `ACCOUNT-TABLES.md`.

**Most published artifact guides describe the game before v8.0.0.** Ranges,
names, the drop state and several properties changed then. Pre-v8 artifacts
appear here only as legacy (§12, §15.10–§15.11).

---

## 1. The model

A monster carries **at most two artifacts, one of each category**:

| Category | Must match the monster's | Classes |
| --- | --- | --- |
| **Attribute** (`type: 1`) | element | Water, Fire, Wind, Light, Dark |
| **Type** (`type: 2`) | archetype | Attack, Defense, HP, Support |

A Wind Attack monster takes one Wind artifact and one Attack artifact, never a
Water, HP or Support one. This is the engrave rule; `artifactFitsClassCodes`
states it once for both readers. *Evidence: v6.0.0; the account export.*

**Only a six-star monster engraves artifacts** (`canEngraveArtifacts`). JASWA
never scores or proposes an artifact on a lower-star copy; the artifact stays
in the collection for a six-star one. **Modelled:** no current text source
states the rule.

**Intangible** artifacts — the game's name, shown in the artifact panel — keep
their category and fill only that category's slot, but match **every** class in
it: an Intangible attribute artifact fits any element, an Intangible type
artifact any archetype. **A monster may carry at most one Intangible artifact**,
in either slot, and **an Intangible cannot be converted** (§10.1). *Evidence:
v8.1.9 ("Both Intangible Attribute/Type Artifacts cannot be equipped on the same
Monster"); encoding §15.1.*

Each artifact has one flat main property (§2), exactly four sub properties
(§4), a natural grade (§3), and possibly one permanently converted line (§10).
Artifacts have no sets, no slots, no percentage main and no Grindstones (§7).

Call the lines **sub properties**, not skills: `Life Drain` or `ATK/DEF UP
Effect` are not skill-specific.

---

## 2. Main property

| Id | Main property | Final value |
| ---: | --- | ---: |
| 100 | HP | +1,500 |
| 101 | ATK | +100 |
| 102 | DEF | +100 |

Two artifacts may carry the same main. The main is a flat addition to the
monster's stat (`monster-stats.ts` reads `pri_effect[1]`). Every view **names**
the main and never quantifies it (`AGENTS.md` §5): `Artifact` carries no main
value, and `artifactMainValue` exists only for calculations that need what two
artifacts already bring (`rune-substat-weights.ts`, `main-stat-model.ts`).
*Evidence: v6.0.0 +15 table; Ellia; every record of the account export
(2026-08-30: 424 HP, 408 ATK, 419 DEF, no other value).*

Since v8.0.0 artifacts drop finished at +15. No code models a power-up path.
*Evidence: v8.0.0.*

---

## 3. Natural grade and contributions

The grade decided how many lines an artifact had at +0; the four milestones
+3/+6/+9/+12 each added a missing line or upgraded one. A line's value is its
initial roll plus every power-up roll it received — its **contributions**.
*Evidence: v6.0.0 (milestones); v8.0.0 ("Sub-properties can be powered up a
maximum of 4 times").*

| Grade | `natural_rank` | Initial lines | Total contributions | Most on one line |
| --- | ---: | ---: | ---: | ---: |
| Normal | 1 | 0 | 4 | 1 |
| Magic | 2 | 1 | 5 | 2 |
| Rare | 3 | 2 | 6 | 3 |
| Hero | 4 | 3 | 7 | 4 |
| Legend | 5 | 4 | 8 | 5 |

- `artifactGrades` holds *most on one line* as `maxContributions`; total
  contributions are `maxContributions + 3` (`artifactTotalContributions`).
  Normal is the exception to `initial + rolls`: it starts with no line and
  still holds one roll on each of its four.
- **Four lines can never all be full.** A Legend holds 8 contributions; four
  full lines would need 20. The best split is 5 + 1 + 1 + 1.
- The game's best line collects five contributions
  (`bestArtifactLineContributions`), so the most any line of a property can
  hold is `maxRoll × 5` (`artifactPropertyMaximum`). This is the ceiling every
  line is measured against, whatever its grade (§16).

*Evidence: the account export (2026-08-30) — the four lines' power-up counts
sum to `natural_rank − 1` on every finished record: 334 Rare, 747 Hero,
170 Legend.*

---

## 4. Sub property rules

- A finished artifact has **exactly four** lines, and never one property twice.
- `[Skill 1] CRIT DMG`, `[Skill 2] CRIT DMG` and `[Skill 3/4] CRIT DMG` are
  distinct properties and may coexist.
- A category-only property appears only on its category (§5). The reader does
  not reject a violation (§13); the vocabulary and the stones hold it.

*Evidence: the account export (2026-08-30): four tuples on all 1,785 records;
no `3xx` on a Type artifact and no `4xx` on an Attribute one.*

**A legacy property v8.0.0 merged counts as its successor** for the no-twice rule:
204 and 205 as 226, 208 and 209 as 225, 402 and 403 as 410 (`mergedInto`).
An artifact carrying one cannot be converted to the successor on any other
line, while the legacy line itself may be. Its predecessors stay distinct
from each other: a 205 stone remains usable beside 204. The packed scorer
carries this as `subPropertyFamilyIndexes`, apart from the score's
`subPropertyIndexes`, because a merged legacy line still weighs nothing.

*Evidence for the merge rule: the client's Special Conv. list, 2026-11-04, on a
Werner (Fire) Attribute artifact carrying ATK Increasing Effect +8 % on line 1
and the conversion lock on line 4 — it disables the ATK/DEF UP Effect stone and
offers the DEF UP effect (205) stone. Only 204 → 226 is observed; the other
pairs are the same v8 merge (§5.1, §5.3) and follow by the same rule. Applying
it to them can only withhold a proposal, never invent one.*

---

## 5. The current property pool

`artifactProperties` is the vocabulary: id, name, category, status and per-roll
range. **Legend max** is `maxRoll × 5`; **converts to** is the normal
conversion range of §10. *Evidence: ids — SW Exporter `mapping.js` and the
account export; ranges — the in-client Repeat Convert dialog (2026-09-05),
Ellia, Fandom; current/legacy split — the engraving statistics (a current id is
one the population still engraves).*

### 5.1 Type artifacts only

| Id | Property | Per roll | Legend max | Converts to |
| ---: | --- | --- | ---: | --- |
| 400 | [Skill 1] CRIT DMG | 4–6 % | 30 % | 4–9 |
| 401 | [Skill 2] CRIT DMG | 4–6 % | 30 % | 4–9 |
| 410 | [Skill 3/4] CRIT DMG | 4–6 % | 30 % | 4–9 |
| 404 | [Skill 1] Recovery | 4–6 % | 30 % | 4–9 |
| 405 | [Skill 2] Recovery | 4–6 % | 30 % | 4–9 |
| 406 | [Skill 3] Recovery | 4–6 % | 30 % | 4–9 |
| 407 | [Skill 1] Accuracy | 4–6 % | 30 % | 4–9 |
| 408 | [Skill 2] Accuracy | 4–6 % | 30 % | 4–9 |
| 409 | [Skill 3] Accuracy | 4–6 % | 30 % | 4–9 |
| 411 | First Attack CRIT DMG | 4–6 % | 30 % | 4–9 |

- 410 is v8.0.0's merge of the legacy `[Skill 3] CRIT DMG` (402) and
  `[Skill 4] CRIT DMG` (403); 411 is the property v8.0.0 added. *Evidence:
  v8.0.0 ("5 removed, 6 combined into 3, 1 added"); the account export, where
  402/403 occur only on artifacts added 2020–2022.*
- 411 is **Type-only**: 79 occurrences, all on Type artifacts (export,
  2026-08-30).
- 401 rolls **4–6** like every skill line. Every 401 line above 6 with zero
  power-ups is a converted line, which reaches 9 (§15.8). *Evidence: the
  Repeat Convert dialog (4–9); the account export, 2026-10-19.*

### 5.2 Attribute artifacts only

| Id | Property | Per roll | Legend max | Converts to |
| ---: | --- | --- | ---: | --- |
| 300–304 | Damage Dealt on Fire / Water / Wind / Light / Dark | 3–5 % | 25 % | 3–8 |
| 305–309 | Damage Taken from Fire / Water / Wind / Light / Dark (−) | 4–6 % | 30 % | 4–9 |

The **target's** element decides, not the element of the monster carrying it:
`Damage Dealt on Water` acts against Water opponents.

### 5.3 Both categories — thirteen properties

| Id | Property | Per roll | Legend max | Converts to |
| ---: | --- | --- | ---: | --- |
| 206 | SPD UP Effect | 4–6 % | 30 % | 4–9 |
| 226 | ATK/DEF UP Effect | 3–5 % | 25 % | 3–8 |
| 210 | Bomb Damage | 2–4 % | 20 % | 2–6 |
| 214 | CRIT DMG Taken (−) | 2–4 % | 20 % | 2–6 |
| 215 | Life Drain | 5–8 % | 40 % | 5–12 |
| 218 | Additional Damage by HP | 0.2–0.3 % | 1.5 % | 0.2–0.5 |
| 219 | Additional Damage by ATK | 2–4 % | 20 % | 2–6 |
| 220 | Additional Damage by DEF | 2–4 % | 20 % | 2–6 |
| 221 | Additional Damage by SPD | 25–40 % | 200 % | 25–60 |
| 222 | CRIT DMG as enemy HP is more | 4–6 % | 30 % | 4–9 |
| 223 | CRIT DMG as enemy HP is less | 8–12 % | 60 % | 8–18 |
| 224 | Own turn 1-target CRIT DMG | 2–4 % | 20 % | 2–6 |
| 225 | Counterattack/Co-op Attack DMG | 2–4 % | 20 % | 2–6 |

- 206 is **SPD UP Effect** and 226 **ATK/DEF UP Effect**; the in-game panel
  names both on rid 1215663871 (an unpowered 6 and an unpowered 5). 226 is
  v8.0.0's merge of the legacy 204 and 205: those stop at v8 (90 and 42 lines
  before, none after) and 226 starts there (223 after, none before).
- 210 rolls **2–4**. Its lines at 1 all sit on artifacts acquired before
  v6.2.0 (§15.8). *Evidence: the Repeat Convert dialog (2–6); Ellia; Fandom.*
- 225 is v8.0.0's merge of the legacy 208 (Counterattack DMG) and 209 (Co-op
  Attack DMG).
- Additional Damage by SPD is 25–40 in the dialog where Ellia (pre-v8) gives
  20–40; the dialog is newer and governs.
- `206` is also the one line the stat sheet reads, for the speed buff its holder
  receives (`spdUpEffectPropertyId`).

---

## 6. Combat behaviour — reference only

**JASWA computes no artifact combat value** (§19.1). What follows is
non-binding orientation for reading a preference; it is neither implemented nor
checked. Where a figure is ever computed, `CALCULATION-AUTHORITY.md` and its
SWCalc source govern.

| Property family | Effect in battle |
| --- | --- |
| Every CRIT DMG line, and the defender's CRIT DMG Taken | adds into one crit-damage bucket; Taken lowers the attacker's crit damage, not the hit |
| First Attack CRIT DMG | the first hit on each target in the monster's turn |
| Own turn 1-target CRIT DMG | own turn, genuinely single-target skills |
| CRIT DMG as enemy HP is more / less | scales with the target's current HP ratio |
| ATK/DEF UP and SPD UP Effect | strengthens the buff the holder receives — `⌊30 × (1 + e)⌋` for SPD (`SPEED-TICK-CANONICAL.md`) — never the stat |
| Recovery, Life Drain, Bomb Damage | multiply an existing heal, drain or bomb; no drain source, no gain |
| Accuracy | adds to the skill's ACC check, not to the activation chance |
| Damage Dealt on / Taken from *X* | a damage-bonus bucket and a late reduction, against element *X* |
| Additional Damage by HP / ATK / DEF / SPD | a flat amount per hit from the final stat, cannot crit, ignores DEF |

*Evidence: Ellia; SWCalc, as summarised before October 2026; not re-checked.*

## 7. What artifacts can and cannot do

Artifacts **cannot** have rune sets, be ground, take Enchanted Gems, carry a
percentage main, have more than four lines, or appear twice in one category on
one monster. They **can** be converted (§10), be reappraised (§11), carry legacy
properties (§12), and share a main across both categories.

## 8. Why a score reads preferences

No artifact line has a context-free combat worth: crit lines depend on the
skill and the crit, element lines on the target, buff lines on who buffs,
additional damage on the hit count. Only the main is static. So JASWA's score
measures **how fully an artifact rolled on what the monster is declared to
want** (§16, §19), never a summed percentage of unlike effects.

## 9. Stored values

A line's value is held in **hundredths of a percentage point**
(`valueHundredths`): 25 % is 2500, 0.2 % is 20. The export writes decimals, and
`218` arrives with float error in it (`0.6000000000000001`), so the reader
rounds to hundredths and rejects a value that is not within `10⁻⁶` of one.
Comparisons are on integers.

---

## 10. Conversion

| Mechanism | Effect | Spends |
| --- | --- | --- |
| **Normal conversion** | replaces one line with a random legal property and value | Conversion Stone, Mana |
| **Engraved conversion** | replaces one line with the property the stone names (§15.12) | Engraved Conversion Stone, Mana |

**The permanent slot lock.** After an artifact's first conversion, only that
**position** may be converted again; its property and value may change again,
no other position may. The lock is never cleared or moved
(`convertedPropertyIndex`, zero-based, `null` before a first conversion). The
converted mark sits on line 1–4 in displayed order and means "the only line a
further stone can touch". *Evidence: the in-game panel (rid 1221299508,
§15.6).*

**A normal conversion reaches one and a half rolls:**

```text
conversion minimum = minRoll
conversion maximum = ceil(maxRoll × 1.5)    rounded up to the display step
```

The **Converts to** columns of §5 are this rule; the rounding shows on 3–5
(7.5 → 8) and 0.2–0.3 (0.45 → 0.5). `artifactNormalConversionMaximum` computes
it, `artifactNormalConversionContributions` (1.5) is the rate a perfect
conversion is worth in the score, and `verify:normal-conversion-maximum`
transcribes the dialog's 33 rows. *Evidence: the in-client Repeat Convert
dialog, read 2026-09-05, which names the lowest and highest threshold of every
property a normal conversion may roll.*

The conversion roll the user assumes (`conversionRoll`: minimum, one third,
average, two thirds, three quarters, maximum; default three quarters) is a
share of that range (`artifactConversionRollFraction`): the floor is
`minRoll / ceiling`, the average the midpoint, and a stop never assumes less
than the one to its left.

**There are no artifact Grindstones**; nothing raises a line in place.

### 10.1 An Intangible artifact cannot be converted

Neither stone applies to an Intangible, so it keeps the four lines it dropped
with, and `convertedPropertyIndex` is `null` on every one. **No projection,
conversion gain or stone may be computed for an Intangible**, in any conversion
mode: both readers score it on its lines alone (`scoreArtifactOnMonster` returns
before the conversion search; the WebGPU shader matches), and
`ownedConversionPropertyIndexesByClass` files no entry under
`intangibleRestrictionCode`. *Evidence: v8.1.9 ("Normal and Special Conversion
are not available on Intangible Artifacts"); the client, 2026-09-05.*

---

## 11. Reappraisal

Artifact Reappraisal spends **Core Fragments** and redistributes an artifact's
properties and power-up levels; the **total power-up count is preserved** (a
Legend with four power-ups keeps four). Up to **three** lines may be locked;
a locked line keeps its property and its power-up level. Repeat Reappraisal and
Repeat Conversion run up to **10** attempts against chosen properties and
stop at a match, at 10, or when materials run out. *Evidence: v9.0.0
(2025-11-12) and its preview (2025-11-05); v9.1.4 (2026-02-25).*

**JASWA does not model reappraisal**: no score, projection or recommendation
assumes one. Whether reappraisal applies to an Intangible is unknown.

**Refine** is three things: v8.0.0's one-time completion of a pre-v8 artifact
below +15 (§15.10), v9.0.0's unrelated *Rune* Refinement, and none of
Reappraisal. Name reappraisal code after reappraisal.

---

## 12. Legacy properties

The game keeps retired properties on the artifacts that already carry them, and
stones naming them "remain usable" (v8.0.0). **The reader accepts every
legacy id**; refusing one would refuse a legal artifact.

| Id | Property | Retired |
| ---: | --- | --- |
| 203 | SPD Under Inability Effects | v6.2.0 |
| 207 | CRIT Rate Increasing Effect | v6.2.0 |
| 211 | Damage Dealt by Reflect DMG | v6.2.0 |
| 212 | Crushing Hit DMG | v6.2.0 |
| 213 | Damage Received Under Inability Effects (−) | v6.2.0 |
| 200 | ATK Increased Proportional to Lost HP | v8.0.0, removed |
| 201 | DEF Increased Proportional to Lost HP | v8.0.0, removed |
| 202 | SPD Increased Proportional to Lost HP | v8.0.0, removed |
| 216 | HP when Revived | v8.0.0, removed |
| 217 | Attack Bar when Revived | v8.0.0, removed |
| 204 / 205 | ATK / DEF Increasing Effect | v8.0.0, merged into 226 |
| 208 / 209 | Counterattack DMG / Co-op Attack DMG | v8.0.0, merged into 225 |
| 402 / 403 | [Skill 3] / [Skill 4] CRIT DMG (Type) | v8.0.0, merged into 410 |

*Evidence: v8.0.0's counts (five removed, six merged into three); Ellia's v6.2
list; names from in-game panels on rids 319233427, 60850484, 60874386,
52204289 and 147366072. 212 is the one name no owned artifact anchors.*

Every legacy id is `availability: 'both'` except 402/403, because the few
observed lines are too thin to narrow a category.

**A legacy line weighs zero and never gates.** No monster can want a property
the drop pool no longer produces, so its range is `null`, it has no ceiling
(`maximumHundredths: null`, in every era), and both readers score it as an empty
unwanted line: the packed scorer has no index for it, and
`artifactJudgementOnMonster` enters it at value 0. A legacy line never makes an
artifact unjudgeable. The account does reveal some old ranges (§15.11); they are
deliberately not stored, because a ceiling could only ever refuse a judgement.

**A stone naming a legacy property** is read, counted and shown as *not
valued*, and never spent (§15.12).

---

## 13. The import contract

A game response is authoritative about an artifact the account owns. The reader
validates the shape it needs and **rejects** — never repairs — a record that
fails it (`readArtifact`); the importer then refuses the whole file with
*This file contains an (engraved) artifact JASWA cannot read.* (`AGENTS.md`
§0.1).

Checked:

1. `type` is 1 or 2; `natural_rank` is 1–5; `rid` is a safe integer.
2. `pri_effect[0]` is 100, 101 or 102 and `pri_effect[1]` is a number (read,
   then dropped).
3. `sec_effects` holds exactly four tuples, each a known property id (current
   or legacy), a finite value representable in hundredths (§9), a whole
   power-up count ≥ 0, and whole conversion flags ≥ 0 at positions 3 and 4.
4. The engrave class (§15.1) is a named element or archetype, or 98
   (Intangible). An unnamed class is rejected, never imported and hidden.
5. No artifact is engraved on two Scenario monsters (*This file engraves one
   artifact on two monsters.*).
6. Every `artifact_crafts` record decodes (§15.12), or the file is refused
   (*This file contains an engraved conversion stone JASWA cannot read.*).

**Not checked, by design:** roll ranges, conversion limits, power-up totals,
duplicate properties and category membership of a line. They describe what the
game normally creates; the game is the authority on what it did create, and a
changed conversion or reappraisal encoding must not freeze the import
(`verify:conversion-roll-range`, `verify:authoritative-artifact-import`).

---

## 14. Sources and revision rule

| Tag | Source | Date |
| --- | --- | --- |
| v6.0.0 | Com2uS v6.0.0 notice, <https://summonerswar.spokland.com/game/update/v6.0.0_update_notice-2020-07-30> | 2020-07-30 |
| v6.2.0 | The value increase; date confirmed by the account (§15.11); retired list per Ellia | 2021-01-28 |
| v8.0.0 | Com2uS v8.0.0 notice, <https://summonerswar.spokland.com/game/update/v8.0.0_update_notice-2023-06-30> (property tables are images) | 2023-06-30 |
| v8.1.9 | Com2uS v8.1.9 notice (Intangible), <https://summonerswar.spokland.com/game/update/v8.1.9_update_notice-2023-12-29> | 2023-12-29 |
| v9.0.0 | Com2uS v9.0.0 notice, Steam gid 1816215235343275; preview gid 1815580768225554 | 2025-11-12, 2025-11-05 |
| v9.1.4 | Com2uS v9.1.4 notice (Repeat Reappraisal/Conversion), Steam gid 1825727806703809 | 2026-02-25 |
| Dimension Arena | Developer's Preview #6, Steam gid 1845383656385392 | 2026-10-02 |
| Dialog | In-client Repeat Convert dialog, every normal-conversion range | read 2026-09-05 |
| Tooltips | In-client engraved conversion stone tooltips | read 2026-09-05 |
| Panel | In-client artifact panel, per rid as cited | 2026-08-30 – 2026-09-05 |
| Export | The user's account, `HubUserLogin`: 1,785 records (2026-08-30), 1,862 (2026-09-01), 2,089 (2026-09-04), the 401 lines (2026-10-19), all 271 stone records (2026-10-20) | as stated |
| Statistics | `app/data/engraving-statistics.json` (`ENGRAVING-STATISTICS.md`) | per row |
| SW Exporter | `app/mapping.js`, artifact `effectTypes`, <https://github.com/Xzandro/sw-exporter> | 2025-09-29 |
| Ellia | <https://elliabot.neocities.org/game_mechanics/artifacts/> (pre-v8 content) | undated |
| Fandom | Summoners War wiki, *Artifacts* (search snippet only) | ~2026-07-30 |

Steam notices are read through
`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2426960&count=300&maxlength=0`.
A first-party source — a notice, the client, or the account's own export —
outranks a secondary table.

**Nothing is guessed.** An unknown property id, engrave class or field value
never receives a fallback meaning: the record is rejected until the meaning is
found (`AGENTS.md` §0.1). Revalidate the pool, the ranges and the merges on
every game update.

**Watch item.** Dimension Arena (announced for November 2026) brings monsters
and artifacts that exist only inside it. If the export carries them, the import
needs a decision under `AGENTS.md` §0.1 before they are counted.

---

## 15. The export encoding

### 15.1 The record

```jsonc
{
  "rid": 319233427,          // identity and obtained order (§15.13)
  "occupied_id": 0,          // 0 in inventory; else the Scenario unit_id
  "slot": 0,                 // 0 in inventory; else 1 Attribute, 2 Type
  "type": 2,                 // 1 Attribute, 2 Type
  "attribute": 0,            // engrave class on type 1
  "unit_style": 2,           // engrave class on type 2
  "natural_rank": 3,         // grade, §3
  "rank": 5, "level": 15,    // constants on every post-v8 record
  "pri_effect": [100, 1500, 15, 0, 0],
  "sec_effects": [[220, 4, 0, 0, 0], /* exactly four */],
  "locked": 0, "source": 50001, "extra": [], "date_add": "…", "date_mod": "…"
}
```

- **`type` decides which class field is read**: `attribute` on type 1,
  `unit_style` on type 2; the other is 0. `slot` restates `type` on every
  engraved artifact.
- **Class codes**: elements Water 1, Fire 2, Wind 3, Light 4, Dark 5
  (`artifactElements`); archetypes Attack 1, Defense 2, HP 3, Support 4
  (`artifactArchetypes`).
- **98 is the Intangible engrave class** (`artifactIntangibleEngraveClass`).
  31 of 1,862 artifacts carry it, 25 in `attribute` and 6 in `unit_style`; the
  game shows them as "Intangible … Artifact". Their `type` is unchanged and
  their lines keep the category split (35 `3xx` lines on type 1, 11 `4xx` on
  type 2), so the category binds and only the class is open. *Evidence: export
  and panel, 2026-09-01.*
- Both compute backends encode the wildcard as `intangibleRestrictionCode` (0,
  outside both class numberings), and must match it identically
  (`verify:intangible-artifacts`).

### 15.2 `pri_effect`

`[id, value, 15, 0, 0]`, with exactly the three pairs of §2.

### 15.3 `sec_effects`

```text
[ effectId, value, powerUpCount, currentConversionFlag, legacyConversionMarker ]
```

Position 2 is the line's power-up count (§3's invariant). Grouping values by it
reproduces `initial + n rolls`, e.g. 206: 4–6, 8–12, 12–18, 17–24 at 0–3
power-ups. Position 3 and 4 are §15.6.

### 15.4 Id ranges

| Range | Category | Current | Legacy |
| --- | --- | ---: | --- |
| `2xx` | both | 13 | 200–205, 207–209, 211–213, 216, 217 |
| `3xx` | Attribute only | 10 | — |
| `4xx` | Type only | 10 | 402, 403 |

The statistics' `effect_id` for an artifact sub property is this same space
(`ENGRAVING-STATISTICS.md` §1).

### 15.5 Recognising legacy ids

A legacy id is listed explicitly (§12) and never derived. Absence from the
engraving statistics is a strong signal — every id the statistics name also
occurs on the account, and the inventory alone shows only 201, 205 and 217 on
rid 319233427 (2022-09-29) — but a current property could be absent merely
because no captured monster favours it. The full legacy set appears once the
engraved artifacts are read as well.

### 15.6 The conversion markers

- **Position 3** marks the permanent lock in the current client: rid
  1221299508 shows the Convert mark on its fourth line, `[409, 8, 0, 1, 0]`.
- **Position 4** is an older encoding of the same lock (rid 284184132,
  `[221, 31, 0, 0, 1]` on its marked third line). It is read only where no
  position-3 flag exists, and its magnitude is not modelled.

Both are metadata, never validation (§13). (§15.7 is not used.)

### 15.8 Lines outside a current single-roll range

Two kinds of line exceed or undercut today's per-roll range on a line with zero
power-ups, and neither widens the table:

- **Above the maximum: converted lines.** Every 401 line above 6 with zero
  power-ups carries a conversion mark; a conversion reaches 9 (§10). *Export,
  2026-10-19.*
- **Below the minimum: pre-v6.2.0 artifacts.** 206 at 3, 406 at 3 and 210 at 1
  occur only on artifacts acquired before 2021-01-28, and never after
  (§15.11).

The 206/226 naming evidence is in §5.3.

### 15.9 What converted lines show

Across the account's converted lines with a known range (2026-09-05): **none
falls below `minRoll`**, none exceeds `ceil(maxRoll × 1.5)`, and 142 of 265 hold
less than `2 × minRoll`. A conversion re-rolls the line from nothing — its floor
is one roll's minimum, not a multiple of it — and its ceiling is the dialog's
(§10). Every converted line stores `powerUpCount: 0`.

### 15.10 Pre-v8 artifacts can remain unrefined

An artifact added before July 2023 whose `level` is below 15 still needs the
game's one-time Refine. The reader accepts it, sets `unrefined` (shown as a
marker), and keeps it in every recommendation and calculation. Its current
properties are measured on today's table and its legacy ones have no ceiling
(§12). `date_add` decides only this cutoff (`artifactPowerUpRemoval`, July 1,
2023 UTC); an unreadable date is `null` and never passes it.
*Evidence: v8.0.0; the September 1, 2026 import audit found 202 such artifacts
from 2020–2022.*

### 15.11 Three generations of roll tables

| Generation | From | Change |
| --- | --- | --- |
| Launch | v6.0.0, 2020-07-30 | the original, lower table |
| v6.2.0 | 2021-01-28 | initial and power-up values raised; five properties retired (§12) |
| v8.0.0 | 2023-06-30 | drops arrive finished; five removed, six merged into three, one added |

v8 changed the vocabulary and the upgrade mechanic, not the per-roll figures:
24 of 29 properties have identical single-roll values either side of it. The
v6.2.0 boundary is visible in the account: every sub-floor single-roll line
sits on an artifact acquired before 2021-01-28. Single unpowered lines from
after the increase give the legacy ranges 200–202 = 9–14, 204 = 3–5,
205 = 2–4, 208/209 = 2–4, 216 = 4–6 and 402 = 4–6; they are not stored (§12).

### 15.12 Engraved conversion stones live in `artifact_crafts`

The account's engraved conversion stones are the `artifact_crafts` collection,
not `rune_craft_item_list` (whose types 5 and 6 are Gems and Grindstones,
`RUNE-CRAFT-ITEMS.md`). The 12-digit `master_id` reads `CCC EEE AAG PPP`:

| Segment | Meaning |
| --- | --- |
| `CCC` | `101` attribute stone, `102` type stone |
| `EEE` | element × 10 on an attribute stone; `000` on a type stone |
| `AAG` | archetype × 100 + natural grade (3 Rare, 4 Hero, 5 Legend) |
| `PPP` | the property the stone engraves |

```text
101 010 005 301   Legend Water attribute stone, Damage Dealt on Water
102 000 103 407   Rare Attack type stone, [Skill 1] Accuracy
```

- **The two class fields are mutually exclusive**; a record filling both, a
  zero class, an unknown grade or property, or a property of the other
  category is unreadable, and the import is refused (§13 item 6). A stone needs
  a `rid`. Quantity 0 is a readable empty stack; a negative quantity is
  malformed.
- **A stone binds one engrave class.** A Water stone converts a Water attribute
  artifact and nothing else. **No stone applies to an Intangible** (§10.1).
- **A stone naming a legacy property** (174 of the account's stones, all 216
  or 217) is read with `valued: false`, counted and shown as *not valued*;
  nothing spends it. `engravedConversionStoneCounts` returns `{valued,
  notValued}`, or `undefined` when the import carried no `artifact_crafts`.
  *Evidence: v8.0.0 ("Engraved Conversion Stones that include the
  sub-properties that will no longer appear … remain usable"); export
  2026-10-20: 301 valued, 174 not valued, all 271 records readable.*
- **A stone's grade raises the floor, never the ceiling.** Every stone's
  tooltip maximum is the normal-conversion ceiling of §10; a Rare stone spans
  the whole normal range, a Legend stone starts about two thirds of the way up
  (Life Drain 8~12, Bomb 4~6, the 4–6 skill lines 7~9). So no engraved
  conversion produces a line a normal conversion could not. *Evidence:
  Tooltips, 2026-09-05, nine stones over two grades.*
- **Modelled:** the conversion roll assumption (§10) uses the normal range for
  every stone; a stone's grade does not enter it, so the *minimum* to
  *average* settings understate a Legend stone.
- The stone a recommendation names is the best grade owned for that property
  and class (`engravedStoneFor`, §17.6).

### 15.13 `rid` is the obtained order; `date_add` is not

The game's "Obtained" sort is `rid` order (`obtainedOrder`). `date_add`
resolves only to the second and the game grants artifacts in bulk: in a
2,089-artifact snapshot (2026-09-04), 548 share a second with another, in
batches up to 139. Sorting by `rid` never puts a later `date_add` first (0 of
2,088 adjacent pairs), needs no tiebreak, and needs no time zone. `rid` must be
a safe integer, or the record is rejected (§13). `date_add` keeps one job: the
Refine cutoff (§15.10). `verify:artifact-obtained-order` holds both.

---

## 16. JASWA's artifact score

`calculateArtifactOptimalValue` (`artifact-optimal-value.ts`) defines the score;
both readers call its parts. It measures **how fully an artifact rolled on what
the monster declares valuable** for that category — never combat output.

With `a` the *acceptable worth* (§19.6) as a fraction:

```text
w(preferred) = 1     w(acceptable) = a     w(unwanted) = 0

line points  pᵢ  = value / maxRoll                 (artifactLineMaxRolls)
main points      = w(main) × 2                     (artifactMainPropertyPoints)
benchmark        = 2 + 4 + 3a                      (artifactScorePointBenchmark)

score = (main points + Σ w(lineᵢ) × pᵢ) / benchmark
```

- **A line's points are maximum natural rolls**: 12 % on a 4 % property is
  3 points. The point is natural, not grade-relative, so a Normal line holding
  its single roll scores a fifth of a full Legend line — the truth about both.
  A line above five points (`value > maxRoll × 5`) is invalid input: the score
  is `undefined`, never clamped.
- **The main is a term, not a factor (§16.1).**
- **The benchmark** is the best artifact the game can build on the profile
  monsters actually offer: a preferred main, one preferred line of four maximum
  rolls, and three acceptable lines of one each — 7 of a Legend's 8
  contributions, so reachable. *100 % is the right main, one preferred property
  that took most of the power-ups, and three more lines the monster accepts.*
  It is fixed: derived neither from the artifact (which would let one max
  preferred line and three irrelevant ones match four wanted lines) nor from
  the monster (which would let a one-property monster be served perfectly by a
  one-line artifact). Across 902 captured species, 830 have exactly one
  preferred sub property under §19.3's scoring cut, with about four acceptable;
  so one preferred line and acceptable neighbours is the profile that exists.
  The denominator runs from 6 (`a` = 0) to 9 (`a` = 1); 7.5 at the default 50 %.
- **A score above 100 % is intended**: the artifact beat the profile.
- **Legacy lines weigh zero** and never make an artifact unjudgeable (§12).
- **`undefined` versus 0.** A category with no usable preferences is *not
  judged* (`undefined`, §19.5); a judged category the artifact matches in
  nothing — main included — scores a real 0.

At the default `a = 0.5`, max rolls throughout:

| Profile (Legend unless stated) | Main | Points | Score |
| --- | --- | ---: | ---: |
| **The benchmark:** 1 preferred (4 rolls) + 3 acceptable (1 each) | preferred | 7.5 | 100 % |
| 1 preferred (5) + 3 acceptable (1 each) | preferred | 8.5 | 113 % |
| 1 preferred (5) + 3 unwanted | preferred | 7 | 93 % |
| 4 preferred (5 + 1 + 1 + 1) | preferred | 10 | 133 % |
| 1 preferred (2) + 3 unwanted | preferred | 4 | 53 % |
| the benchmark's lines | unwanted | 5.5 | 73 % |
| 4 preferred (5 + 1 + 1 + 1) | unwanted | 8 | 107 % |
| nothing wanted but the main | preferred | 2 | 27 % |

Four preferred lines on a preferred main give the grade ceilings 80 % (Normal),
93 %, 107 %, 120 % and 133 % (Legend), rising with what each grade delivers. A
monster with exactly one wanted property tops out at 93 %. At `a = 0`
acceptable means unwanted; at `a = 1` it means preferred, and four acceptable
max lines reach the benchmark.

`verify:artifact-score-scale` holds the benchmark at 100 % at every acceptable
worth, each grade ceiling reachable and above the one below, a wrong main
costing exactly its own points, and the WGSL backend computing the same
numerator and denominator. Changing the benchmark, the main's points or the
scoring cut of §19.3 is a deliberate recalibration: re-measure, and re-check the
bands of §18.2.

### 16.1 The main property is a term, not a factor

The main is **worth two maximum rolls of a preferred line**, added to the
numerator and carried, preferred, in the benchmark. It is one flat stat among
five contributions (§2), so it cannot veto the other four: an artifact on an
unwanted main keeps every point its lines earned, forfeits exactly the main's
two, and is still offered the conversions that would make it worth engraving.
Because the main sits on both sides of the fraction, a preferred main alone is a
floor of `2 / (6 + 3a)` — 27 % at the default.

---

## 17. The optimizer's purpose, and the rules that follow

The workspace answers **one** question: *which artifact, carrying which
conversion, belongs in each monster's Attribute and Type slots?* It ranks every
positive artifact/monster score together, locks the highest pair, and continues
down. A lock consumes that artifact and one slot. This is deliberately **not** a
maximum-sum matching: the user farms replacements continuously, so an
outstanding individual fit must win even where a portfolio would trade it away.

Every view reads a pair through one of two entry points that
`verify:artifact-score-agreement` holds to one answer: `artifactPairScore`
(the packed scorer the rankings use) and `artifactJudgementOnMonster` (one
artifact on one monster, for the library; `artifactValueOnMonster` is its
value-only wrapper). The library row takes its score
**and** its preferred/acceptable marks from that one judgement, so the marks
cannot answer from other preferences than the number beside them.

### 17.1 A score shown is a score used

Scores are computed, compared and stored as **whole percentage points**
(`scorePercent`), not merely rounded for display. Two artifacts reading 88 %
are equal in sorting, thresholds and recommendations; ties are broken by a
stated rule — the artifact's own order, `obtainedOrder` (§15.13) — never by a
hidden decimal, and never by its position in the import. The import lists the
inventory before the engraved, so a positional tiebreak flips as soon as one of
two tied artifacts is engraved, and the plan recommends swapping them back
forever.

### 17.2 A placement owns one artifact and one slot

Each monster has one Attribute and one Type slot. A placement fills only the
matching slot, an artifact occurs in one placement, and at most one Intangible
placement goes to a monster. The allocator checks all three after every pass
and fails loudly on a violation.

The table shows the complete result: **Keep** (already on its locked monster),
**Engrave** (belongs elsewhere), and **Sell** for every unselected artifact. A
zero score is legal but contributes nothing and may not fill a slot, so a slot
may stay empty; the report says so, says why — the artifacts went to monsters
scoring at least as well — and counts in the singular when the count is one.

### 17.3 Differences below the stated band are not differences

The user may declare a band of 1–5 percentage points
(`insignificantDifference`, off by default). A gain no larger than the band is
not an improvement on any page, and a conversion inside it is not part of an
artifact's potential score, its allocation or its recommendation.

### 17.4 A conversion is proposed only when it beats what is there

A conversion must raise the artifact's **total score** on that monster, in whole
points, by more than the band. An existing conversion is not protected by its
raw roll: if re-converting the locked line improves the artifact for its
monster, JASWA recommends it, worded *Re-convert to*.

- **Only one source line is scored**: the line contributing least to this
  monster; equal contributions go to the lower roll points, then to stored
  order. A converted artifact's source is its locked line, whatever it holds.
- **Every line in the chosen line's preference band is named**, in numeric
  order (`Sub 1/2/4`), because a monster is indifferent between lines it ranks
  alike and the user may be keeping one for a monster this plan has not
  reached. An empty slot ranks as unwanted. A locked artifact names its locked
  line alone.
- **A same-property target on the source line** is a reroll, worded *Improve
  roll in*; it never creates a duplicate.
- **Among targets of equal score**, the property more players engrave wins,
  then the lower id.

### 17.5 Every conversion worth taking is shown, in order

Where a view names conversions it shows **all** of them, best first, and the
same set defines the artifact's potential score:

- if any **preferred** conversion clears the band, every preferred one is
  listed and no acceptable one;
- otherwise every acceptable one;
- a property neither preferred nor acceptable is never suggested.

Preferred outranks acceptable absolutely: listing a strong concession above a
weak preference invites spending a stone on the concession.

### 17.6 A recommendation names the stone it would spend

A recommendation that depends on an engraved stone names it by grade and
engrave class, the shortest form that identifies the item: `Legend Water
stone`, `Rare Attack stone`. It names the best grade the account owns for that
property and class. In the theoretical mode nothing is spent and no stone is
named.

### 17.7 One Intangible choice, in Settings

Whether Intangible artifacts are **scored** is asked once, in Settings
(`includeIntangibleArtifacts`, on by default), and the score request is built
from that one answer. A view's own toggle — the library's `Include`, the
monster chooser's — only **lists** or hides rows already computed, as Location
filters do; a filter that reached the request would be the violation. The
library lists Intangibles by default, because parity (`AGENTS.md` §0.1) is that
page's whole job.

### 17.8 Views and tables

The table, filter and staleness contracts of the artifact pages —
sorting, the summary figures, Location before/after, Re-calculate — are in
`ACCOUNT-TABLES.md`. A backend that cannot answer must never answer zero:
`HARDWARE-ACCELERATION.md`.

---

## 18. Quality is text; a score is colour

The five tiers — Normal, Magic, Rare, Hero, Legend — are one vocabulary for
an artifact's grade and a rune's rarity. `app/lib/quality-tiers.ts` owns the
list; `ArtifactGrade` aliases it.

**A grade is shown as text, never as colour.** Painting the five game hues down
a dense table was tried and removed: the eye goes to whichever row is orange,
which says nothing about what to do, and the accent loses its meaning among four
rivals. There is no flat game palette to be faithful to — each tier is a radial
glow — and the game's Legend orange sits within 4° of hue of the accent at a
contrast of 1.04.

### 18.1 The one allowance: a rule in the margin

A tier may show as a **2px rule on the leading edge of a row's first cell**
(`app/components/quality-rule.tsx`), in the artifact recommendation table, the
best-artifact list, and the rune Clean-up and simulator tables. It survives the
objection above because:

- it sits outside the reading line, so it never paints a word or competes with
  the accent;
- it has the same size and place in every row and occupies its box in every
  state, so tiers compare down the column and nothing moves (`AGENTS.md` §2);
- its hues are muted, Legend is pulled redder off the accent, and Normal takes
  `--line-strong`, reading as an absence;
- it names its tier in `aria-label` and `title`, and grade stays sortable and
  filterable as text.

`AGENTS.md` §5 records this allowance; it does not extend to another shape.

### 18.2 A score reads in three bands

`artifactValueBands` in `app/lib/artifact-grid.ts` is the one set of boundaries,
applied through `artifactValueTint`:

| Band | Score | Tone |
| --- | --- | --- |
| Strong | 75 % and above | `--text-accent` |
| Fair | 50–74 % | `--text-strong` |
| Weak | below 50 % | `--text` |

Gold at the top band is the one place a *fact* wears the accent: there the
number is the invitation to act. An absent score is **unjudged, not low**: `—`
keeps its muted reading and never enters a band. No table carries its own
boundary. **Modelled:** the boundaries were set before the main became a term
(§16.1) and have not been re-measured on an account since.

---

## 19. Where a monster's property preferences come from

Every score in §16 and every recommendation in §17 rests on one statement:
which properties this monster wants. This section owns that statement.

### 19.1 The user declares what matters; JASWA measures only the roll

Per copy and category, the user marks properties **preferred** or
**acceptable**, and the score is how well the artifact rolled on exactly those.
JASWA holds no skill data and never checks whether a preference is sensible;
the player knows what the monster is for.

**The main is the one exception, and it advises rather than validates.** Which
of HP, ATK and DEF a piece should carry follows from the copy's runes
(`MAIN-STAT-MODEL.md`), so the main's default is computed, and a stated main
that contradicts it carries a yellow mark on the overlay. The stated answer is
still the one scored.

### 19.2 Preferences are held per owned copy, keyed by `(category, property)`

Preferences belong to an **owned copy**, keyed by `unit_id` — the game's
permanent name for it, which survives re-imports and ends when the copy is sold.
A copy's preferences are its **profile in Scenario or one content-area**
(`DECK-PRESETS.md` §4.1); every artifact page judges Scenario.

**Defaults stay per species**, because the statistics are keyed on
`unit_master_id` and a collaboration pair is one species
(`MONSTER-SPECIES-DECISION.md`). `resolveMonsterPreferences`
(`monster-preference-resolution.ts`) is the only place a copy's statement is
laid over its species' default.

**The score matrix is species rows plus the copies that disagree.** A copy that
has stated anything about artifacts, or whose runes give the main-stat model a
different answer from its species' statistics, gets its own row, keyed by
`unit_id` and carrying `ownerUnitId`; it inherits the species' element and
archetype, which are facts, not preferences. A page asking about an owned copy
reads its row where it has one and the species row otherwise
(`artifactScoreRow`). `verify:artifact-score-agreement` holds both readers to
one answer on both kinds of row.

- **Keyed by `(category, property)`**, never by property alone: a Life Drain on
  the Attribute artifact is a different opportunity from one on the Type
  artifact. The thirteen both-category properties appear in both lists and are
  set independently. Anything keyed on the property alone is wrong by
  construction.
- **One main answer for all the copy's gear.** `MonsterCopyPreferences.mainStat`
  is stated once and read for both artifact categories and the relic. Where it
  names no preferred main — never stated, cleared, or only accepted mains — the
  main-stat model answers, and an artifact and a relic may still default
  differently (`MAIN-STAT-MODEL.md` §6).
- **A gear answer is two bands**, preferred and accepted (`BandedChoices`). An
  option sits in at most one band; one in neither is unwanted. **Two empty
  bands are no answer**: the question reads as never stated, and the default
  answers it — the model for the main, the statistics for each substat
  category and the relic's uniques (§19.4).
- A sub property has no minimum roll; the score already measures the roll.

### 19.3 The statistics supply the sub-property defaults, by fixed shares

The engraving statistics (`ENGRAVING-STATISTICS.md`) supply the **default**
sub properties, classified from the raw counts of one `(species, category)`
distribution:

```text
share = property count / sum of all property counts in that distribution
```

| Use | Preferred | Acceptable | Code |
| --- | --- | --- | --- |
| **Scoring** | ≥ 10 % | ≥ 5 % | `artifact-preferences.ts` |
| **The overlay's defaults** | ≥ 6 % | — | `monster-defaults.ts` |

The two cuts answer different questions. The scorer asks *how much is this roll
worth*, where a narrow preferred band keeps the §16 benchmark meaningful; that
10 % is measured into the benchmark. The overlay asks *what should this
monster's substats be*: at 10 % that is one property for 93 % of monsters and
none for 7 %, where 6 % yields 3.6 on average and none for no captured monster.
An even share of 23 properties is about 4.3 %.

**The main is not polled**: its default is the main-stat model's
(`MAIN-STAT-MODEL.md`). The population's artifact main shares remain on the
overlay as reference only. The other panels' cuts are in
`ENGRAVING-STATISTICS.md` §10.

### 19.4 A user's statement always wins; an emptied gear answer is no statement

The statistics are consulted only where the user has stated nothing; the two
are never blended. The rule is the same for rune sets, rune slot mains,
artifact properties and relic properties.

| State | Stored | The answer comes from |
| --- | --- | --- |
| The user chose some options | the list of them | the user |
| The user stated nothing | **no key at all** | the default: statistics or model, where they cover the species |
| The user cleared a rune list | **an empty list** | the user — **not** the default |
| The user emptied both bands of a gear answer | **no key at all** | the default |

Store only what the user stated. *Never stated* is an absent key. A rune
answer is a yes/no list, and *cleared* is an empty array — "none of these" —
which survives `JSON.stringify` where `undefined` does not.

A gear answer is two bands, each chosen on its own line rather than by cycling
a chip, and two empty bands are **not** an answer. They once read `Any`, every
option preferred, and that was a trap: an owner who took their choices back
expecting the statistics left a copy that scored every artifact it could wear
above the benchmark and drew artifacts from every monster with a real
preference. So each of the four gear questions — the main, Attribute substats,
Type substats and relic uniques — is judged on its own: one emptied falls back
to its default, and the others keep what they state. `statedAnswer` in
`app/lib/monster-preferences.ts` is the one reading; the write route never
stores two empty bands, and the stored-copy reader reads a pair it finds as
never stated. **Reset to defaults** returns every choice to absent.

### 19.5 A species with no preferences is not judged

A species the dataset has not captured and the user has not filled in is **not
judged**: it is kept out of score-sorted views and given no fallback score.
Statistics that exist but express no usable property are `empty`
(`artifactPreferenceStatus`) and not judged either. A zero would sort as an
answer. The same rule covers runes and relics: a panel nobody says anything
about produces **no shortfall**, not a shortfall of zero.

### 19.6 One global factor says what "acceptable" is worth

`ArtifactSettings.acceptableWorth` is one of 0, 25, 50, 75 or 100 — the
percentage itself, so the value read and the value multiplied are one thing. It
is a validated set: a `.sw` file claiming 37 % did not come from this slider.
The default is 50 %; both ends switch the distinction off (§16).
