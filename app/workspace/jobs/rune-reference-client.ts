import {
  referenceSampleSize, referencePieceKey, rememberReference, retainedReferenceCount,
} from '../../domain/runes/cleanup/rune-quality-reference';
import type { QualityReference, ReferenceRequest } from '../../domain/runes/cleanup/rune-quality-reference';
import type {
  RuneReferenceWorkerRequest, RuneReferenceWorkerResponse,
} from '../../domain/runes/cleanup/rune-reference-protocol';
import { registerAccountJobReset } from './account-job-memory';
import { workerFactories } from './worker-factories';

type Pending = {
  request: ReferenceRequest;
  leases: number;
  interactiveLeases: number;
  retain: boolean;
  ready: Promise<QualityReference | null>;
  finish: (answer: QualityReference | null) => void;
};
type Batch = { worker: Worker; entries: Pending[]; interactive: boolean };

const cache = new Map<string, QualityReference>();
const pending = new Map<string, Pending>();
const running = new Set<Batch>();
const poolSize = Math.max(1, Math.min(8, (globalThis.navigator?.hardwareConcurrency || 4) - 1));
const batchSize = 12;

function settle(entry: Pending, answer: QualityReference | null): void {
  if (pending.get(entry.request.key) !== entry) return;
  pending.delete(entry.request.key);
  if (answer && entry.leases > 0 && entry.retain) {
    rememberReference(cache, answer.key, answer, retainedReferenceCount);
  }
  entry.finish(answer);
}

function validScores(scores: Float64Array): boolean {
  if (!(scores instanceof Float64Array) || scores.length !== referenceSampleSize) return false;
  let last = 0;
  for (const score of scores) {
    if (!Number.isFinite(score) || score < last) return false;
    last = score;
  }
  return true;
}

function dispatch(worker: Worker, entries: Pending[], interactive: boolean): void {
  const batch = { worker, entries, interactive };
  running.add(batch);
  const finish = (references: readonly QualityReference[] = []) => {
    if (!running.delete(batch)) return;
    const answers = new Map(references.map((reference) => [reference.key, reference]));
    for (const entry of entries) {
      const answer = answers.get(entry.request.key);
      settle(entry, answer && validScores(answer.scores) ? answer : null);
    }
    schedule({ worker, interactive });
  };
  worker.onmessage = ({ data }: MessageEvent<RuneReferenceWorkerResponse>) => {
    if (data.type === 'prepared') finish(data.references);
    else {
      if (!running.delete(batch)) return;
      worker.terminate();
      for (const entry of entries) settle(entry, null);
      schedule();
    }
  };
  worker.onerror = () => {
    worker.terminate();
    if (!running.delete(batch)) return;
    for (const entry of entries) settle(entry, null);
    schedule();
  };
  const message: RuneReferenceWorkerRequest = { type: 'prepare', requests: entries.map(({ request }) => request) };
  try { worker.postMessage(message); } catch { worker.onerror?.(new ErrorEvent('error')); }
}

function schedule(reusable?: Pick<Batch, 'worker' | 'interactive'>): void {
  const queued = new Map<string, Pending[]>();
  const active = new Set([...running].flatMap(({ entries }) => entries));
  for (const entry of pending.values()) {
    if (entry.leases === 0 || active.has(entry)) continue;
    const key = referencePieceKey(entry.request);
    const group = queued.get(key) ?? [];
    group.push(entry);
    queued.set(key, group);
  }
  const interactive = (entry: Pending) => entry.interactiveLeases > 0;
  const groups = [...queued.values()].sort((left, right) => Number(right.some(interactive)) - Number(left.some(interactive)));
  for (const group of groups) {
    group.sort((left, right) => Number(interactive(right)) - Number(interactive(left)));
    for (let at = 0; at < group.length; at += batchSize) {
      const entries = group.slice(at, at + batchSize);
      const urgent = entries.some(interactive);
      if (running.size >= poolSize && (!urgent || [...running].some((batch) => batch.interactive))) break;
      try {
        const reuse = reusable?.interactive === urgent;
        const worker = reuse ? reusable!.worker : workerFactories().runeReference(urgent);
        if (reuse) reusable = undefined;
        dispatch(worker, entries, urgent);
      } catch {
        for (const entry of entries) settle(entry, null);
      }
    }
  }
  reusable?.worker.terminate();
}

function clearRuneReferences(): void {
  for (const { worker } of running) worker.terminate();
  running.clear();
  for (const entry of pending.values()) settle(entry, null);
  cache.clear();
}
registerAccountJobReset(clearRuneReferences);

/** Pin the requested arrays for the caller. A cancelled caller releases only its own work. */
export function leaseRuneReferences(
  requests: readonly ReferenceRequest[], onProgress?: (fraction: number | null) => void, interactive = false,
) {
  let released = false;
  const held: Pending[] = [];
  const prepared = new Map<string, QualityReference>();
  const missing: ReferenceRequest[] = [];
  for (const request of requests) {
    const cached = cache.get(request.key);
    if (!cached) missing.push(request);
    else {
      rememberReference(cache, request.key, cached, retainedReferenceCount);
      prepared.set(request.key, cached);
    }
  }

  let retain = requests.length > retainedReferenceCount ? Math.max(0, retainedReferenceCount - cache.size) : Infinity;
  for (const request of missing) {
    let entry = pending.get(request.key);
    if (!entry) {
      let finish: Pending['finish'] = () => {};
      const ready = new Promise<QualityReference | null>((resolve) => { finish = resolve; });
      entry = { request, ready, finish, leases: 0, interactiveLeases: 0, retain: retain > 0 };
      retain -= 1;
      pending.set(request.key, entry);
    }
    entry.leases += 1;
    if (interactive) entry.interactiveLeases += 1;
    held.push(entry);
  }
  const ready = Promise.resolve().then(async () => {
    if (held.length > 0 && !released) onProgress?.(prepared.size / requests.length);
    await Promise.all(held.map(async (entry) => {
      const answer = await entry.ready;
      if (!answer || released) throw new Error('Rune quality references were not prepared.');
      prepared.set(answer.key, answer);
      onProgress?.(prepared.size / requests.length);
    }));
    if (!released && held.length > 0) onProgress?.(null);
    return prepared;
  });
  if (interactive) {
    // A shared miss can be waiting in a background worker. Promote its batch
    // without replacing the promises or abandoning any other caller's lease.
    for (const batch of running) {
      if (batch.interactive || !batch.entries.some((entry) => entry.interactiveLeases > 0)) continue;
      batch.worker.terminate();
      running.delete(batch);
    }
  }
  if (held.length > 0) schedule();
  return {
    ready,
    release() {
      if (released) return;
      released = true;
      for (const entry of held) {
        entry.leases -= 1;
        if (interactive) entry.interactiveLeases -= 1;
        if (entry.leases === 0) settle(entry, null);
      }
      for (const batch of running) {
        if (batch.entries.some((entry) => entry.leases > 0)) continue;
        batch.worker.terminate();
        running.delete(batch);
      }
      schedule();
    },
  };
}
