import { useMemo } from 'react';
import { accountCounts } from '../lib/account-counts';
import type { GeneralSettings, ImportedGame } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/formatting';

export function ImportBadge({ game, general }: { game: ImportedGame; general: GeneralSettings }) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  return <aside className="import-badge live" aria-label="Imported game data">
    <p className="import-badge-count">
      {formatNumber(counts.monsters, general)} monsters · {formatNumber(counts.runes, general)} runes
    </p>
    <p className="import-badge-count secondary">
      {formatNumber(counts.gemsAndGrinds, general)} gems &amp; grinds · {formatNumber(counts.artifacts, general)} artifacts · {formatNumber(counts.relics, general)} relics
    </p>
    <p className="import-badge-when">imported {formatDateTime(game.importedAt, general)}</p>
  </aside>;
}

/* This is deliberately an overlay rather than a line in Game data. A completed
   import deserves an unmissable answer, but confirmation must not push the
   choices the user was about to make down the page. */
export function ImportConfirmation({ game, general }: { game: ImportedGame; general: GeneralSettings }) {
  const counts = useMemo(() => accountCounts(game.data), [game]);
  return <aside className="import-confirmation" role="status" aria-live="polite"
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
