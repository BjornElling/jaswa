# Rune Clean-up — investigation into "Best preset"

**Status:** Findings and resolution. **Resolved 20 September 2026.**
**Date:** 18 September 2026
**Scope:** `app/lib/rune-cleanup-model.ts`, `app/lib/rune-cleanup-advice.ts`,
`app/lib/rune-potential-presets.ts`, `docs/RUNE-CLEANUP-MATH.md`
**Prompted by:** three recommendations that looked wrong on the Rune Clean-up page.

> **Resolution.** The defect below is fixed. `app/lib/rune-substat-weights.ts` gives
> every target its own multiplier, derived from what the build still needs from sub
> properties once the reference monster, all six main properties and the completed set
> are subtracted, against what an ordinary rune supplies of that stat anyway.
> `RUNE-CLEANUP-MATH.md` §4 is the contract, and
> `npm run verify:rune-substat-weights` holds it. The function names below are the
> pre-fix engine's and several no longer exist; the document is kept as the record of
> how the defect was found and what exactly it was.

> **Follow-up.** The later finite preset-capacity allocator was removed as well.
> A rune that passes the quality and Chance gates is now matched independently and
> is never sold because another rune reached the same preset first. The Intangible
> slider and 4-set preference remain as relative retention preferences.

---

## 0. Verdict

**The theory is confirmed, and the defect is more fundamental than the examples suggest.**

The model does not score a rune against what a role *needs*. It scores a rune against
what a role *does not care about at all*, and treats everything else as equally
valuable. As a direct consequence:

- For **Slow DD, Fast DD, Def DD, Leo and Bruiser**, the only sub property the model
  considers worthless is **Resistance**. Accuracy, HP and DEF count in full, at exactly
  the same rate per roll as CRI Dmg.
- Those five presets have **identical relevance sets**, so they produce **identical Max
  values**. Over 2,677 synthetic runes scored against a shared reference line, the raw
  Max value differed between them **zero times**.
- Therefore "Best preset" is not decided by the rune's sub properties at all. It is
  decided by **set membership**, by **main-stat legality in slots 2/4/6**, and — when
  those tie, which is often — by the per-rune best-match tie-break.

This is *not* a deviation from the written contract. `docs/RUNE-CLEANUP-MATH.md` §3 and
§4 specify exactly this behaviour. It is a **design defect in the contract**, which
matters for how it should be fixed: the contract has to change first.

---

## 1. The root cause, in two lines of code

`preset.targets` is read in the entire clean-up engine in exactly two places, both in
`buildDemand`:

```ts
// rune-cleanup-model.ts:161
const wanted = targetStats.filter((stat) => (preset.targets[stat] ?? 0) > 0);

// rune-cleanup-model.ts:171
shares.get(slot)?.set(stat, preset.targets[stat] ?? 0);
```

Line 161 uses the target as a **boolean**. Line 171 stores the number into
`Demand.shares` — and **nothing ever reads that number**. Every consumer of `shares`
uses only its keys:

| Consumer | How it uses `shares` |
| --- | --- |
| `fillOf` (215) | `for (const stat of shares.keys())` |
| `slotCeiling` (198) | `shares.has(stat)` |
| `bestReachableFill` (396, 405) | `shares.has(stat)` |
| `reachChance` (571) | `shares.has(stat)` |

`Demand.shares` is typed `ReadonlyMap<TargetStat, number>`. The `number` is dead data.
The type promises a weighting the code does not implement.

**So a preset's stat targets are a relevance switch and nothing more.** `Fast DD` asking
for 215 SPD and `Slow DD` asking for 150 SPD are, to this engine, the same request.
`Fast DD` asking for 175 CRI Dmg and 25 Accuracy is, to this engine, the same request
twice.

### 1.1 Why the currency makes it worse

`inMaxRolls` normalises every stat by its own best six-star roll. For every percent-line
stat and every native-point stat, one max roll is therefore **exactly 1.0**. From
`rune-properties.ts` §6★ table:

