import type { ArtifactScoreRequest, ArtifactScoreResult, ArtifactScoreWorkerResponse } from './artifact-score-protocol';

let worker: Worker | undefined;
let nextRequestId = 1;

function scoringWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./artifact-score-worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** The main thread gets one promise; all backend selection remains in the worker. */
export function calculateArtifactScores(
  request: ArtifactScoreRequest,
  preferWebGpu: boolean,
): Promise<ArtifactScoreResult> {
  const requestId = nextRequestId;
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const currentWorker = scoringWorker();
    const onMessage = (event: MessageEvent<ArtifactScoreWorkerResponse>) => {
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
      reject(new Error('JASWA could not start its artifact calculation worker.'));
    };
    currentWorker.addEventListener('message', onMessage);
    currentWorker.addEventListener('error', onError, { once: true });
    try {
      currentWorker.postMessage({ type: 'calculate', requestId, request, preferWebGpu });
    } catch {
      onError();
    }
  });
}
