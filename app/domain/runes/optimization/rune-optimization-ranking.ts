import { percentStatCap, usefulAccuracyCap } from '../../combat/combat-stat-limits';
import { criticalRateCapPercent } from '../rune-potential-metrics';

/** Raw figures remain visible and range-checked; only useful gain earns rank. */
export function rankingValue(value: number, rank: number): number {
  return Math.min(value, rankingCap(rank));
}

export function rankingCap(rank: number): number {
  switch (rank) {
    case 4: return criticalRateCapPercent;
    case 6: return percentStatCap;
    case 7: return usefulAccuracyCap;
    default: return Infinity;
  }
}

/** The same relative shortfall guides the search and orders requested tie-breaks. */
export function targetPressure(target: number, beforeRunes: number, reference: number): number {
  return Math.max(0, target - beforeRunes) / Math.max(1, reference);
}

export function requestedTieBreakers(
  rank: number, targets: ArrayLike<number>, beforeRunes: ArrayLike<number>, reference: ArrayLike<number>,
): number[] {
  return Array.from({ length: targets.length }, (_, at) => at)
    .filter((at) => at !== rank && Number.isFinite(targets[at]))
    .sort((a, b) => targetPressure(targets[b], beforeRunes[b], reference[b])
      - targetPressure(targets[a], beforeRunes[a], reference[a]) || a - b);
}

/** Shared by the search and the live table after its figures are re-read. */
export function compareRankedFigures(
  left: ArrayLike<number>, right: ArrayLike<number>, rank: number, tieBreakers: readonly number[],
): number {
  const primary = rankingValue(right[rank], rank) - rankingValue(left[rank], rank);
  if (primary !== 0) return primary;
  for (const at of tieBreakers) {
    const difference = rankingValue(right[at], at) - rankingValue(left[at], at);
    if (difference !== 0) return difference;
  }
  return 0;
}
