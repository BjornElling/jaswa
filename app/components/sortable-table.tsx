import { alignmentClass, gutterClass, sortMarkSide } from '../lib/table-layouts';
import type { SortableColumn, SortDirection, SortState } from './use-sorted-rows';

/**
 * The sort arrow. Both arrowheads are always drawn and only their opacity
 * changes, so the mark's footprint never varies with the sort state.
 */
export function SortMark({ direction }: { direction: SortDirection | 'none' }) {
  return <span className="sort-mark" aria-hidden="true" data-direction={direction}>
    <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
      <path d="M6 2.5 L9 6 L3 6 Z" className="sort-mark-up" />
      <path d="M6 9.5 L3 6 L9 6 Z" className="sort-mark-down" />
    </svg>
  </span>;
}

/**
 * The header row for a sortable table.
 *
 * The sort mark occupies its space in every state, including unsorted, so
 * clicking a header never changes a column's width and re-wraps the row
 * (`AGENTS.md` rule 2). `aria-sort` carries the state for assistive technology
 * rather than leaving it to the mark alone.
 *
 * The mark's side follows the column's alignment rather than being fixed —
 * `sortMarkSide` in `table-layouts.ts` states the rule and why.
 */
export function SortableHeader<Row>({ columns, sort, onToggle }: {
  columns: readonly SortableColumn<Row>[];
  sort: SortState;
  onToggle: (key: string) => void;
}) {
  return <thead><tr>{columns.filter((column) => column.header !== false).map((column) => {
    const active = sort.key === column.key;
    const sortable = Boolean(column.compare);
    const markSide = sortMarkSide(column.align);
    const hiddenLabel = column.accessibleLabel && <span className="visually-hidden">{column.accessibleLabel}</span>;
    return <th key={column.key} scope="col"
      aria-sort={active && sortable ? sort.direction : undefined}
      className={[alignmentClass(column.align), gutterClass(column.gutter), sortable ? 'sortable-column' : '']
        .filter(Boolean).join(' ')}>
      {sortable ? <button type="button" className={active ? 'sort-button active' : 'sort-button'}
        onClick={() => onToggle(column.key)}>
        {markSide === 'before' && <SortMark direction={active ? sort.direction : 'none'} />}
        <span className="sort-button-label">{column.label}</span>
        {markSide === 'after' && <SortMark direction={active ? sort.direction : 'none'} />}
        {hiddenLabel}
      </button> : <>{column.label}{hiddenLabel}</>}
    </th>;
  })}</tr></thead>;
}
