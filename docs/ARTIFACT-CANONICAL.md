# Artifact rules — canonical specification

**Status:** Binding rule basis for the JASWA Artifacts workspace
**Reviewed:** August 30, 2026
**Game:** *Summoners War: Sky Arena*, client generation v9.x (not *Chronicles*
or *Lost Centuria*)

This document is the canonical description of the game rules the Artifacts
workspace may build on. Where code, interface, or a secondary guide contradicts
it, this document governs until it is corrected with documented evidence.

It deliberately separates **verified rule** — supported by the sources in §14 or
by an observed export — from **pending verification**, which is neither an
assumption nor a permitted default in code. Pending items are marked inline.

**The export encoding is settled** as of August 30, 2026, against 1,785 real
artifact records. §15 records it, and three narrow fields remain pending there.

> **The single most important caveat.** Most artifact guides and tables still
> circulating describe the system **before v8.0.0**. Roll ranges, property
> names, the drop state of a new artifact, and several removed properties all
> changed. Everything below describes the system as it stands on
> **August 30, 2026**; pre-v8 behaviour appears only under §12 Legacy.

---

## 1. The model in one page

A monster carries **exactly two artifacts**, one of each category:

| Category | Must match the monster's | Permitted values |
| --- | --- | --- |
| **Attribute Artifact** | element | Fire, Water, Wind, Light, Dark |
| **Type Artifact** | type | Attack, Defense, HP, Support |

A Wind/Attack Teshar takes one Wind artifact and one Attack artifact. It cannot
equip a Water, HP, or Support artifact. This is the fundamental equip rule, and
it is the first thing validation checks.

Each artifact has:

- one **main property** — flat HP, ATK, or DEF;
- exactly four **sub properties** when finished;
- a **natural grade** — Normal, Magic, Rare, Hero, Legend;
- an internal distribution of the power-up rolls that grade granted;
- optionally, a conversion slot and a reappraisal history.

Artifacts have **no rune sets, no slots, and no percentage main stats**. They
are not small runes; they are a separate combat-modifier system, and §11 is
where that difference is most expensive to get wrong.

A workable shape for the model:

```ts
interface Artifact {
  category: 'ATTRIBUTE' | 'TYPE';
  equipClass: Attribute | MonsterType;

  mainStat: 'HP_FLAT' | 'ATK_FLAT' | 'DEF_FLAT';
  naturalGrade: 'NORMAL' | 'MAGIC' | 'RARE' | 'HERO' | 'LEGEND';

  subProperties: ArtifactSubProperty[];   // exactly four when finished
  convertedPropertyIndex: number | null;  // §10
}
```

### Terminology

Call them **sub properties**, not skills. Several of them — `Life Drain`,
`Damage Dealt on Water`, `ATK/DEF UP Effect` — are not skill-specific at all,
and the word invites the wrong mental model.

---

## 2. Main property

There are only three, and each ends at a fixed value:

| Main property | Final value |
| --- | ---: |
| HP | +1,500 HP |
| ATK | +100 ATK |
| DEF | +100 DEF |

Because a monster wears two artifacts, artifacts alone can contribute +3,000
HP, +200 ATK, +200 DEF, or any mixture such as +1,500 HP with +100 DEF. Both
artifacts may carry the same main stat.

The main property is a **flat** stat and enters the monster's HP/ATK/DEF exactly
as any other flat addition does. It is the one part of the artifact that can be
computed with no combat context at all (§8).

**Ordering matters.** Main properties are applied *before* any property that
reads a final stat — see §7.5.

Since v8.0.0 artifacts drop already finished. The old `+0 → +15` power-up
journey no longer exists for new drops, and no code should model one.

---

## 3. Natural grade, rolls, and maximum values

Artifacts use the same natural-grade concept as runes. Historically the grade
decided how many sub properties existed at +0:

| Natural grade | Initial lines | Power-up rolls |
| --- | ---: | ---: |
| Normal | 0 | 0 |
| Magic | 1 | 1 |
| Rare | 2 | 2 |
| Hero | 3 | 3 |
| Legend | 4 | 4 |

Missing lines were added at +3/+6/+9/+12; remaining milestones upgraded existing
lines. The player now sees only the finished result, **but the structure still
matters**: Com2uS stores and displays how many power-ups each sub property
received, and Reappraisal preserves the total (§11).

### The value contributions rule

A line's value is the sum of its **initial roll plus every power-up roll that
landed on it**. A natural Legend artifact has four initial values and four
power-up events, so a single line can receive all four:

```text
initial + roll1 + roll2 + roll3 + roll4   =  five value contributions
```

With a 4–6 % property that is `6 × 5 = 30 %` — which is exactly why the Legend
maximum for those properties is 30 and not 24.

Maximum contributions on one line, by grade:

| Grade | Max contributions | 4–6 property | 2–4 property | 25–40 property |
| --- | ---: | ---: | ---: | ---: |
| Normal | 1 | 6 | 4 | 40 |
| Magic | 2 | 12 | 8 | 80 |
| Rare | 3 | 18 | 12 | 120 |
| Hero | 4 | 24 | 16 | 160 |
| Legend | 5 | 30 | 20 | 200 |

This is the correct way to compute "maximum possible value for this property on
this artifact" — from the roll structure, never from a hard-coded ceiling.

**Carry the contribution count as data, not as a lookup.** The middle column is
`initialProperties + powerUpRolls` for grades that start with a line, and the
whole table follows from it, so store it once per grade:

