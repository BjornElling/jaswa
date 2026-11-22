import { engravingLines } from '../../domain/placements/presets';
import type { Engraving, Preset } from '../../domain/placements/presets';
import { runePlacementLabel } from '../../domain/placements/rune-placement';
import type { RunePlacementSummary } from '../../domain/placements/rune-placement';

/** The shared cell shell; rune and artifact readers supply distinct contracts. */
function PlaceReading({ places, presets, monsterName, label, count, empty, named = false, mutedWhenEmpty = false, spacedCount = false }: {
  places: readonly Engraving[];
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
  label: string;
  count: string;
  empty: boolean;
  named?: boolean;
  mutedWhenEmpty?: boolean;
  spacedCount?: boolean;
}) {
  if (empty) return <span className={`engraved-place${mutedWhenEmpty ? ' muted' : ''}`}>Inventory</span>;
  const lines = engravingLines(places, presets, monsterName);
  return <span className={`engraved-place${named ? ' engraved-place-named' : ''}`} title={lines.join('\n')} aria-label={`Engraved: ${lines.join('; ')}`}>
    <span className="engraved-place-name" aria-hidden="true">{label}</span>
    <span className="engraved-place-count" aria-hidden="true">{count && (spacedCount ? <> {count}</> : count)}</span>
  </span>;
}

/** Rune locations use only the canonical Scenario-first summary. */
export function EngravedPlace({ runePlacement, presets, monsterName }: {
  runePlacement: RunePlacementSummary;
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
}) {
  const reading = runePlacementLabel(runePlacement, (place) => monsterName(place.unitId, place.presetId));
  return <PlaceReading places={runePlacement.places} presets={presets} monsterName={monsterName}
    label={reading.label} count={reading.count} empty={runePlacement.count === 0} named mutedWhenEmpty spacedCount />;
}

/** Artifacts keep their all-placement location reading, separate from runes. */
export function ArtifactEngravedPlace({ places, presets, monsterName }: {
  places: readonly Engraving[];
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
}) {
  return <PlaceReading places={places} presets={presets} monsterName={monsterName} label="Engraved"
    count={places.length > 1 ? `×${places.length}` : ''} empty={places.length === 0} />;
}
