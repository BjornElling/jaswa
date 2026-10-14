/// <reference lib="webworker" />

/**
 * Rune Clean-up's calculation, off the main thread.
 *
 * The worker runs exactly the arithmetic the main thread used to run: it imports
 * `runeAdvice` and calls it. It has no policy of its own and no second copy of
 * anything, which is the whole point — moving the work must not create a place
 * where a second answer could be computed.
 *
 * The one thing it settles is **where the odds are counted**, and it does not settle
 * that either: it hands the user's own setting to `countRuneChances` and reports
 * which engine answered. A fall back to the processor — no WebGPU, no adapter, a card
 * that failed its agreement check — is something the status line then says out loud,
 * rather than a hidden decision behind a figure that looks the same either way.
 *
 * It measures its own elapsed time, because that is the figure the page prints and
 * the main thread can no longer see where the work started and stopped.
 */
import { runeAdvice } from '../rune-cleanup-advice';
import { countRuneChances } from './rune-chance-engine';
import { combineCalculationBackends } from './calculation-summary';
import type { CalculationBackend } from './calculation-summary';
import type { RuneAdviceWorkerRequest, RuneAdviceWorkerResponse } from './rune-advice-protocol';

self.onmessage = async (event: MessageEvent<RuneAdviceWorkerRequest>) => {
  const message = event.data;
  if (message.type !== 'calculate') return;
  try {
    const startedAt = performance.now();
    const { runes, roles, settings, base, preferWebGpu, explain } = message.request;
    const engines: CalculationBackend[] = [];
    let reportedPercent = -1;
    const onProgress = (fraction: number) => {
      const percent = Math.floor(fraction * 100);
      if (percent === reportedPercent) return;
      reportedPercent = percent;
      const response: RuneAdviceWorkerResponse = { type: 'progress', requestId: message.requestId, fraction };
      self.postMessage(response);
    };
    const advice = await runeAdvice(runes, roles, settings, base, async (jobs, chanceBar) => {
      const answer = await countRuneChances(jobs, preferWebGpu, chanceBar);
      engines.push(answer.backend);
      return answer.shares;
    }, { explain, onProgress });
    const response: RuneAdviceWorkerResponse = {
      type: 'result', requestId: message.requestId, advice, durationMs: performance.now() - startedAt,
      /* One batch today, so one engine. It is still read through
         `combineCalculationBackends`, so a future calculation that counts in several
         passes reports `mixed` honestly rather than reporting its last pass. */
      backend: combineCalculationBackends(engines),
    };
    self.postMessage(response);
  } catch {
    const response: RuneAdviceWorkerResponse = {
      type: 'error', requestId: message.requestId,
      message: 'JASWA could not judge these runes against these roles.',
    };
    self.postMessage(response);
  }
};
