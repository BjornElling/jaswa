import {
  allStatIds, bornSubPropertyCount, remainingEvents, slotMainProperties,
  subPropertyRange,
} from '../rune-properties';
import type { RollRange } from '../rune-properties';
import { runeRarities, slotAllowsSubStat } from '../runes';
import type { Rune, RuneRarity, RuneSubProperty } from '../runes';
import {
  add, compare, complement, divide, gcd, multiply, nextUp, ONE, policyProbability, probabilityBounds, percentileRankBounds, rational, rationalFromDecimal, subtract, ZERO,
} from './probability';
import type { PolicyProbability, Rational } from './probability';
import {
  allocationMass, choose, combinations, compositions, lineRollSupport,
  splitSupport, wholeSupport,
} from './finite-support';
import type { IntegerSupport } from './finite-support';
import type { CancellationSignal, PercentileReading, ReferenceDistribution, ReferenceTail } from './percentile-types';
import { runeBirthRarityMasses, runeInnateFrequency } from '../rune-birth-model';
import type { RuneBirthRarityMass } from '../rune-birth-model';
import { canonicalCraftCredit, craftPlan } from '../craft/rune-craft-end-state';
import { canonicalUtilityRelation, necessaryOldScore, sufficientOldScore } from './canonical-utility-bounds';
import type { UtilityRelation } from './canonical-utility-bounds';

/** Declared sensitivity scenarios, never estimates fitted to kept inventory. */
export type ReferenceAssumptions = Readonly<{
  rarities?: readonly RuneBirthRarityMass[];
  innateProbability?: Rational;
  mainProbabilities?: ReadonlyMap<number, Rational>;
}>;

export type ReferenceBuildOptions = Readonly<{
  slot: number;
  stars: number;
  reading: PercentileReading;
  /** Hard cap on branch and structure work. Unresolved probability remains an interval. */
  stateLimit?: number;
  signal?: CancellationSignal;
  assumptions?: ReferenceAssumptions;
  /** Only the shared canonical craft kernel may reuse bounds across price tables. */
  canonicalCraft?: boolean;
  /** Account prototype: share one bounded reference preparation across candidate scores. */
  prepareQualityBoundary?: boolean;
  onQualityPreparation?: (durationMs: number) => void;
}>;

export class PercentileCancelledError extends Error {
  constructor() { super('Rune percentile calculation cancelled.'); this.name = 'PercentileCancelledError'; }
}

type ValueDimension = Readonly<{
  kind: 'prefix' | 'sub';
  statId: number;
  support: IntegerSupport;
}>;

type ReferenceStructure = Readonly<{
  rarity: RuneRarity;
  prefixStatId: number | null;
  dimensions: readonly ValueDimension[];
  mass: Rational;
}>;

const supportCache = new Map<string, IntegerSupport>();
const classSupports: Array<Array<IntegerSupport[] | undefined> | undefined> = [];

function cachedLineRollSupport(initial: RollRange, upgrade: RollRange | null, upgrades: number): IntegerSupport {
  const key = `${initial.minimum}:${initial.maximum}/${upgrade?.minimum ?? '-'}:${upgrade?.maximum ?? '-'}/${upgrades}`;
  const found = supportCache.get(key);
  if (found) return found;
  const support = lineRollSupport(initial, upgrade, upgrades);
  supportCache.set(key, support);
  return support;
}

function referenceRollSupport(stars: number, statId: number, upgrades: number): IntegerSupport {
  const perClass = classSupports[stars] ??= [];
  const perStat = perClass[statId] ??= [];
  if (perStat[upgrades]) return perStat[upgrades];
  const initial = subPropertyRange(stars, statId, 'initial');
  const upgrade = subPropertyRange(stars, statId, 'upgrade');
  if (!initial || !upgrade) throw new RangeError('A canonical reference line interval is missing.');
  return perStat[upgrades] = cachedLineRollSupport(initial, upgrade, upgrades);
}

function makeRune(
  slot: number, stars: number, rarity: RuneRarity, mainStatId: number,
  prefixStatId: number | null, prefixValue: number, lines: RuneSubProperty[],
): Rune {
  return {
    id: 'percentile-reference', setId: 1, setName: 'Energy', slot, stars, ancient: false, rarity,
    level: 12, mainStatId, mainValue: 0, prefixStatId, prefixValue,
    // Final type subsets are already in canonical stat-id order. This body owns
    // the fresh array built for its endpoint, so no clone or second sort is needed.
    subProperties: lines,
    occupiedId: null, obtainedOrder: 0,
  };
}

