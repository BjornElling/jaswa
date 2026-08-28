import type { RunePotentialPreset } from './rune-potential-presets';

export type CompatibilityReport ={ valid: boolean; message: string; knownSections: string[]; unknownMonsterIds: string[] };
export type ImportedGame = { fileName: string; importedAt: string; data: Record<string, unknown>; report: CompatibilityReport };
export type MonsterPreference = { unitId: string; label: string; runeSets: string; statGoals: string };
export type RunePotentialSortOrder = 'Grade' | 'Sub Property' | 'Sub Property Before Grinding' | 'Power-up Lv.' | 'Obtained' | 'Sub Property Sum' | 'Score';
/** The five item grades from `docs/RUNE-CANONICAL.md`, shared by gems and grindstones. */
export type ItemGrade = 'Normal' | 'Magic' | 'Rare' | 'Hero' | 'Legend';
export type RunePotentialSettings = { powerUpPolicy: number; runeQuality: number; enchantedGems: number; grindstones: number; gemGrade: ItemGrade; grindstoneGrade: ItemGrade; acceptedRunes: number; brokenRunes: number; intangibleRunes: number; keepMoreForLargerSets: boolean; includeLevel12Runes: boolean; includeEquippedRunes: boolean; sortOrder: RunePotentialSortOrder };
/**
 * The presets are part of the user's own preferences rather than of the
 * program: JASWA supplies a starting set, and after that they are the user's
 * to rename, retune and delete, and they travel with the .sw file.
 */
export type Preferences = { format: 'jaswa-preferences'; version: 1; updatedAt: string; monsterPreferences: Record<string, MonsterPreference>; runePotential: RunePotentialSettings; runePotentialPresets: RunePotentialPreset[] };
