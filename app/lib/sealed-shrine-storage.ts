import type { GameRecord } from './game-data';

function records(value: unknown): GameRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is GameRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function record(value: unknown): GameRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GameRecord : undefined;
}

/* The containers the game is known to send each Sealed Shrine tab in — the
   same ones the helper reads (`helper/src-tauri/src/profile.rs`,
   `summoned_storage_list` and the normal-list read beside it). The account
   root comes first: the helper and a merged export both publish the tabs there,
   and a root list is authoritative even when it is empty, so an explicit empty
   shrine never falls back to an older nested response. No other key is read:
   a list under a name no capture shows would be shown without having been
   checked or counted (`AGENTS.md` §0.1). */
const summonedContainers: readonly (readonly string[])[] = [
  [], ['GetUnitStorageList'], ['GetWizardDataPart1'], ['GetWizardDataPart1', 'GetUnitStorageList'],
];
const normalContainers: readonly (readonly string[])[] = [
  [], ['GetWizardDataPart1'], ['GetUnitStorageList'],
];

function listIn(data: GameRecord | undefined, containers: readonly (readonly string[])[], key: string): unknown {
  for (const path of containers) {
    let container: GameRecord | undefined = data;
    for (const step of path) container = record(container?.[step]);
    if (container && Array.isArray(container[key])) return container[key];
  }
  return undefined;
}

/**
 * The Summoned tab's stacks exactly as the account carries them, or
 * `undefined` where it carries none. The import validates this value and
 * publishes it at the root, so every later reader meets one shape.
 */
export function summonedShrineList(data: GameRecord | undefined): unknown {
  return listIn(data, summonedContainers, 'unit_storage_list');
}

/** The Normal tab's units exactly as the account carries them, or `undefined`. */
export function normalShrineList(data: GameRecord | undefined): unknown {
  return listIn(data, normalContainers, 'unit_storage_normal_list');
}

/**
 * The Summoned tab's owned stacks. A stack at quantity zero is the game's
 * leftover after its last copy was spent, not a monster (`docs/IMPORT-PARITY-CONTRACT.md` §3),
 * so it is left out here as the import strips it — the count and the table
 * then read the same stacks, and no stack is ever shown as a copy it is not.
 */
export function summonedShrineRecords(data: GameRecord | undefined): GameRecord[] {
  return records(summonedShrineList(data)).filter((stack) => typeof stack.quantity === 'number'
    && Number.isSafeInteger(stack.quantity) && stack.quantity > 0);
}

/** The Normal tab's units, each one monster. */
export function normalShrineRecords(data: GameRecord | undefined): GameRecord[] {
  return records(normalShrineList(data));
}

/**
 * Every monster record in either Sealed Shrine tab, without saying which tab
 * it came from, for a caller asking only what the account holds.
 */
export function shrineMonsterRecords(data: GameRecord | undefined): GameRecord[] {
  return [...summonedShrineRecords(data), ...normalShrineRecords(data)];
}
