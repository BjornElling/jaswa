import { useState } from 'react';
import type { ReactNode } from 'react';

/** Keep the complete rendered answer together while its replacement is pending,
 * rather than mixing old scores with the import's new records and conversions.
 * The caller still owns clearing, failure and a change of selected subject. */
export function SettledCalculation({ current, retain, children }: {
  current: boolean; retain: boolean; children: ReactNode;
}) {
  const [held, setHeld] = useState<ReactNode>(null);
  if (current && children !== held) setHeld(children);
  if (!current && !retain && held !== null) setHeld(null);
  return <>{current ? children : retain ? held : null}</>;
}
