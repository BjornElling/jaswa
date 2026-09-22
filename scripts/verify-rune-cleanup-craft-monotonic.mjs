/**
 * Regression guard for Rune Clean-up craft monotonicity.
 *
 * A Gem or Grindstone is an optional way to improve a rune. It must never turn a
 * legal end state into a worse score or make the same fixed target less likely.
 * This sweep deliberately exercises more than the rune that exposed the original
 * defect: every slot, ordinary and Ancient lineages, several star classes and
 * starting grades, unfinished event schedules, already-ground lines, an existing
 * Gem line, several presets and every craft assumption.
 */
import assert from 'node:assert/strict';
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  candidateChance, candidateMaxValue, prepareRuneCandidate, presetBuilds,
} from '../app/lib/rune-cleanup-model.ts';
import {
  initialSubPropertyRange, slotMainProperties, startingSubPropertyCount,
  subPropertyLevels, upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import {
  runeDefaultGrades, runeDefaultGradeOrder, runeStatIds, slotAllowsSubStat,
} from '../app/lib/runes.ts';

const baseByType = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);

const grades = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'];
const assumptions = ['minimum', 'average', 'three-quarters', 'maximum'];
const hero = { gemGrade: 'Hero', grindstoneGrade: 'Hero' };
const neutral = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const credits = [
  neutral,
  { gem: 'minimum', ...hero, grind: null },
  { gem: 'three-quarters', ...hero, grind: null },
  { gem: 'maximum', ...hero, grind: null },
  { gem: null, ...hero, grind: 'minimum' },
  { gem: null, ...hero, grind: 'three-quarters' },
  { gem: null, ...hero, grind: 'maximum' },
  { gem: 'minimum', ...hero, grind: 'maximum' },
  { gem: 'three-quarters', ...hero, grind: 'three-quarters' },
  { gem: 'maximum', ...hero, grind: 'minimum' },
  { gem: 'three-quarters', gemGrade: 'Normal', grind: 'three-quarters', grindGrade: 'Legend' },
  { gem: 'three-quarters', gemGrade: 'Legend', grind: 'three-quarters', grindGrade: 'Normal' },
];

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
const choose = (random, values) => values[Math.floor(random() * values.length)];
const draw = (random, minimum, maximum) => minimum + Math.floor(random() * (maximum - minimum + 1));

function freshRune(random, id, { slot, stars, ancient, grade, level }) {
  const mainStatId = choose(random, slotMainProperties[slot]);
  const legal = runeStatIds.filter((statId) => statId !== mainStatId && slotAllowsSubStat(slot, statId));
  const prefixStatId = random() < 0.5 ? choose(random, legal) : null;
  const available = legal.filter((statId) => statId !== prefixStatId);
  const count = Math.min(startingSubPropertyCount(runeDefaultGradeOrder(grade)), available.length);
  const subProperties = [];
  for (let at = 0; at < count; at += 1) {
    const statId = choose(random, available.filter((candidate) =>
      !subProperties.some((line) => line.statId === candidate)));
    const range = initialSubPropertyRange(stars, statId, ancient);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefixRange = prefixStatId === null ? null : initialSubPropertyRange(stars, prefixStatId, ancient);
  return {
    id: String(id), setId: 1, setName: 'Violent', slot, stars, ancient,
    defaultGrade: grade, level, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefixRange ? draw(random, prefixRange.minimum, prefixRange.maximum) : 0,
    subProperties, occupiedId: null, obtainedOrder: id,
  };
}

function makeCraftedFixture() {
  return {
    id: 'already-crafted', setId: 1, setName: 'Violent', slot: 4, stars: 6, ancient: false,
    defaultGrade: 'Legend', level: 12, mainStatId: 6, mainValue: 0, prefixStatId: null,
    prefixValue: 0,
    subProperties: [
      { statId: 8, value: 10, gemmed: true, grind: 0 },
      { statId: 9, value: 8, gemmed: false, grind: 4 },
      { statId: 10, value: 14, gemmed: false, grind: 0 },
      { statId: 2, value: 11, gemmed: false, grind: 3 },
    ],
    occupiedId: null, obtainedOrder: 999,
  };
}

/* Independent game-loop oracle used below. It deliberately does not call the
   production branch walker; it only implements the game's addition/upgrade loop. */
function cloneRune(rune) {
  return { ...rune, subProperties: rune.subProperties.map((line) => ({ ...line })) };
}
function powerUp(random, rune, targetLevel) {
  const bornLines = runeDefaultGradeOrder(rune.defaultGrade);
  for (const [eventIndex, level] of subPropertyLevels.entries()) {
    if (level <= rune.level || level > targetLevel) continue;
    if (eventIndex >= bornLines) {
      const held = new Set(rune.subProperties.map((line) => line.statId));
      const options = runeStatIds.filter((statId) => statId !== rune.mainStatId
        && statId !== rune.prefixStatId && !held.has(statId)
        && slotAllowsSubStat(rune.slot, statId));
      const statId = choose(random, options);
      const range = upgradeSubPropertyRange(rune.stars, statId, rune.ancient);
      rune.subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
    } else {
      const line = choose(random, rune.subProperties);
      const range = upgradeSubPropertyRange(rune.stars, line.statId, rune.ancient);
      line.value += draw(random, range.minimum, range.maximum);
    }
  }
  rune.level = targetLevel;
  return rune;
}

const presets = defaultRunePotentialPresets();
const selectedPresets = presets.filter((preset) =>
  ['pvp-def', 'fast-dd', 'support', 'bruiser', 'slow-dd'].includes(preset.id));
const runes = [];
const random = makeRandom(0x51a7c0de);
let id = 0;
for (const [ancient, stars] of [[false, 4], [false, 5], [false, 6], [true, 6]]) {
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const grade = grades[(id + slot) % grades.length];
    const level = [0, 3, 6, 9, 12][(id + slot) % 5];
    id += 1;
    runes.push(freshRune(random, id, { slot, stars, ancient, grade, level }));
  }
}
runes.push(makeCraftedFixture());

