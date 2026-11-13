import { createRuneCalibrationWorker } from '../../platform/feature-workers';
/**
 * **The slot calibration, counted once and on every core.**
 *
 * Judging one rune takes a few milliseconds; the calibration behind its quality
 * floor took nine seconds on one core, and every advice worker counted its own. So
 * the rune overlay recounted what Rune Clean-up had just counted, and opening one rune
 * cost as much as calibrating the whole box.
 *
 * The calibration is eighteen independent pieces — six slots at three checkpoints —
 * each depending on nothing but the roles, the reference lines, the star class and a
 * fixed seed. Here they are counted by a pool of workers side by side, and the counted
 * population is kept on the main thread, where every advice channel reads the same
 * copy. The arithmetic is `countCalibrationPiece`, the function the in-process
 * calibration uses, so the population is the one a single core would have counted.
 *
 * A population is shared by everyone asking for it and abandoned only when nobody is:
 * the overlay closing while Rune Clean-up still waits leaves the count running.
 */
import { calibrationPieces, calibrationPopulationKey, calibrationSampleCount } from '../rune-cleanup-advice';
import type { ReferenceStats } from '../rune-reference-stats';
import type { RuneRole } from '../rune-roles';
import type {
  CalibrationPopulation, RuneCalibrationWorkerRequest, RuneCalibrationWorkerResponse,
} from './rune-calibration-protocol';

type Count = {
  /** `null` where a worker failed; the advice worker then calibrates in process. */
  ready: Promise<CalibrationPopulation | null>;
  settled: boolean;
  leases: number;
  samples: number;
  listeners: Set<(fraction: number) => void>;
  /** Settles the count; also how a stopped count gives its pieces back. */
  finish: (population: CalibrationPopulation | null) => void;
};

/* Counted populations are kept, most recent last; one in flight is never evicted. */
const counts = new Map<string, Count>();
const countsKept = 4;

/**
 * **One pool for every count.** A box of six star classes is six counts, and a pool
 * each was ninety workers fighting over sixteen cores. The pieces of every count wait
 * in one queue instead, the first count's first, and the pool's workers take the next
 * piece whatever count it belongs to. A worker with nothing left to take is closed.
 */
type Job = {
  count: Count;
  pieceId: number;
  request: RuneCalibrationWorkerRequest;
  done: (scores: Float64Array, samples: number) => void;
  progress: (samples: number) => void;
};
const queue: Job[] = [];
const running = new Map<Worker, Job | null>();

/** The cores the pool may take: all but one, so the page and the advice worker keep one. */
function poolSize(): number {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(calibrationPieces.length, cores - 1));
}

function close(worker: Worker): void {
  worker.terminate();
  running.delete(worker);
}

function feed(worker: Worker): void {
  const job = queue.shift();
  if (!job) { close(worker); return; }
  running.set(worker, job);
  worker.postMessage(job.request);
}

function spawn(): void {
  const worker = createRuneCalibrationWorker();
  running.set(worker, null);
  worker.onmessage = (event: MessageEvent<RuneCalibrationWorkerResponse>) => {
    const job = running.get(worker);
    const message = event.data;
    if (!job || message.pieceId !== job.pieceId) return;
    if (message.type === 'error') { close(worker); job.count.finish(null); schedule(); return; }
    if (message.type === 'progress') { job.progress(message.samples); return; }
    job.done(message.scores, message.samples);
    feed(worker);
  };
  worker.onerror = () => {
    const job = running.get(worker);
    close(worker);
    job?.count.finish(null);
    schedule();
  };
  feed(worker);
}

function schedule(): void {
  while (queue.length > 0 && running.size < poolSize()) spawn();
}

/** Take a count's pieces back from the queue, and stop the workers counting them. */
function withdraw(count: Count): void {
  for (let at = queue.length - 1; at >= 0; at -= 1) if (queue[at].count === count) queue.splice(at, 1);
  for (const [worker, job] of running) if (job?.count === count) close(worker);
  schedule();
}

function start(roles: readonly RuneRole[], base: ReadonlyMap<string, ReferenceStats>, stars: number): Count {
  const total = calibrationSampleCount();
  let resolve: (population: CalibrationPopulation | null) => void = () => {};
  const count: Count = {
    ready: new Promise<CalibrationPopulation | null>((settle) => { resolve = settle; }),
    settled: false, leases: 0, samples: 0, listeners: new Set(),
    finish: (population) => {
      if (count.settled) return;
      count.settled = true;
      withdraw(count);
      resolve(population);
    },
  };
  const pieces: Float64Array[] = new Array(calibrationPieces.length);
  let remaining = calibrationPieces.length;
  const progress = (samples: number) => {
    count.samples += samples;
    for (const listener of count.listeners) listener(Math.min(1, count.samples / total));
  };
  calibrationPieces.forEach((piece, pieceId) => queue.push({
    count, pieceId, progress,
    request: { pieceId, roles, base, stars, piece },
    done: (scores, samples) => {
      progress(samples);
      pieces[pieceId] = scores;
      remaining -= 1;
      if (remaining === 0) count.finish({ stars, pieces });
    },
  }));
  schedule();
  return count;
}

export type CalibrationLease = {
  ready: Promise<CalibrationPopulation | null>;
  /** Stop waiting. The count stops too once nobody else waits for it. */
  release: () => void;
};

/**
 * Ask for one star class's population. `onProgress` hears how far the count is, 0 to
 * 1; a population already counted answers at once and reports nothing.
 */
export function leaseCalibration(
  roles: readonly RuneRole[], base: ReadonlyMap<string, ReferenceStats>, stars: number,
  onProgress?: (fraction: number) => void,
): CalibrationLease {
  const key = calibrationPopulationKey(roles, base, stars);
  let count = counts.get(key);
  if (count) counts.delete(key);
  else count = start(roles, base, stars);
  counts.set(key, count);
  const held = count;
  held.leases += 1;
  if (onProgress && !held.settled) held.listeners.add(onProgress);
  /* A failed count is not kept: the next request tries again. */
  void held.ready.then((population) => {
    if (population === null && counts.get(key) === held) counts.delete(key);
  });
  for (const [other, kept] of counts) {
    if (counts.size <= countsKept) break;
    if (kept.settled && kept.leases === 0) counts.delete(other);
  }
  let released = false;
  return {
    ready: held.ready,
    release: () => {
      if (released) return;
      released = true;
      held.leases -= 1;
      if (onProgress) held.listeners.delete(onProgress);
      if (held.leases === 0 && !held.settled) {
        if (counts.get(key) === held) counts.delete(key);
        held.finish(null);
      }
    },
  };
}
