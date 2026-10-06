/**
 * The small population behind Rune Set-up's Statistics box.
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

function syntheticCheckpoint(level: 0 | 9 | 12): ReturnType<typeof ordinarySample> {
  return runeStatisticsSlots.flatMap((slot) =>
    ordinarySample(slot, runeStatisticsStars, runeStatisticsRunesPerSlot, level, 'drop'));
}

export async function calculateRuneCleanupStatistics(
  presets: readonly RunePotentialPreset[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  count: ChanceCounter,
): Promise<RuneCleanupStatistics> {
  const startedAt = performance.now();
  const atZero = syntheticCheckpoint(0);
  const atNine = syntheticCheckpoint(9);
  const atTwelve = syntheticCheckpoint(12);
  const advice = await runeAdvice([...atZero, ...atNine, ...atTwelve], presets, settings, base, count);
  const rolled = atZero.filter((rune) => advice.get(rune.id)?.verdict === 'power-up').length;
  let kept = 0;
  for (let index = 0; index < atZero.length; index += 1) {
    /* The statistics box follows the simulator's three recommendation gates:
       only a rune rolled at +0 can reach +9, only one rolled again at +9 can
       reach +12, and only a +12 Keep enters the final count. */
    if (advice.get(atZero[index]?.id ?? '')?.verdict !== 'power-up') continue;
    if (advice.get(atNine[index]?.id ?? '')?.verdict !== 'power-up') continue;
    if (advice.get(atTwelve[index]?.id ?? '')?.verdict === 'keep') kept += 1;
  }

  return {
    percentToRoll: rolled / atZero.length * 100,
    percentToKeep: kept / atZero.length * 100,
    sampleSize: atZero.length,
    durationMs: performance.now() - startedAt,
  };
}
