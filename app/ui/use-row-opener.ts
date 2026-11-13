import { useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';

/* The row's own way into its overlay: the one MonsterLink or RuneLink it carries. */
const rowOpener = 'button[aria-haspopup="dialog"]';

/**
 * Lets a whole table row open the overlay its one link opens.
 *
 * A row that is one monster or one rune is a wide target with a small name at
 * its far left, so a pointer may click anywhere in it. The link stays the row's
 * one control for a keyboard or a screen reader, and the row simply clicks it,
 * so the link hands itself over as the opener and focus comes back to it
 * wherever the row was clicked. The row never learns what it opens.
 *
 * A press that travels before release is someone selecting a figure to copy,
 * not asking for the overlay. That is measured on the pointer rather than read
 * off the selection, because a selection left by the last drag is still
 * standing when the next plain click lands.
 *
 * Only for a row whose other cells are data. A row with a control of its own
 * — a drag handle, a field — would have every stray click there open a dialog.
 * The same props serve every row of a table, so spread them onto each `<tr>`.
 */
export function useRowOpener() {
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  return useMemo(() => ({
    'data-opens-row': '',
    onMouseDown: (event: MouseEvent<HTMLTableRowElement>) => {
      pressedAt.current = { x: event.clientX, y: event.clientY };
    },
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      /* The link's own click bubbles back up through the row; it has already opened. */
      if ((event.target as Element).closest('button, a, input, select, textarea, label')) return;
      const start = pressedAt.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
      event.currentTarget.querySelector<HTMLElement>(rowOpener)?.click();
    },
  }), []);
}
