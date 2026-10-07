import { engravingLines } from '../lib/presets';
import type { Engraving, Preset } from '../lib/presets';

/**
 * An item's location in one fixed shape: *Engraved* with the number of places
 * beside it, or *Inventory*, or *Sold*. A rune can sit on a monster in many
 * presets at once, so naming them all would not fit a cell; the places are in
 * the hover instead. The count has a box of its own whether or not it shows,
 * so a row does not change width with it (AGENTS.md §2).
 */
export function EngravedPlace({ places, sold = false, presets, monsterName }: {
  places: readonly Engraving[];
  sold?: boolean;
  presets: readonly Preset[];
  monsterName: (unitId: string) => string;
}) {
  if (sold) return <span className="engraved-place muted">Sold</span>;
  if (places.length === 0) return <span className="engraved-place">Inventory</span>;
  const lines = engravingLines(places, presets, monsterName);
  const where = lines.join('\n');
  return <span className="engraved-place" title={where} aria-label={`Engraved: ${lines.join('; ')}`}>
    <span aria-hidden="true">Engraved</span>
    <span className="engraved-place-count" aria-hidden="true">{places.length > 1 ? `×${places.length}` : ''}</span>
  </span>;
}
