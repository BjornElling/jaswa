import type { CraftRecommendationRequest, CraftRecommendations } from '../../domain/runes/craft-advice/rune-craft-recommendations';
import type { CraftRecommendationResponse } from '../../domain/runes/craft-advice/craft-recommendation-protocol';
import { CalculationCancelled } from './cancellable-worker';
import { workerFactories } from './worker-factories';

/** The worker itself failed, as opposed to answering that the question failed. */
export class CraftWorkerCrashed extends Error {
  constructor() {
    super('The craft worker could not finish. Try calculating again.');
    this.name = 'CraftWorkerCrashed';
  }
}

export type CraftRecommendationJob = { result: Promise<CraftRecommendations[]>; cancel(): void };

/**
 * Asks one worker each of `asks` in turn and resolves with every answer once all
 * are in. A Gems & Grinds view asks its whole question, or only the parts an
 * account change left unjudged, so the questions run in order on one worker and
 * report one progress across all of them. Cancelling ends the worker and rejects
 * with `CalculationCancelled`; the view keeps whatever answer it held.
 */
export function askCraftRecommendations(asks: readonly CraftRecommendationRequest[],
  onProgress: (fraction: number) => void): CraftRecommendationJob {
  if (asks.length === 0) return { result: Promise.resolve([]), cancel: () => {} };
  let worker: Worker | null = null;
  let cancel = () => {};
  const result = new Promise<CraftRecommendations[]>((resolve, reject) => {
    const finish = (outcome: () => void) => {
      if (!worker) return;
      worker.terminate();
      worker = null;
      outcome();
    };
    let running: Worker;
    try {
      running = workerFactories().craftRecommendation();
    } catch {
      reject(new CraftWorkerCrashed());
      return;
    }
    worker = running;
    const results: CraftRecommendations[] = [];
    running.onmessage = (event: MessageEvent<CraftRecommendationResponse>) => {
      if (worker !== running) return;
      const message = event.data;
      if (message.type === 'progress') { onProgress((results.length + message.fraction) / asks.length); return; }
      if (message.type === 'error') { finish(() => reject(new Error(message.message))); return; }
      results.push(message.result);
      if (results.length < asks.length) running.postMessage(asks[results.length]);
      else finish(() => resolve(results));
    };
    running.onerror = () => finish(() => reject(new CraftWorkerCrashed()));
    cancel = () => finish(() => reject(new CalculationCancelled()));
    running.postMessage(asks[0]);
  });
  return { result, cancel: () => cancel() };
}
