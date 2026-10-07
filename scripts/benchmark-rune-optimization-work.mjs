/** Local-only measurements; an optional captured optimization input never leaves this machine.
 * node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs scripts/benchmark-rune-optimization-work.mjs [input.json]
 * Set JASWA_BENCH_GPU=1 to exercise the normal graphics-card agreement gate.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';

const source = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : scenarioGenerator(20261004, [35, 45]).scenario(0);
const make = (name, requirements = {}, settings = {}, changes = {}) => ({ name, input: {
  ...source, holds: {}, spared: [], ...changes,
  requirements: { ...source.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: true, allowIntangible: false, targets: {}, ceilings: {}, alwaysCrits: false, rankBy: 'dmg', ...requirements },
  settings: { ...source.settings, depth: 'complete', gems: 'none', grinds: 'none', resultCount: 10,
    runesOnOtherMonsters: true, ...settings },
} });
const cases = [
  make('rank only'),
  make('several loose floors', { targets: { spd: 120, hp: 10000, acc: 15, criRate: 30 } }),
  make('impossible floor', { targets: { spd: 100000 } }),
  make('two free set slots', { builds: ['Violent'] }),
  make('all sets specified', { builds: ['Violent/Will'], allowBroken: false }),
  make('Intangible allowed', { allowIntangible: true }),
  make('owned items', {}, { gems: 'owned', grinds: 'owned', allowImmemorial: true }),
  make('assumed Gems', {}, { gems: 'theoretical' }),
  make('assumed Grindstones', {}, { grinds: 'theoretical' }),
  make('assumed both', {}, { gems: 'theoretical', grinds: 'theoretical' }),
  make('owned with ceiling', { ceilings: { spd: 180 } }, { gems: 'owned', grinds: 'owned', allowImmemorial: true }),
  make('100 rows', {}, { resultCount: 100 }),
  make('depth 1', {}, { depth: 'quick' }),
  make('four locked slots', {}, {}, {
    holds: Object.fromEntries([1, 2, 3, 4].map((slot) => [source.runes.find((rune) => rune.slot === slot).id, { locked: true }])),
    runes: source.runes.map((rune) => [1, 2, 3, 4].some((slot) => source.runes.find((candidate) => candidate.slot === slot).id === rune.id)
      ? { ...rune, occupiedId: source.unitId } : rune),
  }),
];
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/');
  for (const scenario of cases) {
    const report = await page.evaluate(async ({ input, preferWebGpu }) => {
      const { prepareRuneOptimization, estimateRuneOptimizationBuilds } = await import('/app/lib/rune-optimization-problem.ts');
      const { trialRuneOptimizationWork, runeOptimizationWorkWarning } = await import('/app/lib/rune-optimization-work.ts');
      const { timeRuneBuildSearch } = await import('/app/lib/compute/rune-optimization-engine.ts');
      const { optimizeRuneBuilds, searchWorkerCount } = await import('/app/lib/compute/rune-optimization-client.ts');
      const start = performance.now();
      const problem = prepareRuneOptimization(input);
      const preparationMs = performance.now() - start;
      const trialStart = performance.now();
      const work = await trialRuneOptimizationWork(problem, searchWorkerCount(), (problem, part, parts) =>
        timeRuneBuildSearch(problem, part, parts, preferWebGpu));
      const trialMs = performance.now() - trialStart;
      // A cap makes even a difficult theory measurable; stopped is not a completion time.
      const answer = await optimizeRuneBuilds(input, preferWebGpu, undefined, undefined, { ...problem, timeLimitMs: 3000 });
      return {
        runes: input.runes.length, raw: estimateRuneOptimizationBuilds(input), preparationMs, trialMs,
        slots: work.slots, variants: work.variants, recipes: work.slots.reduce((sum, count) => sum + count, 0),
        trial: work.kind, lowerMs: work.lowerMs, upperMs: work.upperMs,
        warning: runeOptimizationWorkWarning(work, problem.timeLimitMs).tone,
        complete: answer.status === 'done' && answer.answer.complete,
        searchMs: answer.status === 'done' ? answer.answer.durationMs : null,
        engine: answer.status === 'done' ? answer.answer.backend : 'failed',
      };
    }, { input: scenario.input, preferWebGpu: process.env.JASWA_BENCH_GPU === '1' });
    console.log(JSON.stringify({ name: scenario.name, ...report }));
  }
} finally { await browser.close(); }
