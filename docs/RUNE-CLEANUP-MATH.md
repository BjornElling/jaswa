# Rune Clean-up — the calculation contract

**Status:** Binding contract for Rune Clean-up verdicts
**Depends on:** `docs/RUNE-CANONICAL.md` and `docs/RUNE-PRESET-METRICS.md`
**Reviewed:** 18 September 2026

This document describes the calculation, not the game rules. Game facts and their
sources belong in `RUNE-CANONICAL.md`; where the two differ on a game fact, the
canonical document wins. `app/lib/rune-cleanup-model.ts` is the one arithmetic
implementation, `app/lib/rune-cleanup-advice.ts` applies policy, and
`npm run verify:rune-cleanup-calibration` independently checks the stochastic part.

## 1. Evidence and explicit assumptions

| Matter | Status |
| --- | --- |
| Ordinary 1–6★ main and substat intervals | Verified tables in `RUNE-CANONICAL.md` §§3–4. |
| Ancient main stats and later upgrades | Ordinary 6★ values. |
| Ancient drop substats | Higher Ancient *initial* table only; see `RUNE-CANONICAL.md` §7. |
| Gem and Grindstone legality/ranges | Verified tables and source notes in `RUNE-CRAFT-ITEMS.md`. |
| A value inside its legal integer interval | Modelled uniformly; the 6★ distribution has a measured check. |
| Upgrade target and new-line type | Assumed uniform over legal choices; neither is claimed as game fact. |

The stochastic assumptions are isolated in the exact probability engine and checked
against a separate Monte Carlo oracle, not a duplicate implementation.

## 2. One currency, including flat stats

All relevant substats are converted to **six-star maximum-roll equivalents**. A
percent line divides by its six-star maximum. HP, ATK and DEF flat lines first become
percentage points of the selected reference monster's base stat, then divide by the
corresponding percentage-line maximum:

```
flat HP contribution = (flat HP × 100 / reference HP) / 8
HP % contribution    = HP % / 8
```

The same conversion is used for ATK and DEF. Thus `HP +375` and `HP % +8` can be
compared without a made-up universal flat-stat weight. SPD, CRI Rate, CRI DMG, RES
and ACC are native points and divide by their own maximum roll.

The reference base is the average of the user's own level-40 monsters in the preset's
family. A missing family uses the account-wide level-40 average; with no level-40
monster, Rune Clean-up refuses to calculate rather than fabricating a reference.

## 3. What a target means

A positive preset target says that stat is relevant to the role. It is deliberately
**not** a per-rune requirement and it is never used as a cap. A 21 SPD rune remains
more valuable than a 17 SPD rune in a role aiming at 17 SPD per rune: its surplus lets
a different rune carry HP, ACC or another required stat in the eventual build.

Only these things make a line irrelevant: the preset has no positive target for its
target stat, the effect id is illegal on the slot, or it duplicates an effect id the
game forbids. Set and main-stat preferences determine preferred, acceptable and broken
rank; they do not turn a wanted substat off when a local arithmetic target is met.

**A slot the preset names no main stat for accepts every main that slot allows, at
the broken rank.** This is the canonical reading. Leaving a slot blank means the role
has no preference there, not that it refuses to judge runes in it — a preset that
states slots 4 and 6 and leaves slot 2 blank still judges slot-2 runes, and they take
the broken main rank because nothing was preferred. The opposite reading would make a
rune the preset wants report "No preset can use it" because of a slot it does not
mention, which is the invisible failure `AGENTS.md` §0.1 forbids.

## 4. Value and Max value

For every compatible preset/build, the model sums every current relevant line,
including the prefix and any legally credited craft improvement:

```
fill = sum(relevant max-roll equivalents)
```

There is no `min(supply, share)` term. All relevant value contributes.

The denominator is the best legal ordinary 6★ result in the candidate's slot: a
prefix, one five-roll line and one three-roll line using the best available relevant
effect ids. The three uses distinct effect ids; an id cannot be duplicated and a line cannot receive more than its
initial roll plus four upgrades.

```
substat potential = bestReachableFill / sixStarLegalCeiling
Max value         = substat potential × (candidate main maximum / 6★ main maximum)
```

The main factor puts deterministic lower-star main properties on the same scale as
their 6★ counterparts. A perfect 4★ or 5★ rune is rated, but cannot masquerade as a
perfect 6★ rune. Ancient leaves this factor unchanged because Ancient does not alter
main stats. Future additions use the ordinary initial table; Ancient's higher table
applies only to lines present on drop.

