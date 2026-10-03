/**
 * Regression guard for Rune Clean-up craft monotonicity.
 *
 * Two promises, and they are about the *rune*, not about the scale it is read on:
 *
 * 1. **A credited Gem or Grindstone is never forced.** It must never turn a legal end
 *    state into a worse score, or make a fixed score less likely to be reached.
 * 2. **One standard for every rune** (`RUNE-CLEANUP-MATH.md` §9.2). A stone the player
 *    has actually spent, no larger than the one the settings credit, changes nothing
 *    at all; a larger one can only raise the rune.
 *
 * The policy now compares the candidate's active projection against a fixed neutral
 * denominator and ordinary box, so using more credit can only help a recommendation;
 * the preference monotonicity sweep checks that complete policy separately.
 *
 * This sweep deliberately exercises more than the rune that exposed either defect:
 * every slot, ordinary and Ancient lineages, several star classes and starting
 * grades, unfinished event schedules, already-ground lines, an existing Gem line,
 * several presets and every craft assumption.
 */
import assert from 'node:assert/strict';
import { defaultRunePotentialPresets, withRefreshedMetrics } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  candidateChance, candidateMaxValue, prepareRuneCandidate, presetBuilds,
} from '../app/lib/rune-cleanup-model.ts';
import { craftPlan, grindCredit } from '../app/lib/rune-craft-end-state.ts';
import {
  initialSubPropertyRange, runeInnateFrequency, slotMainProperties, startingSubPropertyCount,
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
  const prefixStatId = random() < runeInnateFrequency ? choose(random, legal) : null;
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
/* A score in the role's own units, as a threshold in one candidate's Max-value units.
   Two credits have two perfect runes, so "0.7" means two different scores to them;
   the promise that a Gem is never forced is about one score. */
const atScore = (candidate, score) => score / candidate.ceiling;
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
    const neutralRaw = neutralCandidate.best;
    for (const credit of credits) {
      const candidate = prepareRuneCandidate(rune, preset, build, base, credit);
      assert.ok(candidate, `${rune.id}/${preset.id} must remain judgeable with craft credit`);
      assert.ok(candidate.best + eps >= neutralRaw,
        `${rune.id}/${preset.id}: raw best score fell after craft credit`);
      for (const threshold of [0.35, 0.7, 0.9]) {
        const score = threshold * neutralCandidate.ceiling;
        const neutralChance = candidateChance(neutralCandidate, threshold);
        const craftChance = candidateChance(candidate, atScore(candidate, score));
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
/* The role the defect was found under, stated here rather than read from the shipped
   list. When the shipped HP tank's DEF target rose from 1,303 to 1,580, a credited
   Gem made this bar a certain yes and the check below read that as degenerate: the
   fixture had moved, not the Gem calculation. */
const pvp = withRefreshedMetrics({
  id: 'tolerance-regression-pvp-def',
  name: 'PvP def',
  type: 'HP type',
  sets: {
    preferred: ['Endure', 'Enhance', 'Fight', 'Seal', 'Shield', 'Tolerance', 'Violent', 'Will'],
    acceptable: ['Despair', 'Destroy', 'Determination', 'Energy', 'Revenge', 'Nemesis', 'Vampire'],
  },
  slots: {
    slot2: { preferred: ['Spd', 'HP%'], acceptable: ['Def%'] },
    slot4: { preferred: ['HP%'], acceptable: ['Def%'] },
    slot6: { preferred: ['HP%'], acceptable: ['Def%'] },
  },
  artifacts: { atk: false, def: false, hp: true },
  targets: { hp: 43860, def: 1303, spd: 200, res: 80, acc: 25 },
});
const pvpBuild = pvp && presetBuilds(pvp)[4];
const pvpBase = pvp && baseByType.get(pvp.type);
assert.ok(pvp && pvpBuild && pvpBase);
const toleranceNeutralCandidate = prepareRuneCandidate(tolerance, pvp, pvpBuild, pvpBase, neutral);
const toleranceCraftCandidate = prepareRuneCandidate(tolerance, pvp, pvpBuild, pvpBase, {
  gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero',
});
assert.ok(toleranceNeutralCandidate && toleranceCraftCandidate);
const toleranceBar = 0.7 * toleranceNeutralCandidate.ceiling;
assert.ok(candidateChance(toleranceCraftCandidate, atScore(toleranceCraftCandidate, toleranceBar)) + eps
  >= candidateChance(toleranceNeutralCandidate, 0.7),
  'the Tolerance regression rune lost chance when craft was considered');
assert.ok(toleranceCraftCandidate.best + eps >= toleranceNeutralCandidate.best,
  'the Tolerance regression rune lost score when craft was considered');
/* **The Gem is spent at +12, after the rolls.** That is what this fixture has always
   been about: reserving a line for a Gem before the improvements are drawn throws
   away every improvement that lands on it, and the rune's odds fall for considering
   an item it was never obliged to spend.

   It used to be pinned as one probability to the last bit, which stopped being
   possible when the odds began to be counted rather than enumerated. What the fixture
   is for survives as three statements, and all three are exact — they are settled on
   the reachable best and worst, without a single draw:

   - a Gem raises what this rune can reach at all;
   - a bar only a Gem can clear is a certain no without one;
   - and the same bar is not a certain no with one. */
const neutralReach = toleranceNeutralCandidate.best;
const craftedReach = toleranceCraftCandidate.best;
assert.ok(craftedReach > neutralReach + eps,
  'a credited Gem did not raise what the Tolerance regression rune can reach');
/* Above what either rune can reach at all, both are certain noes, settled on the
   reachable best rather than counted. */
assert.equal(candidateChance(toleranceCraftCandidate, atScore(toleranceCraftCandidate, craftedReach * 1.01)), 0,
  'a bar above the crafted rune\'s own maximum should be a certain no');
assert.equal(candidateChance(toleranceNeutralCandidate,
  atScore(toleranceNeutralCandidate, (neutralReach + craftedReach) / 2)), 0,
  'a bar above the uncrafted rune\'s own maximum should be a certain no');
/* At a score both can argue about, the credited Gem has to be worth something large;
   a Gem reserved before the rolls would throw away every improvement landing on the
   reserved line and could not produce that. The margin is wide enough that the
   counting's own spread cannot reach it. */
const craftedBar = atScore(toleranceCraftCandidate, toleranceBar);
const withCraft = candidateChance(toleranceCraftCandidate, craftedBar);
const withoutCraft = candidateChance(toleranceNeutralCandidate, 0.7);
assert.ok(withCraft > 0 && withCraft < 1, `the Tolerance regression rune's odds went degenerate: ${withCraft}`);
assert.ok(withCraft > withoutCraft * 5,
  `the Tolerance regression did not use the deferred Gem calculation: ${withoutCraft} -> ${withCraft}`);
assert.equal(candidateChance(toleranceCraftCandidate, craftedBar), withCraft,
  'the Tolerance regression rune did not answer the same question twice the same way');

/**
 * **One standard: a stone already spent is judged exactly like a credited one.**
 *
 * The rune that exposed it: a Shield slot-3 rune at `+12`, sold for Bruiser, ground
 * to about the credited three quarters of a Hero stone — and kept at 85 %, because a
 * second reading measured the ground rune against a box and a perfect rune without a
 * stone between them. Credited, it read 70.9 % before the grind and 72.2 % after.
 *
 * So every fixture is ground for real, line by line, to exactly the credited stone and
 * then past it. At the credit the row must not move by a bit: Max value, standing,
 * preset, verdict — and chance, at `+12`, where it is settled rather than counted.
 * Past it the rune may only rise.
 */
const policySettings = {
  powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 2, brokenRunes: 2, gemRollStep: 4,
  grindstoneRollStep: 4, intangibleRunes: 1, keepMoreForLargerSets: false,
  gemGrade: 'Hero', grindstoneGrade: 'Hero',
};
const shield = {
  id: 'ground-shield', setId: 16, setName: 'Shield', slot: 3, stars: 6, ancient: false,
  defaultGrade: 'Legend', level: 12, mainStatId: 5, mainValue: 0, prefixStatId: 9, prefixValue: 4,
  subProperties: [
    { statId: 6, value: 5, gemmed: false, grind: 0 },
    { statId: 8, value: 18, gemmed: false, grind: 0 },
    { statId: 2, value: 6, gemmed: false, grind: 0 },
    { statId: 12, value: 7, gemmed: false, grind: 0 },
  ],
  occupiedId: null, obtainedOrder: 1001,
};
const creditedPlan = craftPlan('standard', {
  gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero',
});
const groundTo = (rune, extra) => ({
  ...rune, id: `${rune.id}-ground-${extra}`,
  subProperties: rune.subProperties.map((line) => {
    const stone = grindCredit(creditedPlan, line.statId);
    return stone > 0 ? { ...line, grind: Math.max(line.grind, stone + extra) } : line;
  }),
});
const standardRunes = [...runes.filter((rune) => !rune.ancient), shield];
const bare = await runeAdvice(standardRunes, presets, policySettings, baseByType);
const atCredit = await runeAdvice(standardRunes.map((rune) => groundTo(rune, 0)), presets, policySettings, baseByType);
const pastCredit = await runeAdvice(standardRunes.map((rune) => groundTo(rune, 1)), presets, policySettings, baseByType);
for (const rune of standardRunes) {
  const before = bare.get(rune.id);
  const same = atCredit.get(`${rune.id}-ground-0`);
  const more = pastCredit.get(`${rune.id}-ground-1`);
  assert.ok(before && same && more, `${rune.id} lost its row when it was ground`);
  assert.equal(same.maxValue, before.maxValue,
    `${rune.id}: a stone no larger than the credited one moved Max value from ${before.maxValue} to ${same.maxValue}`);
  assert.equal(same.standing, before.standing,
    `${rune.id}: a stone no larger than the credited one moved the standing from ${before.standing} to ${same.standing}`);
  assert.equal(same.preset?.id, before.preset?.id, `${rune.id}: grinding to the credit changed the preset`);
  if (rune.level >= 12) {
    assert.equal(same.verdict, before.verdict,
      `${rune.id}: grinding to the credit turned ${before.verdict} into ${same.verdict}`);
    assert.ok(more.standing + eps >= before.standing,
      `${rune.id}: a stone past the credit lowered the standing from ${before.standing} to ${more.standing}`);
    assert.ok(!(before.verdict === 'keep' && more.verdict === 'sell'),
      `${rune.id}: a stone past the credit turned a Keep into a Sell`);
  }
}
/* The Shield rune's own verdict is asked of the role it was sold for alone. Across
   every shipped preset its answer is whatever those presets make of it — the Support
   that replaced the old one wants its 18 SPD and keeps it — and that is not the
   regression: a Bruiser keeping it for a grind the credit had already counted is. */
const bruiser = [withRefreshedMetrics({
  id: 'shield-regression-bruiser',
  name: 'Bruiser',
  type: 'No type',
  sets: {
    preferred: ['Blade', 'Fight', 'Seal', 'Shield', 'Vampire', 'Violent', 'Will'],
    acceptable: ['Despair', 'Destroy', 'Energy', 'Rage', 'Revenge'],
  },
  slots: {
    slot2: { preferred: ['Spd', 'Atk%', 'HP%'], acceptable: ['Def%'] },
    slot4: { preferred: ['CtD%'], acceptable: ['CtR%'] },
    slot6: { preferred: ['HP%', 'Atk%'], acceptable: ['Def%'] },
  },
  artifacts: { atk: true, def: false, hp: true },
  targets: { hp: 28195, atk: 1800, def: 941, spd: 215, acc: 25, criRate: 75, criDmg: 150 },
})];
const shieldBare = (await runeAdvice([shield], bruiser, policySettings, baseByType)).get(shield.id);
const shieldGround = (await runeAdvice([groundTo(shield, 0)], bruiser, policySettings, baseByType))
  .get(`${shield.id}-ground-0`);
assert.equal(shieldBare.verdict, 'sell', 'the Shield regression rune is no longer the Sell it was');
assert.equal(shieldGround.verdict, 'sell',
  'the Shield regression rune was kept for a grind the credit had already counted');

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

console.log(`PASS: ${comparisons.toLocaleString('en')} craft monotonicity comparisons across`
  + ` ${runes.length} legal fixtures, and ${standardRunes.length} runes ground to the credit`
  + ' read exactly as they did bare.');
