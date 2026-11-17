import { lastSubPropertyLevel } from '../rune-properties';
import { runeMaximumLevel, runeStatName } from '../runes';
import type { Rune } from '../runes';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RunePotentialSettings } from '../../model';
import type { EndStateLine } from '../craft/rune-craft-end-state';
import { emptyRunePlacement, hasRunePlacementOutsideScenario } from '../../placements/rune-placement';
import type { RunePlacementSummary } from '../../placements/rune-placement';
import { isRerollTarget } from '../rune-reapp-targets';
import { compare, ONE, policyProbability, rational, ZERO } from '../percentile/probability';
import type { PercentileRankBounds, PolicyProbability, ProbabilityBounds } from '../percentile/probability';
import type { CancellationSignal, ExpectedUtilityBounds, ReadingFutureResult, ReferenceDistribution, RuneFutureResult } from '../percentile/percentile-types';
import { buildReferenceDistribution, PercentileCancelledError } from '../percentile/reference-distribution';
import { solveRuneFuture } from '../percentile/rune-future';
import { newRuneAdviceScope, runePercentileCraftProjection, targetStats } from './rune-cleanup-model';
import { runeChanceRequirement, runePercentileReadings, runeReadingRequirement } from './rune-percentile-readings';
import type { RunePercentileReading } from './rune-percentile-readings';

export type RunePercentileEngineStatus = RuneFutureResult['status'] | 'missing-input';

export type RunePercentileJudgment = Readonly<{
  status: RunePercentileEngineStatus;
  readings: readonly RunePercentileReading[];
  result: RuneFutureResult | null;
  diagnostic?: string;
}>;

export type RunePercentileVerdict = 'unavailable' | 'sell' | 'keep' | 'power-up' | 'reapp' | 'refine';
type Fraction = ProbabilityBounds['lowFraction'];
type ReadingWitness = Readonly<{ readingId: string; roleId: string; roleName: string; buildKey: string }>;

export type RunePercentileAdvice = Readonly<{
  explained: boolean;
  calculation: RunePercentileEngineStatus;
  calculatedVerdict: RunePercentileVerdict;
  verdict: RunePercentileVerdict;
  unprotectedVerdict?: RunePercentileVerdict;
  reason: string;
  unionChance: ProbabilityBounds | null;
  qualityRank: PercentileRankBounds | null;
  qualityWitness: ReadingWitness | null;
  craftProjection: readonly EndStateLine[] | null;
  potentialEfficiency: number | null;
  efficiencyWitness: ReadingWitness | null;
  chanceWitness: ReadingWitness | null;
  readings: readonly Readonly<{
    readingId: string;
    roleId: string;
    roleName: string;
    buildKey: string;
    buildLabel: string;
    permitted: boolean;
    matchRank: RunePercentileReading['rank'];
    allowance: Fraction | null;
    chance: ProbabilityBounds | null;
    potentialRank: PercentileRankBounds | null;
    potentialEfficiency: number | null;
    expectedUtility: ExpectedUtilityBounds | null;
    cutoff: ReadingFutureResult['cutoff'];
  }>[];
}>;

/**
 * A per-calculation reference cache. The key deliberately contains the reading
 * identity, whose role/build/main/star fields are fixed for the request; policy,
 * set preference and inventory remain query inputs rather than moving the ruler.
 */
export type RunePercentileReferenceScope = {
  references: Map<string, Promise<ReferenceDistribution>>;
  models: ReturnType<typeof newRuneAdviceScope>;
  signal?: CancellationSignal;
};

export function newRunePercentileReferenceScope(): RunePercentileReferenceScope {
  return { references: new Map(), models: newRuneAdviceScope() };
}

function fraction(value: Fraction) {
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}

function compareBound(value: Fraction, target: ReturnType<typeof rational>): -1 | 0 | 1 {
  return compare(fraction(value), target);
}

