/** Reading-local policy and the shared scoring callback used by Rune Clean-up. */
import {
  canonicalCraftCredit, craftedScore, craftPlan, gemLineContribution, gemOptions, groundValue, priceList,
} from '../craft/rune-craft-end-state';
import type { Rational } from '../percentile/probability';
import { compare, multiply, ONE, rational, ZERO } from '../percentile/probability';
import type { PercentileReading } from '../percentile/percentile-types';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import { runeStatIds } from '../runes';
import type { Rune } from '../runes';
import { isIntangibleRuneSet } from '../rune-sets';
import { runeInnateScore } from '../rune-power-up-outcomes';
import { prepareRunePercentileModel, roleBuilds } from './rune-cleanup-model';
import type { Build, RuneAdviceScope, RunePercentileModel } from './rune-cleanup-model';
import type { RunePotentialSettings } from '../../model';

/** Each stored stop keeps its index; its meaning is the allowance for one reading. */
export const runeQualityAllowances: readonly Rational[] = [
  rational(1, 5), rational(1, 10), rational(1, 20), rational(1, 50), rational(1, 100),
];

/** Chance gates remain the five independently stored Power-up policy stops. */
export const runeChanceAllowances: readonly Rational[] = [
  rational(1, 100), rational(1, 20), rational(1, 5), rational(1, 2), rational(4, 5),
];

const acceptedFactors: readonly Rational[] = [
  rational(1), rational(19, 20), rational(17, 20), rational(7, 10), rational(11, 20),
];
const brokenFactors: readonly Rational[] = [
  rational(9, 10), rational(17, 20), rational(4, 5), rational(13, 20), rational(0),
];
const intangibleFactors: readonly Rational[] = [
  rational(1), rational(3, 2), rational(2), rational(7, 2), rational(5),
];

function atStop<T>(values: readonly T[], stop: number, name: string): T {
  if (!Number.isInteger(stop) || stop < 1 || stop > values.length) {
    throw new RangeError(`${name} must select one of its ${values.length} offered stops.`);
  }
  const value = values[stop - 1];
  if (value === undefined) throw new RangeError(`${name} has no offered value at stop ${stop}.`);
  return value;
}

export function runeChanceRequirement(settings: RunePotentialSettings): Rational {
  return atStop(runeChanceAllowances, settings.powerUpPolicy, 'Power-up policy');
}

/** The saved quality stop is a base allowance, before role and set preferences. */
export function runeQualityRequirement(settings: RunePotentialSettings): Rational {
  return atStop(runeQualityAllowances, settings.runeQuality, 'Quality requirement');
}

/** Return null for an explicitly forbidden broken reading; otherwise apply its factors once. */
export function runeReadingRequirement(
  settings: RunePotentialSettings, rank: 'preferred' | 'acceptable' | 'broken', intangible: boolean,
): Rational | null {
  const base = runeQualityRequirement(settings);
  const accepted = atStop(acceptedFactors, settings.acceptedRunes, 'Accepted runes');
  const broken = atStop(brokenFactors, settings.brokenRunes, 'Broken runes');
  const intangibleFactor = atStop(intangibleFactors, settings.intangibleRunes, 'Intangible runes');
  const rankFactor = rank === 'preferred' ? ONE : rank === 'acceptable' ? accepted : broken;
  if (compare(rankFactor, ZERO) === 0) return null;
  const factor = multiply(rankFactor, intangible ? intangibleFactor : ONE);
  const allowance = multiply(base, factor);
  return compare(allowance, ONE) > 0 ? ONE : allowance;
}

export type RunePercentileReading = Readonly<{
  descriptor: PercentileReading;
  candidate: RunePercentileModel;
  role: RuneRole;
  build: Build;
  order: number;
  rank: RunePercentileModel['rank'];
  /** The ordinary perfect-rune ratio remains a separate potential-efficiency diagnostic. */
  efficiencyCeiling: number;
}>;

function buildKey(build: Build): string {
  return JSON.stringify([build.mains[2], build.mains[4], build.mains[6],
    build.ranks[2], build.ranks[4], build.ranks[6]]);
}

