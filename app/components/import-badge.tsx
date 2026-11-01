import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Ref, RefObject } from 'react';
import { accountCounts } from '../lib/account-counts';
import type { GeneralSettings, ImportedGame } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/formatting';
import { recommendedHelperVersion } from '../lib/helper-version';
import { HelperDownload } from './helper-download';
import { Button } from './button';

export function ImportBadge({ game, general, ref }: {
  game: ImportedGame;
  general: GeneralSettings;
  /** Handed out so the cards hanging under it can measure what they have to clear. */
  ref?: Ref<HTMLElement>;
}) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  return <aside ref={ref} className="import-badge live" data-notice-tone="good" aria-label="Imported game data">
    <p className="import-badge-count">
      {formatNumber(counts.monsters, general)} monsters · {formatNumber(counts.runes, general)} runes
    </p>
    <p className="import-badge-count secondary">
      {formatNumber(counts.gemsAndGrinds, general)} gems &amp; grinds · {formatNumber(counts.artifacts, general)} artifacts · {formatNumber(counts.relics, general)} relics
    </p>
    <p className="import-badge-when">imported {formatDateTime(game.importedAt, general, true)}</p>
  </aside>;
}

/** One step on the 4px rhythm, read from the stylesheet so it cannot drift. */
function step(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/** A corner card's whole box, in the canvas's own pixels. */
type Placement = { top: number; right: number; width: number; height: number };

/** The ratio `AppViewport`'s zoom puts between viewport and canvas pixels, read off the box itself. */
function canvasScale(box: HTMLElement): number {
  return box.offsetHeight > 0 ? box.getBoundingClientRect().height / box.offsetHeight : 0;
}

/**
 * Where the confirmation belongs: under `clear`, shaped like `shape`.
 *
 * The top-right corner is the badge's corner, and two cards in it is one card
 * nobody can read. So the toast goes under the badge — or under the helper
 * warning when one hangs there, because a standing problem outranks a passing
 * success — and *under* is measured against that card's real bottom edge, not
 * its height: both scroll with the page, so a card half out of view needs half
 * the clearance and one scrolled past needs none. `Math.max` against the plain
 * inset says that.
 *
 * The other three come from the badge because two stacked cards that nearly
 * agree read as a mistake. The fixed notice uses the badge's right inset and
 * its layout width. Those values share CSS pixels with the canvas; fractional
 * viewport measurements do not, and feeding them back through `zoom` was the
 * source of the small but visible sideways drift.
 *
 * The right inset is measured from the root's client width, never from
 * `window.innerWidth`. The page keeps a permanent scrollbar track, and
 * `innerWidth` counts it while a fixed box's `right` starts inside it — so the
 * toast stood one scrollbar to the left of the badge. Playwright hides
 * scrollbars by default, which is how that passed every test; the
 * import-confirmation spec runs with them shown.
 *
 * `getBoundingClientRect` reads the zoomed canvas in viewport pixels while
 * `offsetHeight` reads the same box in the canvas's own, so the ratio between
 * them is the scale `AppViewport` applied — and dividing by it converts a
 * measurement back into the units these four are written in. Taking the scale
 * from the box itself keeps this component out of that decision.
 */
function placeBelow(clear: HTMLElement, shape: HTMLElement, inset: number, gap: number): Placement | null {
  const scale = canvasScale(shape);
  if (!scale) return null;
  const box = shape.getBoundingClientRect();
  return {
    top: Math.max(inset, clear.getBoundingClientRect().bottom / scale + gap),
    right: Math.max(0, (document.documentElement.clientWidth - box.right) / scale),
    width: box.width / scale,
    height: box.height / scale,
  };
}

/**
 * The helper warning's top and width, in its own containing block.
 *
 * It hangs from the workspace like the badge, not from the window like the
 * toast: it stays for as long as the helper is old, and a card pinned to the
 * window for that long would sit over whatever the page scrolled under it.
 * Under the badge it takes the badge's width; with no badge the stylesheet's
 * corner placement stands. A narrow screen sets it static, and then nothing
 * here applies.
 */
function placeNotice(notice: HTMLElement, badge: HTMLElement | null, gap: number) {
  const container = notice.offsetParent;
  const scale = badge ? canvasScale(badge) : 0;
  const floating = getComputedStyle(notice).position === 'absolute';
  if (!floating || !badge || !scale || !container) {
    notice.style.top = '';
    notice.style.width = '';
    return;
  }
  const box = badge.getBoundingClientRect();
  notice.style.top = `${(box.bottom - container.getBoundingClientRect().top) / scale + gap}px`;
  notice.style.width = `${box.width / scale}px`;
}

/**
 * One placement pass keeps the reload action, helper warning and confirmation
 * below the account badge and clear of one another.
 *
 * Both are placed in one pass because each depends on the one above it. Placed
 * by two components, the toast measured the warning before the warning had
 * moved under the badge, and stood one frame — or one resize — out of step.
 * The placement is written straight onto the two boxes for the same reason:
 * a state update would let the toast read the warning's previous position.
 *
 * Both are overlays rather than lines in Game data. Neither may push the
 * choices the user was about to make down the page.
 */
export function CornerNotices({ badge, badgeShown, reload, reloadError, reloading, onReload, helperUpdate, importStopped, connectionError, missedCommands, confirmation, general }: {
  reload: boolean;
  reloadError: string | null;
  reloading: boolean;
  onReload: () => void;
  /** The import badge, where the page has one: the card both must not cover. */
  badge: RefObject<HTMLElement | null>;
  /** Whether the badge is on the page, so its arrival or removal re-places both cards. */
  badgeShown: boolean;
  /** The connected helper is older than the one JASWA recommends. */
  helperUpdate: boolean;
  /** Why the helper's newest snapshot was refused while the shown import stands, or `null`. */
  importStopped: string | null;
  /** A failed helper connection or missed login, even before the first import. */
  connectionError: string | null;
  /** Commands whose changes the helper could not read while import goes on; empty when none. */
  missedCommands: string[];
  confirmation: ImportedGame | null;
  general: GeneralSettings;
}) {
  /* A stop outranks a gap: while nothing arrives, which changes were missed
     before is the smaller news. Both use the one slot under the badge. */
  const missed = importStopped === null && connectionError === null && missedCommands.length > 0
    ? `${missedCommands.slice(0, 3).join(', ')}${missedCommands.length > 3 ? ` and ${missedCommands.length - 3} more` : ''}`
    : null;
  const stoppedNotice = useRef<HTMLElement | null>(null);
  const updateNotice = useRef<HTMLElement | null>(null);
  const reloadButton = useRef<HTMLButtonElement | null>(null);
  const toast = useRef<HTMLElement | null>(null);
  const toastShown = confirmation !== null || (reload && reloadError !== null);

  /* Before the paint, not after: measured in an ordinary effect a card would
     appear over the badge for one frame and then jump out from under it. */
  useLayoutEffect(() => {
    const inset = step('--s4', 16);
    const gap = step('--s3', 12);
    const above = badge.current;
    const update = () => {
      const button = reloadButton.current;
      if (button) {
        placeNotice(button, above, gap);
        if (above) button.style.width = `${above.offsetWidth}px`;
        button.style.height = above ? `${above.offsetHeight}px` : '';
      }
      if (stoppedNotice.current) placeNotice(stoppedNotice.current, button ?? above, gap);
      if (updateNotice.current) placeNotice(updateNotice.current, stoppedNotice.current ?? button ?? above, gap);
      const card = toast.current;
      if (!card) return;
      const clear = updateNotice.current ?? stoppedNotice.current ?? button ?? above;
      const shape = above ?? button ?? stoppedNotice.current ?? updateNotice.current;
      const place = clear && shape ? placeBelow(clear, shape, inset, gap) : null;
      card.style.top = place ? `${place.top}px` : '';
      card.style.right = place ? `${place.right}px` : '';
      card.style.width = place ? `${place.width}px` : '';
      card.style.height = place ? `${place.height}px` : '';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    /* A card above can change shape without the window doing anything — a web
       font arriving is enough — and the ones below are cut to its measurements,
       so they watch the boxes rather than only the events around them. */
    const watcher = new ResizeObserver(update);
    for (const box of [above, reloadButton.current, stoppedNotice.current, updateNotice.current]) if (box) watcher.observe(box);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      watcher.disconnect();
    };
  }, [badge, badgeShown, helperUpdate, importStopped, connectionError, missed, toastShown, reload, reloadError]);

  return <>
    {reload && <Button ref={reloadButton} size="card" className="game-reload" busy={reloading}
      busyLabel="Reloading game data…" onClick={onReload}
      title="Read the helper's latest game data. Replaces changes planned in JASWA.">
      Reload game data
    </Button>}
    {importStopped !== null && <ImportStoppedNotice ref={stoppedNotice} reason={importStopped} />}
    {importStopped === null && connectionError !== null && <aside ref={stoppedNotice} className="helper-update" data-notice-tone="bad" role="status" aria-live="polite" aria-label="Helper connection failed">
      <p className="corner-notice-title">Helper connection failed</p>
      <p className="corner-notice-detail">{connectionError}</p>
    </aside>}
    {missed !== null && <MissedChangesNotice ref={stoppedNotice} commands={missed} />}
    {helperUpdate && <HelperUpdateNotice ref={updateNotice} />}
    {reload && reloadError
      ? <aside ref={toast} className="import-confirmation import-failure" data-notice-tone="bad" role="status" aria-label="Game data reload failed">
        <p className="corner-notice-title">Game data reload failed</p>
        <p className="corner-notice-detail">{reloadError}</p>
      </aside>
      : confirmation && <ImportConfirmation ref={toast} game={confirmation} general={general} />}
  </>;
}

/* The one warning that outlives the moment it appeared in: an old helper stays
   old until it is replaced, so this stands for as long as the helper says so,
   and goes as soon as the helper, or the route, stops saying it. */
function HelperUpdateNotice({ ref }: { ref: Ref<HTMLElement> }) {
  return <aside ref={ref} className="helper-update" data-notice-tone="warn" role="status" aria-live="polite" aria-label="Helper update available">
    <p className="corner-notice-title">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M10 2.75 18 16.75H2z" opacity=".45" />
        <path d="M10 8v3.75M10 14.25v.25" />
      </svg>
      Helper is tired, boss
    </p>
    <p className="corner-notice-detail">
      You should let it rest.<br />
      Version {recommendedHelperVersion} is now available.
    </p>
    <div className="helper-update-action"><HelperDownload tone="quiet" size="compact">Download update</HelperDownload></div>
  </aside>;
}

/* Stands on every page while the helper's newest game data is refused: the badge
   above it keeps the time of the import still shown, and this says why that
   time has stopped moving. */
function ImportStoppedNotice({ reason, ref }: { reason: string; ref: Ref<HTMLElement> }) {
  return <aside ref={ref} className="helper-update" data-notice-tone="bad" role="status" aria-live="polite" aria-label="Live import stopped">
    <p className="corner-notice-title">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M10 2.75 18 16.75H2z" opacity=".45" />
        <path d="M10 8v3.75M10 14.25v.25" />
      </svg>
      Live import stopped
    </p>
    <p className="corner-notice-detail">
      {reason}<br />
      Changes made in the game since then are not shown.
    </p>
  </aside>;
}

/* Stands on every page while the helper follows the game with a gap in it. The
   import keeps moving, so this is a warning and not a stop; only a fresh login
   carries the whole account again. */
function MissedChangesNotice({ commands, ref }: { commands: string; ref: Ref<HTMLElement> }) {
  return <aside ref={ref} className="helper-update missed-changes" data-notice-tone="bad" role="status" aria-live="polite" aria-label="Some game changes were missed">
    <p className="corner-notice-title">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M10 2.75 18 16.75H2z" opacity=".45" />
        <path d="M10 8v3.75M10 14.25v.25" />
      </svg>
      Live import has a gap
    </p>
    <p className="corner-notice-detail">
      The helper could not read {commands}.<br />
      Everything else keeps arriving. Restart Summoners War for a complete import.
    </p>
  </aside>;
}

function ImportConfirmation({ game, general, ref }: { game: ImportedGame; general: GeneralSettings; ref: Ref<HTMLElement> }) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  return <aside ref={ref} className="import-confirmation" data-notice-tone="good" role="status" aria-live="polite"
    aria-label="Game data loaded correctly">
    <p className="corner-notice-title">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8" opacity=".45" />
        <path d="m6.25 10 2.4 2.4 5.2-5.2" />
      </svg>
      Game data loaded correctly
    </p>
    <p className="corner-notice-detail">
      {formatNumber(counts.monsters, general)} monsters · {formatNumber(counts.runes, general)} runes · {formatNumber(counts.artifacts, general)} artifacts
    </p>
  </aside>;
}
