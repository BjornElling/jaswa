import { ordinarySamplePaths } from './rune-cleanup-model';
import type { OrdinarySampleCheckpointLevel, OrdinarySamplePath } from './rune-cleanup-model';
import {
  judgeRunePercentile, newRunePercentileReferenceScope, runePercentileAdvice, withRunePercentileSellProtection,
} from './rune-percentile-engine';
import type { RunePercentileAdvice, RunePercentileVerdict } from './rune-percentile-engine';
import type { Rune } from '../runes';
import type { RuneRole } from '../../profiles/rune-roles';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RunePotentialSettings } from '../../model';
import { runeChanceRequirement } from './rune-percentile-readings';

export const runeStatisticsRunesPerSlot = 50;
export const runeStatisticsStars = 6;
export const runeStatisticsSlots = [1, 2, 3, 4, 5, 6] as const;
const investmentLevels = [0, 3, 6, 9] as const;
const checkpointLevels = [...investmentLevels, 12] as const;

/** An unresolved event has neither a certified pass nor a certified failure. */
type Decision = boolean | null;

type TerminalReading = Readonly<{
  readingId: string;
  roleId: string;
  roleName: string;
  buildKey: string;
  buildLabel: string;
  qualifies: Decision;
}>;

export type RuneCleanupSampledCheckpointAnswer = Readonly<{
  calculated: Decision;
  protected: Decision;
  terminalReadings?: readonly TerminalReading[];
}>;

export type RuneCleanupSampledCount = Readonly<{
  sampleSize: number;
  successes: number;
  unresolved: number;
  proportion: number | null;
  standardError: number | null;
}>;

type ReadingSupply = Omit<TerminalReading, 'qualifies'> & Readonly<{
  slot: number;
  mainStatId: number;
  supply: RuneCleanupSampledCount;
}>;

type RoleBuildCoverage = Omit<TerminalReading, 'qualifies' | 'readingId'> & Readonly<{
  terminalCoverage: RuneCleanupSampledCount;
  funnelCoverage: RuneCleanupSampledCount;
}>;

export type RuneCleanupSampledFunnel = Readonly<{
  method: 'sequential-sampled';
  sampleSize: number;
  samplingUncertainty: 'descriptive-bernoulli-standard-error-not-certified';
  investmentByCheckpoint: readonly Readonly<{
    level: (typeof investmentLevels)[number];
    calculated: RuneCleanupSampledCount;
    protected: RuneCleanupSampledCount;
  }>[];
  terminalUnion: RuneCleanupSampledCount;
  qualifyingFunnel: RuneCleanupSampledCount;
  protectedSurvivors: RuneCleanupSampledCount;
  extraProtectedSurvivors: RuneCleanupSampledCount;
  perReadingSupply: readonly ReadingSupply[];
  roleBuildCoverage: readonly RoleBuildCoverage[];
}>;

type JudgedCheckpoint = Readonly<{ level: OrdinarySampleCheckpointLevel; rune: Rune; advice: RunePercentileAdvice | null }>;
type JudgedPath = Readonly<{ id: string; checkpoints: readonly JudgedCheckpoint[] }>;

export type RuneCleanupStatistics = Readonly<{
  durationMs: number;
  paths: readonly JudgedPath[];
}>;

/** One fixed population of births, each advanced through the same five checkpoints. */
export function runeCleanupStatisticsSamplePaths(): OrdinarySamplePath[] {
  const slots = runeStatisticsSlots.map((slot) => ordinarySamplePaths(
    slot, runeStatisticsStars, runeStatisticsRunesPerSlot, 'drop'));
  return Array.from({ length: runeStatisticsRunesPerSlot }, (_, at) => slots.map((paths) => paths[at])).flat();
}

function sampledCount(decisions: readonly Decision[]): RuneCleanupSampledCount {
  const sampleSize = decisions.length;
  const successes = decisions.filter((answer) => answer === true).length;
  const unresolved = decisions.filter((answer) => answer === null).length;
  const proportion = sampleSize > 0 && unresolved === 0 ? successes / sampleSize : null;
  return {
    sampleSize, successes, unresolved, proportion,
    standardError: proportion === null ? null : Math.sqrt(proportion * (1 - proportion) / sampleSize),
  };
}

function all(decisions: readonly Decision[]): Decision {
  return decisions.includes(false) ? false : decisions.includes(null) ? null : true;
}

function any(decisions: readonly Decision[]): Decision {
  return decisions.includes(true) ? true : decisions.includes(null) ? null : false;
}

