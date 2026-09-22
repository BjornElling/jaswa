import type { ReactNode } from 'react';
import { formatNumber } from '../lib/formatting';
import { calculationBackendLabel } from '../lib/compute/calculation-summary';
import type { CalculationBackend } from '../lib/compute/calculation-summary';
import type { GeneralSettings } from '../lib/types';

/**
 * The small report beneath a calculation has one job: tell the reader what
 * was measured, how long it took and which engine did the work. Keeping that
 * sentence here makes every calculation view agree instead of growing its own
 * punctuation, order and alignment.
 */
export function CalculationStatus({ evaluatedPairs, durationMs, backend, general, detail }: {
  evaluatedPairs?: number;
  durationMs: number;
  backend: CalculationBackend;
  general: GeneralSettings;
  detail?: ReactNode;
}) {
  const parts: ReactNode[] = [
    evaluatedPairs === undefined ? detail : `${formatNumber(evaluatedPairs, general)} pairs checked`,
    evaluatedPairs === undefined ? undefined : detail,
    `${formatNumber(Math.round(durationMs), general)} ms`,
    calculationBackendLabel(backend),
  ].filter((part): part is ReactNode => part !== undefined);

  return <p className="calculation-status" role="status">
    {parts.map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>)}
  </p>;
}
