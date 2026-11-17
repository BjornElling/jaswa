import { allStatIds, addedSubPropertyRange, bornSubPropertyCount, remainingEvents, slotMainProperties, subPropertyRange } from '../rune-properties';
import { isGrindableStatId } from '../craft/rune-craft-end-state';
import type { Rune, RuneSubProperty } from '../runes';
import { slotAllowsSubStat } from '../runes';
import {
  add, compare, expectedUtilityBounds, multiply, ONE, percentileRankBounds, policyProbability, probabilityBounds,
  rational, rationalFromNumber, subtract, ZERO,
} from './probability';
import type { PercentileRankBounds, PolicyProbability, Rational } from './probability';
import {
  allocationMass, choose, combinations, compositions, lineRollSupport, splitSupport, uniformIntegerSupport, wholeSupport,
} from './finite-support';
import type { IntegerSupport, SupportSlice } from './finite-support';
import type {
  CancellationSignal, PercentileReading, ReferenceDistribution, ReferenceTail, ReadingFutureResult, RuneFutureResult,
} from './percentile-types';
import { PercentileCancelledError } from './reference-distribution';
import { canonicalExpectedUtility } from './expected-utility';

export type RuneFutureOptions = Readonly<{
  rune: Rune;
  readings: readonly PercentileReading[];
  references: ReadonlyMap<string, ReferenceDistribution>;
  stateLimit?: number;
  signal?: CancellationSignal;
  decisionOnly?: boolean;
  /** Use already available certified reference bounds for display-only rank queries. */
  cachedRank?: boolean;
  stopOnUnionProof?: boolean;
  /** In decision-only or proof mode an established passing union can stop the search. */
  unionRequirement?: PolicyProbability;
  includeExpectedUtility?: boolean;
}>;

type FutureDimension = Readonly<{
  statId: number;
  support: IntegerSupport;
  template: RuneSubProperty;
}>;

type FutureStructure = Readonly<{
  dimensions: readonly FutureDimension[];
  mass: Rational;
}>;

function validRune(rune: Rune): string | null {
  if (!Number.isInteger(rune.slot) || rune.slot < 1 || rune.slot > 6
    || !Number.isInteger(rune.stars) || rune.stars < 1 || rune.stars > 6
    || typeof rune.ancient !== 'boolean' || (rune.ancient && rune.stars !== 6)
    || !Number.isInteger(rune.level) || rune.level < 0 || rune.level > 15
    || !['Normal', 'Magic', 'Rare', 'Hero', 'Legend'].includes(rune.rarity)
    || !Number.isSafeInteger(rune.mainValue) || rune.mainValue < 0
    || !slotMainProperties[rune.slot]?.includes(rune.mainStatId)) return 'Rune slot, stars, lineage, level or main is outside the supported contract.';
  if (rune.prefixStatId !== null) {
    if (!allStatIds.includes(rune.prefixStatId) || !slotAllowsSubStat(rune.slot, rune.prefixStatId)
      || rune.prefixStatId === rune.mainStatId || !Number.isSafeInteger(rune.prefixValue) || rune.prefixValue <= 0) {
      return 'The rune has an illegal innate property.';
    }
  } else if (rune.prefixValue !== 0) return 'A rune without an innate must have zero innate value.';
  if (!Array.isArray(rune.subProperties) || rune.subProperties.length > 4) return 'The rune has an invalid sub-property count.';
  const seen = new Set<number>([rune.mainStatId]);
  if (rune.prefixStatId !== null) seen.add(rune.prefixStatId);
  let converted = 0;
  let recordedUpgrades = 0;
  const { adds, rolls } = remainingEvents(rune.level, rune.rarity);
  const completedUpgrades = bornSubPropertyCount(rune.rarity) - rolls;
  for (const line of rune.subProperties) {
    if (!line || !allStatIds.includes(line.statId) || !slotAllowsSubStat(rune.slot, line.statId) || seen.has(line.statId)
      || !Number.isSafeInteger(line.value) || line.value <= 0
      || !Number.isSafeInteger(line.grind) || line.grind < 0
      || !Number.isSafeInteger(line.value + line.grind)
      || typeof line.gemmed !== 'boolean') return 'A rune sub-property is malformed or conflicts with its main or innate.';
    if (line.grind > 0 && !isGrindableStatId(line.statId)) return 'A Grindstone is recorded on an ungrindable sub-property.';
    if (line.gemmed) converted += 1;
    if (line.rolls !== undefined) {
      if (!Number.isInteger(line.rolls) || line.rolls < 0 || line.rolls > completedUpgrades) return 'A recorded upgrade count is invalid.';
      recordedUpgrades += line.rolls;
    }
    seen.add(line.statId);
  }
  if (converted > 1 || (converted > 0 && rune.level < 12)) return 'The rune has an illegal conversion marker or level.';
  if (recordedUpgrades > completedUpgrades) return 'Recorded upgrade counts exceed the rune’s completed upgrades.';
  if (rune.subProperties.length + adds !== 4) {
    return 'The rune sub-property count does not match its rarity and remaining event schedule.';
  }
  if (rolls > 0 && rune.subProperties.length === 0) return 'The rune has upgrades remaining but no line to receive them.';
  return null;
}

