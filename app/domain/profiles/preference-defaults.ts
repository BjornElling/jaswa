import type { ArtifactConversionStoneMode, ArtifactRecalculateMode, ArtifactSettings, DirectImportMode, ImportRoute, Preferences, RunePotentialSettings } from '../model';
import { blankCraftIgnores } from './craft-ignores';
import { blankCraftViewChoices } from './craft-view-choices';
import { defaultRerollRules } from '../runes/rune-reapp-targets';
import { defaultRuneRoles } from './rune-roles';
import { blankGeneralSettings } from '../shared/regional-settings';
import { blankSpeedTuningPreferences } from './speed-tuning-preferences';
import { defaultRuneOptimizationSettings } from './rune-optimization-settings';

/* The starting choices a fresh workspace holds and a missing or rejected
   choice falls back to. The readers in `ingest/preferences.ts` judge what is
   stored; these say what the program starts from. */

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

/* Live sync is what a user connecting the helper came for: the workspace shows
   the game as it is. Reading only at game start is the deliberate choice of a
   user who wants to plan against a snapshot. */
export const defaultDirectImportMode: DirectImportMode = 'live';

/* The file route works without any companion program, so it is the neutral
   starting point until the user explicitly chooses direct import. */
export const defaultImportRoute: ImportRoute = 'file';

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
