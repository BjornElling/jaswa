import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

function artifact(id) {
  return {
    rid: id,
    type: 1,
    attribute: 1,
    natural_rank: 3,
    level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[300, 6, 1, 0, 0], [301, 6, 1, 0, 0], [302, 3, 0, 0, 0], [303, 3, 0, 0, 0]],
    date_add: '2026-08-30T00:00:00Z',
  };
}

try {
  const { artifactOptimizationMonsters } = await server.ssrLoadModule('/app/lib/artifact-optimization-monsters.ts');
  const { buildArtifactScoreRequests } = await server.ssrLoadModule('/app/lib/compute/artifact-score-input.ts');
  const { defaultArtifactSettings } = await server.ssrLoadModule('/app/lib/file-imports.ts');
  const { recordedArtifactPreferenceMonsterIds } = await server.ssrLoadModule('/app/lib/artifact-preferences.ts');

  const masterId = recordedArtifactPreferenceMonsterIds[0];
  const monsters = [
    { unit_id: 1, unit_master_id: masterId, unit_level: 39 },
    { unit_id: 2, unit_master_id: masterId, unit_level: 40 },
    { unit_id: 3, unit_master_id: masterId, unit_level: 41 },
  ];
  const settings = { ...defaultArtifactSettings, onlyFactorInOwnedMonsters: false, onlyLevel40Monsters: true };

  assert.deepEqual(artifactOptimizationMonsters(monsters, settings).map((monster) => monster.unit_id), [2, 3],
    'Lv. 40 scope must exclude lower-level monsters and retain the level-cap floor');

  const requests = buildArtifactScoreRequests({ artifacts: [artifact(1), artifact(2)] }, monsters, settings);
  assert.deepEqual([...new Set(requests.flatMap((request) => request.monsters.map((monster) => monster.id)))], [masterId],
    'an all-game scope must still use only the eligible owned roster when Lv. 40 is on');
  assert.deepEqual(requests.flatMap((request) => request.artifacts.map((entry) => entry.id)), ['1', '2'],
    'the level restriction must never remove artifacts from the calculation pool');

  console.log('Artifact Lv. 40 scope excludes lower-level destinations without excluding their artifacts.');
} finally {
  await server.close();
}
