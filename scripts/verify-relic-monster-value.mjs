import assert from 'node:assert/strict';
import { relicMonsterModel, relicMonsterValue } from '../app/lib/relic-monster-value.ts';
import { relicProperties, relicProperty } from '../app/lib/relic-properties.ts';

const monster = {
  con: 800, atk: 800, def: 600, spd: 100,
  runes: [{ set_id: 13, pri_eff: [2, 100], prefix_eff: [6, 60], sec_eff: [[8, 100, 0, 0]] }],
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);
const model = relicMonsterModel(monster);
assert.equal(model.status, 'ready');
near(model.runeIncreases.HP, 1);
near(model.runeIncreases.DEF, 0.6);
near(model.weights.HP, 0.625);
near(model.weights.DEF, 0.375);
assert.equal(model.weights.ATK, 0);
assert.equal(model.totals.SPD, 200);

const geared = relicMonsterModel({ ...monster, artifacts: [{ pri_effect: [100, 1500] }] });
assert.deepEqual(geared.weights, model.weights);
assert.equal(geared.totals.HP, model.totals.HP + 1500);
assert.equal(relicMonsterModel({}).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, con: 0 }).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, spd: NaN }).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, runes: [] }).status, 'no-priorities');
assert.equal(relicMonsterModel({ ...monster, runes: [], artifacts: [{ pri_effect: [100, 1500] }] }).status, 'no-priorities');

const sets = relicMonsterModel({ ...monster, runes: [
  { set_id: 1, pri_eff: [1, 1200], sec_eff: [[6, 10, 0, 5]] },
  { set_id: 1, pri_eff: [3, 80] },
] });
near(sets.runeIncreases.HP, 0.25);
near(sets.runeIncreases.ATK, 0.1);
near(sets.runeIncreases.DEF, 0.15);
near(Object.values(sets.weights).reduce((sum, value) => sum + value, 0), 1);
console.log('Relic rune priorities agree with base-relative investment, flats, grinds and set bonuses; absent stats and empty gear stay explicit.');

const relic = (propertyId, mainProperty = 'HP', mainPercent = 15, threshold = 125, percent = 2) => ({
  id: String(propertyId), mainProperty, mainPercent,
  unique: { definition: relicProperty(propertyId), threshold, percent },
  level: 12, durability: 0, locked: false, obtainedOrder: propertyId,
});

// At 250 SPD, +2% DEF per 125 SPD adds 24 DEF: 4% of 600 base DEF.
const fast = relicMonsterModel({ ...monster, runes: [{ ...monster.runes[0], sec_eff: [[8, 150, 0, 0]] }] });
const timeless = relicMonsterValue(relic(11), fast);
near(timeless.mainGain, 1800);
near(timeless.main, 9.375);
near(timeless.uniquePercent, 4);
near(timeless.uniqueGain, 24);
near(timeless.unique, 1.5);
near(timeless.score, 10.875);
// No whole-step truncation: 200 / 125 gives 3.2%, not 2%.
near(relicMonsterValue(relic(11), model).uniquePercent, 3.2);

// A same-source main raises the source once, without circular unique scaling.
const hpSource = relicMonsterValue(relic(12, 'HP', 15, 18000), model);
near(hpSource.sourceValue, 25800);
near(hpSource.uniquePercent, 25800 / 18000 * 2);
near(hpSource.unique, 0.375 * 25800 / 18000 * 2);

const attacker = relicMonsterModel({ ...monster, runes: [{ set_id: 13, pri_eff: [4, 100] }] });
const conquest = relicMonsterValue(relic(1, 'ATK', 15, 800, 1), attacker);
near(conquest.sourceValue, 1720);
near(conquest.main, 15);
near(conquest.uniquePercent, 2.15);
near(conquest.unique, 1720 * 0.0215 / 800 * 100);
assert.equal(relicMonsterValue(relic(1, 'HP', 15, 800, 1), model).unique, 0);

const reduction = relicMonsterValue(relic(6, 'HP', 15, 25800, 10), model);
near(reduction.uniquePercent, 10);
near(reduction.uniqueGain, 25800 * (1 / 0.9 - 1) * 2 / 3);
near(reduction.unique, 0.625 * reduction.uniqueGain / 12000 * 100);
const recovery = relicMonsterValue(relic(16, 'HP', 15, 25800, 10), model);
near(recovery.uniqueGain, 25800 * 0.1 * 2 / 3);
assert.equal(relicMonsterValue(relic(11), relicMonsterModel({})), null);
assert.throws(() => relicMonsterValue(relic(6, 'HP', 15, 25800, 100), model), /invalid damage reduction/);
assert.throws(() => relicMonsterValue(relic(11, 'HP', 15, Number.MIN_VALUE), model), /invalid stat contribution/);

for (const definition of relicProperties) {
  const contribution = relicMonsterValue(relic(definition.id, 'HP', 15, 100000), model);
  assert.ok(Number.isFinite(contribution.score), `Property ${definition.id} has no usable value`);
  near(contribution.score, contribution.main + contribution.unique);
}
const larger = relicMonsterModel({ ...monster, con: 80000, atk: 80000, def: 60000 });
near(relicMonsterValue(relic(11), larger).score, relicMonsterValue(relic(11), model).score);
console.log('All sixteen unique effects are valued; direct gains, continuous scaling, main/source interaction and indirect equivalences match independent worked examples.');
