/**
 * **What one substat is worth to one role, and why it is not what the one beside
 * it is worth.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` §§3–5 owns the reasoning; this owns the arithmetic.
 *
 * Normalising every line to max-roll equivalents makes a SPD roll and an Accuracy
 * roll *comparable*. It does not make them *equal*, and treating a positive target
 * as a switch — relevant or worthless — is what made them equal. A role that wants
 * 215 SPD and 25 Accuracy is not asking its runes for two things of the same size:
 * once the monster's own base, the build's main properties and the completed set
 * are subtracted, the Accuracy is under three max rolls across the whole build and
 * the SPD is eighteen.
 *
 * So each target is priced by **how far past an ordinary set of runes it reaches**:
 *
 * 1. Subtract what the build already brings — the reference monster's base stat,
 *    every main property in the six-slot build, and the completed set bonus.
 * 2. Convert what is left into max rolls. That is the whole build's requirement.
 * 3. Work out what six ordinary runes would supply of that stat anyway, slot by
 *    slot, respecting which effect ids each slot's main property leaves legal.
 * 4. Divide. A requirement of four times the ordinary supply is four times the
 *    selection pressure of one at par, and the multipliers are those ratios,
 *    normalised so the tightest target weighs `1`.
 *
 * **Why a ratio and not the tail probability.** The obvious reading of "how hard"
 * is `P(an ordinary rune supplies this share)`, and it was tried. Every target a
 * real preset states sits deep in that tail, and tails that deep differ by many
 * orders of magnitude for reasons that have nothing to do with what a player
 * should value: a Slow DD slot-2 rune already carries ATK % as its main property,
 * so its ATK share is only reachable through flat ATK lines, and the probability
 * of reaching it collapsed to 10⁻⁸ — which scored ATK **above** every other stat
 * on precisely the rune that cannot carry it. A ratio of means is finite, moves
 * smoothly, and says the thing that is actually true: the other five slots have to
 * find that ATK instead. Which lines this rune may legally carry is a separate
 * question, and `rune-cleanup-model.ts` answers it where it belongs — in the
 * ceiling this rune's own slot is measured against.
 *
 * **Nothing here caps a stat.** A rune that rolled more SPD than its share needs is
 * worth more, not the same: the surplus is what lets a different rune in the
 * finished build carry the HP or the Accuracy instead.
 */
import {
  allStatIds, mainPropertyMaximum, maximumRoll, scalesWithBase, subPropertyRange,
  subPropertyTargetStat, targetStatSubProperties,
} from './rune-properties';
import type { TargetStat } from './rune-properties';
import { slotAllowsSubStat } from './runes';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetArtifacts, PresetTargets } from './rune-potential-presets';
import { artifactMainValue, artifactsPerMonster } from './artifact-properties';
import type { Valuation } from './rune-roll-distributions';

/** The eight stats a preset can aim at, in the order every table reads them. */
export const targetStats: readonly TargetStat[] = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];

/** The six slots, which every requirement is measured across. */
const slots: readonly number[] = [1, 2, 3, 4, 5, 6];

/** The main property each slot carries. Slots 1, 3 and 5 are fixed (§3). */
export type BuildMains = Readonly<Record<number, number>>;

/* ------------------------------------------------------------- the currency */

/**
 * What one max roll of a stat is worth **in that stat's own unit**.
 *
 * HP, ATK and DEF are counted as percentage points of the monster's own base, so
 * one max roll of HP is 8 % of the reference monster's HP rather than a number of
 * points. The other five are already points and a max roll is the roll itself.
 */
export function canonicalRollValue(stat: TargetStat, base: ReferenceStats): number {
  const types = targetStatSubProperties[stat];
  if (!scalesWithBase(stat)) return maximumRoll(types.flat ?? 0);
  return base[stat] * maximumRoll(types.percent ?? 0) / 100;
}

/**
 * What **one point** of `statId` is worth in max rolls of the stat it moves.
 *
 * A percent line divides by its own six-star maximum. A flat HP, ATK or DEF line
 * first becomes percentage points of the reference monster's base stat and then
 * divides by the percent line's maximum — which is what lets `HP +375` be priced
 * against `HP +8 %` by division rather than by a made-up universal weight.
 *
 * It is a **scale** rather than a conversion of one value on purpose. The
 * conversion is exactly linear, so the scale can be worked out once per effect id
 * and reused for every roll, every Grindstone bonus and every point of a
 * distribution's support — and there is still only one formula, because
 * `inMaxRolls` is that multiplication.
 */
