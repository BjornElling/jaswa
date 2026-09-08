import type {
  ArtifactConversionStoneMode, ArtifactRecalculateMode, ArtifactSettings, DirectImportMode, HelperSession, ImportReport, ImportRoute, ImportedGame, ItemGrade,
  MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder,
} from './types';
import { readArtifact } from './artifacts';
import { hasMonsterCatalogEntry } from './monster-catalog';
import type { GameRecord } from './game-data';
import { defaultRunePotentialPresets, isCurrentRunePotentialPresets } from './rune-potential-presets';
import { blankGeneralSettings, isGeneralSettings } from './regional-settings';
import { runeSetName } from './rune-sets';

const expectedSections = [
  'unit_list', 'unit_storage_list', 'unit_storage_normal_list', 'runes', 'artifacts', 'relics', 'rune_craft_item_list', 'artifact_crafts', 'inventory_info',
] as const;
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
export const artifactRecalculateModes: ArtifactRecalculateMode[] = ['manual', 'on-change'];
/* The exact key set rejects the retired grade-specific source shape instead of
   silently carrying fields the current settings page no longer offers. */
const artifactSettingKeys = [
  'acceptableWorth', 'onlyFactorInOwnedMonsters', 'onlyLevel40Monsters', 'conversionStoneMode', 'conversionStoneValue',
  'ignoreInsignificantDifferences', 'insignificantDifference', 'includeIntangibleArtifacts', 'recalculate',
] as const;
/* `recalculate` arrived after the shape was already in the wild, and it decides
   only *when* a table re-runs. A file written before it existed is a complete
   answer to every question JASWA was asking at the time, so it is filled in
   with the default rather than costing the user every other artifact setting —
   which is what rejecting the document whole would do. Keys that predate this
   one stay mandatory: absent, they would change a judgement. */
const optionalArtifactSettingKeys = new Set<typeof artifactSettingKeys[number]>(['recalculate']);

/* The band the significance rule uses, in whole percentage points of the score
   (`ARTIFACT-CANONICAL.md` §17.3). One point is the smallest difference the
   integer scores can express, so the range starts there rather than at zero:
   a zero band is the rule switched off, which is what the checkbox says. */
export const artifactInsignificantDifferenceRange = { minimum: 1, maximum: 5 } as const;

