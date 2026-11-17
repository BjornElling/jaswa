/** Benchmark the public advice engine against a passive local account export. */
import { readFileSync } from 'node:fs';
import { createImportedGame, validateGameFile } from '../app/ingest/game-export.ts';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { runeChanceRequirement } from '../app/domain/runes/cleanup/rune-percentile-readings.ts';
import {
  judgeRunePercentile, newRunePercentileReferenceScope, runePercentileAdvice,
} from '../app/domain/runes/cleanup/rune-percentile-engine.ts';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const exportPath = process.env.JASWA_IMPORT ?? `${process.env.TEMP}/claude/shots/game.json`;
const baselinePath = option('baseline', 'work/rune-percentile-account-before.json');
const limit = Number(option('runes', '1'));
const warmCount = Number(option('warm', '0'));
const timeLimit = Number(option('deadline-ms', '30000'));
const decisionOnly = process.argv.includes('--decision-only');
if (![limit, warmCount, timeLimit].every(Number.isSafeInteger) || limit < 1 || warmCount < 0 || timeLimit < 1) {
  throw new RangeError('Rune count, warm iterations and deadline must be valid integers.');
}

const raw = JSON.parse(readFileSync(exportPath, 'utf8'));
const game = createImportedGame('local-verification.json', raw, validateGameFile(raw));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const previous = new Map(baseline.rows.map(row => [row.id, row.answer.verdict]));
const runes = game.snapshot.runes.filter(rune => previous.has(rune.id));
const specialist = runes.find(rune => rune.level === 15 && previous.get(rune.id) === 'sell'
  && rune.subProperties.some(line => line.statId === 8 && line.value >= 20));
const ordered = specialist ? [specialist, ...runes.filter(rune => rune !== specialist)] : runes;
const candidates = ordered.slice(0, limit);
const roles = defaultRuneRoles();
const scope = newRunePercentileReferenceScope();
const bases = new Map(baseline.bases);
const controller = new AbortController();
const judge = rune => judgeRunePercentile(rune, roles, baseline.settings, bases, scope, {
  signal: controller.signal,
  decisionOnly,
  unionRequirement: decisionOnly ? runeChanceRequirement(baseline.settings) : undefined,
});
const timer = setTimeout(() => controller.abort(), timeLimit);
const counts = new Map();
const coldStarted = performance.now();
let completed = 0;
let rankWitnesses = 0;
let warmCompleted = 0;
let warmMs = null;
const judged = [];
try {
  for (const candidate of candidates) {
    const judgment = await judge(candidate);
    if (controller.signal.aborted) break;
    const advice = runePercentileAdvice(candidate, judgment, baseline.settings);
    const transition = `${previous.get(candidate.id)} → ${advice.calculatedVerdict}`;
    counts.set(transition, (counts.get(transition) ?? 0) + 1);
    if (advice.qualityWitness) rankWitnesses += 1;
    completed += 1;
    judged.push(candidate);
  }
  const coldMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  for (let at = 0; at < warmCount && judged.length > 0 && !controller.signal.aborted; at += 1) {
    await judge(judged[at % judged.length]);
    if (!controller.signal.aborted) warmCompleted += 1;
  }
  if (warmCount > 0) warmMs = performance.now() - warmStarted;
  console.log(JSON.stringify({ accountRunes: runes.length, requested: candidates.length, completed, coldMs, decisionOnly,
    warmRequested: warmCount, warmCompleted, warmMs, rankWitnesses, references: scope.references.size,
    deadlineReached: controller.signal.aborted, peakRssKiB: process.resourceUsage().maxRSS,
    verdictTransitions: Object.fromEntries(counts) }));
} finally {
  clearTimeout(timer);
}