| Stat | Max roll | Worth in the model's currency |
| --- | --- | --- |
| HP % | 8 | 1.0 |
| ATK % | 8 | 1.0 |
| DEF % | 8 | 1.0 |
| SPD | 6 | 1.0 |
| CRI Rate | 6 | 1.0 |
| CRI Dmg | 7 | 1.0 |
| Resistance | 8 | 1.0 |
| Accuracy | 8 | 1.0 |

A maximum Accuracy roll and a maximum CRI Dmg roll are the same number. The only way one
stat can outrank another is by being switched **off** — and a damage-dealer preset
switches off only Resistance.

---

## 2. The relevance sets, as shipped

Computed from `defaultRunePotentialPresets()`:

| Preset | Type | Stats with a positive target |
| --- | --- | --- |
| Slow DD | Attack | hp, atk, def, spd, criRate, criDmg, acc |
| Fast DD | Attack | hp, atk, def, spd, criRate, criDmg, acc |
| Def DD | Attack | hp, atk, def, spd, criRate, criDmg, acc |
| Leo | Support | hp, atk, def, spd, criRate, criDmg, acc |
| Bruiser | No type | hp, atk, def, spd, criRate, criDmg, acc |
| Bomber | Attack | hp, atk, def, spd, criRate, acc |
| Support | Support | hp, def, spd, acc |
| PvP def | HP | hp, def, spd, res, acc |

Four distinct sets across eight presets. Five presets share one of them.

The token targets are what does the damage. `Fast DD` states `def: 814` and `acc: 25` —
figures a build reaches incidentally, from an artifact or a single line. Under the
contract, stating them at all makes DEF and Accuracy fully relevant sub properties for a
speed damage dealer.

---

## 3. Measurements

Reproduce with the probe scripts described in §7. Reference base lines are plausible
Lv. 40 averages, not the user's own roster (see §6, limitation 2).

### 3.1 The five damage-dealer presets never disagree

4,000 synthetic legal 6★ runes, one shared reference line for all preset types:

```
runes scored by >= 2 of {Slow DD, Fast DD, Def DD, Leo, Bruiser}:  2677
runes where their raw Max values differ at all:                       0
largest gap:                                                       0.00 pp
```

With **distinct per-family reference lines** (the realistic case), the same five presets
diverge by at most **3.89 pp**, and that divergence comes entirely from the monsters'
base HP/ATK/DEF changing the flat-line conversion — not from anything about the roles.
For comparison, the rank discount at slider stop 3 is a factor of 0.85 or 0.60, i.e.
15–40 pp. **Set membership outweighs stat fit by an order of magnitude.**

### 3.2 The blindness test

Two legal +15 Legend runes, slot 3 (DEF+ main is fixed there), same set, same number of
rolls, same roll sizes. The only difference is which stats the rolls landed on:

- **F** — CRI Rate 24, CRI Dmg 20, ATK % 8, SPD 5, prefix CRI Dmg 7 *(textbook DD rune)*
- **G** — DEF % 24, Accuracy 20, HP % 8, SPD 5, prefix Accuracy 7 *(textbook support rune)*

| Preset | F Max value | G Max value |
| --- | --- | --- |
| Slow DD | 96.56 % | **91.20 %** |
| Fast DD | 96.56 % | **91.20 %** |
| Def DD | 96.56 % | **91.20 %** |
| Bruiser | 96.56 % | **91.20 %** |
| Leo | 96.56 % | **91.20 %** |
| Bomber | 53.70 % | 91.20 % |
| Support | 9.26 % | 91.20 % |
| PvP def | 9.26 % | 91.20 % |

A rune with **zero attack stats anywhere on it** reads **91 %** as a Fast DD rune, 5.4 pp
behind a perfect crit rune. Any quality floor that keeps F keeps G. Note also that the
model *can* discriminate — Support and PvP def correctly put F at 9 % — so the failure is
concentrated in exactly the presets whose authors stated a target for nearly every stat.

### 3.3 The three reported runes

Reconstructed (see §6, limitation 1), per-family base lines, sliders at stop 3
(`accepted = 0.85`, `broken = 0.60`). "after discount" is the number the Max value column
prints.