function rankMaximum(readings: readonly Readonly<{ order: number; rank: PercentileRankBounds }>[]): {
  bounds: PercentileRankBounds;
  witnessOrder: number | null;
} | null {
  if (readings.length === 0) return null;
  const byLow = [...readings].sort((left, right) => compare(fraction(right.rank.lowFraction), fraction(left.rank.lowFraction))
    || left.order - right.order);
  const byHigh = [...readings].sort((left, right) => compare(fraction(right.rank.highFraction), fraction(left.rank.highFraction))
    || left.order - right.order);
  const low = byLow[0].rank;
  const high = byHigh[0].rank;
  const exact = compare(fraction(low.lowFraction), fraction(high.highFraction)) === 0;
  const rank = {
    low: low.low,
    high: high.high,
    exact,
    lowFraction: low.lowFraction,
    highFraction: high.highFraction,
  };
  const best = byLow[0];
  const witness = readings.every((other) => {
    if (best === other) return true;
    const comparison = compareBound(best.rank.lowFraction, fraction(other.rank.highFraction));
    return comparison > 0 || (comparison === 0 && best.order < other.order);
  });
  return { bounds: rank, witnessOrder: witness ? best.order : null };
}

type ChanceReading = Readonly<{ meta: RunePercentileReading; result: ReadingFutureResult }>;

function winsChanceTie(candidate: ChanceReading, other: ChanceReading): boolean {
  if (candidate.meta.descriptor.utilityKey !== undefined
    && candidate.meta.descriptor.utilityKey === other.meta.descriptor.utilityKey) {
    return candidate.meta.order < other.meta.order;
  }
  const candidateUtility = candidate.result.expectedUtility;
  const otherUtility = other.result.expectedUtility;
  if (!candidateUtility || !otherUtility) return false;
  const comparison = compareBound(candidateUtility.lowFraction, fraction(otherUtility.highFraction));
  return comparison > 0 || (comparison === 0 && candidate.meta.order < other.meta.order);
}

function chanceWitness(readings: readonly ChanceReading[]): RunePercentileReading | undefined {
  return readings.find((candidate) => compareBound(candidate.result.chance.lowFraction, ZERO) > 0
    && readings.every((other) => {
      if (candidate === other) return true;
      const comparison = compareBound(candidate.result.chance.lowFraction, fraction(other.result.chance.highFraction));
      return comparison > 0 || (comparison === 0 && winsChanceTie(candidate, other));
    }))?.meta;
}

function witnessOf(reading: RunePercentileReading | undefined): ReadingWitness | null {
  return reading ? {
    readingId: reading.descriptor.id,
    roleId: reading.role.id,
    roleName: reading.role.name,
    buildKey: reading.descriptor.buildKey ?? '',
  } : null;
}

export function unavailableRunePercentileAdvice(
  calculation: RunePercentileEngineStatus,
  reason: string,
): RunePercentileAdvice {
  return {
    explained: true, calculation, calculatedVerdict: 'unavailable', verdict: 'unavailable', reason,
    unionChance: null, qualityRank: null, qualityWitness: null, craftProjection: null,
    potentialEfficiency: null, efficiencyWitness: null, chanceWitness: null, readings: [],
  };
}

