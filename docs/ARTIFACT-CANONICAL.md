# Artifact rules — canonical specification

**Status:** Binding rule basis for the JASWA Artifacts workspace
**Reviewed:** August 30, 2026
**Game:** *Summoners War: Sky Arena*, client generation v9.x (not *Chronicles*
or *Lost Centuria*)

This document is the canonical description of the game rules the Artifacts
workspace may build on. Where code, interface, or a secondary guide contradicts
it, this document governs until it is corrected with documented evidence.

**Import boundary.** A game response is authoritative about an artifact the
account owns. JASWA validates the wire shape it needs to render safely — ids,
numeric values, four sub-property entries and known vocabulary — but never
refuses an owned artifact because a local roll or conversion model says its
value is implausible. Roll tables are planning references: they set score and
projection ceilings, not an admission test for data the game already accepted.
This keeps a newly changed conversion or reappraisal encoding from freezing the
entire live import.

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

This is the correct way to compute "the most one line of this property could
ever hold" — from the roll structure, never from a hard-coded ceiling. Note what
it is *not*: §16 measures every line against the Legend column, because a
lower-grade line genuinely holds less and the score is about contribution.

### The contribution budget — four lines share eight rolls

The table above is the ceiling for **one** line. The ceiling for the artifact is
a separate and more binding fact, and §16 depends on it:

```text
total contributions = initialProperties + 4 = maxContributions + 3
```

Every grade gets the same four power-up milestones (+3/+6/+9/+12); each one
either creates a missing line or upgrades an existing one, so it is a
contribution either way.

| Grade | Initial lines | Milestones | Total contributions | Most on one line |
| --- | ---: | ---: | ---: | ---: |
| Normal | 0 | 4 | 4 | 1 |
| Magic | 1 | 4 | 5 | 2 |
| Rare | 2 | 4 | 6 | 3 |
| Hero | 3 | 4 | 7 | 4 |
| Legend | 4 | 4 | 8 | 5 |

**Four lines can never all be full.** A Legend holds eight contributions, and
four lines each holding the maximum five would need twenty. Every line also
keeps at least its own contribution, so the best any Legend can do is one line
at 5 and three at 1 — or any other split of the same eight.

This is the fact that makes an "all four lines maxed" benchmark unreachable, and
scoring against one understates every artifact by the same 2.5×. Any future
change to the scoring denominator has to be checked against this table.

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

**This is a legality ceiling, not a scoring one.** It answers "could this line
legally hold this value on this grade", which is what `readSubProperty` checks.
§16 divides by the Legend column instead, for every grade, because it asks a
different question — how much the line contributes — and a Normal line holding
its single roll contributes a fifth of a full Legend line, not all of one. Using
this ceiling there made the score fall as the grade rose.

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
| **Normal Conversion** | Replaces one chosen sub property with a random legal property, including a reroll of that property's value | Conversion Stones, Mana |
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

### 10.1 An Intangible artifact cannot be converted

**Observed in the client, September 5, 2026.** Conversion is unavailable on an
Intangible artifact: neither a Conversion Stone nor an Engraved Conversion Stone
can be applied to one. An Intangible therefore holds the four sub properties it
dropped with for as long as it exists, and `convertedPropertyIndex` is `null` on
every one of them.

This follows the shape of the mechanic rather than contradicting it. §15.12
records that a stone is engraved for **one equip class** and converts nothing
else, and §15.1 records that an Intangible names no class at all. There is no
class for a stone to match, so there is no stone the artifact can accept — the
wildcard that makes an Intangible fit every monster is the same fact that leaves
it nothing to convert with.

**The scoring consequence, and it is not cosmetic.** No projection, no
recommendation, and no conversion gain may be computed for an Intangible. It is
scored on the lines it holds and nothing more, in every conversion mode. Doing
otherwise ranks these artifacts above ones that can genuinely be improved, on a
gain the game will never let the user collect — and it does so precisely where
the user is least able to check it, because the Intangible artifacts are the
scarce ones worth the most attention.

Both compute backends must apply this identically, as they must for `fits`
(§15.1): `scoreArtifactOnMonster` in `artifact-score-core.ts` and the same test
in the WebGPU shader. A disagreement there would give the two backends different
candidate sets for one account.

It also means no code should ask which engraved stones apply to an Intangible.
`ownedConversionPropertyIndexesByClass` deliberately files no entry under
`intangibleRestrictionCode`: a category-wide union there would be an answer to a
question the rules do not permit.

### A normal conversion reaches one and a half rolls

**Settled September 5, 2026** against the game's own **Repeat Convert** dialog,
which names the lowest and highest selectable threshold for every property a
normal conversion may roll. That is a first-party statement of the range, so
under §14 it outranks both the account's converted lines and any published
table:

```text
conversionMinimum = minRoll                  // exactly, on all 25 properties
conversionMaximum = ceil(maxRoll × 1.5)      // rounded up to the display step
```

| Property | Roll | Converts to |
| --- | --- | --- |
| DMG dealt on element, ATK/DEF UP Effect | 3–5 | 3–**8** |
| DMG taken from element, SPD UP Effect, CD+ enemy HP more, every Skill line | 4–6 | 4–**9** |
| Bomb DMG, CRIT DMG Taken, Add'l DMG by ATK/DEF, Own turn 1-target, Counter/Co-op | 2–4 | 2–**6** |
| Life Drain | 5–8 | 5–**12** |
| CD+ enemy HP less | 8–12 | 8–**18** |
| Add'l DMG by SPD | 25–40 | 25–**60** |
| Add'l DMG by HP | 0.20–0.30 | 0.20–**0.50** |

`scripts/verify-normal-conversion-maximum.mjs` transcribes the dialog and locks
every figure.

