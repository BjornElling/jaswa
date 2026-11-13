import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSessionStorageState } from './session-state';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** The app's own mark, of which a page header shows only the crown. The whole
    star is drawn and the header's lower edge does the cropping, so the cut
    lands on a real boundary of the page and the shape reads as continuing
    behind it. Cropping inside the artwork instead left the two shoulder
    stones sliced through their middles, and — as favicon.svg says of exactly
    this — a cut stone stops being the app's mark and becomes an anonymous
    hexagon.

    Drawn here rather than loaded from favicon.svg: that file carries its own
    palette for a browser tab bar, while this has to take the header's colour.
    The stone is the file's geometry unchanged — one pentagon, rotated six
    times — and the alternating pairs are its two golds, kept as a difference
    in weight so the crown has the mark's internal structure and not the flat
    silhouette a single fill would give. */
function HeaderCrown() {
  return <svg className="page-crown" viewBox="-32 -32 64 64" aria-hidden="true" focusable="false">
    <defs>
      <path id="page-crown-stone" d="M-4.4 -9.74 4.4 -9.74 8.8 -17.36 0 -28.95 -8.8 -17.36z" />
    </defs>
    <g fill="currentColor">
      {[0, 60, 120, 180, 240, 300].map((degrees) => <use
        key={degrees}
        href="#page-crown-stone"
        transform={degrees ? `rotate(${degrees})` : undefined}
        opacity={degrees % 120 ? 1 : .6} />)}
    </g>
  </svg>;
}

export function PageHeader({ eyebrow, title, tagline }: { eyebrow?: string; title: string; tagline: string }) {
  return <header className="page-header">
    <HeaderCrown />
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2 className="page-title">{title}</h2>
    <p className="page-tagline">{tagline}</p>
  </header>;
}

/** A native disclosure keeps keyboard behaviour and find-in-page support in
    the browser, while the shared bar gives every workspace the same frame.
    The explicit key lets a workspace leave and return without losing its
    current reading position during this browser tab.

    `deferContent` withholds the body until the bar is opened for the first
    time, and then keeps it for the rest of the session. It is for a section
    whose *code* is expensive rather than its markup: `details` renders its
    children whether or not it is open, so a closed bar holding a lazily
    imported component would still fetch and evaluate it. Nothing the user can
    see moves — a closed bar shows no body either way — and the content stays
    mounted afterwards, so collapsing and re-opening does not rebuild it or
    lose its scroll position. */
export function Disclosure({ title, sessionKey, defaultOpen = false, deferContent = false, children }: {
  title: string;
  sessionKey: string;
  defaultOpen?: boolean;
  deferContent?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useSessionStorageState<boolean>(
    `jaswa.disclosures.${sessionKey}`,
    defaultOpen,
    isBoolean,
  );
  const [opened, setOpened] = useState(open);

  return <details className="bar" open={open} onToggle={(event) => {
    const nextOpen = event.currentTarget.open;
    if (nextOpen) setOpened(true);
    setOpen((current) => current === nextOpen ? current : nextOpen);
  }}>
    <summary className="bar-head">
      <span className="bar-chevron" aria-hidden="true">›</span>
      <b>{title}</b>
    </summary>
    <div className="bar-body">{deferContent && !opened ? null : children}</div>
  </details>;
}
