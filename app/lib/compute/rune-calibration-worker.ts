/// <reference lib="webworker" />

/**
 * One piece of Rune Clean-up's slot calibration, off the main thread.
 *
 * Like the advice worker it has no arithmetic of its own: it calls
 * `countCalibrationPiece`, the function the in-process calibration counts with, and
 * sends the packed answer back. Several of these run side by side, one piece each,
 * which is the whole reason it exists (`rune-calibration-client.ts`).
 */
import { countCalibrationPiece } from '../rune-cleanup-advice';
import type { RuneCalibrationWorkerRequest, RuneCalibrationWorkerResponse } from './rune-calibration-protocol';

/* A sample rune takes a few milliseconds; a message for each would only be noise. */
const progressEvery = 25;

self.onmessage = (event: MessageEvent<RuneCalibrationWorkerRequest>) => {
  const { pieceId, roles, base, stars, piece } = event.data;
  try {
    let pending = 0;
    const scores = countCalibrationPiece(roles, base, stars, piece, () => {
      pending += 1;
      if (pending < progressEvery) return;
      const progress: RuneCalibrationWorkerResponse = { type: 'progress', pieceId, samples: pending };
      self.postMessage(progress);
      pending = 0;
    });
    const result: RuneCalibrationWorkerResponse = { type: 'result', pieceId, samples: pending, scores };
    self.postMessage(result, [scores.buffer]);
  } catch {
    const failed: RuneCalibrationWorkerResponse = { type: 'error', pieceId };
    self.postMessage(failed);
  }
};
