import { scenarioPresetId, engravingLines } from '../lib/presets';
import type { Engraving, Preset } from '../lib/presets';

/**
 * All placements remain in the hover; Clean-up names the Scenario monster and
 * reserves a separate count so a long name cannot hide its other placements.
 */
export function EngravedPlace({ places, sold = false, presets, monsterName, showScenarioMonster = false }: {
  places: readonly Engraving[];
  sold?: boolean;
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
  showScenarioMonster?: boolean;
}) {
  if (sold) return <span className="engraved-place muted">Sold</span>;
  if (places.length === 0) return <span className={`engraved-place${showScenarioMonster ? ' muted' : ''}`}>Inventory</span>;
  const lines = engravingLines(places, presets, monsterName);
  const where = lines.join('\n');
  const scenarioPlace = showScenarioMonster ? places.find((place) => place.presetId === scenarioPresetId) : undefined;
  const label = scenarioPlace ? monsterName(scenarioPlace.unitId, scenarioPlace.presetId) : 'Engraved';
  const count = showScenarioMonster
    ? scenarioPlace ? places.length > 1 ? `(+ ${places.length - 1})` : '' : `× ${places.length}`
    : places.length > 1 ? `×${places.length}` : '';
  return <span className={`engraved-place${showScenarioMonster ? ' engraved-place-named' : ''}`} title={where} aria-label={`Engraved: ${lines.join('; ')}`}>
    <span className="engraved-place-name" aria-hidden="true">{label}</span>
    <span className="engraved-place-count" aria-hidden="true">{count && (showScenarioMonster ? <> {count}</> : count)}</span>
  </span>;
}
