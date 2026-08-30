'use client';

import type { ReactNode } from 'react';

type DataTablePageProps = {
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
  filters, columnGroup, header, children, filterClassName, tableClassName, headerLabel, tableLabel,
}: DataTablePageProps) {
  return <section className="data-table-page">
    <section className="panel data-table-filter-panel" aria-label="Table filters">
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
