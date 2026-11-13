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

export type RuneStatisticsWorkerRequest = {
  type: 'calculate';
  requestId: number;
  request: RuneStatisticsRequest;
};

export type RuneStatisticsWorkerResponse =
  | { type: 'result'; requestId: number; statistics: RuneCleanupStatistics; backend: CalculationBackend }
  | { type: 'error'; requestId: number; message: string };

export type RuneStatisticsOutcome =
  | { status: 'done'; statistics: RuneCleanupStatistics; backend: CalculationBackend }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };
