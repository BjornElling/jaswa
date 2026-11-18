import assert from 'node:assert/strict';
import {
  ordinarySample, ordinarySamplePaths,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { calculateRuneCleanupStatistics, runeStatisticsRunesPerSlot } from '../app/domain/runes/cleanup/rune-cleanup-statistics.ts';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { countJobs } from '../app/domain/runes/rune-power-up-outcomes.ts';

const levels = [0, 3, 6, 9, 12];
const paths = ordinarySamplePaths(1, 6, 5, 'drop');
assert.equal(paths.length, 5);
assert.equal(new Set(paths.map(({ id }) => id)).size, paths.length);

for (let index = 0; index < paths.length; index += 1) {
  const path = paths[index];
  assert.deepEqual(path.checkpoints.map(({ level }) => level), levels);
  assert.equal(new Set(path.checkpoints.map(({ rune }) => rune.id)).size, levels.length);
  for (const { level, rune } of path.checkpoints) {
    const direct = ordinarySample(1, 6, 5, level, 'drop')[index];
    assert.deepEqual(rune, direct, `the +${level} snapshot remains the ordinary sample's body`);
  }

  const [birth, ...later] = path.checkpoints.map(({ rune }) => rune);
  for (const rune of later) {
    assert.equal(rune.mainStatId, birth.mainStatId);
    assert.equal(rune.rarity, birth.rarity);
    assert.equal(rune.setName, birth.setName);
    assert.equal(rune.prefixStatId, birth.prefixStatId);
    assert.equal(rune.prefixValue, birth.prefixValue);
    for (const previous of birth.subProperties) {
      const carried = rune.subProperties.find(({ statId }) => statId === previous.statId);
      assert.ok(carried, `stat ${previous.statId} remains on the same body`);
      assert.ok(carried.value >= previous.value, `stat ${previous.statId} only advances along the path`);
    }
  }
}

const firstRole = defaultRuneRoles()[0];
const base = new Map([[firstRole.type, { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }]]);
const settings = { ...defaultRunePotentialSettings, runeQuality: 1, powerUpPolicy: 1 };
const statistics = await calculateRuneCleanupStatistics([firstRole], settings, base, async (jobs) => countJobs(jobs));
const [zero, nine, twelve] = statistics.checkpoints;
assert.equal(statistics.sampleSize, runeStatisticsRunesPerSlot * 6);
assert.deepEqual(statistics.checkpoints.map((rows) => rows.length), Array(3).fill(statistics.sampleSize));
for (const [index, rows] of statistics.checkpoints.entries()) {
  const expected = Array.from({ length: 6 }, (_, slot) =>
    ordinarySample(slot + 1, 6, runeStatisticsRunesPerSlot, [0, 9, 12][index], 'drop')).flat();
  assert.deepEqual(rows.map(({ rune }) => rune), expected);
}
const rolled = zero.filter(({ advice }) => advice.verdict === 'power-up').length;
const kept = zero.filter(({ advice }, index) => advice.verdict === 'power-up'
  && nine[index].advice.verdict === 'power-up'
  && ['keep', 'refine', 'reapp'].includes(twelve[index].advice.verdict)).length;
assert.ok(rolled > 0 && kept > 0);
assert.equal(statistics.percentToRoll, rolled / zero.length * 100);
assert.equal(statistics.percentToKeep, kept / zero.length * 100);
console.log('PASS: each Statistics checkpoint reads one copy of the same birth, and only survivors count.');
