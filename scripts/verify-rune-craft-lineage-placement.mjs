/**
 * The canonical Gem choice follows the rune's lineage and scores complete realized
 * bodies in a permutation-independent, fixed stat-id order.
 */
import assert from 'node:assert/strict';
import { finishedLines } from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import { endStateScoring } from '../app/domain/runes/rune-power-up-outcomes.ts';
import {
  defaultCraftCredit, craftComparison, craftPlan, craftedLines, craftedScore,
  craftedScoreBreakdown, gemChoiceLineUps, gemLineContribution, gemOptions, grindCredit, noCraftCredit, priceList,
} from '../app/domain/runes/craft/rune-craft-end-state.ts';

const valuation = (key, prices) => ({
  key,
  value: (statId, raw) => raw * (prices[statId] ?? 0),
});
const pricesFor = (key, prices) => priceList(valuation(key, prices));
const lines = [
  { statId: 9, value: 6, gemmed: false, grind: 0 },
  { statId: 10, value: 6, gemmed: false, grind: 0 },
  { statId: 11, value: 6, gemmed: false, grind: 0 },
  { statId: 12, value: 6, gemmed: false, grind: 0 },
];
const ancientPlan = craftPlan('ancient', defaultCraftCredit);
const ordinaryPlan = craftPlan('standard', defaultCraftCredit);

/* The ordinary Legend reference prefers SPD (14 vs 13.3); the Ancient reference
   prefers ATK % (14.7 vs 14). An Ancient candidate must use the second answer. */
const firstPrices = pricesFor('ancient-placement-first', { 4: 0.7, 8: 1 });
const ordinaryOptions = gemOptions(ordinaryPlan, firstPrices, 5, 1, null);
const ancientOptions = gemOptions(ancientPlan, firstPrices, 5, 1, null);
assert.equal(ordinaryOptions.statIds[0], 8, 'ordinary canonical credit prefers SPD');
assert.equal(ancientOptions.statIds[0], 4, 'Ancient canonical credit prefers ATK %');
assert.equal(gemLineContribution(ordinaryPlan, ordinaryOptions, firstPrices, lines, 0), ordinaryOptions.values[0],
  'the ordinary per-line ceiling uses its canonical legal options');
assert.equal(gemLineContribution(ancientPlan, ancientOptions, firstPrices, lines, 0), ancientOptions.values[0],
  'the Ancient per-line ceiling uses Ancient canonical legal options');
const first = craftedScoreBreakdown(ancientPlan, ancientOptions, firstPrices, lines, 0);
assert.equal(first.score, 14.7, "the Ancient body's selected canonical utility is 14.7");
assert.equal(first.statId, 4, 'the actual Ancient plan places its Gem on ATK %');

/* Same-stat re-Gems keep excess grind, but an equal/lower raw roll is not a legal
   positive gain. An id already on a neighbour and a converted neighbour are barred. */
const atkOnlyPrices = pricesFor('gem-line-contribution-atk', { 4: 1 });
const atkOnlyOptions = gemOptions(ancientPlan, atkOnlyPrices, 5, 1, null);
const atkOnlyAt = atkOnlyOptions.indexByStat[4];
const atkGemRoll = atkOnlyOptions.rolls[atkOnlyAt];
assert.ok(atkOnlyAt >= 0 && atkGemRoll > 0);
const sameStatLines = [
  { statId: 4, value: 8, gemmed: false, grind: 12 },
  { statId: 9, value: 6, gemmed: false, grind: 0 },
  { statId: 10, value: 6, gemmed: false, grind: 0 },
  { statId: 11, value: 6, gemmed: false, grind: 0 },
];
assert.equal(gemLineContribution(ancientPlan, atkOnlyOptions, atkOnlyPrices, sameStatLines, 0), atkGemRoll + 12,
  'same-stat Gem contribution retains excess held grind');
assert.equal(gemLineContribution(ancientPlan, atkOnlyOptions, atkOnlyPrices,
  [{ ...sameStatLines[0], value: atkGemRoll }, ...sameStatLines.slice(1)], 0), 0,
  'same-stat Gem eligibility is strict at equal raw values');
