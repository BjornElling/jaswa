/** Shared by packing, the processor reference and WGSL. Scores are percentage points, uncapped. */
import { statIdBound } from '../../rune-craft-end-state';
export const craftScoreLayout = {
  stats: statIdBound, values: 0, prices: statIdBound,
  discount: statIdBound * 2, stride: statIdBound * 2 + 1, workgroup: 64,
} as const;
export const craftScoreTolerance = 0.001;
/** A relative allowance as well, because a score has no upper bound. */
export const craftScoreUncertainty = (score: number): number => craftScoreTolerance + Math.abs(score) * 2 ** -16;
