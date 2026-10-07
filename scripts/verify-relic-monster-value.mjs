import assert from 'node:assert/strict';
import { relicMonsterModel, relicMonsterValue } from '../app/lib/relic-monster-value.ts';
import { relicProperties, relicProperty } from '../app/lib/relic-properties.ts';

/* The main-stat model reads a need only off a finished build, so each test build
   is the runes it names in slots 6, 4 and 2, and runes whose mains are zero in
   the slots left over. */
const blankMains = { 1: [3, 0], 2: [8, 0], 3: [5, 0], 4: [2, 0], 5: [1, 0], 6: [2, 0] };
const sixRunes = (...named) => {
  const placed = named.map((rune, at) => ({ slot_no: [6, 4, 2][at], ...rune }));
  const taken = new Set(placed.map((rune) => rune.slot_no));
  const blanks = [1, 2, 3, 4, 5, 6].filter((slot) => !taken.has(slot))
    .map((slot) => ({ set_id: 0, slot_no: slot, pri_eff: blankMains[slot] }));
  return [...placed, ...blanks];
};
const hpRune = { set_id: 13, pri_eff: [2, 100], prefix_eff: [6, 60], sec_eff: [[8, 100, 0, 0]] };
const monster = { con: 800, atk: 800, def: 600, spd: 100, runes: sixRunes(hpRune) };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);
const model = relicMonsterModel(monster);
assert.equal(model.status, 'ready');
assert.equal(model.basis, 'runes');
near(model.need.HP, 100);
near(model.need.DEF, 60);
near(model.weights.HP, 0.625);
near(model.weights.DEF, 0.375);
assert.equal(model.weights.ATK, 0);
assert.equal(model.totals.SPD, 200);

/* Priorities judge the completed main; source totals still describe the
   currently engraved build that a unique property would read now. */
const lowMain = relicMonsterModel({ ...monster, runes: sixRunes(
  { ...hpRune, class: 6, upgrade_curr: 9, pri_eff: [2, 40] },
) });
const highMain = relicMonsterModel({ ...monster, runes: sixRunes(
  { ...hpRune, class: 6, upgrade_curr: 15, pri_eff: [2, 63] },
) });
assert.deepEqual(lowMain.weights, highMain.weights);
assert.equal(highMain.totals.HP - lowMain.totals.HP, 12000 * 0.23);

const geared = relicMonsterModel({ ...monster, artifacts: [{ pri_effect: [100, 1500] }] });
assert.deepEqual(geared.weights, model.weights);
assert.equal(geared.totals.HP, model.totals.HP + 1500);
assert.equal(relicMonsterModel({}).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, con: 0 }).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, spd: NaN }).status, 'missing-stats');
assert.equal(relicMonsterModel({ ...monster, runes: [] }).status, 'no-priorities');
assert.equal(relicMonsterModel({ ...monster, runes: [], artifacts: [{ pri_effect: [100, 1500] }] }).status, 'no-priorities');

const sets = relicMonsterModel({ ...monster, runes: sixRunes(
  { set_id: 1, pri_eff: [1, 1200], sec_eff: [[6, 10, 0, 5]] },
  { set_id: 1, pri_eff: [3, 80] },
) });
near(sets.need.HP, 25);
near(sets.need.ATK, 10);
near(sets.need.DEF, 15);

/* Slots 1, 3 and 5 carry their flat main whatever the build is for, so the same
   flat there says nothing about what the runes were chosen to lift. */
const fixed = relicMonsterModel({ ...monster, runes: sixRunes(hpRune).map((rune) =>
  (rune.slot_no === 1 ? { ...rune, pri_eff: [3, 160] } : rune)) });
assert.deepEqual(fixed.weights, model.weights);
assert.ok(fixed.totals.ATK > model.totals.ATK);

/* Short of six runes the build is unfinished and says nothing; with no species
   to fall back on, nothing can. */
assert.equal(relicMonsterModel({ ...monster, runes: [{ ...hpRune, slot_no: 2 }] }).status, 'no-priorities');
near(Object.values(sets.weights).reduce((sum, value) => sum + value, 0), 1);
console.log('Relic priorities follow the main-stat need: projected even-slot mains, base-relative flats, grinds and set bonuses on a finished build, fixed mains left out, an unfinished build unread; current source totals, absent stats and empty gear stay explicit.');

const relic = (propertyId, mainProperty = 'HP', mainPercent = 15, threshold = 125, percent = 2) => ({
  id: String(propertyId), mainProperty, mainPercent,
  unique: { definition: relicProperty(propertyId), threshold, percent },
  level: 12, durability: 0, locked: false, obtainedOrder: propertyId,
});

// At 250 SPD, +2% DEF per 125 SPD adds 24 DEF: 4% of 600 base DEF.
const fast = relicMonsterModel({ ...monster, runes: sixRunes({ ...hpRune, sec_eff: [[8, 150, 0, 0]] }) });
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

const attacker = relicMonsterModel({ ...monster, runes: sixRunes({ set_id: 13, pri_eff: [4, 100] }) });
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
