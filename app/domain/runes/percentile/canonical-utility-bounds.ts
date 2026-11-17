/** Bounds between two canonical readings of the same reference body. */
import {
  add, compare, divide, multiply, ONE, rational, rationalFromNumber,
  roundRationalDown, roundRationalUp, subtract, ZERO,
} from './probability';
import type { Rational } from './probability';

export type UtilityRelation = Readonly<{
  lower: Readonly<{ factor: Rational; offset: Rational }> | null;
  upper: Readonly<{ factor: Rational; offset: Rational }> | null;
}>;

const unitRoundoff = rational(1, BigInt(1) << BigInt(53));
const nineRoundoffs = multiply(rational(9), unitRoundoff);
const gamma = divide(nineRoundoffs, subtract(ONE, nineRoundoffs));
const downward = divide(subtract(ONE, gamma), add(ONE, gamma));
const upward = divide(add(ONE, gamma), subtract(ONE, gamma));
const absoluteError = multiply(rational(10), rationalFromNumber(Number.MIN_VALUE));

/**
 * A reference body has five nonnegative weighted properties and four additions.
 * Gamma_9 bounds their accumulated binary64 relative error. Ten underflow units
 * also enclose the five multiplication errors after propagation through the sum.
 * Maximizing over the same legal Gem bodies preserves these inequalities.
 * The caller verifies bounded canonical raw values; the price guard prevents
 * overflow. None of this replaces the actual score or its equality relation.
 */
export function canonicalUtilityRelation(
  oldPrices: Readonly<Record<number, number>>, newPrices: Readonly<Record<number, number>>,
  statIds: readonly number[],
): UtilityRelation | null {
  let minimum: Rational | null = null;
  let maximum = ZERO;
  let upperPossible = true;
  for (const statId of statIds) {
    const oldPrice = oldPrices[statId];
    const newPrice = newPrices[statId];
    if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || oldPrice < 0 || newPrice < 0
      || oldPrice > 2 ** 900 || newPrice > 2 ** 900) return null;
    if (oldPrice === 0) {
      if (newPrice > 0) upperPossible = false;
      continue;
    }
    const ratio = divide(rationalFromNumber(newPrice), rationalFromNumber(oldPrice));
    if (minimum === null || compare(ratio, minimum) < 0) minimum = ratio;
    if (compare(ratio, maximum) > 0) maximum = ratio;
  }
  const lowerFactor = minimum && compare(minimum, ZERO) > 0 ? multiply(minimum, downward) : null;
  const upperFactor = upperPossible && compare(maximum, ZERO) > 0 ? multiply(maximum, upward) : null;
  if (!lowerFactor && !upperFactor) return null;
  return {
    lower: lowerFactor ? { factor: lowerFactor, offset: multiply(absoluteError, add(lowerFactor, ONE)) } : null,
    upper: upperFactor ? { factor: upperFactor, offset: multiply(absoluteError, add(upperFactor, ONE)) } : null,
  };
}

/** Old-score cutoff proving that the new score reaches the requested cutoff. */
export function sufficientOldScore(relation: UtilityRelation, cutoff: number): number | null {
  if (!relation.lower) return null;
  return roundRationalUp(divide(add(rationalFromNumber(cutoff), relation.lower.offset), relation.lower.factor));
}

/** Old-score cutoff necessary for the new score to reach the requested cutoff. */
export function necessaryOldScore(relation: UtilityRelation, cutoff: number): number | null {
  if (!relation.upper) return null;
  const numerator = subtract(rationalFromNumber(cutoff), relation.upper.offset);
  if (compare(numerator, ZERO) <= 0) return 0;
  return roundRationalDown(divide(numerator, relation.upper.factor));
}
