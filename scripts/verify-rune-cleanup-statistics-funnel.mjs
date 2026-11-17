import assert from 'node:assert/strict';
import {
  ordinarySample, ordinarySamplePaths,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import {
  calculateRuneCleanupSampledFunnel, runeCleanupStatisticsSamplePaths,
} from '../app/domain/runes/cleanup/rune-percentile-statistics.ts';

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

let calls = 0;
const funnel = calculateRuneCleanupSampledFunnel(paths, (_rune, pathId, level) => {
  calls += 1;
  const index = Number(pathId.split(':').at(-1));
  if (index === 4 && level === 6) return { calculated: null, protected: null };
  if (level === 12) {
    return {
      calculated: index === 0 || index === 2 || index === 4,
      protected: index === 0 || index === 2 || index === 3 || index === 4,
      terminalReadings: [
        { readingId: 'first', roleId: 'role-a', roleName: 'Role A', buildKey: 'open', buildLabel: 'Open build', qualifies: index === 0 || index === 2 },
        { readingId: 'second', roleId: 'role-b', roleName: 'Role B', buildKey: 'open', buildLabel: 'Open build', qualifies: index === 0 || index === 4 },
        { readingId: 'unsettled', roleId: 'role-c', roleName: 'Role C', buildKey: 'open', buildLabel: 'Open build', qualifies: index === 0 ? null : false },
      ],
    };
  }
  return {
    calculated: !(index === 3 && level === 3) && !(index === 2 && level === 6),
    protected: index !== 2 || !(level === 6),
  };
});

assert.equal(calls, paths.length * levels.length, 'the callback sees each sequential checkpoint once');
assert.equal(funnel.method, 'sequential-sampled');
assert.equal(funnel.samplingUncertainty, 'descriptive-bernoulli-standard-error-not-certified');
assert.equal(funnel.sampleSize, paths.length, 'the denominator counts births once');
assert.deepEqual(funnel.investmentByCheckpoint.map(({ level }) => level), [0, 3, 6, 9]);
assert.equal(funnel.terminalUnion.successes, 3);
assert.equal(funnel.terminalUnion.unresolved, 0);
assert.equal(funnel.terminalUnion.proportion, 3 / 5);
assert.equal(funnel.terminalUnion.standardError, Math.sqrt((3 / 5) * (2 / 5) / 5));
assert.equal(funnel.investmentByCheckpoint[2].calculated.successes, 3);
assert.equal(funnel.investmentByCheckpoint[2].calculated.unresolved, 1);
assert.equal(funnel.investmentByCheckpoint[2].calculated.proportion, null);
assert.equal(funnel.qualifyingFunnel.successes, 1);
assert.equal(funnel.qualifyingFunnel.unresolved, 1);
assert.equal(funnel.qualifyingFunnel.proportion, null, 'an incomplete body is not counted as a failure');
assert.equal(funnel.protectedSurvivors.successes, 2);
assert.equal(funnel.extraProtectedSurvivors.successes, 1);
assert.equal(funnel.extraProtectedSurvivors.unresolved, 1);
assert.deepEqual(funnel.perReadingSupply.map(({ supply }) => [supply.successes, supply.unresolved]), [[2, 0], [2, 0], [0, 1]]);
assert.deepEqual(funnel.roleBuildCoverage.map(({ terminalCoverage, funnelCoverage }) =>
  [terminalCoverage.successes, terminalCoverage.unresolved, funnelCoverage.successes, funnelCoverage.unresolved]),
[[2, 0, 1, 0], [2, 0, 1, 1], [0, 1, 0, 1]],
'Overlapping reading events count each body once in the union and preserve each reading’s own evidence.');

const failedDespiteUncertainty = calculateRuneCleanupSampledFunnel(paths.slice(0, 1), (_rune, _pathId, level) => {
  if (level === 3) return { calculated: false, protected: false };
  return { calculated: null, protected: null };
});
assert.equal(failedDespiteUncertainty.qualifyingFunnel.proportion, 0, 'a certified failure at +3 settles the joint gate');
assert.equal(failedDespiteUncertainty.extraProtectedSurvivors.proportion, 0);

assert.throws(() => calculateRuneCleanupSampledFunnel(paths.slice(0, 1), (_rune, _pathId, level) => level === 12
  ? { calculated: true, protected: false }
  : { calculated: false, protected: false }),
  /protection result cannot undo a calculated pass/);

const fixedPopulation = runeCleanupStatisticsSamplePaths();
assert.equal(fixedPopulation.length, 300);
assert.equal(new Set(fixedPopulation.map(({ id }) => id)).size, fixedPopulation.length);
assert.ok(fixedPopulation.every(({ checkpoints }) => checkpoints.length === 5));

const empty = calculateRuneCleanupSampledFunnel([], () => ({ calculated: null, protected: null }));
assert.equal(empty.sampleSize, 0);
assert.equal(empty.terminalUnion.proportion, null);
assert.equal(empty.qualifyingFunnel.standardError, null);

console.log('PASS: Statistics uses one sequential latent body, counts each birth once, and preserves incomplete solver mass.');