function supportFromRange(range: RollRange | undefined): IntegerSupport {
  if (!range) throw new RangeError('A canonical rune interval is missing.');
  return cachedLineRollSupport(range, null, 0);
}

function* referenceStructures(slot: number, stars: number, mainStatId: number,
  assumptions: ReferenceAssumptions = {}): Generator<ReferenceStructure> {
  const mains = slotMainProperties[slot];
  if (!mains || !mains.includes(mainStatId)) throw new RangeError('The reading main is not legal in this rune slot.');
  const legalForMain = allStatIds.filter((id) => id !== mainStatId && slotAllowsSubStat(slot, id));
  const mainMass = assumptions.mainProbabilities?.get(mainStatId) ?? rational(1, mains.length);
  const mix = assumptions.rarities ?? runeBirthRarityMasses(slot);

  for (const { rarity, mass: rarityMass } of mix) {
    const born = bornSubPropertyCount(rarity);
    const { adds, rolls } = remainingEvents(0, rarity);
    const terminalCount = born + adds;
    if (terminalCount !== 4) throw new RangeError('A reference birth must finish with four natural lines.');
    const innateMass = assumptions.innateProbability ?? rationalFromDecimal(runeInnateFrequency);
    const innateBranches: Array<{ id: number | null; mass: Rational }> = [
      { id: null, mass: complement(innateMass) },
      ...legalForMain.map((id) => ({ id, mass: divide(innateMass, rational(legalForMain.length)) })),
    ];
    // Conditional on the final four types, every born subset is equally likely.
    // An allocation touching r types permits choose(4-r, born-r) such subsets.
    // Integrating these indistinguishable histories avoids revisiting the same
    // ordinary body; born and added ordinary lines share the initial interval.
    const allocations = compositions(rolls, terminalCount).flatMap((counts) => {
      const touched = counts.filter(count => count > 0).length;
      if (touched > born) return [];
      const fraction = rational(choose(terminalCount - touched, born - touched), choose(terminalCount, born));
      return [{ counts, mass: multiply(rolls === 0 ? ONE : allocationMass(counts, rolls, born), fraction) }];
    });
    for (const innate of innateBranches) {
      if (innate.mass.numerator === BigInt(0) || rarityMass.numerator === BigInt(0) || mainMass.numerator === BigInt(0)) continue;
      const prefixRange = innate.id === null ? null : subPropertyRange(stars, innate.id, 'initial');
      const prefixDimension = innate.id === null ? null : {
        kind: 'prefix' as const, statId: innate.id, support: supportFromRange(prefixRange ?? undefined),
      };
      const available = legalForMain.filter((id) => id !== innate.id);
      if (terminalCount > available.length) throw new RangeError('The canonical birth schedule exceeds the legal type pool.');
      const finalSubsets = combinations(available, terminalCount);
      const subsetMass = rational(1, choose(available.length, terminalCount));
      const structureMass = multiply(mainMass, multiply(rarityMass, multiply(innate.mass, subsetMass)));
      for (const finalIds of finalSubsets) {
        for (const allocation of allocations) {
          const dimensions: ValueDimension[] = [];
          if (prefixDimension) dimensions.push(prefixDimension);
          finalIds.forEach((statId, index) => {
            dimensions.push({
              kind: 'sub', statId,
              support: referenceRollSupport(stars, statId, allocation.counts[index]),
            });
          });
          const mass = multiply(structureMass, allocation.mass);
          yield { rarity, prefixStatId: innate.id, dimensions, mass };
        }
      }
    }
  }
}

type ScoreBox = { low: number | null; high: number | null; mass: Rational };
type Integral = { passed: Rational; unresolved: Rational; nodes: number; boxes: ScoreBox[] };

type TailIndex = { scores: number[]; masses: Rational[] };
type ReferenceIndex = { lower: TailIndex; upper: TailIndex };
type IndexSlot = { index: ReferenceIndex | null };
const indexSlots = new Map<IndexSlot, number>();
const maximumIndexBytes = 64 * 1024 * 1024;
let retainedIndexBytes = 0;
type ReferencePeer = { cohort: string; priceKey: string; prices: Readonly<Record<number, number>>; slot: IndexSlot };
const referencePeers: ReferencePeer[] = [];
const maximumReferencePeers = 128;
// Nearby roles reuse the same roll structures, independently of their prices.
// Keep only the most recently traversed slot/main/class model to bound memory.
let structureCache: { key: string; structures: readonly ReferenceStructure[] } | null = null;