## 5. Gems and Grindstones

Craft sliders set a point in the selected item's legal range: none, average, three
quarters, or maximum. The model evaluates legal actions on actual lines, rather than
adding a generic craft number to a selected stat. A Gem respects duplicate, main,
prefix and slot rules; a re-Gem may only replace the already Gemmed line. It preserves
a Grind only for the same effect id. A Grindstone is considered only on a grindable
line and uses `max(existing grind, credited grind)`. Ancient runes use Ancient craft
tables and ordinary runes ordinary craft tables.

At below +12 a Grindstone can be projected but an unspent Gem cannot: a Gem changes
the actual rune and should be considered once its fourth line is known. At +12 both
are evaluated under the stated policy.

## 6. Exact chance to reach the quality floor

`Chance` is the exact discrete probability that final Max value reaches the quality
floor by +12, including the deterministic main-stat factor. Events are modelled in
order: until four substats exist, each event adds a distinct legal id; afterwards each
event improves one of the four lines; +15 is never a substat event.

The engine enumerates every unordered legal set of added ids, every multinomial split
of upgrades across the completed lines, and every legal integer roll value. It
convolves distributions without a rounding grid. Added lines receive their initial
draw before upgrades allocated to them, so a Hero rune's fourth line can receive later
upgrades. All relevant realised value is summed in full: surplus ACC, SPD or HP is
never discarded. The independent Monte Carlo oracle checks ordinary 4★/5★/6★ and
Ancient 6★ fixtures.

Chance is computed in whole units of 10⁻¹² max rolls. Summation order is an
implementation detail and is not part of the contract; two implementations of this
model agree on chance to within 10⁻⁹. Where a chance falls exactly on a display
rounding boundary, the printed percentage follows from the computed value and is not
separately pinned. This states a tolerance that was previously left implicit: the
probability model is exact, but IEEE-754 addition is not associative, so a
reassociation that is exact in the model can still move the last bits of a double.
`npm run verify:rune-cleanup-equivalence` is the check that holds every other field —
verdict, reason, preset, rank and Max value — to bit equality across a change.

## 7. Verdict and finite preset allocation

The population judged is the one `RunePotentialSettings.includeLevel12Runes` and
`includeEquippedRunes` define, applied before the engine is entered. Both open
included. A rune the user excludes is not judged and takes no place in any preset's
quota, so excluding equipped runes changes the allocation for the runes that remain
rather than merely hiding rows — the eligible pool and its quotas are global. The
table's own Equipped/Inventory filter is a separate control applied afterwards and
changes no figure.

For every build of every preset the engine applies the set/main rank discount, the
Max-value quality floor, and then the Chance floor. A passing rune is eligible for
every preset/build it passed. The account is then allocated globally: `runeShare` is
converted to its stated factor and active presets receive largest-remainder quotas from
the eligible pool. Scarce presets are allocated first and each rune serves one preset.
Thus a broad preset cannot quietly consume a narrow preset's requested inventory.

An eligible candidate outside finite requested capacity says so explicitly. Larger-set
and Intangible preferences break allocation ties; they do not alter the quality score.
Assigned runes below +12 are **Power up**; assigned runes at +12 are **Keep**. The
rest are **Sell** with the first applicable reason.

## 8. Calibration and adversarial checks

`scripts/verify-rune-cleanup-calibration.mjs` independently generates legal runes,
executes additions/upgrades with its own PRNG, and checks chance fixtures, finite advice
for lower stars and Ancient runes, feasible preset allocation, and a population smoke
test. It reports the total retained rate and slots but does not impose an invented
universal slot distribution or retained percentage: those follow the user's presets
and finite quotas. Its output is an implementation regression check, not proof of an
unverified game-RNG rule. `npm run verify:rune-cleanup-calibration` is the fast
regression guard; `npm run verify:rune-cleanup-calibration:large` is the 1,000-rune
statistical run used before release.

`scripts/verify-rune-cleanup-equivalence.mjs` answers the other question, which the
calibration oracle deliberately cannot: whether this build says what the last one did.
It records every public field of every row over a fixed population and eight settings
and preset scenarios, and diffs them against a recorded baseline. The two are
complementary — the oracle says the model is right, the equivalence gate says a
refactor did not move it — and a change to the engine runs both.

## 9. Change procedure

Changing a game rule updates `RUNE-CANONICAL.md` first. Changing this model updates
this document, The Math, the independent calibration and relevant deterministic checks
in the same commit. A new uncertainty is named as an assumption, never smuggled in as
a default.
