/**
 * The small population behind Rune Set-up's Statistics box.
 *
 * This is not a second model and it is not a claim about the player's drop
 * history. It reuses the fixed ordinary-sample generator the Clean-up floor uses
 * for slot balance, asks the real advice engine about the same bodies at +0 and
 * +12, and reports the two verdict shares. Keeping the population fixed makes a
 * slider change comparable with the previous one; using the advice engine keeps
 * the box from drifting away from the table.
 */
import { ordinarySample } from './rune-cleanup-model';
import type { ChanceCounter } from './rune-cleanup-advice';
import { runeAdvice } from './rune-cleanup-advice';
import type { RunePotentialPreset } from './rune-potential-presets';
import type { ReferenceStats } from './rune-reference-stats';
import type { RunePotentialSettings } from './types';

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
};

function syntheticCheckpoint(level: 0 | 12): ReturnType<typeof ordinarySample> {
  return runeStatisticsSlots.flatMap((slot) =>
    ordinarySample(slot, runeStatisticsStars, runeStatisticsRunesPerSlot, level));
}

export async function calculateRuneCleanupStatistics(
  presets: readonly RunePotentialPreset[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  count: ChanceCounter,
): Promise<RuneCleanupStatistics> {
  const startedAt = performance.now();
  const atZero = syntheticCheckpoint(0);
  const atTwelve = syntheticCheckpoint(12);
  const advice = await runeAdvice([...atZero, ...atTwelve], presets, settings, base, count);
  const rolled = atZero.filter((rune) => advice.get(rune.id)?.verdict === 'power-up').length;
  const kept = atTwelve.filter((rune) => advice.get(rune.id)?.verdict === 'keep').length;

  return {
    percentToRoll: rolled / atZero.length * 100,
    percentToKeep: kept / atTwelve.length * 100,
    sampleSize: atZero.length,
    durationMs: performance.now() - startedAt,
  };
}
