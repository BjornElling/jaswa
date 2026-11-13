import {
  effectSlot, effectSlotCount, figuresInto, intangibleSetId,
  statSetBonuses, targetFigureCount, targetFigureKeys, totalCount, totalsInto,
} from '../../combat/monster-stats';
import type { RankFigure, RuneOptimizationProblem } from './rune-optimization-problem';

/** Dependencies, not a second stat sheet: every bound still reads monster-stats.
    A stat is the fight's, so the copy's own team sets reach it. */
const figureSlots: Readonly<Record<RankFigure, readonly number[]>> = {
  hp: [effectSlot.teamHpPercent, effectSlot.hpPercent, effectSlot.hpFlat],
  atk: [effectSlot.teamAtkPercent, effectSlot.atkPercent, effectSlot.atkFlat],
  def: [effectSlot.teamDefPercent, effectSlot.defPercent, effectSlot.defFlat],
  spd: [effectSlot.spdPercent, effectSlot.spdFlat],
  criRate: [effectSlot.criticalRate], criDmg: [effectSlot.criticalDamage],
  res: [effectSlot.teamResistance, effectSlot.resistance], acc: [effectSlot.teamAccuracy, effectSlot.accuracy],
  dmg: [effectSlot.teamAtkPercent, effectSlot.atkPercent, effectSlot.atkFlat, effectSlot.criticalRate, effectSlot.criticalDamage],
  ehp: [effectSlot.teamHpPercent, effectSlot.teamDefPercent, effectSlot.hpPercent, effectSlot.hpFlat, effectSlot.defPercent, effectSlot.defFlat],
  ehpD: [effectSlot.teamHpPercent, effectSlot.teamDefPercent, effectSlot.hpPercent, effectSlot.hpFlat, effectSlot.defPercent, effectSlot.defFlat],
};

export function figureEffectSlots(figure: RankFigure, alwaysCrits = false): readonly number[] {
  return alwaysCrits && figure === 'dmg'
    ? figureSlots.dmg.filter((slot) => slot !== effectSlot.criticalRate) : figureSlots[figure];
}

export function ceilingEffectSlots(ceilings: Float64Array): ReadonlySet<number> {
  return new Set(targetFigureKeys.flatMap((figure, at) => Number.isFinite(ceilings[at]) ? figureSlots[figure] : []));
}

/** A free pair cannot promise a four-set beside an already required four-set. */
export function availableStatSets(builds: RuneOptimizationProblem['builds']): typeof statSetBonuses {
  return statSetBonuses.filter(([setId, pieces]) => builds === null || builds.some((build) =>
    build.free >= pieces || build.needs.some((need) => need.setId === setId)));
}

type RangePool = Pick<RuneOptimizationProblem, 'base' | 'start' | 'slots' | 'builds'>;

/** Independent extrema deliberately permit incompatible choices; they can only be generous. */
export function rangeEnvelope(problem: RangePool) {
  const maxima = problem.slots.map((slot) => Float64Array.from({ length: effectSlotCount }, (_, stat) =>
    slot.reduce((best, candidate) => Math.max(best, candidate.effects[stat]), 0)));
  const minima = problem.slots.map((slot) => Float64Array.from({ length: effectSlotCount }, (_, stat) =>
    slot.reduce((best, candidate) => Math.min(best, candidate.effects[stat]), Infinity)));
  const highBonus = new Float64Array(effectSlotCount);
  const lowBonus = new Float64Array(effectSlotCount);
  const hasIntangible = problem.slots.some((slot) => slot.some((candidate) => candidate.setId === intangibleSetId));
  for (const [setId, pieces, stat, value] of availableStatSets(problem.builds)) {
    const possible = problem.slots.filter((slot) => slot.some((candidate) => candidate.setId === setId)).length;
    highBonus[stat] += Math.floor(Math.min(6, possible + Number(hasIntangible)) / pieces) * value;
    if (problem.builds !== null && problem.builds.length > 0) {
      const required = Math.min(...problem.builds.map((build) => build.needs.find((need) => need.setId === setId)?.pieces ?? 0));
      lowBonus[stat] += Math.floor(required / pieces) * value;
    }
  }
  return { maxima, minima, highBonus, lowBonus };
}

/** A saved limit stays saved; only a proof over the full admitted pool may stop reading it. */
export function bindingRangeLimits(problem: RangePool & Pick<RuneOptimizationProblem, 'targets' | 'ceilings'>) {
  const targets = new Float64Array(problem.targets);
  const ceilings = new Float64Array(problem.ceilings);
  if (problem.slots.some((slot) => slot.length === 0)) return { targets, ceilings };
  const { maxima, minima, highBonus, lowBonus } = rangeEnvelope(problem);
  const high = Float64Array.from(problem.start, (value, at) => value + highBonus[at]);
  const low = Float64Array.from(problem.start, (value, at) => value + lowBonus[at]);
  for (let at = 0; at < effectSlotCount; at += 1) for (let slot = 0; slot < 6; slot += 1) {
    high[at] += maxima[slot][at]; low[at] += minima[slot][at];
  }
  const totals = new Float64Array(totalCount);
  const figures = new Float64Array(targetFigureCount);
  totalsInto(problem.base, high, totals); figuresInto(totals, figures);
  for (let at = 0; at < ceilings.length; at += 1) if (figures[at] <= ceilings[at]) ceilings[at] = NaN;
  totalsInto(problem.base, low, totals); figuresInto(totals, figures);
  for (let at = 0; at < targets.length; at += 1) if (figures[at] >= targets[at]) targets[at] = NaN;
  return { targets, ceilings };
}
