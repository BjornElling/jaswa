/**
 * The main thread's one way to ask for a Rune Optimization calculation.
 *
 * The search is split across several workers — one per spare processor core, up to
 * eight — each taking every *n*-th candidate of the first open slot. The shares are
 * independent, so no worker waits on another, and their tables merge into the one
 * the page shows by the same ordering each of them kept (`mergeBuildResults`).
 *
 * Latest request wins and cancelling terminates every worker, for the reasons
 * `rune-advice-client.ts` gives: a calculation the user walked away from should give
 * the processor back, not finish into a void, and a late answer from an older
 * request must never overwrite a newer table.
 */
import { figureIndex } from '../rune-optimization-problem';
import type { RuneOptimizationInput } from '../rune-optimization-problem';
import { mergeBuildResults } from '../rune-optimization-search';
import { combineCalculationBackends } from './calculation-summary';
import type {
  RuneOptimizationAnswer, RuneOptimizationOutcome, RuneOptimizationWorkerResponse,
} from './rune-optimization-protocol';

/** How many workers share one search. One core is left for the page itself. */
export function searchWorkerCount(): number {
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(8, cores - 1));
}

let running: { workers: Worker[]; settle: (outcome: RuneOptimizationOutcome) => void } | undefined;

export function cancelRuneOptimization(): void {
  if (!running) return;
  const { workers, settle } = running;
  running = undefined;
  for (const worker of workers) worker.terminate();
  settle({ status: 'superseded' });
}

export function optimizeRuneBuilds(
  input: RuneOptimizationInput, preferWebGpu: boolean, onProgress?: (fraction: number) => void,
): Promise<RuneOptimizationOutcome> {
  cancelRuneOptimization();
  const parts = searchWorkerCount();
  const startedAt = performance.now();
  return new Promise<RuneOptimizationOutcome>((resolve) => {
    const workers: Worker[] = [];
    const answers: Array<RuneOptimizationAnswer | undefined> = new Array(parts).fill(undefined);
    const progress = new Array<number>(parts).fill(0);
    let bestBar = -Infinity;
    let settled = false;
    const settle = (outcome: RuneOptimizationOutcome) => {
      if (settled) return;
      settled = true;
      if (running?.workers === workers) running = undefined;
      for (const worker of workers) worker.terminate();
      resolve(outcome);
    };
    running = { workers, settle };

    for (let part = 0; part < parts; part += 1) {
      const worker = new Worker(new URL('./rune-optimization-worker.ts', import.meta.url), { type: 'module' });
      workers.push(worker);
      worker.addEventListener('message', (event: MessageEvent<RuneOptimizationWorkerResponse>) => {
        const message = event.data;
        if (message.requestId !== part) return;
        /* One part's table rose: every other part may now prune against it. */
        if (message.type === 'bar') {
          if (message.value <= bestBar) return;
          bestBar = message.value;
          workers.forEach((other, at) => { if (at !== part) other.postMessage({ type: 'bar', value: bestBar }); });
          return;
        }
        if (message.type === 'progress') {
          progress[part] = message.fraction;
          onProgress?.(progress.reduce((total, share) => total + share, 0) / parts);
          return;
        }
        if (message.type === 'error') { settle({ status: 'failed', message: message.message }); return; }
        answers[part] = message.answer;
        if (answers.some((answer) => answer === undefined)) return;
        const complete = answers as RuneOptimizationAnswer[];
        const rank = figureIndex(input.requirements.rankBy);
        const merged = mergeBuildResults(complete, rank, input.settings.resultCount);
        settle({
          status: 'done',
          answer: {
            ...merged,
            report: complete[0].report,
            backend: combineCalculationBackends(complete.map((answer) => answer.backend)),
            /* The wall clock the user waited, not the sum of the workers' clocks. */
            durationMs: performance.now() - startedAt,
          },
        });
      });
      worker.addEventListener('error', () => settle({ status: 'failed', message: 'JASWA could not start its rune search.' }), { once: true });
      try {
        worker.postMessage({ type: 'calculate', requestId: part, request: { input, part, parts, preferWebGpu } });
      } catch {
        settle({ status: 'failed', message: 'JASWA could not hand this account to its rune search.' });
      }
    }
  });
}
