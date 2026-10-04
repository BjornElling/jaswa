/**
 * Rune Optimization's search, on whichever engine the user's setting allows.
 *
 * Thin on purpose, like `rune-chance-engine.ts`: the decision of *which* engine
 * belongs to `accelerated-calculation.ts`, the search to
 * `rune-optimization-search.ts` and the card's packing to its own backend. What is
 * left is the one statement tying them together.
 *
 * The card takes the tail — the last two slots' pairs, block by block — and hands
 * back a shortlist the processor judges pair by pair (`RUNE-OPTIMIZATION.md` §7). The
 * tree above it is decisions all the way down and stays on the processor, which is
 * why the status line can say `Graphics card` while every core is also busy.
 */
import { searchRuneBuildsInPasses, searchRuneBuildsInSlices } from '../rune-optimization-search';
import type { SearchHooks, SearchOutcome } from '../rune-optimization-search';
import type { RuneOptimizationProblem } from '../rune-optimization-problem';
import { runAccelerated } from './accelerated-calculation';
import type { AcceleratedCalculation } from './accelerated-calculation';
import {
  runeOptimizationAgreement, runeOptimizationPassLimits, tailCardOnGpu,
} from './backends/webgpu-rune-optimization-backend';
import { combineCalculationBackends } from './calculation-summary';
import type { CalculationBackend } from './calculation-summary';

type SearchRequest = {
  problem: RuneOptimizationProblem;
  part: number;
  parts: number;
  hooks: SearchHooks;
};

/* `processorTook` is a card that answered some passes and then refused one: the rest
   of the tail ran on the processor, and the status line has to say both. */
type SearchAnswer = { outcome: SearchOutcome; processorTook: boolean };

const runeOptimizationSearch: AcceleratedCalculation<SearchRequest, SearchAnswer> = {
  name: 'rune-optimization',
  cpu: async ({ problem, part, parts, hooks }) => ({
    outcome: await searchRuneBuildsInSlices(problem, part, parts, hooks), processorTook: false,
  }),
  gpu: ({ problem, part, parts, hooks }, context) => searchRuneBuildsInPasses(
    problem, (question) => tailCardOnGpu(question, context), runeOptimizationPassLimits, part, parts, hooks,
  ),
  agrees: runeOptimizationAgreement,
};

export async function searchRuneBuildsAccelerated(
  request: SearchRequest, preferWebGpu: boolean,
): Promise<{ outcome: SearchOutcome; backend: CalculationBackend }> {
  const answer = await runAccelerated(runeOptimizationSearch, request, preferWebGpu);
  const backend = answer.result.processorTook ? combineCalculationBackends([answer.backend, 'cpu']) : answer.backend;
  return { outcome: answer.result.outcome, backend };
}

/** Charge each branch for search work, rather than multiplying per-worker setup. */
export async function timeRuneBuildSearch(
  problem: RuneOptimizationProblem, part: number, parts: number, preferWebGpu: boolean,
) {
  let started: number | undefined;
  const answer = await searchRuneBuildsAccelerated({ problem, part, parts, hooks: { now: () => {
    const time = performance.now(); started ??= time; return time;
  } } }, preferWebGpu);
  return { ...answer, durationMs: performance.now() - (started ?? performance.now()) };
}