export function maxRollScale(statId: number, base: ReferenceStats): number {
  const stat = subPropertyTargetStat[statId];
  if (!stat) return 0;
  const size = canonicalRollValue(stat, base);
  if (size <= 0) return 0;
  const perPoint = scalesWithBase(stat) && statId === targetStatSubProperties[stat].percent
    ? base[stat] / 100 : 1;
  return perPoint / size;
}

/** A value of `statId` expressed in max rolls of the stat it moves. */
export function inMaxRolls(statId: number, value: number, base: ReferenceStats): number {
  return value * maxRollScale(statId, base);
}

/** The reference line, as a cache key. Only these three stats scale a flat roll. */
export const baseKey = (base: ReferenceStats): string => `${base.hp}/${base.atk}/${base.def}`;

/**
 * Max-roll equivalents, each stat multiplied by what this role is paying for it.
 *
 * The eleven factors are worked out once here rather than on every line of every
 * rune. Pricing a line is the innermost operation the whole calculation has — every
 * point of every roll distribution passes through it — and re-deriving the currency
 * conversion there made it 10 % of a real account's run time on its own.
 */
export function weightedValuation(base: ReferenceStats, weights: SubstatWeights): Valuation {
  const cached = valuations.get(weights);
  if (cached) return cached;
  const factors = new Map<number, number>();
  for (const statId of allStatIds) {
    const weight = weights.weights.get(subPropertyTargetStat[statId]) ?? 0;
    if (weight > 0) factors.set(statId, maxRollScale(statId, base) * weight);
  }
  const valuation: Valuation = {
    key: `weighted:${baseKey(base)}:${weights.key}`,
    value: (statId, raw) => raw * (factors.get(statId) ?? 0),
  };
  valuations.set(weights, valuation);
  return valuation;
}

/* One valuation per weight set. The weights already carry the reference line in
   their own key, so the weight object identifies the valuation completely, and a
   `WeakMap` on it needs no invalidation rule of its own. */
const valuations = new WeakMap<SubstatWeights, Valuation>();

/* ---------------------------------------------------- what the build brings */

/**
 * What one main property contributes to one stat in the finished build.
 *
 * Main properties are deterministic and the build they describe is a six-star one,
 * so this is the ordinary six-star `+15` value — a fact about the role, never about
 * the candidate rune, whose own star class is priced separately.
 */
function mainContribution(mainStatId: number, stat: TargetStat, base: ReferenceStats): number {
  if (mainStatId === 0 || subPropertyTargetStat[mainStatId] !== stat) return 0;
  const value = mainPropertyMaximum(6, mainStatId);
  return mainStatId === targetStatSubProperties[stat].percent ? base[stat] * value / 100 : value;
}

/**
 * **No completed set is credited here, and that is a decision rather than an
 * omission.**
 *
 * It was credited once: a rune was judged for the build it would join, that build
 * completes the rune's own set, and a Fatal rune therefore met 283 of Fast DD's
 * missing 514 ATK before its sub properties were read at all. Every word of that is
 * true about the build. It is the wrong thing to put in this function, because the
 * weights it produces are the yardstick a rune is measured against — so crediting
 * the candidate's own set gave each set its own yardstick, and a recommendation is a
 * comparison *across* sets.
 *
 * Measured on 1,500 identical rune bodies relabelled set by set, against presets that
 * preferred every set equally, the same runes were retained **431 to 520 times**
 * depending on nothing but the label: Swift +11 %, Fatal +1.5 %, Rage −8 %, Focus
 * −7 %. No choice of denominator fixes it, because changing the *shape* of the weight
 * vector moves a rune's ratio by an amount that depends on what that rune happens to
 * have rolled. Equal treatment across sets requires that the weights not depend on
 * the candidate's set at all.
 *
 * A set still decides plenty: the preset's preferred/acceptable/broken ranking, the
 * four-piece switch and the Intangible slider are all set facts, and all three are
 * things the user has said out loud rather than arithmetic inferring them.
 *
 * **The way back**, if the requirement should count set bonuses again: a preset would
 * have to state the set *combination* its builds use — `RUNE-CANONICAL.md` §10.1
 * already has that vocabulary, and `app/lib/rune-set-pairs.ts` already holds it for
 * monsters. A combination stated by the preset is the same for every candidate, so it
 * can shape the requirement without tilting the comparison. A combination guessed
 * from the one rune being judged cannot.
 */