const eps = 1e-10;
let comparisons = 0;
for (const rune of runes) {
  for (const preset of selectedPresets) {
    const base = baseByType.get(preset.type);
    if (!base) continue;
    const build = presetBuilds(preset).find((candidate) => {
      const expectedMain = rune.slot === 1 ? 3 : rune.slot === 3 ? 5 : rune.slot === 5 ? 1
        : candidate.mains[rune.slot];
      return expectedMain === rune.mainStatId;
    });
    if (!build) continue;
    const neutralCandidate = prepareRuneCandidate(rune, preset, build, base, neutral);
    if (!neutralCandidate) continue;
    const neutralMax = candidateMaxValue(neutralCandidate);
    const neutralRaw = neutralCandidate.best;
    for (const credit of credits) {
      const candidate = prepareRuneCandidate(rune, preset, build, base, credit);
      assert.ok(candidate, `${rune.id}/${preset.id} must remain judgeable with craft credit`);
      assert.ok(candidate.best + eps >= neutralRaw,
        `${rune.id}/${preset.id}: raw best score fell after craft credit`);
      assert.ok(candidateMaxValue(candidate) + eps >= neutralMax,
        `${rune.id}/${preset.id}: Max value fell after craft credit`);
      for (const threshold of [0.35, 0.7, 0.9]) {
        const neutralChance = candidateChance(neutralCandidate, threshold);
        const craftChance = candidateChance(candidate, threshold);
        assert.ok(craftChance + eps >= neutralChance,
          `${rune.id}/${preset.id}: chance fell at threshold ${threshold}`);
        assert.ok(craftChance >= -eps && craftChance <= 1 + eps,
          `${rune.id}/${preset.id}: chance left [0, 1]`);
        comparisons += 1;
      }
    }
  }
}

/* The concrete level-0 Tolerance rune that exposed the preselected-DEF% defect.
   This is a named regression, not the only coverage: the sweep above is the broad
   invariant that protects future changes. */
