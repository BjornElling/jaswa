import { useEffect, useRef, useState } from 'react';
import { createRuneOptimizationWorkWorker } from '../../platform/feature-workers';
import type { RuneOptimizationInput, RuneOptimizationProblem } from '../../domain/runes/optimization/rune-optimization-problem';
import type { RuneOptimizationWork } from '../../domain/runes/optimization/rune-optimization-work';
import { searchWorkerCount } from '../../platform/compute/rune-optimization-client';
import type { RuneOptimizationAnswer } from '../../domain/runes/optimization/rune-optimization-protocol';

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
        worker = createRuneOptimizationWorkWorker();
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
