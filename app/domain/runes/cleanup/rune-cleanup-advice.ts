import type { RuneVerdict } from '../rune-verdict';
import { gemMinimumLevel, runeMaximumLevel, slotAllowsSubStat } from '../runes';
import { emptyRunePlacement, hasRunePlacementOutsideScenario } from '../../placements/rune-placement';
import type { RunePlacementSummary } from '../../placements/rune-placement';
import type { Rune } from '../runes';
import type { RuneRole } from '../../profiles/rune-roles';
import type { RunePotentialSettings } from '../../model';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import {
  buildAccepts, buildRank, candidateChanceAskAt, candidateExpectedBound, candidateExpectedValue, candidateMaxValue,
  newRuneAdviceScope, prepareRuneCandidate, readingScale, roleBuilds, referenceStars,
  runeRuns, runeSetMatchRank, targetStats, worseRank,
} from './rune-cleanup-model';
import type { Build, MatchRank, RuneCandidate } from './rune-cleanup-model';
import { chanceRuns, countChanceGroup, countJobs } from '../rune-power-up-outcomes';
import type { CountingJob, EndStateScoring, RuneRuns } from '../rune-power-up-outcomes';
import { allStatIds, lastSubPropertyLevel, subPropertyTargetStat } from '../rune-properties';
import { runeAdviceKey } from './rune-cleanup-refresh';
import { isIntangibleRuneSet } from '../rune-sets';
import { canonicalCraftCredit, craftedLines, groundLines } from '../craft/rune-craft-end-state';
import type { EndStateLine } from '../craft/rune-craft-end-state';
import { isRerollTarget } from '../rune-reapp-targets';
import {
  allowanceDenominator, qualityBar, qualityReferences, qualityShare, referenceKey, referenceSampleSize,
} from './rune-quality-reference';
import type { QualityReferences, ReferenceRequest } from './rune-quality-reference';

export type ChanceCounter = (jobs: readonly CountingJob[], chanceBar?: number) => Promise<Float64Array>;

export const runeVerdictLabels: Record<RuneVerdict, string> = {
  'power-up': 'Power up', keep: 'Keep', reapp: 'Re-app', refine: 'Refine', sell: 'Sell', unavailable: 'Unavailable',
};

const qualityStops = [20, 10, 5, 2, 1];
const acceptedFactors = [100, 95, 85, 70, 55];
const brokenFactors = [90, 85, 80, 65, 0];
const intangibleFactors = [100, 150, 200, 350, 500];

export const qualityAllowances = qualityStops.map((stop) => stop / 100);
export const chanceThresholds = [0.01, 0.05, 0.20, 0.50, 0.80];

function rankFactor(settings: RunePotentialSettings, rank: MatchRank): number {
  if (rank === 'preferred') return 100;
  if (rank === 'acceptable') return acceptedFactors[settings.acceptedRunes - 1] ?? acceptedFactors[2];
  return brokenFactors[settings.brokenRunes - 1] ?? brokenFactors[2];
}

export const runeRankWorth = (settings: RunePotentialSettings, rank: MatchRank): number => rankFactor(settings, rank) / 100;

/** Integer millionths preserve exact policy boundaries before converting to a sample index. */
export function readingAllowance(settings: RunePotentialSettings, rank: MatchRank, intangible: boolean): number | null {
  const rankPercent = rankFactor(settings, rank);
  if (rankPercent === 0) return null;
  const quality = qualityStops[settings.runeQuality - 1] ?? qualityStops[2];
  const setPercent = intangible ? (intangibleFactors[settings.intangibleRunes - 1] ?? intangibleFactors[0]) : 100;
  return Math.min(allowanceDenominator, quality * rankPercent * setPercent);
}

/** A tighter printed share never makes a failing sample rank look like a pass. */
export function runeQualityText(share: number | null, requirement: number | null, showRequirement = false): string {
  if (requirement === null || (!showRequirement && share === null)) return '—';
  const exact = Math.round(requirement * allowanceDenominator) / 10_000;
  if (showRequirement) return `Top ${exact} %`;
  if (share === null) return '—';
  const decimals = Math.max(1, (String(exact).split('.')[1] ?? '').length);
  const scale = 10 ** decimals;
  const hits = Math.round(share * referenceSampleSize);
  return `Top ${Math.ceil(hits * 100 * scale / referenceSampleSize) / scale} %`;
}