const tolerance = {
  id: 'tolerance-regression', setId: 21, setName: 'Tolerance', slot: 3, stars: 6,
  ancient: false, defaultGrade: 'Hero', level: 0, mainStatId: 5, mainValue: 0,
  prefixStatId: 12, prefixValue: 7,
  subProperties: [
    { statId: 6, value: 8, gemmed: false, grind: 0 },
    { statId: 8, value: 5, gemmed: false, grind: 0 },
    { statId: 2, value: 7, gemmed: false, grind: 0 },
  ],
  occupiedId: null, obtainedOrder: 1000,
};
const pvp = presets.find((preset) => preset.id === 'pvp-def');
const pvpBuild = pvp && presetBuilds(pvp)[4];
const pvpBase = pvp && baseByType.get(pvp.type);
assert.ok(pvp && pvpBuild && pvpBase);
const toleranceNeutralCandidate = prepareRuneCandidate(tolerance, pvp, pvpBuild, pvpBase, neutral);
const toleranceCraftCandidate = prepareRuneCandidate(tolerance, pvp, pvpBuild, pvpBase, {
  gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero',
});
assert.ok(toleranceNeutralCandidate && toleranceCraftCandidate);
assert.ok(candidateChance(toleranceCraftCandidate, 0.7) + eps
  >= candidateChance(toleranceNeutralCandidate, 0.7),
  'the Tolerance regression rune lost chance when craft was considered');
assert.ok(candidateMaxValue(toleranceCraftCandidate) + eps >= candidateMaxValue(toleranceNeutralCandidate),
  'the Tolerance regression rune lost score when craft was considered');
assert.ok(Math.abs(candidateChance(toleranceCraftCandidate, 0.7154971085912513)
  - 0.18593535665294925) < 1e-12,
  'the Tolerance regression did not use the deferred Gem calculation');

const policySettings = {
  powerUpPolicy: 2, runeQuality: 3, acceptedRunes: 2, brokenRunes: 2,
  intangibleRunes: 1, keepMoreForLargerSets: false, gemGrade: 'Hero', grindstoneGrade: 'Hero',
};
const noCraftAdvice = runeAdvice([tolerance], presets,
  { ...policySettings, enchantedGems: 1, grindstones: 1 }, baseByType);
const craftAdvice = runeAdvice([tolerance], presets,
  { ...policySettings, enchantedGems: 3, grindstones: 3 }, baseByType);
const neutralRow = noCraftAdvice.get(tolerance.id);
const craftRow = craftAdvice.get(tolerance.id);
assert.ok(neutralRow && craftRow);
assert.ok(craftRow.maxValue + eps >= neutralRow.maxValue,
  'the public advice score fell when craft was considered');
assert.ok(craftRow.chance + eps >= neutralRow.chance,
  'the public advice chance fell when craft was considered');

/* Monte Carlo is not the production calculation; it is an independent guard that
   the adaptive exact result still describes the game's own level-up loop. */
const oracleFixtures = [];
for (const rune of runes) {
  if (rune.level >= 12 || oracleFixtures.length >= 8) continue;
  for (const preset of selectedPresets) {
    const base = baseByType.get(preset.type);
    const build = presetBuilds(preset).find((candidate) => {
      const expectedMain = rune.slot === 1 ? 3 : rune.slot === 3 ? 5 : rune.slot === 5 ? 1
        : candidate.mains[rune.slot];
      return expectedMain === rune.mainStatId;
    });
    if (base && build) { oracleFixtures.push({ rune, preset, build, base }); break; }
  }
}
for (const [fixtureIndex, fixture] of oracleFixtures.entries()) {
  for (const credit of [
    { gem: 'three-quarters', gemGrade: 'Hero', grind: null, grindGrade: 'Hero' },
    { gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero' },
  ]) {
    const candidate = prepareRuneCandidate(fixture.rune, fixture.preset, fixture.build,
      fixture.base, credit);
    assert.ok(candidate);
    const expected = candidateChance(candidate, 0.7);
    const randomTrial = makeRandom(0xabc00000 + fixtureIndex * 97 + (credit.grind ? 1 : 0));
    let hits = 0;
    const trials = 800;
    for (let trial = 0; trial < trials; trial += 1) {
      const finalRune = powerUp(randomTrial, cloneRune(fixture.rune), 12);
      const finalCandidate = prepareRuneCandidate(finalRune, fixture.preset, fixture.build,
        fixture.base, credit);
      if (finalCandidate && candidateMaxValue(finalCandidate) + eps >= 0.7) hits += 1;
    }
    const observed = hits / trials;
    const tolerance = 5 * Math.sqrt(Math.max(0.0001, expected * (1 - expected)) / trials) + 0.05;
    assert.ok(Math.abs(observed - expected) <= tolerance,
      `craft oracle ${fixtureIndex}/${credit.grind ?? 'gem-only'}: model ${expected}, observed ${observed}`);
  }
}

console.log(`PASS: ${comparisons.toLocaleString('en')} craft monotonicity comparisons across ${runes.length} legal fixtures.`);
