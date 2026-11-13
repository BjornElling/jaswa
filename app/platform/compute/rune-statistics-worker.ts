/// <reference lib="webworker" />

/**
 * The Statistics box has the same latest-request-wins boundary as the table.
 * Its synthetic population is deliberately judged here, so dragging a slider
 * never makes the page wait on the Clean-up engine's arithmetic.
 */
import { calculateRuneCleanupStatistics } from '../../domain/runes/cleanup/rune-cleanup-statistics';
import { countRuneChances } from './rune-chance-engine';
import { combineCalculationBackends } from '../../domain/shared/calculation-summary';
import type { CalculationBackend } from '../../domain/shared/calculation-summary';
import type { RuneStatisticsWorkerRequest, RuneStatisticsWorkerResponse } from '../../domain/runes/cleanup/rune-statistics-protocol';

self.onmessage = async (event: MessageEvent<RuneStatisticsWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  try {
    const engines: CalculationBackend[] = [];
    const { roles, settings, base, preferWebGpu } = message.request;
    const statistics = await calculateRuneCleanupStatistics(roles, settings, base, async (jobs, chanceBar) => {
      const answer = await countRuneChances(jobs, preferWebGpu, chanceBar);
      engines.push(answer.backend);
      return answer.shares;
    });
    const response: RuneStatisticsWorkerResponse = {
      type: 'result', requestId: message.requestId, statistics,
      backend: combineCalculationBackends(engines),
    };
    self.postMessage(response);
  } catch {
    const response: RuneStatisticsWorkerResponse = {
      type: 'error', requestId: message.requestId,
      message: 'JASWA could not calculate the synthetic rune statistics.',
    };
    self.postMessage(response);
  }
};
