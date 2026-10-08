/** Local measurements; an optional captured RuneOptimizationInput stays on this computer. */
import { readFileSync } from 'node:fs';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';
import { prepareRuneOptimization } from '../app/lib/rune-optimization-problem.ts';
import { searchRuneBuilds } from '../app/lib/rune-optimization-search.ts';

const captured = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : null;
const source = captured ?? scenarioGenerator(20261004, [2, 2]).scenario(0);
const input = captured ? { ...source, settings: { ...source.settings, depth: 'quick' } } : {
  ...source, locks: {}, spared: [],
  requirements: { ...source.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: true, allowIntangible: false, alwaysCrits: false,
    targets: {}, ceilings: {}, rankBy: 'dmg' },
  settings: { ...source.settings, depth: 'complete', gems: 'owned', grinds: 'owned', allowImmemorial: true,
    runesOnOtherMonsters: true, resultCount: 5 },
  craftItems: ['gem', 'grindstone'].flatMap((kind) => [2, 4, 6, 8].flatMap((statId) =>
    ['Hero', 'Legend'].map((grade) => ({ id: `${kind}-${statId}-${grade}`, kind,
      lineage: 'immemorial', setId: null, setName: null, statId, statName: 'Synthetic', grade, amount: 2 })))),
};
const cases = [
  ['no ceiling', {}], ['loose ATK ceiling', { atk: 1e9 }],
  ['SPD ceiling', { spd: captured ? 230 : 160 }],
  ['ATK ceiling', { atk: captured ? 2400 : 1500 }],
  ['composite ceiling', { ehp: captured ? 120000 : 45000 }],
];
for (const [name, ceilings] of cases) {
  if (process.argv[3] && name !== process.argv[3]) continue;
  const started = performance.now();
  const problem = prepareRuneOptimization({ ...input, requirements: { ...input.requirements, ceilings } });
  const preparationMs = performance.now() - started;
  const searchStarted = performance.now();
  const answer = searchRuneBuilds({ ...problem, timeLimitMs: 3000 });
  console.log(JSON.stringify({ name, runes: input.runes.length, preparationMs,
    states: problem.slots.map((slot) => slot.length), choices: (problem.craft?.slots ?? problem.slots).map((slot) => slot.length),
    activeCeilings: [...problem.ceilings].filter(Number.isFinite).length,
    searchMs: performance.now() - searchStarted, complete: answer.complete,
    nodes: answer.nodes, combinations: answer.combinations,
    scores: answer.builds.map((build) => build.figures[problem.rank]) }));
}