function* candidateStructures(rune: Rune): Generator<FutureStructure> {
  const { rolls: upgrades, adds: additions } = remainingEvents(rune.level, rune.rarity);
  const held = [...rune.subProperties].sort((left, right) => left.statId - right.statId);
  const pool = allStatIds.filter((statId) => statId !== rune.mainStatId && statId !== rune.prefixStatId
    && !held.some((line) => line.statId === statId) && slotAllowsSubStat(rune.slot, statId));
  if (additions > pool.length) throw new RangeError('The remaining addition count exceeds the legal unused effect ids.');
  const addedSets = combinations(pool, additions);
  if (addedSets.length === 0) throw new RangeError('The remaining additions have no legal type combination.');
  const additionMass = rational(1, choose(pool.length, additions));
  const rollSupports = new Map<RuneSubProperty, Map<number, IntegerSupport>>();
  const additionSupports = new Map<number, IntegerSupport>();

  for (const allocation of compositions(upgrades, held.length)) {
    const upgradeMass = upgrades === 0 ? ONE : allocationMass(allocation, upgrades, held.length);
    for (const added of addedSets) {
      const dimensions: FutureDimension[] = [];
      held.forEach((line, index) => {
        const count = allocation[index];
        let byCount = rollSupports.get(line);
        if (!byCount) { byCount = new Map(); rollSupports.set(line, byCount); }
        let support = byCount.get(count);
        if (!support) {
          const upgrade = subPropertyRange(rune.stars, line.statId, 'upgrade');
          if (count > 0 && !upgrade) throw new RangeError(`No upgrade interval exists for stat ${line.statId}.`);
          support = lineRollSupport({ minimum: 0, maximum: 0 }, upgrade ?? null, count, line.value);
          byCount.set(count, support);
        }
        dimensions.push({
          statId: line.statId,
          support,
          template: { ...line, rolls: line.rolls === undefined ? undefined : line.rolls + count },
        });
      });
      for (const statId of added) {
        let support = additionSupports.get(statId);
        if (!support) {
          const initial = addedSubPropertyRange(rune.stars, statId);
          if (!initial) throw new RangeError(`No addition interval exists for stat ${statId}.`);
          support = uniformIntegerSupport(initial);
          additionSupports.set(statId, support);
        }
        dimensions.push({
          statId,
          support,
          template: { statId, value: 0, gemmed: false, grind: 0, rolls: 0 },
        });
      }
      dimensions.sort((left, right) => left.statId - right.statId);
      if (dimensions.length !== 4) throw new RangeError('A legal rune future must terminate with four sub-properties.');
      yield { dimensions, mass: multiply(upgradeMass, additionMass) };
    }
  }
}

function terminalBody(rune: Rune, structure: FutureStructure, values: readonly number[]): Rune {
  const subProperties = structure.dimensions.map((dimension, at) => ({ ...dimension.template, value: values[at] }));
  return { ...rune, level: 15, subProperties };
}

type DecisionCache = {
  failsAt: number;
  passesAt: number;
};

const referenceDecisions = new WeakMap<object, Map<string, DecisionCache>>();

function decisionCache(reference: ReferenceDistribution, allowanceKey: string): DecisionCache {
  const identity = reference.decisionIdentity ?? reference;
  let policies = referenceDecisions.get(identity);
  if (!policies) {
    policies = new Map();
    referenceDecisions.set(identity, policies);
  }
  let cache = policies.get(allowanceKey);
  if (!cache) {
    cache = { failsAt: 0, passesAt: Infinity };
    policies.set(allowanceKey, cache);
  }
  return cache;
}

