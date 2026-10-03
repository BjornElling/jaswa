/// <reference lib="webworker" />

/**
 * One share of a Rune Optimization search, off the main thread.
 *
 * The first worker prepares the problem once; each searches the share it was given
 * and returns its own table with every chosen rune spelled out, so the page never
 * has to reconstruct a candidate from an index. It has no policy of its own: the
 * engine is chosen by `runAccelerated` and reported as it answered.
 */
import { unliftedFigures } from '../monster-stats';
import { prepareRuneOptimization } from '../rune-optimization-problem';
import { searchRuneBuildsAccelerated } from './rune-optimization-engine';
import type {
  OptimizedBuild, RuneOptimizationWorkerRequest, RuneOptimizationWorkerResponse,
} from './rune-optimization-protocol';

/* The best bar the other parts have reached. A worker answers one request in its
   life, so this belongs to that one search. */
let sharedBar = -Infinity;
let stopRequested = false;

self.onmessage = async (event: MessageEvent<RuneOptimizationWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'stop') { stopRequested = true; return; }
  if (message.type === 'bar') {
    if (message.value > sharedBar) sharedBar = message.value;
    return;
  }
  if (message.type === 'prepare') {
    try {
      const problem = prepareRuneOptimization(message.input, {
        onStage: (phase) => self.postMessage({ type: 'phase', phase } satisfies RuneOptimizationWorkerResponse),
      });
      self.postMessage({ type: 'prepared', problem } satisfies RuneOptimizationWorkerResponse);
    } catch (error) {
      console.error('Rune Optimization preparation failed:', error);
      self.postMessage({ type: 'error', requestId: 0, message: 'JASWA could not prepare rune builds for this monster.' } satisfies RuneOptimizationWorkerResponse);
    }
    return;
  }
  if (message.type !== 'calculate') return;
  const { requestId } = message;
  try {
    const startedAt = performance.now();
    const { problem, part, parts, preferWebGpu } = message.request;
    const { outcome, backend } = await searchRuneBuildsAccelerated({
      problem, part, parts,
      hooks: {
        onProgress: (fraction) => {
          const progress: RuneOptimizationWorkerResponse = { type: 'progress', requestId, fraction };
          self.postMessage(progress);
        },
        onBar: (value) => {
          const raised: RuneOptimizationWorkerResponse = { type: 'bar', requestId, value };
          self.postMessage(raised);
        },
        sharedBar: () => sharedBar,
        shouldStop: () => stopRequested,
      },
    }, preferWebGpu);
    const builds: OptimizedBuild[] = outcome.builds.map((build) => ({
      ...build,
      /* The search ranks over the lifted base; the table shows the monster's own CRI Rate. */
      figures: unliftedFigures([...build.figures], problem.criticalRateLift),
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
  } catch (error) {
    console.error('Rune Optimization failed:', error);
    const response: RuneOptimizationWorkerResponse = {
      type: 'error', requestId, message: 'JASWA could not search rune builds for this monster.',
    };
    self.postMessage(response);
  }
};