```ts
interface ArtifactGradeDefinition {
  initialProperties: number;   // lines present at +0, historically
  powerUpRolls: number;        // power-up events the grade granted
  maxContributions: number;    // most contributions one line can collect
}
```

Then `maxValue = definition.maxRoll × grade.maxContributions`, and a balance
patch that changes a roll range is a table edit rather than a code change. The
per-grade ceilings above become a test fixture, never a second source.

**The Normal case is not `0`.** A Normal artifact has no *initial* lines and no
power-up rolls in the historical structure, yet a finished one still carries four
sub properties (§4). Its `maxContributions` is 1 — each line holds exactly one
roll. Do not compute it as `initialProperties + powerUpRolls`; that yields zero
and silently makes every Normal maximum wrong.

### If a property ever has non-contiguous rolls

The reachability rule below assumes every integer between `minRoll` and `maxRoll`
is a legal single roll. Should an export show otherwise, the fix is to replace
the pair with the set:

```ts
allowedRolls: readonly number[]   // instead of minRoll / maxRoll
```

Reachability then becomes a subset-sum over `allowedRolls`, and every consumer
of `minRoll`/`maxRoll` has to be revisited. Worth knowing before the model is
written, not after.

### Validating a displayed value

For a property with integer rolls in `[min, max]` and `n` contributions:

```text
V = r₁ + r₂ + … + rₙ,   rᵢ ∈ [min, max]
```

So a Skill 3 CRIT DMG line with three contributions is legal at 12–18, and every
integer in that range is reachable. Validation should check reachability, not
merely the outer bounds.

---

## 4. Sub property rules

- Every finished artifact has **exactly four** sub property lines.
- The **same exact property never appears twice** on one artifact.
- Skill-scoped properties are **distinct properties**: `[Skill 1] CRIT DMG`,
  `[Skill 2] CRIT DMG`, and `[Skill 3/4] CRIT DMG` may coexist on one artifact.
- Type-only properties may not appear on a newly generated Attribute artifact,
  and vice versa (§5).

A legal example:

```text
[Skill 2] CRIT DMG +18%
Additional DMG by ATK +12%
Life Drain +17%
ATK/DEF UP Effect +13%
```

---

## 5. The current property pool

### 5.1 Type-artifact only

| Property | Per roll | Legend max |
| --- | --- | ---: |
| [Skill 1] CRIT DMG | 4–6 % | 30 % |
| [Skill 2] CRIT DMG | 4–6 % | 30 % |
| [Skill 3/4] CRIT DMG | 4–6 % | 30 % |
| [Skill 1] Recovery | 4–6 % | 30 % |
| [Skill 2] Recovery | 4–6 % | 30 % |
| [Skill 3] Recovery | 4–6 % | 30 % |
| [Skill 1] Accuracy | 4–6 % | 30 % |
| [Skill 2] Accuracy | 4–6 % | 30 % |
| [Skill 3] Accuracy | 4–6 % | 30 % |

Skill 3 and Skill 4 CRIT DMG were **merged into one property in v8**. Older
artifacts may still carry the separate legacy names (§12).

### 5.2 Attribute-artifact only

| Property | Per roll | Legend max |
| --- | --- | ---: |
| Damage Dealt on *X* | 3–5 % | 25 % |
| Damage Taken from *X* − | 4–6 % | 30 % |

*X* is one of Fire, Water, Wind, Light, Dark — ten properties in total.

**It is the target's element that matters**, not the wearer's. A Wind unit with
`Damage Dealt on Water +18%` gains that bonus against Water opponents.

### 5.3 Available on both categories

| Property | Per roll | Legend max |
| --- | --- | ---: |
| First Attack CRIT DMG | 4–6 % | 30 % |
| Own turn 1-target CRIT DMG | 2–4 % | 20 % |
| ATK/DEF UP Effect | 3–5 % | 25 % |
| SPD UP Effect | 4–6 % | 30 % |
| Bomb Damage | 2–4 % | 20 % |
| CRIT DMG Taken − | 2–4 % | 20 % |
| Life Drain | 5–8 % | 40 % |
| Additional Damage by HP | 0.20–0.30 % | 1.50 % |
| Additional Damage by ATK | 2–4 % | 20 % |
| Additional Damage by DEF | 2–4 % | 20 % |
| Additional Damage by SPD | 25–40 % | 200 % |
| CRIT DMG as enemy HP is more | 4–6 % | 30 % |
| CRIT DMG as enemy HP is less | 8–12 % | 60 % |
| Counterattack/Co-op Attack DMG | 2–4 % | 20 % |

Since v8 the game shows the roll range directly on the artifact, which makes
this table checkable in-client rather than only against secondary sources.

~~**Pending verification.**~~ **Confirmed August 30, 2026** against 1,785 real
artifact records (§15.4). All fourteen appear on both categories, and the
category split is absolute: ids `3xx` occur only on Attribute artifacts and
`4xx` only on Type artifacts, with no crossover in the data. Validation may now
reject a category violation rather than merely warn.

---

## 6. How each property actually behaves

The ranges above are the easy part. The behaviour is where an implementation
goes wrong. Each entry below states the mechanic and the trap.

### 6.1 Crit damage properties — additive into the crit bucket

`[Skill n] CRIT DMG`, `First Attack CRIT DMG`, `Own turn 1-target CRIT DMG`,
`CRIT DMG as enemy HP is more/less`, and the defender's `CRIT DMG Taken −` all
resolve into **one additive crit-damage pool**. They are never multiplied
together.

