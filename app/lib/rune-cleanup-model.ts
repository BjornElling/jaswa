/**
 * **The single source of truth for what a rune is worth and what it may become.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` owns the reasoning; this owns the arithmetic. Every
 * figure the Rune Clean-up page states — a rune's Max value, its chance of reaching
 * a threshold, which preset suits it — is computed here and nowhere else. A second
 * implementation would not merely duplicate work: it would drift, and the page
 * would then state two Max values for the same rune without either being obviously
 * wrong. The deliberate exception is `scripts/verify-rune-cleanup-calibration.mjs`,
 * which re-derives the chance by Monte Carlo from the game's own loop precisely so
 * that a disagreement is caught.
 *
 * ## One currency, two questions
 *
 * Everything is counted in **max rolls** — how many best-possible six-star
 * sub-property rolls a quantity is worth — and every max roll is then multiplied by
 * what the role is actually paying for that stat. `rune-substat-weights.ts` owns
 * that multiplier and explains it; without it a maximum Accuracy roll and a maximum
 * SPD roll price identically for a role that wants 25 of one and 215 of the other,
 * which is the one thing this model must not say.
 *
 * A rune's score is then a plain sum: every line it carries, the innate included,
 * priced and added. **Nothing is capped.** A rune that rolled past its share of a
 * target is worth more than one that stopped at it, because the surplus is what
 * frees a different rune in the finished build to carry something else.
 *
 * ## What is measured and what is assumed
 *
 * The value a roll takes is **uniform over its range**, which is verified against
 * 1,530 measured prefixes rather than assumed (`RUNE-CANONICAL.md` §4). Which of
 * the four lines a power-up improves, and which type a new line takes, are **not
 * established by any source** and are assumed uniform. Those two assumptions are
 * named here and in the weights module, at the two places they are used, so nothing
 * downstream can present them as game facts.
 */
import { runeSubValue, slotAllowsSubStat } from './runes';
import type { Rune, RuneSubProperty } from './runes';
import { runeSetPieceCount } from './rune-sets';
import {
  allStatIds, mainPropertyMaximum, maximumRoll, remainingEvents, subPropertyRange,
} from './rune-properties';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetChoice, RunePotentialPreset } from './rune-potential-presets';
import { runeMainStatIds } from './rune-potential-presets';
import {
  newSubstatWeightScope, substatWeights, targetStats, weightedValuation,
} from './rune-substat-weights';
import type { BuildMains, SubstatWeightScope, SubstatWeights } from './rune-substat-weights';
import {
  combinations, compositions, isExactKey, probabilityKey, rollDistribution, tailMass,
  tailView, targetKey,
} from './rune-roll-distributions';
import type { Distribution, Valuation } from './rune-roll-distributions';
import { craftRollValue, craftValueRange, isGrindableStat } from './rune-craft-items';
import type { CraftLineage, CraftRollAssumption } from './rune-craft-items';
import type { ItemGrade } from './types';

export { targetStats };

/** Whether a rune answers a preset's wish in full, partly, or not at all. */
export type MatchRank = 'preferred' | 'acceptable' | 'broken';

const rankOf = <T>(choice: PresetChoice<T>, value: T): MatchRank =>
  choice.preferred.includes(value) ? 'preferred'
    : choice.acceptable.includes(value) ? 'acceptable' : 'broken';

/** The worse of two ranks — a rune is only as good as its weakest half. */
export function worseRank(left: MatchRank, right: MatchRank): MatchRank {
  const order: readonly MatchRank[] = ['preferred', 'acceptable', 'broken'];
  return order[Math.max(order.indexOf(left), order.indexOf(right))];
}

/**
 * One combination of main stats across the three slots that carry a choice.
 *
 * A preset does not describe a build; it describes a family of them. Judging a rune
 * against the family as a whole would need a guess about which member the player
 * will actually assemble, and that guess is the thing the brief says cannot be
 * made. So every member is enumerated and each rune keeps its best result.
 *
 * **Every member now matters to every rune**, which it did not use to. A build's
 * main properties are subtracted from what the role still needs from sub
 * properties, so a build that puts HP % in slots 4 and 6 asks its runes for far
 * less HP than one that puts ATK % there — and the same slot-2 rune is worth
 * different amounts to the two.
 */
export type Build = {
  mains: Readonly<Record<2 | 4 | 6, number>>;
  ranks: Readonly<Record<2 | 4 | 6, MatchRank>>;
};

