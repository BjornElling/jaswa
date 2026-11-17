/** Exact rational masses used by the rune percentile kernel. */
export type Rational = Readonly<{ numerator: bigint; denominator: bigint }>;

const B0 = BigInt(0);
const B1 = BigInt(1);
const abs = (value: bigint): bigint => value < B0 ? -value : value;

export function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== B0) [a, b] = [b, a % b];
  return a;
}

export function rational(numerator: bigint | number, denominator: bigint | number = B1): Rational {
  const n = typeof numerator === 'number' ? BigInt(numerator) : numerator;
  const d = typeof denominator === 'number' ? BigInt(denominator) : denominator;
  if (d === B0) throw new RangeError('A probability denominator cannot be zero.');
  if (d < B0) return rational(-n, -d);
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

export const ZERO = rational(B0);
export const ONE = rational(B1);

export function add(left: Rational, right: Rational): Rational {
  if (left.numerator === B0) return right;
  if (right.numerator === B0) return left;
  if (left.denominator === right.denominator) return rational(left.numerator + right.numerator, left.denominator);
  return rational(left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator);
}

export function subtract(left: Rational, right: Rational): Rational {
  if (right.numerator === B0) return left;
  if (left.denominator === right.denominator) return rational(left.numerator - right.numerator, left.denominator);
  return rational(left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator);
}

export function multiply(left: Rational, right: Rational): Rational {
  if (left.numerator === B0 || right.numerator === B0) return ZERO;
  if (left.numerator === left.denominator) return right;
  if (right.numerator === right.denominator) return left;
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === B0) throw new RangeError('Cannot divide by a zero probability.');
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function compare(left: Rational, right: Rational): -1 | 0 | 1 {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < B0 ? -1 : difference > B0 ? 1 : 0;
}

export function toNumber(value: Rational): number {
  if (value.numerator === B0) return 0;
  const n = value.numerator < B0 ? -value.numerator : value.numerator;
  const d = value.denominator;
  const bitLength = (input: bigint) => input.toString(2).length;
  const numeratorBits = bitLength(n);
  const denominatorBits = bitLength(d);
  const normalized = (input: bigint, bits: number) => {
    const shift = Math.max(0, bits - 53);
    return Number(input >> BigInt(shift)) / 2 ** (bits - shift - 1);
  };
  let mantissa = normalized(n, numeratorBits) / normalized(d, denominatorBits);
  let exponent = numeratorBits - denominatorBits;
  if (mantissa < 1) { mantissa *= 2; exponent -= 1; }
  const approximate = mantissa * (exponent > 1023 ? Infinity : exponent < -1074 ? 0 : 2 ** exponent);
  return value.numerator < B0 ? -approximate : approximate;
}

const floatBits = new DataView(new ArrayBuffer(8));

/** The exact binary64 value represented by a finite JavaScript number. */
export function rationalFromNumber(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError('A probability must be finite.');
  if (value === 0) return ZERO;
  floatBits.setFloat64(0, value, false);
  const bits = floatBits.getBigUint64(0, false);
  const negative = (bits >> BigInt(63)) === B1;
  const exponent = Number((bits >> BigInt(52)) & BigInt(0x7ff));
  const fraction = bits & ((B1 << BigInt(52)) - B1);
  const significand = exponent === 0 ? fraction : fraction | (B1 << BigInt(52));
  const power = (exponent === 0 ? -1022 : exponent - 1023) - 52;
  const signed = negative ? -significand : significand;
  return power >= 0 ? rational(signed << BigInt(power)) : rational(signed, B1 << BigInt(-power));
}

const maximumFinite = rationalFromNumber(Number.MAX_VALUE);

/** Interpret a displayed policy number as its shortest decimal, not its binary64 expansion. */
export function rationalFromDecimal(value: number | string): Rational {
  const source = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) throw new RangeError('A decimal policy value must be numeric.');
  const sign = match[1] === '-' ? -B1 : B1;
  const whole = match[2];
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - fraction.length;
  let numerator = sign * BigInt(`${whole}${fraction}` || '0');
  if (exponent >= 0) numerator *= BigInt(10) ** BigInt(exponent);
  return exponent >= 0
    ? rational(numerator)
    : rational(numerator, BigInt(10) ** BigInt(-exponent));
}

export type PolicyProbability = number | Rational;

export function policyProbability(value: PolicyProbability): Rational {
  const result = typeof value === 'number' ? rationalFromDecimal(value) : value;
  if (compare(result, ZERO) <= 0 || compare(result, ONE) > 0) {
    throw new RangeError('A policy probability must satisfy 0 < p <= 1.');
  }
  return result;
}

