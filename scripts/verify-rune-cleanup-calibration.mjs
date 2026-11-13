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
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { runeAdvice } from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import {
  addedSubPropertyRange, bornSubPropertyCount, initialSubPropertyRange, runeInnateFrequency, slotMainProperties,
  subPropertyLevels, upgradeSubPropertyRange,
} from '../app/domain/runes/rune-properties.ts';
import { runeRarities, runeStatIds, slotAllowsSubStat } from '../app/domain/runes/runes.ts';
import { craftRollValue, craftValueRange } from '../app/domain/runes/craft/rune-craft-items.ts';
import {
  chanceRuns, judgeAgainstBuild, prepareRuneCandidate, roleBuilds,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';

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
const craftRuneCount = integerArg('craft-runes', quick ? 120 : 400);
/** Section 8's seven grindable effect ids, restated here rather than imported. */
const grindableInScript = [1, 2, 3, 4, 5, 6, 8];
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
  powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1,
};
const noCraft = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
/* The chance oracle is run twice: once with the substat RNG on its own, and once
   with both craft items credited, so the Gem decision is inside the probability
   rather than beside it. It used to run only the first, which left every path
   through `rune-craft-end-state.ts` unchecked by any simulation. The credited run is
   the product's one canonical credit, written out here rather than imported. */
