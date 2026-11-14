/**
 * How a calculation gets a worker, declared here and supplied by the shell from
 * `app/platform/` (`ARCHITECTURE-FROM-SCRATCH.md` §22.3). The job clients in
 * this folder own the lifecycle — request routing, cancellation, memory — and
 * never construct a worker themselves: `new Worker` with its bundled URL is
 * transport, and only the composition root connects the two. A test supplies
 * its own factories, so a client can run without a browser.
 */
export type WorkerFactories = {
  artifactScore(): Worker;
  craftRecommendation(): Worker;
  runeAdvice(): Worker;
  runeCalibration(): Worker;
  runeOptimization(): Worker;
  runeOptimizationWork(): Worker;
  runeStatistics(): Worker;
  /** Development only: absent from a production build, so its worker never ships. */
  runeSimulator?(): Worker;
};

let provided: WorkerFactories | null = null;

export function provideWorkerFactories(factories: WorkerFactories): void {
  provided = factories;
}

/** Adds the development simulator once the shell has loaded it. */
export function provideRuneSimulatorFactory(create: () => Worker): void {
  if (provided) provided = { ...provided, runeSimulator: create };
}

export function workerFactories(): WorkerFactories {
  if (!provided) throw new Error('No worker factories were provided; the shell connects them at start-up.');
  return provided;
}
