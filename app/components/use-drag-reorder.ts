import { useRef, useState } from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent } from 'react';
import { moveItem } from '../lib/list-order';

/**
 * A drag in progress, measured once when it starts: the entry it came from,
 * the place it would land in now, and where every entry sits at rest, so the
 * target is read off the list as it was rather than off entries already
 * sliding aside. Entries may differ in height — a Speed Tuning line wraps
 * long names — so each is measured, not one pitch for all.
 */
type Drag = {
  from: number;
  over: number;
  /** In screen pixels, as the pointer reports, from the container's top. */
  tops: readonly number[];
  heights: readonly number[];
  /** Where in its entry the pointer took hold. */
  grab: number;
  /** Layout pixels per screen pixel: a transform writes the one, the pointer reads the other, and under zoom they differ. */
  scale: number;
};

/* Private, so a dragged entry cannot be dropped as text into a field, and
   present at all because Firefox starts no drag without data. */
const dragType = 'application/x-jaswa-reorder';

function entries(container: HTMLElement): HTMLElement[] {
  return [...container.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.dataset.reorderIndex !== undefined)
    .sort((left, right) => Number(left.dataset.reorderIndex) - Number(right.dataset.reorderIndex));
}

/** Where every entry is drawn while the drag is previewed, in layout pixels away from its own place. */
function shifts(drag: Drag): number[] {
  const { tops, heights } = drag;
  const order = moveItem(tops.map((_, at) => at), drag.from, drag.over);
  const drawn = Array<number>(tops.length).fill(0);
  let top = tops[0];
  order.forEach((at, place) => {
    drawn[at] = (top - tops[at]) * drag.scale;
    /* The gap after a place stays the gap that place had at rest. */
    if (place < tops.length - 1) top += heights[at] + tops[place + 1] - tops[place] - heights[place];
  });
  return drawn;
}

/**
 * Reordering a list by dragging, the one way JASWA does it. The container and
 * each entry spread the props this returns; the entries must be the
 * container's direct children and come first, in order.
 *
 * While an entry is dragged every other entry slides to where the drop would
 * leave it, so the order is read before it is committed. Entries are drawn
 * aside with a transform, never laid out again: nothing outside the list
 * moves (AGENTS.md §2). A list accepts only its own entries, so a drag never
 * carries an entry from one list into another.
 *
 * Dragging needs a pointer, so every list that uses this also offers a
 * keyboard way to the same move — buttons, or `reorderKeyStep`.
 */
