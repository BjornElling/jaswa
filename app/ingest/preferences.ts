import type { ArtifactSettings, DirectImportMode, ImportRoute, ImportedGame, Preferences, RunePotentialSettings } from '../domain/model';
import { readMonsterPreferences } from '../domain/profiles/monster-preferences';
import { readRuneHolds } from '../domain/profiles/rune-holds';
import { readCraftIgnores } from '../domain/profiles/craft-ignores';
import { readCraftViewChoices } from '../domain/profiles/craft-view-choices';
import { readStoredRerollRules } from '../domain/runes/rune-reapp-targets';
import { readMonsterPriority, readPresetPriority } from '../domain/profiles/monster-priority';
import { readOwnPresets, readPresets, runeSlots } from '../domain/placements/presets';
import type { OwnPreset } from '../domain/placements/presets';
import { monstersByUnitId, speciesOf } from '../domain/speed/speed-team';
import { readRelicSynergyChoices } from '../domain/relics/relic-synergy';
import { craftRollAssumptions } from '../domain/runes/craft/rune-craft-items';
import type { GameRecord } from '../domain/account/game-record';
import { readRuneRoles } from '../domain/profiles/rune-roles';
import { readGeneralSettings } from '../domain/shared/regional-settings';
import { readSpeedTuningPreferences } from '../domain/profiles/speed-tuning-preferences';
import type { FormerPresetTeam } from '../domain/profiles/speed-tuning-preferences';
import { runeOptimizationSettingChecks } from '../domain/profiles/rune-optimization-settings';
import { isBoolean, isOneOf, isWholeNumberIn, readSettings } from '../domain/profiles/preference-reading';
import type { FieldChecks } from '../domain/profiles/preference-reading';
import { artifactAcceptableWorthChoices, artifactConversionStoneModes, artifactInsignificantDifferenceRange, blankPreferences } from '../domain/profiles/preference-defaults';

function isRecord(value: unknown): value is GameRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const directImportModes: DirectImportMode[] = ['live', 'on-load'];

const importRoutes: ImportRoute[] = ['direct', 'file'];


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
  'hardwareAcceleration', 'importRoute', 'directImportMode', 'general',
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

/* Speed tuning was kept by preset id until November 14, 2026, and is kept by
   team now. The orders stated then are the user's, so a stored copy of that
   section is carried over against the import it is read with (AGENTS.md §0);
   every write uses the teams. Read without an import, it carries nothing. */
function formerPresetTeams(game: ImportedGame | null, own: OwnPreset[]): (presetId: string) => FormerPresetTeam | undefined {
  if (!game) return () => undefined;
  /* Resolved on the first former entry asked for, so a stored copy without
     that section costs a restore nothing. */
  let resolved: { presets: ReturnType<typeof readPresets>; masterOf: (unitId: string) => string | null } | null = null;
  return (presetId) => {
    resolved ??= { presets: readPresets(game.data, own), masterOf: speciesOf(monstersByUnitId(game.snapshot.monsters.map((monster) => monster.record))) };
    const { presets, masterOf } = resolved;
    const preset = presets.find((entry) => entry.id === presetId);
    return preset ? { content: preset.content?.id ?? 'unnamed', members: preset.members.map((unitId) => ({ unitId, masterId: masterOf(unitId) })) } : undefined;
  };
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
  const presets = readOwnPresets(stored.presets, game ? runeSlots(game.data) : undefined);
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
    speedTuning: readSpeedTuningPreferences(stored.speedTuning, formerPresetTeams(game, presets)),
    monsterPriority: readMonsterPriority(stored.monsterPriority),
    presets,
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

/**
 * A `.sw` file's text read as preferences, through the same readers and against
 * the same account as a restore, so a preset that restore would refuse is
 * refused here too rather than on the next reload. Throws when the text is not
 * a preferences document at all.
 */
export function readPreferencesFile(text: string, game: ImportedGame | null): Preferences {
  const value = JSON.parse(text) as unknown;
  if (!isPreferencesDocument(value)) throw new Error('Invalid JASWA preferences file');
  return { ...readPreferences(value, game), updatedAt: new Date().toISOString() };
}
