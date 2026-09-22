/**
 * Independent empirical guard rail for Rune Clean-up.
 *
 * It generates legal runes and plays the game's addition/upgrade loop with its
 * own PRNG. Production code supplies only the public verdict and measured final
 * value; the stochastic oracle is intentionally not a second copy of the scorer.
 *
 * The mixed-box check is a population smoke test for independent advice.
 *
 * Release run: --runes=250000 --rollouts=30000.
 */
import { defaultRunePotentialPresets } from '../app/lib/rune-potential-presets.ts';
import { runeAdvice } from '../app/lib/rune-cleanup-advice.ts';
import {
  initialSubPropertyRange, slotMainProperties, startingSubPropertyCount,
  subPropertyLevels, upgradeSubPropertyRange,
} from '../app/lib/rune-properties.ts';
import { runeDefaultGradeOrder, runeDefaultGrades, runeStatIds, slotAllowsSubStat } from '../app/lib/runes.ts';
import { judgeAgainstBuild, presetBuilds } from '../app/lib/rune-cleanup-model.ts';

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--') && arg.includes('='))
  .map((arg) => arg.slice(2).split('=', 2)));
const quick = process.argv.includes('--quick');
function integerArg(name, fallback) {
  const value = Number(args.get(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error('--' + name + ' must be a positive integer.');
  return value;
}
const runeCount = integerArg('runes', quick ? 8 : 50_000);
const rolloutCount = integerArg('rollouts', quick ? 100 : 12_000);
const variantRuneCount = integerArg('variant-runes', quick ? 1 : Math.min(60, runeCount));
const seed = integerArg('seed', 0x9e3779b9);

function makeRandom(initial) {
  let state = initial >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
const choose = (random, values) => values[Math.floor(random() * values.length)];
const draw = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const setNames = [
  'Energy', 'Guard', 'Swift', 'Blade', 'Rage', 'Focus', 'Endure', 'Fatal',
  'Despair', 'Vampire', 'Violent', 'Nemesis', 'Will', 'Shield', 'Revenge', 'Destroy',
  'Fight', 'Determination', 'Enhance', 'Accuracy', 'Tolerance', 'Seal',
];
const referenceStats = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
const settings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1,
  gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1, keepMoreForLargerSets: false,
};
/* The chance oracle isolates substat RNG. Craft outcomes have their own exhaustive
   legality checks, so an absent item is the only valid neutral credit here. */
const noCraft = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };

function initialRank(random, slot) {
  const value = random();
  return slot === 2 || slot === 4 || slot === 6
    ? value < .25 ? 3 : value < .75 ? 4 : 5
    : value < .75 ? 4 : 5;
}
function freshRune(random, id, stars = 6, ancient = false) {
  const slot = draw(random, 1, 6);
  const rank = initialRank(random, slot);
  const mainStatId = choose(random, slotMainProperties[slot]);
  const legal = runeStatIds.filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat));
  const prefixStatId = random() < .51 ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < startingSubPropertyCount(rank); at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    held.add(statId);
    const range = initialSubPropertyRange(stars, statId, ancient);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(stars, prefixStatId, ancient);
  return {
    id: String(id), setId: 1, setName: choose(random, setNames), slot, stars, ancient,
    defaultGrade: runeDefaultGrades[rank - 1],
    level: 0, mainStatId, mainValue: 0, prefixStatId,
    prefixValue: prefix ? draw(random, prefix.minimum, prefix.maximum) : 0,
    subProperties, occupiedId: null, obtainedOrder: id,
  };
}
function clone(rune) {
  return { ...rune, subProperties: rune.subProperties.map((property) => ({ ...property })) };
}
/**
 * The game loop. New substats are distinct exact property ids, not target-stat
 * categories: HP% and HP+ may coexist, while a duplicate HP% may not.
 */
