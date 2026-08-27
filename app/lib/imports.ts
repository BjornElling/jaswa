import type { CompatibilityReport, ImportedGame, ItemGrade, Preferences, RunePotentialSettings, RunePotentialSortOrder } from './types';
import { hasMonsterCatalogEntry } from './monster-catalog';
import { defaultRunePotentialPresets, normalizeRunePotentialPresets } from './rune-potential-presets';
const expectedSections = ['unit_list', 'runes', 'artifacts', 'relics', 'rune_craft_item_list']; const excludedKeys = new Set(['session_key', 'session_key_node']);
const runePotentialSortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
export const itemGrades: ItemGrade[] = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'];
export const defaultRunePotentialSettings: RunePotentialSettings = { powerUpPolicy: 4, runeQuality: 4, enchantedGems: 3, grindstones: 3, gemGrade: 'Hero', grindstoneGrade: 'Hero', includeLevel12Runes: false, includeEquippedRunes: false, sortOrder: 'Power-up Lv.' };
function normalizeRunePotentialSettings(value: unknown): RunePotentialSettings {
  if (!value || typeof value !== 'object') return defaultRunePotentialSettings;
  const settings = value as Partial<RunePotentialSettings>;
  const normalizeScale = (input: unknown, maximum: number, fallback: number) => typeof input === 'number' && Number.isFinite(input) ? Math.min(maximum, Math.max(1, Math.round(input))) : fallback;
  const normalizeGrade = (input: unknown, fallback: ItemGrade) => itemGrades.includes(input as ItemGrade) ? input as ItemGrade : fallback;
  const sortOrder = runePotentialSortOrders.includes(settings.sortOrder as RunePotentialSortOrder) ? settings.sortOrder as RunePotentialSortOrder : defaultRunePotentialSettings.sortOrder;
  const fallback = defaultRunePotentialSettings;
  return { powerUpPolicy: normalizeScale(settings.powerUpPolicy, 5, fallback.powerUpPolicy), runeQuality: normalizeScale(settings.runeQuality, 5, fallback.runeQuality), enchantedGems: normalizeScale(settings.enchantedGems, 4, fallback.enchantedGems), grindstones: normalizeScale(settings.grindstones, 4, fallback.grindstones), gemGrade: normalizeGrade(settings.gemGrade, fallback.gemGrade), grindstoneGrade: normalizeGrade(settings.grindstoneGrade, fallback.grindstoneGrade), includeLevel12Runes: settings.includeLevel12Runes === true, includeEquippedRunes: settings.includeEquippedRunes === true, sortOrder };
}
export function blankPreferences(): Preferences { return { format: 'swaggr-preferences', version: 1, updatedAt: new Date().toISOString(), monsterPreferences: {}, runePotential: defaultRunePotentialSettings, runePotentialPresets: defaultRunePotentialPresets() }; }
type GameRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GameRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function collection(value: unknown): unknown[] { return Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []; }
function recordCollection(value: unknown): GameRecord[] { return collection(value).filter(isRecord); }
function hasCollection(value: unknown): boolean { return Array.isArray(value) || isRecord(value); }

function itemId(section: 'runes' | 'artifacts' | 'relics', item: GameRecord): string | undefined {
  const key = section === 'runes' ? 'rune_id' : section === 'artifacts' ? 'artifact_id' : 'relic_id';
  const value = item[key] ?? item.item_id;
  return typeof value === 'number' || typeof value === 'string' ? `${key}:${value}` : undefined;
}

/**
 * Game exports keep unequipped items in top-level lists, but put equipped
 * items inside their owner in unit_list. Keep the original owner data and
 * also expose a complete account-wide list for each item type.
 */
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
  return { ...data, unit_list: units, runes: complete('runes'), artifacts: complete('artifacts'), relics: complete('relics'), rune_craft_item_list: recordCollection(data.rune_craft_item_list) };
}

export function normalizeImportedGame(game: ImportedGame): ImportedGame { return { ...game, data: completeEquipmentCollections(removeExcludedKeys(game.data) as GameRecord) }; }
export function validateGameFile(value: unknown): CompatibilityReport { if (!isRecord(value)) return { valid: false, message: 'This is not a valid Summoners War JSON file.', knownSections: [], unknownMonsterIds: [] }; const knownSections = expectedSections.filter((section) => hasCollection(value[section])); if (!hasCollection(value.unit_list) || !hasCollection(value.runes)) return { valid: false, message: 'This file does not contain the monster and rune lists needed by Swaggr.', knownSections, unknownMonsterIds: [] }; const unknownMonsterIds = [...new Set(recordCollection(value.unit_list).map((monster) => String(monster.unit_master_id)).filter((id) => id !== 'undefined' && !hasMonsterCatalogEntry(id)))]; return { valid: true, message: 'Ready to import.', knownSections, unknownMonsterIds }; }
function removeExcludedKeys(value: unknown): unknown { if (Array.isArray(value)) return value.map(removeExcludedKeys); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !excludedKeys.has(key)).map(([key, entry]) => [key, removeExcludedKeys(entry)])); }
export function createImportedGame(fileName: string, data: Record<string, unknown>, report: CompatibilityReport): ImportedGame { return normalizeImportedGame({ fileName, importedAt: new Date().toISOString(), data, report }); }
export async function fileToText(file: File) { return file.text(); }
export async function importPreferencesFile(file: File): Promise<Preferences> { const value = JSON.parse(await fileToText(file)) as Partial<Preferences>; if (value.format !== 'swaggr-preferences' || value.version !== 1 || !value.monsterPreferences || typeof value.monsterPreferences !== 'object') throw new Error('Invalid Swaggr preferences file'); return { format: 'swaggr-preferences', version: 1, updatedAt: new Date().toISOString(), monsterPreferences: value.monsterPreferences, runePotential: normalizeRunePotentialSettings(value.runePotential), runePotentialPresets: normalizeRunePotentialPresets(value.runePotentialPresets) }; }