function nextUp(value: number): number {
  if (value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  floatBits.setFloat64(0, value, false);
  let bits = floatBits.getBigUint64(0, false);
  bits += value > 0 ? B1 : -B1;
  floatBits.setBigUint64(0, bits, false);
  return floatBits.getFloat64(0, false);
}

function nextDown(value: number): number {
  if (value === -Infinity) return value;
  if (value === 0) return -Number.MIN_VALUE;
  return -nextUp(-value);
}

function validateRoundable(value: Rational): void {
  if (value.denominator <= B0 || value.numerator < B0) {
    throw new RangeError('Directed rational rounding needs a nonnegative value and positive denominator.');
  }
}

/** The greatest finite binary64 value no greater than a nonnegative rational. */
export function roundRationalDown(value: Rational): number {
  validateRoundable(value);
  if (value.numerator === B0) return 0;
  if (compare(value, maximumFinite) > 0) return Number.MAX_VALUE;

  let candidate = toNumber(value);
  if (!Number.isFinite(candidate) || candidate > Number.MAX_VALUE) candidate = Number.MAX_VALUE;
  if (candidate < 0) candidate = 0;
  while (compare(rationalFromNumber(candidate), value) > 0) candidate = nextDown(candidate);
  while (candidate < Number.MAX_VALUE) {
    const next = nextUp(candidate);
    if (!Number.isFinite(next) || compare(rationalFromNumber(next), value) > 0) break;
    candidate = next;
  }
  return candidate;
}

/** The least binary64 value no less than a nonnegative rational. */
export function roundRationalUp(value: Rational): number {
  validateRoundable(value);
  if (value.numerator === B0) return 0;
  if (compare(value, maximumFinite) > 0) return Number.POSITIVE_INFINITY;

  let candidate = toNumber(value);
  if (!Number.isFinite(candidate) || candidate > Number.MAX_VALUE) candidate = Number.MAX_VALUE;
  if (candidate < 0) candidate = 0;
  while (compare(rationalFromNumber(candidate), value) < 0) {
    if (candidate === Number.MAX_VALUE) return Number.POSITIVE_INFINITY;
    candidate = nextUp(candidate);
  }
  while (candidate > 0) {
    const prior = nextDown(candidate);
    if (prior < 0 || compare(rationalFromNumber(prior), value) < 0) break;
    candidate = prior;
  }
  return candidate;
}

function outwardNumber(value: Rational, upper: boolean): number {
  return upper ? roundRationalUp(value) : roundRationalDown(value);
}

export type ProbabilityBounds = Readonly<{
  low: number;
  high: number;
  exact: boolean;
  lowFraction: Readonly<{ numerator: string; denominator: string }>;
  highFraction: Readonly<{ numerator: string; denominator: string }>;
}>;

export type PercentileRankBounds = Readonly<{
  low: number;
  high: number;
  exact: boolean;
  lowFraction: Readonly<{ numerator: string; denominator: string }>;
  highFraction: Readonly<{ numerator: string; denominator: string }>;
}>;

function rationalBounds(low: Rational, high: Rational): PercentileRankBounds {
  if (compare(low, ZERO) < 0 || compare(low, high) > 0) throw new RangeError('Numeric bounds must be ordered and nonnegative.');
  return {
    low: outwardNumber(low, false), high: outwardNumber(high, true), exact: compare(low, high) === 0,
    lowFraction: { numerator: low.numerator.toString(), denominator: low.denominator.toString() },
    highFraction: { numerator: high.numerator.toString(), denominator: high.denominator.toString() },
  };
}

/** Bounds for a nonnegative utility, whose scale need not stop at 1 or 100. */
export function expectedUtilityBounds(low: Rational, high: Rational = low): PercentileRankBounds {
  return rationalBounds(low, high);
}

export function probabilityBounds(low: Rational, high: Rational = low): ProbabilityBounds {
  if (compare(low, ZERO) < 0 || compare(high, ONE) > 0 || compare(low, high) > 0) {
    throw new RangeError('Probability bounds must satisfy 0 <= low <= high <= 1.');
  }
  return rationalBounds(low, high);
}

export function percentileRankBounds(tailLow: Rational, tailHigh: Rational): PercentileRankBounds {
  if (compare(tailLow, ZERO) < 0 || compare(tailHigh, ONE) > 0 || compare(tailLow, tailHigh) > 0) {
    throw new RangeError('Tail bounds must satisfy 0 <= low <= high <= 1.');
  }
  const hundred = rational(100);
  return rationalBounds(
    multiply(complement(tailHigh), hundred),
    multiply(complement(tailLow), hundred),
  );
}

export function complement(value: Rational): Rational {
  return subtract(ONE, value);
}