type Utility = {
  reading: PercentileReading;
  maximum: number;
  expectedLow: Rational;
  expectedHigh: Rational;
};

type Decision = {
  utility: number;
  reference: ReferenceDistribution;
  allowance: Rational;
  cache: DecisionCache;
  unresolved: Set<number>;
  potential: ReadingFutureResult['potential'];
  success: Rational;
  unknown: Rational;
};

type PreparedFuture = {
  structure: FutureStructure;
  body: Rune;
  supports: IntegerSupport[];
  slices: SupportSlice[];
  high: number[];
};

function knownDecision(cache: DecisionCache, score: number): boolean | null {
  if (score <= cache.failsAt) return false;
  if (score >= cache.passesAt) return true;
  return null;
}

async function queryDecision(decision: Decision, score: number, precision: 'decision' | 'cached' = 'decision'): Promise<ReferenceTail> {
  const { cache } = decision;
  const tail = await decision.reference.query(score, decision.allowance, precision);
  if (tail.passes === true) cache.passesAt = Math.min(score, cache.passesAt);
  if (tail.passes === false) cache.failsAt = Math.max(score, cache.failsAt);
  if (cache.failsAt >= cache.passesAt) throw new RangeError('Decisions for the same reference and allowance disagree.');
  if (tail.passes === null && precision === 'decision') decision.unresolved.add(score);
  return tail;
}

function terminalScore(reading: PercentileReading, body: Rune): number {
  const score = reading.score(body);
  if (score === null) return 0;
  if (!Number.isFinite(score) || score < 0) throw new RangeError('Reading ' + reading.id + ' returned an invalid score.');
  return score;
}

function compareRank(left: PercentileRankBounds['lowFraction'], right: PercentileRankBounds['lowFraction']): number {
  return compare(
    rational(BigInt(left.numerator), BigInt(left.denominator)),
    rational(BigInt(right.numerator), BigInt(right.denominator)),
  );
}

const unranked = percentileRankBounds(ZERO, ONE);

