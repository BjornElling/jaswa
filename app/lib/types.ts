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
 * Which way round the decimal separator and the thousands separator go.
 * `european` writes 1.234.567,89 and `american` writes 1,234,567.89; `system`
 * takes whichever this computer is set to and is the default, because the user
 * has already answered this question once in their operating system.
 */
export type NumberFormatChoice = 'system' | 'european' | 'american';
/**
 * The clock JASWA writes times on. Named for the Unicode hour cycles rather
 * than for "12" and "24" so the values say which convention they mean:
 * `h23` is 00:00–23:00 and `h12` is 12:00 AM–11:00 PM.
 */
export type HourCycleChoice = 'system' | 'h23' | 'h12';
/**
 * Which of the day and the month is written first. Both orders spell the month
 * out — `30 Aug 2026` against `Aug 30, 2026` — because the all-numeric forms
 * are the ones that cannot be read without knowing which convention wrote
 * them, and a date nobody can read is worse than a long one.
 */
export type DateOrderChoice = 'system' | 'day-first' | 'month-first';
/** Whether the zone comes from this computer or from `manualTimeZone`. */
export type TimeZoneChoice = 'system' | 'manual';
/**
 * How JASWA writes numbers, times and dates.
 *
 * `manualTimeZone` is held even while the choice is `system`, so a user who
 * looks at the manual option and changes their mind does not lose the zone
 * they picked, and the select has something to show the moment it is enabled.
 */
export type GeneralSettings = { numberFormat: NumberFormatChoice; dateOrder: DateOrderChoice; hourCycle: HourCycleChoice; timeZone: TimeZoneChoice; manualTimeZone: string };
/**
 * The presets are part of the user's own preferences rather than of the
 * program: JASWA supplies a starting set, and after that they are the user's
 * to rename, retune and delete, and they travel with the .sw file.
 */
export type Preferences = { updatedAt: string; hardwareAcceleration: boolean; importRoute: ImportRoute; directImportMode: DirectImportMode; general: GeneralSettings; monsterPreferences: Record<string, MonsterPreference>; runePotential: RunePotentialSettings; runePotentialPresets: RunePotentialPreset[] };