export type RoleReading = {
  roleId: string;
  rank: MatchRank;
  maxValue: number;
  chance: number | null;
  expected: number;
  qualityShare: number | null;
  requirement: number | null;
  reachable: boolean | null;
  cleared: boolean;
};

export type RuneAdvice = {
  unprotectedAdvice?: { verdict: RuneVerdict; reason: string };
  verdict: RuneVerdict;
  reason: string;
  maxValue: number;
  /** Union of the permitted reading events on the same futures. */
  chance: number;
  readingChance: number | null;
  qualityShare: number | null;
  requirement: number | null;
  role: RuneRole | null;
  rank: MatchRank;
  craftedLines: EndStateLine[] | null;
  buildMains: Build['mains'] | null;
  readings: RoleReading[] | null;
};

function configuredRoles(roles: readonly RuneRole[], base: ReadonlyMap<string, ReferenceStats>) {
  return roles.filter((role) => targetStats.some((stat) => (role.targets[stat] ?? 0) > 0))
    .map((role) => ({ role, builds: roleBuilds(role), base: base.get(role.type) }));
}

export function planQualityReferences(
  runes: readonly Pick<Rune, 'slot' | 'stars' | 'mainStatId' | 'ancient' | 'setName'>[],
  roles: readonly RuneRole[], base: ReadonlyMap<string, ReferenceStats>, settings: RunePotentialSettings,
): ReferenceRequest[] {
  const requests = new Map<string, ReferenceRequest>();
  const pieces = new Map<string, typeof runes[number]>();
  for (const rune of runes) pieces.set(`${rune.slot}|${referenceStars(rune)}|${rune.mainStatId}|${rune.setName}`, rune);
  const families = configuredRoles(roles, base);
  const scope = newRuneAdviceScope();
  for (const rune of pieces.values()) {
    const piece = { slot: rune.slot, stars: referenceStars(rune), main: rune.mainStatId };
    for (const family of families) {
      if (!family.base) continue;
      const setRank = runeSetMatchRank(family.role.sets, rune.setName);
      if (readingAllowance(settings, setRank, false) === null) continue;
      for (const build of family.builds) {
        const scale = readingScale(family.role, build, family.base, piece.slot, piece.main, piece.stars, scope);
        if (!scale || readingAllowance(settings, worseRank(setRank, scale.rank), false) === null) continue;
        const key = referenceKey(piece, scale.prices);
        if (!requests.has(key)) requests.set(key, { ...piece, key, prices: scale.prices });
      }
    }
  }
  return [...requests.values()];
}

type ReferenceReadings = ReferenceRequest & { readings: { answer: Answer; allowance: number }[] };

type Event = { job: CountingJob; chance: number };
// Only Statistics holds scores across policies. Each worker owns at most 18 MiB.
const retainedOutcomeStreams = 576;
export type RuneOutcomeScores = Map<string, Float64Array>;
type Answer = {
  role: RuneRole;
  candidate: RuneCandidate;
  rank: MatchRank;
  maxValue: number;
  qualityShare: number | null;
  requirement: number | null;
  chance: number | null;
  reachable: boolean | null;
  event?: Event;
  bar?: { key: string; wanted: number };
};

