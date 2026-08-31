import type {
  ArtifactConversionStoneMode, ArtifactSettings, DirectImportMode, HelperSession, ImportReport, ImportRoute, ImportedGame, ItemGrade,
  MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder,
} from './types';
import { hasMonsterCatalogEntry } from './monster-catalog';
import type { GameRecord } from './game-data';
import { defaultRunePotentialPresets, isCurrentRunePotentialPresets } from './rune-potential-presets';
import { blankGeneralSettings, isGeneralSettings } from './regional-settings';

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

/* Half credit is the honest midpoint of decision 11's question, and it reads as
   a deliberate answer rather than a disabled feature the way 0 % or 100 % would:
   at 0 % an acceptable property may as well be unwanted, and at 100 % the
   preferred/acceptable distinction stops meaning anything. */
export const artifactAcceptableWorthChoices = [0, 25, 50, 75, 100] as const;
export const artifactConversionStoneModes: ArtifactConversionStoneMode[] = ['none', 'owned', 'theoretical'];
/* The exact key set rejects the retired grade-specific source shape instead of
   silently carrying fields the current settings page no longer offers. */
const artifactSettingKeys = [
  'acceptableWorth', 'onlyFactorInOwnedMonsters', 'conversionStoneMode', 'conversionStoneValue',
] as const;

export const defaultArtifactSettings: ArtifactSettings = {
  acceptableWorth: 50,
  onlyFactorInOwnedMonsters: true,
  conversionStoneMode: 'owned',
  conversionStoneValue: 3,
};

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    updatedAt: new Date().toISOString(),
    hardwareAcceleration: true,
    importRoute: defaultImportRoute,
    directImportMode: defaultDirectImportMode,
    general: blankGeneralSettings(),
    monsterPreferences: {},
    runePotential: defaultRunePotentialSettings,
    runePotentialPresets: defaultRunePotentialPresets(),
    artifacts: defaultArtifactSettings,
  };
}

/* The stored value is the percentage, so it is checked against the offered
   choices rather than against a 1–5 range: a file claiming 37 % came from
   somewhere other than this slider and is not a contract JASWA honours. */
function isArtifactSettings(value: unknown): value is ArtifactSettings {
  return isRecord(value)
    && Object.keys(value).length === artifactSettingKeys.length
    && Object.keys(value).every((key) => artifactSettingKeys.includes(key as typeof artifactSettingKeys[number]))
    && artifactAcceptableWorthChoices.includes(value.acceptableWorth as typeof artifactAcceptableWorthChoices[number])
    && typeof value.onlyFactorInOwnedMonsters === 'boolean'
    && artifactConversionStoneModes.includes(value.conversionStoneMode as ArtifactConversionStoneMode)
    && isScale(value.conversionStoneValue, 4);
}

function isScale(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maximum;
}

function isRunePotentialSettings(value: unknown): value is RunePotentialSettings {
  if (!isRecord(value)) return false;
  return isScale(value.powerUpPolicy, 5)
    && isScale(value.runeQuality, 5)
    && isScale(value.enchantedGems, 4)
    && isScale(value.grindstones, 4)
    && itemGrades.includes(value.gemGrade as ItemGrade)
    && itemGrades.includes(value.grindstoneGrade as ItemGrade)
    && isScale(value.acceptedRunes, 5)
    && isScale(value.brokenRunes, 5)
    && isScale(value.intangibleRunes, 5)
    && typeof value.keepMoreForLargerSets === 'boolean'
    && typeof value.includeLevel12Runes === 'boolean'
    && typeof value.includeEquippedRunes === 'boolean'
    && runePotentialSortOrders.includes(value.sortOrder as RunePotentialSortOrder);
}

function isMonsterPreferences(value: unknown): value is Record<string, MonsterPreference> {
  return isRecord(value) && Object.entries(value).every(([unitId, preference]) => isRecord(preference)
    && preference.unitId === unitId
    && typeof preference.label === 'string'
    && typeof preference.runeSets === 'string'
    && typeof preference.statGoals === 'string');
}

/** Accept only a complete preferences document. */
export function isValidPreferences(value: unknown): value is Preferences {
  if (!isRecord(value)) return false;
  return typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt))
    && typeof value.hardwareAcceleration === 'boolean'
    && importRoutes.includes(value.importRoute as ImportRoute)
    && directImportModes.includes(value.directImportMode as DirectImportMode)
    && isGeneralSettings(value.general)
    && isMonsterPreferences(value.monsterPreferences)
    && isRunePotentialSettings(value.runePotential)
    && isCurrentRunePotentialPresets(value.runePotentialPresets)
    && isArtifactSettings(value.artifacts);
}

function recordCollection(value: unknown): GameRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasCollection(value: unknown): boolean {
  return Array.isArray(value);
}

/* Artifacts and relics both carry their own id as `rid`, not `artifact_id` or
   `relic_id`: no record in the export has either, so keying on them silently
   de-duplicated nothing and would let an equipped item appear twice once the
   account list and a unit's list overlapped. Runes really do use `rune_id`.
   `ARTIFACT-CANONICAL.md` §15.1 settles the artifact field, and the relic
   records in the same export carry the same one. */
function itemId(section: 'runes' | 'artifacts' | 'relics', item: GameRecord): string | undefined {
  const key = section === 'runes' ? 'rune_id' : 'rid';
  const value = item[key];
  return typeof value === 'number' || typeof value === 'string' ? `${key}:${value}` : undefined;
}

/* Equipped items live below their owner in the export. The prepared game keeps
   the owner data and also exposes a complete account-wide collection. */
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

function removeExcludedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeExcludedKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !excludedKeys.has(key))
    .map(([key, entry]) => [key, removeExcludedKeys(entry)]));
}

function isImportReport(value: unknown): value is ImportReport {
  return isRecord(value)
    && typeof value.valid === 'boolean'
    && typeof value.message === 'string'
    && Array.isArray(value.knownSections) && value.knownSections.every((entry) => typeof entry === 'string')
    && Array.isArray(value.unknownMonsterIds) && value.unknownMonsterIds.every((entry) => typeof entry === 'string');
}

/** Accept only a complete game record. */
export function isValidImportedGame(value: unknown): value is ImportedGame {
  if (!isRecord(value)) return false;
  const helperSession = value.helperSession === undefined || (isRecord(value.helperSession)
    && typeof value.helperSession.instanceId === 'string' && value.helperSession.instanceId.length > 0
    && typeof value.helperSession.sessionId === 'number' && Number.isSafeInteger(value.helperSession.sessionId) && value.helperSession.sessionId > 0);
  return typeof value.fileName === 'string' && value.fileName.length > 0
    && typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt))
    && isRecord(value.data) && validateGameFile(value.data).valid
    && isImportReport(value.report)
    && helperSession;
}

export function validateGameFile(value: unknown): ImportReport {
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

export function createImportedGame(fileName: string, data: Record<string, unknown>, report: ImportReport, helperSession?: HelperSession): ImportedGame {
  return {
    fileName,
    importedAt: new Date().toISOString(),
    data: completeEquipmentCollections(removeExcludedKeys(data) as GameRecord),
    report,
    ...(helperSession ? { helperSession } : {}),
  };
}

export async function fileToText(file: File): Promise<string> {
  return file.text();
}

export async function importPreferencesFile(file: File): Promise<Preferences> {
  const value = JSON.parse(await fileToText(file)) as unknown;
  if (!isValidPreferences(value)) throw new Error('Invalid JASWA preferences file');
  return { ...value, updatedAt: new Date().toISOString() };
}
