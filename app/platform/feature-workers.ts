/** Worker construction stays at the browser boundary; each feature retains its scheduling policy. */
export function createCraftRecommendationWorker(): Worker {
  return new Worker(new URL('../lib/compute/craft-recommendation-worker.ts', import.meta.url), { type: 'module' });
}

export function createRuneOptimizationWorkWorker(): Worker {
  return new Worker(new URL('../lib/compute/rune-optimization-work-worker.ts', import.meta.url), { type: 'module' });
}
