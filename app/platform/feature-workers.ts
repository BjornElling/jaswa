import type { WorkerFactories } from '../workspace/jobs/worker-factories';

/* Worker construction stays at the browser boundary: a bundled worker URL is
   transport, and the job clients in `app/workspace/jobs/` receive these
   through the shell. */
export function createCraftRecommendationWorker(): Worker {
  return new Worker(new URL('./compute/craft-recommendation-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneOptimizationWorkWorker(): Worker {
  return new Worker(new URL('./compute/rune-optimization-work-worker.ts', import.meta.url), { type: 'module' });
}

export function createArtifactScoreWorker(): Worker {
  return new Worker(new URL('./compute/artifact-score-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneAdviceWorker(): Worker {
  return new Worker(new URL('./compute/rune-advice-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneReferenceWorker(): Worker {
  return new Worker(new URL('./compute/rune-reference-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneOptimizationWorker(): Worker {
  return new Worker(new URL('./compute/rune-optimization-worker.ts', import.meta.url), { type: 'module' });
}

function createSpeedIntervalWorker(): Worker {
  return new Worker(new URL('./compute/speed-interval-worker.ts', import.meta.url), { type: 'module' });
}

/** Every production worker, as the shell hands them to the job clients. The simulator's is added in development only. */
export const featureWorkerFactories: WorkerFactories = {
  artifactScore: createArtifactScoreWorker,
  craftRecommendation: createCraftRecommendationWorker,
  runeAdvice: createRuneAdviceWorker,
  runeReference: createRuneReferenceWorker,
  runeOptimization: createRuneOptimizationWorker,
  runeOptimizationWork: createRuneOptimizationWorkWorker,
  speedIntervals: createSpeedIntervalWorker,
};
