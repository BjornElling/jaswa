import type { ReactNode } from 'react';
import { Button } from './button';

/**
 * The one column every calculating panel ends in, at its right edge: Clear
 * results and Calculate on top, the calculation's report beneath them, and the
 * panel's resets at the foot.
 *
 * Eight panels had grown eight answers — a stop as a separate ✕ on two of them,
 * none on the rest, Calculate at the bottom left on one and in a monster row on
 * another, the report under the buttons here and under the table there. One
 * component owns the column so they cannot drift apart again.
 *
 * Calculate is also the stop. While the work runs it reads *Calculating…* and,
 * under the pointer or keyboard focus, *Cancel calculation* in red; pressing it
 * then stops the work and leaves the answer from before it started. Every
 * wording is a stacked face of the one button, so none of it moves the column.
 */
export function CalculationActions({
  busy, canCalculate, onCalculate, onCancel, calculateTitle, canClear, onClear, status, notice, resets, className,
}: {
  busy: boolean;
  /** Whether Calculate can be pressed when nothing is running. */
  canCalculate: boolean;
  onCalculate: () => void;
  /** Stops the running work and leaves the answer from before it started. */
  onCancel: () => void;
  /** Why Calculate cannot be pressed, where that is not obvious from the panel. */
  calculateTitle?: string;
  canClear: boolean;
  onClear: () => void;
  /** The report beneath the buttons: progress, the last run's summary or a failure. */
  status: ReactNode;
  /** A standing remark about the answer on screen, beneath the report. */
  notice?: ReactNode;
  /** Reset filters and its kin, at the foot of the column. */
  resets?: ReactNode;
  className?: string;
}) {
  return <div className={['calculation-actions', className].filter(Boolean).join(' ')}>
    <div className="calculation-actions-buttons">
      <Button disabled={busy || !canClear} onClick={onClear}>Clear results</Button>
      {/* A disabled button takes no pointer events, so the reason sits on a
          wrapper that does. */}
      <span className="calculation-actions-calculate" title={!busy && !canCalculate ? calculateTitle : undefined}>
        <Button tone="primary" size="prominent" className="calculate-button" busy={busy} busyLabel="Calculating…"
          cancelLabel="Cancel calculation" onCancel={onCancel} disabled={!busy && !canCalculate}
          onClick={onCalculate}>Calculate</Button>
      </span>
    </div>
    <div className="calculation-actions-status">{status}</div>
    {notice}
    {resets !== undefined && <div className="filter-panel-actions calculation-actions-resets">{resets}</div>}
  </div>;
}

/**
 * A line in the report slot that is not a finished run's summary: progress in
 * the accent while the work runs, a failure in the verdict red, anything else
 * quiet. Line breaks in the text are kept, so a second line can say why.
 */
export function CalculationNote({ tone = 'quiet', children }: {
  tone?: 'busy' | 'failed' | 'quiet';
  children: ReactNode;
}) {
  return <p className="calculation-status calculation-note" role="status"
    data-busy={tone === 'busy' ? 'true' : undefined} data-failed={tone === 'failed' ? 'true' : undefined}>{children}</p>;
}