/** Convert the exact solver result into a cloneable, non-optimistic advice record. */
export function runePercentileAdvice(
  rune: Rune,
  judgment: RunePercentileJudgment,
  settings: RunePotentialSettings,
  explained = true,
): RunePercentileAdvice {
  if (!judgment.result || judgment.result.unionChance === null || judgment.status === 'invalid'
    || judgment.status === 'missing-input') return unavailableRunePercentileAdvice(judgment.status,
    judgment.diagnostic ?? 'The percentile calculation is unavailable. This rune was not judged for sale.');

  const byId = new Map(judgment.result.readings.map((reading) => [reading.id, reading]));
  const details = judgment.readings.map((reading) => {
    const result = byId.get(reading.descriptor.id);
    const potentialEfficiency = result?.potential
      ? result.potential.score / reading.efficiencyCeiling : null;
    const alpha = reading.descriptor.permitted ? policyProbability(reading.descriptor.alpha) : null;
    return {
      readingId: reading.descriptor.id,
      roleId: reading.role.id,
      roleName: reading.role.name,
      buildKey: reading.descriptor.buildKey ?? '',
      buildLabel: [2, 4, 6].flatMap((slot) => {
        const main = reading.build.mains[slot as 2 | 4 | 6];
        return main > 0 ? [`${slot}: ${runeStatName(main) ?? `Stat ${main}`}`] : [];
      }).join(' · ') || 'Open build',
      permitted: reading.descriptor.permitted,
      matchRank: reading.rank,
      allowance: alpha ? { numerator: alpha.numerator.toString(), denominator: alpha.denominator.toString() } : null,
      chance: result?.chance ?? null,
      potentialRank: result?.potential?.rank ?? null,
      potentialEfficiency,
      expectedUtility: result?.expectedUtility ?? null,
      cutoff: result?.cutoff,
    };
  });

  const completePotential = rankMaximum(judgment.readings.flatMap(({ descriptor, order }) => {
    const potential = byId.get(descriptor.id)?.potential;
    return potential ? [{ order, rank: potential.rank }] : [];
  }));
  const qualityWitnessMeta = completePotential?.witnessOrder === null || completePotential === null
    ? undefined : judgment.readings.find((reading) => reading.order === completePotential.witnessOrder);
  const perReadingChance = judgment.readings.flatMap((meta) => {
    const result = byId.get(meta.descriptor.id);
    return result && compareBound(result.chance.highFraction, ZERO) > 0 ? [{ meta, result }] : [];
  });
  const chanceWitnessMeta = chanceWitness(perReadingChance);
  const efficiencyCandidates = details.filter((reading) => reading.potentialEfficiency !== null)
    .sort((left, right) => (right.potentialEfficiency ?? 0) - (left.potentialEfficiency ?? 0));
  const efficiencyWinner = efficiencyCandidates[0];
  const efficiencyWitnessMeta = efficiencyWinner
    ? judgment.readings.find((reading) => reading.descriptor.id === efficiencyWinner.readingId) : undefined;

  const beta = runeChanceRequirement(settings);
  const chance = judgment.result.unionChance;
  const passes = compareBound(chance.lowFraction, beta) >= 0;
  const fails = compareBound(chance.highFraction, beta) < 0;
  const action = rune.level === lastSubPropertyLevel || rune.level >= runeMaximumLevel ? 'keep' : 'power-up';
  const verdict: RunePercentileVerdict = passes ? action : fails ? 'sell' : 'unavailable';
  const reason = passes
    ? rune.level >= runeMaximumLevel ? 'Already there' : rune.level >= lastSubPropertyLevel ? 'Main stat qualifies' : 'Chance for any role/build meets the requirement'
    : fails ? judgment.result.status === 'unusable' ? 'No permitted useful reading' : 'Chance for any role/build is below the requirement'
      : judgment.diagnostic ?? 'The certified Chance interval crosses the requirement. This rune was not judged for sale.';

  return {
    explained,
    calculation: judgment.status,
    calculatedVerdict: verdict,
    verdict,
    reason,
    unionChance: chance,
    qualityRank: completePotential?.bounds ?? null,
    qualityWitness: witnessOf(qualityWitnessMeta),
    craftProjection: qualityWitnessMeta ? runePercentileCraftProjection(qualityWitnessMeta.candidate) : null,
    potentialEfficiency: efficiencyWinner?.potentialEfficiency ?? null,
    efficiencyWitness: witnessOf(efficiencyWitnessMeta),
    chanceWitness: witnessOf(chanceWitnessMeta),
    readings: details,
  };
}

