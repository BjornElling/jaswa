import type { RunePotentialPreset } from './rune-potential-presets';

export type ImportReport = { valid: boolean; message: string; knownSections: string[]; unknownMonsterIds: string[] };
export type HelperSession = { instanceId: string; sessionId: number };
export type ImportedGame = { fileName: string; importedAt: string; data: Record<string, unknown>; report: ImportReport; helperSession?: HelperSession };
export type MonsterPreference = { unitId: string; label: string; runeSets: string; statGoals: string };
export type RunePotentialSortOrder = 'Grade' | 'Sub Property' | 'Sub Property Before Grinding' | 'Power-up Lv.' | 'Obtained' | 'Sub Property Sum' | 'Score';
/** The five item grades from `docs/RUNE-CANONICAL.md`, shared by gems and grindstones. */
export type ItemGrade = 'Normal' | 'Magic' | 'Rare' | 'Hero' | 'Legend';
export type RunePotentialSettings = { powerUpPolicy: number; runeQuality: number; enchantedGems: number; grindstones: number; gemGrade: ItemGrade; grindstoneGrade: ItemGrade; acceptedRunes: number; brokenRunes: number; intangibleRunes: number; keepMoreForLargerSets: boolean; includeLevel12Runes: boolean; includeEquippedRunes: boolean; sortOrder: RunePotentialSortOrder };
/**
 * How the companion program is allowed to feed JASWA once it is connected.
 *
 * `live` keeps the workspace equal to the account at every moment, which means
 * a rune JASWA shows you moving is moved back the instant the game says
 * otherwise. `on-load` takes one snapshot per game session, so a plan survives
 * long enough to be finished. The two cannot both be true, which is why this is
 * one setting with two values rather than two switches.
 */
export type DirectImportMode = 'live' | 'on-load';
/**
 * Which of the two ways in the user has chosen. The routes are exclusive rather
 * than two doors left open: a helper feeding the account in as you play and a
 * file you hand over yourself are two different answers to "where does JASWA's
 * data come from", and letting both look live invites the user to set up one and
 * wonder why the other is not doing anything.
 */
export type ImportRoute = 'direct' | 'file';
/**
 * The presets are part of the user's own preferences rather than of the
 * program: JASWA supplies a starting set, and after that they are the user's
 * to rename, retune and delete, and they travel with the .sw file.
 */
export type Preferences = { updatedAt: string; hardwareAcceleration: boolean; importRoute: ImportRoute; directImportMode: DirectImportMode; monsterPreferences: Record<string, MonsterPreference>; runePotential: RunePotentialSettings; runePotentialPresets: RunePotentialPreset[] };