```text
Monster CD                 180
[Skill 3] CD               +20
First Attack CD            +15
CD as enemy HP is more     +10
Own-turn 1-target CD        +8
--------------------------------
Effective CD               233
```

**First Attack CRIT DMG** is subtler than the name suggests: it applies to the
first attack instance **against each individual opponent** on the monster's
turn. An AoE skill can therefore qualify for some targets and not others within
the same execution. Model it per target:

```ts
// not: if (isFirstSkillOfTurn)
if (!targetAlreadyAttackedThisTurn) { … }
```

**Own turn 1-target CRIT DMG** requires both that the monster is acting on its
own turn and that the skill is a *genuine* single-target skill. An AoE skill
that happens to have one surviving enemy does not become single-target.

**CRIT DMG as enemy HP is more/less** scales with the target's current HP ratio
`H = currentHP / maxHP`:

```text
CD_more = N × H            // N = 20 %, H = 0.5  →  +10 CD
CD_less = N × (1 − H)      // N = 40 %, H = 0.75 →  +10 CD
```

The far larger roll range on the *less* variant (8–12 vs 4–6) is why it is the
stronger finisher and boss property.

**CRIT DMG Taken −** is a defensive property and is **not** a flat damage
reduction. It reduces the attacker's effective crit damage:

```text
Attacker 200 CD, target CRIT DMG Taken −15%  →  crit resolves at 185 CD
```

With 100 base damage that is 300 → 285, roughly a 5 % reduction — not 15 %.
Implementing it as `damage × 0.85` overstates it threefold.

### 6.2 Buff amplification — multiplies the buff, then truncates

`ATK/DEF UP Effect` (merged from the former separate ATK UP and DEF UP
properties in v8) and `SPD UP Effect` change **the strength of the buff**, not
the monster's stat.

```text
ATK buff  = floor(50 × (1 + A))    // base +50 %
DEF buff  = floor(70 × (1 + A))    // base +70 %
SPD buff  = floor(30 × (1 + S))    // base +30 %
```

Worked: `A = 11 %` gives `50 × 1.11 = 55.5` → **55 %**, not 56. `S = 24 %` gives
`30 × 1.24 = 37.2` → **37 %**.

The trap: `ATK/DEF UP Effect +25%` does **not** mean +25 percentage points of
ATK, and `SPD UP Effect` is never added to the monster's SPD.

### 6.3 Recovery — multiplies the heal

```text
effectiveHeal = baseHeal × (1 + recoveryArtifact)
```

A skill healing 30 % of HP with `[Skill 2] Recovery +20%` heals `30 × 1.20 =
36 %` — not `30 + 20 = 50 %`. It also applies to relevant passive heals and
interacts with lifesteal healing.

### 6.4 Life Drain — multiplies an existing drain

```text
drain = baseDrain × (1 + L)
```

A 35 % drain (Vampire runes, for instance) with `Life Drain +20%` becomes 42 %.

The trap: a unit with **no** drain source gains nothing. The artifact amplifies
an existing effect; it does not create one.

### 6.5 Accuracy — affects the ACC check, not the activation chance

```text
Base ACC 45 % + [Skill 2] Accuracy 20 %  →  effective 65 % for that skill
```

The ordinary ACC-vs-RES check then proceeds unchanged. **The artifact does not
raise a debuff's activation rate.** A debuff with a 70 % activation chance still
has a 70 % activation chance with +30 Accuracy; only the subsequent resistance
check is affected. This distinction matters in any simulator.

### 6.6 Damage Dealt on element — an additive damage-bonus bucket

```text
DMG% = 1 + artifactElement + artifactCoop + otherDamageBonuses
```

Bonuses belonging to the same bucket are summed, then applied once. Multiplying
them sequentially — `×1.10 ×1.15 ×1.20` — is wrong.

### 6.7 Damage Taken from element — a late reduction

Applied in the reduction bucket, **after** additional damage has been added
(§7). It therefore also reduces damage that additional damage contributed to.

### 6.8 Counterattack/Co-op Attack DMG

Merged in v8 from the former separate `Counterattack Damage` and `Attacking
Together Damage`. Applies when the unit participates in that attack type; for
co-op it covers both the unit pulled into the team-up and the participating
unit wearing the artifact.

### 6.9 Bomb Damage — a multiplier on the bomb result

```text
bombFinal = bombNormal × (1 + B)
```

A 30,000 bomb with a 10 % artifact deals 33,000. It changes neither the ATK stat
nor the bomb's underlying mechanics.

---

## 7. Additional Damage — the mechanic most often implemented wrong

Four properties: `Additional Damage by HP`, `by ATK`, `by DEF`, `by SPD`.

### 7.1 The formula

Per damage hit:

```text
AD = floor(HP × a) + floor(ATK × b) + floor(DEF × c) + floor(SPD × d)
```

**Truncation happens per component, not on the sum.** With components of 100.66
and 50.80 the result is `100 + 50 = 150`, not `floor(151.46) = 151`.

### 7.2 It uses final combat stats

```text
HP 40,000 × 1.2 %   =   480
ATK 2,500 × 15 %    =   375
DEF 1,000 × 10 %    =   100
SPD 250   × 120 %   =   300
                       -----
                       1,255  additional damage per hit
```

On a six-hit skill that is 7,530 — which is why multi-hit monsters gain
enormously from additional damage.

