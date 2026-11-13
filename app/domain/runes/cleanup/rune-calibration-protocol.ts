/** What crosses the thread boundary for one piece of the slot calibration. */
import type { CalibrationPiece } from './rune-cleanup-advice';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RuneRole } from '../../profiles/rune-roles';

export type RuneCalibrationWorkerRequest = {
  pieceId: number;
  roles: readonly RuneRole[];
  base: ReadonlyMap<string, ReferenceStats>;
  stars: number;
  piece: CalibrationPiece;
};

export type RuneCalibrationWorkerResponse =
  /** `samples` is how many sample runes were judged since the last message. */
  | { type: 'progress'; pieceId: number; samples: number }
  | { type: 'result'; pieceId: number; samples: number; scores: Float64Array }
  | { type: 'error'; pieceId: number };

/**
 * A star class's calibration population, counted, in `calibrationPieces` order.
 * It rides along with an advice request so the advice worker adopts it rather than
 * counting it again.
 */
export type CalibrationPopulation = { stars: number; pieces: Float64Array[] };
