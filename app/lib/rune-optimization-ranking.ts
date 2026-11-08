import { percentStatCap, usefulAccuracyCap } from './combat-stat-limits';
import { criticalRateCapPercent } from './rune-potential-metrics';

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
