import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allocateRelicEngravings, assertRelicAllocation, rankRelicsForMonster, relicEngravingLimit,
} from '../app/domain/relics/relic-monster-fit.ts';
import { relicMonsterModel, relicMonsterValue } from '../app/domain/relics/relic-monster-value.ts';
import { readRelic, relicEngravingCounts, relicEngravingProblem } from '../app/domain/relics/relics.ts';

const account = JSON.parse(readFileSync(new URL('../tests/fixtures/relic-account.json', import.meta.url), 'utf8'));
const relics = account.relics.map(readRelic);
assert.ok(relics.every(Boolean));
const hp = relicMonsterModel(account.unit_list[0]);
const atk = relicMonsterModel(account.unit_list[2]);
const subject = (id, model = hp, engravedRelicIds = [], preferences) => ({ monsterId: String(id), model, engravedRelicIds, preferences });
/* One plan for the roster: 301 monsters that all want 9002 cannot all have it,
   and following every recommendation must never ask for a 151st engraving. */
const subjects = Array.from({ length: 2 * relicEngravingLimit + 1 }, (_, at) => subject(at));
const plan = allocateRelicEngravings(subjects, relics, new Map());
assertRelicAllocation(plan, subjects);
assert.equal(plan.recommendations.size, subjects.length);
const onBest = [...plan.recommendations.values()].filter((recommendation) => recommendation.chosen?.relic.id === '9002');
assert.equal(onBest.length, relicEngravingLimit, 'the best relic is filled to its limit and no further');
assert.ok(onBest.every((recommendation) => recommendation.limit === 'none'));
for (const recommendation of plan.recommendations.values()) {
  assert.equal(recommendation.unavailable, null, 'six relics hold 900 places for 301 monsters');
  assert.equal(recommendation.ideal.relic.id, '9002');
  assert.equal(recommendation.limit, recommendation.chosen.relic.id === '9002' ? 'none' : 'capacity');
}
for (const count of plan.planned.values()) assert.ok(count <= relicEngravingLimit);
assert.equal(plan.engravings.get('9002'), 0, 'today’s counts stay as imported');
assert.equal(plan.planned.get('9002'), relicEngravingLimit);

/* The plan is the best one there is: on small limits it matches an exhaustive
   search over every assignment, so no monster is handed a place another would
   use better. */
const scoreOf = (model, relic) => relicMonsterValue(relic, model).score;
function bestTotal(models, pool, limit) {
  let best = -Infinity;
  const counts = new Map();
  const walk = (at, total) => {
    if (at === models.length) { best = Math.max(best, total); return; }
    walk(at + 1, total);
    for (const relic of pool) {
      if ((counts.get(relic.id) ?? 0) >= limit) continue;
      counts.set(relic.id, (counts.get(relic.id) ?? 0) + 1);
      walk(at + 1, total + scoreOf(models[at], relic));
      counts.set(relic.id, counts.get(relic.id) - 1);
    }
  };
  walk(0, 0);
  return best;
}
const roster = [hp, atk, relicMonsterModel(account.unit_list[1]), relicMonsterModel(account.unit_list[3]),
  relicMonsterModel(account.unit_list[4]), atk, hp].filter((model) => model.status === 'ready');
assert.ok(roster.length >= 5, 'the fixture scores enough monsters to contest places');
for (const [limit, pool] of [[1, relics.slice(0, 3)], [2, relics.slice(1, 4)], [1, relics]]) {
  const contest = roster.map((model, at) => subject(`m${at}`, model));
  const shared = allocateRelicEngravings(contest, pool, new Map(), limit);
  assertRelicAllocation(shared, contest, limit);
  const total = [...shared.recommendations.values()]
    .reduce((sum, recommendation) => sum + (recommendation.chosen?.value.score ?? 0), 0);
  assert.ok(Math.abs(total - bestTotal(roster, pool, limit)) < 1e-9,
    `the plan's total ${total} must be the best total at limit ${limit}`);
}

/* A stated preferred answer claims a place ahead of any score: the ATK copy
   gains more from 9003 than the HP copy does, but the HP copy prefers an ATK
   main and 9003 is the only ATK relic, so the single place is the HP copy's. */
const atkOnly = relics.filter((relic) => relic.mainProperty === 'ATK');
assert.equal(atkOnly.length, 1);
assert.ok(scoreOf(atk, atkOnly[0]) > scoreOf(hp, atkOnly[0]), 'the unstated copy would use the place better');
const claim = [subject('unstated', atk), subject('stated', hp, [], { mainStat: { preferred: ['ATK'], acceptable: [] } })];
const claimed = allocateRelicEngravings(claim, relics, new Map(), 1);
assert.equal(claimed.recommendations.get('stated').chosen.relic.id, atkOnly[0].id);
assert.notEqual(claimed.recommendations.get('unstated').chosen?.relic.id, atkOnly[0].id);
/* More stated claims than places: the places go by score among the claimants. */
const crowd = [subject('weak', hp, [], { mainStat: { preferred: ['ATK'], acceptable: [] } }),
  subject('strong', atk, [], { mainStat: { preferred: ['ATK'], acceptable: [] } })];
const crowded = allocateRelicEngravings(crowd, relics, new Map(), 1);
assert.equal(crowded.recommendations.get('strong').chosen.relic.id, atkOnly[0].id);
assert.equal(crowded.recommendations.get('weak').chosen, null, 'a stated copy takes nothing it rejects');
assert.equal(crowded.recommendations.get('weak').unavailable, 'capacity');

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

/* A place is the plan's to share, the one a monster holds included: a copy that
   uses its relic worse than a newcomer would is moved on. */
const holder = subject('holder', atk, ['9002']);
const newcomer = subject('newcomer', hp);
assert.ok(scoreOf(hp, relics[1]) - scoreOf(hp, relics[0]) > scoreOf(atk, relics[1]) - scoreOf(atk, relics[0]),
  'the HP copy loses more by missing 9002 than the ATK copy does');
const shared = allocateRelicEngravings([holder, newcomer], relics.slice(0, 2), full);
assert.equal(shared.recommendations.get('newcomer').chosen.relic.id, '9002');
assert.equal(shared.recommendations.get('holder').chosen.relic.id, '9001');

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
console.log('Relic engraving shares each relic’s places as one optimal plan; stated preferred claims, capacity, preference bands, ties and small upgrades pass, and the import refuses relics and rosters the vocabulary cannot describe.');
