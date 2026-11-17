import { rational } from './probability';
import type { Rational } from './probability';
import type { RollRange } from '../rune-properties';

export type IntegerSupport = Readonly<{
  values: readonly number[];
  counts: readonly bigint[];
  total: bigint;
  prefix: readonly bigint[];
}>;

export function supportFromCounts(counts: ReadonlyMap<number, bigint>): IntegerSupport {
  const values = [...counts.keys()].sort((left, right) => left - right);
  if (values.some((value) => !Number.isSafeInteger(value))) throw new RangeError('Finite roll support values must be safe integers.');
  const sortedCounts = values.map((value) => counts.get(value) ?? BigInt(0));
  let total = BigInt(0);
  const prefix: bigint[] = [BigInt(0)];
  for (const count of sortedCounts) {
    if (count <= BigInt(0)) throw new RangeError('Finite roll supports require positive integer counts.');
    total += count;
    prefix.push(total);
  }
  if (total === BigInt(0)) throw new RangeError('Finite roll supports cannot be empty.');
  return { values, counts: sortedCounts, total, prefix };
}

export function uniformIntegerSupport(range: RollRange, offset = 0): IntegerSupport {
  if (!Number.isSafeInteger(range.minimum) || !Number.isSafeInteger(range.maximum) || !Number.isSafeInteger(offset)
    || range.minimum > range.maximum || !Number.isSafeInteger(range.minimum + offset)
    || !Number.isSafeInteger(range.maximum + offset)) {
    throw new RangeError('A finite roll interval must have ordered integer endpoints.');
  }
  const counts = new Map<number, bigint>();
  for (let value = range.minimum; value <= range.maximum; value += 1) counts.set(value + offset, BigInt(1));
  return supportFromCounts(counts);
}

/** Initial roll plus `upgrades` independent uniform integer increments. */
export function lineRollSupport(initial: RollRange, upgrade: RollRange | null, upgrades: number, offset = 0): IntegerSupport {
  if (!Number.isInteger(upgrades) || upgrades < 0 || !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(initial.minimum) || !Number.isSafeInteger(initial.maximum) || initial.minimum > initial.maximum
    || !Number.isSafeInteger(initial.minimum + offset) || !Number.isSafeInteger(initial.maximum + offset)
    || (upgrades > 0 && !upgrade)) {
    throw new RangeError('A line needs a legal interval for every modeled upgrade.');
  }
  if (upgrades > 0 && (!Number.isSafeInteger(upgrade!.minimum) || !Number.isSafeInteger(upgrade!.maximum)
    || upgrade!.minimum > upgrade!.maximum)) throw new RangeError('Upgrade rolls need ordered integer endpoints.');
  let counts = new Map<number, bigint>();
  for (let value = initial.minimum; value <= initial.maximum; value += 1) counts.set(value + offset, BigInt(1));
  for (let at = 0; at < upgrades; at += 1) {
    const previousValues = [...counts.keys()].sort((left, right) => left - right);
    const minimum = previousValues[0];
    const maximum = previousValues[previousValues.length - 1];
    if (!Number.isSafeInteger(minimum + upgrade!.minimum) || !Number.isSafeInteger(maximum + upgrade!.maximum)) {
      throw new RangeError('A projected roll exceeds the supported integer range.');
    }
    const prefix: bigint[] = [BigInt(0)];
    for (const value of previousValues) prefix.push(prefix[prefix.length - 1] + counts.get(value)!);
    const next = new Map<number, bigint>();
    /* A uniform integer roll is a sliding window over the previous sum counts. This
       keeps a flat HP line's wide support linear in its output width, not width × roll range. */
    for (let value = minimum + upgrade!.minimum; value <= maximum + upgrade!.maximum; value += 1) {
      const first = Math.max(0, value - upgrade!.maximum - minimum);
      const last = Math.min(previousValues.length, value - upgrade!.minimum - minimum + 1);
      const count = prefix[last] - prefix[first];
      if (count > BigInt(0)) next.set(value, count);
    }
    counts = next;
  }
  return supportFromCounts(counts);
}

export type SupportSlice = Readonly<{ start: number; end: number; low: number; high: number; mass: Rational }>;

export function wholeSupport(support: IntegerSupport): SupportSlice {
  return sliceSupport(support, 0, support.values.length);
}

export function sliceSupport(support: IntegerSupport, start: number, end: number): SupportSlice {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > support.values.length || start >= end) {
    throw new RangeError('A support slice must contain at least one supported value.');
  }
  const count = support.prefix[end] - support.prefix[start];
  return {
    start, end, low: support.values[start], high: support.values[end - 1],
    mass: rational(count, support.total),
  };
}

/** Split around half the exact probability mass while preserving contiguous score bounds. */
export function splitSupport(support: IntegerSupport, slice: SupportSlice): [SupportSlice, SupportSlice] | null {
  if (slice.end - slice.start <= 1) return null;
  const mass = support.prefix[slice.end] - support.prefix[slice.start];
  const target = support.prefix[slice.start] + mass / BigInt(2);
  let low = slice.start + 1;
  let high = slice.end - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (support.prefix[middle] < target) low = middle + 1;
    else high = middle;
  }
  return [sliceSupport(support, slice.start, low), sliceSupport(support, low, slice.end)];
}

export function choose(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) return BigInt(0);
  const take = Math.min(k, n - k);
  let result = BigInt(1);
  for (let at = 1; at <= take; at += 1) result = result * BigInt(n - take + at) / BigInt(at);
  return result;
}

export function factorial(value: number): bigint {
  if (!Number.isInteger(value) || value < 0) throw new RangeError('Factorials need a nonnegative integer.');
  let result = BigInt(1);
  for (let at = 2; at <= value; at += 1) result *= BigInt(at);
  return result;
}

/** Count allocations of identical, independent target choices as an exact multinomial mass. */
export function allocationMass(counts: readonly number[], events: number, targets: number): Rational {
  if (counts.reduce((sum, value) => sum + value, 0) !== events || !Number.isInteger(events) || events < 0) {
    throw new RangeError('Upgrade allocations must partition every event among legal target lines.');
  }
  if (events === 0) return rational(1);
  if (!Number.isInteger(targets) || targets < 1) throw new RangeError('An improvement event needs at least one legal target line.');
  let ways = BigInt(1);
  let remaining = events;
  for (const count of counts) {
    ways *= choose(remaining, count);
    remaining -= count;
  }
  return rational(ways, BigInt(targets) ** BigInt(events));
}

export function compositions(total: number, bins: number): number[][] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(bins) || bins < 0) {
    throw new RangeError('Composition dimensions must be nonnegative integers.');
  }
  if (bins === 0) return total === 0 ? [[]] : [];
  const result: number[][] = [];
  const current = Array<number>(bins).fill(0);
  const visit = (at: number, remaining: number) => {
    if (at === bins - 1) { current[at] = remaining; result.push([...current]); return; }
    for (let value = 0; value <= remaining; value += 1) {
      current[at] = value;
      visit(at + 1, remaining - value);
    }
  };
  visit(0, total);
  return result;
}

export function combinations<T>(values: readonly T[], count: number): T[][] {
  if (!Number.isInteger(count) || count < 0 || count > values.length) return [];
  const result: T[][] = [];
  const current: T[] = [];
  const visit = (start: number) => {
    if (current.length === count) { result.push([...current]); return; }
    const needed = count - current.length;
    for (let at = start; at <= values.length - needed; at += 1) {
      current.push(values[at]);
      visit(at + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
}
