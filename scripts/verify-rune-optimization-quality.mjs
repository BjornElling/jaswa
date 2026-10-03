import assert from 'node:assert/strict';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';
import { prepareRuneOptimization, buildFigures, figureIndex } from '../app/lib/rune-optimization-problem.ts';
import { runeOptimizationDepths, runeOptimizationSettingChecks, runeOptimizationWorkWarning } from '../app/lib/rune-optimization-settings.ts';
import { searchRuneBuilds } from '../app/lib/rune-optimization-search.ts';

// Fixed wide pools expose the depth cut; small brute-force cases hold exact reductions elsewhere.
const generator = scenarioGenerator(20261003, [14, 18]);
const identities = (problem) => problem.slots.map((slot) => new Set(slot.map((candidate) =>
  `${candidate.runeId}|${candidate.gemmedAt}|${candidate.effects}|${candidate.stock}`)));
for (let index = 0; index < 8; index += 1) {
  const input = generator.scenario(index);
  input.holds = {}; input.spared = [];
  input.settings = { ...input.settings, gems: 'none', grinds: 'none', runesOnOtherMonsters: true, resultCount: 10 };
  input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: true, allowIntangible: false, alwaysCrits: false, rankBy: index % 2 ? 'ehp' : 'dmg', ceilings: {} };
  input.runes = input.runes.filter((rune) => rune.setId !== 25).map((rune) => ({ ...rune, setId: 13 }));
  const sample = Array.from({ length: 6 }, (_, slot) => input.runes.find((rune) => rune.slot === slot + 1));
  const figures = buildFigures(input.monster, sample.map((rune) => ({ rune, mainValue: rune.mainValue, lines: rune.subProperties })), false);
  input.requirements.targets = Object.fromEntries(['spd', 'acc', 'hp'].map((stat) => [stat, Math.floor(figures[figureIndex(stat)] * 0.98)]));
  const problems = runeOptimizationDepths.map((depth) => {
    input.settings.depth = depth;
    return prepareRuneOptimization(input);
  });
  const quick = searchRuneBuilds(problems[0]);
  const complete = searchRuneBuilds(problems[9]);
  assert.ok(quick.complete && complete.complete, `account ${index}: quality must not be measured on a timeout`);
  assert.ok(complete.builds.length > 0, `account ${index}: empty tables measure no quality`);
  assert.equal(quick.builds[0].figures[problems[0].rank], complete.builds[0].figures[problems[9].rank],
    `account ${index}: depth 1 lost the known optimum`);
  for (let depth = 0; depth < 8; depth += 1) {
    const narrow = identities(problems[depth]); const wider = identities(problems[depth + 1]);
    narrow.forEach((slot, at) => slot.forEach((id) => assert.ok(wider[at].has(id), `account ${index}: deeper cut lost a shallower candidate`)));
  }
  input.settings.depth = 'quick';
  input.runes = input.runes.map((rune) => ({ ...rune, occupiedId: null }));
  const unequipped = identities(prepareRuneOptimization(input));
  identities(problems[0]).forEach((slot, at) => assert.deepEqual(unequipped[at], slot,
    `account ${index}: wearing a different current build changed the shortlist`));
}
const empty = generator.scenario(0);
empty.runes = []; empty.settings.depth = 'quick';
assert.equal(searchRuneBuilds(prepareRuneOptimization(empty)).builds.length, 0);
const impossible = generator.scenario(0);
impossible.requirements.targets = { hp: 1e12, atk: 1e12, def: 1e12, spd: 1e6, criRate: 1e6,
  criDmg: 1e6, res: 1e6, acc: 1e6, dmg: 1e15, ehp: 1e15, ehpD: 1e15 };
impossible.requirements.alwaysCrits = false;
impossible.settings.depth = 'quick';
const refused = prepareRuneOptimization(impossible);
assert.ok(refused.slots.every((slot) => slot.length === 0), 'impossible ranges should be removed before the cut');
assert.equal(searchRuneBuilds(refused).builds.length, 0);
console.log('PASS: Depth 1 finds the depth-10 optimum on eight fixed wide pools; finite depths keep every shallower candidate, changing the worn build leaves the shortlist unchanged, and empty and impossible questions return no builds.');

for (const depth of runeOptimizationDepths) assert.ok(runeOptimizationSettingChecks.depth(depth));
assert.equal(runeOptimizationWorkWarning(undefined, 'quick', true).tone, null);
assert.equal(runeOptimizationWorkWarning(undefined, 'quick', false).tone, 'warn');
assert.equal(runeOptimizationWorkWarning(1e30, 'complete', true).tone, 'bad');
assert.equal(runeOptimizationWorkWarning(16e6, 'quick', false).tone, 'warn');
assert.equal(runeOptimizationWorkWarning(16e6, 'quick', true).tone, null);

// Identical rune stats isolate set bonuses from rune quality and Gem alternatives.
const setInput = generator.scenario(0);
setInput.holds = {}; setInput.spared = [];
setInput.settings = { ...setInput.settings, gems: 'none', grinds: 'none', runesOnOtherMonsters: true };
setInput.requirements = { ...setInput.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
  allowBroken: true, allowIntangible: false, alwaysCrits: false, targets: {}, ceilings: {}, rankBy: 'dmg' };
const templates = Array.from({ length: 6 }, (_, slot) => setInput.runes.find((rune) => rune.slot === slot + 1));
setInput.runes = templates.flatMap((rune, slot) => [1, 2, 4, 5, 8, 13, 15].map((setId) => ({
  ...rune, id: `${slot}-${setId}`, setId, occupiedId: null,
})));
const ordered = () => prepareRuneOptimization(setInput, { reduce: false }).slots[0];
assert.deepEqual(new Set(ordered().slice(0, 3).map((candidate) => candidate.setId)), new Set([4, 5, 8]),
  'damage should investigate Blade, Rage and Fatal before equally strong neutral runes');
setInput.requirements.targets = { hp: 100000 };
assert.equal(ordered()[0].setId, 1, 'an extreme HP floor should give Energy search attention even when ranking damage');
setInput.requirements.targets = {}; setInput.requirements.builds = ['Violent'];
const constrained = ordered();
assert.equal(constrained[0].setId, 4, 'Blade can complete the two free slots beside Violent');
assert.equal(constrained.find((candidate) => candidate.setId === 8).proxy,
  constrained.find((candidate) => candidate.setId === 15).proxy,
  "Fatal cannot promise a completed four-set in Violent's two free slots");
console.log('PASS: free-set ordering follows damage and demanding HP targets, and does not credit a four-set that cannot fit beside the required four-set.');
