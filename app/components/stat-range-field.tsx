import { useId } from 'react';
import type { ReactNode, Ref } from 'react';

/**
 * One figure's range: the least it must reach and the most it may, side by side
 * under the figure's name, with what the monster has now beneath them.
 *
 * The monster profile and Rune Optimization ask the same question of the same
 * eleven figures, so they ask it with one control. Both fields are always there,
 * empty or not, and share the cell equally, so typing into one never moves the
 * other (`AGENTS.md` §2). An empty field is no limit at that end.
 */
export function StatRangeField({
  figure, label, atLeast, atMost, onAtLeast, onAtMost, current, disabled, title, firstField,
}: {
  /** Which of the eleven figures, so the grid can give the widest numbers the widest cells. */
  figure: string;
  label: string;
  atLeast: number | undefined;
  atMost: number | undefined;
  /** The raw text typed; the caller parses it through `readTargetField`. */
  onAtLeast: (raw: string) => void;
  onAtMost: (raw: string) => void;
  /** The figure now, with any marks after it. */
  current: ReactNode;
  disabled?: boolean;
  title?: string;
  firstField?: Ref<HTMLInputElement>;
}) {
  const invalid = atLeast !== undefined && atMost !== undefined && atLeast > atMost;
  const errorId = useId();
  const error = 'Minimum must not exceed maximum.';
  const inputTitle = [title, invalid ? error : undefined].filter(Boolean).join(' ');

  return <div className="stat-range" data-figure={figure} data-invalid={invalid ? 'true' : undefined} role="group" aria-label={label}>
    <span className="overlay-stat-head">{label}</span>
    <div className="stat-range-fields">
      <input ref={firstField} className="stat-range-input" type="number" min={0} step={1} inputMode="numeric"
        placeholder="min" aria-label={`${label}: at least`} disabled={disabled} title={inputTitle || undefined}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        value={atLeast ?? ''} onChange={(event) => onAtLeast(event.target.value)} />
      <span className="stat-range-dash" aria-hidden="true">–</span>
      <input className="stat-range-input" type="number" min={0} step={1} inputMode="numeric"
        placeholder="max" aria-label={`${label}: at most`} disabled={disabled} title={inputTitle || undefined}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        value={atMost ?? ''} onChange={(event) => onAtMost(event.target.value)} />
    </div>
    <span id={errorId} className="visually-hidden" aria-live="polite">
      {invalid ? error : ''}
    </span>
    {/* Spans, not paragraphs, here and in the name above: inside a dialog
        `.dialog p` outranks the label and caption voices, and printed the figure
        as loud as the fields it qualifies. */}
    <span className="overlay-stat-current">{current}</span>
  </div>;
}