/** Apply the existing protections after, and separately from, the exact quality gate. */
export function withRunePercentileSellProtection(
  rune: Rune,
  advice: RunePercentileAdvice,
  settings: RunePotentialSettings,
  placement: RunePlacementSummary = emptyRunePlacement,
): RunePercentileAdvice {
  if (advice.calculatedVerdict !== 'sell') return advice;

  if (settings.neverSellReappTargets) {
    for (const [kind, reason] of [
      ['refine', 'Refine target'], ['reapp', 'Re-app target'],
    ] as const) {
      if (isRerollTarget(rune, settings.rerollRules, kind)) {
        return { ...advice, verdict: kind, reason, unprotectedVerdict: 'sell' };
      }
    }
  }

  const minimum = settings.preGrindSpeedMinimum;
  const speed = rune.subProperties.find((line) => line.statId === 8)?.value;
  const protectedSpeed = settings.neverSellPreGrindSpeed && minimum !== null
    && Number.isInteger(minimum) && minimum >= 0 && minimum <= 99
    && speed !== undefined && speed >= minimum;
  const protectedEngravings = settings.neverSellEngravedPlacements
    && hasRunePlacementOutsideScenario(placement);

  const potentialMinimum = settings.potentialValueMinimum;
  const potentialProtectionEnabled = settings.neverSellPotentialValue && potentialMinimum !== null
    && Number.isInteger(potentialMinimum) && potentialMinimum >= 0 && potentialMinimum <= 999;
  const minimumEfficiency = potentialMinimum === null ? null : potentialMinimum / 100;
  const onePercent = rational(1, 100);
  const couldReachOnePercent = advice.unionChance === null
    || compareBound(advice.unionChance.highFraction, onePercent) >= 0;
  const potentialMatches = potentialProtectionEnabled && minimumEfficiency !== null && advice.calculation !== 'unusable' && couldReachOnePercent
    ? advice.readings.filter((reading) => reading.permitted
      && (reading.potentialEfficiency === null || reading.potentialEfficiency >= minimumEfficiency)
      && (reading.chance === null || compareBound(reading.chance.highFraction, onePercent) >= 0))
    : [];
  const protectedPotential = potentialMatches.some((reading) => reading.potentialEfficiency !== null
    && reading.chance !== null && compareBound(reading.chance.lowFraction, onePercent) >= 0);
  if (!protectedSpeed && !protectedPotential && !protectedEngravings) {
    if (potentialMatches.length === 0) return advice;
    return {
      ...advice,
      verdict: 'unavailable',
      reason: 'Potential efficiency protection is unresolved. This rune was not judged for sale.',
    };
  }
  return {
    ...advice,
    verdict: rune.level === lastSubPropertyLevel || rune.level >= runeMaximumLevel ? 'keep' : 'power-up',
    reason: protectedSpeed ? 'Pre-grind SPD protected' : protectedPotential
      ? 'Potential efficiency protected' : 'Preset engraving protected',
    unprotectedVerdict: 'sell',
  };
}

function referenceFor(
  reading: RunePercentileReading,
  scope: RunePercentileReferenceScope,
  signal?: CancellationSignal,
  stateLimit?: number,
): Promise<ReferenceDistribution> {
  const { descriptor, candidate } = reading;
  const key = JSON.stringify([descriptor.utilityKey, stateLimit]);
  const known = scope.references.get(key);
  if (known) {
    scope.references.delete(key);
    scope.references.set(key, known);
    return known;
  }
  /* The ruler is independent of set rank and stop choice. Alpha is supplied to
     each query by the candidate, so the shared reference is built at allowance 1. */
  const referenceReading = { ...descriptor, permitted: true, alpha: ONE };
  const pending = buildReferenceDistribution({
    slot: candidate.rune.slot,
    stars: candidate.stars,
    reading: referenceReading,
    canonicalCraft: true,
    signal,
    stateLimit,
  });
  scope.references.set(key, pending);
  /* Warm workers outlive settings edits. Older rulers are disposable and must
     not retain every numerical reading the user ever tried. */
  if (scope.references.size > 128) {
    const oldest = scope.references.keys().next();
    if (!oldest.done) scope.references.delete(oldest.value);
  }
  void pending.catch(() => {
    if (scope.references.get(key) === pending) scope.references.delete(key);
  });
  return pending;
}

type RunePercentileOptions = Readonly<{
  stateLimit?: number;
  signal?: CancellationSignal;
  decisionOnly?: boolean;
  includeExpectedUtility?: boolean;
  cachedRank?: boolean;
  stopOnUnionProof?: boolean;
  unionRequirement?: PolicyProbability;
}>;

/**
 * Prepare the same role/build readings for the reference and candidate solver.
 * Missing roles or roster averages are explicit and cannot be converted to Sell.
 */
