/**
 * The page's one way to ask for a Rune Simulator run.
 *
 * The simulator is an experiment rather than a latest-request-wins table, so
 * the page runs one at a time; a run can be cancelled, and the worker is
 * recovered after a startup error, so the next run does not inherit a dead
 * Worker object.
 */
import { generateSimulationRunes, simulationNoRuneType } from '../../domain/runes/simulator/rune-simulator';
import { planQualityReferences } from '../../domain/runes/cleanup/rune-cleanup-advice';
import { retainedReferenceCount } from '../../domain/runes/cleanup/rune-quality-reference';
import { leaseRuneReferences } from './rune-reference-client';
import { CalculationCancelled } from './cancellable-worker';
import type { RuneSimulationResult } from '../../domain/runes/simulator/rune-simulator';
import { createJobRuntime } from './job-runtime';
import { workerFactories } from './worker-factories';
import type { RuneSimulationWorkerRequest } from '../../domain/runes/simulator/rune-simulator-protocol';

const job = createJobRuntime<Record<string, unknown>, RuneSimulationResult>(
  () => {
    const create = workerFactories().runeSimulator;
    if (!create) throw new Error('The Rune Simulator runs in development builds only.');
    return create();
  },
  'JASWA could not start its rune simulation worker.',
);

/** An aborted `signal` rejects the run with `CalculationCancelled`. */
export async function calculateRuneSimulation(
  config: RuneSimulationWorkerRequest['config'],
  context: RuneSimulationWorkerRequest['context'],
  signal?: AbortSignal,
): Promise<RuneSimulationResult> {
  if (signal?.aborted) throw new CalculationCancelled();
  const births = generateSimulationRunes(config);
  const requests = context.base ? planQualityReferences(
    births.map((rune) => ({ ...rune, setName: rune.setName ?? simulationNoRuneType, ancient: false })),
    context.roles, context.base, context.settings,
  ) : [];
  const lease = requests.length <= retainedReferenceCount ? leaseRuneReferences(requests) : undefined;
  if (lease) signal?.addEventListener('abort', lease.release, { once: true });
  try {
    const references = await (lease?.ready ?? null);
    return await job.run({ type: 'simulate', config, context, births, references }, signal);
  } catch (error) {
    if (signal?.aborted) throw new CalculationCancelled();
    throw error;
  } finally {
    if (lease) signal?.removeEventListener('abort', lease.release);
    lease?.release();
  }
}
