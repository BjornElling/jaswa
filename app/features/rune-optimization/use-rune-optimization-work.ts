import { useEffect, useRef, useState } from 'react';
import type { RuneOptimizationInput, RuneOptimizationProblem } from '../../domain/runes/optimization/rune-optimization-problem';
import type { RuneOptimizationWork } from '../../domain/runes/optimization/rune-optimization-work';
import { estimateRuneOptimizationWork } from '../../workspace/jobs/rune-optimization-work-client';
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
    let stopped = false;
    let estimate: { cancel(): void } | undefined;
    const stop = () => { stopped = true; clearTimeout(timer); estimate?.cancel(); };
    const timer = setTimeout(() => {
      const job = estimateRuneOptimizationWork(input, preferWebGpu);
      estimate = job;
      void job.result.then((answer) => {
        if (stopped) return;
        stopped = true;
        setEvidence(answer === 'failed' ? { input, preferWebGpu, failed: true } : { input, preferWebGpu, problem: answer.problem, work: answer.work });
      });
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
