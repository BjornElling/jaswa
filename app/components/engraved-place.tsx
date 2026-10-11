import { defaultPresetId, engravingLines } from '../lib/presets';
import type { Engraving, Preset } from '../lib/presets';

/**
 * All placements remain in the hover; Clean-up names the Default monster and
 * reserves a separate count so a long name cannot hide its other placements.
 */
export function EngravedPlace({ places, sold = false, presets, monsterName, showDefaultMonster = false }: {
  places: readonly Engraving[];
  sold?: boolean;
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
  showDefaultMonster?: boolean;
}) {
  if (sold) return <span className="engraved-place muted">Sold</span>;
  if (places.length === 0) return <span className={`engraved-place${showDefaultMonster ? ' muted' : ''}`}>Inventory</span>;
  const lines = engravingLines(places, presets, monsterName);
  const where = lines.join('\n');
  const defaultPlace = showDefaultMonster ? places.find((place) => place.presetId === defaultPresetId) : undefined;
  const label = defaultPlace ? monsterName(defaultPlace.unitId, defaultPlace.presetId) : 'Engraved';
  const count = showDefaultMonster
    ? defaultPlace ? places.length > 1 ? `(+ ${places.length - 1})` : '' : `× ${places.length}`
    : places.length > 1 ? `×${places.length}` : '';
  return <span className={`engraved-place${showDefaultMonster ? ' engraved-place-named' : ''}`} title={where} aria-label={`Engraved: ${lines.join('; ')}`}>
    <span className="engraved-place-name" aria-hidden="true">{label}</span>
    <span className="engraved-place-count" aria-hidden="true">{count && (showDefaultMonster ? <> {count}</> : count)}</span>
  </span>;
}
