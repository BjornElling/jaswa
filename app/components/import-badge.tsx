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
