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

/**
 * The keys each shrine tab may arrive under, per tab.
 *
 * SWEX's original merged export calls the summoned shrine list
 * `unit_storage_list`; newer captures may name either tab explicitly instead.
 * Stated once here and read by every caller, so a newly accepted key reaches
 * the Numbers table and the search's own view of the account together.
 */
export const shrineListKeys = {
  'sealed-summoned': [
    'summoned_unit_storage_list', 'unit_summoned_storage_list', 'unit_storage_list_summoned', 'summoned_storage_list',
    'summoned_monster_storage_list', 'sealed_shrine_summoned', 'sealedShrineSummoned',
  ],
  'sealed-normal': [
    'unit_storage_normal_list', 'normal_unit_storage_list', 'unit_normal_storage_list', 'unit_storage_list_normal',
    'normal_storage_list', 'normal_monster_storage_list', 'sealed_shrine_normal', 'sealedShrineNormal',
  ],
} as const;

/** Containers that hold both tabs as named lists rather than at the root. */
export const shrineContainerKeys = ['sealed_shrine', 'sealedShrine', 'sealed_monster_storage', 'sealedMonsterStorage'];

/** Within such a container, the names each tab's list may take. */
export const shrineContainerListKeys = {
  'sealed-summoned': ['summoned', 'Summoned', 'summoned_storage', 'summonedStorage'],
  'sealed-normal': ['normal', 'Normal', 'normal_storage', 'normalStorage'],
} as const;

/**
 * Every monster record the export puts in either Sealed Shrine tab, without
 * saying which tab it came from.
 *
 * The Numbers table needs that distinction because it shows a Location column;
 * a caller asking only *what the account holds* does not, and this spares it the
 * tab-classifying machinery. Duplicates are possible in principle — one record
 * reachable under two accepted keys — and are the caller's to fold, which is
 * free for the set-building this exists to feed.
 */
export function shrineMonsterRecords(data: GameRecord | undefined): GameRecord[] {
  if (!data) return [];
  const found = [...summonedShrineRecords(data)];
  for (const tab of ['sealed-summoned', 'sealed-normal'] as const) {
    for (const key of shrineListKeys[tab]) found.push(...records(data[key]));
    for (const containerKey of shrineContainerKeys) {
      const container = record(data[containerKey]);
      if (!container) continue;
      for (const key of shrineContainerListKeys[tab]) found.push(...records(container[key]));
    }
  }
  return found;
}