**(a) Blade, slot 2, SPD main, HP +747 / DEF +65 / Accuracy 7 / HP % 33, +15 → Fast DD**

| Preset | Rank | Raw | After discount |
| --- | --- | --- | --- |
| **Fast DD** | preferred | 86.4 % | **86.4 %** |
| Bruiser | preferred | 82.1 % | 82.1 % |
| Bomber | broken | 86.4 % | 51.8 % |
| Support | broken | 81.6 % | 49.0 % |
| PvP def | broken | 81.0 % | 48.6 % |
| Slow DD / Def DD / Leo | — | no build (they demand ATK % or DEF % in slot 2) | — |

Mechanism: Slow DD, Def DD and Leo are eliminated because a SPD main in slot 2 is not a
main stat they accept. Of the two survivors, Fast DD wins by 4.3 pp — which comes from
the Attack-family base line making the flat HP +747 worth slightly more, **not** from
anything about the rune suiting a speed damage dealer.

One correction to the original report: the rune does carry a speed stat — SPD is its
**main** stat, and a SPD slot 2 is exactly what Fast DD asks for. The absurdity is not
the main stat; it is that HP +747, DEF +65 and Accuracy 7 contribute their full value to
an attack score.

**(b) Vampire, slot 1, ATK+ main, SPD 6 / CRI Rate 12 / HP % 19 / CRI Dmg 14, +12 → Fast DD**

| Preset | Rank | Raw | After discount |
| --- | --- | --- | --- |
| **Fast DD** | preferred | 81.9 % | **81.9 %** |
| Def DD | preferred | 81.9 % | **81.9 %** |
| Leo | preferred | 81.9 % | **81.9 %** |
| Bruiser | preferred | 81.9 % | **81.9 %** |
| Slow DD | acceptable | 81.9 % | 69.6 % |
| Bomber | acceptable | 59.7 % | 50.7 % |
| PvP def | acceptable | 37.5 % | 31.9 % |
| Support | broken | 37.5 % | 22.5 % |

**This is the clearest case.** Four presets are tied at the identical score to twelve
decimal places. Nothing about the rune breaks the tie. `candidates.sort` in
`rune-cleanup-advice.ts:175` is V8's stable sort over an array built in preset order, so
the fallback goes to whichever of them appears first in the preset list — Fast DD — and
the displayed match goes to the strongest passing preset after the quality and Chance
gates have been applied.

The original suspicion that Slow DD "seems more obvious" is right about the outcome but
not about the reason. Slow DD lost **only** because Vampire is `acceptable` there and
`preferred` for Fast DD. On stat fit the model rates them exactly equal. Bruiser — also
a defensible answer — lost the coin toss, not the argument.

**(c) Guard, slot 5, HP+ main, HP % 30 / SPD 15 / Accuracy 11 / Resistance 16, +15 → Def DD**

| Preset | Rank | Raw | After discount |
| --- | --- | --- | --- |
| **Def DD** | preferred | 84.7 % | **84.7 %** |
| Support | acceptable | 84.7 % | 72.0 % |
| PvP def | **broken** | **100.0 %** | 60.0 % |
| Slow DD / Fast DD / Bomber / Leo / Bruiser | broken | 84.7 % | 50.8 % |

**PvP def is the only preset that scores this rune correctly**, at 100 %: it is the only
role whose targets make Resistance relevant, and HP/SPD/Accuracy are exactly what it
wants. It loses anyway, by 40 pp, because `Guard` appears in neither its preferred nor
its acceptable set list, so the broken discount multiplies it by 0.60. Def DD wins with a
score 15.3 pp lower, on the strength of `Guard` being one of its preferred sets.

(That 100 % is a *clipped* figure — the four lines as reported sum to 9.63 max-roll units
against a slot ceiling of 9.00, which means either one of them is the prefix or some of
the value is grind. See §5.4. It does not change the comparison: PvP def would still lead
on raw score at any plausible reading of the rune.)

So the page recommends a Resistance/Accuracy/HP rune to a critical-damage build while
the role that genuinely wants it sits one row down, correctly scored and thrown away.

