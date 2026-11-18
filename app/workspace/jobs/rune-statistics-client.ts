import { registerAccountJobReset } from './account-job-memory';
import { calculationMemory } from './calculation-memory';
import { runeAdviceChannel } from './rune-advice-client';
import { runeCalculationKey } from '../../domain/runes/rune-calculation-inputs';
import { runeStatisticsSamples, summarizeRuneStatistics } from '../../domain/runes/cleanup/rune-cleanup-statistics';
import type { RuneStatisticsOutcome, RuneStatisticsRequest } from '../../domain/runes/cleanup/rune-statistics-protocol';

type CompletedStatistics = Extract<RuneStatisticsOutcome, { status: 'done' }>;
const answers = calculationMemory<CompletedStatistics>(4);
const channel = runeAdviceChannel();
let active: { key: string; promise: Promise<RuneStatisticsOutcome> } | undefined;

export const rememberedRuneStatistics = (request: RuneStatisticsRequest): CompletedStatistics | undefined =>
  answers.read(runeCalculationKey(request));

export function cancelRuneStatistics(): void {
  active = undefined;
  channel.cancel();
}

export function clearRuneStatistics(): void {
  cancelRuneStatistics();
  answers.clear();
}
registerAccountJobReset(clearRuneStatistics);

/** Navigation can rejoin unfinished work; a genuinely different request supersedes it. */
export function calculateRuneStatistics(request: RuneStatisticsRequest): Promise<RuneStatisticsOutcome> {
  const key = runeCalculationKey(request);
  const known = answers.read(key);
  if (known) {
    if (active?.key !== key) cancelRuneStatistics();
    return Promise.resolve(known);
  }
  if (active?.key === key) return active.promise;
  const startedAt = performance.now();
  const stages = runeStatisticsSamples();
  const promise = channel.calculate({ ...request, runes: stages.flat(), reuseOutcomeScores: true }).then((answer): RuneStatisticsOutcome => {
    if (active?.promise !== promise) return { status: 'superseded' };
    active = undefined;
    if (answer.status !== 'done') return answer;
    const statistics = summarizeRuneStatistics(stages, answer.advice, request.settings, performance.now() - startedAt);
    const outcome = { status: 'done' as const, statistics, backend: answer.backend };
    answers.remember(key, outcome);
    return outcome;
  });
  active = { key, promise };
  return promise;
}