### 7.3 It is a separate flat bucket

Artifact additional damage:

- **cannot crit**;
- is **not** affected by target DEF;
- is **not** affected by `Damage Dealt on X`;
- is added **per hit**;
- **is** affected by subsequent damage reductions.

```text
damage = (baseDamage + additionalDamage) × reductions
```

more completely:

```text
damage = (multipliers × crit × damageBonuses × defenseFactor × variance
          + additional) × reductions
```

The rule this makes explicit — never write:

```ts
normalDamage *= 1 + additionalDamageByAtk   // wrong: it is flat damage
```

### 7.4 Buffs change it

Because it reads the current stat, an ATK buff raises it. With
`Additional DMG by ATK 20%`: 2,000 ATK gives 400; the same monster under a
+50 % ATK buff has 3,000 ATK and gives 600. The same holds for DEF- and
SPD-based additional damage.

### 7.5 Artifact main stats are applied first

Because additional damage reads the *total* stat, the artifact's own main
property feeds it:

```text
38,500 HP + artifact main 1,500  =  40,000 HP
40,000 × 1.5 %  =  600      (not 38,500 × 1.5 % = 577)
```

The same applies to ATK and DEF. Order the calculation accordingly (§13).

### 7.6 Two artifacts stack

Where both artifacts grant the same functional effect, the values add in the
relevant bucket:

```text
Type artifact       Add'l DMG by ATK 13 %
Attribute artifact  Add'l DMG by ATK 17 %
                                    -----
                                     30 %   →  AD_ATK = ATK × 0.30
```

---

## 8. What needs runtime context

A program cannot compute one objective `artifactDamage = 1234` without knowing
the combat situation. Only the main stats are static.

| Class | Properties |
| --- | --- |
| **Static** | main HP / ATK / DEF |
| **Target-dependent** | Damage Dealt on element; Damage Taken from element; CD as enemy HP is more; CD as enemy HP is less |
| **Skill-dependent** | [Skill n] CRIT DMG; [Skill n] Accuracy; [Skill n] Recovery |
| **Attack-event-dependent** | First Attack CD; Own-turn 1-target CD; Counter/Co-op DMG |
| **Buff-state-dependent** | ATK/DEF UP Effect; SPD UP Effect; Additional damage by buffable stats |

This is why judgement must run against a context object rather than a single
artifact score:

```ts
interface ArtifactBattleContext {
  skill: 1 | 2 | 3 | 4;
  attacker: {
    hp: number; atk: number; def: number; spd: number; maxHp: number;
    isOwnTurn: boolean;
    hasAtkBuff: boolean; hasDefBuff: boolean; hasSpdBuff: boolean;
  };
  target: {
    attribute: Attribute;
    currentHp: number; maxHp: number; defense: number;
  };
  attack: {
    isCrit: boolean;
    isSingleTargetSkill: boolean;
    isFirstAttackOnTargetThisTurn: boolean;
    isCounterAttack: boolean;
    isCoopAttack: boolean;
    hitIndex: number; numberOfHits: number;
  };
}

interface ArtifactModifiers {
  effectiveCritDamageBonus: number;
  damageBonus: number;
  incomingDamageReduction: number;
  additionalDamage: number;
  effectiveAccuracyBonus: number;
  recoveryMultiplier: number;
  atkBuffStrength?: number;
  defBuffStrength?: number;
  spdBuffStrength?: number;
}
```

---

## 9. Rounding

Artifacts are a place where truncation is load-bearing. Do not reach for
`Math.round` as a default; carry an explicit policy per mechanic:

```ts
type RoundingRule = 'NONE' | 'FLOOR' | 'CEIL' | 'ROUND';
```

Best-documented cases:

| Mechanic | Rule |
| --- | --- |
| Buff amplification | `floor(baseBuff × (1 + artifact))` |
| Additional damage | `floor` **per stat component**, then sum |

**Keep the policy in one table, not at each call site.** A bare `Math.floor`
inside a calculation says nothing about whether the game truncates there or
whether the author simply wanted an integer. Name every rounding site:

```ts
const ARTIFACT_ROUNDING = {
  additionalDamagePerComponent: 'FLOOR',
  buffAmplification: 'FLOOR',

  // Intermediate, not a game-observed truncation. Keep full precision and
  // let the damage pipeline round where the game actually does.
  enemyHpCritDamageScaling: 'NONE',
} as const satisfies Record<string, RoundingRule>;
```

An entry marked `NONE` is a claim that the mechanic does **not** truncate there —
as load-bearing as a `FLOOR`, and the reason the intermediate values in §6.1 must
stay unrounded. A mechanic missing from the table is a mechanic nobody has
checked; that is the state worth being able to see.

### Store percentages as integers

Never use floating point as canonical storage — `0.1 + 0.2 !== 0.3`. Store
hundredths of a percentage point:

```ts
interface ArtifactRoll {
  valueHundredthsPct: number;   // 25 % → 2500, 1.5 % → 150, 0.2 % → 20
}
```

Convert with `value / 10000` only at the point of use as a multiplier. This is
what makes `Additional Damage by HP` (0.20–0.30 %) representable exactly.

---

## 10. Conversion — the artifact's answer to a Gem

Artifacts cannot take rune Enchanted Gems. They have **Conversion** instead.

