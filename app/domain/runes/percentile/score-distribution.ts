import {
  add, compare, divide, percentileRankBounds, policyProbability, probabilityBounds, subtract, ZERO,
} from './probability';
import type { PercentileRankBounds, PolicyProbability, ProbabilityBounds, Rational } from './probability';

export type ScoreMass = Readonly<{ score: number | null; mass: Rational }>;
export type TailQuery = Readonly<{
  status: 'complete' | 'incomplete';
  cutoff: number;
  tail: ProbabilityBounds;
  rank: PercentileRankBounds;
  passes: boolean | null;
}>;

/** A finite score measure. Null scores retain denominator mass but never enter a tail. */
export class ScoreDistribution {
  readonly totalMass: Rational;
  readonly #scores: ReadonlyMap<number, Rational>;
  readonly #observedMass: Rational;

  constructor(entries: readonly ScoreMass[], totalMass?: Rational) {
    const scores = new Map<number, Rational>();
    let observed = ZERO;
    for (const entry of entries) {
      if (entry.mass.numerator < BigInt(0)) throw new RangeError('Score masses cannot be negative.');
      observed = add(observed, entry.mass);
      if (entry.score === null) continue;
      if (!Number.isFinite(entry.score)) throw new RangeError('Finite scores must be finite binary64 numbers.');
      const key = Object.is(entry.score, -0) ? 0 : entry.score;
      scores.set(key, add(scores.get(key) ?? ZERO, entry.mass));
    }
    this.totalMass = totalMass ?? observed;
    if (this.totalMass.numerator <= BigInt(0) || compare(observed, this.totalMass) > 0) {
      throw new RangeError('A score measure needs positive total mass and cannot exceed it.');
    }
    this.#scores = scores;
    this.#observedMass = observed;
  }

  /** Direct inclusive upper tail; it never subtracts an almost-one lower CDF. */
  query(cutoff: number, alpha: PolicyProbability, unresolvedMass?: Rational): TailQuery {
    if (!Number.isFinite(cutoff)) throw new RangeError('A tail cutoff must be finite.');
    if (cutoff <= 0) throw new RangeError('A useful-score tail cutoff must be positive.');
    const allowance = policyProbability(alpha);
    const normalizedCutoff = Object.is(cutoff, -0) ? 0 : cutoff;
    let lower = ZERO;
    for (const [score, mass] of this.#scores) if (score >= normalizedCutoff) lower = add(lower, mass);
    const remaining = subtract(this.totalMass, this.#observedMass);
    const unresolved = unresolvedMass ?? remaining;
    if (compare(unresolved, remaining) > 0 || unresolved.numerator < BigInt(0)) {
      throw new RangeError('Unresolved mass cannot exceed the measure mass outside known score atoms.');
    }
    const upper = add(lower, unresolved);
    const normalizedLow = divide(lower, this.totalMass);
    const normalizedHigh = divide(upper, this.totalMass);
    const tail = probabilityBounds(normalizedLow, normalizedHigh);
    const rank = percentileRankBounds(normalizedLow, normalizedHigh);
    const passes = compare(normalizedHigh, allowance) <= 0 ? true : compare(normalizedLow, allowance) > 0 ? false : null;
    return { status: compare(lower, upper) === 0 ? 'complete' : 'incomplete', cutoff, tail, rank, passes };
  }
}

export function scoreDistribution(entries: readonly ScoreMass[], totalMass?: Rational): ScoreDistribution {
  return new ScoreDistribution(entries, totalMass);
}
