/**
 * The main thread's one way to ask for a Rune Clean-up calculation.
 *
 * The page used to defer by `setTimeout(…, 0)` so the button could paint its busy
 * label, and then take the main thread for the whole calculation — which is what
 * made the browser report a hung page rather than a slow one. The arithmetic is
 * now fast enough that no account should get near that, but "fast enough" moves a
 * threshold where a worker removes the failure mode: an account several times the
 * size of anything measured, with thirty user roles, is still several seconds of
 * work, and several seconds of frozen page is a defect whatever the cause.
 *
 * Built on `artifact-score-client.ts`, which owns the same shape for the same
 * reason. One worker per channel, a request id per call, one promise back.
 *
 * **A channel per asker.** Rune Clean-up's table and the rune overlay both ask, and
 * each wants only its own newest answer. Sharing one worker made them one queue, so
 * opening a rune would have cancelled the table's calculation in flight. Two
 * channels are two workers: neither can supersede the other.
 */
import type {
  RuneAdviceOutcome, RuneAdviceRequest, RuneAdviceWorkerResponse,
} from './rune-advice-protocol';

export type RuneAdviceChannel = {
  /**
   * Ask for a calculation. The newest request is the only one that may be committed.
   *
   * Latest-request-wins lives here rather than in the page, because it is a property
   * of the boundary and not of one caller's bookkeeping: any second caller would
   * otherwise have to reinvent it, and the failure when one forgets is silent — a
   * late answer from an earlier settings state overwriting a newer table.
   *
   * Superseding also terminates the worker in flight. The worker is single-threaded
   * and handles messages in order, so an abandoned calculation would otherwise have
   * to run to completion before the request that matters could start.
   */
  calculate: (request: RuneAdviceRequest) => Promise<RuneAdviceOutcome>;
  /**
   * Stop waiting for whatever is in flight.
   *
   * The worker is terminated rather than merely ignored, so a calculation the user
   * has walked away from gives the processor back instead of finishing into a void.
   * Every waiting call is answered `superseded` — a cancelled calculation is not a
   * completed one and must never reach the table.
   */
  cancel: () => void;
};

export function runeAdviceChannel(): RuneAdviceChannel {
  let worker: Worker | undefined;
  let nextRequestId = 1;
  /* Every call still waiting, so terminating the worker can answer them rather
     than leaving the page with a promise that never settles. */
  const waiting = new Map<number, (outcome: RuneAdviceOutcome) => void>();

  function adviceWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL('./rune-advice-worker.ts', import.meta.url), { type: 'module' });
    return worker;
  }

  function cancel(): void {
    worker?.terminate();
    worker = undefined;
    const pending = [...waiting.values()];
    waiting.clear();
    for (const settle of pending) settle({ status: 'superseded' });
  }

  function calculate(request: RuneAdviceRequest): Promise<RuneAdviceOutcome> {
    if (waiting.size > 0) cancel();
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise<RuneAdviceOutcome>((resolve) => {
      const currentWorker = adviceWorker();
      const settle = (outcome: RuneAdviceOutcome) => {
        currentWorker.removeEventListener('message', onMessage);
        currentWorker.removeEventListener('error', onError);
        waiting.delete(requestId);
        resolve(outcome);
      };
      const onMessage = (event: MessageEvent<RuneAdviceWorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        settle(event.data.type === 'error'
          ? { status: 'failed', message: event.data.message }
          : { status: 'done', advice: event.data.advice, durationMs: event.data.durationMs, backend: event.data.backend });
      };
      const onError = () => {
        currentWorker.terminate();
        if (worker === currentWorker) worker = undefined;
        settle({ status: 'failed', message: 'JASWA could not start its rune calculation.' });
      };
      waiting.set(requestId, settle);
      currentWorker.addEventListener('message', onMessage);
      currentWorker.addEventListener('error', onError, { once: true });
      try {
        currentWorker.postMessage({ type: 'calculate', requestId, request });
      } catch {
        onError();
      }
    });
  }

  return { calculate, cancel };
}

/** Rune Clean-up's own channel, which its table has always used. */
const cleanupChannel = runeAdviceChannel();
export const calculateRuneAdvice = cleanupChannel.calculate;
export const cancelRuneAdvice = cleanupChannel.cancel;

/* The table's re-reading of the runes a sync changed. A channel of its own, so a
   sync landing during Recalculate cannot cancel the whole calculation. */
const refreshChannel = runeAdviceChannel();
export const refreshRuneAdvice = refreshChannel.calculate;
export const cancelRuneAdviceRefresh = refreshChannel.cancel;
