import type { Rune } from '../runes';
import type { IntegerSupport } from './finite-support';
import type { PercentileReading } from './percentile-types';
import { compare, multiply, rational } from './probability';
import type { Rational } from './probability';

const zero = BigInt(0);
const one = BigInt(1);
const unitDenominator = one << BigInt(1074);
const implicitBit = one << BigInt(52);
const unitRoundoffDenominator = one << BigInt(53);
const sumLower = rational((unitRoundoffDenominator - one) ** BigInt(4), unitRoundoffDenominator ** BigInt(4));
const sumUpper = rational((unitRoundoffDenominator + one) ** BigInt(4), unitRoundoffDenominator ** BigInt(4));
const floatBits = new DataView(new ArrayBuffer(8));

function units(value: number): bigint {
  if (value === 0) return zero;
  if (!Number.isFinite(value) || value < 0) throw new RangeError('A canonical utility component must be finite and nonnegative.');
  floatBits.setFloat64(0, value);
  const bits = floatBits.getBigUint64(0);
  const exponent = (bits >> BigInt(52)) & BigInt(0x7ff);
  const fraction = bits & (implicitBit - one);
  return exponent === zero ? fraction : (fraction | implicitBit) << (exponent - one);
}

type Gain = { value: bigint; count: bigint; dimension: number };

/**
 * Conditioned on the shape and roll allocation, natural line values are
 * independent. Integrate the rounded component sum and the largest legal
 * replacement gain exactly, without enumerating their Cartesian product.
 * The canonical scorer still sums each realized body in stat order. Four
 * nonnegative binary64 additions give the remaining relative-error bound.
 * A subnormal sum of binary64 values is exact in units of MIN_VALUE.
 */
export function canonicalExpectedUtility(
  reading: PercentileReading, body: Rune, supports: readonly IntegerSupport[], low: Rational, high: Rational,
): readonly [Rational, Rational] {
  if (!reading.utilityPrefix || !reading.utilityLineComponents || compare(low, high) === 0) return [low, high];
  const denominator = supports.reduce((product, support) => product * support.total, one);
  const prefix = units(reading.utilityPrefix(body));
  let baseline = prefix * denominator;
  let maximum = prefix;
  let componentBits = prefix;
  const gains: Gain[] = [];

  supports.forEach((support, dimension) => {
    const line = body.subProperties[dimension];
    const previous = line.value;
    let groundSum = zero;
    let lineMaximum = zero;
    let priorGain: Gain | undefined;
    try {
      for (let index = support.values.length - 1; index >= 0; index -= 1) {
        line.value = support.values[index];
        const components = reading.utilityLineComponents!(body, dimension);
        const grounded = units(components.grounded);
        const gem = components.gem === null ? zero : units(components.gem);
        componentBits |= grounded | gem;
        if (grounded > lineMaximum) lineMaximum = grounded;
        if (gem > lineMaximum) lineMaximum = gem;
        const count = support.counts[index];
        groundSum += grounded * count;
        const gain = gem > grounded ? gem - grounded : zero;
        if (priorGain?.value === gain) priorGain.count += count;
        else {
          priorGain = { value: gain, count, dimension };
          gains.push(priorGain);
        }
      }
    } finally {
      line.value = previous;
    }
    maximum += lineMaximum;
    baseline += groundSum * (denominator / support.total);
  });

  gains.sort((left, right) => left.value < right.value ? -1 : left.value > right.value ? 1 : 0);
  const lineCounts = supports.map(() => zero);
  let previousCount = zero;
  let expectation = baseline;
  for (let start = 0; start < gains.length;) {
    const value = gains[start].value;
    let end = start;
    while (end < gains.length && gains[end].value === value) {
      const gain = gains[end];
      lineCounts[gain.dimension] += gain.count;
      end += 1;
    }
    const count = lineCounts.reduce((product, lineCount) => product * lineCount, one);
    expectation += value * (count - previousCount);
    previousCount = count;
    start = end;
  }

  const center = rational(expectation, denominator * unitDenominator);
  const quantum = componentBits & -componentBits;
  const exactSums = maximum <= quantum * implicitBit * BigInt(2);
  const lower = exactSums ? center : multiply(center, sumLower);
  const upper = exactSums ? center : multiply(center, sumUpper);
  return [compare(lower, low) > 0 ? lower : low, compare(upper, high) < 0 ? upper : high];
}
