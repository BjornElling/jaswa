/**
 * What crosses the thread boundary for a Rune Clean-up calculation.
 *
 * `runeAdvice`'s inputs are already plain data — runes, presets, settings and a
 * `Map` of reference lines — and its output is a `Map` of plain records, so both
 * are structurally cloneable as they stand and no serialisation contract had to
 * be invented. These types exist to keep the client and the worker honest about
 * that rather than to reshape anything.
 */
import type { Rune } from '../runes';
import type { RunePotentialPreset } from '../rune-potential-presets';
import type { ReferenceStats } from '../rune-reference-stats';
import type { RunePotentialSettings } from '../types';
import type { RuneAdvice } from '../rune-cleanup-advice';

export type RuneAdviceRequest = {
  runes: readonly Rune[];
  presets: readonly RunePotentialPreset[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats>;
};

export type RuneAdviceWorkerRequest = {
  type: 'calculate';
  requestId: number;
  request: RuneAdviceRequest;
};

export type RuneAdviceWorkerResponse =
  | { type: 'result'; requestId: number; advice: Map<string, RuneAdvice>; durationMs: number }
  | { type: 'error'; requestId: number; message: string };

/**
 * What the page is allowed to do with an answer.
 *
 * `superseded` is a third outcome rather than a rejected promise on purpose: a
 * calculation the user replaced is not a failure, and it must never reach the
 * table — a late result from an earlier settings state would quietly overwrite a
 * newer one. A cancelled calculation is superseded too, and is never recorded as
 * a completed one.
 */
export type RuneAdviceOutcome =
  | { status: 'done'; advice: Map<string, RuneAdvice>; durationMs: number }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };
