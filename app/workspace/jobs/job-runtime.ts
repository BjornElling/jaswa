import { cancellableWorker } from './cancellable-worker';

export type JobRuntime<TMessage extends Record<string, unknown>, TResult> = {
  run(message: TMessage, signal?: AbortSignal): Promise<TResult>;
};

export type JobRuntimeOptions = {
  /** Some callers fan one semantic calculation out into independent requests. */
  allowConcurrent?: boolean;
};

/**
 * Shared request routing around a job-specific worker protocol: numbered
 * requests, the caller's abort signal, and — unless the caller fans one
 * question out — latest-request-wins, so a superseded question cannot publish
 * over a newer one (`ARCHITECTURE-FROM-SCRATCH.md` §11.2). It holds no answer:
 * each consumer keeps its own result and staleness, so cancelling one panel
 * never touches another's (§22.4), and no finished result outlives its reader.
 */
export function createJobRuntime<TMessage extends Record<string, unknown>, TResult>(
  createWorker: () => Worker,
  startFailure: string,
  options: JobRuntimeOptions = {},
): JobRuntime<TMessage, TResult> {
  const ask = cancellableWorker<TResult>(createWorker, startFailure);
  if (options.allowConcurrent === true) return { run: (message, signal) => ask(message, signal) };
  let latest: AbortController | null = null;
  return {
    run(message, signal) {
      latest?.abort();
      const controller = new AbortController();
      latest = controller;
      const onAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', onAbort, { once: true });
      return ask(message, controller.signal).finally(() => {
        signal?.removeEventListener('abort', onAbort);
        if (latest === controller) latest = null;
      });
    },
  };
}
