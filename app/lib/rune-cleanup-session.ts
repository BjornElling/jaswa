import type { SortState } from '../components/use-sorted-rows';
import type { CalculationBackend } from './compute/calculation-summary';
import type { HeldRuneAdvice } from './rune-cleanup-refresh';
import type { ReferenceStats } from './rune-reference-stats';
import type { RuneRole } from './rune-roles';
import type { RunePotentialSettings } from './types';

export type RuneCleanupResult = {
  id: number;
  account: string;
  entries: ReadonlyMap<string, HeldRuneAdvice>;
  roles: RuneRole[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats>;
  durationMs: number;
  backend: CalculationBackend;
};

export type RuneCleanupArrangement = { key: string; ids: string[]; known: Set<string> };

/** Owned by the application, not the page: navigation keeps answers and row order,
 * but removing the import or changing accounts discards them. No calculated data
 * goes into preferences or survives an application reload. */
export type RuneCleanupSnapshot = {
  result: RuneCleanupResult | null;
  sort: SortState;
  arranged: RuneCleanupArrangement | null;
  failure: string | null;
};

export type RuneCleanupSession = {
  account: string | null;
  read: () => RuneCleanupSnapshot | null;
  remember: (snapshot: RuneCleanupSnapshot) => void;
};

export function createRuneCleanupSession(account: string | null): RuneCleanupSession {
  let snapshot: RuneCleanupSnapshot | null = null;
  return { account, read: () => snapshot, remember: (next) => { snapshot = next; } };
}

/** Safeguards act on the held answer immediately; only these settings change
 * the underlying score, odds or recommendation. */
export function runeCleanupSettingsKey(settings: RunePotentialSettings): string {
  return JSON.stringify([
    settings.powerUpPolicy, settings.runeQuality, settings.gemRoll,
    settings.gemRoll === null ? null : settings.gemGrade,
    settings.grindstoneRoll, settings.grindstoneRoll === null ? null : settings.grindstoneGrade,
    settings.acceptedRunes, settings.brokenRunes, settings.intangibleRunes,
    settings.keepMoreForLargerSets,
  ]);
}

export function runeCleanupReferenceKey(base: ReadonlyMap<string, ReferenceStats> | null): string {
  return JSON.stringify(base === null ? null : [...base].sort(([left], [right]) => left.localeCompare(right)));
}

/** Content rather than object identity: importing the same account or restoring
 * unchanged preferences does not make a valid answer stale. Role order is kept
 * because it can decide which equally suitable role is named. */
export function runeCleanupStandardsChanged(
  result: RuneCleanupResult, roles: readonly RuneRole[], settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats> | null,
): boolean {
  return JSON.stringify(result.roles) !== JSON.stringify(roles)
    || runeCleanupSettingsKey(result.settings) !== runeCleanupSettingsKey(settings)
    || runeCleanupReferenceKey(result.base) !== runeCleanupReferenceKey(base);
}
