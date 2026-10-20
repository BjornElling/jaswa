import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allocateRelicEngravings, assertRelicAllocation, rankRelicsForMonster, relicEngravingLimit,
} from '../app/lib/relic-monster-fit.ts';
import { relicMonsterModel, relicMonsterValue } from '../app/lib/relic-monster-value.ts';
import { readRelic, relicEngravingCounts, relicEngravingProblem } from '../app/lib/relics.ts';

const account = JSON.parse(readFileSync(new URL('../tests/fixtures/relic-account.json', import.meta.url), 'utf8'));
const relics = account.relics.map(readRelic);
assert.ok(relics.every(Boolean));
const hp = relicMonsterModel(account.unit_list[0]);
const atk = relicMonsterModel(account.unit_list[2]);
const subject = (id, model = hp, engravedRelicIds = [], preferences) => ({ monsterId: String(id), model, engravedRelicIds, preferences });
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
const gated = allocateRelicEngravings([subject('new'), subject('engraved', hp, ['9002'])], relics, full);
assertRelicAllocation(gated, [subject('new'), subject('engraved', hp, ['9002'])]);
assert.equal(gated.recommendations.get('new').chosen.relic.id, '9001');
assert.equal(gated.recommendations.get('new').ideal.relic.id, '9002');
assert.equal(gated.recommendations.get('new').limit, 'capacity');
assert.equal(gated.recommendations.get('engraved').chosen.relic.id, '9002');
assert.equal(gated.recommendations.get('engraved').alreadyEngraved, true);
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

const mixed = [subject('HP'), subject('ATK', atk), subject('engraved', atk, ['9002'])];
const together = allocateRelicEngravings(mixed, relics, full);
for (const monster of mixed) {
  const alone = allocateRelicEngravings([monster], relics, full);
  const omitAnnotation = ({ displaceableMonsters, ...recommendation }) => recommendation;
  assert.deepEqual(omitAnnotation(together.recommendations.get(monster.monsterId)),
    omitAnnotation(alone.recommendations.get(monster.monsterId)));
}
assert.equal(together.recommendations.get('HP').displaceableMonsters, 1);

const none = { preferred: [], acceptable: [] };
const preferences = { mainStat: { preferred: ['ATK'], acceptable: [] }, relics: { unique: { preferred: [1], acceptable: [] } } };
const before = JSON.stringify(preferences);
const explicit = allocateRelicEngravings([subject('choice', hp, [], preferences)], relics, new Map());
assert.equal(explicit.recommendations.get('choice').chosen.relic.id, '9003');
assert.equal(JSON.stringify(preferences), before, 'Computing must not rewrite user choices');
/* A preferred match outranks a stronger acceptable one: 9002 is the HP copy's
   best relic by value, and accepting its main still puts the preferred 9003 first. */
const ranked = { mainStat: { preferred: ['ATK'], acceptable: ['HP'] } };
const tiered = allocateRelicEngravings([subject('tiered', hp, [], ranked)], relics, new Map());
assert.equal(tiered.recommendations.get('tiered').chosen.relic.mainProperty, 'ATK', 'A preferred main must outrank an accepted one');
assert.ok(rankRelicsForMonster(relics, hp, new Set(), ranked).some((candidate) => candidate.relic.id === '9002'),
  'An accepted main must still be offered');
const cleared = allocateRelicEngravings([subject('cleared', hp, [], { mainStat: none, relics: { unique: none } })], relics, new Map());
assert.equal(cleared.recommendations.get('cleared').chosen.relic.id, '9002');
const noMatch = allocateRelicEngravings([subject('no-match', hp, [], { relics: { unique: { preferred: [16], acceptable: [] } } })], relics, new Map());
assert.equal(noMatch.recommendations.get('no-match').unavailable, 'preferences');

/* No build, no floor and no captured species: nothing can say what the copy
   needs. A captured species would answer from its statistics instead. */
const unruned = relicMonsterModel({ ...account.unit_list[0], unit_master_id: undefined, runes: [] });
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

/* The reader holds a relic to the vocabulary, and the importer holds the roster
   to the game's two engraving rules, so the plan and the advice can never judge
   one relic on two sets of numbers. Each break fails loudly. */
const sample = account.relics[0];
const broken = (change) => readRelic({ ...structuredClone(sample), ...change(structuredClone(sample)) });
assert.ok(readRelic(sample), 'the fixture relic satisfies the vocabulary');
assert.equal(broken((relic) => ({ pri_effect: [relic.pri_effect[0], relic.pri_effect[1] + 1] })), null,
  'a main percent other than 3 + level is refused');
assert.equal(broken((relic) => ({ sec_effect: [relic.sec_effect[0], relic.sec_effect[1] + 1, relic.sec_effect[2]] })), null,
  'a threshold other than the tier the level sits in is refused');
assert.equal(broken((relic) => ({ sec_effect: [relic.sec_effect[0], relic.sec_effect[1], relic.sec_effect[2] + 1] })), null,
  'a unique percent other than the family’s fixed one is refused');
assert.equal(relicEngravingProblem(account.unit_list), undefined, 'the fixture roster engraves legally');
assert.match(relicEngravingProblem([{ unit_level: 40, relics: [account.relics[0], account.relics[1]] }]) ?? '',
  /more than one relic/, 'two relics on one monster are refused');
assert.match(relicEngravingProblem([{ unit_level: 39, relics: [account.relics[0]] }]) ?? '',
  /below Lv\. 40/, 'a relic below Lv. 40 is refused');
assert.match(relicEngravingProblem([{ relics: [account.relics[0]] }]) ?? '',
  /below Lv\. 40/, 'a relic on a monster of unknown level is refused');
/* Capacity counts every eligible monster, a Material one included: the
   Material exclusion picks the plan's rows, never the game's count. */
assert.equal(relicEngravingCounts([{ unit_level: 40, unit_master_id: 14314, relics: [{ rid: 9001 }] }]).get('9001'), 1);
console.log('Relic engraving uses per-copy value; capacity, preference bands, ties, small upgrades and roster-independent recommendations pass, and the import refuses relics and rosters the vocabulary cannot describe.');
