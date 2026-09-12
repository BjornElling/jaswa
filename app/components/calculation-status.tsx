import type { ReactNode } from 'react';
import { formatNumber } from '../lib/formatting';
import type { ArtifactComputeBackend } from '../lib/compute/artifact-score-protocol';
import type { GeneralSettings } from '../lib/types';

/**
 * The small report beneath a calculation has one job: tell the reader what
 * was measured, how long it took and which engine did the work. Keeping that
 * sentence here makes the three calculation views agree instead of growing
 * their own punctuation, order and alignment.
 */
export function CalculationStatus({ evaluatedPairs, durationMs, backend, general, detail }: {
  evaluatedPairs: number;
  durationMs: number;
  backend: ArtifactComputeBackend;
  general: GeneralSettings;
  detail?: ReactNode;
}) {
  const parts: ReactNode[] = [
    `${formatNumber(evaluatedPairs, general)} pairs checked`,
    detail,
    `${formatNumber(Math.round(durationMs), general)} ms`,
    backend === 'webgpu' ? 'Graphics card' : 'Processor',
  ].filter((part): part is ReactNode => part !== undefined);

  return <p className="calculation-status" role="status">
    {parts.map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>)}
  </p>;
}
