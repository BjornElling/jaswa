/**
 * The one way from Rune Settings to its fixed synthetic statistics.
 *
 * A changed slider cancels the previous worker before starting the next one.
 * The page therefore never commits an older population answer after a newer
 * settings choice, and the processor remains available for the rest of JASWA.
 */
import type {
  RuneStatisticsOutcome, RuneStatisticsRequest, RuneStatisticsWorkerRequest, RuneStatisticsWorkerResponse,
} from './rune-statistics-protocol';

let worker: Worker | undefined;
let nextRequestId = 1;
const waiting = new Map<number, (outcome: RuneStatisticsOutcome) => void>();

function statisticsWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./rune-statistics-worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export function cancelRuneStatistics(): void {
  worker?.terminate();
  worker = undefined;
  const pending = [...waiting.values()];
  waiting.clear();
  for (const settle of pending) settle({ status: 'superseded' });
}

export function calculateRuneStatistics(request: RuneStatisticsRequest): Promise<RuneStatisticsOutcome> {
  if (waiting.size > 0) cancelRuneStatistics();
  const requestId = nextRequestId;
  nextRequestId += 1;
  return new Promise<RuneStatisticsOutcome>((resolve) => {
    const currentWorker = statisticsWorker();
    const settle = (outcome: RuneStatisticsOutcome) => {
      currentWorker.removeEventListener('message', onMessage);
      currentWorker.removeEventListener('error', onError);
      waiting.delete(requestId);
      resolve(outcome);
    };
    const onMessage = (event: MessageEvent<RuneStatisticsWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      settle(event.data.type === 'error'
        ? { status: 'failed', message: event.data.message }
        : { status: 'done', statistics: event.data.statistics, backend: event.data.backend });
    };
    const onError = () => {
      currentWorker.terminate();
      if (worker === currentWorker) worker = undefined;
      settle({ status: 'failed', message: 'JASWA could not start its rune statistics calculation.' });
    };
    waiting.set(requestId, settle);
    currentWorker.addEventListener('message', onMessage);
    currentWorker.addEventListener('error', onError, { once: true });
    try {
      const message: RuneStatisticsWorkerRequest = { type: 'calculate', requestId, request };
      currentWorker.postMessage(message);
    } catch {
      onError();
    }
  });
}