export async function runeAdvice(
  runes: readonly Rune[], roles: readonly RuneRole[], settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>, count: ChanceCounter = async (jobs) => countJobs(jobs),
  { explain = false, onProgress, references = qualityReferences(), onGroupedCount, candidateRuns = chanceRuns, outcomeScores, onLocalPreparation, candidateSeed = 0 }: {
    explain?: boolean;
    onProgress?: (fraction: number) => void;
    references?: QualityReferences;
    onGroupedCount?: () => void;
    candidateRuns?: number;
    outcomeScores?: RuneOutcomeScores;
    onLocalPreparation?: (fraction: number | null) => void;
    candidateSeed?: number;
  } = {},
): Promise<Map<string, RuneAdvice>> {
  const chanceBar = chanceThresholds[settings.powerUpPolicy - 1] ?? chanceThresholds[2];
  const families = configuredRoles(roles, base);
  const scope = newRuneAdviceScope();
  const worthOf = (rank: MatchRank) => runeRankWorth(settings, rank);
  const singles: Event[] = [];
  const byReference = new Map<string, ReferenceReadings>();
  const plans = runes.map((rune) => {
    const piece = { slot: rune.slot, stars: referenceStars(rune), main: rune.mainStatId };
    const intangible = isIntangibleRuneSet(rune.setName);
    const readings: Answer[] = [];
    let unavailable = false;
    for (const family of families) {
      const setRank = runeSetMatchRank(family.role.sets, rune.setName);
      for (const build of family.builds) {
        if (!buildAccepts(build, piece.slot, piece.main)) continue;
        if (!family.base) {
          const rank = worseRank(setRank, buildRank(build, piece.slot));
          unavailable ||= readingAllowance(settings, rank, intangible) !== null && allStatIds.some((statId) =>
            statId !== piece.main && slotAllowsSubStat(piece.slot, statId)
              && (family.role.targets[subPropertyTargetStat[statId]] ?? 0) > 0);
          continue;
        }
        const candidate = prepareRuneCandidate(rune, family.role, build, family.base, canonicalCraftCredit, scope);
        if (!candidate) continue;
        const { rank } = candidate;
        const allowance = readingAllowance(settings, rank, intangible);
        const answer: Answer = {
          role: family.role, candidate, rank, maxValue: candidateMaxValue(candidate) * worthOf(rank),
          qualityShare: null, requirement: null, chance: null, reachable: null,
        };
        readings.push(answer);
        if (allowance === null) continue;
        const { prices } = candidate.scoring;
        const key = referenceKey(piece, prices);
        const group = byReference.get(key) ?? { ...piece, key, prices, readings: [] };
        group.readings.push({ answer, allowance });
        byReference.set(key, group);
      }
    }
    return { rune, readings, unavailable };
  });

  // Batch the queries by score array so an oversized catalogue can stream the
  // references, keeping only the raw bar and tail needed by each candidate.
  let preparedReferenceCount = 0;
  for (const group of byReference.values()) {
    const reference = references.get(group, group.prices);
    const bars = new Map<number, number>();
    for (const { answer, allowance } of group.readings) {
      answer.requirement = allowance / allowanceDenominator;
      if (answer.candidate.best > 0) answer.qualityShare = qualityShare(reference, answer.candidate.best);
      const wanted = bars.get(allowance) ?? qualityBar(reference, allowance, group.prices);
      bars.set(allowance, wanted);
      answer.bar = { key: group.key, wanted };
    }
    onLocalPreparation?.(++preparedReferenceCount / byReference.size);
  }
  byReference.clear();
  onLocalPreparation?.(null);
  onProgress?.(0);

  const prepared = plans.map(({ rune, readings, unavailable }, index) => {
    const events = new Map<string, Event>();
    const scorings = new Map<string, EndStateScoring>();
    const scoreKeys = new Map<EndStateScoring, string>();
    let union = 0;
    const futureBySeed = new Map<CountingJob['future'], CountingJob['future']>();
    for (const answer of readings) {
      if (!answer.bar) continue;
      const { candidate } = answer;
      const { key, wanted } = answer.bar;
      const eventKey = `${key}|${wanted}`;
      const knownEvent = events.get(eventKey);
      if (knownEvent) {
        answer.event = knownEvent;
        answer.reachable = true;
        continue;
      }
      const scoring = scorings.get(key) ?? candidate.scoring;
      scorings.set(key, scoring);
      if (outcomeScores) scoreKeys.set(scoring, key);
      const step = candidateChanceAskAt(candidate, wanted, candidateRuns);
      answer.chance = step.settled;
      answer.reachable = step.settled !== 0;
      if (step.job) {
        let { future } = step.job;
        if (candidateSeed !== 0) {
          const shifted = futureBySeed.get(future) ?? { ...future, seed: (future.seed ^ candidateSeed) >>> 0 };
          futureBySeed.set(future, shifted);
          future = shifted;
        }
        const event = { job: { ...step.job, future, scoring }, chance: 0 };
        events.set(eventKey, event);
        answer.event = event;
      } else if (step.settled === 1) union = 1;
    }
    const live = [...events.values()];
    if (live.length === 1) singles.push(live[0]);
    if (live.length > 1) {
      onGroupedCount?.();
      const future = live[0].job.future;
      // A Statistics policy edit asks new bars of the same births. The finished
      // score stream depends only on the body, price list and number of runs.
      const runeKey = outcomeScores && future.additions > 0 && future.upgrades + future.additions > 2 ? runeAdviceKey(rune) : null;
      const keyOf = (scoring: EndStateScoring) => `${runeKey}|${scoreKeys.get(scoring)}|${candidateRuns}|${candidateSeed}`;
      const cache = outcomeScores && runeKey ? {
        read: (scoring: EndStateScoring) => outcomeScores.get(keyOf(scoring)),
        hasRoom: () => outcomeScores.size < retainedOutcomeStreams,
        remember: (scoring: EndStateScoring, scores: Float64Array) => {
          if (outcomeScores.size < retainedOutcomeStreams) outcomeScores.set(keyOf(scoring), scores);
        },
      } : undefined;
      const { union: hits, hits: marginals } = countChanceGroup(future, live.map((event) => event.job), cache);
      const runs = live[0].job.runs;
      live.forEach((event, at) => { event.chance = marginals[at] / runs; });
      union = Math.max(union, hits / runs);
    }
    onProgress?.((index + 1) / (2 * runes.length));
    return { rune, readings, live, union, unavailable };
  });

  if (singles.length > 0) {
    const shares = await count(singles.map((event) => event.job), chanceBar);
    if (shares.length !== singles.length || shares.some((share) => !Number.isFinite(share) || share < 0 || share > 1)) {
      throw new Error('The chance counter returned invalid rune odds.');
    }
    singles.forEach((event, index) => { event.chance = shares[index]; });
  }

  const result = new Map<string, RuneAdvice>();
  for (const { rune, readings, live, union, unavailable: incomplete } of prepared) {
    for (const reading of readings) if (reading.event) reading.chance = reading.event.chance;
    const chance = live.length === 1 ? Math.max(union, live[0].chance) : union;
    const allowed = readings.filter((reading) => reading.chance !== null);
    const cleared = chance >= chanceBar;
    /* A role JASWA cannot read could only add events, and the union never falls when
       one is added, so a keep or a power-up stands without it. Only a sale is in doubt. */
    const unavailable = incomplete && !cleared;
    const pool = cleared ? allowed.filter((reading) => odds(reading) > 0) : allowed;    let runs: RuneRuns | null = null;
    const expected = (reading: Answer) => worthOf(reading.rank) * candidateExpectedValue(
      reading.candidate, () => (runs ??= runeRuns(reading.candidate.future)),
    );
    const choose = (options: readonly Answer[]) => mostExpected(options, worthOf, expected);
    const chosen = unavailable ? null : choose(pool.length > 0 ? pool : readings);
    const decision = unavailable
      ? { verdict: 'unavailable' as const, reason: 'Missing reference stats' }
      : decide(rune, chosen, cleared, chance);
    const advice: RuneAdvice = {
      ...decision, chance: unavailable ? 0 : chance,
      role: chosen?.role ?? null, rank: chosen?.rank ?? 'broken', maxValue: chosen?.maxValue ?? 0,
      readingChance: chosen?.chance ?? null, qualityShare: chosen?.qualityShare ?? null,
      requirement: chosen?.requirement ?? null,
      craftedLines: chosen && chosen.chance !== null ? finishedLines(chosen.candidate) : null,
      buildMains: chosen && chosen.chance !== null ? chosen.candidate.build.mains : null,
      readings: explain && !unavailable ? roles.flatMap((role) => {
        const own = readings.filter((reading) => reading.role.id === role.id);
        const individuallyPassing = own.filter((reading) => odds(reading) >= chanceBar);
        const positive = own.filter((reading) => odds(reading) > 0);
        const permitted = own.filter((reading) => reading.chance !== null);
        const pick = chosen?.role.id === role.id ? chosen
          : choose([individuallyPassing, positive, permitted, own].find((group) => group.length > 0) ?? []);
        if (!pick) return [];
        return [{ roleId: role.id, rank: pick.rank, maxValue: pick.maxValue, chance: pick.chance,
          expected: expected(pick), qualityShare: pick.qualityShare, requirement: pick.requirement,
          reachable: pick.reachable, cleared: odds(pick) >= chanceBar }];
      }) : null,
    };
    result.set(rune.id, withRuneSellProtection(rune, advice, settings));
    onProgress?.((runes.length + result.size) / (2 * runes.length));
  }
  onProgress?.(1);
  return result;
}

