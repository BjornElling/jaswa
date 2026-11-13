import { createRuneAdviceWorker } from '../feature-workers';
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
 * channels are independent workers: neither can supersede the other. A table
 * refresh borrows the table's warm worker while it is idle, and has its own
 * worker when the table is already calculating.
 */
import { referenceStars } from '../../domain/runes/cleanup/rune-cleanup-model';
import { leaseCalibration } from './rune-calibration-client';
import type { CalibrationPopulation } from '../../domain/runes/cleanup/rune-calibration-protocol';
import type {
  RuneAdviceOutcome, RuneAdviceRequest, RuneAdviceWorkerRequest, RuneAdviceWorkerResponse,
} from '../../domain/runes/cleanup/rune-advice-protocol';

export type RuneAdviceChannel = {
  isBusy: () => boolean;
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
  calculate: (request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
    onCalibration?: (fraction: number | null) => void) => Promise<RuneAdviceOutcome>;
  /**
   * Stop waiting for whatever is in flight.
   *
   * The worker is terminated rather than merely ignored, so a calculation the user
   * has walked away from gives the processor back instead of finishing into a void.
   * Every waiting call is answered `superseded` — a cancelled calculation is not a
   * completed one and must never reach the table. An idle worker is kept: its
   * bounded calibration cache is useful on the next page visit and costs no CPU.
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
    worker = createRuneAdviceWorker();
    return worker;
  }

  /* Requests the worker has actually been sent. One still waiting on the shared
     calibration has not reached it, and cancelling that one leaves the warm worker be. */
  const posted = new Set<number>();

  function cancel(): void {
    if (waiting.size === 0) return;
    if (posted.size > 0) {
      worker?.terminate();
      worker = undefined;
    }
    const pending = [...waiting.values()];
    waiting.clear();
    for (const settle of pending) settle({ status: 'superseded' });
  }

  function calculate(request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
    onCalibration?: (fraction: number | null) => void): Promise<RuneAdviceOutcome> {
    const requestId = nextRequestId;
    nextRequestId += 1;
    const startedAt = performance.now();
    /* The calibration first, on the shared pool; every grade the runes are read in.
       Leased before the superseded request lets go of its own, so opening a second
       rune of the same grade mid-count carries the count on rather than restarting it. */
    const grades = [...new Set(request.runes.map(referenceStars))];
    const fractions = new Map<number, number>();
    let calibrating = false;
    const leases = grades.map((stars) => leaseCalibration(request.roles, request.base, stars, (fraction) => {
      if (!waiting.has(requestId)) return;
      fractions.set(stars, fraction);
      calibrating = true;
      onCalibration?.([...fractions.values()].reduce((sum, value) => sum + value, 0) / grades.length);
    }));
    if (waiting.size > 0) cancel();
    return new Promise<RuneAdviceOutcome>((resolve) => {
      let detach = () => {};
      const settle = (outcome: RuneAdviceOutcome) => {
        detach();
        for (const lease of leases) lease.release();
        waiting.delete(requestId);
        posted.delete(requestId);
        resolve(outcome);
      };
      waiting.set(requestId, settle);
      void Promise.all(leases.map((lease) => lease.ready)).then((populations) => {
        if (!waiting.has(requestId)) return;
        if (calibrating) onCalibration?.(null);
        send(requestId, request, populations.filter((population) => population !== null), settle, onProgress, onCalibration,
          (undo) => { detach = undo; }, startedAt);
      });
    });
  }

  function send(requestId: number, request: RuneAdviceRequest, populations: CalibrationPopulation[],
    settle: (outcome: RuneAdviceOutcome) => void, onProgress: ((fraction: number) => void) | undefined,
    onCalibration: ((fraction: number | null) => void) | undefined, onDetach: (undo: () => void) => void,
    startedAt: number): void {
      const currentWorker = adviceWorker();
      onDetach(() => {
        currentWorker.removeEventListener('message', onMessage);
        currentWorker.removeEventListener('error', onError);
      });
      const onMessage = (event: MessageEvent<RuneAdviceWorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        if (event.data.type === 'calibration') {
          onCalibration?.(event.data.fraction);
          return;
        }
        if (event.data.type === 'progress') {
          onProgress?.(event.data.fraction);
          return;
        }
        settle(event.data.type === 'error'
          ? { status: 'failed', message: event.data.message }
          /* Timed from the request, so the shared calibration it waited for is counted too. */
          : { status: 'done', advice: event.data.advice, durationMs: performance.now() - startedAt, backend: event.data.backend });
      };
      const onError = () => {
        currentWorker.terminate();
        if (worker === currentWorker) worker = undefined;
        settle({ status: 'failed', message: 'JASWA could not start its rune calculation.' });
      };
      currentWorker.addEventListener('message', onMessage);
      currentWorker.addEventListener('error', onError, { once: true });
      posted.add(requestId);
      try {
        const message: RuneAdviceWorkerRequest = { type: 'calculate', requestId, request, populations };
        currentWorker.postMessage(message);
      } catch {
        onError();
      }
  }

  return { calculate, cancel, isBusy: () => waiting.size > 0 };
}

/** Rune Clean-up's own channel, which its table has always used. */
const cleanupChannel = runeAdviceChannel();
export function calculateRuneAdvice(request: RuneAdviceRequest, onProgress?: (fraction: number) => void,
  onCalibration?: (fraction: number | null) => void): Promise<RuneAdviceOutcome> {
  if (activeRefresh?.channel === cleanupChannel) cancelRuneAdviceRefresh();
  return cleanupChannel.calculate(request, onProgress, onCalibration);
}
export const cancelRuneAdvice = cleanupChannel.cancel;

/* Borrowing an idle worker saves the shared calibration, which costs much more
   than judging a changed rune. Concurrent work still has independent cancellation. */
const refreshChannel = runeAdviceChannel();
let activeRefresh: { channel: RuneAdviceChannel } | null = null;

export function cancelRuneAdviceRefresh(): void {
  activeRefresh?.channel.cancel();
  activeRefresh = null;
}

export function refreshRuneAdvice(request: RuneAdviceRequest, onProgress?: (fraction: number) => void): Promise<RuneAdviceOutcome> {
  cancelRuneAdviceRefresh();
  const active = { channel: cleanupChannel.isBusy() ? refreshChannel : cleanupChannel };
  activeRefresh = active;
  return active.channel.calculate(request, onProgress).finally(() => {
    if (activeRefresh === active) activeRefresh = null;
  });
}