type ReadingScoring = Pick<PercentileReading,
  'score' | 'utilityPrefix' | 'utilityLineComponents' | 'utilityKey' | 'weightsByStatId'>;
const readingScores = new WeakMap<RunePercentileModel['valuation'], Map<string, ReadingScoring>>();

function readingScoring(candidate: RunePercentileModel): ReadingScoring {
  const { valuation, stars, main, rune: { slot } } = candidate;
  let byCohort = readingScores.get(valuation);
  if (!byCohort) {
    byCohort = new Map();
    readingScores.set(valuation, byCohort);
  }
  const cohort = `${slot}/${stars}/${main}`;
  const known = byCohort.get(cohort);
  if (known) return known;
  const prices = priceList(valuation);
  const weightsByStatId = Object.fromEntries(runeStatIds.map((statId) => [statId, prices[statId] ?? 0]));
  const utilityKey = JSON.stringify([slot, stars, main, [...prices]]);
  const optionsByLineageAndInnate = new Map<number, ReturnType<typeof gemOptions>>();
  const lineValues = new Float64Array(4);
  function readCraft(body: Rune) {
    const plan = craftPlan(body.ancient ? 'ancient' : 'standard', canonicalCraftCredit);
    const key = (body.ancient ? prices.length : 0) + (body.prefixStatId ?? 0);
    let options = optionsByLineageAndInnate.get(key);
    if (options === undefined) {
      options = gemOptions(plan, prices, slot, main, body.prefixStatId);
      optionsByLineageAndInnate.set(key, options);
    }
    return { plan, options };
  }
  const utilityPrefix = (body: Rune) => runeInnateScore(body, prices);
  const scoring: ReadingScoring = {
    utilityKey,
    weightsByStatId,
    score(body) {
      if (body.slot !== slot || body.stars !== stars || body.mainStatId !== main) return null;
      const { plan, options } = readCraft(body);
      return craftedScore(plan, options, prices, body.subProperties, utilityPrefix(body), lineValues);
    },
    utilityPrefix,
    utilityLineComponents(body, lineIndex) {
      const { plan, options } = readCraft(body);
      const line = body.subProperties[lineIndex];
      return {
        grounded: groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId],
        gem: gemLineContribution(plan, options, prices, body.subProperties, lineIndex),
      };
    },
  };
  byCohort.set(cohort, scoring);
  return scoring;
}

/**
 * Build the readings this body can actually answer. Unstated mains remain 0 in
 * the build passed to the scorer; only the descriptor receives the body's actual
 * main, so expansion never adds an unstated main into target subtraction.
 */
export function runePercentileReadings(
  rune: Rune, roles: readonly RuneRole[], base: ReadonlyMap<string, ReferenceStats>,
  settings: RunePotentialSettings, scope: RuneAdviceScope,
): RunePercentileReading[] {
  const result: RunePercentileReading[] = [];
  const intangible = isIntangibleRuneSet(rune.setName);
  let order = 0;

  for (const role of roles) {
    const reference = base.get(role.type);
    if (!reference) continue;
    let builds = scope.builds.get(role);
    if (builds === undefined) {
      builds = roleBuilds(role);
      scope.builds.set(role, builds);
    }
    for (const build of builds) {
      const candidate = prepareRunePercentileModel(rune, role, build, reference, scope);
      if (!candidate) continue;
      const alpha = runeReadingRequirement(settings, candidate.rank, intangible);
      const key = buildKey(build);
      const id = JSON.stringify([role.id, rune.slot, candidate.stars, key, candidate.main]);
      const descriptor: PercentileReading = {
        id,
        roleId: role.id,
        buildKey: key,
        permitted: alpha !== null,
        mainStatId: candidate.main,
        alpha: alpha ?? runeQualityRequirement(settings),
        efficiencyCeiling: candidate.ceiling,
        ...readingScoring(candidate),
      };
      result.push({ descriptor, candidate, role, build, order: order++, rank: candidate.rank,
        efficiencyCeiling: candidate.ceiling });
    }
  }
  return result;
}
