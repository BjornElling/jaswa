import type { RuneOptimizationInput, RuneOptimizationProblem } from '../../domain/runes/optimization/rune-optimization-problem';
import type { RuneOptimizationWork } from '../../domain/runes/optimization/rune-optimization-work';
import { searchWorkerCount } from './rune-optimization-client';
import { workerFactories } from './worker-factories';

export type RuneOptimizationWorkEstimate = { problem: RuneOptimizationProblem; work: RuneOptimizationWork };
export type RuneOptimizationWorkJob = { result: Promise<RuneOptimizationWorkEstimate | 'failed'>; cancel(): void };

/* A hard ceiling that also covers preparation and driver calls, outside the search clock. */
const watchdogMs = 20_000;

/**
 * How much work a search for `input` would be, measured in a worker of its own
 * so the estimate never competes with the page. One estimate per question: a
 * failure is an answer (`'failed'`), not something to retry, and a cancel ends
 * the worker without settling anything the caller still listens to.
 */
export function estimateRuneOptimizationWork(input: RuneOptimizationInput, preferWebGpu: boolean): RuneOptimizationWorkJob {
  let worker: Worker | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const end = () => { clearTimeout(watchdog); worker?.terminate(); worker = null; };
  const result = new Promise<RuneOptimizationWorkEstimate | 'failed'>((resolve) => {
    const settle = (answer: RuneOptimizationWorkEstimate | 'failed') => { if (!worker) return; end(); resolve(answer); };
    try {
      const running = workerFactories().runeOptimizationWork();
      worker = running;
      running.onmessage = (event: MessageEvent<{ problem: RuneOptimizationProblem; work: RuneOptimizationWork; failed?: boolean }>) => {
        if (worker !== running) return;
        settle(event.data.failed ? 'failed' : { problem: event.data.problem, work: event.data.work });
      };
      running.onerror = () => settle('failed');
      running.postMessage({ input, preferWebGpu, workers: searchWorkerCount() });
      watchdog = setTimeout(() => settle('failed'), watchdogMs);
    } catch {
      end();
      resolve('failed');
    }
  });
  return { result, cancel: end };
}