One correction here too: the rune is not entirely useless to Def DD — Def DD targets
`hp: 14649`, so the HP % 30 does count. But its CRI Rate 70 and CRI Dmg 200 targets go
unserved, and the model has no way to say so.

---

## 4. What the model gets right

Stated for balance, because a fix must not throw these away.

- The currency itself (§2 of the math contract) is sound. Pricing a flat line against a
  percent line by division against the user's own roster average is a genuinely better
  answer than a fixed "flat counts half" convention.
- The ceiling denominator (5 rolls + 3 rolls + prefix on the best legal ids) is a correct
  model of a perfect legal **unground** rune. A hand-built perfect +15 Legend — four
  subs, all four upgrades on one line, plus a prefix, every line on a relevant stat —
  reads exactly `100.00 %`, as it should. (See §5.4 for what grindstones do to that
  scale.)
- The exact-enumeration chance calculation, the star and Ancient handling, the craft
  projection and the legality rules all look correct, and are independently checked by
  `verify:rune-cleanup-calibration`.
- The set/main-stat rank machinery works as designed. Its weight relative to stat fit is
  the problem, not its existence.
- Presets with genuinely narrow targets (Support, PvP def, Bomber) discriminate properly.
  This is evidence that the mechanism is salvageable.

---

## 5. Secondary findings

### 5.1 The Math page has a broken table

`app/components/the-math-section.tsx:118-146`. The header declares four columns —
Stat, Rune has, **Role values it**, Contribution — but each data row emits only three
cells (`<th>` + two `<td>`). The contribution figures render one column to the left, under
"Role values it", and the total row (which does emit four cells) is the only one aligned
correctly.

The column that would have shown how much a role values a stat is empty. That is not a
coincidence: under the current model there is no number to put in it.

### 5.2 The Math page describes a discrimination the model does not perform

`the-math-section.tsx:113` — "That division is what makes **the perfect rune for a preset
read 100 %**, whatever the preset is asking for." True as written, but it reads as a
claim that the scale is preset-sensitive. §3.2 shows a rune with no attack stats reading
91 % for Fast DD. A user reading the Math page would not predict that.

### 5.3 No finite preset quota

The former post-gate allocator has been retired. A rune that clears the quality and
Chance gates for any preset is retained, even when several other runes match that same
preset. The row chooses one strongest passing match only for explanation; it does not
consume a slot, reduce another rune's chance, or produce a sell verdict. The
Intangible slider and 4-set preference now widen the retained share used by the gates,
so they still affect relative retention without introducing a finite preset pool.

### 5.4 Grindstone value is in the numerator but not in the denominator

Separate from the preset question, and found while checking the ceiling.

`supplyOf` (`rune-cleanup-model.ts:310`) counts `runeSubValue(property) = value + grind`,
so a grindstone already applied to a rune contributes to `fill`. `slotCeiling`
(`:193-206`) builds the denominator from `maximumRoll` alone — pure rolls, no grind. The
two halves of the fraction therefore describe different objects.

A Legend Grindstone on a percent line gives up to **+10** against a maximum roll of 8,
i.e. **1.25 max-roll units**, and all four lines can carry one. Measured:

| Slot 3 rune, Slow DD | Max value |
| --- | --- |
| HP % 8 / ATK % 8 / DEF % 8 / SPD 6, no grind | 33.33 % |
| the same four lines, each with a maximum Legend grind | **70.37 %** |

+37 pp on a rune that has rolled nothing. Grinding is a real improvement, so counting it
is defensible — but then the denominator has to model it too, or "100 %" stops meaning
"as good as a rune in this slot can be". At present a sufficiently ground rune exceeds
the ceiling and is clipped by `Math.min(1, best / ceiling)` (`:284`), which silently
erases any further difference between such runes.

This also bears on example (a): the displayed `HP +747` is `value + grind`, so part of
that rune's score may be grind measured against a grind-free ceiling. The exact split
needs the raw `sec_eff` row (§7.1).

### 5.5 `Demand.shares` should not carry a number

