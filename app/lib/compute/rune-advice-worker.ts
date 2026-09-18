/// <reference lib="webworker" />

/**
 * Rune Clean-up's calculation, off the main thread.
 *
 * The worker runs exactly the arithmetic the main thread used to run: it imports
 * `runeAdvice` and calls it. It has no policy of its own and no second copy of
 * anything, which is the whole point — moving the work must not create a place
 * where a second answer could be computed.
 *
 * It measures its own elapsed time, because that is the figure the page prints
 * and the main thread can no longer see where the work started and stopped.
 */
import { runeAdvice } from '../rune-cleanup-advice';
import type { RuneAdviceWorkerRequest, RuneAdviceWorkerResponse } from './rune-advice-protocol';

self.onmessage = (event: MessageEvent<RuneAdviceWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  try {
    const startedAt = performance.now();
    const { runes, presets, settings, base } = message.request;
    const advice = runeAdvice(runes, presets, settings, base);
    const response: RuneAdviceWorkerResponse = {
      type: 'result', requestId: message.requestId, advice, durationMs: performance.now() - startedAt,
    };
    self.postMessage(response);
  } catch {
    const response: RuneAdviceWorkerResponse = {
      type: 'error', requestId: message.requestId,
      message: 'JASWA could not judge these runes against these presets.',
    };
    self.postMessage(response);
  }
};