export async function judgeRunePercentile(
  rune: Rune,
  roles: readonly RuneRole[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  scope: RunePercentileReferenceScope = newRunePercentileReferenceScope(),
  options: RunePercentileOptions = {},
): Promise<RunePercentileJudgment> {
  if (roles.length === 0) return {
    status: 'missing-input', readings: [], result: null,
    diagnostic: 'Add a Rune Clean-up role before asking for a percentile judgement.',
  };
  const missing = roles.filter((role) => targetStats.some((stat) => (role.targets[stat] ?? 0) > 0)
    && !base.has(role.type));
  if (missing.length > 0) return {
    status: 'missing-input', readings: [], result: null,
    diagnostic: `Import a level 40 reference for ${[...new Set(missing.map((role) => role.type))].join(', ')} before judging this rune.`,
  };

  let readings: RunePercentileReading[] = [];
  const references = new Map<string, ReferenceDistribution>();
  try {
    runeChanceRequirement(settings);
    runeReadingRequirement(settings, 'preferred', false);
    if (options.signal?.aborted) throw new PercentileCancelledError();
    if (scope.signal !== options.signal) {
      scope.references.clear();
      scope.signal = options.signal;
    }
    if (new Set(roles.map((role) => role.id)).size !== roles.length) {
      throw new RangeError('Rune Clean-up roles must have unique identifiers.');
    }
    for (const role of roles) {
      if (targetStats.some((stat) => role.targets[stat] !== undefined
        && (!Number.isFinite(role.targets[stat]) || Number(role.targets[stat]) < 0))) {
        throw new RangeError(`The role ${role.name} has an invalid stat target.`);
      }
      const reference = base.get(role.type);
      if (!reference || !targetStats.some((stat) => (role.targets[stat] ?? 0) > 0)) continue;
      if (targetStats.some((stat) => !Number.isFinite(reference[stat]) || reference[stat] < 0)
        || reference.hp === 0 || reference.atk === 0 || reference.def === 0) {
        throw new RangeError(`The ${role.type} reference has an invalid base stat.`);
      }
    }
    readings = runePercentileReadings(rune, roles, base, settings, scope.models);
    for (const reading of readings) {
      if (!reading.descriptor.permitted) continue;
      const reference = await referenceFor(reading, scope, options.signal, options.stateLimit);
      references.set(reading.descriptor.id, reference.readingId === reading.descriptor.id
        ? reference : { ...reference, readingId: reading.descriptor.id, decisionIdentity: reference });
    }
    const result = await solveRuneFuture({
      rune,
      readings: readings.map(({ descriptor }) => descriptor),
      references,
      stateLimit: options.stateLimit,
      signal: options.signal,
      decisionOnly: options.decisionOnly,
      includeExpectedUtility: options.includeExpectedUtility,
      cachedRank: options.cachedRank,
      stopOnUnionProof: options.stopOnUnionProof,
      unionRequirement: options.unionRequirement,
    });
    if (options.signal?.aborted) throw new PercentileCancelledError();
    return { status: result.status, readings, result, diagnostic: result.diagnostic };
  } catch (error) {
    if (error instanceof PercentileCancelledError || options.signal?.aborted) return {
      status: 'incomplete', readings, result: null,
      diagnostic: 'The percentile calculation was cancelled before it could settle the answer.',
    };
    if (error instanceof RangeError) return {
      status: 'invalid', readings, result: null,
      diagnostic: error.message,
    };
    return {
      status: 'incomplete', readings, result: null,
      diagnostic: 'The exact percentile calculation did not finish; this result cannot recommend Sell.',
    };
  }
}

export async function adviseRunesByPercentile(
  runes: readonly Rune[],
  roles: readonly RuneRole[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  options: RunePercentileOptions & Readonly<{
    onProgress?: (fraction: number) => void;
    scope?: RunePercentileReferenceScope;
  }> = {},
): Promise<Map<string, RunePercentileAdvice>> {
  const scope = options.scope ?? newRunePercentileReferenceScope();
  const results = new Map<string, RunePercentileAdvice>();
  const counts = new Map<string, number>();
  for (const rune of runes) counts.set(rune.id, (counts.get(rune.id) ?? 0) + 1);
  for (let index = 0; index < runes.length; index += 1) {
    const rune = runes[index];
    if ((counts.get(rune.id) ?? 0) > 1) {
      results.set(rune.id, unavailableRunePercentileAdvice('invalid',
        `Rune identity ${rune.id} occurs more than once in this calculation.`));
    } else {
      const judgment = await judgeRunePercentile(rune, roles, settings, base, scope, options);
      results.set(rune.id, runePercentileAdvice(rune, judgment, settings, options.includeExpectedUtility !== false));
    }
    options.onProgress?.((index + 1) / runes.length);
    if (options.signal?.aborted) {
      for (const pending of runes.slice(index + 1)) {
        if (!results.has(pending.id)) results.set(pending.id, unavailableRunePercentileAdvice('incomplete',
          'The percentile calculation was cancelled before it could settle the answer.'));
      }
      break;
    }
  }
  return results;
}
