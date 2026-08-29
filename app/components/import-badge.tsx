import type { ImportedGame } from '../lib/types';
import { count, formatDateTime } from '../lib/formatting';

export function ImportBadge({ game, monsterCount }: { game: ImportedGame; monsterCount: number }) {
  return <aside className="import-badge live" aria-label="Imported game data">
    <p className="import-badge-count">
      {monsterCount.toLocaleString('en')} monsters · {count(game.data.runes).toLocaleString('en')} runes
    </p>
    <p className="import-badge-count secondary">
      {count(game.data.rune_craft_item_list).toLocaleString('en')} gems &amp; grinds · {count(game.data.artifacts).toLocaleString('en')} artifacts · {count(game.data.relics).toLocaleString('en')} relics
    </p>
    <p className="import-badge-when">imported {formatDateTime(game.importedAt)}</p>
  </aside>;
}
