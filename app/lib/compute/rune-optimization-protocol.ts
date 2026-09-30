/**
 * What crosses the thread boundary for a Rune Optimization calculation.
 *
 * The request is the raw input — one monster, the account's runes and craft items,
 * the requirements and the settings — rather than a prepared problem. Every worker
 * prepares the same problem from it, deterministically, and searches its own share:
 * preparing is milliseconds against a search of seconds, and sending the input
 * keeps one module, `rune-optimization-problem.ts`, the only place a candidate is
 * made.
 */
import type { EndStateLine } from '../rune-craft-end-state';
import type { RuneOptimizationInput, RuneOptimizationProblem } from '../rune-optimization-problem';
import type { FoundBuild, SearchOutcome } from '../rune-optimization-search';
import type { CalculationBackend } from './calculation-summary';

export type RuneOptimizationRequest = {
  input: RuneOptimizationInput;
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

export type OptimizedBuild = FoundBuild & { runes: PickedRune[] };

export type RuneOptimizationAnswer = Omit<SearchOutcome, 'builds'> & {
  builds: OptimizedBuild[];
  report: RuneOptimizationProblem['report'];
  backend: CalculationBackend;
  durationMs: number;
};

/* `bar` is the highest bar any other part of the same search has reached, relayed by
   the client, so every part prunes against the best table found anywhere (§6.5). */
export type RuneOptimizationWorkerRequest =
  | { type: 'calculate'; requestId: number; request: RuneOptimizationRequest }
  | { type: 'bar'; value: number };

export type RuneOptimizationWorkerResponse =
  | { type: 'progress'; requestId: number; fraction: number }
  | { type: 'bar'; requestId: number; value: number }
  | { type: 'result'; requestId: number; answer: RuneOptimizationAnswer }
  | { type: 'error'; requestId: number; message: string };

/** As Rune Clean-up's: a replaced or cancelled calculation is neither a result nor a failure. */
export type RuneOptimizationOutcome =
  | { status: 'done'; answer: RuneOptimizationAnswer }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };
