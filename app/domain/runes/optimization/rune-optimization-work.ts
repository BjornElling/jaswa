import { craftAllocation } from './rune-optimization-craft-allocation';
import type { RuneOptimizationProblem } from './rune-optimization-problem';
import type { SearchOutcome } from './rune-optimization-search';
import { calculationBackendLabel, combineCalculationBackends } from '../../shared/calculation-summary';
import type { CalculationBackend } from '../../shared/calculation-summary';

export type WorkSample = {
  complete: boolean; durationMs: number; backend: CalculationBackend;
};
export type RuneOptimizationWork = {
  kind: 'complete' | 'sampled' | 'uncertain';
  backend: CalculationBackend;
  /** A sampling envelope, not a confidence interval or a completion promise. */
  lowerMs?: number; upperMs?: number;
  durationMs?: number;
  slots: number[];
  combinations: number;
  variants: number;
  physicalRunes: number;
  figures: number;
  ceilings: number;
  freeSlots: number;
};

/** Read the very same recipe pool the search traverses, including held-item allocation. */
export function runeOptimizationWorkPool(problem: RuneOptimizationProblem) {
  const effective = craftAllocation(problem)?.problem ?? problem;
  const slots = effective.slots.map((slot) => slot.length);
  const sorted = [...slots].sort((a, b) => a - b);
  const split = sorted.findIndex((count) => count > 1);
  const width = slots.includes(0) || split < 0 || split >= 4 ? 1 : sorted[split];
  return {
    width,
    slots,
    combinations: slots.reduce((product, count) => product * count, 1),
    variants: problem.slots.reduce((sum, slot) => sum + slot.length, 0),
    physicalRunes: problem.slots.reduce((sum, slot) => sum + new Set(slot.map((rune) => rune.runeId)).size, 0),
    figures: problem.targets.reduce((sum, target, at) => sum + (Number.isFinite(target)
      || Number.isFinite(problem.ceilings[at]) || at === problem.rank ? 1 : 0), 0),
    ceilings: problem.ceilings.reduce((sum, ceiling) => sum + (Number.isFinite(ceiling) ? 1 : 0), 0),
    freeSlots: problem.builds === null ? 6 : problem.builds.reduce((most, build) => Math.max(most, build.free), 0),
  };
}

/** Uneven or unfinished samples cannot substantiate a timing recommendation. */
export function assessRuneOptimizationSamples(
  pool: ReturnType<typeof runeOptimizationWorkPool>, samples: readonly WorkSample[], shares: number, workers: number,
): RuneOptimizationWork {
  const base = { ...pool, backend: combineCalculationBackends(samples.map((sample) => sample.backend)) };
  if (samples.length < 3 || samples.some((sample) => !sample.complete)) return { ...base, kind: 'uncertain' };
  const times = samples.map((sample) => sample.durationMs);
  const low = Math.min(...times); const high = Math.max(...times);
  // Setup is repeated in each trial share; shared bars can only improve the real search.
  // A wide envelope and a variation gate keep that overhead from becoming a false alarm.
  if (low < 5 || high > low * 4) return { ...base, kind: 'uncertain' };
  return {
    ...base, kind: 'sampled',
    lowerMs: low * shares / Math.min(workers, pool.width) / 2,
    upperMs: high * shares / Math.min(workers, pool.width) * 2,
  };
}

/** The trial uses the real engine and its normal card agreement gate, never a speed multiplier. */
export async function trialRuneOptimizationWork(
  problem: RuneOptimizationProblem, workers: number,
  search: (problem: RuneOptimizationProblem, part: number, parts: number) => Promise<{
    outcome: SearchOutcome; backend: CalculationBackend; durationMs?: number;
  }>,
  now: () => number = () => performance.now(),
): Promise<RuneOptimizationWork> {
  const pool = runeOptimizationWorkPool(problem);
  let started = now();
  const full = await search({ ...problem, timeLimitMs: 500 }, 0, 1);
  const durationMs = full.durationMs ?? now() - started;
  if (full.outcome.complete) return { ...pool, kind: 'complete', durationMs, backend: full.backend };
  if (pool.width < 3) return { ...pool, kind: 'uncertain', backend: full.backend };
  const shares = pool.width;
  // Spread the sample across the ordered branches, instead of timing only its strongest runes.
  const parts = [0, Math.floor(shares / 2), shares - 1];
  const samples: WorkSample[] = [];
  for (const part of parts) {
    started = now();
    const answer = await search({ ...problem, timeLimitMs: 250 }, part, shares);
    samples.push({ complete: answer.outcome.complete, durationMs: answer.durationMs ?? now() - started, backend: answer.backend });
  }
  return assessRuneOptimizationSamples(pool, samples, shares, workers);
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;
const elapsed = (ms: number) => ms < 1000 ? 'under 1 s' : seconds(ms);
export function runeOptimizationWorkWarning(work: RuneOptimizationWork | undefined, timeLimitMs: number): {
  tone: 'warn' | 'bad' | null; text: string;
} {
  if (!work) return { tone: null, text: 'Checking the actual search…' };
  const engine = calculationBackendLabel(work.backend);
  if (work.kind === 'complete') return {
    tone: null, text: `This search finished in ${elapsed(work.durationMs ?? 0)} on ${engine}. Preparation is additional.`,
  };
  if (work.kind === 'uncertain') return {
    tone: null, text: `Trial on ${engine}: completion time is uncertain. The combination count alone cannot predict it.`,
  };
  const lower = work.lowerMs ?? 0; const upper = work.upperMs ?? 0;
  const tone = lower > timeLimitMs * 4 ? 'bad' : lower > timeLimitMs ? 'warn' : null;
  return {
    tone, text: `Sample on ${engine}: about ${seconds(lower)}–${seconds(upper)}, plus preparation. ${tone
      ? 'May reach the limit; builds found are kept.' : 'Branches vary; this is not a guarantee.'}`,
  };
}

export function runeOptimizationFinishedWarning(answer: {
  complete: boolean; durationMs: number; backend: CalculationBackend;
}): { tone: 'bad' | null; text: string } {
  return answer.complete ? {
    tone: null, text: `Last run finished in ${elapsed(answer.durationMs)} on ${calculationBackendLabel(answer.backend)}.`,
  } : {
    tone: 'bad', text: 'This search reached its time limit. Builds found are kept; try a smaller shortlist or fewer craft alternatives.',
  };
}