const onlySpdPrices = pricesFor('gem-line-contribution-spd', { 8: 1 });
const onlySpdOptions = gemOptions(ancientPlan, onlySpdPrices, 5, 1, null);
const duplicateSpdLines = [
  { statId: 4, value: 8, gemmed: false, grind: 0 },
  { statId: 8, value: 4, gemmed: false, grind: 0 },
  { statId: 10, value: 6, gemmed: false, grind: 0 },
  { statId: 11, value: 6, gemmed: false, grind: 0 },
];
assert.equal(gemLineContribution(ancientPlan, onlySpdOptions, onlySpdPrices, duplicateSpdLines, 0), 0,
  'a Gem cannot duplicate a neighbouring sub-property');
assert.equal(gemLineContribution(ancientPlan, onlySpdOptions, onlySpdPrices,
  [{ ...duplicateSpdLines[0] }, { ...duplicateSpdLines[1], gemmed: true }, ...duplicateSpdLines.slice(2)], 0), null,
  'a converted neighbour locks the Gem to its marked line');

/* The replacement changes the line's stat id and therefore its place in the sum.
   Nonzero line values and fractional prices make this compare the reported score
   with the same realized body in both original and reversed line order. */
const reorderPrices = pricesFor('ancient-placement-reorder', {
  4: 0.7, 8: 1, 9: 0.2, 10: 0.1, 11: 0.3, 12: 0.4,
});
const reorderOptions = gemOptions(ancientPlan, reorderPrices, 5, 1, null);
const reorder = craftedScoreBreakdown(ancientPlan, reorderOptions, reorderPrices, lines, 0);
assert.equal(reorder.statId, 4);
assert.equal(lines[reorder.replaced].statId, 10, 'the lowest-value legal line is replaced');
const reorderRealized = craftedLines(ancientPlan, reorderOptions, reorderPrices, lines, 0);
const reorderSpent = craftPlan('ancient', noCraftCredit);
const reorderSpentOptions = gemOptions(reorderSpent, reorderPrices, 5, 1, null);
assert.equal(craftedScore(reorderSpent, reorderSpentOptions, reorderPrices, reorderRealized, 0), reorder.score,
  'the score uses the realized Gem stat id when it orders the sum');
const reverseLines = [...lines].reverse();
const reverseReorder = craftedScoreBreakdown(ancientPlan, reorderOptions, reorderPrices, reverseLines, 0);
assert.equal(reverseReorder.score, reorder.score);
assert.equal(reverseReorder.statId, reorder.statId);

const body = (atkPercent) => [
  { statId: 8, value: 7, gemmed: false, grind: 0 },
  { statId: 4, value: atkPercent, gemmed: false, grind: 0 },
  { statId: 9, value: 30, gemmed: false, grind: 0 },
  { statId: 11, value: 6, gemmed: false, grind: 0 },
];
const secondPrices = pricesFor('ancient-placement-second', { 4: 0.7, 8: 1 });
const secondOptions = gemOptions(ancientPlan, secondPrices, 5, 1, null);
const atEight = craftedScoreBreakdown(ancientPlan, secondOptions, secondPrices, body(8), 0);
const atNine = craftedScoreBreakdown(ancientPlan, secondOptions, secondPrices, body(9), 0);
assert.equal(atEight.statId, 4);
assert.equal(atNine.statId, 4, 'ATK % stays selected when the body improves from 8 to 9');
assert.equal(atEight.score, 26.7);
assert.equal(atNine.score, 26.7, 'improving ATK % cannot lower the shared crafted score');

const reversed = [...body(9)].reverse();
const reversedBreakdown = craftedScoreBreakdown(ancientPlan, secondOptions, secondPrices, reversed, 0);
assert.equal(reversedBreakdown.score, atNine.score, 'line permutation cannot alter the score');
assert.equal(reversedBreakdown.plainScore, atNine.plainScore, 'the no-Gem sum uses canonical stat order');
assert.equal(reversedBreakdown.statId, atNine.statId, 'line permutation cannot alter the selected Gem');
assert.deepEqual([...reversedBreakdown.lineValues].sort(), [...atNine.lineValues].sort());

/* The reported end state must score exactly as the chosen realized body, including
   its new stat-id position in the sum and every line's credited Grindstone. */
const realized = craftedLines(ancientPlan, secondOptions, secondPrices, body(9), 0);
const spentPlan = craftPlan('ancient', noCraftCredit);
const spentOptions = gemOptions(spentPlan, secondPrices, 5, 1, null);
assert.equal(craftedScore(spentPlan, spentOptions, secondPrices, realized, 0), atNine.score);
const permutedRealized = craftedLines(ancientPlan, secondOptions, secondPrices, reversed, 0);
assert.deepEqual(
  [...permutedRealized].sort((left, right) => left.statId - right.statId),
  [...realized].sort((left, right) => left.statId - right.statId),
  'the shared placement is stable when the input line order changes',
);