const fullCraft = { gem: 'average', gemGrade: 'Legend', grind: 'average', grindGrade: 'Legend' };

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
  const prefixStatId = random() < runeInnateFrequency ? choose(random, legal) : null;
  const available = legal.filter((stat) => stat !== prefixStatId);
  const held = new Set();
  const subProperties = [];
  for (let at = 0; at < bornSubPropertyCount(runeRarities[rank - 1]); at += 1) {
    const statId = choose(random, available.filter((stat) => !held.has(stat)));
    held.add(statId);
    const range = initialSubPropertyRange(stars, statId, ancient);
    subProperties.push({ statId, value: draw(random, range.minimum, range.maximum), gemmed: false, grind: 0 });
  }
  const prefix = prefixStatId === null ? null : initialSubPropertyRange(stars, prefixStatId, ancient);
  return {
    id: String(id), setId: 1, setName: choose(random, setNames), slot, stars, ancient,
    rarity: runeRarities[rank - 1],
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
  const bornLines = bornSubPropertyCount(rune.rarity);
  for (const [eventIndex, level] of subPropertyLevels.entries()) {
    if (level <= rune.level || level > targetLevel) continue;
    if (eventIndex >= bornLines) {
      const held = new Set(rune.subProperties.map((property) => property.statId));
      const options = runeStatIds.filter((stat) => stat !== rune.mainStatId && stat !== rune.prefixStatId
        && !held.has(stat) && slotAllowsSubStat(rune.slot, stat));
      const statId = choose(random, options);
      /* A line the rune gains by power-up rolls from the ordinary table of its star
         class, Ancient or not: only born lines are Ancient. The user's own Hero and
         Rare Ancient runes carry gained lines below the Ancient minimum, which no born
         line can be. This oracle shared the opposite reading with the engine until
         October 2026, which is exactly how an oracle stops catching anything. */
      const range = addedSubPropertyRange(rune.stars, statId);
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
async function policy(source, roles, random, policySettings = settings) {
  let active = source.map(clone);
  const retained = [];
  for (const stop of [0, 9, 12]) {
    if (stop) active = active.map((rune) => powerUp(random, rune, stop));
    const advice = await runeAdvice(active, roles, policySettings, referenceStats);
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
 *
 * It runs at two craft credits. With none, the substat RNG is isolated. With both
 * items credited, the Gem decision — which depends on how the lines actually rolled
 * and so cannot be lifted out of the probability — is inside what is measured. Only
 * the first of the two existed until 23 September 2026, which left every path
 * through the craft rules unchecked by any simulation.
 */
function verifyProbability(credit, label) {
  const random = makeRandom(seed ^ 0x4d43504b);
  const roles = defaultRuneRoles();
  const fixtures = [];
  for (let attempt = 0; attempt < 4000 && fixtures.length < 12; attempt += 1) {
    const variant = [[4, false], [5, false], [6, false], [6, true]][attempt % 4];
    const rune = freshRune(random, 'chance-' + attempt, variant[0], variant[1]);
    powerUp(random, rune, [0, 3, 6, 9][attempt % 4]);
    const role = roles[attempt % roles.length];
    const build = roleBuilds(role).find((candidate) => {
      const expectedMain = rune.slot === 1 ? 3 : rune.slot === 3 ? 5 : rune.slot === 5 ? 1 : candidate.mains[rune.slot];
      return expectedMain === rune.mainStatId || ![2, 4, 6].includes(rune.slot);
    });
    const base = referenceStats.get(role.type);
    const threshold = .20 + attempt % 13 * .045;
    if (!build || !base) continue;
    const outcome = judgeAgainstBuild(rune, role, build, base, threshold, credit, true);
    if (outcome && outcome.chance > .03 && outcome.chance < .97) {
      fixtures.push({ rune, role, build, base, threshold, expected: outcome.chance });
    }
  }
  check(fixtures.length >= 8, label + ': only ' + fixtures.length + ' non-degenerate chance fixtures were found.');
  let largestDifference = 0;
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const randomTrial = makeRandom((seed + index * 0x9e3779b9) >>> 0);
    let hits = 0;
    for (let trial = 0; trial < rolloutCount; trial += 1) {
      const finalRune = powerUp(randomTrial, clone(fixture.rune), 12);
      const outcome = judgeAgainstBuild(finalRune, fixture.role, fixture.build, fixture.base,
        fixture.threshold, credit, false);
      if (outcome && outcome.maxValue + 1e-12 >= fixture.threshold) hits += 1;
    }
    const observed = hits / rolloutCount;
    const difference = Math.abs(observed - fixture.expected);
    largestDifference = Math.max(largestDifference, difference);
    /* Both sides are counted rather than derived, so the band has to carry the
       model's own run-to-run spread as well as the oracle's. */
    const spread = Math.sqrt(Math.max(.0001, fixture.expected * (1 - fixture.expected)))
      * (1 / Math.sqrt(rolloutCount) + 1 / Math.sqrt(chanceRuns));
    check(difference <= 5 * spread + .015,
      label + ' chance fixture ' + (index + 1) + ': model ' + percent(fixture.expected, 1)
      + ', simulation ' + percent(observed, 1) + ' (difference ' + (difference * 100).toFixed(2) + ' points).');
  }
  console.log(label + ' probability: ' + fixtures.length + ' independent fixtures x '
    + rolloutCount.toLocaleString('en') + ' rollouts; largest difference '
    + (largestDifference * 100).toFixed(2) + ' points.');
}

/**
 * **The Gem and Grindstone rules, written from `RUNE-CANONICAL.md` §8 rather than
 * from the engine, against every finished rune this script can build.**
 *
 * The engine's answer used to be "replace the least-contributing line", which is
 * neither what §8 permits nor what a player does: a player replaces whichever line
 * gains the most, and the two differ whenever the weakest line's best legal Gem is
 * barred by an effect id one of the other lines is holding. Nothing caught it,
 * because the only simulation in this file passed no credit.
 *
 * Which line and which stat is then chosen on a fixed reference rune, not at the
 * credit (`RUNE-CLEANUP-MATH.md` §6.1): every grindable line raised by an average
 * Legend Grindstone where that raises it, each Gem an average Legend Gem ground
 * likewise, ordinary tables. The pair that gains most there is valued at the credit,
 * and kept only where it is legal and gains there too.
 */
function independentEndState(rune, credit, valuation) {
  const lineage = rune.ancient ? 'ancient' : 'standard';
  const stoneOf = (assumption, tables, grade) => (statId) => {
    if (assumption === null || !grindableInScript.includes(statId)) return 0;
    const range = craftValueRange('grindstone', tables, statId, grade);
    return range ? craftRollValue(range, assumption) : 0;
  };
  const gemFrom = (assumption, tables, grade) => (statId) => {
    if (assumption === null) return null;
    const range = craftValueRange('gem', tables, statId, grade);
    return range ? craftRollValue(range, assumption) : null;
  };
  const grindOf = stoneOf(credit.grind, lineage, credit.grindGrade);
  const gemOf = gemFrom(credit.gem, lineage, credit.gemGrade);
  const referenceGrind = stoneOf('average', 'standard', 'Legend');
  const referenceGem = gemFrom('average', 'standard', 'Legend');
  const lines = rune.subProperties;
  const worthWith = (stone) => (statId, roll, ownGrind) => valuation.value(statId, roll + Math.max(ownGrind, stone(statId)));
  const worth = worthWith(grindOf);
  const referenceWorth = worthWith(referenceGrind);
  const held = lines.map((line) => worth(line.statId, line.value, line.grind));
  const prefix = rune.prefixStatId === null ? 0 : valuation.value(rune.prefixStatId, rune.prefixValue);
  const plain = prefix + held.reduce((sum, value) => sum + value, 0);
  if (credit.gem === null) return plain;

  /* One converted line at a time, and a later Gem may only replace that one. */
  const converted = lines.findIndex((line) => line.gemmed);
  let chosen = null;
  let chosenGain = 0;
  for (let at = 0; at < lines.length; at += 1) {
    if (converted !== -1 && at !== converted) continue;
    for (const statId of runeStatIds) {
      if (statId === rune.mainStatId || statId === rune.prefixStatId) continue;
      if (!slotAllowsSubStat(rune.slot, statId)) continue;
      if (lines.some((line, index) => index !== at && line.statId === statId)) continue;
      const roll = referenceGem(statId);
      if (roll === null) continue;
      /* A same-stat Gem must raise the base value. */
      if (statId === lines[at].statId && roll <= lines[at].value) continue;
      /* The replaced line loses its rolls. It keeps its own stone only where the
         effect id is unchanged, and the new line may then be ground like any other. */
      const kept = statId === lines[at].statId ? lines[at].grind : 0;
      const gain = referenceWorth(statId, roll, kept) - referenceWorth(lines[at].statId, lines[at].value, lines[at].grind);
      if (gain > chosenGain) { chosenGain = gain; chosen = { at, statId, kept }; }
    }
  }
  if (!chosen) return plain;
  const roll = gemOf(chosen.statId);
  if (roll === null) return plain;
  if (chosen.statId === lines[chosen.at].statId && roll <= lines[chosen.at].value) return plain;
  const gain = worth(chosen.statId, roll, chosen.kept) - held[chosen.at];
  return gain > 0 ? plain + gain : plain;
}

function verifyCraftEndState() {
  const random = makeRandom(seed ^ 0x43524654);
  const roles = defaultRuneRoles();
  const credits = [
    noCraft,
    { gem: null, gemGrade: 'Hero', grind: 'maximum', grindGrade: 'Legend' },
    { gem: 'maximum', gemGrade: 'Legend', grind: null, grindGrade: 'Hero' },
    { gem: 'average', gemGrade: 'Normal', grind: 'maximum', grindGrade: 'Legend' },
    { gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero' },
    fullCraft,
  ];
  let compared = 0;
  let largest = 0;
  let worstCase = '';
  for (let index = 0; index < craftRuneCount; index += 1) {
    const variant = [[4, false], [5, false], [6, false], [6, true]][index % 4];
    const rune = powerUp(random, freshRune(random, 'craft-' + index, variant[0], variant[1]), 12);
    /* Runes that already carry craft are where rules 2 and 3 bite: a converted line
       restricts which line may be replaced at all, and a stone already on a line is
       kept only where the Gem leaves its effect id alone. */
    if (index % 3 === 1 && rune.subProperties.length > 0) rune.subProperties[0].gemmed = true;
    if (index % 3 === 2) {
      for (const line of rune.subProperties) {
        if (grindableInScript.includes(line.statId)) line.grind = draw(random, 1, 40);
      }
    }
    const role = roles[index % roles.length];
    const base = referenceStats.get(role.type);
    const build = roleBuilds(role).find((candidate) => {
      const expectedMain = rune.slot === 1 ? 3 : rune.slot === 3 ? 5 : rune.slot === 5 ? 1 : candidate.mains[rune.slot];
      return expectedMain === rune.mainStatId || ![2, 4, 6].includes(rune.slot);
    });
    if (!build || !base) continue;
    for (const credit of credits) {
      const candidate = prepareRuneCandidate(rune, role, build, base, credit);
      if (!candidate) continue;
      const expected = independentEndState(rune, credit, candidate.valuation);
      const difference = Math.abs(candidate.best - expected);
      compared += 1;
      if (difference > largest) {
        largest = difference;
        worstCase = 'rune ' + rune.id + ' slot ' + rune.slot + ', gem ' + credit.gem
          + '/' + credit.gemGrade + ', grind ' + credit.grind + '/' + credit.grindGrade
          + ': engine ' + candidate.best.toFixed(9) + ', the rules ' + expected.toFixed(9);
      }
    }
  }
  check(compared > 0, 'no finished rune reached the craft end-state comparison.');
  check(largest <= 1e-9, 'the engine and the rules disagree about a crafted end state — ' + worstCase);
  console.log('Craft end state: ' + compared.toLocaleString('en')
    + ' finished runes x credits agreed with the rules to ' + largest.toExponential(2) + '.');
}
/**
 * Four and five star ordinary runes and six star Ancient runes must all enter the
 * same decision engine. This is not a quality expectation (lower stars can quite
 * properly be sold); it catches the much worse error of importing a rune that no
 * calculation can ever see.
 */
async function verifyVariants() {
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
    const advice = await runeAdvice(sample, defaultRuneRoles(), settings, referenceStats);
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
async function verifyMixedBox() {
  const random = makeRandom(seed);
  const source = Array.from({ length: runeCount }, (_, id) => freshRune(random, 'mixed-' + id));
  /* The page always credits the canonical Gem and Grindstone; the separate
     probability oracle covers both bare and crafted runes. */
  const retained = await policy(source, defaultRuneRoles(), random, settings);
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
  /* The larger complete-funnel holdout owns the statistical slot-balance gate. */
  const attribution = new Map();
  for (const { answer } of retained) {
    const name = answer?.role?.name ?? 'unassigned';
    attribution.set(name, (attribution.get(name) ?? 0) + 1);
  }
  console.log('Best-match attribution: ' + [...attribution.entries()]
    .sort((left, right) => right[1] - left[1]).map(([name, count]) => name + ' ' + percent(count, retained.length)).join('; ') + '.');
}
console.log('Rune Clean-up calibration — ' + runeCount.toLocaleString('en') + ' mixed runes, seed ' + seed + '.');
verifyProbability(noCraft, 'No craft');
verifyProbability(fullCraft, 'Gem and stone');
verifyCraftEndState();
await verifyVariants();
await verifyMixedBox();
if (failures) {
  console.error('\n' + failures + ' calibration check' + (failures === 1 ? '' : 's') + ' failed.');
  process.exit(1);
}
console.log('\nPASS: independent chance simulation, rating parity, and population smoke test all hold.');
