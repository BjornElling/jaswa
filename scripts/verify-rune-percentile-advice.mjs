import assert from 'node:assert/strict';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { judgeRunePercentile, newRunePercentileReferenceScope, runePercentileAdvice, withRunePercentileSellProtection } from '../app/domain/runes/cleanup/rune-percentile-engine.ts';
import { ordinarySample } from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { percentileRankText, runeChanceBoundsText } from '../app/domain/runes/cleanup/rune-percentile-formatting.ts';
import { expectedUtilityBounds, percentileRankBounds, probabilityBounds, rational } from '../app/domain/runes/percentile/probability.ts';

const rune = {
  id: 'policy-boundary', setId: 1, setName: 'Energy', slot: 4, stars: 6,
  ancient: false, rarity: 'Legend', level: 0, mainStatId: 10, mainValue: 0,
  prefixStatId: null, prefixValue: 0, subProperties: [], occupiedId: null, obtainedOrder: 0,
};
const settings = defaultRunePotentialSettings;

function judgment(status, unionChance) {
  return {
    status,
    readings: [],
    result: {
      status,
      unionChance,
      readings: [],
      potentialWitness: null,
    },
  };
}

const exactEquality = runePercentileAdvice(rune, judgment('complete', probabilityBounds(rational(1, 5))), settings);
assert.equal(exactEquality.verdict, 'power-up', 'Chance equal to beta passes exactly.');

const certifiedPass = runePercentileAdvice(rune,
  judgment('incomplete', probabilityBounds(rational(1, 5), rational(2, 5))), settings);
assert.equal(certifiedPass.verdict, 'power-up', 'A lower bound at beta certifies a pass even when unrelated work remains.');

const certifiedFail = runePercentileAdvice(rune,
  judgment('incomplete', probabilityBounds(rational(1, 10), rational(19, 100))), settings);
assert.equal(certifiedFail.verdict, 'sell', 'Only an upper bound strictly below beta can recommend Sell.');

const boundaryOverlap = runePercentileAdvice(rune,
  judgment('incomplete', probabilityBounds(rational(1, 10), rational(1, 5))), settings);
assert.equal(boundaryOverlap.verdict, 'unavailable', 'An interval that only reaches beta cannot recommend Sell.');

const missing = runePercentileAdvice(rune, {
  status: 'missing-input', readings: [], result: null,
  diagnostic: 'Add a role before judging this rune.',
}, settings);
assert.equal(missing.verdict, 'unavailable', 'Missing role inputs never become Sell.');

const invalid = runePercentileAdvice(rune, {
  status: 'invalid', readings: [],
  result: { status: 'invalid', unionChance: null, readings: [], potentialWitness: null },
  diagnostic: 'Malformed rune.',
}, settings);
assert.equal(invalid.verdict, 'unavailable', 'A null probability statement never becomes Sell.');

const unusable = runePercentileAdvice(rune, judgment('unusable', probabilityBounds(rational(0))), settings);
assert.equal(unusable.verdict, 'sell', 'A valid unusable result is distinct from unavailable input.');

assert.equal(percentileRankText(percentileRankBounds(rational(504, 10_000), rational(504, 10_000))), '94.9');
assert.equal(runeChanceBoundsText(probabilityBounds(rational(5, 20_736))), '<0.1 %');

const role = defaultRuneRoles()[0];
const twin = { ...role, id: `${role.id}:same-reading`, name: `${role.name} twin` };
const sample = ordinarySample(4, 6, 1, 15, 'legend', 7)[0];
const base = new Map([[role.type, { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }]]);
const referenceScope = newRunePercentileReferenceScope();
const deduplicated = await judgeRunePercentile(sample, [role, twin], settings, base, referenceScope, { stateLimit: 1 });
assert.ok(referenceScope.references.size < deduplicated.readings.filter((reading) => reading.descriptor.permitted).length,
  'Numerically identical role readings share a reference distribution.');
assert.notEqual(deduplicated.status, 'invalid', 'Each role identity must receive a correctly aliased shared reference.');
assert.equal(new Set(deduplicated.readings.map((reading) => reading.role.id)).size, 2,
  'Deduplication keeps both role identities for the explanation.');

// Compose certified reading results separately from testing the solver that produced them.
const near = (role, order) => ({
  ...deduplicated.readings.find((reading) => reading.role.id === role.id), role, order,
  descriptor: { id: role.id, permitted: true, alpha: rational(1, 20), utilityKey: role.id },
});
const composedReadings = [near(role, 0), near(twin, 1)];
const exactUse = (reading, chance, rankTail, efficiency, utility) => ({
  id: reading.role.id, status: 'complete', chance: probabilityBounds(chance),
  potential: { score: reading.efficiencyCeiling * efficiency, rank: percentileRankBounds(rankTail, rankTail) },
  expectedUtility: expectedUtilityBounds(utility),
});
const tiedChance = {
  status: 'complete', readings: composedReadings, result: {
    ...judgment('complete', probabilityBounds(rational(1, 25))).result,
    readings: [exactUse(composedReadings[0], rational(1, 50), rational(1, 50), 0.8, rational(2)),
      exactUse(composedReadings[1], rational(1, 50), rational(1, 25), 0.9, rational(3))],
  },
};
const tiedAdvice = runePercentileAdvice(sample, tiedChance, settings);
assert.equal(tiedAdvice.qualityWitness.roleId, role.id, 'The best rank keeps its witness.');
assert.equal(tiedAdvice.chanceWitness.roleId, twin.id, 'Equal Chance chooses higher expected utility.');
const protectedSettings = { ...settings, neverSellPotentialValue: true, potentialValueMinimum: 85,
  neverSellPreGrindSpeed: false, neverSellReappTargets: false };
assert.equal(withRunePercentileSellProtection(sample, tiedAdvice, protectedSettings).verdict, 'keep');
const splitChance = { ...tiedChance, result: { ...tiedChance.result, readings: [tiedChance.result.readings[0],
  exactUse(composedReadings[1], rational(0), rational(1, 25), 0.9, rational(3))] } };
assert.equal(withRunePercentileSellProtection(sample, runePercentileAdvice(sample, splitChance, settings), protectedSettings).verdict, 'sell',
  'A different reading cannot lend its Chance to high potential efficiency.');

console.log('Passed exact percentile verdict boundaries and unavailable safeguards.');