/**
 * What the monster's two artifacts contribute to one stat.
 *
 * A monster wears two artifacts and each carries one flat main property, measured at
 * HP +1,500, ATK +100 or DEF +100 (`artifact-properties.ts`). A preset states which of
 * the three its role wants, and nothing narrower — so the two slots are spread evenly
 * over what it named: **two of one where a role wants one stat, one of each where it
 * wants two, two thirds of each where it wants all three.** The total is always two
 * artifacts' worth, which is the only thing the preset has actually promised.
 *
 * Like the main properties above and unlike a rune set, this is a fact about the role
 * rather than about the candidate, so it shapes the requirement without giving any
 * rune a yardstick of its own (§4.3).
 */
function artifactContribution(stat: TargetStat, artifacts: PresetArtifacts): number {
  const wanted = (['hp', 'atk', 'def'] as const).filter((key) => artifacts[key]);
  if (wanted.length === 0 || !wanted.includes(stat as 'hp' | 'atk' | 'def')) return 0;
  const property = { hp: 'HP', atk: 'ATK', def: 'DEF' } as const;
  return artifactMainValue[property[stat as 'hp' | 'atk' | 'def']] * artifactsPerMonster / wanted.length;
}

/** Which of a stat's effect ids a slot may carry, given the main property it holds. */
function legalIdsFor(slot: number, mainStatId: number, stat: TargetStat): number[] {
  const types = targetStatSubProperties[stat];
  return [types.percent, types.flat].filter((statId): statId is number =>
    statId !== undefined && statId !== mainStatId && slotAllowsSubStat(slot, statId));
}

/* ------------------------------------------------- what an ordinary rune gives */

/**
 * What one ordinary six-star rune in this slot supplies of one stat by `+12`, in
 * max rolls, on average.
 *
 * The baseline rune is deliberately plain: four sub-property lines drawn uniformly
 * without replacement from the effect ids the slot allows, one initial roll each,
 * and four upgrades distributed uniformly over the four. That is the same event
 * model `rune-cleanup-model.ts` applies to a real rune's remaining events, so the
 * yardstick and the chance are two readings of one mechanic.
 *
 * Each of the `n` legal ids therefore lands on `4/n` of runes, a line that exists
 * collects its own initial roll plus one upgrade on average, and a roll averages the
 * midpoint of its interval. The flat/percent asymmetry survives all of it: a flat
 * ATK line is counted at what it is actually worth against this monster's base,
 * which is about a third of a percent line, so a slot whose main property is ATK %
 * is correctly read as supplying very little ATK rather than none.
 *
 * **The innate property is left out.** Roughly half of runes have one and a role
 * cannot plan around it. It is counted in full in a rune's own score; leaving it out
 * of the yardstick raises every requirement's ratio by about the same factor, which
 * the normalisation then removes.
 */
function ordinarySupply(slot: number, mainStatId: number, stat: TargetStat, base: ReferenceStats): number {
  const legal = allStatIds.filter((statId) => statId !== mainStatId && slotAllowsSubStat(slot, statId));
  if (legal.length < 4) return 0;
  let supply = 0;
  for (const statId of legalIdsFor(slot, mainStatId, stat)) {
    const range = subPropertyRange(6, statId, 'upgrade');
    if (!range) continue;
    supply += 4 / legal.length * 2 * inMaxRolls(statId, (range.minimum + range.maximum) / 2, base);
  }
  return supply;
}

/* ---------------------------------------------------------------- the weights */

/** One target, from what the role asks for to what a max roll of it is worth. */
export type SubstatWeightRow = {
  stat: TargetStat;
  /** The whole-build figure the preset states. */
  target: number;
  /** What the reference monster, the build's main properties and its artifacts bring. */
  fromBase: number;
  fromMains: number;
  fromArtifacts: number;
  /** What is left for the sub properties to find, in the stat's own unit. */
  needed: number;
  /** What one max roll of this stat is worth in that same unit. */
  rollValue: number;
  /** The whole build's requirement, in max rolls. */
  rollsNeeded: number;
  /** How many of the six slots can legally carry the stat at all. */
  carriers: number;
  /** The share one carrying rune has to find, in max rolls. */
  perRune: number;
  /** What one carrying rune supplies of it anyway, in max rolls. */
  ordinaryPerRune: number;
  /** `perRune / ordinaryPerRune` — how far past ordinary the target reaches. */
  tightness: number;
  /** The multiplier a max roll of this stat is scored with, `0`–`1`. */
  weight: number;
};