function powerUp(random, rune, targetLevel) {
  const bornLines = runeDefaultGradeOrder(rune.defaultGrade);
  for (const [eventIndex, level] of subPropertyLevels.entries()) {
    if (level <= rune.level || level > targetLevel) continue;
    if (eventIndex >= bornLines) {
      const held = new Set(rune.subProperties.map((property) => property.statId));
      const options = runeStatIds.filter((stat) => stat !== rune.mainStatId && stat !== rune.prefixStatId
        && !held.has(stat) && slotAllowsSubStat(rune.slot, stat));
      const statId = choose(random, options);
      /* This property is created by a power-up. Ancient's higher table applies
         only to lines the rune was born with, not to this later addition. */
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
function policy(source, presets, random) {
  let active = source.map(clone);
  const retained = [];
  for (const stop of [0, 9, 12]) {
    if (stop) active = active.map((rune) => powerUp(random, rune, stop));
    const advice = runeAdvice(active, presets, settings, referenceStats);
    if (stop === 12) {
      for (const rune of active) {
        const answer = advice.get(rune.id);
        if (answer?.verdict !== 'sell') retained.push({ rune, answer });
      }
    } else active = active.filter((rune) => advice.get(rune.id)?.verdict !== 'sell');
  }
  return retained;
}
const percent = (part, whole) => whole ? (part / whole * 100).toFixed(2) + ' %' : '0.00 %';
const fraction = (part, whole) => whole ? part / whole : 0;
let failures = 0;
function check(condition, message) {
  if (!condition) { failures += 1; console.error('FAIL: ' + message); }
}

/**
 * Direct chance oracle. The candidate's probability comes from the model; each
 * trial progresses the exact rune independently and asks only whether the final
 * realised value reached the same bar.
 */
function verifyProbability() {
  const random = makeRandom(seed ^ 0x4d43504b);
  const presets = defaultRunePotentialPresets();
  const fixtures = [];
  for (let attempt = 0; attempt < 4000 && fixtures.length < 12; attempt += 1) {
    const variant = [[4, false], [5, false], [6, false], [6, true]][attempt % 4];
    const rune = freshRune(random, 'chance-' + attempt, variant[0], variant[1]);
    powerUp(random, rune, [0, 3, 6, 9][attempt % 4]);
    const preset = presets[attempt % presets.length];
    const build = presetBuilds(preset).find((candidate) => {
      const expectedMain = rune.slot === 1 ? 3 : rune.slot === 3 ? 5 : rune.slot === 5 ? 1 : candidate.mains[rune.slot];
      return expectedMain === rune.mainStatId || ![2, 4, 6].includes(rune.slot);
    });
    const base = referenceStats.get(preset.type);
    const threshold = .20 + attempt % 13 * .045;
    if (!build || !base) continue;
    const outcome = judgeAgainstBuild(rune, preset, build, base, threshold, noCraft, true);
    if (outcome && outcome.chance > .03 && outcome.chance < .97) {
      fixtures.push({ rune, preset, build, base, threshold, expected: outcome.chance });
    }
  }
  check(fixtures.length >= 8, 'only ' + fixtures.length + ' non-degenerate chance fixtures were found.');
  let largestDifference = 0;
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const randomTrial = makeRandom((seed + index * 0x9e3779b9) >>> 0);
    let hits = 0;
    for (let trial = 0; trial < rolloutCount; trial += 1) {
      const finalRune = powerUp(randomTrial, clone(fixture.rune), 12);
      const outcome = judgeAgainstBuild(finalRune, fixture.preset, fixture.build, fixture.base,
        fixture.threshold, noCraft, false);
      if (outcome && outcome.maxValue + 1e-12 >= fixture.threshold) hits += 1;
    }
    const observed = hits / rolloutCount;
    const difference = Math.abs(observed - fixture.expected);
    largestDifference = Math.max(largestDifference, difference);
    const fiveSigma = 5 * Math.sqrt(Math.max(.0001, fixture.expected * (1 - fixture.expected)) / rolloutCount);
    check(difference <= fiveSigma + .015,
      'chance fixture ' + (index + 1) + ': model ' + percent(fixture.expected, 1)
      + ', simulation ' + percent(observed, 1) + ' (difference ' + (difference * 100).toFixed(2) + ' points).');
  }
  console.log('Probability: ' + fixtures.length + ' independent fixtures x ' + rolloutCount.toLocaleString('en')
    + ' rollouts; largest difference ' + (largestDifference * 100).toFixed(2) + ' points.');
}
/**
 * Four and five star ordinary runes and six star Ancient runes must all enter the
 * same decision engine. This is not a quality expectation (lower stars can quite
 * properly be sold); it catches the much worse error of importing a rune that no
 * calculation can ever see.
 */
function verifyVariants() {
  const variants = [
    { stars: 4, ancient: false, name: '4-star ordinary' },
    { stars: 5, ancient: false, name: '5-star ordinary' },
    { stars: 6, ancient: true, name: '6-star Ancient' },
  ];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const random = makeRandom((seed ^ 0x56524941 ^ index) >>> 0);
    /* At +12 the check still exercises the star/Ancient table and public advice,
       without spending a chance-DP evaluation on every coverage sample. The
       independent chance fixtures above already cover unfinished states. */
    const sample = Array.from({ length: variantRuneCount }, (_, id) =>
      powerUp(random, freshRune(random, variant.name + '-' + id, variant.stars, variant.ancient), 12));
    const advice = runeAdvice(sample, defaultRunePotentialPresets(), settings, referenceStats);
    let usable = 0;
    for (const rune of sample) {
      const answer = advice.get(rune.id);
      if (answer && Number.isFinite(answer.maxValue) && Number.isFinite(answer.chance)
        && !answer.reason.startsWith('Not rated')) usable += 1;
    }
    console.log(variant.name + ': ' + usable + ' / ' + sample.length + ' received finite advice.');
    check(usable === sample.length, variant.name + ' did not reach the current rating engine.');
  }
}
function verifyMixedBox() {
  const random = makeRandom(seed);
  const source = Array.from({ length: runeCount }, (_, id) => freshRune(random, 'mixed-' + id));
  const retained = policy(source, defaultRunePotentialPresets(), random);
  const rate = retained.length / source.length;
  console.log('Mixed box: ' + retained.length.toLocaleString('en') + ' / ' + source.length.toLocaleString('en')
    + ' retained (' + percent(retained.length, source.length) + ').');
  /* The model intentionally has no universal retained-rate promise: it depends on
     the target vocabulary and user standards. An empty or near-total result is
     still a regression worth catching. */
  if (!quick) check(rate > 0 && rate < .8, 'middle policy retained ' + percent(retained.length, source.length)
    + '; the synthetic population unexpectedly collapsed or saturated.');
  const slots = [1, 2, 3, 4, 5, 6].map((slot) => ({
    slot, seen: source.filter((rune) => rune.slot === slot).length,
    kept: retained.filter(({ rune }) => rune.slot === slot).length,
  }));
  const rates = slots.map(({ seen, kept }) => fraction(kept, seen));
  const spread = Math.max(...rates) / Math.max(1e-9, Math.min(...rates));
  console.log('Slots: ' + slots.map(({ slot, kept, seen }) => slot + '=' + percent(kept, seen)).join(', ')
    + '; spread ' + spread.toFixed(3) + 'x.');
  /* Slot distribution is reported, not forced. A preset count is the user's
     stated preference; forcing six equal slot buckets would silently overwrite it. */
  const attribution = new Map();
  for (const { answer } of retained) {
    const name = answer?.preset?.name ?? 'unassigned';
    attribution.set(name, (attribution.get(name) ?? 0) + 1);
  }
  console.log('Best-match attribution: ' + [...attribution.entries()]
    .sort((left, right) => right[1] - left[1]).map(([name, count]) => name + ' ' + percent(count, retained.length)).join('; ') + '.');
}
console.log('Rune Clean-up calibration — ' + runeCount.toLocaleString('en') + ' mixed runes, seed ' + seed + '.');
verifyProbability();
verifyVariants();
verifyMixedBox();
if (failures) {
  console.error('\n' + failures + ' calibration check' + (failures === 1 ? '' : 's') + ' failed.');
  process.exit(1);
}
console.log('\nPASS: independent chance simulation, rating parity, and population smoke test all hold.');
