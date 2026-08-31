import type { ReactNode } from 'react';
import { useSessionStorageState } from '../lib/session-storage-state';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function PageHeader({ eyebrow, title, tagline }: { eyebrow?: string; title: string; tagline: string }) {
  return <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2 className="page-title">{title}</h2>
    <p className="page-tagline">{tagline}</p>
  </header>;
}

/** A native disclosure keeps keyboard behaviour and find-in-page support in
    the browser, while the shared bar gives every workspace the same frame.
    The explicit key lets a workspace leave and return without losing its
    current reading position during this browser tab. */
export function Disclosure({ title, sessionKey, defaultOpen = false, children }: {
  title: string;
  sessionKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useSessionStorageState<boolean>(
    `jaswa.disclosures.${sessionKey}`,
    defaultOpen,
    isBoolean,
  );

  return <details className="bar" open={open} onToggle={(event) => {
    const nextOpen = event.currentTarget.open;
    setOpen((current) => current === nextOpen ? current : nextOpen);
  }}>
    <summary className="bar-head">
      <span className="bar-chevron" aria-hidden="true">›</span>
      <b>{title}</b>
    </summary>
    <div className="bar-body">{children}</div>
  </details>;
}