/** Every main-stat combination a preset allows, preferred and acceptable alike. */
export function presetBuilds(preset: RunePotentialPreset): Build[] {
  const options = ([2, 4, 6] as const).map((slot) => {
    const choice = preset.slots[`slot${slot}` as 'slot2' | 'slot4' | 'slot6'];
    const entries = [...choice.preferred.map((stat) => ({ stat, rank: 'preferred' as MatchRank })),
      ...choice.acceptable.filter((stat) => !choice.preferred.includes(stat))
        .map((stat) => ({ stat, rank: 'acceptable' as MatchRank }))];
    /* A slot the preset says nothing about accepts every main the slot allows, at
       the broken rank. Refusing to build any combination at all would make a preset
       with one unstated slot judge nothing, which is not what leaving it blank
       means. */
    return entries.length > 0 ? entries : [{ stat: null, rank: 'broken' as MatchRank }];
  });
  const builds: Build[] = [];
  for (const two of options[0]) for (const four of options[1]) for (const six of options[2]) {
    builds.push({
      mains: { 2: two.stat ? runeMainStatIds[two.stat] : 0, 4: four.stat ? runeMainStatIds[four.stat] : 0, 6: six.stat ? runeMainStatIds[six.stat] : 0 },
      ranks: { 2: two.rank, 4: four.rank, 6: six.rank },
    });
  }
  return builds;
}

/** The main property each slot carries in a build. Slots 1, 3 and 5 are fixed. */
function mainOfSlot(build: Build, slot: number): number {
  if (slot === 1) return 3;
  if (slot === 3) return 5;
  if (slot === 5) return 1;
  return build.mains[slot as 2 | 4 | 6];
}

/** All six slots' main properties, which is what a requirement is measured against. */
function buildMains(build: Build): BuildMains {
  return { 1: 3, 2: build.mains[2], 3: 5, 4: build.mains[4], 5: 1, 6: build.mains[6] };
}

export type RuneOutcome = {
  /** `0`–`1`: the best legal end state, against the best a rune in this slot could be. */
  maxValue: number;
  /** `0`–`1`: the chance the rune actually reaches the threshold by +12. */
  chance: number;
  /** How the rune's own set and main stat answer the preset. */
  rank: MatchRank;
};

/** The one optional Gem and one optional Grind the Clean-up policy assumes exist. */
export type CraftCredit = {
  gem: CraftRollAssumption | null;
  gemGrade: ItemGrade;
  grind: CraftRollAssumption | null;
  grindGrade: ItemGrade;
};

const creditKey = (credit: CraftCredit): string =>
  `${credit.gem ?? '-'}/${credit.gemGrade}/${credit.grind ?? '-'}/${credit.grindGrade}`;

/** What a credited Grindstone would put on this line, or `0` where none can. */
function grindCredit(statId: number, lineage: CraftLineage, credit: CraftCredit): number {
  if (credit.grind === null || !isGrindableStat(statId)) return 0;
  const range = craftValueRange('grindstone', lineage, statId, credit.grindGrade);
  return range ? craftRollValue(range, credit.grind) : 0;
}

/** What a credited Enchanted Gem would put on this line, or `null` where none can. */
function gemCredit(statId: number, lineage: CraftLineage, credit: CraftCredit): number | null {
  if (credit.gem === null) return null;
  const range = craftValueRange('gem', lineage, statId, credit.gemGrade);
  return range ? craftRollValue(range, credit.gem) : null;
}

/* ----------------------------------------------------------- the projection */

/**
 * The rune as it would stand once the credited craft items have been spent on it.
 *
 * `gemmedAt` is the line an Enchanted Gem is projected onto, and it is not merely
 * bookkeeping: a Gem is spent at `+12`, **after** every power-up, and it discards
 * the rolls that line collected on the way. So a reserved line contributes exactly
 * the Gem's own value however the remaining upgrades fall — and the upgrades that
 * land on it are simply lost, which is why the chance calculation still allocates
 * them there and then counts nothing for them.
 */
type LineUp = {
  lines: readonly RuneSubProperty[];
  /** The index a projected Gem replaces, or `null` when none is credited. */
  gemmedAt: number | null;
  /**
   * The effect id the reserved line carried **before** the Gem, which no line added
   * on the way to `+12` may duplicate either.
   *
   * The two ids are both barred and for different reasons. The Gem is spent at `+12`,
   * so until then the line still shows its original property and a new line may not
   * repeat it; afterwards the line shows the Gem's property, and nothing may repeat
   * that. Barring only the second would let a rune plan on drawing a line it could
   * never legally be given.
   */
  replacedStatId: number | null;
  /** The effect id that Gem puts there, which no later line may duplicate. */
  gemStatId: number | null;
  /** The lines' current value, the innate included, in this role's units. */
  have: number;
};

