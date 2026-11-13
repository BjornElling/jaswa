import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

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
  const { artifactOptimizationMonsters } = await server.ssrLoadModule('/app/domain/artifacts/artifact-optimization-monsters.ts');
  const { canEngraveArtifacts, canEngraveRelics } = await server.ssrLoadModule('/app/domain/monsters/monster-engrave-eligibility.ts');
  const { relicEngravingCounts } = await server.ssrLoadModule('/app/domain/relics/relics.ts');
  const { buildArtifactScoreRequests } = await server.ssrLoadModule('/app/domain/artifacts/score/artifact-score-input.ts');
  const { defaultArtifactSettings } = await server.ssrLoadModule('/app/domain/profiles/preference-defaults.ts');
  const { recordedArtifactPreferenceMonsterIds } = await server.ssrLoadModule('/app/domain/profiles/artifact-preferences.ts');

  const masterId = recordedArtifactPreferenceMonsterIds[0];
  const monsters = [
    { unit_id: 1, unit_master_id: masterId, unit_level: 39, class: 6 },
    { unit_id: 2, unit_master_id: masterId, unit_level: 40, class: 6 },
    { unit_id: 3, unit_master_id: masterId, unit_level: 41, class: 6 },
    { unit_id: 4, unit_master_id: masterId, unit_level: 40, class: 5 },
  ];
  const settings = { ...defaultArtifactSettings, onlyFactorInOwnedMonsters: false, onlyLevel40Monsters: true };

  assert.deepEqual(artifactOptimizationMonsters(monsters, settings).map((monster) => monster.unit_id), [2, 3],
    'artifact destinations must be six-star and meet the optional Lv. 40 scope');

  const requests = buildArtifactScoreRequests({ artifacts: [artifact(1), artifact(2)] }, monsters, settings);
  assert.deepEqual([...new Set(requests.flatMap((request) => request.monsters.map((monster) => monster.id)))], [masterId],
    'an all-game scope must still use only the eligible owned roster when Lv. 40 is on');
  assert.deepEqual(requests.flatMap((request) => request.artifacts.map((entry) => entry.id)), ['1', '2'],
    'the level restriction must never remove artifacts from the calculation pool');

  assert.equal(canEngraveArtifacts(monsters[1]), true, 'a six-star monster can engrave artifacts');
  assert.equal(canEngraveArtifacts(monsters[3]), false, 'a five-star monster cannot engrave artifacts');
  assert.equal(canEngraveRelics(monsters[1]), true, 'a level-40 monster can receive relic engravings');
  assert.equal(canEngraveRelics(monsters[0]), false, 'a level-39 monster cannot receive relic engravings');
  assert.deepEqual([...relicEngravingCounts([
    { ...monsters[1], relics: [{ rid: 10 }] },
    { ...monsters[0], relics: [{ rid: 10 }] },
  ])], [['10', 1]], 'only legal level-40 relic engravings consume account capacity');

  console.log('Artifact and relic destinations follow the game’s engraving unlocks.');
} finally {
  await server.close();
}
