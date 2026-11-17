import type { PercentileRankBounds, ProbabilityBounds } from '../percentile/probability';

/** A point rounds down and an interval expands outward, using the certified fractions. */
function certifiedBoundsText(bounds: PercentileRankBounds, scale: number, digits: number): string {
  const decimal = 10 ** digits;
  const factor = BigInt(scale * decimal);
  const lowNumerator = BigInt(bounds.lowFraction.numerator);
  const lower = lowNumerator * factor / BigInt(bounds.lowFraction.denominator);
  const display = (value: bigint) => (Number(value) / decimal).toFixed(digits);
  if (bounds.exact) return lower === BigInt(0) && lowNumerator > BigInt(0) ? `<${display(BigInt(1))}` : display(lower);
  const upperDenominator = BigInt(bounds.highFraction.denominator);
  const upper = (BigInt(bounds.highFraction.numerator) * factor + upperDenominator - BigInt(1)) / upperDenominator;
  return `${display(lower)}–${display(upper)}`;
}

export function runeChanceBoundsText(bounds: ProbabilityBounds, digits = 1): string {
  return `${certifiedBoundsText(bounds, 100, digits)} %`;
}

export function percentileRankText(rank: PercentileRankBounds | null, digits = 1): string | null {
  return rank === null ? null : certifiedBoundsText(rank, 1, digits);
}
