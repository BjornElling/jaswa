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
artifact records. §15 records it, and two narrow fields remain pending there.

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

**Intangible is the one exception, and only to the inner class.** An *Intangible*
artifact — the game's own name, shown in the artifact panel — still belongs to
one category and still fills only that category's slot, but matches **any**
element (attribute category) or **any** monster type (type category). So the
Teshar above can also take an Intangible attribute artifact in its attribute
slot, or an Intangible type artifact in its type slot; it can never take an
attribute artifact in the type slot. §15.1 records the encoding and the
evidence.

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
| **Engraved Conversion** | Replaces one chosen sub property with the property named by the stone | Engraved Conversion Stone, Mana |

**The permanent slot lock.** A Conversion Stone can change one sub property on
an artifact. After the first conversion, the lock belongs to that sub property's
position in the four-line list, not to the property's current name. Later
Conversion Stones can change that same position again, so its property and value
may change again, but no other position may be converted. The conversion cannot
be undone, cleared, or moved to another position. Hence:

```ts
convertedPropertyIndex: number | null;  // zero-based; null before first conversion
```

In the interface, the converted mark is therefore attached to sub-property 1,
2, 3, or 4 in the artifact's displayed order. It means that line is the only
line eligible for future Conversion Stones; it does not mean that the current
property name is permanently retained.

**There are no artifact Grindstones.** `[Skill 3] CD 24%` cannot be pushed to
28 %. There is no artifact equivalent of a permanent additive grind on an
existing property. This is a fundamental difference from runes.

### A conversion lands on exactly two contributions

**Settled September 3, 2026** against the 137 converted lines in the captured
account, and it is the number every conversion projection must use.

Every converted line stores `powerUpCount: 0`, so the naive reading is that a
conversion produces a single roll. The values refuse that reading: **66 of the
101 converted lines whose range is known hold a value no single roll can
produce** — effect 300 (3–5 per roll) reaches 8, effect 223 (8–12) reaches 17,
effect 219 (2–4) reaches 6. The complementary check is what settles the count:
**no converted line in the account requires a third contribution.** The
observed fractions of a two-contribution ceiling run 0.300 to 0.833, and none
exceeds 1.

```text
conversionMaximum = maxRoll × 2      // independent of the artifact's grade
```

This is §15.9's position-4 rule seen from the other side: the newest-line flag
is set on the converted line, and counting it as one extra contribution is what
makes the arithmetic close.

**It does not scale with the artifact's grade**, and that is the trap. A Legend
line collects five contributions, so judging a conversion against *that*
ceiling claims a value the game cannot produce, and overstates the case for
converting exactly on the artifacts worth the most care. A conversion on a
Legend artifact reaches at best `maxRoll × 2` where the line it replaces could
have held `maxRoll × 5`.

**The stone's grade does not raise the ceiling.** Grade governs which stones
the player owns and spends (§15.12), not how high the resulting line can roll.
Nothing in the account links a stone to the line it produced, so no code may
claim otherwise.

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
13. Conversion affects only the permanent conversion slot; repeated Conversion
    Stones may change that same slot again, but cannot target another slot or
    undo the lock.
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

**The value 98 is the Intangible equip class — settled September 1, 2026.**
It appears in `attribute` (25 records) and `unit_style` (6) across the 1,862
artifacts of the user's account. The game names it in the artifact panel:
**"Intangible Type Artifact"**. It is the same wildcard concept
`RUNE-CANONICAL.md` §10 records for the Intangible rune, applied to the equip
restriction rather than to the set.

**An Intangible artifact fills its category slot but matches every class inside
it.** The category still binds, and the export proves it rather than merely
suggesting it:

- `type` is unchanged on all 31 records — 25 are `type: 1`, 6 are `type: 2`.
- A `type: 1` Intangible carries `3xx` **attribute-only** properties (35 lines
  observed) and a `type: 2` one carries `4xx` **type-only** properties (11).
  §5's category split holds, so the category is a real restriction on these.
- Every other field is indistinguishable from an ordinary artifact: the same
  `source` codes (50001 and 50009, both present on restricted artifacts too),
  the same grades, the same `rank: 5` / `level: 15` constants.