/** One line-up priced into the role's units, the innate included. */
function valueOfLineUp(lineUp: Omit<LineUp, 'have'>, rune: Rune, valuation: Valuation): number {
  let total = 0;
  for (const line of lineUp.lines) total += valuation.value(line.statId, runeSubValue(line));
  if (rune.prefixStatId !== null) total += valuation.value(rune.prefixStatId, rune.prefixValue);
  return total;
}

/** Every line the rune holds, with a credited Grindstone applied wherever it is legal. */
function groundLines(rune: Rune, lineage: CraftLineage, credit: CraftCredit): RuneSubProperty[] {
  return rune.subProperties.map((line) => {
    const credited = grindCredit(line.statId, lineage, credit);
    /* A Grindstone is credited as `max(existing, assumed)` rather than added to what
       is there: a rune already ground three quarters of the way is worth what an
       unground one is, because the grind can always be topped up. Adding them would
       pay the rune twice for the same line. */
    return credited > line.grind ? { ...line, grind: credited } : line;
  });
}

/**
 * The line-ups worth evaluating: the rune as it stands, and the rune with the
 * credited Gem projected onto each of the lines it holds.
 *
 * At `+12` this is exactly optimal — the end state is a sum of independent lines, so
 * the best arrangement is the best Gem on whichever line it can most afford to lose,
 * and every line is offered. Below `+12` it is a **stated projection** rather than a
 * search: the Gem goes on a line the rune already has. A line it has not gained yet
 * cannot be planned around, and the alternative — letting the Gem land on a line the
 * rune might never draw — would credit it for a rune it is not.
 */
function lineUpOptions(rune: Rune, valuation: Valuation, credit: CraftCredit): Array<Omit<LineUp, 'have'>> {
  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  const lines = groundLines(rune, lineage, credit);
  const options: Array<Omit<LineUp, 'have'>> = [{ lines, gemmedAt: null, gemStatId: null, replacedStatId: null }];
  if (credit.gem === null) return options;

  /* A rune may carry one Gem-converted line at a time, and a later Gem may only
     replace that same line (`RUNE-CANONICAL.md` §8). */
  const converted = lines.findIndex((line) => line.gemmed);
  const replaceable = converted === -1 ? lines.map((_, at) => at) : [converted];
  for (const at of replaceable) {
    const others = new Set(lines.filter((_, index) => index !== at).map((line) => line.statId));
    let bestStatId: number | null = null;
    let bestLine: RuneSubProperty | null = null;
    let bestValue = -Infinity;
    for (const statId of allStatIds) {
      if (others.has(statId) || statId === rune.mainStatId || statId === rune.prefixStatId
        || !slotAllowsSubStat(rune.slot, statId)) continue;
      const rolled = gemCredit(statId, lineage, credit);
      if (rolled === null) continue;
      /* Com2uS preserves a Grind only when the Gem keeps the same property; a fresh
         one may then be spent on whatever the new property is. */
      const kept = statId === lines[at].statId ? lines[at].grind : 0;
      const grind = Math.max(kept, grindCredit(statId, lineage, credit));
      const value = valuation.value(statId, rolled + grind);
      if (value > bestValue) {
        bestValue = value;
        bestStatId = statId;
        bestLine = { statId, value: rolled, gemmed: true, grind };
      }
    }
    if (bestStatId === null || bestLine === null) continue;
    const gemmed = [...lines];
    gemmed[at] = bestLine;
    options.push({ lines: gemmed, gemmedAt: at, gemStatId: bestStatId, replacedStatId: lines[at].statId });
  }
  return options;
}

/* ------------------------------------------------------------- the ceiling */

