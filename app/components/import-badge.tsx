import type { GeneralSettings, ImportedGame } from '../lib/types';
import { count, formatDateTime, formatNumber } from '../lib/formatting';

export function ImportBadge({ game, monsterCount, general }: { game: ImportedGame; monsterCount: number; general: GeneralSettings }) {
  return <aside className="import-badge live" aria-label="Imported game data">
    <p className="import-badge-count">
      {formatNumber(monsterCount, general)} monsters · {formatNumber(count(game.data.runes), general)} runes
    </p>
    <p className="import-badge-count secondary">
      {formatNumber(count(game.data.rune_craft_item_list), general)} gems &amp; grinds · {formatNumber(count(game.data.artifacts), general)} artifacts · {formatNumber(count(game.data.relics), general)} relics
    </p>
    <p className="import-badge-when">imported {formatDateTime(game.importedAt, general)}</p>
  </aside>;
}
