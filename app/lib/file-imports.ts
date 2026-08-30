import type {
  CompatibilityReport, DirectImportMode, HelperSession, ImportRoute, ImportedGame, ItemGrade,
  MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder,
} from './types';
import { hasMonsterCatalogEntry } from './monster-catalog';
import type { GameRecord } from './game-data';
import { defaultRunePotentialPresets, normalizeRunePotentialPresets } from './rune-potential-presets';

const expectedSections = ['unit_list', 'runes', 'artifacts', 'relics', 'rune_craft_item_list'] as const;
const excludedKeys = new Set(['session_key', 'session_key_node']);
const runePotentialSortOrders: RunePotentialSortOrder[] = [
  'Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.',
  'Obtained', 'Sub Property Sum', 'Score',
];

export const itemGrades: ItemGrade[] = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'];

export const defaultRunePotentialSettings: RunePotentialSettings = {
  powerUpPolicy: 4,
  runeQuality: 4,
  enchantedGems: 3,
  grindstones: 3,
  gemGrade: 'Hero',
  grindstoneGrade: 'Hero',
  acceptedRunes: 3,
  brokenRunes: 3,
  intangibleRunes: 1,
  keepMoreForLargerSets: false,
  includeLevel12Runes: false,
  includeEquippedRunes: false,
  sortOrder: 'Power-up Lv.',
};

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRunePotentialSettings(value: unknown): RunePotentialSettings {
  if (!isRecord(value)) return defaultRunePotentialSettings;
  const normalizeScale = (input: unknown, maximum: number, fallback: number) => typeof input === 'number' && Number.isFinite(input)
    ? Math.min(maximum, Math.max(1, Math.round(input)))
    : fallback;
  const normalizeGrade = (input: unknown, fallback: ItemGrade) => itemGrades.includes(input as ItemGrade)
    ? input as ItemGrade
    : fallback;
  const sortOrder = runePotentialSortOrders.includes(value.sortOrder as RunePotentialSortOrder)
    ? value.sortOrder as RunePotentialSortOrder
    : defaultRunePotentialSettings.sortOrder;
  return {
    powerUpPolicy: normalizeScale(value.powerUpPolicy, 5, defaultRunePotentialSettings.powerUpPolicy),
    runeQuality: normalizeScale(value.runeQuality, 5, defaultRunePotentialSettings.runeQuality),
    enchantedGems: normalizeScale(value.enchantedGems, 4, defaultRunePotentialSettings.enchantedGems),
    grindstones: normalizeScale(value.grindstones, 4, defaultRunePotentialSettings.grindstones),
    gemGrade: normalizeGrade(value.gemGrade, defaultRunePotentialSettings.gemGrade),
    grindstoneGrade: normalizeGrade(value.grindstoneGrade, defaultRunePotentialSettings.grindstoneGrade),
    acceptedRunes: normalizeScale(value.acceptedRunes, 5, defaultRunePotentialSettings.acceptedRunes),
    brokenRunes: normalizeScale(value.brokenRunes, 5, defaultRunePotentialSettings.brokenRunes),
    intangibleRunes: normalizeScale(value.intangibleRunes, 5, defaultRunePotentialSettings.intangibleRunes),
    keepMoreForLargerSets: value.keepMoreForLargerSets === true,
    includeLevel12Runes: value.includeLevel12Runes === true,
    includeEquippedRunes: value.includeEquippedRunes === true,
    sortOrder,
  };
}

/* Live sync can overwrite a plan, so the safer snapshot mode is the default. */
export const defaultDirectImportMode: DirectImportMode = 'on-load';
const directImportModes: DirectImportMode[] = ['live', 'on-load'];

/* The file route works without any companion program, so it is the neutral
   starting point until the user explicitly chooses direct import. */
export const defaultImportRoute: ImportRoute = 'file';
const importRoutes: ImportRoute[] = ['direct', 'file'];

export function blankPreferences(): Preferences {
  return {
    format: 'jaswa-preferences',
    version: 1,
    updatedAt: new Date().toISOString(),
    hardwareAcceleration: true,
    importRoute: defaultImportRoute,
    directImportMode: defaultDirectImportMode,
    monsterPreferences: {},
    runePotential: defaultRunePotentialSettings,
    runePotentialPresets: defaultRunePotentialPresets(),
  };
}

function normalizeMonsterPreference(unitId: string, value: unknown): MonsterPreference {
  const source = isRecord(value) ? value : {};
  const text = (input: unknown) => typeof input === 'string' ? input : '';
  return { unitId, label: text(source.label), runeSets: text(source.runeSets), statGoals: text(source.statGoals) };
}

function normalizeMonsterPreferences(value: unknown): Record<string, MonsterPreference> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([unitId, preference]) => [unitId, normalizeMonsterPreference(unitId, preference)]));
}