/* The other craft readers use the same lineage-specific reference tables. */
const rune = {
  id: 'ancient-lineage-check', setId: 1, setName: 'Energy', slot: 5, stars: 6, ancient: true,
  rarity: 'Legend', level: 12, mainStatId: 1, mainValue: 0, prefixStatId: null, prefixValue: 0,
  subProperties: body(8), occupiedId: null, obtainedOrder: 1,
};
const lineUps = gemChoiceLineUps(rune, defaultCraftCredit);
assert.equal(lineUps?.base.find((line) => line.statId === 4)?.grind, 9,
  'Ancient Gem advice grounds its reference line with an Ancient Legend stone');
const placementRune = { ...rune, subProperties: lines };
const ordinaryPlacementRune = { ...placementRune, ancient: false };
const ordinaryRune = { ...rune, ancient: false };
const projectionValuation = valuation('percentile-craft-projection', { 4: 0.7, 8: 1 });
const project = (rune) => {
  const plan = craftPlan(rune.ancient ? 'ancient' : 'standard', defaultCraftCredit);
  return finishedLines({ rune, scoring: endStateScoring(rune, projectionValuation, plan) });
};
const ancientProjection = project(placementRune);
assert.equal(ancientProjection.find((line) => line.gemmed)?.statId, 4,
  'a percentile reading retains Ancient placement for the Improvements display');
const ordinaryProjection = project(ordinaryPlacementRune);
assert.equal(ordinaryProjection.find((line) => line.gemmed)?.statId, 8,
  'the same reading uses ordinary placement for an ordinary rune');
const unfinishedProjection = project({ ...placementRune, level: 9 });
assert.ok(unfinishedProjection.every((line) => !line.gemmed),
  'a pre-+12 Improvements display grounds lines without placing a Gem');
const ordinaryItem = {
  id: 'ordinary-gem', kind: 'gem', lineage: 'standard', setId: 1, setName: 'Energy',
  statId: 4, statName: 'ATK %', grade: 'Legend', amount: 1, range: { minimum: 9, maximum: 13 },
};
const ancientItem = {
  ...ordinaryItem, id: 'ancient-gem', lineage: 'ancient', range: { minimum: 9, maximum: 15 },
};
assert.equal(craftComparison(ordinaryItem, ordinaryRune, 'average', defaultCraftCredit).baseline
  .find((line) => line.statId === 4)?.grind, 8);
assert.equal(craftComparison(ancientItem, rune, 'average', defaultCraftCredit).baseline
  .find((line) => line.statId === 4)?.grind, 9);
/* The premise is the user's stone: a Hero one rounded down grinds the same line less. */
const heroDown = { ...defaultCraftCredit, grind: { grade: 'Hero', roll: 'average', rounding: 'down' } };
assert.equal(craftComparison(ordinaryItem, ordinaryRune, 'average', heroDown).baseline
  .find((line) => line.statId === 4)?.grind, 5, 'a Hero ATK % stone of 4–7 at the average, rounded down, is 5');

/* Equal realized scores settle by canonical option order; an all-zero reading keeps
   the no-Gem body instead of reporting a tie as an improvement. */
const tiedPrices = pricesFor('ancient-placement-tie', { 4: 2 / 3, 8: 1 });
const tiedOptions = gemOptions(ancientPlan, tiedPrices, 5, 1, null);
const tied = craftedScoreBreakdown(ancientPlan, tiedOptions, tiedPrices, lines, 0);
assert.equal(tied.score, 14);
assert.equal(tied.statId, 4, 'equal canonical Gem scores settle by effect id');
const zeroPrices = pricesFor('ancient-placement-zero', {});
const zeroOptions = gemOptions(ancientPlan, zeroPrices, 5, 1, null);
const zero = craftedScoreBreakdown(ancientPlan, zeroOptions, zeroPrices, lines, 0);
assert.equal(zero.statId, -1, 'a zero-value Gem does not displace the no-Gem body');
assert.equal(zero.gemGain, 0);

console.log('PASS: Ancient Gem placement, complete-body sums, ties and all craft readers share the lineage rule.');
