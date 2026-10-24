import { scenarioPresetId } from './preset-ids';
import type { Engraving } from './presets';

/** The one Scenario-first reading shared by every rune workspace outside Rune Optimization. */
export type RunePlacementSummary = {
  scenario: Engraving | null;
  elsewhere: readonly Engraving[];
  /** Every context, kept in the account's preset order for hover readings. */
  places: readonly Engraving[];
  count: number;
};

export function summarizeRunePlacement(places: readonly Engraving[]): RunePlacementSummary {
  const scenario = places.find((place) => place.presetId === scenarioPresetId) ?? null;
  const elsewhere = places.filter((place) => place.presetId !== scenarioPresetId);
  return { scenario, elsewhere, places, count: (scenario === null ? 0 : 1) + elsewhere.length };
}

export const emptyRunePlacement = summarizeRunePlacement([]);

export function hasRunePlacement(placement: RunePlacementSummary): boolean {
  return placement.count > 0;
}

export function hasRunePlacementOutsideScenario(placement: RunePlacementSummary): boolean {
  return placement.elsewhere.length > 0;
}

/** The universal rune location reading: Scenario owner first, then the other placements. */
export function runePlacementLabel(placement: RunePlacementSummary, scenarioName: (place: Engraving) => string): { label: string; count: string } {
  if (placement.count === 0) return { label: 'Inventory', count: '' };
  if (placement.scenario !== null) {
    return { label: scenarioName(placement.scenario), count: placement.elsewhere.length > 0 ? `(+ ${placement.elsewhere.length})` : '' };
  }
  return { label: 'Engraved', count: `× ${placement.count}` };
}