export type SubstatWeights = {
  readonly key: string;
  readonly weights: ReadonlyMap<TargetStat, number>;
  readonly rows: readonly SubstatWeightRow[];
  /** True where no target needs anything from sub properties and every stat the
      role names is therefore scored alike. */
  readonly degenerate: boolean;
};

export type SubstatWeightInput = {
  targets: PresetTargets;
  mains: BuildMains;
  artifacts: PresetArtifacts;
  base: ReferenceStats;
};

/** Weights are shared by every rune judged against one build of one preset. */
export type SubstatWeightScope = { weights: Map<string, SubstatWeights> };

export const newSubstatWeightScope = (): SubstatWeightScope => ({ weights: new Map() });

/**
 * The multiplier every max roll of every stat is scored with, for one role and one
 * build.
 *
 * It depends on the whole six-slot build rather than on any one slot, because the
 * build's main properties are what decide how much of a target is left for sub
 * properties to find. Two builds of the same preset therefore price the same rune
 * differently, and the rune keeps its best. The preset's artifact choice comes off the
 * requirement for the same reason and in the same way.
 *
 * **It depends on nothing about the candidate**, which is what makes one rune's Max
 * value comparable with another's. See the note above `legalIdsFor` for the one
 * thing that used to be in here and is not.
 */
export function substatWeights(
  input: SubstatWeightInput, scope: SubstatWeightScope = newSubstatWeightScope(),
): SubstatWeights {
  const key = `${slots.map((slot) => input.mains[slot] ?? 0).join('.')}`
    + `|${input.artifacts.hp ? 'h' : ''}${input.artifacts.atk ? 'a' : ''}${input.artifacts.def ? 'd' : ''}`
    + `|${targetsKey(input.targets)}|${baseKey(input.base)}`;
  const cached = scope.weights.get(key);
  if (cached) return cached;

  const rows: SubstatWeightRow[] = [];
  for (const stat of targetStats) {
    const target = input.targets[stat] ?? 0;
    if (target <= 0) continue;
    const fromBase = input.base[stat];
    let fromMains = 0;
    for (const slot of slots) fromMains += mainContribution(input.mains[slot] ?? 0, stat, input.base);
    const fromArtifacts = artifactContribution(stat, input.artifacts);
    const needed = Math.max(0, target - fromBase - fromMains - fromArtifacts);
    const rollValue = canonicalRollValue(stat, input.base);
    const rollsNeeded = rollValue > 0 ? needed / rollValue : 0;

    let carriers = 0;
    let supply = 0;
    for (const slot of slots) {
      if (legalIdsFor(slot, input.mains[slot] ?? 0, stat).length === 0) continue;
      carriers += 1;
      supply += ordinarySupply(slot, input.mains[slot] ?? 0, stat, input.base);
    }
    const perRune = carriers > 0 ? rollsNeeded / carriers : 0;
    const ordinaryPerRune = carriers > 0 ? supply / carriers : 0;
    /* A stat no slot can carry has no ratio to state and no line to score. */
    const tightness = ordinaryPerRune > 0 ? perRune / ordinaryPerRune : 0;
    rows.push({
      stat, target, fromBase, fromMains, fromArtifacts, needed, rollValue, rollsNeeded,
      carriers, perRune, ordinaryPerRune, tightness, weight: 0,
    });
  }

  const tightest = rows.reduce((most, row) => Math.max(most, row.tightness), 0);
  /* Every target already met without a single sub property. The role still wants
     those stats — a rune that brings them frees a different rune from having to —
     so they are scored alike rather than all scored at nothing, which would leave
     the preset unable to judge any rune at all. */
  const degenerate = tightest <= 0;
  const weights = new Map<TargetStat, number>();
  for (const row of rows) {
    row.weight = degenerate ? 1 : row.tightness / tightest;
    if (row.weight > 0) weights.set(row.stat, row.weight);
  }

  const result: SubstatWeights = { key, weights, rows, degenerate };
  scope.weights.set(key, result);
  return result;
}

/* A preset's targets are re-read for every rune, every build and every set, and the
   answer is a pure function of an object the editor replaces rather than mutates. */
const targetKeys = new WeakMap<PresetTargets, string>();

function targetsKey(targets: PresetTargets): string {
  const cached = targetKeys.get(targets);
  if (cached !== undefined) return cached;
  const key = targetStats.map((stat) => targets[stat] ?? 0).join(',');
  targetKeys.set(targets, key);
  return key;
}
