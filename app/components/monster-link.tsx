import type { MouseEvent, ReactNode } from 'react';
import { MonsterPortrait } from './monster-portrait';

/**
 * Which monster an overlay would open for.
 *
 * Preferences are stated per owned copy, so a `copy` reference is the one that
 * can carry them. A `species` reference names a monster in the abstract — the
 * recommendation columns can name one the account does not own, and a shrine
 * stack has no stable copy id — and opens the overlay read-only: what the
 * player base does, with nothing to set.
 */
export type MonsterReference =
  | { kind: 'copy'; unitId: string; masterId: string }
  | { kind: 'species'; speciesId: string };

export type OpenMonsterOverlay = (target: MonsterReference, opener: HTMLElement) => void;

/**
 * A monster's name, as the way into its overlay.
 *
 * A `button`, never an `a`: there is no router and no URL behind this, so an
 * anchor would promise a destination that middle-click and "copy link" cannot
 * deliver. `aria-haspopup="dialog"` says what actually happens.
 *
 * The button inherits its cell's box completely and changes only colour and an
 * underline that is present-but-transparent from the first paint, so hovering a
 * name cannot move the row around it (`AGENTS.md` §2). The resting state is the
 * name exactly as it read before, because four hundred permanently gold names
 * in a table would leave gold meaning nothing (§5).
 *
 * `target` of `null` renders the name as the inert text it is today — a monster
 * this import does not contain, or a location that is not a monster at all.
 */
export function MonsterLink({ target, name, portrait, onOpen, children }: {
  target: MonsterReference | null;
  name: string;
  portrait?: { imageFilename?: string; initial: string };
  onOpen?: OpenMonsterOverlay;
  /** What to render in place of the name, where a caller draws its own cell. */
  children?: ReactNode;
}) {
  const label = <span className="monster-name">{children ?? name}</span>;

  const body = portrait === undefined ? label : <>
    <MonsterPortrait imageFilename={portrait.imageFilename} initial={portrait.initial} name={name} decorative />
    {label}
  </>;

  if (target === null || onOpen === undefined) {
    return portrait === undefined ? label : <span className="monster-cell">{body}</span>;
  }

  return <button
    type="button"
    className={portrait === undefined ? 'monster-link' : 'monster-link monster-cell'}
    aria-haspopup="dialog"
    aria-label={name}
    onClick={(event: MouseEvent<HTMLButtonElement>) => onOpen(target, event.currentTarget)}
  >
    {body}
  </button>;
}