/** Both IndexedDB records and `.sw` files use this one normalization path. */
export function normalizePreferences(value: unknown): Preferences {
  const source = isRecord(value) ? value : {};
  return {
    format: 'jaswa-preferences',
    version: 1,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    /* Missing means "never chosen", and the safe default is on. */
    hardwareAcceleration: source.hardwareAcceleration !== false,
    importRoute: importRoutes.includes(source.importRoute as ImportRoute)
      ? source.importRoute as ImportRoute
      : defaultImportRoute,
    directImportMode: directImportModes.includes(source.directImportMode as DirectImportMode)
      ? source.directImportMode as DirectImportMode
      : defaultDirectImportMode,
    monsterPreferences: normalizeMonsterPreferences(source.monsterPreferences),
    runePotential: normalizeRunePotentialSettings(source.runePotential),
    runePotentialPresets: normalizeRunePotentialPresets(source.runePotentialPresets),
  };
}

function collection(value: unknown): unknown[] {
  return Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
}

function recordCollection(value: unknown): GameRecord[] {
  return collection(value).filter(isRecord);
}

function hasCollection(value: unknown): boolean {
  return Array.isArray(value) || isRecord(value);
}

function itemId(section: 'runes' | 'artifacts' | 'relics', item: GameRecord): string | undefined {
  const key = section === 'runes' ? 'rune_id' : section === 'artifacts' ? 'artifact_id' : 'relic_id';
  const value = item[key] ?? item.item_id;
  return typeof value === 'number' || typeof value === 'string' ? `${key}:${value}` : undefined;
}

/* Equipped items live below their owner in the export. The normalized game
   keeps the owner data and also exposes a complete account-wide collection. */
function completeEquipmentCollections(data: GameRecord): GameRecord {
  const units = recordCollection(data.unit_list);
  const complete = (section: 'runes' | 'artifacts' | 'relics') => {
    const seen = new Set<string>();
    return [...recordCollection(data[section]), ...units.flatMap((unit) => recordCollection(unit[section]))]
      .filter((item) => {
        const id = itemId(section, item);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  };
  return {
    ...data,
    unit_list: units,
    runes: complete('runes'),
    artifacts: complete('artifacts'),
    relics: complete('relics'),
    rune_craft_item_list: recordCollection(data.rune_craft_item_list),
  };
}

function normalizeCompatibilityReport(value: unknown): CompatibilityReport {
  const source = isRecord(value) ? value : {};
  const strings = (input: unknown) => Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    valid: source.valid === true,
    message: typeof source.message === 'string' ? source.message : 'Ready to import.',
    knownSections: strings(source.knownSections),
    unknownMonsterIds: strings(source.unknownMonsterIds),
  };
}

function removeExcludedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeExcludedKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !excludedKeys.has(key))
    .map(([key, entry]) => [key, removeExcludedKeys(entry)]));
}

export function normalizeImportedGame(value: unknown): ImportedGame | null {
  if (!isRecord(value)) return null;
  const data = isRecord(value.data) ? value.data : {};
  const helperSession = isRecord(value.helperSession) && typeof value.helperSession.instanceId === 'string' && value.helperSession.instanceId.length > 0
    && typeof value.helperSession.sessionId === 'number' && Number.isSafeInteger(value.helperSession.sessionId) && value.helperSession.sessionId > 0
    ? { instanceId: value.helperSession.instanceId, sessionId: value.helperSession.sessionId }
    : undefined;
  return {
    fileName: typeof value.fileName === 'string' && value.fileName ? value.fileName : 'Imported game data',
    importedAt: typeof value.importedAt === 'string' ? value.importedAt : new Date().toISOString(),
    data: completeEquipmentCollections(removeExcludedKeys(data) as GameRecord),
    report: normalizeCompatibilityReport(value.report),
    ...(helperSession ? { helperSession } : {}),
  };
}

export function validateGameFile(value: unknown): CompatibilityReport {
  if (!isRecord(value)) return { valid: false, message: 'This is not a valid Summoners War JSON file.', knownSections: [], unknownMonsterIds: [] };
  const knownSections = expectedSections.filter((section) => hasCollection(value[section]));
  if (!hasCollection(value.unit_list) || !hasCollection(value.runes)) {
    return { valid: false, message: 'This file does not contain the monster and rune lists needed by JASWA.', knownSections, unknownMonsterIds: [] };
  }
  const unknownMonsterIds = [...new Set(recordCollection(value.unit_list)
    .map((monster) => String(monster.unit_master_id))
    .filter((id) => id !== 'undefined' && !hasMonsterCatalogEntry(id)))];
  return { valid: true, message: 'Ready to import.', knownSections, unknownMonsterIds };
}

export function createImportedGame(fileName: string, data: Record<string, unknown>, report: CompatibilityReport, helperSession?: HelperSession): ImportedGame {
  return {
    fileName,
    importedAt: new Date().toISOString(),
    data: completeEquipmentCollections(removeExcludedKeys(data) as GameRecord),
    report: normalizeCompatibilityReport(report),
    ...(helperSession ? { helperSession } : {}),
  };
}

export async function fileToText(file: File): Promise<string> {
  return file.text();
}

export async function importPreferencesFile(file: File): Promise<Preferences> {
  const value = JSON.parse(await fileToText(file)) as unknown;
  if (!isRecord(value) || value.format !== 'jaswa-preferences' || value.version !== 1 || !isRecord(value.monsterPreferences)) {
    throw new Error('Invalid JASWA preferences file');
  }
  return { ...normalizePreferences(value), updatedAt: new Date().toISOString() };
}
