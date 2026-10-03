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
export function CalculationStatus({ evaluatedPairs, durationMs, backend, general, detail, twoLines = false }: {
  evaluatedPairs?: number;
  durationMs: number;
  backend: CalculationBackend;
  general: GeneralSettings;
  detail?: ReactNode;
  /**
   * What was measured on one line and how it was done on the next, for a report
   * set in a narrow column, where one long line would break wherever it ran out.
   */
  twoLines?: boolean;
}) {
  const measured: ReactNode[] = [
    evaluatedPairs === undefined ? detail : `${formatNumber(evaluatedPairs, general)} pairs checked`,
    evaluatedPairs === undefined ? undefined : detail,
  ].filter((part): part is ReactNode => part !== undefined);
  const how: ReactNode[] = [`${formatNumber(Math.round(durationMs), general)} ms`, calculationBackendLabel(backend)];
  const joined = (parts: readonly ReactNode[]) => parts.map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>);

  return <p className="calculation-status" role="status">
    {twoLines
      ? <>
        <span className="calculation-status-line">{joined(measured)}</span>
        <span className="calculation-status-line">{joined(how)}</span>
      </>
      : joined([...measured, ...how])}
  </p>;
}
