import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true },
});

try {
  const { highestAwakeningMasterId } = await server.ssrLoadModule('/app/domain/monsters/monster-catalog.ts');
  const { artifactPreferenceStatus, defaultPropertyPreferences } = await server.ssrLoadModule('/app/domain/profiles/artifact-preferences.ts');

  for (const [held, highest] of [['11712', '11732'], ['30003', '30013']]) {
    assert.equal(highestAwakeningMasterId(held), highest,
      `${held} must resolve to its catalogue's highest awakening`);
    for (const category of ['attribute', 'type']) {
      assert.equal(artifactPreferenceStatus(held, category), 'scorable',
        `${held}'s ${category} preferences must come from ${highest}`);
      assert.deepEqual(defaultPropertyPreferences(held, category), defaultPropertyPreferences(highest, category),
        `${held} must read exactly ${highest}'s ${category} preferences`);
    }
  }

  console.log('Artifact preferences always read the highest awakening in each monster lineage.');
} finally {
  await server.close();
}