/**
 * The best score any legal rune in this slot could reach — the denominator that
 * makes a perfect rune read 100 %.
 *
 * A perfect rune is a concrete arrangement, not a formula: **four sub properties at
 * their maximum, the most valuable of them carrying all four later upgrades as well,
 * an innate property at the maximum of the next most valuable effect id, and the
 * credited Gem and Grindstone spent where they help.** Nine rolls, five distinct
 * effect ids, and every one of the game's own duplication and slot rules respected.
 *
 * The five-roll line and the three one-roll lines are what a rune can actually do:
 * four lines each start with one roll, so the four upgrades can concentrate on one
 * line but the other three never fall below one. An earlier form of this wrote five
 * rolls on the best line and three on the second, which is nine rolls across two
 * lines and a rune the game cannot produce. It made no difference while every stat
 * priced alike; with weights it flatters the second-best stat by two whole rolls.
 *
 * The scale is the best **ordinary six-star** rune even when the candidate has fewer
 * stars or is Ancient. That is what keeps a perfect 4★ rune below a perfect 6★ one
 * on a single scale, and what stops an Ancient rune's higher initial interval from
 * moving the bar it is measured against.
 */
function slotCeiling(
  valuation: Valuation, slot: number, main: number, credit: CraftCredit, lineage: CraftLineage,
): number {
  const ids = allStatIds.filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
    .filter((statId) => valuation.value(statId, maximumRoll(statId)) > 0);
  if (ids.length === 0) return 0;

  const five = new Map<number, number>();
  const one = new Map<number, number>();
  const prefix = new Map<number, number>();
  const gem = new Map<number, number>();
  for (const statId of ids) {
    const grind = grindCredit(statId, lineage, credit);
    const roll = maximumRoll(statId);
    five.set(statId, valuation.value(statId, roll * 5 + grind));
    one.set(statId, valuation.value(statId, roll + grind));
    prefix.set(statId, valuation.value(statId, roll));
    const rolled = gemCredit(statId, lineage, credit);
    if (rolled !== null) gem.set(statId, valuation.value(statId, rolled + grind));
  }
  const byOneRoll = [...ids].sort((left, right) => (one.get(right) ?? 0) - (one.get(left) ?? 0));

  /** The best three (or two) plain lines and one innate, out of what is left. */
  const fillRest = (excluded: ReadonlySet<number>, lineCount: number): number => {
    let best = 0;
    for (const innate of [null, ...ids]) {
      if (innate !== null && excluded.has(innate)) continue;
      let total = innate === null ? 0 : prefix.get(innate) ?? 0;
      let taken = 0;
      for (const statId of byOneRoll) {
        if (taken === lineCount) break;
        if (excluded.has(statId) || statId === innate) continue;
        total += one.get(statId) ?? 0;
        taken += 1;
      }
      best = Math.max(best, total);
    }
    return best;
  };

  let best = 0;
  for (const sink of ids) {
    /* Gemming the five-roll line would trade four upgrades for one Gem roll, which
       no legal Gem can repay; the arrangement is dominated by spending the Gem on
       any other line, and every other line is offered below. */
    for (const gemmed of [null, ...ids]) {
      if (gemmed === sink) continue;
      if (gemmed !== null && !gem.has(gemmed)) continue;
      const excluded = new Set<number>([sink]);
      if (gemmed !== null) excluded.add(gemmed);
      const total = (five.get(sink) ?? 0) + (gemmed === null ? 0 : gem.get(gemmed) ?? 0)
        + fillRest(excluded, gemmed === null ? 3 : 2);
      best = Math.max(best, total);
    }
  }
  return best;
}

/* ------------------------------------------------------------ the candidate */

/**
 * Everything one rune against one build of one preset settles before a threshold
 * is named.
 *
 * The page asks two questions of the same pair, and they arrive separately: what
 * is this rune's ceiling, and — for the few candidates still standing after the
 * value gate — what are its odds of reaching the bar. Both rest on the same
 * weights, the same craft projection and the same event count, and answering them
 * through one function meant computing all of that twice for one extra number.
 */
export type RuneCandidate = {
  readonly rune: Rune;
  readonly valuation: Valuation;
  readonly weights: SubstatWeights;
  readonly lineUp: LineUp;
  readonly ceiling: number;
  readonly best: number;
  readonly mainScale: number;
  readonly adds: number;
  readonly rolls: number;
  readonly credit: CraftCredit;
  readonly lineage: CraftLineage;
  readonly rank: MatchRank;
  readonly scope: RuneAdviceScope;
};

/**
 * The scratchpad for one whole calculation.
 *
 * The weights and the ceilings do not depend on the rune — only on the preset, the
 * build, the slot, the rune's set and the reference line — so they are memoised
 * here rather than in a module-global cache. The lifetime is what makes them safe:
 * presets are user-editable and the reference lines depend on the imported account,
 * so there is no stable key that outlives a call and no invalidation rule worth
 * inventing for one.
 *
 * A caller that passes no scope gets a fresh one and therefore no sharing, which
 * is exactly right for a single `judgeAgainstBuild` from a test or the oracle.
 */
