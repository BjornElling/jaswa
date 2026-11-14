import { CalculationCancelled, cancellableWorker } from './cancellable-worker';

export type JobActivity = 'idle' | 'running' | 'stopped' | 'failed';
export type JobExecution = 'processor' | 'graphics-card' | 'mixed';
export type JobState<TResult> = {
  activity: JobActivity;
  result: TResult | null;
  progress: number;
  error: string | null;
  execution: JobExecution | null;
};

export type JobRuntime<TMessage extends Record<string, unknown>, TResult> = {
  run(message: TMessage, signal?: AbortSignal): Promise<TResult>;
  cancel(): void;
  getState(): JobState<TResult>;
  subscribe(listener: () => void): () => void;
};

export type JobRuntimeOptions = {
  /** Some callers fan one semantic calculation out into independent requests. */
  allowConcurrent?: boolean;
};

/**
 * Shared lifecycle around a job-specific worker protocol. It owns only request
 * routing, cancellation and held-result state; preparation and calculation stay
 * in the job's domain client and worker.
 */
export function createJobRuntime<TMessage extends Record<string, unknown>, TResult>(
  createWorker: () => Worker,
  startFailure: string,
  options: JobRuntimeOptions = {},
): JobRuntime<TMessage, TResult> {
  const ask = cancellableWorker<TResult>(createWorker, startFailure);
  const allowConcurrent = options.allowConcurrent === true;
  const listeners = new Set<() => void>();
  let state: JobState<TResult> = { activity: 'idle', result: null, progress: 0, error: null, execution: null };
  let activeAbort: AbortController | null = null;
  const activeControllers = new Set<AbortController>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  return {
    run(message, signal) {
      if (!allowConcurrent) activeAbort?.abort();
      const controller = new AbortController();
      if (allowConcurrent) activeControllers.add(controller);
      else activeAbort = controller;
      let detachSignal = () => {};
      if (signal) {
        if (signal.aborted) controller.abort();
        else {
          const onAbort = () => controller.abort();
          signal.addEventListener('abort', onAbort, { once: true });
          detachSignal = () => signal.removeEventListener('abort', onAbort);
        }
      }
      state = { ...state, activity: 'running', error: null, progress: 0 };
      notify();
      return ask(message, controller.signal).then((result) => {
        detachSignal();
        if (allowConcurrent) activeControllers.delete(controller);
        if (allowConcurrent || activeAbort === controller) {
          if (!allowConcurrent) activeAbort = null;
          const stillRunning = allowConcurrent && activeControllers.size > 0;
          if (stillRunning) {
            state = { ...state, result, progress: 1, error: null };
            notify();
            return result;
          }
          state = { ...state, activity: 'idle', result, progress: 1, error: null };
          notify();
        }
        return result;
      }).catch((error: unknown) => {
        detachSignal();
        if (allowConcurrent) activeControllers.delete(controller);
        if (allowConcurrent || activeAbort === controller) {
          if (!allowConcurrent) activeAbort = null;
          const stopped = error instanceof CalculationCancelled;
          const stillRunning = allowConcurrent && activeControllers.size > 0;
          state = stillRunning
            ? { ...state, error: stopped ? null : (error instanceof Error ? error.message : startFailure) }
            : { ...state, activity: stopped ? 'stopped' : 'failed', error: stopped ? null : (error instanceof Error ? error.message : startFailure) };
          notify();
        }
        throw error;
      });
    },
    cancel() {
      if (allowConcurrent) {
        for (const controller of activeControllers) controller.abort();
      } else {
        activeAbort?.abort();
      }
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
