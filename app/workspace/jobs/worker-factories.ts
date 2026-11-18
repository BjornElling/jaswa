/**
 * How a calculation gets a worker, declared here and supplied by the shell from
 * `app/platform/` (`ARCHITECTURE-FROM-SCRATCH.md` §22.3). The job clients in
 * this folder own the lifecycle — request routing, cancellation, memory — and
 * never construct a worker themselves: `new Worker` with its bundled URL is
 * transport, and only the composition root connects the two. A test supplies
 * its own factories, so a client can run without a browser.
 */
import { budgetedWorker, createWorkerBudget } from './worker-budget';

export type WorkerFactories = {
  artifactScore(): Worker;
  craftRecommendation(): Worker;
  runeAdvice(interactive?: boolean): Worker;
  runeReference(interactive?: boolean): Worker;
  runeOptimization(): Worker;
  runeOptimizationWork(): Worker;
  /** Development only: absent from a production build, so its worker never ships. */
  runeSimulator?(): Worker;
};

let provided: WorkerFactories | null = null;
const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
const budget = createWorkerBudget(Math.max(1, Math.min(8, cores - 2)), cores >= 4);

export function provideWorkerFactories(factories: WorkerFactories): void {
  provided = Object.fromEntries(Object.entries(factories).map(([name, create]) =>
    [name, (interactive = false) => budgetedWorker(create, budget, name === 'runeReference' || name === 'runeOptimizationWork', interactive)])) as WorkerFactories;
}

/** Adds the development simulator once the shell has loaded it. */
export function provideRuneSimulatorFactory(create: () => Worker): void {
  if (provided) provided = { ...provided, runeSimulator: () => budgetedWorker(create, budget, true) };
}

export function workerFactories(): WorkerFactories {
  if (!provided) throw new Error('No worker factories were provided; the shell connects them at start-up.');
  return provided;
}
