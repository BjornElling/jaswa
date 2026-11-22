import assert from 'node:assert/strict';
import { craftedRangeScenarios, scenarioGenerator, stockGuidanceScenarios } from './rune-optimization-scenarios.mjs';
import { prepareRuneOptimization, buildFigures, figureIndex } from '../app/domain/runes/optimization/rune-optimization-problem.ts';
import { effectSlot } from '../app/domain/combat/monster-stats.ts';
import { runeOptimizationDepths, runeOptimizationSettingChecks } from '../app/domain/profiles/rune-optimization-settings.ts';
import { mergeBuildResults, searchRuneBuilds } from '../app/domain/runes/optimization/rune-optimization-search.ts';
import { assumedCraftHalf, craftVariants, heldCraftHalf } from '../app/domain/runes/craft/rune-craft-end-state.ts';

// Fixed wide pools expose the depth cut; small brute-force cases hold exact reductions elsewhere.
const generator = scenarioGenerator(20261003, [14, 18]);
const identities = (problem) => problem.slots.map((slot) => new Set(slot.map((candidate) =>
  `${candidate.runeId}|${candidate.gemmedAt}|${candidate.effects}|${candidate.stock}`)));
for (let index = 0; index < 8; index += 1) {
  const input = generator.scenario(index);
  input.locks = {}; input.withheld = {};
  input.settings = { ...input.settings, gems: 'none', grinds: 'none', runesOnOtherMonsters: true, resultCount: 10 };
  input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: true, allowIntangible: false, alwaysCrits: false, rankBy: index % 2 ? 'ehp' : 'dmg', ceilings: {} };
  input.runes = input.runes.filter((rune) => rune.setId !== 25).map((rune) => ({ ...rune, setId: 13 }));
  const sample = Array.from({ length: 6 }, (_, slot) => input.runes.find((rune) => rune.slot === slot + 1));
  const figures = buildFigures(input.monster, sample.map((rune) => ({ rune, mainValue: rune.mainValue, lines: rune.subProperties })), input.requirements);
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
  const inInventory = identities(prepareRuneOptimization(input));
  identities(problems[0]).forEach((slot, at) => assert.deepEqual(inInventory[at], slot,
    `account ${index}: a different engraved build changed the shortlist`));
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
console.log('PASS: Depth 1 finds the depth-10 optimum on eight fixed wide pools; finite depths keep every shallower candidate, changing the engraved build leaves the shortlist unchanged, and empty and impossible questions return no builds.');

for (const depth of runeOptimizationDepths) assert.ok(runeOptimizationSettingChecks.depth(depth));

// Identical rune stats isolate set bonuses from rune quality and Gem alternatives.
const setInput = generator.scenario(0);
setInput.locks = {}; setInput.withheld = {};
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

/* A stated two-set build leaves free slots whose neutral set identity cannot
   affect a DMG-only question. The exact reduction may merge those sets, but an
   Intangible must keep them distinct because its completion depends on the set
   counts. */