`rune-cleanup-model.ts:147-152`. Either the weight is used, or the type should be
`ReadonlySet<TargetStat>` so the dead field cannot be mistaken for an implemented one.

---

## 6. Limitations of this investigation

1. **The three runes are reconstructions.** The original report gave the sub properties
   and, for two of them, the set and slot. For rune (c) the set, slot and main stat were
   not given; `Guard` / slot 5 / HP+ was chosen as a plausible fit to the observed
   outcome. The reconstructions reproduce the reported preset attribution, but the exact
   percentages will differ from the page. §7 lists what would make them exact.
2. **The reference base lines are assumed**, not read from the user's account. The
   engine reads the average Lv. 40 monster per family from the live roster; no export is
   present in this repository. This affects the flat-line conversions (HP +, ATK +, DEF +)
   and therefore the absolute percentages. It does **not** affect §3.1's core result,
   which was measured with a single shared base line precisely to remove that variable.
3. **The synthetic population is uniform over stats**, which a real rune box is not. It is
   used only for the structural claims (do presets ever disagree; does the score
   saturate). No claim in §0 depends on its realism.
4. **The craft sliders were set to "none"** (no gem, no grindstone credit). An Enchanted
   Gem *can* replace an irrelevant line with a relevant one, so credit would raise the
   absolute scores — but it raises them for every preset that finds the stat relevant,
   and §3.1's five presets have identical relevance sets, so it cannot separate them.
   §5.4's grind measurements use grind **already on the rune**, which the sliders do not
   affect.

---

## 7. What would sharpen this

To move from "confirmed structurally" to "reproduced exactly on your account":

1. The raw export rows for the three runes — `set_id`, `slot_no`, `class`, `extra`,
   `upgrade_curr`, `pri_eff`, `prefix_eff`, `sec_eff`. Chiefly to settle whether one of
   the four displayed lines on runes (a) and (c) is the **prefix** rather than a sub
   property, which shifts the arithmetic.
2. The five slider positions in use (Rune quality floor, Power-up policy, Accepted runes,
   Broken runes, and the two craft settings), so the discounts can be matched exactly.
3. The reference base lines the page is actually using — the average Lv. 40 stats per
   family on the account.
4. Whether the shipped presets have been edited since first use, since they are copied
   into preferences and are editable.

## 8. Open design questions, for whoever fixes this

These are questions about intent, not about code; they need answering before §1 can be
repaired.

1. **Should a target magnitude become a weight?** The obvious fix is to weight each
   relevant stat by its target, normalised. It would immediately separate the five tied
   presets and stop Accuracy counting as CRI Dmg. But it makes `hp: 15042` and
   `criDmg: 175` directly comparable numbers in different units, which is not
   meaningful without a normalisation rule of its own. `RUNE-CLEANUP-MATH.md` §3's
   refusal to use the target as a cap was a deliberate, well-argued decision; the
   argument against using it as a *weight* has never been made, and should be.
2. **Or should the presets simply stop stating token targets?** Removing `def: 814` and
   `acc: 25` from Fast DD is a one-line change that fixes §3.3(a) and part of §3.2. It
   does not fix §3.3(b) — Slow DD and Fast DD would still be identical — and it pushes
   the modelling burden onto the user, who must now understand that a stated target is a
   switch and not a goal.
3. **What should break a genuine tie?** Once two presets legitimately score a rune the
   same, silently taking the first in array order is the worst available answer. Showing
   both, or saying "several roles, none preferred", is honest; the current output is not.
4. **Should the set-rank discount really outrank stat fit by 20–50 pp?** §3.3(c) is a
   direct consequence of that ratio. The sliders let the user tune it, but their default
   makes set membership almost lexicographically prior to everything else.

---

## 9. Reproduction

The probe scripts used for §3 are not committed. They import the shipped modules directly
and were run with the repository's own type-stripping loader:

```
node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs <probe>.mjs
```

Each probe does one of: enumerate each preset's relevance set from
`defaultRunePotentialPresets()`; call `judgeAgainstBuild` for one rune against every
preset with `withChance = false`; or generate a legal synthetic population and call
`runeAdvice`. No repository file was modified.