export type RuneAdviceScope = {
  weights: SubstatWeightScope;
  ceiling: Map<string, number>;
  /**
   * One distribution per distinct line, shared by every rune this call judges.
   *
   * It cannot be module-global any more, because a distribution is now built in the
   * role's weighted units and is meaningless to a preset that prices that stat
   * differently. It must not be per-`reachChance` either: the same terms recur across
   * hundreds of branches *and* across every rune with the same set judged against the
   * same build, and rebuilding them per call cost a real account fourteen times its
   * run time. The key carries the valuation, so a cache hit is a cache hit for the
   * same arithmetic.
   */
  distributions: Map<string, Distribution>;
};

export const newRuneAdviceScope = (): RuneAdviceScope => ({
  weights: newSubstatWeightScope(), ceiling: new Map(), distributions: new Map(),
});

/** The deterministic half: everything that does not depend on the threshold. */
export function prepareRuneCandidate(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats, credit: CraftCredit,
  scope: RuneAdviceScope = newRuneAdviceScope(),
): RuneCandidate | null {
  /* A rune whose main property is not the one this build asks for is not a rune
     this build can use at all — it is a different build's rune. */
  if (mainOfSlot(build, rune.slot) !== rune.mainStatId && build.mains[rune.slot as 2 | 4 | 6] !== 0) return null;

  const main = mainOfSlot(build, rune.slot);
  const weights = substatWeights({
    targets: preset.targets, mains: buildMains(build), setName: rune.setName, base,
  }, scope.weights);
  if (weights.weights.size === 0) return null;
  const valuation = weightedValuation(base, weights);

  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  const ceilingKey = `${valuation.key}|${main}|${creditKey(credit)}|${lineage}`;
  let ceiling = scope.ceiling.get(ceilingKey);
  if (ceiling === undefined) {
    ceiling = slotCeiling(valuation, rune.slot, main, credit, lineage);
    scope.ceiling.set(ceilingKey, ceiling);
  }
  if (ceiling <= 0) return null;

  const { adds, rolls } = remainingEvents(rune.level, rune.subProperties.length);

  /* Which craft projection is best is decided on the **end state**, not on what the
     rune shows today: below +12 a Gem freezes the line it lands on, and a line-up
     chosen on present value alone would happily freeze the line the remaining
     upgrades were going to land on. */
  let lineUp: LineUp | null = null;
  let best = -Infinity;
  for (const option of lineUpOptions(rune, valuation, credit)) {
    const candidate: LineUp = { ...option, have: valueOfLineUp(option, rune, valuation) };
    const reachable = bestReachableScore(rune, candidate, valuation, credit, lineage, adds, rolls);
    if (reachable > best) { best = reachable; lineUp = candidate; }
  }
  if (lineUp === null) return null;

  /* A main property is deterministic, but its final size depends on stars. It is
     part of a rune's potential, so a perfect 4★ rune cannot read as a perfect 6★
     rune merely because its sub properties were excellent. Ancient does not alter
     main properties. */
  const sixStarMain = mainPropertyMaximum(6, rune.mainStatId);
  const mainScale = sixStarMain > 0 ? mainPropertyMaximum(rune.stars, rune.mainStatId) / sixStarMain : 0;

  const setRank = rankOf(preset.sets, rune.setName);
  const mainRank: MatchRank = rune.slot === 2 || rune.slot === 4 || rune.slot === 6
    ? build.ranks[rune.slot as 2 | 4 | 6] : 'preferred';

  return {
    rune, valuation, weights, lineUp, ceiling, best, mainScale, adds, rolls, credit, lineage,
    rank: worseRank(setRank, mainRank), scope,
  };
}

/** The best legal end state, against the best a rune in this slot could be. */
export function candidateMaxValue(candidate: RuneCandidate): number {
  return Math.min(1, candidate.best / candidate.ceiling) * candidate.mainScale;
}

/**
 * The odds of reaching `threshold`, which is the Max value the rune has to reach.
 *
 * It is passed in rather than read from a setting because this module decides
 * nothing about policy — `rune-cleanup-advice.ts` does that.
 */
export function candidateChance(candidate: RuneCandidate, threshold: number): number {
  const wanted = candidate.mainScale > 0
    ? threshold * candidate.ceiling / candidate.mainScale : Number.POSITIVE_INFINITY;
  /* `best` is an upper bound over every legal remaining roll, so a threshold
     above it has an exact zero chance. Most account runes miss the quality floor;
     short-circuiting here prevents those certain losses from constructing their full
     addition-and-upgrade probability tree merely to discover that same zero. */
  if (!(candidate.best + 1e-12 >= wanted)) return 0;
  return reachChance(candidate, wanted);
}

