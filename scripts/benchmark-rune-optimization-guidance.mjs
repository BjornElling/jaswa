/** Compare preparation, immediate-stop quality and search work without exporting account data. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stockGuidanceScenarios } from './rune-optimization-scenarios.mjs';

// An optional local source snapshot lets the same inputs measure both implementations.
const args = process.argv.slice(2).filter((arg) => arg !== '--seed-only');
const seedOnly = process.argv.includes('--seed-only');
const modulePath = args[1] ? resolve(args[1]) : resolve('app/lib/rune-optimization-problem.ts');
const { prepareRuneOptimization } = await import(pathToFileURL(modulePath).href);
const { searchRuneBuilds } = await import(pathToFileURL(resolve(dirname(modulePath), 'rune-optimization-search.ts')).href);
const captured = args[0] && args[0] !== '--generated'
  ? JSON.parse(readFileSync(args[0], 'utf8')) : null;
const cases = captured ? [
  ['no ceiling', { ...captured.requirements, ceilings: {} }],
  ['SPD ceiling', { ...captured.requirements, ceilings: { spd: 230 } }],
].map(([name, requirements]) => ({ name, input: { ...captured, requirements,
  settings: { ...captured.settings, depth: 'quick' } } }))
  : stockGuidanceScenarios().map((input, index) => ({ name: `stock ${index}`, input }));

for (const { name, input } of cases) {
  const started = performance.now();
  const problem = prepareRuneOptimization(input);
  const preparationMs = performance.now() - started;
  const early = searchRuneBuilds({ ...problem, timeLimitMs: -1 }, 0, 1, { now: () => 0 });
  const searchStarted = performance.now();
  const answer = seedOnly ? early : searchRuneBuilds({ ...problem, timeLimitMs: 3000 });
  console.log(JSON.stringify({ name, runes: input.runes.length, preparationMs,
    guides: problem.guides.length, choices: (problem.craft?.slots ?? problem.slots).map((slot) => slot.length),
    immediateScore: early.builds[0]?.figures[problem.rank] ?? null,
    seedOnly, searchMs: seedOnly ? 0 : performance.now() - searchStarted, complete: answer.complete,
    nodes: answer.nodes, combinations: answer.combinations,
    scores: answer.builds.map((build) => build.figures[problem.rank]) }));
}
