import { isRecord } from '../profiles/preference-reading';

export type FirstObservedPlacements = Record<string, Record<string, string | null>>;

/**
 * Choices made locally against an accepted account observation. The observation
 * remains the source of game facts; this projection records only the user's
 * departures from it, so a fresh import can be compared with them explicitly.
 */
export type LocalAccountChanges = {
  firstObservedPlacements?: FirstObservedPlacements;
  removedPresetIds?: readonly string[];
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
  return Object.keys(changes).length > 0 ? changes : undefined;
}
