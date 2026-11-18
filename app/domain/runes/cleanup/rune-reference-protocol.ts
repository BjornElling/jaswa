import type { QualityReference, ReferenceRequest } from './rune-quality-reference';

export type RuneReferenceWorkerRequest = { type: 'prepare'; requests: readonly ReferenceRequest[] };
export type RuneReferenceWorkerResponse =
  | { type: 'prepared'; references: QualityReference[] }
  | { type: 'error' };
