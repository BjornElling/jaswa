/// <reference lib="webworker" />

import { cachedReferenceBodies, referenceScores } from '../../domain/runes/cleanup/rune-quality-reference';
import type { RuneReferenceWorkerRequest, RuneReferenceWorkerResponse } from '../../domain/runes/cleanup/rune-reference-protocol';

self.onmessage = ({ data }: MessageEvent<RuneReferenceWorkerRequest>) => {
  try {
    const references = data.requests.map((request) => ({
      key: request.key,
      scores: referenceScores(cachedReferenceBodies(request), request.prices),
    }));
    const response: RuneReferenceWorkerResponse = { type: 'prepared', references };
    self.postMessage(response, references.map(({ scores }) => scores.buffer));
  } catch {
    const response: RuneReferenceWorkerResponse = { type: 'error' };
    self.postMessage(response);
  }
};