const neutralSets = [1, 2, 3, 7, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const neutralInput = {
  ...setInput,
  runes: templates.flatMap((rune, slot) => neutralSets.map((setId, at) => ({
    ...rune, id: `neutral-${slot}-${at}`, setId, occupiedId: null,
  }))),
  requirements: { ...setInput.requirements, builds: ['Violent'], allowBroken: true, allowIntangible: false,
    targets: {}, ceilings: {}, rankBy: 'dmg' },
  settings: { ...setInput.settings, depth: 'quick', resultCount: 10 },
};
const neutralProblem = prepareRuneOptimization(neutralInput);
assert.ok(neutralProblem.report.slots.some((report) => report.undominated < report.eligible),
  'neutral sets in a free slot should share an exact dominance group');
const intangibleNeutral = prepareRuneOptimization({ ...neutralInput,
  requirements: { ...neutralInput.requirements, allowIntangible: true },
});
assert.ok(intangibleNeutral.report.slots.every((report) => report.undominated === report.eligible),
  'sets must stay distinct when an Intangible could complete one of them');
console.log('PASS: free-slot neutral sets merge only when their identity cannot affect the question or Intangible completion.');

/* A ceiling needs quiet complements as well as high individual scores. Two wide
   slots each have eight high-damage, +10 SPD runes followed by four quieter
   alternatives. Two high choices exceed the ceiling, while high + quiet is
   valid; the low-contribution lane must keep those alternatives at depth 1. */
const ceilingInput = generator.scenario(0);
ceilingInput.locks = {}; ceilingInput.withheld = {};
ceilingInput.settings = { ...ceilingInput.settings, depth: 'quick', gems: 'none', grinds: 'none', runesOnOtherMonsters: true, resultCount: 10 };
ceilingInput.requirements = { ...ceilingInput.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
  allowBroken: true, allowIntangible: false, alwaysCrits: false, alwaysElementAdvantage: false,
  leads: {}, targets: {}, ceilings: { spd: 115 }, rankBy: 'dmg' };
const ceilingTemplates = Array.from({ length: 6 }, (_, slot) => ceilingInput.runes.find((rune) => rune.slot === slot + 1));
ceilingInput.runes = [];
let ceilingId = 1;
for (let slot = 1; slot <= 6; slot += 1) {
  const count = slot === 2 || slot === 4 ? 12 : 1;
  for (let at = 0; at < count; at += 1) {
    const template = ceilingTemplates[slot - 1];
    if (!template) throw new Error(`Missing ceiling template for slot ${slot}`);
    const high = at < 8;
    ceilingInput.runes.push({ ...template, id: `ceiling-${ceilingId++}`, setId: 13, setName: 'Violent', occupiedId: null,
      subProperties: slot === 2 || slot === 4 ? [
        { statId: 8, value: high ? 10 : 0, gemmed: false, grind: 0 },
        { statId: 10, value: high ? 80 + at : 20 + at, gemmed: false, grind: 0 },
      ] : [] });
  }
}
const ceilingProblem = prepareRuneOptimization(ceilingInput);
assert.ok(ceilingProblem.slots[1].some((candidate) => candidate.effects[effectSlot.spdFlat] === 0),
  'depth 1 must retain quiet slot-2 complements for a SPD ceiling');
assert.ok(ceilingProblem.slots[3].some((candidate) => candidate.effects[effectSlot.spdFlat] === 0),
  'depth 1 must retain quiet slot-4 complements for a SPD ceiling');
const ceilingQuick = searchRuneBuilds(ceilingProblem);
ceilingInput.settings.depth = 'complete';
const ceilingCompleteProblem = prepareRuneOptimization(ceilingInput);
const ceilingComplete = searchRuneBuilds(ceilingCompleteProblem);
assert.ok(ceilingQuick.builds.length > 0 && ceilingComplete.builds.length > 0,
  'the ceiling case must leave a feasible answer');
assert.equal(ceilingQuick.builds[0].figures[ceilingProblem.rank], ceilingComplete.builds[0].figures[ceilingCompleteProblem.rank],
  'the ceiling lane must keep the best low-depth answer');
console.log('PASS: the depth cut keeps quiet ceiling complements and depth 1 matches the complete ceiling answer.');

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

// An already engraved Intangible can finish a set without spending another slot.
// Three two-sets each one piece short need two slots and that one credit, not three.
const intangible = generator.scenario(0);
intangible.locks = {}; intangible.withheld = {};
intangible.settings = { ...intangible.settings, depth: 'complete', gems: 'none', grinds: 'none', runesOnOtherMonsters: true };
intangible.requirements = { ...intangible.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
  allowBroken: true, allowIntangible: true, alwaysCrits: false, alwaysElementAdvantage: false,
  leads: {}, targets: {}, ceilings: {}, rankBy: 'ehp' };
intangible.runes = Array.from({ length: 6 }, (_, slot) => ({
  ...intangible.runes.find((rune) => rune.slot === slot + 1),
  id: String(slot + 1), occupiedId: null, setId: [1, 2, 4, 25, 1, 2][slot], subProperties: [], prefixStatId: null, prefixValue: 0,
}));
const exactFigures = buildFigures(intangible.monster, intangible.runes.map((rune) =>
  ({ rune, mainValue: rune.mainValue, lines: rune.subProperties })), intangible.requirements);
intangible.settings.unfinishedAtMaximum = false;
intangible.requirements.targets = Object.fromEntries(['hp', 'def', 'criRate'].map((key) => [key, exactFigures[figureIndex(key)]]));
const intangibleResult = searchRuneBuilds(prepareRuneOptimization(intangible));
assert.equal(intangibleResult.builds.length, 1, 'an engraved Intangible lost the only Energy/Guard/Blade build');
assert.deepEqual(intangibleResult.builds[0].figures, exactFigures);
console.log('PASS: an engraved Intangible lets Energy, Guard and Blade all complete with only two slots left.');

/* Two incomplete sets are not a choice the optimizer may invent. With broken
   sets allowed, the one Intangible remains a usable broken rune and completes
   neither set; with broken sets refused, the shared noBrokenSets rule rejects it. */
const ambiguousIntangible = { ...intangible,
  requirements: { ...intangible.requirements, targets: {}, ceilings: {}, allowBroken: true },
  runes: Array.from({ length: 6 }, (_, slot) => ({
    ...intangible.runes[slot], id: String(slot + 1), occupiedId: null,
    setId: [1, 2, 25, 3, 3, 3][slot],
  })),
};
const ambiguousProblem = prepareRuneOptimization(ambiguousIntangible);
const ambiguousResult = searchRuneBuilds(ambiguousProblem);
assert.equal(ambiguousResult.builds.length, 1,
  'an ambiguous Intangible must remain usable when broken sets are allowed');
assert.equal(ambiguousResult.builds[0].figures[ambiguousProblem.rank],
  buildFigures(ambiguousIntangible.monster, ambiguousIntangible.runes.map((rune) =>
    ({ rune, mainValue: rune.mainValue, lines: rune.subProperties })), ambiguousIntangible.requirements)[ambiguousProblem.rank],
  'an ambiguous Intangible must add no guessed set bonus');
console.log('PASS: an Intangible that could complete two sets completes neither, without being discarded when broken sets are allowed.');

const craftedGenerator = scenarioGenerator(20261004, [3, 4]);
let spendingGuides = 0;
for (let at = 0; at < 16; at += 1) {
  const input = craftedGenerator.scenario(at);
  input.locks = {}; input.withheld = {};
  input.settings = { ...input.settings, depth: 'quick', gems: 'owned', grinds: 'owned', runesOnOtherMonsters: true, resultCount: 10 };
  input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
    allowBroken: at % 2 === 0, allowIntangible: true, targets: { spd: 120 }, ceilings: {}, rankBy: 'dmg' };
  const problem = prepareRuneOptimization(input);
  spendingGuides += problem.guides.filter((guide) => guide.some((pick, slot) => problem.slots[slot][pick].stock.length > 0)).length;
  const reference = searchRuneBuilds({ ...problem, guides: [] });
  const seeded = searchRuneBuilds(problem);
  const split = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3)), problem.rank, problem.resultCount, problem.tieBreakers);
  assert.ok(reference.complete && seeded.complete && split.complete, 'crafted seed agreement must finish');
  assert.deepEqual(seeded.builds, reference.builds, `crafted account ${at}: seeds changed the exact table`);
  assert.deepEqual(split.builds, reference.builds, `crafted account ${at}: splitting counted a guide twice or lost a build`);
}
assert.ok(spendingGuides > 0, 'crafted guide checks spent no held item');
console.log(`PASS: seeded, unseeded and split tables agree on 16 crafted accounts, including ${spendingGuides} guides spending held items.`);

