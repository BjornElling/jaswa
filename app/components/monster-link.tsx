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

/**
 * `presetId` is the preset the place naming the monster is about — a preset's
 * team, a rune's place in one preset, a build for one preset. The overlay reads
 * that preset, and Optimize takes it on, so a monster opened from Arena Attack 1
 * is not optimized for Default. A place about no preset leaves it out, and the
 * overlay reads the preset chosen across the program.
 */
export type OpenMonsterOverlay = (target: MonsterReference, opener: HTMLElement, presetId?: string) => void;

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
export function MonsterLink({ target, name, portrait, presetId, onOpen, children }: {
  target: MonsterReference | null;
  name: string;
  portrait?: { imageFilename?: string; initial: string };
  /** The preset this place is about, where it is about one (`OpenMonsterOverlay`). */
  presetId?: string;
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
    onClick={(event: MouseEvent<HTMLButtonElement>) => onOpen(target, event.currentTarget, presetId)}
  >
    {body}
  </button>;
}