/**
 * One rune against one build of one preset, both answers at once.
 *
 * `rune-cleanup-advice.ts` no longer takes this route — it prepares a candidate
 * and asks the two questions separately — but `verify-rune-cleanup-calibration.mjs`
 * calls it directly, and that script is the independent gate on everything in this
 * file. An oracle rewritten in the same commit as the model it checks has stopped
 * being independent, so this signature stays.
 */
export function judgeAgainstBuild(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats,
  threshold: number, credit: CraftCredit,
  /* The chance is the expensive half — it enumerates every way the remaining
     upgrades can fall — and most builds are rejected on their ceiling long before
     anyone needs it. So it is only worked out when the caller says it will be
     used, which is what makes checking every build affordable. */
  withChance = true,
): RuneOutcome | null {
  const candidate = prepareRuneCandidate(rune, preset, build, base, credit);
  if (!candidate) return null;
  return {
    maxValue: candidateMaxValue(candidate),
    chance: withChance ? candidateChance(candidate, threshold) : 0,
    rank: candidate.rank,
  };
}

/* ------------------------------------------------------- the reachable best */

/** Every effect id the projected rune occupies at any point, Gem and Gemmed alike. */
function heldStatIds(lineUp: LineUp): Set<number> {
  const held = new Set(lineUp.lines.map((line) => line.statId));
  if (lineUp.gemStatId !== null) held.add(lineUp.gemStatId);
  if (lineUp.replacedStatId !== null) held.add(lineUp.replacedStatId);
  return held;
}

/** The effect ids a future line may still take, best-valued first. */
function addableIds(rune: Rune, lineUp: LineUp, valuation: Valuation): number[] {
  const held = heldStatIds(lineUp);
  return allStatIds
    .filter((statId) => !held.has(statId) && statId !== rune.mainStatId
      && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId))
    .filter((statId) => valuation.value(statId, maximumRoll(statId, rune.stars)) > 0)
    .sort((left, right) => valuation.value(right, maximumRoll(right, rune.stars))
      - valuation.value(left, maximumRoll(left, rune.stars)));
}

/**
 * The best score this rune can still reach.
 *
 * **An improvement can only land on a line the rune already has.** That restriction
 * is the whole reason this is not a free greedy over every wanted stat: without it
 * the ceiling lets an upgrade invent a SPD line the rune does not own, while the
 * chance — correctly — will not, and the page ends up printing a 68 % ceiling beside
 * a 0 % chance. A rune with four useless lines and no additions left cannot improve,
 * however much the role wants something else.
 *
 * Additions come first and each takes a distinct legal effect id the rune does not
 * already hold (`RUNE-CANONICAL.md` §6); a line reserved for a Gem is excluded from
 * receiving upgrades, because the Gem discards them. A future line is credited with
 * the same Grindstone the settings credit every other line, since it will be an
 * ordinary line by the time the stone is spent.
 */
function bestReachableScore(
  rune: Rune, lineUp: LineUp, valuation: Valuation, credit: CraftCredit, lineage: CraftLineage,
  adds: number, rolls: number,
): number {
  const addable = addableIds(rune, lineUp, valuation);
  const upgradeValue = (statId: number) =>
    valuation.value(statId, subPropertyRange(rune.stars, statId, 'upgrade')?.maximum ?? 0);
  const openLines = lineUp.lines
    .map((line, at) => ({ statId: line.statId, at }))
    .filter((line) => line.at !== lineUp.gemmedAt)
    .map((line) => line.statId);

  let best = 0;
  for (const added of combinations(addable, Math.min(adds, addable.length))) {
    let total = lineUp.have;
    for (const statId of added) {
      const initial = subPropertyRange(rune.stars, statId, 'initial')?.maximum ?? 0;
      total += valuation.value(statId, initial + grindCredit(statId, lineage, credit));
    }
    let sink = 0;
    for (const statId of [...openLines, ...added]) sink = Math.max(sink, upgradeValue(statId));
    best = Math.max(best, total + rolls * sink);
  }
  /* A rune with no legal addition left still keeps whatever it already has. */
  return Math.max(best, lineUp.have);
}

/* ---------------------------------------------------------------- the odds */

