import { useLayoutEffect, useMemo, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { accountCounts } from '../lib/account-counts';
import type { GeneralSettings, ImportedGame } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/formatting';

export function ImportBadge({ game, general, ref }: {
  game: ImportedGame;
  general: GeneralSettings;
  /** Handed out so the import confirmation can measure what it has to clear. */
  ref?: Ref<HTMLElement>;
}) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  return <aside ref={ref} className="import-badge live" aria-label="Imported game data">
    <p className="import-badge-count">
      {formatNumber(counts.monsters, general)} monsters · {formatNumber(counts.runes, general)} runes
    </p>
    <p className="import-badge-count secondary">
      {formatNumber(counts.gemsAndGrinds, general)} gems &amp; grinds · {formatNumber(counts.artifacts, general)} artifacts · {formatNumber(counts.relics, general)} relics
    </p>
    <p className="import-badge-when">imported {formatDateTime(game.importedAt, general)}</p>
  </aside>;
}

/** One step on the 4px rhythm, read from the stylesheet so it cannot drift. */
function step(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/** The confirmation's whole box, in the canvas's own pixels. */
type Placement = { top: number; right: number; width: number; height: number };

/**
 * Where the confirmation belongs, measured off the account badge above it.
 *
 * The top-right corner is the badge's corner, and two cards in it is one card
 * nobody can read. So the toast goes under the badge — and *under* is measured
 * against the badge's real bottom edge, not its height: the badge scrolls with
 * the page, so a badge half out of view needs half the clearance and one
 * scrolled past needs none. `Math.max` against the plain inset says that.
 *
 * The other three come from the badge because two stacked cards that nearly
 * agree read as a mistake, and every way of nearly agreeing was tried on the
 * way here. The window's own inset put the toast's right edge well outside the
 * badge's, because the badge keeps the *workspace's* gutter — it sits inside
 * the rail's grid column, and the window reserves a scrollbar track besides.
 * Matching the right edge alone then left the wider toast hanging out to the
 * left instead. Only the whole box copied over stacks the two exactly, so the
 * whole box is what is copied.
 *
 * `getBoundingClientRect` reads the zoomed canvas in viewport pixels while
 * `offsetHeight` reads the same box in the canvas's own, so the ratio between
 * them is the scale `AppViewport` applied — and dividing by it converts a
 * measurement back into the units these four are written in. Taking the scale
 * from the box itself keeps this component out of that decision.
 */
function placeBelow(badge: HTMLElement | null, inset: number, gap: number): Placement | null {
  if (!badge) return null;
  const box = badge.getBoundingClientRect();
  const scale = badge.offsetHeight > 0 ? box.height / badge.offsetHeight : 0;
  if (!scale) return null;
  return {
    top: Math.max(inset, box.bottom / scale + gap),
    right: Math.max(0, (window.innerWidth - box.right) / scale),
    width: box.width / scale,
    height: box.height / scale,
  };
}

/* This is deliberately an overlay rather than a line in Game data. A completed
   import deserves an unmissable answer, but confirmation must not push the
   choices the user was about to make down the page. */
export function ImportConfirmation({ game, general, below }: {
  game: ImportedGame;
  general: GeneralSettings;
  /** The import badge, where the page has one: the card this must not cover. */
  below?: RefObject<HTMLElement | null>;
}) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  const [place, setPlace] = useState<Placement | null>(null);

  /* Before the paint, not after: measured in an ordinary effect the toast would
     appear over the badge for one frame and then jump out from under it. */
  useLayoutEffect(() => {
    const inset = step('--s4', 16);
    const gap = step('--s3', 12);
    const badge = below?.current ?? null;
    const update = () => setPlace(placeBelow(badge, inset, gap));
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    /* The card above can change shape without the window doing anything — a web
       font arriving is enough — and this one is cut to its measurements, so it
       watches the box rather than only the events around it. */
    const watcher = badge ? new ResizeObserver(update) : null;
    if (badge) watcher?.observe(badge);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      watcher?.disconnect();
    };
  }, [below]);

  return <aside className="import-confirmation" role="status" aria-live="polite"
    style={place === null ? undefined : {
      top: `${place.top}px`, right: `${place.right}px`,
      width: `${place.width}px`, height: `${place.height}px`,
    }}
    aria-label="Game data loaded correctly">
    <p className="import-confirmation-title">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8" opacity=".45" />
        <path d="m6.25 10 2.4 2.4 5.2-5.2" />
      </svg>
      Game data loaded correctly
    </p>
    <p className="import-confirmation-count">
      {formatNumber(counts.monsters, general)} monsters · {formatNumber(counts.runes, general)} runes · {formatNumber(counts.artifacts, general)} artifacts
    </p>
  </aside>;
}
