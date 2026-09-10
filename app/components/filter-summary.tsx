/**
 * How much of a table the current filters leave, with the control that puts
 * them all back. The two belong together: the count is the only thing on screen
 * that says a filter is narrowing anything, so the way out of a narrowed table
 * sits directly under the number that reports it.
 *
 * Both are one absolutely positioned block in the strip's empty top-right
 * corner, so neither the count changing nor the button appearing can add a row
 * to the strip or move a control the user did not act on (`AGENTS.md` §2).
 *
 * Reset is not styled as an action to take. It restores defaults — a way back
 * rather than a step forward — and gold in this interface means "you can act on
 * this", so it stays a quiet outline until the pointer is on it and only then
 * takes the accent. It also asks nothing first: every choice it clears is one
 * click away from being made again, so a confirmation would cost more than the
 * mistake it guards against.
 */
export function FilterSummary({ visible, total, noun, onReset }: {
  visible: number;
  total: number;
  /** What the rows are, for the reading of the count and of the button. */
  noun: string;
  onReset: () => void;
}) {
  return <div className="filter-status">
    <output className="filter-summary" aria-label={`${visible} of ${total} ${noun} shown`}>
      <b>{visible}</b> of {total} shown
    </output>
    <button type="button" className="filter-reset" onClick={onReset}
      aria-label={`Reset ${noun} filters`}>Reset filters</button>
  </div>;
}