export function useDragReorder<Container extends HTMLElement>({ count, onMove }: {
  /** How many entries can be dragged; any after them are not part of the order. */
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const container = useRef<Container>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /* A press inside a text field selects its text; a press anywhere else on an
     entry picks it up. Set on the press itself, before the browser decides
     whether a drag begins. */
  const [grabbable, setGrabbable] = useState(true);
  const drawn = drag === null ? null : shifts(drag);
  const order = drag === null ? null : moveItem(Array.from({ length: count }, (_, at) => at), drag.from, drag.over);

  function start(event: DragEvent<HTMLElement>, from: number) {
    const holder = container.current;
    if (!holder || count < 2) return;
    const top = holder.getBoundingClientRect().top;
    const boxes = entries(holder).slice(0, count).map((entry) => entry.getBoundingClientRect());
    const height = holder.getBoundingClientRect().height;
    if (boxes.length !== count || !(height > 0)) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(dragType, String(from));
    setDrag({
      from,
      over: from,
      tops: boxes.map((box) => box.top - top),
      heights: boxes.map((box) => box.height),
      grab: event.clientY - boxes[from].top,
      scale: holder.offsetHeight / height,
    });
  }

  /* The place under the middle of the dragged entry: it passes an entry below
     it once its middle reaches that entry's top, and one above it once its
     middle rises above that entry's lower edge. The container itself never
     moves, so scrolling mid-drag stays right. */
  function over(event: DragEvent<Container>) {
    if (drag === null || !container.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const { from, tops, heights } = drag;
    const middle = event.clientY - drag.grab + heights[from] / 2 - container.current.getBoundingClientRect().top;
    let place = from;
    while (place < count - 1 && middle >= tops[place + 1]) place += 1;
    while (place > 0 && middle < tops[place]) place -= 1;
    if (place !== drag.over) setDrag({ ...drag, over: place });
  }

  function drop(event: DragEvent<Container>) {
    if (drag === null) return;
    event.preventDefault();
    if (drag.over !== drag.from) onMove(drag.from, drag.over);
    setDrag(null);
  }

  return {
    containerProps: {
      ref: container,
      'data-sorting': drag === null ? undefined : 'true',
      /* A drop that follows an entry nobody accepted lands on the page, not the list. */
      onDragEnter: (event: DragEvent<Container>) => { if (drag !== null) event.preventDefault(); },
      onDragOver: over,
      onDrop: drop,
      onPointerDownCapture: (event: PointerEvent<Container>) =>
        setGrabbable(!(event.target as Element).closest('input[type="text"], textarea, select')),
    },
    entryProps: (at: number) => ({
      'data-reorder-index': at,
      'data-dragging': drag?.from === at ? 'true' : undefined,
      draggable: grabbable && count > 1,
      style: drawn === null || drawn[at] === 0 ? undefined : { '--reorder-shift': `${drawn[at]}px` } as CSSProperties,
      onDragStart: (event: DragEvent<HTMLElement>) => start(event, at),
      onDragEnd: () => setDrag(null),
    }),
    /** Where an entry is drawn while a drag is previewed, so a numbered list reads 1 to n down the screen. */
    place: (at: number) => order === null ? at : order.indexOf(at),
  };
}

/** An entry's box at rest, from its container's corner, in screen pixels. */
type Spot = { left: number; top: number; width: number; height: number };

/**
 * Reordering a line of entries that runs across and wraps as words do — Speed
 * Tuning's line of a preset's names — by dragging, with the same private data
 * and the same one-list-only rule as `useDragReorder`.
 *
 * The place is read off where every entry sat when the drag began, as there:
 * the row under the pointer, then the entries on it left of the pointer. The
 * preview is the line itself in the order the drop would leave it, drawn with
 * flex `order` from `place` rather than entries slid aside — names of different
 * widths cannot slide into one another's places on a wrapping line — and
 * never by moving the elements, because a browser ends a drag whose source
 * element is taken out of the page. Only the line being dragged in redraws.
 */
export function useInlineReorder<Container extends HTMLElement>({ count, onMove }: {
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const container = useRef<Container>(null);
  const [drag, setDrag] = useState<{ from: number; over: number; spots: readonly Spot[] } | null>(null);
  const order = drag === null ? null : moveItem(Array.from({ length: count }, (_, at) => at), drag.from, drag.over);

  function start(event: DragEvent<HTMLElement>, from: number) {
    const holder = container.current;
    if (!holder || count < 2) return;
    const corner = holder.getBoundingClientRect();
    const spots = entries(holder).slice(0, count).map((entry) => {
      const box = entry.getBoundingClientRect();
      return { left: box.left - corner.left, top: box.top - corner.top, width: box.width, height: box.height };
    });
    if (spots.length !== count) return;
    /* The press may land on an element inside the entry; the drag is the entry's. */
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(dragType, String(from));
    setDrag({ from, over: from, spots });
  }

  function over(event: DragEvent<Container>) {
    if (drag === null || !container.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const corner = container.current.getBoundingClientRect();
    const x = event.clientX - corner.left;
    const y = event.clientY - corner.top;
    const rows = [...new Set(drag.spots.map((spot) => Math.round(spot.top)))].sort((left, right) => left - right);
    /* The row whose band holds the pointer; above the first or below the last, that one. */
    const row = rows.findLast((top) => y >= top) ?? rows[0];
    /* Every other entry on an earlier row, or on this row with its middle left of the pointer, comes first. */
    const place = drag.spots.filter((spot, at) => at !== drag.from
      && (Math.round(spot.top) < row || (Math.round(spot.top) === row && spot.left + spot.width / 2 < x))).length;
    if (place !== drag.over) setDrag({ ...drag, over: place });
  }

  function drop(event: DragEvent<Container>) {
    if (drag === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.over !== drag.from) onMove(drag.from, drag.over);
    setDrag(null);
  }

  return {
    containerProps: {
      ref: container,
      'data-sorting': drag === null ? undefined : 'true',
      /* Accepted on entering as well as while over: a pointer crossing from one
         name onto the next is entering, and a drop that follows an entry nobody
         accepted lands on the page rather than the line. */
      onDragEnter: (event: DragEvent<Container>) => { if (drag !== null) event.preventDefault(); },
      onDragOver: over,
      onDrop: drop,
    },
    entryProps: (at: number) => ({
      'data-reorder-index': at,
      'data-dragging': drag?.from === at ? 'true' : undefined,
      draggable: count > 1,
      onDragStart: (event: DragEvent<HTMLElement>) => start(event, at),
      onDragEnd: () => setDrag(null),
    }),
    /** Where an entry is drawn: its place in the drop's order while a drag is previewed. */
    place: (at: number) => order === null ? at : order.indexOf(at),
  };
}

/** What an entry spreads, for a component that draws the entry itself. */
export type ReorderEntryProps = ReturnType<ReturnType<typeof useDragReorder>['entryProps']>;

/** The keyboard's way to the same move: Alt with an arrow takes the focused entry one place up or down. */
export function reorderKeyStep(event: KeyboardEvent): -1 | 1 | 0 {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  return event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
}
