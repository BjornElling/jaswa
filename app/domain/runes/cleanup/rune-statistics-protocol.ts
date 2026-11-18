import type { RuneCleanupStatistics } from './rune-cleanup-statistics';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RunePotentialSettings } from '../../model';
import type { CalculationBackend } from '../../shared/calculation-summary';

export type RuneStatisticsRequest = {
  roles: readonly RuneRole[];
  settings: RunePotentialSettings;
  base: ReadonlyMap<string, ReferenceStats>;
  preferWebGpu: boolean;
};

export type RuneStatisticsOutcome =
  | { status: 'done'; statistics: RuneCleanupStatistics; backend: CalculationBackend }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };
