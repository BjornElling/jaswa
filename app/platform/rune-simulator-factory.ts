/** The simulator is development-only, so its worker must not enter production. */
export function createRuneSimulatorWorker(): Worker {
  return new Worker(new URL('./compute/rune-simulator-worker.ts', import.meta.url), { type: 'module' });
}
