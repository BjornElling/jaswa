import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ColumnAlignment, ColumnGutter } from './table-layouts';

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
  /**
   * Extra room before this column, carried here for the same reason `align` is:
   * the heading and the cells under it take one declaration, so a gutter cannot
   * open in the body and not in the head.
   */
  gutter?: ColumnGutter;
  /** Ascending comparison; the hook reverses it for the other direction. */
  compare?: (left: Row, right: Row) => number;
  /** Numeric columns start at their most useful end, which is the largest. */
  initialDirection?: SortDirection;
  /**
   * A row this column prints no value for — a dash. It sorts after every row that
   * has one, in both directions: a dash is not the column's smallest or largest
   * value, and ranking it as either puts rows with nothing to compare at the top of
   * one of the two passes.
   */
  absent?: (row: Row) => boolean;
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
 * Sorting for one table (`ACCOUNT-TABLES.md` §1: every table sorts on
 * every column).
 *
 * A stable tiebreak is part of the contract rather than an implementation
 * detail. Scores are compared as whole percentage points (§17.1), so ties are
 * common by design, and without a stated fallback two runs of the same data
 * would order equal rows differently. The tiebreak also receives the active
 * sort so a table can keep its own fixed secondary order without reversing it
 * when the chosen column changes direction.
 *
 * It lives beside `SortableHeader` rather than in it for the reason
 * `columnClasses` lives in `table-layouts.ts`: a module that exports a React
 * component may export *only* components, or React Fast Refresh disables itself
 * for the whole file. The column type comes with the hook rather than staying
 * with the header because this is the half that reads it — `compare`,
 * `initialDirection` and the tiebreak are all sorting, and the header only
 * needs to know which columns it may draw a mark on.
 */
export function useSortedRows<Row>(
  rows: readonly Row[],
  columns: readonly SortableColumn<Row>[],
  initial: SortState,
  tiebreak?: (left: Row, right: Row, sort: SortState) => number,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column?.compare) return rows;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    const absent = column.absent;
    return [...rows].sort((left, right) => {
      if (absent) {
        const missing = Number(absent(left)) - Number(absent(right));
        if (missing !== 0) return missing;
        if (absent(left)) return tiebreak ? tiebreak(left, right, sort) : 0;
      }
      const ordered = column.compare?.(left, right) ?? 0;
      if (ordered !== 0) return ordered * direction;
      /* The fallback is not reversed: it keeps equal rows in one stated order
         whichever way the column is pointing, so toggling direction does not
         reshuffle rows the user can see are identical. */
      return tiebreak ? tiebreak(left, right, sort) : 0;
    });
  }, [rows, columns, sort, tiebreak]);

  function toggle(key: string) {
    const column = columns.find((entry) => entry.key === key);
    if (!column?.compare) return;
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
      : { key, direction: column.initialDirection ?? 'ascending' });
  }

  /* `setSort` is exposed for the tables whose ordering can also be driven from
     a control outside the header — see the `header: false` note above. Prefer
     `toggle` for anything a heading does. */
  return { sorted, sort, toggle, setSort };
}
