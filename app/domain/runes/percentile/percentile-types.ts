import type { Rune } from '../runes';
import type { PercentileRankBounds, PolicyProbability, ProbabilityBounds } from './probability';

/** The only host capability the pure solver needs from a cancellation source. */
export type CancellationSignal = Readonly<{ aborted: boolean }>;

export type PercentileReading = Readonly<{
  id: string;
  roleId?: string;
  buildKey?: string;
  permitted: boolean;
  /** The one actual main accepted by this reading, including wildcard expansions. */
  mainStatId: number;
  alpha: PolicyProbability;
  /** Raw score slope for each effect id; used only for safe branch ordering/bounds. */
  weightsByStatId: Readonly<Record<number, number>>;
  /** Equal keys certify identical canonical terminal utility for the same body. */
  utilityKey?: string;
  /** Fixed ruler for scheduling promising searches; no part of the percentile event. */
  efficiencyCeiling?: number;
  /**
   * Pure shared canonical scorer for one fixed type/lineage/converted-line shape.
   * It returns a finite, nonnegative-slope score, or null when the body cannot be
   * read. Its realized score must be nondecreasing in every natural sub-property
   * value. The adaptive endpoint proof relies on that canonical score contract.
   */
  score(body: Rune): number | null;
  /** The canonical weighted innate contribution, or zero for no innate. */
  utilityPrefix?(body: Rune): number;
  /** Shared craft-kernel line terms used only to bound expected utility. */
  utilityLineComponents?(body: Rune, lineIndex: number): UtilityLineComponents;
}>;

export type UtilityLineComponents = Readonly<{
  /** The existing line after the shared lineage-specific Grindstone credit. */
  grounded: number;
  /** The greatest legal credited Gem result for replacing this one line, if any. */
  gem: number | null;
}>;

export type ReferenceTail = Readonly<{
  status: 'complete' | 'incomplete';
  cutoff: number;
  tail: ProbabilityBounds;
  rank: PercentileRankBounds;
  passes: boolean | null;
}>;

export type ReferenceDistribution = Readonly<{
  slot: number;
  stars: number;
  readingId: string;
  /** Aliased reading identities may share a certified numerical reference. */
  decisionIdentity?: object;
  /** Certify the two sides of the policy boundary using reference outcomes only. */
  qualityBoundary?(alpha: PolicyProbability): Promise<Readonly<{ failsAt: number; passesAt: number }>>;
  /** Query `P(score >= cutoff)` directly. Alpha never changes the reference ruler. */
  query(cutoff: number, alpha: PolicyProbability, precision?: 'decision' | 'full' | 'cached'): Promise<ReferenceTail>;
}>;

export type PercentileStatus = 'complete' | 'incomplete' | 'invalid' | 'unusable';

export type ExpectedUtilityBounds = Readonly<{
  low: number;
  high: number;
  exact: boolean;
  lowFraction: Readonly<{ numerator: string; denominator: string }>;
  highFraction: Readonly<{ numerator: string; denominator: string }>;
}>;

export type ReadingFutureResult = Readonly<{
  id: string;
  status: 'complete' | 'incomplete';
  chance: ProbabilityBounds;
  potential: Readonly<{ score: number; rank: PercentileRankBounds }> | null;
  cutoff?: Readonly<{
    /** Scores at or below this observed boundary cannot qualify. */
    failsAt: number;
    /** Scores at or above this observed boundary qualify. */
    passesAt: number | null;
  }>;
  expectedUtility?: ExpectedUtilityBounds;
}>;

export type RuneFutureResult = Readonly<{
  status: PercentileStatus;
  /** Null when malformed or unmodelled input means no probability statement exists. */
  unionChance: ProbabilityBounds | null;
  readings: readonly ReadingFutureResult[];
  potentialWitness: Readonly<{ readingId: string; score: number; rank: PercentileRankBounds }> | null;
  diagnostic?: string;
}>;
