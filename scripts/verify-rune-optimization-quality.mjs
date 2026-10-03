import assert from 'node:assert/strict';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';
import { prepareRuneOptimization, buildFigures, figureIndex } from '../app/lib/rune-optimization-problem.ts';
import { runeOptimizationDepths, runeOptimizationSettingChecks, runeOptimizationWorkWarning } from '../app/lib/rune-optimization-settings.ts';
import { mergeBuildResults, searchRuneBuilds } from '../app/lib/rune-optimization-search.ts';

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
  const unseeded = searchRuneBuilds({ ...problems[0], guides: [] });
  assert.deepEqual(quick.builds, unseeded.builds, `account ${index}: guide seeds changed the exhaustive table`);
  assert.equal(new Set(quick.builds.map((build) => build.picks.join(','))).size, quick.builds.length,
    `account ${index}: the seeded table counted a build twice`);
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

// A stop request keeps already checked guides even before the tree can finish.
const guided = prepareRuneOptimization({ ...setInput, requirements: { ...setInput.requirements, builds: [] } });
guided.timeLimitMs = -1;
const timed = searchRuneBuilds(guided, 0, 1, { now: () => 0 });
assert.equal(timed.complete, false);
assert.equal(timed.stoppedBy, 'time-limit');
assert.ok(timed.builds.length > 0, 'a time limit discarded feasible whole-build guides');
const stopped = searchRuneBuilds(guided, 0, 1, { shouldStop: () => true });
assert.equal(stopped.complete, false);
assert.equal(stopped.stoppedBy, 'user');
assert.ok(stopped.builds.length > 0, 'stopping discarded feasible whole-build guides');
console.log('PASS: seeded and unseeded tables agree without duplicates, and time limits and stop requests retain checked guides.');

// An already worn Intangible can finish a set without spending another slot.
// Three two-sets each one piece short need two slots and that one credit, not three.
const intangible = generator.scenario(0);
intangible.holds = {}; intangible.spared = [];
intangible.settings = { ...intangible.settings, depth: 'complete', gems: 'none', grinds: 'none', runesOnOtherMonsters: true };
intangible.requirements = { ...intangible.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
  allowBroken: true, allowIntangible: true, alwaysCrits: false, targets: {}, ceilings: {}, rankBy: 'ehp' };
intangible.runes = Array.from({ length: 6 }, (_, slot) => ({
  ...intangible.runes.find((rune) => rune.slot === slot + 1),
  id: String(slot + 1), occupiedId: null, setId: [1, 2, 4, 25, 1, 2][slot], subProperties: [], prefixStatId: null, prefixValue: 0,
}));
const exactFigures = buildFigures(intangible.monster, intangible.runes.map((rune) =>
  ({ rune, mainValue: rune.mainValue, lines: rune.subProperties })), false);
intangible.settings.unfinishedAtMaximum = false;
intangible.requirements.targets = Object.fromEntries(['hp', 'def', 'criRate'].map((key) => [key, exactFigures[figureIndex(key)]]));
const intangibleResult = searchRuneBuilds(prepareRuneOptimization(intangible));
assert.equal(intangibleResult.builds.length, 1, 'a worn Intangible lost the only Energy/Guard/Blade build');
assert.deepEqual(intangibleResult.builds[0].figures, exactFigures);
console.log('PASS: a worn Intangible lets Energy, Guard and Blade all complete with only two slots left.');

const craftedGenerator = scenarioGenerator(20261004, [3, 4]);
let spendingGuides = 0;
for (let at = 0; at < 16; at += 1) {
  const input = craftedGenerator.scenario(at);
  input.holds = {}; input.spared = [];
  input.settings = { ...input.settings, depth: 'quick', gems: 'owned', grinds: 'owned', runesOnOtherMonsters: true, resultCount: 10 };
  input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: at % 2 === 0, allowIntangible: true, targets: { spd: 120 }, ceilings: {}, rankBy: 'dmg' };
  const problem = prepareRuneOptimization(input);
  spendingGuides += problem.guides.filter((guide) => guide.some((pick, slot) => problem.slots[slot][pick].stock.length > 0)).length;
  const reference = searchRuneBuilds({ ...problem, guides: [] });
  const seeded = searchRuneBuilds(problem);
  const split = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3)), problem.rank, problem.resultCount);
  assert.ok(reference.complete && seeded.complete && split.complete, 'crafted seed agreement must finish');
  assert.deepEqual(seeded.builds, reference.builds, `crafted account ${at}: seeds changed the exact table`);
  assert.deepEqual(split.builds, reference.builds, `crafted account ${at}: splitting counted a guide twice or lost a build`);
}
assert.ok(spendingGuides > 0, 'crafted guide checks spent no held item');
console.log(`PASS: seeded, unseeded and split tables agree on 16 crafted accounts, including ${spendingGuides} guides spending held items.`);
