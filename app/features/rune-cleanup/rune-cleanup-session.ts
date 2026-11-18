import { runeCalculationKey } from '../../domain/runes/rune-calculation-inputs';
import type { SortState } from '../../ui/use-sorted-rows';
import type { CalculationBackend } from '../../domain/shared/calculation-summary';
import type { HeldRuneAdvice } from '../../domain/runes/cleanup/rune-cleanup-refresh';
import type { ReferenceStats } from '../../domain/reference/rune-reference-stats';
import type { RuneRole } from '../../domain/profiles/rune-roles';
import type { RunePotentialSettings } from '../../domain/model';

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
  showQuality: boolean;
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

/** One definition of calculation inputs for the table, statistics and overlay. */
export function runeCleanupStandardsChanged(
  result: RuneCleanupResult, roles: readonly RuneRole[], settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats> | null,
): boolean {
  return runeCalculationKey(result) !== runeCalculationKey({ roles, settings, base });
}