function requireCheckpointShape(paths: readonly OrdinarySamplePath[]): void {
  if (new Set(paths.map(({ id }) => id)).size !== paths.length) {
    throw new Error('Sampled rune paths must have unique birth ids.');
  }
  const ids = new Set<string>();
  for (const path of paths) {
    if (path.checkpoints.length !== checkpointLevels.length
      || path.checkpoints.some(({ level, rune }, index) => level !== checkpointLevels[index] || rune.level !== level)) {
      throw new Error(`Sampled rune path ${path.id} must contain ordered +0/+3/+6/+9/+12 snapshots.`);
    }
    for (const { rune } of path.checkpoints) {
      if (ids.has(rune.id)) throw new Error('Every sampled body checkpoint must have a unique Rune id.');
      ids.add(rune.id);
    }
  }
}

type SampledBody = {
  slot: number;
  mainStatId: number;
  investment: readonly RuneCleanupSampledCheckpointAnswer[];
  terminal: RuneCleanupSampledCheckpointAnswer;
};

/** Apply all checkpoint gates to each latent path before counting its one body. */
export function calculateRuneCleanupSampledFunnel(
  paths: readonly OrdinarySamplePath[],
  judge: (rune: Rune, pathId: string, level: OrdinarySampleCheckpointLevel) => RuneCleanupSampledCheckpointAnswer,
): RuneCleanupSampledFunnel {
  requireCheckpointShape(paths);
  const bodies: SampledBody[] = paths.map(({ id, checkpoints }) => {
    const answers = checkpoints.map(({ level, rune }) => {
      const answer = judge(rune, id, level);
      if (answer.calculated === true && answer.protected !== true) {
        throw new Error(`The +${level} protection result cannot undo a calculated pass.`);
      }
      return answer;
    });
    const { slot, mainStatId } = checkpoints[4].rune;
    return { slot, mainStatId, investment: answers.slice(0, 4), terminal: answers[4] };
  });
  const rolled = bodies.map(({ investment }) => all(investment.map((answer) => answer.calculated)));
  const qualifying = bodies.map(({ terminal }, at) => all([rolled[at], terminal.calculated]));
  const protectedSurvivors = bodies.map(({ investment, terminal }) =>
    all([...investment.map((answer) => answer.protected), terminal.protected]));
  const extraProtected = protectedSurvivors.map((survived, at) => all([survived,
    qualifying[at] === null ? null : !qualifying[at],
  ]));

  return {
    method: 'sequential-sampled',
    sampleSize: bodies.length,
    samplingUncertainty: 'descriptive-bernoulli-standard-error-not-certified',
    investmentByCheckpoint: investmentLevels.map((level, at) => ({
      level,
      calculated: sampledCount(bodies.map(({ investment }) => investment[at].calculated)),
      protected: sampledCount(bodies.map(({ investment }) => investment[at].protected)),
    })),
    terminalUnion: sampledCount(bodies.map(({ terminal }) => terminal.calculated)),
    qualifyingFunnel: sampledCount(qualifying),
    protectedSurvivors: sampledCount(protectedSurvivors),
    extraProtectedSurvivors: sampledCount(extraProtected),
    ...sampledCoverage(bodies, rolled),
  };
}

function buildId(reading: Pick<TerminalReading, 'roleId' | 'buildKey'>): string {
  return JSON.stringify([reading.roleId, reading.buildKey]);
}

function sampledCoverage(bodies: readonly SampledBody[], rolled: readonly Decision[]): Pick<
  RuneCleanupSampledFunnel, 'perReadingSupply' | 'roleBuildCoverage'
> {
  const readings = new Map<string, { slot: number; mainStatId: number; reading: TerminalReading }>();
  const builds = new Map<string, TerminalReading>();
  const evidence = bodies.map(({ slot, mainStatId, terminal }) => {
    const byReading = new Map<string, Decision>();
    const byBuild = new Map<string, Decision>();
    for (const reading of terminal.terminalReadings ?? []) {
      readings.set(reading.readingId, { slot, mainStatId, reading });
      byReading.set(reading.readingId, reading.qualifies);
      const group = buildId(reading);
      builds.set(group, reading);
      const previous = byBuild.get(group);
      byBuild.set(group, any([previous === undefined ? false : previous, reading.qualifies]));
    }
    return { byReading, byBuild };
  });

  return {
    perReadingSupply: [...readings.values()].map(({ slot, mainStatId, reading }) => ({
      readingId: reading.readingId, roleId: reading.roleId, roleName: reading.roleName,
      buildKey: reading.buildKey, buildLabel: reading.buildLabel, slot, mainStatId,
      // Other mains stay in this slot's denominator exactly as they do in the ruler.
      supply: sampledCount(bodies.flatMap((body, at) => body.slot !== slot ? [] : [
        body.mainStatId !== mainStatId ? false : evidence[at].byReading.has(reading.readingId)
          ? evidence[at].byReading.get(reading.readingId)!
          : body.terminal.terminalReadings === undefined ? null : false,
      ])),
    })),
    roleBuildCoverage: [...builds].map(([group, reading]) => {
      const terminal = bodies.map((body, at) => evidence[at].byBuild.has(group)
        ? evidence[at].byBuild.get(group)! : body.terminal.terminalReadings === undefined ? null : false);
      return {
        roleId: reading.roleId, roleName: reading.roleName, buildKey: reading.buildKey, buildLabel: reading.buildLabel,
        terminalCoverage: sampledCount(terminal),
        funnelCoverage: sampledCount(terminal.map((answer, at) => all([rolled[at], answer]))),
      };
    }),
  };
}