// Independent supply fixtures hold the alternatives that a search-vs-search
// comparison cannot detect: both searches would otherwise share the missing item.
const heldStone = (id, statId, grade, amount) => ({ id, kind: 'grindstone', lineage: 'standard', setId: 13,
  setName: 'Violent', statId, statName: '', grade, amount });
const partialSupply = heldCraftHalf('grindstone', [
  { item: heldStone('speed', 8, 'Legend', 1), stock: 0 },
  { item: heldStone('attack', 4, 'Legend', 1), stock: 1 },
], 'maximum');
const partial = craftVariants({ gem: null, grind: partialSupply }, 3, 5, null,
  [{ statId: 8, value: 10, grind: 0, gemmed: false }, { statId: 4, value: 10, grind: 0, gemmed: false }],
  true, () => true, false);
assert.deepEqual(new Set(partial.map((variant) => [...variant.stock].sort().join(','))), new Set(['', '0', '1', '0,1']),
  'each held stone must be independently optional');

const supplyInput = generator.scenario(0);
supplyInput.locks = {}; supplyInput.withheld = {};
supplyInput.monster = { ...supplyInput.monster, spd: 101 };
supplyInput.requirements = { ...supplyInput.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
  allowBroken: true, allowIntangible: false, alwaysCrits: false,
  alwaysElementAdvantage: false, leads: {}, targets: {}, ceilings: {}, rankBy: 'spd' };
supplyInput.settings = { ...supplyInput.settings, gems: 'none', grinds: 'owned', grindRollAssumption: 'maximum',
  runesOnOtherMonsters: true, resultCount: 1 };
