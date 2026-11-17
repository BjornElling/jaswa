/** Benchmark the public advice engine against a passive local account export. */
import { readFileSync } from 'node:fs';
import { createImportedGame, validateGameFile } from '../app/ingest/game-export.ts';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { lastSubPropertyLevel } from '../app/domain/runes/rune-properties.ts';
import { runeChanceRequirement } from '../app/domain/runes/cleanup/rune-percentile-readings.ts';
import {
  judgeRunePercentile, newRunePercentileReferenceScope, runePercentileAdvice,
} from '../app/domain/runes/cleanup/rune-percentile-engine.ts';
import { calculateRuneCleanupStatistics, withRuneStatisticsProtection } from '../app/domain/runes/cleanup/rune-percentile-statistics.ts';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const exportPath = process.env.JASWA_IMPORT ?? `${process.env.TEMP}/claude/shots/game.json`;
const baselinePath = option('baseline', 'work/rune-percentile-account-before.json');
const limit = Number(option('runes', '1'));
const warmCount = Number(option('warm', '0'));
const timeLimit = Number(option('deadline-ms', '30000'));
const warmTimeLimit = Number(option('warm-deadline-ms', String(timeLimit)));
const referenceStateLimit = Number(option('reference-states', '250000'));
const decisionOnly = process.argv.includes('--decision-only');
const prepareQualityBoundary = process.argv.includes('--shared-boundary');
const statistics = process.argv.includes('--statistics');
const interleave = process.argv.includes('--interleave');
const checkpointMs = Number(option('checkpoint-ms', '350'));
if (![limit, warmCount, timeLimit, warmTimeLimit, referenceStateLimit].every(Number.isSafeInteger)
  || limit < 1 || warmCount < 0 || timeLimit < 1 || warmTimeLimit < 1 || referenceStateLimit < 1) {
  throw new RangeError('Rune count, warm iterations and deadline must be valid integers.');
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const roles = defaultRuneRoles();
const bases = new Map(baseline.bases);

async function benchmarkStatistics() {
  if (!Number.isSafeInteger(checkpointMs) || checkpointMs < 1) throw new RangeError('Invalid checkpoint budget.');
  const started = performance.now();
  const result = await calculateRuneCleanupStatistics(roles, baseline.settings, bases, {
    durationMs: timeLimit, checkpointMs, prepareQualityBoundary,
  });
  const funnel = withRuneStatisticsProtection(result, baseline.settings);
  const catalogue = funnel.perReadingSupply;
  console.log(JSON.stringify({
    durationMs: performance.now() - started, solverMs: result.durationMs, checkpointMs, prepareQualityBoundary,
    checkpoints: funnel.investmentByCheckpoint.map(({ level, calculated }) => ({ level, ...calculated })),
    terminalUnion: funnel.terminalUnion, qualifyingFunnel: funnel.qualifyingFunnel,
    catalogueSeen: catalogue.length, catalogueFullyResolved: catalogue.filter(row => row.supply.unresolved === 0).length,
    peakRssKiB: process.resourceUsage().maxRSS,
  }));
}

async function benchmarkAccount() {
  const raw = JSON.parse(readFileSync(exportPath, 'utf8'));
  const game = createImportedGame('local-verification.json', raw, validateGameFile(raw));
  const previous = new Map(baseline.rows.map(row => [row.id, row.answer.verdict]));
  const runes = game.snapshot.runes;
  if (runes.length !== previous.size || runes.some(rune => !previous.has(rune.id))) {
    throw new Error('The baseline must describe every rune in the benchmark export.');
  }
  const specialist = runes.find(rune => rune.level === 15 && previous.get(rune.id) === 'sell'
    && rune.subProperties.some(line => line.statId === 8 && line.value >= 20));
  let ordered = specialist ? [specialist, ...runes.filter(rune => rune !== specialist)] : runes;
  if (interleave) {
    const finished = ordered.filter(rune => rune.level >= lastSubPropertyLevel);
    const unfinished = ordered.filter(rune => rune.level < lastSubPropertyLevel);
    ordered = Array.from({ length: Math.max(finished.length, unfinished.length) }, (_, index) =>
      [finished[index], unfinished[index]].filter(Boolean)).flat();
  }
  const candidates = ordered.slice(0, limit);
  const scope = newRunePercentileReferenceScope();
  let deadline = performance.now() + timeLimit;
  const signal = { get aborted() { return performance.now() >= deadline; } };
  const judge = rune => judgeRunePercentile(rune, roles, baseline.settings, bases, scope, {
    signal,
    decisionOnly,
    prepareQualityBoundary,
    referenceStateLimit,
    unionRequirement: decisionOnly ? runeChanceRequirement(baseline.settings) : undefined,
  });
  const counts = new Map();
  const coldStarted = performance.now();
  let completed = 0;
  let rankWitnesses = 0;
  let warmCompleted = 0;
  let warmUnresolved = 0;
  let warmMs = null;
  const judged = [];
  const byCompletion = { finished: { completed: 0, unresolved: 0 }, unfinished: { completed: 0, unresolved: 0 } };
  const preparation = { cold: { builds: 0, ms: 0 }, warm: { builds: 0, ms: 0 } };
  let phase = preparation.cold;
  scope.onQualityPreparation = (ms) => { phase.builds += 1; phase.ms += ms; };
  for (const candidate of candidates) {
    const judgment = await judge(candidate);
    if (signal.aborted) break;
    const advice = runePercentileAdvice(candidate, judgment, baseline.settings);
    const transition = `${previous.get(candidate.id)} → ${advice.calculatedVerdict}`;
    counts.set(transition, (counts.get(transition) ?? 0) + 1);
    const group = candidate.level >= lastSubPropertyLevel ? byCompletion.finished : byCompletion.unfinished;
    group.completed += 1;
    if (advice.calculatedVerdict === 'unavailable') group.unresolved += 1;
    if (advice.qualityWitness) rankWitnesses += 1;
    completed += 1;
    judged.push(candidate);
  }
  const coldMs = performance.now() - coldStarted;
  const coldDeadlineReached = signal.aborted;
  const warmStarted = performance.now();
  deadline = warmStarted + warmTimeLimit;
  phase = preparation.warm;
  for (let at = 0; at < warmCount && judged.length > 0 && !signal.aborted; at += 1) {
    const candidate = judged[at % judged.length];
    const judgment = await judge(candidate);
    if (signal.aborted) break;
    const advice = runePercentileAdvice(candidate, judgment, baseline.settings);
    warmCompleted += 1;
    if (advice.calculatedVerdict === 'unavailable') warmUnresolved += 1;
  }
  if (warmCount > 0) warmMs = performance.now() - warmStarted;
  console.log(JSON.stringify({ accountRunes: runes.length, requested: candidates.length, completed, coldMs, decisionOnly,
    prepareQualityBoundary, referenceStateLimit, interleave, byCompletion, preparation,
    warmRequested: warmCount, warmCompleted, warmUnresolved, warmMs, rankWitnesses, references: scope.references.size,
    coldDeadlineReached, warmDeadlineReached: signal.aborted, peakRssKiB: process.resourceUsage().maxRSS,
    verdictTransitions: Object.fromEntries(counts) }));
}

await (statistics ? benchmarkStatistics() : benchmarkAccount());
