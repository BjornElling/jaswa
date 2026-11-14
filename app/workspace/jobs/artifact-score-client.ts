import { workerFactories } from './worker-factories';
import { createJobRuntime } from './job-runtime';
import type { ArtifactScoreRequest, ArtifactScoreResult } from '../../domain/artifacts/score/artifact-score-protocol';

const job = createJobRuntime<Record<string, unknown>, ArtifactScoreResult>(
  () => workerFactories().artifactScore(),
  'JASWA could not start its artifact calculation worker.',
  { allowConcurrent: true },
);

/** The main thread gets one promise; all backend selection remains in the worker.
    An aborted `signal` rejects it with `CalculationCancelled`. */
export function calculateArtifactScores(
  request: ArtifactScoreRequest,
  preferWebGpu: boolean,
  signal?: AbortSignal,
): Promise<ArtifactScoreResult> {
  return job.run({ type: 'calculate', request, preferWebGpu }, signal);
}