**Two rules this replaces, and why each fails.** `maxRoll × 2` — the previous
model here — overstates every property by about a third: it would put Life Drain
at 16 where the game stops at 12. The community rule `minRoll + maxRoll` agrees
only where `minRoll` happens to be half of `maxRoll` (2–4, and 3–5 once rounded);
it fails 4–6, 5–8, 8–12 and 25–40. Both survived the account data only because
**no observed line ever came close to either ceiling** — which is itself the
clue, since a two-roll ceiling should have been reached occasionally in 265
lines.

**The rounding is real, not a fitting artefact.** The two properties whose 1.5×
lands off the display step are the proof it rounds *up*: 5 → 7.5 → **8**, and
0.3 → 0.45 → **0.5**.

**One property conflicts, and the conflict is kept.** The dialog lists `[Skill 2]
CRIT DMG` (401) at 4–9 like every other skill line, implying `maxRoll` 6 — but
one line of 6,881 in the account holds **7**, and §12 forbids a ceiling a real
artifact exceeds. The definition keeps 7, so its conversion ceiling sits one step
above the dialog's. That errs toward admitting, never toward rejecting.

**Received values and planning values are separate.** `maxRoll × 2` remains an
observed conversion envelope and `artifactNormalConversionMaximum` is the figure
a *proposed* normal conversion is scored against. Neither is an import bound:
the game has already established the received value, and a new conversion or
engraved-stone encoding must not make the account stale.

### The account's own count: two contributions, never reached

**Settled September 3, 2026** against the 137 converted lines in the captured
account. This is an observed envelope; the dialog above governs what a normal
conversion actually produces.

Every converted line stores `powerUpCount: 0`, so the naive reading is that a
conversion produces a single roll. The values refuse that reading: **66 of the
101 converted lines whose range is known hold a value no single roll can
produce** — effect 300 (3–5 per roll) reaches 8, effect 223 (8–12) reaches 17,
effect 219 (2–4) reaches 6. The complementary check is what settles the count:
**no converted line in the account requires a third contribution.** The
observed fractions of a two-contribution ceiling run 0.300 to 0.833, and none
exceeds 1.

```text
conversionEnvelope = maxRoll × 2      // an observed planning envelope, independent of grade
```

This is §15.9's position-4 rule seen from the other side: the newest-line flag
is set on the converted line, and counting it as one extra contribution is what
makes the arithmetic close.

**The observed ceiling fraction corroborates the dialog.** Those fractions top
out at **0.833 and never approach 1** — and `1.5 / 2 = 0.75`, with the rounding
on odd maxima explaining the rest. A genuine two-roll ceiling should have been
touched at least once across 265 lines. It never was, because it was never
reachable: the account was measuring a 1.5× ceiling against a 2× yardstick all
along.

**It does not scale with the artifact's grade**, and that is the trap. A Legend
line collects five contributions, so judging a conversion against *that*
ceiling claims a value the game cannot produce, and overstates the case for
converting exactly on the artifacts worth the most care. A conversion on a
Legend artifact reaches at best `ceil(maxRoll × 1.5)` where the line it replaces
could have held `maxRoll × 5`.

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

### Structural import rules

A complete validation layer checks at least:

1. Monster attribute matches the Attribute artifact.
2. Monster type matches the Type artifact.
3. At most one artifact per category.
4. Main stat ∈ {HP, ATK, DEF}.
5. Exactly four finished sub properties.
6. A known property id and main-property id resolve to JASWA's vocabulary.
7. A legacy property is preserved on an existing artifact.