const odds = (reading: Answer): number => reading.chance ?? 0;

/* The last tie-break must name one role on every thread and in every script, so it
   compares code units rather than asking the host's locale how to collate. */
const ordinal = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function mostExpected(pool: readonly Answer[], worthOf: (rank: MatchRank) => number, expected: (answer: Answer) => number): Answer | null {
  if (pool.length <= 1) return pool[0] ?? null;
  const byBound = pool.map((answer) => ({ answer, bound: worthOf(answer.rank) * candidateExpectedBound(answer.candidate) }))
    .sort((left, right) => right.bound - left.bound);
  const known = new Map<RuneCandidate['valuation'], Map<MatchRank, number>>();
  let best: Answer | null = null;
  let bestExpected = -Infinity;
  for (const { answer, bound } of byBound) {
    if (bound < bestExpected) break;
    const values = known.get(answer.candidate.valuation) ?? new Map<MatchRank, number>();
    const value = values.get(answer.rank) ?? expected(answer);
    values.set(answer.rank, value);
    known.set(answer.candidate.valuation, values);
    if (best) {
      const current = best.candidate.build.mains;
      const mains = answer.candidate.build.mains;
      const order = value - bestExpected || answer.maxValue - best.maxValue
        || (best.qualityShare ?? 2) - (answer.qualityShare ?? 2) || odds(answer) - odds(best)
        || ordinal(best.role.id, answer.role.id) || current[2] - mains[2] || current[4] - mains[4] || current[6] - mains[6];
      if (order <= 0) continue;
    }
    best = answer;
    bestExpected = value;
  }
  return best;
}