export const defaultArtifactSettings: ArtifactSettings = {
  acceptableWorth: 50,
  onlyFactorInOwnedMonsters: true,
  onlyLevel40Monsters: false,
  conversionStoneMode: 'owned',
  conversionStoneValue: 3,
  /* Off by default: suppressing a difference is the user's judgement about what
     is worth acting on, and JASWA should not make it on their behalf. */
  ignoreInsignificantDifferences: false,
  insignificantDifference: 2,
  /* On: an Intangible fits the chosen monster like any other artifact, so
     excluding it would understate what the account can actually equip. */
  includeIntangibleArtifacts: true,
  /* Manual: a calculation over the whole library is work the user asked for,
     and re-running it on every slider nudge would spend it without being
     asked. The stale notice says the table is out of date; the button remains
     the way to pay for a fresh one. */
  recalculate: 'manual',
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
    && artifactSettingKeys.every((key) => key in value || optionalArtifactSettingKeys.has(key))
    && Object.keys(value).every((key) => artifactSettingKeys.includes(key as typeof artifactSettingKeys[number]))
    && (value.recalculate === undefined || artifactRecalculateModes.includes(value.recalculate as ArtifactRecalculateMode))
    && artifactAcceptableWorthChoices.includes(value.acceptableWorth as typeof artifactAcceptableWorthChoices[number])
    && typeof value.onlyFactorInOwnedMonsters === 'boolean'
    && typeof value.onlyLevel40Monsters === 'boolean'
    && artifactConversionStoneModes.includes(value.conversionStoneMode as ArtifactConversionStoneMode)
    && isScale(value.conversionStoneValue, 4)
    && typeof value.ignoreInsignificantDifferences === 'boolean'
    && typeof value.insignificantDifference === 'number'
    && Number.isInteger(value.insignificantDifference)
    && value.insignificantDifference >= artifactInsignificantDifferenceRange.minimum
    && value.insignificantDifference <= artifactInsignificantDifferenceRange.maximum
    && typeof value.includeIntangibleArtifacts === 'boolean';
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

/**
 * Preference corruption must not silently change where a valid imported game
 * came from. The game record itself carries the helper session that produced
 * it, so a discarded preferences document can safely retain that source while
 * every other preference returns to the current defaults. A valid explicit
 * JSON-file choice always wins: this only handles a preference document that
 * was rejected in full.
 */
export function restoredPreferences(value: unknown, game: ImportedGame | null): Preferences {
  /* A document accepted without `recalculate` predates the setting. Filling it
     here means the rest of the app reads a complete `ArtifactSettings` and no
     view has to defend against a missing mode. */
  if (isValidPreferences(value)) {
    return value.artifacts.recalculate === undefined
      ? { ...value, artifacts: { ...value.artifacts, recalculate: defaultArtifactSettings.recalculate } }
      : value;
  }
  const preferences = blankPreferences();
  return game?.helperSession ? { ...preferences, importRoute: 'direct' } : preferences;
}

function recordCollection(value: unknown): GameRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasCollection(value: unknown): boolean {
  return Array.isArray(value);
}

function isPositiveIdentifier(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

/* A collection is a count of owned entities, not a bag of values that happen
   to look like them. Requiring a positive id and one occurrence per collection
   keeps malformed records from becoming a count that no table can honour. */
function isValidIdentifiedCollection(
  value: unknown,
  identifier: string,
  recordCheck: (record: GameRecord) => boolean = () => true,
): value is GameRecord[] {
  if (!Array.isArray(value)) return false;
  const records = value.filter(isRecord);
  if (records.length !== value.length) return false;
  if (!records.every((record) => isPositiveIdentifier(record[identifier]) && recordCheck(record))) return false;
  return new Set(records.map((record) => String(record[identifier]))).size === records.length;
}

function isValidCraftRecord(record: GameRecord): boolean {
  return typeof record.amount === 'number'
    && Number.isSafeInteger(record.amount)
    && record.amount >= 0;
}

function isValidStorageRecord(record: GameRecord): boolean {
  const masterId = record.unit_master_id;
  const quantity = record.quantity;
  const validMasterId = isPositiveIdentifier(masterId);
  const validQuantity = typeof quantity === 'number'
    && Number.isSafeInteger(quantity)
    && quantity > 0;
  const validGrade = record.class === undefined
    || (typeof record.class === 'number' && Number.isSafeInteger(record.class) && record.class >= 1 && record.class <= 5);
  return validMasterId && validQuantity && validGrade;
}

function validateAccountCollections(value: GameRecord): string | undefined {
  if (!isValidIdentifiedCollection(value.unit_list, 'unit_id')) {
    return 'This file contains an invalid monster collection.';
  }
  if (!isValidIdentifiedCollection(value.runes, 'rune_id', (rune) => runeSetName(rune.set_id) !== undefined)) {
    return 'This file contains a rune JASWA cannot read.';
  }
  if (value.unit_storage_list !== undefined && !isValidIdentifiedCollection(value.unit_storage_list, 'unit_master_id', isValidStorageRecord)) {
    return 'This file contains a sealed-shrine monster JASWA cannot read.';
  }
  if (value.unit_storage_normal_list !== undefined && !isValidIdentifiedCollection(value.unit_storage_normal_list, 'unit_id')) {
    return 'This file contains a sealed-shrine monster JASWA cannot read.';
  }

  const units = recordCollection(value.unit_list);
  const normalStorageUnits = recordCollection(value.unit_storage_normal_list);
  /* A full export carries the account wizard id on every owned unit. Without
     this boundary, a battle response can look like a valid monster record and
     add an opponent's LD5 to the account simply because it has a positive
     unit_id and a level. The helper uses the same rule for live additions. */
  if (value.wizard_id !== undefined) {
    if (!isPositiveIdentifier(value.wizard_id)) {
      return 'This file contains an invalid account identity.';
    }
    const accountWizardId = String(value.wizard_id);
    if ([...units, ...normalStorageUnits].some((unit) => String(unit.wizard_id) !== accountWizardId)) {
      return 'This file contains a monster JASWA cannot verify as belonging to this account.';
    }
  }
  for (const unit of units) {
    if (unit.runes !== undefined && !isValidIdentifiedCollection(unit.runes, 'rune_id', (rune) => runeSetName(rune.set_id) !== undefined)) {
      return 'This file contains an equipped rune JASWA cannot read.';
    }
    if (unit.artifacts !== undefined && !isValidIdentifiedCollection(unit.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null)) {
      return 'This file contains an equipped artifact JASWA cannot read.';
    }
    if (unit.relics !== undefined && !isValidIdentifiedCollection(unit.relics, 'rid')) {
      return 'This file contains an equipped relic JASWA cannot read.';
    }
  }

  if (value.artifacts !== undefined && !isValidIdentifiedCollection(value.artifacts, 'rid', (artifact) => readArtifact(artifact) !== null)) {
    return 'This file contains an artifact JASWA cannot read.';
  }
  if (value.relics !== undefined && !isValidIdentifiedCollection(value.relics, 'rid')) {
    return 'This file contains a relic JASWA cannot read.';
  }
  if (value.rune_craft_item_list !== undefined
    && !isValidIdentifiedCollection(value.rune_craft_item_list, 'craft_item_id', isValidCraftRecord)) {
    return 'This file contains an invalid craft-item collection.';
  }
  return undefined;
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
  const prepared: GameRecord = {
    ...data,
    unit_list: units,
    runes: complete('runes'),
    artifacts: complete('artifacts'),
    relics: complete('relics'),
    rune_craft_item_list: recordCollection(data.rune_craft_item_list),
  };
  /* These two account collections are not yet separate workspaces, but live
     import still keeps them current so a later workspace never starts from a
     stale snapshot. Missing stays missing; an explicitly empty collection
     remains the user's empty answer. */
  if (hasCollection(data.artifact_crafts)) {
    prepared.artifact_crafts = recordCollection(data.artifact_crafts);
  }
  if (hasCollection(data.inventory_info)) {
    prepared.inventory_info = recordCollection(data.inventory_info);
  }
  return prepared;
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
  const collectionError = validateAccountCollections(value);
  if (collectionError) return { valid: false, message: collectionError, knownSections, unknownMonsterIds: [] };
  const unknownMonsterIds = [...new Set([
    ...recordCollection(value.unit_list),
    ...recordCollection(value.unit_storage_list),
    ...recordCollection(value.unit_storage_normal_list),
  ]
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
