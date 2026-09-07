/**
 * How a column's cells sit against their box. Declared once per column and used
 * by both the header and the body, so a heading can never drift away from the
 * figures under it.
 *
 * The convention the app reads by: text left, numbers right, so digits line up
 * on their units and columns of figures can be compared down the page.
 */
export type ColumnAlignment = 'left' | 'right';

export type TableColumn = {
  key: string;
  width: string;
  /** Omitted means 'left'; only a numeric column states 'right'. */
  align?: ColumnAlignment;
};

/** The class both a `th` and a `td` take for one column, so the pair agrees. */
export function alignmentClass(align: ColumnAlignment | undefined): string {
  return align === 'right' ? 'align-right' : 'align-left';
}

/**
 * The two account libraries use declared column plans instead of scattered CSS
 * percentages. A table's two rendered halves receive the same plan, which is
 * what keeps its filter, heading and rows on one immutable grid.
 */
export const monsterTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '4.1284%', align: 'left' },
  { key: 'name', width: '13.7615%', align: 'left' },
  { key: 'sets', width: '7.7982%', align: 'left' },
  { key: 'level', width: '3.6697%', align: 'right' },
  { key: 'hp', width: '5.5046%', align: 'right' },
  { key: 'atk', width: '5.5046%', align: 'right' },
  { key: 'def', width: '5.5046%', align: 'right' },
  { key: 'spd', width: '4.5872%', align: 'right' },
  { key: 'criticalRate', width: '4.5872%', align: 'right' },
  { key: 'criticalDamage', width: '4.5872%', align: 'right' },
  { key: 'resistance', width: '4.5872%', align: 'right' },
  { key: 'accuracy', width: '4.5872%', align: 'right' },
  /* Equipment slots read as a pair of codes rather than a quantity, but they
     sit in the run of numeric columns and keep its right edge. */
  { key: 'artifacts', width: '6.422%', align: 'right' },
  { key: 'relic', width: '4.5872%', align: 'right' },
  { key: 'ehp', width: '6.422%', align: 'right' },
  { key: 'ehpD', width: '6.422%', align: 'right' },
  { key: 'dmg', width: '7.3394%', align: 'right' },
];

export const artifactTableColumns: readonly TableColumn[] = [
  { key: 'location', width: '17.8899%', align: 'left' },
  { key: 'value', width: '7.7982%', align: 'right' },
  { key: 'category', width: '7.3394%', align: 'left' },
  { key: 'equipClass', width: '7.7982%', align: 'left' },
  { key: 'grade', width: '7.3394%', align: 'left' },
  { key: 'mainProperty', width: '8.7156%', align: 'left' },
  { key: 'subProperties', width: '39.1193%', align: 'left' },
  { key: 'refinement', width: '4%', align: 'right' },
];

/**
 * The workspace result tables build their columns from a `SortableColumn` list
 * instead of a colgroup, so each declares its own `align` there beside the
 * column's label and comparison. `columnClasses` in `sortable-table.tsx` is what
 * hands that same declaration to the body cells.
 */
