/**
 * The small population behind Rune Settings's Statistics box.
 *
 * This is not a second model and it is not a claim about the player's drop
 * history. It reuses the fixed ordinary-sample generator the Clean-up floor uses
 * for slot balance, asks the real advice engine about the same bodies at +0, +9
 * and +12, and reports the two funnel shares. Keeping the population fixed makes
 * a slider change comparable with the previous one; using the advice engine keeps
 * the box from drifting away from the table.
 */
import { ordinarySample } from './rune-cleanup-model';
import type { ChanceCounter } from './rune-cleanup-advice';
import { runeAdvice, withRuneSellProtection } from './rune-cleanup-advice';
import type { RuneAdvice } from './rune-cleanup-advice';
import type { Rune } from '../runes';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RunePotentialSettings } from '../../model';

/** Fifty runes per slot keeps the live estimate responsive while preserving the
 * same fixed, balanced population shape as the calibration sample. The calibration
 * population is larger because it is not recalculated on every slider movement. */
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

function syntheticCheckpoint(level: 0 | 9 | 12): ReturnType<typeof ordinarySample> {
  return runeStatisticsSlots.flatMap((slot) =>
    ordinarySample(slot, runeStatisticsStars, runeStatisticsRunesPerSlot, level, 'drop'));
}

export async function calculateRuneCleanupStatistics(
  roles: readonly RuneRole[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  count: ChanceCounter,
): Promise<RuneCleanupStatistics> {
  const startedAt = performance.now();
  const atZero = syntheticCheckpoint(0);
  const atNine = syntheticCheckpoint(9);
  const atTwelve = syntheticCheckpoint(12);
  const advice = await runeAdvice([...atZero, ...atNine, ...atTwelve], roles, settings, base, count);
  const checkpoints = [atZero, atNine, atTwelve].map((runes) => runes.map((rune) => {
    const answer = advice.get(rune.id);
    if (!answer) throw new Error(`Missing synthetic rune advice: ${rune.id}`);
    return { rune, advice: answer };
  }));
  return withRuneStatisticsProtection({
    percentToRoll: 0,
    percentToKeep: 0,
    sampleSize: atZero.length,
    durationMs: performance.now() - startedAt,
    checkpoints,
  }, settings);
}