| Mechanism | What it does | Requires |
| --- | --- | --- |
| **Normal Conversion** | Replaces one chosen sub property with a random other legal property | Conversion Stones, Mana |
| **Engraved Conversion** | The stone names the property type, so the inserted property is targeted | Engraved Conversion Stone, Mana |

**The binding restriction.** Once a property on the artifact has been chosen for
conversion, that is the property that can be converted again. You cannot then
freely convert a different line as you could with multiple rune gems. Hence:

```ts
convertedPropertyIndex: number | null;
```

**There are no artifact Grindstones.** `[Skill 3] CD 24%` cannot be pushed to
28 %. There is no artifact equivalent of a permanent additive grind on an
existing property. This is a fundamental difference from runes.

---

## 11. Reappraisal — v9.0.0, November 2025

Artifact Reappraisal, using **Core Fragments**, is far more powerful than
Conversion. It can change property types, change their values, and redistribute
power-up rolls.

**The invariant: the artifact's total number of power-up rolls is preserved.**
A Legend artifact with four power-up rolls still has four afterwards.

```text
before            after
A: 3 rolls        A: 0
B: 1 roll    →    B: 2
C: 0              C: 1
D: 0              D: 1
```

### Locking

Zero, one, two, or three properties may be locked before reappraisal. A locked
property keeps **both its type and its power-up level**.

This creates the mechanic's real purpose. Given:

```text
[Skill 3] CD    3 rolls
Add'l ATK       0
Life Drain      1
Accuracy        0
```

locking the three lines other than `[Skill 3] CD` forces the three roll levels
that sat on it onto the only unlocked property. A triple- or quad-rolled slot
can therefore be aimed deliberately at a more useful property.

### Repeat Reappraisal and Repeat Conversion

From v9.1.4/v9.1.5 (February 2026) the game can run up to **10** reappraisals or
conversions automatically against property and range criteria, stopping when a
result matches, when 10 attempts are used, or when resources run out. This
changes no mathematics, but it matters to any modelling of resource cost.

---

## 12. Legacy properties

**Do not delete old property IDs.** Com2uS has repeatedly preserved existing
artifacts carrying properties that were removed from the drop pool. An import
that rejects them will reject perfectly legal artifacts on a real account.

```ts
status: 'CURRENT' | 'LEGACY';
```

Known legacy properties include:

- ATK increased proportional to lost HP
- DEF increased proportional to lost HP
- SPD increased proportional to lost HP
- SPD under inability
- Damage received under inability
- Reflect damage
- Crushing Hit Damage
- HP when revived
- Attack Bar when revived
- Crit Rate Increasing Effect

Some were retired earlier; others were removed or merged in v8.0.0.

### The lost-HP family

If backwards compatibility is wanted, these scale with the owner's missing HP
and with the **base** stat — not the fully runed stat:

```text
bonusStat = baseStat × artifactValue × (1 − currentHP / maxHP)
```

Base DEF 800, artifact +50 %, at 40 % HP: `800 × 0.50 × 0.60 = 240 DEF`. Not
`totalRunedDEF × 0.50 × 0.60`.

**Pending verification.** The exact roll ranges and the current in-export
encoding of each legacy property have not been checked against a real export.
Treat legacy lines as displayable and valid, but do not compute a maximum value
or a projection for them until their ranges are confirmed.

**Unknown is not zero.** A legacy definition carrying `minRoll: 0, maxRoll: 0` as
a placeholder makes `maxValue` return `0` — a number that renders, sorts, and
looks answered. Model the absence instead:

```ts
minRoll: number | null;   // null = range unknown, not "no range"
```

Every maximum, projection, and roll-quality function must return `null` for such
a property and the interface must show that it cannot be judged, rather than
judging it harshly. This is the same distinction rule 3 in `AGENTS.md` draws
between an empty field and an explicit zero.

### A terminology trap: "Refine"

The word has meant different things across the game's life:

| Term | What it is |
| --- | --- |
| **Refine** (v8.0.0) | The migration mechanism that finished pre-v8 artifacts not yet at +15 |
| **Rune Refinement** (v9.0.0) | A rune mechanic — unrelated to artifacts |
| **Artifact Reappraisal** (v9.0.0) | The Core Fragment mechanic in §11 |

Do not name the reappraisal function `refineArtifact()`. Use
`convertArtifactProperty()` and `reappraiseArtifact()`.

---

## 13. The calculation contract

The order the engine must follow. Reordering these steps changes results.

| Step | Stage | What happens |
| ---: | --- | --- |
| A | **Stats first** | Compute HP, ATK, DEF, SPD, CR, CD, ACC, RES **including artifact main stats** |
| B | **Combat buffs** | Apply ATK/DEF/SPD buffs, amplified by §6.2 and truncated |
| C | **Skill context** | Fix skill number, target, target HP %, target element, single/AoE, first attack, own turn, counter, co-op, hit count |
| D | **Crit bucket** | Sum every applicable CD property additively, less the target's `CRIT DMG Taken −` |
| E | **Normal damage** | Skill coefficient, crit, elemental and co-op damage modifiers, defense factor, variance |
| F | **Additional damage** | Per hit: `floor(HP×a) + floor(ATK×b) + floor(DEF×c) + floor(SPD×d)` |
| G | **Final reductions** | Target artifact and passive reductions, including `Damage Taken from X` |

```text
normalHit = skillScaling × critFactor × damageModifier × defenseFactor × variance
additional = AD_HP + AD_ATK + AD_DEF + AD_SPD
finalHit  = (normalHit + additional) × finalReductions
```

where

