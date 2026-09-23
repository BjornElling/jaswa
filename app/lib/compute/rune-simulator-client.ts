/**
 * The page's one way to ask for a Rune Simulator run.
 *
 * The simulator is an experiment rather than a latest-request-wins table, so
 * the page disables its button while one is in flight. The worker is still
 * recovered after a startup error, so the next run does not inherit a dead
 * Worker object.
 */
import type { RuneSimulationResult } from '../rune-simulator';
import type {
  RuneSimulationWorkerRequest, RuneSimulationWorkerResponse,
} from './rune-simulator-protocol';

let worker: Worker | undefined;
let nextRequestId = 1;

function simulationWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./rune-simulator-worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export function calculateRuneSimulation(
  config: RuneSimulationWorkerRequest['config'],
  context: RuneSimulationWorkerRequest['context'],
): Promise<RuneSimulationResult> {
  const requestId = nextRequestId;
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const currentWorker = simulationWorker();
    const onMessage = (event: MessageEvent<RuneSimulationWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      currentWorker.removeEventListener('message', onMessage);
      currentWorker.removeEventListener('error', onError);
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data.result);
    };
    const onError = () => {
      currentWorker.terminate();
      if (worker === currentWorker) worker = undefined;
      currentWorker.removeEventListener('message', onMessage);
      currentWorker.removeEventListener('error', onError);
      reject(new Error('JASWA could not start its rune simulation worker.'));
    };
    currentWorker.addEventListener('message', onMessage);
    currentWorker.addEventListener('error', onError, { once: true });
    try {
      currentWorker.postMessage({ type: 'simulate', requestId, config, context });
    } catch {
      onError();
    }
  });
}
