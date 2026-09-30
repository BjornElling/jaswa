/// <reference lib="webworker" />

/**
 * One share of a Rune Optimization search, off the main thread.
 *
 * It prepares the problem, searches the share of the first open slot it was given,
 * and returns its own table with every chosen rune spelled out, so the page never
 * has to reconstruct a candidate from an index. It has no policy of its own: the
 * engine is chosen by `runAccelerated` and reported as it answered.
 */
import { prepareRuneOptimization } from '../rune-optimization-problem';
import { searchRuneBuildsAccelerated } from './rune-optimization-engine';
import type {
  OptimizedBuild, RuneOptimizationWorkerRequest, RuneOptimizationWorkerResponse,
} from './rune-optimization-protocol';

self.onmessage = async (event: MessageEvent<RuneOptimizationWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  const { requestId } = message;
  try {
    const startedAt = performance.now();
    const { input, part, parts, preferWebGpu } = message.request;
    const problem = prepareRuneOptimization(input);
    const { outcome, backend } = await searchRuneBuildsAccelerated({
      problem, part, parts,
      onProgress: (fraction) => {
        const progress: RuneOptimizationWorkerResponse = { type: 'progress', requestId, fraction };
        self.postMessage(progress);
      },
    }, preferWebGpu);
    const builds: OptimizedBuild[] = outcome.builds.map((build) => ({
      ...build,
      runes: build.picks.map((at, slot) => {
        const candidate = problem.slots[slot][at];
        return {
          runeId: candidate.runeId, slot: candidate.slot, setId: candidate.setId, mainValue: candidate.mainValue,
          lines: candidate.lines, gemmedAt: candidate.gemmedAt, groundAt: candidate.groundAt,
          spends: candidate.stock.map((index) => problem.stock[index].itemId),
          moves: candidate.moves, locked: candidate.locked,
        };
      }),
    }));
    const response: RuneOptimizationWorkerResponse = {
      type: 'result', requestId,
      answer: { ...outcome, builds, report: problem.report, backend, durationMs: performance.now() - startedAt },
    };
    self.postMessage(response);
  } catch {
    const response: RuneOptimizationWorkerResponse = {
      type: 'error', requestId, message: 'JASWA could not search rune builds for this monster.',
    };
    self.postMessage(response);
  }
};
