/** Worker construction stays at the browser boundary; each feature retains its scheduling policy. */
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

export function createRuneCalibrationWorker(): Worker {
  return new Worker(new URL('./compute/rune-calibration-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneOptimizationWorker(): Worker {
  return new Worker(new URL('./compute/rune-optimization-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneStatisticsWorker(): Worker {
  return new Worker(new URL('./compute/rune-statistics-worker.ts', import.meta.url), { type: 'module' });
}
