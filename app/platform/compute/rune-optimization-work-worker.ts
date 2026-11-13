/// <reference lib="webworker" />
import { prepareRuneOptimization } from '../../domain/runes/optimization/rune-optimization-problem';
import type { RuneOptimizationInput } from '../../domain/runes/optimization/rune-optimization-problem';
import { trialRuneOptimizationWork } from '../../domain/runes/optimization/rune-optimization-work';
import { timeRuneBuildSearch } from './rune-optimization-engine';

self.onmessage = async (event: MessageEvent<{ input: RuneOptimizationInput; preferWebGpu: boolean; workers: number }>) => {
  try {
    const { input, preferWebGpu, workers } = event.data;
    const problem = prepareRuneOptimization(input);
    const work = await trialRuneOptimizationWork(problem, workers, async (problem, part, parts) => {
      const { outcome, backend, durationMs } = await timeRuneBuildSearch(problem, part, parts, preferWebGpu);
      return { outcome, backend, durationMs };
    });
    self.postMessage({ problem, work });
  } catch {
    self.postMessage({ failed: true });
  }
};