supplyInput.runes = Array.from({ length: 6 }, (_, at) => ({
  ...templates[at], id: `supply-${at}`, occupiedId: null, setId: 13, prefixStatId: null, prefixValue: 0,
  mainStatId: [3, 4, 5, 10, 1, 6][at], mainValue: [160, 63, 160, 80, 2448, 63][at], level: 15,
  subProperties: [{ statId: 8, value: 10, grind: 0, gemmed: false }],
}));
supplyInput.craftItems = [heldStone('legend', 8, 'Legend', 1), heldStone('hero', 8, 'Hero', 5)];
for (const depth of ['quick', 'complete']) {
  supplyInput.settings.depth = depth;
  const problem = prepareRuneOptimization(supplyInput);
  const answer = searchRuneBuilds(problem);
  assert.ok(answer.complete && answer.builds.length === 1);
  assert.equal(answer.builds[0].figures[figureIndex('spd')], 101 + 60 + 5 + 5 * 4,
    `${depth}: one Legend stone and five Hero stones must beat using only the best held grade`);
  const spent = answer.builds[0].picks.flatMap((pick, at) => problem.slots[at][pick].stock);
  assert.equal(spent.filter((at) => at === 0).length, 1);
  assert.equal(spent.filter((at) => at === 1).length, 5);
}

supplyInput.settings = { ...supplyInput.settings, depth: 'quick', grinds: 'theoretical' };
supplyInput.craftCredit = { ...supplyInput.craftCredit, grind: { grade: 'Hero', roll: 'maximum', rounding: 'up' } };
supplyInput.requirements.ceilings = { spd: 111 };
supplyInput.runes = supplyInput.runes.map((rune) => ({ ...rune,
  subProperties: [{ statId: 8, value: 1, grind: 0, gemmed: false }],
}));
const ceilingCraft = prepareRuneOptimization(supplyInput);
assert.equal(searchRuneBuilds(ceilingCraft).builds[0]?.figures[figureIndex('spd')], 111,
  'a theoretical stone must remain optional under a ceiling');

const removingGem = craftVariants({
  gem: assumedCraftHalf('gem', 'standard', { grade: 'Legend', roll: 'maximum', rounding: 'up' }), grind: null },
  3, 5, null, [{ statId: 8, value: 20, grind: 0, gemmed: false }], true,
  (stat) => stat === 8, true, (stat) => stat === 8);
assert.ok(removingGem.every((variant) => variant.lines[0].statId !== 8 || variant.lines[0].value >= 20),
  'a ceiling cannot permit a same-stat Gem to lower a natural base value');
assert.ok(removingGem.some((variant) => variant.lines[0].statId === 12),
  'an otherwise irrelevant Gem can remove a stat that exceeds a ceiling');
console.log('PASS: partial grinding, lower owned grades, exact shared supply at depths 1 and 10, optional theoretical stones and ceiling-reducing Gems remain reachable.');

// Two open runes keep the full Cartesian oracle affordable while different
// lineages, set-specific stacks and Immemorial alternatives compete for supply.
for (let index = 0; index < 16; index += 1) {
  const input = structuredClone(supplyInput);
  input.requirements = { ...input.requirements, rankBy: ['spd', 'dmg', 'ehp', 'atk'][index % 4],
    ceilings: {}, targets: index % 2 ? { spd: 115 } : {} };
  input.settings = { ...input.settings, depth: 'complete', gems: 'owned', grinds: 'owned', allowImmemorial: index % 3 !== 0,
    gemRollAssumption: 'maximum', grindRollAssumption: 'maximum' };
  input.runes = input.runes.map((rune, at) => ({ ...rune, occupiedId: input.unitId,
    setId: at === 2 && index % 2 ? 15 : 13, ancient: at === 2 && index % 4 === 0,
    subProperties: at === 0 || at === 2 ? [
      { statId: 2, value: 8 + index, grind: index % 3, gemmed: false },
      { statId: 4, value: 10 + index, grind: 0, gemmed: false },
      { statId: 8, value: 2, grind: 0, gemmed: index % 5 === 0 },
      { statId: 9, value: 5, grind: 0, gemmed: false },
    ] : rune.subProperties,
  }));
  input.locks = Object.fromEntries(input.runes.filter((_, at) => at !== 0 && at !== 2).map((rune) => [rune.id, 'locked']));
  input.craftItems = ['standard', 'ancient'].flatMap((lineage) => [13, 15].flatMap((setId) =>
    ['Hero', 'Legend'].flatMap((grade) => [2, 4, 8].map((statId) => ({
      ...heldStone(`${lineage}-${setId}-${grade}-${statId}`, statId, grade, 1), lineage, setId,
    })).concat({ id: `${lineage}-${setId}-gem`, kind: 'gem', lineage, setId, setName: '', statId: 8, statName: 'SPD', grade: 'Legend', amount: 1 }))));
  input.craftItems.push({ ...heldStone('universal', 8, 'Legend', 1), lineage: 'immemorial', setId: null });
  const problem = prepareRuneOptimization(input);
  const matched = searchRuneBuilds(problem);
  const expanded = searchRuneBuilds(problem, 0, 1, { allocateCraft: false });
  assert.ok(problem.craft && matched.complete && expanded.complete, `craft pool ${index}: agreement needs completed searches`);
  const reading = (answer) => answer.builds.map((build) => [build.identity, build.figures[problem.rank], build.moves]);
  assert.deepEqual(reading(matched), reading(expanded), `craft pool ${index}: matching differs from enumerating all owned plans`);
  assert.equal(matched.builds.length, 1, `craft pool ${index}: one physical combination must give one row`);
  const copied = structuredClone(problem);
  assert.equal(copied.craft.sourceSlots, copied.slots, 'worker cloning must preserve the prepared recipe source');
  assert.deepEqual(searchRuneBuilds(copied).builds, matched.builds, 'sharing prepared recipes must keep the same result');
}
console.log('PASS: 16 richer held-item pools agree with full craft enumeration across standard, Ancient, set-specific and Immemorial supply, including converted lines and worker cloning.');