So an attribute Intangible fits any of the five elements and a type Intangible
any of the four monster types — never the other category's slot.

**Both compute backends encode the wildcard as one shared constant.**
`intangibleRestrictionCode` in `app/lib/compute/artifact-score-protocol.ts` is
`0`, chosen because it lies outside both class numberings (elements 1–5,
archetypes 1–4) so no restricted artifact can collide with it. `fits` in
`artifact-score-core.ts` and the matching test in the WebGPU shader must accept
it identically; a disagreement there would make the two backends return
different candidate sets for the same account.

**An equip class JASWA cannot name is rejected, not imported.** `readArtifact`
refuses a record whose class is neither a named element/type nor Intangible.
Under `AGENTS.md` §0.1 the loud failure is the point: accepting one would import
an artifact the user owns and then hide it from every recommendation, because no
comparison could ever match it. That invisibility is precisely the defect the
Intangible investigation uncovered — 31 owned artifacts, imported and unusable,
for want of one lookup.

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
exactly §10's permanent slot lock: once a line has been chosen for conversion,
only that position can be converted again. `convertedPropertyIndex` is therefore
a faithful model, and validation rule 13 is checkable. The index is the line's
position in `sec_effects`, not the current property's id or name; a later
conversion may replace that property's type and value without moving the lock.

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

