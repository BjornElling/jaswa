import type { GameRecord } from './game-data';

function records(value: unknown): GameRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is GameRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function record(value: unknown): GameRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GameRecord : undefined;
}

/**
 * Summoned Shrine stacks are published at the account root by the helper. The
 * original game response nests the same list under GetUnitStorageList, so this
 * boundary reads either current source without making callers guess its shape.
 * A root array is authoritative even when it is empty: an explicit empty
 * shrine must never fall back to an older nested response.
 */
export function summonedShrineRecords(data: GameRecord | undefined): GameRecord[] {
  if (!data) return [];
  if (Array.isArray(data.unit_storage_list)) return records(data.unit_storage_list);
  const directResponse = record(data.GetUnitStorageList);
  if (Array.isArray(directResponse?.unit_storage_list)) return records(directResponse.unit_storage_list);
  const partOne = record(data.GetWizardDataPart1);
  const nestedResponse = record(partOne?.GetUnitStorageList);
  return records(nestedResponse?.unit_storage_list);
}
