import type { Page } from '../workspace/workspace-config';
import { navigationGroups } from '../workspace/workspace-config';

export function AppRail({ page, onNavigate, onReport }: {
  page: Page;
  onNavigate: (page: Page) => void;
  onReport: () => void;
}) {
  return <nav className="rail" aria-label="jaswa sections">
    <div className="rail-brand">
      <img className="rail-mark" src="/favicon.svg" alt="" aria-hidden="true" width={34} height={34} />
      <b>ja<span className="brand-sw">sw</span>a</b>
    </div>
    {navigationGroups.map((group) => <div className="rail-group" key={group.heading}>
      <p className="rail-heading">{group.heading}</p>
      {group.items.map((item) => <button
        key={item.id}
        className={page === item.id ? 'rail-item active' : 'rail-item'}
        onClick={() => onNavigate(item.id)}
        aria-current={page === item.id ? 'page' : undefined}
        /* The visible label leans on the heading above it, which a screen
           reader reading one control at a time does not carry along. Three
           entries are called "Optimization" and two "Settings", so without
           this the announced name would not say which. */
        aria-label={item.name === item.label ? undefined : item.name}
      >
        <span className="glyph" aria-hidden="true">{item.glyph}</span>
        {item.label}
      </button>)}
    </div>)}
    <div className="rail-spacer" />
    <button className="rail-item report-issue" onClick={onReport}>
      <span className="glyph" aria-hidden="true">!</span>
      Report Issue
    </button>
  </nav>;
}
