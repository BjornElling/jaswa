/**
 * The Rune Simulator's worker boundary.
 *
 * The configuration and context are plain structured-cloneable data, including
 * the reference-stat Map. The random source is intentionally not part of the
 * request: the page uses the worker's own random stream, while domain checks may
 * still call simulateRunes directly with a controlled source.
 */
import type {
  RuneSimulationConfig, RuneSimulationContext, RuneSimulationResult,
} from '../rune-simulator';
import type { CalculationBackend } from './calculation-summary';

export type RuneSimulationWorkerRequest = {
  type: 'simulate';
  requestId: number;
  config: RuneSimulationConfig;
  context: RuneSimulationContext;
};

export type RuneSimulationWorkerResponse =
  | { type: 'result'; requestId: number; result: RuneSimulationResult; backend: CalculationBackend }
  | { type: 'error'; requestId: number; message: string };
