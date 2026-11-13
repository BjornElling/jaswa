import type { ArtifactConversionStoneMode, ArtifactRecalculateMode, ArtifactSettings, DirectImportMode, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from '../lib/types';
import { readMonsterPreferences } from '../lib/monster-preferences';
import { readRuneHolds } from '../lib/rune-holds';
import { blankCraftIgnores, readCraftIgnores } from '../lib/craft-ignores';
import { blankCraftViewChoices, readCraftViewChoices } from '../lib/craft-view-choices';
import { defaultRerollRules, readStoredRerollRules } from '../lib/rune-reapp-targets';
import { readMonsterPriority, readPresetPriority } from '../lib/monster-priority';
import { readOwnPresets, runeSlots } from '../lib/presets';
import { readRelicSynergyChoices } from '../lib/relic-synergy';
import { craftRollAssumptions } from '../lib/rune-craft-items';
import type { GameRecord } from '../lib/game-data';
import { defaultRuneRoles, readRuneRoles } from '../lib/rune-roles';
import { blankGeneralSettings, readGeneralSettings } from '../lib/regional-settings';
import { blankSpeedTuningPreferences, readSpeedTuningPreferences } from '../lib/speed-tuning-preferences';
import { defaultRuneOptimizationSettings, runeOptimizationSettingChecks } from '../lib/rune-optimization-settings';
import { isBoolean, isOneOf, isWholeNumberIn, readSettings } from '../lib/preference-reading';
import type { FieldChecks } from '../lib/preference-reading';

/* Every scale is 1-based: the value is the slider's stop, counted from the left.
   The starting point is the middle of every ladder, plus a mild taste for
   Intangible runes (×1½). */
export const defaultRunePotentialSettings: RunePotentialSettings = {
  powerUpPolicy: 3,
  runeQuality: 3,
  acceptedRunes: 3,
  brokenRunes: 3,
  intangibleRunes: 2,
  neverSellPreGrindSpeed: true,
  preGrindSpeedMinimum: 20,
  neverSellPotentialValue: true,
  potentialValueMinimum: 90,
  neverSellEngravedPlacements: true,
  neverSellReappTargets: true,
  rerollRules: defaultRerollRules(),
};

/* Half credit is the honest midpoint of §19.6's question, and it reads as
   a deliberate answer rather than a disabled feature the way 0 % or 100 % would:
   at 0 % an acceptable property may as well be unwanted, and at 100 % the
   preferred/acceptable distinction stops meaning anything. */
export const artifactAcceptableWorthChoices = [0, 25, 50, 75, 100] as const;
export const artifactConversionStoneModes: ArtifactConversionStoneMode[] = ['none', 'owned', 'theoretical'];
export const artifactRecalculateModes: ArtifactRecalculateMode[] = ['manual', 'on-change'];
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
  /* Three quarters (`artifactConversionRollFraction`). */
  conversionRoll: 'three-quarters',
  /* Off by default: suppressing a difference is the user's judgement about what
     is worth acting on, and JASWA should not make it on their behalf. */
  ignoreInsignificantDifferences: false,
  insignificantDifference: 2,
  /* On: an Intangible fits the chosen monster like any other artifact, so
     excluding it would understate what the account can actually engrave. */
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

/* Live sync is what a user connecting the helper came for: the workspace shows
   the game as it is. Reading only at game start is the deliberate choice of a
   user who wants to plan against a snapshot. */
export const defaultDirectImportMode: DirectImportMode = 'live';
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
    runeHolds: {},
    craftIgnores: blankCraftIgnores(),
    craftViews: blankCraftViewChoices(),
    runePotential: defaultRunePotentialSettings,
    runeRoles: defaultRuneRoles(),
    artifacts: defaultArtifactSettings,
    speedTuning: blankSpeedTuningPreferences(),
    monsterPriority: [],
    presets: [],
    presetPriority: {},
    runeOptimization: defaultRuneOptimizationSettings,
    relicSynergy: {},
  };
}

/* The stored value is the percentage, so it is checked against the offered
   choices rather than against a 1–5 range: a file claiming 37 % came from
   somewhere other than this slider and is not a contract JASWA honours. */
const artifactSettingChecks: FieldChecks<ArtifactSettings> = {
  acceptableWorth: isOneOf(artifactAcceptableWorthChoices),
  onlyFactorInOwnedMonsters: isBoolean,
  onlyLevel40Monsters: isBoolean,
  conversionStoneMode: isOneOf(artifactConversionStoneModes),
  conversionRoll: isOneOf(craftRollAssumptions),
  ignoreInsignificantDifferences: isBoolean,
  insignificantDifference: isWholeNumberIn(artifactInsignificantDifferenceRange.minimum, artifactInsignificantDifferenceRange.maximum),
  includeIntangibleArtifacts: isBoolean,
  recalculate: isOneOf(artifactRecalculateModes),
};