```text
critFactor = 1 + CD_monster + CD_skillArtifact + CD_hpCondition
               + CD_firstAttack + CD_singleTarget − CD_targetReduction + …
```

`damageModifier` holds `Damage Dealt on X`, counter/co-op, and skill or passive
multipliers. These are three **separate buckets** and must not be collapsed.

### Validation rules

A complete validation layer checks at least:

1. Monster attribute matches the Attribute artifact.
2. Monster type matches the Type artifact.
3. At most one artifact per category.
4. Main stat ∈ {HP, ATK, DEF}.
5. Exactly four finished sub properties.
6. No type-only property on a newly generated Attribute artifact.
7. No attribute-only property on a newly generated Type artifact.
8. No identical property twice.
9. Every property value is reachable by legal rolls (§3).
10. The sum of power-up levels matches the natural grade.
11. A legacy property is accepted on an existing artifact.
12. A current-generation generator never produces a legacy property.
13. Conversion affects only the conversion slot.
14. Reappraisal preserves the total power-up count.
15. Locked reappraisal lines keep both type and power-up level.

### Property definitions as metadata, not switch statements

Keeping each property as data makes future balance patches a table edit:

```ts
interface ArtifactPropertyDefinition {
  id: ArtifactPropertyId;
  availability: 'TYPE' | 'ATTRIBUTE' | 'BOTH' | 'LEGACY';
  minRoll: number;
  maxRoll: number;
  valueScale: 'PERCENT' | 'HUNDREDTH_PERCENT';
  mechanic:
    | 'CRIT_DAMAGE' | 'RECOVERY' | 'ACCURACY'
    | 'DAMAGE_BONUS' | 'DAMAGE_REDUCTION' | 'BUFF_AMPLIFICATION'
    | 'ADDITIONAL_DAMAGE' | 'LIFE_DRAIN' | 'BOMB_DAMAGE';
  trigger?: {
    skill?: 1 | 2 | 3 | 4;
    targetAttribute?: Attribute;
    firstAttack?: boolean;
    ownTurn?: boolean;
    singleTarget?: boolean;
    counter?: boolean;
    coop?: boolean;
  };
}
```

**Property IDs come from the export, not from the reader.** A readable union of
`'skill_1_crit_damage' | …` is tempting and premature: §15 has not yet settled
whether the export keys properties numerically, nor whether the merged v8
properties reuse an old ID. Derive the internal identifiers from what the export
actually contains, and keep display names in a table beside them — never as the
identity itself.

### What belongs outside this layer

The artifact model describes artifacts. Three things it must borrow rather than
own, because they are general game rules that would silently fork if copied here:

| Value | Belongs to |
| --- | --- |
| Base buff strengths — ATK +50 %, DEF +70 %, SPD +30 % | The general stat/buff model |
| Base crit damage, base accuracy, base resistance | The monster stat model |
| The damage pipeline itself | The damage engine; artifacts supply modifiers to it |

§6.2's amplification takes the base buff as an argument. It does not define it.

### What artifacts cannot do

Stated explicitly, because each has been assumed at some point:

Artifacts **cannot** have rune sets, be ground with Grindstones, take rune
Enchanted Gems, carry SPD/CR/HP % as ordinary rune-style subs, have a percentage
main stat, have six sub properties, or appear twice in the same category on one
monster.

Artifacts **can** be converted, be reappraised with Core Fragments, have up to
three properties locked during reappraisal, carry legacy properties, and share
the same main stat across both the Type and Attribute artifact.

### Scoring is not summing percentages

`20 % Add'l ATK`, `20 % [Skill 3] CD`, and `20 % Damage on Water` are not
equally valuable — they land in entirely different buckets.

A 2,500-ATK monster with `Add'l DMG by ATK 20%` gains 500 flat damage per hit;
on a six-hit skill that is 3,000 before final reductions. `[Skill 3] CD +20`
applies only on Skill 3, only on a crit, only inside the crit bucket, and its
worth depends on the existing CD.

A correct optimizer computes **marginal combat value**, never a sum of property
percentages. This is the point where a naive artifact score would mislead the
user, and §13's staging is what makes the honest answer computable.

### There is no single artifact score

"How good is this artifact" is three questions wearing one coat, and they
disagree constantly. A quad-rolled `[Skill 3] CRIT DMG 30%` is a perfect artifact
and worthless on a monster whose Skill 3 is a heal.

```ts
interface ArtifactEvaluation {
  rollQuality: number;          // how close to perfect rolls, monster-free
  monsterCompatibility: number; // do these properties fit this monster at all
  combatValue: number;          // what it actually changes, in context
}
```

| Axis | Answers | Needs |
| --- | --- | --- |
| **Roll quality** | "Did this artifact roll well?" | The artifact and §3 alone |
| **Monster compatibility** | "Do these properties apply to this monster?" | Skills, scaling, hit count, role |
| **Combat value** | "How much damage, healing, EHP, or turn order does it move?" | A full §8 context and the §13 pipeline |

Roll quality is computable today. The other two are not — they need the export
encoding (§15) and, for combat value, the whole staged pipeline. Keeping them
separate in the model means the workspace can ship the honest answer it has
rather than a blended number that hides which parts were guessed.

Roll quality itself has two defensible definitions, and they answer different
questions:

```text
efficiency = (value − minPossible) / (maxPossible − minPossible)   // 0 = worst legal roll
fraction   = value / maxPossible                                   // share of the ceiling
```

