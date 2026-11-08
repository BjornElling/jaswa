/**
 * A worker that answers numbered requests one promise each, any of which the
 * page may cancel.
 *
 * A worker cannot drop one request it is already working on, so cancelling
 * replaces the worker, and every other request still waiting is asked again of
 * the new one. That keeps a cancel on one panel from failing a calculation
 * another panel is waiting on, which the shared worker would otherwise do.
 */

/** A calculation the user stopped: neither a result nor a failure. */
export class CalculationCancelled extends Error {
  constructor() {
    super('The calculation was cancelled.');
    this.name = 'CalculationCancelled';
  }
}

export const isCalculationCancelled = (error: unknown): error is CalculationCancelled => error instanceof CalculationCancelled;

type Response<T> = { requestId: number } & ({ type: 'result'; result: T } | { type: 'error'; message: string });
type Pending<T> = { message: Record<string, unknown>; resolve: (value: T) => void; reject: (error: Error) => void };

export function cancellableWorker<T>(create: () => Worker, startFailure: string) {
  let worker: Worker | undefined;
  let nextRequestId = 1;
  const pending = new Map<number, Pending<T>>();

  function failAll(message: string) {
    const waiting = [...pending.values()];
    pending.clear();
    for (const entry of waiting) entry.reject(new Error(message));
  }

  function live(): Worker {
    if (worker) return worker;
    const started = create();
    started.addEventListener('message', (event: MessageEvent<Response<T>>) => {
      if (started !== worker) return;
      const entry = pending.get(event.data.requestId);
      if (!entry) return;
      pending.delete(event.data.requestId);
      if (event.data.type === 'error') entry.reject(new Error(event.data.message));
      else entry.resolve(event.data.result);
    });
    /* A worker that fails to start or dies takes every request with it, and the
       next one starts a fresh worker rather than inheriting a dead one. */
    started.addEventListener('error', () => {
      started.terminate();
      if (worker !== started) return;
      worker = undefined;
      failAll(startFailure);
    });
    worker = started;
    return started;
  }

  function post(requestId: number, entry: Pending<T>) {
    try {
      live().postMessage({ ...entry.message, requestId });
    } catch {
      pending.delete(requestId);
      entry.reject(new Error(startFailure));
    }
  }

  return function ask(message: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new CalculationCancelled());
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise<T>((resolve, reject) => {
      const entry: Pending<T> = { message, resolve, reject };
      pending.set(requestId, entry);
      signal?.addEventListener('abort', () => {
        if (!pending.delete(requestId)) return;
        reject(new CalculationCancelled());
        worker?.terminate();
        worker = undefined;
        for (const [otherId, other] of pending) post(otherId, other);
      }, { once: true });
      post(requestId, entry);
    });
  };
}