export async function solveRuneFuture(options: RuneFutureOptions): Promise<RuneFutureResult> {
  const { rune, readings, references, signal, decisionOnly } = options;
  const includeExpectedUtility = !decisionOnly && (options.includeExpectedUtility ?? true);
  const invalid = (diagnostic: string): RuneFutureResult => ({
    status: 'invalid', unionChance: null, readings: [], potentialWitness: null, diagnostic,
  });
  const diagnostic = validRune(rune);
  if (diagnostic) return invalid(diagnostic);

  const stateLimit = options.stateLimit ?? 250_000;
  if (!Number.isInteger(stateLimit) || stateLimit < 1) return invalid('The exact state limit must be positive.');
  let unionRequirement: Rational | undefined;
  if ((decisionOnly || options.stopOnUnionProof) && options.unionRequirement !== undefined) {
    try { unionRequirement = policyProbability(options.unionRequirement); } catch {
      return invalid('The union Chance requirement is invalid.');
    }
  }

  const utilities: Utility[] = [];
  const utilityIds = new Map<PercentileReading | string, number>();
  const decisions: Decision[] = [];
  const decisionIds = new Map<DecisionCache, Map<number, number>>();
  const byReading = new Map<string, number>();
  const ids = new Set<string>();
  for (const reading of readings) {
    if (!reading.id || ids.has(reading.id)) return invalid('Percentile reading identities must be nonempty and unique.');
    ids.add(reading.id);
    if (typeof reading.permitted !== 'boolean') return invalid('A percentile reading must state whether it is permitted.');
    if (!reading.permitted) continue;
    let allowance: Rational;
    try { allowance = policyProbability(reading.alpha); } catch {
      return invalid('Reading ' + reading.id + ' has an invalid allowance.');
    }
    if (!slotMainProperties[rune.slot]?.includes(reading.mainStatId)) {
      return invalid('Reading ' + reading.id + ' names a main that is illegal in this slot.');
    }
    if (reading.mainStatId !== rune.mainStatId) continue;
    for (const [statIdText, weight] of Object.entries(reading.weightsByStatId)) {
      if (!allStatIds.includes(Number(statIdText)) || !Number.isFinite(weight) || weight < 0) {
        return invalid('Reading ' + reading.id + ' has an invalid weight.');
      }
    }
    if (allStatIds.some((statId) => !Number.isFinite(reading.weightsByStatId[statId]) || reading.weightsByStatId[statId] < 0)) {
      return invalid('Reading ' + reading.id + ' must provide a finite nonnegative slope for every rune effect id.');
    }
    const reference = references.get(reading.id);
    if (!reference) return invalid('Reading ' + reading.id + ' has no matching reference distribution.');
    if (reference.readingId !== reading.id || reference.slot !== rune.slot || reference.stars !== rune.stars) {
      return invalid('Reading ' + reading.id + ' has a reference for a different slot or star class.');
    }

    const utilityKey = reading.utilityKey ?? reading;
    let utility = utilityIds.get(utilityKey);
    if (utility === undefined) {
      utility = utilities.length;
      utilityIds.set(utilityKey, utility);
      utilities.push({ reading, maximum: 0, expectedLow: ZERO, expectedHigh: ZERO });
    }
    const cache = decisionCache(reference, allowance.numerator + '/' + allowance.denominator);
    if (compare(allowance, ONE) === 0) cache.passesAt = Number.MIN_VALUE;
    let utilityDecisions = decisionIds.get(cache);
    if (!utilityDecisions) { utilityDecisions = new Map(); decisionIds.set(cache, utilityDecisions); }
    let decision = utilityDecisions.get(utility);
    if (decision === undefined) {
      decision = decisions.length;
      utilityDecisions.set(utility, decision);
      decisions.push({ utility, reference, allowance, cache, unresolved: new Set(), potential: null, success: ZERO, unknown: ZERO });
    }
    byReading.set(reading.id, decision);
  }

  const emptyReading = (reading: PercentileReading): ReadingFutureResult => ({
    id: reading.id, status: 'complete', chance: probabilityBounds(ZERO), potential: null,
  });
  if (decisions.length === 0) {
    return { status: 'unusable', unionChance: probabilityBounds(ZERO), readings: readings.map(emptyReading), potentialWitness: null };
  }

  let remainingStates = stateLimit;
  const utilityWork = utilities.map(() => Math.max(32, Math.floor(10_000 / utilities.length)));
  let visited = 0;
  let unionPass = ZERO;
  let unionUnknown = ZERO;
  let remainingMass = ONE;
  const orderedDecisions = decisions.map((_, index) => index);
  let lastYieldAt = Date.now();
  const cooperate = async () => {
    if (signal?.aborted) throw new PercentileCancelledError();
    if (Date.now() - lastYieldAt >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) throw new PercentileCancelledError();
      lastYieldAt = Date.now();
    }
  };

  const processStructure = async (future: PreparedFuture) => {
    const { structure, body, supports, slices } = future;
    const totals = supports.reduce((product, support) => product * support.total, BigInt(1));
    const passes = decisions.map(() => BigInt(0));
    const unknowns = decisions.map(() => BigInt(0));
    let unionPassCount = BigInt(0);
    let unionUnknownCount = BigInt(0);
    const contribution = (count: bigint) => multiply(structure.mass, rational(count, totals));
    let unionProven = false;

    const endpoint = (scores: number[], utility: number, high: boolean): number => {
      if (scores[utility] !== undefined) return scores[utility];
      for (let at = 0; at < slices.length; at += 1) body.subProperties[at].value = high ? slices[at].high : slices[at].low;
      const score = terminalScore(utilities[utility].reading, body);
      scores[utility] = score;
      return score;
    };

    const visit = async (count: bigint, candidates: readonly number[], unionPassed: boolean, low: number[], high: number[]) => {
      if (signal?.aborted) throw new PercentileCancelledError();
      if (++visited % 32 === 0) await cooperate();
      let passed = unionPassed;
      const unsettled: number[] = [];
      if (!unionProven && remainingStates > 0) {
        remainingStates -= 1;
        for (const index of candidates) {
          const decision = decisions[index];
          const { utility, cache } = decision;
          if (knownDecision(cache, utilities[utility].maximum) === false) continue;
          if (unionProven) {
            unsettled.push(index);
            continue;
          }
          const scoreHigh = endpoint(high, utility, true);
          let upper = knownDecision(cache, scoreHigh);
          if (upper === false) continue;
          const scoreLow = endpoint(low, utility, false);
          if (scoreLow > scoreHigh) throw new RangeError('Reading ' + utilities[utility].reading.id + ' is not monotone over a legal future interval.');
          let lower = knownDecision(cache, scoreLow);
          if (lower === null && !decision.unresolved.has(scoreLow)) lower = (await queryDecision(decision, scoreLow)).passes;
          if (lower !== true && upper === null) {
            upper = knownDecision(cache, scoreHigh);
            if (upper === null && !decision.unresolved.has(scoreHigh)) upper = (await queryDecision(decision, scoreHigh)).passes;
          }
          if (lower === true) {
            if (!passed && unionRequirement) {
              unionProven = compare(add(unionPass, contribution(unionPassCount + count)), unionRequirement) >= 0;
            }
            passed = true;
            passes[index] += count;
          } else if (upper !== false) {
            unsettled.push(index);
          }
        }
      } else {
        for (const index of candidates) {
          const { cache, utility } = decisions[index];
          if (knownDecision(cache, utilities[utility].maximum) !== false) unsettled.push(index);
        }
      }

      let splitAt = -1;
      let largestSpan = -1;
      if (!unionProven && remainingStates > 0 && unsettled.some((index) => {
        const { utility } = decisions[index];
        return low[utility] !== high[utility];
      })) {
        for (let at = 0; at < slices.length; at += 1) {
          const slice = slices[at];
          if (slice.end - slice.start <= 1) continue;
          let slope = 0;
          for (const index of unsettled) {
            const utility = decisions[index].utility;
            if (low[utility] !== high[utility]) {
              slope = Math.max(slope, utilities[utility].reading.weightsByStatId[structure.dimensions[at].statId]);
            }
          }
          const span = slope * (slice.high - slice.low);
          if (span > largestSpan) { largestSpan = span; splitAt = at; }
        }
      }
      if (splitAt >= 0) {
        const prior = slices[splitAt];
        const support = supports[splitAt];
        const [left, right] = splitSupport(support, prior)!;
        const otherCount = count / (support.prefix[prior.end] - support.prefix[prior.start]);
        const leftCount = otherCount * (support.prefix[left.end] - support.prefix[left.start]);
        slices[splitAt] = left;
        await visit(leftCount, unsettled, passed, low, []);
        slices[splitAt] = right;
        await visit(count - leftCount, unsettled, passed, [], high);
        slices[splitAt] = prior;
        return;
      }

      if (passed) unionPassCount += count;
      else if (unsettled.length > 0) unionUnknownCount += count;
      for (const index of unsettled) unknowns[index] += count;
    };

    const fixed = slices.every((slice) => slice.low === slice.high);
    await visit(totals, orderedDecisions, false, fixed ? future.high : [], future.high);
    if (unionPassCount > BigInt(0)) unionPass = add(unionPass, contribution(unionPassCount));
    if (unionUnknownCount > BigInt(0)) unionUnknown = add(unionUnknown, contribution(unionUnknownCount));
    for (let index = 0; index < decisions.length; index += 1) {
      const decision = decisions[index];
      if (passes[index] > BigInt(0)) decision.success = add(decision.success, contribution(passes[index]));
      if (unknowns[index] > BigInt(0)) decision.unknown = add(decision.unknown, contribution(unknowns[index]));
    }
  };

  try {
    let mass = ZERO;
    const futures: PreparedFuture[] = [];
    for (const structure of candidateStructures(rune)) {
      await cooperate();
      mass = add(mass, structure.mass);
      const supports = structure.dimensions.map(({ support }) => support);
      const slices = supports.map(wholeSupport);
      const body = terminalBody(rune, structure, slices.map((slice) => slice.high));
      const high = utilities.map((utility) => {
        const score = terminalScore(utility.reading, body);
        utility.maximum = Math.max(utility.maximum, score);
        return score;
      });
      if (includeExpectedUtility) {
        const lowBody = slices.some((slice) => slice.low !== slice.high)
          ? terminalBody(rune, structure, slices.map((slice) => slice.low)) : null;
        const work = supports.reduce((sum, support) => sum + support.values.length, 0);
        for (let index = 0; index < utilities.length; index += 1) {
          const utility = utilities[index];
          const low = lowBody ? terminalScore(utility.reading, lowBody) : high[index];
          if (low > high[index]) throw new RangeError('Reading ' + utility.reading.id + ' is not monotone over a legal future interval.');
          if (high[index] === 0) continue;
          let lower = rationalFromNumber(low);
          let upper = rationalFromNumber(high[index]);
          if (low < high[index] && utilityWork[index] >= work && utility.reading.utilityLineComponents && utility.reading.utilityPrefix) {
            [lower, upper] = canonicalExpectedUtility(utility.reading, body, supports, lower, upper);
            utilityWork[index] -= work;
            if (compare(lower, upper) > 0) throw new RangeError('Canonical expected utility disagrees with terminal scores.');
          }
          utility.expectedLow = add(utility.expectedLow, multiply(lower, structure.mass));
          utility.expectedHigh = add(utility.expectedHigh, multiply(upper, structure.mass));
          if (index % 16 === 15) await cooperate();
        }
      }
      futures.push({ structure, body, supports, slices, high });
    }
    if (compare(mass, ONE) !== 0) throw new RangeError('Future structure masses must sum to one.');

    if (unionRequirement) {
      const priority = (index: number) => {
        const { reading, maximum } = utilities[decisions[index].utility];
        const ceiling = reading.efficiencyCeiling;
        return ceiling !== undefined && Number.isFinite(ceiling) && ceiling > 0 ? maximum / ceiling : 0;
      };
      orderedDecisions.sort((left, right) => priority(right) - priority(left));
      futures.sort((left, right) => compare(right.structure.mass, left.structure.mass));
    }

    for (const decision of decisions) {
      const score = utilities[decision.utility].maximum;
      if (score <= 0) continue;
      // Every structure contributes to this maximum, even if its Chance box
      // later runs out of states. Only the final maximum needs a rank query.
      await cooperate();
      const rank = decisionOnly || options.cachedRank ? unranked : (await queryDecision(decision, score)).rank;
      decision.potential = { score, rank };
    }
    for (const future of futures) {
      await cooperate();
      if (unionRequirement && compare(unionPass, unionRequirement) >= 0) break;
      await processStructure(future);
      remainingMass = subtract(remainingMass, future.structure.mass);
    }
    if (!decisionOnly && options.cachedRank) {
      for (const decision of decisions) {
        const score = utilities[decision.utility].maximum;
        if (score <= 0) continue;
        await cooperate();
        decision.potential = { score, rank: (await queryDecision(decision, score, 'cached')).rank };
      }
    }
  } catch (error) {
    if (error instanceof PercentileCancelledError || signal?.aborted) return {
      status: 'incomplete', unionChance: probabilityBounds(unionPass, ONE), readings: [], potentialWitness: null,
      diagnostic: 'The percentile calculation was cancelled before it could settle the answer.',
    };
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }

  const unionHigh = add(add(unionPass, unionUnknown), remainingMass);
  const expectedUtilities = !includeExpectedUtility ? [] : utilities.map((utility) => expectedUtilityBounds(utility.expectedLow, utility.expectedHigh));
  const readingResults = readings.map((reading): ReadingFutureResult => {
    const index = byReading.get(reading.id);
    if (index === undefined) return emptyReading(reading);
    const decision = decisions[index];
    const { success, unknown, cache, potential } = decision;
    const high = knownDecision(cache, utilities[decision.utility].maximum) === false
      ? success : add(add(success, unknown), remainingMass);
    return {
      id: reading.id,
      status: compare(success, high) === 0 ? 'complete' : 'incomplete',
      chance: probabilityBounds(success, high),
      potential,
      expectedUtility: expectedUtilities[decision.utility],
      cutoff: { failsAt: cache.failsAt, passesAt: Number.isFinite(cache.passesAt) ? cache.passesAt : null },
    };
  });
  const potentialCandidates = readingResults.flatMap((reading, index) => reading.potential
    ? [{ id: reading.id, potential: reading.potential, index }] : []);
  const best = decisionOnly ? undefined : potentialCandidates.find((candidate) => potentialCandidates.every((other) => {
    if (other === candidate) return true;
    const order = compareRank(candidate.potential.rank.lowFraction, other.potential.rank.highFraction);
    return order > 0 || (order === 0 && candidate.index < other.index);
  }));
  const exactChance = compare(unionPass, unionHigh) === 0 && readingResults.every((reading) => reading.status === 'complete');
  const status = exactChance ? (potentialCandidates.length > 0 ? 'complete' : 'unusable') : 'incomplete';
  return {
    status,
    unionChance: probabilityBounds(unionPass, unionHigh),
    readings: readingResults,
    potentialWitness: best ? { readingId: best.id, ...best.potential } : null,
    diagnostic: status === 'incomplete' ? 'Exact calculation left some power-up probability unresolved.' : undefined,
  };
}