function decide(rune: Rune, chosen: Answer | null, cleared: boolean, chance: number): { verdict: RuneVerdict; reason: string } {
  if (!chosen) return { verdict: 'sell', reason: 'No role can use it' };
  if (chosen.chance === null) return { verdict: 'sell', reason: 'Broken: not wanted' };
  if (!cleared) return { verdict: 'sell', reason: rune.level >= lastSubPropertyLevel ? 'Below the floor' : runeChanceText(chance) };
  if (rune.level >= runeMaximumLevel) return { verdict: 'keep', reason: 'Already there' };
  if (rune.level === lastSubPropertyLevel) return { verdict: 'keep', reason: 'Main stat only' };
  return { verdict: 'power-up', reason: rune.level > lastSubPropertyLevel ? 'Main stat only' : runeChanceText(chance) };
}

export function runeChanceText(chance: number): string {
  if (chance <= 0) return '0 %';
  const points = Math.floor(chance * 100 + 1e-9);
  return points >= 1 ? `${points} %` : '<1 %';
}

/** The craft the row's Max value counted on the lines the rune shows: the whole of it
    from the Gem's own level, the stones alone below, where no Gem is legal yet. */
export function finishedLines(candidate: RuneCandidate): EndStateLine[] {
  const { scoring } = candidate;
  const lines = candidate.rune.subProperties.map(({ statId, value, grind, gemmed }) => ({ statId, value, grind, gemmed }));
  return candidate.rune.level >= gemMinimumLevel
    ? craftedLines(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore)
    : groundLines(scoring.plan, lines);
}

/**
 * What a player still has to spend on each line to hold `craftedLines`: the Gem's new
 * id on the line it replaces, and a stone wherever the end state carries more than
 * the line already keeps. Read off the line-up the verdict counted rather than decided
 * again, so a line named here is exactly a line Max value assumed.
 */
