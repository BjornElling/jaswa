import type { ReactNode } from 'react';
import type { TableColumn } from '../lib/table-layouts';

export function TableColumnGroup({ columns }: { columns: readonly TableColumn[] }) {
  return <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}</colgroup>;
}

type DataTablePageProps = {
  /**
   * What the table is read in, above the filters and apart from them: a filter
   * narrows the rows, this decides what every figure in them is, so it is
   * neither laid out in the filter columns nor cleared with them.
   */
  lead?: ReactNode;
  filters: ReactNode;
  columnGroup: ReactNode;
  header: ReactNode;
  children: ReactNode;
  filterClassName?: string;
  tableClassName: string;
  headerLabel: string;
  tableLabel: string;
};

/**
 * The account libraries share one deliberately rigid frame. Their data varies,
 * but a filter choice must never alter their measure, their header position, or
 * the horizontal-scroll behaviour a dense table needs.
 */
export function DataTablePage({
  lead, filters, columnGroup, header, children, filterClassName, tableClassName, headerLabel, tableLabel,
}: DataTablePageProps) {
  return <section className="data-table-page">
    <section className="data-table-filter-panel" aria-label="Table filters">
      {lead && <div className="data-table-lead">{lead}</div>}
      <div className={filterClassName ? `filter-strip ${filterClassName}` : 'filter-strip'}>{filters}</div>
    </section>

    <div className="data-table-header-wrap">
      <table className={`grid-table ${tableClassName}`} aria-label={headerLabel}>
        {columnGroup}
        {header}
      </table>
    </div>

    <div className="data-table-scroll">
      <table className={`grid-table ${tableClassName}`} aria-label={tableLabel}>
        {columnGroup}
        {children}
      </table>
    </div>
  </section>;
}
