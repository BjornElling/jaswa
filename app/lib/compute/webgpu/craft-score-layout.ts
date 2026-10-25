/** Shared by packing, the processor reference and WGSL. Scores are percentage points. */
import { statIdBound } from '../../rune-craft-end-state';
export const craftScoreLayout = {
  stats: statIdBound, values: 0, prices: statIdBound, cap: statIdBound * 2,
  discount: statIdBound * 2 + 1, stride: statIdBound * 2 + 2, workgroup: 64,
} as const;
export const craftScoreTolerance = 0.001;
/** A generous relative allowance also covers an unusually large Ancient score. */
export const craftScoreUncertainty = (score: number): number => craftScoreTolerance + Math.abs(score) * 2 ** -16;
