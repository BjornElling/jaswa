/**
 * The Rune Simulator's worker boundary.
 *
 * The configuration and context are plain structured-cloneable data, including
 * the reference-stat Map. The random source is intentionally not part of the
 * request: the page uses the worker's own random stream, while domain checks may
 * still call simulateRunes directly with a controlled source.
 */
import type {
  SimulatedRune, RuneSimulationConfig, RuneSimulationContext, RuneSimulationResult,
} from './rune-simulator';
import type { QualityReference } from '../cleanup/rune-quality-reference';
import type { CalculationBackend } from '../../shared/calculation-summary';

export type RuneSimulationWorkerRequest = {
  type: 'simulate';
  requestId: number;
  config: RuneSimulationConfig;
  context: RuneSimulationContext;
  births: readonly SimulatedRune[];
  references: ReadonlyMap<string, QualityReference> | null;
};

export type RuneSimulationWorkerResponse =
  | { type: 'result'; requestId: number; result: RuneSimulationResult; backend: CalculationBackend }
  | { type: 'error'; requestId: number; message: string };
