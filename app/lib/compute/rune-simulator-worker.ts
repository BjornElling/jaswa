/// <reference lib="webworker" />

/**
 * Rune Simulator's account-wide work, off the main thread.
 *
 * Generation, power-up rolls and the three optional Clean-up checkpoints all
 * belong to one experiment, so the worker owns the whole run rather than handing
 * only the recommendation calls away and leaving the simulation itself blocking.
 */
import { simulateRunes } from '../rune-simulator';
import type {
  RuneSimulationWorkerRequest, RuneSimulationWorkerResponse,
} from './rune-simulator-protocol';

self.onmessage = async (event: MessageEvent<RuneSimulationWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'simulate') return;
  try {
    const result = await simulateRunes(message.config, {
      ...message.context,
    });
    const backend = result.backend;
    const response: RuneSimulationWorkerResponse = {
      type: 'result', requestId: message.requestId, result, backend,
    };
    self.postMessage(response);
  } catch {
    const response: RuneSimulationWorkerResponse = {
      type: 'error', requestId: message.requestId,
      message: 'JASWA could not run this rune simulation.',
    };
    self.postMessage(response);
  }
};
