import { useId, type ReactNode } from 'react';

/**
 * One group of settings inside an open Settings bar.
 *
 * Every bar on Settings is built from these and nothing else: the same sunk
 * ground, edge, padding and title voice whatever the bar is about, so Runes,
 * Artifacts, Relics and General read as one page rather than four. A card that
 * holds a single control naming itself — a slider with its own label — takes no
 * title, because the control's label already is one, in the same voice.
 */
export function SettingsCard({ title, className, children }: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return <section className={className ? `settings-card ${className}` : 'settings-card'}
    aria-labelledby={title ? titleId : undefined}>
    {title && <h3 className="settings-card-title" id={titleId}>{title}</h3>}
    {children}
  </section>;
}
