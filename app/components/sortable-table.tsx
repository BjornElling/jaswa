import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { alignmentClass } from '../lib/table-layouts';
import type { ColumnAlignment } from '../lib/table-layouts';

export type SortDirection = 'ascending' | 'descending';

/**
 * One sortable column. `compare` is given the two rows rather than two extracted
 * values so a column can order on something it does not itself print — a
 * location column sorting by monster name, for instance.
 */
export type SortableColumn<Row> = {
  key: string;
  label: ReactNode;
  /** Screen-reader name where the visible label is an icon or is empty. */
  accessibleLabel?: string;
  /**
   * How this column sits against its box, in the heading and in every cell.
   * Declared once here so the two cannot disagree; see `table-layouts.ts`.
   */
  align?: ColumnAlignment;
  /** Ascending comparison; the hook reverses it for the other direction. */
  compare?: (left: Row, right: Row) => number;
  /** Numeric columns start at their most useful end, which is the largest. */
  initialDirection?: SortDirection;
  /**
   * `false` for an ordering the table can sort by but shows no column for,
   * driven from a control elsewhere on the page. It stays in this list rather
   * than becoming a second sort state, so the header marks nothing as sorted
   * while such an ordering is active and one click on any real column takes
   * ordering back.
   */
  header?: false;
};

export type SortState = { key: string; direction: SortDirection };

/**
 * The body-cell classes for one table, keyed by column, taken from the same
 * column list the header is built from. A cell asks for its column by key
 * rather than restating an alignment, which is what keeps the two in step when
 * a column's alignment changes or the columns are reordered.
 */
export function columnClasses<Row>(columns: readonly SortableColumn<Row>[]) {
  const byKey = new Map(columns.map((column) => [column.key, column.align]));
  return (key: string, ...extra: Array<string | false | undefined>) =>
    [alignmentClass(byKey.get(key)), ...extra].filter(Boolean).join(' ');
}

/**
 * Sorting for one table (`ARTIFACT-CANONICAL.md` §17.8: every table sorts on
 * every column).
 *
 * A stable tiebreak is part of the contract rather than an implementation
 * detail. Scores are compared as whole percentage points (§17.1), so ties are
 * common by design, and without a stated fallback two runs of the same data
 * would order equal rows differently.
 */
export function useSortedRows<Row>(
  rows: readonly Row[],
  columns: readonly SortableColumn<Row>[],
  initial: SortState,
  tiebreak?: (left: Row, right: Row) => number,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.compare) return rows;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const ordered = column.compare?.(left, right) ?? 0;
      if (ordered !== 0) return ordered * direction;
      /* The fallback is not reversed: it keeps equal rows in one stated order
         whichever way the column is pointing, so toggling direction does not
         reshuffle rows the user can see are identical. */
      return tiebreak ? tiebreak(left, right) : 0;
    });
  }, [rows, columns, sort, tiebreak]);

  function toggle(key: string) {
    const column = columns.find((entry) => entry.key === key);
    if (!column?.compare) return;
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
      : { key, direction: column.initialDirection ?? 'ascending' });
  }

  return { sorted, sort, toggle };
}

/**
 * The header row for a sortable table.
 *
 * The sort mark occupies its space in every state, including unsorted, so
 * clicking a header never changes a column's width and re-wraps the row
 * (`AGENTS.md` rule 2). `aria-sort` carries the state for assistive technology
 * rather than leaving it to the mark alone.
 */
export function SortableHeader<Row>({ columns, sort, onToggle }: {
  columns: readonly SortableColumn<Row>[];
  sort: SortState;
  onToggle: (key: string) => void;
}) {
  return <thead><tr>{columns.filter((column) => column.header !== false).map((column) => {
    const active = sort.key === column.key;
    const sortable = Boolean(column.compare);
    return <th key={column.key} scope="col"
      aria-sort={active && sortable ? sort.direction : undefined}
      className={[alignmentClass(column.align), sortable ? 'sortable-column' : ''].filter(Boolean).join(' ')}>
      {sortable ? <button type="button" className={active ? 'sort-button active' : 'sort-button'}
        onClick={() => onToggle(column.key)}>
        <span className="sort-button-label">{column.label}</span>
        <span className="sort-mark" aria-hidden="true" data-direction={active ? sort.direction : 'none'}>
          <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
            <path d="M6 2.5 L9 6 L3 6 Z" className="sort-mark-up" />
            <path d="M6 9.5 L3 6 L9 6 Z" className="sort-mark-down" />
          </svg>
        </span>
        {column.accessibleLabel && <span className="visually-hidden">{column.accessibleLabel}</span>}
      </button> : <>{column.label}{column.accessibleLabel && <span className="visually-hidden">{column.accessibleLabel}</span>}</>}
    </th>;
  })}</tr></thead>;
}
