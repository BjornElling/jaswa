import { createContext, useContext } from 'react';
import type { Engraving, Preset } from './presets';
import type { RunePlacementSummary } from './rune-placement';

/**
 * Scenario and every preset, and where each rune and artifact is engraved in
 * them, resolved once by the page (`DECK-PRESETS.md` §4). Rune locations arrive
 * as their canonical Scenario-first summary; artifacts keep every placement.
 * A context rather than a prop through every workspace, because a location is
 * shown in a dozen places and each must read the same answer.
 */
export type PresetsReading = {
  presets: readonly Preset[];
  runes: ReadonlyMap<string, RunePlacementSummary>;
  artifacts: ReadonlyMap<string, Engraving[]>;
};

const empty: PresetsReading = { presets: [], runes: new Map(), artifacts: new Map() };

export const PresetsContext = createContext<PresetsReading>(empty);

export function usePresets(): PresetsReading {
  return useContext(PresetsContext);
}
