import { createRuneSimulatorWorker } from '../rune-simulator-factory';
/**
 * The page's one way to ask for a Rune Simulator run.
 *
 * The simulator is an experiment rather than a latest-request-wins table, so
 * the page runs one at a time; a run can be cancelled, and the worker is
 * recovered after a startup error, so the next run does not inherit a dead
 * Worker object.
 */
import type { RuneSimulationResult } from '../../domain/runes/simulator/rune-simulator';
import { createJobRuntime } from '../job-runtime';
import type { RuneSimulationWorkerRequest } from '../../domain/runes/simulator/rune-simulator-protocol';

const job = createJobRuntime<Record<string, unknown>, RuneSimulationResult>(
  () => createRuneSimulatorWorker(),
  'JASWA could not start its rune simulation worker.',
);

/** An aborted `signal` rejects the run with `CalculationCancelled`. */
export function calculateRuneSimulation(
  config: RuneSimulationWorkerRequest['config'],
  context: RuneSimulationWorkerRequest['context'],
  signal?: AbortSignal,
): Promise<RuneSimulationResult> {
  return job.run({ type: 'simulate', config, context }, signal);
}