function verdictDecision(verdict: RunePercentileVerdict, level: OrdinarySampleCheckpointLevel): Decision {
  if (verdict === 'unavailable') return null;
  if (verdict === 'refine' || verdict === 'reapp') return true;
  return verdict === (level === 12 ? 'keep' : 'power-up');
}

/** Statistics has no account locks, holds or placement to feed the shared safeguard. */
export function withRuneStatisticsProtection(
  statistics: RuneCleanupStatistics, settings: RunePotentialSettings,
): RuneCleanupSampledFunnel {
  const answers = new Map(statistics.paths.flatMap(({ checkpoints }) => checkpoints.map(({ rune, level, advice }): [
    string, RuneCleanupSampledCheckpointAnswer,
  ] => {
    if (!advice) return [rune.id, { calculated: null, protected: null }];
    const protectedAdvice = withRunePercentileSellProtection(rune, advice, settings);
    const terminalReadings = level !== 12 || advice.unionChance === null ? undefined : advice.readings.map((reading) => ({
      readingId: reading.readingId, roleId: reading.roleId, roleName: reading.roleName,
      buildKey: reading.buildKey, buildLabel: reading.buildLabel,
      // Terminal Chance is zero or one once this exact reading has settled.
      qualifies: !reading.permitted || reading.chance?.high === 0 ? false : reading.chance?.low === 1 ? true : null,
    }));
    return [rune.id, {
      calculated: verdictDecision(advice.calculatedVerdict, level),
      protected: verdictDecision(protectedAdvice.verdict, level),
      terminalReadings,
    }];
  })));
  return calculateRuneCleanupSampledFunnel(statistics.paths, (rune) => {
    const answer = answers.get(rune.id);
    if (!answer) throw new Error(`Missing sampled checkpoint judgement: ${rune.id}.`);
    return answer;
  });
}

export async function calculateRuneCleanupStatistics(
  roles: readonly RuneRole[],
  settings: RunePotentialSettings,
  base: ReadonlyMap<string, ReferenceStats>,
  limits: Readonly<{ durationMs?: number; checkpointMs?: number; prepareQualityBoundary?: boolean }> = {},
): Promise<RuneCleanupStatistics> {
  const startedAt = performance.now();
  const deadline = startedAt + (limits.durationMs ?? 10_000);
  const checkpointMs = limits.checkpointMs ?? 350;
  let checkpointDeadline = deadline;
  const signal = { get aborted() { return performance.now() >= checkpointDeadline; } };
  const paths = runeCleanupStatisticsSamplePaths().map(({ id, checkpoints }) => ({
    id,
    checkpoints: checkpoints.map(({ level, rune }): JudgedCheckpoint => ({ level, rune, advice: null })),
  }));
  const scope = newRunePercentileReferenceScope();
  const requirement = runeChanceRequirement(settings);

  /* Give finished bodies the first read in each slot before asking about more
     expensive earlier gates. Unfinished work retains its place in the sample. */
  for (let offset = 0; offset < paths.length && performance.now() < deadline; offset += runeStatisticsSlots.length) {
    for (const level of [12, 9, 6, 3, 0] as const) {
      for (const path of paths.slice(offset, offset + runeStatisticsSlots.length)) {
        const now = performance.now();
        if (now >= deadline) break;
        const { rune } = path.checkpoints[level / 3];
        checkpointDeadline = Math.min(deadline, now + checkpointMs);
        const judgment = await judgeRunePercentile(rune, roles, settings, base, scope, {
          signal, decisionOnly: true, unionRequirement: level === 12 ? undefined : requirement,
          prepareQualityBoundary: limits.prepareQualityBoundary,
        });
        path.checkpoints[level / 3] = { rune, level, advice: runePercentileAdvice(rune, judgment, settings) };
      }
    }
  }
  return { paths, durationMs: performance.now() - startedAt };
}