The first measures luck within what was possible; the second measures absolute
strength. Pick one per surface, label it, and never average them.

---

## 14. Sources and revision rule

1. Com2uS — official v8.0.0 update notice: artifacts drop finished, the Refine
   migration, Skill 3/4 CRIT DMG merge, ATK/DEF UP Effect merge,
   Counterattack/Co-op merge, removed properties.
2. Com2uS — official v9.0.0 update notice, November 2025: Artifact Reappraisal,
   Core Fragments, the preserved power-up total, and locking up to three
   properties.
3. Com2uS — v9.1.4 / v9.1.5 update notices, February 2026: Repeat Reappraisal
   and Repeat Conversion, up to 10 attempts against criteria.
4. Com2uS — in-client artifact display, which since v8 shows each property's
   roll range and per-property power-up count. Primary and checkable.
5. SWCalc — empirical damage-pipeline model: bucket ordering, additive crit
   bucket, additional damage as a flat post-multiplier term, buff-amplification
   truncation, per-target First Attack behaviour. Secondary.
6. Elliabot artifact documentation — Life Drain and Recovery multiplicative
   behaviour, lost-HP legacy scaling on base stats, integer/truncation
   behaviour. Secondary.
7. Summoners War Wiki and SW Database — property pool, elemental property
   ranges, legacy property names. Secondary; superseded by current official text
   or reproducible client observation on conflict.
8. **The user's own account**, read from a `HubUserLogin` response on
   August 30, 2026: 1,251 account artifacts and 534 equipped, 1,785 records.
   Primary and checkable, and the basis of §15. It settles the field layout, the
   property vocabulary and its category split, the power-up encoding and its
   grade invariant, the conversion slot, and how legacy properties are
   recognised.

Revalidate on every game update: the property pool, roll ranges, merged or
removed properties, and the reappraisal roll-preservation rule. An unknown
property ID must never receive a silent fallback rule.

---

## 15. The export encoding — settled

**Answered August 30, 2026** against a real `HubUserLogin` response: 1,251
account artifacts and 534 equipped ones, 1,785 records in total. Every claim
below is a count over that data, not an inference from a guide. The section
that preceded this one listed six open questions; five are now closed and the
sixth is narrowed to a single field.

### 15.1 The record

```jsonc
{
  "rid": 319233427,          // the artifact's own id
  "occupied_id": 0,          // 0 when unequipped; otherwise the wearer's unit_id
  "slot": 0,                 // 0 when unequipped; else 1 = Attribute, 2 = Type
  "type": 2,                 // 1 = Attribute artifact, 2 = Type artifact
  "attribute": 0,            // element, on type 1 only
  "unit_style": 2,           // monster type, on type 2 only
  "natural_rank": 3,         // natural grade: 3 Rare, 4 Hero, 5 Legend
  "rank": 5,                 // always 5
  "level": 15,               // always 15
  "pri_effect": [100, 1500, 15, 0, 0],
  "sec_effects": [[220, 4, 0, 0, 0], /* … exactly four … */],
  "locked": 0, "source": 50001, "extra": [],
  "date_add": "…", "date_mod": "…"
}
```

**`type` decides which of `attribute` and `unit_style` carries meaning**, and
the other is `0`. In 1,251 records a non-zero `attribute` appeared only on
`type: 1` and a non-zero `unit_style` only on `type: 2`, with no exceptions.
`slot` agrees with `type` on every equipped artifact (`1/1` and `2/2`), so it is
a second statement of the same fact rather than an independent one.

**`rank` and `level` are constants.** All 1,785 records are `rank: 5`,
`level: 15` — §2's "artifacts drop finished" as a property of the data. Do not
build a level or upgrade path; there is nothing to model. `extra` was empty on
every record, and `natural_rank` never fell below 3.

**The value 98** appears in both `attribute` (21 records) and `unit_style` (6).
It is not an element or a monster type. Treat it as its own case rather than a
number to compare against 1–5 — **pending verification** of what it names.

### 15.2 `pri_effect` — main property

`[id, value, level, 0, 0]`, where `level` is always 15 and the last two are
always zero. The id/value pairs observed are exactly three, and only three:

| id | value | Meaning |
| ---: | ---: | --- |
| 100 | 1500 | HP +1,500 |
| 101 | 100 | ATK +100 |
| 102 | 100 | DEF +100 |

This **confirms `equipmentPrimaryTypes` in `app/lib/monster-grid.ts`** and the
`pri_effect[1]` addition in `app/lib/monster-stats.ts`. Both were right, and the
distribution is near-even: 424 HP, 408 ATK, 419 DEF.

### 15.3 `sec_effects` — the sub properties

Four tuples, always, on all 1,785 records (§4 confirmed). Each is:

```text
[ effectId, value, powerUpCount, conversionFlag, newestLineFlag ]
```

**Position 2 is the power-up count, and the grade invariant holds exactly.**
Summed across an artifact's four lines it equals `natural_rank − 1`, in every
single record:

| `natural_rank` | Σ power-ups | Records |
| ---: | ---: | ---: |
| 3 (Rare) | 2 | 334 |
| 4 (Hero) | 3 | 747 |
| 5 (Legend) | 4 | 170 |

That is §3's table, observed rather than assumed. The natural grade is stored
directly *and* derivable from the lines, so the two are a mutual check — a
record where they disagree is corrupt and should be rejected, not repaired.

