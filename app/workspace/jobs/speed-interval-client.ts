import type { CombatSpeedInterval, SpeedIntervalSearch } from '../../domain/speed/speed-tuning-intervals';
import { cancellableWorker } from './cancellable-worker';
import { workerFactories } from './worker-factories';

const ask = cancellableWorker<readonly (CombatSpeedInterval | null)[]>(
  () => workerFactories().speedIntervals(true), 'The speed interval calculation could not start.',
);

export function calculateSpeedIntervals(search: SpeedIntervalSearch, signal: AbortSignal) {
  return ask({ search }, signal);
}