export type RuneCraftStep = {
  /** The id the Gem puts on this line, or `null` where no Gem is spent here. */
  gemStatId: number | null;
  /** What Max value assumes that Gem rolls, its stone excluded; `null` where no Gem is spent. */
  gemValue: number | null;
  /** The stone the end state carries on this line, or `0` where none is spent. */
  grind: number;
};

export function runeCraftSteps(rune: Rune, crafted: readonly EndStateLine[]): RuneCraftStep[] {
  return rune.subProperties.map((line, at) => {
    const end = crafted[at];
    if (end === undefined) return { gemStatId: null, gemValue: null, grind: 0 };
    const gemSpent = end.statId !== line.statId || end.value !== line.value || end.gemmed !== line.gemmed;
    /* A Gem on another id starts the line bare; re-rolling its own id keeps the stone. */
    const kept = gemSpent && end.statId !== line.statId ? 0 : line.grind;
    return {
      gemStatId: gemSpent ? end.statId : null, gemValue: gemSpent ? end.value : null,
      grind: end.grind > kept ? end.grind : 0,
    };
  });
}

/**
 * The engine's own verdict, before any safeguard of `withRuneSellProtection`
 * turned a sale into a keep, a power-up or a reroll. A page asking what the
 * calculation thinks of a rune reads this; a page asking what to do reads `verdict`.
 */
export const calculatedRuneVerdict = (advice: RuneAdvice): RuneAdvice['verdict'] =>
  advice.unprotectedAdvice?.verdict ?? advice.verdict;

/** User safeguards outrank selling policy without changing any score or odds. */
export function withRuneSellProtection(rune: Rune, advice: RuneAdvice, settings: RunePotentialSettings,
  placement: RunePlacementSummary = emptyRunePlacement,
): RuneAdvice {
  if (advice.verdict === 'unavailable') return advice;
  const original = advice.unprotectedAdvice ?? { verdict: advice.verdict, reason: advice.reason };
  const minimum = settings.preGrindSpeedMinimum;
  const speed = rune.subProperties.find((line) => line.statId === 8)?.value;
  const protectedSpeed = settings.neverSellPreGrindSpeed && minimum !== null
    && Number.isInteger(minimum) && minimum >= 0 && minimum <= 99
    && speed !== undefined && speed >= minimum;
  const potentialMinimum = settings.potentialValueMinimum;
  const protectedPotential = settings.neverSellPotentialValue && potentialMinimum !== null
    && Number.isInteger(potentialMinimum) && potentialMinimum >= 0 && potentialMinimum <= 999
    && (advice.readingChance ?? 0) >= 0.01 && advice.maxValue >= potentialMinimum / 100;
  const protectedEngravings = settings.neverSellEngravedPlacements
    && hasRunePlacementOutsideScenario(placement);
  /* A re-app or refine target is a way out of a sale and nothing else: it is
     only ever asked of a rune the engine would sell, so a rune worth powering up
     or keeping is never sent to a stone. Asked there, it names what to do rather
     than only forbidding the sale, so it outranks the other safeguards. Refine is
     asked first: the user's wanted types are already present, so refinement
     improves their rolls without gambling the types. */
  if (settings.neverSellReappTargets && original.verdict === 'sell') {
    for (const [kind, reason] of [
      ['refine', 'Refine target'],
      ['reapp', 'Re-app target'],
    ] as const) {
      if (isRerollTarget(rune, settings.rerollRules, kind)) {
        return { ...advice, unprotectedAdvice: original, verdict: kind, reason };
      }
    }
  }
  if (!protectedSpeed && !protectedPotential && !protectedEngravings) return advice.unprotectedAdvice ? { ...advice, ...original } : advice;
  return {
    ...advice, unprotectedAdvice: original,
    verdict: rune.level === lastSubPropertyLevel || rune.level >= runeMaximumLevel ? 'keep' : 'power-up',
    reason: protectedSpeed ? 'Pre-grind SPD protected' : protectedPotential ? 'Potential value protected' : 'Preset engraving protected',
  };
}
