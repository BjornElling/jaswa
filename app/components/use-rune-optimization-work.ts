import { useEffect, useRef, useState } from 'react';
import type { RuneOptimizationInput, RuneOptimizationProblem } from '../lib/rune-optimization-problem';
import type { RuneOptimizationWork } from '../lib/rune-optimization-work';
import { searchWorkerCount } from '../lib/compute/rune-optimization-client';
import type { RuneOptimizationAnswer } from '../lib/compute/rune-optimization-protocol';

/** Debounce edits, cancel stale trials, and give a requested search all of the machine. */
export function useRuneOptimizationWork(input: RuneOptimizationInput | undefined, preferWebGpu: boolean, calculating: boolean) {
  const [evidence, setEvidence] = useState<{
    input: RuneOptimizationInput; preferWebGpu: boolean;
    work?: RuneOptimizationWork; problem?: RuneOptimizationProblem; failed?: boolean;
    finished?: RuneOptimizationAnswer;
  }>();
  const cancel = useRef<() => void>(() => {});
  const current = evidence?.input === input && evidence?.preferWebGpu === preferWebGpu ? evidence : undefined;
  useEffect(() => {
    if (!input || calculating || current) return;
    let worker: Worker | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true; clearTimeout(timer); clearTimeout(watchdog); worker?.terminate();
    };
    const fail = () => {
      if (stopped) return;
      setEvidence({ input, preferWebGpu, failed: true }); stop();
    };
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL('../lib/compute/rune-optimization-work-worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<{ problem: RuneOptimizationProblem; work: RuneOptimizationWork; failed?: boolean }>) => {
          if (stopped) return;
          if (event.data.failed) { fail(); return; }
          setEvidence({ input, preferWebGpu, problem: event.data.problem, work: event.data.work }); stop();
        };
        worker.onerror = fail;
        worker.postMessage({ input, preferWebGpu, workers: searchWorkerCount() });
        // A hard ceiling also covers preparation and driver calls, outside the search clock.
        watchdog = setTimeout(fail, 20_000);
      } catch { fail(); }
    }, 750);
    cancel.current = stop;
    return stop;
  }, [input, preferWebGpu, calculating, current]);
  return {
    ...current, cancel: () => cancel.current(),
    record: (finished: RuneOptimizationAnswer) => {
      if (input && finished.stoppedBy !== 'user') setEvidence({ ...current, input, preferWebGpu, finished });
    },
  };
}