/* Rules have a field-by-field reader of their own. */
type RerollTargetKeys = 'rerollRules';
const runePotentialSettingChecks: FieldChecks<Omit<RunePotentialSettings, RerollTargetKeys>> = {
  powerUpPolicy: isWholeNumberIn(1, 5),
  runeQuality: isWholeNumberIn(1, 5),
  acceptedRunes: isWholeNumberIn(1, 5),
  brokenRunes: isWholeNumberIn(1, 5),
  intangibleRunes: isWholeNumberIn(1, 5),
  neverSellPreGrindSpeed: isBoolean,
  preGrindSpeedMinimum: (value) => value === null || isWholeNumberIn(0, 99)(value),
  neverSellPotentialValue: isBoolean,
  potentialValueMinimum: (value) => value === null || isWholeNumberIn(0, 999)(value),
  neverSellEngravedPlacements: isBoolean,
  neverSellReappTargets: isBoolean,
};

function readRunePotentialSettings(value: unknown, fallback: RunePotentialSettings): RunePotentialSettings {
  return {
    ...readSettings<Omit<RunePotentialSettings, RerollTargetKeys>>(value, fallback, runePotentialSettingChecks),
    rerollRules: readStoredRerollRules(value),
  };
}

const preferenceSections = [
  'updatedAt', 'hardwareAcceleration', 'importRoute', 'directImportMode', 'general',
  'monsterPreferences', 'runeHolds', 'craftIgnores', 'craftViews', 'runePotential', 'runeRoles', 'artifacts', 'speedTuning',
  'monsterPriority', 'presets', 'presetPriority', 'runeOptimization', 'relicSynergy',
] as const satisfies readonly (keyof Preferences)[];

/* The roles were stored as `runePotentialPresets` while they were called
   presets. A stored copy or `.sw` file written then holds every role the user
   named and tuned under that key, so it is read as the roles whenever no
   `runeRoles` key exists (AGENTS.md §0): renaming the field must not reset
   them. Every write uses `runeRoles`. */
const formerRuneRolesKey = 'runePotentialPresets';

function storedRuneRoles(stored: Record<string, unknown>): unknown {
  return 'runeRoles' in stored ? stored.runeRoles : stored[formerRuneRolesKey];
}

/**
 * The stored preferences, one choice at a time (`preference-reading.ts`).
 *
 * Never all or nothing: a section, setting or record the current contract
 * cannot honour starts from its default and every other choice is kept. The
 * import route is the one default that depends on something else — a game the
 * helper produced says where it came from, so a route that cannot be read
 * follows that game rather than the neutral file route.
 */
export function readPreferences(value: unknown, game: ImportedGame | null): Preferences {
  const stored = isRecord(value) ? value : {};
  const blank = blankPreferences();
  return {
    updatedAt: typeof stored.updatedAt === 'string' && Number.isFinite(Date.parse(stored.updatedAt)) ? stored.updatedAt : blank.updatedAt,
    hardwareAcceleration: isBoolean(stored.hardwareAcceleration) ? stored.hardwareAcceleration : blank.hardwareAcceleration,
    importRoute: isOneOf(importRoutes)(stored.importRoute) ? stored.importRoute : game?.helperSession ? 'direct' : blank.importRoute,
    directImportMode: isOneOf(directImportModes)(stored.directImportMode) ? stored.directImportMode : blank.directImportMode,
    general: readGeneralSettings(stored.general),
    monsterPreferences: readMonsterPreferences(stored.monsterPreferences),
    runeHolds: readRuneHolds(stored.runeHolds),
    craftIgnores: readCraftIgnores(stored.craftIgnores),
    craftViews: readCraftViewChoices(stored.craftViews),
    runePotential: readRunePotentialSettings(stored.runePotential, blank.runePotential),
    runeRoles: readRuneRoles(storedRuneRoles(stored)),
    artifacts: readSettings(stored.artifacts, blank.artifacts, artifactSettingChecks),
    speedTuning: readSpeedTuningPreferences(stored.speedTuning),
    monsterPriority: readMonsterPriority(stored.monsterPriority),
    presets: readOwnPresets(stored.presets, game ? runeSlots(game.data) : undefined),
    presetPriority: readPresetPriority(stored.presetPriority),
    runeOptimization: readSettings(stored.runeOptimization, blank.runeOptimization, runeOptimizationSettingChecks),
    relicSynergy: readRelicSynergyChoices(stored.relicSynergy),
  };
}

/* A `.sw` file is read the same forgiving way as the stored copy, so one saved
   before a setting was added still loads. It must still be a JASWA preferences
   document at all: a record naming none of its sections is some other file. */
export function isPreferencesDocument(value: unknown): boolean {
  return isRecord(value) && (preferenceSections.some((section) => section in value) || formerRuneRolesKey in value);
}

