import { engravingLines } from '../lib/presets';
import type { Engraving, Preset } from '../lib/presets';
import { runePlacementLabel } from '../lib/rune-placement';
import type { RunePlacementSummary } from '../lib/rune-placement';

/** The shared cell shell; rune and artifact readers supply distinct contracts. */
function PlaceReading({ places, presets, monsterName, label, count, empty, sold = false, named = false, mutedWhenEmpty = false, spacedCount = false }: {
  places: readonly Engraving[];
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
  label: string;
  count: string;
  empty: boolean;
  sold?: boolean;
  named?: boolean;
  mutedWhenEmpty?: boolean;
  spacedCount?: boolean;
}) {
  if (sold) return <span className="engraved-place muted">Sold</span>;
  if (empty) return <span className={`engraved-place${mutedWhenEmpty ? ' muted' : ''}`}>Inventory</span>;
  const lines = engravingLines(places, presets, monsterName);
  return <span className={`engraved-place${named ? ' engraved-place-named' : ''}`} title={lines.join('\n')} aria-label={`Engraved: ${lines.join('; ')}`}>
    <span className="engraved-place-name" aria-hidden="true">{label}</span>
    <span className="engraved-place-count" aria-hidden="true">{count && (spacedCount ? <> {count}</> : count)}</span>
  </span>;
}

/** Rune locations use only the canonical Scenario-first summary. */
export function EngravedPlace({ runePlacement, sold = false, presets, monsterName }: {
  runePlacement: RunePlacementSummary;
  sold?: boolean;
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
}) {
  const reading = runePlacementLabel(runePlacement, (place) => monsterName(place.unitId, place.presetId));
  return <PlaceReading places={runePlacement.places} presets={presets} monsterName={monsterName}
    label={reading.label} count={reading.count} empty={runePlacement.count === 0} sold={sold} named mutedWhenEmpty spacedCount />;
}

/** Artifacts keep their all-placement location reading, separate from runes. */
export function ArtifactEngravedPlace({ places, sold = false, presets, monsterName }: {
  places: readonly Engraving[];
  sold?: boolean;
  presets: readonly Preset[];
  monsterName: (unitId: string, presetId: string) => string;
}) {
  return <PlaceReading places={places} presets={presets} monsterName={monsterName} label="Engraved"
    count={places.length > 1 ? `×${places.length}` : ''} empty={places.length === 0} sold={sold} />;
}
