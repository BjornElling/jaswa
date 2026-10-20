import type { MonsterPreferences } from './monster-preferences';
import type { MonsterPriority, PresetPriority } from './monster-priority';
import type { OwnPreset } from './presets';
import type { CraftRollAssumption } from './rune-craft-items';
import type { RuneHolds } from './rune-holds';
import type { RuneLocks } from './rune-locks';
import type { RuneOptimizationSettings } from './rune-optimization-settings';
import type { ReappTargets } from './rune-reapp-targets';
import type { RuneRole } from './rune-roles';
import type { SpeedTuningPreferences } from './speed-tuning-preferences';

export type ImportReport = { valid: boolean; message: string; knownSections: string[]; unknownMonsterIds: string[] };
export type HelperSession = { instanceId: string; sessionId: number };
export type ImportedGame = {
  fileName: string; importedAt: string; data: Record<string, unknown>; report: ImportReport; helperSession?: HelperSession;
  /**
   * Where each rune JASWA has moved since this import sat when it was loaded,
   * by preset id: the monster's `unit_id`, or `null` where the preset had it on
   * none. Written by an engrave, the first time a rune moves in that preset,
   * and never again, so a rune moved twice still names where the game had it.
   * Absent on every fresh import, file or helper alike — the account is then
   * where the game says, and nothing has moved.
   */
  loadedPlacements?: Record<string, Record<string, string | null>>;
  /** The runes locked to and excluded from monsters since this import (`rune-locks.ts`); absent on every fresh import. */
  runeLocks?: RuneLocks;
};
/** The five item grades from `docs/RUNE-CANONICAL.md`, shared by gems and grindstones. */
export type ItemGrade = 'Normal' | 'Magic' | 'Rare' | 'Hero' | 'Legend';
export type ArtifactConversionStoneMode = 'none' | 'owned' | 'theoretical';
/** `null` for a craft roll is the slider's first stop: no item credited at all. */
export type RunePotentialSettings = { powerUpPolicy: number; runeQuality: number; gemRoll: CraftRollAssumption | null; grindstoneRoll: CraftRollAssumption | null; gemGrade: ItemGrade; grindstoneGrade: ItemGrade; acceptedRunes: number; brokenRunes: number; intangibleRunes: number; keepMoreForLargerSets: boolean; neverSellPreGrindSpeed: boolean; preGrindSpeedMinimum: number | null; neverSellPotentialValue: boolean; potentialValueMinimum: number | null; neverSellEngravedPlacements: boolean; neverSellReappTargets: boolean; reappTargets: ReappTargets; refineTargets: ReappTargets };
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
 * Which convention writes dates. The values match `NumberFormatChoice`
 * because they mean the same thing: `system` reads this computer's own
 * locale, and the other two pin a European or American one whole.
 */
export type DateOrderChoice = 'system' | 'european' | 'american';
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
 * What an *acceptable* artifact property is worth against a *preferred* one,
 * as a percentage — `ARTIFACT-CANONICAL.md` §19.6.
 *
 * It is stored as the percentage itself rather than as a 1–5 step, because the
 * judgement multiplies by it: a step index would have to be translated into a
 * factor somewhere, and that translation is the kind of second source of truth
 * this project keeps out. One factor for the whole account, not one per monster
 * — the user is stating a general tolerance, not tuning each row.
 */
/**
 * What a calculated table does when its inputs move underneath it
 * (`ACCOUNT-TABLES.md` §7). `manual` keeps the result the user asked
 * for and says it is out of date; `on-change` re-runs the calculation so the
 * table on screen always answers the current settings and import.
 */
export type ArtifactRecalculateMode = 'manual' | 'on-change';
export type ArtifactSettings = {
  acceptableWorth: number;
  onlyFactorInOwnedMonsters: boolean;
  /** Limit every artifact recommendation destination to an owned Lv. 40 monster. */
  onlyLevel40Monsters: boolean;
  conversionStoneMode: ArtifactConversionStoneMode;
  /** The roll a conversion is assumed to land on (`artifactConversionRollFraction`). */
  conversionRoll: CraftRollAssumption;
  /**
   * Whether a gain must clear `insignificantDifference` before it counts as an
   * improvement worth recommending (`ARTIFACT-CANONICAL.md` §17.3).
   */
  ignoreInsignificantDifferences: boolean;
  /**
   * The band, in whole percentage points of the score, inside which two results
   * count as the same. Held even while the switch above is off, so a user who
   * turns the rule off and on again finds the value they chose rather than a
   * reset one — the same reason `manualTimeZone` is kept.
   */
  insignificantDifference: number;
  /**
   * Whether Intangible artifacts take part in every judgement
   * (`ARTIFACT-CANONICAL.md` §17.7). Asked once here rather than per view, so
   * the three recommendation pages cannot disagree about the same account.
   */
  includeIntangibleArtifacts: boolean;
  /**
   * Whether a stale table re-runs on its own or waits to be asked
   * (`ACCOUNT-TABLES.md` §7). It steers *when* a calculation happens
   * and never what it produces, so the recommendation views deliberately keep
   * it out of the key that decides whether a held result is still current —
   * changing this answer must not itself invalidate the table it governs.
   */
  recalculate: ArtifactRecalculateMode;
};
/**
 * The roles are part of the user's own preferences rather than of the
 * program: JASWA supplies a starting set, and after that they are the user's
 * to rename, retune and delete, and they travel with the .sw file.
 *
 * `runeRoles` was stored as `runePotentialPresets` when roles were called
 * presets; `readPreferences` still reads that key so the user's roles survive.
 */
export type Preferences = { updatedAt: string; hardwareAcceleration: boolean; importRoute: ImportRoute; directImportMode: DirectImportMode; general: GeneralSettings; monsterPreferences: MonsterPreferences; runeHolds: RuneHolds; runePotential: RunePotentialSettings; runeRoles: RuneRole[]; artifacts: ArtifactSettings; speedTuning: SpeedTuningPreferences; monsterPriority: MonsterPriority; presets: OwnPreset[]; presetPriority: PresetPriority; runeOptimization: RuneOptimizationSettings };