One field carries a **pending verification** marker (`sec_effects` position 4)
and one carries a partial (position 3's magnitude). `attribute`/`unit_style`
value 98 was the third and is now **settled** as the Intangible equip class
(§15.1). Under §14's revision rule the remaining two may not receive a silent
fallback: store them, surface them where they matter, and do not compute
anything from a meaning nobody has established.

### 15.9 Corrections from building the reader — August 30, 2026

Session 4 built `app/lib/artifact-properties.ts` from the export rather than
from §5, against 1,864 artifacts — 79 more than §15 was written from. Four of
its claims did not survive contact with the data. Under §14 the observation is
primary and the secondary tables are corrected, not the reader.

**The category split holds, and the counts move.** 33 property ids occur, and
the engraving statistics name 30 of them as current: **13** on both categories,
10 Attribute-only, 10 Type-only. §5.3 lists fourteen both-category properties,
one more than the data has, and the fourteenth — `First Attack CRIT DMG`, id
411 — appears **only on Type artifacts** in 79 occurrences. §5.3's table should
move it to §5.1.

**`4xx` does not skip `402` and `403`.** §15.4 records a gap; both ids exist
and are **legacy**, absent from the engraving statistics and present only on
artifacts added in 2020–2022. They are the pre-v8 `[Skill 3]` and `[Skill 4]`
CRIT DMG that §5.1's merge note describes, preserved exactly as §12 predicts.

**Two roll ranges in §5 are too narrow**, and the artifacts that break them
were acquired *this month*, unconverted, on current-generation records:

| id | Property | §5 says | Observed | Evidence |
| ---: | --- | --- | --- | ---: |
| 210 | Bomb Damage | 2–4 | **1–4** | 108 lines |
| 401 | [Skill 2] CRIT DMG | 4–6 | **4–7** | 1 line of 6,881 |

**206 was a third entry here and was wrong.** It read "ATK/DEF UP Effect,
observed 3–6", but the game's own artifact panel (rid 1215663871) names 206
**SPD UP Effect** and 226 **ATK/DEF UP Effect** — §5.3's two ranges were right
and the ids were swapped against them. 206 rolls 4–6 as §5.3 says of SPD UP
Effect; its lone 3 came from a pre-v6.2.0 artifact rolling under the older,
lower table (§15.11), not from a wider current range. The occurrence counts
settle it independently: 204 and 205 stop dead at v8 (90 and 42 lines before,
none after) while 226 appears only after it (none before, 223 after), so 226 is
the merger of those two halves and 206 was never merged at all.

The 401 widening rests on a single observation, which is thin — but the
alternative is a ceiling a real artifact provably exceeds, and a roll fraction
above 1 empties the benchmark of meaning. The general rule it illustrates:
**compute a maximum from the observed range, never from a guide's table.**

**Position 4 is a contribution, whatever else it means.** §15.7 leaves the
field unexplained and forbids computing from it. Counting a set flag as one
extra contribution repairs the grade invariant on **43 of the 44 records that
otherwise break it**, leaving one. That is strong evidence about the roll
structure and none at all about the field's semantics, so the reader uses it for
the contribution count and for nothing else — §15.7's prohibition stands.

### 15.10 Pre-v8 artifacts can remain unrefined

The September 1 import audit found 202 readable artifacts added in 2020–2022
whose values and category layout are valid, but whose old ranges or power-up
totals do not match §15.3's current finished-artifact invariant. This is the
state that v8's Refine action was designed to complete: an account may still
retain an old artifact until its owner chooses to refine it.

The reader must accept those records when their `date_add` predates July 2023.
Their values are evaluated against the documented historical +15 ceilings: the
launch table, the v6.2 property improvement, and the current export together
cover both old range families. An artifact whose stored `level` is below 15 is
unrefined and must carry a visible Refine marker, but it remains in every
recommendation and calculation. A current-dated record with the same broken
invariant remains malformed and is rejected; historical date alone does not
turn corrupt new data into a legacy record.

### 15.11 Three generations, and the v6.2.0 boundary is visible in the data

The roll tables have changed twice, so "the range" is a question about a date:

| Generation | From | What changed |
| --- | --- | --- |
| Launch | v6.0 | the original, lower roll table |
| **v6.2.0** | 2021-01-28 | initial and power-up values raised |
| v8.0.0 | 2023-06-30 | drops arrive finished; five properties retired, six merged into three, one added |

**v8 did not generally change the roll ranges.** Comparing single-roll values
either side of it across 29 properties, 24 are identical; the exceptions are
sparse tails or the v6.2.0 effect below. What v8 changed is the *vocabulary*
and the upgrade mechanic, not the per-roll figures.

**The v6.2.0 date is confirmed by the account, not merely inherited from patch
notes.** Every single-roll line that falls below today's floor — 206 at 3 %,
406 at 3 %, 210 at 1 % — sits on an artifact acquired *before* 2021-01-28, and
none after. Those 28 artifacts are exactly the set carrying no power-ups at
all, so the pre-v6.2 cohort and §15.10's unrefined cohort are the same records.

The legacy roll ranges are therefore knowable, by reading single unpowered
lines from artifacts acquired after the increase:

| id | Range | id | Range |
| ---: | --- | ---: | --- |
| 200 / 201 / 202 | 9–14 | 208 / 209 | 2–4 |
| 204 | 3–5 | 216 | 4–6 |
| 205 | 2–4 | 402 | 4–6 |

Each agrees with the published v8 merge table. **They are still not stored as
ranges**, because `readSubProperty` uses a range as a rejection test: filling
these in refuses 55 artifacts this account legitimately holds — the 28 that
predate v6.2.0, plus pre-v8 lines whose value is not a whole multiple of any
per-roll figure, the old upgrade mechanic not having worked that way. §12's
rule governs: a range that would reject a legal artifact is worse than none.

### 15.12 Engraved conversion stones live in `artifact_crafts`

**Settled September 3, 2026.** The account's engraved conversion stones are the
`artifact_crafts` collection — 271 records holding 463 stones. They are *not*
in `rune_craft_item_list`, and the distinction is not academic: craft types 5
and 6 of that collection are rune enchanted gems and grindstones, whose ids
read `<set><stat><grade>`. Decoding those as artifact properties resolves two
of the account's forty owned property/class pairs and invents ids such as −487
for the rest.

The 12-digit `master_id` reads `CCC EEE AAG PPP`:

| Segment | Meaning |
| --- | --- |
| `CCC` | `101` attribute stone, `102` type stone |
| `EEE` | element × 10 on an attribute stone; `000` on a type stone |
| `AAG` | archetype × 100 plus the natural grade — `3` Rare, `4` Hero, `5` Legend |
| `PPP` | the artifact property the stone engraves |

```text
101 010 005 301   Legend Water attribute stone, Damage Dealt on Water
102 000 103 407   Rare Attack type stone, [Skill 1] Accuracy
```

**The two class fields are mutually exclusive**, on all 271 records: an
attribute stone always carries an element and archetype `0`, a type stone
always the reverse. That is what lets one code carry the class unambiguously,
and a record filling both is malformed rather than merely unusual.

**A stone is engraved for one equip class, and the class binds.** A Water stone
converts a Water attribute artifact and no other. Any model that treats an
owned stone as usable on every artifact of its category overstates what the
account can actually do — for this account, 21 properties available to a Water
artifact against 40 across all elements. An Intangible artifact names no class,
so every stone of its category applies to it.

**The category split of §5 holds on stones too.** Attribute stones carry only
`2xx`/`3xx` properties and type stones only `2xx`/`4xx`, with no crossover.

**Stones naming a legacy property are refused, not offered.** 174 of the 463
name one, and §12 forbids computing a roll for a property whose range is
unknown — so a conversion to one could not be valued. They are genuinely
unusable for a recommendation rather than merely unread, which is the
distinction `AGENTS.md` §0.1 part 3 turns on.

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
derived from the property definition and the artifact's natural grade (§3):

```text
maximum valueᵢ = maxRollᵢ × grade.maxContributions
```

**The ceiling is the grade's, not the line's own.** A line that collected one
contribution is measured against what a line on this grade *could* have held,
so a Legend line holding one roll scores low — which is the truth about it.

This was corrected on September 3, 2026. The measure previously divided by the
contributions each line actually collected, which made a max-rolled one-roll
line score 1.0 exactly like a max-rolled five-roll line. That answers "did this
line roll luckily?" and the optimizer asks "how much does this artifact
contribute?" (§17). On the captured account the difference is large and
systematic: across 1,085 Legend lines the mean was 0.800 under the old measure
and 0.325 under this one.

The consequence worth stating plainly: a Rare artifact no longer scores like a
Legend merely for having rolled well within its smaller allowance, and a
conversion — capped at two contributions by §10 — is worth `2/5` of a Legend
line rather than appearing to match one.
The sub-property benchmark is one preferred line and three acceptable lines:

```text
benchmark = 1 + 3a
subValue = Σ(wᵢ × rᵢ) / benchmark
optimalValue = m × subValue
```

This is a fixed denominator. It must not be replaced with the weights of the
properties the artifact happened to roll: doing that lets one max preferred line
and three irrelevant lines score the same as four desired max lines. The chosen
benchmark instead gives ordinary profiles an intuitive reference point while
preserving the extra value of every additional preferred line.

At the default `a = 0.5`, with a preferred main and max rolls, the benchmark
profile `1 preferred + 3 acceptable` is 100 %; `2 preferred + 2 acceptable` is
120 %; four preferred lines are 160 %; and one preferred plus one acceptable
line is 60 %. A score above 100 % is intentional: 100 % is the benchmark, not
the ceiling. It says an artifact is exceptional without making a max-rolled
`2 preferred + 2 acceptable` artifact look merely three-quarters complete.

The main property remains a separate multiplier. A preferred main preserves the
sub-property value; an acceptable main multiplies it by `a`; an unwanted main
sets it to zero. The main is fixed rather than rolled, so it does not belong in
the four-line benchmark.

At `a = 0`, acceptable means unwanted; at `a = 1`, acceptable and preferred
mean the same thing. Those endpoints deliberately change what can reach the
benchmark: at 100 %, four acceptable max lines reach 100 %, because the user
has removed the distinction. The function returns the score as a ratio, so
`1.2` is displayed as 120 %.

A monster category with no property preferences is **not judged** and returns
`undefined`; a judged category whose artifact matches no chosen sub property
returns the real value `0`. Invalid roll data is rejected as `undefined`, never
clamped or repaired.

---

## 17. The optimizer's purpose, and the rules that follow from it

The workspace answers **one** question: *which artifact, wearing which
conversion, belongs on which monster so that it does the most good there?*

It deliberately does **not** maximise the sum of every equipped artifact. The
user farms continuously and is aiming at a top score for each artifact on each
monster, so the target is per-artifact placement quality, not a portfolio
total. The two objectives genuinely disagree — a global sum will happily move a
superb artifact onto a monster it merely suits in order to free a slot — and
where they disagree, this section governs.

Five rules follow, and each is a place the interface has been wrong.

### 17.1 A score shown is a score used

Scores are computed and compared as **whole percentage points**, not merely
rounded for display. Two artifacts both reading 88 % are equal everywhere: in
sorting, in a threshold test, in a recommendation. Rounding only at the point
of display makes the interface disagree with itself — two identical numbers on
screen order themselves by a hidden decimal the user cannot see and cannot act
on.

Rounding is therefore applied once, where the score leaves the calculation, and
every consumer reads the same integer. Ties are then broken by a **stated**
rule — the artifact's own order — never by residual floating-point noise.

### 17.2 A recommendation must be an improvement

A row that recommends what is already true is noise. The recommendation views
show an artifact against a monster only when moving it there **improves on
where it is now**:

- an artifact already on the monster where it scores highest is not
  recommended anywhere;
- a monster scoring lower than, or equal to, the artifact's current wearer is
  never offered.

"Highest" means the artifact's own maximum across the eligible monsters, not
the result of an exclusive allocation. An allocation that hands the monster to
a different artifact says something about that other artifact; it says nothing
about whether this one is already where it does most good.

### 17.3 Differences below the stated threshold are not differences

The user may declare a band — 1 % to 5 % — inside which two scores count as the
same. A gain no larger than the band is not an improvement, and a recommendation
resting on one is suppressed on every page. The band is expressed in percentage
points of the score, which is the number the interface actually shows.

The band is a *user's* judgement about what is worth acting on, so it never
alters a computed score: it decides what is offered, not what is true.

### 17.4 A conversion is proposed only when it beats what is there

Two conditions, and the second is the one that is easy to miss.

1. The conversion must raise the artifact's score on that monster. A conversion
   that leaves the score unchanged is not recommended.
2. **An artifact whose converted slot already holds more value than the
   proposed conversion would produce keeps what it has.** §10's permanent lock
   means a further stone overwrites that same slot, so proposing one is
   proposing to *destroy* the better line. The comparison is between the value
   now on the converted slot and the value the projection assigns — and both
   sides must be measured against the same ceiling, which §10 fixes at two
   contributions for a conversion.

Neither a projection nor a recommendation is computed once condition 2 fails.

**The converse holds and is the common case.** An artifact whose converted slot
holds *less* than the projection is still recommended for conversion: the lock
does not protect a weak line, it only names which line a stone may touch. Where
a recommendation would overwrite an existing conversion, the wording says so —
*re-convert* rather than *convert* — because the line being spent is one the
user already paid a stone for, and "convert" would read as though the artifact
still had its free slot.

### 17.5 Every conversion worth taking is shown, in order

Where a view names conversions it shows **all** of them, ranked by what each
adds to that monster, descending:

- if any **preferred** conversion is available, every preferred one is listed
  and no accepted one is;
- otherwise every available **accepted** conversion is listed;
- a conversion that is neither preferred nor accepted is never suggested.

Preferred outranking accepted is absolute rather than a tiebreak: a preferred
property is what the monster actually wants, and an accepted one is a
concession. Listing a strong accepted conversion above a weak preferred one
would invite the user to spend a stone on the concession.

### 17.6 A recommendation names the stone it would spend

Where a recommendation depends on an engraved conversion stone, it says **which
stone** — its grade and equip class, as the game names them, in the shortest
form that still identifies the item the user has to go and find:
`Legend Water stone`, `Rare Attack stone`. The property is already named by the
conversion itself, so the stone label does not repeat it.

The stone named is the best-graded one the account owns for that property and
class, because that is the one the user would sensibly spend. Where the mode is
the theoretical one, no stone is named: nothing is being spent.

### 17.7 One Intangible choice, in Settings

Whether Intangible artifacts take part is asked **once**, in Settings, and every
view in the workspace respects the answer. It is a statement about how the user
wants their account judged, not a per-table filter, and asking it separately on
each page invites the three views to disagree about the same account.

### 17.8 Every table sorts on every column

Any table in the workspace sorts by any of its columns, ascending and
descending. A ranking the user cannot re-ask is a ranking they have to trust;
the point of showing the numbers is that they can interrogate them. Columns
that are not numbers sort too — by name, by location, by monster — because
"show me every artifact currently in inventory, best first" is the ordinary way
this data gets read.