**Values confirm the §5 roll ranges and the contribution arithmetic.** Grouping
each property's values by its power-up count reproduces `initial + n rolls`:

```text
effect 206   rolls 0: 4–6    rolls 1: 8–12   rolls 2: 12–18   rolls 3: 17–24
effect 221   rolls 0: 25–40  rolls 1: 52–79  rolls 2: 81–115  rolls 3: 110–145
effect 218   rolls 0: 0.2–0.3
```

**`218` is stored as a decimal**, and it arrives with float error already in it
— `0.6000000000000001` appears in the data. This is §9's rule vindicated at the
worst possible moment: convert to hundredths of a percent on read, and never
compare these values as floats.

### 15.4 The property vocabulary

**Every id divides cleanly by category, and the split matches §5.**

| Range | Category | Count | §5 section |
| --- | --- | ---: | --- |
| `2xx` | Both | 14 current | §5.3 |
| `3xx` | Attribute only (`type: 1`) | 10 | §5.2 |
| `4xx` | Type only (`type: 2`) | 10 | §5.1 |

The 14 `2xx` properties appeared on both categories, with 300 → 309 confined to
`type: 1` and 400 → 411 to `type: 2` without a single crossover.
**This discharges §5.3's pending verification**: "available on both categories"
is now observed, not merely claimed, and the ten/ten/fourteen shape is exactly
what §5 predicted.

`4xx` skips `402` and `403`, and `3xx` is contiguous. A gap is not evidence of a
missing property; it may simply be an id the pool never used.

### 15.5 Legacy properties are distinguishable, and here is how

**Three ids — `201`, `205`, `217` — appear in the account but never in the
engraving statistics**, across 383 captured monster types. All three sit on
**one artifact**, `rid` 319233427, added 2022-09-29:

```text
[[220, 4, 0, 0, 0], [201, 37, 2, 0, 0], [205, 2, 0, 0, 0], [217, 5, 0, 0, 0]]
```

That is §12 in the data: properties removed from the drop pool but preserved on
an artifact that already carried them. **The reverse check is what makes this
usable** — every id present in the statistics also appears in the owned
collection, so the two vocabularies agree completely except for these three.

An id absent from the statistics is therefore a strong legacy signal, but it is
**not a definition**, and code must not derive `status: 'LEGACY'` from it: a
current property could be absent simply because no captured monster favours it.
Keep the legacy list explicit, and let the statistics inform it rather than
determine it. §12's rule stands unchanged — accept these on import, refuse to
generate them, and compute no maximum for them until their ranges are known.

### 15.6 Position 3 — the conversion flag

Non-zero on **at most one line per artifact**, on all 1,785 records. That is
exactly §10's binding restriction: once a property has been chosen for
conversion, it is the one that can be converted again. `convertedPropertyIndex`
is therefore a faithful model, and validation rule 13 is checkable.

Values above 1 occur (2, 3, 4 on 17 lines), so it is not a boolean. **Pending
verification** of what the magnitude counts — plausibly how many times that slot
has been converted, but nothing here proves it.

### 15.7 Position 4 — the one field still unexplained

Set on exactly one line of 452 of the 534 equipped artifacts, and — the useful
constraint — **only ever on a line whose power-up count is zero**:

```text
rolls 0:  761 unset, 451 set
rolls 1+:  923 unset,   0 set
```

So it marks an un-upgraded line, one per artifact. A reappraisal trace (§11) is
the obvious guess and it is **not confirmed**; nothing in this data proves the
semantics. Read it, keep it, and let nothing depend on it until an observation
settles what it means.

### 15.8 What this unblocks, and what it does not

Step 2 of the sprint — modelling and reading artifacts — is unblocked. Roll
quality (§13's first evaluation axis) is computable today: the property, its
power-up count, its value, and the grade invariant are all present and verified.

Two fields carry a **pending verification** marker (`attribute`/`unit_style`
value 98, and `sec_effects` position 4) and one carries a partial (position 3's
magnitude). Under §14's revision rule none of them may receive a silent fallback:
store them, surface them where they matter, and do not compute anything from a
meaning nobody has established.

---

## 16. JASWA optimal value

`calculateArtifactOptimalValue` in `app/lib/artifact-optimal-value.ts` is the
single source of truth for JASWA's artifact-versus-monster value. It measures
how fully an artifact rolled on what the user declared valuable for that monster
type and category. It is not a combat simulation or a sum of unlike effects.

Let `a` be `Acceptable ctr. preferred` as a fraction, and assign each property
preference a weight:

```text
w(preferred)  = 1
w(acceptable) = a
w(unwanted)   = 0
```

For the main property, `m = w(main preference)`. For each of the artifact's four
sub properties, let `rᵢ = rolled valueᵢ / maximum valueᵢ`, with its maximum
derived from the property definition and the artifact's natural grade (§3).
Then:

```text
subValue = Σ(wᵢ × rᵢ) / Σwᵢ
optimalValue = m × subValue
```

The sub-property denominator is weighted too. An acceptable line therefore has
less influence on the sub-value, but a fully rolled acceptable line is still a
fully rolled line rather than a value silently capped at `a`. The main property
is deliberately different: an acceptable main multiplies the entire result by
`a`, exactly as the user chose.

`optimalValue` is a fraction from 0 to 1. A monster category with no property
preferences is **not judged** and returns `undefined`; a judged category whose
artifact matches no chosen sub property returns the real value `0`. Invalid
roll data is rejected as `undefined`, never clamped or repaired.
