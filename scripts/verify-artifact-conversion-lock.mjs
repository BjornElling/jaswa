import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
});

try {
  const { readArtifact } = await server.ssrLoadModule('/app/lib/artifacts.ts');

  /* The game panel shows the gold Convert mark on sub 4. Its live export is
     [409, 8, 0, 1, 0], proving tuple position 3 is the current lock. */
  const currentArtifact = readArtifact({
    rid: 1221299508, type: 2, attribute: 0, unit_style: 1, natural_rank: 3,
    rank: 3, level: 15, pri_effect: [101, 100, 15, 0, 0],
    sec_effects: [
      [225, 4, 1, 0, 0], [408, 11, 1, 0, 0],
      [411, 6, 0, 0, 0], [409, 8, 0, 1, 0],
    ],
    occupied_id: 13073636926, locked: 0, source: 50001,
    extra: [], date_add: '2026-09-06 04:03:38', date_mod: '2026-09-06 04:03:38',
  });
  assert.ok(currentArtifact, 'the current converted artifact must be readable');
  assert.equal(currentArtifact.convertedPropertyIndex, 3,
    'the fourth tuple field locks conversion to the displayed fourth sub-property');

  /* Older captures only carry the position-4 marker. They keep their known
     lock until the game replaces that encoding entirely. */
  const legacyArtifact = readArtifact({
    rid: 284184132, type: 1, attribute: 1, unit_style: 0, natural_rank: 5,
    rank: 5, level: 12, pri_effect: [101, 58, 12, 0, 0],
    sec_effects: [
      [218, 0.2, 0, 0, 0], [219, 14, 3, 0, 0],
      [221, 31, 0, 0, 1], [223, 24, 1, 0, 0],
    ],
    occupied_id: 20772926292, locked: 0, source: 50001,
    extra: [], date_add: '2022-06-27 22:13:04', date_mod: '2022-07-02 19:21:40',
  });
  assert.ok(legacyArtifact, 'the legacy converted artifact must be readable');
  assert.equal(legacyArtifact.convertedPropertyIndex, 2,
    'the fifth tuple field remains a fallback for legacy export records');
  console.log('Converted artifact locks follow the current tuple marker with a legacy fallback.');
} finally {
  await server.close();
}
