/**
 * What crosses the thread boundary for a Rune Optimization calculation.
 *
 * One worker prepares the raw input once. The client then hands the prepared
 * problem to each search part: craft variants, exact reductions and guidance
 * need neither eight copies of their temporary pool nor eight executions.
 */
import type { EndStateLine } from '../rune-craft-end-state';
import type { RuneOptimizationInput, RuneOptimizationProblem } from '../rune-optimization-problem';
import type { FoundBuild, SearchOutcome } from '../rune-optimization-search';
import type { CalculationBackend } from './calculation-summary';

export type RuneOptimizationRequest = {
  problem: RuneOptimizationProblem;
  /** Which share of the first open slot this worker searches, of `parts`. */
  part: number;
  parts: number;
  /** The user's own setting, handed on to the one rule that weighs it. */
  preferWebGpu: boolean;
};

/** One rune of a found build, in the end state the build counts it in. */
export type PickedRune = {
  runeId: string;
  slot: number;
  setId: number;
  mainValue: number;
  lines: readonly EndStateLine[];
  gemmedAt: number;
  groundAt: readonly number[];
  /** Held stacks spent, by craft item id. */
  spends: readonly string[];
  moves: boolean;
  locked: boolean;
};

/**
 * A found build as the page reads it. Its `figures` are the ones the table shows and
 * every range judges: each stat the copy's own, each composite with its fight.
 */
export type OptimizedBuild = FoundBuild & { runes: PickedRune[] };

export type RuneOptimizationAnswer = Omit<SearchOutcome, 'builds'> & {
  builds: OptimizedBuild[];
  tieBreakers: RuneOptimizationProblem['tieBreakers'];
  report: RuneOptimizationProblem['report'];
  backend: CalculationBackend;
  durationMs: number;
};

/* `bar` is the highest bar any other part of the same search has reached, relayed by
   the client, so every part prunes against the best table found anywhere (§6.5). */
export type RuneOptimizationWorkerRequest =
  | { type: 'prepare'; input: RuneOptimizationInput }
  | { type: 'stop' }
  | { type: 'calculate'; requestId: number; request: RuneOptimizationRequest }
  | { type: 'bar'; value: number };

export type RuneOptimizationWorkerResponse =
  | { type: 'phase'; phase: RuneOptimizationPhase }
  | { type: 'prepared'; problem: RuneOptimizationProblem }
  | { type: 'progress'; requestId: number; fraction: number }
  | { type: 'bar'; requestId: number; value: number }
  | { type: 'result'; requestId: number; answer: RuneOptimizationAnswer }
  | { type: 'error'; requestId: number; message: string };

export type RuneOptimizationPhase = 'candidates' | 'reducing' | 'guiding' | 'searching' | 'retrying';

/** As Rune Clean-up's: a replaced or cancelled calculation is neither a result nor a failure. */
export type RuneOptimizationOutcome =
  | { status: 'done'; answer: RuneOptimizationAnswer }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };
