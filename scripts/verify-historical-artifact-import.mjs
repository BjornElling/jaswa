import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

function artifact(id, dateAdded, powerUps, level = 15) {
  return {
    rid: id,
    type: 1,
    attribute: 1,
    natural_rank: 3,
    level,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [
      [300, 6, powerUps[0], 0, 0],
      [301, 6, powerUps[1], 0, 0],
      [302, 3, powerUps[2], 0, 0],
      [303, 3, powerUps[3], 0, 0],
    ],
    date_add: dateAdded,
  };
}

try {
  const { readArtifact, readArtifacts } = await server.ssrLoadModule('/app/lib/artifacts.ts');
  const { buildArtifactScoreRequestsForMonsterIds } = await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { recordedArtifactPreferenceMonsterIds } = await server.ssrLoadModule('/app/lib/artifact-preferences.ts');

  const currentRecord = artifact(1, '2026-08-30T00:00:00Z', [1, 1, 0, 0]);
  const historicalRecord = artifact(2, '2022-09-29T00:00:00Z', [0, 0, 0, 0], 12);
  const current = readArtifact(currentRecord);
  assert.ok(current);

  const historical = readArtifact(historicalRecord);
  assert.ok(historical);
  assert.equal(historical.unrefined, true);
  assert.deepEqual(historical.subProperties.map((property) => property.maximumHundredths), [2500, 2500, 2500, 2500]);

  assert.equal(readArtifact(artifact(3, '2026-08-30T00:00:00Z', [0, 0, 0, 0])), null);
  assert.equal(readArtifacts({ artifacts: [currentRecord, historicalRecord] }).length, 2);

  const requests = buildArtifactScoreRequestsForMonsterIds(
    { artifacts: [currentRecord, historicalRecord] },
    [recordedArtifactPreferenceMonsterIds[0]],
    { acceptableWorth: 50, onlyFactorInOwnedMonsters: true, onlyLevel40Monsters: false, conversionStoneMode: 'none', conversionStoneValue: 1 },
  );
  assert.deepEqual(requests.flatMap((request) => request.artifacts.map((entry) => entry.id)), ['1', '2']);
  console.log('Verified historical artifacts import, scoring and unrefined state.');
} finally {
  await server.close();
}
