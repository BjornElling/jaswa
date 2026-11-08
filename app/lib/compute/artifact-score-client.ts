import { cancellableWorker } from './cancellable-worker';
import type { ArtifactScoreRequest, ArtifactScoreResult } from './artifact-score-protocol';

const ask = cancellableWorker<ArtifactScoreResult>(
  () => new Worker(new URL('./artifact-score-worker.ts', import.meta.url), { type: 'module' }),
  'JASWA could not start its artifact calculation worker.',
);

/** The main thread gets one promise; all backend selection remains in the worker.
    An aborted `signal` rejects it with `CalculationCancelled`. */
export function calculateArtifactScores(
  request: ArtifactScoreRequest,
  preferWebGpu: boolean,
  signal?: AbortSignal,
): Promise<ArtifactScoreResult> {
  return ask({ type: 'calculate', request, preferWebGpu }, signal);
}