function boundedCanonicalComponents(stars: number): boolean {
  const plan = craftPlan('standard', canonicalCraftCredit);
  return allStatIds.every(statId => {
    const initial = subPropertyRange(stars, statId, 'initial');
    const upgrade = subPropertyRange(stars, statId, 'upgrade');
    if (!initial || !upgrade) return false;
    const largest = Math.max(initial.maximum + 4 * upgrade.maximum + plan.grind[statId],
      plan.gem[statId] + plan.grind[statId]);
    return Number.isSafeInteger(largest) && largest >= 0 && largest < 2 ** 40;
  });
}

function modelCohort(slot: number, stars: number, main: number, assumptions: ReferenceAssumptions): string {
  const massKey = (mass: Rational) => {
    const normalized = rational(mass.numerator, mass.denominator);
    return `${normalized.numerator}/${normalized.denominator}`;
  };
  return JSON.stringify([slot, stars, main,
    [...(assumptions.rarities ?? runeBirthRarityMasses(slot))]
      .sort((left, right) => left.rarity.localeCompare(right.rarity)).map(entry => [entry.rarity, massKey(entry.mass)]),
    massKey(assumptions.innateProbability ?? rationalFromDecimal(runeInnateFrequency)),
    slotMainProperties[slot].map(id => [id, massKey(assumptions.mainProbabilities?.get(id)
      ?? rational(1, slotMainProperties[slot].length))]),
  ]);
}

function retainIndex(slot: IndexSlot, index: ReferenceIndex): void {
  retainedIndexBytes -= indexSlots.get(slot) ?? 0;
  indexSlots.delete(slot);
  const bytes = (index.lower.scores.length + index.upper.scores.length) * 80;
  slot.index = bytes <= maximumIndexBytes ? index : null;
  if (slot.index) { indexSlots.set(slot, bytes); retainedIndexBytes += bytes; }
  while (retainedIndexBytes > maximumIndexBytes) {
    const first = indexSlots.entries().next().value;
    if (!first) break;
    first[0].index = null;
    retainedIndexBytes -= first[1];
    indexSlots.delete(first[0]);
  }
}

async function makeTailIndex(boxes: readonly ScoreBox[], side: 'low' | 'high', signal?: CancellationSignal): Promise<TailIndex> {
  const atoms = new Map<number, bigint>();
  let work = 0;
  let yieldAt = performance.now() + 8;
  const cooperate = async () => {
    if (signal?.aborted) throw new PercentileCancelledError();
    if (performance.now() >= yieldAt) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      yieldAt = performance.now() + 8;
    }
  };
  let denominator = BigInt(1);
  const denominators = new Set<bigint>();
  for (const box of boxes) {
    if (++work % 64 === 0) await cooperate();
    if (!denominators.has(box.mass.denominator)) {
      denominators.add(box.mass.denominator);
      denominator = denominator / gcd(denominator, box.mass.denominator) * box.mass.denominator;
    }
  }
  // A shared integer unit makes prefix accumulation exact without reducing the
  // same small set of denominators again at every one of hundreds of thousands
  // of score endpoints. The public query still returns rational probabilities.
  for (const box of boxes) {
    if (++work % 64 === 0) await cooperate();
    const score = box[side];
    if (score !== null) atoms.set(score, (atoms.get(score) ?? BigInt(0))
      + box.mass.numerator * (denominator / box.mass.denominator));
  }
  // Native numeric sorting avoids a long JavaScript comparator phase between
  // cooperative mass passes; the endpoints themselves remain unchanged.
  const scores = [...Float64Array.from(atoms.keys()).sort().reverse()];
  const masses: Rational[] = [ZERO];
  let numerator = BigInt(0);
  for (const score of scores) {
    if (++work % 64 === 0) await cooperate();
    numerator += atoms.get(score)!;
    masses.push({ numerator, denominator });
  }
  if (signal?.aborted) throw new PercentileCancelledError();
  return { scores, masses };
}

