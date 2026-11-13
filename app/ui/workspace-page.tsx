import type { ReactNode } from 'react';

type WorkspacePageProps = {
  header: ReactNode;
  children: ReactNode;
};

/**
 * The default page frame owns the reading column and its vertical start.
 * Pages supply their title treatment and content, but cannot drift into a
 * different width or top offset by choosing their own wrapper.
 */
export function WorkspacePage({ header, children }: WorkspacePageProps) {
  return <section className="workspace-page">
    {header}
    <div className="workspace-page-content">{children}</div>
  </section>;
}
