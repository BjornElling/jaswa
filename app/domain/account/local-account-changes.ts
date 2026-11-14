import { isRecord } from '../profiles/preference-reading';

export type FirstObservedPlacements = Record<string, Record<string, string | null>>;
export type LocalPreset = {
  positions: readonly { unitId: number; positionId?: number }[];
  leaderUnitId: number | null;
  gear: readonly { unitId: number; runeIds: readonly number[]; artifactIds: readonly number[] }[] | null;
};

/**
 * Choices made locally against an accepted account observation. The observation
 * remains the source of game facts; this projection records only the user's
 * departures from it, so a fresh import can be compared with them explicitly.
 */
export type LocalAccountChanges = {
  firstObservedPlacements?: FirstObservedPlacements;
  removedPresetIds?: readonly string[];
  scenarioRuneOwners?: Readonly<Record<string, string | null>>;
  gamePresets?: Readonly<Record<string, LocalPreset | null>>;
};

export function withFirstObservedPlacements(
  changes: LocalAccountChanges | undefined,
  placements: FirstObservedPlacements | undefined,
): LocalAccountChanges | undefined {
  const next = { ...changes };
  if (placements && Object.keys(placements).length > 0) next.firstObservedPlacements = placements;
  else delete next.firstObservedPlacements;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function withRemovedPreset(changes: LocalAccountChanges | undefined, presetId: string): LocalAccountChanges {
  const removed = new Set(changes?.removedPresetIds ?? []);
  removed.add(presetId);
  return { ...changes, removedPresetIds: [...removed] };
}

/** Read one saved projection field at a time; malformed changes cost only that field. */
export function readLocalAccountChanges(value: unknown): LocalAccountChanges | undefined {
  if (!isRecord(value)) return undefined;
  const firstObserved: FirstObservedPlacements = {};
  if (isRecord(value.firstObservedPlacements)) {
    for (const [presetId, placements] of Object.entries(value.firstObservedPlacements)) {
      if (presetId.length === 0 || !isRecord(placements)) continue;
      const entries = Object.entries(placements)
        .filter(([runeId, place]) => runeId.length > 0 && (place === null || (typeof place === 'string' && place.length > 0)));
      if (entries.length > 0) firstObserved[presetId] = Object.fromEntries(entries) as Record<string, string | null>;
    }
  }
  const removedPresetIds = Array.isArray(value.removedPresetIds)
    ? [...new Set(value.removedPresetIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : [];
  const changes: LocalAccountChanges = {};
  if (Object.keys(firstObserved).length > 0) changes.firstObservedPlacements = firstObserved;
  if (removedPresetIds.length > 0) changes.removedPresetIds = removedPresetIds;
  if (isRecord(value.scenarioRuneOwners)) {
    const owners = Object.entries(value.scenarioRuneOwners).filter(([id, owner]) => /^\d+$/.test(id)
      && (owner === null || (typeof owner === 'string' && /^\d+$/.test(owner))));
    if (owners.length) changes.scenarioRuneOwners = Object.fromEntries(owners) as Record<string, string | null>;
  }
  if (isRecord(value.gamePresets)) {
    const presets: Record<string, LocalPreset | null> = {};
    const id = (entry: unknown) => typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 0;
    const ids = (entry: unknown) => Array.isArray(entry) && entry.every(id);
    for (const [key, preset] of Object.entries(value.gamePresets)) {
      if (preset === null) { presets[key] = null; continue; }
      if (!isRecord(preset) || !Array.isArray(preset.positions)
        || !preset.positions.every((position) => isRecord(position) && id(position.unitId)
          && (position.positionId === undefined || id(position.positionId)))
        || (preset.leaderUnitId !== null && !id(preset.leaderUnitId))
        || (preset.gear !== null && (!Array.isArray(preset.gear) || !preset.gear.every((entry) => isRecord(entry)
          && id(entry.unitId) && ids(entry.runeIds) && ids(entry.artifactIds))))) continue;
      presets[key] = preset as LocalPreset;
    }
    if (Object.keys(presets).length) changes.gamePresets = presets;
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}
