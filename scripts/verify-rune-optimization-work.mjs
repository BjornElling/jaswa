import assert from 'node:assert/strict';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';
import { prepareRuneOptimization } from '../app/lib/rune-optimization-problem.ts';
import { searchRuneBuilds } from '../app/lib/rune-optimization-search.ts';
import {
  assessRuneOptimizationSamples, runeOptimizationFinishedWarning, runeOptimizationWorkPool,
  runeOptimizationWorkWarning, trialRuneOptimizationWork,
} from '../app/lib/rune-optimization-work.ts';

const input = scenarioGenerator(20261004).scenario(0);
input.locks = {}; input.withheld = {};
input.requirements = { ...input.requirements, targets: {}, ceilings: {}, builds: [], allowBroken: true,
  slotMains: { slot2: [], slot4: [], slot6: [] } };
input.settings = { ...input.settings, depth: 'complete', gems: 'none', grinds: 'none', runesOnOtherMonsters: true };
const problem = prepareRuneOptimization(input);
const pool = runeOptimizationWorkPool(problem);
const sample = (durationMs, complete = true, backend = 'cpu') => ({ durationMs, complete, backend });
assert.equal(runeOptimizationWorkWarning(undefined, 1000).tone, null);
const consistent = assessRuneOptimizationSamples(pool, [sample(100), sample(110), sample(120)], 32, 1);
assert.equal(consistent.kind, 'sampled');
assert.equal(runeOptimizationWorkWarning(consistent, 1000).tone, 'warn');
assert.equal(runeOptimizationWorkWarning(consistent, 100).tone, 'bad');
assert.equal(runeOptimizationWorkWarning(consistent, 600000).tone, null);
for (const samples of [[], [sample(100)], [sample(10), sample(50), sample(100)],
  [sample(1), sample(1), sample(1)], [sample(100), sample(100, false), sample(100)]]) {
  const uncertain = assessRuneOptimizationSamples(pool, samples, 32, 1);
  assert.equal(uncertain.kind, 'uncertain');
  assert.equal(runeOptimizationWorkWarning(uncertain, 1).tone, null);
}
const refused = assessRuneOptimizationSamples(pool, [sample(100), sample(100), sample(100)], 32, 8);
assert.equal(refused.backend, 'cpu', 'card preference must not invent a card speed');
assert.equal(runeOptimizationFinishedWarning({ complete: false, durationMs: 100, backend: 'cpu' }).tone, 'bad');
assert.equal(runeOptimizationFinishedWarning({ complete: true, durationMs: 100, backend: 'cpu' }).tone, null);

const identity = JSON.stringify(problem);
const trial = await trialRuneOptimizationWork(problem, 1, async (question, part, parts) => ({
  outcome: searchRuneBuilds(question, part, parts), backend: 'cpu',
}));
assert.equal(trial.kind, 'complete');
assert.equal(JSON.stringify(problem), identity, 'a trial changed the real problem or its time limit');

// An unfinished full trial with three evenly measured shares must not silently mean completion.
const calls = [];
let clock = 0;
const sampled = await trialRuneOptimizationWork({ ...problem,
  craft: null, slots: problem.slots.map((slot) => Array.from({ length: 60 }, (_, at) => ({
    ...slot[at % slot.length], runeId: `${slot[at % slot.length].runeId}-${at}`,
  }))),
}, 1, async (question, part, parts) => {
  calls.push({ part, parts, limit: question.timeLimitMs });
  return { outcome: { complete: parts > 1, builds: [], nodes: 0, combinations: 0 }, backend: 'cpu' };
}, () => { clock += 8; return clock; });
assert.equal(sampled.kind, 'sampled');
assert.deepEqual(calls, [
  { part: 0, parts: 1, limit: 500 }, { part: 0, parts: 60, limit: 250 },
  { part: 30, parts: 60, limit: 250 }, { part: 59, parts: 60, limit: 250 },
]);

// Four fixed slots leave a tail, not a tree to share among spare cores.
const tail = { ...problem, craft: null, slots: problem.slots.map((slot, at) => at < 4 ? slot.slice(0, 1) : slot) };
assert.equal(runeOptimizationWorkPool(tail).width, 1);
assert.equal(runeOptimizationWorkPool({ ...problem, slots: problem.slots.map(() => []) }).combinations, 0);
console.log('PASS: real trials preserve the problem; stratified samples, uncertainty, engine reports, warning boundaries and two-slot tails agree.');
