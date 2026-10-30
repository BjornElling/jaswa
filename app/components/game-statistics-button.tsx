import type { MouseEvent } from 'react';
import { Button, InlineButton } from './button';
import type { ButtonSize } from './button';

/** Opens the game's statistics for one monster over the page, returning focus to `opener` on close. */
export type OpenMonsterStatistics = (masterId: string, opener: HTMLElement) => void;

/** Three bars of a chart: what the game's own Statistics panel draws. */
export function StatisticsIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 13.5h11" />
    <path d="M4.5 13.5V8.5" />
    <path d="M8 13.5V3.5" />
    <path d="M11.5 13.5V6.5" />
  </svg>;
}

/**
 * The one way into a monster's game statistics, so the profile and Rune
 * Optimization offer it in the same words and open it the same way.
 */
export function GameStatisticsButton({ masterId, name, size = 'regular', inline = false, className, onOpen }: {
  /** Undefined while no monster is chosen: the button stays, unavailable, so nothing beside it moves. */
  masterId: string | undefined;
  name: string;
  size?: ButtonSize;
  /** The small boxed word that sits beside a name, where a full button would crowd it. */
  inline?: boolean;
  className?: string;
  onOpen: OpenMonsterStatistics;
}) {
  const props = {
    className: ['game-statistics-button', className].filter(Boolean).join(' '),
    disabled: masterId === undefined,
    'aria-haspopup': 'dialog' as const,
    'aria-label': name === '' ? 'Statistics' : `Statistics for ${name}`,
    onClick: (event: MouseEvent<HTMLButtonElement>) => { if (masterId !== undefined) onOpen(masterId, event.currentTarget); },
  };
  const face = <span className="game-statistics-button-face"><StatisticsIcon /><span>Statistics</span></span>;
  return inline ? <InlineButton {...props}>{face}</InlineButton> : <Button size={size} {...props}>{face}</Button>;
}