function indexTail(index: TailIndex, cutoff: number): Rational {
  let low = 0;
  let high = index.scores.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.scores[middle] >= cutoff) low = middle + 1;
    else high = middle;
  }
  return index.masses[low];
}

// At the crossing atom the inclusive tail is still above alpha. A floating
// successor expresses the strict side without rounding scores or splitting ties.
function crossingAtom(index: TailIndex, allowance: Rational): number {
  let low = 0;
  let high = index.scores.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(index.masses[middle + 1], allowance) > 0) high = middle;
    else low = middle + 1;
  }
  return index.scores[low] ?? 0;
}

function usefulScore(reading: PercentileReading, body: Rune): number | null {
  const score = reading.score(body);
  if (score === null) return null;
  if (!Number.isFinite(score)) throw new RangeError(`Reading ${reading.id} returned a non-finite score.`);
  return score > 0 ? score : null;
}

function checkEndpoints(low: number | null, high: number | null): void {
  if (low !== null && (high === null || high < low)) {
    throw new RangeError('The shared terminal scorer is not monotone over a legal value interval.');
  }
}

async function integrateStructure(
  options: ReferenceBuildOptions, structure: ReferenceStructure, cutoff: number, budget: { remaining: number; visited: number; yieldAt: number },
  localLimit = Number.POSITIVE_INFINITY,
): Promise<Integral> {
  const { reading, slot, stars, signal } = options;
  const whole = structure.dimensions.map((dimension) => wholeSupport(dimension.support));
  const result: Integral = { passed: ZERO, unresolved: ZERO, nodes: 0, boxes: [] };
  const slices = [...whole];
  const dims = structure.dimensions;
  const firstSub = structure.prefixStatId === null ? 0 : 1;
  const lines = dims.slice(firstSub).map(({ statId }) => ({ statId, value: 0, gemmed: false, grind: 0 }));
  const body = makeRune(slot, stars, structure.rarity, reading.mainStatId, structure.prefixStatId, 0, lines);

  const branchMass = (): Rational => slices.reduce((mass, slice) =>
    slice.mass.numerator === slice.mass.denominator ? mass : multiply(mass, slice.mass), structure.mass);
  const scoreAt = (endpoint: 'low' | 'high'): number | null => {
    // Score callbacks are synchronous and cannot retain a reference body. Reuse
    // its four lines across related endpoints instead of allocating per split.
    body.prefixValue = firstSub ? slices[0][endpoint] : 0;
    for (let line = 0; line < lines.length; line += 1) lines[line].value = slices[line + firstSub][endpoint];
    return usefulScore(reading, body);
  };
  const cooperate = async () => {
    if (signal?.aborted) throw new PercentileCancelledError();
    if (performance.now() >= budget.yieldAt) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      budget.yieldAt = performance.now() + 8;
    }
  };

  const visit = async (): Promise<void> => {
    if (signal?.aborted) throw new PercentileCancelledError();
    result.nodes += 1;
    budget.visited += 1;
    if (budget.visited % 64 === 0) await cooperate();
    const mass = branchMass();
    if (budget.remaining <= 0) {
      result.unresolved = add(result.unresolved, mass);
      result.boxes.push({ low: null, high: Number.POSITIVE_INFINITY, mass });
      return;
    }
    budget.remaining -= 1;

    const lower = scoreAt('low');
    const upper = scoreAt('high');
    checkEndpoints(lower, upper);
    if (lower !== null && lower >= cutoff) {
      result.passed = add(result.passed, mass);
      result.boxes.push({ low: lower, high: upper, mass });
      return;
    }
    if (upper === null || upper < cutoff) {
      result.boxes.push({ low: lower, high: upper, mass });
      return;
    }
    if (result.nodes >= localLimit) {
      result.unresolved = add(result.unresolved, mass);
      result.boxes.push({ low: lower, high: upper, mass });
      return;
    }

    let selected = -1;
    let largestSpan = -1;
    for (let at = 0; at < slices.length; at += 1) {
      const slice = slices[at];
      if (slice.end - slice.start <= 1) continue;
      const slope = Math.max(0, reading.weightsByStatId[dims[at].statId] ?? 0);
      const span = (slice.high - slice.low) * slope;
      if (span > largestSpan) { selected = at; largestSpan = span; }
    }
    if (selected < 0) {
      /* All integer coordinates are fixed; the same shared kernel must return one answer. */
      if (upper >= cutoff) result.passed = add(result.passed, mass);
      result.boxes.push({ low: lower, high: upper, mass });
      return;
    }
    const split = splitSupport(dims[selected].support, slices[selected]);
    if (!split) throw new Error('A splittable percentile interval had no finite midpoint.');
    const prior = slices[selected];
    slices[selected] = split[0];
    await visit();
    slices[selected] = split[1];
    await visit();
    slices[selected] = prior;
  };

  await visit();
  return result;
}