let constrainedQualityRows = 0;
for (const [index, source] of craftedRangeScenarios().slice(0, 6).entries()) {
  const input = { ...source, runes: source.runes.flatMap((rune) => rune.slot < 5 ? [rune]
    : Array.from({ length: 6 }, (_, at) => ({ ...rune, id: `${rune.id}-quality-${at}`,
      subProperties: rune.subProperties.map((line) => ({ ...line, value: line.value + at % 3 })),
    }))) };
  const anchorProblem = prepareRuneOptimization(input);
  const anchor = searchRuneBuilds(anchorProblem);
  assert.ok(anchor.complete && anchor.builds.length > 0, 'crafted quality needs a completed anchor');
  const stat = ['spd', 'atk', 'hp'][index % 3];
  const center = anchor.builds[0].figures[figureIndex(stat)];
  input.requirements = { ...input.requirements,
    targets: { [stat]: center - 2 }, ceilings: { [stat]: center + 2 } };
  const quickProblem = prepareRuneOptimization({ ...input, settings: { ...input.settings, depth: 'quick' } });
  const fullProblem = prepareRuneOptimization(input);
  const quick = searchRuneBuilds(quickProblem);
  const full = searchRuneBuilds(fullProblem);
  assert.ok(quick.complete && full.complete && full.builds.length > 0, `crafted quality ${index}: a timeout proves no quality`);
  assert.equal(quick.builds[0].figures[quickProblem.rank], full.builds[0].figures[fullProblem.rank],
    `crafted quality ${index}: depth 1 lost the known constrained optimum`);
  constrainedQualityRows += quick.builds.length;
}
assert.ok(constrainedQualityRows >= 12, 'too few constrained quality rows were exercised');
console.log('PASS: depth 1 retains the depth-10 optimum on six wider held-item pools with tight ranges.');

const stockGuidance = stockGuidanceScenarios(27);
for (const [index, expected] of [[7, 184848], [9, 187227], [11, 189916], [15, 203109], [26, 3191]]) {
  const input = stockGuidance[index];
  const quickProblem = prepareRuneOptimization(input);
  const recipes = quickProblem.guides.map((guide) => guide.map((pick, slot) =>
    quickProblem.craft?.originalToRecipe[slot][pick] ?? pick).join(','));
  assert.equal(new Set(recipes).size, recipes.length, `stock guide ${index}: repeated recipes waste seed work`);
  const early = searchRuneBuilds({ ...quickProblem, timeLimitMs: -1 }, 0, 1, { now: () => 0 });
  assert.ok(early.builds[0]?.figures[quickProblem.rank] >= expected,
    `stock guide ${index}: an immediate stop lost a stronger or independent guide`);
  const fullProblem = prepareRuneOptimization({ ...input, settings: { ...input.settings, depth: 'complete' } });
  const quick = searchRuneBuilds(quickProblem);
  const full = searchRuneBuilds(fullProblem);
  assert.ok(quick.complete && full.complete, `stock guide ${index}: quality needs completed references`);
  assert.equal(quick.builds[0].figures[quickProblem.rank], full.builds[0].figures[fullProblem.rank],
    `stock guide ${index}: the depth-1 result lost the complete pool's optimum`);
}
console.log('PASS: five scarce-stock pools retain strong guides on an immediate stop and the depth-10 optimum at depth 1, including the independent-guide regression.');