Category membership, duplicate properties, power-up totals, roll reachability,
conversion limits and reappraisal invariants remain useful **diagnostics and
planning assumptions**. They are not import rejection criteria: they describe
what the game normally creates, while the game remains the source of truth for
what it did create.

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
[ effectId, value, powerUpCount, currentConversionFlag, legacyConversionMarker ]
```

**Position 2 is the power-up count, and the original captured cohort followed
the grade invariant.**
Summed across an artifact's four lines it equals `natural_rank − 1`, in every
single record:

| `natural_rank` | Σ power-ups | Records |
| ---: | ---: | ---: |
| 3 (Rare) | 2 | 334 |
| 4 (Hero) | 3 | 747 |
| 5 (Legend) | 4 | 170 |

That is §3's table, observed rather than assumed. The natural grade and line
counts are useful evidence for the roll model, but they are not a reason to
discard a game-issued artifact: conversions and later mechanics may encode the
same finished result differently.

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

### 15.6 Position 3 — the current conversion lock

The fourth tuple field marks the permanent Conversion lock in the current game
client. The in-game panel for direct-import artifact `1221299508` shows the
gold Convert mark on its fourth sub-property, `[Skill 3] Accuracy +8`; that
line's tuple is `[409, 8, 0, 1, 0]`. The lock is therefore the line's position
in `sec_effects`, not its current property name; a later conversion may replace
that property and value without moving the lock.

### 15.7 Position 4 — legacy conversion marker

Older captures encode the same lock in the fifth tuple field: artifact
`284184132` has `[221, 31, 0, 0, 1]` on its game-marked third line. The reader
uses this position only when no current (fourth-field) lock exists. Its numeric
magnitude is not modelled and it must never override the current marker.

Both encodings are import metadata, not validation rules. A converted line may
have any game-issued value or power-up count; those values remain authoritative
input, while the roll model merely estimates future conversions.

### 15.8 What this unblocks, and what it does not

Modelling and reading artifacts is unblocked. Roll
quality (§13's first evaluation axis) is computable today: the property, its
power-up count, its value, and the grade invariant are all present and verified.

The conversion position is now settled by the game panel (§15.6). The fifth
field's broader numeric meaning remains unmodelled: it is retained solely as a
legacy lock fallback, and its magnitude does not enter any calculation.
`attribute`/`unit_style` value 98 was the other uncertainty and is now settled
as the Intangible equip class (§15.1).

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

**The legacy conversion marker is evidence about a contribution.** Counting a
set historical fifth field as one extra contribution repairs the grade invariant
on **43 of the 44 records that otherwise break it**, leaving one. That is a
useful planning model, not a parser rule: a later conversion encoding may carry
the same value differently, and the account must still import intact.

**The extra contribution raises the ceiling only** — and the floor half of this
finding was confirmed independently the same day by the Repeat Convert dialog,
whose lowest selectable threshold is exactly `minRoll` on all 25 properties
(§10). The ceiling half was superseded: `maxRoll × 2` survives here as an
observed envelope, but a normal conversion actually reaches `ceil(maxRoll × 1.5)`.
*Settled September 5, 2026*
against the 265 converted lines with a known range in the captured account:
**none exceeds `maxRoll × 2`** — which reads as confirmation but is merely
consistency, since none reaches `ceil(maxRoll × 1.5)` either — while **142 hold
less than `minRoll × 2`**, and **none falls below a single roll's minimum**. A
conversion re-rolls the line from nothing, so two contributions are what it may
*reach*, never a floor it must clear. The planning range for a converted line is
therefore asymmetric:

```text
minimum = minRoll × (powerUpCount + 1)   // the lock adds nothing here
maximum = maxRoll × (powerUpCount + 2)   // the lock adds one contribution
```

Doubling both ends is the trap for estimating a conversion. Effect 221
converted to 37 against a 25–40 roll is an ordinary line; in every case the
received value remains authoritative, even when a later observation revises
this model.

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
recommendation and calculation. A current-dated record with the same unfamiliar
invariant remains authoritative input; historical date only decides whether
JASWA has a historical ceiling for judging it.

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
ranges**, because no local range can honestly judge every preserved artifact:
55 artifacts in this account predate v6.2.0 or have values the old upgrade
mechanic did not express as a whole multiple of a current roll. §12's rule
governs: a range that cannot explain a legal artifact is worse than none.

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

#### The stone's grade raises the floor, never the ceiling

**Settled September 5, 2026** against the stones' own tooltips, which state the
range each stone will roll. This answers the question §10 had to leave open, and
it answers it in the *opposite* direction to the usual assumption:

| Stone | Property | Roll | Stone's range | Normal conversion |
| --- | --- | --- | --- | --- |
| Legend | Life Drain | 5–8 | **8~12** | 5–12 |
| Legend | CD+ as less enemy HP | 8–12 | **12~18** | 8–18 |
| Legend | Bomb DMG | 2–4 | **4~6** | 2–6 |
| Legend | [S1] Accuracy, [S3] Recovery, [S4] CRIT DMG | 4–6 | **7~9** | 4–9 |
| Rare | Add'l DMG by ATK | 2–4 | **2~6** | 2–6 |

Every stone's **maximum is exactly the normal-conversion ceiling** of §10 —
`ceil(maxRoll × 1.5)`, with no exception across grades. What grade buys is the
**floor**: a Rare stone spans the whole normal range, while a Legend stone
starts around two thirds of the way up it. An Engraved conversion is therefore a
*safer* conversion, not a stronger one.

**The practical consequence, and it is the one that matters here: no engraved
conversion can produce a line a normal conversion could not.** An unexplained
high value in the account cannot be blamed on an engraved stone. This removes
the reservation §10 records for the import bound — the two systems share one
ceiling — though the bound stays where it is, because widening never rejects a
legal artifact and this evidence covers grades and properties sampled, not all
of them.

**The 4–6 skill properties are the one irregularity.** Their Legend floor is 7
where the two-thirds pattern of the others predicts 6. Recorded as observed
rather than smoothed: five stones is too thin a sample to derive the floor rule,
and only the ceiling — which is uniform — is used by any calculation.

**The evidence is post-v8 by construction, unlike the account's lines.** A
converted artifact line is a historical record — it preserves whatever table was
in force when it rolled, which is why §15.11's eras matter for reading them. A
stone's tooltip is the opposite: the client renders it from the *current* table
to state what the stone will roll if used now, whatever date the stone was
obtained. Nine stones across two grades agree with the Repeat Convert dialog on
every overlapping property, so two independent live sources give one ceiling.

**A stone can name a property the artifact tables call legacy**, and both such
properties resolve cleanly:

| id | Property | Stone | Implied roll |
| ---: | --- | --- | --- |
| 216 | HP when Revived | Rare **4~9** | 4–6 |
| 217 | Attack Bar when Revived | Legend **7~9** | 4–6 |

For 216 that is exactly what §15.11 recovered from pre-v6.2 lines, now confirmed
from a second, independent direction; 217 follows the same 4–6 shape, including
the Legend floor of 7 that every other 4–6 property shows.

**This does not make them current.** Neither appears anywhere in the Repeat
Convert dialog's target list, so they are retired from the *random* pool while
remaining reachable by a *targeted* engraved stone. `status: 'legacy'` therefore
still describes them correctly for normal conversion, and their ranges stay
`null` under §12 — but the account's 174 stones naming a legacy property are not
all unusable, and a future session may want to value the 216/217 ones now that
their ranges are known. Recorded, deliberately not acted on.

**Stones naming a legacy property are refused, not offered.** 174 of the 463
name one, and §12 forbids computing a roll for a property whose range is
unknown — so a conversion to one could not be valued. They are genuinely
unusable for a recommendation rather than merely unread, which is the
distinction `AGENTS.md` §0.1 part 3 turns on.

### 15.13 `rid` is the obtained order; `date_add` is not

**Settled September 4, 2026.** The game's own "Obtained" sort is the account's
acquisition sequence, and `rid` carries it. `date_add` is the field that looks
right and is not.

**`date_add` resolves only to the second, and the game grants artifacts in
bulk.** In a 2,089-artifact snapshot, 548 artifacts — better than a quarter of
the account — share a `date_add` with at least one other, in 13 groups; the
largest three hold 139, 139 and 135 records, each one a single dungeon run or
shop purchase landing in the same second. Inside such a batch the date
distinguishes nothing, so any order built on it alone falls back to whatever
order the records happen to arrive in, which is not the order the game shows.

**`rid` is a strict refinement of the date, never a contradiction of it.**
Sorting the same 2,089 artifacts by `rid` puts an earlier `date_add` after a
later one exactly zero times in 2,088 adjacent pairs. It is also unique per
artifact, so ordering by it needs no tiebreak, and it requires no reading of
the account's `tzone` — the export's space-separated timestamps name no zone,
and the account's is `America/Los_Angeles`, so a date parsed locally is hours
adrift of the one the game displayed.

**`rid` must therefore be a safe integer.** It is both the identity and the
ordering key, so a fractional or out-of-range value can carry neither and the
reader rejects the record under `AGENTS.md` §0.1 part 3 rather than sorting it
somewhere arbitrary.

`npm run verify:artifact-obtained-order` is the check. It asserts both
properties against the live snapshot when the helper log is present, and
against synthetic same-second batches when it is not.

**`date_add` keeps one job**: the roll-model era cutoffs of §15.10 and §15.11.
Those boundaries are months apart, so neither the ties nor the time zone can
move a record across one.

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
sub properties, let `pᵢ = rolled valueᵢ / maxRollᵢ`. `pᵢ` is the property's
**max-roll points**: one maximum natural roll is one point, so a line that took
five maximum rolls is worth five points.

```text
max-roll pointsᵢ = rolled valueᵢ / maxRollᵢ
```

**The point is natural, not grade-relative.** One maximum natural roll is one
point on every artifact, so a Legend line holding one roll scores low and a
Normal line holding its only roll scores lower still — which is the truth about
both. `Σ pᵢ` is then proportional to the stat the artifact actually delivers.

This took two corrections, and both are worth keeping written down because each
failure was invisible — every artifact still got a number, and the number was
wrong. The current point presentation is algebraically the same final measure,
but makes the contributions visible instead of burying a factor of five in every
line.

**September 3, 2026: not the line's own contributions.** The measure originally
divided by the contributions each line actually collected, which made a
max-rolled one-roll line score 1.0 exactly like a max-rolled five-roll line.
That answers "did this line roll luckily?" and the optimizer asks "how much does
this artifact contribute?" (§17). Across 1,085 Legend lines in the captured
account the mean was 0.800 under the old measure and 0.325 under the next one.

**September 3, 2026: not the grade's ceiling either.** Dividing by the
artifact's *own* grade replaced one error with its mirror. A finished artifact
holds `maxContributions + 3` contributions across its four lines (§3), so that
denominator caps `Σ rᵢ` at `(M + 3) / M` — which **falls** as the grade rises:

| Grade | Contributions held | Old cap on `Σ rᵢ` | Old score ceiling |
| --- | ---: | ---: | ---: |
| Normal | 4 | 4.00 | 160 % |
| Magic | 5 | 2.50 | 100 % |
| Rare | 6 | 2.00 | 80 % |
| Hero | 7 | 1.75 | 70 % |
| Legend | 8 | 1.60 | 64 % |

A max-rolled Normal artifact scored 2.5× a perfect Legend while delivering half
the stat, and `conversionCeilingFraction` reached 1.0 on Normal and Magic, so a
conversion scored as a full line exactly where it helps least.

The consequence worth stating plainly: a Rare artifact does not score like a
Legend merely for having rolled well within its smaller allowance, and a
conversion — reaching one and a half rolls by §10 — is worth `1.5/5` of a full
line on every grade.

### The benchmark must be an artifact that can exist, on a monster that exists

The sub-property benchmark is **the best artifact the game can build on the
profile the monsters actually offer**: a Legend that spent all four power-ups on
its one preferred line, plus one acceptable line, at maximum rolls. Its lines
hold 5, 1, 1 and 1 contributions, because eight is all there are and every line
keeps its own.

```text
benchmark points = 5 + a
subValue = Σ(wᵢ × pᵢ) / benchmark points
optimalValue = m × subValue
```

**One acceptable line, not three, because that is what the defaults grant.**
Across the 902 monster types the statistics cover, **830 have exactly one
preferred sub property** out of 23, and the mean is 0.94 with about four
acceptable. Measured against the captured account, the best profile any monster
offers a given artifact is `1 preferred + 1 acceptable` or `1 preferred + 2
acceptable` for 1,161 of its 1,555 artifacts; four preferred lines occur for
three. A benchmark of `1 preferred + 3 acceptable` therefore measures every
artifact against a monster that does not exist, and it showed: the account's
best artifact reached 90 % and nothing else came near it.

This is a fixed denominator, and it is fixed twice over.

**It is not derived from the artifact.** Using the weights of the properties
this artifact happened to roll lets one max preferred line and three irrelevant
lines score the same as four desired max lines.

**It is not derived from the monster.** A monster wanting exactly one property
would otherwise be perfectly served by an artifact carrying only that property,
while a monster wanting the same property plus three acceptable ones scored
lower for having said more. The score answers *how much of what this monster
wants does this artifact deliver*, which is the question §17 needs, because
allocating one pool of artifacts across many monsters requires numbers that are
comparable between monsters. A monster with one preferred property and nothing
else therefore tops out near 77 %, and that is the honest answer: the best
artifact in the world can only give it one line of what it wants.

**And it must be reachable.** The original `1 + 3a` assumed four lines that had
each collected five contributions — twenty, against the eight that exist. It sat
2.5× above anything the game could produce, so the profile the document called
100 % actually scored 52 % and a perfect Legend capped at 64 %.

At the default `a = 0.5`, with a preferred main and max rolls:

| Profile (Legend, max rolls) | Score |
| --- | ---: |
| 1 preferred (5 contributions) + 1 acceptable — the benchmark | 100 % |
| 1 preferred (5) + 2 acceptable | 109 % |
| 1 preferred (4) + 1 preferred (2) | 109 % |
| 1 preferred (5) + 3 unwanted | 91 % |
| 4 preferred | 145 % |
| 1 preferred (2) + 3 unwanted | 36 % |

The grade ceilings run 73 % (Normal), 91 %, 109 %, 127 % and 145 % (Legend) —
rising with the grade, as the contribution each delivers does.

**Measured against the captured account**, taking each artifact's best score
over every catalogued monster: median 43 %, p90 63 %, p99 77 %, best 106 %. That
best is a Legend carrying `[Skill 1] Recovery` at 27 of 30 on all five
contributions, for a monster that prefers it — an artifact that deserves to read
as exceptional. Twelve artifacts pass 80 %.

A score above 100 % is intentional: 100 % is the benchmark, not the ceiling. It
means an artifact beat the profile — a second preferred line, or an acceptable
line that took power-ups of its own.

**Recalibrating this is a deliberate act, not a tuning knob.** The benchmark's
shape follows from the contribution budget (§3) and its acceptable-line count
from the observed preference breadth. Should the defaults' thresholds change
(§19.3), that breadth changes with them and this figure has to be
re-measured rather than left standing.

`npm run verify:artifact-score-scale` holds all of this: that the benchmark
profile is exactly 100 % at every acceptable worth, that each grade's ceiling is
reachable and higher than the grade below it, and that the WGSL backend divides
by the same number as the TypeScript one.

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
conversion, belongs in each monster's Attribute and Type slots?*

It ranks every positive artifact/monster score together, locks the highest pair
first, and continues down the ranking. A lock consumes that physical artifact
and exactly one slot: Attribute or Type on one monster. This is deliberately
not a maximum-sum matching algorithm. The user farms replacements continuously,
so an outstanding individual fit must win even where a portfolio optimiser
would trade it away for a larger total.

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

### 17.2 A placement owns one artifact and one slot

Each monster has exactly two distinct slots: one Attribute and one Type. A
placement may fill only the matching category slot, and an artifact may occur
in only one placement. The allocator checks both claims after every pass; a
duplicate artifact or a third artifact for a monster fails loudly rather than
silently becoming advice.

The table shows the complete result, not only moves: **Keep** is a selected
artifact already on its locked monster, **Equip** is a selected artifact that
belongs elsewhere, and every unselected artifact says **Sell**. This preserves
the one-to-one plan and prevents an equipped artifact from disappearing merely
because no move is required.

A score of zero means that an artifact is legal but contributes nothing. It is
not allowed to fill a slot. A slot may therefore remain empty when no positive
artifact remains after stronger locks; the result reports every such shortfall
explicitly rather than duplicating an artifact or pretending a zero is useful.

**And the report says where they went.** An empty slot almost never means the
account holds nothing that suits that monster — the artifacts exist, and the
ranked pass gave each of them to a monster scoring at least as well. Wording
that stopped at "no artifact scoring above 0 % remained" was read as the
stronger, wrong claim, which turns the plan's own answer into an apparent fault
in it. Name the reason, and count in the singular when the count is one.

### 17.3 Differences below the stated threshold are not differences

The user may declare a band — 1 % to 5 % — inside which two scores count as the
same. A gain no larger than the band is not an improvement, and a recommendation
resting on one is suppressed on every page. The band is expressed in percentage
points of the score, which is the number the interface actually shows.

The band is a *user's* judgement about what is worth acting on. Potential means
an action JASWA would actually recommend, so a conversion inside the band is not
part of an artifact's potential score, its allocation, or its recommendation.
The current artifact score remains true; the band says the proposed action is
not worth spending a stone on.

### 17.4 A conversion is proposed only when it beats what is there

The conversion must raise the artifact's **total score** on that monster by more
than the selected significance band. A conversion that leaves the total score
unchanged is not recommended.

An existing conversion is not protected merely because its raw roll is high.
The permanent lock means that only that line can be changed again; it does not
make an unwanted high roll more valuable than a lower preferred replacement.
If re-converting the locked line makes the complete artifact better for its
monster, JASWA recommends it.

**Only the weakest source line is considered.** On an artifact with no prior
conversion, JASWA proposes changes only to the sub property contributing the
least to the particular monster's score. It does not offer a second-best source
as an alternative just because that alternative would also improve the result.
If two or more lines contribute the same score, the one with the lowest natural
roll percentage is chosen. An exact remaining tie preserves the artifact's
stored line order. Once a line has been converted, the game's permanent lock
overrides this rule: only that specific line can be converted again.

**The lock still holds.** It names which line a further stone can touch; it does
not protect that line's present roll. Where a recommendation overwrites an
existing conversion, the wording says *re-convert* rather than *convert*,
because the line being spent is one the user already paid a stone for.

**One line is converted; several may be offered.** The rule above chooses the
line the score is computed from, and that choice is arithmetic — it has to
settle on one line, so it separates equals by roll and then by stored order. But
where the monster ranks several lines in the *same preference band* as the
chosen one, those tiebreaks are describing a difference the monster does not
feel: replacing any line it ranks unwanted costs it nothing it wanted, and the
same holds within the accepted and preferred bands. A recommendation therefore
**names every line in the chosen line's band**, in numeric order — `Sub 1/2/4`
— while still being scored on the single line the rule picked.

The distinction is between a decision JASWA is entitled to make and one it is
not. Which property to convert *to* is a judgement about the monster, and JASWA
makes it. Which of several equally worthless lines to spend is not: the user may
be holding one back for a monster this plan has not reached, or reading a line
the preferences do not capture, and naming only the arithmetic winner presented
their choice as forced. The band is what decides the grouping, not the
contribution — two unwanted lines with different rolls are still both unwanted.
An empty slot ranks as unwanted, which it is, and groups with them.

A permanently converted slot is the exception, and follows from the lock rather
than from any rule here: a further stone can touch that line and no other, so
there is no choice to offer and the recommendation names it alone.

When the projected property is already on the source line, the recommendation is
a same-property reroll rather than a new property. This can apply to a line the
artifact dropped with as well as to a line previously changed by Conversion. It
does not create a duplicate property; it replaces the source line's value, and
the interface calls it **Improve roll in** so the action is clear.

### 17.5 Every conversion worth taking is shown, in order

Where a view names conversions it shows **all** of them, ranked by what each
adds to that monster, descending. The same set defines the artifact's potential
score — a hidden accepted conversion is not allowed to make an artifact look
better when a preferred conversion is available:

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

The library's own `Include` toggle is not an exception to this, because it is
not the same question. Settings asks whether these artifacts should be *judged*;
the library's toggle asks only whether they are *listed*, the way its Location
buttons ask whether equipped ones are. The library is deliberately separate from
the workspace — it answers what the account owns, not what to change — so a
view filter there decides nothing about a recommendation. It defaults to on:
these are artifacts the account holds, and a library that omitted them by
default would break §0.1 parity on the one page whose whole job is to show
everything.

### 17.8 Every table sorts on every column

Any table in the workspace sorts by any of its columns, ascending and
descending. A ranking the user cannot re-ask is a ranking they have to trust;
the point of showing the numbers is that they can interrogate them. Columns
that are not numbers sort too — by name, by location, by monster — because
"show me every artifact currently in inventory, best first" is the ordinary way
this data gets read.

### 17.9 The figures on the page add up

*September 5, 2026.* Every count the recommendation view prints has to
reconcile with the others **on the page**, without the user reconstructing how
the code partitions its work.

The slot summary did not. It read `558 of 558 scored slots filled` and was
immediately followed by a warning naming 2 more slots awaiting preferences.
Both statements were true — `slotCount` deliberately counts only the *scorable*
slots, an unscored one being a data gap rather than an allocation failure — but
between them they gave the user three numbers with no visible relationship, and
the only reading available was that the app had contradicted itself.

The total is now **every slot in the scope**, with the parts that are not
filled named beside it:

```
552 of 560 slots filled (8 awaiting preferences)
```

so `filled + unfilled + awaiting = total`, always, and each part is named only
when it is non-zero — a complete account still reads plainly as `560 of 560
slots filled`. The three figures are derived from one total in
`artifact-maximum-values.tsx` rather than reported independently, which is what
makes the arithmetic a property of the code rather than of the wording. The
warnings below the line no longer claim the slots are "not counted as
unfilled", because they are now counted, in a part of their own.

The general rule: an internal distinction that makes a total exclude something
must not surface as a total the user cannot verify. Either the excluded rows
are in the figure, or the figure is not the one to print.

### 17.10 Before and after are two different questions

The recommendation table answers both "where is this artifact now" and "where
would the plan put it", and those are separate filters — **Location before**
and **Location after**. Before reads the import; after reads the allocation:
equipped if a monster was allocated the artifact, inventory if the advice is to
sell it. The two partition the rows identically and independently, so
`after: Equipped` always yields exactly as many rows as the summary reports
filled slots — a cross-check the user can perform by eye, once **Already
matching** is off. With it on, as the view opens, the difference between the
two figures is precisely the rows it hides: 558 filled slots, 19 already
matching, 539 shown.

**Already matching / Hide** removes the rows where the two agree — where the
artifact already sits on the monster the plan names, which is the `Keep`
action.

**The view opens on the work list.** Two of these filters start applied:
`Location after: Equipped` and `Already matching: Hide`. What remains is the
plan's *unfinished* part — the artifacts it would equip, minus the ones already
where it wants them — because that is the list the user acts from, and it is a
fraction of the whole: 539 rows of the captured account's 1,862.

The rows this hides are not lesser rows; they are answered ones. A `Sell` row
asks nothing beyond the decision the column already states, and a `Keep` row
asks nothing at all. Opening on all 1,862 made the user's first act a filtering
task they would perform every time, and the two filters that perform it are the
first two they would reach for.

This is a default, not a restriction, and the distinction is what makes it
acceptable: the buttons carry their pressed state on arrival, one click on
either restores what it hides, and the underlying plan is unchanged — the
allocation is still computed over the whole library (§17). The opening view is
exactly these two filters applied to the complete plan, never a separate
reading of it.

These three filter on the *advice*, so they cannot run alongside the filters
that ask about the artifact itself: the allocation is not known until the
calculation is paired with the row. They narrow the rows shown and nothing
else. The allocation is still computed over the whole library, so §17's
guarantee holds — a filter never changes the advice in the rows that remain.

### 17.11 A stale result says so, and the user chooses who refreshes it

*September 5, 2026.* A calculated table answers the settings and the import it
was calculated from. When either moves, that answer is no longer the answer to
the question on screen — and the table must never quietly present it as though
it were. What happens next is the user's choice, asked once in Settings as
**Re-calculate**, with two options and always exactly one of them chosen:

- **Manually** — the default. The result is kept and marked out of date, and
  the Calculate button remains the way to a fresh one. A calculation over the
  whole library is real work the user asked for; spending it again on every
  slider nudge is not JASWA's call to make on their behalf.
- **On change** — the calculation re-runs itself, so the table on screen always
  answers the current settings and import.

Manual is the default because the quieter behaviour is the one that cannot
surprise: a user who wants the tables to keep up can say so, while a user who
does not can never be charged for a calculation they did not request.

Two consequences the code has to honour:

**The mode is not scoring input.** It decides *when* a calculation happens and
never what it produces, so it is excluded from the key each view compares its
held result against — `scoringSettings()` in `artifact-recommendations.ts`, one
function for all three views rather than three spreads that could drift. Were
it left in, choosing a mode would itself mark every result stale, and in the
on-change mode that reads as the setting recalculating the page merely by being
selected. The function lists its fields rather than spreading and removing one,
so a setting added later has to be classified deliberately.

**Stale is visible in every view.** The recommendation table already said so;
the two single-subject views simply dropped their tables, which left the page
looking as though nothing had ever been calculated — indistinguishable from a
fresh visit, and no explanation of where the results went. All three now carry
the notice, and in the on-change mode it reports the refresh that is already
under way instead of asking for a button the user has told JASWA not to make
them press.

Auto-refresh never starts a *first* calculation — an empty view filling itself
on arrival is the same uninvited work manual mode exists to prevent — never
runs while one is in flight, and never retries a failed one: an error clears the
held result, so nothing is stale and there is nothing to chase.

### 17.12 A backend that could not answer must never answer zero

*September 8, 2026.* §17.2 says a zero score may not fill a slot, which is right
— and it is exactly why a silent zero is the most dangerous value the compute
layer can produce. A matrix of zeros is not read as a failure anywhere: it is
read as an account whose 1,300 artifacts suit none of its monsters, reported in
the interface's own calm words as *"no artifact scoring above 0 % remained for
560 slots"* — a sentence since rewritten, because the ordinary one-slot case was
being read the same way.

WebGPU produces that value willingly. It does not throw when it rejects a
binding or a pass; it drops the work and leaves the output buffer as it was
created. A uniform block whose declared size outgrew the bytes the backend
uploads — a `padding: vec3<f32>` member, which aligns to 16 and pushed a 32-byte
block to 48 — was enough to switch the whole graphics-card path off while every
CPU-side column on the same page stayed correct.

Two rules follow, and the second is the one that generalises:

- **The upload and the shader's own layout are checked, not assumed.**
  `npm run verify:webgpu-parameter-layout` computes the block's WGSL uniform
  layout from the shader source and holds the backend's buffer to it. Nothing
  else can: the shader compiles either way, and the browsers Playwright drives
  here expose no WebGPU at all, so every other check runs the CPU reference.
- **A rejected pass becomes a rejected promise.** The backend wraps its work in
  a validation error scope, so the worker falls back to the CPU reference — the
  fallback it already has for a missing device — instead of publishing zeros
  that look like an answer.

---

## 18. Quality is text; a score is colour

The game's five quality tiers — Normal, Magic, Rare, Hero, Legend — are one
vocabulary shared across the game: an artifact's grade and a rune's quality use
the same five names in the same order. `app/lib/quality-tiers.ts` owns the
list, `ArtifactGrade` aliases it rather than restating it, and runes read the
same list when they gain a quality of their own.

**A grade is shown as text, never as colour.** *Tried and removed, September 4,
2026.* The game paints each tier in a hue — white, green, blue, purple, orange
— and JASWA reproduced them faithfully, from SWARFARM's rune stylesheet
(`herders/static/herders/css/runes.css` in `github.com/swarfarm/swarfarm`), the
community's standard rendering. Every value cleared 4.5:1 against `--bg` and
each tier was named in text beside its colour.

It still read wrong. Five hues competing down a dense table are decoration
rather than information: the eye is pulled to whichever row is orange, which
tells the user nothing about what to do, and the accent that means "you can act
on this" loses its force by sitting among four rivals. Provenance was not the
problem, and a better-sourced palette would not fix it — the density is the
problem. Grade keeps its own column, in plain text.

Worth knowing if this is ever revisited: there is **no published datamined
palette** to be more faithful to. The game draws each tier as a radial glow,
white-hot at the centre fading to a coloured rim, so there is no flat colour to
extract and sampling yields a different value at every radius. The art is not
even self-consistent between systems — the Legend rune sprite reads red-orange
where the Legend artifact sprite reads a warmer orange. And the game's Legend
orange lands within 4° of hue of `--gold`, a contrast ratio of 1.04, so a
Legend artifact and an active control were the same colour.

### 18.1 The one exception: a rule in the margin

*Added September 5, 2026.* Quality **is** shown as colour in exactly one place:
a 2px rule down the left edge of the recommendation table's first cell
(`app/components/quality-rule.tsx`), where it lands on the row's leading edge.
Colouring the grade *word* stays removed — this is a different shape, and it
survives the objection above rather than ignoring it:

- **It is outside the reading line.** The rule sits on the row's leading edge,
  so it never paints a word the user is reading and never competes with
  `--gold` on a figure or a control. It was first tried against the substat
  column, where it read as a stripe *inside* the row; on the row's edge it
  reads as a margin mark, which is what makes it recede.
- **It is identical in every row but its hue.** Same width, same position, same
  vertical extent, whatever the tier. Nothing about a Legend row is *bigger*
  than a Normal one, so the tiers compare down the column instead of one of
  them shouting. It occupies the same box on every row, so no row shifts
  (rule 2).
- **It is desaturated well below the accent.** These are muted readings of the
  game's hues, not reproductions. §18 already established there is no flat
  palette to be faithful to, which frees the colours to be chosen for how they
  read here.
- **Legend is pulled deliberately off the accent.** The game's Legend orange is
  within 4° of hue of `--gold` at a contrast ratio of 1.04. This Legend is
  distinctly redder, so a Legend rule and an active filter button are not the
  same colour.
- **Normal reads as an absence.** The game's Normal is white, which drawn in
  ink would make the weakest tier the loudest, inverting the ranking. It takes
  `--line-strong`: present, so every row has a rule and the column has an edge,
  but reading as no colour at all.

The rule carries no text, so it names its tier in `aria-label` and `title`. A
colour nobody can name is decoration; this one answers "which tier?" when the
user asks it directly. Grade also remains sortable in the Substats column and
filterable in the panel, so the rule is a scanning aid rather than the only way
to reach the fact.

### 18.2 A score reads in three bands

Colour on data survives in exactly one place, and it is the number rather than
the grade. `artifactValueBands` in `app/lib/artifact-grid.ts` is the one set of
boundaries, and every table that prints a percentage uses it:

| Band | Score | Colour |
| --- | --- | --- |
| Strong | 75 % and above | `--gold` |
| Fair | 50–74 % | `--ink` |
| Weak | below 50 % | `--dim` |

Gold at the top band is the one place in JASWA where a *fact* wears the accent,
and it earns it: at that band the number is itself the invitation to act. The
boundaries live in one module because two tables judging the same number must
not disagree about what counts as a good score — which they did, the
recommendation table having carried its own private threshold of 75.

An absent score is **unjudged, not low**, and keeps its own separate muted
reading. `—` never enters a band.

---

## 19. Where a monster's property preferences come from

Every score in §16 and every recommendation in §17 rests on one statement: which
artifact properties this monster wants. This section owns that statement — who
makes it, how it is stored, and what happens where nobody has made it.

### 19.1 The user declares what matters; JASWA measures only the roll

**Artifact value is never derived from what a property *does* in combat.** Per
monster, the user marks each property **preferred** or **acceptable**, and the
artifact's value is how well it rolled on exactly those.

This removes the dependency on skill data entirely — JASWA has none, and judging
`[Skill 2] Recovery` would otherwise require knowing whether Skill 2 heals — and
it puts the judgement where the knowledge actually is: the player knows what
their monster is for.

It follows that **JASWA never checks whether a preference is sensible.**
Validating one against the monster's kit would reintroduce the skill dependency
and would put the program in the position of overruling the user about their own
monster. A preference the user regrets is theirs to change.

### 19.2 Preferences are held per monster species, keyed by `(category, property)`

Preferences are held **per monster species**, never per owned copy: two copies of
one monster cannot carry different preferences, and the interface offers no way
to try. A property preference says what this *kind* of monster is for. A
collaboration pair is one species — `docs/MONSTER-SPECIES-DECISION.md`.

A preference is keyed by **`(category, property)`**, not by property alone. A
monster wears one artifact of each category, so "which property do I want here"
is genuinely two questions: a `Life Drain` roll on the Attribute artifact is a
different opportunity from one on the Type artifact and competes against a
different set of alternatives. The fourteen properties available on both
categories therefore appear in both lists and are set independently, and
**anything keyed on the property alone — a lookup, a default, a validation, a
saved preference — is wrong by construction.**

Every property is its own independent choice. The ten elemental properties get
no separate mechanic: `Damage Dealt on X` and `Damage Taken from X` point in
opposite directions, so collapsing them into one "element" choice would lose the
distinction that matters.

Nothing is shared between species, and preferences are not copyable from one to
another. The defaults below are what spare the user a roster of empty forms.

### 19.3 The statistics supply the defaults, by fixed shares

The engraving statistics (`docs/ENGRAVING-STATISTICS.md`) supply the **default**
preferences, classified from the raw counts of one `(species, category, view)`
distribution — never from rounded display percentages:

```text
share = property count / sum of all property counts in that distribution
```

| View | Preferred | Acceptable | Neither |
| --- | --- | --- | --- |
| Main Property (HP, ATK, DEF) | share ≥ 40 % | ≥ 10 % and < 40 % | < 10 % |
| Sub Property (Attribute or Type) | share ≥ 10 % | ≥ 5 % and < 10 % | < 5 % |

The two thresholds differ deliberately. Main Property has three possible values,
so 40 % is a meaningful choice over an even split while 10 % preserves a real
minority option. Each sub-property distribution has 23 values, making an even
share about 4.3 %; 10 % is a clear preference and 5 % is worth accepting. **No
category is forced to have a preferred default** where its statistics make
nothing stand out.

These thresholds decide the preference breadth the §16 benchmark is measured
against. Changing them means re-measuring that benchmark, not merely retuning a
knob.

### 19.4 A user's statement always wins, and "cleared" is not "unset"

**A user-entered preference always takes precedence. The statistics are
consulted only where the user has stated nothing.** The two are never blended,
averaged or reconciled: for a given `(species, category, property)` the answer
comes from the user if they have stated one, and from the dataset otherwise.

This removes a whole class of problem rather than solving it — because a
recapture cannot touch anything the user has stated, the dataset needs no merge
policy against preferences, and there is no "your default changed" case to
design. What it does require is three states, and they are three:

| State | Stored | The answer comes from |
| --- | --- | --- |
| The user stated preferred or acceptable | The value | The user |
| The user stated *nothing* | Nothing | The statistics, where the dataset covers the species |
| The user deliberately cleared it | An explicit "neither" | The user — **not** the default |

The third row is the one that gets got wrong. Seeding the stored preferences
from the defaults at first view collapses rows one and two; treating a cleared
preference as absent collapses rows two and three, and the default silently
overrules the user. This is `AGENTS.md` rule 3's absent-versus-zero distinction
in the place it costs most: **store only what the user actually stated.**

### 19.5 A species with no preferences is not judged

A monster species the dataset has not captured and the user has not filled in is
**not yet judged**: it is kept out of score-sorted views and given no fallback
score derived from archetype or anything else.

Every artifact would score zero against such a species, and a zero renders and
sorts as though it were an answer. The dataset will never cover every species —
each capture costs the user a visit to three panels, and new monsters keep
arriving — so this is the ordinary case, not an edge case. An honest gap beats a
guess that looks like a judgement.

### 19.6 One global factor says what "acceptable" is worth

How much an *acceptable* property is worth against a *preferred* one is a single
global factor, not one per monster: the user is stating a general tolerance,
rather than tuning each row.

**It is stored as the percentage itself** — one of 0, 25, 50, 75 or 100 — in
`ArtifactSettings.acceptableWorth`, so the value the user reads and the value
the calculation multiplies by are one thing. A step index would need translating
into a factor somewhere, and that translation is a second source of truth. The
five stops are a validated set rather than a range: a `.sw` file claiming 37 %
did not come from this slider.

The default is 50 %, the honest midpoint. Both endpoints read as the feature
switched off — at 0 % an acceptable property may as well be unwanted, and at
100 % the distinction stops meaning anything — and §16 records what each does to
the benchmark.
