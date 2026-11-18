/** A fixed set of synthetic rune births, judged at +0, +9 and +12. */
import { ordinarySamplePaths } from './rune-cleanup-model';
import type { QualityReferences } from './rune-quality-reference';
import type { ChanceCounter } from './rune-cleanup-advice';
import { runeAdvice, withRuneSellProtection } from './rune-cleanup-advice';
import type { RuneAdvice } from './rune-cleanup-advice';
import type { Rune } from '../runes';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RunePotentialSettings } from '../../model';

export const runeStatisticsRunesPerSlot = 50;
export const runeStatisticsStars = 6;
export const runeStatisticsSlots = [1, 2, 3, 4, 5, 6] as const;

export type RuneCleanupStatistics = {
  percentToRoll: number;
  percentToKeep: number;
  sampleSize: number;
  durationMs: number;
  checkpoints: readonly (readonly { rune: Rune; advice: RuneAdvice }[])[];
};

/** Safeguards change the funnel's counts, but not its calculated scores or odds.
 * Keeping checkpoint answers lets those counts follow a toggle without a worker. */
export function withRuneStatisticsProtection(statistics: RuneCleanupStatistics, settings: RunePotentialSettings): RuneCleanupStatistics {
  const [zero = [], nine = [], twelve = []] = statistics.checkpoints;
  const verdict = (sample: { rune: Rune; advice: RuneAdvice } | undefined) => sample
    ? withRuneSellProtection(sample.rune, sample.advice, settings).verdict : undefined;
  let rolled = 0;
  let kept = 0;
  for (let index = 0; index < zero.length; index += 1) {
    if (verdict(zero[index]) !== 'power-up') continue;
    rolled += 1;
    /* A re-app or refine target at +12 stays in the box, so it is kept. */
    const end = verdict(twelve[index]);
    if (verdict(nine[index]) === 'power-up' && (end === 'keep' || end === 'reapp' || end === 'refine')) kept += 1;
  }
  return { ...statistics,
    percentToRoll: zero.length ? rolled / zero.length * 100 : 0,
    percentToKeep: zero.length ? kept / zero.length * 100 : 0,
  };
}

export function runeStatisticsSamples(): Rune[][] {
  const paths = runeStatisticsSlots.flatMap((slot) =>
    ordinarySamplePaths(slot, runeStatisticsStars, runeStatisticsRunesPerSlot, 'drop'));
  return [0, 3, 4].map((index) => paths.map((path) => path.checkpoints[index].rune));
}

export async function calculateRuneCleanupStatistics(
  roles: readonly RuneRole[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  count: ChanceCounter,
  references?: QualityReferences, onGroupedCount?: () => void,
): Promise<RuneCleanupStatistics> {
  const startedAt = performance.now();
  const stages = runeStatisticsSamples();
  const advice = await runeAdvice(stages.flat(), roles, settings, base, count, { references, onGroupedCount });
  return summarizeRuneStatistics(stages, advice, settings, performance.now() - startedAt);
}

export function summarizeRuneStatistics(
  stages: readonly (readonly Rune[])[], advice: ReadonlyMap<string, RuneAdvice>,
  settings: RunePotentialSettings, durationMs: number,
): RuneCleanupStatistics {
  const checkpoints = stages.map((runes) => runes.map((rune) => {
    const answer = advice.get(rune.id);
    if (!answer) throw new Error(`Missing synthetic rune advice: ${rune.id}`);
    return { rune, advice: answer };
  }));
  return withRuneStatisticsProtection({
    percentToRoll: 0,
    percentToKeep: 0,
    sampleSize: stages[0]?.length ?? 0,
    durationMs,
    checkpoints,
  }, settings);
}
