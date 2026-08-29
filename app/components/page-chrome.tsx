import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, tagline }: { eyebrow?: string; title: string; tagline: string }) {
  return <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h2 className="page-title">{title}</h2>
    <p className="page-tagline">{tagline}</p>
  </header>;
}

/** A native disclosure keeps keyboard behaviour and find-in-page support in
    the browser, while the shared bar gives every workspace the same frame. */
export function Disclosure({ title, defaultOpen = false, children }: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return <details className="bar" open={defaultOpen}>
    <summary className="bar-head">
      <span className="bar-chevron" aria-hidden="true">›</span>
      <b>{title}</b>
    </summary>
    <div className="bar-body">{children}</div>
  </details>;
}
