import { useState } from 'react';
import type { Key, ReactNode } from 'react';
import { LabelSwap } from './button';

/**
 * A short list that keeps its extra entries one click away.
 *
 * The component owns the disclosure state, the visible-count wording and the
 * spacing contract. Keeping those decisions here means another list cannot
 * quietly invent a different toggle, gap or accessible state later.
 */
export function ExpandableList<T>({ items, visibleCount = 3, itemKey, children, className, listClassName }: {
  items: readonly T[];
  /** The number of entries shown before the user asks for the rest. */
  visibleCount?: number;
  itemKey: (item: T, index: number) => Key;
  children: (item: T, index: number) => ReactNode;
  /** A domain class may identify the list without owning the disclosure. */
  className?: string;
  /** A domain class may add content styling without owning the disclosure. */
  listClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const requestedCount = Number.isFinite(visibleCount) ? Math.floor(visibleCount) : 3;
  const count = Math.max(1, requestedCount);
  const additionalCount = Math.max(items.length - count, 0);
  const shown = expanded ? items : items.slice(0, count);

  return <div className={['expandable-list', className].filter(Boolean).join(' ')}>
    <ul className={['expandable-list-items', listClassName].filter(Boolean).join(' ')}>
      {shown.map((item, index) => <li key={itemKey(item, index)}>{children(item, index)}</li>)}
    </ul>
    {(additionalCount > 0 || expanded) && <button type="button" className="expandable-list-toggle"
      onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
      <LabelSwap showing={expanded ? 'fewer' : 'more'}
        faces={{ more: `+ ${additionalCount} more`, fewer: 'Show fewer' }} />
    </button>}
  </div>;
}