/**
 * The chance the rune's realised score reaches `wanted` by +12.
 *
 * Additions come first, so later improvements choose among the completed set of
 * four lines. Each legal added set and each subsequent upgrade split is enumerated,
 * and a line's contributions are summed without a cap.
 *
 * **Two assumptions live here and in `rune-substat-weights.ts` and nowhere else.**
 * Which of the lines an improvement lands on, and which type a new line takes, are
 * uniform. Neither is established by any source (`RUNE-CANONICAL.md` §7); the
 * roll's *value* being uniform is measured, and is the third leg this stands on.
 * `verify:rune-cleanup-calibration` holds the whole thing to a Monte Carlo written
 * from the game's loop rather than from here.
 */
function reachChance(candidate: RuneCandidate, wanted: number): number {
  const { rune, lineUp, valuation, credit, lineage, adds, rolls } = candidate;
  const gap = wanted - lineUp.have;
  if (gap <= 0) return 1;
  if (adds + rolls === 0) return 0;
  /* Everything below this line is integer key space. A gap beyond the exact
     range of the key scale would silently start losing units, so it fails
     loudly instead — a slot ceiling is three orders of magnitude below it. */
  const gapKey = targetKey(gap);
  if (!isExactKey(gapKey)) {
    throw new Error(`Rune Clean-up: a gap of ${gap} score units exceeds the exact range of the probability key.`);
  }

  const held = heldStatIds(lineUp);
  const missing = allStatIds.filter((statId) => !held.has(statId)
    && statId !== rune.mainStatId && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId));

  const additionChoices = combinations(missing, adds);
  if (additionChoices.length === 0) return 0;
  const splits = compositions(rolls, lineUp.lines.length + adds);

  /* A branch is identified by the upgrade allocation and the unordered, legal set of
     new properties. Many enumerated branches are the same calculation under
     different labels: `combinations` enumerates every legal set of added effect ids
     including ones the role has no weight for, and `add` filters those out, so two
     branches with different added sets can reduce to one term list. The contribution
     is `weight × f(terms)` and `f` depends on nothing but the terms, so summing
     `w₁·f(t) + w₂·f(t)` as `(w₁ + w₂)·f(t)` is a factorisation and not a change of
     model — every branch is still enumerated and still carries its own weight.

     **The identity key is not the convolution order.** Terms are keyed on
     `statId:count:kind` — never on the target stat, because HP flat and HP percent
     are distinct effect ids with different legal ranges — and the order they are
     convolved in is chosen separately below, for cost. */
  type Term = { statId: number; count: number; kind: 'initial' | 'upgrade' };
  const branches = new Map<string, { terms: Term[]; certain: number; weight: number }>();
  for (const split of splits) for (const added of additionChoices) {
    const terms: Term[] = [];
    let certain = 0;
    const add = (statId: number, count: number, kind: 'initial' | 'upgrade') => {
      if (count === 0 || valuation.value(statId, maximumRoll(statId, rune.stars)) === 0) return;
      terms.push({ statId, count, kind });
    };
    for (let at = 0; at < lineUp.lines.length; at += 1) {
      /* The line a Gem is reserved for keeps absorbing upgrades — the game picks
         uniformly and knows nothing of the plan — and every one of them is discarded
         when the Gem is spent. So the split still allocates them here and nothing is
         counted for them. */
      if (at === lineUp.gemmedAt) continue;
      add(lineUp.lines[at].statId, split.counts[at] ?? 0, 'upgrade');
    }
    for (let at = 0; at < added.length; at += 1) {
      const statId = added[at];
      /* An added line has one initial roll, then may receive later upgrades, and is
         ground like any other line once it exists. */
      add(statId, 1, 'initial');
      add(statId, split.counts[lineUp.lines.length + at] ?? 0, 'upgrade');
      certain += valuation.value(statId, grindCredit(statId, lineage, credit));
    }
    terms.sort((left, right) => left.statId - right.statId || left.kind.localeCompare(right.kind));
    const certainKey = probabilityKey(certain);
    const key = `${terms.map((term) => `${term.statId}:${term.count}:${term.kind}`).join('|')}#${certainKey}`;
    const branchWeight = split.weight / additionChoices.length;
    const group = branches.get(key);
    if (group) group.weight += branchWeight;
    else branches.set(key, { terms, certain: certainKey, weight: branchWeight });
  }

  const distributions = candidate.scope.distributions;
  const distributionFor = (term: Term): Distribution => {
    const key = `${valuation.key}|${rune.stars}|${term.statId}/${term.count}/${term.kind}`;
    let found = distributions.get(key);
    if (!found) {
      found = rollDistribution(valuation, term.statId, term.count,
        subPropertyRange(rune.stars, term.statId, term.kind));
      distributions.set(key, found);
    }
    return found;
  };

  let chance = 0;
  for (const { terms, certain, weight } of branches.values()) {
    const branchGap = gapKey - certain;
    if (branchGap <= 0) { chance += weight; continue; }
    /* Keyed rather than summed in value space, so a bound is exactly the extreme
       the convolution can produce rather than a double that rounds differently
       from the keys it is bounding. Each term's own bounds are kept, because the
       floor below needs them term by term and not only in total.

       Narrowest first, so the widest term is the one answered by tail lookup and
       never convolved. Addition is commutative and the terms are independent, so
       the distribution of their sum does not depend on the order; only the size
       of the intermediates does, and it depends on it enormously. */
    const ordered = terms.map((term) => {
      const range = subPropertyRange(rune.stars, term.statId, term.kind);
      if (!range) return { term, minimum: 0, maximum: 0, width: 0 };
      return {
        term,
        minimum: probabilityKey(valuation.value(term.statId, range.minimum * term.count)),
        maximum: probabilityKey(valuation.value(term.statId, range.maximum * term.count)),
        width: term.count * (range.maximum - range.minimum),
      };
    }).sort((left, right) => left.width - right.width);
    if (ordered.length === 0) continue;

    /* A branch's roll ranges bound its gain before any distributions are built.
       In a real account most addition/upgrade splits cannot make the gap, and a
       few must make it. Those are exact 0 % and 100 % answers respectively, not
       approximations, so avoid allocating convolution maps for either case. */
    let minimumGain = 0;
    let maximumGain = 0;
    for (const bound of ordered) { minimumGain += bound.minimum; maximumGain += bound.maximum; }
    if (maximumGain < branchGap) continue;
    if (minimumGain >= branchGap) { chance += weight; continue; }

    /* How much a partial sum can still gain once term `at` has been convolved.
       It is the same bound the `maximumGain` prune above already trusts, read
       one term at a time, so a state below `branchGap - stillToCome[at]` is exactly
       as certain a zero as a branch the prune skips outright. */
    const stillToCome = new Array<number>(ordered.length).fill(0);
    for (let at = ordered.length - 2; at >= 0; at -= 1) {
      stillToCome[at] = stillToCome[at + 1] + ordered[at + 1].maximum;
    }
    /* The terms are walked rather than convolved into one another.
       `P(Σ ≥ g) = Σ_x P(x)·P(rest ≥ g − x)` is the same sum either way, but the
       convolution has to *materialise* each intermediate distribution in a map, and
       the last one before the tail lookup is the largest thing the whole calculation
       builds. Weighting the stats is what made that expensive: two different stats'
       rolls used to land on the same key often enough for the map to stay small, and
       once every stat carries its own multiplier they almost never do, so the map was
       paying to merge entries that no longer merge.

       Both bounds survive intact, and they now prune a whole subtree rather than one
       pair: a partial sum that cannot reach the gap even if every later term rolls its
       maximum is skipped, and one that has already reached it contributes its entire
       remaining mass at once. The widest term is still read rather than walked. */
    const last = ordered.length - 1;
    const views = ordered.map((entry) => tailView(distributionFor(entry.term)));
    const walk = (at: number, gain: number, probability: number) => {
      if (at === last) {
        chance += weight * probability * tailMass(views[last], branchGap - gain);
        return;
      }
      const { values, probabilities, atOrAbove } = views[at];
      /* Below this the branch is a certain zero; at or above `reached` it is a
         certain one, whatever the terms after it do. */
      const hopeless = branchGap - stillToCome[at] - gain;
      const reached = branchGap - gain;
      let from = 0;
      while (from < values.length && values[from] < hopeless) from += 1;
      let until = from;
      while (until < values.length && values[until] < reached) until += 1;
      for (let index = from; index < until; index += 1) {
        walk(at + 1, gain + values[index], probability * probabilities[index]);
      }
      if (until < values.length) chance += weight * probability * atOrAbove[until];
    };
    walk(0, 0, 1);
  }
  return Math.min(1, Math.max(0, chance));
}

/** Whether a set takes four runes, which the "keep twice as many" setting reads. */
export const isFourPieceSet = (setName: string): boolean => runeSetPieceCount[setName] === 4;
