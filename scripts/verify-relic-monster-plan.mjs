import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allocateRelicEngravings, assertRelicAllocation, rankRelicsForMonster, relicEngravingLimit,
} from '../app/lib/relic-monster-fit.ts';
import { relicMonsterModel, relicMonsterValue } from '../app/lib/relic-monster-value.ts';
import { readRelic } from '../app/lib/relics.ts';

const account = JSON.parse(readFileSync(new URL('../tests/fixtures/relic-account.json', import.meta.url), 'utf8'));
const relics = account.relics.map(readRelic);
assert.ok(relics.every(Boolean));
const hp = relicMonsterModel(account.unit_list[0]);
const atk = relicMonsterModel(account.unit_list[2]);
const subject = (id, model = hp, wornRelicIds = [], preferences) => ({ monsterId: String(id), model, wornRelicIds, preferences });
const subjects = Array.from({ length: 2 * relicEngravingLimit + 1 }, (_, at) => subject(at));
const plan = allocateRelicEngravings(subjects, relics, new Map());
assertRelicAllocation(plan, subjects);
assert.equal(plan.recommendations.size, subjects.length);
for (const recommendation of plan.recommendations.values()) {
  assert.equal(recommendation.chosen.relic.id, '9002');
  assert.equal(recommendation.limit, 'none');
  assert.equal(recommendation.unavailable, null);
}
assert.equal(plan.engravings.get('9002'), 0, 'Proposals must not reserve places');

const full = new Map([['9002', relicEngravingLimit]]);
const gated = allocateRelicEngravings([subject('new'), subject('worn', hp, ['9002'])], relics, full);
assertRelicAllocation(gated, [subject('new'), subject('worn', hp, ['9002'])]);
assert.equal(gated.recommendations.get('new').chosen.relic.id, '9001');
assert.equal(gated.recommendations.get('new').ideal.relic.id, '9002');
assert.equal(gated.recommendations.get('new').limit, 'capacity');
assert.equal(gated.recommendations.get('worn').chosen.relic.id, '9002');
assert.equal(gated.recommendations.get('worn').alreadyEngraved, true);
const allFull = allocateRelicEngravings([subject(1)], relics,
  new Map(relics.map((relic) => [relic.id, relicEngravingLimit])));
assert.equal(allFull.recommendations.get('1').chosen, null);
assert.equal(allFull.recommendations.get('1').unavailable, 'capacity');
assert.equal(allFull.recommendations.get('1').limit, 'capacity');

const original = relics[1];
const twin = { ...original, id: '100', obtainedOrder: 100 };
assert.equal(rankRelicsForMonster([twin, original], hp)[0].relic.id, '100');
assert.equal(rankRelicsForMonster([twin, original], hp, new Set(['9002']))[0].relic.id, '9002');
const smallUpgrade = { ...twin, mainPercent: original.mainPercent + 0.0001 };
assert.equal(allocateRelicEngravings([subject('upgrade', hp, ['9002'])], [original, smallUpgrade], new Map())
  .recommendations.get('upgrade').chosen.relic.id, '100', 'Even a gain under 5% must use the higher mathematical value');

const mixed = [subject('HP'), subject('ATK', atk), subject('wearer', atk, ['9002'])];
const together = allocateRelicEngravings(mixed, relics, full);
for (const monster of mixed) {
  const alone = allocateRelicEngravings([monster], relics, full);
  const omitAnnotation = ({ displaceableWearers, ...recommendation }) => recommendation;
  assert.deepEqual(omitAnnotation(together.recommendations.get(monster.monsterId)),
    omitAnnotation(alone.recommendations.get(monster.monsterId)));
}
assert.equal(together.recommendations.get('HP').displaceableWearers, 1);

const preferences = { relics: { main: ['ATK'], unique: [1] } };
const before = JSON.stringify(preferences);
const explicit = allocateRelicEngravings([subject('choice', hp, [], preferences)], relics, new Map());
assert.equal(explicit.recommendations.get('choice').chosen.relic.id, '9003');
assert.equal(JSON.stringify(preferences), before, 'Computing must not rewrite user choices');
const cleared = allocateRelicEngravings([subject('cleared', hp, [], { relics: { main: [], unique: [] } })], relics, new Map());
assert.equal(cleared.recommendations.get('cleared').chosen.relic.id, '9002');
const noMatch = allocateRelicEngravings([subject('no-match', hp, [], { relics: { unique: [16] } })], relics, new Map());
assert.equal(noMatch.recommendations.get('no-match').unavailable, 'preferences');

const unruned = relicMonsterModel({ ...account.unit_list[0], runes: [] });
for (const [model, reason] of [[relicMonsterModel({}), 'missing-stats'], [unruned, 'no-priorities']]) {
  const unscored = allocateRelicEngravings([subject('empty', model)], relics, new Map());
  assert.equal(unscored.recommendations.size, 1, 'Unscorable monsters must stay visible');
  assert.equal(unscored.recommendations.get('empty').chosen, null);
  assert.equal(unscored.recommendations.get('empty').unavailable, reason);
}
assert.equal(allocateRelicEngravings([subject('empty')], [], new Map()).recommendations.get('empty').unavailable, 'no-relics');
assertRelicAllocation(allocateRelicEngravings([], [], new Map()), []);
assert.throws(() => assertRelicAllocation(plan, [subject(1), subject(1)]), /duplicate/);

// A pool-wide maximum is checked independently of the ranking implementation.
for (const model of [hp, atk]) {
  const max = Math.max(...relics.map((relic) => relicMonsterValue(relic, model).score));
  assert.equal(rankRelicsForMonster(relics, model)[0].value.score, max);
}
console.log('Relic engraving uses per-copy value; capacity, preferences, ties, small upgrades and roster-independent recommendations pass.');
