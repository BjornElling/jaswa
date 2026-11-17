/**
 * Declared model stress cases for the rune percentile reference.
 * These cases are sensitivity inputs, never estimates of in-game acquisition rates.
 */
import assert from 'node:assert/strict';
import { allStatIds, slotMainProperties } from '../app/domain/runes/rune-properties.ts';
import {
  canonicalCraftCredit, craftPlan, craftedScore, gemOptions, priceList,
} from '../app/domain/runes/craft/rune-craft-end-state.ts';
import { runeBirthRarityMasses } from '../app/domain/runes/rune-birth-model.ts';
import { buildReferenceDistribution } from '../app/domain/runes/percentile/reference-distribution.ts';
import { ONE, ZERO, rational } from '../app/domain/runes/percentile/probability.ts';

const slot = 4;
const stars = 6;
const mainStatId = 10;
const alpha = 0.05;
const thresholds = [1, 15, 27, 35, 45];
const plan = craftPlan('standard', canonicalCraftCredit);
const prices = priceList({
  key: 'percentile-sensitivity-spd',
  value: (statId, raw) => statId === 8 ? raw : 0,
});
const reading = {
  id: 'sensitivity-slot-4-cri-dmg-spd',
  permitted: true,
  mainStatId,
  alpha,
  weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, prices[statId]])),
  score(body) {
    if (body.mainStatId !== mainStatId) return null;
    const options = gemOptions(plan, prices, body.slot, body.mainStatId, body.prefixStatId);
    const prefixScore = body.prefixStatId === 8 ? body.prefixValue : 0;
    return craftedScore(plan, options, prices, body.subProperties, prefixScore);
  },
};

const legalMains = slotMainProperties[slot];
const halfOnReadingMain = new Map(legalMains.map(statId => [
  statId, statId === mainStatId ? rational(1, 2) : rational(1, 2 * (legalMains.length - 1)),
]));
const noReadingMain = new Map(legalMains.map(statId => [
  statId, statId === mainStatId ? ZERO : rational(1, legalMains.length - 1),
]));
const rarityMasses = runeBirthRarityMasses(slot);
const legendOnly = [{ rarity: 'Legend', mass: ONE }];
const heroOnly = [{ rarity: 'Hero', mass: ONE }];

const scenarios = [
  { id: 'baseline', assumptions: undefined },
  { id: 'Legend-only births', assumptions: { rarities: legendOnly } },
  { id: 'Hero-only births', assumptions: { rarities: heroOnly } },
  { id: 'no innates', assumptions: { innateProbability: ZERO } },
  { id: 'innate on every birth', assumptions: { innateProbability: ONE } },
  { id: 'half of mains are this reading', assumptions: { mainProbabilities: halfOnReadingMain } },
  { id: 'this reading main has zero birth mass', assumptions: { mainProbabilities: noReadingMain } },
];

assert.equal(legalMains.length, 8, 'Slot 4 must retain all eight legal mains in this declared scenario.');
assert.equal(rarityMasses.reduce((sum, entry) => sum + Number(entry.mass.numerator) / Number(entry.mass.denominator), 0), 1);

const results = [];
for (const scenario of scenarios) {
  const started = performance.now();
  const reference = await buildReferenceDistribution({
    slot, stars, reading, stateLimit: 250_000, assumptions: scenario.assumptions,
  });
  const tails = {};
  for (const cutoff of thresholds) {
    const result = await reference.query(cutoff, alpha);
    tails[cutoff] = {
      low: result.tail.low,
      high: result.tail.high,
      lowMass: result.tail.lowFraction,
      highMass: result.tail.highFraction,
      status: result.status,
      qualifiesAtTopFivePercent: result.passes,
    };
  }
  results.push({
    scenario: scenario.id,
    source: 'synthetic stress assumption; not a game-rate estimate',
    elapsedMs: Math.round(performance.now() - started),
    tails,
  });
}

const innateOnlyReading = {
  id: 'sensitivity-innate-only',
  permitted: true,
  mainStatId,
  alpha: 0.01,
  weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, statId === 8 ? 1 : 0])),
  score(body) {
    if (body.mainStatId !== mainStatId || body.prefixStatId !== 8) return null;
    return body.prefixValue;
  },
};
const innateIsolation = [];
for (const scenario of [
  { id: 'no innates', assumptions: { innateProbability: ZERO } },
  { id: 'modelled 50% innate rate', assumptions: undefined },
  { id: 'innate on every birth', assumptions: { innateProbability: ONE } },
]) {
  const reference = await buildReferenceDistribution({
    slot, stars, reading: innateOnlyReading, stateLimit: 100_000, assumptions: scenario.assumptions,
  });
  const result = await reference.query(5, innateOnlyReading.alpha);
  innateIsolation.push({
    scenario: scenario.id,
    utility: 'innate-SPD-only diagnostic, to isolate the declared innate assumption',
    tail: result.tail,
    qualifiesAtOnePercent: result.passes,
  });
}

const baseline = results[0];
const changedPolicyCategories = {};
for (const scenario of results.slice(1)) {
  const changes = { qualifyToReject: 0, rejectToQualify: 0, unresolved: 0, unchanged: 0 };
  for (const cutoff of thresholds) {
    const before = baseline.tails[cutoff].qualifiesAtTopFivePercent;
    const after = scenario.tails[cutoff].qualifiesAtTopFivePercent;
    if (before === null || after === null) changes.unresolved += 1;
    else if (before && !after) changes.qualifyToReject += 1;
    else if (!before && after) changes.rejectToQualify += 1;
    else changes.unchanged += 1;
  }
  changedPolicyCategories[scenario.scenario] = changes;
}

console.log(JSON.stringify({
  purpose: 'Sensitivity to declared synthetic assumptions; no drop-rate claim.',
  reading: { slot, stars, mainStatId, utility: 'SPD-only, canonical craft credit', alpha },
  thresholds,
  changedPolicyCategories,
  scenarios: results,
  innateAssumptionIsolation: innateIsolation,
  accountEvidence: 'No actual account export is present among repository fixtures; these are synthetic stress cases.',
}, null, 2));
