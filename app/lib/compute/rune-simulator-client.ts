import { createRuneSimulatorWorker } from '../../platform/feature-workers';
/**
 * The page's one way to ask for a Rune Simulator run.
 *
 * The simulator is an experiment rather than a latest-request-wins table, so
 * the page runs one at a time; a run can be cancelled, and the worker is
 * recovered after a startup error, so the next run does not inherit a dead
 * Worker object.
 */
import type { RuneSimulationResult } from '../rune-simulator';
import { cancellableWorker } from '../../platform/cancellable-worker';
import type { RuneSimulationWorkerRequest } from './rune-simulator-protocol';

const ask = cancellableWorker<RuneSimulationResult>(
  () => createRuneSimulatorWorker(),
  'JASWA could not start its rune simulation worker.',
);

/** An aborted `signal` rejects the run with `CalculationCancelled`. */
export function calculateRuneSimulation(
  config: RuneSimulationWorkerRequest['config'],
  context: RuneSimulationWorkerRequest['context'],
  signal?: AbortSignal,
): Promise<RuneSimulationResult> {
  return ask({ type: 'simulate', config, context }, signal);
}
