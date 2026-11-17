/** Independent acceptance checks for denominator mass and numerical boundaries. */
import assert from 'node:assert/strict';
import { allStatIds } from '../app/domain/runes/rune-properties.ts';
import { buildReferenceDistribution } from '../app/domain/runes/percentile/reference-distribution.ts';
import { ScoreDistribution } from '../app/domain/runes/percentile/score-distribution.ts';
import {
  add, compare, multiply, ONE, probabilityBounds, rational, rationalFromNumber, subtract,
} from '../app/domain/runes/percentile/probability.ts';
import { canonicalUtilityRelation } from '../app/domain/runes/percentile/canonical-utility-bounds.ts';
import {
  canonicalCraftCredit, craftPlan, craftedScore, gemOptions,
} from '../app/domain/runes/craft/rune-craft-end-state.ts';

const prices = new Float64Array(13);
prices[8] = 1;
const plan = craftPlan('standard', canonicalCraftCredit);
const reading = {
  id: 'independent-spd', permitted: true, mainStatId: 10, alpha: 0.05,
  weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, statId === 8 ? 1 : 0])),
  score(body) {
    return craftedScore(plan, gemOptions(plan, prices, body.slot, body.mainStatId, body.prefixStatId),
      prices, body.subProperties, body.prefixStatId === 8 ? body.prefixValue : 0);
  },
};

// In this slot, SPD is either innate, a natural line, or a legal useful Gem.
// Thus every compatible body scores above one. Seven incompatible mains retain
// their mass. A one-state budget may be uncertain but cannot discard that mass.
const reference = await buildReferenceDistribution({ slot: 4, stars: 6, stateLimit: 1, reading });
const tail = await reference.query(1, 0.05);
assert(tail.tail.low <= 1 / 8 && tail.tail.high >= 1 / 8,
  `The budgeted reference must enclose 1/8; got [${tail.tail.low}, ${tail.tail.high}].`);
assert.notEqual(tail.passes, true, 'Incomplete work cannot certify a top-5% reading whose actual tail is 12.5%.');
let limitedCalls = 0;
const limited = await buildReferenceDistribution({ slot: 4, stars: 6, stateLimit: 1, reading: {
  ...reading,
  score(body) { limitedCalls += 1; return reading.score(body); },
} });
const uncachedRank = await limited.query(1, 0.05, 'cached');
assert.equal(limitedCalls, 0, 'Reading an unavailable cached rank must not start reference enumeration.');
assert.equal(uncachedRank.tail.high, 1 / 8, 'The compatible main limits even an untouched cache.');
const limitedTail = await limited.query(1, 0.05);
const firstCallCount = limitedCalls;
assert.deepEqual(await limited.query(1, 0.05), limitedTail);
assert.equal(limitedCalls, firstCallCount, 'Repeating an exhausted query must not spend its work budget again.');
const cachedRank = await limited.query(1, 0.05, 'cached');
assert.equal(limitedCalls, firstCallCount, 'Cached rank must use existing proofs only.');
assert(cachedRank.tail.low >= limitedTail.tail.low && cachedRank.tail.high <= limitedTail.tail.high);
await limited.query(1, 0.01);
assert(limitedCalls > firstCallCount, 'A new allowance can request proof from the same reference.');

// A separate ordered-roll oracle for this whole original-drop reference. A
// score of 30 requires a natural Legend SPD line and all four upgrades on it:
// even Hero's maximum is 6 + 3*6 + 5 = 29. The five 4..6 rolls must total 25.
// SPD is natural with probability 2/5 after integrating the 50% innate model;
// one of eight mains, one-quarter Legend, and four target choices remain.
let successful = 0;
const orderedRolls = (depth, total) => {
  if (depth === 5) { if (total >= 25) successful += 1; return; }
  for (let value = 4; value <= 6; value += 1) orderedRolls(depth + 1, total + value);
};
orderedRolls(0, 0);
const expectedTail = rational(2 * successful, 8 * 4 * 5 * 256 * 243);
const fullReference = await buildReferenceDistribution({ slot: 4, stars: 6, reading });
const fullTail = await fullReference.query(30, 0.05, 'full');
assert.equal(fullTail.status, 'complete', 'The simple specialist reference must resolve completely.');
const actualTail = rational(BigInt(fullTail.tail.lowFraction.numerator), BigInt(fullTail.tail.lowFraction.denominator));
assert.equal(compare(actualTail, expectedTail), 0, 'Compressed birth histories must agree with the ordered-roll oracle.');
for (let cutoff = 31; cutoff <= 36; cutoff += 1) {
  let count = 0;
  const enumerate = (depth, total) => {
    if (depth === 5) { if (total + 5 >= cutoff) count += 1; return; }
    for (let value = 4; value <= 6; value += 1) enumerate(depth + 1, total + value);
  };
  enumerate(0, 0);
  const exact = rational(2 * count, 8 * 4 * 5 * 256 * 243);
  const cached = await fullReference.query(cutoff, 0.05);
  const lower = rational(BigInt(cached.tail.lowFraction.numerator), BigInt(cached.tail.lowFraction.denominator));
  const upper = rational(BigInt(cached.tail.highFraction.numerator), BigInt(cached.tail.highFraction.denominator));
  assert(compare(lower, exact) <= 0 && compare(upper, exact) >= 0,
    'A reused interval partition must enclose the independent exact tail at every new cutoff.');
  assert.equal(cached.passes, true);
}

