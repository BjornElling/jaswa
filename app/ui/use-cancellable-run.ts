import { useRef, useState } from 'react';

/**
 * The cancel half of a calculation that runs through `cancellableWorker`.
 *
 * `start` hands each run its own signal; `cancel` aborts it and remembers the
 * question it was asked under. `cancelledHere` stays true until that question
 * changes, so a view that recalculates by itself on a stale answer does not
 * start again the very work the user just stopped.
 */
export function useCancellableRun(questionKey: string) {
  const controller = useRef<AbortController | null>(null);
  const [cancelledKey, setCancelledKey] = useState<string | null>(null);
  return {
    start(): AbortSignal {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      return next.signal;
    },
    cancel() {
      controller.current?.abort();
      controller.current = null;
      setCancelledKey(questionKey);
    },
    cancelledHere: cancelledKey === questionKey,
  };
}