export async function buildReferenceDistribution(options: ReferenceBuildOptions): Promise<ReferenceDistribution> {
  const { slot, stars, reading, signal } = options;
  if (!Number.isInteger(slot) || slot < 1 || slot > 6 || !Number.isInteger(stars) || stars < 1 || stars > 6) {
    throw new RangeError('A reference needs a legal rune slot and star class.');
  }
  if (!reading.id || !Number.isInteger(reading.mainStatId) || !slotMainProperties[slot]?.includes(reading.mainStatId)
    || typeof reading.score !== 'function') {
    throw new RangeError('A percentile reading needs an id, legal main and 0 < alpha <= 1.');
  }
  for (const [statId, weight] of Object.entries(reading.weightsByStatId)) {
    if (!allStatIds.includes(Number(statId)) || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError('A reference reading needs finite nonnegative prices for legal stats.');
    }
  }
  if (allStatIds.some(statId => !Number.isFinite(reading.weightsByStatId[statId])
    || reading.weightsByStatId[statId] < 0)) {
    throw new RangeError('A reference reading must state a finite nonnegative price for every legal rune stat.');
  }
  policyProbability(reading.alpha);
  const assumptions = options.assumptions ?? {};
  const sumMasses = (masses: readonly Rational[]) => masses.reduce(add, ZERO);
  const checkMasses = (masses: readonly Rational[], name: string) => {
    if (masses.some(mass => compare(mass, ZERO) < 0) || compare(sumMasses(masses), ONE) !== 0) {
      throw new RangeError(`${name} must retain a nonnegative total mass of one.`);
    }
  };
  if (assumptions.rarities) {
    const ids = assumptions.rarities.map(entry => entry.rarity);
    if (new Set(ids).size !== ids.length || ids.some(id => !runeRarities.includes(id))) {
      throw new RangeError('A sensitivity rarity mix must name unique legal rarities.');
    }
    checkMasses(assumptions.rarities.map(entry => entry.mass), 'The sensitivity rarity mix');
  }
  if (assumptions.innateProbability && (compare(assumptions.innateProbability, ZERO) < 0
    || compare(assumptions.innateProbability, ONE) > 0)) throw new RangeError('Innate probability must be between zero and one.');
  if (assumptions.mainProbabilities) {
    const legal = slotMainProperties[slot];
    if (assumptions.mainProbabilities.size !== legal.length || legal.some(id => !assumptions.mainProbabilities!.has(id))) {
      throw new RangeError('A sensitivity main model must retain every legal main explicitly.');
    }
    checkMasses([...assumptions.mainProbabilities.values()], 'The sensitivity main model');
  }
  const stateLimit = options.stateLimit ?? 250_000;
  if (!Number.isInteger(stateLimit) || stateLimit < 1) throw new RangeError('The exact state limit must be positive.');
  type TailBounds = { low: Rational; high: Rational };
  type TailAttempt = { allowance: Rational; full: boolean; pending: Promise<TailBounds> };
  const queryCache = new Map<number, TailAttempt>();
  let indexSlot: IndexSlot = { index: null };
  const structureKey = modelCohort(slot, stars, reading.mainStatId, assumptions);
  const cohort = options.canonicalCraft && boundedCanonicalComponents(stars) ? structureKey : null;
  if (cohort) {
    const priceKey = JSON.stringify(allStatIds.filter(id => id !== reading.mainStatId && slotAllowsSubStat(slot, id))
      .map(id => reading.weightsByStatId[id]));
    const identical = referencePeers.find(peer => peer.cohort === cohort && peer.priceKey === priceKey);
    if (identical) indexSlot = identical.slot;
    else {
      referencePeers.push({ cohort, priceKey, prices: { ...reading.weightsByStatId }, slot: indexSlot });
      if (referencePeers.length > maximumReferencePeers) referencePeers.shift();
    }
  }
  const relations = new WeakMap<ReferencePeer, UtilityRelation | null>();
  const compatibleMainMass = assumptions.mainProbabilities?.get(reading.mainStatId)
    ?? rational(BigInt(1), BigInt(slotMainProperties[slot]?.length ?? 1));

  type Boundary = Readonly<{ failsAt: number; passesAt: number }>;
  const boundaries = new Map<string, Boundary>();
  let preparedIndex: Promise<ReferenceIndex> | undefined;
  const prepareIndex = async (): Promise<ReferenceIndex> => {
    const knownStructures = structureCache?.key === structureKey ? structureCache.structures : null;
    const newStructures: ReferenceStructure[] = [];
    const boxes: ScoreBox[] = [];
    const counts = new Map<bigint, bigint>();
    const lines = Array.from({ length: 4 }, () => ({ statId: 0, value: 0, gemmed: false, grind: 0 }));
    const body = makeRune(slot, stars, 'Normal', reading.mainStatId, null, 0, lines);
    let yieldAt = performance.now() + 8;
    let exhausted = true;
    for (const structure of knownStructures ?? referenceStructures(slot, stars, reading.mainStatId, assumptions)) {
      if (signal?.aborted) throw new PercentileCancelledError();
      if (boxes.length === stateLimit) {
        exhausted = false;
        break;
      }
      if (boxes.length % 64 === 0 && performance.now() >= yieldAt) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (signal?.aborted) throw new PercentileCancelledError();
        yieldAt = performance.now() + 8;
      }
      if (!knownStructures) newStructures.push(structure);
      body.rarity = structure.rarity;
      body.prefixStatId = structure.prefixStatId;
      const { dimensions, mass } = structure;
      const firstSub = structure.prefixStatId === null ? 0 : 1;
      const prefix = firstSub ? dimensions[0].support.values : undefined;
      body.prefixValue = prefix?.[0] ?? 0;
      for (let at = 0; at < lines.length; at += 1) {
        const dimension = dimensions[firstSub + at];
        lines[at].statId = dimension.statId;
        lines[at].value = dimension.support.values[0];
      }
      const low = usefulScore(reading, body);
      body.prefixValue = prefix?.[prefix.length - 1] ?? 0;
      for (let at = 0; at < lines.length; at += 1) {
        const values = dimensions[firstSub + at].support.values;
        lines[at].value = values[values.length - 1];
      }
      const high = usefulScore(reading, body);
      checkEndpoints(low, high);
      boxes.push({ low, high, mass });
      counts.set(mass.denominator, (counts.get(mass.denominator) ?? BigInt(0)) + mass.numerator);
    }
    let visitedMass = ZERO;
    for (const [denominator, numerator] of counts) visitedMass = add(visitedMass, rational(numerator, denominator));
    const unseen = subtract(compatibleMainMass, visitedMass);
    if (compare(unseen, ZERO) < 0 || (exhausted && compare(unseen, ZERO) !== 0)) {
      throw new RangeError('Synthetic birth structure masses do not match the compatible-main population.');
    }
    if (compare(unseen, ZERO) > 0) boxes.push({ low: null, high: Infinity, mass: unseen });
    else if (!knownStructures) structureCache = { key: structureKey, structures: newStructures };
    const index = { lower: await makeTailIndex(boxes, 'low', signal), upper: await makeTailIndex(boxes, 'high', signal) };
    retainIndex(indexSlot, index);
    return index;
  };

  const qualityBoundary = async (alpha: PolicyProbability): Promise<Boundary> => {
    if (signal?.aborted) throw new PercentileCancelledError();
    const allowance = policyProbability(alpha);
    if (compare(allowance, compatibleMainMass) >= 0) return { failsAt: 0, passesAt: Number.MIN_VALUE };
    const key = `${allowance.numerator}/${allowance.denominator}`;
    const known = boundaries.get(key);
    if (known) return known;
    const startPreparation = () => {
      const started = performance.now();
      return prepareIndex().finally(() => {
        preparedIndex = undefined;
        options.onQualityPreparation?.(performance.now() - started);
      });
    };
    const index = indexSlot.index ?? await (preparedIndex ??= startPreparation());
    const failsAt = crossingAtom(index.lower, allowance);
    const passesAt = nextUp(crossingAtom(index.upper, allowance));
    if (failsAt >= passesAt) throw new RangeError('The certified quality boundary is inverted.');
    const result = { failsAt, passesAt };
    if (boundaries.size >= 32) boundaries.delete(boundaries.keys().next().value!);
    boundaries.set(key, result);
    return result;
  };

  const queryTail = async (cutoff: number, allowance: Rational, full: boolean, onlyCached: boolean): Promise<TailBounds> => {
    if (signal?.aborted) throw new PercentileCancelledError();
    if (!Number.isFinite(cutoff) || cutoff <= 0) throw new RangeError('A useful-score tail cutoff must be finite and positive.');
    const cached = queryCache.get(cutoff);
    let previous: TailBounds | undefined;
    if (cached) {
      const bounds = previous = await cached.pending;
      if (signal?.aborted) throw new PercentileCancelledError();
      if (compare(bounds.low, bounds.high) === 0 || (!onlyCached && ((!full && (compare(bounds.high, allowance) <= 0
        || compare(bounds.low, allowance) > 0)) || cached.full
        || (!full && compare(cached.allowance, allowance) === 0)))) return bounds;
    }
    const intersect = (bounds: TailBounds): TailBounds => {
      if (!previous) return bounds;
      const low = compare(previous.low, bounds.low) > 0 ? previous.low : bounds.low;
      const high = compare(previous.high, bounds.high) < 0 ? previous.high : bounds.high;
      if (compare(low, high) > 0) throw new RangeError('Certified tails for the same reference disagree.');
      return { low, high };
    };
    if (!full && indexSlot.index) {
      const index = indexSlot.index;
      const low = indexTail(index.lower, cutoff);
      const high = indexTail(index.upper, cutoff);
      if (compare(high, allowance) <= 0 || compare(low, allowance) > 0) {
        const bytes = indexSlots.get(indexSlot);
        if (bytes !== undefined) { indexSlots.delete(indexSlot); indexSlots.set(indexSlot, bytes); }
        if (!onlyCached) return intersect({ low, high });
      }
      if (onlyCached) previous = intersect({ low, high });
    }
    if (!full && cohort) {
      const legal = allStatIds.filter(id => id !== reading.mainStatId && slotAllowsSubStat(slot, id));
      const peers = referencePeers.flatMap(peer => {
        if (peer.cohort !== cohort || peer.slot === indexSlot || !peer.slot.index) return [];
        if (!relations.has(peer)) relations.set(peer, canonicalUtilityRelation(peer.prices, reading.weightsByStatId, legal));
        const relation = relations.get(peer);
        return relation ? [{ peer, relation }] : [];
      });
      const selected = new Set([
        ...peers.filter(entry => entry.relation.lower).sort((left, right) =>
          compare(right.relation.lower!.factor, left.relation.lower!.factor)).slice(0, 3),
        ...peers.filter(entry => entry.relation.upper).sort((left, right) =>
          compare(left.relation.upper!.factor, right.relation.upper!.factor)).slice(0, 3),
      ]);
      let low = ZERO;
      let high = compatibleMainMass;
      for (const { peer, relation } of selected) {
        const sufficient = sufficientOldScore(relation, cutoff);
        if (sufficient !== null && Number.isFinite(sufficient)) {
          const bound = indexTail(peer.slot.index!.lower, sufficient);
          if (compare(bound, low) > 0) low = bound;
        }
        const necessary = necessaryOldScore(relation, cutoff);
        if (necessary !== null && necessary > 0) {
          const bound = indexTail(peer.slot.index!.upper, necessary);
          if (compare(bound, high) < 0) high = bound;
        }
      }
      if (compare(low, high) > 0) throw new RangeError('Canonical reference utility bounds disagree.');
      if (!onlyCached && (compare(high, allowance) <= 0 || compare(low, allowance) > 0)) return intersect({ low, high });
      if (onlyCached) previous = intersect({ low, high });
    }
    if (onlyCached) return previous ?? { low: ZERO, high: compatibleMainMass };
    const running = (async () => {
      const budget = { remaining: stateLimit, visited: 0, yieldAt: performance.now() + 8 };
      let passed = ZERO;
      let unresolved = compatibleMainMass;
      const uncertain: Array<{ structure: ReferenceStructure; passed: Rational; unresolved: Rational }> = [];
      const partition = new Map<ReferenceStructure, ScoreBox[]>();
      let visitedMass = ZERO;
      const knownStructures = structureCache?.key === structureKey ? structureCache.structures : null;
      const newStructures: ReferenceStructure[] = [];
      let allStructuresVisited = true;
      for (const structure of knownStructures ?? referenceStructures(slot, stars, reading.mainStatId, assumptions)) {
        if (signal?.aborted) throw new PercentileCancelledError();
        if (budget.remaining <= 0) {
          allStructuresVisited = false;
          /* Later structures remain in `unresolved` from the initial compatible mass. */
          break;
        }
        if (!knownStructures) newStructures.push(structure);
        // Give every legal type/allocation an endpoint reading before refining
        // wide values in one early structure. A depth-first cold query can spend
        // its entire budget on the first flat HP interval and learn almost
        // nothing about the rest of the original-drop denominator.
        const outcome = await integrateStructure(options, structure, cutoff, budget, 1);
        visitedMass = add(visitedMass, structure.mass);
        partition.set(structure, outcome.boxes);
        passed = add(passed, outcome.passed);
        unresolved = add(subtract(unresolved, structure.mass), outcome.unresolved);
        if (outcome.unresolved.numerator > BigInt(0)) uncertain.push({
          structure, passed: outcome.passed, unresolved: outcome.unresolved,
        });
      }
      if (allStructuresVisited && !knownStructures) structureCache = { key: structureKey, structures: newStructures };
      if (compare(visitedMass, compatibleMainMass) > 0 || (allStructuresVisited && compare(visitedMass, compatibleMainMass) !== 0)) {
        throw new RangeError('Synthetic birth structure masses do not match the compatible-main population.');
      }
      const needsProof = () => full || (compare(passed, allowance) <= 0 && compare(add(passed, unresolved), allowance) > 0);
      if (needsProof()) uncertain.sort((left, right) => compare(right.unresolved, left.unresolved));
      for (let at = 0; at < uncertain.length && budget.remaining > 0 && needsProof(); at += 1) {
        const previous = uncertain[at];
        const structure = previous.structure;
        const fairShare = Math.max(3, Math.floor(budget.remaining / (uncertain.length - at)));
        const outcome = await integrateStructure(options, structure, cutoff, budget, fairShare);
        partition.set(structure, outcome.boxes);
        passed = add(subtract(passed, previous.passed), outcome.passed);
        unresolved = add(subtract(unresolved, previous.unresolved), outcome.unresolved);
      }
      const boxes = [...partition.values()].flat();
      const unvisited = subtract(compatibleMainMass, visitedMass);
      if (unvisited.numerator > BigInt(0)) boxes.push({ low: null, high: Number.POSITIVE_INFINITY, mass: unvisited });
      // The index preserves actual shared-kernel endpoints. It introduces no
      // rounded score buckets and answers other cutoffs only with certified tails.
      const lowerIndex = await makeTailIndex(boxes, 'low', signal);
      const upperIndex = await makeTailIndex(boxes, 'high', signal);
      retainIndex(indexSlot, { lower: lowerIndex, upper: upperIndex });
      /* Main mass that cannot match this reading is a known failure, not an unknown tail. */
      return intersect({ low: passed, high: add(passed, unresolved) });
    })();
    const attempt = { allowance, full, pending: running };
    queryCache.set(cutoff, attempt);
    if (queryCache.size > 512) queryCache.delete(queryCache.keys().next().value!);
    try { return await running; } catch (error) {
      if (queryCache.get(cutoff) === attempt) queryCache.delete(cutoff);
      throw error;
    }
  };

  return {
    slot, stars, readingId: reading.id,
    qualityBoundary: options.prepareQualityBoundary ? qualityBoundary : undefined,
    async query(cutoff, alpha, precision = 'decision'): Promise<ReferenceTail> {
      const allowance = policyProbability(alpha);
      const { low, high } = await queryTail(cutoff, allowance, precision === 'full', precision === 'cached');
      const tail = probabilityBounds(low, high);
      const rank = percentileRankBounds(low, high);
      const passes = compare(high, allowance) <= 0 ? true : compare(low, allowance) > 0 ? false : null;
      return { status: compare(low, high) === 0 ? 'complete' : 'incomplete', cutoff, tail, rank, passes };
    },
  };
}

/** Useful in independent oracles: the exact transition mix for ordinary rune births. */
export function referenceRarityMasses(slot: number): readonly Readonly<{ rarity: RuneRarity; mass: Rational }>[] {
  return runeBirthRarityMasses(slot);
}