const donor = await buildReferenceDistribution({ slot: 4, stars: 6, reading, canonicalCraft: true });
await donor.query(30, 0.05, 'full');
let recipientCalls = 0;
const doubledPrices = new Float64Array(13);
doubledPrices[8] = 2;
const doubled = { ...reading, id: 'independent-doubled-spd',
  weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, doubledPrices[statId]])),
  score(body) {
    recipientCalls += 1;
    return craftedScore(plan, gemOptions(plan, doubledPrices, body.slot, body.mainStatId, body.prefixStatId),
      doubledPrices, body.subProperties, body.prefixStatId === 8 ? 2 * body.prefixValue : 0);
  },
};
const reused = await buildReferenceDistribution({ slot: 4, stars: 6, reading: doubled, canonicalCraft: true });
const reusedTail = await reused.query(60, 0.05);
assert.equal(recipientCalls, 0, 'A proven coupled bound must reuse the donor measure without rescoring the recipient.');
const lowerReused = rational(BigInt(reusedTail.tail.lowFraction.numerator), BigInt(reusedTail.tail.lowFraction.denominator));
const upperReused = rational(BigInt(reusedTail.tail.highFraction.numerator), BigInt(reusedTail.tail.highFraction.denominator));
assert(compare(lowerReused, expectedTail) <= 0 && compare(upperReused, expectedTail) >= 0);
const stress = await buildReferenceDistribution({ slot: 4, stars: 6, reading: doubled, canonicalCraft: true,
  assumptions: { rarities: [{ rarity: 'Legend', mass: ONE }] } });
const stressTail = await stress.query(60, 0.05);
assert(recipientCalls > 0, 'A different birth model must not reuse the old probability measure.');
const stressLow = rational(BigInt(stressTail.tail.lowFraction.numerator), BigInt(stressTail.tail.lowFraction.denominator));
const stressHigh = rational(BigInt(stressTail.tail.highFraction.numerator), BigInt(stressTail.tail.highFraction.denominator));
const stressExact = multiply(expectedTail, rational(4));
assert(compare(stressLow, stressExact) <= 0 && compare(stressHigh, stressExact) >= 0);

// Test the numerical relationship against complete shared scores, including
// subnormal products, changed Gem placements and awkward binary64 coefficients.
const coefficients = [1, 0.7, 0.1, 1e-310, Number.MIN_VALUE, 1e100];
for (const coefficient of coefficients) {
  const oldPrices = Float64Array.from({ length: 13 }, (_, id) => allStatIds.includes(id) ? coefficient * (id === 8 ? 1 : 0.7) : 0);
  const newPrices = Float64Array.from(oldPrices, (value, id) => value * (id === 8 ? 1.1 : 0.9));
  const ids = allStatIds.filter(id => id !== 1);
  const relation = canonicalUtilityRelation(oldPrices, newPrices, ids);
  assert(relation);
  for (const spd of [4, 6, 30]) for (const atk of [5, 8, 40]) {
    const body = [{ statId: 8, value: spd, grind: 0, gemmed: false },
      { statId: 4, value: atk, grind: 0, gemmed: false },
      { statId: 9, value: 6, grind: 0, gemmed: false },
      { statId: 10, value: 7, grind: 0, gemmed: false }];
    const oldScore = rationalFromNumber(craftedScore(plan, gemOptions(plan, oldPrices, 5, 1, null), oldPrices, body, 0));
    const newScore = rationalFromNumber(craftedScore(plan, gemOptions(plan, newPrices, 5, 1, null), newPrices, body, 0));
    if (relation.lower) assert(compare(newScore, subtract(multiply(relation.lower.factor, oldScore), relation.lower.offset)) >= 0);
    if (relation.upper) assert(compare(newScore, add(multiply(relation.upper.factor, oldScore), relation.upper.offset)) <= 0);
  }
}

// These exact masses come from the proposal's specialist example. They are
// independent of the production birth walker and its conditional solver.
const atoms = new ScoreDistribution([
  { score: 0, mass: rational(70, 100) }, { score: 1, mass: rational(20, 100) },
  { score: 2, mass: rational(7, 100) }, { score: 3, mass: rational(3, 100) },
], ONE);
assert.equal(atoms.query(3, 0.05).passes, true);
assert.equal(atoms.query(2, 0.05).passes, false);
assert.equal(atoms.query(2, 0.1).passes, true, 'An inclusive tail equal to the allowance passes.');
const boundary = new ScoreDistribution([{ score: 1, mass: rational(1, 5) },
  { score: null, mass: rational(4, 5) }], ONE);
assert.equal(boundary.query(1, 0.2).passes, true, '20% means exactly one fifth.');
const countMeasure = new ScoreDistribution([{ score: 1, mass: rational(20) },
  { score: null, mass: rational(80) }], rational(100));
assert.deepEqual(countMeasure.query(1, 0.2), boundary.query(1, 0.2),
  'A count measure and its normalized measure must answer the same question.');

const large = BigInt('1' + '0'.repeat(400));
for (const mass of [rational(1, 3), rational(1, 10), rational(5, 20736),
  rational(large + BigInt(1), BigInt(3) * large + BigInt(7))]) {
  const bounds = probabilityBounds(mass);
  assert(Number.isFinite(bounds.low) && Number.isFinite(bounds.high));
  assert(compare(rationalFromNumber(bounds.low), mass) <= 0, 'The printed lower endpoint must round outward.');
  assert(compare(rationalFromNumber(bounds.high), mass) >= 0, 'The printed upper endpoint must round outward.');
}

console.log('PASS: independent reference-denominator, unresolved-mass, atom, equality and directed-bound checks.');
